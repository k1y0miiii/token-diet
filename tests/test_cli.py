"""CLI smoke tests: commands run, exit cleanly, and produce expected artifacts."""

from __future__ import annotations

import json

from token_diet.cli import main


def test_bench_smoke(capsys):
    rc = main(["bench", "--dataset", "users"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "token-diet leaderboard" in out
    assert "json-pretty" in out
    assert "ENCODING" in out and "%vsJSON" in out


def test_bench_tokenizer_o200k(capsys):
    rc = main(["bench", "--dataset", "config", "--tokenizer", "o200k_base"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "o200k_base" in out


def test_bench_json_and_md_artifacts(tmp_path, monkeypatch):
    import token_diet.cli as cli

    monkeypatch.setattr(cli, "RESULTS_DIR", tmp_path)
    rc = main(["bench", "--dataset", "users", "--json", "--md"])
    assert rc == 0
    results_json = tmp_path / "results.json"
    leaderboard_md = tmp_path / "leaderboard.md"
    assert results_json.exists()
    assert leaderboard_md.exists()
    data = json.loads(results_json.read_text())
    assert data["baseline"] == "json-pretty"
    assert "| Encoding |" in leaderboard_md.read_text()


def test_diet_smoke(capsys):
    rc = main(["diet", "datasets/config.json"])
    out = capsys.readouterr().out
    assert rc == 0
    assert "best lossless" in out
    assert "recommended" in out


def test_diet_missing_file():
    rc = main(["diet", "datasets/does-not-exist.json"])
    assert rc == 2


def test_bench_unknown_dataset():
    rc = main(["bench", "--dataset", "nope"])
    assert rc == 2


def test_update_readme(tmp_path, monkeypatch):
    import token_diet.cli as cli

    fake = tmp_path / "README.md"
    fake.write_text(
        "head\n<!-- BENCH:BEGIN -->\nold\n<!-- BENCH:END -->\ntail\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(cli, "README", fake)
    monkeypatch.setattr(cli, "README_RU", tmp_path / "missing.md")
    rc = main(["bench", "--dataset", "users", "--update-readme"])
    assert rc == 0
    text = fake.read_text()
    assert "old" not in text
    assert "| Encoding |" in text
    assert "<!-- BENCH:BEGIN -->" in text and "<!-- BENCH:END -->" in text
