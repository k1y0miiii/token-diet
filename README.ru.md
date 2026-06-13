[English](README.md) · Русский

> ▶ **Живая песочница** — вставьте JSON и смотрите, как падает счётчик токенов: **https://k1y0miiii.github.io/token-diet/**

[![Песочница token-diet — посмотри, во сколько обходится твой JSON, и посади его на диету](docs/playground.gif)](https://k1y0miiii.github.io/token-diet/)

# token-diet

[![CI](https://github.com/k1y0miiii/token-diet/actions/workflows/ci.yml/badge.svg)](https://github.com/k1y0miiii/token-diet/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)

> **Посадите свои LLM-данные на токеновую диету.** Одни и те же данные, измеренные в каждой кодировке, — чтобы перестать гадать и начать сокращать счёт за токены.

Большинство приложений отправляют в LLM красиво отформатированный JSON. Это самый дорогой способ передать структурированные данные. **token-diet** реально измеряет, во сколько токенов обходятся одни и те же данные в разных кодировках (минифицированный JSON, короткие ключи, [JTF](https://github.com/k1y0miiii/json-token-format), CSV/TSV, YAML), и строит воспроизводимую таблицу лидеров. Числа считаются через `tiktoken` и никогда не выдумываются.

## Таблица лидеров (реально измерено)

<!-- BENCH:BEGIN -->
Tokenizer `cl100k_base` (GPT-3.5 / GPT-4), baseline `json-pretty`, summed across 6 bundled datasets. Measured with tiktoken — reproduce with `token-diet bench`.

| Encoding | Tokens | %vsJSON | Lossless | Notes |
|---|---:|---:|:---:|---|
| `jtf` | 8533 | -39.8% | yes | summed over all datasets |
| `json-min` | 8709 | -38.5% | yes | summed over all datasets |
| `json-shortkeys` | 8939 | -36.9% | yes | summed over all datasets |
| `yaml` | 10829 | -23.6% | yes | summed over all datasets |
| `json-pretty` | 14170 | baseline | yes | summed over all datasets |
| `csv` | N/A | - | - | N/A for at least one dataset |
| `tsv` | N/A | - | - | N/A for at least one dataset |
<!-- BENCH:END -->

Воспроизвести одной командой:

```bash
python3 -m pip install -e ".[dev]"
token-diet bench
```

## Зачем

- **Счёт за токены растёт вместе с их числом.** Красивый JSON примерно вдвое тяжелее минифицированного, а табличные форматы для массивов объектов экономят ещё больше.
- **Контекстное окно конечно.** Меньше токенов на полезную нагрузку — больше места для самого рассуждения.
- **Люди гадают.** «Минифицируем, наверное поможет?» — token-diet заменяет догадку измеренным числом для вашей формы данных.

## Как это работает (воспроизводимо)

Каждый кодировщик сериализует **одни и те же** разобранные данные, после чего токены считаются через `tiktoken`. Базой служит `json-pretty` (indent=2) — то, что приложения отправляют по умолчанию. Всё честно:

- `lossless` проверяется реальным круговым обходом `decode(encode(x)) == x` там, где есть декодер (варианты JSON, JTF, CSV/TSV для плоских таблиц).
- Карта коротких ключей и заголовок CSV едут вместе с полезной нагрузкой и учитываются в токенах. Ничего не прячется ради красивого числа.
- Кодировки, неприменимые к форме данных (CSV для вложенных структур, YAML без `pyyaml`), помечаются **N/A**, а не фальшивым числом.

> Счёт токенов опирается на `tiktoken` (семейство GPT: `cl100k_base` для GPT-3.5/4, `o200k_base` для GPT-4o/o-series) как на приближение. Claude и другие модели токенизируют иначе — для точного счёта по Claude используйте [`llmcost --api`](https://github.com/k1y0miiii/llmcost).

### Какие кодировки сравниваются

| Кодировка | Что это | Lossless | Нужен парсер на приёме? |
|---|---|:---:|:---:|
| `json-pretty` | `indent=2` — база по умолчанию | да | нет (нативно) |
| `json-min` | минификация, `separators=(",",":")` | да | нет (нативно) |
| `json-shortkeys` | минификация + lossless-карта ключей (карта учтена) | да | да (применить карту) |
| `jtf` | [JSON Token Format](https://github.com/k1y0miiii/json-token-format), реальный вендоренный кодировщик | да | да (декодер JTF) |
| `csv` / `tsv` | только плоские массивы объектов, иначе N/A | для строковых ячеек | да |
| `yaml` | человекочитаемо, обычно *больше* токенов, чем JSON | да | да |

## Воспроизвести

```bash
# 1. установка (editable, с dev-инструментами)
python3 -m pip install -e ".[dev]"

# 2. полная таблица лидеров (все датасеты, cl100k_base)
token-diet bench

# 3. сменить семейство токенизатора (GPT-4o / o-series)
token-diet bench --tokenizer o200k_base

# 4. один датасет, записать машиночитаемые артефакты
token-diet bench --dataset users --json --md
#   -> results/results.json, results/leaderboard.md

# 5. перегенерировать таблицу в этом README (без ручного ввода)
token-diet bench --update-readme

# 6. посадить на диету ВАШ файл
token-diet diet path/to/your.json
```

`pyyaml` опционален — установите его, чтобы добавить строку `yaml`:

```bash
python3 -m pip install -e ".[dev,yaml]"
```

## Ежедневно: `token-diet diet`

Наведите на свой файл и сразу увидите выигрыш:

```text
$ token-diet diet datasets/users.json
file      : datasets/users.json
tokenizer : cl100k_base (GPT-3.5 / GPT-4)
baseline  : json-pretty = <N> tokens

ENCODING          TOKENS   %vsJSON  LOSSLESS NOTES
...
best lossless   : jtf (<N> tokens, ... = ...% vs JSON)  <- recommended
```

## Плейбук — как сократить счёт за токены

Готовые к копированию приёмы, **сначала самые крупные выигрыши**. Полная версия с компромиссами — в [PLAYBOOK.ru.md](PLAYBOOK.ru.md). Честное правило: **измеряйте, а не гадайте** — запустите `token-diet diet your.json` до выбора формата.

| № | Приём | Примерный эффект | Lossless? | Читаемо? | Нужен парсер? |
|---|---|---|:---:|:---:|:---:|
| 1 | **Табличный формат для массивов объектов** (JTF / CSV) — убрать повтор ключей | большой на строковых данных | да (JTF) / только строки (CSV) | частично | да |
| 2 | **Минификация JSON** — убрать отступы и пробелы | средний, бесплатный | да | хуже | нет |
| 3 | **Удалить null и пустые поля** до отправки | средний | lossy (намеренно) | да | нет |
| 4 | **Сократить повторяющиеся ключи** через карту | средний при повторе ключей | да (с картой) | нет | да |
| 5 | **Веб → чистый текст** вместо сырого HTML | до ~8× на веб-контенте | lossy | да | да |
| 6 | **Кэширование промпта** — кэшировать стабильный префикс | огромный при повторных вызовах | n/a | n/a | n/a |
| 7 | **Гигиена контекста** — отправлять только нужное | разный, часто большой | n/a | n/a | n/a |
| 8 | **Структурированный вывод** — ограничить *ответ*, а не только вход | средний | n/a | n/a | n/a |

- **Веб → чистый текст:** сырой HTML — это в основном теги и шум. Извлечение чистого текста/markdown срезает примерно в 8 раз — см. [glyph-mcp](https://github.com/k1y0miiii/glyph-mcp).
- **Точный счёт по Claude:** tiktoken здесь — приближение для GPT. Для реального учёта токенов и цены по Claude API используйте [llmcost](https://github.com/k1y0miiii/llmcost).

## Авторство и экосистема

Сделал **Максим Чумаков** ([@k1y0miiii](https://github.com/k1y0miiii)).

- [json-token-format (JTF)](https://github.com/k1y0miiii/json-token-format) — lossless-кодировка JSON с экономией токенов, измеряется здесь (вендоренная).
- [glyph-mcp](https://github.com/k1y0miiii/glyph-mcp) — веб → чистый текст для LLM (~8× меньше токенов на веб-страницах).
- [llmcost](https://github.com/k1y0miiii/llmcost) — точный учёт токенов и цены LLM, включая Claude через `--api`.

## Лицензия

MIT © 2026 Максим Чумаков. Вендоренный `token_diet/vendor/jtf.py` — эталонный кодировщик JTF, тоже под MIT.
