"""Fast intent router.

Simple, unambiguous commands ("start a 25 minute pomodoro", "pause") are
matched here and run instantly, without waking the LLM. Anything it doesn't
recognise returns None and will go to the LLM planner (not built yet).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

WORD_NUMBERS = {
    "one": 1, "a": 1, "an": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "fifteen": 15, "twenty": 20, "twenty five": 25,
    "twenty-five": 25, "thirty": 30, "forty": 40, "forty five": 45, "forty-five": 45,
    "fifty": 50, "sixty": 60, "half an": 0.5, "half a": 0.5,
}


@dataclass
class Intent:
    name: str
    args: dict = field(default_factory=dict)


_NUM = r"\b(\d+(?:\.\d+)?|" + "|".join(sorted(map(re.escape, WORD_NUMBERS), key=len, reverse=True)) + r")"
_DURATION = re.compile(_NUM + r"[\s-]*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b")


def _to_number(token: str) -> float:
    return float(token) if token[0].isdigit() else float(WORD_NUMBERS[token])


def parse_minutes(text: str) -> float | None:
    """'25 minutes' → 25, 'an hour' → 60, '90 seconds' → 1.5. Sums '1 hour 30 minutes'."""
    total, found = 0.0, False
    for num, unit in _DURATION.findall(text):
        n = _to_number(num)
        u = unit[0]
        if u == "h":
            total += n * 60
        elif u == "s":
            total += n / 60
        else:
            total += n
        found = True
    return total if found else None


GAME_WORDS = {
    "tictactoe": r"tic[\s-]?tac[\s-]?toe|noughts and crosses|x and o",
    "rps": r"rock[\s,-]*paper[\s,-]*scissors?",
    "memory": r"memory( game| match)?|matching( game)?|pairs",
}


def _game(text: str) -> str | None:
    if not re.search(r"\b(play|game|start|let'?s)\b", text):
        return None
    for game, pattern in GAME_WORDS.items():
        if re.search(pattern, text):
            return game
    return None


def route(raw: str) -> Intent | None:
    text = " ".join(raw.lower().strip().rstrip(".!?").split())
    if re.fullmatch(r"(hey|hi|hello|ok|okay)?\s*(?:my\s*agent|myagent|mimo)[,!]?", text):
        return Intent("greet")
    text = re.sub(r"^(hey |hi |ok |okay )?(?:my\s*agent|myagent|mimo)[,!]?\s*", "", text)
    if not text:
        return None

    # Open a website directly, without asking Ollama to infer the action.
    # Recognised aliases keep common requests natural; explicit domains work too.
    site_aliases = {
        "google": "https://www.google.com",
        "youtube": "https://www.youtube.com",
        "github": "https://github.com",
        "chatgpt": "https://chatgpt.com",
        "gmail": "https://mail.google.com",
        "google maps": "https://maps.google.com",
        "stackoverflow": "https://stackoverflow.com",
        "reddit": "https://www.reddit.com",
        "wikipedia": "https://www.wikipedia.org",
        "facebook": "https://www.facebook.com",
        "instagram": "https://www.instagram.com",
        "x": "https://x.com",
        "twitter": "https://x.com",
        "linkedin": "https://www.linkedin.com",
    }
    site_match = re.match(r"^(?:please )?(?:open|visit|go to|navigate to)\\s+(?:the )?(?:website )?(.+)$", text)
    if site_match:
        target = site_match.group(1).strip().rstrip(" .!?")
        normal = target.removeprefix("www.").lower()
        if normal in site_aliases:
            return Intent("website.open", {"url": site_aliases[normal]})
        if re.fullmatch(r"[a-z0-9-]+(?:\\.[a-z0-9-]+)+(?:/[^\\s]*)?", target, re.IGNORECASE):
            return Intent("website.open", {"url": target})
        # Do not guess arbitrary app names (e.g. "open Chrome") as websites.

    # wipe the short-term memory of this conversation
    if re.fullmatch(r"(let'?s )?(start over|start fresh|new conversation|forget (that|everything|what i said))", text):
        return Intent("memory.clear")

    # greetings ("hey myagent" was stripped above, so a bare greeting is left)
    if re.fullmatch(r"(hey|hi|hello|yo|good (morning|afternoon|evening))( there)?( (?:my\s*agent|myagent|mimo))?", text) or text in ("myagent", "my agent", "mimo"):
        return Intent("greet")

    # games come before music: "let's play tic-tac-toe" is a game, not a song
    game = _game(text)
    if game:
        return Intent("game.open", {"game": game})
    if re.search(r"\b(play a game|play something with me|i'?m bored|let'?s play)\b$", text) or text in ("play a game", "let's play"):
        return Intent("game.open", {"game": "tictactoe"})
    m = re.match(r"^(?:can you |could you |please )?(?:play|put on)\s+(?:me\s+)?(?:some\s+)?(?:the song\s+)?(.+?)(?:\s+on youtube)?(?: please)?$", text)
    if m and not re.search(r"\b(game|with me|something)\b", m.group(1)):
        return Intent("music.play", {"query": m.group(1)})

    minutes = parse_minutes(text)

    if re.search(r"\b(pomodoro|focus session|study session|focus mode)\b", text) or (
        re.search(r"\b(focus|study|studying)\b", text) and minutes and "timer" not in text
    ):
        return Intent("pomodoro.start", {"focus_min": minutes} if minutes else {})

    if re.search(r"\b(pause|hold)\b", text) and re.search(r"\b(timer|pomodoro|session|it|focus)\b", text + " it"):
        return Intent("timer.pause")
    if re.search(r"\b(resume|continue|unpause)\b", text):
        return Intent("timer.resume")
    if re.search(r"\b(stop|cancel|end)\b.*\b(timer|pomodoro|session|focus)\b", text):
        return Intent("timer.stop")
    if re.search(r"\b(skip)\b", text):
        return Intent("timer.skip")
    if re.search(r"\b(how (much|long)|time left|remaining)\b", text):
        return Intent("timer.query")

    if re.search(r"\bbreak\b", text) and minutes:
        return Intent("timer.start", {"minutes": minutes, "label": "Break"})
    if minutes and re.search(r"\b(timer|remind|countdown|alarm)\b", text):
        return Intent("timer.start", {"minutes": minutes})

    return None
