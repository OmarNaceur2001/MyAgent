"""Short-term memory: what was said during this session, nothing more.

- Every exchange is kept: LLM chats AND quick commands (songs, games, timers),
  plus small notes like game results, so the brain always knows where the
  conversation is.
- Saved to data/session.json so you can look at it, and wiped every time MyAgent
  starts (or when you say "start over"). Nothing survives a restart.
"""

from __future__ import annotations

import json
from pathlib import Path

MAX_MESSAGES = 24  # ~12 exchanges: plenty for a conversation, small for a 3B model


class ShortMemory:
    def __init__(self, path: Path, max_messages: int = MAX_MESSAGES):
        self.path = path
        self.max = max_messages
        self.messages: list[dict] = []
        self.clear()  # fresh start every launch

    def add(self, user: str | None, assistant: str | None) -> None:
        if user:
            self.messages.append({"role": "user", "content": user})
        if assistant:
            self.messages.append({"role": "assistant", "content": assistant})
        self._trim_and_save()

    def note(self, text: str) -> None:
        """Something that happened without words, e.g. 'Omar won tic-tac-toe'."""
        self.messages.append({"role": "user", "content": f"[{text}]"})
        self._trim_and_save()

    def recent(self) -> list[dict]:
        return list(self.messages)

    def clear(self) -> None:
        self.messages = []
        self._save()

    def _trim_and_save(self) -> None:
        self.messages = self.messages[-self.max:]
        # never start the history with an orphan assistant reply
        while self.messages and self.messages[0]["role"] == "assistant":
            self.messages.pop(0)
        self._save()

    def _save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self.messages, indent=1, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass  # memory is a nice-to-have; never crash over it
