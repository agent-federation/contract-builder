## Summary

<!-- One concern per PR. Link the issue and, for a stream, the umbrella issue. -->

Closes #
Part of #

## What changed

<!-- What and why, in one short paragraph or a few bullets. Not a file list. -->

## Proof commands

<!-- The commands you actually ran on this head, with their result. CI runs the full set. -->

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

- [ ] Every command listed above is green on this head.

## Pre-review record

<!-- Required for code PRs: changes under pap/, spec/lib/, profiles/ or contracts/.
     Documentation/config-only PRs: write "docs-only, skipped: <reason>". -->

- **Reviewer model and route:**
- **Reviewed head SHA:**
- **Verdict:** READY / CHANGES_REQUESTED / UNCERTAIN
- **Findings and dispositions:** fixed in `<sha>` / follow-up #N / declined: `<reason>`

## Risk, rollback and test coverage

- **Risk:**
- **Rollback:**
- **Not covered by tests:**

## Size and scope

- **Changed lines, excluding generated artifacts, fixtures and goldens:**
- [ ] At most 400 lines, or this PR states why it cannot be split.

## Checklist

- [ ] One concern; no unrelated refactor or reformatting.
- [ ] Branch named `<type>/<issue#>-<slug>` and based on up-to-date `main`.
- [ ] Conventional Commits title; English body.
- [ ] Generated artifacts regenerated and committed (`bun run build`; CORE-000 Q9 when its inputs change).
- [ ] Documentation freshness updated (engine-contract snapshot, CORE-000 claim count, diagnostic-code registry, links).
- [ ] No secrets, tokens or credentials.
- [ ] Agent-authored: same gates; the pre-review record above is present; no merge or auto-merge by the agent.
