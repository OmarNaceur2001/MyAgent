"""User preferences that survive restarts (agent/data/prefs.json)."""

from __future__ import annotations

import json
import logging
from pathlib import Path

log = logging.getLogger("myagent.prefs")

DEFAULTS = {"wake_word": True, "speak_replies": True}


class Prefs:
    def __init__(self, path: Path):
        self.path = path
        self.values = dict(DEFAULTS)
        try:
            saved = json.loads(path.read_text(encoding="utf-8"))
            self.values.update({k: v for k, v in saved.items() if k in DEFAULTS and isinstance(v, type(DEFAULTS[k]))})
        except (OSError, json.JSONDecodeError):
            pass

    def set(self, key: str, value) -> bool:
        if key not in DEFAULTS or not isinstance(value, type(DEFAULTS[key])):
            return False
        self.values[key] = value
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self.values, indent=2), encoding="utf-8")
        except OSError as exc:
            log.warning("could not save prefs: %s", exc)
        return True
