import asyncio

import httpx
import pytest
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from myagent_agent.performance import PerformanceMiddleware, PerformanceMonitor


def test_workflow_records_successful_async_stage(caplog):
    async def go():
        monitor = PerformanceMonitor("success-1")
        monitor.start()
        with monitor.measure("Async operation"):
            await asyncio.sleep(0.001)
        monitor.finish()

    with caplog.at_level("INFO", logger="myagent.performance"):
        asyncio.run(go())

    messages = [record.getMessage() for record in caplog.records]
    assert any("Async operation:" in message and "outcome=completed" in message for message in messages)
    assert any("Total execution time:" in message and "outcome=completed" in message for message in messages)
    assert all("success-1" in message for message in messages)


def test_workflow_records_failed_stage_and_propagates_exception(caplog):
    async def go():
        monitor = PerformanceMonitor("failure-1")
        monitor.start()
        try:
            with monitor.measure("Failing async operation"):
                await asyncio.sleep(0)
                raise RuntimeError("operation failed")
        except RuntimeError:
            monitor.finish("failed")
            raise

    with caplog.at_level("INFO", logger="myagent.performance"):
        with pytest.raises(RuntimeError, match="operation failed"):
            asyncio.run(go())

    messages = [record.getMessage() for record in caplog.records]
    assert any("Failing async operation:" in message and "outcome=failed" in message for message in messages)
    assert any("Total execution time:" in message and "outcome=failed" in message for message in messages)


def test_http_middleware_header_and_streaming_request_duration(caplog):
    app = FastAPI()
    app.add_middleware(PerformanceMiddleware)

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.get("/stream")
    async def stream():
        async def chunks():
            yield b"start"
            await asyncio.sleep(0.02)
            yield b"end"

        return StreamingResponse(chunks())

    async def go():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            health_response = await client.get("/health")
            stream_response = await client.get("/stream")
        assert health_response.status_code == 200
        assert health_response.json() == {"ok": True}
        assert float(health_response.headers["X-Process-Time"]) >= 0
        assert stream_response.content == b"startend"
        assert float(stream_response.headers["X-Process-Time"]) >= 0

    with caplog.at_level("INFO", logger="myagent.performance"):
        asyncio.run(go())

    messages = [record.getMessage() for record in caplog.records]
    health_log = next(message for message in messages if "endpoint=/health" in message)
    stream_log = next(message for message in messages if "endpoint=/stream" in message)
    assert "method=GET" in health_log and "status=200" in health_log
    assert "status=200" in stream_log
    duration_ms = float(stream_log.split("duration_ms=")[1].split()[0])
    assert duration_ms >= 20


def test_http_middleware_logs_exceptions_without_swallowing_them(caplog):
    app = FastAPI()
    app.add_middleware(PerformanceMiddleware)

    @app.get("/failure")
    async def failure():
        raise RuntimeError("expected failure")

    async def go():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            with pytest.raises(RuntimeError, match="expected failure"):
                await client.get("/failure")

    with caplog.at_level("INFO", logger="myagent.performance"):
        asyncio.run(go())

    message = next(record.getMessage() for record in caplog.records if "endpoint=/failure" in record.getMessage())
    assert "status=500" in message and "outcome=failed" in message
