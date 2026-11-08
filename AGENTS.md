# AGENTS.md

Repository instructions for anyone changing this repository — human or automated
agent. English only. Read this before your first change.

## What this repository is

`core001-spec-builder` renders the CORE-001 normative specification from declared
inputs. `spec/` holds the machine-readable inputs and the builder; `spec/output/`
holds the rendered Markdown artifact. The demo slice covers §10.1–10.2 of
`CORE-001.legacy.md`, the read-only source document at the repository root. The
generated Markdown is never the source of truth: structured files under `spec/`
are. `pap/` holds the independent Portable Assurance Package v0.1 verifier; it
never imports `spec/` or `profiles/`.

## Commands

Requires Bun 1.4+; `packageManager` pins `bun@1.4.2`, which is also the CI
version. Run everything from the repository root.

```bash
bun install --frozen-lockfile   # install exactly what bun.lock declares
bun run typecheck               # tsc --noEmit
bun run lint                    # Biome lint + format check
bun run format                  # apply Biome formatting
bun test                        # run the test suite
bun run build                   # draft mode; writes spec/output/CORE-001.draft.md
bun run build:release           # release mode; currently exits 1 by design
bun run check                   # build in memory, compare with committed artifact
bun run pap -- verify <PACKAGE> # PAP v0.1 verifier; see pap/README.md
bun run pap:test                # PAP vectors, conformance corpus, hostile input, CLI
```

CI (`.github/workflows/ci.yml`, job `check`) runs, in this order:
`bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`,
`bun run format:check`, `bun test`, `bun run check`.
All steps must be green before a pull request can land.

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

### CORE-000 (the engine self-contract)

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

`bun run check` validates CORE-001 only and is not a CORE-000 check. The
`S2.2 artifact verification` test is the machine check and runs in CI
(`bun test`). The procedure is recorded in
`docs/architecture/core-000-decision-record.md` (S2.2 scope approvals and Q9).

## Layout

- `spec/` — declared inputs (`contract-builder.json`, `sources.yml`,
  `ontology.yml`, `semantics.json`, `decisions.yml`, `conformance/cases.yml`),
  the builder (`build.ts`, `lib/`) and the generated `output/`.
- `profiles/` — `core001/`: the view and check support (`view.ts`, `context.ts`,
  `slice.ts`, `text.ts`), the validator (`validator.ts`, `checks/`, `catalog.json`),
  the renderer (`renderer.ts`, `labels.ru.json`, `templates/`) and document plus
  entity-kind JSON Schemas under `schemas/`; `core000/`: the CORE-000
  self-contract profile; `example/`: the synthetic non-CORE-001 profile.
- `contracts/` — the CORE-000 self-contract: declared inputs (`claims.yml`,
  `structure.yml`, `contract-builder.json`), the harness (`run.ts`, `mutations.ts`)
  and the generated `core000/output/CORE-000.draft.md`; its artifact rule is above.
- `fixtures/` — intentionally broken specs (`broken-modality`,
  `broken-source-drift`, `open-decision`) used by tests and examples.
- `tests/` — `build.test.ts`, `golden.test.ts`, `ir.test.ts`,
  `manifest.test.ts`, `checks.test.ts`, `hook.test.ts`, `renderer.test.ts`,
  `genericity.test.ts`, `provenance.test.ts`, `identity.test.ts`,
  `example-profile.test.ts`, `consent.test.ts`, `core000.test.ts` and
  `docs-freshness.test.ts`, with golden baselines under `tests/golden/`.
- `docs/` — architecture contract, M1 implementation plan, the
  implementation-status matrix with its snapshot-update convention, the CORE-000
  decision/execution records and the design record.
- `pap/` — the independent PAP v0.1 verifier (`src/`, `bin/`, `schemas/`,
  `fixtures/pap-v0.1/`, `tests/`); its README holds the verifier commands and
  conformance notes.
- `CORE-001.legacy.md` — the read-only source document.

`tests/docs-freshness.test.ts` is a machine check for this documentation: it fails when the
CORE-000 claim count stated in `docs/architecture/implementation-status.md` disagrees with
`contracts/core000/claims.yml`. Update the snapshot sentence in the same pull request that
changes the register.

## Pull request rules

- Subject line follows Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`,
  `chore:` and so on.
- Body is in English and states what changed and which command proved it
  (for example `bun run check`).
- Never push directly to `main` and never force-push to `main`. `main` is
  protected: the `check` job must pass, the branch must be up to date, and the
  pull request needs one approving Code Owner review
  (`.github/CODEOWNERS`) and resolved conversations. Pushes and merges to
  `main` are restricted to the maintainer; admin bypass stays available to the
  maintainer only (see `docs/decisions/ODR-PROC-001-branch-protection-and-agent-merge.md`).
- This project is also worked on by an automated agent (GitHub account
  `it-start`). An agent never merges and never enables auto-merge; a human
  merges every pull request. Branch protection makes this technical: the agent
  can push branches and open pull requests, but it cannot merge, and its
  approval cannot satisfy the Code Owner review requirement.
- Before merge, code pull requests (changes under `pap/`, `spec/lib/`,
  `profiles/` or `contracts/`) need an independent-family pre-review with
  the independent-family reviewer from `docs/agents/pre-review.md` —
  `glm-5.3-flash` by default on the `opencode-go` route, escalating to
  `glm-5.3` on the documented triggers; record the reviewer, the reviewed head, the
  findings and their dispositions in the pull request. The review is advisory:
  CI, the Code Owner review and the human merge remain the gates, and P1/P2
  findings must be verified before they block. Documentation-only changes may
  skip it.
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
