# CORE-000 S2.3 execution evidence

**Status:** producer-generated self-build evidence for the S2.3 stage. It is **not** independent
verification, H2 reproducibility evidence, certification or proof of semantic truth. H2 is
`NOT_TESTED`; H3 is `NOT_PERFORMED`. S2 creates zero independent-verification records.

## Snapshot

- **Implementation commit:** `43dadb0e39471e9c85fa75edd3326f0e59d5e59a`.
- **Artifact:** `contracts/core000/output/CORE-000.draft.md`, SHA-256
  `f59a3364911c18e71d520f80c6cc430d7a637ef4cd747dd149a3d86525806812`. S2.3 changes no declared
  input, so the committed draft is byte-identical to the reviewed S2.2 artifact.
- **Positive draft:** exit 0, `blockedBy: null`, `written: false`; **68 findings** — **62**
  `core000.independent-verification.missing` review findings and **6**
  `core000.surface.claim-missing` warnings — **0 errors**; `decision.unresolved = 0`,
  `evidence.orphan = 0`, and `trust.consent-facts = 0`.
- **Same-environment repeat:** S2-POS-02a and S2-POS-02b use separate processes and fresh
  workspaces; the `inputDigest`, artifact SHA-256 and diagnostic order match. This is
  same-environment, fresh-workspace repeatability, **not H2**.
- **Release:** exit 1, `blockedBy: "review"`, no release artifact.
- **Write/check:** S2-POS-04a/04b report no `ERR_OUTPUT_STALE`, the same artifact bytes and
  `workspace.writeCheck: "only_declared_outputs"`; the test owns the workspace and calls its
  `cleanup()`, so the evidence field records `cleanup: "not_applicable"`.
- **Claim mutation:** S2-POS-05 changes `inputDigest` and the artifact SHA-256 versus its baseline;
  its evidence records `workspace.writeCheck: "only_declared_outputs"` and
  `workspace.cleanup: "completed"`.

## Focused check coverage

The 11 S2.1 policy checks are covered with the methods accepted for S2.3. Synthetic models and
temporary fixtures are test inputs only; no project-register data, independent-verification record
or `verification/core000/` entry was created.

| Check | Severity | Method | Focused result |
|---|---|---|---|
| `core000.claim.invalid-status` | error | unit-level synthetic (Q6 A′) | one finding for `C000-CT-001`, `claims.yml` |
| `core000.claim.unsupported-guarantee` | error | harness mutation | one finding for `C000-CT-011`, `claims.yml`; exit 1, blocked by errors |
| `core000.claim.status-class-conflict` | error | harness mutation (one-field `class`) | one finding for `C000-CT-001`, `claims.yml`; exit 1, blocked by errors |
| `core000.independent-verification.incomplete` | error | synthetic verification record | one finding for `VF-S2-SYNTHETIC`, `claims.yml` |
| `core000.independent-verification.self` | error | synthetic verification record | one finding for `VF-S2-SYNTHETIC`, `claims.yml` |
| `core000.independent-verification.record-missing` | error | synthetic verification record | one finding for `VF-S2-SYNTHETIC`, `claims.yml` |
| `core000.model.interface-owner-mismatch` | error | harness mutation | one finding for `IF-ADAPTER`, `structure.yml`; exit 1, blocked by errors |
| `core000.evidence.locator` | error | harness mutation (whitespace locator) | one finding for `EV-CODE-SPEC-LIB-SCHEMA-TS`, `claims.yml`; exit 1, blocked by errors |
| `core000.evidence.orphan` | warning | harness mutation | one finding for `EV-CODE-SPEC-LIB-ADAPTERS-MARKDOWN-TS`, `claims.yml`; exit 0, warning |
| `core000.surface.claim-missing` | warning | harness mutation | one finding for `IF-ADAPTER`, `structure.yml`; exit 0, warning |
| `core000.conformance.case-uncovered` | warning | synthetic fixture (S2-D3 A) | one finding for `CC-S2-SYNTHETIC`, `claims.yml`; warning on empty project data |
| `core000.decision.unresolved` | review | synthetic (S2.2-U) | one finding for `C000-SC-003`, `claims.yml`; review, no project-register link |

The harness cases assert code, severity, entity/location, exit/blocking behavior and the exact
baseline+delta multiset; warning-only cases assert exit 0, `blockedBy: null` and no artifact. The
synthetic unit cases assert code, severity, `entityId`, `location.file` and finding count, without a
`runBuild` exit assertion. All 43 `tests/core000.test.ts` cases pass, including the S1 regression
cases.

## Durable run records

Each record below is producer evidence, not independent evidence. Records include the expected and
observed diagnostics, exit/blocking outcome, environment, command, identity, artifact digest,
source-checkout cleanliness and workspace checks; they carry no absolute paths, secrets or private
material. Mutation records carry the mutation name and base commit (P-1).

| Run | Result | Record |
|---|---|---|
| S2-POS-01 | draft, exit 0, 68 findings | [result.json](../../evidence/core000/S2-POS-01/result.json) |
| S2-POS-02a | draft, exit 0, 68 findings | [result.json](../../evidence/core000/S2-POS-02a/result.json) |
| S2-POS-02b | draft, exit 0, 68 findings | [result.json](../../evidence/core000/S2-POS-02b/result.json) |
| S2-POS-03 | release, exit 1, `blockedBy: "review"` | [result.json](../../evidence/core000/S2-POS-03/result.json) |
| S2-POS-04a | write, exit 0, `only_declared_outputs` | [result.json](../../evidence/core000/S2-POS-04a/result.json) |
| S2-POS-04b | check, exit 0, no stale output | [result.json](../../evidence/core000/S2-POS-04b/result.json) |
| S2-POS-05-baseline | draft, exit 0, artifact `f59a…` | [result.json](../../evidence/core000/S2-POS-05-baseline/result.json) |
| S2-POS-05 | claim mutation, exit 0, artifact `a8c8…` | [result.json](../../evidence/core000/S2-POS-05/result.json) |
| S2-FOCUS-unsupported-guarantee | error, exit 1 | [result.json](../../evidence/core000/S2-FOCUS-unsupported-guarantee/result.json) |
| S2-FOCUS-status-class-conflict | error, exit 1 | [result.json](../../evidence/core000/S2-FOCUS-status-class-conflict/result.json) |
| S2-FOCUS-interface-owner-mismatch | error, exit 1 | [result.json](../../evidence/core000/S2-FOCUS-interface-owner-mismatch/result.json) |
| S2-FOCUS-evidence-locator | error, exit 1 | [result.json](../../evidence/core000/S2-FOCUS-evidence-locator/result.json) |
| S2-FOCUS-evidence-orphan | warning, exit 0 | [result.json](../../evidence/core000/S2-FOCUS-evidence-orphan/result.json) |
| S2-FOCUS-surface-claim-missing | warning, exit 0 | [result.json](../../evidence/core000/S2-FOCUS-surface-claim-missing/result.json) |

## Q9 and artifact verification

The Q9 copy-from-temporary-workspace procedure and the CORE-000 machine check are recorded in
`AGENTS.md` and the `S2.2 artifact verification` test. `bun run check:all` passed at the implementation
commit: the committed draft rebuilds byte-identically from the full register, and the artifact
SHA-256 remains `f59a3364911c18e71d520f80c6cc430d7a637ef4cd747dd149a3d86525806812`. The harness
refuses repository writes, so the run records were produced at temporary paths from a clean
checkout and copied into this directory afterwards. `bun run check` is not a CORE-000 artifact
check.

## Evidence semantics, H2 and H3

- **Zero independent-verification records.** No `independent_verification` entity was added to
  `claims.yml`; `verification/core000/` is not populated; synthetic fixtures and producer records
  are not independent evidence.
- **H2:** `NOT_TESTED`. The repeat is same-environment and fresh-workspace only.
- **H3:** `NOT_PERFORMED`.
- The temporary workspace is not a security sandbox. The evidence records are producer evidence
  and do not establish semantic truth, certification or external assurance.

## Reproduction

The positive, release and mutation records can be reproduced with the harness commands, for
example `bun contracts/core000/run.ts --mode draft --write false --run S2-POS-01` and
`bun contracts/core000/run.ts --mode draft --write false --mutation claim --run S2-POS-05`. The
write/check record uses `prepareWorkspace()` with `specDir` and `workspaceRoot`, then `runHarness`
with `write: true` followed by `check: true`; the test calls `ws.cleanup()`. The focused tests run
with `bun test tests/core000.test.ts`. Full gates: `bun run typecheck`, `bun test`,
`bun run lint`, `bun run format:check`, `bun run docs:links`, `bun run coverage`,
`bun run coverage:check` and `bun run check:all`.
