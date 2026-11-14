# ODR-ENG-003 — Owner Decision Record: extract the CORE-001 project into the UIA repository

**Status:** PROPOSED — decision requested from the maintainer in
[#220](https://github.com/agent-federation/contract-builder/issues/220); this record becomes durable
when the maintainer merges it. It authorizes the E1/E2 split; implementation starts only after merge.
**Date:** 2026-11-14 (UTC)
**Decision scope:** the ownership move of the CORE-001 project (manifest, inputs, profile, source,
fixtures, tests, goldens and artifact rule) from `contract-builder` to the UIA repository
`agent-federation/uia`, the cross-repository engine binding, the small engine conformance fix it
requires, the licence/CI/documentation obligations, and the sequencing. No engine contract version,
CORE-000 decision, PAP decision or generated artifact changes in this record.
**Baseline:** `contract-builder` main `32b9ed8` (2026-11-13); UIA `main` `69d8acf` (2026-11-13).
**Related:** [#220](https://github.com/agent-federation/contract-builder/issues/220) (epic and scope
comment), [#223](https://github.com/agent-federation/contract-builder/issues/223) (prerequisite,
closed), [#221](https://github.com/agent-federation/contract-builder/issues/221) (packaging epic,
blocked by this), [#170](https://github.com/agent-federation/contract-builder/issues/170) streams B–D,
[ODR-ENG-001](ODR-ENG-001-engine-identity-boundary.md) (engine identity, portability and import
mapping), [ODR-ENG-002](ODR-ENG-002-consumer-supplied-renderer.md) (consumer-supplied renderer),
[engine contract §5.7/§8.1](../architecture/engine-public-contract.md),
[`m1-implementation-plan.md`](../architecture/m1-implementation-plan.md) (current layout debt), and
UIA issue [#54](https://github.com/agent-federation/uia/issues/54) (licence/publication model).

## 1. Context

`contract-builder` grew out of the CORE-001 vertical. The project data lives in `spec/` and the
executable profile in `profiles/core001/`, while the engine also lives inside the project directory
(`spec/lib/`, `spec/build.ts`, `spec/cli-renderers.ts`). The M1 plan records this as temporary debt
("ENGINE (temporary home; moves at the M2 split)").

The CORE-001 normative source already has a canonical home: UIA's `docs/CORE-001.md` is
**byte-identical** to `contract-builder`'s `CORE-001.legacy.md`
(`sha256:f40876bb…98db1`, verified 2026-11-14). Keeping both copies is duplication, and the engine's
contract fixes `spec/lib` as the engine-root layout, so the engine cannot move before the project
does.

A feasibility proof was run on 2026-11-14 (read-only; temp copy under `.agents/`, no repository
change), using the **target UIA layout**:

- project `contracts/core-001/` (manifest + declared inputs), profile `profiles/core001/` at the
  repository root, source `../../docs/CORE-001.md`, engine checkout supplied as `engineRoot`;
- the build **succeeds** (`exit 0`, `blockedBy: null`, identity present) with `engineVersion`
  `0.1.0`; closure validation returns clean; the profile and renderer are loaded through the engine
  import mapping with **no import rewriting and no `spec/lib` symlink**;
- the generated CORE-001 artifact differs from the committed one in **exactly two lines**: the
  provenance header `Исходный файл` (`CORE-001.md` instead of `CORE-001.legacy.md`) and the
  `inputDigest` (`sha256:34a583…8ae73` instead of `sha256:e3dba9…830d0`); every other byte is
  identical;
- **one gap was found**: the CLI's consumer-renderer loader (`spec/cli-renderers.ts`
  `loadProfileRenderers`) validates the profile closure with the engine import mapping but imports
  the renderer module **outside** `withEngineImportMapping`, so a renderer module outside the engine
  checkout cannot import engine modules (`Cannot find module '../../spec/lib/…'`). Profile
  `view`/`validator` modules do not have this gap because `runBuild` wraps the whole profile build in
  the mapping.

## 2. Decision

**D1 — UIA is the long-term home of the CORE-001 project; `contract-builder` stays the engine.**
Move the project, keep the engine: `contract-builder` keeps `spec/lib`, `spec/build.ts`,
`spec/cli-renderers.ts`, `contracts/core000`, `profiles/core000`, `pap/`, `pipeline/` and the engine
tests/fixtures. UIA owns the CORE-001 manifest, inputs, profile, source, fixtures, tests, goldens and
the artifact rule.

**D2 — Target UIA layout.**

```text
uia/
  contracts/core-001/            project root: contract-builder.json, inputs,
                                 conformance/, output/CORE-001.draft.md, run.ts, engine.lock.json
  profiles/core001/              external profile, unchanged relative imports (../../spec/lib/…)
  docs/CORE-001.md               the single canonical source (already present)
  contract-builder/              git-ignored engine checkout at the pinned commit (CI; local dev
                                 may symlink the sibling checkout)
```

The manifest keeps `profile.source: "../../profiles/core001", external: true` and
`sources[0].path: "../../docs/CORE-001.md", external: true`; the project root is
`contracts/core-001`, the layout root is the UIA repository root, so the authored profile imports
`../../spec/lib/...` normalize inside the layout root and the engine's lexical `spec/lib` mapping
loads them from `engineRoot` exactly as ODR-ENG-001 B2 specifies. No import rewriting, no
`lockfileRoot`, no source-tree symlink is part of the design.

**D3 — Engine binding.** UIA records the engine pin in `contracts/core-001/engine.lock.json`
(`repository`, `commit`, `version`). CI checks out `agent-federation/contract-builder` at that commit
into `contract-builder/`, installs its dependencies with `--frozen-lockfile`, and asserts
`git rev-parse HEAD` and `package.json` version match the pin. Local development uses a sibling
checkout `../contract-builder` (or the same directory via an untracked symlink) and the documented
setup script. This is a **setup checkout**, not a cross-repository build step: the engine is passed
as `engineRoot`; it is not published yet ([#221](https://github.com/agent-federation/contract-builder/issues/221)).

**D4 — Small engine conformance fix (E1a).** Fix `loadProfileRenderers` so the consumer-supplied
renderer module is imported inside the already-created `withEngineImportMapping` scope (and after
`installEngineImportPlugin()`), exactly like the profile `view`/`validator` modules. This makes a
renderer module that lives outside the engine checkout executable without a symlink or import
rewrite, which is the ODR-ENG-001 B2 / ODR-ENG-002 intent. One regression test with an external
profile renderer importing an engine module; no contract text change (implementation conformance).
This is the only `contract-builder` code change before E3.

**D5 — Lockfile authority.** The engine's `bun.lock` remains the closure/identity authority for the
profile (`nunjucks@3.2.4` is pinned there). UIA adds `nunjucks@3.2.4` and `@types/nunjucks` to its own
`package.json`/lockfile for execution and typecheck, plus a CI check that the UIA `nunjucks` version
equals the version pinned in the engine checkout's lockfile. No `lockfileRoot` change and no second
closure authority.

**D6 — Engine version and drift.** The build reports `engineVersion` from `engineRoot/package.json`.
UIA CI verifies the pinned commit and version; a scheduled freshness check reports when
`agent-federation/contract-builder` `main` has moved beyond the pin (drift is visible, not silent).
The pin advances by a reviewed UIA pull request, never automatically.

**D7 — Artifact identity change is accepted and reviewed, not hidden.** The new manifest/source
paths change `inputDigest`; the provenance header names `CORE-001.md`. The feasibility proof shows
exactly those two differing lines and no other byte change. E2 records the new golden and reviews the
diff line by line; a content change beyond these two lines blocks E2.

**D8 — Licence and provenance.** The extracted CORE-001 code and data remain under
`contract-builder`'s Apache-2.0 licence. E1 adds a repository `LICENSE` (Apache-2.0) and a short
`NOTICE`/README attribution to UIA before E2 moves code. This does **not** decide UIA issue
[#54](https://github.com/agent-federation/uia/issues/54) (research artifact vs shippable library,
versioning/publication); if #54 later chooses a different licence, the maintainer resolves it before
E2 merges. No file in `contract-builder` changes licence.

**D9 — Documentation ownership.** Move to UIA: the CORE-001 project README/harness notes (new), the
CORE-001 design record (`docs/superpowers/specs/2026-11-01-core001-spec-builder-design.md` (or its UIA successor)), and the CORE-001-specific
M1 plan sections needed to maintain the project. Keep in `contract-builder`: the engine public
contract, CORE-000 records, PAP records, delivery governance and historical audit trails; update
live links and status rows in `implementation-status.md`, `README*`, `docs/repository-map.md`,
`AGENTS.md`. Historical decision/audit documents stay in `contract-builder` as archive with links to
the UIA home; they are not rewritten.

**D10 — Test and fixture classification.** Move with the project: CORE-001-specific build, checks,
golden, provenance, renderer, envelope and consent/validation tests, CORE-001 goldens and
CORE-001-derived fixtures. Keep as engine tests: manifest, IR, relations, hook, diagnostics, locale,
identity/engine-root, fail-closed, docs-freshness, PAP/CORE-000 tests. Engine tests that currently
use `profiles/core001`/`spec/` as a convenience fixture migrate to `profiles/example` or a small
synthetic engine project fixture. The engine genericity guard extends from `spec/lib` to the whole
`spec/` tree and must not reference CORE-001 paths. E3 classifies each file explicitly; a file with
both engine and project concerns is split rather than guessed.

**D11 — CORE-000 history.** CORE-000 claims whose evidence strings name CORE-001 paths
(`profiles/core001/...`, `tests/...`) remain historical records of the accepted design baseline and
are not rewritten. Live links in `implementation-status.md` are updated; if any CORE-000 claim's
*evidence locator* is used by a machine check, E3 regenerates CORE-000 with Q9 and reviews the diff.

**D12 — Sequence, authorization and ownership.** E0 (this record) → E1a (engine loader fix) +
E1 (UIA scaffold) → E2 (UIA move, green artifact rule) → E3 (contract-builder cleanup) → E4 (tail).
`contract-builder` is not modified beyond E1a until the UIA build is green. E1/E2 are authorized by
this record; E3 starts only after E2 is green and reviewed.

**D13 — Non-goals.** npm/npx packaging ([#221](https://github.com/agent-federation/contract-builder/issues/221)/[#222](https://github.com/agent-federation/contract-builder/issues/222)),
relocating `spec/lib` out of `spec/` (#221), renaming `contracts/` to `self-contract/`, data-only
profiles, multi-source manifests, and any change to the engine contract, RFC or CORE-000 decision
surface.

## 3. Cross-repository access and work split

The UIA repository is `agent-federation/uia` (public; admin: maintainer; `it-start` has **read-only**
access, verified 2026-11-14 after the repository moved from `zaebee/federation-agents`). **The
automated agent `it-start` cannot push there today.** Until the maintainer grants write access or
executes the UIA-side work, the split is:

| Slice | Repository | Executor |
|---|---|---|
| E1a engine loader fix | `contract-builder` | `it-start` (agent) |
| E1 UIA scaffold, E2 UIA move | `agent-federation/uia` | maintainer (or a session with UIA write access); `it-start` has read-only access |
| E3 `contract-builder` cleanup | `contract-builder` | `it-start` (agent), after E2 is green |
| E4 tail | `agent-federation/uia` | maintainer/session with write access |

If the maintainer adds `it-start` as a UIA collaborator, E1/E2 can be dispatched with the same task
envelopes; this record does not assume that access.

## 4. Evidence and verification

The feasibility proof (2026-11-14) ran `runBuild` against a temp copy of the target layout with the
engine at `contract-builder` `32b9ed8`:

- `exit 0`, `blockedBy: null`, identity `{projectId: uia-core-001, engineVersion: 0.1.0,
  inputDigest: sha256:34a583…8ae73, extensions: [profile core001, adapter markdown, renderer
  core001-markdown]}`;
- `validateProfileClosure` returned clean with the engine import mapping; the profile renderer was
  loaded from the external profile and its engine imports resolved from `engineRoot` with no
  `spec/lib` symlink and no source rewriting;
- artifact diff against the committed CORE-001 artifact: exactly the two lines named in D7;
- the loader gap in D4 reproduced as `Cannot find module '../../spec/lib/diagnostics.js'` when the
  renderer is imported without the mapping scope, and disappeared when the mapping/plugin is
  installed.

Acceptance for E1/E2 (binding): the UIA build produces the same CORE-001 **content** as today except
D7's two lines; the UIA CI enforces the artifact rule and the engine pin; `contract-builder` after E3
builds/checks only engine + CORE-000; `CORE-001.legacy.md` is gone from `contract-builder`; no
cross-repository build step in either CI.

## 5. Risks and open items

- **Engine-loader fix is a contract-critical change**: independent pre-review (`glm-5.3-flash` +
  `glm-5.3` escalation, `spec/cli-renderers.ts`/`spec/lib/identity` surface) is required before merge.
- **UIA CI cost/complexity**: a second checkout and install; the pin/drift check must fail clearly.
- **Test migration effort**: engine tests using CORE-001 as a fixture are the largest hidden cost;
  E3 is split if it exceeds the size guideline.
- **Docs link surface**: many live links in `implementation-status.md`/README point at
  `profiles/core001`; E3 updates them and the docs-freshness check must stay green.
- **Licence**: D8 is a recommendation; UIA #54 remains the owner decision for the repository's
  publication model.

## 6. Approval

The maintainer's scope comment in
[#220](https://github.com/agent-federation/contract-builder/issues/220) requested this
decision; merging this record approves D1–D13, E1a/E1/E2 authorization and the D8 licence
recommendation. It does not approve E3 implementation beyond the described cleanup, and it does not
change the engine contract, RFC or CORE-000.
