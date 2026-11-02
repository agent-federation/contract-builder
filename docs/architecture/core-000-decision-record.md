# CORE-000 decision record — D1, D13, D14, D15 and P-1–P-6

**Status:** maintainer decision recorded 2026-11-02. This is the canonical CORE-000 decision
record for the S1 package. Six decisions are accepted (D1 A, D13 A, D15 A, P-1 B, P-4 A, P-5 A);
four are explicitly deferred for S1 (D14, P-2, P-3, P-6). The full record remains open for the four
deferred items. This document does not implement CORE-000 and does not change code, tests,
schemas, fixtures, evidence or generic-core behaviour.
**Issue:** [#47](https://github.com/agent-federation/contract-builder/issues/47), refreshed by
[#72](https://github.com/agent-federation/contract-builder/issues/72).
**Decision recorded:** 2026-11-02, after PR #74 merged as
[`1c405c2`](https://github.com/agent-federation/contract-builder/commit/1c405c2876c030f8855f777e160ca9f9f638af45).
**Decision source:** [Issue #72 comment 6579841746](https://github.com/agent-federation/contract-builder/issues/72#issuecomment-6579841746)
by `zaebee` (maintainer).
**Planning baseline:** [`c6ee644`](https://github.com/agent-federation/contract-builder/commit/c6ee64416c91ab56f9d8270114c8f8a8b9d2f608)
(PR #73; includes #59, #60, #61, #64, #66, #67 and the PAP verifier). The original record baseline was
[`b8e67a8`](https://github.com/agent-federation/contract-builder/commit/b8e67a8bf74897b8c44399931d17477abccd78ec);
the refresh found no code or profile change that affects these decisions (see
[`core-000-baseline-refresh.md`](core-000-baseline-refresh.md)). The accepted design is
[`core-000-self-contract.md`](core-000-self-contract.md) (PR #51); the accepted execution plan is
[`core-000-execution-plan.md`](core-000-execution-plan.md) (PR #59).

> **What this is.** The canonical record of the ten decisions for the CORE-000 S1 package:
> D1, D13, D14, D15 and P-1–P-6. Six are accepted (D1 A, D13 A, D15 A, P-1 B, P-4 A, P-5 A); four
> are explicitly deferred for S1 (D14, P-2, P-3, P-6). A deferral leaves the item open; the full
> record remains open for those four items. For each item the record states the exact question,
> viable options, the decision or deferral, consequences and trade-offs, dependencies,
> reversibility, and the repository evidence that informs it.
>
> **What this is not.** It is not an implementation, a generic-core change, or an independent
> verification. No code or CORE-000 artifact is created by this record. The first-slice proposal in
> [`core-000-self-build-poc.md`](core-000-self-build-poc.md) §10 is approved for implementation only
> after this canonical record merges; it is not implemented here.

---

## Maintainer decision — 2026-11-02

**Source:** the maintainer's [Issue #72 comment](https://github.com/agent-federation/contract-builder/issues/72#issuecomment-6579841746)
on 2026-11-02. This section is the canonical acceptance record; the detailed sections below retain
the full rationale and the open-item analysis.

| ID | Decision status | Effect for S1 |
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
expansion or material deviation requires a new maintainer decision. The four deferred items remain
open for later resolution; they are not finally resolved by this record.

---

## 0. How to answer the open items

For each item, one of the following is enough:

| Answer | Meaning |
|---|---|
| `accept recommendation` | Accept the recommended default exactly as written. |
| `choose A/B/C/…` | Choose a different option; state any modification. |
| `defer` | Leave the item open; state what the first slice may do without it. |
| `record: <text>` | Record a different decision and its consequence. |

The six S1 decisions have been answered by the 2026-11-02 maintainer decision above. The four
deferred items (D14, P-2, P-3, P-6) remain open; the answer format below applies to them and to any
later material deviation. S1 implementation starts only after this canonical record is merged and
the implementation task references it.

---

## 1. Decision summary

| ID | Question | Decision | Status | Needed before the first slice? |
|---|---|---|---|---|
| D1 | Where do the CORE-000 project and profile live? | A: `contracts/core000/` + `profiles/core000/` | **Accepted — A** | Yes — all paths depend on it. |
| D13 | How is an independent verification represented? | A: separate `independent_verification` kind | **Accepted — A** | Yes — S1 includes the kind schema. |
| D14 | How is the consent surface represented? | A: consent interface/diagnostic entities + settled trust boundary | **Deferred for S1 — open** | Only if the slice models consent as interface/diagnostic entities; S1 defers it. |
| D15 | Must every normative source statement have a checked verification record? | A: require a stored `verified` record; failed/stale/unavailable is an error | **Accepted — A** | Yes — S1 includes the provenance policy. |
| P-1 | Complete per-case fixture projects or base + mutations? | B: base project + one deterministic temp-copy mutation per case | **Accepted — B** | Yes — S1 includes negative tests. |
| P-2 | Durable evidence publication/location and summary format? | A: `evidence/core000/<run>/result.json` + human summary | **Deferred for S1 — open** | May follow S1 for durable publication; S1 still writes/asserts the transient record. |
| P-3 | Commit the generated CORE-000 draft? | A: commit after a successful reviewed run | **Deferred for S1 — open** | Can follow the first slice; needed before accepting the generated artifact. |
| P-4 | Renderer dependency? | A: `nunjucks` 3.2.4, declared and lockfile-pinned | **Accepted — A** | Yes — S1 includes the renderer. |
| P-5 | Harness shape? | A: `contracts/core000/run.ts` + `tests/core000.test.ts` | **Accepted — A** | Yes — S1 includes the harness. |
| P-6 | Evidence and independent records in git? | A: commit run evidence and external verification records | **Deferred for S1 — open** | Can follow the first slice; needed before evidence publication. |

“Needed before the first slice” is a dependency note, not a decision. The maintainer accepted
D1 A, D13 A, D15 A, P-1 B, P-4 A and P-5 A on 2026-11-02 and explicitly deferred D14, P-2, P-3 and
P-6 for S1. The separate consumer-harness/G4 confirmation is also recorded for S1; it does not
close G4. A deferral does not resolve an item: the full record remains open for the four deferred
items, and P-2's deferral covers only durable publication/location and the summary format; S1 still
writes and asserts the transient evidence record in every case.

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

**Decision status:** **Deferred for S1 — open.** S1 does not add consent interface/diagnostic
entities; the item remains open for a later decision.

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

**Answer needed:** accept A, choose B/C, or defer the consent-surface entities from the first
slice.

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

**Decision status:** **Deferred for S1 — open.** Only durable publication/location and the
human-readable summary format are deferred; S1 still writes and asserts the transient record.

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

**Answer needed:** accept A, choose B, or defer **durable publication and the summary format**; the
transient S1 evidence record and its schema assertion remain required in every case.

---

## 8. P-3 — Commit the generated CORE-000 draft

**Question.** Should `contracts/core000/output/CORE-000.draft.md` be committed after a successful
run?

**Decision status:** **Deferred for S1 — open.** S1 does not commit the generated draft; the item
remains open for a later decision.

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

**Answer needed:** accept A, choose B, or defer the commit policy.

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
repository?

**Decision status:** **Deferred for S1 — open.** S1 does not commit run evidence or external
verification records; the item remains open for a later decision.

| Option | What it means | Main consequence |
|---|---|---|
| **A (recommended)** | Commit `evidence/core000/` run records and `verification/core000/` external records; keep generated artifacts separate per P-3. | Reviewable, diffable, linked to commits; no private material may be committed. |
| B | Keep evidence/verification records external only. | Avoids repository noise, but review depends on external links and may be less durable. |
| `defer` | Decide after the first run. | The first slice can run without committing evidence; publication waits. |

**Recommended default: A.** The issue asks for reviewable evidence and the plan's format is
designed to be diffable without secrets. Independent records must be authored by a distinct
verifier and must never be engine-generated; committing them makes the independence claim
inspectable. B is acceptable only if durable external storage exists.

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
that the evidence contains no secrets, private material or absolute host paths; and, for
independent records, a verifier distinct from the author and an external record locator. S1 does
not publish evidence and therefore does not depend on this answer.

**Answer needed:** accept A, choose B, or defer record publication.

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
**D14, P-2, P-3 and P-6 are explicitly deferred for S1** and remain open; the consumer harness is
confirmed for S1. P-2's deferral does not defer the transient S1 evidence record or its schema
assertion.

**Authorization:** S1 implementation may start only after this canonical decision-record update is
merged and a dedicated implementation task references the merged record. S1 remains bounded to the
scope below; any expansion or material deviation requires a new maintainer decision.

S1 is a bounded vertical slice with:

- exact files and paths (no generic-core change);
- exact behaviour and expected outputs/diagnostics;
- focused tests and negative cases (N2, N3, N8, N11, N14);
- exclusions (what the slice deliberately does not implement);
- stop conditions if a generic-core gap is hit;
- a review request and an explicit authorization gate before implementation.

The earlier record deferred the first-slice proposal until the decisions were answered; the
maintainer decision above answers the six S1 items, defers the other four and confirms the harness
boundary. No S1 implementation is included here; the implementation is a separate task after this
record merges.

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
- Six decisions are accepted; D14, P-2, P-3 and P-6 are explicitly deferred for S1 and remain
  open. Recommendations for those open items remain proposals. The whole record is not fully
  closed.
- The consumer harness is a test consumer; G4 remains open and is recorded as a separate proposal.
  Harness use is not independent verification.
- No independent verification, certification, security, cross-platform determinism or production
  readiness is claimed; a temporary workspace is not a security sandbox.
- The S1 package is approved, but S1 implementation is authorized only after this canonical record
  is merged and a dedicated implementation task references it. No implementation is included. The
  four deferred items remain open for later decisions.
- **S2 follow-up:** the four open items and the full-model scope are carried into
  [`core-000-s2-package.md`](core-000-s2-package.md). That package is proposed, not authorized, and
  does not resolve any of the four deferred items.

**Requested maintainer action:** merge this documentation-only canonical decision record. No further
decision is needed for S1; after merge, S1 implementation may start when a dedicated implementation
task references this record. The four deferred items (D14, P-2, P-3, P-6) remain open and require
later decisions; the full decision record is not fully closed.
