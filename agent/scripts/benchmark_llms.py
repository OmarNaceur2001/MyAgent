"""Run the synthetic MyAgent LLM benchmark.

Example: python agent/scripts/benchmark_llms.py --runs 10 --warmup 1
Cloud providers receive only the static synthetic prompts defined here.
"""
from __future__ import annotations

import argparse
import ast
import asyncio
import csv
import json
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from myagent_agent.config import settings
from myagent_agent.providers import build_benchmark_registry


TASKS = [
    ("jira", "Summarize this synthetic Jira ticket: add POST /api/tasks; require title and due_date; reject empty title and past dates; persist valid tasks; return HTTP 201."),
    ("plan", "Give an implementation plan for that endpoint. Include validation, errors, files/layers, tests, and risks."),
    ("python", "Write Python function normalize_task_title(value): trim and collapse whitespace; raise ValueError for non-string or empty input. Return code only."),
    ("web", "Write a responsive task-list page. Include HTML form, mobile CSS, and JavaScript submit handler. Return HTML, CSS, and JS code."),
    ("debug", "Fix this bug: def get_due_date(task): return task.get('due_date').strip(). Explain why None fails; return None when absent, otherwise stripped text."),
    ("json", "Return only JSON with keys summary (string), priority (low/medium/high), acceptance_criteria (array of strings) for a title and due-date validation endpoint."),
    ("tool", "Call record_task_summary exactly once for this synthetic task: POST /api/tasks validates title and due date, rejects empty titles and past dates, stores valid data, returns 201."),
]

TOOL_SCHEMA = [{
    "type": "function",
    "function": {
        "name": "record_task_summary",
        "description": "Record a concise summary of the synthetic task.",
        "parameters": {
            "type": "object",
            "properties": {"summary": {"type": "string"}},
            "required": ["summary"],
            "additionalProperties": False,
        },
    },
}]


def extract_code(text, lang=None):
    fence = chr(96) * 3
    label = re.escape(lang) if lang else r"[^\n]*"
    found = re.search(re.escape(fence) + label + r"\s*([\s\S]*?)" + re.escape(fence), text, re.I)
    return found.group(1).strip() if found else text.strip()


def valid_output(name, reply):
    text = (reply.content or "").strip()
    low = text.lower()
    if name == "jira":
        return all(x in low for x in ("post /api/tasks", "title", "due date", "201"))
    if name == "plan":
        return all(x in low for x in ("valid", "test", "error"))
    if name == "python":
        try:
            ast.parse(extract_code(text, "python"))
            return "normalize_task_title" in text and "ValueError" in text
        except SyntaxError:
            return False
    if name == "web":
        return all(x in low for x in ("<html", "<form", "<style", "<script"))
    if name == "debug":
        return "none" in low and ("strip" in low or "correct" in low)
    if name == "json":
        try:
            obj = json.loads(extract_code(text, "json"))
            return (
                isinstance(obj, dict)
                and isinstance(obj.get("summary"), str)
                and obj.get("priority") in ("low", "medium", "high")
                and isinstance(obj.get("acceptance_criteria"), list)
            )
        except (ValueError, TypeError):
            return False
    if name == "tool":
        calls = getattr(reply, "tool_calls", [])
        return (
            len(calls) == 1
            and calls[0].name == "record_task_summary"
            and isinstance(calls[0].arguments, dict)
            and isinstance(calls[0].arguments.get("summary"), str)
            and len(calls[0].arguments["summary"]) >= 10
        )
    return False


def pctl(values, p):
    if not values:
        return None
    values = sorted(values)
    pos = (len(values) - 1) * p / 100
    lo = int(pos)
    hi = min(lo + 1, len(values) - 1)
    return values[lo] + (values[hi] - values[lo]) * (pos - lo)


async def ask(model, name, prompt):
    messages = [{"role": "user", "content": prompt}]
    if name == "tool":
        messages = [
            {"role": "system", "content": "Use the requested function tool. Do not answer in text."},
            {"role": "user", "content": prompt},
        ]
    method = getattr(model, "chat_with_metrics", None)
    if method:
        return await method(messages, TOOL_SCHEMA if name == "tool" else [])
    return await model.chat(messages, TOOL_SCHEMA if name == "tool" else []), None


async def execute(registry, names, runs, warmups):
    rows = []
    for provider in names:
        model = registry[provider]
        for task, prompt in TASKS:
            for _ in range(warmups):
                try:
                    await ask(model, task, prompt)
                except Exception:
                    pass
            for attempt in range(1, runs + 1):
                started = time.perf_counter()
                try:
                    reply, ttft = await ask(model, task, prompt)
                    ms = (time.perf_counter() - started) * 1000
                    tokens = getattr(reply, "completion_tokens", None)
                    rows.append({
                        "provider": provider, "model": model.model, "task": task,
                        "attempt": attempt, "latency_ms": round(ms, 2),
                        "ttft_ms": round(ttft, 2) if ttft is not None else None,
                        "prompt_tokens": getattr(reply, "prompt_tokens", None),
                        "completion_tokens": tokens,
                        "tokens_per_second": round(tokens / (ms / 1000), 2)
                        if isinstance(tokens, int) and ms else None,
                        "valid": valid_output(task, reply), "error": None,
                    })
                except Exception as exc:
                    rows.append({
                        "provider": provider, "model": model.model, "task": task,
                        "attempt": attempt, "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                        "ttft_ms": None, "prompt_tokens": None, "completion_tokens": None,
                        "tokens_per_second": None, "valid": False, "error": type(exc).__name__,
                    })
    return rows


def summarize(rows):
    result = []
    for provider in sorted(set(row["provider"] for row in rows)):
        group = [row for row in rows if row["provider"] == provider]
        ok = [row for row in group if row["error"] is None]
        latencies = [row["latency_ms"] for row in group]
        ttft = [row["ttft_ms"] for row in ok if row["ttft_ms"] is not None]
        speed = [row["tokens_per_second"] for row in ok if row["tokens_per_second"] is not None]
        tools = [row for row in group if row["task"] == "tool"]
        result.append({
            "provider": provider, "model": group[0]["model"], "samples": len(group),
            "api_errors": len(group) - len(ok),
            "p50_latency_ms": round(pctl(latencies, 50), 2),
            "p95_latency_ms": round(pctl(latencies, 95), 2),
            "p50_ttft_ms": round(pctl(ttft, 50), 2) if ttft else None,
            "median_tokens_per_second": round(statistics.median(speed), 2) if speed else None,
            "test_pass_rate": round(sum(x["valid"] for x in ok) / len(ok), 3) if ok else 0,
            "tool_success_rate": round(sum(x["valid"] for x in tools) / len(tools), 3) if tools else None,
        })
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument("--warmup", type=int, default=1)
    parser.add_argument("--providers", default="all")
    parser.add_argument("--output-dir", default=str(ROOT / "agent" / "data" / "benchmarks"))
    args = parser.parse_args()
    if args.runs < 1 or args.warmup < 0:
        parser.error("--runs must be positive and --warmup cannot be negative")
    registry = build_benchmark_registry(settings)
    selected = list(registry) if args.providers == "all" else [x.strip() for x in args.providers.split(",") if x.strip()]
    missing = [x for x in selected if x not in registry]
    if missing:
        parser.error("Provider not configured: " + ", ".join(missing))
    if not selected:
        parser.error("No providers configured. Start Ollama or configure an API key.")
    rows = asyncio.run(execute(registry, selected, args.runs, args.warmup))
    summary = summarize(rows)
    folder = Path(args.output_dir).expanduser()
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_file = folder / ("benchmark-" + stamp + ".json")
    csv_file = folder / ("benchmark-" + stamp + ".csv")
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "runs": args.runs, "warmups": args.warmup,
        "synthetic_prompts_only": True, "real_tools_executed": False,
        "generated_code_executed": False, "summary": summary, "records": rows,
    }
    json_file.write_text(json.dumps(report, indent=2), encoding="utf-8")
    with csv_file.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print("Provider | Model | P50 ms | P95 ms | TTFT ms | tokens/s | pass rate | tool success | errors")
    for item in summary:
        print("{provider} | {model} | {p50_latency_ms} | {p95_latency_ms} | {p50_ttft_ms} | {median_tokens_per_second} | {test_pass_rate} | {tool_success_rate} | {api_errors}".format(**item))
    print("JSON:", json_file)
    print("CSV:", csv_file)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
