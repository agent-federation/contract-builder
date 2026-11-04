# PAP v0.1 Phase 2a handoff bundle v2 — decision proposal

**Status:** planning-only proposal package for maintainer review. It authorizes no implementation
and changes no RFC, brief, snapshot, corpus, schema, fixture, verifier or generated artifact.

**Prepared for:** [Issue #94](https://github.com/agent-federation/contract-builder/issues/94) and
the preliminary architect position in
[issue comment 6623392056](https://github.com/agent-federation/contract-builder/issues/94#issuecomment-6623392056).
**Author:** automated agent (`it-start`).
**Decision status:** none of D-P2A-1/2/3 is accepted. The recommendations are proposals; the maintainer owns the decisions. F58 is expressly pending.
**Baseline:** `agent-federation/contract-builder` base branch at
`0a5132e` (the PR base, 2026-11-04); handoff bundle `agent-federation/contract-builder-independent` at
`c568051` (2026-11-03); bundle snapshot source commit `c6ee644` (2026-11-02).

This package answers one question: **which of the three preliminary positions are supported by the
repository, and what exact wording or artifact would implement the maintainer's decision?** It
re-derives the Phase 2a boundary from the public RFC, brief and corpus, then states where it
disagrees with the preliminary position and why. It does not record owner decisions and does not
start implementation.

## Recommendation at a glance

| Decision | Preliminary position | This proposal | Disagreement |
|---|---|---|---|
| D-P2A-1 — implementation identity in the brief | A | **A**, with a complete recipe: id/version values, closure file rules, LF/binary handling, dependency-record form, Appendix E.3 vector, report and experiment-record fields | Partial. A is right, but the preliminary recipe is not sufficient to make identities comparable; its four bullet points leave the declaration set and `id`/`version` open. |
| D-P2A-2 — frozen Phase 2a case set | A, with 22 full / 33 identity / 6 later-phase | **A** (separate `cases-phase2a.json`), proposed default **19 full / 36 identity / 6 later-phase**, expressly pending the F58 owner decision (20/35/6 if included), with reference-free identity expectations | Yes. F46 and F59 require the Phase 2b relation-consistency check and cannot be produced by a compliant Phase 2a verifier; F58 is a claim-semantics case the brief does not require in Phase 2a; the identity comparison must not use the reference implementation as the oracle; the new file's provenance and normative status need an explicit rule. |
| D-P2A-3 — F25 archive fixture | C | **A**: restore the existing 38-byte source sentinel `archive.tar` in the bundle and update the manifest/checksums | Yes. The source file at the frozen commit is not a real archive; it is an ASCII sentinel. Restoring it is the minimal source-faithful fix and preserves the RFC's F25 row. C is either the same change under another name or a broader `cases.json`/RFC §12.4 rewrite that this issue does not authorize. |

## Evidence baseline

The recommendations below are derived from public repositories and the public issue text. Private
audit tooling and the three implementation repositories are not premises for any recommendation.

| Fact | Evidence |
|---|---|
| The RFC and `cases.json` are unchanged between the bundle's source commit and the PR base | `git diff c6ee644..0a5132e -- docs/architecture/portable-assurance-package-rfc.md pap/fixtures/pap-v0.1/cases.json` is empty; `cases.json` SHA-256 `8ae2693b34a31f1a49fdee0e5e5e235419e8d510d2a9b6f84e809b0c1ef154df` |
| The bundle is a 433-file snapshot | [`snapshot/manifest.json`](https://github.com/agent-federation/contract-builder-independent/blob/c568051f6a4b8feaf8c0b5fabfd5e3e735e2af98/snapshot/manifest.json), `snapshot/SHA256SUMS` (434 lines including the manifest); source commit `c6ee64416c91ab56f9d8270114c8f8a8b9d2f608` |
| `archive.tar` is absent from the bundle but present in the source at the frozen commit | bundle `pap/fixtures/pap-v0.1/` has only `F25-archive/.gitkeep`; source `pap/fixtures/pap-v0.1/archive.tar` is 38 bytes, SHA-256 `81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7` |
| The source `archive.tar` is a sentinel, not a tar | content is `not a tar that a verifier may extract.\n`; the public reference returns exit 64, no stdout, stderr `pap: pap.cli.usage: package path is not a directory: ../archive.tar` |
| Appendix E.3 is a usable checker-identity vector | the RFC's `implementationDigest` `sha256:73f738…` and `checkerIdentity` `sha256:15a0b0…` are reproduced by the standalone framing/JCS check in [`verification.md`](verification.md) |
| The brief does not mention `implementationDigest` or `checkerIdentity` | [`AGENT_BRIEF.md` §4.4](https://github.com/agent-federation/contract-builder-independent/blob/c568051f6a4b8feaf8c0b5fabfd5e3e735e2af98/AGENT_BRIEF.md#L171-L199) lists "extension closure identity" but not checker identity |
| F46/F59 expect a relation-consistency check outcome | `cases.json` lines 1119–1143 and 1458–1482; RFC §12.4 lines 3178 and 3205; the brief's Phase 2b section explicitly forbids implementing that check |

## Documents

| Document | Content |
|---|---|
| [`decisions.md`](decisions.md) | D-P2A-1/2/3: preliminary position, repository evidence, options, consequences, recommendation, exact proposed wording/changes, affected files and the points of disagreement. |
| [`verification.md`](verification.md) | Executable checks for each decision: E.3 vector reproduction, a reproducible closure self-check, the proposed case-set checker, snapshot verification, F25 metadata/provenance/probe, and the scope check that no normative file changes. |
| [`cases-phase2a.proposed.json`](cases-phase2a.proposed.json) | The exact proposed classification (61 cases; default 19/36/6, F58 pending; alternate 20/35/6). Proposal artifact only, not a bundle file. |
| [`verify_cases.py`](verify_cases.py) | Repository-grounded verifier for the proposed classification: ids, counts, F46/F59, F58 pending, applicable codes and packageIdentity expectations. |

## Adversarial findings

1. **D-P2A-2's 22 full cases are not reproducible under the stated rule.** F46
   `inverse-not-reciprocal` and F59 `relation-duplicate` both have an expected verdict of `FAIL/1`
   only because `pap.check.relation-consistency/1` fails. The Phase 2a brief explicitly says "Do
   not implement the three PAP checks" and names that check; RFC §14 puts checks in step 2b.
   Without the check, a Phase 2a verifier reports `UNSUPPORTED`/`4` or `INCOMPLETE`/`2`; if it
   rejects the relation at claim-parse time instead, it changes `integrity.package` to `FAIL`,
   which contradicts the case's expected `integrity.package=PASS`. Either way, the expected
   `(verdict, integrity.package)` pair is not reproducible without the check. They cannot be
   full; re-deriving the set from the public corpus gives 19 full cases (F58 is the separate
   scope question below).

2. **F58 is a second, distinct scope ambiguity.** `pap.package.claim-invalid` is package-integrity
   validation of a claim cross-field invariant, not one of the three checks, but the brief only
   requires "claim-file digests" (`AGENT_BRIEF.md` §4.4 line 184), not claim schema or
   cross-field parsing. A compliant Phase 2a verifier is not required to produce the F58 failure.
   The proposal's default set therefore places F58 in identity-only and records the scope question
   for the maintainer; if claim validation is declared Phase 2a, F58 moves to full (20/35/6).

3. **"`packageIdentity` exact" has no defined oracle.** A bundle case set cannot use the reference
   implementation's report as the expected identity: a blind implementation cannot see it, and RFC
   §13.4 says the reference is not conformance input. The proposal requires pinned literals or
   `cases.json` relations, generated by the standalone JCS/SHA-256 script in
   [`verification.md`](verification.md), and explicitly honours `identityRelations: null` for
   F21/F35/F50/F51/F60.

4. **D-P2A-3's premise is factually wrong for this repository.** The source `archive.tar` is a
   deliberate 38-byte ASCII sentinel ("not a tar that a verifier may extract."), not "a real
   archive". The bundle omitted it; the source at `c6ee644` contains it. Option A restores the
   exact source artifact and preserves F25. Option C, if it changes the F25 command/fixture,
   requires a normative `cases.json`/RFC §12.4 change and is a broader change than the defect
   warrants.

5. **A new bundle file needs provenance, not only a manifest line.** The bundle's manifest records
   `source.commit: c6ee644`. A `cases-phase2a.json` that exists only in the bundle would make that
   provenance claim incomplete. The proposal prefers adding the file to the source repository and
   regenerating the bundle from the new source commit (so the snapshot remains an exact copy), or,
   if the maintainer prefers a bundle-local file, recording it in a separate `bundle_local` section
   with its own origin and updating the snapshot verifier. This is an implementation detail of
   D-P2A-2, not a fourth decision.

6. **D-P2A-1's recipe is under-specified in the preliminary position.** It does not say what
   `id`/`version` values an independent verifier must use, how dependency integrity is represented,
   that closure files are LF-normalized text (RFC §5.2), or that the report's required
   `verifier.implementationDigest` and `verifier.checkerIdentities[]` must carry the same values.
   Appendix E.3 fixes a complete vector and should be named explicitly. Without these, even option
   A can leave two correct implementations with non-comparable identities.

## Open questions and boundaries

- **Open question (D-P2A-2):** is claim-file schema/cross-field validation (F58) Phase 2a? The
  proposal's default excludes it from full, and the proposed artifact marks it **pending**; a
  maintainer decision to include it changes the set to 20/35/6 and adds one sentence to
  `AGENT_BRIEF.md` §4.4. This is the only substantive open question; it does not block the rest of
  the proposal.
- **Boundary (D-P2A-2):** `cases-phase2a.json` is recommended as **experiment-scope** metadata,
  not a normative amendment to RFC §12. If the maintainer intends it to be normative PAP
  conformance material, an RFC amendment is required and the proposal must stop at that point.
- **Boundary (D-P2A-3):** option C, if it changes the F25 fixture id/command/expectation, changes
  the normative corpus and requires a §12.5/RFC §12.4 change. The proposal recommends against it;
  if the maintainer chooses it, it is a separate authorization.
- **No RFC change is required** for D-P2A-1 (the algorithm is in RFC §5.8 and E.3; the brief-level
  declaration convention is experiment scope), D-P2A-2 as experiment metadata, or D-P2A-3 option A.

## What this package does not do

- It does not implement, edit the RFC, `AGENT_BRIEF.md`, `snapshot/`, `pap/fixtures`, `pap/schemas`
  or the reference verifier, regenerate a snapshot, or change the corpus.
- It does not record owner decisions. The maintainer remains the decision owner; this package is
  input to those decisions. The 19/36/6 default is not final while F58 is pending.
- It does not merge anything, enable auto-merge, or claim that any option is already accepted.
- It does not use private implementation source, tests or audit tooling as a recommendation
  premise. The public issue comment is the audit summary; the repository evidence is public.

## Method and limits

- The public repositories were inspected at the exact SHAs above; the bundle was cloned read-only.
- The Appendix E.3 vector and the base package identity were reproduced with standalone Python
  (see [`verification.md`](verification.md)); the closure self-check mutated one included byte and
  left a non-included file unchanged; the proposed case set was verified by `verify_cases.py`.
- The snapshot update for D-P2A-3 was reproduced in a scratch copy and verified as 434 files; the
  F25 metadata/provenance and the probe against the restored scratch bundle returned exit 64, no
  report, `pap.cli.usage`.
- `bun run check`, `bun run typecheck` and `bun test` (308 pass) were run on the code tree; the
  proposal changes only documentation, and CI reruns the suite on the PR head.
- The three independent implementations and the owner-side audit harness were not executed. Their
  results are summarized by the public issue comment; the case-set critique is derived from the
  public RFC, brief and corpus, and does not depend on those runs.
