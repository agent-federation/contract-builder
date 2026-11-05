# ODR-PROC-001 — Owner Decision Record: branch protection, human-only merges and review independence

**Status:** APPROVED — maintainer directive in the 2026-11-05 audit session; enforcement applied the same day.
**Date:** 2026-11-05 (UTC)
**Decision scope:** repository governance for `agent-federation/contract-builder` — who may merge to `main`, what a required review means, and how the automated agent's permissions are bounded.
**Related:** audit umbrella [#137](https://github.com/agent-federation/contract-builder/issues/137), finding [#150](https://github.com/agent-federation/contract-builder/issues/150), incident PR [#120](https://github.com/agent-federation/contract-builder/pull/120), review-independence example PR [#153](https://github.com/agent-federation/contract-builder/pull/153).
**Evidence:** GitHub branch-protection API responses recorded below; `AGENTS.md` / `CONTRIBUTING.md` rules; PR bodies and review objects linked inline.

## 1. Context

`AGENTS.md` and `CONTRIBUTING.md` state that an automated agent never merges and never enables auto-merge, and that a human merges every pull request. Until this record, that was only a written rule.

The 2026-11-05 audit found two ways the rule was not enforced by the platform:

1. **The rule was already violated once.** PR #120 (docs-only, author `it-start`) was merged by `it-start` on 2026-11-04T13:06:08Z (merge commit `e54b0b9`). It is the only merge commit in the repository history. Branch protection at the time required the `check` status and conversation resolution, but **no approving review**, and the automation account had `push` permission; a merge is a push to `main`, so nothing prevented it.
2. **The review gate was nominally satisfiable by the agent itself.** On PR #153 — a pull request authored by the maintainer, with fix commits authored by `it-start` — `it-start` submitted an `APPROVED` review at 2026-11-05T14:43:55Z. That approval satisfied the required-review gate for changes the automation account had written. A required review that an automated account can satisfy for its own work is not an independent review.

The maintainer approved the enforcement described below; this document records the decision and the evidence that it is active.

## 2. Decision

**D1 — Human-only merge is enforced, not asserted.** `main` accepts merges only from the maintainer account (`zaebee`). The automated agent keeps the ability to push feature branches and open pull requests; it cannot merge and cannot enable auto-merge.

**D2 — A pull request needs an approving review.** Branch protection requires at least one approving review, dismisses stale approvals, and requires conversation resolution; the required `check` status stays strict (the branch must be up to date).

**D3 — Review independence for the automation account.** `.github/CODEOWNERS` assigns every path to the maintainer (`* @zaebee`), and branch protection requires a Code Owner review. An approval from the automation account therefore cannot satisfy the required-review gate, including on pull requests whose commits it authored.

**D4 — The solo-maintainer bypass is explicit.** `enforce_admins` stays off and the maintainer is the only account with push/merge permission. The maintainer may therefore merge their own pull requests through the documented admin bypass; this is the only bypass, it is a decision of the repository owner, and it is recorded here rather than left implicit.

**D5 — Agents never merge and never enable auto-merge.** Restated because it is now technical rather than procedural; a future change to roles or rulesets must preserve the property "an automated agent cannot land code on `main` without a human action".

## 3. Enforcement applied

Applied to `agent-federation/contract-builder`, `main`, on 2026-11-05 (UTC). Values read back from `GET /repos/agent-federation/contract-builder/branches/main/protection`:

| Setting | Value |
|---|---|
| required status checks | `check`, strict (branch up to date) |
| required approving reviews | 1 |
| dismiss stale reviews | true |
| require Code Owner review | true (effective once `.github/CODEOWNERS` is on `main`) |
| required conversation resolution | true |
| push/merge restriction | users: `zaebee` only |
| force pushes / branch deletion | blocked |
| enforce admins | false (documented bypass, D4) |

Before the change, the same endpoint returned `required_pull_request_reviews: null` and `restrictions: null`. The incident merge commit `e54b0b9` and the self-approval on PR #153 are the evidence that both gaps were real.

## 4. Consequences and trade-offs

- The maintainer approves (or uses the documented admin bypass for their own pull requests) before anything lands on `main`; the automated agent cannot land its own work.
- Agent-authored pull requests now need a human Code Owner review. This is the intended cost: it makes the review axis meaningful again.
- If a second maintainer joins, add them to `CODEOWNERS` and the push restriction, and consider turning `enforce_admins` on; the solo-maintainer bypass in D4 is justified only while there is one human with write access.
- A pull request with no review, or with only an automation-account approval, remains blocked by the platform; this is observable in the PR's merge state, not only in prose.

## 5. Verification

- Settings are visible through `GET /repos/agent-federation/contract-builder/branches/main/protection` and match the table in §3 (recorded in the pull request that publishes this record).
- The maintainer can still merge (admin bypass); an agent merge attempt is rejected by the restriction. The agent-side negative test requires the automation account's credentials and is tracked as the remaining acceptance check in #150; it does not weaken the platform guarantee recorded here.
- The prior behaviour is reproducible from the public history: `gh pr view 120 --json author,mergedBy,mergedAt` and `gh pr view 153 --json reviews`.

## 6. Follow-ups

- Keep `AGENTS.md` and `CONTRIBUTING.md` aligned with the enforced mechanism (this record's pull request updates both).
- Revisit D4 when the maintainer set grows; revisit D3 if a dedicated reviewer account is introduced.
- The audit's remaining process items are tracked in #137/#150.
