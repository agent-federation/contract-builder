# CORE-000 S2 — bounded structure and full-model package

**Status:** planning package accepted by maintainer decision on 2026-11-03. Planning only; this
document does not authorize or implement S2, execute a profile, or create or change code, schemas,
project data, tests, evidence, fixtures or generated artifacts.
**Revision 1.2 (maintainer decisions recorded, 2026-11-03):** records the accepted D14/P-2/P-3/P-6
and S2-D1–S2-D4 planning decisions; applies the 24-code decision and clarifies historical S1 gates.
The underlying S1 snapshots remain unchanged.
**Source of authority:** [Issue #72 maintainer comment 6586047089](https://github.com/agent-federation/contract-builder/issues/72#issuecomment-6586047089)
(zaebee, 2026-11-02) authorized preparation of a bounded S2 package only. The subsequent
2026-11-03 decisions accepting D14/P-2/P-3/P-6 and S2-D1–S2-D4 are recorded in the canonical
[`core-000-decision-record.md`](core-000-decision-record.md); the maintainer approval was given in
the project-owner conversation and is not a separately linked public GitHub comment. Implementation
still requires separate explicit approval for each S2 stage.
**S1 status:** [PR #77](https://github.com/agent-federation/contract-builder/pull/77) merged as
`07cbf5bd6cbed740e55351612d0300196b8d1464`; its status-matrix follow-up
[PR #79](https://github.com/agent-federation/contract-builder/pull/79) merged as
`a6dddefad589c8ba9f0fbd859b060c5fcb729b61`. S1 is the five-claim bounded slice, not the full model.
The current-main baseline for this package is `a6dddef`; PR #79 is docs-only and changes no engine
or profile behaviour.
**Canonical decision record:** [`core-000-decision-record.md`](core-000-decision-record.md);
D14, P-2, P-3, P-6 and S2-D1–S2-D4 were accepted on 2026-11-03 for planning scope only.

> **What this is.** A bounded decision and task package for the next milestone: turning the S1
> five-claim slice into the accepted 14-kind / 28-relation / full-78-claim CORE-000 model, with
> exact files, commands, tests, expected outputs, exclusions, stop conditions and acceptance
> criteria.
>
> **What this is not.** It is not an implementation, an authorization to begin coding, an H2
> reproducibility result, an independent verification, or a claim that the full register is true.
> The accepted planning decisions do not authorize S2.1, S2.2 or S2.3 implementation.

---

## 0. Maintainer summary

| Part | Content |
|---|---|
| **Facts** | S1 is merged at `07cbf5b`: H1 `SELF_BUILD_COMPLETED` for the five-claim slice; S1-POS-02 passed for two processes, each creating its own fresh workspace (same-environment, fresh-workspace repeatability; not H2); H2 `NOT_TESTED`; H3 `NOT_PERFORMED`; no CORE-000 claim is independently verified; a temporary workspace is not a security sandbox. The S1 model has 8 kinds, 11 relations, 13 catalog codes, 5 claims, 3 source statements, 8 evidence rows, 3 decisions and 0 independent verifications. The full accepted design has 14 kinds, 28 relations, 78 claims and a table of 24 policy-check codes (the design prose says 23). |
| **Accepted planning decisions** | Stage S2 as **S2.1 model surface**, **S2.2 full claim register**, and **S2.3 focused check coverage/evidence**. The full N1–N18 matrix remains in S3 (S2-D4 A). D14/P-2/P-3 are A; P-6 is A for producer run evidence only, with zero independent records in S2. S2-D1 selects all **24 enumerated codes**; S2-D2 selects all **78 accepted claims** with original statuses; S2-D3 selects the `conformance_case` kind/schema with an empty data list. |
| **Decision status** | D14, P-2, P-3, P-6 and S2-D1–S2-D4 are accepted for planning scope by the 2026-11-03 maintainer decision. No S2 implementation is authorized. H2 and H3 are not in S2 scope. |
| **Remaining maintainer actions** | The planning package and eight decisions are accepted. Before S2.1, issue a separate explicit authorization after review of its exact scope. S2.2 and S2.3 each require their own separate explicit authorization; approval of S2.1 does not authorize them. Creating/linking an implementation task is not authorization. H2, H3, security isolation and semantic truth remain out of scope. |

---

## 1. S1 baseline and what S2 adds

### 1.1 S1 result and limits

S1 is a bounded self-build of five accepted claims through the existing generic pipeline. It is
not the full model and does not establish reproducibility or independence.

| S1 fact | Value |
|---|---|
| Merge commit | `07cbf5bd6cbed740e55351612d0300196b8d1464` (PR #77) |
| H1 | `SELF_BUILD_COMPLETED` for the five-claim slice |
| Same-environment, fresh-workspace repeat | S1-POS-02 passed for two processes, each creating its own fresh workspace; this is **not H2** |
| H2 | `NOT_TESTED` |
| H3 | `NOT_PERFORMED`; no CORE-000 claim is independently verified |
| Security boundary | Temporary workspace only; it is **not** a sandbox |
| Model | 8 kinds, 11 relation declarations, 13 catalog codes |
| Data | 5 claims, 3 source statements, 8 evidence rows, 3 decisions, 0 independent verifications |
| Tests | `tests/core000.test.ts` 16 pass; full `bun test` 308 pass / 22 files at this baseline |
| Artifact/evidence | S1 deferred P-2, P-3 and P-6; no durable evidence or generated draft is committed |

### 1.2 Gaps to the accepted full model

The counts below come from the accepted design and the S1 profile, not from a new plan:

| Area | S1 | Accepted full model | S2 adds |
|---|---:|---:|---|
| Entity kinds | 8 | 14 | `phase`, `transition`, `dependency`, `extension_point`, `diagnostic`, `conformance_case` |
| Relation declarations | 11 | 28 | 17 declarations: `requires`/`requiredBy`, `startsAt`, `endsAt`, `dependsOn`/`dependedOnBy`, `covers`/`coveredBy`, `concerns`/`guardedBy`, `exposes`/`exposedBy`, `loadedBy`/`loads`, `supersedes`/`supersededBy`, `raisedIn` |
| Policy-check codes | 13 | 24 enumerated (design prose says 23) | 11: invalid-status, unsupported-guarantee, status-class-conflict, independent-verification.incomplete/self/record-missing, model.interface-owner-mismatch, evidence.locator/orphan, surface.claim-missing, conformance.case-uncovered |
| Claims | 5 | 78 | 73 additional accepted claims; no new claims |
| Structure data | 1 component, 3 interfaces, 1 trust boundary | Full public components, interfaces, phases, transitions, extension points, trust boundaries, diagnostics and dependencies | Full structure document |
| Renderer/template | Components, interfaces, trust boundary, claims, sources, evidence, decisions | Adds phases, transitions, extension points, diagnostics, dependencies, conformance cases and their counts | New sections and view fields |
| Tests/negatives | S1-POS-01–05, N2/N3/N8/N11/N14 | Design N1–N18 plus full positive/reproducibility checks | Positive/release checks and focused tests for the 11 new checks; the full N1–N18 matrix remains S3 (S2-D4) |

**Count discrepancy — S2-D1.** The accepted design's prose says `23 profile policy checks`, but its check table enumerates
**24** codes. S1 implements 13 and the missing set is 11. **S2-D1 A resolves this discrepancy**:
the 24 enumerated codes are normative and the prose count is erroneous. The repository-wide
inventory below remains useful to guide the forward-looking documentation corrections; historical
S1 snapshots are retained rather than mechanically rewritten.

#### 1.2.1 Complete count-correction scope

A repository-wide search at `9966488` for `23 policy`, `23-policy`, `23 profile`, `23-check`,
`9 of 23`, `23 CORE-000`, `policy check families` and `24-code` found the references below. The
search scope included numbered sections, **preamble/header text**, tables and bullet lists.
Unrelated uses of `23` (PR numbers, relation #23, table numbers) were excluded. The inventory
classifies each occurrence rather than mechanically replacing every number. Under accepted S2-D1 A,
forward-looking references are to be reconciled to 24; historical S1 snapshots remain unchanged.

| File | Exact reference | Classification | Current | Action under S2-D1 |
|---|---|---|---|---|
| `docs/architecture/core-000-self-contract.md` | §5.7 prose above the check table | design baseline / source of discrepancy | 23 | Correct the prose count to 24; the enumerated table remains normative. |
| `docs/architecture/core-000-execution-plan.md` | preamble immediately before §0 — “Accepted design: … 23 profile policy checks” | forward-looking accepted-design baseline | 23 | Reconcile the accepted-design baseline to 24. |
| `docs/architecture/core-000-execution-plan.md` | §1 design-register paragraph | forward-looking plan baseline | 23 | Correct the forward-looking count to 24. |
| `docs/architecture/core-000-execution-plan.md` | §1 baseline table row “Model” | forward-looking plan baseline | 23 | Correct the forward-looking count to 24. |
| `docs/architecture/core-000-execution-plan.md` | §2.2 catalog row “23 CORE-000 diagnostic codes” | forward-looking proposed profile | 23 | Correct the forward-looking count to 24. |
| `docs/architecture/core-000-execution-plan.md` | §3.4 “23 CORE-000 diagnostic entries” | forward-looking structure data | 23 | Correct the forward-looking count to 24. |
| `docs/architecture/core-000-self-build-poc.md` | §2.1 “full 78-claim / 14-kind / 28-relation / 23-check register” | forward-looking full-model description | 23 | Correct the forward-looking full-model count to 24. |
| `docs/architecture/core-000-self-build-poc.md` | §10.6 “Policy check families (9 of 23)” | historical S1 scope/planning snapshot | 23 | Retain as an S1 snapshot; if touched, add a note that the design table enumerates 24 and S2-D1 governs the full count. Not a blanket correction |
| `docs/architecture/core-000-self-build-poc.md` | §10.7 “23 policy checks” in explicit exclusions | historical S1 scope snapshot | 23 | Retain as an S1 exclusion; if touched, label it as the S1 planning count, not the current full model |
| `docs/architecture/core-000-self-build-poc.md` | §10.10 “nine policy-check families … 23-check model” | historical S1 scope/acceptance snapshot | 23 | Retain as S1 evidence; if touched, label historical and do not imply the full model is 23 |
| `docs/architecture/core-000-self-build-poc.md` | §11.1 “24 enumerated … 23; S2-D1 resolves” | forward-looking, formerly conditional | 24/23 recorded | State that the accepted full-model count is 24; retain the historical explanation of the original discrepancy. |
| `docs/architecture/implementation-status.md` | §4.1 “What S1 does not establish” (`23-policy-check`) | historical S1 status snapshot | 23 | Labeled as the S1 as-of-milestone count in this revision, with the 23/24 discrepancy noted; no count-only correction; reconcile only in a separate status-matrix update |
| `docs/architecture/core-000-s2-package.md` | §1.2, §4.3 and §8 criterion 4 | S2 package, updated under accepted S2-D1 A | 24 | Use 24 consistently; the 23 prose count is identified as the error. |
| `docs/architecture/core-000-s2-package.md` | §4.6 diagnostics traceability (“all 24”) | forward-looking S2 mapping | 24 | Keep all 24 codes; this is the accepted S2-D1 A set. |

No other relevant reference was found at this commit. A later documentation change that adds a
count reference must extend this inventory rather than patch one file in isolation. S2-D1 A is now
accepted, so forward-looking references use 24. Historical S1 snapshots are not forward-looking
requirements and must not be mechanically rewritten.

---

## 2. S2 goal and boundary

### 2.1 Goal

Extend the S1 slice to the accepted full model without changing generic-core behaviour:

- 14 entity kinds and 28 relation declarations in `profiles/core000/profile.json`;
- the full public structure in `contracts/core000/structure.yml`;
- all 78 accepted claims in `contracts/core000/claims.yml`, with source statements, evidence rows,
  decision entities and an empty independent-verification list;
- the enumerated policy checks, the view/template sections and focused check coverage;
- artifact/evidence handling according to P-2/P-3/P-6.

### 2.2 Explicit non-goals

- No `spec/lib/` change, no generic-core feature, no CLI/API implementation and no G4 closure.
- No H2 fresh-environment reproducibility run; H2 stays `NOT_TESTED` unless separately authorized.
- No H3 independent verification, certification, semantic truth or security review.
- No arbitrary/untrusted profile execution; a temporary workspace is not a sandbox.
- No CORE-001, PAP, publication, packaging or standard-versioning change.
- No new normative claim; no decision beyond those explicitly accepted in the canonical decision record.
- No full conformance execution; `conformance_case` is modelled, not executed.
- No full N1–N18 matrix in S2; the existing S3 boundary owns it unless S2-D4 says otherwise.

### 2.3 Result labels for S2

S2 positive runs extend **H1 only**. They do not become H2 or H3.

| Run class | Label | Meaning |
|---|---|---|
| `S2-POS-01` | `SELF_BUILD_COMPLETED` | Full-model draft built, with the expected review codes |
| `S2-POS-02` | same-environment, fresh-workspace repeat | Same `inputDigest`, artifact hash and diagnostic order in two processes, each with its own fresh workspace; **not H2** |
| `S2-POS-03` | release blocked | Exit 1, `blockedBy: "review"`, no release artifact |
| S2 focused negatives | expected failure observed | Exact expected code, exit 1, no artifact; subset of N1–N18, full matrix remains S3 |
| H2 | `NOT_TESTED` | No fresh-environment comparison |
| H3 | `NOT_PERFORMED` | No independent verifier or record |

No single `PASS` label is used.

---

## 3. Decisions accepted for S2 planning

The four items deferred for S1 and the four S2 scope decisions were accepted by the maintainer on
2026-11-03. The options and evidence requirements below are retained as the decision rationale;
the canonical acceptance and implementation boundary are recorded in
[`core-000-decision-record.md`](core-000-decision-record.md).

| ID | Exact question | Viable options | Accepted decision | Evidence basis |
|---|---|---|---|---|
| D14 | How is the consent surface represented in the full model? | A: add interface entities for `allowExecutableProfile` and the CLI flag, a diagnostic entity for `core.profile.consent-required`, and keep `TB-PROFILE-EXEC` settled/`explicit_consent`; B: trust-boundary prose only; C: separate profile class; `defer` | **Accepted — A — consent API/CLI/diagnostic surface; settled `explicit_consent` trust boundary.** | Review of the proposed interface/diagnostic rows; a check that no new consent policy is invented; confirmation that no sandbox/isolation is claimed |
| P-2 | Where is evidence durably published and what summary format accompanies it? | A: durable `evidence/core000/<run>/result.json` plus a human summary; B: Markdown summary only; `defer` | **Accepted — A — durable producer JSON evidence plus human-readable summary.** | Sample durable record/summary; no absolute paths or secrets; reviewable by run |
| P-3 | Is the generated full-model draft committed? | A: commit `contracts/core000/output/CORE-000.draft.md` after a reviewed run; B: keep it in temporary evidence; `defer` | **Accepted — A — commit the generated draft after a successful, reviewed run.** | Successful full-model run; `bun run check`; exact normalized artifact |
| P-6 | Are run evidence and future independent records committed? | A: commit run evidence under `evidence/core000/`; S2 creates **zero** independent-verification records, so none are committed under `verification/core000/`. Future externally produced independent records go there only when a distinct verifier produces them and a later maintainer decision accepts them; no engine-generated record counts as independent. B: external only; `defer` | **Accepted — A — commit producer run evidence only; zero independent records in S2; future independent records require a distinct verifier and separate decision.** | No-secrets review; evidence paths; a statement that no engine-generated record is presented as independent |
| S2-D1 | Is the full check set 23 or 24? | A: the 24 enumerated codes are authoritative, implement all 24 and correct the prose count; B: implement 23 and name the excluded code; C: defer the decision | **Accepted — A — 24 enumerated policy-check codes are normative; prose count 23 is erroneous.** | The design check table (24 rows), the S1 catalog (13), the missing list (11), and a docs correction |
| S2-D2 | Which claim register is encoded? | A: all 78 accepted claims from design §4.2, no new claims; B: a subset; C: regenerate the register | **Accepted — A — encode all 78 accepted claims, preserving IDs and statuses; no promotion without evidence and separate authorization.** | A scripted register audit: 78 IDs, no invented IDs, no status upgrades without evidence |
| S2-D3 | Is `conformance_case` modelled with data in S2? | A: include the kind/schema and keep `conformanceCases: []`; N1–N18 stay in the S3 harness matrix; B: populate planned project cases; C: defer the kind | **Accepted — A — include kind/schema; keep `conformanceCases: []`; synthetic fixture is test input only.** | Schema review; empty list; S3 matrix mapping; no conformance execution claim |
| S2-D4 | Does the full N1–N18 matrix belong in S2 or S3? | A: keep full N1–N18 in S3; S2 adds focused tests for the new checks; B: include the full matrix in S2.3; C: split differently | **Accepted — A — full N1–N18 matrix stays in S3; S2.3 focused tests cover the 11 new checks.** | S3 description in the S1 package; S2 size; per-check focused coverage plan |

**Decision-record interaction.** The 2026-11-03 maintainer decision accepts D14, P-2, P-3, P-6
and S2-D1–S2-D4 for planning scope. The historical S1 deferrals remain visible as historical
decisions, not current open items. The evidence-separation invariant is mandatory: producer records
are not independent verification; S2 creates zero independent-verification records.

---

## 4. Proposed S2 model and data scope

### 4.1 Kinds (14)

S1 already has `component`, `interface`, `source_statement`, `claim`, `evidence`,
`independent_verification`, `decision`, `trust_boundary`. S2 adds:

| Kind | Required fields (from design §5.3) | Role |
|---|---|---|
| `phase` | `id`, `name`, `guarantee`, `not_guaranteed` | A lifecycle phase with a guarantee and non-guarantee |
| `transition` | `id`, `condition`, `description` | A permitted transition; `startsAt`/`endsAt` carry the phases |
| `dependency` | `id`, `name`, `kind`, `status` | Runtime/toolchain/pipeline/decision/product dependency |
| `extension_point` | `id`, `name`, `mechanism`, `trust`, `status` | A trusted extension entry point and its loading mechanism |
| `diagnostic` | `id`, `code`, `severity`, `phase`, `message`, `status` | A catalog entry for a public diagnostic |
| `conformance_case` | `id`, `kind`, `input`, `expected`, `status` | A planned case; S2 data list is empty unless S2-D3 chooses B |

### 4.2 Relations (28)

S2 keeps the S1 declarations and adds the 17 listed in §1.2. The two `one` cardinalities
(`startsAt`, `endsAt`) and the `loadedBy` `one` cardinality follow the design; the reciprocal halves
are declared explicitly to pass the reciprocal-declaration contract. `subject` remains the only
S2 wildcard.

### 4.3 Policy checks (24; S2-D1 A accepted)

The 11 additions map to check families as follows:

| Code | Family |
|---|---|
| `core000.claim.invalid-status` | claim status/schema policy |
| `core000.claim.unsupported-guarantee` | claim class policy |
| `core000.claim.status-class-conflict` | claim class/status policy |
| `core000.independent-verification.incomplete` | independent-verification record |
| `core000.independent-verification.self` | independent-verification record |
| `core000.independent-verification.record-missing` | independent-verification record |
| `core000.model.interface-owner-mismatch` | model structure |
| `core000.evidence.locator` | evidence policy |
| `core000.evidence.orphan` | evidence policy |
| `core000.surface.claim-missing` | surface coverage |
| `core000.conformance.case-uncovered` | conformance representation |

The hooks remain profile-owned, perform no I/O and read no clock. A check that needs I/O or a core
capability is a stop condition.

### 4.4 Proposed structure vocabulary

The IDs below are a proposed encoding vocabulary for review, not accepted content. They describe
the design's public structure and the S1 evidence; no private module name becomes a claim.

- **Components:** `COMP-CORE`, `COMP-PROFILE`, `COMP-PROJECT`, `COMP-ADAPTER`, `COMP-RENDERER`,
  `COMP-CLI`, `COMP-REVIEWER`.
- **Interfaces:** `IF-MANIFEST`, `IF-PROJECT-MODEL`, `IF-BUILD-IDENTITY`, `IF-DIAGNOSTIC`,
  `IF-BUILD-RESULT`, `IF-ADAPTER`, `IF-RENDERER`, `IF-PROFILE-VALIDATOR`, `IF-CONFORMANCE`,
  `IF-CLI`.
- **Phases:** `PH-LOAD`, `PH-STRUCTURE`, `PH-REFERENCE`, `PH-PROVENANCE`, `PH-VERIFICATION`,
  `PH-CONSISTENCY`, `PH-REVIEW`, `PH-ARTIFACT`.
- **Transitions:** `TR-LOAD-STRUCTURE`, `TR-STRUCTURE-REFERENCE`, `TR-REFERENCE-PROVENANCE`,
  `TR-PROVENANCE-VERIFICATION`, `TR-VERIFICATION-CONSISTENCY`, `TR-CONSISTENCY-REVIEW`,
  `TR-REVIEW-ARTIFACT`.
- **Extension points:** `EXT-PROFILE-VIEW`, `EXT-PROFILE-VALIDATOR`, `EXT-RENDERER`, `EXT-ADAPTER`.
- **Trust boundaries:** `TB-PROFILE-EXEC` (settled/explicit_consent) and
  `TB-CONSUMER-EXTENSION` (consumer-supplied renderer/adapter trust, no engine isolation).
- **Diagnostics:** all 24 catalog codes, each with code, severity, phase and status.
- **Dependencies:** runtime/toolchain/package/product rows represented from `package.json`,
  `bun.lock` and the accepted contract; no new dependency is introduced.
- **Conformance cases:** empty by default (S2-D3 A); the N1–N18 run matrix is S3 harness work.

Every structure entity must cite its accepted source (design section, contract section, code/test
path or repository record). An entity that cannot be sourced is a stop condition, not a new
normative statement.

### 4.5 Claim register

S2.2 encodes all 78 claims from the accepted design §4.2 with the same IDs and classes. Rules:

- no new claim ID, no deleted claim ID and no invented decision;
- status changes require code/test evidence, a recorded evidence revision and the separately
authorized decision required by C4; S2 does not promote a claim merely because the model now exists;
- a claim awaiting an unresolved decision keeps `decision`/`decidedBy` unresolved and produces the
  `core000.decision.unresolved` review, not an invented accepted decision;
- no claim is marked `independently_verified`; `independentVerifications` stays empty;
- source statements are verbatim quotes at current markdown locators; a quote that cannot be
  located at the current grammar is a stop condition (V4 remains unimplemented);
- each evidence row names a real code/test/CI/source/review/analysis/build locator at the actual
  implementation commit; evidence files remain outside `inputDigest` (G1), so external review must
  re-check them.

**Claim-status semantics (C4).** S2.2 may:

- copy the accepted source status dimensions exactly (`decision`, `implementation`, `tests`,
  `verification`);
- add or refine evidence locators for the same status when the accepted source supports them;
- leave a missing, partial or unresolved status as it is and surface the existing review diagnostic.

S2.2 may **not**:

- promote a claim because the model is now complete, structurally valid or successfully built;
- convert missing, partial or unresolved evidence into a positive implementation/test claim;
- change an accepted decision entity to resolve an open decision;
- mark any claim `independently_verified` or create an engine-generated independent record.

A proposed status change requires explicit source evidence **and** a separately authorized
decision; it is not an S2.2 side effect. The S2.2 PR must state every status it changed and the
source/evidence for that change, or state that it copied statuses unchanged.

### 4.6 Source traceability for S2 additions (C5)

Every element S2 introduces is listed below with its accepted source, whether it is structural or
normative, the claim/check area it serves, and whether it is directly represented from an accepted
source or is a **new structural identifier** that S2.1 must review. A new identifier is not new
normative content and is not accepted merely because it appears in this package. No new claim is
introduced.

#### 4.6.1 New entity kinds

| Kind | Accepted source | Type | Related claims / checks | Origin |
|---|---|---|---|---|
| `phase` | design §5.2, §5.3 | structural | C000-IM-001/002; C000-SV-002; lifecycle checks | directly represented |
| `transition` | design §5.2, §5.3, §5.4 | structural | C000-IM-001; C000-SV-002; core relation checks | directly represented |
| `dependency` | design §5.2, §5.3 | structural | C000-CT-022; C000-GAP-006; core relation checks | directly represented |
| `extension_point` | design §5.2, §5.3, §5.4 | structural | C000-TR-001/003/004/006; C000-IM-006; trust checks | directly represented |
| `diagnostic` | design §5.2, §5.3, §5.7 | structural catalog | C000-IM-002/003; catalog/unknown-code checks | directly represented |
| `conformance_case` | design §5.2, §5.3, §7.8 | structural | C000-SV-004; `conformance.case-uncovered` | directly represented |

#### 4.6.2 New relation declarations

| Relation(s) | Accepted source | Type | Related claims / checks | Origin |
|---|---|---|---|---|
| `requires` / `requiredBy` | design §5.4 #3–4 | structural | C000-CT-022; C000-GAP-006; relation/cardinality checks | directly represented |
| `startsAt`, `endsAt` | design §5.4 #5–6 | structural | C000-IM-001; C000-SV-002; relation/cardinality checks | directly represented |
| `dependsOn` / `dependedOnBy` | design §5.4 #14–15 | structural | C000-SV-001/002; C000-IM-001; relation checks | directly represented |
| `covers` / `coveredBy` | design §5.4 #18–19 | structural | C000-SV-004; conformance check | directly represented |
| `concerns` / `guardedBy` | design §5.4 #20–21 | structural | C000-TR-001/003; trust checks | directly represented |
| `exposes` / `exposedBy` | design §5.4 #22–23 | structural | C000-TR-006; C000-IM-006; extension/trust checks | directly represented |
| `loadedBy` / `loads` | design §5.4 #24–25 | structural | C000-TR-006; C000-IM-006; consent/trust checks | directly represented |
| `supersedes` / `supersededBy` | design §5.4 #26–27 | structural | C000-ST-001..004; claim lifecycle checks | directly represented |
| `raisedIn` | design §5.4 #28 | structural | C000-IM-002/003; diagnostic catalog/phase checks | directly represented |

#### 4.6.3 New policy checks

| Check | Accepted source | Type | Related claims | Origin |
|---|---|---|---|---|
| `core000.claim.invalid-status` | design §5.7 | normative profile policy | C000-ST-003; C000-IM-002 | directly represented |
| `core000.claim.unsupported-guarantee` | design §5.7 | normative profile policy | C000-CT-011/012 | directly represented |
| `core000.claim.status-class-conflict` | design §5.7 | normative profile policy | claim class/status rows in C000-ST/CT | directly represented |
| `core000.independent-verification.incomplete` | design §5.7, §8.3 | normative profile policy | C000-VF-004; C000-EV-002 | directly represented |
| `core000.independent-verification.self` | design §5.7, §8.3 | normative profile policy | C000-VF-001..004 | directly represented |
| `core000.independent-verification.record-missing` | design §5.7, §8.3 | normative profile policy | C000-VF-004 | directly represented |
| `core000.model.interface-owner-mismatch` | design §5.7 | normative profile policy | C000-CT-001..003; C000-SC-002 | directly represented |
| `core000.evidence.locator` | design §5.7, §2.4 | normative profile policy | C000-EV-001..003 | directly represented |
| `core000.evidence.orphan` | design §5.7 | normative profile policy | C000-EV-001..003 (warning) | directly represented |
| `core000.surface.claim-missing` | design §5.7 | normative profile policy | C000-SC-002; C000-CT surface rows (warning) | directly represented |
| `core000.conformance.case-uncovered` | design §5.7 | normative profile policy | C000-SV-004 (warning) | directly represented |

#### 4.6.4 Structure identifiers

The IDs are listed in full. `direct` means the accepted design/contract names the ID; `new
structural` means the ID is a proposed encoding of an accepted public concept and needs S2.1
review before it is treated as accepted.

| Identifier group | IDs | Accepted source | Type | Related claims / checks | Origin |
|---|---|---|---|---|---|
| Components | `COMP-CORE` | design §5.9 | structural | C000-SC-002; C000-CT/IM; `surface.claim-missing` | direct |
| Components | `COMP-PROFILE`, `COMP-PROJECT`, `COMP-ADAPTER`, `COMP-RENDERER`, `COMP-CLI`, `COMP-REVIEWER` | design §5.2/§3.1; engine contract §2/§3 | structural | C000-CT/IM/TR; `surface.claim-missing` | new structural |
| Interfaces | `IF-MANIFEST`, `IF-BUILD-IDENTITY`, `IF-PROFILE-VALIDATOR` | design §5.9/§5.2 | structural | C000-CT/IM; `model.interface-owner-mismatch` | direct |
| Interfaces | `IF-PROJECT-MODEL`, `IF-DIAGNOSTIC`, `IF-BUILD-RESULT`, `IF-ADAPTER`, `IF-RENDERER`, `IF-CONFORMANCE`, `IF-CLI` | design §5.2; engine contract §3/§4/§7/§10/§11 | structural | C000-CT/IM; `surface.claim-missing` | new structural |
| Phases | `PH-STRUCTURE`, `PH-REFERENCE` | design §5.9/§5.4 | structural | C000-IM-001/002; C000-SV-002 | direct |
| Phases | `PH-LOAD`, `PH-PROVENANCE`, `PH-VERIFICATION`, `PH-CONSISTENCY`, `PH-REVIEW`, `PH-ARTIFACT` | design §5.2; execution plan §4 | structural | C000-IM-001/002; C000-SV-002 | new structural |
| Transitions | `TR-STRUCTURE-REFERENCE` | design §5.9 | structural | C000-IM-001; C000-SV-002 | direct |
| Transitions | `TR-LOAD-STRUCTURE`, `TR-REFERENCE-PROVENANCE`, `TR-PROVENANCE-VERIFICATION`, `TR-VERIFICATION-CONSISTENCY`, `TR-CONSISTENCY-REVIEW`, `TR-REVIEW-ARTIFACT` | execution plan §4 | structural | C000-IM-001; C000-SV-002 | new structural |
| Extension points | `EXT-PROFILE-VALIDATOR` | design §5.9 | structural | C000-TR-001/003/006 | direct |
| Extension points | `EXT-PROFILE-VIEW`, `EXT-RENDERER`, `EXT-ADAPTER` | design §5.2/§3.3; engine contract §3.3/§11 | structural | C000-TR-006; C000-IM-006 | new structural |
| Trust boundaries | `TB-PROFILE-EXEC` | design §5.9; accepted #35/PR #50 facts | structural | C000-TR-001..006; C000-IM-007 | direct |
| Trust boundaries | `TB-CONSUMER-EXTENSION` | S1 package §3.2/§6.2 and #72 review: consumer-supplied renderer is a separate trust boundary | structural | C000-IM-004/006; C000-TR-006 | new structural |
| Diagnostics | all 24 `core000.*` codes in design §5.7 | design §5.7 | structural catalog; codes are normative where the table says so | C000-IM-002/003; catalog/unknown-code checks | direct |
| Dependencies | not fixed in this package | `package.json`, `bun.lock`, contract §3/§13 | structural | C000-CT-022; C000-GAP-006 | new/derived; S2.1 must choose manifest-name IDs |
| Conformance cases | none (empty list) | design §5.2; execution plan §3.4; S2-D3 | structural | C000-SV-004; `conformance.case-uncovered` | empty; no ID |

**Traceability gaps to resolve in S2.1 review.**

1. The `new structural` component/interface/phase/transition/extension IDs have no individual
   accepted decision; they encode accepted public concepts but need S2.1 review before being
   called the accepted structure.
2. `TB-CONSUMER-EXTENSION` is grounded in the S1 consumer-renderer trust boundary, not in a
   design-named entity; confirm it or omit it.
3. Dependency IDs are deliberately unfixed; S2.1 must use manifest names and add the mapping rather
   than inventing a parallel vocabulary.
4. Diagnostic IDs are all 24 codes from design §5.7, as selected by S2-D1 A.

---

## 5. Staged work package and exact files

### 5.1 S2.1 — model surface and structure

**Goal:** expand the profile from 8 to 14 kinds, from 11 to 28 relations, from 13 to all 24
policy checks selected by S2-D1 A, and from the S1 structure excerpt to the full structure, while
the existing five claims still build.

| Path | Change |
|---|---|
| `contracts/core000/contract-builder.json` | Add entity pointers for phase, transition, dependency, extension_point, diagnostic, conformance_case. |
| `contracts/core000/structure.yml` | Add full components/interfaces/phases/transitions/extension points/trust boundaries/diagnostics/dependencies; keep the S1 rows. |
| `contracts/core000/claims.yml` | Keep the S1 claims and add an empty `conformanceCases` list while the pointer is introduced; the full register replaces this in S2.2. |
| `profiles/core000/profile.json` | Add the 6 kinds, 17 relations, new schema IDs, files and view/validator wiring. |
| `profiles/core000/catalog.json` | Add the 11 missing codes, for 24 total under accepted S2-D1 A. |
| `profiles/core000/view.ts` | Add phase, transition, extension-point, diagnostic, dependency and conformance-case views/counts. |
| `profiles/core000/validator.ts` | Wire the new checks. |
| `profiles/core000/checks/claim-evidence.ts` | Add invalid-status, unsupported-guarantee and status-class-conflict checks. |
| `profiles/core000/checks/provenance-verification.ts` | Add independent-verification incomplete/self/record-missing checks. |
| `profiles/core000/checks/model-structure.ts` | New: interface owner mismatch and subject/surface consistency. |
| `profiles/core000/checks/evidence.ts` | New: evidence locator and orphan checks. |
| `profiles/core000/checks/conformance.ts` | New: conformance-case coverage (vacuous on empty data). |
| `profiles/core000/renderer.ts` | Only if the view shape requires renderer changes; otherwise unchanged. |
| `profiles/core000/templates/core000.md.j2` | Add phases, transitions, extension points, diagnostics, dependencies, conformance cases and counts. |
| `profiles/core000/schemas/structure.schema.json` | Validate the full structure document. |
| `profiles/core000/schemas/claims.schema.json` | Validate the full claims document, including empty conformance cases. |
| `profiles/core000/schemas/phase.schema.json` | New entity schema. |
| `profiles/core000/schemas/transition.schema.json` | New entity schema. |
| `profiles/core000/schemas/dependency.schema.json` | New entity schema. |
| `profiles/core000/schemas/extension-point.schema.json` | New entity schema. |
| `profiles/core000/schemas/diagnostic.schema.json` | New entity schema. |
| `profiles/core000/schemas/conformance-case.schema.json` | New entity schema. |
| `tests/core000.test.ts` | Add S2.1 structure/profile/positive assertions; keep S1-POS tests. |
| `docs/architecture/core-000-self-contract.md` | If S2-D1 A: count-only correction (23 → 24), no normative change; if B: keep 23 and name the excluded code. |
| `docs/architecture/core-000-execution-plan.md` | If S2-D1 A: reconcile the forward-looking §1, §2.2 and §3.4 references to 24; if B: reconcile to 23 with the excluded code named. |
| `docs/architecture/core-000-self-build-poc.md` | If S2-D1 A: reconcile forward-looking §2.1/§11.1; retain historical §10.6/§10.7/§10.10 as S1 snapshots (label them, do not blanket-replace). If B: reconcile the forward-looking references to 23 with the excluded code named. |
| `docs/architecture/implementation-status.md` | No S2.1 count change: §4.1 is labeled historical in this revision; future reconciliation belongs to a separate status-matrix update. |

S2.1 is reviewable without the full 78-claim register because it keeps the S1 claims and adds the
model surface. It does not claim the full model is complete. The full public surface may produce
`core000.surface.claim-missing` **warnings** for interfaces/components not yet claimed by the five
S1 claims; warnings do not block a draft, and the S2.1 test records the exact code set rather than
treating it as an error. S2.2’s full register must reduce or account for them explicitly.

### 5.2 S2.2 — full 78-claim register

**Goal:** replace the five-claim data with the full accepted register and make the full positive
draft reviewable.

| Path | Change |
|---|---|
| `contracts/core000/claims.yml` | 78 claims, source statements, evidence rows, decision entities and empty independent verifications. |
| `profiles/core000/view.ts` | Any projection fields needed for the larger register; no new semantics. |
| `profiles/core000/templates/core000.md.j2` | Any section needed for the larger register; no new semantics. |
| `contracts/core000/output/CORE-000.draft.md` | Generated draft, committed only if P-3 A. |
| `evidence/core000/<run>/result.json` | Durable evidence only if P-2/P-6 A; otherwise the transient record stays in the harness. |
| `docs/architecture/core-000-execution-evidence.md` | Human summary only if P-2 A. |
| `tests/core000.test.ts` | Full-register positive/release assertions; no claim-status guesses. |

No claim is added, removed or promoted without evidence. The full register must not treat the
engine's own verdict as independent verification.

### 5.3 S2.3 — focused check coverage and S2 evidence

**Goal:** prove each new policy check with focused tests and finish the S2 evidence. The full
N1–N18 matrix remains S3 under S2-D4 A; S2.3 does not re-implement it.

| Path | Change |
|---|---|
| `contracts/core000/mutations.ts` | Named one-field mutations only for the focused S2 cases that need a harness run; no full N1–N18 table. |
| `contracts/core000/run.ts` | Focused mutation list/expected-outcome wiring only; no bypass of `runBuild`. |
| `tests/core000.test.ts` | Focused tests for each of the 11 new checks, plus S2 positive/release assertions. The three independent-verification checks use synthetic in-memory/temp fixtures, not project records; no claim that S3’s matrix is complete. |
| `evidence/core000/<run>/result.json` | S2 run evidence if P-2/P-6 A. |
| `docs/architecture/core-000-execution-evidence.md` | S2 human summary if P-2 A. |

S2 is accepted only after S2.3 passes. S2.1 or S2.2 alone is not the full model. The full N1–N18
acceptance remains S3.

---

## 6. Commands, tests and expected outputs

### 6.1 Baseline commands (recorded at S1 merge `07cbf5b`)

| Command | Expected at S1 baseline |
|---|---|
| `bun install --frozen-lockfile` | exit 0; lockfile unchanged |
| `bun run typecheck` | exit 0 |
| `bun test` | 308 pass / 0 fail / 22 files |
| `bun test tests/core000.test.ts` | 16 pass / 0 fail |
| `bun run check` | exit 0; CORE-001 artifact unchanged |
| `bun run build:release` | exit 1 by design; release blocked; no artifact |
| `sha256sum spec/output/CORE-001.draft.md` | `8213a26379f1fb6e7227ce90a9db6db08e3820bd42a579eb38c2adf5dc269b51` (327 lines) |

### 6.2 S2 positive checks

| ID | Command | Expected result |
|---|---|---|
| S2-POS-01 | `bun contracts/core000/run.ts --mode draft --write false --run S2-POS-01` | exit 0; `blockedBy: null`; identity non-null; markdown non-null; `written: false`; the expected review-code set from the full register (design predicts `core000.independent-verification.missing` and `core000.decision.unresolved`; actual count recorded); no unexpected error. |
| S2-POS-02 | `bun contracts/core000/run.ts --mode draft --write false --run S2-POS-02a --evidence <temp>/02a.json` and the same for `02b`; no `--spec-dir`, so each process calls `prepareWorkspace()` | same `inputDigest`, artifact SHA-256 and diagnostic code/order as S2-POS-01; **same-environment, fresh-workspace repeatability, not H2**. |
| S2-POS-03 | `bun contracts/core000/run.ts --mode release --write false --run S2-POS-03` | exit 1; `blockedBy: "review"`; no release artifact. |
| S2-POS-04 | harness API: `prepareWorkspace()`, then `runHarness({ mode: "draft", write: true, specDir: ws.projectDir, workspaceRoot: ws.root, run: "S2-POS-04a" })` and `runHarness({ mode: "draft", check: true, specDir: ws.projectDir, workspaceRoot: ws.root, run: "S2-POS-04b" })` | no `ERR_OUTPUT_STALE`; artifact bytes match; `workspace.writeCheck: "only_declared_outputs"`; test calls `ws.cleanup()`. |
| S2-POS-05 | harness API: `runHarness({ mode: "draft", mutation: "claim", run: "S2-POS-05" })` after a baseline `runHarness({ mode: "draft", run: "S2-POS-05-baseline" })` | `inputDigest` and artifact hash change versus the baseline; `workspace.writeCheck: "only_declared_outputs"`; `workspace.cleanup: "completed"`; no crash. |

#### 6.2.1 Harness-API checks and workspace boundary

S2-POS-04 and S2-POS-05 are **test-harness checks**, not bare `--spec-dir` CLI invocations.
`prepareWorkspace()` creates the required temporary layout: `contracts/core000/` with the three
project files, `profiles/core000/` with its profile files and engine imports rewritten to the
repository engine, and `docs/architecture/engine-public-contract.md`. `runHarness()` then calls the
public `runBuild` path.

For S2-POS-04 the test passes `specDir: ws.projectDir` **and** `workspaceRoot: ws.root` to both the
write and check invocations, so each call snapshots and compares the whole workspace; it asserts
`workspace.writeCheck === "only_declared_outputs"` and calls `ws.cleanup()` at the end. A bare
`--spec-dir` CLI call would not provide that `workspaceRoot` scan and is not the S2 check. For
S2-POS-05, `runHarness()` creates and owns the fresh workspace, so its evidence carries both
`workspace.writeCheck` and `workspace.cleanup`; the test asserts both.

The full-model positive run may emit `core000.surface.claim-missing` or `core000.evidence.orphan`
**warnings** if the encoded data leaves a public surface or evidence row unused. Tests assert the
exact observed code set; warnings do not block a draft but must be accounted for in the evidence,
not silently ignored.

### 6.3 S2 focused check coverage

S2.3 covers each of the 11 new check codes with focused unit or harness tests. It does not claim
the full N1–N18 matrix; S1 already covers N2/N3/N8/N11/N14, and the full matrix remains S3 (S2-D4).

| Code | Focused S2 check |
|---|---|
| `core000.claim.invalid-status` | status enum invalid in a claim |
| `core000.claim.unsupported-guarantee` | guarantee without conditions/cites/evidence |
| `core000.claim.status-class-conflict` | class/status contradiction |
| `core000.independent-verification.incomplete` | record missing required fields/commands/date |
| `core000.independent-verification.self` | verifier equals the claim author |
| `core000.independent-verification.record-missing` | performed record without an external locator |
| `core000.model.interface-owner-mismatch` | interface owner not provided by its component |
| `core000.evidence.locator` | empty/non-locatable evidence locator or revision |
| `core000.evidence.orphan` | evidence supports no claim (warning) |
| `core000.surface.claim-missing` | public component/interface has no claim (warning) |
| `core000.conformance.case-uncovered` | a project case covers no claim (warning; vacuous on empty data) |

Each test asserts the exact code, severity, entity/location and expected exit behavior. A code-only
assertion is insufficient. For harness cases, one mutation in a fresh copy is still required; N14
uses `view`/`validator` markers only, never a consumer-supplied renderer marker.

#### 6.3.1 Synthetic fixtures are not independent evidence (C3)

S2 creates **zero** independent-verification records. The independent-verification checks
(`incomplete`, `self`, `record-missing`) are still testable: S2.3 may use synthetic in-memory
models or temporary test fixtures to exercise them. The boundary is explicit:

- a synthetic fixture is a **test input**, not a real verification record and not project data;
- producer-generated or test-generated evidence is **not independent evidence**;
- passing a synthetic check does **not** establish independent verification or H3;
- no `independent_verification` entity is added to `claims.yml`, and no
  `verification/core000/` record is created or committed in S2;
- the S2 evidence record may report producer evidence shape and check outcomes, but must label
  H3 `NOT_PERFORMED`.

The full N1–N18 matrix is specified in the accepted execution plan and remains the S3 acceptance
gate. S2 does not silently absorb it.

### 6.4 Evidence and artifact

- The transient JSON evidence record is required in every run regardless of P-2/P-6. It uses the
  execution plan §6.2 base shape plus the S1/S2 additions.
- If P-2/P-6 A: durable `evidence/core000/<run>/result.json` and
  `docs/architecture/core-000-execution-evidence.md`; no absolute paths, secrets or private material.
  S2 creates **zero** independent-verification records; no engine-generated record counts as
  independent, and `verification/core000/` is not populated in S2.
- If P-3 A: commit `contracts/core000/output/CORE-000.draft.md` after a reviewed successful run;
  `bun run check` must pass.
- If P-2/P-3/P-6 are deferred: no durable evidence or draft is committed; the transient record is
  still produced and asserted.
- H2 and H3 are not run. The evidence records `H2_reproducibility: NOT_TESTED` and
  `H3_independent_verification: NOT_PERFORMED`.

---

## 7. Dependencies, exclusions and stop conditions

### 7.1 Generic-core capabilities relied upon

- `runBuild`, manifest/profile loading, consent gate, profile closure, schemas, extraction,
  identity/index, relations, provenance binding and `verifyProvenance`, hook resolution, renderer
  registry, `TemplateSet`, build identity, one-artifact normalization, blocking/check/write.
- `nunjucks` 3.2.4; no new dependency.
- The existing core diagnostic codes and profile catalog resolution.
- No core change is expected. If a full-model requirement needs one, stop and record the gap.

### 7.2 Exclusions

- No H2/H3 result, no independent verifier, no certification, no semantic-truth claim.
- No generic-core, CLI/API, G4, CORE-001, PAP, packaging or publication change.
- No arbitrary/untrusted profile execution; temporary workspace is not a sandbox.
- No conformance execution; `conformance_case` is representation only.
- No new claims are introduced by this planning package. The accepted decisions are recorded in
  the canonical decision record; they do not authorize implementation or resolve unrelated open
  design questions.
- No evidence/draft commit unless P-2/P-3/P-6 say so.
- Reconcile forward-looking 23-count references to 24 under accepted S2-D1 A; preserve historical S1 snapshots.

### 7.3 Stop conditions

Stop and report the concrete issue if:

- a full-model requirement needs a `spec/lib/` change or a new core capability;
- the implemented policy-check set does not contain all 24 codes required by accepted S2-D1 A;
- a needed structure entity, claim, decision or quote is not present in the accepted sources;
- encoding the 78 claims would require a new claim, a new decision or a status promotion without
  evidence;
- a source quote cannot be verified at the current locator grammar (V4 remains open);
- the planned evidence/artifact behavior deviates from accepted P-2/P-3/P-6, or would create an
  independent-verification record without a distinct verifier and separate maintainer decision;
- a check needs I/O, a clock, network or environment access;
- a negative case cannot be isolated to exactly one mutation or produces an unexpected code;
- any run writes to the repository, reads a secret or cannot be cleaned up.

A stop condition is a finding for the maintainer; it does not authorize a core patch or a scope
expansion.

---

## 8. Acceptance criteria and evidence

S2 is ready for maintainer review only when:

1. the planning package is approved/merged; this does **not** authorize implementation. Before any
   stage starts, a separate explicit maintainer authorization for that stage is recorded after
   review of the decisions and exact implementation scope; creating or linking an implementation
   task is not authorization;
2. D14, P-2, P-3, P-6 and S2-D1–S2-D4 are implemented in accordance with their accepted planning
   decisions recorded in the canonical decision record;
3. S2.1, S2.2 and S2.3 are merged as separate focused PRs;
4. the profile declares 14 kinds, 28 relation declarations and all **24 enumerated policy-check
   codes**, as required by accepted S2-D1 A;
5. `claims.yml` has 78 accepted claim IDs, no invented IDs and no `independently_verified` claim;
6. the full positive run and release block pass exactly; the S1 cases and the 11 focused new-check
   tests pass with no artifact on failures and no repository writes; the full N1–N18 matrix remains
   S3;
7. `bun install --frozen-lockfile`, `bun run typecheck`, `bun test` and `bun run check` are green;
8. CORE-001 artifact and lockfile are unchanged; `spec/lib/`, `profiles/core001/` and `pap/` are
   unchanged;
9. the evidence/artifact paths match P-2/P-3/P-6, and the transient record is present even when
   those are deferred;
10. H2 is `NOT_TESTED`, H3 is `NOT_PERFORMED`, and the temporary workspace is not described as a
    sandbox.

Evidence for review: per-stage PR diffs, test output, evidence JSON (if published), artifact hash,
`git status` and the full-model counts. No independent verification claim is made.

---

## 9. Risks and limitations

1. **Full model is large.** 78 claims and 24 checks are a substantial data/review surface; staging
   is required to avoid an unreviewable PR.
2. **Check-count discrepancy.** S2-D1 A resolves the design's 23-prose/24-table discrepancy in
   favor of the 24 enumerated codes; forward-looking references must use 24.
3. **Status accuracy.** S2 makes previously unimplemented capabilities real; claim statuses must be
   re-audited with evidence, not copied as “implemented”/“tested” by assumption.
4. **Evidence staleness.** Code/test files cited as evidence are outside `inputDigest` (G1); external
   review must re-check them.
5. **Provenance is coarse.** The locator grammar is section/table/item; V4 is not implemented.
6. **No H2/H3.** Same-environment, fresh-workspace repeatability is not reproducibility; the engine
   is the producer, not an independent verifier.
7. **No sandbox.** The full model may run more profile code; a temporary workspace is not isolation.
8. **No core change.** If the full checks need a core feature, S2 stops rather than patching core.
9. **Conformance representation.** An empty `conformanceCases` list and the S3 N1–N18 harness are
   not project conformance execution.
10. **No semantic truth.** A green full-model build is a self-consistency check, not certification.

---

## 10. Maintainer decision recorded

The maintainer accepted **D14 = A, P-2 = A, P-3 = A, P-6 = A for producer run evidence only,
S2-D1 = A, S2-D2 = A, S2-D3 = A and S2-D4 = A** on 2026-11-03. The exact effects and mandatory
evidence-separation invariant are recorded in
[`core-000-decision-record.md`](core-000-decision-record.md). This package remains planning-only.

**Approval boundary.** Approval or merge of this package accepts the planning package only. It does
**not** authorize S2.1. S2.1 starts only after a separate, explicit maintainer authorization issued
after review of the relevant decisions and exact S2.1 scope. Creating or linking an implementation
issue/task is not authorization. S2.2 and S2.3 each require their own separate explicit
authorization; approval of S2.1 does not authorize them. Until those authorizations exist, no S2
coding starts. The historical S1 deferrals are resolved for the full-model planning scope, but the decision does
not authorize S2.1, S2.2 or S2.3. S2 does not claim H2, H3, security isolation, independent
verification or semantic truth.
