# Delivery governance and architectural debt (stream D)

**Status:** proposal for maintainer decision (design note). Decisions **D1–D8** at the end are the ones to accept or change before implementation. No code is prescribed here.
**Scope:** release/versioning, quality and security gates, documentation automation, the agent/PR operating model, the debt register, structural debt, and the PAP verifier packaging boundary.
**Related:** audit umbrella #137, architecture streams #170 (stream D), audit report `AUDIT-2026-11-05-code-quality.md`, ODR-PROC-001 (branch protection), ODR-PROC-002 (independent pre-review), `docs/agents/pre-review.md`.

## 1. The problem

The audit scored delivery governance at **6/10** (green CI, branch protection, but no lint/security/coverage gates) and releases/versioning at **2/10** (no tags, releases or CHANGELOG; the engine, profile and project versions happen to share `0.1.0`, with no policy separating those domains). The gates that exist are good and should be kept; what is missing is a *policy* for what a release is, which checks are mandatory, how documentation freshness is automated beyond one claim-count sentence, how agent-authored PRs are bounded, where debt lives, and which structural debt is worth paying down now.

The current state (verified at `main` `81d1e6f`):

| Area | State |
|---|---|
| CI | `check` (install, `bun audit`, typecheck, `bun test`, `check:all`), `pipeline` (deterministic pack, verify, gate, tamper check), `pipeline-independent` (three pinned independent verifiers, non-blocking); pinned action SHAs, concurrency, 15/30-min timeouts, coverage **informational only** |
| Branching | `main` protected: `check` required, Code Owner review, conversation resolution, pushes/merges restricted to maintainer; independent-family pre-review required for code PRs (ODR-PROC-002) |
| Release | no tags, no GitHub releases, no CHANGELOG, no version-domain policy/check (engine package, profile and project revision are independent domains that currently share `0.1.0`); `build:release` exits 1 by design (5 `REVIEW_REQUIRED`); PAP verifier is an in-repo dev script (RFC §9.1 packaging boundary open) |
| Lint/format | no linter, formatter or `.editorconfig`; edits are checked only by `tsc` and tests |
| Docs automation | `tests/docs-freshness.test.ts` checks one claim-count sentence; no link checker, no status-matrix snapshot check for engine changes |
| Templates | `.github/CODEOWNERS` + one workflow; no PR/issue templates, no PR-size or branch-naming rule in-repo for agents |
| Structural debt | `pap/src/verify.ts` 1515 lines, `spec/lib/identity.ts` 1761; duplicated `MemoryLoader`/`finalize`/`countSeverity` in both renderers; `text()` copied in ~8 profile files; `isObject` in `pap/src/decode.ts`, `spec/lib/guards.ts` and profile locals; tests leave temp directories (audit measured ~221 dirs / ~466 MB per full run) |

## 2. Principles

1. **Keep the gates that work.** Determinism, `check:all`, the verdict/gate model, the independent pre-review and branch protection are assets; stream D adds policy around them, it does not weaken them.
2. **Automate, don't document what a check can enforce.** A rule that matters becomes CI or a test; prose is for *why*.
3. **One concern per PR.** Formatting, refactors and behaviour changes never share a diff.
4. **Fail closed, measure honestly.** Coverage is not a goal by itself; PAP runs through a spawned CLI, so an in-process percentage for `pap/` is misleading (the audit measured `manifest.ts` at ~3.31% for that reason).
5. **The release gate is the feature.** A red `build:release` is the intended state until the normative slice is ready; no release policy may relax it.

## 3. Decisions

### D1 — Release and versioning: MVP without public releases, with an engine-version check (independent version domains)

There is no publishable consumer yet (private package, in-repo verifier, draft artifacts). **Three version domains are independent and must not be synchronised:**

| Domain | Authoritative field | Meaning |
|---|---|---|
| Engine version | `package.json` `version`, read by `readEngineVersion` and embedded in `BuildResult.identity.engineVersion` | the engine release |
| Profile version | `profiles/*/profile.json` `version` | the profile's own evolution |
| Project revision | `contracts/*/contract-builder.json` `project.revision` | the particular project/content revision |

They currently coincide (`0.1.0`) only by accident; the canonical contract already shows the distinction — its CORE-001 example has `project.revision: 0.3.3` with `profile.version: 0.1.0`. A sync rule that forces them equal would encode an invalid coupling.

Recommendation: **declare "MVP without public releases"** explicitly for now, and add a machine check only within the **engine** domain: the engine version in `package.json` matches the `engineVersion` read/recorded in build identity/provenance (and, once releases exist, the release tag). Profile versions and project revisions are checked for being present and well-formed, never for equalling the engine version. When a release is actually needed, adopt:

- semver tags `vX.Y.Z` on `main` referring to the **engine** release, annotated, plus GitHub Release notes that list the profile version(s) and project revision(s) shipped alongside it;
- `CHANGELOG.md` generated from Conventional Commits (release-please or `git-cliff`), not hand-maintained;
- release artifacts: CORE-001 draft, CORE-000 draft, PAP verifier (when D8 says it is publishable), each with a checksum;
- a release checklist: all required checks green, no `REVIEW_REQUIRED` where the release claims release-mode output, independent pre-review recorded, evidence refreshed if the package/contract changed.

The normative `build:release` gate stays exactly as is: a release of *tooling* may ship while the CORE-001 release artifact stays blocked, and the release notes must say so.

### D2 — Lint/format: Biome, one tool, one baseline commit

Adopt **Biome** (lint + formatter in one fast Bun-friendly binary) over ESLint+Prettier; add a `biome.json`, `bun run lint`/`format`/`format:check`, and a CI step. Migration policy:

1. one dedicated formatting commit (no logic), then add the CI check — never mix formatting with a feature;
2. start with the recommended rules minus rules that fight the existing style, ratchet later;
3. generated artifacts (`spec/output/`, `contracts/core000/output/`) are excluded; templates are checked as text.

If the maintainer prefers ESLint+Prettier, the migration policy is the same; the decision is the tool, not the sequence.

### D3 — Quality and security gates: add only what is measurable

Add, in this order:

1. Biome check (D2) and a **docs link checker** (lychee or linkinator) for `docs/**`, `README*.md`, `CONTRIBUTING.md`, and the artifact links;
2. **coverage**: keep the lcov upload, set a threshold only for the areas measured in-process (`spec/`, `profiles/`, `pipeline/`); exclude `pap/` from an in-process threshold and, if desired, add a small CLI-level smoke percentage separately; do not chase a global number;
3. GitHub-native **secret scanning** and **CodeQL** (or Semgrep) for TS security patterns (prototype pollution, enum coercion, path handling) — low effort, no new runtime;
4. Dependabot/renovate for `bun.lock` and GitHub Actions, with grouped weekly PRs and the same pre-review gate.

Do **not** add a gate that is red on day one or requires a baseline nobody maintains.

### D4 — Documentation automation: extend `docs-freshness` and add link checking

Beyond the claim count:

- **status-matrix freshness for engine changes**: fail when `engine-public-contract.md` changes without a snapshot update in `implementation-status.md` (the #159 obligation), using a content hash of the contract stored in the matrix (or a checked-in snapshot file);
- **documented diagnostic codes**: every `core.*`/`pap.*` code emitted in `src` must appear in the diagnostics documentation (the corpus already has a similar registry; reuse the idea, not the code);
- **link checking** (D3.1) covering decision records, contracts, architecture notes and READMEs;
- keep the docs PR checklist explicit: decision record updated, status matrix snapshot, generated artifacts rebuilt.

### D5 — Agent and PR operating model: bound the diff, not the agent

Branch protection and the pre-review already enforce *who* merges and *that* a review happened. The missing piece is *size and focus*:

- branch naming `<type>/<issue#>-<slug>` (already the norm in practice; write it down);
- Conventional Commits, English PRs, one concern per PR;
- **PR size guideline**: aim ≤400 changed lines excluding generated artifacts, fixtures and goldens; split when larger, and record why in the PR if not;
- add `.github/PULL_REQUEST_TEMPLATE.md` (what changed / proof command / pre-review model+head+findings / risk) and issue templates (bug, architecture, hardening, tail);
- agent-authored PRs: same gates, plus the pre-review record is mandatory for code; agents never merge or enable auto-merge (already enforced);
- never force-push a branch under review without re-running the delta pre-review.

### D6 — Debt register: issues, not a markdown graveyard

Use **GitHub issues labelled `debt` (+ `tail` when dated)** as the register, with a small contract on each item: trigger/impact, proposed fix, acceptance, owner. No separate `TECHNICAL_DEBT.md` (it drifts). Triage:

- at each release (or monthly while there is no release cadence): list `debt` issues, re-rank, close stale ones with a reason;
- the stream D hardening sweep (#225–#229) is the model: triage first, drop fixed items, split by disjoint scope;
- link debt to the audit report section that found it.

### D7 — Structural debt: target module map before splitting

The high-value debt is concentrated:

- `pap/src/verify.ts` (1515 lines) → orchestration + phases: package read/limits, manifest/claims decode, checks, trust/signature evaluation, report assembly; keep the CLI thin and the report model separate;
- `spec/lib/identity.ts` (1761) → digest/envelope framing, engine-root resolution/import mapping, profile/adapter/renderer closure, build identity assembly;
- shared helpers: one `text()`/`isObject()` in a single module per boundary (`pap` must not import `spec/`; keep a `pap/src/guards.ts` and use `spec/lib/guards.ts` for the engine);
- renderer scaffolding: `MemoryLoader`, `finalize`, `countSeverity` belong in one shared profile-support module, not copied in each renderer;
- test temp directories: stop the leak the audit measured (~221 dirs / ~466 MB per full run) with one centralized temp-directory helper/teardown across `tests/` and `pipeline/tests/`. Each suite must own a dedicated temp root (or an explicitly tracked set of harness-owned paths) and assert cleanup only inside that scope — never a process-wide `/tmp` count/size delta, which parallel sessions and unrelated processes can perturb. Cover failure paths (assertion/timeout) so teardown still runs.

Sequencing: D2 format baseline first (so refactor diffs are clean), then split modules in separate PRs behind the existing tests and S2.2/golden checks; no behaviour change in the split PRs.

### D8 — PAP verifier packaging boundary: defer the split, record the trigger

RFC §9.1 requires a separate project with its own release and pinned artifacts; today `pap/` is an in-repo boundary with a dev script. Recommendation: **defer the physical split**, and record the trigger conditions:

- Phase 2b/2c checks reach a stable caseload and an independent verifier consumes the same package shape (C6 evidence exists);
- a release model exists (D1) and the verifier can be published with checksums and reproducible builds;
- then move `pap/` to its own repo/package, publish a versioned artifact, and update the RFC packaging statement.

Until then, keep the enforced boundary (no imports of `spec/`, `profiles/`, producer code) and the independent-family pre-review.

## 4. Phases

| Slice | Deliverable | Acceptance |
|---|---|---|
| D0 | This design note + decisions accepted | maintainer approves D1–D8 |
| D1 | Release/version policy (MVP-no-release) + engine-version check | engine-version check fails on a mismatch inside the engine domain; profile/project versions are validated as present but never forced equal; policy documented in CONTRIBUTING/README |
| D2 | Biome baseline + CI lint/format step | one formatting-only commit; CI green; no behaviour change |
| D3 | Link checker + coverage policy + secret scanning/CodeQL + Dependabot | gates green on day one; thresholds documented; no PAP in-process threshold |
| D4 | `docs-freshness` extensions (status-matrix hash, diagnostic codes) | tests bite on a deliberate contract/code change |
| D5 | PR/issue templates + branch/size rules | templates used by the next PR; size guideline documented |
| D6 | `debt` label + register convention + first triage | label exists; triage list linked from #170 |
| D7 | Structural splits (verify, identity, helpers, renderer support) + temp-dir lifecycle | behaviour-preserving PRs, tests/goldens green, no artifact byte change; no leaked resources under the test-owned temp root (asserted per suite, not via a global `/tmp` delta) |
| D8 | Verifier packaging decision recorded | trigger conditions in the RFC/ODR; no physical split until they hold |

## 5. Decisions requested (D1–D8)

- **D1:** adopt MVP-without-releases + an **engine-version** check now (never a cross-domain sync); engine semver tags/CHANGELOG when a publishable consumer exists, with profile/project versions listed separately in release notes. *(recommended)*
- **D2:** Biome over ESLint+Prettier; formatting baseline commit, then CI. *(recommended)*
- **D3:** add Biome, link checker, secret scanning/CodeQL, Dependabot; coverage threshold only for in-process areas; no global threshold. *(recommended)*
- **D4:** extend docs freshness with a status-matrix hash and diagnostic-code documentation check; add link checking. *(recommended)*
- **D5:** PR size guideline ≤400 non-generated lines, PR/issue templates, branch naming, no force-push without delta review. *(recommended)*
- **D6:** issues as the debt register (`debt`/`tail`), triage monthly or per release. *(recommended)*
- **D7:** split `verify.ts`/`identity.ts`, dedupe helpers/renderer scaffolding; sequence after D2. *(recommended)*
- **D8:** defer the PAP physical split; record trigger conditions in the RFC/ODR. *(recommended)*

## 6. Non-goals

- Changing the release gate (`build:release` stays blocked until the normative slice is ready).
- Adding a lint rule set so large that every PR becomes formatting noise.
- Chasing a global coverage number that the spawned-CLI PAP tests make meaningless.
- Physical `pap/` split before a release channel and Phase 2b/2c stability exist.
- Mixing structural refactors with feature or fix PRs.
