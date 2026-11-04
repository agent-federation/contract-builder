# PAP v0.1 Phase 2a RFC ambiguity decision proposal — R-PAP-1..4

**Status:** planning-only proposal package for maintainer review. It authorizes no implementation
and changes no RFC, appendix, schema, fixture, corpus, verifier or generated artifact.

**Prepared for:** [Issue #95](https://github.com/agent-federation/contract-builder/issues/95) and
the preliminary architect position in
[issue comment 6623392390](https://github.com/agent-federation/contract-builder/issues/95#issuecomment-6623392390).
**Author:** automated agent (`it-start`).
**Baseline:** `agent-federation/contract-builder` `main` at
`0a5132ec9e36e12a85d66a2231f77f042136e13e` (2026-11-04).
**Evidence basis:** the public repository at that commit, the public reference verifier under
`pap/`, reproducible probes on that verifier, and the probe results quoted in Issue #95 for the
three independent Phase 2a implementations. The independent implementations and the external
conformance contract are not in this repository and were not re-run here; the limitation is
recorded in [`probes.md`](probes.md).

This package answers one question: **which of the four preliminary R-PAP positions are supported
by the repository, where do they disagree with it, and what exact wording would implement the
maintainer's decision?** It re-derives each question from the public RFC, corpus, schemas and
reference implementation, then states where it disagrees with the preliminary position and why. It
does not record owner decisions and does not start implementation.

## Recommendation at a glance

| Decision | Preliminary position | This proposal | Disagreement |
|---|---|---|---|
| R-PAP-1 — symlinked package root | B: permit, resolve, no diagnostic | **B**, with explicit root-resolution wording and exit-code mapping in §4.3.2/§9.2/§9.10/Appendix J, and with the external FS-01 expectation corrected to `PASS/0` | Partial. B is right, but the preliminary position does not state which error is `64` and which is `74`, does not say that all three commands resolve the root, and treats “nobody rejects it” as agreement when three of the four baselines do not return `PASS` either. |
| R-PAP-2 — traversal error during the undeclared-file scan | A: `INCOMPLETE`, `coverage.full:false`, never `FAIL` | **A**, implemented with a new warning code and a `coverage.full` rule; the declared-file rule is restated; the option set is corrected because A and C are not mutually exclusive | Yes. The current reference implementation is **B**, not A: it emits `pap.package.io` as an error, sets `integrity.package: FAIL`, keeps `coverage.full:true` and exits 1. The preliminary recommendation would change reference behaviour and needs exact diagnostic/coverage wording, not only the desired verdict. |
| R-PAP-3 — directory/entry ceiling during the scan | B: non-normative robustness only | **A**: add a normative `scanEntries` limit (default 8 192), with an incomplete scan scope, `coverage.full:false` and `INCOMPLETE`; B is only coherent if the reference's hidden cap is removed/reclassified and the external test stops being a conformance gate | Yes. B is presented as the status quo, but the reference already has an undocumented 8 192-entry cap and reports `pap.package.limit-exceeded`/`INCOMPLETE`, which §4.3.4 does not authorize. B therefore leaves a live non-conformance and lets two conforming verifiers disagree on the same package. |
| R-PAP-4 — cross-class / case-only path collision | A: codify current behaviour | **A**, but with the rule stated as “impossible for a well-formed declaration”, not “allowed”, and with no new diagnostics | Partial. A is right, but “an identical package-relative path across different payload classes is allowed” is not reachable: the class roots are disjoint. The live case is a case-only duplicate **within** a class (F24), which the reference already rejects globally. |

The four recommendations are independent; the maintainer may accept some and reject others. Each
decision document gives the exact proposed wording for the recommended option and the consequences
of the alternatives.

## Documents

| Document | Content |
|---|---|
| [`decisions.md`](decisions.md) | R-PAP-1..4: preliminary position, repository evidence, options, consequences, recommendation, exact proposed RFC/Appendix J/Appendix B wording, affected cases and implementation impact, and the points of disagreement. |
| [`probes.md`](probes.md) | Reproducible probe definitions and observed results on the reference verifier, the evidence that is only quoted from Issue #95, and the limits of what the probes prove. |

## Adversarial findings

1. **R-PAP-1 is right about the threat boundary but incomplete about the contract.** §4.3.2 and
   §10.5 reject symlinks in *declared payload paths*; they say nothing about the operator-supplied
   `PACKAGE` argument. The reference resolves a symlinked root and returns `PASS/0`; a dangling
   link returns `74`; a link to a regular file returns `64`; a payload symlink under the resolved
   root still returns `FAIL/1` with `pap.package.symlink`. Those four outcomes are the exact
   wording B needs, and the external FS-01 expectation (`FAIL/1`) must be corrected rather than
   silently demoted. The claim that “nobody rejects it” is not the same as “everyone agrees”:
   three of the four baselines return `UNSUPPORTED/4` or `INCOMPLETE/2`, so B still obliges those
   implementations to resolve the root if FS-01 is retained as a conformance test.

2. **R-PAP-2 recommends A but the reference currently implements B.** A probe with an unreadable
   undeclared directory makes the reference emit `pap.package.io` as an **error**, set
   `integrity.package: FAIL`, keep `coverage.full: true` and exit `1`. That is option B. It is also
   outside Appendix J's stated effect for `pap.package.io` (“a declared file or the manifest cannot
   be read”). A is a defensible correction, but the proposal must record that it changes the
   reference, add a code that is not `pap.package.io`, and amend the `coverage.full` definition.
   The issue's option taxonomy is also misleading: A (outcome) and C (mechanism) are not
   alternatives; A needs the new-code mechanism.

3. **R-PAP-3's B is not the status quo.** The reference already bounds directory enumeration by
   `max(1024, effective payloadFiles × 2)` entries and reports `pap.package.limit-exceeded` with
   `INCOMPLETE` when the bound is hit. With the default limits that is 8 192 entries. A package with
   8 300 directories produced `INCOMPLETE/2`, `integrity.package: PASS`, `coverage.full:false` and
   two `pap.package.limit-exceeded` diagnostics. No §4.3.4 row authorizes that limit. B, read
   literally, either leaves that behaviour non-conformant or requires removing it; either way it
   does not give two independent verifiers the same answer. A normative `scanEntries` limit is the
   smaller, more deterministic change, and it is still a verifier safety boundary, not a producer
   defect.

4. **R-PAP-4's A is right, but its sentence is wrong.** The rule “the same package-relative path in
   two classes” cannot occur for a well-formed declaration because §4.3.1 fixes a distinct root per
   class and Appendix A enforces the prefix. What can occur is a case-only collision **within** a
   class (`artifacts/A.md` versus `artifacts/a.md`), which F24 already tests, and a malformed
   declaration that reuses another class's path, which already produces both
   `pap.package.path-invalid` and `pap.package.path-duplicate`. The proposal should say the
   cross-class case is impossible, not allowed, and should not add diagnostics for it. A probe with
   `artifacts/acme-policy.md` and `sources/acme-policy.md` returns `PASS/0`; the same *path* in two
   classes is rejected before any new rule is needed.

5. **The Issue #95 evidence list has a naming gap that matters most for R-PAP-2.** The recorded
   “FS-04-adjacent” probe is a declared artifacts directory that cannot be read; it is not the
   external FS-04 scenario (a traversal error during the undeclared-file scan). All four baselines
   agree on the declared-file case (`FAIL/1`), but the scan case was not recorded for the three
   independent implementations. The reference probe in [`probes.md`](probes.md) fills that gap for
   the reference only. R-PAP-2 is the decision most exposed to that missing evidence.

6. **The four questions are asymmetric in size.** R-PAP-1 and R-PAP-4 are clarifications of current
   text; R-PAP-2 is a new diagnostic and a coverage rule; R-PAP-3 is the only one that adds a
   normative numeric limit and optional policy/report-schema entries. The package treats them
   separately so the maintainer can accept the small ones without accepting the larger one. None of
   them reopens D1–D12, the Q-series, or v0.1 scope; R-PAP-3 is a bounded safety limit inside
   §4.3.4, not a new feature.

## What this package does not do

- It does not edit the RFC, appendices, schemas, fixtures, `cases.json`, the reference verifier or
  any generated artifact.
- It does not implement any of the four decisions, add a conformance case, or regenerate a
  snapshot.
- It does not record an owner decision; the maintainer remains the decision owner.
- It does not use private implementation source or private audit tooling as a premise. The
  reference verifier under `pap/` is public repository code; the three independent implementations
  are quoted from Issue #95 and were not inspected.
- It does not claim that the external conformance contract v0.1.0-draft has been changed. Its
  FS-01/FS-04/directory-count expectations are outside this repository; the proposal states the
  changes the external owner would need to make if a recommendation is accepted.

## Related work

Issue #94 and PR #98 prepare a separate Phase 2a handoff-bundle-v2 proposal
(`docs/architecture/proposals/pap-phase2a-bundle-v2/`). This package is disjoint: it covers the four
RFC ambiguities in Issue #95 and changes no bundle file. Neither proposal depends on the other.

## Scope and stop conditions

No question requires a broader RFC amendment or reopens v0.1 scope:

- R-PAP-1 clarifies §9.2/§4.3.2 and one Appendix J row; it adds no diagnostic.
- R-PAP-2 adds one warning code and one `coverage` conjunct; it adds no dimension.
- R-PAP-3 adds one §4.3.4/§10.5 limit and one optional Appendix B `limits` property, plus the
  matching Appendix C `effectiveLimits` enum entry. If the maintainer considers a new policy field
  too broad, the same default can be fixed and non-lowerable in v0.1; that is still option A and
  leaves both schema files unchanged.
- R-PAP-4 adds a clarifying sentence to §4.3.1 and no new normative surface.

Implementation remains separately authorized. Accepted decisions would be recorded in the
canonical decision record by `it-start`, following the established proposal flow (#84), not in this
package.
