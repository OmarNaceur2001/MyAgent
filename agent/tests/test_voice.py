"""Voice flow tests with a fake microphone and speaker (no audio hardware needed)."""

import asyncio

import pytest

import mimo_agent.voice as voice_mod
from mimo_agent.voice import Level, Voice, _speakable, wake_match


class FakeEars:
    def __init__(self, text, audio=b"x"):
        self.text, self.audio, self.recording = text, audio, False
        self.level = Level()
        self.starts = 0

    def start(self):
        self.recording = True
        self.starts += 1
        self.level = Level()

    def stop(self):
        self.recording = False
        return self.audio

    def transcribe(self, audio):
        return self.text


class FakeMouth:
    def __init__(self):
        self.said = []

    def speak(self, text):
        self.said.append(text)

    def interrupt(self):
        pass


def make(text="open chrome", audio=b"x"):
    sent, heard = [], []

    async def emit(e):
        sent.append(e)

    async def on_text(t):
        heard.append(t)

    v = Voice(emit, on_text)
    v.ears, v.mouth = FakeEars(text, audio), FakeMouth()
    return v, sent, heard


def states(sent):
    return [e["payload"]["state"] for e in sent if e["type"] == "agent.status"]


def test_push_to_talk_sends_transcript():
    async def go():
        v, sent, heard = make("open chrome")
        assert await v.start_listening() is None
        await v.stop_listening()
        assert heard == ["open chrome"]
        assert states(sent)[0] == "listening"

    asyncio.run(go())


def test_accidental_tap_does_nothing():
    async def go():
        v, sent, heard = make(audio=None)
        await v.start_listening()
        await v.stop_listening()
        assert heard == [] and states(sent)[-1] == "idle"

    asyncio.run(go())


def test_silence_asks_again():
    async def go():
        v, sent, heard = make(text="")
        await v.start_listening()
        await v.stop_listening()
        assert heard == [] and any(e["type"] == "agent.message" for e in sent)

    asyncio.run(go())


def test_no_mic_explains_setup():
    async def go():
        v, _, _ = make()
        v.ears = None
        assert "isn't set up" in await v.start_listening()

    asyncio.run(go())


def test_speaks_replies_with_status():
    async def go():
        v, sent, _ = make()
        v.say("Hello!")
        assert v.is_speaking
        await v._speaking
        assert v.mouth.said == ["Hello!"] and states(sent) == ["speaking", "idle"]

    asyncio.run(go())


def test_long_paths_are_not_read_aloud():
    out = _speakable("Moved to C:\\Users\\MSI\\Documents\\ML\\machine_learning_notes.pdf")
    assert "Users" not in out and "machine_learning_notes.pdf" in out


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def test_level_tells_speech_from_room_noise():
    c = Clock()
    lv = Level(now=c)
    for _ in range(5):
        lv.feed(0.004)  # quiet room: sets the noise floor
    lv.feed(0.006)
    assert not lv.heard_speech  # a bit of noise is not speech
    c.t = 1.0
    lv.feed(0.08)  # a single loud chunk could be a click…
    assert not lv.heard_speech
    lv.feed(0.08)  # …two in a row is speech
    assert lv.heard_speech
    c.t = 2.5
    assert lv.silent_for() == 1.5


def test_stops_by_itself_when_you_stop_talking(monkeypatch):
    monkeypatch.setattr(voice_mod, "END_SILENCE_S", 0.2)

    async def go():
        v, sent, heard = make("tell me a joke")
        await v.start_listening()
        v.ears.level.last_loud = v.ears.level.now()  # speech happened…
        await asyncio.sleep(0.5)  # …then silence
        assert heard == ["tell me a joke"] and not v.ears.recording
        assert v.conversation is True

    asyncio.run(go())


def test_gives_up_if_nobody_talks(monkeypatch):
    monkeypatch.setattr(voice_mod, "WAIT_FOR_SPEECH_S", 0.2)

    async def go():
        v, sent, heard = make()
        v.conversation = True
        await v.start_listening()
        await asyncio.sleep(0.5)
        assert heard == [] and not v.ears.recording
        assert v.conversation is False and states(sent)[-1] == "idle"

    asyncio.run(go())


def test_conversation_listens_for_the_answer():
    async def go():
        v, sent, _ = make()
        v.conversation = True
        v.say("Why did the cursor cross the screen?")
        await v._speaking
        await asyncio.sleep(0.4)
        assert v.ears.recording and v.ears.starts == 1
        assert sent[-1]["payload"] == {"state": "listening", "detail": "follow-up"}
        await v.stop_listening()

    asyncio.run(go())


def test_no_follow_up_after_typed_messages():
    async def go():
        v, sent, _ = make()
        v.conversation = False
        v.say("Hello!")
        await v._speaking
        await asyncio.sleep(0.4)
        assert v.ears.starts == 0

    asyncio.run(go())


def test_talking_right_away_is_still_heard():
    """The old bug: speaking immediately made the voice itself 'the noise floor'."""
    lv = Level()
    for _ in range(10):
        lv.feed(0.06)
    assert lv.heard_speech


def test_noisy_room_raises_the_bar():
    lv = Level()
    for _ in range(20):
        lv.feed(0.009)  # fan noise
    assert not lv.heard_speech
    assert lv.is_loud(0.05) and not lv.is_loud(0.015)


@pytest.mark.parametrize("text,rest", [
    ("Hey MIMO.", ""),
    ("hey mimo, play some lofi", "play some lofi"),
    ("Mimo!", ""),
    ("Hi Meemo what time is it?", "what time is it"),
    ("Okay, Nemo. Let's play tic-tac-toe.", "Let's play tic-tac-toe"),
])
def test_wake_word_heard(text, rest):
    assert wake_match(text) == rest


@pytest.mark.parametrize("text", ["I need to send a memo", "the movie was good", "", "hey there"])
def test_wake_word_ignored(text):
    assert wake_match(text) is None


def test_wake_then_listens():
    async def go():
        v, sent, heard = make()
        await v.on_wake("")
        assert v.ears.recording and v.conversation
        assert any(e["type"] == "agent.wake" for e in sent)
        await v.stop_listening()

    asyncio.run(go())


def test_wake_with_request_runs_it_directly():
    async def go():
        v, sent, heard = make()
        await v.on_wake("play lofi")
        assert heard == ["play lofi"] and not v.ears.recording

    asyncio.run(go())


def test_wake_paused_while_speaking_and_recording():
    async def go():
        v, _, _ = make()
        v._quiet_until = 0
        assert v._wake_allowed()
        v.ears.recording = True
        assert not v._wake_allowed()
        v.ears.recording = False
        v.wake_enabled = False
        assert not v._wake_allowed()

    asyncio.run(go())


def test_greeting_said_into_mic_is_dropped():
    async def go():
        v, sent, heard = make("Hey MIMO, tell me a joke")
        await v.start_listening()
        v.ears.level.last_loud = v.ears.level.now()
        await v.stop_listening()
        assert heard == ["tell me a joke"]

    asyncio.run(go())


def test_prefs_persist(tmp_path):
    from mimo_agent.prefs import Prefs

    p = Prefs(tmp_path / "prefs.json")
    assert p.values == {"wake_word": True, "speak_replies": True}
    assert p.set("wake_word", False)
    assert not p.set("wake_word", "nope") and not p.set("unknown", True)
    assert Prefs(tmp_path / "prefs.json").values["wake_word"] is False


def test_wake_listener_loop_with_fake_mic(monkeypatch):
    """Silence → a 1 s burst of 'speech' → silence: the burst is transcribed once and wakes MIMO."""
    import sys
    import threading
    import types

    import numpy as np

    from mimo_agent.voice import BLOCK, WakeListener

    quiet = np.full((BLOCK, 1), 0.002, dtype=np.float32)
    loud = np.full((BLOCK, 1), 0.1, dtype=np.float32)
    script = [quiet] * 10 + [loud] * 10 + [quiet] * 12

    class FakeStream:
        def __init__(self, callback, **_):
            self.cb = callback

        def start(self):
            def feed():
                for b in script:
                    self.cb(b, BLOCK, None, None)
            threading.Thread(target=feed, daemon=True).start()

        def stop(self):
            pass

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "sounddevice", types.SimpleNamespace(InputStream=FakeStream))
    heard, woke = [], threading.Event()

    def transcribe(audio):
        heard.append(len(audio))
        return "Hey MIMO, play jazz"

    def on_wake(rest):
        heard.append(rest)
        woke.set()

    wl = WakeListener(transcribe, allowed=lambda: True, on_wake=on_wake)
    wl.start()
    assert woke.wait(3), "wake word never fired"
    wl.stop()
    assert heard[-1] == "play jazz"
    assert heard[0] >= BLOCK * 10  # the whole burst (plus pre-roll) was transcribed
