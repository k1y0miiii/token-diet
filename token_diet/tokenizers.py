"""Tokenizers used to measure encodings.

We use tiktoken (GPT-family) as the proxy. These are honest, real counts for
GPT-3.5/4 (``cl100k_base``) and GPT-4o / o-series (``o200k_base``). Other model
families (notably Claude) tokenize differently — for exact Claude counts use
``llmcost --api`` (https://github.com/k1y0miiii/llmcost).
"""

from __future__ import annotations

import functools

# Supported tiktoken encodings and the model families they proxy.
TOKENIZERS: dict[str, str] = {
    "cl100k_base": "GPT-3.5 / GPT-4",
    "o200k_base": "GPT-4o / o-series",
}

DEFAULT_TOKENIZER = "cl100k_base"

HONESTY_NOTE = (
    "Token counts use tiktoken (GPT-family) as a proxy. Claude and other models "
    "tokenize differently — for exact Claude counts use `llmcost --api`."
)


class TokenizerUnavailable(RuntimeError):
    """Raised when a tiktoken vocab cannot be loaded (e.g. blocked download)."""


@functools.cache
def _get_encoding(name: str):
    import tiktoken

    return tiktoken.get_encoding(name)


def available_tokenizers() -> dict[str, str]:
    """Return {name: load_error_or_empty} for each supported tokenizer.

    An empty string value means the tokenizer loaded fine. A non-empty string is
    the error message (e.g. a blocked vocab download in a sandbox).
    """
    status: dict[str, str] = {}
    for name in TOKENIZERS:
        try:
            _get_encoding(name)
            status[name] = ""
        except Exception as exc:  # network/sandbox/etc.
            status[name] = f"{type(exc).__name__}: {exc}"
    return status


def count_tokens(text: str, tokenizer: str = DEFAULT_TOKENIZER) -> int:
    """Count tokens in ``text`` with the named tiktoken encoding.

    Raises :class:`TokenizerUnavailable` if the vocab cannot be loaded.
    """
    if tokenizer not in TOKENIZERS:
        raise ValueError(
            f"Unknown tokenizer {tokenizer!r}; choose from {sorted(TOKENIZERS)}"
        )
    try:
        enc = _get_encoding(tokenizer)
    except Exception as exc:  # pragma: no cover - depends on environment
        raise TokenizerUnavailable(
            f"Could not load tiktoken vocab {tokenizer!r}: {exc}"
        ) from exc
    return len(enc.encode(text))
