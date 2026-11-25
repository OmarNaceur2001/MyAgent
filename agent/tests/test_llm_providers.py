import asyncio
import json

import httpx

from myagent_agent.providers import OpenAICompatibleLLM


def test_openai_compatible_chat_parses_usage_and_tool_calls():
    def handler(request):
        assert request.headers["Authorization"] == "Bearer unit-test-secret"
        body = json.loads(request.content)
        assert body["model"] == "test/model"
        return httpx.Response(200, json={
            "choices": [{
                "message": {
                    "content": "",
                    "tool_calls": [{
                        "type": "function",
                        "function": {
                            "name": "record_task_summary",
                            "arguments": "{\"summary\":\"validate task title\"}"
                        }
                    }]
                }
            }],
            "usage": {"prompt_tokens": 31, "completion_tokens": 8}
        })

    client = OpenAICompatibleLLM(
        provider_name="TestProvider",
        base_url="https://provider.example/v1",
        model="test/model",
        api_key="unit-test-secret",
        transport=httpx.MockTransport(handler),
    )
    reply = asyncio.run(client.chat([{"role": "user", "content": "test"}], []))
    assert reply.tool_calls[0].name == "record_task_summary"
    assert reply.tool_calls[0].arguments == {"summary": "validate task title"}
    assert reply.prompt_tokens == 31
    assert reply.completion_tokens == 8


def test_openai_compatible_stream_records_ttft_and_usage():
    def handler(request):
        payload = (
            'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'
            'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3}}\n\n'
            'data: [DONE]\n\n'
        )
        return httpx.Response(200, content=payload.encode("utf-8"))

    client = OpenAICompatibleLLM(
        provider_name="TestProvider",
        base_url="https://provider.example/v1",
        model="test/model",
        api_key="unit-test-secret",
        transport=httpx.MockTransport(handler),
    )
    reply, ttft_ms = asyncio.run(
        client.chat_with_metrics([{"role": "user", "content": "test"}], [])
    )
    assert reply.content == "hello"
    assert reply.prompt_tokens == 12
    assert reply.completion_tokens == 3
    assert ttft_ms is not None and ttft_ms >= 0


def test_openai_compatible_availability_checks_model_listing():
    def handler(request):
        return httpx.Response(200, json={"data": [{"id": "test/model"}]})

    client = OpenAICompatibleLLM(
        provider_name="TestProvider",
        base_url="https://provider.example/v1",
        model="test/model",
        api_key="unit-test-secret",
        transport=httpx.MockTransport(handler),
    )
    assert asyncio.run(client.available()) is True


def test_openai_compatible_missing_key_is_unavailable():
    client = OpenAICompatibleLLM(
        provider_name="TestProvider",
        base_url="https://provider.example/v1",
        model="test/model",
        api_key="",
    )
    assert asyncio.run(client.available()) is False
