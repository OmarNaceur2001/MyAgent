"""Brain tests with a scripted fake LLM (no Ollama, no browser needed)."""

import asyncio

import pytest

from myagent_agent.brain import Brain
from myagent_agent.llm import Reply, ToolCall, parse_message
from myagent_agent.safety import ActionLog, ConfirmationBroker, SafetyError
from myagent_agent.tools import Toolbox, parse_first_video, safe_url


class FakeLLM:
    def __init__(self, replies):
        self.replies = replies
        self.seen = []

    async def chat(self, messages, tools):
        self.seen.append(messages[-1])
        self.tools = tools
        return self.replies.pop(0)


def make(tmp_path, replies, video=("dQw4w9WgXcQ", "A Song")):
    sent, opened = [], []

    async def emit(e):
        sent.append(e)

    async def youtube(q):
        return video

    toolbox = Toolbox(None, emit=emit, opener=opened.append, youtube=youtube)
    brain = Brain(FakeLLM(replies), toolbox, emit, ConfirmationBroker(), ActionLog(tmp_path / "log.jsonl"))
    return brain, sent, opened


def final_steps(sent):
    out = {}
    for e in sent:
        if e["type"] == "agent.step":
            out[e["payload"]["step_id"]] = e["payload"]["status"]
    return list(out.values())


def test_only_web_and_fun_tools_exist(tmp_path):
    brain, _, _ = make(tmp_path, [])
    names = set(brain.tools.tools)
    assert names == {"play_youtube", "web_search", "open_website", "start_game", "start_timer", "start_pomodoro"}
    for forbidden in ("find_files", "move_path", "delete_path", "create_folder", "open_app", "open_path"):
        assert forbidden not in names


def test_play_song_opens_the_video(tmp_path):
    async def go():
        brain, sent, opened = make(tmp_path, [
            Reply(tool_calls=[ToolCall("play_youtube", {"query": "lofi beats"})]),
            Reply(content="Enjoy!"),
        ])
        await brain.run("play some lofi beats", "t1")
        assert opened == ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]
        assert any(e["type"] == "music.playing" for e in sent)
        assert final_steps(sent) == ["done"]

    asyncio.run(go())


def test_play_falls_back_to_results(tmp_path):
    async def go():
        brain, sent, opened = make(tmp_path, [
            Reply(tool_calls=[ToolCall("play_youtube", {"query": "x y"})]), Reply(content="ok")], video=None)
        await brain.run("play x y", "t2")
        assert opened == ["https://www.youtube.com/results?search_query=x+y"]

    asyncio.run(go())


def test_file_request_cannot_be_executed(tmp_path):
    """Even if the model tries a file tool, it doesn't exist."""
    async def go():
        brain, sent, opened = make(tmp_path, [
            Reply(tool_calls=[ToolCall("delete_path", {"path": "C:/Users/x"})]),
            Reply(content="I'm not allowed to touch files."),
        ])
        await brain.run("delete my files", "t3")
        assert final_steps(sent) == ["failed"] and opened == []
        assert "no tool called" in brain.llm.seen[1]["content"]

    asyncio.run(go())


def test_start_game_emits_event(tmp_path):
    async def go():
        brain, sent, _ = make(tmp_path, [Reply(tool_calls=[ToolCall("start_game", {"game": "memory"})]), Reply(content="Go!")])
        await brain.run("I'm bored", "t4")
        assert {"type": "game.open", "payload": {"game": "memory"}} in sent

    asyncio.run(go())


@pytest.mark.parametrize("url", ["file:///C:/Windows", "javascript:alert(1)", "http://localhost:8765", "http://192.168.1.1", "notaurl"])
def test_unsafe_urls_refused(url):
    with pytest.raises(SafetyError):
        safe_url(url)


def test_safe_urls_normalised():
    assert safe_url("youtube.com") == "https://youtube.com"


def test_parse_youtube_results():
    html = ('...{"videoRenderer":{"videoId":"abcDEF12345","thumbnail":{},"title":{"runs":[{"text":"Caf\\u00e9 \\"Live\\""}]}}'
            '{"videoRenderer":{"videoId":"zzzzzzzzzzz"}}')
    assert parse_first_video(html) == ("abcDEF12345", 'Café "Live"')
    assert parse_first_video("<html>nothing</html>") is None


def test_step_limit(tmp_path):
    async def go():
        brain, _, _ = make(tmp_path, [Reply(tool_calls=[ToolCall("web_search", {"query": "a"})])] * 3)
        brain.max_steps = 3
        assert "more steps" in await brain.run("loop", "t5")

    asyncio.run(go())


def test_parse_json_tool_call_in_text():
    r = parse_message({"content": '```json\n{"name": "play_youtube", "arguments": {"query": "jazz"}}\n```'})
    assert r.tool_calls[0].name == "play_youtube" and r.content == ""


def test_brain_sees_the_conversation_so_far(tmp_path):
    from myagent_agent.memory import ShortMemory

    class Recorder(FakeLLM):
        async def chat(self, messages, tools):
            self.all = messages
            return await super().chat(messages, tools)

    llm = Recorder([Reply(content="It was lofi hip hop!")])
    brain, sent, _ = make(tmp_path, [])
    brain.llm = llm
    brain.memory = ShortMemory(tmp_path / "s.json")
    brain.memory.add("play lofi hip hop", "[played “lofi hip hop” on YouTube] Coming right up!")
    asyncio.run(brain.run("what song did you just play?", "t1"))
    text = " ".join(m["content"] or "" for m in llm.all)
    assert "lofi hip hop" in text and llm.all[-1]["content"] == "what song did you just play?"
    assert len(brain.memory.recent()) == 4  # the new exchange was remembered
