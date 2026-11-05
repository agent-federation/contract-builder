# PAP v0.1 — verdict and decision model (design note)

**Status:** accepted for implementation by [ODR-PAP-006](../decisions/ODR-PAP-006-pap-verdict-model.md) (2026-11-05).
**Scope:** the verifier's decision layer — required-dimension derivation, validation classes, verdict computation, coverage and the conformance contract. It does not change package format, hashing, path safety or signature primitives.
**Related:** audit #137, stream #151, findings #138-#144; RFC §4.3.4, §6.3, §6.5, §7.4, §7.5, §4.9.

## 1. Why the model is being changed

The audit reproduced three fail-open defects that are instances of one design problem: `computeVerdict` (`pap/src/report.ts`) is a chain of special cases over `report.dimensions`, `options.requiredDimensions` and ad-hoc flags. As a result the verdict depends on things the RFC does not define as verdict inputs:

- **operator duplication** — `signature.mode: required` only influences the verdict if the operator also lists `signature`/`trust` in `requiredDimensions` (audit #139);
- **coercion** — `String()` accepted non-string enum values and silently weakened the policy (#140);
- **ambiguous classification** — a resource limit inside an envelope became `INVALID`/`FAIL` (#142), and a duplicate declared path was an error diagnostic next to `PASS` (#141, fixed in #157);
- **coverage drift** — `coverage.full` stayed `true` for an `INCOMPLETE` verdict caused by an unmet quorum;
- **non-PASS without a cause** — several paths could return `INCOMPLETE`/`UNTRUSTED` with no diagnostic or limitation naming the reason.

The targeted fixes (#152-#157) close the reproductions. This note defines the contract that removes the class.

## 2. Invariants

**I1 — Required dimensions are derived, not declared.** Inputs derive requirements:

| Input | Derived required dimensions |
|---|---|
| every policy / every run | `integrity`, `sources`, `checks` (from the required checks; see RFC §7.4) |
| `signature.mode: required` | `signature`, `trust` |
| `humanReview.required: true` | `humanReview` |
| `requiredChecks` entries | their implied dimensions (RFC §7.4 table) |
| policy `requiredDimensions` | may add dimensions only |

A policy that omits a derived dimension is valid (it is derived); a policy that would remove one is `pap.trust.policy-invalid` (exit 64, no report). Implementations must not infer requirements from a dimension's *state*; derivation is static from the inputs.

**I2 — One strict decode boundary.** Policy, manifest, claim files and envelopes are decoded once by typed decoders. No `String()`, truthiness, or `===` on unvalidated values. A non-string enum is invalid input, not a coercion candidate:
- invalid **policy** → `pap.trust.policy-invalid`, exit 64, no report (fail closed);
- invalid **package input** → report emitted, `integrity.package: FAIL`, verdict `FAIL`;
- safety **limit on the manifest itself** (the manifest cannot be read or parsed within the limits) → `pap.package.limit-exceeded` + `integrity.package: FAIL`, verdict `FAIL`: package identity and the required set cannot be computed;
- safety **limit after the manifest** (declared payloads, claims, signature envelopes) → affected dimension `NOT_EVALUATED`, `coverage.full: false`, verdict `INCOMPLETE`, never `FAIL`.

**I3 — Verdict is a pure fold over required dimension states.** Precedence, applied once and documented in code: `FAIL` → `UNTRUSTED` → `UNSUPPORTED` → `INCOMPLETE` → `NOT_EVALUATED` (degenerate parsed-package report where no required check could be evaluated) → `PASS`. An **empty required set is not `NOT_EVALUATED`**: it is `INCOMPLETE` with `pap.package.empty-check-specs` (RFC §7.4 rule 4, §7.5). Any required dimension in `FAIL` yields `FAIL`; in `NOT_EVALUATED`/`UNKNOWN`/`UNAVAILABLE`/`STALE`/`INCOMPLETE` yields at least `INCOMPLETE`. `PASS` requires every required dimension to be in its applicable positive state (`PASS`, `VALID`, `TRUSTED`, `ACCEPTED`, or `NOT_APPLICABLE` where the dimension allows it) and no limit hit.

**I4 — Coverage is evaluation completeness, not a verdict alias.** Per RFC §7.5, `coverage.full` is `true` only when every required check and required dimension was *decided*, the undeclared-file scan completed and the required set is non-empty. It is `false` when a required dimension is not decided (an unmet quorum leaves `trust` `NOT_EVALUATED`, so `full` is false once `trust` is derived as required), when a limit stopped evaluation, when the scan is incomplete, and when the required set is empty. It is **not** automatically false for every `INCOMPLETE`: `STALE` is a decided state (§7.5), so a stale policy can yield `INCOMPLETE` with `coverage.full: true` when all required work was evaluated. `coverage.requiredDimensions` is the derived set from I1, sorted.

**I5 — Every non-PASS verdict names its cause.** The report carries at least one diagnostic or limitation tied to the dimension(s) that produced the verdict. Machine-checkable invariant: `verdict != PASS` implies a non-empty verdict cause (dimension + code, or a documented degenerate case). A `PASS` may still carry warnings/limitations (e.g. `pap.review.unbound`).

**I6 — The conformance matrix is the contract.** Every emitted diagnostic code and every RFC R1-R12 requirement is mapped to at least one case in a machine-readable `requirements.json`, validated by a test. PASS cases and new cases assert exact diagnostic sets (`diagnosticCodesExact`); noReport cases assert exact exit code and stderr code, not substrings. A new code without a case fails the meta-test.

**I7 — The report always validates against Appendix C.** Hostile inputs either fail closed (no report) or produce a report that validates against the published schema; a test generates reports from hostile fixtures and validates them.

## 3. Validation classes (fixed outcomes)

| Class | Example | Diagnostic(s) | Dimension | Verdict |
|---|---|---|---|---|
| invalid operator policy | non-string enum, unknown field, bad dates | `pap.trust.policy-invalid` | — (no report) | exit 64 |
| invalid package input | manifest/claim/envelope schema, path duplicate, unknown field, `__proto__` member | `pap.package.*`, `pap.claim.*` | `integrity.package: FAIL` | `FAIL` |
| safety limit on the manifest | manifest bytes, manifest JSON nesting/string limits | `pap.package.limit-exceeded` (+ `pap.limit.lowered`) | `integrity.package: FAIL` (identity cannot be computed) | `FAIL` |
| safety limit after the manifest | payload/claim/envelope nesting, size, span budget, entry count | `pap.package.limit-exceeded` (+ `pap.limit.lowered`) | affected dimension `NOT_EVALUATED`, `coverage.full: false` | `INCOMPLETE` |
| verifier internal error | uncaught exception | `pap.internal.error` / `pap.io.error` | — (no report) | exit 70/74 |

`__proto__` and other member names are ordinary JSON members (RFC 8785): an implementation must parse them as own properties so that unknown-field checks, JCS and duplicate detection see them. Rejecting them is a documented deviation and requires a decision record.

## 4. Verdict and coverage, worked cases

| Case | Required (derived) | States | coverage.full | verdict |
|---|---|---|---|---|
| valid package, unsigned, no trust requirement | integrity, sources, checks | all PASS | true | PASS |
| same + `mode: required`, one valid envelope | + signature, trust | all PASS | true | PASS |
| same + `mode: required`, `minimumValidSigners: 2`, one envelope | + signature, trust | trust `NOT_EVALUATED` | **false** | **INCOMPLETE** |
| all required work evaluated, policy `state: STALE` | derived set, all decided | `STALE` is decided (§7.5) | **true** | **INCOMPLETE** |
| empty required set (all checks optional, no policy requirement) | none | required set empty | **false** | **INCOMPLETE** (`pap.package.empty-check-specs`) |
| unsigned package + policy `"mode": ["required"]` | — | policy invalid | false (no report) | exit 64 |
| deep-nesting envelope under required signature | + signature, trust | signature `NOT_EVALUATED` | **false** | **INCOMPLETE** |
| duplicate declared source path | integrity, sources, checks | integrity `FAIL` | false | FAIL |
| invalid claim `claimedOutcome: ["PASS"]` | integrity, sources, checks | integrity `FAIL` | false | FAIL |

## 5. Diagnostics and requirement coverage

- Codes keep their current names; new codes are added only through the corpus policy (I6).
- The mapping file `pap/fixtures/pap-v0.1/requirements.json` has two sections: `codes` (code → case ids) and `requirements` (R1-R12 → case ids). A meta-test fails on a code emitted by `pap/src` with no entry, or a requirement with no case.
- The 61-case `cases.json` stays the normative §12 corpus; new cases extend it (F62+). The phase files keep their declared experiment scope.

## 6. Implementation slices

| Slice | Deliverable | Acceptance |
|---|---|---|
| S1 | `pap/src/report.ts` → new `pap/src/state.ts`: dimension state type, `deriveRequiredDimensions`, pure `computeVerdict(states, options)` (extracted from `report.ts`) | property tests for I3/I4; no I/O; existing verdicts reproduced for all 61 cases |
| S2 | `pap/src/decode.ts`: strict decoders for policy/manifest/claims/envelope; all `String()` enums removed | every enum field has a non-string rejection test; invalid policy = exit 64; report validates against Appendix C |
| S3 | `verify.ts`/`report.ts` wired to S1/S2; coverage from I4; verdict cause from I5 | audit reproductions #138/#139/#140/#142 become regression tests; F13 unchanged; F47-F49 unchanged; boundary cases: quorum unmet ⇒ INCOMPLETE + `coverage.full:false`; explicit `REJECTED` ⇒ `UNTRUSTED`; stale policy with all required work evaluated ⇒ INCOMPLETE + `coverage.full:true`; empty required set ⇒ INCOMPLETE + `pap.package.empty-check-specs`; manifest limit ⇒ FAIL; post-manifest limit ⇒ INCOMPLETE |
| S4 | corpus: `requirements.json`, `diagnosticCodesExact`, exact noReport assertions, meta-tests | every code/requirement covered; unexpected diagnostics fail PASS cases; the S3 boundary cases become conformance cases (F62+) |
| S5 | docs: ODR-PAP-006, this note, RFC errata; status/PAP report snapshot updates | `bun run check` and `bun test` green; no source changes |

S1/S2 land as pure refactors with no verdict change; S3 is the behaviour slice and must not be mixed with S4.

## 7. Compatibility and migration

- The report shape is unchanged. `verdict`, `coverage.full` and diagnostics change only in the fail-closed direction for inputs that were previously under-evaluated or coercible.
- A consumer that relied on `coverage.full: true` on INCOMPLETE reports is reading a bug; the errata make that explicit.
- The `requiredDimensions` field remains readable and additive; no report consumer can infer requirements from it alone.

## 8. Open questions

- Is `UNTRUSTED` ever a demotion of an `INCOMPLETE` (a trust input that was actually evaluated and rejected), or should an unevaluated trust input always be `INCOMPLETE`? The model keeps the distinction: evaluated-and-rejected → `UNTRUSTED`; not evaluated → `INCOMPLETE`.
- Should `humanReview.required` derive `humanReview` only, or also a review-specific coverage counter? The current model derives the dimension; counters come from the required set.
