## Maintainer decision — PAP v0.1 (2026-11-02)

I accept **all D1–D12** as recommended in the merged Gate 1 audit and accept **OD-1–OD-7** according to the recommended options in §7 of that audit.

### Accepted decisions

- **D1–D12:** accepted as recorded in RFC §16.
- **OD-1:** resource limits that prevent complete evaluation produce `INCOMPLETE` (or the specified parsing failure where applicable), never a false producer-side `FAIL`; skipped declared payload scope is reported and cannot yield `PASS`.
- **OD-2:** `humanReview: PASS` is permitted only as an explicitly unbound producer claim, with `basis: "unbound-claim"`, `pap.review.unbound` diagnostic and limitation, and the required text label. It is not authenticated approval or confirmed authorization.
- **OD-3:** required text-output lines/tokens are normative; remaining layout is implementation-defined.
- **OD-4:** unsupported PAP versions are reported as `UNSUPPORTED`, not misclassified as malformed package schema.
- **OD-5:** Tier A is the mandatory core; Tier B adds DSSE/signature support. in-toto is outside both tiers; comparisons must be same-tier.
- **OD-6:** a partially evaluated or unavailable required check is `INCOMPLETE`, never `PASS`; absence of evidence is not a disproved assertion.
- **OD-7:** `verificationRecordIdentity` includes all material check records and witness fields, subject only to the exact presentation-only exclusions specified in the RFC.

### Explicitly deferred / excluded

- Cryptographically authenticated or signed human-review approvals remain deferred; v0.1's `unbound-claim` is not an authority assertion.
- Full text-output layout standardization beyond the required lines/tokens remains deferred.
- Archive transport, online revocation, Sigstore/SCITT/OCI integration, in-toto mapping, and new check types remain outside v0.1.

### Gate and implementation authorization

**Gate 1: PASS.** The accepted v0.1 specification is sufficiently complete and internally consistent for independent implementation. This decision does **not** claim that an independent implementation or executable PAP conformance harness already exists, and does not establish cross-implementation agreement.

**Gate 3 remains OPEN** until a separately implemented checker is compared field-by-field against the conformance corpus under the same tier. F47–F61 and E.9/E.10 remain normative descriptions rather than executable tests; the unexercised resource-limit/signature branches listed in audit §5.1 remain explicit implementation/test risks.

Phase 2 verifier implementation is authorized under the accepted v0.1 contract. Preserve the stated exclusions and limitations; do not silently expand v0.1 scope.

---

### Gate 3 closure — addendum (2026-11-04)

This addendum records a later owner decision. The 2026-11-02 decision text above is preserved as written and is not rewritten; "Gate 3 remains OPEN" above states the position at that date.

**Gate 3: PASS for PAP v0.1 Phase 2a (2026-11-04).** Three independent bundle-v2 implementations (Go, Python, Rust; two model families) agree field-by-field on the frozen Phase 2a case set: 19/19 full + 36/36 identity per implementation, 0 findings. Evidence: `agent-federation/blind-lab` PR [#26](https://github.com/agent-federation/blind-lab/pull/26) (`46df016`, closure record `audit/gate-3-closure.md`), PR [#27](https://github.com/agent-federation/blind-lab/pull/27) (`25655230`, ZIP-provenance reconciliation) and PR [#28](https://github.com/agent-federation/blind-lab/pull/28) (`6930766`, external auditor verdict); result commits/tags Go `8d49d69`/`pap-go-p2a-003-result`, Python `58f368c`/`pap-py-p2a-003-result`, Rust `0b31dac`/`pap-rs-p2a-003-result`. Decision record: [`ODR-PAP-005`](decisions/ODR-PAP-005-gate-3-closure-phase-2a.md).

Scope and caveats: Phase 2a only — 6 later-phase cases excluded; no Phase 2b/2c/2d, Tier B or full-PAP conformance claim; the three implementations share one owner/harness; two model families, not three independent human teams; the external auditor approved unconditionally for the Phase 2a scope after a documentation-level ZIP-provenance review and did not independently re-hash the archive. No contract, case set, implementation or prior record was changed.

This addendum does not close Gate 2 (the separately distributed verifier release required by RFC §9.1 remains unavailable), and it does not complete Phases 4–5 of #43.
