"""Explicit, persistent folder grants for MyAgent.

The agent never receives a whole-drive permission. A user must choose each
folder in the desktop folder picker. Grants are independent for reading and
writing; writes/deletes are still confirmation-gated by the Brain.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Literal

from .safety import SafetyError

log = logging.getLogger("myagent.resources")
Permission = Literal["read", "write"]

_SECRET_DIRS = {
    ".ssh", ".gnupg", ".aws", ".azure", ".kube",
    "credentials", "secrets", "passwords",
}
_SECRET_PATHS = {(".config", "gcloud")}


def sys_platform_is_macos() -> bool:
    import sys
    return sys.platform == "darwin"


def _protected_scope(root: Path) -> bool:
    # Do not let a broad grant expose a user profile or operating-system tree.
    if root == Path.home().expanduser().resolve():
        return True
    protected: list[Path] = []
    if os.name == "nt":
        for key in ("WINDIR", "SYSTEMROOT", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA", "APPDATA", "LOCALAPPDATA"):
            value = os.environ.get(key)
            if value:
                protected_path = Path(value).expanduser().resolve()
                # pytest and normal temporary work often live below Local\\Temp.
                if key == "LOCALAPPDATA" and any(part.casefold() == "temp" for part in root.parts):
                    continue
                protected.append(protected_path)
    else:
        protected.extend(Path(p) for p in ("/etc", "/usr", "/bin", "/sbin", "/proc", "/sys", "/dev", "/root"))
        if sys_platform_is_macos():
            protected.extend(Path(p) for p in ("/System", "/Library", "/Applications", "/private"))
    return any(root == item or item in root.parents for item in protected)

_SECRET_FILES = {
    ".env", ".env.local", ".netrc", "id_rsa", "id_ed25519",
    "credentials.json", "token.json", "secrets.json",
}


def _looks_sensitive(path: Path) -> bool:
    parts = [part.casefold() for part in path.parts]
    if any(part in _SECRET_DIRS for part in parts):
        return True
    if any(tuple(parts[i:i + 2]) in _SECRET_PATHS for i in range(max(0, len(parts) - 1))):
        return True
    name = path.name.casefold()
    return (
        name in _SECRET_FILES
        or name.endswith((".pem", ".key", ".p12", ".pfx"))
        or name.startswith(".env.")
    )


class ResourcePermissions:
    """Manages user-selected directory scopes; paths are resolved on every use."""

    def __init__(self, path: Path, max_grants: int = 10) -> None:
        self.path = path
        self.max_grants = max_grants
        self._grants: dict[str, dict[str, bool]] = {}
        self._load()

    def _load(self) -> None:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            for item in raw if isinstance(raw, list) else []:
                if not isinstance(item, dict):
                    continue
                root = Path(str(item.get("path", ""))).expanduser().resolve(strict=True)
                if not root.is_dir() or root.parent == root:
                    continue
                read, write = item.get("read"), item.get("write")
                if type(read) is bool and type(write) is bool and (read or write):
                    self._grants[str(root)] = {"read": read, "write": write}
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            self._grants = {}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        payload = [
            {"path": path, **permissions}
            for path, permissions in sorted(self._grants.items())
        ]
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def list(self) -> list[dict]:
        return [
            {"path": path, **permissions}
            for path, permissions in sorted(self._grants.items())
        ]

    def grant(self, raw_path: str, *, read: bool = True, write: bool = False) -> dict:
        if type(read) is not bool or type(write) is not bool or not (read or write):
            raise SafetyError("Choose at least one permission: read or write.")
        if not isinstance(raw_path, str) or not raw_path.strip():
            raise SafetyError("Choose a folder first.")
        candidate = Path(raw_path).expanduser()
        if not candidate.is_absolute():
            raise SafetyError("The folder picker must provide an absolute path.")
        try:
            root = candidate.resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise SafetyError("That folder does not exist or cannot be opened.") from exc
        if not root.is_dir():
            raise SafetyError("Only folders can be granted.")
        if _protected_scope(root):
            raise SafetyError("System folders, application-data folders, and the entire user profile cannot be granted. Choose a specific working folder.")
        if root.parent == root:
            raise SafetyError("A whole drive or filesystem root cannot be granted. Choose a folder inside it.")
        if _looks_sensitive(root):
            raise SafetyError("Credential and secret folders cannot be granted.")
        key = str(root)
        if key not in self._grants and len(self._grants) >= self.max_grants:
            raise SafetyError(f"MyAgent can have at most {self.max_grants} folder grants.")
        self._grants[key] = {"read": read, "write": write}
        self._save()
        return {"path": key, "read": read, "write": write}

    def update(self, raw_path: str, *, read: bool | None = None, write: bool | None = None) -> dict:
        key = self._existing_grant(raw_path)
        current = self._grants[key]
        next_read = current["read"] if read is None else read
        next_write = current["write"] if write is None else write
        if type(next_read) is not bool or type(next_write) is not bool:
            raise SafetyError("Permissions must be true or false.")
        if not (next_read or next_write):
            del self._grants[key]
            self._save()
            return {"path": key, "read": False, "write": False}
        self._grants[key] = {"read": next_read, "write": next_write}
        self._save()
        return {"path": key, **self._grants[key]}

    def revoke(self, raw_path: str) -> bool:
        key = self._existing_grant(raw_path)
        del self._grants[key]
        self._save()
        return True

    def _existing_grant(self, raw_path: str) -> str:
        try:
            resolved = str(Path(raw_path).expanduser().resolve(strict=False))
        except (OSError, RuntimeError) as exc:
            raise SafetyError("That folder no longer exists.") from exc
        if resolved not in self._grants:
            raise SafetyError("That folder has not been granted to MyAgent.")
        return resolved

    def check(self, raw_path: str, permission: Permission, *, must_exist: bool = False) -> Path:
        if permission not in ("read", "write"):
            raise SafetyError("Unknown resource permission.")
        candidate = Path(str(raw_path)).expanduser()
        if not candidate.is_absolute():
            raise SafetyError("Use the full path inside one of your approved folders.")
        try:
            resolved = candidate.resolve(strict=must_exist)
        except (OSError, RuntimeError) as exc:
            raise SafetyError("That path does not exist or cannot be resolved.") from exc
        for root_string, permissions in self._grants.items():
            root = Path(root_string)
            if (resolved == root or root in resolved.parents) and permissions[permission]:
                if _looks_sensitive(resolved):
                    raise SafetyError("MyAgent cannot read or change credential and secret files.")
                return resolved
        raise SafetyError(
            f"MyAgent has no {permission} permission for '{resolved}'. "
            "Grant its parent folder in Talk → Local folder access first."
        )

    def list_folder(self, raw_path: str) -> str:
        folder = self.check(raw_path, "read", must_exist=True)
        if not folder.is_dir():
            raise SafetyError("That path is not a folder.")
        rows = []
        for item in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
            if item.is_symlink() or _looks_sensitive(item):
                continue
            try:
                rows.append({
                    "name": item.name,
                    "type": "folder" if item.is_dir() else "file",
                    "size": None if item.is_dir() else item.stat().st_size,
                })
            except OSError:
                continue
            if len(rows) >= 100:
                break
        return json.dumps({"folder": str(folder), "entries": rows, "truncated": len(rows) == 100}, ensure_ascii=False)

    def read_file(self, raw_path: str, max_bytes: int = 200_000) -> str:
        file = self.check(raw_path, "read", must_exist=True)
        if not file.is_file():
            raise SafetyError("That path is not a regular file.")
        if file.stat().st_size > max_bytes:
            raise SafetyError(f"That file is larger than {max_bytes} bytes. Read a smaller file.")
        try:
            return file.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise SafetyError("This file is not UTF-8 text; binary files are not read.") from exc

    def write_file(self, raw_path: str, content: str, *, replace: bool = False, max_bytes: int = 1_000_000) -> str:
        file = self.check(raw_path, "write")
        parent = self.check(str(file.parent), "write", must_exist=True)
        if not parent.is_dir():
            raise SafetyError("The parent path is not a folder.")
        if file.exists() and not replace:
            raise SafetyError("That file already exists. Ask before replacing it.")
        if file.exists() and (file.is_symlink() or not file.is_file()):
            raise SafetyError("Only regular files can be replaced.")
        if not isinstance(content, str) or len(content.encode("utf-8")) > max_bytes:
            raise SafetyError(f"Text content must be at most {max_bytes} bytes.")
        file.write_text(content, encoding="utf-8", newline="")
        return f"Wrote {len(content.encode('utf-8'))} bytes to {file}"

    def delete_file(self, raw_path: str) -> str:
        file = self.check(raw_path, "write", must_exist=True)
        if file.is_symlink() or not file.is_file():
            raise SafetyError("Only regular files can be deleted. Folders and symbolic links are not allowed.")
        file.unlink()
        return f"Deleted file {file}"
