"""Event builders: the only place that shapes messages sent to the UI.

Mirrors docs/events.md and app/src/lib/events.ts. If you add an event,
update all three.
"""

from __future__ import annotations

from typing import Any, Literal

AgentState = Literal["idle", "listening", "thinking", "working", "speaking", "waiting_confirmation", "error"]
Tone = Literal["neutral", "happy", "confused", "sad"]


def event(type_: str, **payload: Any) -> dict[str, Any]:
    return {"type": type_, "payload": payload}


def hello(version: str, features: dict[str, bool]) -> dict[str, Any]:
    return event("hello", version=version, features=features)


def status(state: AgentState, detail: str | None = None) -> dict[str, Any]:
    return event("agent.status", state=state, detail=detail)


def message(text: str, tone: Tone = "neutral") -> dict[str, Any]:
    return event("agent.message", text=text, tone=tone)


def error(text: str) -> dict[str, Any]:
    return event("error", message=text)
