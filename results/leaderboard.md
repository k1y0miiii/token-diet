# token-diet leaderboard

Tokenizer: `cl100k_base` (GPT-3.5 / GPT-4) · Baseline: `json-pretty`

> Token counts use tiktoken (GPT-family) as a proxy. Claude and other models tokenize differently — for exact Claude counts use `llmcost --api`.

## Overall (summed across datasets where applicable)

| Encoding | Tokens | %vsJSON | Lossless | Notes |
|---|---:|---:|:---:|---|
| `jtf` | 8533 | -39.8% | yes | summed over all datasets |
| `json-min` | 8709 | -38.5% | yes | summed over all datasets |
| `json-shortkeys` | 8939 | -36.9% | yes | summed over all datasets |
| `yaml` | 10829 | -23.6% | yes | summed over all datasets |
| `json-pretty` | 14170 | baseline | yes | summed over all datasets |
| `csv` | N/A | - | - | N/A for at least one dataset |
| `tsv` | N/A | - | - | N/A for at least one dataset |

## `api_response`

| Encoding | Tokens | %vsJSON | Lossless | Notes |
|---|---:|---:|:---:|---|
| `json-min` | 971 | -37.7% | yes | minified, no whitespace |
| `json-shortkeys` | 1059 | -32.0% | yes | minified + lossless keymap (map counted in tokens) |
| `jtf` | 1069 | -31.4% | yes | JSON Token Format (vendored, real encoder) |
| `yaml` | 1214 | -22.1% | yes | human-readable; usually MORE tokens than JSON |
| `json-pretty` | 1558 | baseline | yes | indent=2 — the baseline most apps send |
| `csv` | N/A | - | - | N/A — only flat arrays-of-objects are tabular |
| `tsv` | N/A | - | - | N/A — only flat arrays-of-objects are tabular |

## `config`

| Encoding | Tokens | %vsJSON | Lossless | Notes |
|---|---:|---:|:---:|---|
| `json-min` | 205 | -40.8% | yes | minified, no whitespace |
| `jtf` | 220 | -36.4% | yes | JSON Token Format (vendored, real encoder) |
| `yaml` | 253 | -26.9% | yes | human-readable; usually MORE tokens than JSON |
| `json-pretty` | 346 | baseline | yes | indent=2 — the baseline most apps send |
| `json-shortkeys` | 379 | +9.5% | yes | minified + lossless keymap (map counted in tokens) |
| `csv` | N/A | - | - | N/A — only flat arrays-of-objects are tabular |
| `tsv` | N/A | - | - | N/A — only flat arrays-of-objects are tabular |

## `events`

| Encoding | Tokens | %vsJSON | Lossless | Notes |
|---|---:|---:|:---:|---|
| `tsv` | 1121 | -53.2% | no | flat table; LOSSY — non-string types coerced to strings |
| `csv` | 1163 | -51.4% | no | flat table; LOSSY — non-string types coerced to strings |
| `json-min` | 1580 | -34.0% | yes | minified, no whitespace |
| `json-shortkeys` | 1632 | -31.8% | yes | minified + lossless keymap (map counted in tokens) |
| `jtf` | 1725 | -27.9% | yes | JSON Token Format (vendored, real encoder) |
| `yaml` | 1892 | -20.9% | yes | human-readable; usually MORE tokens than JSON |
| `json-pretty` | 2393 | baseline | yes | indent=2 — the baseline most apps send |

## `org_tree`

| Encoding | Tokens | %vsJSON | Lossless | Notes |
|---|---:|---:|:---:|---|
| `json-shortkeys` | 2575 | -41.4% | yes | minified + lossless keymap (map counted in tokens) |
| `json-min` | 2675 | -39.2% | yes | minified, no whitespace |
| `jtf` | 2717 | -38.2% | yes | JSON Token Format (vendored, real encoder) |
| `yaml` | 3384 | -23.0% | yes | human-readable; usually MORE tokens than JSON |
| `json-pretty` | 4397 | baseline | yes | indent=2 — the baseline most apps send |
| `csv` | N/A | - | - | N/A — only flat arrays-of-objects are tabular |
| `tsv` | N/A | - | - | N/A — only flat arrays-of-objects are tabular |

## `product_catalog`

| Encoding | Tokens | %vsJSON | Lossless | Notes |
|---|---:|---:|:---:|---|
| `json-min` | 1226 | -40.9% | yes | minified, no whitespace |
| `json-shortkeys` | 1255 | -39.5% | yes | minified + lossless keymap (map counted in tokens) |
| `jtf` | 1541 | -25.7% | yes | JSON Token Format (vendored, real encoder) |
| `yaml` | 1548 | -25.4% | yes | human-readable; usually MORE tokens than JSON |
| `json-pretty` | 2074 | baseline | yes | indent=2 — the baseline most apps send |
| `csv` | N/A | - | - | N/A — only flat arrays-of-objects are tabular |
| `tsv` | N/A | - | - | N/A — only flat arrays-of-objects are tabular |

## `users`

| Encoding | Tokens | %vsJSON | Lossless | Notes |
|---|---:|---:|:---:|---|
| `csv` | 1104 | -67.5% | no | flat table; LOSSY — non-string types coerced to strings |
| `tsv` | 1141 | -66.5% | no | flat table; LOSSY — non-string types coerced to strings |
| `jtf` | 1261 | -62.9% | yes | JSON Token Format (vendored, real encoder) |
| `json-shortkeys` | 2039 | -40.1% | yes | minified + lossless keymap (map counted in tokens) |
| `json-min` | 2052 | -39.7% | yes | minified, no whitespace |
| `yaml` | 2538 | -25.4% | yes | human-readable; usually MORE tokens than JSON |
| `json-pretty` | 3402 | baseline | yes | indent=2 — the baseline most apps send |

