# Contributing

Thank you for contributing to **contract-builder** (the build engine and its self-contract).

The detailed workflow for humans and automated agents lives in **[AGENTS.md](AGENTS.md)**. This file is a short onboarding guide; if anything conflicts, **AGENTS.md wins**.

## Code of Conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By contributing, you agree to uphold it.

## Prerequisites

- [Bun](https://bun.sh/) 1.4+ (CI uses `bun@1.4.2`, pinned in `package.json`)
- Run all commands from the repository root

```bash
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run format:check
bun run docs:links
bun run coverage
bun run coverage:check
bun run check:all
```

CI (`.github/workflows/ci.yml`) runs `bun audit` and the same sequence. All steps must be green before a PR can land.

## How to contribute

1. **Find or open an issue** — prefer working on an existing issue. For larger changes, discuss design first.
2. **Branch** — fork (external) or create a branch from up-to-date `main` named `<type>/<issue#>-<slug>`, where `<type>` is the Conventional Commits type (for example `docs/251-pr-issue-templates` or `fix/142-envelope-limit`).
3. **Make a focused change** — one concern per PR; do not mix refactors or unrelated formatting. Aim for at most 400 changed lines excluding generated artifacts, fixtures and goldens; split a larger change, or state in the PR why it cannot be split.
4. **Prove it** — run the commands above. If you changed anything under `contracts/core000/`, `profiles/core000/` or `docs/architecture/engine-public-contract.md`, regenerate the CORE-000 artifact with the Q9 procedure (see AGENTS.md) and commit it.
5. **Open a pull request** against `main` using the [pull request template](.github/PULL_REQUEST_TEMPLATE.md); give it a Conventional Commits title and an English body, and paste the commands you ran.

### Formatting and linting

Formatting and linting use [Biome](https://biomejs.dev/) (pinned `@biomejs/biome`, configuration in `biome.json`):

- `bun run lint` — `biome check`: lint rules plus the formatting check;
- `bun run format` — rewrite files with the formatter;
- `bun run format:check` — report formatting differences without writing.

Formatting is enforced in CI. Run `bun run format` on the files your change touches, and do **not** mix a repository-wide reformat into a feature, fix or documentation PR — a formatting-only change is its own PR. Generated artifacts (`contracts/core000/output/`), fixtures and goldens (`pap/fixtures/`, `tests/fixtures/`, `tests/golden/`), `coverage/` and lockfiles are excluded in `biome.json`; the content-addressed profile and input files are excluded from formatting (they are still linted) so their build digests do not change. Do not reformat any of them by hand.

### Documentation links

`bun run docs:links` (`scripts/check-docs-links.ts`) checks relative links and anchors in `docs/**`, `README*.md`, `CONTRIBUTING.md`, `AGENTS.md` and `CODE_OF_CONDUCT.md`. It is a required CI step, local and deterministic: it fails on a missing relative target, a heading anchor that does not exist under GitHub's heading-slug rules, or a `#L…` line anchor outside the target file. It follows explicit `<a name>`/`<a id>` anchors and ignores links inside fenced code blocks and inline code, which are examples rather than navigation.

External `http(s)` URLs are deliberately **not** checked by the pull-request gate: a PR must never depend on a third-party host being reachable. External URL checking is out of scope for this gate; if it is added later it must be a separate, non-blocking scheduled job. The gate makes no network calls.

### Documentation freshness

`tests/docs-freshness.test.ts` is the machine check for three hand-maintained documentation facts. Run it after changing any of them, and note that the normal `bun test`/CI run already includes it:

- **Engine-contract snapshot.** `docs/architecture/implementation-status.md` records the SHA-256 of the whole `docs/architecture/engine-public-contract.md`, over LF-normalized bytes. If you change the contract, update the recorded hash in the same pull request. The test failure prints the hash it computed, so copy that value into the snapshot sentence; a stale hash fails.
- **CORE-000 claim count.** The same status matrix states the number of claims in `contracts/core000/claims.yml`. Update the sentence in the same pull request that changes the register.
- **Diagnostic-code registry.** Every `core.*`/`pap.*` code emitted from production TypeScript under `spec/`, `profiles/`, `pap/src/`, `pipeline/` and `contracts/` must appear in [`docs/architecture/diagnostic-code-registry.md`](docs/architecture/diagnostic-code-registry.md). Add the row in the same pull request as the emitted code. The registry's exact-match allowlist is only for namespaced identifiers that are not diagnostics (digest domains, verifier identities) and each entry states why; never allowlist a real diagnostic and remove an entry when its last use disappears. There is no glob or prefix suppression.

Run the focused check with `bun test tests/docs-freshness.test.ts`.

### Coverage policy

`bun run coverage` runs the suite and writes `coverage/lcov.info`; `bun run coverage:check` (`scripts/check-coverage.ts`) enforces line-coverage floors on the **in-process measured** areas only. `pap/` is excluded: its tests exercise the verifier by spawning the CLI, so an in-process percentage there is misleading (the #137 audit measured `manifest.ts` at ~3.31% for that reason). There is no global threshold.

Measured at `b4927c4` with `bun run coverage`:

| Area | Bun 1.4.2 (CI) | Bun 1.4.4 | Floor |
|---|---|---|---|
| `spec/` | 83.65% | 81.29% | **80%** |
| `profiles/` | 85.17% (engine-owned profiles only, ODR-ENG-003 E3) | 84.5% | **84%** |
| `pipeline/` | 77.16% | 73.21% | **72%** |

Bun 1.4.x patch versions report different absolute numbers for the same code (the pinned 1.4.2 counts more instrumented lines than 1.4.4). The floors are roughly one percentage point below the *lower* measurement, rounded down: enough headroom for that reporter difference and for small refactors, but still a ratchet against silent erosion. Raise a floor when coverage rises; lowering one needs a stated rationale in the pull request. A configured area with no measured data fails rather than passing silently. Coverage of temporary CORE-000 workspaces is excluded by construction: the checker only counts files inside the repository.

### Security and dependency automation

The repository-managed CodeQL workflow (`.github/workflows/codeql.yml`) analyzes JavaScript/TypeScript on push to `main`, on pull requests and weekly, with pinned action SHAs and `security-events: write`; results appear under **Security → Code scanning**. Several settings live in the repository configuration, not in this repository, and only the maintainer can change them:

- **CodeQL setup conflict.** If GitHub's *default setup* is enabled, disable it before this workflow is enabled (**Settings → Code security → Code scanning → CodeQL analysis → Disable default setup**). The default setup and a CodeQL workflow cannot both upload analyses.
- **Secret scanning and push protection.** Enable them in **Settings → Code security** (secret scanning alerts, push protection, and validity checks where available). No file in the repository enables these; do not add a placeholder config that pretends otherwise.
- **Renovate.** `.github/renovate.json` configures Renovate for `bun.lock` with Renovate's `bun` manager and for GitHub Actions with the `github-actions` manager. Renovate runs only when the Mend Renovate GitHub App is installed for this repository or organisation; installing the app is a maintainer action. Dependabot is not configured because it does not support `bun.lock`; if Renovate is not installed, dependency updates are manual. Renovate PRs pass the same CI and review gates as any other PR; major updates require approval from the dependency dashboard first.

### Pull request rules

- **Title**: [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.
- **Branch**: `<type>/<issue#>-<slug>` from up-to-date `main`, for example `fix/142-envelope-limit`.
- **Body**: English; state what changed and which command verified it (e.g. `bun run check:all`). Use the [pull request template](.github/PULL_REQUEST_TEMPLATE.md), including its pre-review record, risk/rollback and checklist sections.
- **One concern per PR; size guideline**: aim for at most 400 changed lines, excluding generated artifacts (`contracts/core000/output/`), fixtures and goldens (`tests/fixtures/`, `pap/fixtures/`, `tests/golden/`). Split when larger; if that is not feasible, state why in the PR.
- **Never** push directly to `main` or force-push to `main`. `main` is protected: one approving Code Owner review (`.github/CODEOWNERS`), the strict `check` status, resolved conversations, and merge restricted to the maintainer. The sole bypass is the maintainer's documented admin bypass.
- **Never force-push a branch under review without a delta pre-review**: re-run the independent pre-review against the new head and record it in the PR. Rewrite history only when the review requires it.
- An automated agent (`it-start`) may open PRs; **only a human merges**. Agents must not enable auto-merge. Agent-authored PRs pass the same gates as human ones, and the pre-review record is mandatory for code changes. The platform enforces the merge rule: the agent cannot merge, and its approval cannot satisfy the Code Owner review requirement.
- **Independent pre-review**: code PRs (changes under `pap/`, `spec/lib/`, `profiles/`, `contracts/`) need a pre-merge review by a different model family (GLM-5.3-flash by default, escalating to GLM-5.3, in a DeepSeek Harness session), recorded in the PR. It is advisory: CI, the Code Owner review and the human merge still gate. See `docs/agents/pre-review.md`. Documentation- and config-only PRs may skip it; record `docs-only, skipped: <reason>` in the PR.
- **Issue templates**: bug, architecture, hardening, tail and debt reports use the forms under `.github/ISSUE_TEMPLATE/`; issue bodies are in English too.

### Debt register

Technical debt is tracked in GitHub issues labelled `debt` (`tail` too when the fix is dated); there is deliberately no `TECHNICAL_DEBT.md`, because a separate Markdown register drifts from the code. File each item with the [debt issue template](.github/ISSUE_TEMPLATE/debt.md): a trigger/impact, a proposed fix, an acceptance condition and an owner/area. An item without a trigger or an acceptance is not a debt item.

Triage the register monthly, or at each release once releases exist: list the open `debt` issues, re-rank them, and close stale items with a reason. Link each item to the [#137](https://github.com/agent-federation/contract-builder/issues/137) audit area that found it and to the [delivery-governance](docs/architecture/delivery-governance.md) decision it serves. Planned structural work keeps its own execution issue; link it instead of filing a duplicate debt item.

### Artifact rule

`contracts/core000/output/CORE-000.draft.md` is **generated**. Never edit it by hand. Change the declared inputs under `contracts/core000/` (or the CORE-000 profile, or the contract document), then regenerate with the Q9 procedure and re-run `bun run check:all` — see AGENTS.md for the exact steps.

### Executable profiles

A profile may ship executable modules (`view.ts`, `validator.ts`, `renderer.ts`). Builds pass `--allow-executable-profile`. That flag is **caller consent** to run trusted profile code with the builder’s process privileges — not a sandbox. See README and AGENTS.md.

### The CORE-001 project

The CORE-001 vertical lives in the UIA repository (`agent-federation/uia`) since
[ODR-ENG-003](docs/decisions/ODR-ENG-003-core-001-project-extraction.md): its source document, declared inputs, profile, fixtures, tests and artifact rule moved there. This repository resolves an external project through an explicit `engineRoot`; there is no cross-repository build step in either CI.

### Version domains and releases

The three version domains are **independent** and must never be compared for equality:

| Domain | Authoritative field |
|---|---|
| Engine | `package.json` `version` |
| Profile | `profiles/*/profile.json` `version` |
| Project | `contracts/*/contract-builder.json` `project.revision` |

The extracted CORE-001 project already separates them: `project.revision` `0.3.3` with `profile.version` `0.1.0` (UIA repository). `bun run release:check --tag vX.Y.Z` validates that every domain is present and semver-shaped (without comparing them) and that the release tag is semver-shaped and equals the engine `package.json` `version`; a mismatch or malformed tag fails, and a missing `--tag` is a usage error, not a pass. The repository has no release tags yet (declared **MVP without public releases**). `bun run check:all` and the identity tests already cover the engine `package.json` ↔ generated artifacts/provenance, so the release tag is the only engine-version source this gate adds.

## What not to do

- Hand-edit generated Markdown under `contracts/core000/output/`
- Reintroduce domain knowledge into the engine: the genericity guard scans the whole `spec/` tree
- Commit secrets, tokens, or credentials
- Reformat unrelated files or rewrite line endings
- Weaken schemas, diagnostics, or fixtures only to make a failing check pass

## Where decisions live

| Location | Role |
|----------|------|
| `contracts/core000/claims.yml` | The engine's public-contract claim register |
| `docs/architecture/` | Engine contract, M1 plan, build identity |
| `docs/decisions/` | Owner decision records (extraction, PAP, process) |
| [Issues](https://github.com/agent-federation/contract-builder/issues) | Tracking and discussion |

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
