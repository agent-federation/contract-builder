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
bun test
bun run check
```

CI (`.github/workflows/ci.yml`) runs the same sequence. All steps must be green before a PR can land.

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
