from types import SimpleNamespace

from scripts.benchmark_llms import Scenario, evaluate, percentile, summarize


def test_python_scenario_checks_syntax_and_contract():
    scenario = Scenario("python_code", [], "python")
    reply = SimpleNamespace(content="def normalize_task_title(value):\n    if not isinstance(value, str):\n        raise ValueError()\n    return value.strip()", tool_calls=[])
    assert evaluate(scenario, reply)[0] is True


def test_json_scenario_rejects_invalid_schema():
    scenario = Scenario("structured_json", [], "json")
    reply = SimpleNamespace(content='{"summary":"Task","priority":"urgent","acceptance_criteria":[]}', tool_calls=[])
    assert evaluate(scenario, reply)[0] is False


def test_tool_scenario_requires_exact_tool_and_arguments():
    scenario = Scenario("tool_calling", [], "tool")
    good = SimpleNamespace(content="", tool_calls=[
        SimpleNamespace(name="record_task_summary", arguments={"summary":"validate title and due date"})
    ])
    bad = SimpleNamespace(content="", tool_calls=[
        SimpleNamespace(name="delete_file", arguments={"path":"notes.txt"})
    ])
    assert evaluate(scenario, good)[0] is True
    assert evaluate(scenario, bad)[0] is False


def test_percentile_uses_interpolated_values():
    assert percentile([10.0, 20.0, 30.0, 40.0], 50) == 25.0
    assert percentile([], 95) is None


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
