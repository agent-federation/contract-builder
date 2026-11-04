# CORE-000 decision record — S1 decisions and S2 planning decisions

**Status:** canonical CORE-000 decision record. The original S1 decisions were recorded on
2026-11-02; D14, P-2, P-3 and P-6 were deferred for S1 at that time and were subsequently accepted
for the full-model planning scope on 2026-11-03. S2-D1–S2-D4 were also accepted on 2026-11-03.
Q1, Q3, Q5 and Q10 were accepted on 2026-11-03/04; Q2, Q4, Q6, Q7, Q8 and Q9 were accepted on
2026-11-04. None of these later planning decisions authorize S2.1, S2.2 or S2.3 implementation.
S2.1 implementation was separately authorized by the project owner on 2026-11-04 (see
[Maintainer authorization — S2.1 implementation](#maintainer-authorization--s21-implementation-2026-11-04)
below); S2.2 and S2.3 remain separately gated. This document does not implement CORE-000 and does
not change code, tests, schemas, fixtures, evidence or generic-core behaviour.
**Issue:** [#47](https://github.com/agent-federation/contract-builder/issues/47), refreshed by
[#72](https://github.com/agent-federation/contract-builder/issues/72).
**Original S1 decision recorded:** 2026-11-02, after PR #74 merged as
[`1c405c2`](https://github.com/agent-federation/contract-builder/commit/1c405c2876c030f8855f777e160ca9f9f638af45).
**Original S1 decision source:** [Issue #72 comment 6579841746](https://github.com/agent-federation/contract-builder/issues/72#issuecomment-6579841746)
by `zaebee` (maintainer).
**Subsequent planning decisions:** D14, P-2, P-3, P-6 and S2-D1–S2-D4 were explicitly approved
by the maintainer in the project-owner conversation on 2026-11-03 and are recorded in this
documentation PR. That approval conversation is not a public GitHub source; this record does not
misrepresent the PR itself as the original source of approval.
**Planning baseline:** [`c6ee644`](https://github.com/agent-federation/contract-builder/commit/c6ee64416c91ab56f9d8270114c8f8a8b9d2f608)
(PR #73; includes #59, #60, #61, #64, #66, #67 and the PAP verifier). The original record baseline was
[`b8e67a8`](https://github.com/agent-federation/contract-builder/commit/b8e67a8bf74897b8c44399931d17477abccd78ec);
the refresh found no code or profile change that affects these decisions (see
[`core-000-baseline-refresh.md`](core-000-baseline-refresh.md)). The accepted design is
[`core-000-self-contract.md`](core-000-self-contract.md) (PR #51); the accepted execution plan is
[`core-000-execution-plan.md`](core-000-execution-plan.md) (PR #59).

> **What this is.** The canonical record of the CORE-000 S1 decisions and subsequent S2 planning
> decisions. The 2026-11-02 S1 deferrals of D14, P-2, P-3 and P-6 remain part of the historical
> decision trail; the 2026-11-03 maintainer decision below accepts those four options for the
> full-model planning scope and accepts S2-D1–S2-D4.
> For each item the record states the exact question, viable options, decision, consequences and
> trade-offs, dependencies, reversibility, and the repository evidence that informs it.
>
> **What this is not.** It is not an implementation, a generic-core change, or an independent
> verification. No code or CORE-000 artifact is created by this record.
> **Historical S1 gate (already satisfied):** the first-slice proposal in
> [`core-000-self-build-poc.md`](core-000-self-build-poc.md) §10 was approved for implementation
> after the canonical S1 decision record merged. S1 was subsequently implemented and merged; this
> paragraph records that historical sequence and is not a pending authorization gate.

---

## Maintainer decision — 2026-11-02

**Source:** the maintainer's [Issue #72 comment](https://github.com/agent-federation/contract-builder/issues/72#issuecomment-6579841746)
on 2026-11-02. This section is the canonical acceptance record; the detailed sections below retain
the full rationale and the open-item analysis.

| ID | Decision status as of 2026-11-02 | Effect for S1 |
|---|---|---|
| D1 | **Accepted — A** | CORE-000 project at `contracts/core000/`, profile at `profiles/core000/`; no package publication is implied. |
| D13 | **Accepted — A** | Distinct `independent_verification` entity kind/schema; do not reuse the core `VerificationRecord`. |
| D15 | **Accepted — A** | Require a stored `verified` provenance record for every normative source statement; failed/stale/unavailable is an error. |
| P-1 | **Accepted — B** | One base project plus one deterministic mutation per fresh isolated copy for negative cases. |
| P-4 | **Accepted — A** | `nunjucks` 3.2.4 as a declared, lockfile-pinned renderer dependency. |
| P-5 | **Accepted — A** | `contracts/core000/run.ts` plus `tests/core000.test.ts` as the consumer harness. |
| D14 | **Deferred for S1 — open** | Do not add consent interface/diagnostic entities in S1. |
| P-2 | **Deferred for S1 — open** | Defer durable evidence publication/location and the human-readable summary format. S1 must still write and test the transient JSON evidence record from the accepted execution plan and S1 proposal. |
| P-3 | **Deferred for S1 — open** | Do not commit the generated CORE-000 draft in S1. |
| P-6 | **Deferred for S1 — open** | Do not commit run evidence or external verification records in S1. |

**Historical S1 decision snapshot (2026-11-02).** The statuses in the table above record the
maintainer's S1 decision at that date. The later 2026-11-03 decision below accepts D14, P-2, P-3
and P-6 for the full-model planning scope; it does not rewrite what S1 actually did.

**G4 / consumer harness.** Confirmed for S1 only: the bounded consumer harness may be used for the
first slice. This does not close G4, does not close the generic CLI/API gap, and is not independent
verification.

**Authorization boundary.** The maintainer approves the bounded S1 scope in
[`core-000-self-build-poc.md`](core-000-self-build-poc.md) §10, subject to this canonical
decision-record update being merged. S1 implementation is authorized only after that merge and
when the implementation task references this record. S1 remains limited to the proposed vertical
slice, its positive/negative tests and transient evidence. No generic-core changes,
arbitrary/untrusted profile execution, security-sandbox claims, independent certification or
semantic-truth claims are authorized. A temporary workspace is not a security sandbox. Any scope
expansion or material deviation requires a new maintainer decision. The four items deferred in
that historical S1 snapshot were subsequently accepted for the full-model planning scope below.

---

## Maintainer decision — 2026-11-03

**Source:** explicit maintainer approval in the project-owner conversation on 2026-11-03.
This section records the eight decisions in this canonical file. It supersedes the open status of
the four S1 deferrals for the subsequent full-model planning scope; it does not rewrite the
historical S1 snapshot above.

| ID | Decision status | Accepted effect |
|---|---|---|
| D14 | **Accepted — A** | Represent the consent surface with API option, CLI flag and diagnostic entity; settle the trust boundary as `explicit_consent`. This does not claim sandboxing or process isolation. |
| P-2 | **Accepted — A** | Persist producer run evidence at `evidence/core000/<run>/result.json` and maintain the human-readable summary at `docs/architecture/core-000-execution-evidence.md`. |
| P-3 | **Accepted — A** | Commit `contracts/core000/output/CORE-000.draft.md` after a successful, reviewed run. A committed draft is an output for review, not a correctness or truth certification. |
| P-6 | **Accepted — A, run evidence only** | Commit producer-generated run evidence in Git. Independent-verification records remain separate and are not generated by the engine; S2 creates zero such records. Future records under `verification/core000/` require a distinct verifier and a separate maintainer decision. |
| S2-D1 | **Accepted — A** | The 24 enumerated policy-check codes are normative; the prose count of 23 is an error. Historical S1 snapshots remain historical. |
| S2-D2 | **Accepted — A** | Encode all 78 accepted claims with original IDs and statuses. No status promotion from structural completeness or build success; any status change requires source evidence and a separately authorized decision. |
| S2-D3 | **Accepted — A** | Include the `conformance_case` kind/schema with `conformanceCases: []`. For S2-D3, use a synthetic fixture to test `conformance.case-uncovered`; this fixture is a test input, not project data or independent evidence. Other synthetic fixtures used by focused tests remain test inputs only. |
| S2-D4 | **Accepted — A** | Keep the full N1–N18 negative-test matrix in S3. S2.3 covers focused tests for the 11 new checks only. |

**Mandatory evidence-separation invariant.** Producer-generated run records belong under
`evidence/core000/` and are producer evidence, not independent verification. Synthetic fixtures
are test inputs only. S2 creates zero `independent_verification` records and zero
`verification/core000/` records. Any future independent-verification record must be produced by a
distinct verifier and accepted under a separate maintainer decision; engine-generated evidence must
never be represented as independent.

**Authorization boundary.** This decision-record update records planning decisions only. It does
not authorize S2.1, S2.2 or S2.3. Each stage requires its own separate, explicit maintainer
authorization after review of that stage's exact scope. Approval or merge of this documentation PR,
or creation/linking of an implementation issue, is not implementation authorization. For S2.1
specifically, the separate authorization was given on 2026-11-04 (see the authorization section
below); this historical boundary is unchanged for S2.2 and S2.3.

---

## Maintainer decision — Q1, Q3, Q5 and Q10 (2026-11-03/04)

**Source:** the project owner's [PR #87 Q1 confirmation comment
6607056794](https://github.com/agent-federation/contract-builder/pull/87#issuecomment-6607056794)
(2026-11-03) and [PR #87 Q3/Q5/Q10 decision comment
6621046448](https://github.com/agent-federation/contract-builder/pull/87#issuecomment-6621046448)
(2026-11-04). The full question, evidence, options and consequence records for Q1, Q3, Q5 and Q10
are in [`S2.1-open-questions.md`](proposals/core000-s21/S2.1-open-questions.md). This section is the
canonical cross-reference to those durable owner decisions; it does not reinterpret, broaden or
reopen any of them.

| ID | Decision status | Accepted effect |
|---|---|---|
| Q1 | **Accepted — 2026-11-03** | One `hasPrerequisite` relation (the 29th declaration, phase → phase, many, no inverse) carries the eight contract §6.2 phase-dependency edges; the `transition` kind/schema is retained with zero S2.1 instances. The post-run invariant is the maintainer-approved formalization of `requires`; “all prerequisites `passed`” establishes eligibility only and admission is not an event. The §6.2 failure→skip sentence is read directly (direct dependents), and the completeness rule is a separate approved policy. Acyclic `hasPrerequisite` is an explicit well-formedness policy enforced by the S2.1 test only. No causal, execution-order, timing, scheduler, admission-event or state-production semantics are encoded. |
| Q3 | **Accepted — 2026-11-04** | Consent surface: `IF-CONSENT-OPTION` for `BuildOptions.allowExecutableProfile`, `IF-CONSENT-CLI-FLAG` for `--allow-executable-profile`, and the core-owned diagnostic `core.profile.consent-required`. `TB-PROFILE-EXEC` stays settled with `enforcement: explicit_consent`. One `/diagnostics` inventory: 24 profile-owned `core000.*` entries matching the catalog plus one core-owned entry (25 total). Model-level `diagnostic.phase` remains required; the consent diagnostic is associated with `PH-LOAD`, and any `raisedIn` must agree with `phase`. Ownership is catalog membership, never ID-prefix inference. |
| Q5 | **Accepted — 2026-11-04** | The generic IR's reserved `Entity.kind` semantics are preserved, as are the domain fields `dependency.kind` and `conformance_case.kind`; neither is renamed and generic IR extraction is unchanged. Profile-level bounded typed accessors `dependencyKind(model, id)` and `conformanceCaseKind(model, id)` are provided, fail closed, and never fall back to `Entity.kind` or a default. No unrestricted raw-document accessor is exposed to renderers or templates. |
| Q10 | **Accepted — 2026-11-04** | All seven declared components are public responsibility units and all twelve declared interface entities are public surfaces; interfaces are public by definition, so no redundant `public` field is added. Component `public` describes a public responsibility unit, not external accessibility; `stability` is independent of public status. Expected coverage remains 19 public surfaces (3 covered, 16 uncovered); tests assert the exact uncovered IDs, and the warnings remain visible. |

**Cross-question effect.** Q1 is the source of the 29th relation and the 18th S2.1 relation
declaration; Q3's inventory remains 25 model-level diagnostic rows and does not change Q4's
`id = code` vocabulary; Q5's accessors and Q10's public-surface semantics are unchanged from the
owner decisions. The affected relation counts are synchronized in
[`core-000-s2-package.md`](core-000-s2-package.md), the accepted design
([`core-000-self-contract.md`](core-000-self-contract.md)) and the
[`core-000-execution-plan.md`](core-000-execution-plan.md). The Q9 stage allocation remains recorded
in the 2026-11-04 section below and is synchronized in the S2 package.

**Authorization boundary.** This section is a canonical documentation record only. It does not
authorize S2.1, S2.2 or S2.3 implementation, code, schema, fixture, test, evidence or
generated-artifact changes.

---

## Maintainer decision — 2026-11-04

**Source:** [Issue #84 comment
6621648632](https://github.com/agent-federation/contract-builder/issues/84#issuecomment-6621648632)
(maintainer, 2026-11-04), based on the adversarial review of Q2/Q4/Q6/Q7/Q8/Q9 at merged `main`
`8bfebec`. This section records six accepted S2.1 planning decisions and the stated later-stage
artifact direction. It does not authorize implementation.

| ID | Decision status | Accepted effect |
|---|---|---|
| Q2 | **Accepted — B + D** | Add a distinct `TB-CONSUMER-EXTENSION` trust boundary with `enforcement: none` and `policy_status: settled`, describing only the consumer's own import decision (the engine's `allowExecutableProfile` gate does not govern it; no sandbox/isolation/engine enforcement implied). Scope `core000.trust.consent-facts` to `TB-PROFILE-EXEC` per design §5.7, with exact-set tests; a non-profile boundary with `enforcement: none` must not produce that finding. The inventory wording is corrected: an extra `review` finding does not fail the positive draft. |
| Q4 | **Accepted — A + D clarification** | `diagnostic.id = diagnostic.code`; `status` remains an open non-empty string (no closed enum) with a format constraint; S2.1 uses `status: declared` for every row, documented as a data-level label, not a diagnostic lifecycle state. Tests cover `id === code`, uniqueness, exact catalog/core membership, trimmed non-empty status, the S2.1 status set `{declared}`, and phase/`raisedIn` agreement. Ownership remains catalog membership, never ID-prefix inference. |
| Q6 | **Accepted — A′** | `core000.claim.invalid-status` is retained as a defensive, unit-level assertion; schema validation shadows it in the pipeline and no pipeline observability is claimed. `core000.evidence.locator` is limited to non-empty trimmed locator/revision; no locator regex or grammar is added, and the path/URL/command form stays human review. Catalog messages and S2.3 planning must not claim stronger guarantees. |
| Q7 | **Accepted — A′** | `core000.claim.status-class-conflict` enforces only the machine-decidable subset: `non_goal`/`deferred` with `implementation: implemented` or `tests: tested`, and `proposal` with `implementation: implemented`. The `limitation` exception remains human review; no marker field, accepted-limitation ID list or literal rule is added. The check and its catalog message describe machine-decidable class/status conflicts only; S2.3 uses synthetic cases and notes that the project register has no `deferred`/`non_goal` class rows. |
| Q8 | **Accepted — A′** | Seven dependency rows (`bun`, `ajv`, `nunjucks`, `yaml`, `typescript`, `@types/node`, `@types/nunjucks`); no transitive or unsourced pipeline/decision/product rows. `resolved` rows use exact lockfile versions (ajv 8.20.0, nunjucks 3.2.4, yaml 2.9.1, typescript 5.9.3, @types/node 22.20.5, @types/nunjucks 3.2.6). `bun` is runtime/`declared` with `version: >=1.4.0`; the `packageManager: bun@1.4.2` pin is a separate consequence/note. Only import-grounded `requires` edges are kept (COMP-CORE→ajv, COMP-CORE→yaml, COMP-RENDERER→nunjucks); the COMP-CORE→bun edge is removed and no build-tooling edges are invented. |
| Q9 | **Accepted — A + staged D** | S2.1 commits no draft and no durable producer evidence (transient harness output only). Planning direction: `contracts/core000/output/CORE-000.draft.md` in S2.2 after the full register; `evidence/core000/<run>/result.json` and `docs/architecture/core-000-execution-evidence.md` in S2.3 after focused checks. Before those stages, specify a reproducible copy-from-temporary-workspace procedure and a CORE-000-specific artifact verification command/check; `bun run check` validates CORE-001 only and must not be relied on for CORE-000. This is staged planning, not authorization to create artifacts or implement S2.2/S2.3. |

**Cross-question constraints.** Q1, Q3, Q5 and Q10 remain resolved exactly as recorded. Q3's single
25-entry model-level diagnostic inventory, required `diagnostic.phase`, and ownership by catalog
membership are preserved. Q5's bounded typed accessors and the generic IR's reserved `Entity.kind`
are preserved. Q10's 19 public surfaces / 16 uncovered warnings are preserved. Repository facts,
accepted normative rules, these owner decisions and any implementation proposal remain distinct;
no accepted source was rewritten and no new semantics was inferred.

**Authorization boundary.** This section records planning decisions and the Q9 staged direction
only. It does not itself authorize S2.1, S2.2 or S2.3 implementation, code, schema, fixture, test,
evidence or generated-artifact changes. S2.1 was authorized separately on 2026-11-04 (see the
authorization section below); S2.2 and S2.3 still require their own separate, explicit maintainer
authorization.

---

## Maintainer authorization — S2.1 implementation (2026-11-04)

**Source:** [Issue #84 comment
6623307799](https://github.com/agent-federation/contract-builder/issues/84#issuecomment-6623307799)
(project owner, 2026-11-04).

**Status:** S2.1 implementation is **authorized** and, at the time of this record, **not yet
performed**. Implementation baseline: `main` `8c3a5faf388cac97e357073204de39f82a3737d6`.

**Scope of the authorization.** The exact accepted S2.1 scope in the proposal and its Q1–Q10
decisions, including:

- preserve the five existing S1 claims, their statuses and existing S1 behavior;
- implement the accepted model surface and 29 relation declarations, including the eight Q1
  `hasPrerequisite` edges and zero transition instances;
- preserve the Q1 distinction between repository facts, owner-approved formalization/policies and
  deferred runtime behavior; add no scheduler, execution-order, causal state-production,
  admission-event or fourth phase-state semantics;
- no generic-core changes, no new dependencies, no CORE-001 changes, no H2/H3 or
  independent-verification claims;
- no full 78-claim register (S2.2), no focused S2.3 tests/evidence, no S3 N1–N18 matrix;
- no committed CORE-000 draft or durable producer evidence in S2.1 (Q9: draft S2.2, durable
  evidence/human summary S2.3).

**Still gated.** S2.2, S2.3 and S3 each require their own separate, explicit maintainer
authorization. This authorization does not extend to generic-core changes, new normative semantics,
CORE-000 draft or durable producer-evidence creation, claim promotion or independent-verification
records. The planning decisions above remain historical planning decisions; this section is the
canonical record of the S2.1 implementation authorization and supersedes only the earlier “S2.1 not
authorized” current-status statements.

---

## Maintainer decision — S2.2 owner rulings (2026-11-04)

**Source:** owner review of the S2.2 owner-decision sheet, [Issue #119 comment
6631326400](https://github.com/agent-federation/contract-builder/issues/119#issuecomment-6631326400)
(maintainer, 2026-11-04), based on the second adversarial review and the follow-up maintainer review
in that issue. This section records S2.2 planning decisions and one staged model decision. It does
not authorize S2.2 implementation.

**Status:** the S2.2 scope remains **not authorized**. It is re-frozen only after the S2.2a
subject-model decision below and a fresh independent scope review.

| ID | Decision status | Accepted effect |
|---|---|---|
| S2.2-A | **Accepted — direction A2 + A1a, staged** | The S2.2 register maps structural claims to the existing eight `subject_kind` values with a per-claim rationale (A2). Meta-claims — claims about claims, decisions, evidence, source statements, the register or process — are intended to receive honest non-structural subjects (A1a). A1a changes model semantics (design §5.3.1/§5.4: the allowed subject kind is policy, all subjects of a claim share one kind, and a claim needing two kinds is split), so it requires a separate **S2.2a** decision and scope that align schema, design and checks. S2.2a review and scope preparation are authorized as planning only. S2.2 **must not implement A1a**: no new `subject_kind` value and no missing-subject exemption is authorized by this section. |
| S2.2-B | **Accepted — B1 + B4** | Per-claim decision-source table `claim → source → decision status → decision entity`. Source hierarchy: (1) `core-000-decision-record.md` entries; (2) task constraints C1–C15 as decision entities per design §5.3.1; (3) `engine-public-contract.md` entries only where that document's own legend makes them accepted or maintainer-directed — the document is `Status: proposed for maintainer review`, not a canonical accepted list; (4) design acceptance (PR #51) only with an explicit per-claim owner ruling, never blanket. One decision entity per distinct decision, not per claim. No umbrella decision for claims with no per-claim source; such a claim needs an explicit owner ruling or deferral. Status agreement (`accepted`/`proposed`/`deferred`/`unresolved`) is checked per claim. |
| S2.2-C | **Accepted — C1** | Explicit, owner-approved per-claim `authority` table. The five S1 values are fixed: `C000-TR-001` human, `C000-TR-003` external, `C000-CT-025` engine, `C000-CT-026` engine, `C000-IM-004` external. No class/subject rule and no implementer inference; every `engine` assignment must be justified by an actually core-enforceable check. The table fixes `M` in `core000.independent-verification.missing = 3 + M`. |
| S2.2-D | **Accepted — D1 with a grounding rule** | Encode and render class-specific fields (`conditions`, `consequence`, `baseline`, `notes`) only where an accepted source supports the actual value. `conditions` is required for the two guarantee claims (otherwise `core000.claim.unsupported-guarantee` errors): `C000-CT-012`'s conditions come from its claim statement, while **`C000-CT-011`'s condition text requires a separate owner-approved formulation** and must not be authored by the implementer to make a check pass. Ungrounded fields are explicitly deferred, not invented. The §7.6 class grouping and status counts may be applied within the existing `view.ts`/template boundary. |
| S2.2-E | **Accepted — E1′** | New evidence rows use the base revision whose behaviour was inspected (`96ff22f` or the PR's base), not the as-yet-unknown S2.2 merge SHA. The S1 rows remain byte-verbatim at `dffdaa2`; no S1 refresh (E2 rejected). The two C4 locator refinements are re-checked at scope preparation: `C000-IM-003` → the build-result exit-code assertions in `tests/build.test.ts`; `C000-IM-009` → `spec/lib/identity.ts:604/753` plus `tests/identity.test.ts:555`. Evidence **rows** are part of `claims.yml` and therefore participate in `inputDigest`; evidence **files** remain outside it (G1); the artifact is built after the final evidence inputs are fixed. |
| S2.2-F | **Accepted — literal multiset + entity IDs** | The S2.2 verification test asserts the literal `{code, severity, occurrence count}` multiset **and** the exact finding `entityId` values, at a named revision, labelled a reviewed snapshot of the accepted mappings — not a prediction from design §7.7. This is recorded as an explicit S2.2 acceptance criterion. |
| S2.2-H | **Accepted — explicit authoring policy** | The six schema-required fields (`author`, `authority`, `scope`, `verification_method`, `lifecycle`, `subject_kind`) receive an owner-approved policy/table; no silent defaults. `authority` is S2.2-C; `subject_kind`/`subject` is S2.2-A; `author` attribution, `scope` and `verification_method` text, and the `lifecycle` rule are explicitly decided, with a per-claim table where the accepted register is ambiguous. |
| S2.2-U | **Conditional — default U = 0** | An unresolved-decision link is recorded only if a claim has a confirmed semantic dependency on a canonically recorded unresolved decision. Verification found the only source for `C000-CT-022`'s `D20`/`D29` dependency is the proposed `engine-public-contract.md`, whose `D20` rationale references issue #10 — a closed LICENSE decision — and no open or accepted source records packaging/publication as unresolved today. No unresolved link is therefore created in the S2.2 register: `core000.decision.unresolved` is not demonstrated by the clean build and remains covered by the S2.3 synthetic test. If an unresolved decision source is canonically recorded later, linking it (U = 1) is the expected representation; the register is not adjusted to manufacture a diagnostic count. |
| S2.2-SC | **Accepted — honest surface coverage** | The subject mapping determines `core000.surface.claim-missing`; do not invent claims to reach zero. The S2.2 PR lists the final uncovered component/interface IDs and states that the accepted register does not cover them. |
| S2.2-G | **Accepted — mechanical constraints** | Every existing assertion the register breaks is updated in the same PR without weakening the S2.2 test (repo-draft absence, the 5-claim count, the counts object, evidence-accessor ordering, S1-POS-01's exact 19-diagnostic set, artifact-substring assertions). The five S1 claim/evidence/decision blocks stay byte-verbatim, the five mutation anchors stay unique (`mutations.ts` throws on duplicates), and the S1 evidence rows stay leading. The CORE-000 generated-artifact maintenance rule is a separate follow-up tail: `AGENTS.md` documents the CORE-001 rule only and is outside the S2.2 boundary. |

**Staged model decision — S2.2a.** The A1a direction is accepted, but its implementation is not. A
separate S2.2a step may review and prepare a scope for the subject-model change (schema, design and
check alignment), and must demonstrate that the new subject kinds work with design §5.3.1/§5.4
before any implementation is authorized. S2.2 cannot start the register work on the assumption that
A1a will land.

**U condition.** U = 1 is not pre-authorized. It becomes the correct representation only after a
canonical unresolved-decision source for `C000-CT-022` is recorded; until then U = 0 and the S2.3
synthetic test is the coverage of `core000.decision.unresolved`. This keeps the register data honest
and prevents the diagnostic multiset from driving the data.

**Verified basis for these rulings.** The second adversarial review and the follow-up maintainer
review in Issue #119 agree on the diagnosis. Verified against merged `main` `96ff22f`:
`engine-public-contract.md` is marked proposed for maintainer review; design §5.4 makes
`subject_kind` policy with one kind per claim and a split for multi-kind claims; design §5.3.1 makes
task constraints C1–C15 decision entities; the D-table marks `D17`/`D18`/`D25` proposed,
`D20`/`D29` unresolved, `D32` deferred and `D33` accepted (#37); `C000-CT-012` states its conditions
while `C000-CT-011` does not; the S1 authority precedents are as listed in S2.2-C; evidence rows are
inside `inputDigest` while evidence files are outside it (G1); `git log dffdaa2..HEAD -- spec/lib` is
empty, so the S1 evidence at `dffdaa2` remains valid.

**Authorization boundary.** This section records planning decisions and one staged model direction
only. It does not authorize S2.2 implementation, code, schema, claim data, test, evidence or
generated-artifact changes, and it does not authorize S2.2a implementation. After the S2.2a decision
and these rulings are recorded and reviewed, the S2.2 scope in Issue #119 is re-frozen with the
rulings and the S2.2-G constraints as explicit acceptance criteria, a fresh independent scope review
is performed, and only then may a separate explicit S2.2 authorization be granted. S2.3 and S3
remain separately gated; no generic-core, CORE-001 or PAP change is implied.

---

## 0. How to answer the open items

For each item, one of the following is enough:

| Answer | Meaning |
|---|---|
| `accept recommendation` | Accept the recommended default exactly as written. |
| `choose A/B/C/…` | Choose a different option; state any modification. |
| `defer` | Leave the item open; state what the first slice may do without it. |
| `record: <text>` | Record a different decision and its consequence. |

The six original S1 decisions were answered on 2026-11-02. The four items deferred for S1 were
subsequently accepted for the full-model planning scope by the 2026-11-03 decision above. The
answer format below applies to any later material deviation; it does not reopen accepted decisions
or authorize implementation.

---

## 1. Decision summary

| ID | Question | Decision | Status | Needed before the first slice? |
|---|---|---|---|---|
| D1 | Where do the CORE-000 project and profile live? | A: `contracts/core000/` + `profiles/core000/` | **Accepted — A** | Yes — all paths depend on it. |
| D13 | How is an independent verification represented? | A: separate `independent_verification` kind | **Accepted — A** | Yes — S1 includes the kind schema. |
| D14 | How is the consent surface represented? | A: consent interface/diagnostic entities + settled trust boundary | **Accepted — A (2026-11-03)** | Full-model planning includes the API option, CLI flag, diagnostic and `explicit_consent` boundary; no sandbox claim. |
| D15 | Must every normative source statement have a checked verification record? | A: require a stored `verified` record; failed/stale/unavailable is an error | **Accepted — A** | Yes — S1 includes the provenance policy. |
| P-1 | Complete per-case fixture projects or base + mutations? | B: base project + one deterministic temp-copy mutation per case | **Accepted — B** | Yes — S1 includes negative tests. |
| P-2 | Durable evidence publication/location and summary format? | A: `evidence/core000/<run>/result.json` + human summary | **Accepted — A (2026-11-03)** | Durable producer evidence plus human-readable summary; transient run evidence remains required. |
| P-3 | Commit the generated CORE-000 draft? | A: commit after a successful reviewed run | **Accepted — A (2026-11-03)** | Commit the full-model draft after a successful, reviewed run; this is not certification. |
| P-4 | Renderer dependency? | A: `nunjucks` 3.2.4, declared and lockfile-pinned | **Accepted — A** | Yes — S1 includes the renderer. |
| P-5 | Harness shape? | A: `contracts/core000/run.ts` + `tests/core000.test.ts` | **Accepted — A** | Yes — S1 includes the harness. |
| P-6 | Evidence and independent records in git? | A: commit producer run evidence; keep future independent records separate | **Accepted — A (2026-11-03), run evidence only** | Commit producer evidence under `evidence/core000/`; zero independent records in S2; future external records require a distinct verifier and separate decision. |

“Needed before the first slice” is a dependency note, not a decision. The six original S1
decisions and four S1 deferrals were recorded on 2026-11-02; the four deferred items were later
accepted for the full-model planning scope on 2026-11-03. The separate consumer-harness/G4
confirmation remains for S1 only and does not close G4. The historical S1 deferrals did not remove
the requirement to write and assert transient evidence in S1.

---

## 2. D1 — CORE-000 project location and profile distribution

**Question.** Where do the CORE-000 project and profile live, and are they distributed as a
package?

**Decision status:** **Accepted — A** on 2026-11-02 (canonical decision above). S1 uses
`contracts/core000/` and `profiles/core000/`; no package publication is implied.

| Option | What it means | Main consequence |
|---|---|---|
| **A (recommended)** | Project at `contracts/core000/`; profile at `profiles/core000/`; both in this repository; profile referenced with `external: true`; no publication. | Keeps the accepted design's project/profile/trust-boundary pattern and the contract §14 `contracts/` direction. |
| B | Project under `spec/core000/`; profile under `spec/core000/profile/`. | Simpler relative paths, but mixes the self-contract with the CORE-001 demo project and changes the `spec/` layout. |
| C | Separate repository or published package. | Independent distribution, but there is no packaging/export surface (M1/M2 gap) and it is premature. |
| `defer` | Leave the location open. | Blocks implementation: manifest paths, profile closure, evidence paths and tests all depend on it. |

**Recommended default: A.** It matches the accepted design's D1 recommendation, preserves the
project/profile/trust split (profile outside the project root exercises `external: true`), and does
not decide a distribution or publication question. C would require the M2 package work and a
publication decision that is explicitly out of scope.

**Consequences and trade-offs.**

- New top-level `contracts/` and `profiles/core000/` paths; the profile and source are
  `external: true`.
- A package, published profile or `contracts/self/` migration remains a later decision; A does not
  authorize publication.
- B would reduce `external: true` use but make the project look like part of the CORE-001 demo and
  weaken the boundary exercise. C adds packaging/process before the experiment exists.

**Dependencies and reversibility.** A is reversible at low risk before project data exists:
moving the project changes paths and `inputDigest`, but not the model. After evidence records are
published, a move requires re-running and re-linking evidence.

**Repository evidence/constraint.** The design's D1 and §3/§7 use `contracts/core000` /
`profiles/core000`; contract §14 describes a `contracts/self/` direction; `spec/contract-builder.json`
is the CORE-001 project root; `profiles/example` is a profile outside its project root; `package.json`
is private with no `exports`. There is no `contracts/` directory at the baseline.

**Evidence needed to accept:** a maintainer instruction naming the paths and confirming that no
package or publication is implied; a check that the chosen paths do not collide with existing
top-level directories; and review of the S1 file list in
[`core-000-self-build-poc.md`](core-000-self-build-poc.md) §10.2 for those paths.

**Answer needed:** accept A, choose B/C, or defer with an explicit statement that the first slice
may not create project/profile paths.

---

## 3. D13 — Independent-verification record schema and naming

**Question.** How should CORE-000 represent an independent review, given that #37 introduced a
core provenance `VerificationRecord`?

**Decision status:** **Accepted — A** on 2026-11-02. S1 uses a distinct
`independent_verification` kind/schema and does not reuse the core provenance `VerificationRecord`.

| Option | What it means | Main consequence |
|---|---|---|
| **A (recommended)** | A separate `independent_verification` kind with its own schema: `id`, `method`, `verifier`, `independence`, `independence_basis`, `performed`, `result`, `scope`, `revision`, `claim_results`, `limitations`, and conditional `commands`/`date`/`record_locator`; never reuse the core provenance `VerificationRecord`. | Keeps the #37 binding/verification distinction and makes `verification: independently_verified` checkable. |
| B | Reuse the core `VerificationRecord` shape and add independence fields. | Fewer schemas, but conflates a method-specific provenance check with an independent review. |
| C | A free-text external note. | Flexible, but not machine-checkable and cannot enforce independence or per-claim results. |
| `defer` | Do not model independent verification in the first slice. | The first slice can omit independent records, but any `independently_verified` claim or record cannot be represented. Defer explicitly. |

**Recommended default: A.** The core `VerificationRecord` is about a provenance binding and a
source digest; it explicitly is not independent verification (contract §4, #37/PR #55). Reusing it
would make the engine’s own method-specific record look like external assurance. A separate kind
preserves the distinction the design and the accepted claim register depend on.

**Consequences and trade-offs.**

- Adds one entity schema/kind (already in the accepted 14-kind model) and the `verifies` /
  `verifiedBy` reciprocal relations.
- Requires a canonical field set; the design §8.3 and the execution plan already define it.
- B is smaller but creates a semantic collision; C cannot enforce the record fields.
- The first slice can include the schema without any actual independent record; an empty
  `independentVerifications` list is expected.

**Dependencies and reversibility.** D13 is independent of D1/D14/D15; P-2/P-6 decide where
records live. The schema can be revised before records exist; after external records are accepted,
renaming/migrating is a data change.

**Repository evidence/constraint.** `spec/lib/ir.ts` and `spec/lib/provenance.ts` define
`ProvenanceVerification` and `VerificationRecord` with statuses `verified`/`failed`/`unavailable`/
`stale`; the contract §4 says `verified` is method-specific and not independent. The accepted
design already has the `independent_verification` kind and the C000-VF claims with zero independent
verification.

**Evidence needed to accept:** maintainer approval of the field set and the distinction from the
core `VerificationRecord`; review of the schema and the `verifies`/`verifiedBy` declarations; and a
check that no engine-generated record is presented as an independent one. The PAP verifier's
report schema is a separate product contract and is not evidence for this choice.

**Answer needed:** accept A, choose B/C, or defer independent-verification modeling from the first
slice.

---

## 4. D14 — Consent-surface representation in the model

**Question.** How should CORE-000 represent the merged consent API/CLI surface?

**Decision status:** **Accepted — A (2026-11-03)** for the full-model planning scope. The original
S1 deferral remains historical; the full model represents the API option, CLI flag and
`core.profile.consent-required` diagnostic, with `TB-PROFILE-EXEC` settled /
`explicit_consent`. This does not imply sandboxing or process isolation.

| Option | What it means | Main consequence |
|---|---|---|
| **A (recommended)** | Add interface entities for the API option and CLI flag, a diagnostic entity for `core.profile.consent-required`, and set `TB-PROFILE-EXEC` to `policy_status: settled` / `enforcement: explicit_consent`. | The merged consent policy is visible and reviewable in the self-description. |
| B | Describe consent only in the trust-boundary statement, with no interface/diagnostic rows. | Smaller model, but the public consent surface has no claim/interface row and can drift. |
| C | Model a separate declarative/executable profile class. | A larger product change that PR #50 did not make and the accepted design did not adopt. |
| `defer` | Do not add consent-surface entities in the first slice. | The trust-boundary row can still be settled; the API/CLI/diagnostic surface remains under-described until a later slice. |

**Recommended default: A.** `BuildOptions.allowExecutableProfile`, the CLI flag and
`core.profile.consent-required` are caller-visible public surfaces. The accepted design's C000-TR
claims already reference them; representing them as interface/diagnostic entities keeps the model
consistent with the implementation facts.

**Consequences and trade-offs.**

- Adds two interface rows (API option, CLI flag) and one diagnostic row; the trust boundary is
  `settled`/`explicit_consent`, not pending.
- B is smaller but leaves the consent surface out of the claim/interface graph; C is out of scope
  and would need a product decision.
- The diagnostic entity uses the M1 catalog shape (`code`, `severity`, `message`), not the
  contract's deferred `disposition`/`phase` fields.

**Dependencies and reversibility.** D1 decides paths; P-5/P-2 decide how the surface is exercised
and evidenced. The rows can be added later, but a profile/model without them would be incomplete
for review. Reversible before data/evidence references them.

**Repository evidence/constraint.** PR #50 merged `allowExecutableProfile` (default false), the CLI
flag `--allow-executable-profile`, fail-closed `core.profile.consent-required`, and the CLI
renderer preflight; `tests/consent.test.ts` covers rejection/success/preflight. The accepted design
records the trust boundary as settled/explicit_consent and the execution plan expects a
`core000.trust.consent-facts` check.

**Evidence needed to accept:** maintainer approval of the interface/diagnostic rows and the settled
trust-boundary values; review of the current consent facts at the pinned commit (`spec/lib/build.ts`,
`spec/build.ts`, `spec/cli-renderers.ts`, `tests/consent.test.ts`); and an explicit statement that
no sandbox or per-module isolation is modelled as existing.

**Decision recorded:** A accepted on 2026-11-03 for the full-model planning scope. The original S1
deferral is historical.

---

## 5. D15 — Provenance-verification policy for CORE-000 claims

**Question.** Must every `source_statement` have a checked verification record before it can
support a normative claim?

**Decision status:** **Accepted — A** on 2026-11-02. S1 requires a stored `verified` record for
each normative source statement; failed/stale/unavailable is an error.

| Option | What it means | Main consequence |
|---|---|---|
| **A (recommended)** | Require a stored `verified` record for every source statement used by a normative claim; `failed`/`stale`/`unavailable` is an error, and a missing verifier is an error. | Honest and testable; an unverified binding cannot support a normative claim. |
| B | Treat an unverified binding as a review diagnostic; draft renders, release blocks. | Softer and more permissive; a draft may contain unverified normative claims as review markers. |
| C | No requirement; the binding alone is enough. | Contradicts #37’s binding/verification distinction and presents a binding as verified evidence. Not acceptable. |
| `defer` | Do not implement the provenance policy in the first slice. | The first slice may omit source statements/provenance; normative claims cannot be marked verified. |

**Recommended default: A.** A binding says where evidence is claimed to come from; it does not
say the quote was checked. The profile verifier can supply a `verified` record, and the core already
validates status/method/outcome/digest. A makes the distinction enforceable. B is a defensible
softer policy but weakens the gate; if chosen, the design's `source.verification-*` checks and
release behaviour must change.

**Scope of `verified` (D15 vs D13).** The #37 `verified` status establishes only that the
provenance binding's quoted material was checked against the identified source bytes and that the
record is current for the recorded `sourceDigest`. It does **not** establish that the quote
substantively supports the normative claim, that the claim is true, or that the claim has been
independently verified. Only D13's separate `independent_verification` record (by a verifier
distinct from the author, with its own scope/result/independence basis) can support
`verification: independently_verified`; a provenance `verified` record is not that evidence.

**Consequences and trade-offs.**

- A requires the profile `verifyProvenance` hook to run for every source statement used by a
  normative claim; a missing, failed, stale or unavailable result blocks.
- The source-byte pin (`identity.sha256`) and paragraph locators are not implemented (V4); A still
  works with the coarse locators and `sourceDigest`, but the evidence’s provenance remains coarse.
- B reduces blocking in draft; C is rejected.

**Dependencies and reversibility.** D13 defines independent verification, not provenance; D1/P-2
define paths/evidence. A can be relaxed to B by a policy change, but the change must be recorded and
the affected claims/artifacts re-run. C is not compatible with the accepted design.

**Repository evidence/constraint.** #37/PR #55 splits `ProvenanceBinding` from
`ProvenanceVerification`; `spec/lib/provenance.ts` attaches a `not-checked` record at binding and
validates claims; the design has `core000.source.verification-missing`/`-failed`/`-unavailable`
checks. `sourceDigest` records the bytes checked, not a declared pin; V4 remains unimplemented.

**Evidence needed to accept:** maintainer approval of the `verified` requirement and of
failed/stale/unavailable as errors; review of the profile verifier design and of positive and
negative tests for each status; and an explicit acknowledgement that `sourceDigest` is not a
declared source pin and that V4 remains open.

**Answer needed:** accept A, choose B, reject C explicitly, or defer provenance policy from the
first slice.

---

## 6. P-1 — Negative-fixture strategy

**Question.** Should each negative case have a complete project copy, or should one base project be
copied and mutated per case?

**Decision status:** **Accepted — B** on 2026-11-02. S1 uses one base project plus one
deterministic named mutation in a fresh temporary copy per case.

| Option | What it means | Main consequence |
|---|---|---|
| A | One complete minimal project per accepted design case N1–N18 under `contracts/core000/fixtures/<case>/` (N4 a/b). | Literal to the design’s illustrative §7.8 wording; 19 copies of a 78-claim model and its schemas are expensive and drift-prone. |
| **B (recommended)** | One base project (`contracts/core000`) plus one deterministic, named mutation per case in a fresh temporary copy (`contracts/core000/mutations.ts`); no per-case complete-project copies. | Smaller and less duplicative; each run is isolated by a fresh temp copy and exactly one mutation. |
| `defer` | Defer negative fixtures until after the first slice. | The first slice can be positive-only; negative coverage waits. |

**Recommended default: B.** The execution plan recommends B, but it needs explicit confirmation
because it refines the design’s illustrative fixture layout. The run semantics are unchanged: one
project, one mutation, one expected diagnostic, no artifact. Isolation/reproducibility: each run
copies the base to a new temp directory, applies exactly one named deterministic mutation, rewrites
only temp paths/profile imports, records the base commit and mutation ID in evidence, and never
writes to the repository. The accepted design §7.8 is reconciled by this paragraph; if the
maintainer prefers the
literal A, the mutation table can materialize complete fixture directories, but B is recommended.

**Consequences and trade-offs.**

- B needs `mutations.ts` and tests for each mutation; a bug in a mutation can make a case
  misleading. Mitigation: each mutation is a small pure function, reviewed with its expected code,
  and the harness asserts exactly one outcome per case.
- A is easier to inspect as standalone projects but duplicates the model; every model change must
  be replicated 19 times.
- `defer` is possible only if the first slice is positive-only.

**Dependencies and reversibility.** D1 decides the base path; P-5 decides the harness. B can
materialize A later from the same mutation table; moving A→B is harder. The decision should be made
before negative fixtures are implemented.

**Repository evidence/constraint.** The accepted design §7.8 describes per-case complete projects;
the execution plan §3/§5/§9 recommends B and explains the reconciliation. No fixture exists at the
baseline. The earlier execution-plan wording that called B “selected” is not a maintainer answer
and should be read as a recommendation until this item is answered.

**Evidence needed to accept:** maintainer confirmation of B and of the §7.8 reconciliation; review
of the mutation table and its one-mutation-per-fresh-copy rule; and evidence from the first
negative runs that each mutation produces exactly the expected diagnostic and no artifact.

**Answer needed:** confirm B (with the §7.8 reconciliation), choose A, or defer negative fixtures.

---

## 7. P-2 — Durable evidence publication and summary format

**Question.** Where is run evidence durably published, and what human-readable summary format
accompanies it? P-2 does **not** re-open the transient JSON record shape: the accepted execution
plan §6.2 already defines the required base shape, and S1 must use and test it (plus its S1
additions) regardless of P-2.

**Decision status:** **Accepted — A (2026-11-03)** for durable producer evidence and its human-readable
summary. The original S1 deferral remains historical; S1 still wrote and asserted the transient
record. The accepted durable paths are `evidence/core000/<run>/result.json` and
`docs/architecture/core-000-execution-evidence.md`.

| Option | What it means | Main consequence |
|---|---|---|
| **A (recommended)** | Publish the run records durably under `evidence/core000/<run>/result.json` and add a human-readable `docs/architecture/core-000-execution-evidence.md` summary. | Machine-readable, diffable, reviewable without screenshots; evidence can be referenced per run. |
| B | Publish only a Markdown summary; keep the raw JSON records external or transient. | Readable but not machine-checkable in-repository; easier to omit fields or transpose values. |
| `defer` | Decide durable publication and the summary format after the first run. | S1 still writes and asserts the transient record; only durable publication and the human summary wait. |

**Recommended default: A.** The execution plan already defines a canonical transient JSON record
(commit, command, exit/blockedBy, identity digest, artifact SHA-256, diagnostics, expected codes,
classification, limitations). P-2 decides only whether and where that record is durably published
and what human-readable summary accompanies it.

**Consequences and trade-offs.** A adds a durable `evidence/` path and a summary document; P-6
decides whether they are committed. B is simpler but weaker. The record must not include absolute
paths, hostnames, environment values or secrets. **Deferring P-2 does not defer the temporary S1
evidence record or its schema assertion.**

**Dependencies/reversibility.** P-6 controls git; P-5 controls the harness; D13 defines independent
verification records, which are not P-2 run evidence. Durable location/summary format can be
revised before records are published; after publication, changes require re-recording.

**Repository evidence/constraint.** The accepted execution plan §6.2 defines the transient record;
`runBuild` returns the fields; the repository has no `evidence/` directory at the baseline. S1
writes the transient record to a temporary path and does not publish it.

**Evidence needed to accept:** maintainer approval of the durable location and summary format;
review of a sample record against the no-absolute-paths/no-secrets rule; and confirmation that the
published record is sufficient to reproduce under the pinned inputs without claiming authenticity.

**Decision recorded:** A accepted on 2026-11-03. The transient S1 evidence record and its schema
assertion remained required regardless of the durable-publication decision.

---

## 8. P-3 — Commit the generated CORE-000 draft

**Question.** Should `contracts/core000/output/CORE-000.draft.md` be committed after a successful
run?

**Decision status:** **Accepted — A (2026-11-03)** for the full-model planning scope. The original
S1 deferral remains historical. Commit `contracts/core000/output/CORE-000.draft.md` only after a
successful, reviewed run; the committed artifact is reviewable output, not a certification.

| Option | What it means | Main consequence |
|---|---|---|
| **A (recommended)** | Commit the generated draft after a reviewed successful run. | Concrete, reviewable artifact; follows the repository’s generated-artifact rule for CORE-001. |
| B | Keep the draft in temporary evidence only. | Avoids committing a generated file before the project is accepted, but reviewers cannot diff the actual output in the repository. |
| `defer` | Decide after the first run. | The first slice can produce a temp artifact; the commit policy waits. |

**Recommended default: A**, after the plan and first run are reviewed. AGENTS.md requires a
generated artifact to be regenerated and committed after changing its inputs; CORE-000 should
follow the same rule once the project is real. The commit must be the exact normalized artifact,
not a hand edit.

**Consequences/trade-offs.** A adds a generated file to review and CI; B keeps the repo cleaner but
weakens reviewability. `defer` is acceptable for the first slice if the artifact stays in evidence.

**Dependencies/reversibility.** P-2 evidence; D1 path. Adding/removing the generated file later is
low risk, but changing it changes the evidence’s artifact hash.

**Repository evidence/constraint.** AGENTS.md “artifact rule”; CORE-001 `spec/output/CORE-001.draft.md`
is generated and checked by `bun run check`. There is no CORE-000 output at the baseline. S1 does
not commit a CORE-000 draft; if A is chosen, the commit policy applies to a later slice.

**Evidence needed to accept:** maintainer approval of the artifact rule for CORE-000; a successful
reviewed draft in a later slice; and a CI check that rebuilds and compares the artifact. If P-3 is
deferred, the evidence is explicitly absent, and no draft is committed.

**Decision recorded:** A accepted on 2026-11-03 for the full-model planning scope.

---

## 9. P-4 — Renderer dependency

**Question.** Which renderer implementation/dependency should the CORE-000 profile use?

**Decision status:** **Accepted — A** on 2026-11-02. S1 uses `nunjucks` 3.2.4 as a declared,
lockfile-pinned dependency.

| Option | What it means | Main consequence |
|---|---|---|
| **A (recommended)** | Use `nunjucks` 3.2.4 for the profile template, declared in `dependencies` and present in `bun.lock`. | Reuses the existing CORE-001 renderer/template pattern; the profile closure pins the exact version. |
| B | Implement the renderer without a template dependency. | Fewer dependencies, but custom rendering code and a different profile/renderer pattern; more review surface. |
| `defer` | Decide in the renderer slice. | The first slice could be schema/profile-only and defer rendering; the artifact cannot be produced without a renderer. |

**Recommended default: A.** `nunjucks@3.2.4` is already a repository dependency and is used by the
CORE-001 renderer; the profile closure and `inputDigest` already account for the exact version. B is
viable but adds code and a second rendering style for no current requirement.

**Consequences/trade-offs.** A adds the exact version to the profile `dependencies`; the profile
`files` and `dependencies` declarations must stay identical to the lockfile or the build fails with
`core.extension.unpinned-dependency`. B removes that closure but increases the renderer’s own code
and tests. The dependency is not a security boundary.

**Dependencies/reversibility.** D1 path; P-5 harness. Before implementation either choice is
reversible; after artifacts/evidence exist, switching renderers changes the artifact hash.

**Repository evidence/constraint.** `package.json` depends on `nunjucks@^3.2.4`; `bun.lock` pins
3.2.4; `profiles/core001/renderer.ts` uses it; `profiles/example` has an empty dependency map. The
profile closure requires exact declared versions.

**Evidence needed to accept:** maintainer approval; a lockfile check that `nunjucks` resolves to
3.2.4; a profile-closure test that rejects an undeclared or differently pinned dependency; and a
review of the renderer/template surface. S1 uses A and records the exact version.

**Answer needed:** accept A, choose B, or defer rendering.

---

## 10. P-5 — Harness shape

**Question.** How should the consumer harness be shaped?

**Decision status:** **Accepted — A** on 2026-11-02. S1 uses `contracts/core000/run.ts` plus
`tests/core000.test.ts` as the consumer harness.

| Option | What it means | Main consequence |
|---|---|---|
| **A (recommended)** | `contracts/core000/run.ts` for run/evidence capture plus `tests/core000.test.ts` for CI assertions; both call `runBuild` with consent and the CORE-000 renderer. | Evidence capture and automated tests share the same consumer path; no core change. |
| B | Test-only harness. | Simpler, but evidence capture is coupled to test output and less repeatable. |
| `defer` | Defer the harness to the run slice. | The first slice can be profile/schema-only; no run evidence yet. |

**Recommended default: A.** The execution plan requires per-run evidence and CI assertions. A
consumer script plus a thin test wrapper keeps evidence reproducible and lets CI assert the same
path. Both are consumers; neither is a generic-core implementation.

**Consequences/trade-offs.** A adds a project-level script (not in the profile closure and not in
`inputDigest`) and a test file; B is smaller but weaker. N14 must not use the positive harness
because its static renderer import is not consent-boundary evidence; it uses the CLI without
consent and `view`/`validator` evaluation markers (see §12). The consumer-supplied renderer import
is a separate consumer trust boundary; `allowExecutableProfile` does not gate it.

**Dependencies/reversibility.** D1/P-1/P-2/D13; G4. The harness can be added before or after the
profile; once evidence is published, changing its command/record shape requires re-recording.

**Repository evidence/constraint.** `tests/example-profile.test.ts` and `tests/consent.test.ts` use
`runBuild` with a consumer renderer registry; the package is private with no public API; the CLI
only wires CORE-001 (G4). The PAP verifier under `pap/` is not a generic CORE-000 harness, and it
does not close G4.

**Evidence needed to accept:** maintainer approval of the harness shape and its command surface;
review of the harness's use of the public `runBuild` path with a caller-supplied renderer and
consent; and a demonstration that the harness never bypasses the pipeline or writes to the
repository. S1 uses A and keeps the harness in the same PR as its test.

**Answer needed:** accept A, choose B, or defer the harness.

---

## 11. P-6 — Evidence and independent-verification records in git

**Question.** Should run evidence and future independent-verification records be committed to the
repository? S2 creates **zero** independent-verification records, and no engine-generated record
counts as independent.

**Decision status:** **Accepted — A (2026-11-03), run evidence only.** The original S1 deferral
remains historical. Commit producer run evidence under `evidence/core000/`. Independent records
remain separate; S2 creates zero independent-verification records and zero files under
`verification/core000/`. Future records there require a distinct verifier and a separate
maintainer decision.

| Option | What it means | Main consequence |
|---|---|---|
| **A (accepted)** | Commit producer run evidence under `evidence/core000/`. Future independent records produced by a distinct verifier may be committed under `verification/core000/` only after a separate maintainer decision; S2 creates zero such records. Generated artifacts stay separate per P-3. | Reviewable, diffable, linked to commits; no private material may be committed; no engine-generated record counts as independent. |
| B | Keep evidence/verification records external only. | Avoids repository noise, but review depends on external links and may be less durable. |
| `defer` | Decide after the first run. | The first slice can run without committing evidence; publication waits. |

**Accepted decision: A for producer run evidence; zero independent records in S2.** The issue asks for
reviewable evidence and the plan's format is designed to be diffable without secrets. Independent
records must be authored by a distinct verifier and must never be engine-generated; committing a
future external record makes the independence claim inspectable, but S2 creates none and does not
imply one. B is acceptable only if durable external storage exists.

**Consequences/trade-offs.** A adds data files and a maintenance surface; B avoids them but weakens
review. Neither option makes the engine the authority for `independently_verified`; a maintainer
must still accept the record.

**Dependencies/reversibility.** P-2/D13; repository policy. Adding records is easy; removing
published records requires preserving the old evidence for audit.

**Repository evidence/constraint.** The design §8 defines an external verification record; the
execution plan §6 defines `evidence/core000/` and `verification/core000/`; no such paths exist at
the baseline. AGENTS.md prohibits secrets in files. The PAP verifier's records are its own package
output and are not CORE-000 evidence.

**Evidence needed to accept:** maintainer approval of the retention/publication policy; a review
that the evidence contains no secrets, private material or absolute host paths; and an explicit
statement that S2 creates zero independent records and no engine-generated record counts as
independent. A future external record would additionally need a verifier distinct from the author
and an external record locator.

**Decision recorded:** A accepted on 2026-11-03 for producer run evidence only. S2 creates zero
independent-verification records; any future independent record requires a distinct verifier and
a separate maintainer decision.

---

## 12. Consumer harness while G4 remains open

**What it exercises.**

- `runBuild(BuildOptions)` from `spec/lib/build.ts` with `allowExecutableProfile: true` and a
  caller-supplied `renderers` registry containing `core000-markdown`.
- The full generic pipeline: manifest/profile load, consent gate, profile closure, output
  containment, schemas, document/entity validation, identity, reciprocal relations, provenance
  binding, `verifyProvenance`, CORE-000 policy checks, renderer resolution, build identity,
  one-artifact render and blocking/check/write.
- Consumer-supplied renderer and (for the experiment) the profile’s `validate`/`verifyProvenance`
  exports. This is the documented consumer role, not a core change.

**What it bypasses.**

- The generic CLI’s profile selection, flag wiring and renderer selection. `spec/cli-renderers.ts`
  only wires the CORE-001 renderer (`profile core001`, renderer `core001-markdown`); a CORE-000
  project through the CLI would fail with `core.registry.missing` (G4).
- The public `loadProject`/`validateProject`/`buildProject`/`renderModel`/`checkArtifacts` API and
  package exports, which do not exist yet (K2/M2). The harness imports the engine’s internal
  `runBuild` module directly.
- Any claim about the shipped CLI or a published package working for CORE-000.

**What conclusions it cannot support.**

- That the generic core or CLI is implemented for arbitrary profiles or that G4 is closed.
- That the experiment is independent verification, certification, production readiness, secure,
  cross-platform deterministic, or conformant with the public API.
- That a self-build proves the engine correct or that its self-description is complete.
- Any claim about consumer adapters/renderers beyond the caller-supplied test renderer.

The harness is a **test consumer**, not a generic-core implementation and not independent
verification. Its results are scoped to `runBuild` plus the supplied renderer/profile; they do not
close G4. The positive harness’s static renderer import is also not consent-boundary evidence; N14
uses the CLI without consent and `view`/`validator` evaluation markers (execution plan §4.1). The
renderer is consumer-supplied and is not gated by `allowExecutableProfile`; a renderer marker would
not demonstrate the consent boundary.

**Refresh (Issue #72).** The PAP v0.1 verifier under `pap/` is a separate product boundary; it
does not import `spec/` or `profiles/`, does not select a CORE-000 profile, does not supply the
CORE-000 renderer and does not produce a CORE-000 artifact. It is not the consumer harness and
does not close G4. `package.json` remains private with no `exports`; `runBuild` remains the only
engine entry point. S1 uses the consumer harness in `core-000-self-build-poc.md` §10.4.

**Harness boundary confirmation (2026-11-02).** The maintainer confirmed the bounded consumer
harness for S1 only. G4 remains **open**, the generic CLI/API gap remains **open**, and harness use
is **not** independent verification. This does not authorize arbitrary/untrusted profiles or any
claim that the generic CLI/API is complete.

**Evidence/constraint.** `spec/lib/build.ts` `runBuild` and `BuildOptions.renderers`;
`spec/cli-renderers.ts` CORE-001 constants; `spec/build.ts` CLI; `package.json` private; execution
plan §7/§8 and G4; `pap/README.md` (separate boundary).

---

## 13. First implementation slice

The first-slice proposal is in
[`core-000-self-build-poc.md`](core-000-self-build-poc.md) §10. The maintainer approved the bounded
S1 package on 2026-11-02: **D1 A, D13 A, D15 A, P-1 B, P-4 A, P-5 A are accepted**;
**D14, P-2, P-3 and P-6 were deferred for S1 in the 2026-11-02 decision and accepted for the
full-model planning scope on 2026-11-03.** The consumer harness is confirmed for S1. P-2's original
S1 deferral did not defer the transient S1 evidence record or its schema assertion.

**Historical S1 authorization gate (satisfied):** S1 implementation was authorized after the
canonical S1 decision record merged and a dedicated implementation task referenced it. S1 remains
bounded to the scope below; any expansion or material deviation required a new maintainer decision.

S1 is a bounded vertical slice with:

- exact files and paths (no generic-core change);
- exact behaviour and expected outputs/diagnostics;
- focused tests and negative cases (N2, N3, N8, N11, N14);
- exclusions (what the slice deliberately does not implement);
- stop conditions if a generic-core gap is hit;
- a review request and an explicit authorization gate before implementation.

The earlier record deferred the first-slice proposal until the S1 decisions were answered.
The 2026-11-02 decision answered the six accepted S1 items, deferred the other four for S1 and
confirmed the harness boundary; those four were subsequently accepted for full-model planning on
2026-11-03. S1 was implemented and merged separately; this decision record is not a pending S1
implementation task or authorization.

---

## 14. Evidence, constraints and limitations of this record

- Planning baseline `c6ee644` (PR #73), refreshed from the original `b8e67a8`; accepted design PR
  #51; execution plan PR #59. The decision was recorded after PR #74 merged as `1c405c2`; this
  follow-up is documentation-only. The refresh run: `bun test` 292 pass / 0 fail (21 files; 169
  engine + 123 PAP), typecheck clean, `bun run check` clean, CORE-001 artifact unchanged. See
  [`core-000-baseline-refresh.md`](core-000-baseline-refresh.md). These are repository facts, not
  independent verification of CORE-000.
- The PAP verifier is implemented as a separate product boundary; it does not change these
  decisions and is not independent verification of CORE-000.
- This record is documentation-only; it creates no CORE-000 project/profile, code, tests, schemas,
  fixtures, evidence or generated artifact, and changes no generic-core behaviour.
- The six original S1 decisions remain accepted. D14, P-2, P-3 and P-6 were historically deferred
  for S1 and subsequently accepted for the full-model planning scope; S2-D1–S2-D4 were also
  accepted on 2026-11-03. The record does not authorize implementation.
- The consumer harness is a test consumer; G4 remains open and is recorded as a separate proposal.
  Harness use is not independent verification.
- No independent verification, certification, security, cross-platform determinism or production
  readiness is claimed; a temporary workspace is not a security sandbox.
- **Historical S1 authorization:** the S1 implementation gate was satisfied before S1 was
  implemented and merged; that historical authorization does not carry forward to S2.
- No S2 implementation is included or authorized. D14, P-2, P-3, P-6 and S2-D1–S2-D4 are accepted
  for planning scope only; S2.1, S2.2 and S2.3 each require separate explicit authorization.
- **S2 follow-up:** the accepted planning decisions are reflected in
  [`core-000-s2-package.md`](core-000-s2-package.md). The package remains a planning document;
  none of the decisions authorizes S2.1, S2.2 or S2.3 implementation.

**Requested maintainer action:** review and merge this documentation-only update to record the
2026-11-03 decisions. No implementation authorization is requested or implied. S2.1, S2.2 and
S2.3 each remain separately gated by explicit maintainer authorization.
