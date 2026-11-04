# CORE-000 S2.1 implementation proposal — model surface and structure

**Status:** planning-only proposal package for maintainer review. It authorizes no implementation and
changes no code, schema, fixture, test, evidence or generated artifact. **All ten planning
questions (Q1–Q10) are resolved by owner decisions (2026-11-03/04).** Q1: 9 phases, 8
`hasPrerequisite` edges, zero transition instances, 29 relations. Q2: a second consumer-extension
trust boundary and a scoped consent-facts check. Q3: 25 diagnostics (24 profile-owned + 1 core-owned).
Q4: `id = code` with an open, data-label `status`. Q5: bounded typed accessors. Q6: unit-level
defensive checks with stated guarantees. Q7: machine-decidable class/status subset. Q8: seven
dependency rows with exact versions and three import-grounded edges. Q9: no S2.1 artifacts; draft
planned for S2.2, evidence for S2.3. Q10: all 7 components and 12 interfaces public, 16 uncovered
IDs. No planning question remains open.

**Reconciliation status:** the planning questions are resolved and this proposal package is
reconciled. Upstream/canonical synchronization is complete: PR #90 synchronized the accepted
Q1/Q3/Q5/Q10 decisions, the 29-relation inventory, the Q9 stage allocation and the Issue #84
description; PR #92 completed the three current/forward-looking 23→24 policy-check count corrections
while preserving historical S1 references, and Issue #91 is closed. See
[`S2.1-implementation-plan.md`](S2.1-implementation-plan.md) §4.4 for the reconciliation record. S2.1
implementation remains **not authorized and not performed**.
**Prepared for:** [Issue #84](https://github.com/agent-federation/contract-builder/issues/84).
**Baseline:** `8d881d410c9945f7f5925fbf5772b06be2e9cc120` (`main`, 2026-11-02).
**Accepted sources:** [`core-000-self-contract.md`](../../core-000-self-contract.md) (design),
[`core-000-execution-plan.md`](../../core-000-execution-plan.md) (plan),
[`core-000-decision-record.md`](../../core-000-decision-record.md) (canonical decisions),
[`core-000-s2-package.md`](../../core-000-s2-package.md) (S2 planning package) and
[`engine-public-contract.md`](../../engine-public-contract.md) (public contract).

This package answers one question: **what exactly would S2.1 have to change, and what would it
prove?** It inspects the current repository instead of restating the planning documents, and it
classifies every proposed structure element as directly grounded, a new structural identifier
requiring maintainer review, or unresolved.

## Documents

| Document | Content |
|---|---|
| [`S2.1-implementation-plan.md`](S2.1-implementation-plan.md) | Baseline, verified current state, proposed model surface, structure encoding, sequence, commands, expected outputs, stop conditions. |
| [`S2.1-change-inventory.md`](S2.1-change-inventory.md) | Path-by-path inventory with current state, change, rationale, dependency, risk and status (required / conditional / no change; no S2.1 row is conditional now). |
| [`S2.1-test-plan.md`](S2.1-test-plan.md) | S2.1 test matrix, exact expected diagnostic set, and the S2.1 / S2.3 / S3 boundary. |
| [`S2.1-open-questions.md`](S2.1-open-questions.md) | Maintainer decisions with resolution status, evidence, options, recommendation, consequence and blocking status. |
| [`S2.1-maintainer-summary.md`](S2.1-maintainer-summary.md) | Verified facts, proposed implementation, recommendations, open decisions, blockers and the exact authorization requested. |

## What this package does not do

- It does not implement S2.1, S2.2 or S2.3, and it does not close G4.
- It does not change `spec/lib/`, the CLI/API, `profiles/core001/`, `pap/`, the CORE-001 artifact or
  the lockfile.
- It does not create claims, decisions, guarantees, independent-verification records or evidence.
- It does not promote any claim status and does not claim H2 or H3.
