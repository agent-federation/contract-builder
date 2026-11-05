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
bun test
bun run check
```

CI (`.github/workflows/ci.yml`) runs the same sequence. All four steps must be green before a PR can land.

## How to contribute

1. **Find or open an issue** — prefer working on an existing issue. For larger changes, discuss design first.
2. **Fork** (external) or create a branch from up-to-date `main` (maintainers).
3. **Make a focused change** — one concern per PR; do not mix refactors or unrelated formatting.
4. **Prove it** — run the commands above. If you changed anything under `spec/` or `profiles/core001/`, run `bun run build` and commit the regenerated `spec/output/CORE-001.draft.md`.
5. **Open a pull request** against `main`.

### Pull request rules

- **Title**: [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `test:`, `chore:`, etc.
- **Body**: English; state what changed and which command verified it (e.g. `bun run check`).
- **Never** push directly to `main` or force-push to `main`. `main` is protected: one approving Code Owner review (`.github/CODEOWNERS`), the strict `check` status, resolved conversations, and merge restricted to the maintainer. The sole bypass is the maintainer's documented admin bypass.
- An automated agent (`it-start`) may open PRs; **only a human merges**. Agents must not enable auto-merge. The platform enforces this: the agent cannot merge, and its approval cannot satisfy the Code Owner review requirement.

### Artifact rule

`spec/output/CORE-001.draft.md` is **generated**. Never edit it by hand. Edit structured inputs under `spec/` (or the profile), then rebuild.

### Executable profiles

The CORE-001 profile ships executable modules (`view.ts`, `validator.ts`). Build scripts pass `--allow-executable-profile`. That flag is **caller consent** to run trusted profile code with the builder’s process privileges — not a sandbox. See README and AGENTS.md.

`bun run build:release` is intentionally failing while the demo slice still has `REVIEW_REQUIRED` diagnostics. Do not weaken that gate to get a green release build.

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
