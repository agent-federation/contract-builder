# ODR-PAP-007 — Owner Decision Record: PAP verifier packaging deferral

**Status:** APPROVED — the maintainer's D8 directive in issue [#270](https://github.com/agent-federation/contract-builder/issues/270) (2026-11-09) records the decision to defer the physical split and the trigger conditions; this record publishes the durable decision and its evidence. It authorizes documentation updates only.
**Date:** 2026-11-09 (UTC)
**Decision scope:** PAP v0.1 verifier packaging boundary — the RFC §9.1 conformance status, the trigger conditions for a physical split and release, the boundary guarantees the deferral relies on today, residual risks and limitations, and the migration outline. No `pap/src`, schema, fixture, test, spec, profile, contract or generated-artifact change.
**Baseline:** `contract-builder` main `39e8d74` (D7d verify split, 2026-11-08).
**Related:** [#270](https://github.com/agent-federation/contract-builder/issues/270) (this slice), [#170](https://github.com/agent-federation/contract-builder/issues/170) (stream D), [#43](https://github.com/agent-federation/contract-builder/issues/43) (PAP roadmap, Gate 2), [#137](https://github.com/agent-federation/contract-builder/issues/137) (audit umbrella); [ODR-PAP-005](ODR-PAP-005-gate-3-closure-phase-2a.md) (Gate 3 Phase 2a closure), [ODR-PROC-002](ODR-PROC-002-independent-family-pre-review.md) (independent pre-review), [`delivery-governance.md`](../architecture/delivery-governance.md) D8 (design rationale), [`pipeline-evidence.md`](../architecture/pipeline-evidence.md) (C6 evidence), and [RFC §9.1](../architecture/portable-assurance-package-rfc.md#91-position-distribution-and-packaging).

## 1. Context

RFC §9.1 requires the PAP verifier to be a **separate open-source project**: its own repository, maintainers, release cadence and licence, versioned independently of the package format. Each platform release must publish a pinned artifact and a published SHA-256 checksum with verification instructions, the artifact must not depend on Contract Builder, installation and verification must work offline, and the installed binary must be invocable as `pap` on `PATH`.

The current implementation does not meet that packaging boundary and does not claim to. `pap/` is an in-repo product boundary; the root `package.json` exposes `pap` as a development script/bin only; there is no per-platform artifact, published checksum, separate release channel or independent verifier version. The verifier itself is implemented and tested for PAP v0.1 Tier B, and Gate 3 is PASSED for the Phase 2a case set ([ODR-PAP-005](ODR-PAP-005-gate-3-closure-phase-2a.md)); Gate 2, the separately distributed verifier release required by RFC §9.1, remains open.

The open question recorded here is therefore not whether §9.1 is satisfied — it is not — but **when the physical split and release are worth doing**. RFC §9.1 remains normative and unchanged; this record does not amend it or convert the in-repo arrangement into a conforming distribution.

## 2. Decision

**Defer the physical split.** Keep `pap/` as an enforced in-repo product boundary and keep `bun run pap` / `pap/bin/pap` as development entry points for the current phase. Do not publish a standalone verifier release, do not create a separate repository or package now, and do not claim RFC §9.1 conformance or Gate 2 closure.

The deferral is a scoped, recorded non-conformance, not a waiver: the §9.1 requirements stay normative, the in-repo boundary stays subject to the repository's tests, CI and independent-family pre-review, and the decision is revisited when all three trigger conditions in §3 hold.

## 3. Trigger conditions to revisit (all must hold)

The physical split and first release start only when **all three** conditions hold. A subset is not sufficient, and none is satisfied at this record's baseline.

| ID | Trigger | Evidence required | State at 2026-11-09 |
|---|---|---|---|
| T1 | **Phase 2b/2c stability, independently demonstrated.** The Gate-3 independent set evaluates the three required checks (not only the Phase 2a package/integrity surface) against the same package shape, with a stable caseload and no open P0/P1 check-semantics problem; the C6 evidence record is refreshed to that scope. | The independent implementations report evaluated check outcomes for `pap.check.digest-integrity/1`, `pap.check.source-quote/1` and `pap.check.relation-consistency/1`; the refreshed [`pipeline-evidence.md`](../architecture/pipeline-evidence.md) records the comparison and any remaining `UNSUPPORTED`/`NOT_EVALUATED` dimensions explicitly. | **Not met.** C6 exists, but it is Phase 2a only: the reference verifier evaluates the three checks while the three independent implementations report `UNSUPPORTED` (exit 4) because check implementations are Phase 2b scope ([`pipeline-evidence.md`](../architecture/pipeline-evidence.md) §4–§5). |
| T2 | **A publishable release model.** The D1 release policy is exercised for the verifier: a versioned artifact can be built and published with a published SHA-256 checksum, offline install/verification instructions and reproducible-build evidence, so a release can be checked against its checksum and rebuilt. | A release channel and version/tag (`pap-…`), per-platform artifact(s), published checksums, an offline install/verify procedure, and reproducible-build evidence (H2 or equivalent) recorded for the released bytes. | **Not met.** D1 records "MVP without public releases"; there are no release tags or releases, no checksums and no per-platform artifact. `implementationDigest` is a hand-maintained constant (`pap/src/version.ts`), not a build output, and H2 cross-environment reproducibility remains `NOT_TESTED`. |
| T3 | **Maintainer authorization for the split and release.** A dated maintainer decision authorizes the repository split, the release channel and the ownership/maintainer arrangement for the new project. | A new ODR or an explicit maintainer directive naming the split and first release, including the new project's maintainer/team and licence. | **Not met.** This record authorizes the deferral and documentation only; it does not authorize a split or a release. |

The decision stays in force until all three hold. If any one changes, or a maintainer wants to revisit the deferral earlier, the change is recorded as a new dated decision; it is not inferred from a code or CI change.

**Reading T1.** #270's parenthetical names the Gate-3 set and the C6 record as the evidence for Phase 2b/2c stability. Both exist, but the C6 record is Phase 2a only and the independent implementations report the three required checks `UNSUPPORTED`; this record therefore treats T1 as not met until the evidence covers those check outcomes. A maintainer who intends the existing Phase 2a evidence to satisfy T1 can record that as a new dated decision.

## 4. What the deferral relies on today

The in-repo arrangement is acceptable only because these boundary guarantees are enforced or evidenced now:

- **Verifier independence and the import boundary.** The verifier imports only `node:` built-ins and its own modules under `pap/src/`; it never imports `spec/`, `profiles/`, a renderer or a producer runtime, and it does not execute package-supplied code or use the network. This is stated in [`pap/README.md`](../../pap/README.md) and exercised by the producer-free environment and sentinel-shim case F40 in [`pap/tests/conformance.test.ts`](../../pap/tests/conformance.test.ts) and [`pap/tests/support.ts`](../../pap/tests/support.ts).
- **Pinned runtime and dependencies.** The verifier has no third-party runtime dependency; its only required runtime is Bun, pinned by `packageManager` and CI (`bun@1.4.2`), and the repository lockfile pins the dependencies the engine and tests install. The verifier is a single TypeScript tree under `pap/src/`.
- **Deterministic report and exit codes.** The CLI contract is RFC §9: one JCS JSON document plus one LF for `--format json`, a fixed exit-code mapping (`0/1/2/3/4` for verdicts, `64/70/74` for usage/internal/I/O) with the required text lines, and a repeatable report with a pinned `--now`. The conformance corpus asserts the report shape, exact diagnostic sets, JCS-canonical stdout, repeated output and the required text lines.
- **Hostile-input handling.** Package content is treated as hostile data: paths are validated before filesystem calls, symlinks and non-regular files are rejected, and byte/count/JSON limits are enforced. A limit hit is `NOT_EVALUATED` with `pap.package.limit-exceeded`, never `PASS`; the rejection and conformance suites exercise these paths.
- **Repository gates and independent pre-review.** The verifier is covered by `bun test`, `bun run pap:test`, typecheck, Biome, docs links, coverage floors and `check:all`; changes under `pap/` also need the independent-family pre-review in [ODR-PROC-002](ODR-PROC-002-independent-family-pre-review.md) before a human merge. The agent does not merge.
- **C6 evidence, within its scope.** The reference verifier and the three independent Phase 2a implementations executed against the same CORE-000 package; all four agree on `packageIdentity` and on package/artifact/source integrity and availability ([`pipeline-evidence.md`](../architecture/pipeline-evidence.md)). This is why the in-repo boundary is credible for the current phase, but its Phase 2a scope is also why it does not satisfy T1.

These are code, test and review guarantees, not an operating-system sandbox or a separately distributed artifact.

## 5. Residual risks and limitations

1. **Explicit RFC §9.1 non-conformance.** There is no separate project, repository, maintainer/team, release cadence or independent licence; there is no per-platform artifact, published checksum or offline installable `pap` binary. Gate 2 remains open. Anyone consuming `pap/` from this repository is using a development boundary, not a conforming distribution.
2. **In-repo release cadence and version coupling.** The verifier moves with engine commits and has no independent release identifier or tag. `pap --version` reports the verifier version (`0.1.0`), not a released artifact; a consumer cannot pin a checksummed verifier artifact, and a later engine change can move the verifier without a verifier release.
3. **`implementationDigest` is hand-maintained.** The checker digest is a published constant in `pap/src/version.ts`, not recomputed from built bytes, and no test binds it to the source tree. A change to checker code must update it manually. It is excluded from cross-implementation comparison (RFC §13.6), so C6 does not validate it; a real release needs a mechanically reproducible digest.
4. **C6 evidence is narrower than the trigger.** The independent implementations are Phase 2a only, report `UNSUPPORTED` for the three required checks, and share one owner/harness; report hashes depend on the run paths. H2 cross-environment reproducibility remains `NOT_TESTED`. C6 therefore supports the package/integrity claims it records, not the Phase 2b/2c stability T1 requires.
5. **The boundary is review- and test-enforced, not isolated.** The no-producer-import rule is a reviewed invariant, and F40 proves no producer or runtime sentinel executed in the tested runs; neither is a static import gate or a sandbox for every future change. The in-repo location makes accidental coupling easier than a separate repository would.
6. **No standalone distribution path.** Running the verifier requires a repository checkout and Bun; schemas, fixtures and conformance evidence are not published as a versioned, checksummed package. There is no released binary to verify offline against a published checksum.
7. **Deferral drift.** An in-repo boundary can accumulate engine or producer assumptions over time. The pre-review, the import discipline and the trigger review must stay in force; if they erode, the deferral should be revisited before the formal triggers.

## 6. Migration outline when the triggers hold

1. **Freeze and record the starting point.** Tag or record the verifier head and version, the conformance result and the current C6 evidence before moving anything.
2. **Extract the product.** Move `pap/` (or an equivalent implementation) into its own repository/package, preserving history where practical and carrying `src/`, `bin/`, `schemas/`, `fixtures/` and `tests/`. Keep the CLI surface, report schema and exit-code contract unchanged; the producer must remain a non-dependency.
3. **Define the release channel.** Publish semver-tagged releases (for example `pap-vX.Y.Z`), per-platform artifacts, SHA-256 checksums and offline install/verify instructions; make the build reproducible and derive or verify `implementationDigest` from the released closure rather than a hand-edited constant.
4. **Publish the conformance inputs.** Version and checksum the schemas, fixtures, vectors and case corpus with the release so an independent implementer can work from the published artifacts.
5. **Re-run the evidence against the released artifact.** Point C6 and the Gate-3 comparison at the released artifact (its checksum and `implementationDigest`) rather than a repository checkout, and record the refreshed result; keep the independent verifier set runnable.
6. **Update the canonical text and status.** Update RFC §9.1 packaging/distribution text and the §13.7 publication rules, close Gate 2 in #43, update this ODR and the PAP README/status records, and retire or keep a documented compatibility wrapper for `bun run pap` / the root bin after a stated transition.
7. **Authorization checkpoint.** The first public release still requires the maintainer authorization in T3; the split does not complete the stream-D or Gate 2 work by itself.

## 7. Consequences and non-goals

- This record is documentation only: it changes no verifier behavior, schema, fixture, test, case set, spec, profile, contract or generated artifact.
- It does not close Gate 2, does not satisfy RFC §9.1, and does not make the in-repo verifier a released product.
- It does not change C6, H2 or H3: the independent Phase 2a result remains `EXECUTED / UNSUPPORTED`, cross-environment reproducibility remains `NOT_TESTED`, and no claim is promoted to `independently_verified`.
- Until the three triggers hold, the enforced in-repo boundary and the independent pre-review stay in force. A future decision that changes the packaging boundary must be recorded as a new dated decision, not inferred from an implementation or CI change.

## 8. Authorized documentation changes

This record authorizes exactly these documentation updates; it authorizes no other file change:

| ID | File | Change |
|---|---|---|
| A1 | this record | Publish the deferral decision, trigger conditions, current guarantees, residual risks and migration outline. |
| A2 | [`pap/README.md`](../../pap/README.md) | Replace the temporary-packaging paragraph with the recorded deferral, the three trigger conditions and the explicit §9.1 non-conformance. |
| A3 | [`docs/architecture/implementation-status.md`](../architecture/implementation-status.md) | Add the D8 snapshot update and the X6 deferred row linking this record. |
| A4 | [`docs/architecture/delivery-governance.md`](../architecture/delivery-governance.md) D8 | Point the design rationale at this durable decision record. |
| A5 | [`docs/architecture/portable-assurance-package-rfc.md`](../architecture/portable-assurance-package-rfc.md) §9.1 | Add a dated implementation-status note linking this record; the normative requirements remain unchanged. |

## 9. Owner approval

**Owner directive:** issue [#270](https://github.com/agent-federation/contract-builder/issues/270) (2026-11-09) directs the implementer to record the ODR with the decision to defer the physical split, the trigger conditions, the current boundary guarantees, residual risks including the explicit RFC §9.1 non-conformance, and the migration outline, and to update the PAP README and implementation-status links. This record implements that directive.

**Decision:** APPROVED on 2026-11-09 in issue [#270](https://github.com/agent-federation/contract-builder/issues/270). The record is published by the pull request that carries it; the physical split remains unauthorized until T1–T3 all hold.
