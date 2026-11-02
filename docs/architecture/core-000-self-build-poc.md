# CORE-000 ephemeral self-build PoC — proposed plan and bounded first slice

**Status:** proposed for maintainer review. Planning only. This document does not create the
CORE-000 project or profile, does not change code, tests, schemas, fixtures, evidence or generated
artifacts, does not execute the experiment, and does not accept any open decision.
**Issue:** [#72](https://github.com/agent-federation/contract-builder/issues/72).
**Parent design:** [`core-000-self-contract.md`](core-000-self-contract.md) (PR #51).
**Accepted execution plan:** [`core-000-execution-plan.md`](core-000-execution-plan.md) (PR #59),
refreshed by [`core-000-baseline-refresh.md`](core-000-baseline-refresh.md).
**Open decisions:** [`core-000-decision-record.md`](core-000-decision-record.md).
**Refreshed baseline:** `c6ee64416c91ab56f9d8270114c8f8a8b9d2f608`; the original plan baseline is
`cc645357646fe57e2bdedb1d215ae87b79e16501`.

> This is a companion to the accepted execution plan, not a replacement. It adds the ephemeral
> PoC mode and a bounded first-slice proposal requested by Issue #72. Every addition is marked
> **proposed**; none of it is accepted, implemented or verified.

---

## 0. Maintainer summary

| Part | Content |
|---|---|
| **Facts** | Current `main` is `c6ee644` (PR #73). The repository is green under the accepted baseline commands; `spec/` and `profiles/` are unchanged since the plan baseline; `bun.lock` is unchanged; the CORE-001 artifact hash and 327-line count are unchanged. The only post-baseline code addition is the independent PAP v0.1 verifier under `pap/` (PR #64); #73 is a docs-only PAP status update. Neither has a demonstrated CORE-000 impact. No CORE-000 project, profile, artifact or evidence exists. No decision has been accepted. |
| **Recommendations** | Resolve the S1-blocking decisions **D1 A, D13 A, D15 A, P-1 B, P-4 A, P-5 A** (or record alternatives). **D14, P-2, P-3 and P-6 may be explicitly deferred for S1**, but the full decision record remains open until all ten are resolved; a `defer` leaves that item open. Approve the bounded first slice **S1** in §10 as the next implementation step. Confirm separately that a consumer harness may be used while G4 remains open. Treat a fresh temporary directory as a workspace, not a security sandbox. |
| **Unresolved decisions** | D1, D13, D14, D15 and P-1–P-6 all remain open until the maintainer answers them; deferral is not resolution. S1 depends on D1, D13, D15, P-1, P-4, P-5 and the separate G4/consumer-harness confirmation; D14, P-2, P-3 and P-6 may be deferred for S1. P-2's deferral covers only durable publication/location and the summary format; S1 still writes and asserts the transient evidence record. S1 is shaped for the recommended defaults and is re-scoped if they change. |
| **Requested approvals** | (1) Answer the six S1-blocking decisions D1, D13, D15, P-1, P-4, P-5. (2) Explicitly defer or answer D14, P-2, P-3, P-6; the full record stays open until all ten are resolved. (3) Confirm the separate consumer-harness/G4 boundary. (4) Authorize S1 after (1) and (3). (5) Confirm that no CORE-000 implementation starts before this plan and S1 are approved. |

No row above is an acceptance. The maintainer remains the only authority for the decisions and
for authorizing implementation.

---

## 1. Hypotheses and result labels

The PoC keeps three questions separate. A result for one question never becomes a result for
another.

| ID | Hypothesis | Method | Result labels | What it cannot show |
|---|---|---|---|---|
| **H1** | The engine can describe and build a bounded self-contract through its existing generic pipeline, with CORE-000 policy in the profile and no `spec/lib/` change. | Load, validate, relate, provenance-check, render and identify a CORE-000 project through `runBuild`; capture the draft, diagnostics and identity. | `SELF_BUILD_COMPLETED` (the declared build ran and produced the expected output), `SELF_BUILD_BLOCKED` (the build stopped at an expected gate, e.g. release review), `SELF_BUILD_FAILED` (unexpected diagnostic, crash or missing output), `SELF_BUILD_NOT_RUN`. | Claim truth, semantic completeness, correctness, security, conformance or independence. |
| **H2** | A second fresh environment repeats the declared build and produces equivalent outputs under the controlled inputs and comparison policy in §5. | Run the same pinned build in a second fresh temporary environment; compare identity, artifact bytes and diagnostics. | `REPRODUCIBLE_BYTE_IDENTICAL`, `REPRODUCIBLE_NORMALIZED`, `NOT_REPRODUCIBLE`, `NOT_TESTED`, `INCONCLUSIVE`. | Cross-platform or cross-version determinism, hermeticity, or correctness of the bytes. |
| **H3** | A verifier distinct from the author checks selected claims against evidence without relying only on the engine's verdict. | Independent reviewer or external harness follows the design's §8.2 protocol; records per-claim results. | `INDEPENDENT_CHECK_CONFIRMED`, `INDEPENDENT_CHECK_REFUTED`, `INCONCLUSIVE`, `NOT_PERFORMED`. | Certification, truth beyond the checked scope, legal effect, or that the whole register is true. |

**Separation rule.** H1 establishes structural and profile-policy consistency of the
self-description. H2 establishes same-environment reproducibility under the declared comparison
policy. H3 is the only path to `independently_verified`, and the engine never sets it. A
`SELF_BUILD_COMPLETED` result does not imply `REPRODUCIBLE_*`; a `REPRODUCIBLE_*` result does not
imply any H3 label; an H3 `NOT_PERFORMED` leaves the independent-verification dimension at `—`.

**No single PASS label.** This plan avoids a single `PASS`/`FAIL` verdict because the three
questions have different authorities. Each evidence record names the hypothesis and the exact
label. An incomplete or resource-limited run is `INCONCLUSIVE` or `NOT_TESTED`, never
`SELF_BUILD_COMPLETED`.

---

## 2. Inputs, pinned baseline and environment

### 2.1 Pinned inputs

Every run pins the following. A run that cannot pin one of them is `INCONCLUSIVE`, not a result.

| Input | Pin | Notes |
|---|---|---|
| Source revision | Full 40-hex repository commit; the run's `commit` field | `c6ee644` is the planning baseline; the implementation PR pins the merge commit it actually runs. |
| CORE-000 inputs | `contracts/core000/contract-builder.json`, `structure.yml`, `claims.yml` at the pinned commit | Subject to D1. S1 uses a subset of the accepted design's data; it must not invent claims or entities. |
| Source document | `docs/architecture/engine-public-contract.md` at the pinned commit | Declared as `SRC-ENGINE-CONTRACT`, `external: true`. |
| Profile closure | `profiles/core000/` at the pinned commit, including every file in `profile.files` | The closure digest is part of `inputDigest`; an undeclared file fails the build. |
| Dependency lock | `bun.lock` SHA-256 `9ab1d388e29a91fe9d5ba3372270b72ae59f92122ddd70c45fce84733522e015` | `bun install --frozen-lockfile` is the only install command. |
| Runtime | Bun `1.4.2` (`packageManager` and CI version) | A local run on another Bun version is a deviation that must be recorded; it cannot support a cross-version claim. |
| OS / architecture | The recorded OS and architecture (planning baseline: Linux x86_64) | A different OS/arch is a different environment, not a repeat. |
| Environment controls | `TZ=UTC`, `LC_ALL=C.UTF-8`, isolated `HOME`, no secrets in the environment | The engine claims these are not build inputs; controlling them prevents accidental differences from being attributed to the inputs. |

The exact CORE-000 data is the accepted design's data, not new normative content. S1 deliberately
encodes a small subset (§10). The full 78-claim / 14-kind / 28-relation / 23-check register is a
later slice.

### 2.2 Dependencies

No new dependency is proposed. The CORE-000 profile uses `nunjucks` 3.2.4, already in
`package.json` and `bun.lock`, matching the `profiles/core001` renderer pattern. `yaml` and `ajv`
are already core dependencies. S1 must declare the exact `nunjucks` version in
`profile.dependencies`; an undeclared or unpinned import fails with
`core.extension.unpinned-dependency`.

The PAP verifier is not a dependency: it is a separate product boundary under `pap/` with its own
tests. CORE-000 does not import it and does not produce a PAP package.

### 2.3 Environment assumptions

The following are assumptions for H1 and H2, not claims:

- The same source commit, lockfile, Bun version, OS and architecture.
- Dependency installation from the pinned lockfile completed before the run; a registry or cache
  source is recorded. A run that installs different bytes is not a repeat.
- The repository working tree is clean before the run; the run writes only inside its temporary
  workspace.
- The build does not need network access after dependencies are present. The full ephemeral run
  proposes to disable network; S1 does not enforce that and records the network state as not
  restricted.
- The build does not read secrets, host identity, clock or locale as inputs. The engine cannot
  enforce this; the evidence records the actual environment and the profile closure.

---

## 3. Execution boundary and isolation

### 3.1 Fresh workspace is not a security sandbox

A fresh temporary directory isolates accidental repository writes and gives the run a clean
starting state. It does **not** isolate the process. The current executable-profile mechanism
loads `view`, `validator` and consumer-supplied renderers in-process with the builder's
privileges; the engine does not sandbox, drop privileges, restrict capabilities, disable network
or enforce resource limits. `external: true` is a path trust declaration, not isolation. Consent
is permission to run trusted code, not a security boundary.

**Therefore:** a CORE-000 run in a temporary directory may be described as an *ephemeral
workspace* and as *same-environment repeatability evidence* only. It must not be described as
sandboxed, hermetic, secure or safe for untrusted profiles.

### 3.2 Controls: implemented versus proposed

| Control | Status at the refreshed baseline | Where |
|---|---|---|
| Explicit caller consent before import | **Implemented** | `BuildOptions.allowExecutableProfile` default false; CLI `--allow-executable-profile`; `core.profile.consent-required` |
| Fail-closed when consent is absent | **Implemented** | Consent checked before closure scan and `import()`; no profile module evaluated |
| Path containment for project/profile/output | **Implemented** | `resolveContained`, `core.path.outside-root` |
| Profile closure declaration and digest | **Implemented** | `profile.files` / `profile.dependencies`, lockfile authority, `core.extension.unpinned-dependency` |
| Single render declaration and one artifact | **Implemented** | Manifest validation; one-artifact guard |
| Artifact normalization | **Implemented** | UTF-8, LF, one trailing newline |
| Unprivileged process or container | **Proposed, not implemented** | Would require a separate security/architecture proposal |
| Read-only source checkout | **Proposed, not implemented** | Mount-level control, not an engine feature |
| Isolated writable output directory | **Proposed, not implemented** | Workspace layout can isolate output, but the process is not confined |
| Network disabled by default | **Proposed, not implemented** | Requires a network namespace/firewall or sandbox |
| CPU, memory and wall-clock limits | **Proposed, not implemented** | External timeout/kill is the only current mitigation; it is not a resource budget |
| No secrets in the environment | **Proposed, operator control** | Not enforced by the engine |
| Per-module consent | **Proposed, not implemented** | Consent applies to the declared executable profile modules as a set |
| Consumer-supplied renderer/adapters | **Consumer-owned trust decision** | The caller imports and supplies them; `runBuild` uses the supplied registry. `allowExecutableProfile` does not gate consumer imports. |

This table is the distinction the issue requires: the existing controls are integrity and consent
controls, not isolation controls. No sandbox capability is assumed.

**Separate renderer trust boundary.** `allowExecutableProfile` gates the profile's `view` and
`validator` modules, which the engine imports. A consumer-supplied renderer is imported by the
caller and passed to `runBuild` in the `renderers` registry; the engine never imports it, and the
consent gate does not apply to it. The CLI's only renderer import is the conditional CORE-001
renderer, so a CORE-000 project gets an empty CLI registry. A CORE-000 renderer load is therefore
the consumer's own trust decision, not evidence for or against the profile consent gate.

### 3.3 First-slice trust decision

S1 executes only repository-owned, reviewed CORE-000 profile code. It does not execute an
untrusted or third-party profile. Its trust decision is therefore the normal code-review decision
for repository code, not a new sandbox guarantee. S1 must still state in its evidence:

- the profile was repository-owned at the pinned commit;
- no untrusted profile, adapter or renderer was loaded;
- the run was in-process with builder privileges;
- no isolation was applied.

If a later experiment executes a profile that is not repository-owned, or if the maintainer
requires enforced isolation, that is a separate security proposal referencing
[#35](https://github.com/agent-federation/contract-builder/issues/35). This plan does not
implement or claim that work.

**Alternative considered — a non-executing/static first slice.** A static-only slice could
validate the manifest, profile declaration, schemas and file layout without calling `runBuild`,
but it would not exercise provenance verification, the profile hook, the renderer or build
identity, so it would not test H1. If the maintainer considers in-process execution of the
repository-owned profile unacceptable before a security proposal exists, S1 is replaced by that
non-executing slice, and the executing self-build waits for the separate #35 work. The
recommendation is the repository-owned execution in S1 because the code is reviewed repository
code, not an untrusted profile.

### 3.4 Proposed isolation profile for a future full run

If a future run requires process isolation, the minimum proposed profile is: a separate
unprivileged process or container; the source checkout mounted read-only; a single writable output
directory; network disabled by default; no secrets, SSH agent or host credentials; explicit CPU,
memory and wall-clock limits; a recorded exit status and captured stderr/stdout; and no host
paths beyond the workspace. **None of these controls is implemented by the current engine.** The
proposal is listed so a future review can compare it, not so this plan can rely on it.

---

## 4. Build outputs and evidence record

### 4.1 Outputs of a run

A run produces, inside its ephemeral workspace:

| Output | Content | Retained? |
|---|---|---|
| Draft artifact | `output/CORE-000.draft.md` in the workspace (or in memory with `write: false`) | Hash retained; bytes only if evidence policy allows |
| Diagnostics | The deterministic `BuildResult.diagnostics` array | Retained in evidence |
| Build identity | `inputDigest`, extension list, engine/manifest versions | Retained in evidence |
| Artifact hash | SHA-256 of the exact normalized artifact bytes | Retained in evidence |
| Run log | Command, exit code, `blockedBy`, `written`, `markdown !== null`, timings | Retained in evidence; no absolute host paths |
| Source repository check | `git status --porcelain` before and after | Retained in evidence as `sourceRepositoryClean: true` |
| Workspace write/cleanup check | Declared outputs only; cleanup completed | Retained separately as `workspace.writeCheck` / `workspace.cleanup` |
| Comparison report | Per-field equality between E1 and E2 | Retained in the evidence summary |
| Environment manifest | Bun version, OS/arch, lockfile hash, controlled env vars, install source | Retained in evidence |

Negative and blocked runs write **no artifact**. A release run writes no release artifact. A check
run compares against the workspace artifact and reports `ERR_OUTPUT_STALE` if it differs.

### 4.2 Proposed evidence record

One JSON record per run. The required base is the transient record already defined by the
accepted execution plan §6.2 (`run`, `commit`, `project`, `mode`, consent, command, exit/`blockedBy`,
`written`, `output`, `identity`, `artifactSha256`, `diagnostics`, `expected`, `classification`,
`limitations`). S1 adds the hypothesis result labels, environment pins, `sourceRepositoryClean` and
the separate workspace assertions; those are S1 evidence fields, not P-2 decisions. S1 must use and
test this record; P-2 decides only durable publication/location and the human-readable summary
format, not whether S1 captures or asserts the record. This is a documentation schema for review;
it is not created or committed under this issue.

```jsonc
{
  "schema": "core000-run-evidence/0.1",
  "run": "E1-S1-POS-01",
  "hypothesis": "H1",
  "commit": "<40-hex>",
  "project": "contracts/core000",
  "mode": "draft",
  "allowExecutableProfile": true,
  "environment": {
    "bun": "1.4.2",
    "os": "linux",
    "arch": "x64",
    "lockfileSha256": "sha256:...",
    "timezone": "UTC",
    "locale": "C.UTF-8",
    "install": "bun install --frozen-lockfile from <recorded source>",
    "isolation": {
      "mode": "temporary_workspace_only",
      "sandbox": false,
      "network": "not_restricted",
      "resourceLimits": "external_timeout_only"
    }
  },
  "command": "bun contracts/core000/run.ts --mode draft --write false",
  "exitCode": 0,
  "blockedBy": null,
  "written": false,
  "output": "output/CORE-000.draft.md",
  "identity": {
    "projectId": "core-000-self-contract",
    "engineVersion": "0.1.0",
    "manifestVersion": "0.1",
    "inputDigest": "sha256:...",
    "extensions": [
      { "kind": "profile", "id": "core000", "version": "0.1.0" },
      { "kind": "adapter", "id": "markdown", "version": "0.1.0" },
      { "kind": "renderer", "id": "core000-markdown", "version": "0.1.0" }
    ]
  },
  "artifactSha256": "sha256:...",
  "diagnostics": [
    {
      "code": "core000.independent-verification.missing",
      "severity": "review",
      "file": "claims.yml",
      "pointer": "/claims/0",
      "message": "..."
    }
  ],
  "expected": {
    "exitCode": 0,
    "blockedBy": null,
    "codes": ["core000.independent-verification.missing"]
  },
  "sourceRepositoryClean": true,
  "workspace": {
    "writeCheck": "only_declared_outputs",
    "cleanup": "completed"
  },
  "result": {
    "H1_self_build": "SELF_BUILD_COMPLETED",
    "H2_reproducibility": "NOT_TESTED",
    "H3_independent_verification": "NOT_PERFORMED"
  },
  "classification": ["structural", "profile_policy", "implementation_behavior"],
  "limitations": ["self-build only", "no independent verification", "no isolation claimed"]
}
```

Rules:

- No absolute paths, hostnames, usernames, environment dumps, tokens, HMAC inputs, private Feishu
  content or secrets.
- `diagnostics` is the deterministic `BuildResult` array, not a screenshot or a hand-edited copy.
- `artifactSha256` is `null` when the run produced no artifact; `identity` is `null` when the
  build stopped before identity.
- `sourceRepositoryClean` is the source checkout check from `git status --porcelain`; it does not
  prove that writes in the temporary workspace stayed within the allowlist.
- `workspace.writeCheck` and `workspace.cleanup` are separate assertions: declared outputs only,
  and cleanup completed. Neither is inferred from `sourceRepositoryClean`.
- `result` names the hypothesis; a run that did not execute is `*_NOT_RUN` / `NOT_TESTED`, never a
  success label.
- The record is sufficient to reproduce only under the pinned inputs and controlled environment;
  it is not a proof of authenticity or tamper-evidence.

### 4.3 Evidence location

The accepted plan proposes durable `evidence/core000/<run>/result.json` records plus a human
summary `docs/architecture/core-000-execution-evidence.md`. P-2 decides only that durable
publication/location and summary format; P-6 decides whether they are committed.

S1 must write the transient record to a temporary path and assert both the execution plan §6.2
base shape and the §4.2 S1 additions in a test. That requirement is already part of S1 and is
**not** deferred by P-2. S1 commits no evidence record and no generated artifact; durable
publication and the generated-draft commit wait for P-2, P-3 and P-6.

---

## 5. Repeatability and comparison policy

### 5.1 Two fresh environments

H2 uses two independent ephemeral environments, **E1** and **E2**. Each is created from scratch
from the same pinned commit: fresh checkout, fresh dependency installation from the same lockfile
and recorded install source, fresh `HOME`, fresh output directory, same Bun/OS/arch, controlled
environment. Neither environment inherits the other's workspace, `node_modules`, cache or output.

A same-process repeat is not H2 evidence; it only checks accidental mutable state. A second
process in the same workspace is S1-POS-02 evidence, not a fresh-environment repeat.

### 5.2 Required comparisons

For each pair of runs:

| Field | Required relation | Failure label |
|---|---|---|
| `identity.inputDigest` | byte-identical | `NOT_REPRODUCIBLE` |
| `artifactSha256` (raw) and normalized artifact text | both byte-identical for `REPRODUCIBLE_BYTE_IDENTICAL`; raw bytes may differ only in the §5.3 normalized case | `NOT_REPRODUCIBLE` / `REPRODUCIBLE_NORMALIZED` |
| Diagnostics | same code, severity, file and pointer for every entry, in the engine's deterministic order | `NOT_REPRODUCIBLE` |
| `exitCode`, `blockedBy`, `written`, `markdown !== null` | equal | `NOT_REPRODUCIBLE` |
| `sourceRepositoryClean` | true in both | `INCONCLUSIVE` / abort |
| `workspace.writeCheck` and `workspace.cleanup` | equal to the declared expected values | `INCONCLUSIVE` / abort |

### 5.3 Byte-identical versus normalized comparison

`REPRODUCIBLE_BYTE_IDENTICAL` requires the same `inputDigest`, the same artifact SHA-256 over the
normalized bytes, and the same diagnostic snapshot, under the same pinned inputs and controlled
environment. This is the only label that supports a byte-equality claim.

`REPRODUCIBLE_NORMALIZED` is allowed only when:

1. the comparison applies a **pre-declared** normalization that removes no semantic content:
   UTF-8 decode, CRLF/CR to LF, and one trailing newline (the engine's existing artifact
   normalization); and
2. every remaining difference is explained as a controlled, non-semantic environment difference
   that was declared before the run; and
3. `inputDigest`, exit status and the diagnostic code/order still match.

If a difference is not explained by the declared normalization, the result is
`NOT_REPRODUCIBLE`, not a softer success. Because the engine already normalizes the artifact,
a normalized-only difference is not expected on the S1 path; if it occurs, it indicates a path
outside the declared normalization and must be investigated rather than labelled.

**Semantic comparison** (parsing the Markdown and comparing the claim sections and values) may be
recorded as an additional observation, but it does not upgrade H2. A semantic match with different
bytes is not byte reproducibility.

### 5.4 Exclusions

The H2 label does **not** cover:

- cross-platform, cross-architecture or cross-Bun-version equality;
- a different lockfile, dependency version or install source;
- a different commit, profile closure, source document or CORE-000 input;
- network effects, registry changes, clock, locale or host environment;
- extension purity (the hook's determinism is an author obligation);
- code/test evidence files, which are not in `inputDigest` (gap G1);
- tamper-evidence, authenticity or signature.

The evidence record states these exclusions. A run that changes one of them is a different
experiment, not a repeat.

### 5.5 Outcome precedence

1. If either environment failed to set up, H2 is `INCONCLUSIVE`.
2. If either run did not complete or a required field is missing, H2 is `INCONCLUSIVE`.
3. If all required fields match byte-for-byte, H2 is `REPRODUCIBLE_BYTE_IDENTICAL`.
4. Otherwise, if and only if §5.3 is satisfied, H2 is `REPRODUCIBLE_NORMALIZED`.
5. Otherwise H2 is `NOT_REPRODUCIBLE`.

No step converts a missing or resource-limited check into a success.

---

## 6. Negative cases

### 6.1 Strategy

The recommended P-1 strategy B (pending maintainer confirmation): one base project plus exactly
one deterministic, named mutation applied in a fresh temporary copy per case. No case combines
mutations, and no case writes to the repository. Each case records the base commit, mutation ID,
expected diagnostic and observed result.

A negative case fails when the expected diagnostic is missing, an unexpected diagnostic appears,
the exit code is not 1, `blockedBy` is not `"errors"`, or an artifact was written. A failure to
observe an expected failure is a finding, not a pass.

### 6.2 First-slice cases

| ID | One mutation | Expected diagnostic | Notes |
|---|---|---|---|
| **N2** | Point a claim's `subject` at a non-existent entity | `ERR_UNKNOWN_REF` | Core reference failure; no artifact. |
| **N3** | Remove the code/test `evidencedBy` links from an `implemented` claim | `core000.claim.implemented-without-evidence` | Profile policy failure. |
| **N8** | Change a source statement's quote to text outside its declared locator | `core000.source.verification-failed` | The profile verifier must return `failed`/outside; the core stores the record. |
| **N11** | Remove `decidedBy` from an `accepted` claim | `core000.claim.decision-required` | Profile policy failure. |
| **N14** | Run the CLI without `--allow-executable-profile` on a temp copy carrying evaluation markers in `view.ts` and `validator.ts` | `core.profile.consent-required` | Consent gate; exit 1; `identity: null`, `markdown: null`; both markers absent. The renderer is not in the CLI path. |

N14 does not use the positive harness: the harness statically imports the renderer and therefore
cannot demonstrate the no-consent boundary. N14 uses the CLI, which leaves the registry empty for a
CORE-000 project, and the `view`/`validator` marker files prove that no profile module the engine
loads was evaluated. A renderer marker would not prove anything here: the CORE-000 renderer is
consumer-supplied, `runBuild` never imports it, and a consented CORE-000 CLI run would fail at
`core.registry.missing` (G4) rather than load it. Consumer-supplied renderer loading is the
consumer's separate trust boundary and is not gated by `allowExecutableProfile`.

### 6.3 Later cases

The full plan's N1–N18 remain the target for later slices. S1 excludes N1, N4a, N4b, N5, N6, N7,
N9, N10, N12, N13, N15, N16, N17 and N18 because their kinds, relations or checks are not in S1.
They are not waived; they move to the slice that adds the corresponding model surface.

Negative cases exercise different layers: core, profile policy, provenance verification and
consent. A test that checks only the code string is insufficient; it must also check the exit
status, `blockedBy`, absence of an artifact and, for N14, absence of the view/validator evaluation
markers.

---

## 7. Failure behavior

No failure may be converted into a success label. Every run has an outcome, and every incomplete
or unverified condition remains visible.

| Condition | Visible outcome | Required behavior |
|---|---|---|
| Missing dependency or failed install | `ENV_SETUP_FAILED`; H1/H2 `NOT_RUN` / `INCONCLUSIVE` | Do not start the build; retain the install log without secrets; exit non-zero. |
| Unsupported input or schema failure | `RUN_BLOCKED` with the diagnostic | No artifact; if unexpected, `SELF_BUILD_FAILED`; never treat a schema rejection as a pass. |
| Resource exhaustion or timeout | `RESOURCE_LIMIT_REACHED`; H2 `INCONCLUSIVE` | Kill the process, retain partial logs, mark the run incomplete, and do not compare it as a pass. |
| Incomplete checks or missing comparison field | `CHECKS_INCOMPLETE`; H2 `INCONCLUSIVE` | Report which check is missing; do not infer equality. |
| Non-deterministic output | `NOT_REPRODUCIBLE` | Preserve both hashes and a diff summary; do not normalize beyond §5.3. |
| Crash or uncaught exception | `RUN_CRASHED`; H1 `SELF_BUILD_FAILED` | Retain the stack/exit status; no artifact claim. |
| Evidence capture fails or is malformed | `EVIDENCE_INVALID` | Treat the run as invalid even if the build itself completed. |
| Unexpected diagnostic or missing expected diagnostic | `OUTCOME_MISMATCH` | Record expected vs observed; do not adjust the expectation after the fact. |
| Source repository write detected | `REPOSITORY_WRITE` | Abort the experiment; clean up; investigate before any rerun. |
| Workspace write outside the allowlist | `WORKSPACE_WRITE` | Abort; preserve the workspace state for inspection; no result. |
| Workspace cleanup incomplete | `WORKSPACE_CLEANUP_INCOMPLETE` | Record it; do not turn a failed run into a pass. |
| Secret or network access detected (if observable) | `CONTROL_VIOLATION` | Abort; no result; raise a separate security follow-up. |

The harness must have an external wall-clock timeout even when the engine has none. A timed-out
run is never a pass.

---

## 8. Cleanup and retention

### 8.1 Ephemeral

The following are deleted after the evidence is extracted:

- the temporary checkout and any copied `node_modules`;
- `HOME`, cache and output directories created for the run;
- evaluation-marker files and mutation copies;
- raw logs that contain absolute host paths or transient data.

Cleanup runs even after a failure. A cleanup failure is recorded and does not turn a failed run
into a pass.

### 8.2 Retained

- The run evidence JSON with the fields in §4.2.
- The artifact SHA-256, and the artifact bytes only if the evidence policy explicitly allows them.
- The comparison report and the human summary.
- The base commit, mutation ID and expected/observed diagnostics for negative cases.

### 8.3 Deliberately not committed

- Temporary directories, dependency caches and host-specific environment dumps.
- Secrets, tokens, credentials, private Feishu content and personal data.
- Screenshots or browser state (this is a non-UI experiment).
- Any generated CORE-000 draft or durably published evidence record before P-2/P-3/P-6 are
  decided; the transient S1 record is still produced and asserted.
- Any file that would make the engine's own output look like independent verification.

Durable publication of evidence is subject to P-2 and P-6. S1 writes the transient record to a
temporary path; that requirement is not subject to P-2.

---

## 9. Residual risks and limitations

1. **The temporary workspace is not isolation.** Repository-owned profile code runs in-process
   with the builder's privileges. A malicious or compromised profile dependency could affect the
   host. S1 executes only repository-owned code; that is a code-review trust decision, not a
   sandbox.
2. **Network is not disabled in S1.** Dependency installation and any uncontrolled network access
   are recorded; they are not prevented by the engine.
3. **Resource limits are external only.** A runaway hook can consume CPU, memory or disk until the
   harness timeout kills it. The engine has no budget.
4. **H2 is same-environment only.** The claim is limited to the pinned Bun/OS/arch/lockfile. It
   does not establish cross-platform or cross-version reproducibility.
5. **`inputDigest` excludes code and test evidence.** A cited file can change without changing the
   digest (gap G1). Evidence freshness remains an external check.
6. **Provenance is coarse.** The markdown locator is section/table/item; the accepted source-byte
   pin (V4) is not implemented. `sourceDigest` records the bytes checked, not a declared pin.
7. **No signature or attestation.** Evidence is not tamper-evident to a third party; PAP does not
   change that for CORE-000.
8. **PAP is not independent verification of CORE-000.** It verifies a separate package format,
   has its own open gates and does not consume CORE-000.
9. **The engine cannot establish semantic truth or completeness.** A self-build can show
   consistency; it cannot show that the self-description is complete or correct.
10. **The producer is the same account that authors the claims.** H3 requires a distinct verifier;
    without one it remains `NOT_PERFORMED`.
11. **Trusted dependencies remain a supply-chain surface.** `--frozen-lockfile` pins the
    resolution but does not prove the registry or cache served those bytes.
12. **Determinism of hooks is an author obligation.** The engine cannot detect a hook that reads a
    clock, random source, filesystem or environment.
13. **Consent is not in `inputDigest`.** Evidence must record the consent value; otherwise a
    consented and an unconsented run are not distinguishable from the digest alone.
14. **`sourceRepositoryClean` is not workspace confinement.** The source checkout check does not
    prove that temp-workspace writes stayed within the allowlist; the workspace write and cleanup
    assertions are separate and must be reported separately.

These risks are limitations of the proposed experiment, not reasons to weaken the result labels.

---

## 10. First implementation slice S1 — proposed, not authorized

### 10.1 Purpose

S1 is the smallest useful vertical slice that demonstrates one bounded self-build through the
existing generic pipeline. It is **not** the full CORE-000 model. S1 is a separate implementation
PR after approval; this planning PR does not contain it. It tests whether the engine can
load, validate, relate, provenance-check, policy-check, render and identify a small CORE-000
project with no `spec/lib/` change.

S1 requires maintainer answers for **D1, D13, D15, P-1, P-4 and P-5**, plus the separate
G4/consumer-harness confirmation. **D14, P-2, P-3 and P-6 may be explicitly deferred for S1**;
deferral does not resolve them, and the full decision record remains open until all ten are
resolved; a `defer` leaves that item open. **P-2's deferral covers only durable publication and
the summary format; S1 still writes and asserts the transient record.** S1 is shaped for the
recommended defaults D1 A, D13 A,
D15 A, P-1 B, P-4 A and P-5 A. It does not implement D14 (consent-surface entities),
P-2/P-3/P-6 (evidence and generated-artifact publication) or the full register. If a default
changes, S1 is re-scoped; the change is not a reason to silently pick another option.

### 10.2 Exact files and paths

Assuming D1 option A. If D1 chooses a different location, every path moves and the slice is
re-scoped.

| Path | Kind | Purpose |
|---|---|---|
| `contracts/core000/contract-builder.json` | project input | Manifest: two documents, one source, one render declaration. |
| `contracts/core000/structure.yml` | project input | Minimal public structure: `COMP-CORE`; `IF-MANIFEST`, `IF-BUILD-IDENTITY`, `IF-PROFILE-VALIDATOR`; `TB-PROFILE-EXEC`; `provides` relations. |
| `contracts/core000/claims.yml` | project input | Five accepted claims (`C000-TR-001`, `C000-TR-003`, `C000-CT-025`, `C000-CT-026`, `C000-IM-004`), three source statements (`SRC-TR-001`, `SRC-MANIFEST-001`, `SRC-PROVENANCE-001`), eight evidence rows, three accepted engine decisions with the proposed IDs `DEC-35`, `DEC-PR-55` and `DEC-PR-56` (for the merged #35/#50, #37/#55 and #38/#56 decisions respectively), empty `independentVerifications`. |
| `contracts/core000/run.ts` | consumer harness | Calls `runBuild` with consent and the CORE-000 renderer; `BuildMode` draft/release plus the boolean `check` option; temporary-copy helper; evidence JSON writer. Not a profile input and not part of `inputDigest`. |
| `contracts/core000/mutations.ts` | test support | Deterministic, named one-field mutations used only on temporary copies; not a project input and not profile code. |
| `profiles/core000/profile.json` | profile | Eight kinds, eleven relation declarations, two document bindings, provenance mapping, file closure, `nunjucks` 3.2.4 dependency, view/validator/diagnostics. |
| `profiles/core000/catalog.json` | profile | The S1 diagnostic codes in the M1 catalog shape. |
| `profiles/core000/view.ts` | profile executable | Builds the artifact view from the model. |
| `profiles/core000/validator.ts` | profile executable | Exports `validate` and `verifyProvenance`. |
| `profiles/core000/checks/claim-evidence.ts` | profile executable | Implemented/tested/decision/subject checks. |
| `profiles/core000/checks/trust-policy.ts` | profile executable | Consent-claim and trust-boundary policy checks. |
| `profiles/core000/checks/provenance-verification.ts` | profile executable | Source-statement verification and independent-verification presence checks. |
| `profiles/core000/renderer.ts` | profile executable | `core000-markdown` renderer, `nunjucks` 3.2.4. |
| `profiles/core000/templates/core000.md.j2` | profile | Artifact template. |
| `profiles/core000/schemas/structure.schema.json` | profile schema | Validates `structure.yml` as a whole. |
| `profiles/core000/schemas/claims.schema.json` | profile schema | Validates `claims.yml` as a whole. |
| `profiles/core000/schemas/component.schema.json` | profile schema | Entity schema. |
| `profiles/core000/schemas/interface.schema.json` | profile schema | Entity schema. |
| `profiles/core000/schemas/source-statement.schema.json` | profile schema | Entity schema. |
| `profiles/core000/schemas/claim.schema.json` | profile schema | Entity schema. |
| `profiles/core000/schemas/evidence.schema.json` | profile schema | Entity schema. |
| `profiles/core000/schemas/independent-verification.schema.json` | profile schema | Entity schema; the S1 data list is empty. |
| `profiles/core000/schemas/decision.schema.json` | profile schema | Entity schema. |
| `profiles/core000/schemas/trust-boundary.schema.json` | profile schema | Entity schema. |
| `tests/core000.test.ts` | test/harness | CI assertions for S1-POS-01–S1-POS-05 and N2/N3/N8/N11/N14; temp-only writes. |

No file under `spec/`, `profiles/core001/`, `spec/output/`, `CORE-001.legacy.md` or `pap/` is
changed. No generated artifact or evidence record is committed by S1.

### 10.3 Model and policy scope

**Kinds (8 of 14):** `component`, `interface`, `source_statement`, `claim`, `evidence`,
`independent_verification`, `decision`, `trust_boundary`.

**Relations (11 declarations, 5 reciprocal pairs plus `subject`):** `provides` / `providedBy`,
`subject`, `cites` / `citedBy`, `evidencedBy` / `supports`, `decidedBy` / `decides`, `verifies` /
`verifiedBy`.

**Policy check families (9 of 23):**

1. `core000.claim.implemented-without-evidence`
2. `core000.claim.tested-without-test`
3. `core000.claim.decision-required` (plus `core000.decision.unresolved` review where applicable)
4. `core000.claim.missing-subject` / `core000.claim.subject-kind-mismatch`
5. `core000.source.verification-missing` / `-failed` / `-unavailable`
6. `core000.claim.verification-not-independent`
7. `core000.independent-verification.missing` (review; this is what blocks release)
8. `core000.claim.policy-mismatch` (consent claims must match the settled policy)
9. `core000.trust.consent-facts` (the trust boundary must be `settled`/`explicit_consent`)

The profile's `verifyProvenance` calls `ctx.verifyQuote` once per source statement binding, returns
a claim per statement, and the core stores the record. The `validate` hook reads
`Entity.verification`; it does not call the adapter again. The trust check is silent on a
`settled`/`explicit_consent` boundary and emits a review only on a mismatch; the consent-claim
check is an error only on a contradiction.

### 10.4 Exact behaviour and commands

| Command | Expected result |
|---|---|
| `bun install --frozen-lockfile` | exit 0; same lockfile and dependency versions. |
| `bun run typecheck` | exit 0. |
| `bun test tests/core000.test.ts` | all S1 tests pass; no repository write. |
| `bun run check` | exit 0; CORE-001 artifact unchanged. |
| `bun contracts/core000/run.ts --mode draft --write false` | exit 0; `blockedBy: null`; `identity` non-null; `markdown` non-null; `written: false`; only `core000.independent-verification.missing` review diagnostics (one per active claim with `authority: external`/`human`). |
| Same draft command in a second process | same `identity.inputDigest`, `artifactSha256` and diagnostic code/order as the first process. |
| `bun contracts/core000/run.ts --mode release --write false` | exit 1; `blockedBy: "review"`; no release artifact written. |
| Write the draft in a temp copy, then `bun contracts/core000/run.ts --mode draft --check true --spec-dir <temp>` | no `ERR_OUTPUT_STALE`; artifact bytes match the temp copy. |
| `bun contracts/core000/run.ts --mode draft --write false --mutation claim` on a temp copy | `inputDigest` changes; artifact hash changes; no crash. |
| `bun contracts/core000/run.ts --mode draft --write false --mutation unresolved-subject` | exit 1; `ERR_UNKNOWN_REF`; no artifact. |
| `bun contracts/core000/run.ts --mode draft --write false --mutation implemented-without-evidence` | exit 1; `core000.claim.implemented-without-evidence`; no artifact. |
| `bun contracts/core000/run.ts --mode draft --write false --mutation quote-outside` | exit 1; `core000.source.verification-failed`; no artifact. |
| `bun contracts/core000/run.ts --mode draft --write false --mutation decision-missing` | exit 1; `core000.claim.decision-required`; no artifact. |
| `bun spec/build.ts --spec <temp N14 copy> --no-write --json` (no consent flag) | exit 1; `core.profile.consent-required`; `identity: null`; `markdown: null`; view/validator markers absent; no CORE-000 renderer is in the CLI path. |

`BuildMode` is `draft` or `release`; `--check true` is a boolean option that compares the
generated artifact with the existing file, not a third mode. The exact `run.ts` flag names are a
harness detail; the invariant is that it calls `runBuild` with `allowExecutableProfile: true`
(except N14), supplies the CORE-000 renderer registry, never bypasses the public pipeline, and
writes evidence only to the requested path. The harness copies
the project/profile into a temp workspace and rewrites only temp paths; `--mutation` applies one
named mutation to that temp copy.

### 10.5 Tests and expected assertions

`tests/core000.test.ts` uses the same `runBuild` path or a helper exported by `run.ts`; it does not
call a private pipeline. The accepted plan calls these positive checks P1–P5; S1 uses
**S1-POS-01–S1-POS-05** so they cannot be confused with decisions P-1–P-6.

- **S1-POS-01:** exit 0, `blockedBy: null`, identity non-null, markdown non-null, written false; diagnostic
  code set equals `{core000.independent-verification.missing}`; the review count equals the number
  of active claims with `authority: external` or `human`.
- **S1-POS-02:** two separate processes return the same `inputDigest`, artifact SHA-256 and diagnostic
  code/order.
- **S1-POS-03:** release exits 1 with `blockedBy: "review"` and writes no release artifact.
- **S1-POS-04:** a written draft in a temp copy passes `check` (no `ERR_OUTPUT_STALE`).
- **S1-POS-05:** a one-claim mutation changes `inputDigest` and the artifact hash.
- **N2/N3/N8/N11:** exit 1, expected code, `blockedBy: "errors"`, no artifact.
- **N14:** exit 1, `core.profile.consent-required`, `identity: null`, `markdown: null`, both
  view/validator marker files absent; no renderer marker is used.
- **Evidence shape:** the `--evidence` JSON matches the §4.2 shape, contains no absolute host path
  or secret, and uses `SELF_BUILD_COMPLETED` only for a completed run.

Tests use `os.tmpdir()` workspaces and clean them in `afterEach`/`afterAll`; no test writes to the
repository.

### 10.6 Dependencies and generic-core capabilities relied upon

- `runBuild(BuildOptions)` and its existing phases: load, consent, closure, path containment,
  schemas, extraction, identity/index, relations, provenance binding, `verifyProvenance`, hook
  resolution, renderer registry, build identity, one-artifact normalization, blocking/check/write.
- `profile.files` / `profile.dependencies` closure and `inputDigest`.
- `ProfileValidator.validate` and optional `verifyProvenance`.
- `Renderer` registry and `TemplateSet`; `nunjucks` 3.2.4.
- The M1 diagnostic catalog and `resolveFindings`.
- No `spec/lib/` change, no new dependency, no CLI change.

### 10.7 Explicit exclusions

S1 does not implement: the full 78-claim register; the 14-kind model; 28 relation declarations;
23 policy checks; phases, transitions, extension points, diagnostics, dependencies, conformance
cases, gaps or CORE-000 decisions D1–D15; D14 consent-surface entities; independent-verification
records; the full N1–N18 matrix; evidence publication; generated-artifact commit; the ephemeral
E1/E2 comparison; any sandbox or isolation; PAP integration; any generic-core, CORE-001 or `pap/`
change.

S1 does not claim that the full design is expressible, that the claims are true, that the build
is reproducible across environments, or that any claim is independently verified.

### 10.8 Stop conditions

Stop and report the concrete gap, without expanding the slice, if:

- a required behaviour needs a `spec/lib/` change (schema, relation, identity, renderer, hook,
  provenance or path handling);
- the profile closure or path containment cannot express the external project/profile/source
  layout;
- a policy check would need filesystem, clock, network or environment I/O;
- the renderer needs a template feature the `TemplateSet` does not provide;
- a kind, relation or field cannot be expressed without inventing data the accepted design does
  not contain, or without a new maintainer decision;
- the N14 view/validator marker test cannot reliably prove that no profile module was evaluated;
- the second process differs for a reason not explained by the controlled inputs;
- any run writes to the repository, reads a secret, or cannot be cleaned up.

A stop condition is a finding for the maintainer, not permission to patch the core or widen S1.

### 10.9 Acceptance criteria and evidence for review

S1 is ready for maintainer review when:

1. the maintainer has resolved the mandatory S1 decisions **D1, D13, D15, P-1, P-4 and P-5**
   (or explicitly authorized S1 under their recommended defaults), has explicitly deferred or
   answered **D14, P-2, P-3 and P-6**, and has confirmed the separate consumer-harness/G4 boundary;
   the full decision record remains open until every decision is resolved;
2. `bun install --frozen-lockfile`, `bun run typecheck`, `bun test` and `bun run check` are green;
3. S1-POS-01–S1-POS-05 and N2/N3/N8/N11/N14 produce exactly the expected results, with no artifact on failures
   and no repository writes;
4. the transient evidence record matches §4.2 and contains no absolute paths, secrets or private
   material, even if P-2 is deferred;
5. the CORE-001 artifact and lockfile are unchanged; `spec/lib/`, `profiles/core001/` and `pap/`
   are unchanged;
6. no claim is marked `independently_verified`; the release remains blocked by the
   independent-verification review;
7. the PR states the slice's limits and does not claim H2/H3 from an H1 result.

The review evidence is the test output, the evidence JSON, the `git status` check and the diff
limited to the files in §10.2. A human merge is required; the agent does not merge or enable
auto-merge.

### 10.10 Why this slice is small enough

S1 exercises the full generic path with eight kinds, eleven relation declarations and nine policy
check families over five accepted claims. It can falsify the expressibility hypothesis cheaply: a
missing core capability appears at a named step, and the stop conditions prevent a core patch. It
does **not** test the completeness of the 14-kind/28-relation/23-check model, the full register,
the negative matrix or cross-environment reproducibility; those are later slices.

---

## 11. Later slices (not authorized)

These are proposals, not a schedule. Each starts only after the maintainer approves the preceding
slice and answers the decisions it depends on.

1. **S2 — structure and full model.** Add the remaining kinds and relations, the full 78-claim
   register, D14 consent-surface entities, the 23 policy checks and the accepted design's
   structure data. This is the first slice that can claim the full model is expressible.
2. **S3 — full negative and provenance matrix.** Add N1–N18, the full evidence capture and the
   human summary. P-2 decides durable publication/location and the summary format; P-6 decides
   git publication; P-3 decides whether the draft is committed. The transient S1 evidence record is
   already required.
3. **S4 — ephemeral reproducibility and independent verification.** Run E1/E2 under the comparison
   policy, with an isolation profile only if separately approved. A distinct verifier follows
   design §8.2 and writes external records; only then may a claim become
   `independently_verified`.

No later slice is authorized by this document.

---

## 12. What this plan does not do

- It does not implement CORE-000, create its project/profile/schemas/fixtures/tests/evidence or
  generate its artifact.
- It does not change `spec/lib/`, `profiles/core001/`, `spec/output/`, CORE-001 content or `pap/`.
- It does not accept any maintainer decision or represent a recommendation as accepted.
- It does not claim that a fresh temporary directory is a sandbox, that consent is isolation, or
  that any existing control is a security boundary.
- It does not claim reproducibility, independent verification, correctness, security, hermeticity
  or conformance.
- It does not authorize the first slice or any later slice. Implementation starts only after
  explicit maintainer approval.
