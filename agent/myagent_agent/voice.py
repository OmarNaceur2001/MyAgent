"""Voice: hearing (faster-whisper), MyAgent's voice (Piper) and the "Hey MyAgent" wake word.

Everything runs offline on the CPU, so the GPU stays free for the LLM.

Setup on your PC (once):
    pip install -r requirements-voice.txt
    python -m piper.download_voices en_US-amy-medium --download-dir voices
Whisper models download themselves the first time (~150 MB base.en, ~75 MB tiny.en).

How hearing works:
  • Level        tells speech from room noise (adapts to your room continuously)
  • Ears         records one request, stops when you stop talking, transcribes it
  • WakeListener waits for "Hey MyAgent": it only transcribes SHORT bursts of speech
                 with the tiny model, so silence costs (almost) nothing
  • Voice        ties it together: conversation mode, speaking, pausing the wake
                 word while MyAgent talks so he never wakes himself up
"""

from __future__ import annotations

import asyncio
import collections
import importlib.util
import logging
import os
import re
import threading
import time
from pathlib import Path, PureWindowsPath
from typing import Awaitable, Callable

log = logging.getLogger("myagent.voice")

SAMPLE_RATE = 16_000
BLOCK = 1600  # 100 ms of audio per chunk
MAX_SECONDS = 30  # a request never records forever
END_SILENCE_S = 1.3  # you stopped talking for this long → done (natural pauses are shorter)
WAIT_FOR_SPEECH_S = 8  # pressed the mic but said nothing → give up
FOLLOW_UP_WAIT_S = 6  # in a conversation, how long MyAgent waits for your reply
VOICES_DIR = Path(__file__).resolve().parent.parent / "voices"

WHISPER_MODEL = os.environ.get("MYAGENT_WHISPER_MODEL", os.environ.get("MIMO_WHISPER_MODEL", "base.en"))  # "small.en" = better, slower
WAKE_MODEL = os.environ.get("MYAGENT_WAKE_MODEL", os.environ.get("MIMO_WAKE_MODEL", "tiny.en"))
PIPER_VOICE = os.environ.get("MYAGENT_PIPER_VOICE", os.environ.get("MIMO_PIPER_VOICE", "en_US-ryan-high"))
MIC_THRESHOLD = float(os.environ.get("MYAGENT_MIC_THRESHOLD", os.environ.get("MIMO_MIC_THRESHOLD", "0.012")))  # raise if a noisy room wakes him


def _has(module: str) -> bool:
    return importlib.util.find_spec(module) is not None


def _portaudio_ok() -> bool:
    try:
        import sounddevice  # noqa: F401  (needs the PortAudio system library)

        return True
    except (ImportError, OSError):
        return False


def _rms(block) -> float:
    return float((block ** 2).mean() ** 0.5)

def _input_stream(sd, callback):
    """Open the default mic; resample native 44.1/48 kHz input for Whisper."""
    import numpy as np
    device = None
    try:
        default_input = sd.default.device[0]
        if default_input is not None and int(default_input) >= 0:
            device = int(default_input)
            info = sd.query_devices(device, "input")
            native_rate = int(round(info.get("default_samplerate") or SAMPLE_RATE))
            try:
                sd.check_input_settings(device=device, channels=1, dtype="float32", samplerate=SAMPLE_RATE)
                capture_rate = SAMPLE_RATE
            except Exception:
                capture_rate = native_rate
        else:
            capture_rate = SAMPLE_RATE
    except Exception:
        capture_rate = SAMPLE_RATE
    frames = max(1, int(round(capture_rate * 0.1)))
    def adapted(data, _frames, timing, status):
        mono = data[:, 0] if getattr(data, "ndim", 1) > 1 else data
        if capture_rate != SAMPLE_RATE and len(mono):
            count = max(1, int(round(len(mono) * SAMPLE_RATE / capture_rate)))
            old = np.arange(len(mono), dtype=np.float32)
            new = np.linspace(0, max(0, len(mono) - 1), count, dtype=np.float32)
            mono = np.interp(new, old, mono).astype(np.float32)
        callback(mono.reshape(-1, 1), len(mono), timing, status)
    log.info("Opening microphone input device=%s at %s Hz (Whisper uses %s Hz)", device, capture_rate, SAMPLE_RATE)
    return sd.InputStream(device=device, samplerate=capture_rate, channels=1, dtype="float32", blocksize=frames, callback=adapted)



# ------------------------------------------------------------------ speech vs. silence

class Level:
    """Tells speech from silence by loudness, relative to the room's own noise.

    The noise floor is a low percentile of the last ~3 s, so it follows the room
    (a fan turning on) and is never fooled by you talking right from the start:
    it's capped, so your voice can't become "the floor". Speech must last at
    least two chunks (200 ms), so a click or a knock doesn't count.
    """

    PRIOR_FLOOR = 0.004
    FLOOR_CAP = 0.01

    def __init__(self, now: Callable[[], float] = time.monotonic, threshold: float = MIC_THRESHOLD) -> None:
        self.now = now
        self.threshold = threshold
        self.started = now()
        self.last_loud: float | None = None
        self._history: collections.deque[float] = collections.deque(maxlen=30)
        self._run = 0

    @property
    def floor(self) -> float:
        if len(self._history) < 5:
            return self.PRIOR_FLOOR
        ordered = sorted(self._history)
        return min(ordered[len(ordered) // 5], self.FLOOR_CAP)

    def is_loud(self, rms: float) -> bool:
        return rms > max(self.threshold, self.floor * 2.5)

    def feed(self, rms: float) -> bool:
        """Returns True if this chunk counts as speech."""
        loud = self.is_loud(rms)
        self._history.append(rms)
        self._run = self._run + 1 if loud else 0
        if loud and (self._run >= 2 or self.last_loud is not None):
            self.last_loud = self.now()
            return True
        return False

    @property
    def heard_speech(self) -> bool:
        return self.last_loud is not None

    def silent_for(self) -> float:
        return self.now() - (self.last_loud if self.last_loud is not None else self.started)

    def elapsed(self) -> float:
        return self.now() - self.started


# ------------------------------------------------------------------ speech to text

def whisper_prompt(user_name: str) -> str:
    """Words MyAgent hears often. Whisper spells names and game words right far more often with this."""
    return (f"Hey MyAgent. {user_name}. Tic-tac-toe, rock paper scissors, memory game, Pomodoro, "
            "timer, YouTube, play lofi music, tell me a joke.")


class Transcriber:
    """A lazily loaded faster-whisper model (thread-safe)."""

    def __init__(self, model: str, prompt: str) -> None:
        self.name = model
        self.prompt = prompt
        self._model = None
        self._lock = threading.Lock()

    def load(self) -> None:
        with self._lock:
            if self._model is None:
                from faster_whisper import WhisperModel

                log.info("loading Whisper %s…", self.name)
                self._model = WhisperModel(self.name, device="cpu", compute_type="int8")
                log.info("Whisper %s ready", self.name)

    def __call__(self, audio) -> str:
        self.load()
        segments, _ = self._model.transcribe(
            audio, beam_size=1, vad_filter=True, initial_prompt=self.prompt, condition_on_previous_text=False
        )
        return " ".join(s.text.strip() for s in segments).strip()


class Ears:
    """Records one request from the mic until you stop talking (or press stop), then transcribes."""

    def __init__(self, user_name: str = "friend") -> None:
        self.transcribe = Transcriber(WHISPER_MODEL, whisper_prompt(user_name))
        self._chunks: list = []
        self._stream = None
        self._lock = threading.Lock()
        self.level = Level()

    @staticmethod
    def available() -> bool:
        return _has("faster_whisper") and _portaudio_ok()

    @property
    def recording(self) -> bool:
        return self._stream is not None

    def start(self) -> None:
        import sounddevice as sd

        if self._stream:
            return
        self._chunks = []
        self.level = Level()

        def on_audio(data, _frames, _time, _status):
            with self._lock:
                if len(self._chunks) * BLOCK < SAMPLE_RATE * MAX_SECONDS:
                    self._chunks.append(data.copy())
            self.level.feed(_rms(data))

        self._stream = _input_stream(sd, on_audio)
        self._stream.start()

    def stop(self):
        """Stop recording and return the audio as a 1-D float32 array (or None)."""
        import numpy as np

        if not self._stream:
            return None
        self._stream.stop()
        self._stream.close()
        self._stream = None
        with self._lock:
            chunks, self._chunks = self._chunks, []
        if not chunks or not self.level.heard_speech:
            return None  # nothing but room noise: don't waste time transcribing
        audio = np.concatenate(chunks).reshape(-1)
        return audio if len(audio) > SAMPLE_RATE * 0.3 else None


# ------------------------------------------------------------------ "Hey MyAgent"

# How Whisper tends to spell "MyAgent" (or legacy "MIMO") when it hears it.
_NAME = r"(?:my\s*agent|myagent|my-agent|my\s*agant|mimo|mimoh|mimmo|meemo|mee-?mo|mi-?mo|me-?mo|memo|nimo|nemo|neemo|mino|mimo's)"
_WAKE = re.compile(rf"^\W*(?:(?:hey|hi|hello|okay|ok|yo|oh)\W+)?{_NAME}\b\W*(.*)$", re.IGNORECASE)


def wake_match(text: str) -> str | None:
    """'Hey MyAgent, play lofi' → 'play lofi'; 'Hey MyAgent.' → ''; anything else → None.

    The name must come first, so a sentence that merely contains "memo"
    never wakes him.
    """
    m = _WAKE.match(text.strip())
    if not m:
        return None
    return m.group(1).strip(" .,!?")


class WakeListener:
    """Listens in the background for short bursts of speech and checks them for "Hey MyAgent".

    Cost: the mic stream plus a loudness check every 100 ms. Whisper (tiny)
    only runs on bursts of 0.4–4 s of speech, never on silence.
    """

    PRE_ROLL = 3  # chunks kept from before speech starts (so "hey" isn't cut off)
    END_SILENCE_S = 0.6
    MIN_S, MAX_S = 0.4, 4.0

    def __init__(self, transcribe: Callable, allowed: Callable[[], bool], on_wake: Callable[[str], None]) -> None:
        self.transcribe = transcribe
        self.allowed = allowed
        self.on_wake = on_wake
        self._thread: threading.Thread | None = None
        self._running = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._running.set()
        self._thread = threading.Thread(target=self._loop, name="myagent-wake", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running.clear()

    def _loop(self) -> None:
        import queue

        import numpy as np
        import sounddevice as sd

        blocks: queue.Queue = queue.Queue()
        stream = None
        level = Level()
        pre: collections.deque = collections.deque(maxlen=self.PRE_ROLL)
        burst: list = []
        quiet = 0  # quiet chunks since the last speech, counted in AUDIO time, not wall time:
        #            after a slow transcription, queued audio is processed in a burst,
        #            and a wall clock would say "no time passed".

        def reset():
            nonlocal level, burst, quiet
            level, burst, quiet = Level(), [], 0
            pre.clear()

        while self._running.is_set():
            if not self.allowed():
                if stream is not None:
                    stream.stop()
                    stream.close()
                    stream = None
                    reset()
                time.sleep(0.15)
                continue
            if stream is None:
                try:
                    stream = _input_stream(sd, lambda d, *_: blocks.put(d.copy()))
                    stream.start()
                except Exception as exc:  # mic busy or missing: try again later
                    log.warning("wake word can't open the mic: %s", exc)
                    stream = None
                    time.sleep(3)
                    continue
            try:
                block = blocks.get(timeout=0.3)
            except queue.Empty:
                continue
            speaking = level.feed(_rms(block))
            if not burst:
                pre.append(block)
                if speaking:
                    burst = list(pre)
                continue
            burst.append(block)
            quiet = 0 if speaking else quiet + 1
            seconds = len(burst) * BLOCK / SAMPLE_RATE
            if quiet * BLOCK / SAMPLE_RATE >= self.END_SILENCE_S or seconds >= self.MAX_S:
                audio = np.concatenate(burst).reshape(-1)
                spoken = seconds - quiet * BLOCK / SAMPLE_RATE
                reset()
                if self.MIN_S <= spoken <= self.MAX_S + 0.2:
                    try:
                        heard = self.transcribe(audio)
                    except Exception as exc:
                        log.warning("wake transcription failed: %s", exc)
                        continue
                    rest = wake_match(heard)
                    if rest is not None:
                        log.info("wake word: %r", heard)
                        if stream is not None:  # free the mic for the request
                            stream.stop()
                            stream.close()
                            stream = None
                        self.on_wake(rest)
        if stream is not None:
            stream.stop()
            stream.close()


# ------------------------------------------------------------------ text to speech

class Mouth:
    """Speaks MyAgent's replies with Piper, as one smooth clip (no gaps between sentences)."""

    def __init__(self) -> None:
        self._voice = None
        self._stop = threading.Event()
        self._lock = threading.Lock()

    @staticmethod
    def voice_file() -> Path:
        return VOICES_DIR / f"{PIPER_VOICE}.onnx"

    @classmethod
    def available(cls) -> bool:
        return _has("piper") and _portaudio_ok() and cls.voice_file().exists()

    def load(self) -> None:
        with self._lock:
            if self._voice is None:
                from piper import PiperVoice

                self._voice = PiperVoice.load(self.voice_file())

    def speak(self, text: str) -> None:
        """Blocking: synthesise everything, then play once. Call from a worker thread."""
        import numpy as np
        import sounddevice as sd

        self.load()
        self._stop.clear()
        parts, rate = [], 22050
        for chunk in self._voice.synthesize(_speakable(text)):
            if self._stop.is_set():
                return
            parts.append(chunk.audio_float_array)
            rate = chunk.sample_rate
        if not parts or self._stop.is_set():
            return
        lead_in = np.zeros(int(rate * 0.06), dtype=np.float32)  # avoids a clipped first syllable
        sd.play(np.concatenate([lead_in, *parts]).astype(np.float32), rate)
        sd.wait()

    def interrupt(self) -> None:
        import sounddevice as sd

        self._stop.set()
        sd.stop()


def _speakable(text: str) -> str:
    """Drop things that sound bad read aloud (long paths, markdown symbols)."""
    words = []
    for w in text.split():
        if ("\\" in w or "/" in w) and len(w) > 25:
            w = PureWindowsPath(w.strip("“”\"'.,")).name or "that file"  # handles / and \\
        words.append(w.strip("*_`#"))
    return " ".join(words)


# ------------------------------------------------------------------ glue

Emit = Callable[[dict], Awaitable[None]]


class Voice:
    """Glue between the mic/speaker and the agent's event loop."""

    def __init__(self, emit: Emit, on_text: Callable[[str], Awaitable[None]],
                 is_busy: Callable[[], bool] = lambda: False, user_name: str = "friend"):
        self.emit = emit
        self.on_text = on_text
        self.is_busy = is_busy
        # Conversation mode: after you talk to MyAgent and he answers out loud,
        # he listens for your reply without you pressing anything. It ends
        # when you don't say anything for a few seconds, or when you type.
        self.conversation = False
        self.speak_replies = True
        self.wake_enabled = True
        self._watch: asyncio.Task | None = None
        self._speaking: asyncio.Task | None = None
        self._quiet_until = 0.0  # wake word stays off until then (MyAgent just spoke)
        self._loop: asyncio.AbstractEventLoop | None = None
        self.ears = Ears(user_name) if Ears.available() else None
        self.mouth = Mouth() if Mouth.available() else None
        self.wake: WakeListener | None = None
        if self.ears:
            self._wake_transcribe = Transcriber(WAKE_MODEL, "Hey MyAgent.")
            self.wake = WakeListener(self._wake_transcribe, self._wake_allowed, self._on_wake_thread)

    def features(self) -> dict[str, bool]:
        return {"voice": self.ears is not None, "tts": self.mouth is not None, "wake": self.wake is not None}

    # ---------- startup
    def start_background(self) -> None:
        """Load models in the background (so the first request isn't slow) and start the wake word."""
        self._loop = asyncio.get_running_loop()

        def warm():
            for part in (self.ears.transcribe if self.ears else None,
                         getattr(self, "_wake_transcribe", None),
                         self.mouth):
                if part is None:
                    continue
                try:
                    part.load()
                except Exception as exc:
                    log.warning("could not preload a voice model: %s", exc)

        threading.Thread(target=warm, name="myagent-voice-warmup", daemon=True).start()
        if self.wake and self.wake_enabled:
            self.wake.start()

    def set_wake(self, enabled: bool) -> None:
        self.wake_enabled = enabled
        if self.wake:
            if enabled and self._loop:
                self.wake.start()
            elif not enabled:
                self.wake.stop()

    def shutdown(self) -> None:
        if self.wake:
            self.wake.stop()

    # ---------- wake word
    def _wake_allowed(self) -> bool:
        return (self.wake_enabled and self.ears is not None and not self.ears.recording
                and not self.is_speaking and time.monotonic() >= self._quiet_until)

    def _on_wake_thread(self, rest: str) -> None:
        """Called from the wake thread: hop over to the event loop."""
        if self._loop:
            asyncio.run_coroutine_threadsafe(self.on_wake(rest), self._loop)

    async def on_wake(self, rest: str) -> None:
        from . import events

        await self.emit(events.event("agent.wake"))
        self.conversation = True
        if rest:  # "Hey MyAgent, play lofi" → do it right away
            await self.on_text(rest)
        else:  # just "Hey MyAgent" → listen for the request
            await self.start_listening()

    # ---------- listening
    async def start_listening(self, follow_up: bool = False) -> str | None:
        """Returns an error message, or None if listening started."""
        from . import events

        if not self.ears:
            return "Voice isn't set up yet. See agent/voice.py for the two setup commands."
        if self.ears.recording:
            return None
        self.stop_speaking()
        try:
            await asyncio.to_thread(self.ears.start)
        except Exception as exc:  # no microphone, device busy…
            return f"I can't open the microphone: {exc}"
        await self.emit(events.status("listening", "follow-up" if follow_up else None))
        self._watch = asyncio.create_task(self._watch_silence(follow_up))
        return None

    async def _watch_silence(self, follow_up: bool) -> None:
        """Stop by itself when you finish talking; give up if you never start."""
        from . import events

        wait = FOLLOW_UP_WAIT_S if follow_up else WAIT_FOR_SPEECH_S
        while self.ears and self.ears.recording:
            await asyncio.sleep(0.1)
            lv = self.ears.level
            if lv.heard_speech and lv.silent_for() >= END_SILENCE_S:
                await self.stop_listening()
                return
            if not lv.heard_speech and lv.elapsed() >= wait:
                await asyncio.to_thread(self.ears.stop)
                self.conversation = False  # nobody answered: the conversation is over
                await self.emit(events.status("idle"))
                return
            if lv.elapsed() >= MAX_SECONDS:
                await self.stop_listening()
                return

    async def stop_listening(self) -> None:
        from . import events

        if not self.ears or not self.ears.recording:
            return
        audio = await asyncio.to_thread(self.ears.stop)
        if audio is None:
            await self.emit(events.status("idle"))
            return
        await self.emit(events.status("thinking", "Listening back…"))
        try:
            text = await asyncio.to_thread(self.ears.transcribe, audio)
        except Exception as exc:
            await self.emit(events.message(f"I couldn't understand the audio: {exc}", tone="sad"))
            await self.emit(events.status("idle"))
            return
        # "Hey MyAgent, …" said into the mic button: drop the greeting, keep the request
        rest = wake_match(text)
        if rest:
            text = rest
        if not text or rest == "":
            await self.emit(events.message("I didn't catch that. Try again?", tone="confused"))
            await self.emit(events.status("idle"))
            return
        self.conversation = True
        await self.emit(events.status("idle"))
        await self.on_text(text)

    # ---------- speaking
    @property
    def is_speaking(self) -> bool:
        return bool(self._speaking and not self._speaking.done())

    def say(self, text: str) -> None:
        """Speak in the background; never blocks the agent."""
        if not self.mouth or not self.speak_replies or not text:
            return
        self.stop_speaking()
        self._speaking = asyncio.create_task(self._say(text))

    async def _say(self, text: str) -> None:
        from . import events

        finished = False
        try:
            await self.emit(events.status("speaking"))
            await asyncio.to_thread(self.mouth.speak, text)
            finished = True
        except Exception as exc:
            log.warning("speech failed: %s", exc)
        finally:
            self._quiet_until = time.monotonic() + 0.8  # don't let the wake word hear MyAgent's echo
            await self.emit(events.status("idle"))
        # In a conversation, listen for the answer once MyAgent is done talking
        # (and not in the middle of a task that will say more).
        if finished and self.conversation and self.ears and not self.is_busy():
            await asyncio.sleep(0.4)  # let the speaker go quiet so MyAgent doesn't hear himself
            # Only if no newer sentence started meanwhile (this task is still the latest one).
            if self._speaking is asyncio.current_task():
                await self.start_listening(follow_up=True)

    def stop_speaking(self) -> None:
        if self.mouth and self._speaking and not self._speaking.done():
            self.mouth.interrupt()

    def end_conversation(self) -> None:
        self.conversation = False
