"""Launch a deliberately small allowlist of installed desktop applications.

This module accepts app IDs, never executable paths or arbitrary command lines.
It does not provide shell execution or file-manager path access.
"""
from __future__ import annotations

import os
import platform
import shutil
import subprocess
from pathlib import Path
from typing import Callable

from .safety import SafetyError

APPS = {
    "excel": {
        "label": "Excel",
        "windows": "EXCEL.EXE",
        "mac": "Microsoft Excel",
        "linux": ("libreoffice", "--calc"),
    },
    "word": {
        "label": "Word",
        "windows": "WINWORD.EXE",
        "mac": "Microsoft Word",
        "linux": ("libreoffice", "--writer"),
    },
    "powerpoint": {
        "label": "PowerPoint",
        "windows": "POWERPNT.EXE",
        "mac": "Microsoft PowerPoint",
        "linux": ("libreoffice", "--impress"),
    },
    "notepad": {
        "label": "Notepad",
        "windows": "notepad.exe",
        "mac": "TextEdit",
        "linux": ("gedit",),
    },
    "calculator": {
        "label": "Calculator",
        "windows": "calc.exe",
        "mac": "Calculator",
        "linux": ("gnome-calculator",),
    },
    "file_explorer": {
        "label": "File Explorer",
        "windows": "explorer.exe",
        "mac": "Finder",
        "linux": ("nautilus",),
    },
}


def _windows_registered_app(executable: str) -> str | None:
    """Resolve Office's registered executable path without invoking a shell."""
    try:
        import winreg
    except ImportError:
        return None

    key_name = rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{executable}"
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            with winreg.OpenKey(hive, key_name) as key:
                value, _ = winreg.QueryValueEx(key, None)
                candidate = Path(value.strip('"')).expanduser()
                if candidate.is_file():
                    return str(candidate)
        except OSError:
            continue

    # Common Click-to-Run and MSI Office install layouts.
    program_roots = [
        os.environ.get("ProgramW6432"),
        os.environ.get("ProgramFiles"),
        os.environ.get("ProgramFiles(x86)"),
    ]
    for raw_root in filter(None, program_roots):
        root = Path(raw_root) / "Microsoft Office"
        for candidate in (
            root / "root" / "Office16" / executable,
            root / "Office16" / executable,
        ):
            if candidate.is_file():
                return str(candidate)
    return None


def launch_allowed_app(
    app_id: str,
    *,
    system: str | None = None,
    startfile: Callable[[str], None] | None = None,
    popen: Callable[..., object] = subprocess.Popen,
    which: Callable[[str], str | None] = shutil.which,
    registered_path: Callable[[str], str | None] = _windows_registered_app,
) -> str:
    """Launch one allowlisted app, returning a truthful result or a useful error."""
    app = APPS.get(str(app_id))
    if app is None:
        raise SafetyError("That application isn't in MyAgent's approved app list.")

    os_name = system or platform.system()
    label = str(app["label"])

    if os_name == "Windows":
        executable = str(app["windows"])
        shell_open = startfile or getattr(os, "startfile", None)
        if shell_open is not None:
            try:
                shell_open(executable)
                return f"Opened {label}."
            except OSError:
                pass

        resolved = which(executable) or registered_path(executable)
        if resolved:
            popen([resolved], close_fds=True)
            return f"Opened {label}."
        raise SafetyError(
            f"I couldn't find {label} on this computer. Check that it is installed, "
            "then try again."
        )

    if os_name == "Darwin":
        popen(["open", "-a", str(app["mac"])], close_fds=True)
        return f"Opened {label}."

    if os_name == "Linux":
        command = app["linux"]
        executable = str(command[0])
        resolved = which(executable)
        if resolved:
            popen([resolved, *command[1:]], close_fds=True)
            if app_id in ("excel", "word", "powerpoint"):
                return f"Opened LibreOffice for {label} files."
            return f"Opened {label}."
        raise SafetyError(f"I couldn't find an installed application for {label}.")

    raise SafetyError(f"Opening desktop applications isn't supported on {os_name}.")
