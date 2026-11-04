# ODR-PAP-003 — Owner Decision Record: Phase 2a Comparability Bundle v2 and RFC Ambiguity Resolutions

**Status:** APPROVED
**Date:** 2026-11-04
**Decision scope:** PAP v0.1 Phase 2a handoff bundle v2 (D-P2A-1, D-P2A-2, D-P2A-3) and RFC ambiguity resolutions (R-PAP-1, R-PAP-2, R-PAP-3, R-PAP-4)
**Planning baseline:** `agent-federation/contract-builder` main at `7f3e350` (current at drafting). PR #98 pins `5291f1b`; PR #99 cites `0a5132e` for repository evidence. The RFC and `cases.json` blob hashes are identical at `0a5132e` and `7f3e350`, so the cited evidence is stable; refreshing PR #99's baseline reference is editorial, not a decision condition. Handoff bundle at `agent-federation/contract-builder-independent` `c568051`; bundle snapshot source `c6ee644`.
**Proposal packages:** PR #98 (`docs/architecture/proposals/pap-phase2a-bundle-v2/`, head `b76e9a7`) and PR #99 (`docs/architecture/proposals/pap-phase2a-rfc-ambiguities/`, head `ae8f383`), both draft and planning-only. Architect re-reviews: [PR #98 review](https://github.com/agent-federation/contract-builder/pull/98#pullrequestreview-5764597382), [PR #99 review](https://github.com/agent-federation/contract-builder/pull/99#pullrequestreview-5764597709).
**Evidence:** the public RFC, `AGENT_BRIEF.md`, `cases.json`, the published schemas, the public reference verifier, and the architect/`it-start` verification runs recorded in the proposal packages.

## 1. Context

The Phase 2a blind interoperability runs produced a comparison set of 22 full / 33 identity / 6 excluded cases and exposed two classes of problem:

1. the case-set projection mixed Phase 2a-decidable cases with cases whose expected outcome depends on Phase 2b/2c capabilities;
2. the implementation-identity recipe was absent from the Phase 2a brief, so three independently produced verifiers fabricated or copied `implementationDigest` / `checkerIdentity`.

Planning issues #94 (bundle v2) and #95 (RFC ambiguities) were opened. The maintainer's preliminary architect positions were published as input, `it-start` produced planning-only proposal packages (PR #98, PR #99), the architect reviewed them, and `it-start` revised both packages in response. The architect re-review confirmed that the revisions close the findings and that no architect blocker remains.

This record fixes the owner decisions. It records decisions only; it does not authorize implementation (see §11).

### 1.1 Evidence checked before this record

- Appendix E.3 checker-identity vector reproduced independently: `implementationDigest sha256:73f738b733b177c04597b0e6ab9c4d267059ea1556e6f943d543c252c5ef15c0`, `checkerIdentity sha256:15a0b0149dc95f7b9711e7b28fc4189ed8539b03ffd2c96e967205316d75963f`.
- The proposed 55 non-excluded case identities agree with the reference reports after the F29 correction (55/55; F29 is `null` on both sides).
- F29's manifest repeats `package.id`; RFC §5.3.1 requires the canonicalizer to reject duplicate member names, so no `packageIdentity` is computable. The reference reports `null`; the case set now expects `null` and the checker rejects duplicate keys, BOM and non-integer number spellings before computing an identity.
- `archive.tar` at source `c6ee644` is a 38-byte ASCII sentinel, SHA-256 `81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7`; the bundle omits it (the snapshot manifest lists only `F25-archive/.gitkeep`); restoring the source blob makes F25 return exit 64 / empty stdout / `pap.cli.usage`.
- Reference probes reproduced for #95: symlinked root `PASS/0`; root symlink to a regular file `64` (`pap.cli.usage`); dangling root symlink `74` (`pap.package.not-found`); unlistable root with a readable manifest `FAIL/1` with `pap.package.io` and `coverage.full: true`; unreadable undeclared directory `FAIL/1` with `pap.package.io` and `coverage.full: true`; a package with 8 300 entries exceeding the 8 192-entry private cap and a 16-level depth stop, both `INCOMPLETE/2` with `pap.package.limit-exceeded`; cross-class same basename `PASS/0`; wrong-root declaration `path-invalid` + `path-duplicate`.
- CI `check` passed on the reviewed proposal heads (`b76e9a7` for #98, `ae8f383` for #99).

### 1.2 What this record supersedes

- The preliminary 22 full / 33 identity / 6 excluded projection is withdrawn in favour of 19/36/6 (see D-P2A-2).
- The preliminary option C for F25 is withdrawn; option A is chosen (see D-P2A-3).
- The preliminary *options* for R-PAP-1..4 stand (B/A/B/A); several preliminary *rationales* are corrected by the evidence above and by the proposals (see R-PAP sections).
- The v1 comparison set is superseded as experiment metadata. Existing blind-run records are not edited or rewritten; they remain valid records of what was run and are labelled accordingly. Bundle v2 is a new baseline with new experiment identifiers.

## 2. Decision summary

| ID | Decision | Chosen option |
|---|---|---|
| D-P2A-1 | Implementation identity in the Phase 2a brief | **A** — normative §4.4.1 recipe, report fields, record fields, E.3 vector, two-way self-check |
| D-P2A-2 | Frozen Phase 2a case set | **A** — separate experiment-scope `cases-phase2a.json`, **19 full / 36 identity / 6 excluded**, F58 identity-only, source-first provenance |
| D-P2A-3 | F25 archive fixture | **A** — restore the 38-byte source sentinel in the bundle; F25 stays a Phase 2c case |
| R-PAP-1 | Symlinked package root | **B** — permit and resolve; 64/74 mapping; no new diagnostic |
| R-PAP-2 | Traversal error during the undeclared-file scan | **A** — new warning `pap.package.undeclared-scan-incomplete`; `coverage.full: false`; at most `INCOMPLETE` |
| R-PAP-3 | Directory/entry ceiling during the scan | **B** — non-normative robustness ceiling; private stops use R-PAP-2's code |
| R-PAP-4 | Cross-class / case-only path collision | **A** — global duplicate rule; cross-class collision impossible for a well-formed declaration; no new diagnostics |

The decisions are independent unless noted (R-PAP-3 depends on R-PAP-2). The owner may approve or reject any entry individually; if an entry is rejected, its recorded alternative in the proposal package applies.

## 3. D-P2A-1 — Implementation identity in `AGENT_BRIEF.md`

**Decision: APPROVE option A.**

`AGENT_BRIEF.md` gains the checker-identity recipe as new §4.4.1, plus one sentence in §4.5, one bullet in §7.1 and one bullet in §10, as specified in PR #98 `decisions.md` §D-P2A-1:

- `implementationDigest = extensionClosureDigest(kind="checker", id, version, files, dependencies)` per RFC §5.8 and §5.2;
- `checkerIdentity = H("pap.checker.identity.v1", JCS({id, version, implementationDigest}))`;
- `id` is `pap.verifier.<language>`, `version` is `0.1.0`; the same values appear in `verifier.id`/`verifier.version` and in check-record `checker` objects;
- the closure is the implementation's own source closure (tracked text files that contribute to building the verifier, including build manifests and lockfiles; tests, fixtures, documentation and non-build generated files excluded), LF-normalized per RFC §5.2; a binary file in the closure is an error;
- dependencies are one record per package: `(name, version, integrity, artifact)`, where `integrity` is the lockfile token for the artifact the build actually consumes, `artifact` identifies the selected wheel/sdist/module zip, and `dependencySelection` records the deterministic reduction rule for multi-artifact lockfiles (`uv.lock`, `go.sum`, `Cargo.lock`); `/go.mod` lines, unselected wheels and other generated lock metadata are not separate dependencies; the runtime/compiler stays outside the closure;
- Appendix E.3 is the normative vector and must be reproduced exactly; the identity is computed from the implementation checkout, never copied from package data, a previous run, another implementation or the reference;
- both self-check directions are recorded: one included file changed, digest must change; one excluded file changed, digest must not change.

The experiment-record schema gains an `implementation` object carrying `id`, `version`, `implementationDigest`, `checkerIdentity`, `closure.files[]`, `closure.dependencies[]`, `closure.dependencySelection`, optional `closure.listSha256`, both `selfCheck` entries and `runtime`.

**Boundary:** this is an experiment-scope brief convention. It does not change the RFC or the report schema. Checker identity remains excluded from cross-implementation comparison (RFC §13.6); it is provenance, not a comparison field. It is not a security control: a fabrication remains possible and the record/self-check make it auditable, not impossible.

## 4. D-P2A-2 — Frozen Phase 2a case set

**Decision: APPROVE option A, with the default 19 full / 36 identity / 6 excluded projection, F58 identity-only, and source-first provenance.**

The Phase 2a case set is a separate experiment-scope file `pap/fixtures/pap-v0.1/cases-phase2a.json`, version `2a.1`, with the profiles and per-case expectations in PR #98 `cases-phase2a.proposed.json` and `decisions.md`. It references `cases.json` by case id; the normative exit code, verdict and dimension values remain in `cases.json`.

**Membership:** 19 full, 36 identity-only, 6 excluded (F25, F37, F38, F39, F41, F42 — all Phase 2c). F58 is identity-only by this decision: claim-file schema/cross-field validation is **not** a Phase 2a requirement. The 20/35/6 alternative is not chosen. F46 and F59 are identity-only because their expected verdict depends on `pap.check.relation-consistency/1` (Phase 2b), which the Phase 2a brief forbids.

**Comparison profile:** `full` compares exit code, verdict, the per-case applicable diagnostic-code subset (check-family `pap.check.*` codes are not compared in 2a), `integrity.package` / `integrity.artifacts` statuses, and `packageIdentity` (exact, relation or `null`). It does not compare checks, `coverage.full`, verifier identity, checker identity, record identity, `evaluatedAt` or text output. `identityOnly` compares only `packageIdentity`; `excluded` compares nothing and counts the case under its owning phase.

**Identity oracle:** expectations are generated by the strict canonical-JSON/JCS/SHA-256 procedure in `verify_cases.py` (validated against Appendix E.1 and E.3), not by the reference implementation's report. F29's expectation is `null`: its manifest repeats `package.id`, RFC §5.3.1 forbids canonicalization, and the checker rejects duplicate keys, BOM and non-integer number spellings before computing any identity.

**Provenance:** source-first is accepted. `cases-phase2a.json` is added to the source repository at a new source commit and the bundle is regenerated from that commit; `snapshot/manifest.json` `source.commit` moves from `c6ee644` to the new commit, the file is added to the manifest and `SHA256SUMS`, and the manifest hash and file counts are recomputed. With D-P2A-3 also applied the expected counts are 435 snapshot files and 436 `SHA256SUMS` lines; D-P2A-2 alone gives 434 / 435. Existing experiment records pin the old bundle commit and remain valid.

`AGENT_BRIEF.md` §7.4 gains one paragraph pointing to the case set as experiment metadata: it selects cases and fields for Phase 2a comparison, `cases.json` remains the normative §12 corpus, and excluded cases are recorded as later-phase, not claimed as Phase 2a acceptance.

**Boundary:** experiment-scope metadata, not an RFC §12 amendment and not PAP conformance material. If it is to become normative, an RFC §13.1/§12 amendment is a separate decision. The v1 case set is superseded, not edited.

## 5. D-P2A-3 — F25 archive fixture

**Decision: APPROVE option A.**

Restore the exact source blob `pap/fixtures/pap-v0.1/archive.tar` from `c6ee644`: 38 bytes, ASCII content `not a tar that a verifier may extract.\n`, SHA-256 `81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7`. Add it to the bundle at the same path and to `snapshot/manifest.json` and `snapshot/SHA256SUMS`; recompute the manifest hash.

F25 (`verify ../archive.tar`) remains as published: no report, exit 64, `pap.cli.usage`, and remains excluded from the Phase 2a outcome set because it is a Phase 2c CLI case. Restoring the sentinel is source-faithful: it is not a real archive and implies no archive semantics; the brief's "no archive transport" rule stands.

**Boundary:** no change to `cases.json`, the RFC, `AGENT_BRIEF.md`, schemas or any other fixture. Option C (synthetic replacement) is not chosen. Adding a fixture is not implementation authorization.

## 6. R-PAP-1 — Symlinked package root

**Decision: APPROVE option B.**

A `PACKAGE` that is a symbolic link to a directory is permitted. The verifier resolves the operator-supplied root once and applies every containment rule to the resolved directory; symbolic links at or below a declared payload path remain rejected. The RFC text is amended exactly as proposed in PR #99 `decisions.md` §R-PAP-1:

- RFC §4.3.2: new bullet defining the resolved root, the 64/74 mapping (`pap.package.not-found`/74 for a root that does not resolve; `pap.cli.usage`/64 for a root that resolves to a non-directory), and the distinction from payload reads;
- RFC §9.2: `PACKAGE` sentence for `verify`, `inspect` and `explain`;
- RFC §9.10: item 3 appended so root resolution is not "following a path outside the package root";
- Appendix J: `pap.package.not-found` row updated to cover an unresolvable `PACKAGE` symlink.

No new diagnostic; no §12 case changes. The report's `package.path` remains the supplied path (host-specific, excluded from record identity).

**Consequences:** no reference behaviour change at this baseline (it already resolves). If the external conformance contract retains FS-01, its expectation must be reissued from `FAIL/1` to `PASS/0`; that reissue is conditional on this decision and is owned by the external contract owner. go/rust/python must implement root resolution if FS-01 is retained; their current `UNSUPPORTED/4` / `INCOMPLETE/2` is not a pass. A non-gating test that still says `FAIL/1` would mislead the next reader.

## 7. R-PAP-2 — Traversal error during the undeclared-file scan

**Decision: APPROVE option A.**

A failure that prevents the verifier from completing the undeclared-file scan means the absence of undeclared files was not established. The verifier MUST emit `pap.package.undeclared-scan-incomplete` (warning) with scope `package`, add the same code to `limitations[]`, set `coverage.full: false`, and report a verdict at most `INCOMPLETE`; it MUST NOT be `PASS`. The affected scan scope is `NOT_EVALUATED`, represented by the diagnostic, the limitation and `coverage.full: false`; no dimension changes solely because of this condition. An independently established `FAIL` remains `FAIL` under RFC §7.4 precedence.

The condition covers an I/O error while enumerating the package root or any directory under it, and any private implementation scan budget (entry count, traversal depth or other) that stops the scan. It does not cover an unresolvable root (`pap.package.not-found`/74), an unreadable manifest (`pap.package.io` with a `FAIL` report), or a declared payload failure (`pap.package.declared-file-missing` / `pap.package.io`, `FAIL`).

Normative text and consequences are those in PR #99 `decisions.md` §R-PAP-2: RFC §4.3.3 new bullet; RFC §7.5 `full` predicate gains the scan-completeness conjunct; Appendix J new warning row; RFC §13.8 resolved-area row. No report-schema change, no §7.4 change, no §9.7 change.

**Consequences:** the reference currently implements the opposite (B): `pap.package.io` as an error, `integrity.package: FAIL`, `coverage.full: true`, exit 1. It must change those three places and gain a root-unlistable unit/hostile test plus the aggregation test (independent artifact mismatch + unreadable undeclared directory remains `FAIL/1`, with `coverage.full: false`). No portable static §12 case can be committed; a unit/hostile test with a controlled filesystem error is the test vehicle. External FS-04 (`INCOMPLETE/2`) matches A and should name the code and coverage assertion; FS-04 must be re-run on go/rust/python before it is used as conformance evidence.

## 8. R-PAP-3 — Directory/entry ceiling during the scan

**Decision: APPROVE option B.**

v0.1 defines no normative limit on the number of filesystem entries visited by the undeclared-file scan. A verifier MAY use an internal robustness budget. Any private scan stop (entry count, traversal depth or other) MUST be reported under R-PAP-2 as `pap.package.undeclared-scan-incomplete`, `coverage.full: false`, verdict at most `INCOMPLETE`, and MUST NOT be reported as `pap.package.limit-exceeded`, which is reserved for §4.3.4 limits. No conformance case may assert a specific internal budget, and no `PASS` may be reported when the scan did not complete.

Normative text is RFC §4.3.3 (B bullet) and RFC §10.5 (no normative scan-entry limit); no Appendix B or Appendix C change. The external directory-count test is a robustness test only (no crash, hang or unbounded resource use) and must not assert `PASS`/`INCOMPLETE`.

**Dependency:** B is not implementable as written without R-PAP-2's report outcome. If R-PAP-2 is rejected, the reference must remove its private cap or the owner must choose the normative alternative A. A (A1 fixed 8 192 or A2 policy-configurable `limits.scanEntries`) is explicitly not chosen by this record.

**Consequences:** the reference's current 8 192-entry cap and 16-level depth stop remain private, but both must stop using `pap.package.limit-exceeded`; two verifiers may still disagree on a package that exceeds only one private budget; that residual is accepted by B and must be recorded, not hidden.

## 9. R-PAP-4 — Cross-class / case-only path collision

**Decision: APPROVE option A.**

The duplicate and case-fold rules apply to all declared payload paths as one set, not per class. A well-formed package cannot contain one package-relative path in two classes because the declared roots are disjoint. No separate cross-class collision rule is required; a verifier that already applies the global duplicate set is conformant. A declaration whose path does not start with its class root is `pap.package.path-invalid`; the duplicate rule is still evaluated over the same declaration set, so a malformed declaration may additionally produce `pap.package.path-duplicate`.

RFC §4.3.1's last bullet is replaced with the wording proposed in PR #99 `decisions.md` §R-PAP-4. No Appendix J change and no new diagnostic. F24 remains exactly as published: case-only collision within `artifacts/`, `integrity.package: FAIL`, `integrity.artifacts: FAIL`, `pap.package.path-duplicate`, `coverage.full: false`, `FAIL/1`.

## 10. Normative status and versioning

- R-PAP-1..4 amend the RFC v0.1 text and Appendix J by clarification; they do not bump the PAP version, do not reopen decision register D1–D12 or §16.1, and do not change the report schema.
- D-P2A-1..3 are experiment-scope decisions. `AGENT_BRIEF.md` is the experiment brief, not the normative RFC; `cases-phase2a.json` is experiment metadata; `cases.json` remains the normative §12 corpus. The F58 decision is part of D-P2A-2.
- The reference verifier changes required by R-PAP-2/R-PAP-3 and the bundle/snapshot changes required by D-P2A-2/D-P2A-3 are implementation work under a separate authorization; this record does not perform or authorize them.

## 11. What this record does not authorize

This record records decisions only. It does not authorize:

- editing `AGENT_BRIEF.md`, the RFC, any appendix, schema, fixture corpus or `cases.json` content;
- adding or regenerating the bundle, its manifest, `SHA256SUMS` or snapshot;
- changing the reference verifier or its tests;
- implementing the checker-identity recipe or the case-set consumer;
- running a new blind experiment or claiming any new conformance result;
- editing the external conformance contract (the external owner must reissue FS-01 and align FS-04/directory-count);
- merging the proposal PRs, publishing a release, or claiming Gate 3.

A separate implementation authorization is required before any of the above. No agent merges.

## 12. Follow-up obligations (recorded, not authorized here)

1. **`it-start`** records this ODR in the canonical decision record after owner approval, and prepares a separate implementation plan/PR only when authorization is granted. Accepted decisions are recorded in the established proposal flow, not in the proposal packages.
2. **External contract owner:** if R-PAP-1 is approved, reissue FS-01 as `PASS/0`; for R-PAP-2 name `pap.package.undeclared-scan-incomplete` and the `coverage.full: false` assertion in FS-04; reclassify the directory-count test as robustness-only. The draft contract's `FAIL/1` remains an open ambiguity until reissued.
3. **Owner-side evidence:** update `EXT-FS-01` after the decisions; re-run FS-04 (scan traversal) on go/rust/python before using it as conformance evidence; do not rewrite blind-run records; bundle v2 uses new experiment identifiers.
4. **Bundle v2:** source-first `cases-phase2a.json`, restored `archive.tar`, regenerated snapshot from the new source commit; update file counts and checksums as in D-P2A-2/D-P2A-3.

## 13. Owner approval

**Proposed decision:** approve D-P2A-1 (A), D-P2A-2 (A, 19/36/6, F58 identity-only, source-first), D-P2A-3 (A), R-PAP-1 (B), R-PAP-2 (A), R-PAP-3 (B), R-PAP-4 (A) as recorded above.

**Owner decision:** APPROVED on 2026-11-04: D-P2A-1 A; D-P2A-2 A (19/36/6, F58 identity-only, source-first provenance); D-P2A-3 A; R-PAP-1 B; R-PAP-2 A; R-PAP-3 B; R-PAP-4 A.

**Owner approval reference:** [#94 approval comment](https://github.com/agent-federation/contract-builder/issues/94#issuecomment-6625216848) and [#95 approval comment](https://github.com/agent-federation/contract-builder/issues/95#issuecomment-6625218700). The two comments cross-reference each other and [PR #103](https://github.com/agent-federation/contract-builder/pull/103).

**Date:** 2026-11-04

If any entry is not approved, record the rejected entry and the alternative chosen; R-PAP-3 cannot be accepted without R-PAP-2's report outcome (see §8).
