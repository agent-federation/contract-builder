# ODR-ENG-003-E3 — Execution record: contract-builder cleanup after the CORE-001 extraction

**Status:** EXECUTED — E3 of [ODR-ENG-003](ODR-ENG-003-core-001-project-extraction.md), run in
[#320](https://github.com/agent-federation/contract-builder/pull/320) (fixture migration) and
[#321](https://github.com/agent-federation/contract-builder/pull/321) (deletions, splits and
script switch).
**Date:** 2026-11-19 (UTC)
**Executor:** `it-start` (automated agent), per ODR-ENG-003 §3 (E3 assigned to the agent after E2
was green in UIA; UIA pin `6943099` = contract-builder #318, present on `main` before E3 started).
**Scope:** D10 test/fixture classification and migration, deletion of the CORE-001 project, the
artifact check switch to CORE-000, documentation updates. Non-goals of D13 were respected.

## What was done

- **Fixture migration first (#320).** `tests/support.ts` gained `copyEngineProject()` and
  `ENGINE_RENDERERS` (the synthetic `tests/fixtures/engine-project/` project plus the executable
  `profiles/example` profile copied into the temp project). Engine tests that used
  `profiles/core001`/`spec/` as a convenience fixture moved to it: consent, fail-closed, hook,
  renderer, identity, engine-root. `identity.test.ts:692` (identity rendered into the artifact)
  moved to UIA with the project — the only renderer that prints the identity block is the CORE-001
  renderer; the CORE-000 equivalent stays covered by `envelope.test.ts`.
- **Deletions and splits (#321), classified per D10 file by file (split, not guessed):**
  - Deleted: `spec/contract-builder.json`, `spec/sources.yml`, `spec/ontology.yml`,
    `spec/semantics.json`, `spec/decisions.yml`, `spec/conformance/`, `spec/output/`,
    `profiles/core001/`, `CORE-001.legacy.md`, `fixtures/broken-*`, `tests/golden/core001.*`,
    `tests/checks.test.ts`.
  - Kept as engine tests and migrated to the fixture: `build` (ERR_IO block), `envelope`
    (CORE-000 envelope plus body isolation against `profiles/example`), `golden`
    (`emissionOrder()` copy semantics), `ir`, `locale`, `manifest`, `provenance`,
    `unsupported-configurations`, `hook` (the aggregator-ORDER block moved to UIA — it asserted a
    CORE-001 validator internal), `engine-root` (portable rebuild now proves the supplied root's
    modules execute against a poisoned in-project `spec/lib` copy).
  - Moved to UIA with the project: the CORE-001 halves of the split files, the CORE-001 goldens,
    the conformance-vector and coverage checks, the renderer provenance section, the
    committed-artifact conformance block.
- **Artifact check switch.** The `build`, `build:release` and `check` scripts (all CORE-001) are
  gone; `check:all` is `bun test tests/core000.test.ts -t "S2.2 artifact verification"` — the
  CORE-000 artifact gate CI already runs.
- **Genericity guard.** Already extended to the whole `spec/` tree with no CORE-001 path
  references (done before E3); after the deletion it scans an engine-only tree and stays green.
- **Coverage floor.** `profiles/` 87% → 84% with the rationale recorded in CONTRIBUTING.md: the
  largest covered area (`profiles/core001` and its checks) moved to UIA; the engine-owned profiles
  measure 85.17% locally (Bun 1.4.2). Meets the documented policy: a lowered floor states its
  reason in the pull request.
- **Documentation (D9).** `AGENTS.md` rewritten for the engine-only repository; `README.md`,
  `README.ru.md`, `CONTRIBUTING.md`, `docs/repository-map.md`, `docs/agents/task-envelope.md` and
  the pull-request template updated. Live anchors in `implementation-status.md` re-pointed to
  engine-owned tests or annotated "moved with the CORE-001 project to the UIA repository". The
  archive record [ODR-ART-001](ODR-ART-001-artifact-envelope.md) keeps its history with dead
  CORE-001 paths de-linked and an archive note. CORE-000 claims and their historical evidence
  strings were not rewritten (D11); no CORE-000 claim's evidence locator is used by a machine
  check, so no Q9 regeneration was triggered.

## D12 sequencing and deviations

- D12 ordering was respected: E1a (engine loader fix, #318) was on `main` before E3 started; E1/E2
  were green in UIA.
- Deviation, approved by the maintainer: E3 was delivered as two pull requests (#320 fixture
  migration, #321 deletions) instead of one, because the combined diff exceeded the size guideline
  and the deletions are only green after the fixture migration.
- Deviation, approved by the maintainer: the independent-family pre-review was **skipped** for
  #321 as deletion-only (no new engine code, no engine contract surface change); the skip is
  recorded in the pull request per ODR-PROC-002. #320 was tests/docs-only and skipped with the
  same reasoning.

## Exit criteria (epic #220)

| Criterion | Status |
|---|---|
| `contract-builder` builds and checks only engine + CORE-000 artefacts | done: `check:all` = CORE-000 S2.2; no repository-level CORE-001 build |
| engine contains no CORE-001 knowledge; genericity guard covers `spec/`, not only `spec/lib` | done: guard covered the whole tree before E3 and passes on the engine-only tree |
| `CORE-001.legacy.md` no longer exists in this repository | done (deleted in #321) |
| no CI requires a cross-repository build step; the project resolves the engine via `engineRoot` | done: this CI never builds CORE-001; the UIA side pins the engine per D3 |

## Evidence

Per pull request: `bun run lint`, `bun run format:check`, `bun run typecheck`,
`bun run docs:links`, `bun test` (797 pass for #320; 718 pass for #321),
`bun run coverage:check`, `bun run check:all`; CI jobs `check`, `pipeline`,
`pipeline-independent` and CodeQL green on both heads. Residual: the engine test suite leaves its
`mkdtemp` project copies under the system temp directory; tracked as a cleanup tail, not part of
this record's scope.
