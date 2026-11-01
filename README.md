# CORE-001 spec builder (MVP)

Сборщик машинно-читаемой нормативной спецификации. Источник истины — структурированные файлы в `spec/`; Markdown — генерируемый артефакт.

Демонстрационный срез — реальный фрагмент `CORE-001.legacy.md` §10.1–10.2 (Temporal Reference Model). Предметная логика CORE-001 не реализуется: прототип проверяет архитектуру и гарантии сборки на настоящем нормативном материале.

Правила для контрибьюторов и агентов: [AGENTS.md](AGENTS.md).

## Быстрый старт

```bash
bun install
bun run build          # draft → spec/output/CORE-001.draft.md
bun test               # 41 тест
bun run check          # артефакт соответствует модели?
bun run build:release  # release (сейчас намеренно заблокирован)
```

Требуется Bun 1.4+. Зависимости ставятся и код запускается через Bun; тесты написаны на API `node:test`, который Bun исполняет.

## Команды

| Команда | Что делает |
|---|---|
| `bun run build` | `--mode draft`: собирает и записывает `spec/output/CORE-001.draft.md`, exit 0 при отсутствии ERROR |
| `bun run build:release` | `--mode release`: пишет `spec/output/CORE-001.md` только если нет ERROR и REVIEW_REQUIRED |
| `bun run check` | собирает в память и сравнивает с сохранённым артефактом |
| `bun test` | тесты сборщика |
| `bun run typecheck` | `tsc --noEmit` |
| `bun spec/build.ts --spec <dir> --no-write --json` | сборка произвольной спецификации с машиночитаемой диагностикой |

## Структура

```text
.github/workflows/ci.yml        typecheck + tests + --check
bun.lock                        lockfile Bun
CORE-001.legacy.md              исходный документ, только читается
spec/
  contract-builder.json         манифест проекта: входы, источник, профиль, выходы
  build.ts                      CLI
  lib/
    build.ts                    оркестрация сборки
    manifest.ts                 манифест, профиль и границы проекта
    load.ts                     чтение объявленных входов
    schema.ts                   JSON Schema (ajv): документы и виды сущностей
    ir.ts                       общий IR: сущности, индексы, извлечение
    relations.ts                объявления и разрешение связей
    provenance.ts               прямые привязки происхождения
    semantic.ts                 ID, ссылки, цитаты, модальность, зависимости
    render.ts                   Nunjucks + нормализация байтов
    diagnostics.ts              ERROR / REVIEW_REQUIRED / WARNING
    guards.ts                   общие проверки типов
    source.ts                   SourceDocument и SourceAdapter
    adapters/markdown.ts        локаторы markdown и адаптер источника
  sources.yml                   границы среза и дословные фрагменты
  ontology.yml                  документ и термины
  semantics.json                нормативные положения
  decisions.yml                 открытые и решённые вопросы
  conformance/cases.yml         декларативные векторы
  templates/core001.md.j2       шаблон
  output/CORE-001.draft.md      сгенерированный артефакт
profiles/core001/
  profile.json                  виды, связи, происхождение, привязки документов
  view.ts                       типы представления CORE-001
  schemas/*.schema.json         схемы документов и схемы видов сущностей
tests/build.test.ts
tests/manifest.test.ts          манифест и границы проекта
tests/ir.test.ts                IR, связи и происхождение
tests/golden.test.ts            эталонная сборка CORE-001
fixtures/
  broken-modality/              violated выведен из permission
  broken-source-drift/          цитата не найдена в legacy
  open-decision/                положение зависит от открытого решения
docs/superpowers/specs/2026-11-01-core001-spec-builder-design.md
```

## Модель в одном экране

| Ось | Поле | Смысл |
|---|---|---|
| источник | `source_quote`, `source_ref`, `fragment` | дословный текст и его место |
| лексика | `source_modality` + `modality_marker` | MUST / MAY / «не означает» и точный маркер из цитаты |
| эффект | `normative_effect` | обязанность, запрет, разрешение, отрицание вывода, семантическое ограничение, утверждение об области |
| основание | `classification_basis.kind` + `quote` | дословно или редакторский вывод, с точной цитатой |
| нормализация | `normalization_status` (derived) | `verbatim`, `paraphrase_reviewed`, `paraphrase_pending` |
| применимость | `applicability` (derived) | `determined` или `decision_dependent` |
| решение | `decision_dependencies` / `decision_mentions` | зависимость ≠ упоминание |

Кейс описывается двумя осями: `expected_outcome` (satisfied / violated) и `source_determination` (determined / inferred / underdetermined / not_asserted_by_source).

`normalized_statement` может отличаться от источника только с явными `explications[]`; иначе — `ERR_UNEXPLAINED_PARAPHRASE`.

## Гарантии

| Гарантия | Как проверяется |
|---|---|
| стабильные уникальные ID | глобальная проверка дубликатов, `ERR_DUPLICATE_ID` |
| целостность ссылок | термины, фрагменты, решения, положения, кейсы, `ERR_UNKNOWN_REF` |
| цитата действительно из источника | поиск в legacy без учёта пробелов, `ERR_SOURCE_QUOTE_NOT_FOUND` |
| цитата находится в объявленном месте | `source_ref` разбирается как раздел / строка таблицы / пункт списка, `ERR_SOURCE_LOCATOR_MISMATCH`, `ERR_SOURCE_LOCATOR_UNKNOWN` |
| срез не расширяется молча | `slice.includes` / `slice.excludes`, `ERR_OUT_OF_SLICE_CONTENT` |
| модальность не усиливается | матрица `source_modality × normative_effect`, `ERR_MODALITY_UPGRADE` |
| violated не выводится из MAY | отдельная проверка кейсов, `ERR_MODALITY_UPGRADE` |
| пересказ помечен | сравнение текста + `explications[]`, `ERR_UNEXPLAINED_PARAPHRASE` |
| открытое решение не становится нормой | `REVIEW_OPEN_NORMATIVE_DEPENDENCY`, release-гейт |
| детерминизм | нет времени и путей в выводе, фиксированный порядок, побайтовое сравнение |
| отсутствие «додумывания» | обязательные поля, `throwOnUndefined`, дословные подстроки, никаких значений по умолчанию |

## Трассируемость

```text
CORE-001.legacy.md
  └─ FRAG-10.2-P4-5-REVOCATION        дословная цитата, проверена по файлу
       └─ REQ-REVOCATION-NOT-AUTO-INVALID
            ├─ DEC-TRUSTED-TIME        упоминание, не зависимость
            ├─ CASE-…-POS-1 / UNDET-1 / UNDET-2 / NAS-1
            └─ раздел «REQ-REVOCATION-NOT-AUTO-INVALID» в CORE-001.draft.md
```

Матрица `фрагмент → source_ref → положение → решения → векторы` печатается в приложении A сгенерированного документа. Приложение B — диагностика сборки.

## Режимы

- **draft** — допускает открытые решения и неподтверждённую нормализацию; каждое такое положение помечено в документе. Exit 0, если нет ERROR.
- **release** — запрещает выпуск при ERROR, при `REVIEW_REQUIRED` (открытая нормативная зависимость, неподтверждённый пересказ, редакторская классификация, логический вывод в кейсе). Артефакт не записывается.

Сейчас `release` заблокирован намеренно: в срезе 5 диагностик `REVIEW_REQUIRED` (2 неподтверждённые нормализации, 2 выведенных кейса, 1 редакторская классификация). Это демонстрация того, что сборщик не выдаёт неподтверждённое за норму.

## Пример намеренно повреждённой спецификации

```bash
bun spec/build.ts --spec fixtures/broken-modality/spec --no-write
```

Ожидаемый результат (exit code 1):

```text
Сборка: mode=draft · spec=fixtures/broken-modality/spec
DIAG: ERROR=1 · REVIEW_REQUIRED=5 · WARNING=9

ERROR ERR_MODALITY_UPGRADE conformance/cases.yml#/cases/4/expected_outcome
  Кейс "CASE-REQ-REVOCATION-NOT-AUTO-INVALID-UNDET-2" ожидает violated, опираясь на permission. Это превращает разрешение или утверждение об области в обязанность.

Результат: сборка остановлена. Артефакт не записан.
```

Другие фикстуры:

- `fixtures/broken-source-drift/spec` → `ERR_SOURCE_QUOTE_NOT_FOUND` (цитата в spec не совпадает с источником);
- `fixtures/open-decision/spec` → draft проходит с `REVIEW_OPEN_NORMATIVE_DEPENDENCY`, release блокируется.

## Ограничения MVP

- Conformance-векторы декларативны и не исполняются. Это осознанно: исполнитель потребовал бы языка правил внутри JSON.
- Нормативный эффект классифицирует человек; сборщик проверяет только согласованность и требует ревью для спорных случаев.
- Локатор источника привязан к разделу (и строке таблицы / пункту списка), но не к диапазону строк и не к хешу содержимого. Цитата внутри одного раздела может пересекать границу абзацев.
- Схема допускает ровно один источник; multi-source явно не поддерживается.
- Один `review.status` подтверждает нормализацию, классификацию и интерпретацию кейса сразу. Разделение этих подтверждений — следующий шаг.
- `Credential` упоминается в §10.2, но определён в §4 — вне среза, поэтому не моделируется и даёт WARNING.
- `source_ref` для таблиц и списков — конвенция (`#10/table/<name>`, `#15/5`), а не схема.
- Ревью фиксируется строкой `reviewed_by`, без криптографической привязки.

Полный список нерешённых вопросов — в [design doc](docs/superpowers/specs/2026-11-01-core001-spec-builder-design.md).

Архитектурный контракт движка: [docs/architecture/engine-public-contract.md](docs/architecture/engine-public-contract.md).

План первого этапа реализации (M1): [docs/architecture/m1-implementation-plan.md](docs/architecture/m1-implementation-plan.md).
