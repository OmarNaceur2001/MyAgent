"""The agent's hands: every action MyAgent can take on the computer.

Deliberately small. MyAgent may ONLY:
  • search the web
  • open a website
  • play something on YouTube
  • start timers and games (inside MyAgent itself)
  • list/read files in explicitly granted folders; create/replace/delete files only
    in write-enabled folders and only after the user confirms the exact action
There are still no shell, app-launch, OS-settings, credential-store, or whole-drive tools.
"""

from __future__ import annotations

import json
import re
import webbrowser
from dataclasses import dataclass
from typing import Any, Awaitable, Callable
from urllib.parse import quote_plus, urlparse

import httpx

from . import events
from .resources import ResourcePermissions
from .safety import SafetyError

Handler = Callable[[dict], Awaitable[str]]
Emit = Callable[[dict], Awaitable[None]]

GAMES = {"tictactoe": "Tic-tac-toe", "rps": "Rock, paper, scissors", "memory": "Memory match"}


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    handler: Handler
    risk: str = "safe"  # "safe" | "confirm"
    confirm: Callable[[dict], str] | None = None
    title: Callable[[dict], str] | None = None  # short label for the step list

    def schema(self) -> dict:
        return {"type": "function", "function": {"name": self.name, "description": self.description, "parameters": self.parameters}}


def _obj(props: dict, required: list[str]) -> dict:
    return {"type": "object", "properties": props, "required": required}


S = {"type": "string"}


class Toolbox:
    def __init__(self, timers: Any = None, emit: Emit | None = None,
                 opener: Callable[[str], Any] | None = None,
                 youtube: Callable[[str], Awaitable[tuple[str, str] | None]] | None = None,
                 resources: ResourcePermissions | None = None):
        self.timers = timers
        self.emit = emit
        self._open = opener or webbrowser.open
        self._find_video = youtube or find_youtube_video
        self.resources = resources
        self.tools: dict[str, Tool] = {t.name: t for t in self._build()}

    def schemas(self) -> list[dict]:
        return [t.schema() for t in self.tools.values()]

    def _build(self) -> list[Tool]:
        return [
            Tool(
                "play_youtube",
                "Play a song or video on YouTube. Use for 'play <song>', 'put on <artist>', 'I want to hear …'.",
                _obj({"query": {**S, "description": "Song, artist or video to play, e.g. 'lofi hip hop' or 'Bohemian Rhapsody Queen'"}}, ["query"]),
                self.play_youtube,
                title=lambda a: f"Play “{a.get('query', '')}” on YouTube",
            ),
            Tool(
                "web_search",
                "Search the web (or YouTube with site='youtube') and show the results in the browser.",
                _obj({"query": S, "site": {**S, "enum": ["web", "youtube"]}}, ["query"]),
                self.web_search,
                title=lambda a: f"Search {'YouTube' if a.get('site') == 'youtube' else 'the web'} for “{a.get('query')}”",
            ),
            Tool(
                "open_website",
                "Open a website in the browser. Accepts a URL or a site name like 'youtube.com'.",
                _obj({"url": S}, ["url"]),
                self.open_website,
                title=lambda a: f"Open {a.get('url')}",
            ),
            Tool(
                "start_game",
                "Start a game with the user inside MyAgent: 'tictactoe', 'rps' (rock paper scissors) or 'memory'.",
                _obj({"game": {**S, "enum": list(GAMES)}}, ["game"]),
                self.start_game,
                title=lambda a: f"Start {GAMES.get(a.get('game', ''), 'a game')}",
            ),
            Tool(
                "start_timer",
                "Start a countdown timer.",
                _obj({"minutes": {"type": "number"}, "label": S}, ["minutes"]),
                self.start_timer,
                title=lambda a: f"Start a {a.get('minutes')}-minute timer",
            ),
            Tool(
                "start_pomodoro",
                "Start a Pomodoro focus session (default 25 min focus, 5 min breaks).",
                _obj({"focus_minutes": {"type": "number"}}, []),
                self.start_pomodoro,
                title=lambda a: "Start a Pomodoro",
            ),

            Tool(
                "list_folder",
                "List the immediate contents of a folder the user explicitly granted to MyAgent. Never scan recursively.",
                _obj({"path": {**S, "description": "Absolute folder path inside a granted folder"}}, ["path"]),
                self.list_folder,
                title=lambda a: f"List folder {a.get('path', '')}",
            ),
            Tool(
                "read_file",
                "Read a UTF-8 text file inside a folder with read permission. Do not read credential or secret files.",
                _obj({"path": {**S, "description": "Absolute path to a text file inside a granted folder"}}, ["path"]),
                self.read_file,
                title=lambda a: f"Read {a.get('path', '')}",
            ),
            Tool(
                "write_file",
                "Create or replace a UTF-8 text file inside a folder with write permission. Always explain the change and wait for confirmation.",
                _obj({"path": S, "content": S, "replace": {"type": "boolean"}}, ["path", "content"]),
                self.write_file,
                risk="confirm",
                confirm=lambda a: (
                    f"Replace the contents of {a.get('path')}?"
                    if a.get("replace") else f"Create the file {a.get('path')}?"
                ),
                title=lambda a: f"Write {a.get('path', '')}",
            ),
            Tool(
                "delete_file",
                "Delete one regular file inside a folder with write permission. Folders and symbolic links cannot be deleted.",
                _obj({"path": S}, ["path"]),
                self.delete_file,
                risk="confirm",
                confirm=lambda a: f"Delete the file {a.get('path')}? This cannot be undone.",
                title=lambda a: f"Delete {a.get('path', '')}",
            ),
        ]

    # --------------------------------------------------------------- handlers
    async def play_youtube(self, a: dict) -> str:
        query = str(a.get("query", "")).strip()
        if not query:
            raise SafetyError("What should I play?")
        found = await self._find_video(query)
        if found:
            video_id, title = found
            self._open(f"https://www.youtube.com/watch?v={video_id}")
            if self.emit:
                await self.emit(events.event("music.playing", title=title or query, query=query))
            return f"Playing “{title or query}” on YouTube"
        # couldn't resolve a video: show the search page instead of failing
        self._open(f"https://www.youtube.com/results?search_query={quote_plus(query)}")
        return f"I couldn't pick a video, so I opened YouTube results for '{query}'"

    async def web_search(self, a: dict) -> str:
        q = quote_plus(str(a["query"]))
        url = (
            f"https://www.youtube.com/results?search_query={q}"
            if a.get("site") == "youtube"
            else f"https://www.google.com/search?q={q}"
        )
        self._open(url)
        return f"Searched for '{a['query']}'"

    async def open_website(self, a: dict) -> str:
        url = safe_url(str(a["url"]))
        self._open(url)
        return f"Opened {url}"

    async def start_game(self, a: dict) -> str:
        game = str(a.get("game", ""))
        if game not in GAMES:
            raise SafetyError(f"I don't know a game called '{game}'.")
        if self.emit:
            await self.emit(events.event("game.open", game=game))
        return f"Started {GAMES[game]}"

    async def start_timer(self, a: dict) -> str:
        await self.timers.start_timer(float(a["minutes"]), a.get("label"))
        return f"Timer started for {a['minutes']} minutes"

    async def start_pomodoro(self, a: dict) -> str:
        from .timer import PomodoroConfig

        await self.timers.start_pomodoro(PomodoroConfig(focus_min=float(a.get("focus_minutes") or 25)))
        return "Pomodoro started"


    def _resource_manager(self) -> ResourcePermissions:
        if self.resources is None:
            raise SafetyError("Local folder access is not configured. Grant a folder in Talk → Local folder access.")
        return self.resources

    async def list_folder(self, a: dict) -> str:
        return self._resource_manager().list_folder(str(a.get("path", "")))

    async def read_file(self, a: dict) -> str:
        return self._resource_manager().read_file(str(a.get("path", "")))

    async def write_file(self, a: dict) -> str:
        return self._resource_manager().write_file(
            str(a.get("path", "")),
            str(a.get("content", "")),
            replace=a.get("replace") is True,
        )

    async def delete_file(self, a: dict) -> str:
        return self._resource_manager().delete_file(str(a.get("path", "")))


def safe_url(raw: str) -> str:
    """Only http(s) links to real hosts. No file://, javascript:, local network tricks."""
    url = raw.strip().strip('"\'')
    if "://" not in url:
        url = "https://" + url
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc or "." not in p.netloc.split(":")[0]:
        raise SafetyError(f"I can only open normal websites, not '{raw}'.")
    host = p.hostname or ""
    if host in ("localhost",) or host.startswith(("127.", "10.", "192.168.", "169.254.")):
        raise SafetyError("I don't open local network addresses.")
    return url


_VIDEO = re.compile(r'"videoRenderer":\{"videoId":"([\w-]{11})"')
_TITLE = re.compile(r'"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"')


async def find_youtube_video(query: str) -> tuple[str, str] | None:
    """First real video for a search, read from YouTube's results page (no API key)."""
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as c:
            r = await c.get(
                "https://www.youtube.com/results",
                params={"search_query": query},
                headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.8"},
            )
        return parse_first_video(r.text)
    except httpx.HTTPError:
        return None


def parse_first_video(html: str) -> tuple[str, str] | None:
    m = _VIDEO.search(html)
    if not m:
        return None
    t = _TITLE.search(html, m.end(), m.end() + 4000)
    title = ""
    if t:
        try:
            title = json.loads(f'"{t.group(1)}"')
        except json.JSONDecodeError:
            title = t.group(1)
    return m.group(1), title
