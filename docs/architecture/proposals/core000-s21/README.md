# CORE-000 S2.1 implementation proposal — model surface and structure

**Status:** planning-only proposal package for maintainer review. It authorizes no implementation and
changes no code, schema, fixture, test, evidence or generated artifact. **Q1 (lifecycle semantics) is
resolved by owner decision (2026-11-03)**: 9 phases, one `hasPrerequisite` relation with 8 edges,
zero transition instances, 29 relations. The remaining questions (Q3, Q5, Q10 blocking) are open.
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
| [`S2.1-change-inventory.md`](S2.1-change-inventory.md) | Path-by-path inventory with current state, change, rationale, dependency, risk and status (required / conditional / no change). |
| [`S2.1-test-plan.md`](S2.1-test-plan.md) | S2.1 test matrix, exact expected diagnostic set, and the S2.1 / S2.3 / S3 boundary. |
| [`S2.1-open-questions.md`](S2.1-open-questions.md) | Unresolved maintainer decisions with evidence, options, recommendation, consequence and blocking status. |
| [`S2.1-maintainer-summary.md`](S2.1-maintainer-summary.md) | Verified facts, proposed implementation, recommendations, open decisions, blockers and the exact authorization requested. |

## What this package does not do

- It does not implement S2.1, S2.2 or S2.3, and it does not close G4.
- It does not change `spec/lib/`, the CLI/API, `profiles/core001/`, `pap/`, the CORE-001 artifact or
  the lockfile.
- It does not create claims, decisions, guarantees, independent-verification records or evidence.
- It does not promote any claim status and does not claim H2 or H3.
