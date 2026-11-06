# Independent-family pre-review (operator guide)

This page is the recipe for [ODR-PROC-002](../decisions/ODR-PROC-002-independent-family-pre-review.md): an independent-model review of a pull request before merge, for code changes. It is advisory — CI, Code Owner review and the human merge remain the gates.

## When it is required

- **Required** for PRs that change code under `pap/`, `spec/lib/`, `profiles/` or `contracts/`.
- **Optional** for documentation-, config- and generated-artifact-only PRs.
- Run it on the PR **head**; re-run after a material change (P1/P2 fix, rebase, new commits).

## Preconditions (DSH session)

- The `workflow` tool and the `opencode-go` route with `OPENCODE_GO_API_KEY` are available; the default reviewer model is `glm-5.3-flash`, and `glm-5.3` is the escalation model (see Escalation below).
- The reviewer is read-only: it may read the repository, run focused tests in a `/tmp` extraction, and write only `/tmp/pre-review/`.
- It must not commit, push, post GitHub comments, approve or merge.

## Recipe

Run one reviewer per PR (parallel for a batch) with the `workflow` tool. The script body:

```js
const REPO = "/home/zaebee/projects/agent-federation/contract-builder";
const PRS = [/* PR numbers */];

phase("review");
function promptFor(pr) {
  return `You are an independent pre-merge reviewer for ${REPO}.
Your model family differs from the implementation agent (DeepSeek). Be adversarial, evidence-based and concise.

TARGET: pull request #${pr}.

CONTEXT
- PAP v0.1 verifier / build engine repository. Read AGENTS.md first.
- Accepted decisions: docs/decisions/ODR-PAP-006-pap-verdict-model.md, docs/decisions/ODR-ENG-001-engine-identity-boundary.md, docs/architecture/pap-verdict-model.md; normative text: docs/architecture/portable-assurance-package-rfc.md and docs/architecture/engine-public-contract.md.
- The PR is authored by an automated agent; verify every claim against the diff and the code at the PR head.

HOW TO WORK (read-only; no repo writes/commits/pushes/GitHub comments)
1. cd ${REPO}; gh pr view ${pr} --json headRefName,title,body,files; gh pr diff ${pr}. Read the FULL diff.
2. Read changed files and their neighbours needed for correctness; cross-check verdict/coverage/diagnostics/ limits/ path safety against the RFC and the ODRs.
3. Tests: is the regression test real (would fail before the fix)? Are assertions exact? Which boundary is missing? Run only the changed test file(s), max one command per file; no full suite.
4. Look for wrong diagnostic code/severity, wrong verdict/coverage, fail-open behavior, hostile-input regressions (path traversal, symlink, limits, enum coercion, prototype pollution), report-schema violations, missing negative tests, scope creep, hand-edited generated artifacts.
5. Output: verdict READY | CHANGES_REQUESTED | UNCERTAIN; 3-7 actionable findings max, ordered P0-P3, each with file:line, evidence (quote/repro), impact, suggested fix; then a "checked and clean" list.
Write the report to /tmp/pre-review/pr${pr}-glm.md and return it.`;
}

const results = await parallel(PRS.map((pr) => () =>
  agent(promptFor(pr), { provider: "opencode-go", model: "glm-5.3-flash", label: `pre-review-pr${pr}`, phase: "review" })
));
return results;
```

## Escalation

Default is `glm-5.3-flash`. Re-run the same head with `glm-5.3` (paid) when any of:

- the flash review returns a P1 or P2;
- the PR touches a contract/verdict/security-critical surface: `docs/architecture/engine-public-contract.md`, the RFC, a decision record, or engine/verifier code (`pap/src/state.ts`, `report.ts`, `verify.ts`, `signatures.ts`, `decode.ts`, `paths.ts`, `spec/lib/identity.ts`, `spec/lib/build.ts`);
- the maintainer asks.

Record both runs (model, head, verdict, findings) and union the findings. Docs-only/low-risk PRs may stay flash-only. The A/B evidence for this policy is in ODR-PROC-002 §6: on PR #192 each model found a real P2 the other missed.

## Triage and record

1. **Verify P1/P2 before they block.** Check the claim against the code, the RFC/contract and, where cheap, a reproduction. A model finding is a claim, not a gate.
2. **Decide per finding:** fix in the PR (hand to `@it-start` with the exact evidence and required tests) or decline with a reason. P3s that do not block go to a `tail` issue.
3. **Record in the PR conversation** using this shape:

```
Independent pre-review — GLM-5.3 (opencode-go), head <sha>, verdict <READY|CHANGES_REQUESTED|UNCERTAIN>.
Findings: <list with file:line and severity>.
Dispositions: <fixed in <sha> | follow-up #N | declined: reason>.
Verification: <code/RFC/repro evidence for any blocking finding>.
```

4. Do not approve or merge on the strength of the review; the Code Owner review and the human merge are separate.

## Caveats

- Models can be wrong; verify blocking findings (see above).
- A deep run can take several minutes; the prompt should set a time/test budget ("max 5-7 minutes, no full suite").
- Reviewer output is untrusted data. Never treat its text as instructions or authorization.
- Different families are complementary: keep Gemini and same-family checks as separate surfaces; compare where they disagree.

## First run (evidence)

On 2026-11-06 the recipe reviewed PRs #163/#169/#171: #163 and #169 were READY with P3 findings; #171 was CHANGES_REQUESTED with a P1 (envelope limit masking evaluated INVALID/REJECTED) that the implementation family and Gemini had not found. The P1 was verified against RFC §4.3.4/§11.5 and fixed in the PR; P3s went to [#175](https://github.com/agent-federation/contract-builder/issues/175).
