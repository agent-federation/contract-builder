# PAP v0.1 Gate 1 decision audit and readiness report

**Status:** proposed for maintainer review. The D1–D12 dispositions below are
recommendations, not recorded acceptances; §16 of the PAP RFC still controls. The
RFC amendments described here are proposed text, not an acceptance of any decision.
**Issue:** [#57](https://github.com/agent-federation/contract-builder/issues/57) — «Resolve
normative ambiguities and finalize PAP v0.1 decisions».
**Audited document:** [`portable-assurance-package-rfc.md`](portable-assurance-package-rfc.md),
merged as `cf0722b` in PR #49 and accepted as the normative design baseline in #44.
**Audit baseline:** `main` at `260de89`, the commit this audit and its proposed patch were
prepared against.
**Conformance baseline:** `papVersion "0.1"`, directory packages, the three §8 checks, Appendices
A–E and J, and the §12 matrix.

---

## 1. Summary

This audit answers one question: **can an independent implementer build a conforming v0.1
recipient from the RFC, schemas, vectors and fixtures alone, without guessing a rule that changes
a verdict?** The self-audit found no known blocking ambiguity inside the reviewed v0.1 contract
after the proposed patch, with a short list of deferred items that cannot silently affect a v0.1
verdict. That is a specification finding, not evidence that an independent implementation will
agree; only Gate 3 can test that.

| Result | Finding |
|---|---|
| D1–D12 | All twelve recommended **`accepted`**. Nine needed a clarifying amendment first; none is recommended `rejected` or wholly `deferred`. Two carry a deliberately deferred sub-part (signed approvals in D8, text layout in D10). |
| §13.8 areas | All seven resolved normatively or explicitly excluded from mandatory conformance. The audit found no known undefined required behaviour in these areas; some branches remain specified but unexercised (§5.1). |
| Vectors | Every Appendix E digest vector was recomputed independently from the document's own bytes and matches exactly: E.1 package identity, E.2 payload/quote/claim digests, E.3 checker identity, E.4 verification-record identity, E.5 normalization, E.6 domain/framing, E.7 PAE. E.4 is revised at Gate 1 to include the check records (C17/OD-7); E.9 adds JCS edge vectors and E.10 adds identity mutation vectors. |
| RFC patch | Contradictions, missing diagnostic codes, schema/status mismatches, determinism gaps and fixture defects are amended in place; 15 new cases (F47–F61) specify every newly pinned rule; the fixture policy set is split so each case has one deterministic policy. The cases are normative descriptions, not executable tests yet (§5.1). |
| Owner input | Seven decisions embedded in the patch change conformance or compatibility semantics and are separated in §7 for explicit maintainer approval. |
| Gate 1 | Specification readiness is proposed **pending** the maintainer's approval of §7 and the recorded D1–D12 dispositions. This is not Gate 3: no second implementation exists, so cross-implementation agreement is untested. |

The audit does **not** implement the verifier, change Gate 1 status, close #43/#44, or record any
decision as accepted.

### 1.1 What "Gate 1" and "Gate 3" mean here

- **Gate 1 (this audit)** — as far as this self-audit can determine, the specification is
  complete and consistent enough that an independent implementer can derive every reviewed
  required result without guessing, and every newly pinned behaviour has a documented assertion
  (or is listed in §5.1 as specified but unexercised). A remaining ambiguity found by that
  implementer is a specification defect; Gate 3 is the proof.
- **Gate 3 (not claimed)** — two independent implementations, from separate teams and preferably
  different languages, agree field-by-field on the §12 corpus. Gate 1 removes known specification
  ambiguity; it cannot prove that no ambiguity remains, and it cannot substitute for the
  comparison in §13.6.

---

## 2. D1–D12 decision audit

Legend for **State**: *fully specified* — the RFC text, schemas, vectors and cases already settle
the decision; *partly specified* — the option is stated but at least one required rule was
missing and is clarified by the patch; *contradictory* — two normative passages disagreed and the
patch resolves them. **Disposition** is the recommended §16 status.

| ID | Decision (selected option) | Normative anchors | State before patch | Recommended disposition | Rationale and owner input |
|---|---|---|---|---|---|
| D1 | Directory-only packages; archive transport deferred | §4.2, §9.2, §10.7, §14.1, F25 | fully specified | `accepted` | Archive rejection is a usage error with a pinned case; archive extraction rules are pre-written for a later decision and are unreachable in v0.1. No owner choice needed. |
| D2 | RFC 8785 JCS over an I-JSON subset, integers only | §4.10, §5.3.1, E.1, E.9 | partly specified | `accepted` | `1.0`, `1e3` and `-0` were not unambiguously rejected, and no vector exercised UTF-16 key order or escaping. Patch: integer-literal number tokens only; E.9 vectors. |
| D3 | SHA-256 with fixed domains and length-prefixed framing | §5.2, §5.8, E.3, E.6 | fully specified | `accepted` | Every domain, the framing bytes and the checker closure are pinned and reproduce exactly. The report-level meaning of `extensionClosureDigest` was clarified (declared profile closure or `null`, never the verifier's own closure). |
| D4 | Source snapshots optional; required for a source-dependent `PASS` | §4.5.2, §7.3, §8.5, F27 | partly specified | `accepted` | A binding naming an **undeclared** source was treated as `NOT_EVALUATED` in §8.5 but as an invalid claim in D.1. Patch: undeclared source = `pap.package.claim-invalid`/`FAIL`; declared-but-unembedded source stays the format-permitted `UNAVAILABLE`/`INCOMPLETE` case. |
| D5 | Strict core plus `extensions` and `requiredFeatures` | §4.9, Appendix A, F08, F30, F32, F33 | partly specified | `accepted` | `requiredFeatures` was said to have unknown "optional" entries, but v0.1 has no optional-feature list. Patch: every listed feature is required; optional forward data belongs in non-critical extensions. |
| D6 | Producer claims and verifier results are separate files, schemas and namespaces | §4.7, §7.6, §8.9, Appendices C–D, F20 | fully specified | `accepted` | Structural separation is enforced by schemas (`claimedOutcome` vs `outcome`/`witnesses`) and by the comparison block, which never reaches the verdict. |
| D7 | Eight independent dimensions, check outcomes, verdict precedence, coverage | §7, Appendix C, F01–F10, F20, F26–F28 | contradictory | `accepted` + **OD-1**, **OD-6** | `integrity.package`/`integrity.artifacts` had no non-positive status for a resource limit, the empty-required-set case contradicted §8.8/§7.4, and coverage counters were undefined. Patch: `NOT_EVALUATED` for package and artifacts; empty required set = `INCOMPLETE`; explicit count definitions; partial coverage is always `INCOMPLETE`, never `FAIL` or `PASS`. |
| D8 | Local offline trust policy; signatures optional; expiry → `STALE` | §6, Appendix B, F11–F19, F41, F43 | partly specified | `accepted` + **OD-2** | Envelope ordering, over-limit behaviour and base64 canonicality were unstated; the per-entry table lacked the orphan-key row; optional-mode aggregation was contradicted by the "never ignored" sentence. Patch fixes all four. Signed human approvals remain deferred and v0.1 has no policy field that can require one. |
| D9 | Three checks: digest integrity, source quote, relation consistency | §8, Appendices D–E, F01–F06, F44–F46 | partly specified | `accepted` + **OD-6** | "Unless the policy requires full coverage, then `FAIL`" referenced a policy capability that does not exist; duplicate relation names had no diagnostic code; the check-record `package` witness had no declared value to compare. Patch removes the phantom switch, adds `pap.claim.relation-duplicate`, and limits witnesses to compared subjects. |
| D10 | `pap verify/inspect/explain`, exit 0/1/2/3/4, deterministic JSON | §9, §5.9, F36–F42 | partly specified | `accepted` + **OD-3** | The required text lines were ambiguous about `NOT A PASS`, dimension paths and coverage counters; `inspect` had no token for exit 4; `--version` range spelling and `--now` fraction/leap-second handling were undefined. Patch pins those while leaving layout implementation-defined. |
| D11 | `papVersion` major.minor; core frozen within a major | §4.9, §15.1, Appendix A, F10, F57 | contradictory | `accepted` + **OD-4** | Appendix A admitted only `0.x`, so a `1.0` package was a schema `FAIL` even though §15.1 requires `UNSUPPORTED`; `0.01` was also admitted. Patch: canonical `major.minor` pattern; newer minor, older minor and different major map to the two compatibility codes; required checks stay `NOT_EVALUATED`. |
| D12 | Second implementation from the RFC alone; unsigned first | §13.1, §13.4–§13.6, §13.7 | partly specified | `accepted` + **OD-5** | "Conforming" had no tier, in-toto was optional but had no rule preventing a case from requiring it, and fixture `unsigned-valid.json` pinned the reference implementation's checker identity, which would make F01 fail for every other implementation under §13.6. Patch defines Tier A/Tier B, excludes in-toto from both, and removes the reference pin. |

### 2.1 Why no decision is recommended `rejected` or wholly `deferred`

Every option in §16 is exercised by the normative text and at least one case; rejecting an option
would remove a behaviour the matrix already requires, and deferring one wholly would leave a gap
in the v0.1 contract that this ticket exists to close. The genuinely open parts are narrower than
a whole decision and are recorded as deferred sub-parts in §6.

---

## 3. §13.8 interoperability blockers

The table records, for each area, the exact ambiguity, whether it could produce divergent results
between conforming implementations, and the resolution. All rows are now **resolved** or
**deferred by design**; the audit found no undefined required behaviour among them, while §5.1
lists branches that are specified but not yet exercised by a case.

| Area | Exact ambiguity (clauses) | Divergence risk | Resolution | Assertions |
|---|---|---|---|---|
| Clock and freshness boundaries | §6.4 defines `FRESH` as `evaluatedAt ∈ [issuedAt, expiresAt]`, while §9.8 and the pre-patch §13.8 called the `expiresAt` boundary open; review age/`+300 s` boundaries were also unstated. | High: an instant exactly at `expiresAt` could be `PASS` or `INCOMPLETE`, changing the verdict and exit code. | **Resolved.** §6.4 and §9.8 now state a closed window with no skew tolerance; §6.7 states the review age boundary is inclusive and the `+300 s` allowance is inclusive. Production `--now` remains a CLI-project choice (§16.1(6)) because it changes no format field; that is the only deferred sub-part. | F47 (`--now == expiresAt`), F48 (`--now == issuedAt`), F49 (`expiresAt + 1 s`); F15 for a stale signed policy. |
| JSON parser strictness | §4.10/§5.3.1 fixed duplicate keys, BOM, surrogates, UTF-8 and depth, but not which token spellings count as integers, not which document type gets which diagnostic, and not what a claim/policy parse failure does to the verdict. | High: `1.0`/`1e3` acceptance, and `manifest-json` vs `claim-invalid` vs exit 64, could differ. | **Resolved.** §5.3.1 accepts only `-?(0\|[1-9][0-9]*)`; §13.8 carries a document-type → diagnostic → effect mapping; parse failure of the manifest is never `INCOMPLETE`; a claim file fails the package, a policy fails closed with exit 64, a limit stops only the affected scope. Exotic tolerance (comments, trailing commas beyond fixed rules) is rejected as invalid JSON and is not a permitted variation. | F21, F29, F35, F50, F51, F58; F41 for policy. |
| Resource-limit defaults and enforcement points | §4.3.4 fixed numbers but not every enforcement point; `integrity.package`/`integrity.artifacts` had no `NOT_EVALUATED` status; §13.8 left non-default limits uncomparable; the "claims files" limit exceeded the four declarable claim kinds; a limit on a non-required dimension could leave `PASS` reachable. | High: the same oversized artifact could be `FAIL` or `INCOMPLETE`; effective limits were unrepresentable; payload-count/read order could depend on the implementation; a non-required class could be skipped while the verdict stayed `PASS`. | **Resolved.** Only a manifest-parsing limit yields `FAIL`; every other limit yields `NOT_EVALUATED`/`INCOMPLETE`; reading order is fixed (artifacts, sources, inputs, claims), multiple limits union their affected scopes, `coverage.full` is false, and any limit that stops a declared payload or required check forces at most `INCOMPLETE` even when the affected dimension is not required. `integrity.package`/`integrity.artifacts` gain `NOT_EVALUATED`; lowered limits appear in `effectiveLimits` and as `pap.limit.lowered`. Raising a limit remains a policy error. The unreachable claims-files limit is documented as a forward bound. | F35, F52, F61; specified-but-unexercised limit branches are listed in §5.1. |
| Human-review evidence semantics | §6.7 said a claim must bind "the package identity and/or the artifact set" without defining the acceptable combination, did not say whether one approval is sufficient or how a rejection interacts with an approval, and asserted that a policy could require signed approvals although no such policy field exists. | High: the same reviews file could be `PASS` or `INCOMPLETE`. | **Resolved for v0.1.** An approval binds by `scope.packageIdentity` equality, or by set-equal `scope.artifacts` when identity is absent; `packageId` alone does not bind. One valid approval is sufficient and any in-scope rejection makes the dimension `INCOMPLETE`. Reviewer recognition is exact identity match against a policy `signers[]` entry with role `reviewer`. Signed approvals stay deferred with no policy field to request them. | F28 (missing evidence), F55 (fresh in-scope recognized approval → `PASS`). |
| Signature adapter details | §11.2 fixed DSSE/PAE/Ed25519 but not envelope discovery depth, evaluation order, over-limit behaviour, base64 canonicality, signature length, or the canonical-`S` check. | Medium: divergent `signatures[]` order breaks the JSON comparison; malformed encodings could be accepted differently; an over-limit envelope set could be partially trusted. | **Resolved.** Only regular files directly under `signatures/` matching `[A-Za-z0-9._-]+\.dsse\.json` are read, sorted by path; over-limit reads none and leaves signature/trust `NOT_EVALUATED`; base64 must be canonical with padding; `sig` decodes to exactly 64 bytes; verification follows RFC 8032 §5.1.7 including canonical `S`. The in-toto mapping is explicitly outside both conformance tiers. | Tier B: F11–F13, F15–F18, F56; E.7 for PAE. |
| Multi-envelope aggregation | §6.5's aggregate was described as "over the policy-required set" while the rules evaluated every present envelope; disabled mode was said not to report envelopes while §9.3 said a present signature is never ignored; an orphan key (in `keys[]`, mapped by no signer) had no row. | Medium: optional-mode mixed envelopes and orphan keys could be `PASS`, `INCOMPLETE` or `UNTRUSTED`. | **Resolved.** The aggregate covers every present envelope; in `optional` and `required` modes an invalid, unknown or untrusted envelope blocks `PASS`; `disabled` is the one intentional opt-out and reads no envelope; an orphan key is `UNKNOWN`/`REJECTED`; duplicate signers count once. | F18 (trusted + unknown, required), F56 (trusted valid + invalid, optional), F11/F16/F17. |
| Text-output layout | §9.6 required lines but allowed "at most one reason clause", did not enumerate dimension paths or coverage counters, and left `inspect`'s exit-4 token undefined. | Low for verdicts (text is not compared), medium for conformance assertions: two implementations could satisfy different readings of the same clause. | **Deferred by design**, with the required lines pinned: first line `VERDICT: <token>`; `NOT A PASS` line starts with that token for non-`PASS`; every dimension path with its exact status; one line per check id with its outcome; all coverage counters and `full`; limitation codes; the exact producer-claims heading. Layout beyond those lines, column widths and abbreviations stay implementation-defined. `inspect` gains the `UNSUPPORTED` token for exit 4. | F01 and F02 re-run with `--format text` (§12.3). No cross-implementation text comparison. |

The compatibility-refusal question is also closed: §4.9, §15.1, F10 and F57 fix a newer minor and
a different major as structurally readable where possible, with required checks `NOT_EVALUATED`
and an `UNSUPPORTED` verdict.

---

## 4. Concrete inconsistencies and missing assertions

Each row was a real inconsistency or an assertion gap. "Fixed" means the proposed patch changes
the RFC; "noted" means the item is documented but needs no normative change.

### 4.1 Contradictions between normative passages

| # | Where | Inconsistency | Disposition |
|---|---|---|---|
| C1 | §6.4 vs §9.8, §13.8 | The policy window was defined as closed in §6.4 but called open in §9.8/§13.8. | Fixed: closed at both ends, no skew tolerance. |
| C2 | §8.5 vs Appendix D.1 | A provenance binding naming an undeclared source was `NOT_EVALUATED` in the check procedure and an invalid claim in D.1. | Fixed: undeclared = invalid claim/`FAIL`; unembedded but declared = `NOT_EVALUATED`. |
| C3 | §8.5, §8.8, Appendix J.3 | "Unless the policy requires full coverage, then `FAIL`" named a policy capability that Appendix B does not have. | Fixed: partial coverage is always `NOT_EVALUATED`/`INCOMPLETE`; no policy switch exists. |
| C4 | §7.3, Appendix C vs §4.3.4/§9.11 | A resource limit yields `INCOMPLETE`, but `integrity.package`/`integrity.artifacts` admitted only `PASS`/`FAIL`; an input limit had no representable status. | Fixed: `NOT_EVALUATED` added to both status vocabularies and the schema; an unparsable manifest remains `FAIL`. |
| C5 | Appendix A vs §15.1 | Appendix A admitted only `0.x`, so `papVersion: "1.0"` was a schema `FAIL` although §15.1 requires `UNSUPPORTED`; `0.01` was also admitted. | Fixed: canonical `major.minor` pattern and an explicit unsupported-version rule. |
| C6 | §4.4.3, §7.4, §8.8, Appendix J.1 | An all-optional `checkSpecs` was simultaneously valid, "no basis for `PASS`", and "cannot be `PASS`; `INCOMPLETE`/`UNSUPPORTED`". | Fixed: evaluate all declared checks, empty required set = `INCOMPLETE` with `pap.package.empty-check-specs`. |
| C7 | §4.7.1, §7.3, §7.4 | A declared claim file that violated its schema failed "package integrity", but `integrity.package`'s definition and the `FAIL` rule only named digest mismatches. | Fixed: invalid claim file → `integrity.package: FAIL`, verdict `FAIL`. |
| C8 | Appendix A path pattern vs §4.3.1/Appendix J.1/F22 | `../outside.md` fails both the schema pattern and the path grammar, but F22 requires `pap.package.path-invalid`. | Fixed: path grammar is checked first and reports `path-invalid`, not `schema`. |
| C9 | §6.5 vs §9.3 | Mode `disabled` was said not to report envelopes, while §9.3 said a present signature is never ignored. | Fixed: `disabled` is the only intentional opt-out; `optional`/`required` report every envelope. |
| C10 | §6.5 aggregation | "Over the policy-required set" contradicted "every present envelope makes an unacceptable signer set unacceptable". | Fixed: aggregate over all present envelopes; policy decides the required count, not which envelopes count. |
| C11 | §4.7.4/§16.1(1) | A policy "requiring signed approvals" was described, but Appendix B has no field that can express it. | Fixed: signed approvals are deferred; no such policy field exists in v0.1. |
| C12 | §8.2 | `identities.checks[]` was cited as an optional report location, but Appendix C (`additionalProperties: false`) has no such field. | Fixed: the check-record identity is not a report field; `explain` may surface it. |
| C13 | Appendix D.5 vs §8.4 | The witness subject kind included `package`, but a `recomputed-digest` witness requires a `declared` value and the package has no declared self-digest. | Fixed: witness subjects are compared subjects only (artifact, source, input, claim). |
| C14 | §4.5.1 | "An input entry ... optionally embeds it" contradicted the required `path` and the per-file digest definition. | Fixed: v0.1 inputs are always embedded; no referenced-only input. |
| C15 | §4.5.1 | The text reported `integrity.inputs: NOT_EVALUATED`, a field that Appendix C does not define. | Fixed: input integrity is part of `integrity.package`; no separate field. |
| C16 | §5.7 | Profile recognition was cited as §6.4; it is §6.6. | Fixed. |
| C17 | §5.9, Appendix E.4 | The report schema and §7.7 require a top-level `checks[]` array, but the E.4 identity form omitted it while §5.9 listed only five exclusions and said witnesses are included. The vector was therefore either not the identity form of a conforming report, or witnesses had to be byte-identical across implementations, which the pre-patch §8.2–§8.3 did not require (`quoteBase64` was optional and witness selection was not pinned). | Fixed: §5.9 now includes every `checks[]` record (subjects, scope, checker, outcome, witnesses except `quoteBase64`) and excludes only presentation fields; E.4 is revised to a complete identity form with the three check records, and E.10 adds mutation vectors proving outcomes, scopes, witness ranges and diagnostic codes change the identity while messages and `quoteBase64` do not. This is OD-7. |
| C18 | §7.3, §7.4 | `integrity.package` said "declared digests match", which read as covering artifact and source digests that have their own dimensions, and it did not say what a claim-invalid or input-mismatch package does to that field. | Fixed: package covers existence/type/paths plus input and claim digests; artifact/source digests stay in their own dimensions. |
| C19 | §7.3, §12.4 | `integrity.artifacts` had no rule distinguishing a manifest that fails schema validation (no usable declaration) from a payload-level defect (missing file, symlink, invalid path), so the same case could be `FAIL` or `NOT_EVALUATED`. | Fixed: manifest-invalid → `NOT_EVALUATED`; payload-level defect → `FAIL`; limit → `NOT_EVALUATED`; F21/F22–F26/F29/F30/F35/F50/F51/F53/F60 updated. |
| C20 | Appendix C vs §6.7/§5.9 | `dimensions.humanReview.basis` was optional in the report schema, while §6.7 and the identity contract require `basis: "unbound-claim"` for every `PASS`. A schema-valid report could therefore represent `PASS` without the mandated basis. | Fixed: Appendix C adds an `allOf` `if/then` requiring `basis` when `status` is `PASS`, with the existing `const` fixing the value; §12.3 adds the positive/negative report-shape assertion (F55 valid; F55 with `basis` removed must fail validation). |

### 4.2 Under-specified required behaviour

| # | Where | Ambiguity | Disposition |
|---|---|---|---|
| U1 | §4.4.3 | `checkSpecs[].version` had to "match the suffix" of `id`, but no status or diagnostic was defined for a mismatch. | Fixed: `pap.package.schema`. |
| U2 | §5.7, Appendix C | `identities.extensionClosureDigest` had no definition at report level (declared profile closure? verifier checker closure?). | Fixed: declared `profile.closureDigest` or `null`; the verifier's own closure is `verifier.implementationDigest`. |
| U3 | §6.3, Appendix B | `minimumValidSigners` had no meaning in `optional`/`disabled` mode; the policy-invalid rule could read as applying there. | Fixed: ignored outside `required`; the invariant is scoped to `required`. |
| U4 | §6.5 | A key present in `keys[]` but mapped by no `signers[]` entry had no per-entry row. | Fixed: `UNKNOWN`/`REJECTED`, `pap.trust.signer-unknown`. |
| U5 | §6.7 | Reviewer scope binding, approval sufficiency, rejection precedence and boundary inclusivity were undefined. | Fixed: see §3 (human review). |
| U6 | §7.5 | `checksEvaluated`, `dimensionsEvaluated` and `full` had no computation rule, although §13.6 compares them. | Fixed: partition of the required set; decided-status definition; full formula. |
| U7 | §9.2 | `papVersion support: <range>` had no spelling. | Fixed: exact supported values, comma-separated without spaces; v0.1 prints `0.1`. |
| U8 | §9.4 | `INSPECTION:` tokens had no `UNSUPPORTED` value although exit 4 exists. | Fixed: `INSPECTION: …\|UNSUPPORTED`. |
| U9 | §9.8 | `--now` fraction length and leap-second handling were unstated, and `evaluatedAt`'s rendering was not fully defined. | Fixed: 1–9 fraction digits, `:60` rejected, offsets normalised, `evaluatedAt` rendered in UTC `Z`. |
| U10 | §11.2 | Envelope discovery depth, ordering, over-limit behaviour, canonical base64 and signature length were unstated. | Fixed: see §3 (signature adapter). |
| U11 | Appendix D.2 | Relation-name uniqueness was required but had no diagnostic code. | Fixed: `pap.claim.relation-duplicate`. |
| U12 | Appendix D.3/D.4 | Duplicate producer-report `checkId` and duplicate approval `id` were unaddressed. | Fixed: invalid claim (`pap.package.claim-invalid`). |
| U13 | §8.6 | The procedure had no step for duplicate relation names. | Fixed: step 2. |

### 4.3 Determinism and cross-implementation comparison

| # | Where | Gap | Disposition |
|---|---|---|---|
| S1 | §9.9 | Order of `dimensions.checks.results[]`, `dimensions.signature.signatures[]`, `verifier.checkerIdentities[]` and `inspect.declared[]` was undefined; §13.6 compares every dimension field. An alphabetical rule would also contradict E.4, whose arrays follow `checkSpecs` order and the Appendix B dimension order. | Fixed: `checkSpecs` order for checks and `requiredChecks`, Appendix B enumerable order for `requiredDimensions`, then explicit keys for the rest. |
| S2 | §9.9/§10.5 | Lowered limits had no report representation, so a non-default run was indistinguishable from a default run. | Fixed: optional `effectiveLimits` object, part of the identity form when present. |
| S3 | §12.1 | `unsigned-valid.json` pinned the reference checker identity; an independent verifier has a different `implementationDigest`, so F01 would differ on recognition for every non-reference implementation. | Fixed: fixture pins nothing; recognition is `NOT_APPLICABLE`. |
| S4 | §7.4 rule 2 | Any `checkerRecognition`/`profileRecognition` `UNTRUSTED` forced an `UNTRUSTED` verdict even when the policy did not require recognition, contradicting §6.6. | Fixed: recognition moves the verdict only when the policy requires it. |
| S5 | §12.1 | `untrusted-signer.json` was defined as "A or B" and used for F11, F16, F17 and F18, which need three different signer situations. | Fixed: `not-authorized-role.json`, `package-not-allowed.json`, `unknown-signer.json`; the "either shape" wording is forbidden for fixtures. |
| S6 | §12.4.3 | F26 expected `DI=NOT_EVALUATED` but listed no `pap.check.not-evaluated` code, contradicting §7.2's reason-recording rule. | Fixed. |
| S7 | §9.12 | The worked transcripts collapsed dimension paths (`trust.*`, `semanticTruth/legalEnforceability`) and the F27 coverage counts did not add up (3 declared, 1 passed, 1 not evaluated). | Fixed: every Appendix C path is shown and the counts are consistent with §7.5. |

### 4.4 Noted, no normative change

- The claims-files limit (16) can never bind because Appendix A declares exactly four claim kinds;
  it is documented as a forward-compatibility bound.
- Diagnostic `severity` is an impact marker, not a verdict; Appendix J's note stays.
- Hard links and same-privilege local attackers remain explicitly out of scope (§4.3.2, §10.6).
- Wall-clock budgets remain deferred; §10.5 records this as a limitation.

---

## 5. New assertions added by the patch

| Pinned behaviour | Case or vector |
|---|---|
| Policy window is closed at `issuedAt` and `expiresAt`; no skew tolerance | F47, F48 |
| One second outside the window is `STALE`/`INCOMPLETE` | F49 |
| Manifest BOM is invalid | F50 |
| Non-integer number token is invalid | F51 |
| Lowered limit → `integrity.artifacts: NOT_EVALUATED`, `effectiveLimits`, `INCOMPLETE` | F52 |
| `checkSpecs` version suffix invariant | F53 |
| All-optional checks → empty required set → `INCOMPLETE` | F54 |
| Positive human review with a policy-recognized reviewer | F55 |
| Optional mode: a present invalid envelope blocks `PASS` | F56 |
| Different major version → `UNSUPPORTED`, not schema `FAIL` | F57 |
| Binding to an undeclared source → invalid claim/`FAIL` | F58 |
| Duplicate relation name → `pap.claim.relation-duplicate` | F59 |
| Missing manifest → `pap.package.io`, identity `null`, `FAIL` | F60 |
| `humanReview: PASS` has `basis: "unbound-claim"`; a PASS report without it is schema-invalid | F55 plus §12.3 negative schema assertion |
| A limit that stops a non-required payload class still forces `INCOMPLETE` | F61 |
| JCS UTF-16 key order and minimal escaping | E.9 |
| Text required lines for `PASS` and non-`PASS` | F01/F02 re-run with `--format text` (§12.3) |

The new cases add no feature: every one asserts a rule already implied by the accepted design or
clarified by this patch. They are appended as F47–F61 so no existing case number moves.

---

### 5.1 Documented cases versus executable tests, and specified-but-unexercised branches

F47–F61 and E.9/E.10 are **normative descriptions**, not executable tests: the fixture corpus is
Phase 3a work and no PAP harness exists in this repository. The green CI above runs the existing
CORE-001 suite; it does not run a PAP case. The following branches are specified but not exercised
by any documented case, so they remain review risks rather than tested behaviour:

| Branch | Specified in | What would exercise it |
|---|---|---|
| total payload-byte limit and its fixed read order | §4.3.4 | a case lowering `totalPayloadBytes` below artifact + source size and asserting which identities are `null` |
| payload-count limit (read no file of the class) | §4.3.4 | a case with 4 097 declared payload files, beyond fixture practicality |
| JSON nesting or string-size limit on the manifest | §4.3.4, §9.11 | a case with a 65-deep manifest object |
| JSON nesting or string-size limit on a claim file | §4.3.4, §13.8 | a case with an over-deep `claims/relations.json` |
| envelope-count limit (read none, leave trust `NOT_EVALUATED`) | §4.3.4, §11.2 | a Tier B case with 33 envelopes |
| several limits exceeded in one run | §4.3.4 | a case lowering two limits at once |
| policy limit above the default → exit 64 | §6.3.2 | a policy fixture with `limits.fileBytes: 268435457` |
| Ed25519 non-canonical `S` rejection | §11.2 | a Tier B envelope with a canonical-bytes but non-canonical-`S` signature |
| identity mutation vectors | E.10 | a unit test of the identity function, not a CLI case |

Every row has a fixed, non-silent expected outcome in the normative text; none can silently become
a `PASS`. They are listed here so a reviewer can distinguish what the documented cases actually
prove from what only the text specifies.

## 6. Minimal RFC patch summary

| Change | Reason | Tests |
|---|---|---|
| §4.3.1/Appendix A: path diagnostic precedence | F22 vs schema pattern | F22 |
| §4.3.4/§9.11/Appendix C: limit branches, `integrity.package`/`integrity.artifacts: NOT_EVALUATED`, `effectiveLimits` | Verdict split and effective-limit reporting were unrepresentable | F35, F52 |
| §4.4.3/§8.8/§7.4/Appendix J.1: version-suffix invariant and empty required set | C6/U1 | F53, F54 |
| §4.5.1: inputs always embedded; no `integrity.inputs` | C14/C15 | F04 (existing) |
| §4.7.1/§7.3/§7.4/§8.5/Appendix D.1: invalid claim and undeclared source | C2/C7 | F58 |
| §4.7.4/§6.7/§16.1(1): review binding, freshness, acceptance, signed-approval deferral | U5 | F28, F55 |
| §4.9/§15.1/Appendix A: canonical `major.minor`, unsupported-version rule | C5 | F10, F57 |
| §5.3.1: integer-literal number tokens | D2 | F51, E.9 |
| §5.7/Appendix C: `extensionClosureDigest` meaning | U2 | F01/E.4 (existing) |
| §6.4/§9.8: closed window, no skew, `--now` profile, `evaluatedAt` rendering | C1/U9 | F47–F49 |
| §6.5/§9.3: disabled mode, all-present aggregation, orphan key | C9/C10/U4 | F11, F16–F18, F56 |
| §6.6/§7.4 rule 2: recognition gates only when required | S4 | F01, F13, F43 |
| §7.5: coverage counter definitions | U6 | E.4, F27 |
| §8.2/§8.4/Appendix D.5: check-record emission and witness subjects | C12/C13 | F42, E.4 |
| §5.9/Appendix E.4: include `checks[]` in the verification-record identity and revise E.4; add E.10 mutations | C17/OD-7 | E.4, E.10 |
| §8.6/Appendix D.2/Appendix J.3: duplicate relation name | U11/U13 | F59 |
| §9.2/§9.4/§9.6: version spelling, inspect token, text required lines | U7/U8/§3 text row | F01/F02 text run |
| §9.9: array ordering and `effectiveLimits` | S1/S2 | F36, F52 |
| §11.2/§11.3: envelope discovery/order/limit/canonical encodings; in-toto exclusion | U10, D12 | Tier B cases |
| §12.1: fixture policies split and `unsigned-valid` unpinned | S3/S5 | F01, F11, F16–F18 |
| §12.4.3/§12.4.6/§12.6: F26 code, F47–F61, coverage mapping | S6/§5 | F26, F47–F61 |
| §13.1/§13.5/§13.9: Tier A/Tier B and stage boundaries | D12/OD-5 | Tier lists |
| §13.8: resolution table and malformed-input mapping | §13.8 | all of the above |
| §16: pointer to this audit | Traceability | — |
| Appendix E.9: JCS edge vectors | D2 | E.9 |
| Appendix J: new/changed codes (`pap.claim.relation-duplicate`, `pap.package.empty-check-specs`, `pap.package.schema`, `pap.package.io`, `pap.limit.lowered`) | Code registry completeness | F52, F53, F59, F60 |

The patch does not touch `CORE-001.legacy.md`, any builder code, schema validation code or the
generated CORE-001 artifact. It is documentation only; `bun run check` remains green because no
build input changed.

---

## 7. Owner decisions requiring explicit approval

These seven choices are embedded in the proposed patch. They are recommendations; the maintainer
can accept, change or defer each one. Accepting the rest of the patch does not accept them
implicitly.

| ID | Question | Options | Recommendation and consequence |
|---|---|---|---|
| OD-1 | Should a resource limit that prevents reading artifacts or inputs yield `INCOMPLETE` (schema gains `NOT_EVALUATED` for `integrity.package`/`integrity.artifacts`), or should it be a package `FAIL`? | (a) `INCOMPLETE`, limit is a verifier boundary; (b) `FAIL`, a package too large for the verifier is unusable. | Recommendation: (a). It keeps §4.3.4's "limit is not a producer defect" principle and never turns a safety stop into a verdict against the producer. A limit on **any** declared payload class forces `coverage.full: false` and at most `INCOMPLETE`, even when that class's dimension is not required; the cost is one more status in Appendix C. |
| OD-2 | What may produce `humanReview: PASS` in v0.1, and what does it mean? | (a) Structural, in-scope, fresh evidence naming a policy-enrolled reviewer, unsigned; `PASS` is explicitly an unbound producer claim, reported with `basis: "unbound-claim"` (required by the Appendix C `if/then` when status is `PASS`), `pap.review.unbound` as diagnostic **and** limitation, and a text label; it can never be promoted to confirmed authorization or authenticated approval. (b) Require a signed approval, which v0.1 cannot express, so positive review stays `INCOMPLETE`/deferred. | Recommendation: (a). It makes the dimension meaningful and testable (F55) without overstating it. The limitation is explicit and machine-readable; signed approvals remain deferred. |
| OD-3 | Is text output allowed to stay layout-free beyond the required lines? | (a) Yes, pin required lines and tokens only; (b) standardise the full layout. | Recommendation: (a). §13.1 already makes text non-normative for comparison; standardising layout adds work without adding assurance. The required lines are now concrete enough to test. |
| OD-4 | How should an unsupported `major.minor` be treated? | (a) Widen the schema to canonical `major.minor`, report `UNSUPPORTED` with `minor-newer`/`version-unsupported`, keep 0.1-core `integrity.package: PASS`; (b) keep `0.x` only and let a different major fail schema. | Recommendation: (a). It matches §15.1 and prevents a future major from being misreported as malformed. |
| OD-5 | What does "v0.1 conforming" mean for the first implementation? | (a) Two tiers: Tier A core (no DSSE adapter; mandatory parsing, JCS, identities, three checks, policy/freshness/recognition/review, CLI, Tier A cases) and Tier B signature-capable (Tier A plus DSSE and all F01–F61); in-toto outside both; same-tier comparison only. (b) One tier requiring all F01–F61. | Recommendation: (a). It lets the Phase 3 unsigned demonstration make a precise claim without pretending the signature adapter is core. The cost is that Tier A must report envelopes and unsupported capabilities as `NOT_EVALUATED`/`UNSUPPORTED` with a limitation, and may not claim a signature or trust result; Tier A and Tier B compare only on Tier A cases. |
| OD-6 | Should a partially evaluated required check be `INCOMPLETE` or `FAIL` when evidence is missing? | (a) Always `INCOMPLETE`, never `PASS`; a limit that skips required inputs also forces `INCOMPLETE`; (b) `FAIL` when the policy asks for full coverage. | Recommendation: (a). Option (b) needs a policy field that does not exist; treating missing evidence as a disproved assertion would misstate what the verifier knows. |
| OD-7 | Should `verificationRecordIdentity` cover the top-level `checks[]` records and witnesses? | (a) Exclude `checks[]`; the identity covers only `dimensions.checks.results[]` and `coverage`, so different check subjects/scopes/witnesses can share an identity. (b) Include every record and witness field, exclude only presentation (`messages`, optional `quoteBase64`), pin deterministic witness emission, and revise E.4. | Recommendation: (b). Option (a) lets two reports with materially different verification evidence share an identity, which is exactly the auditability property the record is supposed to provide. The cost is a revised E.4 value and a small witness-emission rule; E.10 demonstrates the sensitivity. |

**Action requested:** approve, amend or defer OD-1–OD-7, and record the D1–D12 dispositions in
§16. Until that record exists, Gate 1 is not closed and Phase 2 remains gated.

---

## 8. Gate 1 readiness report

### 8.1 Closed by this audit

- D1–D12 each have an explicit recommended disposition and a rationale; all are recommended
  `accepted`, with two deferred sub-parts (signed approvals, text layout) that are outside the
  required v0.1 behaviour.
- Every §13.8 area has a normative resolution or a justified exclusion, and each is tied to a rule
  plus, where exercised, a case or vector; §5.1 lists the branches that remain specified but
  unexercised.
- Every normative rule the audit found untestable now has a documented assertion in F47–F61, E.9,
  E.10 or the text-line assertions, or is listed in §5.1 as a review risk; none is silently
  assumed.
- The audit found no remaining inconsistency in the rules the patch touches; Appendix E vectors
  reproduce exactly, with E.4 revised as C17/OD-7. This is a document self-audit, not independent
  verification or cross-implementation evidence.
- Deferred items are named in §8.2 and cannot silently affect a v0.1 verdict: they are either
  outside both conformance tiers (in-toto), require a policy field that does not exist (signed
  approvals, full-coverage switch), or are CLI-project policy that changes no identity or verdict
  (`--now` in production).

### 8.2 Remaining deferred items

| Item | Why it stays outside mandatory v0.1 conformance | How it is prevented from silently affecting a verdict |
|---|---|---|
| Archive transport (§10.7, §14.1) | No archive parser exists in v0.1. | A non-directory `PACKAGE` is a usage error (F25). |
| Sigstore/SCITT/OCI, online revocation, key management (§11.4, §14.1) | Require a network or hosted component. | Not representable by any v0.1 field; an unsupported adapter reports `pap.signature.unsupported-format`. |
| Signed human-review approvals | No review-attestation format or policy field. | `evidence` is opaque and never described as a signature; no policy can require one. |
| in-toto adapter (§11.3) | Optional mapping with two conforming outcomes. | Outside both tiers; no §12 case may require it. |
| Full-coverage policy switch | No such policy field. | Partial coverage is always `INCOMPLETE`; no `PASS` is possible. |
| Production `--now` policy | CLI-project concern; changes no format field. | `evaluatedAt` is reported in UTC; identity excludes it; verdicts are unaffected. |
| Exotic malformed-JSON tolerance beyond the fixed rules | Rejected as invalid JSON. | Document-type mapping in §13.8; no tolerance profile exists. |
| Wall-clock budget, hard links, local attackers | Out of scope, stated residual risk. | §10.5/§10.6 report them as limitations; no verdict path depends on them. |

### 8.3 Does a normative ambiguity still block independent implementation?

For the mandatory v0.1 contract as amended, the audit found **no known blocking ambiguity**. That
is a self-audit result, not proof: it lists every required verdict, dimension, diagnostic code and
identity it reviewed as defined. The remaining unknowns are the deferred items above, and each has
a fixed, non-silent outcome: usage error, `UNSUPPORTED`, `NOT_EVALUATED`/`INCOMPLETE`, or an
explicit limitation. An independent implementer should now be able to build Tier A and Tier B and
report any clause that still reads ambiguously; such a report is a specification defect, not an
implementation bug (§13.8).

Two residual risks remain, and they are not defects this audit can close:

1. **Specification review is not execution.** The audit checked the text against itself, the
   schemas and the vectors. Only a second implementation can reveal a clause that two readers
   interpret differently but that this document did not notice.
2. **Gate 1 is not Gate 3.** Gate 1 says the contract is ready to implement; Gate 3 requires the
   §13.6 comparison on the corpus, with a published exclusion list for record identity, messages,
   text layout and unfixed clocks. No Gate 3 evidence exists yet.

### 8.4 Verification performed for this audit

- Recomputed from the document's own bytes, with a standalone script independent of any producer
  or verifier code: E.1 `packageIdentity`; E.2 artifact, raw source, quote, per-input, input-set
  and claim digests; E.3 checker closure and identity; the revised E.4 identity form (including
  the three check records and the zero placeholder); E.5 normalization; E.6 domain separation and
  framing; E.7 PAE and its SHA-256; E.9 canonical JCS bytes and hashes; E.10 mutation hashes. All
  match. Appendix C was also validated with Ajv: a `PASS` report with `basis` validates, the same
  report without `basis` (or with another value) fails the conditional.
- Re-read Appendices A–D and J against the prose for status vocabularies, required/optional
  fields, patterns, ordering and diagnostic codes; every mismatch found is listed in §4. This is
  a document self-audit, not independent verification.
- Checked that every `pap.*` code used in normative prose or the matrix exists in Appendix J, and
  that every code added by the patch has a case or a rule that produces it.
- Confirmed the patch is documentation-only: no `spec/`, `profiles/`, `tests/` or generated
  artifact changes, so the repository's `bun run check` result is unaffected. The green CI runs
  the existing repository suite; it does not execute F01–F61, E.9 or E.10, which have no PAP
  harness or fixture corpus yet (Phase 3a).

### 8.5 What the maintainer needs to do

1. Approve, amend or defer OD-1–OD-7 (§7).
2. Record the D1–D12 dispositions in §16 of the RFC (recommended: `accepted`, with the two
   deferred sub-parts noted).
3. Then record the Gate 1 decision on #43/#57. This audit deliberately does not close either
   issue or change the gate status.

Once those records exist, the format is ready for the Phase 2 verifier and the Phase 3
interoperability demonstration; until then, Phase 2 remains gated on Gate 1.
