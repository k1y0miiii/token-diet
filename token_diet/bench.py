"""Benchmark engine: encoders x datasets x tokenizers, with a leaderboard.

All numbers are really measured. The baseline for "%vsJSON" is always
``json-pretty`` (the encoding most applications send today), so the headline
number answers: "how many fewer tokens than what I send now?".
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from token_diet.encoders import encode_all
from token_diet.tokenizers import (
    DEFAULT_TOKENIZER,
    count_tokens,
)

BASELINE = "json-pretty"

DATASETS_DIR = Path(__file__).resolve().parent.parent / "datasets"


@dataclass
class Row:
    encoding: str
    tokens: int | None  # None -> N/A
    lossless: bool
    applicable: bool
    note: str
    pct_vs_json: float | None = None  # negative = saving


@dataclass
class DatasetResult:
    dataset: str
    tokenizer: str
    rows: list[Row]
    baseline_tokens: int | None = None

    @property
    def best(self) -> Row | None:
        applicable = [r for r in self.rows if r.applicable and r.tokens is not None]
        return min(applicable, key=lambda r: r.tokens) if applicable else None


def load_datasets(only: str | None = None) -> dict[str, Any]:
    """Load all bundled datasets (or one, by stem) as {name: parsed_json}."""
    out: dict[str, Any] = {}
    for path in sorted(DATASETS_DIR.glob("*.json")):
        name = path.stem
        if only and name != only:
            continue
        with path.open(encoding="utf-8") as fh:
            out[name] = json.load(fh)
    if only and not out:
        raise FileNotFoundError(
            f"Dataset {only!r} not found in {DATASETS_DIR} "
            f"(have: {[p.stem for p in sorted(DATASETS_DIR.glob('*.json'))]})"
        )
    return out


def bench_one(data: Any, tokenizer: str) -> list[Row]:
    """Benchmark a single parsed dataset with one tokenizer."""
    results = encode_all(data)
    baseline_tokens: int | None = None
    rows: list[Row] = []
    for res in results:
        if res.applicable and res.text is not None:
            tokens = count_tokens(res.text, tokenizer)
        else:
            tokens = None
        rows.append(
            Row(
                encoding=res.name,
                tokens=tokens,
                lossless=res.lossless,
                applicable=res.applicable,
                note=res.note,
            )
        )
        if res.name == BASELINE and tokens is not None:
            baseline_tokens = tokens

    for row in rows:
        if row.tokens is not None and baseline_tokens:
            row.pct_vs_json = (row.tokens / baseline_tokens - 1.0) * 100.0
    return rows


def run(
    only_dataset: str | None = None,
    tokenizer: str = DEFAULT_TOKENIZER,
) -> list[DatasetResult]:
    datasets = load_datasets(only_dataset)
    out: list[DatasetResult] = []
    for name, data in datasets.items():
        rows = bench_one(data, tokenizer)
        baseline = next(
            (r.tokens for r in rows if r.encoding == BASELINE), None
        )
        out.append(
            DatasetResult(
                dataset=name, tokenizer=tokenizer, rows=rows,
                baseline_tokens=baseline,
            )
        )
    return out


def _sorted_rows(rows: list[Row]) -> list[Row]:
    """Applicable rows first (by tokens asc), then N/A rows."""
    applicable = sorted(
        [r for r in rows if r.applicable and r.tokens is not None],
        key=lambda r: r.tokens,
    )
    na = [r for r in rows if not (r.applicable and r.tokens is not None)]
    return applicable + na


def overall_summary(results: list[DatasetResult]) -> list[Row]:
    """Sum tokens per encoding across datasets where the encoding is applicable
    for EVERY dataset, so the comparison is apples-to-apples.

    Encodings that are N/A for any dataset (e.g. CSV on nested data) are reported
    separately as N/A in the overall view rather than given a misleading partial
    total.
    """
    encodings = [r.encoding for r in results[0].rows] if results else []
    totals: dict[str, int] = {}
    applicable_everywhere: dict[str, bool] = {}
    lossless_everywhere: dict[str, bool] = {}
    for enc in encodings:
        applicable_everywhere[enc] = True
        lossless_everywhere[enc] = True
        totals[enc] = 0
        for dr in results:
            row = next(r for r in dr.rows if r.encoding == enc)
            if row.applicable and row.tokens is not None:
                totals[enc] += row.tokens
                if not row.lossless:
                    lossless_everywhere[enc] = False
            else:
                applicable_everywhere[enc] = False

    baseline_total = totals.get(BASELINE, 0)
    rows: list[Row] = []
    for enc in encodings:
        if applicable_everywhere[enc]:
            pct = (
                (totals[enc] / baseline_total - 1.0) * 100.0
                if baseline_total
                else None
            )
            rows.append(
                Row(
                    encoding=enc,
                    tokens=totals[enc],
                    lossless=lossless_everywhere[enc],
                    applicable=True,
                    note="summed over all datasets",
                    pct_vs_json=pct,
                )
            )
        else:
            rows.append(
                Row(
                    encoding=enc,
                    tokens=None,
                    lossless=False,
                    applicable=False,
                    note="N/A for at least one dataset",
                    pct_vs_json=None,
                )
            )
    return rows


# --------------------------------------------------------------------------- #
# Serialization for --json / --md
# --------------------------------------------------------------------------- #


def results_to_dict(results: list[DatasetResult]) -> dict:
    return {
        "tokenizer": results[0].tokenizer if results else None,
        "baseline": BASELINE,
        "datasets": [
            {
                "dataset": dr.dataset,
                "baseline_tokens": dr.baseline_tokens,
                "rows": [
                    {
                        "encoding": r.encoding,
                        "tokens": r.tokens,
                        "pct_vs_json": (
                            round(r.pct_vs_json, 1)
                            if r.pct_vs_json is not None
                            else None
                        ),
                        "lossless": r.lossless,
                        "applicable": r.applicable,
                        "note": r.note,
                    }
                    for r in _sorted_rows(dr.rows)
                ],
            }
            for dr in results
        ],
        "overall": [
            {
                "encoding": r.encoding,
                "tokens": r.tokens,
                "pct_vs_json": (
                    round(r.pct_vs_json, 1) if r.pct_vs_json is not None else None
                ),
                "lossless": r.lossless,
                "applicable": r.applicable,
            }
            for r in _sorted_rows(overall_summary(results))
        ],
    }
