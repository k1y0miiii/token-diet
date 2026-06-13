"""token-diet command-line interface."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from token_diet import __version__
from token_diet.bench import (
    DATASETS_DIR,
    results_to_dict,
    run,
)
from token_diet.diet import diet_file
from token_diet.render import (
    render_markdown,
    render_readme_table,
    render_text,
)
from token_diet.tokenizers import (
    TOKENIZERS,
    available_tokenizers,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = REPO_ROOT / "results"
README = REPO_ROOT / "README.md"
README_RU = REPO_ROOT / "README.ru.md"

README_BEGIN = "<!-- BENCH:BEGIN -->"
README_END = "<!-- BENCH:END -->"


def _check_tokenizer(name: str) -> None:
    status = available_tokenizers()
    if status.get(name):
        print(
            f"warning: tokenizer {name!r} could not load its vocab "
            f"({status[name]}).\n"
            "If a sandbox is blocking the tiktoken download, run once with "
            "network access to cache the vocab.",
            file=sys.stderr,
        )


def cmd_bench(args: argparse.Namespace) -> int:
    _check_tokenizer(args.tokenizer)
    try:
        results = run(only_dataset=args.dataset, tokenizer=args.tokenizer)
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if not results:
        print(f"error: no datasets found in {DATASETS_DIR}", file=sys.stderr)
        return 2

    if args.json:
        RESULTS_DIR.mkdir(exist_ok=True)
        out = RESULTS_DIR / "results.json"
        out.write_text(
            json.dumps(results_to_dict(results), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {out}", file=sys.stderr)

    if args.md:
        RESULTS_DIR.mkdir(exist_ok=True)
        out = RESULTS_DIR / "leaderboard.md"
        out.write_text(render_markdown(results) + "\n", encoding="utf-8")
        print(f"wrote {out}", file=sys.stderr)

    if args.update_readme:
        table = render_readme_table(results)
        block = f"{README_BEGIN}\n{table}\n{README_END}"
        updated = 0
        for path in (README, README_RU):
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            pattern = re.compile(
                re.escape(README_BEGIN) + r".*?" + re.escape(README_END),
                re.DOTALL,
            )
            if pattern.search(text):
                path.write_text(pattern.sub(block, text), encoding="utf-8")
                updated += 1
                print(f"updated results table in {path}", file=sys.stderr)
            else:
                print(
                    f"warning: markers {README_BEGIN}/{README_END} not found in "
                    f"{path}; skipped",
                    file=sys.stderr,
                )
        if updated:
            return 0

    # Always print the human leaderboard to stdout.
    print(render_text(results))
    return 0


def cmd_diet(args: argparse.Namespace) -> int:
    _check_tokenizer(args.tokenizer)
    path = Path(args.file)
    if not path.exists():
        print(f"error: file not found: {path}", file=sys.stderr)
        return 2
    try:
        print(diet_file(path, tokenizer=args.tokenizer))
    except json.JSONDecodeError as exc:
        print(f"error: {path} is not valid JSON: {exc}", file=sys.stderr)
        return 2
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="token-diet",
        description="Put your LLM payloads on a token diet — reproducibly "
        "benchmark how many tokens the same data costs in different encodings.",
    )
    p.add_argument("--version", action="version", version=f"token-diet {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    b = sub.add_parser("bench", help="benchmark encoders x datasets x tokenizers")
    b.add_argument("--dataset", help="only this dataset (by file stem)")
    b.add_argument(
        "--tokenizer",
        choices=sorted(TOKENIZERS),
        default="cl100k_base",
        help="tiktoken encoding to measure with (default: cl100k_base)",
    )
    b.add_argument("--json", action="store_true", help="write results/results.json")
    b.add_argument("--md", action="store_true", help="write results/leaderboard.md")
    b.add_argument(
        "--update-readme",
        action="store_true",
        help="regenerate the README results table between markers",
    )
    b.set_defaults(func=cmd_bench)

    d = sub.add_parser("diet", help="show one of YOUR json files in each encoding")
    d.add_argument("file", help="path to a .json file")
    d.add_argument(
        "--tokenizer",
        choices=sorted(TOKENIZERS),
        default="cl100k_base",
        help="tiktoken encoding to measure with (default: cl100k_base)",
    )
    d.set_defaults(func=cmd_diet)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
