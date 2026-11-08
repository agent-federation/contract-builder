# Contributing

Thank you for contributing to **contract-builder** (CORE-001 spec builder).

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
2. **Fork** (external) or create a branch from up-to-date `main` (maintainers).
3. **Make a focused change** — one concern per PR; do not mix refactors or unrelated formatting.
4. **Prove it** — run the commands above. If you changed anything under `spec/` or `profiles/core001/`, run `bun run build` and commit the regenerated `spec/output/CORE-001.draft.md`.
5. **Open a pull request** against `main`.

### Formatting and linting

Formatting and linting use [Biome](https://biomejs.dev/) (pinned `@biomejs/biome`, configuration in `biome.json`):

- `bun run lint` — `biome check`: lint rules plus the formatting check;
- `bun run format` — rewrite files with the formatter;
- `bun run format:check` — report formatting differences without writing.

Formatting is enforced in CI. Run `bun run format` on the files your change touches, and do **not** mix a repository-wide reformat into a feature, fix or documentation PR — a formatting-only change is its own PR. Generated artifacts (`spec/output/`, `contracts/core000/output/`), fixtures and goldens (`pap/fixtures/`, `fixtures/`, `tests/golden/`), `coverage/` and lockfiles are excluded in `biome.json`; the content-addressed profile and input files are excluded from formatting (they are still linted) so their build digests do not change. Do not reformat any of them by hand.

### Documentation links

`bun run docs:links` (`scripts/check-docs-links.ts`) checks relative links and anchors in `docs/**`, `README*.md`, `CONTRIBUTING.md`, `AGENTS.md` and `CODE_OF_CONDUCT.md`. It is a required CI step, local and deterministic: it fails on a missing relative target, a heading anchor that does not exist under GitHub's heading-slug rules, or a `#L…` line anchor outside the target file. It follows explicit `<a name>`/`<a id>` anchors and ignores links inside fenced code blocks and inline code, which are examples rather than navigation.

External `http(s)` URLs are deliberately **not** checked by the pull-request gate: a PR must never depend on a third-party host being reachable. External URL checking is out of scope for this gate; if it is added later it must be a separate, non-blocking scheduled job. The gate makes no network calls.

### Coverage policy

`bun run coverage` runs the suite and writes `coverage/lcov.info`; `bun run coverage:check` (`scripts/check-coverage.ts`) enforces line-coverage floors on the **in-process measured** areas only. `pap/` is excluded: its tests exercise the verifier by spawning the CLI, so an in-process percentage there is misleading (the #137 audit measured `manifest.ts` at ~3.31% for that reason). There is no global threshold.

Measured at `b4927c4` with `bun run coverage`:

| Area | Bun 1.4.2 (CI) | Bun 1.4.4 | Floor |
|---|---|---|---|
| `spec/` | 83.65% | 81.29% | **80%** |
| `profiles/` | 89.34% | 88.02% | **87%** |
| `pipeline/` | 77.16% | 73.21% | **72%** |

Bun 1.4.x patch versions report different absolute numbers for the same code (the pinned 1.4.2 counts more instrumented lines than 1.4.4). The floors are roughly one percentage point below the *lower* measurement, rounded down: enough headroom for that reporter difference and for small refactors, but still a ratchet against silent erosion. Raise a floor when coverage rises; lowering one needs a stated rationale in the pull request. A configured area with no measured data fails rather than passing silently. Coverage of temporary CORE-000 workspaces is excluded by construction: the checker only counts files inside the repository.

### Security and dependency automation

The repository-managed CodeQL workflow (`.github/workflows/codeql.yml`) analyzes JavaScript/TypeScript on push to `main`, on pull requests and weekly, with pinned action SHAs and `security-events: write`; results appear under **Security → Code scanning**. Several settings live in the repository configuration, not in this repository, and only the maintainer can change them:

- **CodeQL setup conflict.** If GitHub's *default setup* is enabled, disable it before this workflow is enabled (**Settings → Code security → Code scanning → CodeQL analysis → Disable default setup**). The default setup and a CodeQL workflow cannot both upload analyses.
- **Secret scanning and push protection.** Enable them in **Settings → Code security** (secret scanning alerts, push protection, and validity checks where available). No file in the repository enables these; do not add a placeholder config that pretends otherwise.
- **Renovate.** `.github/renovate.json` configures Renovate for `bun.lock` with Renovate's `bun` manager and for GitHub Actions with the `github-actions` manager. Renovate runs only when the Mend Renovate GitHub App is installed for this repository or organisation; installing the app is a maintainer action. Dependabot is not configured because it does not support `bun.lock`; if Renovate is not installed, dependency updates are manual. Renovate PRs pass the same CI and review gates as any other PR; major updates require approval from the dependency dashboard first.

### Pull request rules

- **Title**: [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.
- **Body**: English; state what changed and which command verified it (e.g. `bun run check`).
- **Never** push directly to `main` or force-push to `main`. `main` is protected: one approving Code Owner review (`.github/CODEOWNERS`), the strict `check` status, resolved conversations, and merge restricted to the maintainer. The sole bypass is the maintainer's documented admin bypass.
- An automated agent (`it-start`) may open PRs; **only a human merges**. Agents must not enable auto-merge. The platform enforces this: the agent cannot merge, and its approval cannot satisfy the Code Owner review requirement.
- **Independent pre-review**: code PRs (changes under `pap/`, `spec/lib/`, `profiles/`, `contracts/`) need a pre-merge review by a different model family (GLM-5.3-flash by default, escalating to GLM-5.3, in a DeepSeek Harness session), recorded in the PR. It is advisory: CI, the Code Owner review and the human merge still gate. See `docs/agents/pre-review.md`.

### Artifact rule

`spec/output/CORE-001.draft.md` is **generated**. Never edit it by hand. Edit structured inputs under `spec/` (or the profile), then rebuild.

### Executable profiles

The CORE-001 profile ships executable modules (`view.ts`, `validator.ts`). Build scripts pass `--allow-executable-profile`. That flag is **caller consent** to run trusted profile code with the builder’s process privileges — not a sandbox. See README and AGENTS.md.

`bun run build:release` is intentionally failing while the demo slice still has `REVIEW_REQUIRED` diagnostics. Do not weaken that gate to get a green release build.

### Version domains and releases

The three version domains are **independent** and must never be compared for equality:

| Domain | Authoritative field |
|---|---|
| Engine | `package.json` `version` |
| Profile | `profiles/*/profile.json` `version` |
| Project | `contracts/*/contract-builder.json` `project.revision` |

The canonical CORE-001 example already separates them: `project.revision` `0.3.3` with `profile.version` `0.1.0`. `bun run release:check --tag vX.Y.Z` validates that every domain is present and semver-shaped (without comparing them) and that the release tag is semver-shaped and equals the engine `package.json` `version`; a mismatch or malformed tag fails, and a missing `--tag` is a usage error, not a pass. The repository has no release tags yet (declared **MVP without public releases**). `bun run check:all` and the identity tests already cover the engine `package.json` ↔ generated artifacts/provenance, so the release tag is the only engine-version source this gate adds.

## What not to do

- Hand-edit generated Markdown under `spec/output/`
- Change `CORE-001.legacy.md` without a decision record — it is the source quotes are checked against
- Commit secrets, tokens, or credentials
- Reformat unrelated files or rewrite line endings
- Weaken schemas, diagnostics, or fixtures only to make a failing check pass

## Where decisions live

| Location | Role |
|----------|------|
| `spec/decisions.yml` | Machine-readable open/closed decisions |
| `docs/architecture/` | Engine contract, M1 plan, build identity |
| `docs/superpowers/specs/` | Design record |
| [Issues](https://github.com/agent-federation/contract-builder/issues) | Tracking and discussion |

## License

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
