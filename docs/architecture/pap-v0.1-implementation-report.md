# PAP v0.1 verifier — Phase 2 implementation report

**Status:** implementation complete for Tier B; Gate 3 remains **OPEN**. This report
does not claim cross-implementation agreement, interoperability or semantic truth.
**Issue:** [#62](https://github.com/agent-federation/contract-builder/issues/62) —
«Implement the PAP v0.1 verifier — Phase 2».
**Normative baseline:** accepted
[`portable-assurance-package-rfc.md`](portable-assurance-package-rfc.md) (D1–D12,
OD-1–OD-7; Gate 1 PASS) and the Gate 1
[`decision audit`](pap-v0.1-gate1-decision-audit.md).
**Verifier entry point:** `pap/bin/pap` / `bun run pap`.
**Conformance tier:** Tier B — the Tier A core plus the optional DSSE/Ed25519
adapter. The in-toto mapping is outside both tiers and is not implemented.

---

## 1. What was built

The verifier is a self-contained product boundary under `pap/`. It imports only
`node:` built-ins and its own modules. It never imports `spec/`, `profiles/`, a
renderer or a producer runtime, never renders Markdown, never executes package
content and never opens a network socket.

| Area | Implementation |
|---|---|
| Package directory, path grammar, symlink/non-regular rejection, root confinement | `pap/src/paths.ts` |
| Strict I-JSON parser, JCS over the integer-only subset, duplicate-key/lone-surrogate rejection | `pap/src/json.ts` |
| Domain-separated SHA-256, framing, LF normalization, canonical base64 | `pap/src/digest.ts` |
| Nanosecond RFC 3339 instants, `--now`, UTC rendering | `pap/src/time.ts` |
| Appendix A manifest validation and cross-field invariants | `pap/src/manifest.ts` |
| Appendix D claim parsing and cross-field invariants | `pap/src/claims.ts` |
| Appendix B trust policy, freshness, limits, recognition | `pap/src/policy.ts` |
| Three checks, check records and witnesses | `pap/src/checks.ts` |
| DSSE/PAE/Ed25519 adapter and signature/trust aggregation | `pap/src/signatures.ts` |
| Independent dimensions, coverage, verdict precedence, record identity | `pap/src/report.ts` |
| `verify` orchestration and report assembly | `pap/src/verify.ts` |
| `inspect` | `pap/src/inspect.ts` |
| `explain` | `pap/src/explain.ts` |
| Deterministic text output | `pap/src/text.ts` |
| CLI, streams, exit codes, usage errors | `pap/src/cli.ts` |
| Checker identity constant | `pap/src/version.ts` |

Checked-in schemas are the normative Appendices A–D plus the published
`inspection` and `explanation` document shapes:

```text
pap/schemas/manifest.schema.json
pap/schemas/trust-policy.schema.json
pap/schemas/verification-report.schema.json
pap/schemas/check-record.schema.json
pap/schemas/claims-provenance.schema.json
pap/schemas/claims-relations.schema.json
pap/schemas/claims-producer-report.schema.json
pap/schemas/claims-reviews.schema.json
pap/schemas/inspection.schema.json
pap/schemas/explanation.schema.json
```

The schemas were extracted from the accepted RFC rather than retyped, so their
patterns, required fields and conditional `humanReview.basis` rule are the
normative ones.

---

## 2. Requirement mapping (RFC R1–R12)

| R | Resolution | Code / evidence |
|---|---|---|
| R1 package layout, versioning, canonicalization, digests | Directory-only layout, strict schema, JCS and domain-separated identities | `manifest.ts`, `json.ts`, `digest.ts`; E.1–E.7, E.9; F01–F10, F21–F61 |
| R2 distinct identities | Package, artifact, raw source, normalized input, extension closure, checker and record identities are separate and never compared by string equality | `digest.ts`, `verify.ts`, `report.ts`; E.1–E.6, E.10 |
| R3 independent dimensions | Integrity, sources, signature, trust, checks, human review, semantic truth, legal enforceability; no `verified` field | `report.ts`, `verify.ts`; F01–F20, F27, F28, F43, F55, F56 |
| R4 no false success | Fixed status vocabularies, verdict precedence, coverage and limitations; unsupported/unavailable/unevaluated cannot become `PASS` | `report.ts`; F07–F10, F21–F35, F43–F61 |
| R5 claims vs results | Claims are separate digest-declared files; producer outcomes are only compared | `claims.ts`, `report.ts`; F20, F58 |
| R6 check/witness contract | Three checks, deterministic records, subject digests, scope, checker, witnesses and diagnostics | `checks.ts`, `check-record.schema.json`; F42, E.4 |
| R7 CLI and report | `verify`/`inspect`/`explain`, one JCS document plus LF, exit-code table, deterministic text | `cli.ts`, `text.ts`, `inspect.ts`, `explain.ts`; F01/F02 text runs, F25, F36–F42 |
| R8 hostile input | Path validation before open, symlink/non-regular rejection, duplicate/case-collision detection, byte/count/JSON limits, no package code | `paths.ts`, `manifest.ts`, `claims.ts`, `verify.ts`; F21–F26, F29, F30, F35, F50–F53, F60; hostile tests |
| R9 signatures | Optional DSSE/Ed25519 adapter; signature validity separate from signer identity/policy; in-toto outside both tiers | `signatures.ts`; F11–F19, F56; E.7 |
| R10 conformance corpus | 61 static package copies, fixed policies, shared envelopes, generic `cases.json` runner | `pap/fixtures/pap-v0.1/`, `pap/tests/conformance.test.ts` |
| R11 independence | No producer import; schemas and vectors published; producer-free sentinel test; Gate 3 still open | `pap/README.md`, `tests/support.ts`; F40 |
| R12 accepted baseline | Implementation follows the accepted D1–D12/OD-1–OD-7 contract and records no silent scope expansion | this report, RFC §16 |

---

## 3. Conformance corpus

`pap/fixtures/pap-v0.1/cases.json` contains one entry per RFC case F01–F61.
The runner is generic: it never branches on a case id. Every executable case is
run twice with a fixed `--now`, a hostile `TZ`/`LC_ALL`, a producer-free `PATH`
with failing sentinel `bun`/`node`/`contract-builder` shims, and a writable
temporary directory outside the package.

Assertions per `verify` case:

- exact exit code, verdict, constrained dimension statuses and check outcomes;
- required diagnostic and limitation code sets (extra codes allowed unless a
  case sets `diagnosticCodesExact`);
- `coverage.full`, `effectiveLimits` and package-identity relations;
- Appendix C schema validity of the emitted JSON;
- exactly one JCS document plus one LF on stdout, empty stderr;
- byte-identical output on a second run.

The suite also asserts the §9.6 required text lines for F01 (`PASS`) and F02
(`FAIL`), the F55 positive/negative `humanReview.basis` schema rule, and that the
sentinel shims were never executed (F40).

All 61 cases pass in this implementation's harness. The corpus is static: no
case is generated or mutated at test time.

### 3.1 Case coverage summary

| Group | Cases | Result |
|---|---|---|
| Mechanical checks and package content | F01–F10 | pass |
| Signatures, trust and producer claims | F11–F20 | pass |
| Hostile input, claims and malformed manifests | F21–F31 | pass |
| Extensions, canonical form, limits, CLI | F32–F43 | pass |
| Absent claims and reciprocal inverses | F44–F46 | pass |
| Gate 1 clarification cases | F47–F61 | pass |

The case-specific evidence is the executable runner, not a textual claim here. Run
`bun test pap/tests/conformance.test.ts` to reproduce it.

---

## 4. Verification performed

From the repository root:

```bash
bun install --frozen-lockfile
bun run typecheck                 # includes pap/**/*.ts
bun test pap/tests                # vectors, corpus, hostile input, branches, CLI
bun test                          # full repository suite
bun run check                     # generated CORE-001 artifact unchanged
```

The vector suite reproduces every Appendix E digest from the document's own bytes:
E.1 package identity and canonical manifest length, E.2 payload/quote/input/claim
digests, E.3 checker closure and checker identity, E.4 record identity, E.5 LF
normalization, E.6 domain separation and framing ambiguity, E.7 DSSE PAE, E.9 JCS
edge cases and E.10 identity mutations.

The branch suite additionally exercises paths that the published matrix does not
name as cases: human-review stale/binding/unknown/rejection outcomes, checker and
profile recognition outcomes, the payload-count limit, duplicate signer counting
and a missing signature `keyId`. The hostile suite covers the manifest and claim
JSON nesting limits, total payload bytes, multiple limits, envelope-count limits,
raised policy limits (exit 64), non-canonical Ed25519 `S`, parent-directory
symlinks, nested manifests, directory-enumeration budgets, signature-directory
read failure, `inspect`, `explain` with an unsupported check, and producer-free
execution. `pap/tests/streaming.test.ts` pins CRLF normalization and source-range
hashing across the 64 KiB chunk boundary, and `pap/tests/checks-unit.test.ts`
pins that a witness-budget stop is `NOT_EVALUATED`, never `PASS`.

---

## 4.1 Post-audit hardening (PR #64 review)

The maintainer audit at head `e55c354` found three P1 resource-safety issues and
two P2 structural issues; all were fixed in the follow-up commits:

- **Streamed payload hashing.** `pap/src/paths.ts` now exposes a bounded
  `streamPackageFile`; artifact and source digests are computed chunk-by-chunk,
  and inputs use `pap/src/input.ts` to detect the LF/binary fallback and stream
  both per-file and set digests. Source bytes are not retained: `hashPackageRange()`
  reads only the quoted byte ranges and the check receives their digests, not the
  bytes. `quoteBase64` is omitted from source-span witnesses.
- **Bounded witness output.** Each check has a 16 MiB aggregate serialized-witness
  budget (`WITNESS_BUDGET_BYTES`). Exceeding it yields a `NOT_EVALUATED` check with
  `pap.package.limit-exceeded`, never a partial `PASS`; the budget is a verifier
  safety boundary, not a producer defect.
- **O(1) relation reciprocity.** The relation check pre-indexes canonical edge
  triples into a `Set` once, replacing the previous O(E²) reciprocal search.
- **Bounded directory traversal.** `walkPackageFiles()` and signature discovery
  use bounded `opendir` iteration, entry/depth budgets and explicit read errors;
  exceeding a budget or failing to enumerate a directory is reported, not
  silently ignored.
- **Nested manifests and parent symlinks.** Every path component is checked for a
  symlink before opening, and any `assurance-package.json` below the package root
  is rejected as a nested manifest. Both have hostile-input regressions.
- **F46/F59.** The maintainer chose option (a) on PR #64: keep RFC §7.5 and the
  F02 transcript, and update only the F46/F59 matrix rows to
  `coverage.full: true`. The RFC rows, corpus and this report now agree; the
  failing outcomes and verdicts are unchanged, and a focused assertion pins that
  an evaluated required-check `FAIL` does not make coverage partial.

## 5. Deliberate interpretations and known discrepancies

These are the places where the implementation had to choose between clauses or
between a clause and a matrix row. None of them can turn an unsupported or
unevaluated required scope into `PASS`.

1. **F46/F59 `coverage.full` (resolved).** The cross-implementation audit at
   head `e55c354` flagged that the F46/F59 matrix rows said `false` while
   RFC §7.5 counts a completed `FAIL` as evaluated. The maintainer chose option
   (a) on [PR #64](https://github.com/agent-federation/contract-builder/pull/64#issuecomment-6576266020):
   keep §7.5 and the F02 transcript unchanged and update only the
   F46/F59 rows to `coverage.full: true`. The RFC rows and this report now carry
   that decision; the failing check outcome and verdict are unchanged. A focused
   assertion in `pap/tests/conformance.test.ts` pins that an evaluated required
   check `FAIL` does not make coverage partial.
2. **F52/F61 limit interaction.** Artifact, source and input files are bounded by
   `fileBytes`/`totalPayloadBytes`/`payloadFiles`; claim files are bounded by the
   JSON document limits. A limit that makes a **required** check unevaluable
   stops the required check set; optional checks whose inputs are unaffected may
   still run. This is the reading that makes F52 (all checks `NOT_EVALUATED`) and
   F61 (relation check `PASS`, artifacts `NOT_EVALUATED`) both executable. In
   both cases the verdict is `INCOMPLETE`, `coverage.full` is `false`, and the
   limit is reported. Package integrity remains `PASS` because the manifest,
   paths and declarations are structurally valid; the unread input identities are
   `null`.
3. **F03 source-quote on a mismatched source.** A source whose raw digest does
   not match its declaration still has readable bytes. The digest check reports
   `FAIL`, while the source-quote check evaluates the quoted span against those
   bytes and can `PASS`, as the matrix requires. Source availability is `PASS`
   for a mismatched-but-present snapshot; only referenced-only or unreadable
   sources are `UNAVAILABLE`.
4. **Checker digest constant.** `implementationDigest` is a published constant
   for this verifier release (`pap/src/version.ts`); it is not recomputed from a
   compiled closure at runtime. E.3 still exercises the normative closure
   algorithm, and the constant is excluded from cross-implementation comparison
   by RFC §13.6. A release that changes checker code must update the constant.
5. **`explain` for an unimplemented check.** The JSON explanation carries
   `checkRecord: null` and exit 4, because no verifier check record exists for a
   check specification the verifier does not implement. The published
   `explanation.schema.json` permits `null`; this shape is outside the v0.1
   conformance subset.

---

## 6. Explicit gaps and unexercised branches

These are specified but not enforced by a published case, or are outside the
accepted v0.1 contract. They are listed rather than silently assumed.

- **in-toto Statement adapter** — outside both tiers; a v0.1 verifier may report
  `pap.signature.unsupported-format`. Not implemented.
- **Signed human-review approvals** — deferred; no policy field can request one.
  `humanReview: PASS` is only ever `basis: "unbound-claim"`.
- **Archive/OCI transport, Sigstore/SCITT, online revocation, key management,
  multiple digest algorithms, transparency logs** — deferred by the accepted
  contract; no code path accepts them.
- **Wall-clock budget, hard-link detection, local same-privilege attackers** —
  out of scope as stated in RFC §10.6.
- **Unpublished-case branches** — the branch and hostile suites cover many, but
  the following still have no dedicated fixture: JSON string-size limits on a
  claim (the nesting limit is exercised), provenance-binding and
  relation-entity/edge count limits, `claimsFiles` (it cannot bind with four
  declarable kinds), signature unsupported-format/payload-mismatch branches,
  `minimumValidSigners` quorum with multiple distinct signers, `inspect`
  `INVALID`/`PARTIAL`/`UNSUPPORTED`, and `explain` `FAIL`/`NOT_EVALUATED`
  documents. `--now` offset normalisation and fractional rendering are covered by
  `pap/tests/cli.test.ts`. Their normative outcomes are
  implemented; they remain review risks rather than test-proven behaviour.
- **Full text layout** — only the required lines/tokens are standardized; layout
  beyond them is implementation-defined per OD-3.
- **Gate 3** — no independent second implementation or field-by-field
  interoperation comparison exists. Passing this corpus does not establish Gate 3
  or cross-implementation agreement.

---

## 7. Independence and non-claims

The verifier does not import or execute the producer. `pap/tests/support.ts`
runs the CLI with sentinel `bun`, `node` and `contract-builder` shims that would
fail loudly if the verifier executed them; F40 asserts they were never run.
Package content is never imported, templated, rendered or evaluated.

The report deliberately does not claim:

- semantic truth or legal enforceability (`NOT_EVALUATED` always);
- signer authority, approval authenticity or reviewer correctness;
- source authenticity beyond the declared digest;
- build reproducibility or that `build.inputDigest` equals any PAP identity;
- that a `PASS` means the package is trustworthy, complete or true.

`PASS` means the required mechanical and policy set was evaluated and positive,
with `coverage.full: true`; it is a bounded mechanical result.

---

## 8. Reproducible commands

```bash
bun run pap -- verify pap/fixtures/pap-v0.1/base \
  --trust-policy pap/fixtures/pap-v0.1/trust-policy/unsigned-valid.json \
  --format text --now 2026-11-02T00:00:00Z

bun run pap -- inspect pap/fixtures/pap-v0.1/base --format json

bun run pap -- explain pap/fixtures/pap-v0.1/base \
  --check pap.check.digest-integrity/1 --format json

bun test pap/tests/conformance.test.ts
bun test pap/tests/vectors.test.ts
bun test pap/tests/hostile.test.ts
bun test pap/tests/branches.test.ts
bun test pap/tests/cli.test.ts
```

The first `verify` prints `VERDICT: PASS`; the JSON form is the Appendix C report
whose package identity equals the E.1 literal
`sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020`.
