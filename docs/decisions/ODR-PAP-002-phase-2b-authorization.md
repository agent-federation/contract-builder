# ODR-PAP-002 — Owner Decision Record: Phase 2b Scope and Authorization

**Status:** APPROVED
**Date:** 2026-11-02
**Decision scope:** PAP v0.1 independent verifier, Phase 2b
**Planning baseline:** `agent-federation/contract-builder-independent`
**Plan branch:** `docs/phase-2b-plan`
**Plan revision:** `2082e79061853696e3696dbc26dc1cabe67418e1`

## 1. Context

The Phase 2b planning document has undergone two review revisions.

The latest revision:
- distinguishes the narrower normative implementation step 2b in RFC §14 from the proposed expanded project scope;
- separates mandatory CLI behavior from document-shape comparison for `inspect` and `explain`;
- corrects the requirement-to-test traceability matrix;
- preserves the distinction between verdict and coverage;
- defines `results.json` as a proposed runner/reporting artifact, not a normative PAP schema;
- documents unresolved dependency-integrity semantics and other implementation assumptions.

The plan has been reviewed as a planning artifact. No Phase 2b implementation has been authorized or started.

This record makes the owner decisions necessary to establish an unambiguous implementation boundary.

## 2. Decision 1 — Phase 2b scope

**Decision: APPROVE the expanded Phase 2b scope proposed in `phase-2b-plan.md`, subject to the qualifications in this record.**

Phase 2b is authorized as an owner-approved project phase covering completion of the proposed Tier A verifier functionality.

The approved candidate case set is:

- F01–F10
- F14
- F19
- F20–F55
- F57–F61

Tier B cases remain outside this phase:
- F11–F13
- F15–F18
- F56

The implementation target includes:
- Tier A verification and required check evaluation;
- required policy, freshness, recognition, and human-review behavior;
- hostile-input handling and resource-limit enforcement;
- required CLI behavior;
- a reproducible conformance runner;
- a machine-readable execution report (`results.json`) under the proposed runner/reporting contract.

The exact acceptance criteria remain those in the reviewed Phase 2b plan, as qualified by this ODR.

### 2.1 Relationship to RFC §14

This decision does not amend the normative RFC.

RFC §14 continues to define implementation step 2b narrowly as:

- digest-integrity;
- source-quote;
- relation-consistency;
- its stated unsigned-case exit condition, including F44–F46 and no producer imports.

The expanded scope approved here is a project-level implementation decision. It must not be represented as the literal meaning of RFC §14 or as a normative amendment to PAP v0.1.

Any future normative change requires a separate specification change and review.

## 3. Decision 2 — `inspect` and `explain`

**Decision: INCLUDE `inspect` and `explain` CLI functionality in Phase 2b.**

The implementation must provide the mandatory CLI behavior specified by RFC §9 and §13.1, including applicable:
- command and option behavior;
- stream discipline;
- exit-code behavior;
- determinism requirements.

However:

**Exact document-shape comparison across independent implementations is NOT a Phase 2b conformance requirement.**

RFC §13.1 explicitly places the `inspect` and `explain` document shapes outside the mandatory v0.1 conformance subset until stage 2.

Consequently:
- implement the documented CLI functionality;
- test its behavior locally against the applicable specification;
- do not introduce an invented cross-implementation equality contract;
- document any additional output comparison as implementation-specific or proposed behavior.

This decision does not extend the normative PAP v0.1 conformance subset.

## 4. Decision 3 — Python dependency integrity

**Decision: DO NOT block the entire Phase 2b implementation on the unresolved dependency-integrity semantics.**

RFC §5.2 identifies dependency records containing a name, version, and integrity value. It does not establish a sufficiently precise Python-specific acquisition, pinning, and integrity-verification procedure for an independent implementation to claim a particular algorithm as normative.

Therefore:

1. The implementation may proceed with unrelated Tier A requirements.
2. The implementation must not silently invent or claim normative dependency-integrity semantics.
3. Any provisional implementation behavior must be explicitly documented as provisional and must not be presented as proof of RFC-defined dependency integrity.
4. The relevant conformance requirement must not be marked successfully satisfied merely because an implementation-specific metadata check passes.
5. The unresolved semantics must remain visible in the implementation report and conformance results.

A separate normative clarification is required before claiming complete conformance for dependency-integrity behavior.

The owner may later resolve this through a separate RFC amendment or an explicit normative interpretation.

## 5. Decision 4 — Reporting and conformance claims

`results.json` is approved as a Phase 2b runner/reporting artifact, not as a new PAP v0.1 normative schema.

The report must distinguish at least:

- execution status;
- actual verifier verdict;
- expected case outcome;
- conformance comparison result;
- coverage;
- limitations and unresolved requirements.

Skipped or errored cases must never be reported as passing.

Phase 2b completion must not be described as:
- full PAP v0.1 conformance if Tier B remains unimplemented;
- independent interoperability;
- Gate 3 completion;
- proof of dependency integrity where the normative semantics remain unresolved.

## 6. Security and implementation constraints

The following invariants remain mandatory:

- No network access during verification.
- No execution of producer or profile code.
- Producer claims are not verifier evidence.
- Required checks not evaluated must never become PASS.
- Verdict and coverage remain distinct.
- Signature validity and signer trust remain distinct.
- Resource limits must be enforced and their limitations documented.
- The frozen normative handoff snapshot must not be modified.
- No implementation behavior may be inferred from or copied out of the first verifier.

Any unresolved environmental assumptions, including parent-component symlink handling and implementation-defined directory-entry safety limits, must remain explicitly documented.

## 7. Authorization boundary

Following the owner's approval recorded on 2026-11-02:

- The blind independent agent may begin Phase 2b implementation within the scope and constraints above.
- The reviewed plan at commit `2082e79061853696e3696dbc26dc1cabe67418e1` becomes the planning baseline, subject to this ODR.
- The agent may modify implementation code and implementation tests in the independent repository.
- The agent must not modify the frozen handoff snapshot or normative sources under this authorization.
- Any normative ambiguity discovered during implementation must be recorded and escalated, not resolved by invention.
- Changes to the approved scope require a separate owner decision.

This authorization does not permit:
- modifying the original verifier;
- accessing or copying the original verifier's implementation;
- claiming Gate 3 completion;
- merging or publishing a release without separate authorization.

## 8. Completion criteria and subsequent gates

Phase 2b may be considered complete only after:
- all approved in-scope cases have explicit execution results;
- required Tier A behavior has been implemented and tested;
- no required unevaluated check can yield PASS;
- runner output is reproducible and reports limitations honestly;
- all unresolved normative questions are visible;
- implementation evidence and verification commands are recorded;
- the frozen handoff snapshot remains unchanged.

Phase 2b completion is not Gate 3.

Gate 3 remains OPEN and requires a separate independent field-by-field comparison between implementations, with its own evidence and acceptance decision.

## 9. Owner approval

**Proposed decision:** Approve the expanded Phase 2b scope and authorization boundary described in this record.

**Owner decision:** APPROVED

**Owner approval reference:** [ODR-PAP-002](https://github.com/agent-federation/contract-builder/issues/62#issuecomment-6586872238)

**Approved record commit:** To be recorded after the ODR is committed.
