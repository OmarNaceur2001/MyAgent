"""MyAgent agent server.

One WebSocket (/ws) carries events to the UI and commands from it.
Run with:  python run.py
"""

from __future__ import annotations

import json
import logging
import os
import random
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from . import __version__, events
from .brain import Brain
from .config import settings
from .llm import OllamaLLM
from .memory import ShortMemory
from .prefs import Prefs
from .resources import ResourcePermissions
from .router import Intent, route
from .safety import ActionLog, ConfirmationBroker, SafetyError
from .store import Store
from .timer import PomodoroConfig, TimerService
from .tools import Toolbox
from .voice import Voice
from .web_security import AGENT_SUBPROTOCOL, is_valid_agent_session

log = logging.getLogger("myagent")


DATA_DIR = Path(__file__).resolve().parent.parent / "data"


class Hub:
    """Keeps every connected window (main app + floating companion) in sync."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()

    async def broadcast(self, evt: dict) -> None:
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_json(evt)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


hub = Hub()
db_file = DATA_DIR / "myagent.db"
if not db_file.exists() and (DATA_DIR / "mimo.db").exists():
    import shutil
    try:
        shutil.copy2(DATA_DIR / "mimo.db", db_file)
    except Exception:
        pass
store = Store(db_file if (db_file.exists() or not (DATA_DIR / "mimo.db").exists()) else (DATA_DIR / "mimo.db"))
timers = TimerService(hub.broadcast, store)
llm = OllamaLLM(settings.ollama_url, settings.model, settings.keep_alive)
broker = ConfirmationBroker()
resource_permissions = ResourcePermissions(DATA_DIR / "resource_permissions.json")
toolbox = Toolbox(timers, emit=lambda e: emit(e), resources=resource_permissions)


async def emit(evt: dict) -> None:
    """Broadcast an event, and let MyAgent say its replies out loud."""
    if evt["type"] == "agent.status" and evt["payload"]["state"] == "idle" and voice.is_speaking:
        return  # the voice sends "idle" itself when it finishes talking
    await hub.broadcast(evt)
    if evt["type"] == "agent.message":
        voice.say(evt["payload"]["text"])


memory = ShortMemory(DATA_DIR / "session.json")  # wiped at every start
brain = Brain(llm, toolbox, emit, broker, ActionLog(DATA_DIR / "actions.log"),
              settings.max_steps, settings.confirm_timeout_s, settings.user_name, memory=memory)
voice = Voice(emit=hub.broadcast, on_text=lambda text: handle_say(text, spoken=True),
              is_busy=lambda: brain.busy, user_name=settings.user_name)
prefs = Prefs(DATA_DIR / "prefs.json")
voice.wake_enabled = prefs.values["wake_word"]
voice.speak_replies = prefs.values["speak_replies"]


def prefs_event() -> dict:
    return events.event("prefs", **prefs.values)


def resource_permissions_event() -> dict:
    return events.event("resource.permissions", grants=resource_permissions.list())


async def features() -> dict[str, bool]:
    """What actually works right now. The UI labels the rest "coming soon"."""
    return {"timer": True, "router": True, **voice.features(), "llm": await llm.available(),
            "vision": False, "computer": True}


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("MyAgent agent %s ready on ws://127.0.0.1:8765/ws", __version__)
    log.info("Model: %s (%s) · tools: %s", settings.model,
             "ready" if await llm.available() else "NOT available, start Ollama and pull it",
             ", ".join(toolbox.tools))
    voice.start_background()
    if voice.wake and voice.wake_enabled:
        log.info('Say "Hey MyAgent" any time (wake word on)')
    yield
    voice.shutdown()
    await timers.stop()


app = FastAPI(title="MyAgent agent", version=__version__, lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "version": __version__, "features": await features()}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    token = os.environ.get("MYAGENT_LOCAL_TOKEN", "")
    offered = list(ws.scope.get("subprotocols") or [])
    if not is_valid_agent_session(offered, token):
        log.warning("rejected an unauthenticated WebSocket client")
        await ws.close(code=1008, reason="Unauthorized MyAgent session")
        return
    await ws.accept(subprotocol=AGENT_SUBPROTOCOL)
    hub.clients.add(ws)
    await ws.send_json(events.hello(__version__, await features()))
    await ws.send_json(timers.state_event())
    await ws.send_json(events.event("stats", **store.stats()))
    await ws.send_json(prefs_event())
    await ws.send_json(resource_permissions_event())
    await ws.send_json(events.status("working" if brain.busy else "idle"))
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "cmd":
                    p = msg.get("payload") or {}
                    await handle(p.get("name", ""), p.get("args") or {})
            except Exception as exc:  # one bad command must never kill the connection
                log.exception("command failed")
                await ws.send_json(events.error(str(exc)))
    except WebSocketDisconnect:
        pass
    finally:
        hub.clients.discard(ws)


# ---------------------------------------------------------------- commands

async def handle(name: str, args: dict) -> None:
    if name == "say":
        voice.end_conversation()  # typing ends hands-free conversation mode
        await handle_say(str(args.get("text", "")))
    elif name in ("timer.start", "pomodoro.start", "timer.pause", "timer.resume", "timer.stop", "timer.skip"):
        await run_intent(Intent(name, args), speak=False)
    elif name == "voice.start":
        problem = await voice.start_listening()
        if problem:
            await hub.broadcast(events.message(problem, tone="confused"))
    elif name == "voice.stop":
        await voice.stop_listening()
    elif name == "resources.list":
        await hub.broadcast(resource_permissions_event())
    elif name == "resources.grant":
        grant = resource_permissions.grant(
            str(args.get("path", "")),
            read=args.get("read", True),
            write=args.get("write", False),
        )
        await hub.broadcast(resource_permissions_event())
        await hub.broadcast(events.message(
            "Folder access updated. New folders start with read-only permission.",
            tone="happy",
        ))
    elif name == "resources.update":
        path = str(args.get("path", ""))
        resource_permissions.update(path, read=args.get("read"), write=args.get("write"))
        await hub.broadcast(resource_permissions_event())
    elif name == "resources.revoke":
        resource_permissions.revoke(str(args.get("path", "")))
        await hub.broadcast(resource_permissions_event())
    elif name == "prefs.set":
        key, value = str(args.get("key", "")), args.get("value")
        if not prefs.set(key, value):
            await hub.broadcast(events.error(f"Unknown setting: {key}"))
            return
        if key == "wake_word":
            voice.set_wake(value)
        elif key == "speak_replies":
            voice.speak_replies = value
            if not value:
                voice.stop_speaking()
        await hub.broadcast(prefs_event())
    elif name == "voice.hush":
        voice.stop_speaking()
        voice.end_conversation()
    elif name == "agent.cancel":
        voice.stop_speaking()
        voice.end_conversation()
        if not await brain.cancel():
            await hub.broadcast(events.status("idle"))
    elif name == "game.result":
        # A game finished in the UI: reward the player (wins and draws only).
        outcome, game = str(args.get("outcome")), GAME_NAMES.get(str(args.get("game")), "a game")
        memory.note({"win": f"{settings.user_name} beat MyAgent at {game}", "lose": f"MyAgent beat {settings.user_name} at {game}",
                     "draw": f"{game} ended in a draw"}.get(outcome, f"finished {game}"))
        coins = {"win": GAME_COINS_WIN, "draw": GAME_COINS_DRAW}.get(outcome, 0)
        if coins:
            store.add_coins(coins)
            await hub.broadcast(events.event("stats", **store.stats()))
    elif name == "confirm.reply":
        if not broker.answer(str(args.get("request_id", "")), bool(args.get("approved"))):
            await hub.broadcast(events.error("That question already expired."))
    else:
        await hub.broadcast(events.error(f"Unknown command: {name}"))


STOP_WORDS = {"stop", "cancel", "never mind", "nevermind", "stop it"}
GAME_COINS_WIN = 5
GAME_COINS_DRAW = 2


async def handle_say(text: str, spoken: bool = False) -> None:
    text = text.strip()
    if not text:
        return
    if text.lower().strip(" .!") in STOP_WORDS and brain.busy:
        await brain.cancel()
        return
    await hub.broadcast(events.event("agent.transcript", text=text, final=True))
    intent = route(text)
    if intent:
        reply = await run_intent(intent, speak=True)
        if intent.name != "memory.clear":
            memory.add(text, " ".join(x for x in (_did(intent), reply) if x))
        return
    # Not a fast-path command: hand it to the LLM brain.
    if brain.busy:
        await emit(events.message("I'm still on the last thing! Say “stop” to cancel it.", tone="confused"))
        return
    brain.start(text)


GAME_NAMES = {"tictactoe": "tic-tac-toe", "rps": "rock-paper-scissors", "memory": "memory match"}


def _did(intent: Intent) -> str:
    """What a quick command did, in brackets, so the LLM knows later."""
    a = intent.args
    return {"music.play": f"[played “{a.get('query')}” on YouTube]",
            "website.open": f"[opened {a.get('url')}]",
            "app.open": f"[opened {a.get('app')} application]",
            "game.open": f"[opened {GAME_NAMES.get(a.get('game'), 'a game')}]",
            "pomodoro.start": "[started a Pomodoro]",
            "timer.start": f"[started a {a.get('minutes')}-minute timer]"}.get(intent.name, "")


async def run_intent(intent: Intent, speak: bool) -> str | None:
    a = intent.args
    reply: str | None = None
    tone = "happy"

    if intent.name == "memory.clear":
        memory.clear()
        reply, tone = random.choice(["Clean slate! What's up?", "Okay, forgotten. Fresh start."]), "neutral"
    elif intent.name == "greet":
        # first hello of the session vs. "hey myagent" in the middle of a conversation
        reply = random.choice([f"Hey {settings.user_name}!", f"Hi {settings.user_name}!",
                               f"{settings.user_name}! I was just thinking about you."] if not memory.messages
                              else ["I'm here.", "Yes?", "Mm-hm?", "Listening!"])
    elif intent.name == "website.open":
        try:
            reply = await toolbox.open_website({"url": a["url"]})
        except (SafetyError, OSError) as exc:
            reply, tone = f"I couldn't open that website: {exc}", "confused"
    elif intent.name == "app.open":
        try:
            reply = await toolbox.open_app({"app": a["app"]})
        except (SafetyError, OSError) as exc:
            label = str(a.get("app", "application")).replace("_", " ")
            reply, tone = f"I couldn't open {label}: {exc}", "confused"
    elif intent.name == "music.play":
        result = await toolbox.play_youtube({"query": a["query"]})
        reply = random.choice(["Ooh, good choice!", "Coming right up!", "Let's dance!"]) if result.startswith("Playing") \
            else "I opened the YouTube results for you."
    elif intent.name == "game.open":
        await toolbox.start_game({"game": a["game"]})
        reply = {"tictactoe": "Tic-tac-toe! You're X. Good luck, you'll need it.",
                 "rps": "Rock, paper, scissors! Best of three?",
                 "memory": "Memory match! Find all the pairs."}[a["game"]]
    elif intent.name == "pomodoro.start":
        cfg = PomodoroConfig(
            focus_min=float(a.get("focus_min") or 25),
            short_min=float(a.get("short_min") or 5),
            long_min=float(a.get("long_min") or 15),
        )
        await timers.start_pomodoro(cfg)
        reply = random.choice([
            f"{cfg.focus_min:g} minutes of focus? Let's do this!",
            f"Glasses on. {cfg.focus_min:g} minutes, starting now.",
        ])
    elif intent.name == "timer.start":
        minutes = float(a.get("minutes") or 0)
        if minutes <= 0:
            reply, tone = "How long should the timer be?", "confused"
        else:
            await timers.start_timer(minutes, a.get("label"))
            reply = f"Timer set for {_human(minutes * 60)}."
    elif intent.name == "timer.pause":
        ok = await timers.pause()
        reply, tone = ("Paused. I'll wait right here.", "neutral") if ok else ("There's no running timer.", "confused")
    elif intent.name == "timer.resume":
        ok = await timers.resume()
        reply, tone = ("And we're back!", "happy") if ok else ("There's nothing paused.", "confused")
    elif intent.name == "timer.stop":
        ok = await timers.stop()
        reply, tone = ("Timer stopped.", "neutral") if ok else ("There's no timer to stop.", "confused")
    elif intent.name == "timer.skip":
        ok = await timers.skip()
        reply, tone = ("Skipped to the next part.", "neutral") if ok else ("There's nothing to skip.", "confused")
    elif intent.name == "timer.query":
        left = timers.remaining()
        reply, tone = (f"{_human(left)} left.", "neutral") if left is not None else ("No timer is running.", "neutral")

    if speak and reply:
        await emit(events.message(reply, tone=tone))
    return reply


def _human(seconds: float) -> str:
    s = int(round(seconds))
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    parts = []
    if h:
        parts.append(f"{h} hour{'s' if h > 1 else ''}")
    if m:
        parts.append(f"{m} minute{'s' if m > 1 else ''}")
    if s and not h:
        parts.append(f"{s} second{'s' if s > 1 else ''}")
    return " ".join(parts) or "0 seconds"
