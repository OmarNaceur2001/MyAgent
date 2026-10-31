"""Timer + Pomodoro service.

One active timer at a time. A Pomodoro is a chain of phases:
focus → short break → focus → ... → long break after N focus sessions.

The service never ticks every second. It schedules one asyncio wake-up for
the end of the current phase and tells the UI `ends_at`; the UI counts down.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import asdict, dataclass
from typing import Awaitable, Callable, Literal

from . import events
from .store import Store

Kind = Literal["focus", "short_break", "long_break", "timer"]
Emit = Callable[[dict], Awaitable[None]]

LABELS: dict[str, str] = {"focus": "Focus", "short_break": "Short break", "long_break": "Long break", "timer": "Timer"}


@dataclass
class PomodoroConfig:
    focus_min: float = 25
    short_min: float = 5
    long_min: float = 15
    cycles_before_long: int = 4


@dataclass
class Timer:
    id: str
    kind: Kind
    label: str
    duration_s: int
    remaining_s: int
    status: Literal["running", "paused"]
    ends_at: int | None  # wall clock, ms; None while paused
    cycle: int = 0  # which focus session (1-based) in a Pomodoro, 0 for plain timers
    cycles_before_long: int = 4


class TimerService:
    def __init__(self, emit: Emit, store: Store):
        self._emit = emit
        self._store = store
        self._timer: Timer | None = None
        self._pomodoro: PomodoroConfig | None = None
        self._task: asyncio.Task | None = None
        self._deadline: float | None = None  # monotonic seconds

    # ---------- public API ----------
    @property
    def current(self) -> Timer | None:
        return self._timer

    async def start_timer(self, minutes: float, label: str | None = None) -> None:
        self._pomodoro = None
        await self._start_phase("timer", minutes, label or f"{_fmt_minutes(minutes)} timer", cycle=0)

    async def start_pomodoro(self, cfg: PomodoroConfig | None = None) -> None:
        self._pomodoro = cfg or PomodoroConfig()
        await self._start_phase("focus", self._pomodoro.focus_min, cycle=1)

    async def pause(self) -> bool:
        t = self._timer
        if not t or t.status != "running":
            return False
        self._cancel_wakeup()
        t.remaining_s = max(0, round(self._deadline - time.monotonic())) if self._deadline else t.remaining_s
        t.status, t.ends_at, self._deadline = "paused", None, None
        await self._publish()
        return True

    async def resume(self) -> bool:
        t = self._timer
        if not t or t.status != "paused":
            return False
        self._run(t.remaining_s)
        await self._publish()
        return True

    async def stop(self) -> bool:
        if not self._timer:
            return False
        self._cancel_wakeup()
        self._timer, self._pomodoro, self._deadline = None, None, None
        await self._publish()
        return True

    async def skip(self) -> bool:
        """End the current phase now and move to the next one (no reward)."""
        if not self._timer:
            return False
        self._cancel_wakeup()
        await self._advance(completed=False)
        return True

    def remaining(self) -> int | None:
        t = self._timer
        if not t:
            return None
        if t.status == "running" and self._deadline:
            return max(0, round(self._deadline - time.monotonic()))
        return t.remaining_s

    def state_event(self) -> dict:
        t = self._timer
        if t and t.status == "running":
            t.remaining_s = self.remaining() or 0
        return events.event("timer.state", timer=asdict(t) if t else None)

    # ---------- internals ----------
    async def _start_phase(self, kind: Kind, minutes: float, label: str | None = None, cycle: int = 0) -> None:
        self._cancel_wakeup()
        seconds = max(1, round(minutes * 60))
        self._timer = Timer(
            id=uuid.uuid4().hex[:8],
            kind=kind,
            label=label or LABELS[kind],
            duration_s=seconds,
            remaining_s=seconds,
            status="running",
            ends_at=None,
            cycle=cycle,
            cycles_before_long=self._pomodoro.cycles_before_long if self._pomodoro else 0,
        )
        self._run(seconds)
        await self._publish()

    def _run(self, seconds: int) -> None:
        t = self._timer
        assert t
        self._deadline = time.monotonic() + seconds
        t.status = "running"
        t.ends_at = int((time.time() + seconds) * 1000)
        self._task = asyncio.create_task(self._wait(seconds, t.id))

    async def _wait(self, seconds: float, timer_id: str) -> None:
        try:
            await asyncio.sleep(seconds)
        except asyncio.CancelledError:
            return
        if self._timer and self._timer.id == timer_id:
            # Detach first: _advance starts the next phase, which cancels
            # self._task. If that were still this task, it would cancel itself
            # mid-transition and the Pomodoro chain would stop.
            self._task = None
            await self._advance(completed=True)

    async def _advance(self, completed: bool) -> None:
        t = self._timer
        if not t:
            return
        next_kind: Kind | None = None
        if self._pomodoro:
            if t.kind == "focus":
                next_kind = "long_break" if t.cycle % self._pomodoro.cycles_before_long == 0 else "short_break"
            else:
                next_kind = "focus"

        if completed:
            self._store.record_session(t.kind, t.duration_s)
            await self._emit(events.event("timer.done", kind=t.kind, label=t.label, next_kind=next_kind))
            if t.kind == "focus":
                await self._emit(events.event("stats", **self._store.stats()))

        if self._pomodoro and next_kind:
            cfg = self._pomodoro
            if next_kind == "focus":
                await self._start_phase("focus", cfg.focus_min, cycle=t.cycle + 1)
            else:
                minutes = cfg.long_min if next_kind == "long_break" else cfg.short_min
                await self._start_phase(next_kind, minutes, cycle=t.cycle)
        else:
            self._timer, self._deadline = None, None
            await self._publish()

    def _cancel_wakeup(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
        self._task = None

    async def _publish(self) -> None:
        await self._emit(self.state_event())


def _fmt_minutes(m: float) -> str:
    return f"{int(m)}-minute" if m == int(m) else f"{m:g}-minute"
