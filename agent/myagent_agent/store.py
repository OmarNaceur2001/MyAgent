"""Small SQLite store: focus sessions and coins.

One file (agent/data/myagent.db), no server, no setup.
"""

from __future__ import annotations

import sqlite3
import time
from datetime import datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,            -- focus | short_break | long_break | timer
    seconds INTEGER NOT NULL,      -- time actually completed
    finished_at REAL NOT NULL      -- unix seconds
);
CREATE TABLE IF NOT EXISTS wallet (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    coins INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO wallet (id, coins) VALUES (1, 0);
"""

COINS_PER_FOCUS = 10


class Store:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.executescript(SCHEMA)
        self.db.commit()

    def record_session(self, kind: str, seconds: int) -> None:
        self.db.execute(
            "INSERT INTO sessions (kind, seconds, finished_at) VALUES (?, ?, ?)",
            (kind, seconds, time.time()),
        )
        if kind == "focus":
            self.db.execute("UPDATE wallet SET coins = coins + ? WHERE id = 1", (COINS_PER_FOCUS,))
        self.db.commit()

    def add_coins(self, n: int) -> None:
        self.db.execute("UPDATE wallet SET coins = coins + ? WHERE id = 1", (max(0, int(n)),))
        self.db.commit()

    def stats(self) -> dict[str, int]:
        start_of_day = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        row = self.db.execute(
            "SELECT COUNT(*), COALESCE(SUM(seconds), 0) FROM sessions WHERE kind = 'focus' AND finished_at >= ?",
            (start_of_day,),
        ).fetchone()
        coins = self.db.execute("SELECT coins FROM wallet WHERE id = 1").fetchone()[0]
        return {"sessions_today": row[0], "focus_minutes_today": row[1] // 60, "coins": coins}
