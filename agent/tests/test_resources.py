from __future__ import annotations

import pytest

from myagent_agent.resources import ResourcePermissions
from myagent_agent.safety import SafetyError


def test_grant_is_persisted_and_scopes_access(tmp_path):
    root = tmp_path / "Documents"
    root.mkdir()
    (root / "notes.txt").write_text("hello", encoding="utf-8")
    manager = ResourcePermissions(tmp_path / "data" / "permissions.json")

    grant = manager.grant(str(root), read=True, write=False)

    assert grant == {"path": str(root.resolve()), "read": True, "write": False}
    assert "notes.txt" in manager.list_folder(str(root))
    assert manager.read_file(str(root / "notes.txt")) == "hello"
    with pytest.raises(SafetyError, match="no write permission"):
        manager.write_file(str(root / "new.txt"), "new")

    restored = ResourcePermissions(tmp_path / "data" / "permissions.json")
    assert restored.list() == [grant]


def test_path_outside_granted_folder_is_denied(tmp_path):
    root = tmp_path / "allowed"
    other = tmp_path / "private"
    root.mkdir()
    other.mkdir()
    (other / "secret.txt").write_text("private", encoding="utf-8")
    manager = ResourcePermissions(tmp_path / "permissions.json")
    manager.grant(str(root))

    with pytest.raises(SafetyError, match="no read permission"):
        manager.read_file(str(other / "secret.txt"))


def test_write_and_delete_are_scoped_and_can_be_used(tmp_path):
    root = tmp_path / "workspace"
    root.mkdir()
    manager = ResourcePermissions(tmp_path / "permissions.json")
    manager.grant(str(root), read=True, write=True)

    result = manager.write_file(str(root / "new.txt"), "hello")
    assert "Wrote" in result
    assert manager.read_file(str(root / "new.txt")) == "hello"
    with pytest.raises(SafetyError, match="already exists"):
        manager.write_file(str(root / "new.txt"), "overwrite")
    manager.write_file(str(root / "new.txt"), "updated", replace=True)
    assert manager.read_file(str(root / "new.txt")) == "updated"
    assert "Deleted" in manager.delete_file(str(root / "new.txt"))
    assert not (root / "new.txt").exists()


def test_revoke_and_disable_both_permissions(tmp_path):
    root = tmp_path / "workspace"
    root.mkdir()
    manager = ResourcePermissions(tmp_path / "permissions.json")
    manager.grant(str(root), read=True, write=True)
    manager.update(str(root), read=False, write=False)
    assert manager.list() == []
    with pytest.raises(SafetyError, match="no read permission"):
        manager.list_folder(str(root))


def test_drive_root_and_secret_folders_are_rejected(tmp_path):
    manager = ResourcePermissions(tmp_path / "permissions.json")
    with pytest.raises(SafetyError, match="whole drive"):
        manager.grant(str(tmp_path.anchor or "/"))
    ssh = tmp_path / ".ssh"
    ssh.mkdir()
    with pytest.raises(SafetyError, match="Credential and secret"):
        manager.grant(str(ssh))


def test_secret_files_are_not_exposed(tmp_path):
    root = tmp_path / "workspace"
    root.mkdir()
    (root / ".env").write_text("API_KEY=not-for-the-model", encoding="utf-8")
    (root / "readme.txt").write_text("safe", encoding="utf-8")
    manager = ResourcePermissions(tmp_path / "permissions.json")
    manager.grant(str(root))
    listing = manager.list_folder(str(root))
    assert ".env" not in listing
    assert "readme.txt" in listing
    with pytest.raises(SafetyError, match="credential and secret"):
        manager.read_file(str(root / ".env"))


def test_symlink_escape_is_denied(tmp_path):
    root = tmp_path / "workspace"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (outside / "hidden.txt").write_text("outside", encoding="utf-8")
    try:
        (root / "escape").symlink_to(outside, target_is_directory=True)
    except (OSError, NotImplementedError):
        pytest.skip("Symlinks are not available on this platform")
    manager = ResourcePermissions(tmp_path / "permissions.json")
    manager.grant(str(root))
    with pytest.raises(SafetyError, match="no read permission"):
        manager.list_folder(str(root / "escape"))



def test_in_scope_symlink_leaf_cannot_replace_or_delete_its_target(tmp_path):
    root = tmp_path / "workspace"
    root.mkdir()
    target = root / "target.txt"
    target.write_text("keep this content", encoding="utf-8")
    alias = root / "alias.txt"
    try:
        alias.symlink_to(target)
    except (OSError, NotImplementedError):
        pytest.skip("Symlinks are not available on this platform")

    manager = ResourcePermissions(tmp_path / "permissions.json")
    manager.grant(str(root), read=True, write=True)

    with pytest.raises(SafetyError, match="Symbolic links cannot be created or replaced"):
        manager.write_file(str(alias), "replacement", replace=True)
    with pytest.raises(SafetyError, match="Symbolic links cannot be deleted"):
        manager.delete_file(str(alias))

    assert alias.is_symlink()
    assert target.read_text(encoding="utf-8") == "keep this content"
