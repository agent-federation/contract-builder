# ODR-PAP-004 — Owner Decision Record: Phase 2a Stage 1 Implementation Authorization

**Status:** APPROVED — owner approved the Stage 1 scope and the A1–A4 errata approach on 2026-11-04; this PR publishes the exact authorization text for merge.
**Date:** 2026-11-04
**Decision scope:** Stage 1 of the Phase 2a implementation: normative text, experiment brief/case set, bundle v2 and reference alignment. Stage 2 (lab harness, external contract, new blind run) is excluded.
**Baseline:** `contract-builder` main `5249aab` (ODR-PAP-003 merged); RFC `a171fdcf…`; `cases.json` `8ae2693b…`; bundle `contract-builder-independent` `c568051`; proposal heads `b76e9a7` (#98) / `a39a066` (#99, content identical to the reviewed `ae8f383`).
**Related:** ODR-PAP-003; issues #94/#95; proposal PRs #98/#99; owner-side consistency audit, 2026-11-04.

## 1. Context

ODR-PAP-003 records the approved decisions:
D-P2A-1 **A**, D-P2A-2 **A** (19 full / 36 identity / 6 excluded, F58 identity-only, source-first provenance), D-P2A-3 **A**;
R-PAP-1 **B**, R-PAP-2 **A**, R-PAP-3 **B**, R-PAP-4 **A**.

The consistency audit before implementation found four high items that must be included in the authorization as narrow errata/clarifications, not new options:

- **A1** — RFC §9.7 contradicts R-PAP-1/R-PAP-2 on exit 74 and the `pap.package.not-found` code;
- **A2** — the bundle inventory already contains two non-source files (`docs/maintainer-decision.md`, `snapshot/source-provenance.md`), so the source-first "exact copy" claim and the 435/436 counts are not yet established;
- **A3** — bundle v2 curation/independence is not specified;
- **A4** — the ODR D-P2A-1 dependency record is four-field in the ODR summary but three-field in the RFC/E.3 hash.

This record authorizes Stage 1 only, incorporating A1–A4.

## 2. Authorized scope — Stage 1

### 2.1 Normative text (`contract-builder`)

Implement exactly the R-PAP-1..4 text from proposal PR #99 and ODR-PAP-003:

- **R-PAP-1 (B):** RFC §4.3.2 root-resolution bullet; §9.2 `PACKAGE` sentence; §9.10 item 3; Appendix J `pap.package.not-found` row. No new diagnostic, no §12 case change.
- **R-PAP-2 (A):** RFC §4.3.3 scan-incomplete bullet; §7.5 `full` predicate; Appendix J `pap.package.undeclared-scan-incomplete` (warning); §13.8 resolved row. No report-schema, §7.4 or §9.7 change except A1 below.
- **R-PAP-3 (B):** RFC §4.3.3 private-budget bullet; §10.5 no-normative-scan-entry-limit bullet. No Appendix B/C change; A1/A2 normative ceilings are not chosen.
- **R-PAP-4 (A):** RFC §4.3.1 last bullet replacement. No Appendix J change; no new diagnostics; F24 unchanged.

**A1 erratum (authorized as part of this record):**

- In RFC §9.7, map exit 74 to `pap.package.not-found` for a `PACKAGE` that is missing or unresolvable, and to `pap.io.error` for output unwritable or another I/O failure not covered by `pap.package.not-found`.
- State in §9.7 or in the R-PAP-2 text: a resolved `PACKAGE` whose manifest is readable but whose root or a directory under it cannot be listed is **not** a §9.7 "PACKAGE unreadable" I/O failure; it is the §4.3.3 scan-incomplete condition (`pap.package.undeclared-scan-incomplete`, `coverage.full: false`, at most `INCOMPLETE`).
- No other §9.7 behaviour changes.

Boundaries: no PAP version bump; no change to report/manifest schemas; no change to the §12 corpus; no §16 register reopening; no other RFC section edits.

### 2.2 Experiment brief, record schema and case set

- Apply D-P2A-1 to `AGENT_BRIEF.md`: new §4.4.1 checker identity; §4.5 sentence; §7.1 E.3 bullet; §10 record bullet; exactly as proposed in PR #98 `decisions.md` §D-P2A-1.
- **A4 clarification:** the hashed closure dependency record remains `(name, version, integrity)` per RFC §5.2; the experiment-record entry adds `artifact` **outside** the hash; `dependencySelection` records the deterministic reduction; Appendix E.3 must reproduce exactly.
- Apply D-P2A-2 to `AGENT_BRIEF.md` §7.4 (experiment-scope pointer to the case set).
- Add the final experiment-scope `pap/fixtures/pap-v0.1/cases-phase2a.json`, version `2a.1`, derived from PR #98 `cases-phase2a.proposed.json` with proposal-only fields removed: no `proposalStatus`, `pendingOwnerDecisions`, `summary.f58PendingOwnerDecision`, F58 `pendingOwnerDecision`/`alternateProfile`; F58 is `identityOnly`; summary **19/36/6**; `caseSetOrigin`/`caseSetCommit`; F29 `packageIdentity` is `null`; 55 non-excluded identity literals are the approved values.
- Owner-side experiment-record schema: additive `implementation` object for D-P2A-1; existing records remain valid for their bundle commits.
- Recommended experiment-scope clarification (not a new decision): in `AGENT_BRIEF.md` §4.1, state that a `PACKAGE` that is a symlink to a directory is resolved and payload symlinks remain rejected (R-PAP-1 B), and point to RFC §4.3.3/§7.5 for the scan-incomplete outcome. This keeps the bundle v2 brief consistent with the updated RFC.

Boundaries: `cases.json` remains the normative §12 corpus; `cases-phase2a.json` is experiment metadata, not PAP conformance material; no §12 case changes.

### 2.3 Bundle v2 (`contract-builder-independent`)

**A2 inventory model:**

- The current snapshot manifest mixes source-origin and bundle-local files: `docs/maintainer-decision.md` and `snapshot/source-provenance.md` do not exist at source `c6ee644`.
- Resolve the model before regeneration: either add `docs/maintainer-decision.md` to the new source commit (preferred, so it is source-origin) and treat `snapshot/source-provenance.md` as bundle-local metadata, or declare both as bundle-local.
- The manifest must distinguish source-origin files from bundle-local entries; `source.commit` must be true for every source-origin `files[]` path.
- Recompute the inventory and counts after the model is fixed. Do **not** carry 434/435 or 435/436 into the experiment record until they are recomputed for the chosen model.

**A3 curation (explicit):**

- Include: updated `docs/architecture/portable-assurance-package-rfc.md`; `pap/fixtures/**` (including `cases-phase2a.json` and `archive.tar`); `pap/schemas/**`; `AGENT_BRIEF.md` (bundle root); `docs/maintainer-decision.md` if source-origin; `snapshot/` metadata.
- Exclude: `pap/src/**`, `pap/tests/**`, `profiles/**`, `contracts/**`, `tests/**`, all `docs/architecture/proposals/**`, all `docs/decisions/**`, the Gate 1 audit, and any other documentation. Do not include proposal packages, ODR-PAP-003 or audit documents in the blind bundle; they contain reference-probe evidence and are not authorized inputs for a blind implementation.
- If brief §3.6 requires supplied accepted decisions, use a sanitized decisions summary without reference-probe evidence, or record that the updated RFC + brief + case set are the supplied decisions.

**D-P2A-3:** restore the 38-byte sentinel `pap/fixtures/pap-v0.1/archive.tar` (sha256 `81f5d803…`) in the bundle; F25 remains a Phase 2c case.

**Verification required before the bundle is recorded:**

- `verify_snapshot.py` passes;
- an added check confirms every source-origin `files[]` path exists at `source.commit`;
- a prohibited-file check confirms no implementation source/tests, proposals, ODRs, audits or other excluded material is present;
- manifest/SHA256SUMS counts and hashes are recomputed and written into the bundle and experiment record; the bundle commit, manifest SHA-256 and `AGENT_BRIEF.md` hash are recorded.

### 2.4 Reference verifier alignment (`contract-builder`)

- Implement R-PAP-2 and R-PAP-3 in the reference verifier: scan-incomplete code/limitation/coverage/verdict; private entry and depth stops use `pap.package.undeclared-scan-incomplete` and never `pap.package.limit-exceeded`; declared-file I/O remains `pap.package.io`/`declared-file-missing`/`FAIL`.
- Add regression tests: root unlistable with readable manifest; unreadable undeclared directory; aggregation with an independent `FAIL` (remains `FAIL/1`, `coverage.full: false`); private entry/depth stops. No portable static §12 case is added.
- The reference remains a baseline for external probes only; it is not a blind-run oracle.

### 2.5 Acceptance criteria for Stage 1

- RFC/Appendix J diff contains only the R-PAP-1..4 changes and A1 erratum; no version bump, no other normative change.
- `AGENT_BRIEF.md` changes are exactly D-P2A-1/2 plus the optional R-PAP pointer; no scope expansion.
- Final `cases-phase2a.json` validates: 19/36/6, F58 identity-only, F29 `null`, no pending/proposal fields; `verify_cases.py`-equivalent checks pass; Appendix E.3 reproduces; 55/55 non-excluded identities match the approved literals.
- Bundle v2: A2 model fixed, A3 curation verified, counts recomputed, snapshot verifier + source-existence + prohibited-file checks pass; hashes recorded.
- Reference probes for R-PAP-2/3 pass; CI is green.
- Old blind-run records and the v1 case set are not edited or rewritten.

## 3. Errata/clarifications incorporated

| ID | Where | Required resolution |
|---|---|---|
| A1 | RFC §9.7 / R-PAP-2 text | exit-74 code mapping (`pap.package.not-found` vs `pap.io.error`); root-unlistable is scan-incomplete, not §9.7 I/O failure |
| A2 | Bundle inventory | source-origin vs bundle-local model; add maintainer-decision to source or declare bundle-local; recompute counts; source-existence check |
| A3 | Bundle v2 curation | explicit include/exclude lists; no proposals/ODRs/audits/implementation source in the blind bundle |
| A4 | D-P2A-1 dependency record | hashed record is 3-field `(name, version, integrity)`; `artifact` is experiment-record metadata outside the hash; E.3 passes |

## 4. Not authorized by this record

- Stage 2: lab harness migration to the v2 case set, comparison-tool changes beyond the record schema, external conformance-contract reissue, additional external probes, egress changes.
- The new blind run, new experiment identifiers, any Gate 3 claim or conformance conclusion.
- Editing `cases.json`, the §12 corpus, report/manifest schemas, PAP version, or any RFC section outside §2.1.
- Editing the external conformance contract or its owner-side copy.
- Rewriting old blind-run records, the v1 case set, or historical audit results.
- Merging PRs, publishing releases, or claiming a result not evidenced by executed checks. Agents do not merge.

## 5. Workstreams and expected PRs

1. **Normative text** (`contract-builder`): RFC/Appendix J R-PAP-1..4 + A1 erratum + §13.8 rows.
2. **Case set + record schema** (`contract-builder` source for `cases-phase2a.json`; owner-side schema for the `implementation` object).
3. **Bundle v2** (`contract-builder-independent`): brief changes, snapshot regeneration with A2/A3, archive.tar, manifest/SHA256SUMS, verifier checks.
4. **Reference alignment** (`contract-builder`): R-PAP-2/3 code/tests; separate commit/PR from normative text if practical.
5. **Traceability**: each PR references ODR-PAP-003, this record and the relevant proposal section; acceptance commands and hashes are recorded in the PR.

The proposal PRs #98/#99 remain decision input; they are not merged by this authorization. Implementation text should be taken from the approved decisions and the proposals' exact wording, not from their proposal-status banners.

## 6. Stop conditions

Stop and escalate if any of the following occurs:

- a change would require a new decision, a PAP version bump, a report/manifest schema change, a §12 corpus change, or an RFC section outside §2.1;
- the bundle cannot be made provenance-consistent under A2/A3, or a prohibited file appears in the bundle;
- the final case set cannot be represented without changing the approved 19/36/6 classification or the F58 decision;
- the reference behavior cannot be changed without affecting the blind baseline or using the reference as an oracle;
- CI or a verification command fails for a reason that is not clearly a test/environment issue.

## 7. Owner approval

**Proposed decision:** authorize Stage 1 as described, including the A1–A4 errata/clarifications.

**Owner decision:** APPROVED on 2026-11-04 (Stage 1 scope and A1–A4 errata approach). The exact text above is published for the record; the owner may amend before merge if it differs from the approved scope.

**Owner approval reference:** session approval, 2026-11-04; merge of this record completes the authorization. If desired, the owner may add an issue comment link for the canonical approval reference.

**Date:** 2026-11-04
