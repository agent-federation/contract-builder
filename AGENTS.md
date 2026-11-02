# AGENTS.md

Repository instructions for anyone changing this repository — human or automated
agent. English only. Read this before your first change.

## What this repository is

`core001-spec-builder` renders the CORE-001 normative specification from declared
inputs. `spec/` holds the machine-readable inputs and the builder; `spec/output/`
holds the rendered Markdown artifact. The demo slice covers §10.1–10.2 of
`CORE-001.legacy.md`, the read-only source document at the repository root. The
generated Markdown is never the source of truth: structured files under `spec/`
are.

## Commands

Requires Bun 1.4+; `packageManager` pins `bun@1.4.2`, which is also the CI
version. Run everything from the repository root.

```bash
bun install --frozen-lockfile   # install exactly what bun.lock declares
bun run typecheck               # tsc --noEmit
bun test                        # run the test suite
bun run build                   # draft mode; writes spec/output/CORE-001.draft.md
bun run build:release           # release mode; currently exits 1 by design
bun run check                   # build in memory, compare with committed artifact
```

CI (`.github/workflows/ci.yml`, job `check`) runs, in this order:
`bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, `bun run check`.
All four must be green before a pull request can land.

`bun run build:release` exits 1 on purpose. The slice has five
`REVIEW_REQUIRED` diagnostics (unconfirmed normalizations, inferred cases,
editorial classification), so release output is blocked and nothing is written.
That gate is the feature, not a bug — do not loosen it to get a green run.

## The artifact rule

`spec/output/CORE-001.draft.md` is generated; never edit it by hand. After
changing any input under `spec/` (including the template or
`contract-builder.json`) or the profile under `profiles/core001/`, run
`bun run build` and commit the regenerated file. If you skip this,
`bun run check` fails and CI fails with it. The build is
byte-deterministic (no timestamps or absolute paths), so rebuilding an unchanged
specification leaves the working tree clean.

## Layout

- `spec/` — declared inputs (`contract-builder.json`, `sources.yml`,
  `ontology.yml`, `semantics.json`, `decisions.yml`, `conformance/cases.yml`),
  the builder (`build.ts`, `lib/`) and the generated `output/`.
- `profiles/` — `core001/profile.json`, `core001/view.ts`, the validator
  (`validator.ts`, `checks/`, `catalog.json`), the renderer (`renderer.ts`,
  `labels.ru.json`, `templates/`) and document plus entity-kind JSON Schemas
  under `core001/schemas/`.
- `fixtures/` — intentionally broken specs (`broken-modality`,
  `broken-source-drift`, `open-decision`) used by tests and examples.
- `tests/` — `build.test.ts`, `golden.test.ts`, `ir.test.ts`,
  `manifest.test.ts`, `checks.test.ts`, `hook.test.ts`, `renderer.test.ts`,
  `genericity.test.ts`, with golden baselines under `tests/golden/`.
- `docs/` — architecture contract, M1 implementation plan and the design record.
- `CORE-001.legacy.md` — the read-only source document.

## Pull request rules

- Subject line follows Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`,
  `chore:` and so on.
- Body is in English and states what changed and which command proved it
  (for example `bun run check`).
- Never push directly to `main` and never force-push to `main`. `main` is
  protected: the `check` job must pass and the branch must be up to date.
- This project is also worked on by an automated agent (GitHub account
  `it-start`). An agent never merges and never enables auto-merge; a human
  merges every pull request.
- Keep the change focused; do not mix refactors or reformatting into a
  documentation or fix pull request.

## What not to do

- Do not hand-edit `spec/output/CORE-001.draft.md`; edit the inputs and rebuild.
- Do not change `CORE-001.legacy.md` without a decision record covering it. It
  is the source that quotes are checked against.
- Do not add secrets, tokens or credentials to any file.
- Do not reformat unrelated files or rewrite their line endings.
- Do not weaken schemas, diagnostics or fixtures merely to make a failing check
  pass.

## Where specification decisions live

- `spec/decisions.yml` — machine-readable open and closed decisions with source
  references. A provision that depends on an open decision is
  `decision_dependent`, is marked in the draft and blocks release.
- `docs/architecture/engine-public-contract.md` — the engine's public contract.
- `docs/architecture/m1-implementation-plan.md` — the first implementation
  stage (M1) plan.
- `docs/superpowers/specs/2026-11-01-core001-spec-builder-design.md` — design
  record, including unresolved questions.
- `README.md` — user-facing overview of the project.

<!-- entire-agent:begin -->
Read .entire/agent-guide.md for this repository's workflow, source inspection, and verification guidance.
@.entire/agent-guide.md
<!-- entire-agent:end -->
