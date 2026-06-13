"""Encoders that serialize the SAME data in different ways.

Honesty rules baked in here:

* Every encoder is implemented faithfully or not included at all.
* ``lossless`` is verified by actual round-trip ``decode(encode(x)) == x`` for
  encoders that have a decoder (JSON variants, JTF, CSV/TSV for flat tabular).
* Non-applicable combinations (CSV on nested data, YAML when pyyaml is missing)
  return an :class:`EncodeResult` with ``applicable=False`` and a clear note —
  never a fake number.
* The short-keys map and the CSV header are part of the payload, so their tokens
  are counted honestly. Nothing is hidden to make a format look better.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from token_diet.vendor import jtf

# --------------------------------------------------------------------------- #
# Result type
# --------------------------------------------------------------------------- #


@dataclass
class EncodeResult:
    """Outcome of running one encoder on one dataset."""

    name: str
    text: str | None  # encoded payload, or None if not applicable
    lossless: bool  # round-trip verified (or provably lossless by construction)
    applicable: bool  # False -> N/A for this dataset shape
    note: str = ""

    @property
    def chars(self) -> int:
        return len(self.text) if self.text is not None else 0


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _is_flat_tabular(data: Any) -> bool:
    """True if data is a non-empty list of flat objects with primitive values.

    These are the only shapes for which CSV/TSV are lossless and meaningful.
    """
    if not isinstance(data, list) or not data:
        return False
    if not all(isinstance(row, dict) and row for row in data):
        return False
    for row in data:
        for v in row.values():
            if isinstance(v, (dict, list)):
                return False
    return True


def _column_order(rows: list[dict]) -> list[str]:
    """Stable union of keys across all rows, first-seen order."""
    cols: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for k in row:
            if k not in seen:
                seen.add(k)
                cols.append(k)
    return cols


def _collect_keys(data: Any, acc: dict[str, None]) -> None:
    """Collect every object key appearing anywhere in the structure."""
    if isinstance(data, dict):
        for k, v in data.items():
            acc.setdefault(k, None)
            _collect_keys(v, acc)
    elif isinstance(data, list):
        for v in data:
            _collect_keys(v, acc)


def _shorten_keys(data: Any, mapping: dict[str, str]) -> Any:
    if isinstance(data, dict):
        return {mapping[k]: _shorten_keys(v, mapping) for k, v in data.items()}
    if isinstance(data, list):
        return [_shorten_keys(v, mapping) for v in data]
    return data


def _restore_keys(data: Any, inverse: dict[str, str]) -> Any:
    if isinstance(data, dict):
        return {inverse[k]: _restore_keys(v, inverse) for k, v in data.items()}
    if isinstance(data, list):
        return [_restore_keys(v, inverse) for v in data]
    return data


def _short_names() -> list[str]:
    """Deterministic short key names: a, b, ..., z, a0, a1, ... (token-cheap)."""
    import string

    singles = list(string.ascii_lowercase)
    yield_list = list(singles)
    for first in singles:
        for second in "0123456789":
            yield_list.append(first + second)
    return yield_list


# --------------------------------------------------------------------------- #
# Encoders
# --------------------------------------------------------------------------- #


def enc_json_pretty(data: Any) -> EncodeResult:
    text = json.dumps(data, ensure_ascii=False, indent=2)
    lossless = json.loads(text) == data
    return EncodeResult(
        "json-pretty", text, lossless, True,
        "indent=2 — the baseline most apps send",
    )


def enc_json_min(data: Any) -> EncodeResult:
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    lossless = json.loads(text) == data
    return EncodeResult(
        "json-min", text, lossless, True,
        "minified, no whitespace",
    )


def enc_json_shortkeys(data: Any) -> EncodeResult:
    """Minified JSON with a documented, lossless key-shortening map.

    The map itself is prepended as a JSON line and counted in the tokens, so the
    measurement is honest: short keys only win when keys repeat enough to pay for
    the map.
    """
    keys: dict[str, None] = {}
    _collect_keys(data, keys)
    original_keys = list(keys)
    if not original_keys:
        # No keys to shorten (e.g. a primitive or array of primitives).
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        return EncodeResult(
            "json-shortkeys", text, json.loads(text) == data, True,
            "no object keys to shorten",
        )

    short = _short_names()
    mapping = {orig: short[i] for i, orig in enumerate(original_keys)}
    inverse = {v: k for k, v in mapping.items()}

    shortened = _shorten_keys(data, mapping)
    # The map travels WITH the payload (so the receiver can restore keys).
    # short -> original, minified, counted in tokens.
    map_line = "// keymap " + json.dumps(inverse, ensure_ascii=False, separators=(",", ":"))
    body = json.dumps(shortened, ensure_ascii=False, separators=(",", ":"))
    text = map_line + "\n" + body

    # Verify lossless: restore from the shortened body using the inverse map.
    restored = _restore_keys(json.loads(body), inverse)
    lossless = restored == data
    return EncodeResult(
        "json-shortkeys", text, lossless, True,
        "minified + lossless keymap (map counted in tokens)",
    )


def enc_jtf(data: Any) -> EncodeResult:
    text = jtf.encode(data)
    try:
        lossless = jtf.decode(text) == data
    except Exception as exc:  # pragma: no cover - defensive
        return EncodeResult("jtf", text, False, True, f"decode error: {exc}")
    return EncodeResult(
        "jtf", text, lossless, True,
        "JSON Token Format (vendored, real encoder)",
    )


def _csv_like(data: Any, sep: str, name: str) -> EncodeResult:
    if not _is_flat_tabular(data):
        return EncodeResult(
            name, None, False, False,
            "N/A — only flat arrays-of-objects are tabular",
        )
    import csv
    import io

    cols = _column_order(data)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=cols, delimiter=sep, lineterminator="\n")
    writer.writeheader()
    for row in data:
        # Fill missing keys with "" — handled in the round-trip check below.
        writer.writerow({c: row.get(c, "") for c in cols})
    text = buf.getvalue()

    # Round-trip honesty: CSV/TSV have NO native types. A real round-trip
    # (parse the CSV back) only equals the original when every cell was already
    # a string AND every row has every column. If the source has ints/bools/
    # nulls (like 36, False, None), CSV silently coerces them to "36"/"False"/""
    # — so it is NOT lossless and we say so plainly.
    reader = csv.DictReader(io.StringIO(text), delimiter=sep)
    parsed = [dict(r) for r in reader]
    expected = [{c: row.get(c, "") for c in cols} for row in data]
    lossless = parsed == expected  # only true for all-string, fully-populated tables

    if lossless:
        note = "flat table, all-string cells — true round-trip"
    else:
        note = "flat table; LOSSY — non-string types coerced to strings"
    return EncodeResult(name, text, lossless, True, note)


def enc_csv(data: Any) -> EncodeResult:
    return _csv_like(data, ",", "csv")


def enc_tsv(data: Any) -> EncodeResult:
    return _csv_like(data, "\t", "tsv")


def enc_yaml(data: Any) -> EncodeResult:
    try:
        import yaml  # type: ignore
    except Exception:
        return EncodeResult(
            "yaml", None, False, False,
            "skipped — pyyaml not installed",
        )
    text = yaml.safe_dump(data, default_flow_style=False, sort_keys=False, allow_unicode=True)
    try:
        lossless = yaml.safe_load(text) == data
    except Exception as exc:  # pragma: no cover - defensive
        return EncodeResult("yaml", text, False, True, f"parse error: {exc}")
    return EncodeResult(
        "yaml", text, lossless, True,
        "human-readable; usually MORE tokens than JSON",
    )


# Order matters only for stable display when token counts tie.
ENCODERS: dict[str, Callable[[Any], EncodeResult]] = {
    "json-pretty": enc_json_pretty,
    "json-min": enc_json_min,
    "json-shortkeys": enc_json_shortkeys,
    "jtf": enc_jtf,
    "csv": enc_csv,
    "tsv": enc_tsv,
    "yaml": enc_yaml,
}


def encode_all(data: Any) -> list[EncodeResult]:
    """Run every encoder against ``data`` and return all results."""
    return [fn(data) for fn in ENCODERS.values()]
