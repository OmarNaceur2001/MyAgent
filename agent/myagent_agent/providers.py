"""OpenAI-compatible cloud LLM provider for MyAgent."""
from __future__ import annotations

import json
import time
from typing import Any

import httpx

from .llm import LLMUnavailable, OllamaLLM, Reply, ToolCall, parse_message


class OpenAICompatibleLLM:
    def __init__(self, *, provider_name: str, base_url: str, model: str, api_key: str,
                 extra_headers: dict[str, str] | None = None,
                 transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.provider_name = provider_name
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.extra_headers = extra_headers or {}
        self.transport = transport

    def _client(self, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=timeout, headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            **self.extra_headers,
        }, transport=self.transport)

    def _payload(self, messages: list[dict], tools: list[dict], stream: bool) -> dict:
        payload: dict[str, Any] = {
            "model": self.model, "messages": messages,
            "temperature": 0.6, "max_tokens": 1024, "stream": stream,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        if stream:
            payload["stream_options"] = {"include_usage": True}
        return payload

    async def available(self) -> bool:
        if not self.api_key:
            return False
        try:
            async with self._client(8) as client:
                response = await client.get(f"{self.base_url}/models")
            if response.status_code >= 400:
                return False
            return any(m.get("id") == self.model for m in response.json().get("data", []))
        except (httpx.HTTPError, ValueError, TypeError):
            return False

    async def chat(self, messages: list[dict], tools: list[dict]) -> Reply:
        if not self.api_key:
            raise LLMUnavailable(f"{self.provider_name} API key is not configured.")
        try:
            async with self._client(180) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    json=self._payload(messages, tools, False),
                )
        except httpx.HTTPError as exc:
            raise LLMUnavailable(f"Could not reach {self.provider_name}. Check its status and your connection.") from exc
        if response.status_code >= 400:
            raise LLMUnavailable(f"{self.provider_name} returned HTTP {response.status_code}. Check model access and rate limits.")
        try:
            data = response.json()
            reply = parse_message(data["choices"][0]["message"])
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise LLMUnavailable(f"{self.provider_name} returned an invalid chat response.") from exc
        usage = data.get("usage") or {}
        reply.prompt_tokens = usage.get("prompt_tokens")
        reply.completion_tokens = usage.get("completion_tokens")
        return reply

    async def chat_with_metrics(self, messages: list[dict], tools: list[dict]) -> tuple[Reply, float | None]:
        if not self.api_key:
            raise LLMUnavailable(f"{self.provider_name} API key is not configured.")
        started = time.perf_counter()
        first_token_at = None
        content_parts: list[str] = []
        tool_parts: dict[int, dict[str, str]] = {}
        prompt_tokens = completion_tokens = None
        try:
            async with self._client(180) as client:
                async with client.stream(
                    "POST", f"{self.base_url}/chat/completions",
                    json=self._payload(messages, tools, True),
                ) as response:
                    if response.status_code >= 400:
                        raise LLMUnavailable(f"{self.provider_name} streaming returned HTTP {response.status_code}.")
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        try:
                            chunk = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        usage = chunk.get("usage") or {}
                        prompt_tokens = usage.get("prompt_tokens", prompt_tokens)
                        completion_tokens = usage.get("completion_tokens", completion_tokens)
                        for choice in chunk.get("choices") or []:
                            delta = choice.get("delta") or {}
                            piece = delta.get("content") or ""
                            if piece:
                                if first_token_at is None:
                                    first_token_at = time.perf_counter()
                                content_parts.append(piece)
                            for item in delta.get("tool_calls") or []:
                                index = int(item.get("index", 0))
                                current = tool_parts.setdefault(index, {"name": "", "arguments": ""})
                                function = item.get("function") or {}
                                name_piece = function.get("name") or ""
                                args_piece = function.get("arguments") or ""
                                if name_piece or args_piece:
                                    if first_token_at is None:
                                        first_token_at = time.perf_counter()
                                current["name"] += name_piece
                                current["arguments"] += args_piece
        except LLMUnavailable:
            raise
        except httpx.HTTPError as exc:
            raise LLMUnavailable(f"Could not stream from {self.provider_name}. Check its status and your connection.") from exc

        calls = []
        for index in sorted(tool_parts):
            part = tool_parts[index]
            try:
                arguments = json.loads(part["arguments"]) if part["arguments"] else {}
            except json.JSONDecodeError:
                arguments = {}
            calls.append(ToolCall(part["name"], arguments if isinstance(arguments, dict) else {}))
        reply = Reply(content="".join(content_parts).strip(), tool_calls=calls,
                      prompt_tokens=prompt_tokens, completion_tokens=completion_tokens)
        ttft = (first_token_at - started) * 1000 if first_token_at is not None else None
        return reply, ttft


def create_llm(settings):
    provider = settings.llm_provider
    if provider == "ollama":
        return OllamaLLM(settings.ollama_url, settings.model, settings.keep_alive)
    if provider == "openrouter":
        if not settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required for MYAGENT_LLM_PROVIDER=openrouter.")
        return OpenAICompatibleLLM(
            provider_name="OpenRouter", base_url=settings.openrouter_base_url,
            model=settings.openrouter_model, api_key=settings.openrouter_api_key,
            extra_headers={"HTTP-Referer": "https://github.com/OmarNaceur2001/MyAgent",
                           "X-Title": "MyAgent"},
        )
    if provider == "groq":
        if not settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is required for MYAGENT_LLM_PROVIDER=groq.")
        return OpenAICompatibleLLM(
            provider_name="Groq", base_url=settings.groq_base_url,
            model=settings.groq_model, api_key=settings.groq_api_key,
        )
    raise RuntimeError("MYAGENT_LLM_PROVIDER must be one of: ollama, openrouter, groq.")


def build_benchmark_registry(settings) -> dict[str, Any]:
    models: dict[str, Any] = {
        "ollama": OllamaLLM(settings.ollama_url, settings.model, settings.keep_alive)
    }
    if settings.groq_api_key:
        models["groq"] = OpenAICompatibleLLM(
            provider_name="Groq", base_url=settings.groq_base_url,
            model=settings.groq_model, api_key=settings.groq_api_key,
        )
    if settings.openrouter_api_key:
        models["openrouter"] = OpenAICompatibleLLM(
            provider_name="OpenRouter", base_url=settings.openrouter_base_url,
            model=settings.openrouter_model, api_key=settings.openrouter_api_key,
            extra_headers={"HTTP-Referer": "https://github.com/OmarNaceur2001/MyAgent",
                           "X-Title": "MyAgent benchmark"},
        )
    return models
