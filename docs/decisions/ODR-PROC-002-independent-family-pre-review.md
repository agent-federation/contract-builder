# ODR-PROC-002 — Owner Decision Record: independent-family pre-review in the SDLC

**Status:** APPROVED — maintainer directive in the 2026-11-06 session ("вписать в наш SDLC пайплайн pre-review через glm"), after the first cross-family experiment.
**Date:** 2026-11-06 (UTC)
**Decision scope:** the pre-merge review surface for pull requests to this repository: an independent-family reviewer becomes a required step for code changes, advisory to CI, Code Owner review and the human merge.
**Related:** audit umbrella [#137](https://github.com/agent-federation/contract-builder/issues/137), architecture streams [#170](https://github.com/agent-federation/contract-builder/issues/170), process ODR [ODR-PROC-001](ODR-PROC-001-branch-protection-and-agent-merge.md), adoption issue [#176](https://github.com/agent-federation/contract-builder/issues/176), operator guide [pre-review.md](../agents/pre-review.md), P3 tail [#175](https://github.com/agent-federation/contract-builder/issues/175).

## 1. Context and evidence

The repository is implemented in large part by an automated agent running DeepSeek (`it-start`). CI, Gemini (Google) and human review exist, but the first controlled cross-family experiment on 2026-11-06 showed a real gap:

- **PR #171** (PAP envelope resource limits) was approved by the implementation family and had no Gemini findings. An independent **GLM-5.3** pre-review (`provider: opencode-go`, `model: glm-5.3`) found a **P1**: a resource limit on one envelope replaced the aggregate signature results with `NOT_EVALUATED`, masking an evaluated `INVALID`/`REJECTED` from another envelope and downgrading FAIL (exit 1) to INCOMPLETE (exit 2) at producer will. The finding was verified against RFC §4.3.4 / §11.5 and the PR-head code; a fix was requested in that PR.
- **PR #163** (signature discovery containment) was READY for GLM but had three P3 findings; Gemini's only finding (filesystem-root path edge) was missed by GLM — the two families are complementary, not duplicates.
- **PR #169** (text escaping) had no same-family or Gemini findings; GLM found two P3s (non-BMP escape form, missing policy digest in text output required by RFC §9.6).

Conclusion: a reviewer from a different model family than the implementer finds classes of issues the same family and the existing bot do not, at low marginal cost. The capability existed but was not part of the process, so it depended on a session remembering to use it.

## 2. Decision

**D1 — Required for code PRs, optional for documentation.** Before merge, a pull request that changes code under `pap/`, `spec/lib/`, `profiles/` or `contracts/` must have an independent-family pre-review. Documentation-only, config-only and generated-artifact-only PRs may skip it.

**D2 — Standing reviewer: GLM-5.3-flash by default, with paid GLM-5.3 escalation.** The review runs in a DeepSeek Harness session via the `workflow` tool on the `opencode-go` route, one reviewer agent per PR (parallel for a batch), default model `glm-5.3-flash` (cheap, same family). Escalate to `glm-5.3` at the same head when flash returns a P1/P2, when the PR touches a contract/verdict/security-critical surface, or when the maintainer asks (triggers in §6 and `docs/agents/pre-review.md`). The exact recipe and prompt are in `docs/agents/pre-review.md`. Any later model change is a decision under this record, not an ad-hoc choice.

**D3 — Advisory, not an authority.** CI, the required Code Owner review and the human merge remain the gates. Reviewer output is untrusted data: it never authorizes work, never approves, and never merges. **P1/P2 findings must be verified** against code/RFC/a reproduction by the maintainer or the Lead agent before they block; unverified findings are reported as claims, not as gates.

**D4 — Findings and dispositions are recorded.** Each run is recorded in the PR conversation: reviewer model and route, the head SHA reviewed, the verdict (READY / CHANGES_REQUESTED / UNCERTAIN), the findings, and the disposition of each (fixed, declined with a reason, or follow-up issue). P3 follow-ups that do not block go to a `tail` issue.

**D5 — Run at the head, re-run on material change.** The review targets the PR head; if the head moves materially after a P1/P2 fix or a rebase, the review is repeated on the new head before merge.

## 3. Consequences

- The merge path gains one advisory review step: typically a few minutes per batch and a small token cost; a deep review can take longer, so the prompt carries a time/test budget.
- Cross-family blind spots are reduced; the cost is one more artefact to triage, and a policy for declining findings with reasons (D3/D4).
- The same-family reviewer (`it-start` approving its own or sibling work) is explicitly not sufficient as the only review; this decision makes that operational.
- No change to CI, branch protection or the human-only merge rule.

## 4. Verification

- The first run on #163/#169/#171 produced the evidence in §1; the #171 P1 was independently confirmed by the maintainer/Lead against the RFC and the PR-head code.
- The recipe in `docs/agents/pre-review.md` is executable in a DSH session; the operator guide includes the exact workflow call and the report format.
- A later PR (S1/S2 or E1/E2, whichever lands first) is the next probe: the review must be recorded in the PR and any unique P1/P2 must be triaged.

## 5. Follow-ups

- Automate the trigger when practical (a label or a mention-driven bot), so it does not depend on a session remembering; record the automation decision separately.
- Track "unique findings" per reviewer family as a lightweight metric of usefulness.
- Re-evaluate the reviewer model after a few PRs; a change of route/model requires an update to this record.

## 6. Amendment 2026-11-06 — reviewer model policy (A/B evidence)

An A/B experiment ran both models on the same heads of PRs #191 (S3) and #192 (E3):

- #191: both returned READY; findings were P3-only and complementary.
- #192: both returned CHANGES_REQUESTED with **different P2s** — `glm-5.3` found nine stale evidence anchors in the revised status matrix, `glm-5.3-flash` found a §8.1 `identity.extensions[].closureDigest` over-promise contradicted by the shipped `BuildIdentity`. Neither model found the other's P2; after fixes both returned READY on the delta.
- No `glm-5.3-free` exists; `glm-5.3-flash` is the cheap same-family option (~10x cheaper) on the same route.

Accepted policy: **flash by default, paid escalation.**

- Default: `glm-5.3-flash` (`provider: opencode-go`).
- Escalate to `glm-5.3` at the reviewed head when any of: (a) flash returns P1/P2; (b) the PR touches `docs/architecture/engine-public-contract.md`, the RFC, a decision record, or engine/verifier code (`pap/src/state.ts`, `report.ts`, `verify.ts`, `signatures.ts`, `decode.ts`, `paths.ts`, `spec/lib/identity.ts`, `spec/lib/build.ts`); (c) the maintainer asks.
- Docs-only/low-risk PRs may stay flash-only.
- P1/P2 from either model are still verified by the maintainer/Lead before they block; reviewer output remains untrusted.

Rationale: the two models' blind spots are complementary (each found a real P2 the other missed), so the paid pass is kept as the escalation/confirmation channel rather than as the default; the cheap flash pass covers every code PR. Amended record: #193.
