from myagent_agent.memory import ShortMemory
from myagent_agent.router import route


def test_wiped_on_start(tmp_path):
    p = tmp_path / "session.json"
    m = ShortMemory(p)
    m.add("my cat is called Pixel", "Pixel! Cute name.")
    assert "Pixel" in p.read_text(encoding="utf-8")
    m2 = ShortMemory(p)  # MyAgent restarts
    assert m2.recent() == [] and p.read_text(encoding="utf-8").strip() == "[]"


def test_keeps_recent_and_starts_with_user(tmp_path):
    m = ShortMemory(tmp_path / "s.json", max_messages=4)
    for i in range(5):
        m.add(f"q{i}", f"a{i}")
    assert [x["content"] for x in m.recent()] == ["q3", "a3", "q4", "a4"]
    m.note("Omar beat MyAgent at tic-tac-toe")
    assert m.recent()[0]["role"] == "user" and m.recent()[-1]["content"].startswith("[")


def test_start_over_intent():
    assert route("start over").name == "memory.clear"
    assert route("hey myagent, forget what i said").name == "memory.clear"
    assert route("hey mimo, forget what i said").name == "memory.clear"  # legacy wake word
