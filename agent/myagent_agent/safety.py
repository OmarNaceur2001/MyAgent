"""Safety layer: what the agent may touch, and what needs the user's OK.

Three rules, enforced here and not left to the LLM:
  1. Paths must resolve inside the allowed folders (symlinks and ".." included).
  2. Risky tools ask the user first and do nothing unless the answer is yes.
  3. Every action is written to data/actions.log.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path


class SafetyError(Exception):
    """Raised when an action is not allowed. The message is shown to the user."""


class PathGuard:
    def __init__(self, roots: list[Path]):
        self.roots = [r.expanduser().resolve() for r in roots]

    def check(self, raw: str | Path, *, must_exist: bool = False) -> Path:
        p = Path(str(raw)).expanduser()
        if not p.is_absolute():
            raise SafetyError(f"I need a full path, not '{raw}'.")
        resolved = p.resolve()
        if not any(resolved == r or r in resolved.parents for r in self.roots):
            allowed = ", ".join(str(r) for r in self.roots)
            raise SafetyError(f"'{resolved}' is outside the folders I'm allowed to touch ({allowed}).")
        if must_exist and not resolved.exists():
            raise SafetyError(f"'{resolved}' doesn't exist.")
        return resolved


class ConfirmationBroker:
    """Holds pending yes/no questions until the UI answers (confirm.reply)."""

    def __init__(self) -> None:
        self._pending: dict[str, asyncio.Future[bool]] = {}

    def ask(self) -> tuple[str, asyncio.Future[bool]]:
        request_id = uuid.uuid4().hex[:8]
        fut: asyncio.Future[bool] = asyncio.get_running_loop().create_future()
        self._pending[request_id] = fut
        return request_id, fut

    def answer(self, request_id: str, approved: bool) -> bool:
        fut = self._pending.pop(request_id, None)
        if not fut or fut.done():
            return False
        fut.set_result(bool(approved))
        return True

    def cancel_all(self) -> None:
        for fut in self._pending.values():
            if not fut.done():
                fut.set_result(False)
        self._pending.clear()

    @property
    def has_pending(self) -> bool:
        return bool(self._pending)


class ActionLog:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path

    def write(self, tool: str, args: dict, ok: bool, result: str) -> None:
        secret_keys = {"content", "password", "token", "access_token", "refresh_token", "api_key", "secret"}

        def redact(value, key: str = ""):
            if key.casefold() in secret_keys:
                return "[redacted]"
            if isinstance(value, dict):
                return {k: redact(v, str(k)) for k, v in value.items()}
            if isinstance(value, list):
                return [redact(item) for item in value]
            return value

        safe_result = "[file content omitted from action log]" if tool == "read_file" else result[:500]
        if tool == "write_file":
            safe_result = "File operation completed; written text omitted from action log."
        entry = {
            "t": time.strftime("%Y-%m-%d %H:%M:%S"),
            "tool": tool,
            "args": redact(args),
            "ok": ok,
            "result": safe_result,
        }
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
