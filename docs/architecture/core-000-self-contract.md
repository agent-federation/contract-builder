# CORE-000 — self-contract design, proposed model and self-validation plan

**Status:** proposed for maintainer review. This is a design and feasibility document. It does
not implement CORE-000, does not change the generic engine, and is not an accepted CORE-000
project.
**Issue:** [#47](https://github.com/agent-federation/contract-builder/issues/47) — «Define
CORE-000 as a self-contract for the Contract Builder Engine».
**Task:** `CB-A2A-012` (A2A/0.1 envelope, `docs/agents/task-envelope.md`).
**Design baseline:** `cf0722b14fa6ac514e66b08d58465d4137690d13` (`main` after #49).
**Current-main reconciliation:** `260de897455699262bc6558555ecdaac5d426321` (after #50, #52, #55 and #56); the design and its evidence mapping are updated to this state.
**Implementation status:** not started. No code, schema, fixture or generated artifact is
changed by this document.
**Normative status of CORE-000:** a working project identifier. It is not an adopted UIA
standard, not a source of normative authority by itself, and not a compatibility claim with any
external format, vendor or specification.

> **Reading statuses.** In this document `accepted` means an existing maintainer decision record
> says so and the source is linked. It never means this document is accepted. `proposed` means a
> recommendation here. `implemented` means the behaviour exists in the current-main reconciliation;
> `tested` means an automated test exercises it; `independently_verified` means a reviewer
> distinct from the author recorded a check. `deferred` is an explicit decision; an open
> maintainer decision is recorded as `unresolved` on a `decision` entity, not as a claim status.
> `—` means no supported claim. The vocabulary is the one published in
> [`implementation-status.md`](implementation-status.md) §1; no seventh status is introduced.

---

## 0. How to read this document

### 0.1 What this document is

The design deliverable requested by #47:

1. CORE-000 purpose, scope, terminology, normative status, boundaries and non-goals.
2. A proposed machine-readable CORE-000 model and profile boundary: kinds, relations, schemas,
   policy checks, provenance and evidence representation.
3. A claim-to-status-to-evidence register with stable identifiers.
4. A self-validation experiment through the existing generic pipeline, with expected artifacts
   and diagnostics.
5. A concrete independent verification path and the claims it must cover.
6. A generic-core gap report, with each gap proposed as separate follow-up work.
7. Unresolved maintainer decisions with options, consequences and a recommendation.
8. A conformance and acceptance plan with negative cases.

It also records the executable-profile trust boundary as it exists today: the merged #35/PR #50
consent policy is adopted, and the remaining open choices are listed rather than left pending.

### 0.2 Status vocabulary and evidence method

| Term | Meaning in this document |
|---|---|
| `accepted` | Explicitly directed or approved by the maintainer in an existing decision record (contract, M1 plan, provenance RFC, issue/PR). The decision source is linked. |
| `proposed` | Recommended here, not accepted. It promises nothing. |
| `implemented` | The behaviour exists in the current code at the baseline; the path is linked. |
| `tested` | Automated tests exercise the behaviour; the test path and the run are linked. |
| `independently_verified` | A verifier distinct from the implementation author recorded a check of the specific behaviour. A passing test, green CI, PR merge, maintainer approval with an empty body, or the implementation author's own report does **not** qualify (matrix §7). |
| `deferred` | Explicitly outside the current scope or postponed, with the decision linked. |
| `unresolved` | A `decision` entity's status: a maintainer decision is recorded but not taken. It is not a claim-dimension status. |
| `—` | No supported claim for that dimension. It does not mean "failed". |

The former `pending #35` status is retired: Issue #35 and PR #50 are completed facts, and the
CORE-000 trust claims now use `accepted`/`implemented`/`tested` like any other settled claim.

**Evidence method.** The contract, M1 plan, build-identity note, design record, implementation
status matrix, the #45/#49 RFCs and the current-main changes #50/#52/#55/#56 were read.
Implementation and test status come from code and tests at the current-main reconciliation
commit, not from document headers or PR descriptions. The #39 matrix remains the as-of audit at
`f1ddcf7`; it carries snapshot-update notes for #35, #36 and #37, but not for #38, so the render
claim cites the contract and tests directly. The following commands were run locally on
2026-11-02 against the rebased checkout at `260de89`:

```text
bun install --frozen-lockfile → clean
bun run typecheck             → clean (tsc --noEmit)
bun test                      → 169 pass, 0 fail (12 files)
bun run check                 → clean; committed artifact matches a fresh build
sha256sum spec/output/CORE-001.draft.md
                              → 8213a26379f1fb6e7227ce90a9db6db08e3820bd42a579eb38c2adf5dc269b51  (327 lines)
```

The earlier design baseline `cf0722b` recorded 133 tests, 298 lines and artifact hash
`a29ce609269a8ad9185ed50576d4e6276b586f740d2ea8b4ef7f06f6c05988df`. Those numbers are kept as
the historical snapshot only; #55 deliberately changed the rendered provenance section, so the
artifact hash and line count moved. The current-main numbers above are the ones the claim
register cites.

Those checks prove that the repository is green at the baseline. They do **not** prove that the
engine is correct, that its documentation is complete, or that any CORE-000 claim is true.

### 0.3 Relationship to existing records

| Record | Role for CORE-000 |
|---|---|
| [`engine-public-contract.md`](engine-public-contract.md) | Accepted description of the engine's public contract. CORE-000 describes this subject; it does not replace or widen it. |
| [`m1-implementation-plan.md`](m1-implementation-plan.md) | Approved M1 implementation plan and its narrowings. CORE-000 treats its decisions as sources, not as claims to re-decide. |
| [`implementation-status.md`](implementation-status.md) | As-of audit that separates decision, implementation and verification for the contract. CORE-000 reuses its vocabulary and evidence, and does not re-audit it. |
| [`build-identity.md`](build-identity.md) | Implemented build-identity semantics. CORE-000 describes identity as a public surface and a conditional guarantee, not as proof. |
| [`2026-11-01-core001-spec-builder-design.md`](../superpowers/specs/2026-11-01-core001-spec-builder-design.md) | MVP design record. Historical context only; its fixed test counts are stale (matrix §8). |
| [`provenance-hardening-rfc.md`](provenance-hardening-rfc.md) | Accepted but unimplemented stronger provenance. CORE-000 marks the dependency and does not assume it. |
| [`portable-assurance-package-rfc.md`](portable-assurance-package-rfc.md) | A separate product track. CORE-000 does not design, depend on, or claim PAP/verifier behaviour. |
| [#39](https://github.com/agent-federation/contract-builder/issues/39) / [#48](https://github.com/agent-federation/contract-builder/pull/48) | Source of the status matrix and verification evidence audit. |
| [#35](https://github.com/agent-federation/contract-builder/issues/35) / [#50](https://github.com/agent-federation/contract-builder/pull/50) | Executable-profile trust-boundary work, closed and merged. CORE-000 adopts the merged consent policy; it does not re-decide it. |
| [#36](https://github.com/agent-federation/contract-builder/issues/36) / [#52](https://github.com/agent-federation/contract-builder/pull/52) | Reciprocal relation-inverse contract, merged. CORE-000's relation declarations are updated to declare both halves. |
| [#37](https://github.com/agent-federation/contract-builder/issues/37) / [#55](https://github.com/agent-federation/contract-builder/pull/55) | Provenance binding versus verification lifecycle, merged. CORE-000 separates a binding from its recorded verification result. |
| [#38](https://github.com/agent-federation/contract-builder/issues/38) / [#56](https://github.com/agent-federation/contract-builder/pull/56) | Single-target `manifest.render[]` contract, merged. CORE-000's experiment uses exactly one render declaration. |
| [#47](https://github.com/agent-federation/contract-builder/issues/47) | This design request. |

CORE-000 is not a rewrite of any of these. Where this document and an accepted record disagree,
the accepted record wins for the engine's normative meaning; the disagreement is recorded as a
limitation or a maintainer decision (§10, §11), not silently resolved.

---

## 1. Purpose, scope and normative status

### 1.1 Why CORE-000 exists

M1 proved that a CORE-001-specific profile can leave the generic code path without changing the
generated bytes ([#46](https://github.com/agent-federation/contract-builder/pull/46), matrix §4).
The next question is narrower and harder:

> Can the engine describe **itself** — its public architecture, observable behaviour,
> guarantees, limitations and trust boundaries — as a project in the same Core / Profile /
> Project pipeline, without confusing self-consistency with independent correctness?

CORE-000 is that experiment. Its purpose is not to create a new standard or a marketing
artifact. It is to make the engine's own contract:

- machine-readable and reviewable, with stable claim identifiers;
- explicit about the difference between a contract promise, an implemented fact, a test result
  and an independent verification;
- honest about what it cannot establish about itself;
- useful as a basis for review, conformance planning and gap discovery.

A second purpose follows from the first: if the architecture cannot represent the engine's own
contract without a generic-core change, that is a finding about the architecture, not a reason
to bend the model. The experiment plan (§7) is designed to surface that finding cheaply.

### 1.2 What CORE-000 describes

CORE-000 describes the **Contract Builder Engine as a product with a public contract**, not its
private implementation structure. The subject includes:

- public components and their responsibility boundaries: core, profile, project, adapter,
  renderer, CLI, and the external reviewer/consumer roles;
- public interfaces and data contracts: manifest, project model, diagnostics, build result,
  build identity, adapter and renderer interfaces, profile hook interface, CLI surface;
- lifecycle phases and permitted transitions, and the guarantee / non-guarantee of each phase;
- guarantees the engine makes, guarantees delegated to trusted extensions, assumptions those
  guarantees rely on, constraints on callers and profile authors, and explicit non-guarantees;
- dependencies and extension points, including executable profile code and consumer-supplied
  adapters/renderers;
- diagnostics and build-identity semantics;
- trust boundaries and security-relevant limitations, stated as current facts;
- decisions, status, provenance, evidence and verification records that support claims.

The unit of description is the **claim**: a statement with a stable ID, a class, status
dimensions, and a method by which it can be checked. Private modules, filenames, helper
functions and line numbers are evidence locators, not the subject of a claim (§3.1).

### 1.3 What CORE-000 is not

Explicit non-goals, matching #47's non-goals and the task's C14:

- not an implementation of CORE-000, a new package, or a change to `spec/lib/`;
- not a rewrite or replacement of `engine-public-contract.md`, the M1 plan, or CORE-001
  normative content;
- not a new generic-core capability, rule language, validator, verifier, sandbox, package split
  or publication process;
- not the Portable Assurance Package or an independent verifier; #43/#44 are a separate track
  and CORE-000 only points at the boundary (§8.6);
- not a re-decision of the merged #35/PR #50 consent policy; it adopts that completed outcome;
- not a formal UIA standard, certification, legal opinion, security audit, or proof of
  correctness, determinism, conformance or trustworthiness;
- not a claim that a successful self-build is independent verification;
- not a commitment that the proposed model is the final model. It is a reviewable proposal.

### 1.4 Normative status and authority

CORE-000 is a working project identifier. It has **no external normative authority**. The
following rules apply inside the project:

1. A claim is normative for CORE-000 only when its class is `requirement`, `constraint` or
   `guarantee` and its decision dimension is `accepted`. Its decision source must be an existing
   record (contract section, M1 decision, accepted RFC, issue/PR decision), not this document's
   recommendation.
2. A claim with class `implementation_fact` describes code; it is not a requirement merely
   because the code does it. This is constraint C7 of the task and §2 of #47.
3. A claim with class `guarantee` is normative only within its stated conditions and scope. A
   guarantee without conditions or evidence is unsupported (§7.8, negative case N4).
4. A claim with class `proposal`, `deferred`, `limitation` or `non_goal` is not a requirement.
5. This document is `proposed`. Its recommendations become accepted only through a maintainer
   decision recorded in the repository, not by being written here.
6. `independently_verified` is not an engine-settable status. Only a verification record produced
   by a verifier distinct from the author can support it (§8).

The artifact produced by a future CORE-000 build must carry the same notice. Reading the
Markdown artifact is not a substitute for reading the claim status and evidence.

### 1.5 Baseline and as-of snapshot

- Design baseline: `cf0722b` (main after #49). It is the historical starting point for the
  original proposal.
- Current-main reconciliation: `260de89` (after #50, #52, #55 and #56). The trust, relation,
  provenance and render statements are reconciled to this commit; current code and tests, not
  the old PR snapshot, are authoritative.
- Status audit: [`implementation-status.md`](implementation-status.md), audited at `f1ddcf7`,
  with snapshot updates for #35, #36 and #37. #38 changed the accepted `manifest.render[]`
  cardinality after the matrix snapshot; the render claim cites contract §3.1 and
  `tests/manifest.test.ts` directly. Any later code change invalidates the affected claim rows
  and requires a matrix/CORE-000 update (matrix §9).
- The matrix notes documentation drift (stale headers, test counts). CORE-000 uses the current
  recorded run in §0.2, not the old counts.
- The original #35-pending caveat is retired: #35 closed at 2026-11-02T02:31:43Z, PR #50 merged
  as `2861195`, and this update adopts the merged consent policy. It does not re-open or
  re-decide it.

---

## 2. Terminology and the claim/evidence model

### 2.1 Four kinds of statement that must not be confused

| Kind | Question it answers | Who can establish it | Example |
|---|---|---|---|
| Contract claim | What must the engine do? | Maintainer decision, recorded in an accepted source | "A project must have a manifest." |
| Implementation fact | What does the code do today? | Code inspection and execution at a revision | "The loader dynamically imports `profile.view`." |
| Test evidence | What was exercised, and did it pass? | An automated run at a revision, recorded with the command | "`tests/manifest.test.ts` passed at `260de89`." |
| Independent verification | Who checked the claim, independently, and what did they find? | A verifier distinct from the author, with a recorded method and scope | A reviewer's signed record that they re-ran the tests and inspected the code. |

CORE-000 keeps these separate in the data model, not only in prose. A claim may have a contract
decision, an implementation state, test evidence and a verification record at the same time;
collapsing them into one "done" flag is the failure mode the #39 matrix exists to prevent.

### 2.2 Claim classes

A claim has exactly one class. The class decides which fields are meaningful and which evidence
is required.

| Class | Meaning | Required shape (profile policy) |
|---|---|---|
| `requirement` | A normative obligation from an accepted decision | statement, scope, verification method, decision source |
| `guarantee` | A property the engine provides under stated conditions | statement, conditions, scope, verification method, evidence |
| `assumption` | A premise a guarantee relies on; if false, the guarantee does not hold | statement, conditions, consequence if false |
| `constraint` | A limit on implementation or use | statement, scope, consequence |
| `implementation_fact` | Observed current behaviour | statement, baseline revision, code/test evidence |
| `proposal` | A recommended capability or design, not accepted | statement, rationale/notes, decision status `proposed` |
| `deferred` | Explicitly postponed capability | statement, deferring decision, revisit condition |
| `limitation` | A known gap or property the engine does not provide | statement, affected claim/scope, consequence |
| `non_goal` | Explicitly excluded from this project | statement, source decision |
| `trust_boundary` | A statement about trusted code, privilege or enforcement | statement, scope, subject trust boundary, verification method |

Classes are not entity kinds. The model uses one `claim` kind with a `class` field and a base
schema; class-specific required fields are checked by the CORE-000 profile hook (§5.7). This is a
deliberate design choice: the classes share one status/evidence/lifecycle model, and ten nearly
identical kinds would duplicate the same relations and checks. The model still has separate kinds
for the structural subjects (component, interface, phase, transition, trust boundary, dependency,
extension point, diagnostic, conformance case) because those have distinct fields and endpoints
(§5.2).

### 2.3 Status dimensions

CORE-000 reuses the #39 vocabulary in separate dimensions. It never introduces a combined
status.

| Dimension | Values | Meaning |
|---|---|---|
| Decision | `accepted`, `proposed`, `deferred`, `none` | The outcome a claim asserts about a maintainer decision, or `none` when no outcome is asserted. It is not the decision entity's own lifecycle. For `accepted`/`proposed`/`deferred`, the `decidedBy` relation must agree; `none` may have no decision entity or an unresolved one. See the state table below. |
| Implementation | `implemented`, `none` | Whether the behaviour exists in the current-main code. |
| Tests | `tested`, `none` | Whether automated tests exercise it at the current main. |
| Verification | `independently_verified`, `none` | Whether a verifier distinct from the author recorded an independent check. A provenance `verified` record is not this status. |

In data, `none` is used because JSON has no `—`; the rendered artifact prints `—`. The matrix's
`—` and the model's `none` are the same "no supported claim" value. There is no `partial`,
`unknown`, `not_started` or `verified` status. "Implemented but not tested" is a valid row:
implementation `implemented`, tests `none`.

The claim's `decision` dimension and the `decidedBy` relation must agree. `none` has two distinct
states, distinguished by whether a decision entity exists:

| Claim `decision` | `decidedBy` relation | Meaning |
|---|---|---|
| `none` | absent | no decision entity exists yet |
| `none` | a decision with `status: unresolved` | a decision is recorded; its outcome is unresolved |
| `proposed` | absent, a decision with `status: proposed`, or a decision with `status: unresolved` (proposal awaiting a decision) | proposed, not accepted |
| `deferred` | a decision with `status: deferred` | deliberately postponed |
| `accepted` | exactly one decision with `status: accepted` | accepted |

A decision with `status: unresolved` is never written as `decision: unresolved`: the decision
entity carries `unresolved`. A `none` claim awaiting an outcome links the unresolved decision; a
`proposal` may also link one when the proposal is explicitly awaiting a decision. A `deferred`
claim links a `deferred` decision; an unresolved decision is not a deferral. A proposal linked to
an `accepted` decision is a mismatch.

A claim may also have an explicit `lifecycle` field — `active`, `superseded`, `retired` — which
is about the register, not about evidence. Superseding claims keep the old ID and link to it;
they are never silently deleted.

### 2.4 Evidence types

Evidence is an observation. It is not an independent verification and not a status. A core
provenance `VerificationRecord` is a separate, method-specific binding check (V5).

| Evidence kind | Locator examples | What it can support | What it cannot |
|---|---|---|---|
| `code` | `spec/lib/build.ts` at a revision | "the behaviour exists here" | that the behaviour is correct or complete |
| `test` | `tests/identity.test.ts` + command | "these assertions passed at this revision" | that the test covers the claim fully |
| `ci` | workflow run URL + commit | "the commands ran and succeeded in CI" | independence from the author |
| `source` | contract section + verbatim quote | "the contract says this" | that the implementation follows it |
| `review` | review comment/record URL | "a person said this" | that the statement is true |
| `analysis` | a reproducible inspection note | "this was inspected this way" | truth beyond the stated scope |
| `build` | artifact path + SHA-256 + `inputDigest` | "these bytes were produced from these inputs" | correctness, security, independent conformance |

Each evidence record carries a `revision` (commit, run ID or dated snapshot), a producer, and an
`independence` value (`author`, `non_author`, `independent`, `unknown`). A test run by the
implementation author is `author` evidence even when the test itself is automated. A green CI run
is `ci` evidence with independence `unknown` unless the workflow and environment are controlled by
a different party.

### 2.5 Verification and independence

An **independent verification** is an act by an actor distinct from the author: it states what
was checked, against which revision, with which method and scope, and with what result. It is
separate from the evidence it used and from the core provenance `VerificationRecord`.

Independence criteria used here:

- `author`: the verifier authored the change or the claim.
- `non_author`: the verifier did not author the change, but is not otherwise independent (for
  example, the same team, the same agent account, or a reviewer relying only on the author's
  summary).
- `independent`: the verifier is distinct from the author, had access to the code/tests/source
  rather than only the report, recorded the method and scope, and did not merely approve an empty
  review or merge a PR.
- `unknown`: the record does not establish any of the above.

The #39 audit found no `independently_verified` capability at the audited snapshot: PR merges,
green CI, empty approvals and self-reviews were not counted (matrix §7). The later #50/#52/#55/#56
merges add implementation/test evidence, not independent verification. CORE-000 inherits the
finding and must not upgrade any claim.

### 2.6 Claim lifecycle

```text
proposed ──accept──▶ accepted ──implement──▶ implemented ──test──▶ tested
    │                   │                         │                 │
    └──defer/unresolve──┘                         └──change/stale───┘
                                                          │
                                                          ▼
                                              evidence invalidated; statuses re-checked
                                                          │
                                          independent verification (external record)
                                                          ▼
                                              independently_verified
```

Rules:

1. A status changes only with a linked record. A code merge does not set `implemented`; the code
   path does. A test file does not set `tested`; the recorded run does. A review does not set
   `independently_verified`; a recorded independent verification does.
2. A change to the code, schema, source document or evidence locator can invalidate evidence
   without changing the claim text. The build can detect some invalidations (a quote no longer
   resolves, a relation target disappears); it cannot detect that a test no longer covers the
   claim, or that a code path moved. That requires the external check (§8.2).
3. A stale claim is not deleted. It is marked stale, its status is downgraded where the evidence
   no longer supports it, and a superseding claim is linked.
4. The artifact is a rendering of the register, not the register. Editing the Markdown does not
   change a claim.

The diagram above is the lifecycle of a **requirement**. An `implementation_fact` starts at
`implemented`; a `proposal` may stay at `proposed`; a `deferred` item may never reach `implemented`.
The point is that each transition needs its own record, not that every claim must traverse every
stage.

### 2.7 What the engine can and cannot establish about CORE-000

| Check | Established by | What it establishes | What it cannot establish |
|---|---|---|---|
| Document and entity schemas | Generic core (`schema.ts`) | the self-description has the declared shape | that the content is true |
| Identity and reference integrity | Generic core (`ir.ts`, `relations.ts`) | IDs are unique; relations resolve to declared endpoints | that the relation is appropriate or complete |
| Provenance binding and quote resolution | Generic core binding + markdown adapter + profile hook | a quoted passage exists inside the declared locator | that the quote is representative or that the claim follows from it |
| CORE-000 policy checks | CORE-000 profile hook | claim/evidence/decision consistency as coded in the hook | that the hook is correct, complete, or independent |
| Artifact determinism | Engine renderer + `check` | same inputs and extensions produce the same bytes in the tested environment | cross-platform byte equality, or correctness of the bytes |
| Build identity | Engine `identity.ts` | a declared-input fingerprint and extension list | correctness, security, hermeticity or trustworthiness |
| Test evidence | `bun test` at a revision | the listed tests passed there | that they cover every claim, or that the engine is correct |
| Independent verification | External verifier/human | a distinct actor checked a specific claim with a recorded method | certification, legal effect, or truth beyond the recorded scope |
| Semantic/normative truth | A human authority | a human judged the meaning | anything the human did not review |

The engine is never the sole authority for declaring its own implementation conformant. §8 makes
that boundary operational.

---

## 3. Boundary and responsibility split

### 3.1 Public contract versus private implementation

CORE-000 describes what a consumer, profile author, adapter/renderer author or reviewer can rely
on. It does not describe private module structure. The distinction is:

| Public (subject of claims) | Private (evidence only) |
|---|---|
| Project manifest and declared inputs | current file layout under `spec/lib/` |
| Profile declaration, schemas, kinds, relations, provenance mappings | helper functions, internal call order, line numbers |
| Generic IR envelope and its guarantees | internal data structures not exposed by the public API |
| Diagnostic record and catalog semantics | current localized message strings and the mapping to future namespaced codes |
| Build result and build identity | how the digest is framed internally (evidence in `build-identity.md`) |
| Adapter/renderer/profile-hook interfaces | which module imports which other module |
| CLI surface | argument-parser implementation |
| Lifecycle phases and their guarantees | internal phase function names and replaceability |
| Trust boundaries and extension loading | exact `import()` call site (evidence) |

A private detail may appear in an evidence locator for a public claim. It does not become a claim
of its own. This keeps CORE-000 stable when the implementation is refactored.

### 3.2 Responsibility split

| Layer | Owns | Does not own |
|---|---|---|
| Generic core | loading, schema validation, identity/indexing, relation resolution, provenance binding shape, catalog resolution, renderer registry and artifact normalization, path containment, build orchestration, build identity | domain semantics, CORE-000 policy, claim truth, independent verification |
| CORE-000 profile | kinds, schemas, relations, vocabularies, provenance mappings, policy checks, diagnostic catalog, view/renderer/template | project content, generic invariants, verification independence |
| CORE-000 project | claim/evidence/decision data, source declarations, outputs, declared extensions | engine behaviour, policy implementation |
| Consumer harness | invoking the public entry point and registering the profile renderer | engine behaviour, claim truth |
| External verifier / human reviewer | independent verification, security/normative judgment, acceptance decisions | engine implementation, self-certification |
| CI | running the declared commands and recording results | independent verification, semantic judgment |

This split is the basis of acceptance criteria A6 and C10. A check belongs to exactly one layer;
if it needs two, it is two checks with two records.

### 3.3 Checks by layer

| Layer | Example check | Failure mode if confused with another layer |
|---|---|---|
| Generic core | relation target does not exist (`ERR_UNKNOWN_REF`) | treating a data error as a policy opinion, or vice versa |
| Generic core | a provenance verification claim is malformed or its digest disagrees with the loaded source (`core.provenance.verification`, `stale`) | claiming the core proves quote truth or independence |
| Generic core | an inverse declaration is not reciprocal (`core.profile.invalid`) or `manifest.render` has zero/multiple entries (`core.manifest.invalid`) | treating a profile/manifest contract error as project data |
| CORE-000 profile | a claim marked `implemented` has no code/test evidence (`core000.claim.implemented-without-evidence`) | claiming the engine proves the implementation |
| CORE-000 profile | a trust claim contradicts the merged consent policy (`core000.claim.policy-mismatch`) | publishing a description that does not match the completed #35/PR #50 outcome |
| Implementation behaviour | `bun test` / a fixture run at a revision | counting a test run as independent verification |
| Independent verification | a reviewer re-runs a sample and records per-claim independent-verification results | taking a merge, green CI or a provenance `verified` record as independent verification |
| Normative authority | maintainer accepts/rejects a requirement or an independent-verification record | letting the engine decide its own conformance |

### 3.4 What CORE-000 adds beyond the implementation-status matrix

The matrix answers "what is the status of each engine capability at a snapshot?". CORE-000 adds:

- a model for the engine's own contract, so the statement is machine-readable and buildable;
- stable claim IDs with class/status/evidence/method, not only row numbers;
- a self-validation experiment and its explicit limits;
- an operational independent-verification path for claims the engine cannot settle;
- a trust-boundary record reconciled with the merged #35/PR #50 consent policy;
- a gap and decision register that can be reviewed without reading the whole repository.

It does not re-audit the matrix, replace its evidence, or promote a row's verification status.

---

## 4. Claim register

### 4.1 Identifier scheme and rules

Every important CORE-000 claim has a stable ID of the form `C000-<AREA>-<NNN>`:

| Area | Scope |
|---|---|
| `SC` | scope, purpose, normative status |
| `ST` | status vocabulary, register rules |
| `CT` | public-contract requirements and guarantees |
| `IM` | implementation facts at the current-main reconciliation |
| `TR` | trust boundary and executable-profile policy |
| `EV` | evidence rules and the verification audit |
| `VF` | independent verification path |
| `SV` | self-validation experiment |
| `GAP` | generic-core gaps and follow-up proposals |
| `LM` | limitations of this design |

Rules:

1. IDs are never reused. A superseded claim keeps its ID and links to its replacement.
2. The ID identifies the claim, not a document section. Moving a claim between sections does not
   change its ID.
3. The register is not the engine's capability inventory. It records the claims CORE-000 makes
   about the engine and about itself; the #39 matrix remains the per-capability audit.
4. A row with `—` in a dimension is not an omission: it states that no supported claim exists.
5. The evidence column is a pointer, not the evidence. The linked file, test, command or record is
   authoritative.
6. Before this design is accepted, a reconciliation may rewrite a claim row in place when its
   subject is unchanged and the rewrite is recorded in the PR. The #35/#36/#37/#38 update uses
   that once. After acceptance, rule 1 applies without exception.

**Register legend.**

- `M:P1` — a row of [`implementation-status.md`](implementation-status.md) §3.
- `C:§8.1` — a section of [`engine-public-contract.md`](engine-public-contract.md).
- `P:§11` — a section of [`m1-implementation-plan.md`](m1-implementation-plan.md).
- `BI` — [`build-identity.md`](build-identity.md).
- `#47`, `#35`, `#39` — GitHub issues/PRs.
- Paths and test files are repository-relative at current main `260de89`.
- `L:` — the local run recorded in §0.2.
- `—` — no supported claim for that dimension.

### 4.2 Register

#### 4.2.1 Scope, normative status and register rules

| ID | Claim | Class | Decision | Impl. | Tests | Indep. | Evidence / method |
|---|---|---|---|---|---|---|---|
| C000-SC-001 | CORE-000 is a working project identifier, not an adopted UIA standard and not a source of normative authority by itself. | constraint | accepted | — | — | — | #47 naming note; §1.4 |
| C000-SC-002 | CORE-000 describes the engine's public contract — components, interfaces, lifecycle, guarantees, constraints, dependencies, extensions, diagnostics, identity, trust, decisions, provenance and evidence — not private module structure. | requirement | accepted | — | — | — | #47 §1; C:§1–2; §3.1 |
| C000-SC-003 | CORE-000 is self-described through the existing generic pipeline; the experiment requires no generic-core change. | proposal | proposed | — | — | — | §5, §7; PR #46 (independent example profile); P:§13 |
| C000-SC-004 | A successful self-build or self-validation evidences only the checks actually run; it is not independent verification, certification, or proof of correctness, security, determinism or conformance. | constraint | accepted | — | — | — | task C5; C:§1.1, §6.3; §7.2 |
| C000-SC-005 | This task does not implement CORE-000, change generic-core behaviour, or design the Portable Assurance Package, independent verifier, sandbox or package split. | constraint | accepted | — | — | — | task C1/C14; #47 non-goals; PR scope |
| C000-ST-001 | Only claims with class `requirement`/`constraint`/`guarantee` and decision `accepted` are normative for CORE-000; this design is `proposed`. | constraint | proposed | — | — | — | §1.4 |
| C000-ST-002 | Important claims carry stable IDs, one class, separate status dimensions and a verification/evidence method; low-level details may be covered by evidence instead. | requirement | proposed | — | — | — | §4.1, §4.4 |
| C000-ST-003 | Status reuses the #39 six terms in separate decision/implementation/tests/verification dimensions, with `—` (data `none`) for no supported claim and no seventh status. | requirement | proposed | — | — | — | M:§1–2; §2.3 |
| C000-ST-004 | An implementation fact does not become a normative requirement merely because it exists in the repository. | constraint | accepted | — | — | — | task C7; #47 §2; §2.2 |

#### 4.2.2 Public-contract requirements and guarantees

| ID | Claim | Class | Decision | Impl. | Tests | Indep. | Evidence / method |
|---|---|---|---|---|---|---|---|
| C000-CT-001 | A project has a manifest; `contract-builder.json` is the only fixed file name, and inputs, sources, renderer and outputs are declared in it. | requirement | accepted | implemented | tested | — | M:P1; `spec/lib/manifest.ts`; `tests/manifest.test.ts` |
| C000-CT-002 | Declared inputs are validated by document schemas, then extracted by declared pointers and per-kind schemas; an undeclared kind fails. | requirement | accepted | implemented | tested | — | M:P2,R1; `spec/lib/schema.ts`, `spec/lib/ir.ts`; `tests/manifest.test.ts`, `tests/build.test.ts` |
| C000-CT-003 | Entity identities are non-empty and unique across kinds; declared relation targets resolve; undeclared relation keys fail; an inverse is a reciprocal declaration (same edge set, reversed endpoints, no wildcard inverse) and an inverse declared `one` rejects a second source. | requirement | accepted | implemented | tested | — | M:I3,R3; C:§3.2, §5.2; `spec/lib/relations.ts`, `spec/lib/manifest.ts`; PR #52; `tests/ir.test.ts`, `tests/manifest.test.ts` |
| C000-CT-004 | The profile declares kinds, relations, schemas, provenance mappings and diagnostics; the core names no domain vocabulary. | requirement | accepted | implemented | tested | — | M:R1; `profiles/core001/profile.json`; `tests/genericity.test.ts` |
| C000-CT-005 | A provenance binding carries `{source, ref, quote}`; the source must be declared; an incomplete binding fails; binding is structural and attaches a `not-checked` verification record, never a verified one. | requirement | accepted | implemented | tested | — | M:V1; C:§4; `spec/lib/provenance.ts`; `tests/ir.test.ts`, `tests/provenance.test.ts` |
| C000-CT-006 | The markdown adapter resolves section, table-column and ordered-item locators and reports `found`/`outside`/`unknown-locator`; the profile verifier maps the outcome into a verification record and the core stores it. | requirement | accepted | implemented | tested | — | M:V2,V5; `spec/lib/adapters/markdown.ts`, `spec/lib/provenance.ts`; `tests/build.test.ts`, `tests/provenance.test.ts` |
| C000-CT-024 | Core-enforced quote verification and the accepted `unknown-block` locator outcome are `proposed`, not implemented; `unsupported` exists in the `LocatorResult` type but is not produced by the M1 markdown adapter. | requirement | proposed | — | — | — | M:V3; C:§5.2 step 7, §11; D25; `spec/lib/source.ts` |
| C000-CT-007 | Diagnostics are deterministic and catalog-resolved; an unknown finding code fails the build. | requirement | accepted | implemented | tested | — | M:G1,G3; `spec/lib/hook.ts`, `spec/lib/diagnostics.ts`; `tests/hook.test.ts`, `tests/golden.test.ts` |
| C000-CT-008 | The contract diagnostic shape (severity + disposition + phase + blocking + data) is accepted but deferred to M2; the current record is the legacy shape. | requirement | accepted | — | — | — | M:G2; C:§7, §18; D8/D9/D17 |
| C000-CT-009 | The renderer registry, preloaded templates and UTF-8/LF/one-trailing-newline normalization are implemented; an unknown renderer id fails. | requirement | accepted | implemented | tested | — | M:O1,O2; `spec/lib/render.ts`; `tests/renderer.test.ts` |
| C000-CT-010 | Build identity exposes `projectId`, `engineVersion`, `manifestVersion`, `inputDigest` and the extension list; it is not rendered into the artifact. | requirement | accepted | implemented | tested | — | M:B1; `spec/lib/identity.ts`; `tests/identity.test.ts` |
| C000-CT-011 | `inputDigest` covers the canonical manifest, declared inputs, sources, profile closure and adapter/renderer closures; clock, locale, environment, mtimes and absolute paths are excluded. | guarantee | accepted | implemented | tested | — | M:B2; `spec/lib/identity.ts`; `tests/identity.test.ts`; BI |
| C000-CT-012 | Byte determinism is conditional on the same engine version, `inputDigest` and extension identities, and on every trusted extension honouring its deterministic contract; it is not absolute reproducibility. | guarantee | accepted | implemented | tested | — | C:§8.1, §8.3; BI; `tests/golden.test.ts` |
| C000-CT-013 | Paths are root-contained by default; `external: true` is an explicit trust declaration; outputs never leave the output root. | requirement | accepted | implemented | tested | — | M:P3; C:§5.7; D31; `tests/manifest.test.ts` |
| C000-CT-014 | Extension closures, lockfile authority and the static import scan are implemented; an undeclared or unpinned import fails. | requirement | accepted | implemented | tested | — | M:B3; `spec/lib/identity.ts`; `tests/identity.test.ts`; BI |
| C000-CT-015 | Declarative conformance vectors are stored, validated and linked to their claims; execution is deferred. | requirement | accepted | implemented | tested | — | M:N1,N2; C:§12; `profiles/core001/checks/cases.ts`; `tests/checks.test.ts` |
| C000-CT-016 | The public API (`loadProject`/`validateProject`/`buildProject`/`renderModel`/`checkArtifacts`, `BuildStatus`, phases, exit code 2) is accepted but deferred to M2. | requirement | accepted | — | — | — | M:K2; C:§9; D7/D18 |
| C000-CT-017 | The contract CLI (`validate` / `build` / `check`, `--json` result object) is accepted but deferred. | requirement | accepted | — | — | — | M:K3; C:§10 |
| C000-CT-018 | Multi-source projects are proposed, not implemented or tested; M1 exercises one source. | proposal | proposed | — | — | — | M:A2; C:§5.3; D21; #5 |
| C000-CT-019 | Multiple renderers and multiple artifacts per build are deferred; the `Artifact[]` shape is forward-compatible. | requirement | deferred | — | — | — | M:O3; C:§8, §11; PR #56 |
| C000-CT-020 | Typed `ReviewState` and per-dimension review are proposed/deferred. | proposal | proposed | — | — | — | M:R5; C:§4; D24 |
| C000-CT-021 | Provenance hardening (paragraph locators and a source-byte digest) is accepted but not implemented. | requirement | accepted | — | — | — | M:V4; `provenance-hardening-rfc.md`; #45 |
| C000-CT-022 | Packaging, publication and a declared runtime matrix are proposed/unresolved; nothing is published. | proposal | proposed | — | — | — | M:X1,X2,X4; C:§13, §17; D14/D19/D20/D29 |
| C000-CT-023 | Full self-hosting is deferred; CORE-000 is a bounded step, not the M5 self-hosting program. | requirement | deferred | — | — | — | M:X3; C:§14; D26 |
| C000-CT-025 | M1 supports exactly one `manifest.render` declaration; zero or multiple declarations are rejected with `core.manifest.invalid` before rendering or writing. | requirement | accepted | implemented | tested | — | C:§3.1; PR #56; `spec/lib/manifest.ts`; `tests/manifest.test.ts` |
| C000-CT-026 | Provenance binding and verification are separate data: a not-checked record at binding, an optional profile `verifyProvenance` hook, core validation of status/method/outcome/source digest, and `verified`/`failed`/`unavailable`/`stale` statuses; `verified` is not independent verification. | requirement | accepted | implemented | tested | — | M:V5; C:§4, §5.2 steps 7–8, §6.1; PR #55; `spec/lib/provenance.ts`, `spec/lib/hook.ts`; `tests/provenance.test.ts` |

#### 4.2.3 Implementation facts at the baseline

| ID | Claim | Class | Decision | Impl. | Tests | Indep. | Evidence / method |
|---|---|---|---|---|---|---|---|
| C000-IM-001 | The current build entry point is `runBuild(BuildOptions)`; `package.json` is private and publishes no package surface. | implementation_fact | — | implemented | tested | — | `spec/lib/build.ts:56`; `package.json`; tests call `runBuild` |
| C000-IM-002 | Current diagnostics are `{severity: error / warning / review, code, file, pointer, message}` with no disposition, phase, data or object location. | implementation_fact | — | implemented | tested | — | M:G1; `spec/lib/diagnostics.ts`; `tests/golden.test.ts` |
| C000-IM-003 | Current exit codes are 0 and 1; usage errors exit 1; exit code 2 is not implemented. | implementation_fact | — | implemented | tested | — | `spec/lib/build.ts` result mapping; `spec/build.ts`; M:G2 |
| C000-IM-004 | `profile.view` and `profile.validator` are dynamically imported in-process only after explicit consent; the engine's renderer is consumer-supplied, and the CLI imports the CORE-001 renderer conditionally. | implementation_fact | — | implemented | tested | — | `spec/lib/build.ts` consent gate; `spec/cli-renderers.ts`; `tests/consent.test.ts`, `tests/example-profile.test.ts` |
| C000-IM-005 | Build identity is computed after load/validation, is `null` when the build stops early, and is never rendered. | implementation_fact | — | implemented | tested | — | `spec/lib/build.ts`; `tests/identity.test.ts`; BI |
| C000-IM-006 | The CLI dynamically imports the CORE-001 renderer only with explicit consent, a matching profile `core001`/renderer `core001-markdown` declaration and a valid profile closure; there is no generic profile-selection CLI. | implementation_fact | — | implemented | tested | — | `spec/cli-renderers.ts`; `tests/consent.test.ts` |
| C000-IM-007 | The profile loader requires explicit consent; absent consent fails closed before import; after consent, view/validator run in-process with builder privileges and no sandbox or isolation. | trust_boundary | accepted | implemented | tested | — | M:H5; `spec/lib/build.ts`; `tests/consent.test.ts`; §6.1 |
| C000-IM-008 | `external: true` is a path trust declaration, not an executable-profile opt-in and not isolation. | trust_boundary | accepted | implemented | tested | — | C:§5.7; D31; `tests/manifest.test.ts` |
| C000-IM-009 | The extension closure and static import scan are integrity/accounting guards, not a security boundary. | limitation | accepted | implemented | tested | — | M:B3; BI "Static import scan" |

#### 4.2.4 Executable-profile trust boundary

| ID | Claim | Class | Decision | Impl. | Tests | Indep. | Evidence / method |
|---|---|---|---|---|---|---|---|
| C000-TR-001 | After explicit consent, executable profile code runs in-process with the builder process's privileges; the engine does not sandbox it. | trust_boundary | accepted | implemented | tested | — | C:§3.3, §8.1; D28; PR #50; `spec/lib/build.ts`; `tests/consent.test.ts` |
| C000-TR-002 | Determinism of profile hooks is an author obligation, not an engine guarantee; the engine cannot enforce purity. | assumption | accepted | — | — | — | C:§3.3; D28/D32 |
| C000-TR-003 | Executable profile loading requires explicit caller consent: `BuildOptions.allowExecutableProfile` defaults false; the CLI flag is `--allow-executable-profile`; absent consent fails closed before import with `core.profile.consent-required`; consent is per invocation and is not part of `inputDigest`. | requirement | accepted | implemented | tested | — | M:H5; PR #50; `spec/lib/build.ts`, `spec/build.ts`, `spec/cli-renderers.ts`; `tests/consent.test.ts` |
| C000-TR-004 | Consent permits trusted executable profile code to run in-process with builder privileges; it is not a sandbox, isolation or capability restriction. | limitation | accepted | — | — | — | C:§3.3; PR #50; §6.2 |
| C000-TR-005 | CORE-000 trust-boundary claims are reconciled with the merged #35/PR #50 outcome; a later consent-policy change requires a new reconciliation. | constraint | accepted | — | — | — | task C4; PR #50; §6.4 |
| C000-TR-006 | Loading a profile is a trust decision equivalent to installing a dependency. | assumption | accepted | — | — | — | C:§3.3; D28; PR #50 |

#### 4.2.5 Evidence, verification and independence

| ID | Claim | Class | Decision | Impl. | Tests | Indep. | Evidence / method |
|---|---|---|---|---|---|---|---|
| C000-EV-001 | Test evidence is revision-bound; a passing test is evidence of that run, not of correctness or independence. | constraint | accepted | — | — | — | M:§1, §7; §2.4 |
| C000-EV-002 | Independent verification requires a verifier distinct from the author, access to evidence, a recorded method/scope/result and a per-claim record; a merge, green CI or empty approval does not qualify. | requirement | proposed | — | — | — | M:§7; §8 |
| C000-EV-003 | No independent verification of the engine or CORE-000 exists at the baseline; every independent-verification dimension is `—`. | limitation | accepted | — | — | — | M:§7; §8.5 |
| C000-VF-001 | The engine cannot set `independently_verified`; only an external verification record can support it. | requirement | proposed | — | — | — | §8.1, §8.3 |
| C000-VF-002 | A concrete manual independent-review protocol exists in §8.2 but has not been performed. | proposal | proposed | — | — | — | §8.2 |
| C000-VF-003 | Contract conformance, test-coverage sufficiency, cross-platform determinism, security/trust boundary, independence itself, semantic truth and self-description completeness require external authority. | constraint | proposed | — | — | — | §8.1 |
| C000-VF-004 | An independent-verification record carries `id`, `method`, `verifier`, `independence`, `independence_basis`, `performed`, `result`, `scope`, `revision`, `claim_results` and `limitations`; `commands`, `date` and `record_locator` are conditional per §8.3. It is separate from the core provenance `VerificationRecord`. | requirement | proposed | — | — | — | §5.3, §8.3; C:§4 |

#### 4.2.6 Self-validation experiment

| ID | Claim | Class | Decision | Impl. | Tests | Indep. | Evidence / method |
|---|---|---|---|---|---|---|---|
| C000-SV-001 | The self-validation experiment uses the existing generic pipeline and a consumer harness; it requires no generic-core change. | proposal | proposed | — | — | — | §7.3–7.5; PR #46 |
| C000-SV-002 | The experiment checks schemas, identity, relations, provenance, CORE-000 policy, artifact normalization and build identity, and renders one Markdown artifact. | proposal | proposed | — | — | — | §7.5–7.6 |
| C000-SV-003 | A successful build establishes only structural/relational self-consistency and CORE-000 profile-policy compliance. | constraint | accepted | — | — | — | task C5; C:§1.1, §6.3; §7.2 |
| C000-SV-004 | The negative cases cover at least inconsistent component/interface, unresolved dependency/relation, implemented-without-evidence and unsupported/unverified guarantee, plus identity, relation, provenance and trust cases. | proposal | proposed | — | — | — | §7.8 |
| C000-SV-005 | The experiment cannot establish that the code matches the claims; that requires external evidence and independent review. | limitation | proposed | — | — | — | §7.2, §8 |
| C000-SV-006 | The release build remains blocked while review diagnostics (missing independent verification, unresolved decisions) remain; the consent policy is settled, so it is no longer a blocker. | constraint | proposed | — | — | — | §7.7, §7.10 |

#### 4.2.7 Generic-core gaps (proposals only; no implementation here)

| ID | Claim | Class | Decision | Impl. | Tests | Indep. | Evidence / method |
|---|---|---|---|---|---|---|---|
| C000-GAP-001 | The generic core has no raw-file input/adapter for code/test evidence; evidence files cannot participate in `inputDigest`, so claim/evidence staleness is invisible to the build. | proposal | proposed | — | — | — | §9 G1 |
| C000-GAP-002 | Cross-entity declarative rule primitives are not implemented; CORE-000 policy needs a trusted profile hook. | proposal | proposed | — | — | — | §9 G2; M:R4 |
| C000-GAP-003 | Binding/verification separation is implemented (#37), but locators are coarse, core quote verification is proposed and the accepted V4 hardening is unimplemented. | proposal | proposed | — | — | — | §9 G3; M:V3,V4; PR #55 |
| C000-GAP-004 | The public API/CLI are not generic; the experiment needs a consumer harness, and the CLI only conditionally wires the CORE-001 renderer rather than selecting arbitrary profiles. | proposal | proposed | — | — | — | §9 G4; M:K2,K3; C000-IM-006 |
| C000-GAP-005 | Multi-target rendering/multi-artifact is deferred and #38 now rejects zero or multiple `manifest.render` declarations; a machine-readable JSON claim export is not available in M1. | proposal | proposed | — | — | — | §9 G5; M:O3; PR #56 |
| C000-GAP-006 | Multi-source is untested; CORE-000 uses one source and treats other documents as evidence references. | proposal | proposed | — | — | — | §9 G6; M:A2 |
| C000-GAP-007 | Review dimensions and a typed verification record are not core features; CORE-000 encodes them as data and profile checks. | proposal | proposed | — | — | — | §9 G7; M:R5 |

#### 4.2.8 Limitations of this design

| ID | Claim | Class | Decision | Impl. | Tests | Indep. | Evidence / method |
|---|---|---|---|---|---|---|---|
| C000-LM-001 | This design is not implemented or executed; no CORE-000 artifact, diagnostics or digest exists yet. | limitation | — | — | — | — | §11 |
| C000-LM-002 | Statuses derive from the #39 snapshot at `f1ddcf7` plus its #35/#36/#37 snapshot updates; #38 is cited from the contract and tests; current main is `260de89`, and any later change requires re-audit. | limitation | — | — | — | — | §1.5, §11 |
| C000-LM-003 | Claims are author-asserted data; profile checks enforce evidence presence and consistency, not truth. | limitation | — | — | — | — | §2.7, §11 |
| C000-LM-004 | No independent verification exists; a `release` CORE-000 build cannot claim it. | limitation | — | — | — | — | §8.5 |
| C000-LM-005 | Consent is implemented, but no sandbox, isolation or capability restriction exists; process/WASM isolation remains deferred (D32). | limitation | — | — | — | — | §6, §11 |
| C000-LM-008 | A `verified` provenance record is a method-specific check of a binding, not independent verification or certification. | limitation | — | — | — | — | C:§4, §6.3; §8 |
| C000-LM-006 | The model, schemas and hook rules are proposals and may change during implementation. | limitation | — | — | — | — | §5, §10 |
| C000-LM-007 | No claim is made about cross-platform determinism, security, hermeticity, legal effect or external conformance. | limitation | — | — | — | — | C:§8.3; §11 |

### 4.3 Status summary

Read this summary with the caveats in §2.7 and §4.4: the counts are author-asserted and describe
the register, not the engine's correctness.

| Class | Rows | accepted decision | implemented | tested | independently verified |
|---|---:|---:|---:|---:|---:|
| `requirement` | 28 | 20 | 15 | 15 | 0 |
| `guarantee` | 2 | 2 | 2 | 2 | 0 |
| `assumption` | 2 | 2 | 0 | 0 | 0 |
| `constraint` | 10 | 7 | 0 | 0 | 0 |
| `implementation_fact` | 6 | 0 | 6 | 6 | 0 |
| `trust_boundary` | 3 | 3 | 3 | 3 | 0 |
| `proposal` | 15 | 0 | 0 | 0 | 0 |
| `limitation` | 12 | 3 | 1 | 1 | 0 |
| **Total** | **78** | **37** | **27** | **27** | **0** |

The count is checked with a script over the tables; a later generated artifact must compute it
instead of trusting this number. The important findings are:

- **Zero independently verified rows.** This is the same factual result as matrix §7. The
  provenance `verified` status and a green test run are not counted here.
- Several accepted requirements are not implemented (public API, CLI, provenance hardening,
  diagnostic shape). They are contract promises, not current behaviour.
- Two guarantees are implemented and tested, but only conditionally and only within the tested
  environment.
- The executable-profile trust claims are now accepted/implemented/tested with explicit consent;
  they are not pending. The remaining limitations are no sandbox/isolation, per-module granularity,
  declarative-only buildability and the consumer extension gate.
- Binding versus verification is implemented (#37): a source statement has a binding and a separate
  verification record; neither is independent verification.
- The proposals and gaps are not commitments; they are review material.

### 4.4 Claims not individually identified

Not every fact deserves a stable claim. The following are deliberately not individually
identified, with the reason:

| Not identified | Why | Where the reader can check it |
|---|---|---|
| Private module layout, helper functions and internal call order | Private implementation; changes without changing the public contract. A claim would create false stability. | Code and `docs/architecture/*`; evidence locators from public claims |
| Exact localized diagnostic message strings | Messages may be reworded; codes are the stable surface (C:§7.1). | `profiles/core001/catalog.json`; catalog tests |
| Exact line numbers and file hashes | They change on every edit; the baseline SHA and evidence locator carry the revision. | The recorded revision in each evidence record |
| Every test assertion | Test details are evidence for a capability claim, not separate public claims. | Test files and recorded runs |
| The internal framing of `inputDigest` | The public guarantee is the identity and its declared coverage; the byte framing is documented in `build-identity.md`. | BI; `tests/identity.test.ts` |
| The full diagnostic and phase inventory | The matrix lists capability areas; CORE-000 claims the model and the major surfaces, not every code. | `implementation-status.md` §3; catalog |
| Future proposals and their schedules | Proposals are recorded as proposals, not as claims about current behaviour; scheduling belongs to separate issues. | §9, §10, linked issues |
| The exact contents of the rendered artifact | The renderer is a projection of the model; the model is the source of truth. | The future CORE-000 renderer/template |

This is the "explicit reason for not having an identifier" that #47 requires. The rule is: if a
statement can change without changing a public promise, it does not need its own stable claim; it
can be an evidence locator or a rendered detail.

---

## 5. Proposed CORE-000 model and profile boundary

### 5.1 Design goals and constraints

The model must:

- represent the concepts required by #47 and C8 without CORE-001 vocabulary;
- be expressible through the **implemented** generic pipeline, not only the future contract
  (`manifest` → declared inputs → document/entity schemas → IR → relations → provenance →
  profile hook → renderer → identity);
- keep structural validation in the generic core and CORE-000 policy in the profile;
- give every important claim a stable ID and an evidence/verification method;
- keep test evidence and independent verification structurally distinct;
- represent the merged consent boundary as settled and fail-closed without implying isolation;
- avoid a hidden normative language, a new core mechanism, or a new package.

The model does not need to describe private implementation structure, every diagnostic message,
or every test assertion. Those are evidence locators (§4.4).

### 5.2 Entity kinds and why the set is shaped this way

CORE-000 proposes **14 kinds**. The list is not a one-to-one mapping of #47's bullet list: several
bullets share one kind, and one bullet is split into two.

| Kind | Represents | Why a separate kind |
|---|---|---|
| `component` | A public responsibility unit: core, profile, project, adapter, renderer, CLI, external reviewer | Components have an identity, a responsibility and relations to interfaces; they are not claims. |
| `interface` | A public surface: manifest, project model, diagnostic, build result, build identity, adapter, renderer, profile hook, CLI, conformance | Interfaces have a surface type and stability; they are the targets of component/extension relations. |
| `phase` | A lifecycle phase and its guarantee / non-guarantee | Phases have distinct guarantees and participate in transitions. |
| `transition` | A permitted phase transition and its condition | A transition is a relation with its own identity and condition; storing it as a pair of phase fields would hide the validation. |
| `source_statement` | A verbatim passage from the accepted contract with a locator | It is the only provenance-bearing kind. Keeping quotes separate from claims lets implementation facts cite evidence without forcing a quote. |
| `claim` | An atomic statement with a class, status dimensions and a verification method | The central epistemic unit. One kind with a `class` field avoids ten nearly identical schemas. |
| `evidence` | An observation: code, test, CI, source, review, analysis or build | Evidence has a locator, revision, producer and independence; it is not a claim. |
| `independent_verification` | An external review of a claim, by an actor, with a method, independence basis and result | Kept separate from evidence and from the core provenance `VerificationRecord`, so a binding check or a test existence cannot be read as independent verification. |
| `decision` | A maintainer decision with status, owner, source and consequence | Decisions can affect many claims and can be accepted, proposed, deferred or unresolved; they are not claims about the engine. |
| `trust_boundary` | A statement about trusted code, privilege and enforcement | It has inside/outside/enforcement and a policy dependency; CORE-000's executable-profile boundary is settled with explicit consent and no isolation. |
| `dependency` | A runtime, toolchain, pipeline, decision or product dependency | Dependencies have versions, statuses and consequences; they can block a claim or a component. |
| `extension_point` | A place where trusted code enters: profile view/validator/renderer, adapter, renderer registry | It has a loading mechanism and a trust class, and it exposes an interface. |
| `diagnostic` | A catalog entry: code, severity, phase, message, status | Diagnostic codes are a stable public surface; the catalog is not a free-text claim. |
| `conformance_case` | A planned positive or negative case with an input and expected result | Cases are conformance plans, not evidence that a case ran. |

**Why not one `claim` kind for everything?** Components, interfaces, phases, transitions,
decisions and diagnostics have distinct required fields and typed endpoints. Putting them in one
kind would make most fields optional and move all validation into the profile hook, weakening the
generic core's structural checks. It would also make the artifact harder to review.

**Why not one kind per #47 bullet?** Guarantees, assumptions, constraints, non-goals and
limitations share the same status/evidence/lifecycle model and differ only in class-specific
fields. Ten kinds would duplicate their relations and policy checks (§5.7). The `claim` kind plus
a closed `class` enum and class-specific hook checks is the smaller model.

**Why not mirror CORE-001 kinds?** `fragment`, `term`, `provision`, `decision`, `case`, `slice`
are CORE-001 domain vocabulary. Using them would make CORE-000 look like a CORE-001 project and
would violate A3 and the core/profile separation. The only overlap is `decision`, which is a
generic concept here and was already generic in the CORE-001 profile; the CORE-000 `decision`
schema is different.

### 5.3 Fields per kind

All entities use the generic envelope. `fields` below means the profile data inside that
envelope; the reserved names (`id`, `kind`, `type`, `provenance`, `relations`, `review`) are
handled by the core and are not repeated in every row.

| Kind | Required fields | Optional fields | Notes |
|---|---|---|---|
| `component` | `id`, `name`, `responsibility`, `boundary` (`engine`/`profile`/`project`/`consumer`/`external`), `public` | `description` | `public: false` marks an internal responsibility that is not a contract surface. |
| `interface` | `id`, `name`, `surface` (`api`/`data`/`cli`/`file`/`protocol`), `stability` (`accepted`/`proposed`/`deferred`/`experimental`), `description` | `owner` (component id), `contract_section` | `owner` is cross-checked against `component.provides` (§5.7). |
| `phase` | `id`, `name`, `guarantee`, `not_guaranteed` | `public` | One pair of guarantee / non-guarantee strings; the transition graph is separate. |
| `transition` | `id`, `condition`, `description` | — | `startsAt` / `endsAt` relations carry the phase endpoints. |
| `source_statement` | `id`, `source`, `source_ref`, `source_quote` | `note` | The only kind with a provenance mapping. `source_quote` is verbatim; the core attaches a separate `Entity.verification` record, which is not an input field. |
| `claim` | `id`, `author`, `statement`, `class`, `status`, `verification_method`, `scope`, `authority`, `lifecycle`, `subject_kind` | `conditions`, `consequence`, `baseline`, `notes` | `status` is an object (§5.3.1); `subject_kind` is checked against the `subject` relation; `author` is the account/role that authored the claim or the change it describes. |
| `evidence` | `id`, `kind`, `locator`, `revision`, `description` | `producer`, `independence`, `availability`, `digest`, `quote` | `kind` is `code`/`test`/`ci`/`source`/`review`/`analysis`/`build`; §2.4. `quote` is optional source text for a `source` evidence; it is not a core provenance binding. |
| `independent_verification` | `id`, `method`, `verifier`, `independence`, `independence_basis`, `performed`, `result`, `scope`, `revision`, `claim_results`, `limitations` | `commands` (required for `command_run`/`external_harness`), `date` (required when `performed: true`), `record_locator` (required when `performed: true` and `result` is not `not_run`), `signature` | `method` is `manual_review`/`external_harness`/`cross_implementation`/`command_run`; `result` is `confirmed`/`refuted`/`inconclusive`/`not_run`; `claim_results` is one entry per covered claim. §8.3 is the canonical contract. It is not the core provenance `VerificationRecord`. |
| `decision` | `id`, `title`, `status`, `owner`, `source`, `consequence` | `date` | `status` is `accepted`/`proposed`/`deferred`/`unresolved`/`superseded`. |
| `trust_boundary` | `id`, `name`, `inside`, `outside`, `enforcement`, `statement`, `policy_status`, `policy_ref` | `limitations` | `enforcement` is `none`/`declared_trust`/`explicit_consent`/`isolation_deferred`; `policy_status` is `settled`/`pending`/`not_applicable`. CORE-000's executable-profile boundary is `explicit_consent`/`settled`. |
| `dependency` | `id`, `name`, `kind`, `status` | `version`, `consequence` | `kind` is `runtime`/`toolchain`/`pipeline`/`decision`/`product`; `status` is `declared`/`resolved`/`pending`/`deferred`/`not_applicable`. |
| `extension_point` | `id`, `name`, `mechanism`, `trust`, `status` | `description` | `mechanism` is `dynamic_import`/`consumer_registry`/`static_import`; `trust` is `trusted_in_process`/`trusted_consumer_supplied`. |
| `diagnostic` | `id`, `code`, `severity`, `phase`, `message`, `status` | `disposition`, `blocking` | `severity` follows M1 (`error`/`warning`/`review`); `disposition` and `blocking` are the contract shape where known. |
| `conformance_case` | `id`, `kind`, `input`, `expected`, `status` | `notes` | `kind` is `positive`/`negative`; `status` is `planned`/`implemented`/`verified`. |

#### 5.3.1 Claim status and enums

```yaml
claim:
  id: C000-...
  author: "<login or role>"
  class: requirement | guarantee | assumption | constraint | implementation_fact |
         proposal | deferred | limitation | non_goal | trust_boundary
  status:
    decision: accepted | proposed | deferred | none
    implementation: implemented | none
    tests: tested | none
    verification: independently_verified | none
  authority: engine | external | human
  lifecycle: active | superseded | retired
  verification_method: "<command, review method or record locator>"
  scope: "<what the claim covers>"
  subject_kind: component | interface | phase | transition | trust_boundary |
                extension_point | diagnostic | dependency |
                claim | decision | evidence | source_statement
```

A meta-claim uses the kind of the entity it is about: `claim` for a specific claim or set of
claims, `decision` for a decision, `evidence` for an evidence row and `source_statement` for a
source statement. This is an "about" edge; it is not an `appliesTo`/scope relation. All subjects of
one claim share the kind. A claim that needs two kinds is split into two claims linked by
`dependsOn` in future registers; in a fixed register that does not add claim IDs such a claim is
ungroundable and requires an owner ruling rather than a new claim ID. A `claim` subject may be
self-referential when the rule applies to its own class, and the data lists the self-edge
explicitly.

`authority` names the authority required to establish the claim, not the author:

- `engine` — a structural/relational check the generic core can perform.
- `external` — a behavior/conformance/security check outside the engine, even if automated.
- `human` — semantic, normative or acceptance judgment.

A claim whose `authority` is `external` or `human` cannot become
`verification: independently_verified` from an engine run. The profile hook checks the presence of
a record; a person checks its truth.

An awaiting-decision claim has `status.decision: none` and `relations.decidedBy: [D-OPEN]`, where
`D-OPEN.status` is `unresolved`; a `proposal` may also link `D-OPEN` when the proposal is awaiting
a decision outcome. A deferred claim has `decision: deferred` and links a decision with
`status: deferred`. The states are not interchangeable. A claim with `decision: accepted` links
exactly one `decidedBy` decision entity with `status: accepted`; a proposal linked to an accepted
decision is a mismatch. Task-level constraints (C1–C15) are represented as decision entities with the
task/issue as their source, so the policy check is satisfiable without treating this document as
the decision. A `decision: none` claim may have no `decidedBy` relation, or one unresolved
decision when it is awaiting an outcome.

### 5.4 Relations

The model declares **29 relation declarations**: 12 reciprocal pairs (24 declarations) plus five
declarations without an inverse (`startsAt`, `endsAt`, `subject`, `raisedIn`, `hasPrerequisite`).
The inverse is not an unvalidated hint: under the merged #36 contract, each inverse is itself a
declared relation from the forward declaration's `to` kind, points back at the forward relation and
reverses the endpoints; a forward relation whose `to` is `*` cannot declare an inverse. The table
lists both halves so the proposed profile passes the reciprocal-declaration check.

| # | Relation | From → To | Cardinality | Inverse | Purpose |
|---|---|---|---|---|---|
| 1 | `provides` | component → interface | many | `providedBy` | A component exposes an interface. |
| 2 | `providedBy` | interface → component | many | `provides` | Reciprocal half of `provides`. |
| 3 | `requires` | component → dependency | many | `requiredBy` | A component depends on a runtime/toolchain/decision. |
| 4 | `requiredBy` | dependency → component | many | `requires` | Reciprocal half of `requires`. |
| 5 | `startsAt` | transition → phase | one | — | The phase a transition leaves. |
| 6 | `endsAt` | transition → phase | one | — | The phase a transition enters. |
| 7 | `subject` | claim → `*` | many | — | The surface or concept the claim is about (a structural surface, claim, decision, evidence row or source statement); `subject_kind` restricts the allowed target kind. |
| 8 | `cites` | claim → source_statement | many | `citedBy` | The claim restates or relies on a quoted contract passage. |
| 9 | `citedBy` | source_statement → claim | many | `cites` | Reciprocal half of `cites`. |
| 10 | `evidencedBy` | claim → evidence | many | `supports` | Evidence for the claim. |
| 11 | `supports` | evidence → claim | many | `evidencedBy` | Reciprocal half of `evidencedBy`. |
| 12 | `decidedBy` | claim → decision | many | `decides` | The decision that accepts, defers or resolves the claim. |
| 13 | `decides` | decision → claim | many | `decidedBy` | Reciprocal half of `decidedBy`. |
| 14 | `dependsOn` | claim → claim | many | `dependedOnBy` | A claim that must hold for this one to hold. |
| 15 | `dependedOnBy` | claim → claim | many | `dependsOn` | Reciprocal half of `dependsOn`. |
| 16 | `verifies` | independent_verification → claim | many | `verifiedBy` | An independent review record covers a claim. |
| 17 | `verifiedBy` | claim → independent_verification | many | `verifies` | Reciprocal half of `verifies`. |
| 18 | `covers` | conformance_case → claim | many | `coveredBy` | A case is intended to exercise a claim. |
| 19 | `coveredBy` | claim → conformance_case | many | `covers` | Reciprocal half of `covers`. |
| 20 | `concerns` | trust_boundary → extension_point | many | `guardedBy` | The extension point a trust boundary is about. |
| 21 | `guardedBy` | extension_point → trust_boundary | many | `concerns` | Reciprocal half of `concerns`. |
| 22 | `exposes` | extension_point → interface | many | `exposedBy` | The interface the extension point loads through. |
| 23 | `exposedBy` | interface → extension_point | many | `exposes` | Reciprocal half of `exposes`. |
| 24 | `loadedBy` | extension_point → component | one | `loads` | The component that loads the extension. |
| 25 | `loads` | component → extension_point | many | `loadedBy` | Reciprocal half of `loadedBy`. |
| 26 | `supersedes` | claim → claim | many | `supersededBy` | A replacement claim; the old ID stays. |
| 27 | `supersededBy` | claim → claim | many | `supersedes` | Reciprocal half of `supersedes`. |
| 28 | `raisedIn` | diagnostic → phase | one | — | The phase that emits the diagnostic. |
| 29 | `hasPrerequisite` | phase → phase | many | — | The prerequisite phase of a dependent phase; carries the contract §6.2 dependency edges (owner-approved Q1 relation, 2026-11-03). |

**Why the inverse is a full declaration.** A one-sided `inverse` hint is exactly the shape #36
removed: the resolver could synthesize a relation the profile never declared. Declaring both
halves gives the core a reciprocal contract to validate before resolution, and it keeps the
inverse visible in the same relation index that consumers and the artifact use. The cost is a
larger relation table, not a new mechanism.

**Why `subject` is a wildcard.** A closed set of seven typed `aboutX` relations would duplicate
the same cardinality and inverse behaviour. The generic core verifies that the target resolves;
the CORE-000 hook verifies the target kind against `subject_kind` and that the claim has at least
one subject. This is a deliberate split: existence is generic, allowed subject kind is policy.
The alternative, `subject` typed to a single kind, cannot express claims about phases, trust
boundaries and diagnostics without seven relations.

The concept may be a structural surface or a claim, decision, evidence row or source statement.
`subject` records what the claim is about, not which records it governs: a register-wide rule that
"applies to" many claims is not thereby "about" each of them, and a separate `appliesTo`/scope
relation is not part of this model (future research). Where a register-wide rule needs a single
subject rather than a set, the profile uses a documented structural subject and records it as a
proxy; it does not claim that the structural component is the register.

**Why `subject_kind` is singular.** All subjects of one claim share a kind, so the hook can check
them against one value. A claim that needs to point at two different kinds is split into two
claims linked by `dependsOn`, or modelled with a structural relation. This keeps the hook check
simple and the artifact grouping clear. The alternative — an array of subject kinds — would make
the check positional and easier to get wrong. In a fixed register that does not add claim IDs, the
split rule cannot be applied: a claim needing two kinds is ungroundable and returns for an owner
ruling rather than a new claim ID; the split rule remains correct for future registers.

**Why relations are declared rather than inferred.** The core never guesses a relation from a
field name (C:§3.2). Every relation above is declared in `profile.json`; data that puts a key in
`relations` without a declaration fails with `core.relation.unknown`.

### 5.5 Provenance representation

The merged #37 contract splits **binding** from **verification**. CORE-000 follows that split
rather than inventing a second one.

- `source_statement` is the binding-bearing kind. Its `source`, `source_ref` and `source_quote`
  fields are mapped to `ProvenanceBinding` by
  `{"kind":"source_statement","source":"source","ref":"source_ref","quote":"source_quote"}`.
- The generic core binds the three values, requires a declared source, fails on an incomplete
  binding (`core.provenance.incomplete`), and attaches an `unavailable`/`not-checked`
  `ProvenanceVerification` record. A binding never becomes `verified` by itself (V1, V5).
- The CORE-000 `validator` module may export `verifyProvenance(model, ctx)`. It receives the
  loaded sources, `verifyQuote`, `sourceDigest` and `sourceVersion`; it returns one claim per
  source statement with `status`, `verifier`, `method`, `checkedAt`, `sourceVersion`,
  `sourceDigest` and `outcome`. The core validates the claim against the entity's binding and the
  digest of the loaded source bytes and stores the result in `Entity.verification` (C:§4,
  §5.2 step 8). A malformed or contradictory claim is `core.provenance.verification`.
- Statuses are `verified`, `failed`, `unavailable` and `stale`. `verified` means only that the
  declared method found the quote at the declared locator for the source bytes identified by
  `sourceDigest`; it is not independent verification, not a cryptographic proof and not a
  statement about normative meaning. A checked status requires a verifier, a method other than
  `"none"` and an outcome other than `"not-checked"`. `checkedAt` may be `null` because a
  deterministic build has no trusted clock.
- The profile's `validate` checks must read the stored `Entity.verification` record rather than
  calling the adapter a second time. One binding has one verification result. CORE-001 maps a
  missing, unavailable or stale result to `ERR_PROVENANCE_NOT_VERIFIED`.
- A `claim` does **not** carry a provenance mapping. Implementation facts, proposals and
  limitations often have no contract quote; forcing a mandatory quote on every claim would
  either fabricate provenance or exclude those claims. Instead, a claim optionally `cites` one or
  more `source_statement` entities, and/or is `evidencedBy` code/test/CI evidence.
- An `evidence` of kind `source` may carry a `quote` and a `locator` (and an optional `digest`).
  It is a citation, not a core provenance binding; the external reviewer checks it. This is a
  limitation until the provenance-hardening work (§9 G3) is implemented.
- Only **one source document** is used in the self-validation experiment: the accepted contract.
  Other documents (the matrix, the M1 plan, `build-identity.md`, this design) are evidence
  references, not provenance sources, because multi-source is untested (M:A2; §9 G6). The source
  is declared with `external: true` and pinned revision; `sourceDigest` records the bytes a
  verification covered, but the accepted declared `identity.sha256` pin (V4) is not implemented,
  so the build cannot assert that a source has not changed across runs.
- `source_statement` locators use the current markdown adapter grammar
  (`#<section>`, `#<section>/table/<column>`, `#<section>/<item>`). Paragraph locators
  (`#<section>/p<n>`) are accepted for the future (V4) but are **not** used in the first
  experiment. This keeps the plan executable today and states the precision limit honestly.

### 5.6 Evidence and verification representation

Evidence is a graph, not a status string:

```yaml
claims:
  - id: C000-CT-010
    author: "it-start"
    class: requirement
    statement: "Build identity exposes projectId, engineVersion, manifestVersion, inputDigest and the extensions list."
    status: {decision: accepted, implementation: implemented, tests: tested, verification: none}
    authority: engine
    lifecycle: active
    verification_method: "bun test tests/identity.test.ts"
    scope: "BuildResult.identity at current main 260de89"
    subject_kind: interface
    relations:
      subject: [IF-BUILD-IDENTITY]
      cites: [SRC-CT-010]
      evidencedBy: [EV-IDENTITY-CODE, EV-IDENTITY-TEST]
      decidedBy: [D10]
```

An independent-verification record is separate from the core provenance `VerificationRecord`:

```yaml
independentVerifications:
  - id: VF-0001
    method: manual_review
    verifier: "<login>"
    independence: independent
    independence_basis: "Did not author the change; read the code and ran the commands at the pinned revision."
    performed: true
    result: confirmed
    scope: "C000-CT-010 and C000-CT-011 at 260de89"
    revision: "260de89 (inputDigest sha256:...)"
    claim_results:
      - {claim: C000-CT-010, result: confirmed, evidence: "spec/lib/identity.ts; tests/identity.test.ts"}
      - {claim: C000-CT-011, result: confirmed, evidence: "spec/lib/identity.ts; tests/identity.test.ts"}
    limitations: "Sample scope; no cross-platform determinism check."
    commands: ["bun test tests/identity.test.ts", "bun run check"]
    date: "2026-11-02"
    record_locator: "verification/2026-11-02/core000-ct010.md"
```

The record must live outside the engine-generated artifact (for example `verification/` at the
repository root, or an external URL). The CORE-000 build may check that the path is not under
`contracts/core000/` and that the fields are present; it cannot check that the person actually
did the work. That is the role of the maintainer who accepts the record (§8.3).

The core-owned `Entity.verification` is a different record: it is attached by binding and
replaced by the profile `verifyProvenance` result (V1, V5). It is not an input entity and it is
not an independent review. The `independent_verification` kind exists only for the external
review path; its `independence` and `independence_basis` fields are what make it usable for the
claim status `verification: independently_verified`.

### 5.7 Profile boundary and policy checks

**Generic core (unchanged by CORE-000):** schema validation, identity/indexing, reciprocal
relation validation and resolution, provenance binding shape, provenance verification record
validation and storage, diagnostic catalog resolution, single render-declaration validation,
renderer registry and artifact normalization, path containment, build orchestration,
`inputDigest`.

**CORE-000 profile (new, proposed):** the 14 kinds and their schemas, the 29 relation declarations
(12 reciprocal pairs plus five without an inverse), the source_statement provenance mapping and
`verifyProvenance` claims, the
claim/evidence/decision vocabulary and the policy checks below, the diagnostic catalog, the view
and the renderer/template.

**CORE-000 project (new, proposed):** the actual components, interfaces, phases, claims, evidence,
decisions, trust boundaries, gaps, cases and independent-verification records. The project is
data; changing a claim is a project change, not a core change.

**Policy checks** are profile checks because they are cross-entity and CORE-000-specific. They run
in the profile validator hook, resolve through the profile catalog, and never become generic-core
rules. The hook is trusted in-process code; it does not perform I/O, does not read the clock, and
does not depend on the environment (author obligation, C:§3.3; the engine cannot enforce it). The
provenance verifier is a separate optional export on the same profile module; it may call the
adapter through `ctx.verifyQuote`, and the core stores and validates its result.

| Check code | Severity | Rule | Why it is profile policy |
|---|---|---|---|
| `core000.claim.missing-subject` | `error` | Every claim has at least one `subject`. | The allowed subject kinds are CORE-000 vocabulary. |
| `core000.claim.subject-kind-mismatch` | `error` | `subject` targets match `subject_kind` and are one of the allowed kinds. | The core only checks target existence. |
| `core000.claim.invalid-status` | `error` | Status values are in the §5.3.1 enums. | The status vocabulary is a CORE-000 decision. |
| `core000.claim.implemented-without-evidence` | `error` | `implementation: implemented` requires at least one `code`, `test` or `ci` evidence. | "Implemented" is a claim about code, not a schema fact. |
| `core000.claim.tested-without-test` | `error` | `tests: tested` requires `test`/`ci` evidence and a non-empty command in `verification_method`. | Test coverage is policy, not structure. |
| `core000.claim.unsupported-guarantee` | `error` | A `guarantee` has `conditions`, `scope`, a verification method and at least one `cites` or `evidencedBy`. | A guarantee without conditions/evidence is an assertion, not a guarantee. |
| `core000.claim.decision-required` | `error` | The claim `decision` and its `decidedBy` relation agree: `accepted` requires exactly one accepted decision; `deferred` requires exactly one deferred decision; `proposed` requires no decision, one proposed decision, or one unresolved decision (proposal awaiting decision); `none` requires no decision or one unresolved decision. | The decision model is CORE-000 policy. |
| `core000.claim.policy-mismatch` | `error` | A claim whose subject includes `TB-PROFILE-EXEC` must match the settled consent policy: no claim may describe consent as pending, absent, fail-open or a sandbox. | The merged #35/PR #50 outcome is a completed fact, not a design choice. |
| `core000.claim.status-class-conflict` | `error` | `non_goal`/`deferred` cannot be implemented or tested; `proposal` cannot be implemented; a `limitation` cannot carry `decision: accepted` unless it restates an accepted limitation. | Prevents class/status contradictions. |
| `core000.claim.verification-not-independent` | `error` | `verification: independently_verified` requires an `independent_verification` entity with `independence: independent`, `performed: true`, `result: confirmed`, a `claim_results` entry confirming the claim, and a `record_locator` outside `contracts/core000/`. | Independence is not an engine status, and it is not the provenance verification record. |
| `core000.independent-verification.incomplete` | `error` | The record has every required field from §8.3: `id`, `method`, `verifier`, `independence`, `independence_basis`, `performed`, `result`, `scope`, `revision`, `claim_results`, `limitations`; `commands` for `command_run`/`external_harness`; `date` when performed; a per-claim result for every covered claim. | The canonical record contract must be one contract, not competing definitions. |
| `core000.independent-verification.self` | `error` | An `independent_verification` whose `verifier` equals the `author` of a claim it covers is not independent. | The hook can only check the recorded values; a human checks the truth. |
| `core000.independent-verification.record-missing` | `error` | A performed independent verification with a result other than `not_run` has a non-empty, external `record_locator`. | A claim of verification without a record is unsupported. |
| `core000.independent-verification.missing` | `review` | An active claim whose `authority` is `external` or `human` has no independent verification record. | Makes the absence visible and blocks release; it is not an error in the self-description. |
| `core000.model.interface-owner-mismatch` | `error` | An interface's `owner` names a component that does not `provide` it. | The core checks that the component exists; the profile checks the agreement. |
| `core000.evidence.locator` | `error` | Evidence locator is non-empty and has a path/URL/command form; revision is non-empty. | Evidence must be locatable. |
| `core000.evidence.orphan` | `warning` | Every evidence record supports at least one claim. | Unused evidence is not a defect, but it should be visible. |
| `core000.surface.claim-missing` | `warning` | Every public component/interface has at least one claim. | The model should describe its public surfaces. |
| `core000.source.verification-missing` | `error` | Every `source_statement` has a stored `Entity.verification` record that is not `unavailable`/`not-checked`. | Binding alone is not evidence; the profile verifier must run. |
| `core000.source.verification-failed` | `error` | A `source_statement` with `verification.status: failed` or `stale` is an error for a contract claim. | A failed or stale quote check must not be rendered as verified. |
| `core000.source.verification-unavailable` | `error` | A `source_statement` with `verification.status: unavailable` is an error for a contract claim. | An unverified binding cannot support a normative claim. |
| `core000.decision.unresolved` | `review` | An unresolved decision linked to an active claim is reported when the claim is `decision: none` (awaiting an outcome) or a `proposal` (proposal awaiting a decision); an accepted or deferred claim that links an unresolved decision is a `core000.claim.decision-required` error, not a review. | Surfaces the open decision without resolving it. |
| `core000.trust.consent-facts` | `review` | `TB-PROFILE-EXEC` must be `policy_status: settled` with `enforcement: explicit_consent`; any pending or sandbox claim is reported. | Keeps the trust section aligned with the completed #35/PR #50 outcome. |
| `core000.conformance.case-uncovered` | `warning` | A conformance case `covers` at least one claim. | A case without a claim is not conformance. |

The core also emits its own diagnostics: `ERR_UNKNOWN_REF` for a missing or kind-mismatched
relation target, `ERR_DUPLICATE_ID` for duplicate identities, `core.relation.unknown`,
`core.profile.unknown-kind`, `core.profile.invalid` for a non-reciprocal inverse,
`core.provenance.incomplete`, `core.provenance.verification` for a malformed verification claim,
`core.manifest.invalid` for zero or multiple `render` declarations, `core.schema.*`, and
`core.extension.unpinned-dependency`. CORE-000 does not rename or replace them; the catalog
declares CORE-000 codes, and the core codes remain core-owned (M:G1/G2/G3).

### 5.8 Proposed profile declaration

This is a design draft. It is **not loadable yet**: the schema files, hook, view, renderer and
template it references do not exist, and this PR does not create them.

```json
{
  "id": "core000",
  "version": "0.1.0",
  "entityKinds": {
    "component": { "schema": "core000:component", "identity": "id" },
    "interface": { "schema": "core000:interface", "identity": "id" },
    "phase": { "schema": "core000:phase", "identity": "id" },
    "transition": { "schema": "core000:transition", "identity": "id" },
    "source_statement": { "schema": "core000:source-statement", "identity": "id" },
    "claim": { "schema": "core000:claim", "identity": "id" },
    "evidence": { "schema": "core000:evidence", "identity": "id" },
    "independent_verification": { "schema": "core000:independent-verification", "identity": "id" },
    "decision": { "schema": "core000:decision", "identity": "id" },
    "trust_boundary": { "schema": "core000:trust-boundary", "identity": "id" },
    "dependency": { "schema": "core000:dependency", "identity": "id" },
    "extension_point": { "schema": "core000:extension-point", "identity": "id" },
    "diagnostic": { "schema": "core000:diagnostic", "identity": "id" },
    "conformance_case": { "schema": "core000:conformance-case", "identity": "id" }
  },
  "schemas": {
    "core000:structure": "schemas/structure.schema.json",
    "core000:claims": "schemas/claims.schema.json",
    "core000:component": "schemas/component.schema.json",
    "core000:interface": "schemas/interface.schema.json",
    "core000:phase": "schemas/phase.schema.json",
    "core000:transition": "schemas/transition.schema.json",
    "core000:source-statement": "schemas/source-statement.schema.json",
    "core000:claim": "schemas/claim.schema.json",
    "core000:evidence": "schemas/evidence.schema.json",
    "core000:independent-verification": "schemas/independent-verification.schema.json",
    "core000:decision": "schemas/decision.schema.json",
    "core000:trust-boundary": "schemas/trust-boundary.schema.json",
    "core000:dependency": "schemas/dependency.schema.json",
    "core000:extension-point": "schemas/extension-point.schema.json",
    "core000:diagnostic": "schemas/diagnostic.schema.json",
    "core000:conformance-case": "schemas/conformance-case.schema.json"
  },
  "documents": [
    { "key": "structure", "input": "structure.yml" },
    { "key": "claims", "input": "claims.yml" }
  ],
  "relations": [
    { "name": "provides", "from": "component", "to": "interface", "cardinality": "many", "inverse": "providedBy" },
    { "name": "providedBy", "from": "interface", "to": "component", "cardinality": "many", "inverse": "provides" },
    { "name": "requires", "from": "component", "to": "dependency", "cardinality": "many", "inverse": "requiredBy" },
    { "name": "requiredBy", "from": "dependency", "to": "component", "cardinality": "many", "inverse": "requires" },
    { "name": "startsAt", "from": "transition", "to": "phase", "cardinality": "one" },
    { "name": "endsAt", "from": "transition", "to": "phase", "cardinality": "one" },
    { "name": "subject", "from": "claim", "to": "*", "cardinality": "many" },
    { "name": "cites", "from": "claim", "to": "source_statement", "cardinality": "many", "inverse": "citedBy" },
    { "name": "citedBy", "from": "source_statement", "to": "claim", "cardinality": "many", "inverse": "cites" },
    { "name": "evidencedBy", "from": "claim", "to": "evidence", "cardinality": "many", "inverse": "supports" },
    { "name": "supports", "from": "evidence", "to": "claim", "cardinality": "many", "inverse": "evidencedBy" },
    { "name": "decidedBy", "from": "claim", "to": "decision", "cardinality": "many", "inverse": "decides" },
    { "name": "decides", "from": "decision", "to": "claim", "cardinality": "many", "inverse": "decidedBy" },
    { "name": "dependsOn", "from": "claim", "to": "claim", "cardinality": "many", "inverse": "dependedOnBy" },
    { "name": "dependedOnBy", "from": "claim", "to": "claim", "cardinality": "many", "inverse": "dependsOn" },
    { "name": "verifies", "from": "independent_verification", "to": "claim", "cardinality": "many", "inverse": "verifiedBy" },
    { "name": "verifiedBy", "from": "claim", "to": "independent_verification", "cardinality": "many", "inverse": "verifies" },
    { "name": "covers", "from": "conformance_case", "to": "claim", "cardinality": "many", "inverse": "coveredBy" },
    { "name": "coveredBy", "from": "claim", "to": "conformance_case", "cardinality": "many", "inverse": "covers" },
    { "name": "concerns", "from": "trust_boundary", "to": "extension_point", "cardinality": "many", "inverse": "guardedBy" },
    { "name": "guardedBy", "from": "extension_point", "to": "trust_boundary", "cardinality": "many", "inverse": "concerns" },
    { "name": "exposes", "from": "extension_point", "to": "interface", "cardinality": "many", "inverse": "exposedBy" },
    { "name": "exposedBy", "from": "interface", "to": "extension_point", "cardinality": "many", "inverse": "exposes" },
    { "name": "loadedBy", "from": "extension_point", "to": "component", "cardinality": "one", "inverse": "loads" },
    { "name": "loads", "from": "component", "to": "extension_point", "cardinality": "many", "inverse": "loadedBy" },
    { "name": "supersedes", "from": "claim", "to": "claim", "cardinality": "many", "inverse": "supersededBy" },
    { "name": "supersededBy", "from": "claim", "to": "claim", "cardinality": "many", "inverse": "supersedes" },
    { "name": "raisedIn", "from": "diagnostic", "to": "phase", "cardinality": "one" }
  ],
  "provenance": [
    { "kind": "source_statement", "source": "source", "ref": "source_ref", "quote": "source_quote" }
  ],
  "files": [
    "profile.json",
    "catalog.json",
    "view.ts",
    "validator.ts",
    "checks/claim-evidence.ts",
    "checks/trust-policy.ts",
    "checks/provenance-verification.ts",
    "renderer.ts",
    "templates/core000.md.j2",
    "schemas/structure.schema.json",
    "schemas/claims.schema.json",
    "schemas/component.schema.json",
    "schemas/interface.schema.json",
    "schemas/phase.schema.json",
    "schemas/transition.schema.json",
    "schemas/source-statement.schema.json",
    "schemas/claim.schema.json",
    "schemas/evidence.schema.json",
    "schemas/independent-verification.schema.json",
    "schemas/decision.schema.json",
    "schemas/trust-boundary.schema.json",
    "schemas/dependency.schema.json",
    "schemas/extension-point.schema.json",
    "schemas/diagnostic.schema.json",
    "schemas/conformance-case.schema.json"
  ],
  "dependencies": { "nunjucks": "3.2.4" },
  "view": "view.ts",
  "validator": "validator.ts",
  "diagnostics": "catalog.json"
}
```

`files` must list every file whose bytes affect the profile, because `profileDigest` covers that
closure (C:§8.1; BI). The `validator.ts` module exports both `validate` and `verifyProvenance`;
the latter supplies the per-source-statement verification claims. The hook imports `checks/*.ts`;
the renderer imports `nunjucks` from the lockfile, so the exact version is declared. If the implementation avoids `nunjucks`, the
dependency and the renderer files change together and `profileDigest` moves.

### 5.9 Proposed input shape

Two input documents keep the project readable and match the manifest's multi-pointer support. The
document schema validates the whole file; each entity schema validates its objects.

```yaml
# structure.yml (excerpt)
components:
  - id: COMP-CORE
    name: "Contract Builder core"
    responsibility: "Generic loading, structure, identity, relations, provenance binding, diagnostics, rendering and build identity."
    boundary: engine
    public: true
    relations: { provides: [IF-MANIFEST] }
interfaces:
  - id: IF-MANIFEST
    name: "Project manifest"
    surface: file
    stability: accepted
    description: "contract-builder.json: project, profile, inputs, sources, render, output."
    owner: COMP-CORE
phases:
  - id: PH-REFERENCE
    name: reference
    guarantee: "Identities are unique and declared relation targets resolve."
    not_guaranteed: "That the references are semantically appropriate."
transitions:
  - id: TR-STRUCTURE-REFERENCE
    condition: "The structure phase passed."
    description: "Entities are indexed before relations resolve."
    relations: { startsAt: [PH-STRUCTURE], endsAt: [PH-REFERENCE] }
extensionPoints:
  - id: EXT-PROFILE-VALIDATOR
    name: "Profile validator hook"
    mechanism: dynamic_import
    trust: trusted_in_process
    status: implemented
    relations: { loadedBy: [COMP-CORE], exposes: [IF-PROFILE-VALIDATOR] }
trustBoundaries:
  - id: TB-PROFILE-EXEC
    name: "Executable profile loading"
    inside: "Profile view/validator modules and their declared closure run with builder privileges."
    outside: "No sandbox, capability restriction or process isolation exists."
    enforcement: explicit_consent
    statement: "Loading a profile is a trust decision equivalent to installing a dependency; executable profile modules require explicit caller consent, are not sandboxed, and remain in-process with builder privileges."
    policy_status: settled
    policy_ref: "#35 (closed; PR #50 merged)"
    relations: { concerns: [EXT-PROFILE-VALIDATOR] }
```

```yaml
# claims.yml (excerpt)
sourceStatements:
  - id: SRC-TR-001
    source: SRC-ENGINE-CONTRACT
    source_ref: "SRC-ENGINE-CONTRACT#3.3"
    source_quote: "The hook is trusted executable code. The engine loads it with a dynamic `import()` and runs it in the same process, with the same privileges. The engine does not sandbox it."
claims:
  - id: C000-TR-001
    author: "it-start"
    statement: "After explicit consent, executable profile code runs in-process with the builder process's privileges; the engine does not sandbox it."
    class: trust_boundary
    status: { decision: accepted, implementation: implemented, tests: tested, verification: none }
    authority: human
    lifecycle: active
    verification_method: "Code inspection of spec/lib/build.ts and the accepted contract; a security review is external."
    scope: "Executable profile loading at current main 260de89."
    subject_kind: trust_boundary
    relations:
      subject: [TB-PROFILE-EXEC]
      cites: [SRC-TR-001]
      evidencedBy: [EV-TRUST-CODE, EV-TRUST-TEST]
      decidedBy: [D28]
  - id: C000-TR-003
    author: "it-start"
    statement: "Executable profile loading requires explicit caller consent: allowExecutableProfile defaults false, the CLI flag is --allow-executable-profile, and absent consent fails closed with core.profile.consent-required before import."
    class: requirement
    status: { decision: accepted, implementation: implemented, tests: tested, verification: none }
    authority: external
    lifecycle: active
    verification_method: "bun test tests/consent.test.ts"
    scope: "Consent policy merged by PR #50."
    subject_kind: trust_boundary
    relations:
      subject: [TB-PROFILE-EXEC]
      evidencedBy: [EV-CONSENT-CODE, EV-CONSENT-TEST]
      decidedBy: [D35]
decisions:
  - id: D28
    title: "Profile hook trust and identity"
    status: accepted
    owner: maintainer
    source: "docs/architecture/engine-public-contract.md §18"
    consequence: "Hooks are trusted, digest-pinned and author-owed for determinism."
  - id: D35
    title: "Explicit consent for executable profiles"
    status: accepted
    owner: maintainer
    source: "Issue #35; PR #50 merge 2861195"
    consequence: "Consent is per invocation, fail-closed, not isolation and not part of inputDigest."
evidence:
  - id: EV-TRUST-CODE
    kind: code
    locator: "spec/lib/build.ts"
    revision: "260de89"
    description: "loadProfileModule imports view/validator after the consent gate."
    producer: "repository"
    independence: author
    availability: available
  - id: EV-TRUST-TEST
    kind: test
    locator: "tests/consent.test.ts"
    revision: "260de89"
    description: "Consent tests cover API/CLI rejection and success and renderer isolation."
    producer: "repository"
    independence: author
    availability: available
  - id: EV-CONSENT-CODE
    kind: code
    locator: "spec/lib/build.ts; spec/build.ts; spec/cli-renderers.ts"
    revision: "260de89"
    description: "allowExecutableProfile gate, CLI flag and conditional CORE-001 renderer preflight."
    producer: "repository"
    independence: author
    availability: available
  - id: EV-CONSENT-TEST
    kind: test
    locator: "tests/consent.test.ts"
    revision: "260de89"
    description: "API/CLI rejection, success, renderer isolation, closure preflight and lockfile cases."
    producer: "repository"
    independence: author
    availability: available
```

The source `SRC-ENGINE-CONTRACT` is declared in the manifest with `external: true` and points at
`docs/architecture/engine-public-contract.md`. The quote in the example is illustrative; the
implemented data must copy the exact contract text and use a locator the current adapter supports.
The `subject_kind` values are checked by the hook; the `subject` targets are checked for existence
by the core and for kind by the hook.

### 5.10 Schema excerpts

Every schema has a real versioned `$id`. The excerpts show the reserved-name pattern and the
nested status objects; the full schemas are implementation work (and are not created here).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://core000.local/schemas/claim.schema.json",
  "title": "Entity: claim",
  "$defs": {
    "status": {
      "type": "object",
      "required": ["decision", "implementation", "tests", "verification"],
      "additionalProperties": false,
      "properties": {
        "decision": { "enum": ["accepted", "proposed", "deferred", "none"] },
        "implementation": { "enum": ["implemented", "none"] },
        "tests": { "enum": ["tested", "none"] },
        "verification": { "enum": ["independently_verified", "none"] }
      }
    },
    "base": {
      "type": "object",
      "required": ["id", "author", "statement", "class", "status", "verification_method", "scope", "authority", "lifecycle", "subject_kind"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^C000-[A-Z]{2,4}-[0-9]{3}$" },
        "author": { "type": "string", "minLength": 1 },
        "statement": { "type": "string", "minLength": 1 },
        "class": { "enum": ["requirement", "guarantee", "assumption", "constraint", "implementation_fact", "proposal", "deferred", "limitation", "non_goal", "trust_boundary"] },
        "status": { "$ref": "#/$defs/status" },
        "verification_method": { "type": "string", "minLength": 1 },
        "scope": { "type": "string", "minLength": 1 },
        "authority": { "enum": ["engine", "external", "human"] },
        "lifecycle": { "enum": ["active", "superseded", "retired"] },
        "subject_kind": { "enum": ["component", "interface", "phase", "transition", "trust_boundary", "extension_point", "diagnostic", "dependency"] },
        "conditions": { "type": "string", "minLength": 1 },
        "consequence": { "type": "string", "minLength": 1 },
        "baseline": { "type": "string", "minLength": 1 },
        "notes": { "type": "string", "minLength": 1 },
        "kind": { "type": "string" },
        "type": { "type": "string" },
        "provenance": { "type": "object" },
        "verification": { "type": "object" },
        "relations": { "type": "object" },
        "review": { "type": "object" }
      }
    }
  },
  "allOf": [{ "$ref": "#/$defs/base" }]
}
```

The `source_statement` schema requires `source`, `source_ref` and `source_quote` and allows the
reserved names, including the core-managed `verification` record. The `evidence` and
`independent_verification` schemas require the fields in §5.3 and use the enums in §2.4/§8.3.
The core `ProvenanceVerification`/`VerificationRecord` shape is defined by contract §4; CORE-000
does not duplicate it as a profile entity schema. The `component`, `interface`, `phase`, `transition`, `decision`,
`trust_boundary`, `dependency`, `extension_point`, `diagnostic` and `conformance_case` schemas
follow the same pattern: a closed base object, the reserved-name allowances, and enum fields for
closed vocabularies. Class-specific claim rules (conditions, evidence, decision) are in the hook,
not in `if/then` schema branches, so the diagnostic names the claim and the missing element rather
than reporting an opaque schema failure.

The document schemas (`core000:structure`, `core000:claims`) validate the whole file: top-level
objects with the expected arrays, no unknown top-level keys, and the entity arrays as the only
extension point. They do not duplicate the entity schemas; the core validates each extracted
object against its kind schema (C:§5.2 steps 1–3).

### 5.11 Rejected alternatives

| Alternative | Why rejected |
|---|---|
| One generic node kind with a `type` discriminator | All fields become optional; the generic core's schema checks weaken; typed relations lose their endpoints; the hook grows into a validator for everything. |
| One kind per #47 bullet (guarantee, assumption, constraint, non-goal, limitation, …) | Duplicates the same status/evidence/lifecycle model and relations; ten schemas for one behaviour. The `claim` class field is the smaller model. |
| Mirror CORE-001 kinds (`fragment`, `provision`, `case`, …) | CORE-001-specific vocabulary; violates A3 and makes the self-contract look like a CORE-001 project. |
| Put provenance on every claim | Implementation facts and proposals often have no contract quote; a mandatory quote would fabricate provenance or exclude claims. The `source_statement` kind separates the quoted material. |
| Make verification a boolean on the claim | Loses the verifier, method, scope, independence and record. A boolean is exactly the "self-certification" failure the design exists to prevent. |
| Generate claims from code annotations | The claim register would depend on the implementation it describes, making drift invisible and the engine the author of its own contract. The register is declared data; evidence locators are checked externally. |
| Put CORE-000 policy in the generic core | Adds domain policy to the core and violates the accepted core/profile split (C:§2.1, D1). The hook is the M1 mechanism; primitives are a future option (M:R4). |
| Use multiple sources for contract, matrix and code | Multi-source is untested in M1 (M:A2). The first experiment uses one source and evidence references for the rest; the gap is recorded (§9 G6). |

---

## 6. Executable-profile trust boundary

### 6.1 Current facts at `260de89`

These are implementation facts at the reconciled current main. They are not recommendations and
not a policy proposal.

1. The engine loads the profile's `view` and `validator` modules only after explicit caller
   consent. `BuildOptions.allowExecutableProfile` defaults to `false`; `runBuild` checks
   `hasExecutableProfileConsent` after the manifest/profile are read and before the profile
   closure scan and before any `import()`. A profile that declares executable modules without
   consent fails closed with `core.profile.consent-required`; the result is exit 1,
   `blockedBy: "errors"`, `markdown: null`, `identity: null`, and no profile module is evaluated.
   The CLI exposes the same decision as `--allow-executable-profile`.
2. After consent, the profile's own runtime imports run with the builder process's privileges:
   the CORE-001 view imports `text.ts`, the validator imports `checks/*.ts`, the checks import
   `slice.ts`, and `slice.ts` imports the engine's markdown locator. The example profile behaves
   the same way (`profiles/example/view.ts`, `validator.ts`; `tests/example-profile.test.ts`).
   Consent permits execution; it does not constrain what the executed code can do.
3. The CLI no longer statically imports the CORE-001 renderer. `spec/cli-renderers.ts` reads and
   validates the selected project's manifest/profile declaration (declarative data only), then
   imports the built-in renderer only when the caller consented, the project declares profile
   `core001` and renderer `core001-markdown`, and the selected profile's declared closure
   validates. A flag alone never selects unrelated executable code; another valid profile leaves
   the registry empty and the build reports `core.registry.missing`; an unreadable lockfile is a
   hard preflight failure (`ERR_IO`) and no renderer is imported. Consumer-supplied adapters and
   renderers are objects in the caller's registries and remain the caller's own trust decision.
4. Therefore, with consent, a profile module can read and write files, read the environment, use
   the network, spawn processes, consume resources and mutate process state with the builder's
   privileges. The engine does not sandbox it, isolate it, restrict its capabilities or enforce
   per-module consent.
5. `external: true` is a **path** trust declaration (contract §5.7; D31). It lets a declared path
   leave the project root and it participates in `inputDigest`. It is not executable-profile
   consent and it does not isolate anything.
6. `profileDigest`, the extension closure and the static import scan are **integrity/accounting**
   controls. They make the loaded profile's declared files and pinned dependencies visible and
   hash them into the identity. They are not a security boundary: the scan is lexical, it skips
   computed specifiers, `createRequire`, `process.binding` and runtime file access
   (`build-identity.md` "Static import scan"; matrix §6 item 5).
7. Determinism is conditional. A hook that reads a clock, random source, network, filesystem or
   environment can break byte equality, and the engine cannot detect it (contract §3.3; D28).
   Declarative data is not automatically safe from parser, schema or resource-exhaustion attacks;
   the contract's boundary covers that separately.
8. Consent is caller policy, not specification input. It is per invocation (API option or CLI
   flag), not stored in the manifest/profile and not hashed into `inputDigest`. A declarative-only
   profile is documented but not buildable while `view`/`validator` remain required.

The one-sentence current fact: **executable profile modules require explicit caller consent and
then run in-process with builder privileges; the engine has no sandbox, isolation or capability
restriction.**

### 6.2 What the controls provide and do not provide

| Property | Provided at `260de89`? | Why |
|---|---|---|
| Explicit caller consent before loading executable profile code | Yes | `allowExecutableProfile` default false; CLI `--allow-executable-profile`; checked before closure scan/import. |
| Fail-closed behavior when consent is absent | Yes | `core.profile.consent-required`, exit 1, no profile module evaluated. |
| Sandboxing or capability restriction | No | Same process, same privileges, no capability model. |
| Process/worker isolation | No | `import()` in the build process; D32 deferred. |
| A caller-visible CLI control | Yes | `--allow-executable-profile`; it is a flag, not an interactive prompt. |
| Signature or provenance of profile code | No | The closure is a digest, not a signature or a trusted publisher. |
| Enforcement of hook purity | No | The engine cannot see the hook's runtime effects. |
| Safety of declarative profiles against malicious input | Not claimed | Parser/schema/resource-exhaustion risks remain separate. |
| A security boundary around `external: true` | No | It is a path declaration and an audit signal. |
| Per-module consent | No | Consent applies to the declared executable profile modules as a set. |
| Consent to consumer-imported adapters/renderers | No | The consumer's own import is its trust decision; the CLI gates only its profile renderer. |
| Declarative-only profile builds | No | `view`/`validator` remain required; documented, not implemented. |

### 6.3 #35 reconciliation table

Issue #35 closed at 2026-11-02T02:31:43Z and PR #50 merged as `2861195`. The earlier T1–T10
pending checklist is resolved or narrowed as follows; no item is re-decided here.

| # | Outcome at `260de89` |
|---|---|
| T1 | Resolved: API option `allowExecutableProfile` plus CLI flag `--allow-executable-profile`; no manifest/profile field grants consent. |
| T2 | Resolved: default false; absent consent fails closed before import. |
| T3 | Resolved: `core.profile.consent-required` names the declared modules and both opt-in forms. |
| T4 | Resolved: CORE-001 scripts, example/test callers and docs pass the flag; CORE-001 output is unchanged. |
| T5 | Partially resolved: PR #50 documents the declarative/executable distinction; no manifest field was added. Whether CORE-000 models a separate profile class is a design choice, not a current fact. |
| T6 | Resolved: consent is per invocation; it is not per project, profile id or version. |
| T7 | Resolved: consent is separate from `external: true`; `external: true` remains a path declaration. |
| T8 | Resolved for the engine: PR #50 updated the contract/README/identity/matrix; CORE-000 performs its own reconciliation here. |
| T9 | Resolved: consent is caller policy, not hashed into `inputDigest`. |
| T10 | Resolved: `tests/consent.test.ts` covers API/CLI rejection and success, renderer isolation, closure preflight and unreadable-lockfile failure. |

Remaining open choices, explicitly not settled by PR #50: per-module consent granularity,
declarative-only profile buildability, process/WASM isolation (D32 deferred), a gate for
consumer-imported adapters/renderers, and how CORE-000 models the consent surface (interface
entities, enum value).

### 6.4 Reconciliation record

The §6.4 checkpoint has been performed for this update:

- Verified against `260de89`: `spec/lib/build.ts` consent gate, `spec/build.ts` flag,
  `spec/cli-renderers.ts` preflight/dynamic import, `package.json` scripts, and
  `tests/consent.test.ts`.
- Updated: §1.5, §6.1–6.3, the C000-IM/C000-TR claims, the trust-boundary input example, the
  model enums/interfaces/diagnostics, the experiment invocation and expected diagnostics, the
  decision register, the limitations and the PR description.
- Open follow-ups: the model representation of the consent surface, per-module granularity,
  declarative-only buildability, isolation, and the consumer extension gate. These are design
  choices or deferred limitations, not pending #35 policy.
- No independent verification is claimed for the consent implementation; the merge is a
  decision/implementation/test fact, not independent verification (§8).

## 7. Self-validation experiment plan

### 7.1 Question and hypothesis

**Question.** Can the implemented generic pipeline load, validate, relate, provenance-check,
render and identify CORE-000 as a project, with CORE-000-specific policy in the profile, without
changing `spec/lib/`?

**Hypothesis.** Yes, for a bounded first version, using the existing manifest/profile/schema/IR/
relations/provenance/hook/renderer/identity mechanisms and a consumer harness that registers the
CORE-000 renderer. The experiment is designed to falsify the hypothesis cheaply if a core
capability is missing; a missing capability is a finding (§9), not a reason to patch the core.

The hypothesis is about **expressibility and internal consistency**, not about the truth of the
claims. §7.2 states the boundary.

### 7.2 What a successful build proves — and does not

| A successful CORE-000 build proves | It does **not** prove |
|---|---|
| The project loads; the manifest and profile resolve; the profile closure is complete and pinned. | That the profile or the engine is correct. |
| The documents and entities match the declared schemas. | That the claim content is true. |
| Claim IDs are unique and the declared relations resolve. | That the relations are complete or appropriate. |
| Source statements bind to the declared source and their quotes resolve at the declared locators. | That the quotes are representative, sufficient or correctly interpreted. |
| The CORE-000 profile hook accepts the claim/evidence/decision consistency rules it implements. | That the hook is correct, complete or independent. |
| The renderer returns exactly one artifact and the artifact is normalized. | That the artifact is meaningful or that a reader will understand it. |
| `inputDigest` is computed over the declared inputs and extension closures. | That the identity is correct, secure, hermetic or reproducible elsewhere. |
| Two runs in the same environment produce the same bytes for the same inputs. | Cross-platform byte equality, or correctness of the bytes. |

The build is a **self-consistency check of a self-description**. It is not independent
verification, certification, or proof of the engine's correctness, security, determinism or
conformance. A green CORE-000 build with a self-reported claim register is still a producer's
claim (§8).

### 7.3 Project layout

The location is a maintainer decision (§10 D1). This plan assumes the `contracts/core000/`
project root, mirroring the `contracts/self/` direction in contract §14 without claiming it is
accepted.

```text
contracts/core000/                    # project root (proposed)
  contract-builder.json               # manifest
  structure.yml                       # components, interfaces, phases, transitions,
                                      #   extension points, trust boundaries, diagnostics,
                                      #   dependencies
  claims.yml                          # source statements, claims, evidence,
                                      #   independent verifications, decisions, conformance cases
  output/
    CORE-000.draft.md                 # generated draft artifact
  fixtures/                           # negative cases (§7.8), each a complete small project
profiles/core000/                     # profile (outside the project root; external: true)
  profile.json
  catalog.json
  view.ts
  validator.ts
  checks/claim-evidence.ts
  checks/trust-policy.ts
  checks/provenance-verification.ts
  renderer.ts
  templates/core000.md.j2
  schemas/
    structure.schema.json
    claims.schema.json
    <one schema per kind>.schema.json
tests/
  core000.test.ts                     # future consumer harness / CI test (not created here)
```

Why this shape:

- The project root contains the manifest, so `contracts/core000` is the declared project.
- The profile and the source document are outside the project root, so their declarations need
  `external: true`. This exercises the accepted D31 trust boundary on the two extensions the
  experiment actually uses, as M1 did for CORE-001.
- The renderer is registered by a consumer harness because the CLI only conditionally wires the
  CORE-001 renderer and has no generic profile-selection surface. A test under `tests/` or a small
  script can call `runBuild` with `allowExecutableProfile: true` and
  `renderers: { "core000-markdown": renderer }`. This is a consumer role, not a core change.
- The negative fixtures are complete small projects, not mutated copies of the full project, so
  each expected diagnostic is isolated.

### 7.4 Manifest and invocation

Proposed manifest (the paths are relative to `contracts/core000/`):

```json
{
  "manifestVersion": "0.1",
  "project": {
    "id": "core-000-self-contract",
    "title": "Contract Builder Engine public self-contract",
    "revision": "0.1.0"
  },
  "profile": {
    "id": "core000",
    "version": "0.1.0",
    "source": "../../profiles/core000",
    "external": true
  },
  "inputs": [
    {
      "path": "structure.yml",
      "format": "yaml",
      "schema": "core000:structure",
      "entities": [
        { "kind": "component", "pointer": "/components" },
        { "kind": "interface", "pointer": "/interfaces" },
        { "kind": "phase", "pointer": "/phases" },
        { "kind": "transition", "pointer": "/transitions" },
        { "kind": "extension_point", "pointer": "/extensionPoints" },
        { "kind": "trust_boundary", "pointer": "/trustBoundaries" },
        { "kind": "diagnostic", "pointer": "/diagnostics" },
        { "kind": "dependency", "pointer": "/dependencies" }
      ]
    },
    {
      "path": "claims.yml",
      "format": "yaml",
      "schema": "core000:claims",
      "entities": [
        { "kind": "source_statement", "pointer": "/sourceStatements" },
        { "kind": "claim", "pointer": "/claims" },
        { "kind": "evidence", "pointer": "/evidence" },
        { "kind": "independent_verification", "pointer": "/independentVerifications" },
        { "kind": "decision", "pointer": "/decisions" },
        { "kind": "conformance_case", "pointer": "/conformanceCases" }
      ]
    }
  ],
  "sources": [
    {
      "id": "SRC-ENGINE-CONTRACT",
      "path": "../../docs/architecture/engine-public-contract.md",
      "adapter": "markdown",
      "external": true,
      "identity": { "document": "Contract Builder Engine — Public Contract", "revision": "0.4" }
    }
  ],
  "render": [
    {
      "renderer": "core000-markdown",
      "template": "profile:templates/core000.md.j2",
      "outputs": {
        "draft": "output/CORE-000.draft.md",
        "release": "output/CORE-000.md"
      }
    }
  ],
  "output": { "root": "." }
}
```

The `identity` strings are illustrative. Under #37 the profile verifier records the
manifest-declared `sourceVersion` and the `sourceDigest` of the loaded bytes in the verification
record; it does not perform a separate header-string check unless the profile adds that policy.
The accepted declared source-byte pin (`identity.sha256`) is not implemented (M:V4), so the record
proves what was checked, not that the source is pinned across runs.

**Invocation.** A consumer harness calls `runBuild`:

```ts
// Illustrative; the future test/harness does this, not this PR.
const result = await runBuild({
  specDir: "contracts/core000",
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  allowExecutableProfile: true, // required: the CORE-000 profile declares view/validator
  renderers: { "core000-markdown": core000Renderer },
});
```

The harness asserts:
- the no-consent run fails with `core.profile.consent-required` and no profile module is evaluated
  (the negative case N14);
- `result.exitCode === 0` for the consented draft and `result.blockedBy === null`;
- `result.identity !== null` and `identity.inputDigest` starts with `sha256:`;
- the diagnostic set equals the expected set (codes/severities, not a hard-coded count);
- `result.markdown` (or the written artifact) is byte-identical across two separate processes;
- `result.written === false` for the in-memory run, or the artifact is written and re-checked in a
  separate `--check`-equivalent run.

For a release run, the harness asserts `result.exitCode === 1`, `blockedBy === "review"`,
`written === false`, and that no release artifact was written.

### 7.5 Pipeline stages and checks

The experiment exercises the existing order (`spec/lib/build.ts`):

| Step | What runs | CORE-000 evidence produced |
|---|---|---|
| 1 | Load manifest, resolve profile directory, read `profile.json`; validate exactly one `render` declaration | manifest/profile diagnostics; `core.manifest.invalid` for zero/multiple render targets |
| 2 | Check explicit executable-profile consent before any profile import | `core.profile.consent-required` when absent; no profile code evaluated |
| 3 | Validate the profile closure before importing modules (`validateProfileClosure`) | `core.extension.unpinned-dependency`; `ERR_IO` when the lockfile is unreadable |
| 4 | Resolve output path and containment | `core.path.outside-root` if output escapes |
| 5 | Load schemas by id | `core.schema.*` if a schema is missing/unparsable |
| 6 | Validate `structure.yml` and `claims.yml` document schemas | `ERR_SCHEMA` / document schema diagnostics |
| 7 | Extract entities by pointer and kind schema | `core.extract.pointer`, `core.profile.unknown-kind`, `ERR_SCHEMA` |
| 8 | Index identities | `core.identity.missing`, `ERR_DUPLICATE_ID` |
| 9 | Resolve relations under the reciprocal inverse contract | `core.relation.unknown`, `ERR_UNKNOWN_REF`, `core.relation.cardinality`, `core.profile.invalid` |
| 10 | Bind provenance for `source_statement` | `core.provenance.incomplete`, `ERR_UNKNOWN_REF`; a `not-checked` record |
| 11 | Run the profile `verifyProvenance` hook; the core validates and stores the record | CORE-000 source verification codes; `core.provenance.verification` for malformed claims |
| 12 | Build the profile view, run the validator hook, resolve findings through the catalog | CORE-000 policy codes (§5.7); `core.profile.unknown-code` |
| 13 | Resolve the renderer, load templates/labels, compute identity | `core.registry.missing`, `core.extension.unpinned-dependency`, identity |
| 14 | Render, normalize, check one artifact, apply draft/release blocking | `core.render.invalid`, `core.render.failed`; `blockedBy` |
| 15 | Write or check the artifact | `ERR_OUTPUT_STALE` if `--check` |

The hook runs after the model and provenance are built and before rendering/identity. It can use
`model.byKind`, `model.relations`, `model.byId` and the `ValidatorContext` (`view`, `sources`,
`legacyText`, `verifyQuote`). It must not perform I/O; the policy checks are pure functions of the
model. This keeps the hook's determinism obligation simpler, though the engine still cannot
enforce it (C:§3.3).

### 7.6 Expected artifacts

1. **Draft artifact** — `contracts/core000/output/CORE-000.draft.md`, generated by the CORE-000
   renderer. Proposed sections:
   - header: title, working-identifier notice, baseline revision, diagnostic counts;
   - components and public responsibilities;
   - public interfaces and stability;
   - lifecycle phases and transitions, with guarantee / non-guarantee;
   - guarantees, assumptions and constraints;
   - trust boundaries, with the settled explicit-consent facts and no pending marker;
   - claim register, one row per claim, with class, decision/implementation/tests/verification
     and evidence/verification method;
   - evidence and independent-verification records (independent verification starts empty);
   - provenance binding and verification records (binding status, verification status/outcome,
     method, verifier, source version and source digest);
   - decisions, gaps and limitations;
   - diagnostic appendix (deterministic snapshot);
   - provenance appendix (source statements and locators).

   The build identity is **not** rendered into the artifact: `RenderOptions` does not carry it and
   `build-identity.md` states that it is never rendered. The identity is reported in the JSON
   result and the experiment report, not in the Markdown header. A renderer that needs it would
   require a contract change and is out of scope here.
2. **Machine-readable result** — `--json`-shaped `BuildResult`: `mode`, `exitCode`, `blockedBy`,
   `written`, `output`, `identity`, `diagnostics`. The artifact itself is Markdown in M1; a JSON
   claim export is deferred (§9 G5).
3. **Diagnostics snapshot** — the deterministic sorted list of diagnostics with codes, severities,
   files, pointers and messages. The snapshot is part of the artifact appendix and the JSON result.
4. **Negative-case reports** — each fixture's expected failure (§7.8), run separately.
5. **Independent verification record** — not generated by the engine; created later by an external
   verifier (§8) and referenced from an `independent_verification` entity.

The plan does **not** predict the exact artifact bytes, diagnostic count or `inputDigest`. Those
values are produced by the experiment and recorded in its report; inventing them here would be a
claim without evidence.

### 7.7 Expected diagnostics

A clean draft build is expected to have **no errors** and a small, explicit set of review/warning
diagnostics. The exact count depends on how many claims are in the register at the time; the plan
asserts the codes and conditions, not a hard-coded number.

| Code | Severity | Condition in a clean build | Draft | Release |
|---|---|---|---|---|
| `core000.decision.unresolved` | `review` | an active `decision: none` claim, or a `proposal` explicitly awaiting a decision, links an unresolved decision; accepted/deferred mismatches are `core000.claim.decision-required` errors | visible | blocks |
| `core000.independent-verification.missing` | `review` | an active claim with `authority: external/human` has no independent verification | visible | blocks |
| `core000.trust.consent-facts` | `review` | a trust claim or trust-boundary statement does not match the settled consent facts | should be zero | allowed unless it fires |
| `core000.source.verification-missing` | `error` | a `source_statement` has no stored verification record | should be zero | blocks |
| `core000.source.verification-failed` | `error` | a `source_statement` verification is `failed` or `stale` | should be zero | blocks |
| `core000.source.verification-unavailable` | `error` | a `source_statement` verification is `unavailable` | should be zero | blocks |
| `core000.evidence.orphan` | `warning` | an evidence record supports no claim (should be zero in the clean data) | visible | allowed unless `--strict` |
| `core000.surface.claim-missing` | `warning` | a public component/interface has no claim (should be zero) | visible | allowed unless `--strict` |
| `core000.conformance.case-uncovered` | `warning` | a case covers no claim (should be zero) | visible | allowed unless `--strict` |
| any `error` | `error` | schema, identity, relation, consent, provenance-verification or policy violation | blocks | blocks |

`core.profile.consent-required` is **not** expected in the clean build: the harness passes
`allowExecutableProfile: true` and the negative case N14 covers its absence. The CORE-000 profile's
`verifyProvenance` must supply a checked record for every source statement; a clean build has no
`core000.source.verification-*` errors.

Expected result:

- **Draft:** exit 0, artifact written, review markers in the artifact; missing independent
  verification and unresolved decisions are visible, not hidden. The consent policy is settled and
  produces no pending marker.
- **Release:** exit 1, `blockedBy: "review"`, no release artifact. This is the intended gate: a
  self-contract whose claims are not independently verified and whose decisions remain open must
  not be published as if it were final. The merged consent policy is not a blocker.
- **`--strict` draft:** exit 1 if any warning remains; the warnings above are expected to be zero
  in the clean data, so this is a check that the data is clean, not a way to hide the reviews.

The CORE-000 catalog declares these codes with the M1 shape (`code`, `severity`, `message`). The
contract's severity+disposition+phase shape is deferred (M:G2); CORE-000 uses `review` as the M1
severity and records the intended disposition/phase in the diagnostic entity data.

### 7.8 Negative cases

Each case is a complete small project under `contracts/core000/fixtures/<case>/` with its own
manifest, inputs and (where needed) a copy of the profile. The expected result is exit 1, the
named diagnostic, and no artifact written. The cases marked **required** are the four required by
#47; the rest strengthen the model, the current consent policy, the inverse contract and the
single-target render contract.

| ID | Case | Mutation | Expected diagnostic (layer, phase) | Required |
|---|---|---|---|---|
| N1 | Inconsistent component/interface | `IF-*` has `owner: COMP-X`, but `COMP-X` does not `provide` it (via the reciprocal `provides`/`providedBy` pair) | `core000.model.interface-owner-mismatch` (profile, consistency) | yes |
| N2 | Unresolved dependency/relation | a claim `dependsOn` a non-existent claim; or `provides` a non-existent interface | `ERR_UNKNOWN_REF` (core, reference) | yes |
| N3 | Implemented without evidence | claim `status.implementation: implemented`, no `evidencedBy` code/test/ci evidence | `core000.claim.implemented-without-evidence` (profile, consistency) | yes |
| N4 | Unsupported or unverified guarantee | (a) `class: guarantee`, `decision: accepted`, no `conditions`/`cites`/`evidencedBy`; (b) `verification: independently_verified` with no independent verification record | (a) `core000.claim.unsupported-guarantee`; (b) `core000.claim.verification-not-independent` (profile, consistency) | yes |
| N5 | Duplicate claim ID | two claims with `id: C000-CT-001` | `ERR_DUPLICATE_ID` (core, structure/index) | — |
| N6 | Unknown kind | manifest pointer declares a kind absent from `entityKinds` | `core.profile.unknown-kind` (core, reference) | — |
| N7 | Undeclared relation key | a claim's `relations` contains `citesFoo` | `core.relation.unknown` (core, reference) | — |
| N8 | Provenance quote outside | a `source_statement` quote exists in the source but outside its declared locator; the profile verifier returns `failed`/`outside` | `core000.source.verification-failed` (profile, verification) | — |
| N9 | Self-asserted independence | independent verification says `independence: independent`, the verifier is the claim author, or the record is inside `contracts/core000/` | `core000.independent-verification.self` / `core000.claim.verification-not-independent` (profile, consistency) | — |
| N10 | Consent policy contradicted | a claim says consent is pending/absent or that the profile is sandboxed while `TB-PROFILE-EXEC` is `settled`/`explicit_consent` | `core000.claim.policy-mismatch` (profile, consistency) | — |
| N11 | Decision state mismatch | `decision: accepted` linked to `unresolved`; `deferred` linked to `unresolved`; `none` linked to `accepted`; or `proposal` linked to `accepted` | `core000.claim.decision-required` (error); `core000.decision.unresolved` (review) for the unresolved cases | — |
| N12 | Status/class contradiction | `class: non_goal`, `implementation: implemented`; or `class: proposal`, `tests: tested` | `core000.claim.status-class-conflict` (profile, consistency) | — |
| N13 | Missing claim subject | claim has no `subject` relation, or `subject_kind` disagrees with the target | `core000.claim.missing-subject` / `core000.claim.subject-kind-mismatch` (profile, consistency) | — |
| N14 | Missing executable-profile consent | the harness omits `allowExecutableProfile: true` | `core.profile.consent-required` (core, load) and no profile module evaluated | — |
| N15 | Provenance verification missing or unusable | a `source_statement` has no stored verification record; or the record is `unavailable`/`stale`/has no digest | `core000.source.verification-missing` / `core000.source.verification-unavailable` (profile, verification) | — |
| N16 | Non-reciprocal inverse | a declared inverse is missing, points at the wrong kind, does not point back, or is declared on a wildcard target | `core.profile.invalid` (core, load) | — |
| N17 | Wrong render cardinality | zero or two `manifest.render` declarations | `core.manifest.invalid` (core, load) | — |
| N18 | Malformed verification claim | a `verified` claim has no verifier, method `none`, no outcome or no source digest; or a digest differs from the loaded source | `core.provenance.verification` / `stale` status (core, verification) | — |

The negative cases exercise different layers deliberately: N2/N5/N6/N7/N14/N16/N17 are generic-core
failures; N1/N3/N4/N8/N9/N10/N11/N12/N13/N15 are CORE-000 policy failures; N18 is a core
provenance-verification failure. A test that only checks the error code is not enough: it must
also check that no artifact was written and that the phase/layer is the expected one.

### 7.9 Determinism and identity checks

1. **Same-process repeat:** run the harness twice in one process; the two `BuildResult` objects
   must produce the same diagnostics order and the same `markdown` bytes. This checks accidental
   mutable state, not cross-process determinism.
2. **Separate-process repeat:** run the harness in two fresh `bun` processes against the same
   checkout; compare the artifact SHA-256 and `identity.inputDigest`. The build is byte-deterministic
   only under the contract's conditional guarantee (C:§8.1); this check is the evidence for the
   tested environment, not for other platforms or extensions.
3. **Input sensitivity:** change one claim or one source statement deliberately, rebuild, and
   confirm the `inputDigest` changes. This checks that the identity covers the declared inputs; it
   does not prove the digest is complete.
4. **Check mode:** write the draft artifact, rebuild with `write: false, check: true`-equivalent,
   and confirm no `ERR_OUTPUT_STALE`. This checks the artifact matches the model at the recorded
   revision.
5. **Consent is not input:** run the same project with and without `allowExecutableProfile: true`;
   the consented build's `inputDigest` must be identical (consent is caller policy, not
   specification input), and the unconsented build must fail before import with
   `core.profile.consent-required` (N14).
6. **One verification per binding:** spy on the source adapter's `verifyQuote` and assert one call
   per direct `source_statement` binding, not one per profile check. The stored
   `Entity.verification` record is what the `validate` hook reads.
7. **Evidence freshness (external):** the build cannot see code/test evidence files in
   `inputDigest` (§9 G1). The external reviewer must re-run the cited commands and compare the
   revision; this is not a build check.

### 7.10 Experiment acceptance criteria

| ID | Criterion | Evidence |
|---|---|---|
| E1 | The draft build completes with zero errors and only the expected review/warning codes (§7.7). | `BuildResult` JSON; diagnostic snapshot |
| E2 | The artifact contains every proposed section, every claim in the register, and no absolute paths or timestamps. | Artifact inspection; a scripted check for `/\//`/home paths and date patterns |
| E3 | Two separate processes produce the same artifact SHA-256 and `inputDigest` for the same checkout. | Recorded hashes from two runs |
| E4 | The release build exits 1 with `blockedBy: "review"` and writes no release artifact. | `BuildResult` JSON; file absence |
| E5 | Every negative case (N1–N18) fails with the expected code, layer/phase and no artifact. | Per-fixture reports |
| E6 | Every public contract area in matrix §3 has at least one claim or is listed in §4.4 as not individually identified. | Register coverage table |
| E7 | No claim is marked `independently_verified`; the verification section is empty or `not_run`. | Register audit |
| E8 | Trust statements and claims match the merged #35/PR #50 facts: no pending/sandbox/absent-consent claim; `TB-PROFILE-EXEC` is `settled`/`explicit_consent`; the consent API/CLI/diagnostic facts are exact. | Register audit; artifact trust section |
| E9 | A reviewer distinct from the author confirms a sample of `implemented`/`tested` claims against the cited evidence, or records `inconclusive` for the rest. | Independent verification record (§8) |
| E10 | Every `source_statement` has a stored verification record with a status and source digest; the adapter is called once per binding; a `verified` record is never the basis for an independent-verification claim. | `Entity.verification` snapshot; adapter spy; register audit |

E1–E8 and E10 are self-validation. E9 is **not** self-validation; the experiment report must not
claim "done" for E9 unless an external record exists. A report that says "E1–E8/E10 pass, E9 not
performed" is an honest `partial` result for the independent-verification question.

### 7.11 Limits and fallback

- If the experiment needs a generic-core capability that is missing, **stop** and write the gap
  into §9 with the exact capability, the failing step and a proposed follow-up. Do not patch
  `spec/lib/` in the experiment PR.
- If the hook cannot express a policy check without I/O, narrow the check to the model and record
  the missing external check in §8. Do not add filesystem reads to the hook just to make a check
  pass.
- If a schema requires conditional `if/then` branches for claim classes, prefer the hook for
  class-specific presence rules (better diagnostics) and keep the schema structural. If the hook
  becomes a second schema, that is evidence that the primitive set or the kind set needs review
  (decision D2/D6).
- If the renderer needs a template feature the `TemplateSet` does not provide, that is a core gap;
  record it, do not change the renderer boundary in this task.
- If the source document cannot be quoted at the needed granularity, use the coarsest valid
  locator and mark the claim's provenance as coarse; do not claim paragraph-level precision until
  V4 is implemented.
- The current-main reconciliation baseline is `260de89` (after #50/#52/#55/#56). If main moves
  before the experiment runs, re-baseline and re-check the consent, inverse, provenance and render
  facts; do not run the experiment against a stale description.

---

## 8. Independence, review and acceptance

### 8.1 What the engine cannot establish

The engine can establish structural and relational consistency of the self-description. It cannot
establish the following, and CORE-000 must not imply otherwise:

| Claim area | Why the engine cannot establish it | Required authority |
|---|---|---|
| The implementation conforms to the public contract | The claim register is data; the engine does not derive it from code and cannot compare behavior to it | External harness + reviewer |
| Test evidence is sufficient and current | The build does not run the test suite and does not include evidence files in `inputDigest` | External runner + reviewer |
| The build is deterministic across platforms | The tested environment is one OS/runtime; extensions are trusted | External environment matrix |
| The trust boundary is secure | The engine cannot audit privilege, sandbox absence or malicious code | Security review |
| A claim is `independently_verified` | The engine is the producer, not an independent verifier | Verifier distinct from the author |
| The self-description is complete | The engine checks the model it is given, not what is missing | Human review against the contract |
| Normative or semantic truth | The engine has no normative authority | Human authority |
| The artifact is meaningful | Rendering is a projection, not comprehension | Human review |
| The package is authentic or tamper-evident | No signature, attestation or package format is implemented | PAP/verifier track (future, separate) |

### 8.2 A concrete independent verification path

This is a manual, reproducible protocol. It is concrete enough to review and does not require the
Portable Assurance Package or a new verifier product. It has **not** been performed at the
baseline.

**Preconditions.**

- A merged CORE-000 build at a pinned commit, with a recorded artifact SHA-256 and
  `identity.inputDigest`.
- The claim register and the rendered artifact at that commit.
- A verifier who did not author the engine change, the CORE-000 data or the claim register. For a
  change authored by the agent, a human maintainer or a different agent with an independent
  mandate qualifies; the same agent account does not.

**Procedure (per verification round).**

1. **Pin.** Record the repository commit, the CORE-000 `inputDigest`, the artifact SHA-256, the
   command and the date. Do not verify a moving branch.
2. **Select.** Take the claims with `status.implementation: implemented` or `status.tests: tested`
   and `authority: engine`/`external`, plus a sample of `requirement` claims that are not
   implemented. The selection is recorded; it is not "whatever looked easy".
3. **Check the code.** For each selected claim, open the cited code/test at the pinned commit.
   Confirm the cited path exists, the symbol/behavior is present, and the test asserts the claimed
   behavior rather than an unrelated property.
4. **Run the commands.** Run the cited test command and `bun run check` in a clean checkout at the
   pinned commit. Record the exact commands, the exit codes and the output digest. Do not reuse the
   author's output.
5. **Check the source.** For `cites` source statements, open the source at the locator and confirm
   the quote is verbatim and in the declared place. The engine's coarse locator is not proof of
   sufficient context; the reviewer reads the surrounding section.
6. **Check the trust boundary.** For trust claims, inspect the loader and the CLI wiring and
   confirm the statement matches the merged consent policy. This is a code/security review, not a
   test run. Do not re-open or re-decide #35; verify the merged facts at the pinned revision.
7. **Record per claim.** Write one independent-verification record with the canonical §8.3 fields:
   `revision`, `claim_results` (`confirmed`/`refuted`/`inconclusive`/`not_run` per selected claim,
   with evidence), `limitations`, `date`, and the conditional `commands`/`record_locator`. A claim
   that was not checked is `not_run`, not `confirmed`.
8. **Record the independence basis.** Set `independence` and `independence_basis`: not the author,
   had access to the code/tests/source, did not rely only on the author's report, and was not paid
   or directed to produce a particular result.
9. **Review and merge.** A maintainer reviews the independent-verification record and the
   corresponding CORE-000 `independent_verification` entity. Only then may the claim's
   `verification` status become `independently_verified`. The engine never sets it.
10. **Re-verify on change.** A code, source or test change that affects a claim invalidates the
    record. The claim's status is downgraded or re-verified; an old record is not carried forward
    silently.

**Minimum scope for the first round.** One contract requirement with an implemented code path
(for example C000-CT-010 build identity), one test-evidenced behavior (for example C000-CT-003
relations), and the trust-boundary fact (C000-TR-001) checked against the loader. This is a
sample, not full coverage; the record must say so.

### 8.3 Independent-verification record requirements

An independent-verification record has exactly one required-field contract. It is the same
contract as the `independent_verification` schema in §5.3 and is not the core provenance
`VerificationRecord`.

**Always required:** `id`, `method`, `verifier`, `independence`, `independence_basis`,
`performed`, `result`, `scope`, `revision`, `claim_results`, `limitations`.

| Field | Requirement |
|---|---|
| `id` | Stable ID (`VF-...`), unique. |
| `method` | `manual_review`, `external_harness`, `cross_implementation` or `command_run`; what was actually done. |
| `verifier` | A person or independent agent account, with a way to contact/identify them. |
| `independence` | `author`, `non_author`, `independent` or `unknown`. Only `independent` can support `verification: independently_verified`. |
| `independence_basis` | Why the verifier is independent of the author and the producer; the canonical field. `verifier_role` is not a separate required field. |
| `performed` | Boolean; `false` means the record is a plan, not evidence. |
| `result` | `confirmed`, `refuted`, `inconclusive` or `not_run`; the aggregate outcome. |
| `scope` | Which claims, files, tests and source sections were covered; what was not. |
| `revision` | The exact commit and CORE-000 `inputDigest` checked. |
| `claim_results` | One entry per covered claim: `{claim, result, evidence}` with `result` in the same four values. Every claim the record verifies has an entry. |
| `limitations` | What the verification does not establish; known gaps. |

**Conditional fields:**

| Field | Condition |
|---|---|
| `commands` | Required for `command_run` and `external_harness`; optional for `manual_review` and `cross_implementation`. Exact commands, environment and exit codes. |
| `date` | Required when `performed: true`. |
| `record_locator` | Required when `performed: true` and `result` is not `not_run`; a path/URL outside the CORE-000 engine artifact (for example `verification/2026-11-02/…` or an external archive). |
| `signature` (optional) | A cryptographic signature is not required; if present, it is an additional claim, not a substitute for the record. |

The engine may check the record's presence and shape. It cannot check the verifier's independence,
the commands, or the truth of the result. A maintainer accepts the record; the engine does not.

### 8.4 What each layer establishes (summary)

| Layer | Establishes | Does not establish |
|---|---|---|
| Generic core | structure, identity, reciprocal relations, provenance binding shape, provenance-verification record validation, single render declaration, normalization, identity | implementation conformance, claim truth, independence |
| CORE-000 profile | model/schema/policy consistency as coded | that the policy is correct or complete |
| CORE-000 project data | what the authors assert | that the assertions are true |
| Test/CI run | the cited commands passed at a revision | coverage sufficiency, independence |
| External verifier/human | specific claims checked with a recorded method/scope | certification, truth beyond the scope, legal effect |
| PAP/verifier track (future) | package integrity and mechanical witnesses, if and when built | everything not in its declared checks |

### 8.5 Current state

- No independent verification of the engine or CORE-000 exists at the current-main reconciliation;
  matrix §7 records the review evidence and why it was not promoted.
- The CORE-000 register's independent-verification dimension is `—` for every row.
- A CORE-000 `release` build is expected to be blocked by
  `core000.independent-verification.missing` and `core000.decision.unresolved`. The consent policy
  is settled and is no longer a blocker. This is the intended behavior, not a bug to loosen.
- Provenance `verified` records are method-specific binding checks; they are not independent
  verification and do not change the `—` above.
- The independent-verification protocol in §8.2 has not been performed. A report that says otherwise
  would be false.

### 8.6 Relationship to the Portable Assurance Package and independent verifier

The PAP/independent-verifier track (#43/#44) is a separate product. CORE-000:

- does not design, implement, schedule or depend on PAP;
- does not reuse the PAP package format, status vocabulary or verifier contract;
- treats PAP as a possible future external verifier path, not as a current authority;
- records its own evidence in repository data and external verification records, not in a PAP
  package.

When PAP exists and is reviewed, it may consume a CORE-000 artifact as a subject, but CORE-000 does
not claim that it does today.

### 8.7 Acceptance and conformance plan for a future CORE-000 implementation

A future CORE-000 implementation PR is acceptable when:

1. **Model conformance.** The 14 kinds, 29 relation declarations (12 reciprocal pairs plus five
   without an inverse), schemas, provenance binding and `verifyProvenance` hook in §5 are
   implemented or the deviations are documented and accepted.
   The model does not use CORE-001 vocabulary.
2. **Pipeline conformance.** The project builds through the existing `runBuild` path with a
   consumer harness; `spec/lib/` is untouched by the CORE-000 PR (or a separate core change is
   proposed and accepted first).
3. **Self-validation.** E1–E8 and E10 of §7.10 pass at a pinned commit, with the artifact,
   diagnostics and identity recorded.
4. **Negative conformance.** N1–N18 of §7.8 fail with the expected codes, layers/phases and no
   artifact.
5. **Trust honesty.** Every trust statement matches the merged #35/PR #50 facts; `TB-PROFILE-EXEC`
   is settled/explicit-consent; no pending, sandbox or absent-consent claim remains.
6. **Evidence honesty.** No claim is marked `independently_verified` without an external
   verification record; implemented/tested claims cite code/tests; guarantees have conditions and
   evidence.
7. **Independent verification.** At least the §8.2 minimum scope is performed by a verifier
   distinct from the author, or the PR states that it is an incomplete draft and why.
8. **Review.** A maintainer reviews the model, the artifact, the diagnostics and the verification
   record; the PR is left unmerged (or merged by a person, per the repository rule for this task).

The design version of this plan (this PR) is accepted when the review checklist in §12 is
satisfied, not when a CORE-000 build passes. The design and the implementation are separate
acceptance events.

---

## 9. Generic-core gap report

These are findings about capabilities CORE-000 would benefit from. Each is a **separate
proposal**; none is implemented by this PR, and none is a precondition for the first
self-validation experiment unless stated. The first experiment is deliberately scoped to
capabilities that exist today.

### G1 — Evidence files do not participate in the build identity

**Observation.** `inputDigest` covers the manifest, declared inputs, sources, profile closure and
adapter/renderer closures (BI). It does not cover code or test files cited as evidence. A code
change can therefore make an `implementation_fact` or `tested` claim stale without changing the
CORE-000 `inputDigest` or failing the build.

**Impact.** The build cannot detect claim/evidence drift. The self-contract can be green while its
evidence no longer describes the code. This is the most important limitation of self-validation.

**Workaround in the experiment.** The claim's `evidence.revision` pins the commit; the external
verification path re-checks the cited path and command at that revision. The build marks evidence
as a reference, not as proof.

**Proposal (separate issue).** Add a raw-file adapter or an `evidence` input declaration that
includes cited files in `inputDigest` (with path containment, optional absence and a clear
diagnostic when an evidence path disappears). Do not add it to the core merely for CORE-000; a
second consumer should justify it. Priority: high after the first experiment; depends on the
public API/CLI direction (G4) and the provenance work (G3).

### G2 — No declarative cross-entity rule primitives

**Observation.** The M1 core implements no declarative rule primitives; the profile hook is the
mechanism (D15 narrowed; M:R4). CORE-000's claim/evidence/decision checks are cross-entity and
cannot be expressed with the contract's closed primitive set even if it were implemented.

**Impact.** CORE-000 policy lives in a trusted profile hook. The hook is versioned and digest-pinned
but not independent, and its correctness is not checked by the generic core. This is acceptable
for an experiment; it is not a basis for third-party assurance.

**Proposal (separate issue).** After the M3 second profile, evaluate which CORE-000 checks
generalise into primitives (for example "relation target has kind X", "entity has at least one
relationship of type Y"). Do not add a CORE-000-specific primitive. Priority: medium; depends on
M3 evidence.

### G3 — Provenance is coarse and core quote verification is proposed

**Observation.** The markdown adapter supports section, table-column and ordered-item locators. It
does not support paragraph/range locators or a declared source-byte pin; the accepted V4 work is
not implemented (M:V4). Binding versus verification is implemented (#37): the profile verifier
supplies a record and the core validates it, but the core still does not own quote verification
(D25 proposed).

**Impact.** CORE-000 can prove a quote exists in a section, not that it is atomic or that the
source is the pinned revision by bytes. A claim's provenance can be weaker than it appears.

**Proposal (separate issue).** Implement the accepted provenance-hardening RFC (#45) in its own
PRs, migrate CORE-001 first, then use paragraph locators and `identity.sha256` for CORE-000. Do
not make CORE-000 depend on it before it exists; the first experiment uses section locators and
marks the precision limit. Priority: high; already accepted, not scheduled here.

### G4 — The public API and CLI are not generic

**Observation.** The only build entry point a consumer can call is `runBuild(BuildOptions)`; the
package publishes no API surface with `loadProject`/`validateProject`/`buildProject`/
`renderModel`/`checkArtifacts`, and the CLI has no `validate`/`build`/`check` subcommands
(M:K2,K3). The internal `loadProject` module function exists, but it is not a published contract.
The CLI imports the CORE-001 renderer conditionally (`spec/cli-renderers.ts`) but has no generic
profile-selection surface, so it cannot select an arbitrary profile renderer without a code
change. The package is private with no `exports`.

**Impact.** The CORE-000 experiment needs a consumer harness/test that registers the CORE-000
renderer. That harness is not part of the public API, and its own behavior is not a contract. The
experiment can run, but a third party cannot invoke CORE-000 in the same way.

**Proposal (separate issue).** Implement the accepted public API and CLI contract (M2), then make
the CLI profile-aware through the consumer registry rather than a hard-coded import. Do not change
it in this design task. Priority: high for product use; not required for the first experiment.

### G5 — One renderer and one artifact in M1

**Observation.** M1 now validates exactly one `manifest.render` declaration (#38; contract §3.1)
and the build checks `artifacts.length !== 1`; multiple renderers/artifacts remain M2. A zero or
multiple declaration is `core.manifest.invalid` before rendering.

**Impact.** CORE-000 cannot produce both a human-readable Markdown artifact and a machine-readable
JSON claim export in one build. The input data is machine-readable, but the rendered artifact is
Markdown only.

**Proposal (separate issue).** Implement the `Artifact[]` multi-renderer behavior in M2; then add a
JSON renderer for the claim register/evidence graph. Until then, the Markdown artifact plus the
YAML inputs are the machine-readable surface. Priority: medium; depends on M2.

### G6 — Multi-source is untested

**Observation.** The contract describes N sources; M1 exercises one. The loader loops over sources,
but the CORE-001 hook consumes `sources[0]`, and no test builds a two-source project (M:A2).

**Impact.** CORE-000 cannot quote the contract, the matrix and the build-identity note as three
provenance sources. It uses one source (the contract) and treats the other documents as evidence
references. Claims about the matrix or the identity note are not provenance-verified.

**Proposal (separate issue).** Define and test multi-source semantics (#5, M4); then declare one
source per document and give source statements a source id. Priority: medium.

### G7 — Review dimensions and a typed verification record are not core features

**Observation.** `ReviewState` is opaque in M1; typed review dimensions are deferred (M:R5). The
core now has a provenance-specific `VerificationRecord` (#37), but no independent-verification
record concept.

**Impact.** CORE-000 encodes review/verification as profile data and hook checks. The engine
cannot distinguish "claim data says a human reviewed it" from "a human reviewed it"; only the
external record and the maintainer can.

**Proposal (separate issue).** Do not reuse the provenance `VerificationRecord` as an independent
verification. Do not add a generic independent-verification type to the core merely for CORE-000.
If M4 review dimensions are implemented, map the CORE-000 independent-verification record onto
them; otherwise keep it external. Priority: low/medium; depends on M4.

### G8 — No attestation, signature or package format

**Observation.** The CORE-000 artifact is a file with a digest; there is no signature, attestation
or package. PAP is a separate track (#43/#44) and is not implemented.

**Impact.** The artifact is not tamper-evident to a third party beyond comparing its SHA-256, and
the producer can rewrite the claim register and rebuild. The external verification record is a
separate document; it does not make the artifact authentic.

**Proposal.** Do not design PAP here. If a portable, signed self-contract is needed later, the PAP
track or a separate decision record owns it. CORE-000 records the limitation and does not claim
authenticity. Priority: deferred/out of scope.

---

## 10. Unresolved maintainer decisions

Decisions D1–D7 and D9–D15 are **not** taken by this document; each has options, a recommendation
and the consequence of choosing it. D8 is recorded as resolved by Issue #35/PR #50 and retained
for traceability. The recommendations are proposals, not decisions.

### D1 — CORE-000 project location and profile distribution

**Question.** Where do the project and profile live, and are they distributed as a package?

**Options.**

- **A (recommended):** project at `contracts/core000/`, profile at `profiles/core000/`, both in
  this repository; profile referenced with `external: true`; no publication.
- **B:** project under `spec/core000/` and profile under `spec/core000/profile/`; simpler paths,
  but it mixes the self-contract with the CORE-001 demo project and changes the `spec/` layout.
- **C:** a separate repository/package; independent distribution, but no current packaging support
  (M:X1/X2) and more process than the experiment needs.

**Consequence.** A keeps the existing project/profile/trust pattern and the contract §14
`contracts/` direction. B reduces `external: true` usage but weakens the boundary exercise. C is
premature. Choosing A does not authorize a package or publication.

### D2 — Kind set and class modelling

**Question.** Adopt the 14-kind model and the `claim` class field, or use a different split?

**Options.**

- **A (recommended):** 14 kinds as in §5.2, one `claim` kind with a closed `class` enum.
- **B:** one `claim` kind plus one generic `surface` kind; fewer schemas, weaker typed relations
  and more hook policy.
- **C:** a separate kind per claim class (guarantee, assumption, constraint, …); more schemas and
  duplicated relations, but class-specific schemas.
- **D:** mirror CORE-001's kind set; rejected by A3, listed only to show the alternative was
  considered.

**Consequence.** A balances typed structure and policy; B weakens generic checks; C increases
schema count and maintenance. The decision affects the profile schema files and the hook.

### D3 — Claim status vocabulary

**Question.** Reuse the #39 six status terms and four dimensions, or define a CORE-000-specific
vocabulary?

**Options.**

- **A (recommended):** reuse #39's `accepted`/`proposed`/`deferred`/`implemented`/`tested`/
  `independently_verified`/`—` in the four dimensions; data uses `none` for `—`. An open decision
  is a `decision` entity with status `unresolved`.
- **B:** a CORE-000-only enum with a single status; simpler rendering, but loses the separation
  the task requires.
- **C:** a state machine with transitions (`draft → reviewed → verified`); richer, but the engine
  cannot enforce the transitions and the #39 vocabulary already exists.

**Consequence.** A keeps the self-contract comparable with the matrix and avoids a seventh status.
B repeats the exact mistake #39 was created to fix. C adds process without evidence enforcement.

### D4 — Independence representation

**Question.** How is independence represented: a boolean, an enum, or an external record?

**Options.**

- **A (recommended):** `independence` enum (`author`/`non_author`/`independent`/`unknown`) plus a
  separate `independent_verification` entity with method, scope, result and record locator. It is
  not the core provenance `VerificationRecord`.
- **B:** a boolean `independent` on the claim; loses the verifier, method, scope and record.
- **C:** only an external free-text note; flexible, not machine-checkable.

**Consequence.** A makes the absence of independence visible and prevents the engine from setting
it. B is the self-certification failure mode. C cannot be checked for completeness.

### D5 — Provenance scope

**Question.** Which claims must have a contract quote, and what is the source policy?

**Options.**

- **A (recommended):** `source_statement` is the only provenance-bearing kind; every source
  statement must quote the source and carry a stored verification record (#37); a claim cites
  source statements optionally, and requirement/guarantee claims should cite at least one source
  or decision; implementation facts cite evidence. The verification policy is D15.
- **B:** every claim must have a quote; forces fabricated or irrelevant quotes for implementation
  facts.
- **C:** no provenance requirement; loses the source link and the ability to detect source drift.

**Consequence.** A keeps provenance meaningful and lets implementation facts use code evidence. B
is dishonest. C weakens the self-contract. The source is one document until multi-source (G6).

### D6 — Source of truth for the claim register

**Question.** Is the register declared data, or generated from code annotations/tests?

**Options.**

- **A (recommended):** declared project data (`claims.yml`), with code/test evidence locators; the
  engine renders it and the hook checks consistency.
- **B:** annotations in code/test comments, extracted by a generator; closer to code, but adds a
  generator, couples the contract to implementation structure, and makes drift look authoritative.
- **C:** hand-written Markdown only; readable, not machine-checkable.

**Consequence.** A is the only option that is both machine-readable and independent of the code it
describes. B makes the implementation the author of its own contract. C fails the task.

### D7 — Release gate for CORE-000

**Question.** Should a CORE-000 `release` build be blocked while review diagnostics remain?

**Options.**

- **A (recommended):** release blocks on `review` diagnostics (unresolved decisions, missing
  independent verification); draft renders with visible markers. The consent policy is settled and
  is not a blocker. This mirrors CORE-001's release gate.
- **B:** allow release with markers; publishes an unverified self-contract as if final.
- **C:** block draft too; prevents internal review and iteration.

**Consequence.** A is honest and matches the M1 gating behavior. B is the failure the provenance/
review work exists to prevent. C makes review impossible. A means CORE-000 cannot be released
until an external verification record exists; that is intended.

### D8 — Resolved: #35 consent policy and reconciliation ownership

**Status: resolved by Issue #35 / PR #50 and the §6.4 reconciliation.** The former question was
how to represent a pending consent policy. The merged outcome is now the source of truth:
`BuildOptions.allowExecutableProfile` default false, CLI `--allow-executable-profile`, fail-closed
`core.profile.consent-required`, per-invocation consent not in `inputDigest`, and no sandbox or
isolation. CORE-000 adopts that outcome in §6 and the C000-TR claims. Remaining related choices
(per-module granularity, declarative-only buildability, consent-surface model, isolation) are
listed as open in D13/D14 and §11; they do not re-open #35.

### D9 — Relationship to PAP/independent verifier

**Question.** Does CORE-000 depend on or design the PAP/verifier track?

**Options.**

- **A (recommended):** reference-only; CORE-000 uses its own evidence and external review record;
  PAP may consume CORE-000 later but is not designed here.
- **B:** design CORE-000 as a PAP producer now; violates C14 and expands scope.
- **C:** ignore PAP; acceptable for this design, but the boundary should be stated so a reader does
  not assume CORE-000 is the verifier.

**Consequence.** A keeps scope and leaves the future composition open. B is out of scope. C is
close but leaves ambiguity; the design states the boundary regardless.

### D10 — Experiment harness and CLI

**Question.** Run the experiment through the existing CLI, a consumer harness, or a core change?

**Options.**

- **A (recommended):** a consumer test/harness that calls `runBuild` with
  `allowExecutableProfile: true` and registers the CORE-000 renderer; no core/CLI change.
- **B:** make the CLI profile-aware now; a generic-core/CLI change that requires its own issue and
  tests.
- **C:** reuse the CORE-001 renderer for CORE-000; wrong artifact and hides the gap.

**Consequence.** A is executable today and keeps the core untouched. B is the M2 direction but out
of scope. C is not a self-description of CORE-000.

### D11 — Schema IDs and versioning

**Question.** What `$id` host and versioning scheme should the CORE-000 schemas use?

**Options.**

- **A (recommended):** `https://core000.local/schemas/<name>.schema.json` (matching the
  `core001.local`/`example.local` convention), with a profile version `0.1.0` and schema `$id`
  changes only when the schema contract changes. The host is a local placeholder, not a
  resolvable web URL.
- **B:** a real public host now; requires publication and a stable domain, which is premature.
- **C:** no `$id`; rejected because the loader requires a real `$id` (`ERR_SCHEMA_DEFINITION`).

**Consequence.** A is consistent with the repo's local-placeholder convention and works offline.
B is a publication decision (D20). C fails the schema loader.

### D12 — Normative status of the rendered artifact

**Question.** Is the rendered CORE-000 Markdown artifact itself normative, or only the claim data?

**Options.**

- **A (recommended):** the data is the source of truth; the artifact is a projection and is
  informative. Only claims with `class: requirement`/`constraint`/`guarantee` and `decision:
  accepted` are normative for the project.
- **B:** the artifact is normative; a reader could rely on a stale rendering and editing it would
  change the contract.
- **C:** both are normative; creates two sources of truth and drift.

**Consequence.** A matches the repository's artifact rule (generated Markdown is never the source
of truth). B and C invert it.

### D13 — Independent-verification record schema and naming

**Question.** How should CORE-000 represent an independent review, given that #37 introduced a
core provenance `VerificationRecord`?

**Options.**

- **A (recommended):** a separate `independent_verification` kind with its own schema,
  `independence`/`independence_basis`, method, scope, result and external record locator; never
  reuse the core provenance `VerificationRecord`.
- **B:** reuse the core `VerificationRecord` shape and add independence fields; fewer schemas, but
  it conflates a binding check with an independent review.
- **C:** a free-text external note; flexible, not machine-checkable.

**Consequence.** A keeps the #37 distinction and makes the claim status `independently_verified`
checkable. B is the confusion #37 removed. C cannot enforce the record fields.

### D14 — Consent-surface representation in the model

**Question.** How should the model represent the merged consent API/CLI surface?

**Options.**

- **A (recommended):** add interface entities for the API option and CLI flag, a diagnostic entity
  for `core.profile.consent-required`, and set `TB-PROFILE-EXEC` to
  `policy_status: settled`/`enforcement: explicit_consent`.
- **B:** describe consent only in the trust-boundary statement; smaller model, but the public
  consent surface has no claim/interface row.
- **C:** model a separate declarative/executable profile class; a larger design change that PR #50
  did not make.

**Consequence.** A makes the merged policy visible in the self-description and keeps the model
consistent. B leaves a public surface under-described. C is an open product decision, not a
current fact.

### D15 — Provenance-verification policy for CORE-000 claims

**Question.** Must every `source_statement` have a checked verification record before it can
support a normative claim?

**Options.**

- **A (recommended):** require a stored `verified` record for every source statement used by a
  normative claim; `failed`/`stale`/`unavailable` is an error, and a missing verifier is an error.
- **B:** treat an unverified binding as a review diagnostic; draft renders, release blocks.
- **C:** no requirement; the binding alone is enough. This contradicts #37's distinction and is
  rejected.

**Consequence.** A is honest and testable; B is softer and more permissive; C presents a binding as
verified evidence and is not acceptable. A makes the provenance verifier mandatory for the
CORE-000 profile.

---

## 11. Limitations of this design

1. **Not implemented or executed.** There is no CORE-000 project, profile, hook, renderer, artifact,
   diagnostic set or `inputDigest`. The plan is a design; the experiment must be run in a follow-up
   PR.
2. **Statuses are inherited, not independently re-audited.** The register's implementation/test
   statuses come from the #39 matrix at `f1ddcf7` plus its #35/#36/#37 snapshot updates; #38 is
   cited from contract §3.1 and `tests/manifest.test.ts`. The reconciled code is at `260de89`, and
   a later change invalidates the affected rows. The matrix's documentation drift is not repeated
   here.
3. **Claims are author-asserted data.** The profile hook can check that an `implemented` claim has
   evidence, that a `tested` claim has a test record, and that a verification record is structurally
   independent. It cannot check that the evidence is sufficient, current or true.
4. **No independent verification exists.** Every independent-verification dimension is `—`. The
   §8.2 protocol is designed but not performed. A CORE-000 release build is expected to be blocked.
5. **Trust boundary is reconciled but not isolated.** Consent is explicit, fail-closed and
   per-invocation; executable profile code still runs in-process with builder privileges. No
   sandbox/isolation exists (D32 deferred), per-module consent and declarative-only builds remain
   open, and consumer-imported adapters/renderers are outside the engine gate.
6. **Model and schemas are proposals.** The 14 kinds, 29 relation declarations (12 reciprocal
   pairs plus five without an inverse), field names, status enums and policy checks may change
   during implementation. The document does not create the
   schema files, `verifyProvenance` hook, independent-verification schema or renderer.
7. **Provenance is coarse.** Binding and verification are separate (#37), but locators are
   section/table/item only; paragraph locators and a declared source-byte pin are accepted and
   unimplemented (V4). The source is one document; multi-source is untested. A `verified`
   provenance record is not independent verification.
8. **No cross-platform determinism or security claim.** The plan tests same-environment
   determinism. The contract's conditional determinism is not a cross-platform promise, and the
   trust boundary is not a security audit.
9. **No claim of completeness.** §4.4 explains which details are not individually identified. A
   reviewer may find a public surface that has no claim; that is a finding for the implementation
   PR, not evidence that the design covers everything.
10. **No actual artifact/digest/diagnostic count.** The plan states expected codes and conditions,
    not exact bytes/counts. Inventing them would be a claim without evidence.
11. **The location decision is open.** The `contracts/core000/` layout assumes D1 option A. If the
    maintainer chooses another location, the manifest paths and the experiment invocation change,
    not the model.
12. **No legal, normative or certification effect.** CORE-000 is a working identifier and a
    project artifact; it is not a UIA standard, a legal opinion or a certificate.

---

## 12. Review checklist and acceptance of this design

### 12.1 Mapping to the assignment's acceptance criteria

| Assignment criterion | Where this document addresses it |
|---|---|
| A1 purpose and boundary describe the public engine contract, no UIA-standard claim | §1.2–1.4, §3.1, §4.2.1 |
| A2 requirements, facts, tests, independent verification, proposals, deferrals, limitations and decisions are visibly distinct | §0.2, §2, §4 (separate dimensions and tables) |
| A3 model represents components, interfaces, lifecycle, guarantees, constraints, dependencies, trust boundaries, decisions, provenance and evidence without CORE-001 vocabulary | §5.2–5.10, §5.11 |
| A4 important claims have stable IDs or an explicit reason, plus status and evidence/verification method | §4.1–4.4 |
| A5 self-build/self-validation is not independent verification or proof | §1.3, §2.7, §7.2, §8 |
| A6 generic-core checks, profile checks, implementation evidence and external verification have distinct responsibilities | §3.2–3.3, §5.7, §8.4 |
| A7 experiment uses the existing pipeline and includes the required negative cases | §7.3–7.8 |
| A8 generic-core gaps are separate proposals; no generic-core implementation | §9 |
| A9 current executable-profile execution is reconciled with the merged #35/PR #50 consent policy: explicit consent, fail-closed before import, in-process builder privileges, no sandbox/isolation | §6, §4.2.4 |
| A10 at least one independent verification path is concrete; no claim it was performed | §8.2–8.3, §8.5 |
| A11 open decisions, limitations and consequences recorded; no unrelated CORE-001 changes | §10, §11; PR scope |
| A12 one focused PR opened and left unmerged | PR for this document; not merged |

### 12.2 What the reviewer should check

1. **No invented policy.** Every trust-boundary statement matches the merged #35/PR #50 facts:
   explicit API/CLI consent, default false, fail-closed `core.profile.consent-required`, per
   invocation, not in `inputDigest`, no sandbox/isolation. No pending or re-decided consent policy
   remains.
2. **No self-certification.** The document repeatedly separates self-consistency from independent
   verification and never claims the latter.
3. **No hidden core change.** The design uses existing capabilities; gaps are in §9, not patched.
4. **No CORE-001 vocabulary in the model.** The kinds/relations in §5 are generic; CORE-001
   appears only as context.
5. **Claim register sanity.** Every accepted claim has an accepted decision; `deferred` links a
   deferred decision; `none` is either no decision or an unresolved one; a `proposal` may link no
   decision, a proposed decision or an unresolved one; every implemented/tested claim has evidence;
   every guarantee has conditions; every independent-verification row is `—`; every
   `independent_verification` uses the canonical §8.3 field set.
6. **Experiment executability.** The manifest/profile/input shapes match the implemented loader;
   the harness passes `allowExecutableProfile: true`; the renderer harness is a consumer, not a
   core change; the negative cases name the actual diagnostic layers/codes, including the #36
   inverse, #37 provenance-verification and #38 render-cardinality failures.
7. **Scope discipline.** No implementation, no PAP/verifier design, no sandbox, no package split,
   no CORE-001 change, no public-contract/M1 rewrite.
8. **Honesty.** Limitations and unresolved decisions are explicit; the design does not claim a
   result it has not produced.

### 12.3 Design acceptance vs implementation acceptance

- **This design is accepted** when a maintainer reviews the document against §12.1–12.2 and records
  the decision. Acceptance of the design does not accept the model as final and does not schedule
  implementation.
- **A future implementation is accepted** when §8.7 is satisfied, including the negative cases and
  the independent verification record. A successful self-build alone is not enough.

### 12.4 Evidence of this design's own checks

This PR is documentation-only. The checks that apply are:

- `bun run typecheck` → clean;
- `bun test` → 169 pass, 0 fail (12 files) on the reconciled current main `260de89`;
- `bun run check` → clean; the current CORE-001 artifact is
  `8213a26379f1fb6e7227ce90a9db6db08e3820bd42a579eb38c2adf5dc269b51` (327 lines), and this PR does
  not modify it;
- no generated artifact, schema, fixture or CORE-001 content changed by this PR;
- the document renders as Markdown and its tables are readable.

Those checks prove the repository is green and this PR is documentation-only. They do not prove
the design is correct; that is the maintainer's review.

---

## Appendix A — Source map used for the design

| Source | Used for |
|---|---|
| [`engine-public-contract.md`](engine-public-contract.md) | Accepted public contract, decision register D1–D33, consent/inverse/provenance/render sections |
| [`implementation-status.md`](implementation-status.md) | As-of implementation/test/verification statuses, verification audit §7, drift §8 |
| [`m1-implementation-plan.md`](m1-implementation-plan.md) | M1 decisions, implementation choices, deferred capabilities |
| [`build-identity.md`](build-identity.md) | `inputDigest`, closures, import-scan boundary |
| [`provenance-hardening-rfc.md`](provenance-hardening-rfc.md) | Accepted paragraph locators and source digest, implementation not started |
| [`portable-assurance-package-rfc.md`](portable-assurance-package-rfc.md) | Separate PAP/verifier track; boundary only |
| [`../superpowers/specs/2026-11-01-core001-spec-builder-design.md`](../superpowers/specs/2026-11-01-core001-spec-builder-design.md) | MVP design context and unresolved questions |
| [`../agents/task-envelope.md`](../agents/task-envelope.md) | The task/report convention used by #47 and this report |
| [`README.md`](../../README.md) | Current user-facing description and documented limitations |
| [Issue #47](https://github.com/agent-federation/contract-builder/issues/47) | Design questions, deliverables, acceptance criteria, non-goals |
| [Issue #35](https://github.com/agent-federation/contract-builder/issues/35) / [PR #50](https://github.com/agent-federation/contract-builder/pull/50) | Merged executable-profile consent policy, adopted here |
| [Issue #36](https://github.com/agent-federation/contract-builder/issues/36) / [PR #52](https://github.com/agent-federation/contract-builder/pull/52) | Reciprocal inverse contract; 28 declared relations |
| [Issue #37](https://github.com/agent-federation/contract-builder/issues/37) / [PR #55](https://github.com/agent-federation/contract-builder/pull/55) | Binding/verification lifecycle; `VerificationRecord` |
| [Issue #38](https://github.com/agent-federation/contract-builder/issues/38) / [PR #56](https://github.com/agent-federation/contract-builder/pull/56) | Single `manifest.render` declaration |
| [Issue #39](https://github.com/agent-federation/contract-builder/issues/39) / [PR #48](https://github.com/agent-federation/contract-builder/pull/48) | Status vocabulary and verification audit |
| [PR #46](https://github.com/agent-federation/contract-builder/pull/46) | Synthetic independent profile: evidence that a non-CORE-001 profile runs through the core |
| [PR #45](https://github.com/agent-federation/contract-builder/pull/45) | Accepted provenance-hardening decisions |
| [PR #49](https://github.com/agent-federation/contract-builder/pull/49) | PAP RFC merge; historical baseline note |

## Appendix B — Proposed CORE-000 conformance case catalogue

The cases below are the planned conformance surface. `req` marks the four required by #47. They
are not implemented in this PR.

| Case | Type | Input | Expected | Covers |
|---|---|---|---|---|
| CC-POS-001 | positive | full `contracts/core000` project, draft | exit 0; artifact; expected review codes; identity | model, pipeline |
| CC-POS-002 | positive | same project, release | exit 1; `blockedBy: review`; no release artifact | release gate |
| CC-POS-003 | positive | same project, second process | same artifact SHA-256 and `inputDigest` | determinism |
| CC-POS-004 | positive | change one claim, rebuild | `inputDigest` changes; artifact changes | identity sensitivity |
| CC-NEG-001 | negative | interface owner not provided by its component (N1) | `core000.model.interface-owner-mismatch`; no artifact | req |
| CC-NEG-002 | negative | claim depends on a missing claim/relation (N2) | `ERR_UNKNOWN_REF`; no artifact | req |
| CC-NEG-003 | negative | implemented claim without evidence (N3) | `core000.claim.implemented-without-evidence`; no artifact | req |
| CC-NEG-004 | negative | guarantee without conditions/evidence (N4a) | `core000.claim.unsupported-guarantee`; no artifact | req |
| CC-NEG-005 | negative | independently_verified without external record (N4b) | `core000.claim.verification-not-independent`; no artifact | req |
| CC-NEG-006 | negative | duplicate claim ID (N5) | `ERR_DUPLICATE_ID`; no artifact | identity |
| CC-NEG-007 | negative | unknown kind (N6) | `core.profile.unknown-kind`; no artifact | kind set |
| CC-NEG-008 | negative | undeclared relation key (N7) | `core.relation.unknown`; no artifact | relations |
| CC-NEG-009 | negative | quote outside locator (N8) | `core000.source.verification-failed`; no artifact | provenance |
| CC-NEG-010 | negative | self-asserted independence (N9) | `core000.independent-verification.self`; no artifact | independence |
| CC-NEG-011 | negative | consent policy contradicted (N10) | `core000.claim.policy-mismatch`; no artifact | trust |
| CC-NEG-012 | negative | accepted claim with unresolved decision (N11) | `core000.claim.decision-required`; no artifact | decisions |
| CC-NEG-013 | negative | status/class contradiction (N12) | `core000.claim.status-class-conflict`; no artifact | model policy |
| CC-NEG-014 | negative | missing/mismatched claim subject (N13) | `core000.claim.missing-subject`; no artifact | model policy |
| CC-NEG-015 | negative | missing executable-profile consent (N14) | `core.profile.consent-required`; no profile code evaluated | consent |
| CC-NEG-016 | negative | provenance verification missing/unusable (N15) | `core000.source.verification-missing`; no artifact | provenance |
| CC-NEG-017 | negative | non-reciprocal inverse (N16) | `core.profile.invalid`; no artifact | inverse contract |
| CC-NEG-018 | negative | wrong render cardinality (N17) | `core.manifest.invalid`; no artifact | render contract |
| CC-NEG-019 | negative | malformed verification claim (N18) | `core.provenance.verification`; no artifact | provenance verification |

## Appendix C — Minimal data example (one component, one interface, one claim)

This appendix shows the data shape only. The `source_quote` and `source_ref` strings are
placeholders: the implemented data must copy the exact source text and use a locator the current
adapter resolves. A placeholder quote is not evidence and must fail the provenance verification.
The source statement does not carry a `verification` input field: the profile `verifyProvenance`
hook supplies the record and the core stores it on `Entity.verification`.

```yaml
# structure.yml
components:
  - id: COMP-CORE
    name: "Contract Builder core"
    responsibility: "Generic engine mechanisms."
    boundary: engine
    public: true
    relations: { provides: [IF-BUILD-IDENTITY] }
interfaces:
  - id: IF-BUILD-IDENTITY
    name: "Build identity"
    surface: data
    stability: accepted
    description: "The identity object on BuildResult."
    owner: COMP-CORE
```

```yaml
# claims.yml
sourceStatements:
  - id: SRC-BUILD-RESULT
    source: SRC-ENGINE-CONTRACT
    source_ref: "SRC-ENGINE-CONTRACT#8"
    source_quote: "<exact sentence from the accepted contract §8; placeholder, not evidence>"
claims:
  - id: C000-CT-010
    author: "it-start"
    statement: "Build identity exposes projectId, engineVersion, manifestVersion, inputDigest and the extensions list."
    class: requirement
    status: { decision: accepted, implementation: implemented, tests: tested, verification: none }
    authority: engine
    lifecycle: active
    verification_method: "bun test tests/identity.test.ts"
    scope: "BuildResult.identity at current main 260de89"
    subject_kind: interface
    relations:
      subject: [IF-BUILD-IDENTITY]
      cites: [SRC-BUILD-RESULT]
      evidencedBy: [EV-IDENTITY-CODE, EV-IDENTITY-TEST]
      decidedBy: [D10]
evidence:
  - id: EV-IDENTITY-CODE
    kind: code
    locator: "spec/lib/identity.ts"
    revision: "260de89"
    description: "computeBuildIdentity returns the identity object."
    producer: "repository"
    independence: author
    availability: available
  - id: EV-IDENTITY-TEST
    kind: test
    locator: "tests/identity.test.ts"
    revision: "260de89"
    description: "Identity tests cover the digest and extension list."
    producer: "repository"
    independence: author
    availability: available
```
