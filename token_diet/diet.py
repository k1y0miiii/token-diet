"""`token-diet diet <file.json>` — show one file in every encoding and the win.

The daily-use hook: point it at your own payload and see how many tokens you'd
save, with the best lossless option called out.
"""

from __future__ import annotations

import json
from pathlib import Path

from token_diet.bench import BASELINE
from token_diet.encoders import encode_all
from token_diet.tokenizers import DEFAULT_TOKENIZER, TOKENIZERS, count_tokens


def diet_file(path: str | Path, tokenizer: str = DEFAULT_TOKENIZER) -> str:
    p = Path(path)
    with p.open(encoding="utf-8") as fh:
        data = json.load(fh)

    results = encode_all(data)
    measured = []
    baseline_tokens = None
    for res in results:
        tokens = (
            count_tokens(res.text, tokenizer)
            if res.applicable and res.text is not None
            else None
        )
        measured.append((res, tokens))
        if res.name == BASELINE and tokens is not None:
            baseline_tokens = tokens

    applicable = [(r, t) for r, t in measured if t is not None]
    applicable.sort(key=lambda rt: rt[1])
    best, best_tokens = applicable[0] if applicable else (None, None)
    best_lossless = next(
        ((r, t) for r, t in applicable if r.lossless), (None, None)
    )

    out: list[str] = []
    out.append(f"file      : {p}")
    out.append(f"tokenizer : {tokenizer} ({TOKENIZERS.get(tokenizer, '?')})")
    out.append(f"baseline  : {BASELINE} = {baseline_tokens} tokens")
    out.append("")
    head = f"{'ENCODING':<16}{'TOKENS':>8}{'%vsJSON':>10}  {'LOSSLESS':<9}NOTES"
    out.append(head)
    out.append("-" * len(head))
    for res, tokens in sorted(
        measured, key=lambda rt: (rt[1] is None, rt[1] if rt[1] is not None else 0)
    ):
        if tokens is None:
            out.append(f"{res.name:<16}{'N/A':>8}{'-':>10}  {'-':<9}{res.note}")
            continue
        pct = (
            "baseline"
            if res.name == BASELINE or not baseline_tokens
            else f"{(tokens / baseline_tokens - 1) * 100:+.1f}%"
        )
        ll = "yes" if res.lossless else "no"
        out.append(f"{res.name:<16}{tokens:>8}{pct:>10}  {ll:<9}{res.note}")

    out.append("")
    if best is not None and baseline_tokens:
        saved = baseline_tokens - best_tokens
        pct = (1 - best_tokens / baseline_tokens) * 100
        out.append(
            f"smallest        : {best.name} "
            f"({best_tokens} tokens, {saved:+d} = {pct:.1f}% vs JSON)"
        )
    bl_res, bl_tok = best_lossless
    if bl_res is not None and baseline_tokens:
        saved = baseline_tokens - bl_tok
        pct = (1 - bl_tok / baseline_tokens) * 100
        out.append(
            f"best lossless   : {bl_res.name} "
            f"({bl_tok} tokens, {saved:+d} = {pct:.1f}% vs JSON)  <- recommended"
        )
    out.append("")
    return "\n".join(out)
