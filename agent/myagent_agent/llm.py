"""Ollama client (local LLM with tool calling).

Kept behind a tiny interface (`chat(messages, tools) -> Reply`) so the brain
can be tested with a fake model, and the model can be swapped later.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Protocol

import httpx


@dataclass
class ToolCall:
    name: str
    arguments: dict


@dataclass
class Reply:
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)


class LLM(Protocol):
    async def chat(self, messages: list[dict], tools: list[dict]) -> Reply: ...


class LLMUnavailable(Exception):
    pass


class OllamaLLM:
    def __init__(self, url: str, model: str, keep_alive: str = "2m"):
        self.url = url.rstrip("/")
        self.model = model
        self.keep_alive = keep_alive

    async def available(self) -> bool:
        """Ollama is running AND the model is downloaded."""
        try:
            async with httpx.AsyncClient(timeout=2) as c:
                r = await c.get(f"{self.url}/api/tags")
                names = {m.get("name", "") for m in r.json().get("models", [])}
                return self.model in names or f"{self.model}:latest" in names
        except Exception:
            return False

    async def chat(self, messages: list[dict], tools: list[dict]) -> Reply:
        body = {
            "model": self.model,
            "messages": messages,
            "tools": tools,
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {"temperature": 0.6, "num_ctx": 8192},
        }
        try:
            async with httpx.AsyncClient(timeout=180) as c:
                r = await c.post(f"{self.url}/api/chat", json=body)
        except httpx.HTTPError as exc:
            raise LLMUnavailable(f"Can't reach Ollama at {self.url}. Is it running?") from exc
        if r.status_code == 404:
            raise LLMUnavailable(f"Model '{self.model}' isn't downloaded. Run: ollama pull {self.model}")
        r.raise_for_status()
        msg = r.json().get("message", {})
        return parse_message(msg)


def parse_message(msg: dict) -> Reply:
    calls = []
    for tc in msg.get("tool_calls") or []:
        fn = tc.get("function", {})
        args = fn.get("arguments") or {}
        if isinstance(args, str):
            args = _loads(args) or {}
        calls.append(ToolCall(fn.get("name", ""), args))
    content = (msg.get("content") or "").strip()
    # Small models sometimes write the tool call as JSON text instead of using
    # the tool_calls field. Recover it instead of showing JSON to the user.
    if not calls and content:
        data = _loads(_strip_fences(content))
        if isinstance(data, dict) and "name" in data and isinstance(data.get("arguments", data.get("parameters")), dict):
            calls.append(ToolCall(data["name"], data.get("arguments", data.get("parameters"))))
            content = ""
    return Reply(content=content, tool_calls=calls)


def _strip_fences(text: str) -> str:
    m = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    return m.group(1) if m else text


def _loads(text: str):
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
