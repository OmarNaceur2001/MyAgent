from types import SimpleNamespace

from scripts.benchmark_llms import TASKS, pctl, summarize, valid_output


def test_python_task_checks_syntax_and_contract():
    reply = SimpleNamespace(
        content="def normalize_task_title(value):\n    if not isinstance(value, str):\n        raise ValueError()\n    return value.strip()",
        tool_calls=[],
    )
    assert valid_output("python", reply) is True


def test_json_task_rejects_invalid_priority():
    reply = SimpleNamespace(
        content='{"summary":"Task","priority":"urgent","acceptance_criteria":[]}',
        tool_calls=[],
    )
    assert valid_output("json", reply) is False


def test_tool_task_requires_exact_name_and_valid_arguments():
    good = SimpleNamespace(content="", tool_calls=[
        SimpleNamespace(name="record_task_summary", arguments={"summary":"validate title and due date"})
    ])
    bad = SimpleNamespace(content="", tool_calls=[
        SimpleNamespace(name="delete_file", arguments={"path":"notes.txt"})
    ])
    assert valid_output("tool", good) is True
    assert valid_output("tool", bad) is False


def test_percentile_uses_interpolated_values():
    assert pctl([10.0, 20.0, 30.0, 40.0], 50) == 25.0
    assert pctl([], 95) is None


def test_summary_counts_failed_requests_and_tool_success():
    rows = [
        {"provider":"openrouter","model":"test/model","latency_ms":100.0,"ttft_ms":30.0,
         "tokens_per_second":50.0,"error":None,"valid":True,"task":"jira"},
        {"provider":"openrouter","model":"test/model","latency_ms":400.0,"ttft_ms":None,
         "tokens_per_second":None,"error":"TimeoutError","valid":False,"task":"tool"},
        {"provider":"openrouter","model":"test/model","latency_ms":200.0,"ttft_ms":50.0,
         "tokens_per_second":40.0,"error":None,"valid":False,"task":"tool"},
    ]
    result = summarize(rows)[0]
    assert result["api_errors"] == 1
    assert result["tool_success_rate"] == 0.0
    assert result["test_pass_rate"] == 0.5


def test_benchmark_contains_all_seven_synthetic_scenarios():
    assert len(TASKS) == 7
    assert {name for name, _ in TASKS} == {
        "jira", "plan", "python", "web", "debug", "json", "tool"
    }
