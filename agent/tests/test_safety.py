import json

from myagent_agent.safety import ActionLog


def test_action_log_redacts_file_contents_and_secrets(tmp_path):
    path = tmp_path / "actions.log"
    log = ActionLog(path)
    log.write("read_file", {"path": "C:/work/notes.txt"}, True, "private document text")
    log.write(
        "write_file",
        {"path": "C:/work/out.txt", "content": "do not log this", "api_key": "also secret"},
        True,
        "Wrote 15 bytes",
    )

    entries = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    assert entries[0]["result"] == "[file content omitted from action log]"
    assert entries[1]["args"]["content"] == "[redacted]"
    assert entries[1]["args"]["api_key"] == "[redacted]"
    assert "private document text" not in path.read_text(encoding="utf-8")
    assert "do not log this" not in path.read_text(encoding="utf-8")
