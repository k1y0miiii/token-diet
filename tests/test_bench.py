"""Leaderboard math, determinism, and the baseline contract."""

from __future__ import annotations

from token_diet.bench import (
    BASELINE,
    bench_one,
    load_datasets,
    overall_summary,
    results_to_dict,
    run,
)

DATASETS = load_datasets()


def test_pct_vs_json_math():
    data = DATASETS["users"]
    rows = bench_one(data, "cl100k_base")
    baseline = next(r for r in rows if r.encoding == BASELINE)
    assert baseline.tokens is not None
    # Baseline is 0% vs itself.
    assert abs(baseline.pct_vs_json) < 1e-9
    for r in rows:
        if r.tokens is None:
            continue
        expected = (r.tokens / baseline.tokens - 1.0) * 100.0
        assert abs(r.pct_vs_json - expected) < 1e-9


def test_minified_never_more_than_pretty():
    # Minifying can only remove characters, so it must never cost MORE tokens.
    for name, data in DATASETS.items():
        rows = bench_one(data, "cl100k_base")
        pretty = next(r for r in rows if r.encoding == "json-pretty").tokens
        mini = next(r for r in rows if r.encoding == "json-min").tokens
        assert mini <= pretty, f"{name}: minified {mini} > pretty {pretty}"


def test_determinism():
    a = results_to_dict(run(tokenizer="cl100k_base"))
    b = results_to_dict(run(tokenizer="cl100k_base"))
    assert a == b


def test_overall_marks_partial_encodings_na():
    results = run(tokenizer="cl100k_base")
    summary = {r.encoding: r for r in overall_summary(results)}
    # CSV is N/A for at least one (nested) dataset -> must be N/A overall, not a
    # misleading partial total.
    assert summary["csv"].applicable is False
    assert summary["csv"].tokens is None
    # JSON variants apply everywhere -> real totals.
    assert summary["json-min"].applicable is True
    assert summary["json-min"].tokens > 0


def test_baseline_is_json_pretty():
    results = run(tokenizer="cl100k_base")
    for dr in results:
        baseline = next(r for r in dr.rows if r.encoding == BASELINE)
        assert dr.baseline_tokens == baseline.tokens


def test_results_json_shape():
    d = results_to_dict(run(only_dataset="users", tokenizer="cl100k_base"))
    assert d["baseline"] == BASELINE
    assert d["tokenizer"] == "cl100k_base"
    assert len(d["datasets"]) == 1
    assert d["datasets"][0]["dataset"] == "users"
    # rows are sorted ascending by tokens among applicable ones
    applicable = [r for r in d["datasets"][0]["rows"] if r["tokens"] is not None]
    toks = [r["tokens"] for r in applicable]
    assert toks == sorted(toks)
