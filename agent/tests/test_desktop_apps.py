from __future__ import annotations

from myagent_agent.desktop_apps import launch_allowed_app
from myagent_agent.safety import SafetyError


def test_windows_launch_uses_only_the_allowlisted_executable():
    launched = []
    result = launch_allowed_app(
        "excel",
        system="Windows",
        startfile=lambda target: launched.append(target),
    )
    assert result == "Opened Excel."
    assert launched == ["EXCEL.EXE"]


def test_windows_launch_resolves_office_install_path_when_shell_open_fails():
    commands = []
    def fail_startfile(_target):
        raise OSError("not found on PATH")
    result = launch_allowed_app(
        "excel",
        system="Windows",
        startfile=fail_startfile,
        which=lambda _name: None,
        registered_path=lambda _name: r"C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE",
        popen=lambda args, **kwargs: commands.append((args, kwargs)),
    )
    assert result == "Opened Excel."
    assert commands[0][0][0].endswith("EXCEL.EXE")
    assert commands[0][1]["close_fds"] is True


def test_missing_windows_app_returns_a_clear_message():
    with __import__("pytest").raises(SafetyError, match="couldn.t find Excel"):
        launch_allowed_app(
            "excel",
            system="Windows",
            startfile=lambda _target: (_ for _ in ()).throw(OSError("missing")),
            which=lambda _name: None,
            registered_path=lambda _name: None,
        )


def test_macos_app_launch_does_not_use_a_shell():
    commands = []
    result = launch_allowed_app(
        "excel",
        system="Darwin",
        popen=lambda args, **kwargs: commands.append((args, kwargs)),
    )
    assert result == "Opened Excel."
    assert commands[0][0] == ["open", "-a", "Microsoft Excel"]


def test_arbitrary_app_and_command_are_rejected():
    import pytest
    with pytest.raises(SafetyError, match="approved app list"):
        launch_allowed_app("powershell")
    with pytest.raises(SafetyError, match="approved app list"):
        launch_allowed_app("C:/Windows/System32/cmd.exe")