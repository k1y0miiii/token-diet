"""Encoder correctness: lossless flags must be backed by real round-trips."""

from __future__ import annotations

import json

import pytest

from token_diet.bench import load_datasets
from token_diet.encoders import (
    _is_flat_tabular,
    enc_csv,
    enc_json_min,
    enc_json_pretty,
    enc_json_shortkeys,
    enc_jtf,
    enc_tsv,
)
from token_diet.vendor import jtf

DATASETS = load_datasets()


@pytest.fixture(params=sorted(DATASETS), ids=sorted(DATASETS))
def dataset(request):
    return DATASETS[request.param]


# --------------------------------------------------------------------------- #
# Lossless encoders must actually round-trip on every dataset.
# --------------------------------------------------------------------------- #


def test_json_pretty_roundtrip(dataset):
    res = enc_json_pretty(dataset)
    assert res.lossless
    assert json.loads(res.text) == dataset


def test_json_min_roundtrip(dataset):
    res = enc_json_min(dataset)
    assert res.lossless
    assert json.loads(res.text) == dataset


def test_json_shortkeys_roundtrip(dataset):
    res = enc_json_shortkeys(dataset)
    assert res.lossless, "short-keys claims lossless but failed verification"


def test_jtf_roundtrip(dataset):
    res = enc_jtf(dataset)
    assert res.lossless
    # Independent confirmation via the vendored decoder.
    assert jtf.decode(res.text) == dataset


# --------------------------------------------------------------------------- #
# CSV/TSV: honesty about losslessness and applicability.
# --------------------------------------------------------------------------- #


def test_csv_na_on_nested():
    nested = {"a": {"b": 1}}
    res = enc_csv(nested)
    assert not res.applicable
    assert res.text is None
    assert "N/A" in res.note


def test_csv_lossy_when_non_string_types():
    # ints/bools are coerced to strings by CSV -> must NOT be marked lossless.
    data = [{"id": 1, "active": True}, {"id": 2, "active": False}]
    assert _is_flat_tabular(data)
    res = enc_csv(data)
    assert res.applicable
    assert res.lossless is False
    assert "LOSSY" in res.note


def test_csv_lossless_when_all_strings():
    data = [{"k": "a", "v": "x"}, {"k": "b", "v": "y"}]
    res = enc_csv(data)
    assert res.applicable
    assert res.lossless is True


def test_tsv_matches_csv_applicability(dataset):
    c = enc_csv(dataset)
    t = enc_tsv(dataset)
    assert c.applicable == t.applicable


# --------------------------------------------------------------------------- #
# Short-keys map is counted (not hidden): the encoded text contains the map.
# --------------------------------------------------------------------------- #


def test_shortkeys_includes_map_in_payload():
    data = [{"username": "a", "emailAddress": "b"}]
    res = enc_json_shortkeys(data)
    assert "keymap" in res.text  # the map travels with the payload
    assert "username" in res.text and "emailAddress" in res.text
