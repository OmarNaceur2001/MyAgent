"""Lightweight execution-time monitoring for MyAgent workflows and HTTP requests."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from contextlib import contextmanager
from typing import Iterator

from starlette.types import ASGIApp, Message, Receive, Scope, Send


log = logging.getLogger("myagent.performance")


def _duration_ms(started_at: float) -> float:
    return (time.perf_counter() - started_at) * 1000


def _error_outcome(exc: BaseException) -> str:
    return "cancelled" if isinstance(exc, asyncio.CancelledError) else "failed"


class PerformanceMonitor:
    """Records one workflow and its non-overlapping measured stages."""

    def __init__(self, execution_id: str | None = None) -> None:
        self.execution_id = execution_id or uuid.uuid4().hex[:8]
        self._started_at: float | None = None
        self._finished = False

    def start(self) -> None:
        if self._started_at is not None:
            return
        self._started_at = time.perf_counter()
        log.info("[PERFORMANCE] Workflow started execution_id=%s", self.execution_id)

    @contextmanager
    def measure(self, stage: str) -> Iterator[None]:
        started_at = time.perf_counter()
        outcome = "completed"
        try:
            yield
        except BaseException as exc:
            outcome = _error_outcome(exc)
            raise
        finally:
            log.info(
                "[PERFORMANCE] %s: %.3f ms execution_id=%s outcome=%s",
                stage,
                _duration_ms(started_at),
                self.execution_id,
                outcome,
            )

    def finish(self, outcome: str = "completed") -> None:
        if self._finished:
            return
        self.start()
        self._finished = True
        started_at = self._started_at
        duration_ms = _duration_ms(started_at if started_at is not None else time.perf_counter())
        log.info(
            "[PERFORMANCE] Total execution time: %.3f ms (%.3f seconds) "
            "execution_id=%s outcome=%s",
            duration_ms,
            duration_ms / 1000,
            self.execution_id,
            outcome,
        )


class PerformanceMiddleware:
    """ASGI middleware logging full HTTP response duration and setting a timing header."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        started_at = time.perf_counter()
        request_id = uuid.uuid4().hex[:8]
        method = scope.get("method", "UNKNOWN")
        status_code = 500
        outcome = "completed"

        async def send_with_timing(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                headers = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() != b"x-process-time"
                ]
                headers.append(
                    (b"x-process-time", f"{_duration_ms(started_at):.3f}".encode("ascii"))
                )
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_timing)
        except BaseException as exc:
            outcome = _error_outcome(exc)
            raise
        finally:
            route = scope.get("route")
            endpoint = getattr(route, "path", "unmatched")
            log.info(
                "[PERFORMANCE] HTTP request method=%s endpoint=%s status=%s "
                "duration_ms=%.3f request_id=%s outcome=%s",
                method,
                endpoint,
                status_code,
                _duration_ms(started_at),
                request_id,
                outcome,
            )
