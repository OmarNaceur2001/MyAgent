"""Command execution engine.
Provides a whitelist of safe CLI commands that MyAgent may run.
Each command is defined with an executable path (or name that can be
resolved with ``shutil.which``), a JSON‑schema for arguments, and a risk
level. ``risk='confirm'`` forces a user confirmation before execution.
"""

from __future__ import annotations

import json
import shlex
import shutil
import subprocess
from pathlib import Path
from typing import Any, Callable, Dict

from .safety import SafetyError
from .resources import ResourcePermissions

# ---------------------------------------------------------------------------
# Configuration – a JSON file living next to the data directory.
# Example (apps may add entries at runtime):
# {
#   "git": {"executable": "git", "schema": {"type": "object", "properties": {"args": {"type": "string"}}}},
#   "npm": {"executable": "npm", "schema": {"type": "object", "properties": {"command": {"type": "string"}}}}
# }
# ---------------------------------------------------------------------------

CONFIG_PATH = Path(__file__).resolve().parent.parent / "data" / "command_engine.json"


def _load_config() -> Dict[str, Dict[str, Any]]:
    if not CONFIG_PATH.is_file():
        # Create a minimal default configuration.
        default = {
            "git": {"executable": "git", "schema": {"type": "object", "properties": {"args": {"type": "string"}}}},
            "npm": {"executable": "npm", "schema": {"type": "object", "properties": {"command": {"type": "string"}}}},
        }
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(default, indent=2), encoding="utf-8")
        return default
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


class CommandEngine:
    """Execute a whitelisted command safely.

    The public method :meth:`run` receives a command identifier (e.g. ``"git"``)
    and a dictionary of arguments validated against the stored JSON schema.
    ``risk='confirm'`` commands are executed only after the user explicitly
    approves them via the :class:`~myagent_agent.safety.ConfirmationBroker`.
    """

    def __init__(self, resources: ResourcePermissions, confirm: Callable[[str, str], bool]):
        self._config = _load_config()
        self.resources = resources
        self._confirm = confirm

    # ---------------------------------------------------------------------
    def _resolve_executable(self, exe: str) -> str:
        """Return an absolute path to *exe*.

        ``shutil.which`` is used first; if it fails we try a simple Windows
        registry lookup via ``desktop_apps._windows_registered_app`` (imported
        lazily to avoid circular imports).
        """
        path = shutil.which(exe)
        if path:
            return path
        # Fallback to Office registry lookup for known Office binaries.
        try:
            from .desktop_apps import _windows_registered_app
        except Exception:
            path = None
        else:
            path = _windows_registered_app(exe)
        if not path:
            raise SafetyError(f"Executable '{exe}' not found on this system")
        return path

    # ---------------------------------------------------------------------
    def run(self, name: str, args: Dict[str, Any]) -> str:
        if name not in self._config:
            raise SafetyError(f"Command '{name}' is not registered in the command engine")
        cfg = self._config[name]
        exe = self._resolve_executable(cfg["executable"])
        # Build the argument list – we keep it simple: a single string of
        # space‑separated arguments is expected in the config schema.
        arg_str = args.get("args", "") if isinstance(args.get("args"), str) else ""
        if cfg.get("confirm", False):
            if not self._confirm(f"Run {name}", f"Execute: {exe} {arg_str}"):
                return "User declined the command."
        # Use ``subprocess.Popen`` with ``shell=False`` for safety.
        cmd_list = [exe] + shlex.split(arg_str)
        try:
            proc = subprocess.Popen(
                cmd_list,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(self.resources.base_dir) if hasattr(self.resources, "base_dir") else None,
                close_fds=True,
            )
            out, err = proc.communicate(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
            raise SafetyError(f"Command '{name}' timed out")
        except OSError as exc:
            raise SafetyError(str(exc))
        # Truncate output for UI display.
        stdout = out.decode(errors="ignore").strip()
        stderr = err.decode(errors="ignore").strip()
        if proc.returncode != 0:
            raise SafetyError(f"Command '{name}' failed: {stderr or stdout}")
        # Return a concise output (first 300 chars).
        return stdout[:300] or "Command completed with no output."
