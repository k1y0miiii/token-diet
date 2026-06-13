"""Render benchmark results as an aligned text leaderboard and as markdown."""

from __future__ import annotations

from token_diet.bench import (
    BASELINE,
    DatasetResult,
    Row,
    _sorted_rows,
    overall_summary,
)
from token_diet.tokenizers import HONESTY_NOTE, TOKENIZERS


def _fmt_tokens(r: Row) -> str:
    return "N/A" if r.tokens is None else str(r.tokens)


def _fmt_pct(r: Row) -> str:
    if not r.applicable or r.pct_vs_json is None:
        return "-"
    if r.encoding == BASELINE:
        return "baseline"
    return f"{r.pct_vs_json:+.1f}%"


def _fmt_lossless(r: Row) -> str:
    if not r.applicable:
        return "-"
    return "yes" if r.lossless else "no"


# --------------------------------------------------------------------------- #
# Text leaderboard
# --------------------------------------------------------------------------- #


def _text_table(rows: list[Row]) -> list[str]:
    sorted_rows = _sorted_rows(rows)
    headers = ("ENCODING", "TOKENS", "%vsJSON", "LOSSLESS", "NOTES")
    cells = [
        (
            r.encoding,
            _fmt_tokens(r),
            _fmt_pct(r),
            _fmt_lossless(r),
            r.note,
        )
        for r in sorted_rows
    ]
    widths = [len(h) for h in headers]
    for row in cells:
        for i, c in enumerate(row):
            widths[i] = max(widths[i], len(c))
    # Last column (NOTES) is left-aligned and not padded on the right.
    def line(cols):
        out = []
        for i, c in enumerate(cols):
            if i == len(cols) - 1:
                out.append(c)
            elif i == 0:
                out.append(c.ljust(widths[i]))
            else:
                out.append(c.rjust(widths[i]))
        return "  ".join(out)

    lines = [line(headers)]
    lines.append("  ".join(
        ("-" * widths[i] if i != len(headers) - 1 else "-" * len(headers[i]))
        for i in range(len(headers))
    ))
    for row in cells:
        lines.append(line(row))
    return lines


def render_text(results: list[DatasetResult]) -> str:
    if not results:
        return "No datasets to benchmark."
    tok = results[0].tokenizer
    out: list[str] = []
    out.append("=" * 64)
    out.append("token-diet leaderboard")
    out.append(f"tokenizer: {tok}  ({TOKENIZERS.get(tok, '?')})   baseline: {BASELINE}")
    out.append(f"note: {HONESTY_NOTE}")
    out.append("=" * 64)

    for dr in results:
        out.append("")
        best = dr.best
        best_str = ""
        if best is not None and best.encoding != BASELINE and best.pct_vs_json:
            best_str = f"  -> best: {best.encoding} ({best.pct_vs_json:+.1f}% vs JSON)"
        out.append(f"## {dr.dataset}{best_str}")
        out.extend(_text_table(dr.rows))

    if len(results) >= 1:
        out.append("")
        out.append("## OVERALL (summed across datasets where applicable)")
        out.extend(_text_table(overall_summary(results)))
    out.append("")
    return "\n".join(out)


# --------------------------------------------------------------------------- #
# Markdown
# --------------------------------------------------------------------------- #


def _md_table(rows: list[Row]) -> list[str]:
    sorted_rows = _sorted_rows(rows)
    out = [
        "| Encoding | Tokens | %vsJSON | Lossless | Notes |",
        "|---|---:|---:|:---:|---|",
    ]
    for r in sorted_rows:
        out.append(
            f"| `{r.encoding}` | {_fmt_tokens(r)} | {_fmt_pct(r)} "
            f"| {_fmt_lossless(r)} | {r.note} |"
        )
    return out


def render_markdown(results: list[DatasetResult]) -> str:
    if not results:
        return "_No datasets._\n"
    tok = results[0].tokenizer
    out: list[str] = []
    out.append("# token-diet leaderboard")
    out.append("")
    out.append(
        f"Tokenizer: `{tok}` ({TOKENIZERS.get(tok, '?')}) · Baseline: `{BASELINE}`"
    )
    out.append("")
    out.append(f"> {HONESTY_NOTE}")
    out.append("")
    out.append("## Overall (summed across datasets where applicable)")
    out.append("")
    out.extend(_md_table(overall_summary(results)))
    out.append("")
    for dr in results:
        out.append(f"## `{dr.dataset}`")
        out.append("")
        out.extend(_md_table(dr.rows))
        out.append("")
    return "\n".join(out)


def render_readme_table(results: list[DatasetResult]) -> str:
    """Compact headline table for the README (overall summary only)."""
    if not results:
        return "_No datasets._"
    tok = results[0].tokenizer
    out: list[str] = []
    out.append(
        f"Tokenizer `{tok}` ({TOKENIZERS.get(tok, '?')}), baseline `{BASELINE}`, "
        f"summed across {len(results)} bundled datasets. Measured with tiktoken — "
        "reproduce with `token-diet bench`."
    )
    out.append("")
    out.extend(_md_table(overall_summary(results)))
    return "\n".join(out)
