# AGENTS.md

Repository instructions for anyone changing this repository — human or automated
agent. English only. Read this before your first change.

## What this repository is

`contract-builder` is the build engine for machine-readable normative
specifications, plus the engine's own self-contract and the independent PAP
v0.1 verifier. `spec/` holds the engine (the builder CLI and `lib/`); it
contains no project data. `contracts/core000/` declares the engine's public
contract as a project, and `profiles/core000/` is its profile; the generated
artifact lives at `contracts/core000/output/CORE-000.draft.md`. The synthetic
`profiles/example/` (with the `tests/fixtures/engine-project/` project) is the
executable non-domain fixture the tests build through the ordinary entry
points. The CORE-001 vertical — its normative source, declared inputs, profile,
fixtures, tests and artifact rule — lives in the UIA repository
(`agent-federation/uia`), extracted under
[ODR-ENG-003](docs/decisions/ODR-ENG-003-core-001-project-extraction.md); the
engine resolves the project through `engineRoot`, never through a
cross-repository build step. `pap/` holds the independent Portable Assurance
Package v0.1 verifier; it never imports `spec/` or `profiles/`.

## Commands

Requires Bun 1.4+; `packageManager` pins `bun@1.4.2`, which is also the CI
version. Run everything from the repository root.

```bash
bun install --frozen-lockfile   # install exactly what bun.lock declares
bun run typecheck               # tsc --noEmit
bun run lint                    # Biome lint + format check
bun run format                  # apply Biome formatting
bun run docs:links              # local relative-link and anchor check for docs
bun run coverage                # test suite with lcov coverage output
bun run coverage:check          # enforce the in-process coverage floors
bun test                        # run the test suite without coverage
bun run check:all               # CORE-000 artifact verification (S2.2)
bun run pap -- verify <PACKAGE> # PAP v0.1 verifier; see pap/README.md
bun run pap:test                # PAP vectors, conformance corpus, hostile input, CLI
bun run pack:core000 --out <DIR> # CORE-000 PAP producer; writes outside the checkout only
bun run gate:core000 --report <FILE> --policy <FILE> --out <FILE> # acceptance gate over a PAP report
bun run pipeline:test           # producer, gate, release gate, CI helper and independent-batch tests
```

CI (`.github/workflows/ci.yml`, job `check`) runs, in this order:
`bun install --frozen-lockfile`, `bun audit`, `bun run typecheck`,
`bun run lint`, `bun run format:check`, `bun run docs:links`, `bun run coverage`,
`bun run coverage:check`, `bun run check:all`.
All steps must be green before a pull request can land. Two jobs that are not
required statuses yet run after `check`: `pipeline` (the CORE-000 chain —
`pack:core000` twice, `pap verify`, `gate:core000`) and `pipeline-independent`
(C6: the reference verifier plus three independent verifiers on one package).

To build a project by hand (for example the engine fixture or a UIA checkout),
invoke the CLI directly:
`bun spec/build.ts --spec <project-dir> --allow-executable-profile
--renderer-module <profile>/renderer.ts`; `--check` compares an already-written
artifact instead of writing. There is no repository-level `build` script: the
repository owns no project data.

## The artifact rule

`contracts/core000/output/CORE-000.draft.md` is generated; never edit it by
hand. After changing any declared input under `contracts/core000/`, the
CORE-000 profile under `profiles/core000/`, or the declared source
`docs/architecture/engine-public-contract.md` (its digest is embedded in the
artifact's provenance records), regenerate it with the Q9
copy-from-temporary-workspace procedure and commit the regenerated file:

1. `prepareWorkspace()`, then `runHarness({ mode: "draft", write: true,
   specDir: ws.projectDir, workspaceRoot: ws.root })`; assert `result.written ===
   true` and `workspace.writeCheck === "only_declared_outputs"`.
2. Copy `ws.root/contracts/core000/output/CORE-000.draft.md` to
   `contracts/core000/output/CORE-000.draft.md`, then run
   `bun test tests/core000.test.ts -t "S2.2 artifact verification"`; remove the
   copy if the test fails.
3. Always `ws.cleanup()`.

`bun run check:all` runs the `S2.2 artifact verification` test — the machine
check for the CORE-000 artifact — and it is the artifact gate in CI. The
procedure is recorded in
`docs/architecture/core-000-decision-record.md` (S2.2 scope approvals and Q9).
The CORE-001 artifact rule moved to the UIA repository with the project
(ODR-ENG-003 E2).

## Layout

- `spec/` — the engine only: the builder CLI (`build.ts`,
  `cli-renderers.ts`) and the core (`lib/`: build orchestration, manifest and
  project boundary, loading, schemas, IR, relations, provenance, hooks,
  extension closures, identity, render boundary, diagnostics, locale,
  adapters).
- `profiles/` — `core000/`: the CORE-000 self-contract profile; `example/`:
  the synthetic executable profile (view, validator, renderer, schemas) used
  by the engine fixture.
- `contracts/` — the CORE-000 self-contract: declared inputs (`claims.yml`,
  `structure.yml`, `contract-builder.json`), the harness (`run.ts`, `mutations.ts`)
  and the generated `core000/output/CORE-000.draft.md`; its artifact rule is above.
- `tests/` — engine tests (`build`, `golden`, `ir`, `manifest`, `hook`,
  `renderer`, `genericity`, `provenance`, `identity`, `engine-root`,
  `example-profile`, `consent`, `fail-closed`, `locale`, `envelope`,
  `unsupported-configurations`, `core000`, `docs-freshness`), the synthetic
  fixture projects under `tests/fixtures/` (notably `engine-project/`), and
  shared helpers in `tests/support.ts`.
- `docs/` — architecture contract, M1 implementation plan, the
  implementation-status matrix with its snapshot-update convention, the
  diagnostic-code registry, the CORE-000 decision/execution records, the
  extraction decision records and the design record (historical, CORE-001
  sections archived).
- `pap/` — the independent PAP v0.1 verifier (`src/`, `bin/`, `schemas/`,
  `fixtures/pap-v0.1/`, `tests/`); its README holds the verifier commands and
  conformance notes.
- `pipeline/` — the producer side of PAP, outside the verifier boundary: the
  deterministic CORE-000 packer (`pack:core000`), the acceptance gate
  (`gate:core000`), the release-tag check (`release:check`), the CORE-000 trust
  policy, the CI helpers and the independent-verification batch; `pap/` never
  imports it. The mapping and the gate rule are in
  `docs/architecture/sdlc-pipeline.md`.
- `scripts/` — deterministic CI helpers: `check-docs-links.ts` (local relative
  link/anchor check) and `check-coverage.ts` (in-process coverage floors).

`tests/docs-freshness.test.ts` is the machine check for this documentation; the
[Documentation freshness](#documentation-freshness) rules below cover the engine-contract
snapshot, the CORE-000 claim count and the diagnostic-code registry.

## Quality and security gates

Run the required gates locally before opening a pull request; CI enforces the same set.

- **Documentation links.** `bun run docs:links` (`scripts/check-docs-links.ts`)
  checks relative paths and anchors in `docs/**`, `README*.md`,
  `CONTRIBUTING.md`, `AGENTS.md` and `CODE_OF_CONDUCT.md`. It is deterministic
  and never uses the network: external URLs are deliberately outside the
  pull-request gate (out of scope for now; if added later, only as a separate
  non-blocking scheduled job). Links inside fenced code blocks and inline code
  are examples and are ignored. Fix a broken link; do not weaken the checker.
- **Coverage policy.** `bun run coverage` writes `coverage/lcov.info` and
  `bun run coverage:check` (`scripts/check-coverage.ts`) enforces line floors on
  the in-process measured areas (`spec/`, `profiles/`, `pipeline/`). `pap/` is
  excluded because its tests spawn the CLI, so its in-process percentage is
  misleading; there is no global threshold. The measured baseline, floors and
  rationale live in `CONTRIBUTING.md`. Raise a floor when coverage rises;
  lowering one needs a stated reason in the pull request.
- **Code scanning.** `.github/workflows/codeql.yml` runs CodeQL for
  JavaScript/TypeScript with pinned action SHAs and `security-events: write` on
  push to `main`, on pull requests and weekly. GitHub's CodeQL *default setup* is
  a repository setting that conflicts with the workflow; only the maintainer can
  switch between them (see `CONTRIBUTING.md`).
- **Dependency automation.** `.github/renovate.json` configures Renovate for
  `bun.lock` (the `bun` manager) and GitHub Actions. Renovate runs only when the
  Mend Renovate GitHub App is installed, which is a maintainer action. Dependabot
  is not used because it does not support `bun.lock`; without Renovate,
  dependency updates are manual. Secret scanning and push protection are
  repository settings, not repository files; the maintainer enables them under
  **Settings → Code security**.

### Documentation freshness

`tests/docs-freshness.test.ts` is part of the normal `bun test` run. It keeps three hand-written
documentation facts honest:

- **Engine-contract snapshot.** `docs/architecture/implementation-status.md` records the SHA-256
  of the whole `docs/architecture/engine-public-contract.md`, over LF-normalized bytes. Change the
  contract and update the hash in the same pull request; the test prints the expected hash and
  fails on a stale one (#159).
- **CORE-000 claim count.** The same status matrix states the number of claims in
  `contracts/core000/claims.yml`; update the sentence in the same pull request that changes the
  register.
- **Diagnostic-code registry.** Every `core.*`/`pap.*` code emitted from production TypeScript
  under `spec/`, `profiles/`, `pap/src/`, `pipeline/` and `contracts/` must appear in
  `docs/architecture/diagnostic-code-registry.md`. Add the row in the same pull request as the
  emitted code. The registry's exact-match allowlist is only for namespaced identifiers that are
  not diagnostics (digest domains, verifier identities); never allowlist a real diagnostic, and
  remove an entry when its last use disappears. Do not suppress a namespace with a glob.

Run the focused check when changing the contract, the CORE-000 register, the registry or the
source roots above: `bun test tests/docs-freshness.test.ts`.

## Pull request rules

- Work on a branch named `<type>/<issue#>-<slug>`, where `<type>` is the
  Conventional Commits type: for example `fix/142-envelope-limit`,
  `docs/251-pr-issue-templates` or `feat/201-pipeline-c2-claims`. Branch from
  up-to-date `main`; never commit directly to `main`.
- Subject line follows Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`,
  `chore:` and so on. Pull request and issue bodies are in English and state
  what changed and which command proved it (for example `bun run check:all`).
- One concern per pull request: do not mix a refactor, a reformatting or an
  unrelated fix into a documentation, feature or fix pull request.
- **Size guideline.** Aim for at most 400 changed lines, excluding generated
  artifacts (`contracts/core000/output/`), fixtures and goldens
  (`tests/fixtures/`, `pap/fixtures/`, `tests/golden/`). Split a larger change
  into independent pull requests; when it cannot be split, state why in the
  pull request.
- Open the pull request with the
  [pull request template](.github/PULL_REQUEST_TEMPLATE.md); it carries the
  proof commands, the pre-review record, risk/rollback and the checklist. File
  issues with the templates under `.github/ISSUE_TEMPLATE/` (bug, architecture,
  hardening, tail, debt).
- Never push directly to `main` and never force-push to `main`. `main` is
  protected: the `check` job must pass, the branch must be up to date, and the
  pull request needs one approving Code Owner review
  (`.github/CODEOWNERS`) and resolved conversations. Pushes and merges to
  `main` are restricted to the maintainer; admin bypass stays available to the
  maintainer only (see `docs/decisions/ODR-PROC-001-branch-protection-and-agent-merge.md`).
- **Force-push under review.** Never force-push a branch that is under review
  without re-running the independent pre-review against the new head (the delta
  pre-review) and recording it in the pull request. Rewrite history only when
  the review requires it.
- This project is also worked on by an automated agent (GitHub account
  `it-start`). An agent never merges and never enables auto-merge; a human
  merges every pull request. Agent-authored pull requests pass the same gates as
  human ones, and the pre-review record below is mandatory for a code pull
  request. Branch protection makes the merge rule technical: the agent can push
  branches and open pull requests, but it cannot merge, and its approval cannot
  satisfy the Code Owner review requirement.
- Before merge, code pull requests (changes under `pap/`, `spec/lib/`,
  `profiles/` or `contracts/`) need an independent-family pre-review with
  the independent-family reviewer from `docs/agents/pre-review.md` —
  `glm-5.3-flash` by default on the `opencode-go` route, escalating to
  `glm-5.3` on the documented triggers; record the reviewer, the reviewed head, the
  findings and their dispositions in the pull request. The review is advisory:
  CI, the Code Owner review and the human merge remain the gates, and P1/P2
  findings must be verified before they block. Documentation- and
  config-only changes may skip it; record `docs-only, skipped: <reason>` in the
  pull request instead of leaving the record blank.
- Keep the change focused; do not mix refactors or reformatting into a
  documentation or fix pull request.

## Debt register

Technical debt lives in GitHub issues labelled `debt` (`tail` too when the fix is
dated), never in a `TECHNICAL_DEBT.md`: a separate Markdown register drifts from
the code. File each item with the
[debt issue template](.github/ISSUE_TEMPLATE/debt.md) and state the
trigger/impact, the proposed fix, the acceptance condition and an owner/area. An
item without a trigger or an acceptance is not a debt item.

- **Triage.** Monthly, or at each release once a release cadence exists: list
  the open `debt` issues, re-rank them, and close stale items with a reason.
- **Link the audit area.** Tie each item to the area of the
  [#137](https://github.com/agent-federation/contract-builder/issues/137) audit
  that found it, and to the decision record it serves (for example the
  [delivery-governance](docs/architecture/delivery-governance.md) D6/D7
  decisions).
- **Do not duplicate planned structural work.** A split or cleanup with its own
  execution issue stays there; link it from the register instead of filing a
  second debt item.

## What not to do

- Do not hand-edit `contracts/core000/output/CORE-000.draft.md`; change the
  declared inputs and regenerate with the Q9 procedure above.
- Do not reintroduce domain knowledge into the engine: the genericity guard
  (`tests/genericity.test.ts`) scans the whole `spec/` tree for domain tokens,
  CORE-001 assets and profile/fixture paths, and must keep passing.
- Do not add secrets, tokens or credentials to any file.
- Do not make the pull-request gate depend on the network: the docs link checker
  is local, and external URLs are not part of CI.
- Do not lower a coverage floor or weaken the link checker to make a red run
  pass.
- Do not reformat unrelated files or rewrite their line endings.
- Do not weaken schemas, diagnostics or fixtures merely to make a failing check
  pass.

## Where specification decisions live

- `contracts/core000/claims.yml` — the engine's public contract claim register;
  `contracts/core000/output/CORE-000.draft.md` is its rendered artifact.
- `docs/architecture/engine-public-contract.md` — the engine's public contract.
- `docs/architecture/m1-implementation-plan.md` — the first implementation
  stage (M1) plan; its CORE-001 sections are historical.
- `docs/decisions/ODR-ENG-003-core-001-project-extraction.md` — the CORE-001
  extraction decision; the project itself, its decisions register and its design
  record live in the UIA repository.
- `README.md` — user-facing overview of the project.

<!-- entire-agent:begin -->
Read .entire/agent-guide.md for this repository's workflow, source inspection, and verification guidance.
@.entire/agent-guide.md
<!-- entire-agent:end -->
