English · [Русский](PLAYBOOK.ru.md)

# Playbook: cut your LLM token bill

Copy-paste tactics, **biggest wins first**. Every percentage here is either a real
number measured by `token-diet bench` on the bundled datasets, or marked as a
rough estimate. The one rule that beats every tactic: **measure, don't guess** —
run `token-diet diet your.json` on your actual payload before committing.

All `%` below are vs `json-pretty` (indent=2), counted with `tiktoken cl100k_base`.

---

## 1. Use a tabular encoding for arrays-of-objects

**The single biggest win when you send lists of records.** Pretty/minified JSON
repeats every key on every row. Tabular formats (JTF's `#N` header, or CSV) write
the keys **once** and then just rows.

Measured on the bundled datasets:

| Dataset | Shape | Best lossless | vs JSON |
|---|---|---|---:|
| `users` (50 flat records) | array of flat objects | `jtf` | **−62.9%** |
| `events` (40 analytics events) | array of objects | `jtf` | **−27.9%** |

- **JTF** stays **lossless** (types preserved, real round-trip) and handles nested
  rows too. Use it via [json-token-format](https://github.com/k1y0miiii/json-token-format).
- **CSV/TSV** are even smaller (`users`: −67.5%) **but lossy** — CSV has no types,
  so `36` becomes `"36"` and `false` becomes `"false"`. Fine if your data is
  already all strings or the model is told to treat cells as strings; otherwise
  prefer JTF.

Trade-off: needs a parser/decoder on the other end. Not human-pretty.

## 2. Minify JSON

Kill indentation and inter-token spaces: `json.dumps(x, separators=(",",":"))`.
**Free, lossless, no parser change** — the receiver still reads plain JSON.

Measured: **−34% to −41%** across the bundled datasets (e.g. `config` −40.8%,
`product_catalog` −40.9%). This is the highest-leverage change you can ship today
with zero risk.

```python
import json
payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
```

Trade-off: slightly less human-readable in logs. That's it.

## 3. Drop nulls and empty fields before sending

If a field is `null`, `[]`, `{}`, or a default the model doesn't need, omit it.
Lossy **by design** (you decide the field is irrelevant), so apply with judgment.

```python
def prune(x):
    if isinstance(x, dict):
        return {k: prune(v) for k, v in x.items() if v not in (None, [], {}, "")}
    if isinstance(x, list):
        return [prune(v) for v in x]
    return x
```

Rough impact: **5–20%** depending on how sparse your data is. Biggest on API
responses padded with `null` optional fields.

## 4. Shorten repeated keys (with a map)

Replace long keys (`emailAddress` → `e`) and ship a tiny map so it stays lossless.
**Only wins when keys repeat a lot** — the map costs tokens too, and `token-diet`
counts it honestly.

Measured: `org_tree` **−41.4%** (deeply nested, keys repeat thousands of times) —
but on small/shallow data the map can cost *more* than it saves (`config`:
**+9.5%**, a real regression). Measure first.

Trade-off: not human-readable; receiver must apply the map. Often **minify (tactic
2) gets you most of the way with none of the downside** — reach for short keys
only when a measurement says it pays off.

## 5. Web content → clean text instead of raw HTML

Raw HTML is mostly tags, attributes, scripts, and boilerplate. Extracting clean
text/markdown before sending to the model can cut **~8×** on typical web pages.

Use [glyph-mcp](https://github.com/k1y0miiii/glyph-mcp) — it fetches and converts
pages to LLM-clean text. Lossy (you drop markup), but markup is rarely what you
want the model to reason about.

## 6. Prompt caching — cache the stable prefix

If you send the same large system prompt / context on every call, cache it.
Providers bill cached tokens at a fraction of the input price (and skip
re-processing). **Huge** on repeated calls; the saving is on **price**, not token
count, so it stacks with everything above.

- Put the stable, reused content at the **front** of the prompt.
- Keep the volatile, per-request content at the **end**.

## 7. Context hygiene — send only what the task needs

The cheapest token is the one you never send. Retrieve/trim to the relevant slice
instead of dumping whole files, histories, or schemas. Impact varies but is often
the largest single lever — and it improves answer quality, not just cost.

## 8. Structured outputs — constrain the response, not just the input

Use JSON-schema / structured-output modes so the model emits exactly the fields
you need, with no prose padding. Cuts **output** tokens (often the pricier side)
and removes fragile free-text parsing.

---

## Measure, don't guess

The same tactic can be a −63% win or a +9% regression depending on your data shape
(compare `users` vs `config` for short keys above). Before you standardize a
format:

```bash
token-diet diet your-real-payload.json
```

For **exact Claude** token/price accounting (tiktoken here is a GPT-family proxy),
use [llmcost](https://github.com/k1y0miiii/llmcost) with `--api`.
