# ODR-PAP-006 — Owner Decision Record: PAP verdict and decision model

**Status:** APPROVED — maintainer directive in the 2026-11-05 audit follow-up; implementation is sliced in the design note and the resulting issues. The earlier #151 proposal framed A2 as "`coverage.full` is false for every `INCOMPLETE`"; that rule was superseded by this record after the maintainer's independent audit review ([PR #162 review comment](https://github.com/agent-federation/contract-builder/pull/162#issuecomment-6670989689)).
**Date:** 2026-11-05 (UTC)
**Decision scope:** PAP v0.1 verifier semantics — how required dimensions are derived, how the verdict is computed, how invalid input classes map to outcomes, and what conformance cases must assert.
**Related:** audit umbrella [#137](https://github.com/agent-federation/contract-builder/issues/137), architecture stream #151, audit findings #138-#144, RFC [portable-assurance-package-rfc.md](../architecture/portable-assurance-package-rfc.md).
**Design note:** [pap-verdict-model.md](../architecture/pap-verdict-model.md).

## 1. Context

The 2026-11-05 audit reproduced three P0 defects in the verifier whose root cause is the shape of the verdict model rather than any single check:

1. `signature.mode: required` with an unmet `minimumValidSigners` quorum returned `PASS` unless the operator also repeated `signature`/`trust` in `requiredDimensions` (finding #139, fixed in PR #154 as a targeted patch).
2. `String()` enum coercion accepted an invalid policy `"mode": ["required"]` and silently weakened it to `optional` (finding #140, fixed in PR #156).
3. A resource limit inside a signature envelope became `envelope-invalid`/`FAIL` instead of `NOT_EVALUATED`/`INCOMPLETE` (finding #142, still open).

4. `coverage.full` stayed `true` for an `INCOMPLETE` caused by an unmet quorum even once policy-derived requirements were considered, while RFC §7.5 defines coverage as evaluation completeness, not a verdict alias. The earlier #151 proposal recorded A2 as "false for every `INCOMPLETE`"; the maintainer's audit review required reconciling that with §7.5, and §2 A2 below records the accepted rule.

The targeted fixes close the reproductions but not the class: the verdict depends on operator duplication, coercion, and ad-hoc special cases. The conformance corpus does not assert the absence of unexpected diagnostics, so this class can regress silently.

## 2. Decisions

**A1 — An unmet signature quorum is `INCOMPLETE`.** The quorum case is specifically `signature.validity: VALID` with `trust.policyDecision: NOT_EVALUATED`, because fewer distinct authorized valid signers than `minimumValidSigners` were presented; it yields `INCOMPLETE`, a `pap.signature.absent` diagnostic and a limitation. This is **not** a redefinition of explicit rejection: an evaluated `policyDecision: REJECTED` remains `UNTRUSTED` (RFC §7.4 rule 2), and a stale policy remains `INCOMPLETE` (RFC §7.4 rule 4). Evidence: RFC §6.5, §7.4; audit reproduction with F13 and a two-signer policy.

**A2 — `coverage.full` means "every required dimension was evaluated", not "the verdict is PASS".** Per RFC §7.5 it is `false` when a required dimension is not decided (an unmet quorum leaves `trust` `NOT_EVALUATED`, so `full` is false once `signature`/`trust` are derived as required), when a limit stopped evaluation, when the undeclared-file scan is incomplete, and when the required set is empty. It is **not** automatically false for every `INCOMPLETE`: `STALE` is a decided state (§7.5), so a stale policy can yield `INCOMPLETE` with `coverage.full: true` when all required work was evaluated. Evidence: RFC §7.5; the implementation left `full` true when the operator omitted signature/trust from `requiredDimensions`.

**A3 — Required dimensions are derived; `requiredDimensions` only adds.** The policy's requirements and the required checks derive dimensions (`signature.mode: required` ⇒ `signature`, `trust`; `humanReview.required` ⇒ `humanReview`; required checks ⇒ their implied dimensions). A policy that tries to remove a derived requirement is `pap.trust.policy-invalid` (exit 64, no report). This tightens the meaning of a published field and is recorded as an RFC errata (E2) in this change.

**A4 — Invalid policy fails closed without a report.** Any invalid enum/type/field in the trust policy is `pap.trust.policy-invalid`, exit 64, no report. Package input that is invalid produces a report with `integrity.package: FAIL`. Evidence: RFC §6.3.2; audit reproduction with `"mode": ["required"]`.

**A5 — RFC errata now, RFC v0.2 later.** Normative clarifications for §4.3.4 (limits), §6.3/§6.5 (derived requirements, quorum), §7.4/§7.5 (verdict/coverage) and §4.9/§5.3.1 (strict JSON member handling) are applied as an errata section in this change. A full RFC renumbering/revision is deferred and tracked under #151.

**A6 — The code→requirement map lives in the corpus, validated by a test.** A machine-readable `requirements.json` maps every emitted diagnostic code and every R1-R12 requirement to at least one conformance case; a meta-test fails when a code or requirement is uncovered. Runtime code does not carry the map.

## 3. Consequences

- The report shape is unchanged; the verdict and coverage values change only for inputs that were previously under-evaluated or coercible — the intended fail-closed direction.
- The verifier may now return `INCOMPLETE` where it used to return `PASS`; this is a semantic fix, not a regression, and each change is covered by a new conformance case.
- Operators no longer need to duplicate derived requirements in `requiredDimensions`; duplication remains harmless (**additive**).
- The existing 61-case corpus stays the normative §12 corpus; new cases extend it (F62+) and the phase files keep their experiment-scope status.

## 4. Implementation slices (design note §6)

1. **S1** — new `pap/src/state.ts` (extracted from `pap/src/report.ts`): dimension state type, required-dimension derivation, pure `computeVerdict(states, context: VerdictContext)` over states (the caller builds the normalized typed context), property tests for the lattice and coverage invariants.
2. **S2** — `pap/src/decode.ts`: strict typed decoders for policy/manifest/claims/envelope; remove remaining `String()` coercion; table-driven tests for every enum field.
3. **S3** — coverage derivation and an explicit verdict cause; update `report.ts`/`verify.ts`; the quorum patch (#154) becomes an instance of the general rule.
4. **S4** — corpus: `requirements.json`, `diagnosticCodesExact` rollout, meta-test "every emitted code covered", exact noReport assertions.
5. **S5** — documentation: this ODR, the design note, the RFC errata; implementation-status/PAP report updates follow the repository's snapshot convention.

Each slice is a separate pull request with its own tests; S1/S2 do not change any verdict until S3 wires them in.

## 5. Verification

- Each slice runs `bun run typecheck`, `bun test pap/tests`, `bun run pap:test`, full `bun test`, `bun run check`.
- S1 property tests assert: a required `FAIL` implies `FAIL`; a required not-evaluated dimension implies at least `INCOMPLETE`; `PASS` only when every required dimension is in its applicable positive state (`PASS`, `VALID`, `TRUSTED`, `ACCEPTED`, or `NOT_APPLICABLE` where allowed) and no limit was hit; an empty required set yields `INCOMPLETE` with `pap.package.empty-check-specs`; `NOT_EVALUATED` is reserved for the degenerate parsed-package report where no required check could be evaluated.
- S3 boundary tests: quorum unmet ⇒ `INCOMPLETE` + `coverage.full: false`; explicit `REJECTED` ⇒ `UNTRUSTED`; stale policy with all required work evaluated ⇒ `INCOMPLETE` + `coverage.full: true`; empty required set ⇒ `INCOMPLETE` + `pap.package.empty-check-specs`; manifest-level limit ⇒ `FAIL`; post-manifest limit ⇒ `INCOMPLETE`.
- S4 meta-tests assert that every emitted code and every R1-R12 requirement has a case.

## 6. Follow-ups

- RFC v0.2 revision (numbering, Appendix J refresh) is out of scope of this record.
- Compatibility note for consumers that relied on `coverage.full: true` for INCOMPLETE reports: none are known in-repo; external consumers are asked to report through #151 before the errata land in a released version.
