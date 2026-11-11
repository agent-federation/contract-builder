# Contract Builder Engine public self-contract

> Generated build artifact. The source of truth is the declared `contracts/core000/` inputs,
> not this document. Do not edit it by hand; change the inputs and rebuild.

| Field | Value |
|---|---|
| Project | `core-000-self-contract` — Contract Builder Engine public self-contract |
| Project revision | `0.1.0` |
| Scope | Project `core-000-self-contract` — the CORE-000 engine self-contract declared by `contracts/core000/`, rendered by the `core000` profile |
| Exclusions | No CORE-001 slice or `CORE-001.legacy.md` material; this artifact is the CORE-000 self-contract, not a CORE-001 rendering. |
| Mode | `draft` |
| Profile | `core000` `0.1.0` |
| Renderer | `core000-markdown` `0.1.0` |
| Engine version | `0.1.0` |
| Manifest version | `0.1` |
| inputDigest | `sha256:11b1297be810e17dc40b869601296d24936854b4bc0d05f2feb8390deb4361e5` |
| Diagnostics | ERROR=0 · REVIEW_REQUIRED=62 · WARNING=6 |
| Gate | `release` blocked — 62 `REVIEW_REQUIRED` diagnostics. |

**Counts:** components=7 · interfaces=12 · phases=9 · transitions=0 · extension points=4 · dependencies=7 · diagnostic catalog=25 · claims=78 · source statements=3 · evidence=33 · decisions=15 · conformance cases=0

## Components

### COMP-CORE — Contract Builder core

- Boundary: `engine`
- Public: true
- Responsibility: Generic loading, structure, identity, relations, provenance binding, diagnostics, rendering and build identity.

- Provides: `IF-MANIFEST`, `IF-PROJECT-MODEL`, `IF-BUILD-IDENTITY`, `IF-DIAGNOSTIC`, `IF-BUILD-RESULT`, `IF-PROFILE-VALIDATOR`, `IF-CONFORMANCE`, `IF-CONSENT-OPTION`

### COMP-PROFILE — CORE-000 profile

- Boundary: `profile`
- Public: true
- Responsibility: The CORE-000 executable profile: view, validator, checks, renderer and schemas.

### COMP-PROJECT — CORE-000 project

- Boundary: `project`
- Public: true
- Responsibility: The CORE-000 project inputs: manifest, structure, claims and evidence references.

### COMP-ADAPTER — Source adapter

- Boundary: `consumer`
- Public: true
- Responsibility: Source adapters expose document bytes and locators to the engine.

- Provides: `IF-ADAPTER`

### COMP-RENDERER — Artifact renderer

- Boundary: `consumer`
- Public: true
- Responsibility: Artifact renderers project the model into an output format.

- Provides: `IF-RENDERER`

### COMP-CLI — Consumer CLI

- Boundary: `consumer`
- Public: true
- Responsibility: Consumer CLI that selects the project and profile and gates executable-profile loading.

- Provides: `IF-CLI`, `IF-CONSENT-CLI-FLAG`

### COMP-REVIEWER — External reviewer

- Boundary: `external`
- Public: true
- Responsibility: External reviewer role that produces independent-verification records.

## Interfaces

### IF-MANIFEST — Project manifest

- Surface: `file`
- Stability: `accepted`
- Owner: `COMP-CORE`
- Description: contract-builder.json: project, profile, inputs, sources, render, output.

### IF-BUILD-IDENTITY — Build identity

- Surface: `data`
- Stability: `accepted`
- Owner: `COMP-CORE`
- Description: BuildResult.identity: projectId, engineVersion, manifestVersion, inputDigest and the extensions list.

### IF-PROFILE-VALIDATOR — Profile validator hook

- Surface: `api`
- Stability: `accepted`
- Owner: `COMP-CORE`
- Description: Profile validate(model, ctx) and optional verifyProvenance(model, ctx) exports, loaded only after explicit caller consent.

### IF-PROJECT-MODEL — Project model

- Surface: `data`
- Stability: `accepted`
- Owner: `COMP-CORE`
- Description: ProjectModel: documents, typed collections, relation index and provenance index produced from the loaded project.

### IF-DIAGNOSTIC — Diagnostic record

- Surface: `data`
- Stability: `accepted`
- Owner: `COMP-CORE`
- Description: Diagnostic record: code, severity, phase, message and status used by build results and the catalog.

### IF-BUILD-RESULT — Build result

- Surface: `data`
- Stability: `accepted`
- Owner: `COMP-CORE`
- Description: BuildResult: model, diagnostics, identity and rendered output.

### IF-CONFORMANCE — Declarative conformance surface

- Surface: `data`
- Stability: `accepted`
- Owner: `COMP-CORE`
- Description: Declarative conformance surface: conformance cases and their claim coverage.

### IF-ADAPTER — Source adapter interface

- Surface: `api`
- Stability: `accepted`
- Owner: `COMP-ADAPTER`
- Description: Source adapter contract: read document bytes and resolve locators for a declared source.

### IF-RENDERER — Renderer interface

- Surface: `api`
- Stability: `accepted`
- Owner: `COMP-RENDERER`
- Description: Renderer contract: project the model into an output format.

### IF-CLI — Consumer CLI

- Surface: `cli`
- Stability: `deferred`
- Owner: `COMP-CLI`
- Description: Consumer CLI surface; accepted but deferred (C000-CT-016/017).

### IF-CONSENT-OPTION — Executable-profile consent option (allowExecutableProfile)

- Surface: `api`
- Stability: `accepted`
- Owner: `COMP-CORE`
- Description: BuildOptions.allowExecutableProfile: explicit consent for executable profile loading.

### IF-CONSENT-CLI-FLAG — Executable-profile consent CLI flag (--allow-executable-profile)

- Surface: `cli`
- Stability: `accepted`
- Owner: `COMP-CLI`
- Description: --allow-executable-profile: CLI flag carrying explicit consent for executable profile loading.

## Trust boundaries

### TB-PROFILE-EXEC — Executable profile loading

- Policy status: `settled`
- Enforcement: `explicit_consent`
- Policy reference: #35 (closed; PR #50 merged)
- Inside: Profile view/validator modules and their declared closure run with builder privileges.
- Outside: No sandbox, capability restriction or process isolation exists.
- Statement: Loading a profile is a trust decision equivalent to installing a dependency; executable profile modules require explicit caller consent, are not sandboxed, and remain in-process with builder privileges.

### TB-CONSUMER-EXTENSION — Consumer-supplied extension import

- Policy status: `settled`
- Enforcement: `none`
- Policy reference: Q2 decision (Issue #84, 2026-11-04)
- Inside: Consumer-supplied adapter/renderer code imported by the consumer into the builder process
- Outside: The engine's executable-profile consent gate; allowExecutableProfile does not cover this import
- Statement: Importing a consumer-supplied adapter or renderer is the consumer's own trust decision; the engine does not gate, sandbox or isolate that import.

## Phases

### PH-LOAD — load

- Guarantee: bytes read, manifest parsed, profile resolved
- Not guaranteed: content correctness

- Prerequisites: _none_

### PH-STRUCTURE — structure

- Guarantee: documents match input schemas; extracted entities match kind schemas
- Not guaranteed: semantic meaning

- Prerequisites: `PH-LOAD`

### PH-REFERENCE — reference

- Guarantee: IDs unique, relations resolvable
- Not guaranteed: that references are appropriate

- Prerequisites: `PH-STRUCTURE`

### PH-PROVENANCE — provenance

- Guarantee: binding shape and declared source; a ProvenanceVerification result is stored separately with its own status and record
- Not guaranteed: that the quote is in the source; that a binding is verified evidence

- Prerequisites: `PH-STRUCTURE`

### PH-VERIFICATION — verification

- Guarantee: the profile verifier's recorded result is well formed and tied to the loaded source digest
- Not guaranteed: that the verifier is honest, independent or correct; that the quote was well chosen

- Prerequisites: `PH-STRUCTURE`, `PH-PROVENANCE`

### PH-CONSISTENCY — consistency

- Guarantee: declared fields do not contradict profile rules
- Not guaranteed: normative truth

- Prerequisites: `PH-STRUCTURE`

### PH-REVIEW — review

- Guarantee: unconfirmed content is marked and gated
- Not guaranteed: that the reviewer is right

- Prerequisites: `PH-STRUCTURE`

### PH-CONFORMANCE — conformance

- Guarantee: vectors are structurally and referentially consistent
- Not guaranteed: execution

- Prerequisites: `PH-STRUCTURE`

### PH-ARTIFACT — artifact

- Guarantee: output is deterministic and matches the checked artifact
- Not guaranteed: that the document is meaningful

- Prerequisites: _none_

## Transitions

Zero transition instances are encoded. No accepted source defines a permitted-move graph; the M1 phase sequence remains authoritative in the execution plan.

## Extension points

### EXT-PROFILE-VIEW — Profile view module

- Mechanism: `dynamic_import`
- Trust: `trusted_in_process`
- Status: `implemented`

- Loaded by: `COMP-CORE`

### EXT-PROFILE-VALIDATOR — Profile validator hook

- Mechanism: `dynamic_import`
- Trust: `trusted_in_process`
- Status: `implemented`

- Loaded by: `COMP-CORE`

- Exposes: `IF-PROFILE-VALIDATOR`

### EXT-RENDERER — Renderer registry entry

- Mechanism: `consumer_registry`
- Trust: `trusted_consumer_supplied`
- Status: `implemented`

- Loaded by: `COMP-CORE`

- Exposes: `IF-RENDERER`

### EXT-ADAPTER — Source adapter registry entry

- Mechanism: `static_import`
- Trust: `trusted_in_process`
- Status: `implemented`

- Loaded by: `COMP-CORE`

- Exposes: `IF-ADAPTER`

## Dependencies

### bun — Bun runtime

- Kind: `runtime`
- Status: `declared`
- Version: `>=1.4.0`

- Consequence: packageManager pins bun@1.4.2; the runtime range is >=1.4.0.

### ajv — JSON Schema validator

- Kind: `runtime`
- Status: `resolved`
- Version: `8.20.0`

### nunjucks — Template engine

- Kind: `runtime`
- Status: `resolved`
- Version: `3.2.4`

### yaml — YAML parser

- Kind: `runtime`
- Status: `resolved`
- Version: `2.9.1`

### typescript — TypeScript compiler

- Kind: `toolchain`
- Status: `resolved`
- Version: `5.9.3`

### @types/node — Node type definitions

- Kind: `toolchain`
- Status: `resolved`
- Version: `22.20.5`

### @types/nunjucks — Nunjucks type definitions

- Kind: `toolchain`
- Status: `resolved`
- Version: `3.2.6`

## Diagnostic catalog

- `core000.claim.implemented-without-evidence` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" is marked implemented but has no code, test or CI evidence.

- `core000.claim.tested-without-test` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" is marked tested but has no test/CI evidence or a verification method.

- `core000.claim.decision-required` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" has decision "{{status.decision}}" but its decidedBy relation does not agree with that status.

- `core000.decision.unresolved` — `review` on `PH-CONSISTENCY` (declared): Claim "{{id}}" is linked to unresolved decision "{{decisionId}}".

- `core000.claim.missing-subject` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" has no subject relation.

- `core000.claim.subject-kind-mismatch` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" subject "{{subjectId}}" has kind "{{subjectKind}}", expected "{{subject_kind}}".

- `core000.source.verification-missing` — `error` on `PH-CONSISTENCY` (declared): Source statement "{{id}}" has no stored provenance verification record.

- `core000.source.verification-failed` — `error` on `PH-CONSISTENCY` (declared): Source statement "{{id}}" failed provenance verification with outcome "{{outcome}}".

- `core000.source.verification-unavailable` — `error` on `PH-CONSISTENCY` (declared): Source statement "{{id}}" has an unavailable provenance verification record.

- `core000.claim.verification-not-independent` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" is marked independently_verified without a valid independent-verification record.

- `core000.independent-verification.missing` — `review` on `PH-CONSISTENCY` (declared): Claim "{{id}}" (authority "{{authority}}") has no independent verification record.

- `core000.claim.policy-mismatch` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" contradicts the settled executable-profile consent policy.

- `core000.trust.consent-facts` — `review` on `PH-CONSISTENCY` (declared): Trust boundary "{{id}}" must be policy_status settled with enforcement explicit_consent; found "{{policy_status}}" and "{{enforcement}}".

- `core000.claim.invalid-status` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" carries an invalid status value.

- `core000.claim.unsupported-guarantee` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" asserts a guarantee with no supporting evidence.

- `core000.claim.status-class-conflict` — `error` on `PH-CONSISTENCY` (declared): Claim "{{id}}" has a class/status combination the profile does not accept.

- `core000.independent-verification.incomplete` — `error` on `PH-CONSISTENCY` (declared): Independent verification "{{id}}" is incomplete.

- `core000.independent-verification.self` — `error` on `PH-CONSISTENCY` (declared): Independent verification "{{id}}" is not produced by a distinct verifier.

- `core000.independent-verification.record-missing` — `error` on `PH-CONSISTENCY` (declared): Independent-verification record "{{id}}" is missing.

- `core000.model.interface-owner-mismatch` — `error` on `PH-CONSISTENCY` (declared): Interface "{{id}}" has owner "{{owner}}", which does not match its providing component.

- `core000.evidence.locator` — `error` on `PH-CONSISTENCY` (declared): Evidence "{{id}}" has an empty locator or revision after trimming.

- `core000.evidence.orphan` — `warning` on `PH-CONSISTENCY` (declared): Evidence "{{id}}" supports no claim.

- `core000.surface.claim-missing` — `warning` on `PH-CONSISTENCY` (declared): Public surface "{{id}}" has no covering claim.

- `core000.conformance.case-uncovered` — `warning` on `PH-CONSISTENCY` (declared): Conformance case "{{id}}" is not covered by a claim.

- `core.profile.consent-required` — `error` on `PH-LOAD` (declared): Executable profile loading requires explicit caller consent.

## Conformance cases

_None declared._

## Requirements

_28 claims: 20 accepted, 6 proposed, 2 deferred, 0 none_

### C000-SC-002

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: CORE-000 describes the engine's public contract — components, interfaces, lifecycle, guarantees, constraints, dependencies, extensions, diagnostics, identity, trust, decisions, provenance and evidence — not private module structure.

- Scope: CORE-000 accepted design §4.2 row C000-SC-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SC-002 at the accepted design baseline: #47 §1; C:§1–2; §3.1

- Subjects: `COMP-CORE` (component)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-ST-002

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Important claims carry stable IDs, one class, separate status dimensions and a verification/evidence method; low-level details may be covered by evidence instead.

- Scope: CORE-000 accepted design §4.2 row C000-ST-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-ST-002 at the accepted design baseline: §4.1, §4.4

- Subjects: `C000-SC-001` (claim), `C000-SC-002` (claim), `C000-SC-004` (claim), `C000-SC-005` (claim), `C000-ST-001` (claim), `C000-ST-002` (claim), `C000-ST-003` (claim), `C000-ST-004` (claim), `C000-CT-001` (claim), `C000-CT-002` (claim), `C000-CT-003` (claim), `C000-CT-004` (claim), `C000-CT-005` (claim), `C000-CT-006` (claim), `C000-CT-024` (claim), `C000-CT-007` (claim), `C000-CT-008` (claim), `C000-CT-009` (claim), `C000-CT-010` (claim), `C000-CT-011` (claim), `C000-CT-012` (claim), `C000-CT-013` (claim), `C000-CT-014` (claim), `C000-CT-015` (claim), `C000-CT-016` (claim), `C000-CT-017` (claim), `C000-CT-019` (claim), `C000-CT-021` (claim), `C000-CT-023` (claim), `C000-CT-025` (claim), `C000-CT-026` (claim), `C000-IM-007` (claim), `C000-IM-008` (claim), `C000-TR-001` (claim), `C000-TR-002` (claim), `C000-TR-003` (claim), `C000-TR-005` (claim), `C000-TR-006` (claim), `C000-EV-001` (claim), `C000-EV-002` (claim), `C000-VF-001` (claim), `C000-VF-003` (claim), `C000-VF-004` (claim), `C000-SV-003` (claim), `C000-SV-006` (claim)

### C000-ST-003

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Status reuses the #39 six terms in separate decision/implementation/tests/verification dimensions, with `—` (data `none`) for no supported claim and no seventh status.

- Scope: CORE-000 accepted design §4.2 row C000-ST-003 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-ST-003 at the accepted design baseline: M:§1–2; §2.3

- Subjects: `COMP-PROJECT` (component)

### C000-CT-001

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: A project has a manifest; `contract-builder.json` is the only fixed file name, and inputs, sources, renderer and outputs are declared in it.

- Scope: CORE-000 accepted design §4.2 row C000-CT-001 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-001 at the accepted design baseline: M:P1; `spec/lib/manifest.ts`; `tests/manifest.test.ts`

- Subjects: `IF-MANIFEST` (interface)

- Evidence: `EV-MANIFEST-CODE` (code: spec/lib/manifest.ts), `EV-MANIFEST-TEST` (test: tests/manifest.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-002

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Declared inputs are validated by document schemas, then extracted by declared pointers and per-kind schemas; an undeclared kind fails.

- Scope: CORE-000 accepted design §4.2 row C000-CT-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-002 at the accepted design baseline: M:P2,R1; `spec/lib/schema.ts`, `spec/lib/ir.ts`; `tests/manifest.test.ts`, `tests/build.test.ts`

- Subjects: `IF-PROJECT-MODEL` (interface)

- Evidence: `EV-CODE-SPEC-LIB-SCHEMA-TS` (code: spec/lib/schema.ts), `EV-CODE-SPEC-LIB-IR-TS` (code: spec/lib/ir.ts), `EV-MANIFEST-TEST` (test: tests/manifest.test.ts), `EV-TEST-TESTS-BUILD-TEST-TS` (test: tests/build.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-003

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Entity identities are non-empty and unique across kinds; declared relation targets resolve; undeclared relation keys fail; an inverse is a reciprocal declaration (same edge set, reversed endpoints, no wildcard inverse) and an inverse declared `one` rejects a second source.

- Scope: CORE-000 accepted design §4.2 row C000-CT-003 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-003 at the accepted design baseline: M:I3,R3; C:§3.2, §5.2; `spec/lib/relations.ts`, `spec/lib/manifest.ts`; PR #52; `tests/ir.test.ts`, `tests/manifest.test.ts`

- Subjects: `IF-PROJECT-MODEL` (interface)

- Evidence: `EV-CODE-SPEC-LIB-RELATIONS-TS` (code: spec/lib/relations.ts), `EV-MANIFEST-CODE` (code: spec/lib/manifest.ts), `EV-TEST-TESTS-IR-TEST-TS` (test: tests/ir.test.ts), `EV-MANIFEST-TEST` (test: tests/manifest.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-004

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: The profile declares kinds, relations, schemas, provenance mappings and diagnostics; the core names no domain vocabulary.

- Scope: CORE-000 accepted design §4.2 row C000-CT-004 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-004 at the accepted design baseline: M:R1; `profiles/core001/profile.json`; `tests/genericity.test.ts`

- Subjects: `COMP-PROFILE` (component)

- Evidence: `EV-CODE-PROFILES-CORE001-PROFILE-JSON` (code: profiles/core001/profile.json), `EV-TEST-TESTS-GENERICITY-TEST-TS` (test: tests/genericity.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-005

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: A provenance binding carries `{source, ref, quote}`; the source must be declared; an incomplete binding fails; binding is structural and attaches a `not-checked` verification record, never a verified one.

- Scope: CORE-000 accepted design §4.2 row C000-CT-005 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-005 at the accepted design baseline: M:V1; C:§4; `spec/lib/provenance.ts`; `tests/ir.test.ts`, `tests/provenance.test.ts`

- Subjects: `IF-PROJECT-MODEL` (interface)

- Evidence: `EV-CODE-SPEC-LIB-PROVENANCE-TS` (code: spec/lib/provenance.ts), `EV-TEST-TESTS-IR-TEST-TS` (test: tests/ir.test.ts), `EV-PROVENANCE-TEST` (test: tests/provenance.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-006

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: The markdown adapter resolves section, table-column and ordered-item locators and reports `found`/`outside`/`unknown-locator`; the profile verifier maps the outcome into a verification record and the core stores it.

- Scope: CORE-000 accepted design §4.2 row C000-CT-006 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-006 at the accepted design baseline: M:V2,V5; `spec/lib/adapters/markdown.ts`, `spec/lib/provenance.ts`; `tests/build.test.ts`, `tests/provenance.test.ts`

- Subjects: `IF-ADAPTER` (interface)

- Evidence: `EV-CODE-SPEC-LIB-ADAPTERS-MARKDOWN-TS` (code: spec/lib/adapters/markdown.ts), `EV-CODE-SPEC-LIB-PROVENANCE-TS` (code: spec/lib/provenance.ts), `EV-TEST-TESTS-BUILD-TEST-TS` (test: tests/build.test.ts), `EV-PROVENANCE-TEST` (test: tests/provenance.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-024

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Core-enforced quote verification and the accepted `unknown-block` locator outcome are `proposed`, not implemented; `unsupported` exists in the `LocatorResult` type but is not produced by the M1 markdown adapter.

- Scope: CORE-000 accepted design §4.2 row C000-CT-024 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-024 at the accepted design baseline: M:V3; C:§5.2 step 7, §11; D25; `spec/lib/source.ts`

- Subjects: `SRC-PROVENANCE-001` (source_statement)

### C000-CT-007

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Diagnostics are deterministic and catalog-resolved; an unknown finding code fails the build.

- Scope: CORE-000 accepted design §4.2 row C000-CT-007 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-007 at the accepted design baseline: M:G1,G3; `spec/lib/hook.ts`, `spec/lib/diagnostics.ts`; `tests/hook.test.ts`, `tests/golden.test.ts`

- Subjects: `IF-DIAGNOSTIC` (interface)

- Evidence: `EV-CODE-SPEC-LIB-HOOK-TS` (code: spec/lib/hook.ts), `EV-CODE-SPEC-LIB-DIAGNOSTICS-TS` (code: spec/lib/diagnostics.ts), `EV-TEST-TESTS-HOOK-TEST-TS` (test: tests/hook.test.ts), `EV-TEST-TESTS-GOLDEN-TEST-TS` (test: tests/golden.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-008

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The contract diagnostic shape (severity + disposition + phase + blocking + data) is accepted but deferred to M2; the current record is the legacy shape.

- Scope: CORE-000 accepted design §4.2 row C000-CT-008 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-008 at the accepted design baseline: M:G2; C:§7, §18; D8/D9/D17

- Subjects: `IF-DIAGNOSTIC` (interface)

- Decisions: `DEC-D8-D9` (accepted)

### C000-CT-009

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: The renderer registry, preloaded templates and UTF-8/LF/one-trailing-newline normalization are implemented; an unknown renderer id fails.

- Scope: CORE-000 accepted design §4.2 row C000-CT-009 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-009 at the accepted design baseline: M:O1,O2; `spec/lib/render.ts`; `tests/renderer.test.ts`

- Subjects: `IF-RENDERER` (interface)

- Evidence: `EV-CODE-SPEC-LIB-RENDER-TS` (code: spec/lib/render.ts), `EV-TEST-TESTS-RENDERER-TEST-TS` (test: tests/renderer.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-010

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Build identity exposes `projectId`, `engineVersion`, `manifestVersion`, `inputDigest` and the extension list; a successful build passes it to renderers in `RenderOptions.identity`, and the CORE-000 and CORE-001 envelopes render it.

- Scope: CORE-000 accepted design §4.2 row C000-CT-010 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-010 at the accepted design baseline: M:B1; `spec/lib/identity.ts`, `spec/lib/render.ts`, `spec/lib/build.ts`; `tests/identity.test.ts`, `tests/envelope.test.ts`

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-CODE-SPEC-LIB-IDENTITY-TS` (code: spec/lib/identity.ts), `EV-CODE-SPEC-LIB-RENDER-TS` (code: spec/lib/render.ts), `EV-TEST-TESTS-IDENTITY-TEST-TS` (test: tests/identity.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-013

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Paths are root-contained by default; `external: true` is an explicit trust declaration; outputs never leave the output root.

- Scope: CORE-000 accepted design §4.2 row C000-CT-013 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-013 at the accepted design baseline: M:P3; C:§5.7; D31; `tests/manifest.test.ts`

- Subjects: `IF-MANIFEST` (interface)

- Evidence: `EV-MANIFEST-TEST` (test: tests/manifest.test.ts)

- Decisions: `DEC-D31` (accepted)

### C000-CT-014

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Extension closures, lockfile authority and the static import scan are implemented; an undeclared or unpinned import fails.

- Scope: CORE-000 accepted design §4.2 row C000-CT-014 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-014 at the accepted design baseline: M:B3; `spec/lib/identity.ts`; `tests/identity.test.ts`; BI

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-CODE-SPEC-LIB-IDENTITY-TS` (code: spec/lib/identity.ts), `EV-TEST-TESTS-IDENTITY-TEST-TS` (test: tests/identity.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-015

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Declarative conformance vectors are stored, validated and linked to their claims; execution is deferred.

- Scope: CORE-000 accepted design §4.2 row C000-CT-015 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-015 at the accepted design baseline: M:N1,N2; C:§12; `profiles/core001/checks/cases.ts`; `tests/checks.test.ts`

- Subjects: `IF-CONFORMANCE` (interface)

- Evidence: `EV-CODE-PROFILES-CORE001-CHECKS-CASES-TS` (code: profiles/core001/checks/cases.ts), `EV-TEST-TESTS-CHECKS-TEST-TS` (test: tests/checks.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-016

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The public API (`loadProject`/`validateProject`/`buildProject`/`renderModel`/`checkArtifacts`, `BuildStatus`, phases, exit code 2) is accepted but deferred to M2.

- Scope: CORE-000 accepted design §4.2 row C000-CT-016 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-016 at the accepted design baseline: M:K2; C:§9; D7/D18

- Subjects: `IF-BUILD-RESULT` (interface)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-017

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The contract CLI (`validate` / `build` / `check`, `--json` result object) is accepted but deferred.

- Scope: CORE-000 accepted design §4.2 row C000-CT-017 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-017 at the accepted design baseline: M:K3; C:§10

- Subjects: `IF-CLI` (interface)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-019

- Class: `requirement`
- Status: decision=`deferred`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Multiple renderers and multiple artifacts per build are deferred; the `Artifact[]` shape is forward-compatible.

- Scope: CORE-000 accepted design §4.2 row C000-CT-019 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-019 at the accepted design baseline: M:O3; C:§8, §11; PR #56

- Subjects: `IF-RENDERER` (interface)

- Decisions: `DEC-DEFER-019` (deferred)

### C000-CT-021

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Provenance hardening (paragraph locators and a source-byte digest) is accepted but not implemented.

- Scope: CORE-000 accepted design §4.2 row C000-CT-021 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-021 at the accepted design baseline: M:V4; `provenance-hardening-rfc.md`; #45

- Subjects: `SRC-PROVENANCE-001` (source_statement)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-023

- Class: `requirement`
- Status: decision=`deferred`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Full self-hosting is deferred; CORE-000 is a bounded step, not the M5 self-hosting program.

- Scope: CORE-000 accepted design §4.2 row C000-CT-023 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-023 at the accepted design baseline: M:X3; C:§14; D26

- Subjects: `COMP-CORE` (component)

- Decisions: `DEC-DEFER-023` (deferred)

### C000-CT-025

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: M1 supports exactly one manifest.render declaration; zero or multiple declarations are rejected with core.manifest.invalid before rendering or writing.

- Scope: Single render declaration at main dffdaa2.
- Verification method: bun test tests/manifest.test.ts

- Subjects: `IF-MANIFEST` (interface)

- Cites: `SRC-MANIFEST-001` (SRC-ENGINE-CONTRACT#3.1)

- Evidence: `EV-MANIFEST-CODE` (code: spec/lib/manifest.ts), `EV-MANIFEST-TEST` (test: tests/manifest.test.ts)

- Decisions: `DEC-PR-56` (accepted)

### C000-CT-026

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Provenance binding and verification are separate data: a not-checked record at binding, an optional profile verifyProvenance hook, core validation of status/method/outcome/source digest, and verified/failed/unavailable/stale statuses; verified is not independent verification.

- Scope: Provenance binding and verification at main dffdaa2.
- Verification method: bun test tests/provenance.test.ts

- Subjects: `COMP-CORE` (component)

- Cites: `SRC-PROVENANCE-001` (SRC-ENGINE-CONTRACT#4)

- Evidence: `EV-PROVENANCE-CODE` (code: spec/lib/provenance.ts; spec/lib/hook.ts), `EV-PROVENANCE-TEST` (test: tests/provenance.test.ts)

- Decisions: `DEC-PR-55` (accepted)

### C000-TR-003

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Executable profile loading requires explicit caller consent: allowExecutableProfile defaults false, the CLI flag is --allow-executable-profile, and absent consent fails closed with core.profile.consent-required before import.

- Scope: Consent policy merged by PR #50, verified at main dffdaa2.
- Verification method: bun test tests/consent.test.ts

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Evidence: `EV-CONSENT-CODE` (code: spec/lib/build.ts; spec/build.ts; spec/cli-renderers.ts), `EV-CONSENT-TEST` (test: tests/consent.test.ts)

- Decisions: `DEC-35` (accepted)

### C000-EV-002

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Independent verification requires a verifier distinct from the author, access to evidence, a recorded method/scope/result and a per-claim record; a merge, green CI or empty approval does not qualify.

- Scope: CORE-000 accepted design §4.2 row C000-EV-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-EV-002 at the accepted design baseline: M:§7; §8

- Subjects: `DEC-D13` (decision)

### C000-VF-001

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The engine cannot set `independently_verified`; only an external verification record can support it.

- Scope: CORE-000 accepted design §4.2 row C000-VF-001 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-VF-001 at the accepted design baseline: §8.1, §8.3

- Subjects: `DEC-D13` (decision)

### C000-VF-004

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: An independent-verification record carries `id`, `method`, `verifier`, `independence`, `independence_basis`, `performed`, `result`, `scope`, `revision`, `claim_results` and `limitations`; `commands`, `date` and `record_locator` are conditional per §8.3. It is separate from the core provenance `VerificationRecord`.

- Scope: CORE-000 accepted design §4.2 row C000-VF-004 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-VF-004 at the accepted design baseline: §5.3, §8.3; C:§4

- Subjects: `DEC-D13` (decision)

## Guarantees

_2 claims: 2 accepted, 0 proposed, 0 deferred, 0 none_

### C000-CT-011

- Class: `guarantee`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: `inputDigest` covers the canonical manifest (including its declared `locale`), declared inputs, sources, profile closure and adapter/renderer closures; the clock, environment, mtimes and absolute paths are excluded, and the CLI/runtime locale is not an input.

- Conditions: Given a project whose canonical manifest declares its inputs, sources and its `locale`, and whose profile, source-adapter and renderer closures are loaded from the declared paths, `inputDigest` covers the canonical manifest (including its declared `locale`), declared input bytes, source bytes, and those closures; the clock, environment, mtimes and absolute paths are excluded, and the CLI/runtime locale is not an input.

- Scope: CORE-000 accepted design §4.2 row C000-CT-011 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-011 at the accepted design baseline: M:B2; `spec/lib/identity.ts`; `tests/identity.test.ts`; BI

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-CODE-SPEC-LIB-IDENTITY-TS` (code: spec/lib/identity.ts), `EV-TEST-TESTS-IDENTITY-TEST-TS` (test: tests/identity.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-CT-012

- Class: `guarantee`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Byte determinism is conditional on the same engine version, `inputDigest` and extension identities, and on every trusted extension honouring its deterministic contract; it is not absolute reproducibility.

- Conditions: Same engine version, `inputDigest` and extension identities, and every trusted extension honouring its deterministic contract.

- Scope: CORE-000 accepted design §4.2 row C000-CT-012 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-012 at the accepted design baseline: C:§8.1, §8.3; BI; `tests/golden.test.ts`

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-TEST-TESTS-GOLDEN-TEST-TS` (test: tests/golden.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

## Assumptions

_2 claims: 2 accepted, 0 proposed, 0 deferred, 0 none_

### C000-TR-002

- Class: `assumption`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Determinism of profile hooks is an author obligation, not an engine guarantee; the engine cannot enforce purity.

- Scope: CORE-000 accepted design §4.2 row C000-TR-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-TR-002 at the accepted design baseline: C:§3.3; D28/D32

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Decisions: `DEC-D28` (accepted)

### C000-TR-006

- Class: `assumption`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Loading a profile is a trust decision equivalent to installing a dependency.

- Scope: CORE-000 accepted design §4.2 row C000-TR-006 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-TR-006 at the accepted design baseline: C:§3.3; D28; PR #50

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Decisions: `DEC-D28` (accepted)

## Constraints

_10 claims: 7 accepted, 3 proposed, 0 deferred, 0 none_

### C000-SC-001

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: CORE-000 is a working project identifier, not an adopted UIA standard and not a source of normative authority by itself.

- Scope: CORE-000 accepted design §4.2 row C000-SC-001 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SC-001 at the accepted design baseline: #47 naming note; §1.4

- Subjects: `COMP-PROJECT` (component)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-SC-004

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: A successful self-build or self-validation evidences only the checks actually run; it is not independent verification, certification, or proof of correctness, security, determinism or conformance.

- Scope: CORE-000 accepted design §4.2 row C000-SC-004 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SC-004 at the accepted design baseline: task C5; C:§1.1, §6.3; §7.2

- Subjects: `DEC-D13` (decision)

- Decisions: `DEC-TASK-C5` (accepted)

### C000-SC-005

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: This task does not implement CORE-000, change generic-core behaviour, or design the Portable Assurance Package, independent verifier, sandbox or package split.

- Scope: CORE-000 accepted design §4.2 row C000-SC-005 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SC-005 at the accepted design baseline: task C1/C14; #47 non-goals; PR scope

- Subjects: `DEC-TASK-C1-C14` (decision)

- Decisions: `DEC-TASK-C1-C14` (accepted)

### C000-ST-001

- Class: `constraint`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Only claims with class `requirement`/`constraint`/`guarantee` and decision `accepted` are normative for CORE-000; this design is `proposed`.

- Scope: CORE-000 accepted design §4.2 row C000-ST-001 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-ST-001 at the accepted design baseline: §1.4

- Subjects: `C000-SC-001` (claim), `C000-SC-002` (claim), `C000-SC-004` (claim), `C000-SC-005` (claim), `C000-ST-004` (claim), `C000-CT-001` (claim), `C000-CT-002` (claim), `C000-CT-003` (claim), `C000-CT-004` (claim), `C000-CT-005` (claim), `C000-CT-006` (claim), `C000-CT-007` (claim), `C000-CT-008` (claim), `C000-CT-009` (claim), `C000-CT-010` (claim), `C000-CT-011` (claim), `C000-CT-012` (claim), `C000-CT-013` (claim), `C000-CT-014` (claim), `C000-CT-015` (claim), `C000-CT-016` (claim), `C000-CT-017` (claim), `C000-CT-021` (claim), `C000-CT-025` (claim), `C000-CT-026` (claim), `C000-TR-003` (claim), `C000-TR-005` (claim), `C000-EV-001` (claim), `C000-SV-003` (claim)

### C000-ST-004

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: An implementation fact does not become a normative requirement merely because it exists in the repository.

- Scope: CORE-000 accepted design §4.2 row C000-ST-004 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-ST-004 at the accepted design baseline: task C7; #47 §2; §2.2

- Subjects: `C000-IM-001` (claim), `C000-IM-002` (claim), `C000-IM-003` (claim), `C000-IM-004` (claim), `C000-IM-005` (claim), `C000-IM-006` (claim)

- Decisions: `DEC-TASK-C7` (accepted)

### C000-TR-005

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: CORE-000 trust-boundary claims are reconciled with the merged #35/PR #50 outcome; a later consent-policy change requires a new reconciliation.

- Scope: CORE-000 accepted design §4.2 row C000-TR-005 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-TR-005 at the accepted design baseline: task C4; PR #50; §6.4

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Decisions: `DEC-TASK-C4` (accepted)

### C000-EV-001

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Test evidence is revision-bound; a passing test is evidence of that run, not of correctness or independence.

- Scope: CORE-000 accepted design §4.2 row C000-EV-001 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-EV-001 at the accepted design baseline: M:§1, §7; §2.4

- Subjects: `EV-TRUST-TEST` (evidence), `EV-CONSENT-TEST` (evidence), `EV-MANIFEST-TEST` (evidence), `EV-PROVENANCE-TEST` (evidence), `EV-TEST-TESTS-BUILD-TEST-TS` (evidence), `EV-TEST-TESTS-IR-TEST-TS` (evidence), `EV-TEST-TESTS-GENERICITY-TEST-TS` (evidence), `EV-TEST-TESTS-HOOK-TEST-TS` (evidence), `EV-TEST-TESTS-GOLDEN-TEST-TS` (evidence), `EV-TEST-TESTS-RENDERER-TEST-TS` (evidence), `EV-TEST-TESTS-IDENTITY-TEST-TS` (evidence), `EV-TEST-TESTS-CHECKS-TEST-TS` (evidence), `EV-TEST-TESTS-BUILD-TEST-TS-32-TESTS-BUILD-TEST-TS-62-TESTS-BUILD-TEST-TS-96-TESTS-BUILD-TEST-TS-110-TESTS-BUILD-TEST-TS-116-TESTS-BUILD-TEST-TS-134` (evidence), `EV-TEST-TESTS-IDENTITY-TEST-TS-555` (evidence)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-VF-003

- Class: `constraint`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Contract conformance, test-coverage sufficiency, cross-platform determinism, security/trust boundary, independence itself, semantic truth and self-description completeness require external authority.

- Scope: CORE-000 accepted design §4.2 row C000-VF-003 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-VF-003 at the accepted design baseline: §8.1

- Subjects: `DEC-D13` (decision)

### C000-SV-003

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: A successful build establishes only structural/relational self-consistency and CORE-000 profile-policy compliance.

- Scope: CORE-000 accepted design §4.2 row C000-SV-003 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SV-003 at the accepted design baseline: task C5; C:§1.1, §6.3; §7.2

- Subjects: `COMP-PROJECT` (component)

- Decisions: `DEC-TASK-C5` (accepted)

### C000-SV-006

- Class: `constraint`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The release build remains blocked while review diagnostics (missing independent verification, unresolved decisions) remain; the consent policy is settled, so it is no longer a blocker.

- Scope: CORE-000 accepted design §4.2 row C000-SV-006 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SV-006 at the accepted design baseline: §7.7, §7.10

- Subjects: `C000-TR-001` (claim), `C000-TR-003` (claim), `C000-IM-004` (claim), `C000-CT-008` (claim), `C000-CT-016` (claim), `C000-CT-017` (claim), `C000-CT-021` (claim), `C000-CT-024` (claim), `C000-IM-001` (claim), `C000-IM-002` (claim), `C000-IM-003` (claim), `C000-IM-005` (claim), `C000-IM-006` (claim), `C000-IM-009` (claim), `C000-TR-002` (claim), `C000-TR-004` (claim), `C000-EV-002` (claim), `C000-SV-001` (claim), `C000-SV-002` (claim), `C000-GAP-001` (claim), `C000-GAP-003` (claim), `C000-GAP-004` (claim), `C000-GAP-005` (claim), `C000-GAP-006` (claim), `C000-SC-001` (claim), `C000-SC-002` (claim), `C000-SC-003` (claim), `C000-SC-004` (claim), `C000-SC-005` (claim), `C000-ST-001` (claim), `C000-ST-002` (claim), `C000-ST-003` (claim), `C000-ST-004` (claim), `C000-CT-018` (claim), `C000-CT-019` (claim), `C000-CT-020` (claim), `C000-CT-022` (claim), `C000-CT-023` (claim), `C000-IM-007` (claim), `C000-IM-008` (claim), `C000-TR-005` (claim), `C000-TR-006` (claim), `C000-EV-001` (claim), `C000-EV-003` (claim), `C000-VF-001` (claim), `C000-VF-002` (claim), `C000-VF-003` (claim), `C000-VF-004` (claim), `C000-SV-003` (claim), `C000-SV-004` (claim), `C000-SV-005` (claim), `C000-SV-006` (claim), `C000-GAP-002` (claim), `C000-GAP-007` (claim), `C000-LM-001` (claim), `C000-LM-002` (claim), `C000-LM-003` (claim), `C000-LM-004` (claim), `C000-LM-005` (claim), `C000-LM-006` (claim), `C000-LM-007` (claim), `C000-LM-008` (claim)

## Implementation facts

_6 claims: 0 accepted, 0 proposed, 0 deferred, 6 none_

### C000-IM-001

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The current build entry point is `runBuild(BuildOptions)`; `package.json` is private and publishes no package surface.

- Scope: CORE-000 accepted design §4.2 row C000-IM-001 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-IM-001 at the accepted design baseline: `spec/lib/build.ts:56`; `package.json`; tests call `runBuild`

- Subjects: `IF-BUILD-RESULT` (interface)

- Evidence: `EV-TRUST-CODE` (code: spec/lib/build.ts), `EV-CODE-PACKAGE-JSON` (code: package.json), `EV-TEST-TESTS-BUILD-TEST-TS` (test: tests/build.test.ts)

### C000-IM-002

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Current diagnostics are `{severity: error / warning / review, code, file, pointer, message}` with no disposition, phase, data or object location.

- Scope: CORE-000 accepted design §4.2 row C000-IM-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-IM-002 at the accepted design baseline: M:G1; `spec/lib/diagnostics.ts`; `tests/golden.test.ts`

- Subjects: `IF-DIAGNOSTIC` (interface)

- Evidence: `EV-CODE-SPEC-LIB-DIAGNOSTICS-TS` (code: spec/lib/diagnostics.ts), `EV-TEST-TESTS-GOLDEN-TEST-TS` (test: tests/golden.test.ts)

### C000-IM-003

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Current exit codes are 0 and 1; usage errors exit 1; exit code 2 is not implemented.

- Scope: CORE-000 accepted design §4.2 row C000-IM-003 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-IM-003 at the accepted design baseline: `spec/lib/build.ts` result mapping; `spec/build.ts`; M:G2

- Subjects: `IF-BUILD-RESULT` (interface)

- Evidence: `EV-TRUST-CODE` (code: spec/lib/build.ts), `EV-CODE-SPEC-BUILD-TS` (code: spec/build.ts), `EV-TEST-TESTS-BUILD-TEST-TS-32-TESTS-BUILD-TEST-TS-62-TESTS-BUILD-TEST-TS-96-TESTS-BUILD-TEST-TS-110-TESTS-BUILD-TEST-TS-116-TESTS-BUILD-TEST-TS-134` (test: tests/build.test.ts:32; tests/build.test.ts:62; tests/build.test.ts:96; tests/build.test.ts:110; tests/build.test.ts:116; tests/build.test.ts:134)

### C000-IM-004

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: profile.view and profile.validator are dynamically imported in-process only after explicit consent; the engine ships no renderer, and the CLI imports the consumer-named renderer module only after the same consent and closure gates.

- Scope: Executable profile import behaviour at main dffdaa2.
- Verification method: bun test tests/consent.test.ts tests/example-profile.test.ts

- Subjects: `IF-PROFILE-VALIDATOR` (interface)

- Evidence: `EV-CONSENT-CODE` (code: spec/lib/build.ts; spec/build.ts; spec/cli-renderers.ts), `EV-CONSENT-TEST` (test: tests/consent.test.ts)

### C000-IM-005

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Build identity is computed after load/validation, is `null` when the build stops early, and is passed to renderers on a successful build.

- Scope: CORE-000 accepted design §4.2 row C000-IM-005 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-IM-005 at the accepted design baseline: `spec/lib/build.ts`, `spec/lib/render.ts`; `tests/identity.test.ts`, `tests/envelope.test.ts`; BI

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-TRUST-CODE` (code: spec/lib/build.ts), `EV-CODE-SPEC-LIB-RENDER-TS` (code: spec/lib/render.ts), `EV-TEST-TESTS-IDENTITY-TEST-TS` (test: tests/identity.test.ts)

### C000-IM-006

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The CLI dynamically imports the consumer-named renderer module only with explicit consent, only when it resolves inside the selected profile directory and is declared in `profile.files`, and only after the profile closure validates — all before the import; the import evaluates the module, and its reported id is compared with the manifest's declared `render[].renderer` after the import and before registration, so a mismatch prevents registration but not execution. Without the flag no renderer is registered (`core.registry.missing`). The CLI selects no profile.

- Scope: CORE-000 accepted design §4.2 row C000-IM-006 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-IM-006 at the accepted design baseline: `spec/cli-renderers.ts`; `tests/consent.test.ts`

- Subjects: `IF-CLI` (interface)

- Evidence: `EV-CODE-SPEC-CLI-RENDERERS-TS` (code: spec/cli-renderers.ts), `EV-CONSENT-TEST` (test: tests/consent.test.ts)

## Proposals

_15 claims: 0 accepted, 15 proposed, 0 deferred, 0 none_

### C000-SC-003

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: CORE-000 is self-described through the existing generic pipeline; the experiment requires no generic-core change.

- Scope: CORE-000 accepted design §4.2 row C000-SC-003 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SC-003 at the accepted design baseline: §5, §7; PR #46 (independent example profile); P:§13

- Subjects: `COMP-PROJECT` (component)

### C000-CT-018

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Multi-source projects are proposed, not implemented or tested; M1 exercises one source.

- Scope: CORE-000 accepted design §4.2 row C000-CT-018 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-018 at the accepted design baseline: M:A2; C:§5.3; D21; #5

- Subjects: `IF-PROJECT-MODEL` (interface)

### C000-CT-020

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Typed `ReviewState` and per-dimension review are proposed/deferred.

- Scope: CORE-000 accepted design §4.2 row C000-CT-020 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-020 at the accepted design baseline: M:R5; C:§4; D24

- Subjects: `COMP-PROJECT` (component)

### C000-CT-022

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Packaging, publication and a declared runtime matrix are proposed/unresolved; nothing is published.

- Scope: CORE-000 accepted design §4.2 row C000-CT-022 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-CT-022 at the accepted design baseline: M:X1,X2,X4; C:§13, §17; D14/D19/D20/D29

- Subjects: `COMP-PROJECT` (component)

### C000-VF-002

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: A concrete manual independent-review protocol exists in §8.2 but has not been performed.

- Scope: CORE-000 accepted design §4.2 row C000-VF-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-VF-002 at the accepted design baseline: §8.2

- Subjects: `DEC-D13` (decision)

### C000-SV-001

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The self-validation experiment uses the existing generic pipeline and a consumer harness; it requires no generic-core change.

- Scope: CORE-000 accepted design §4.2 row C000-SV-001 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SV-001 at the accepted design baseline: §7.3–7.5; PR #46

- Subjects: `COMP-PROJECT` (component)

### C000-SV-002

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The experiment checks schemas, identity, relations, provenance, CORE-000 policy, artifact normalization and build identity, and renders one Markdown artifact.

- Scope: CORE-000 accepted design §4.2 row C000-SV-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SV-002 at the accepted design baseline: §7.5–7.6

- Subjects: `COMP-PROJECT` (component)

### C000-SV-004

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The negative cases cover at least inconsistent component/interface, unresolved dependency/relation, implemented-without-evidence and unsupported/unverified guarantee, plus identity, relation, provenance and trust cases.

- Scope: CORE-000 accepted design §4.2 row C000-SV-004 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SV-004 at the accepted design baseline: §7.8

- Subjects: `COMP-PROJECT` (component)

### C000-GAP-001

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The generic core has no raw-file input/adapter for code/test evidence; evidence files cannot participate in `inputDigest`, so claim/evidence staleness is invisible to the build.

- Scope: CORE-000 accepted design §4.2 row C000-GAP-001 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-GAP-001 at the accepted design baseline: §9 G1

- Subjects: `EV-TRUST-CODE` (evidence), `EV-TRUST-TEST` (evidence), `EV-CONSENT-CODE` (evidence), `EV-CONSENT-TEST` (evidence), `EV-MANIFEST-CODE` (evidence), `EV-MANIFEST-TEST` (evidence), `EV-PROVENANCE-CODE` (evidence), `EV-PROVENANCE-TEST` (evidence), `EV-CODE-SPEC-LIB-SCHEMA-TS` (evidence), `EV-CODE-SPEC-LIB-IR-TS` (evidence), `EV-TEST-TESTS-BUILD-TEST-TS` (evidence), `EV-CODE-SPEC-LIB-RELATIONS-TS` (evidence), `EV-TEST-TESTS-IR-TEST-TS` (evidence), `EV-CODE-PROFILES-CORE001-PROFILE-JSON` (evidence), `EV-TEST-TESTS-GENERICITY-TEST-TS` (evidence), `EV-CODE-SPEC-LIB-PROVENANCE-TS` (evidence), `EV-CODE-SPEC-LIB-ADAPTERS-MARKDOWN-TS` (evidence), `EV-CODE-SPEC-LIB-HOOK-TS` (evidence), `EV-CODE-SPEC-LIB-DIAGNOSTICS-TS` (evidence), `EV-TEST-TESTS-HOOK-TEST-TS` (evidence), `EV-TEST-TESTS-GOLDEN-TEST-TS` (evidence), `EV-CODE-SPEC-LIB-RENDER-TS` (evidence), `EV-TEST-TESTS-RENDERER-TEST-TS` (evidence), `EV-CODE-SPEC-LIB-IDENTITY-TS` (evidence), `EV-TEST-TESTS-IDENTITY-TEST-TS` (evidence), `EV-CODE-PROFILES-CORE001-CHECKS-CASES-TS` (evidence), `EV-TEST-TESTS-CHECKS-TEST-TS` (evidence), `EV-CODE-PACKAGE-JSON` (evidence), `EV-CODE-SPEC-BUILD-TS` (evidence), `EV-TEST-TESTS-BUILD-TEST-TS-32-TESTS-BUILD-TEST-TS-62-TESTS-BUILD-TEST-TS-96-TESTS-BUILD-TEST-TS-110-TESTS-BUILD-TEST-TS-116-TESTS-BUILD-TEST-TS-134` (evidence), `EV-CODE-SPEC-CLI-RENDERERS-TS` (evidence), `EV-CODE-SPEC-LIB-IDENTITY-TS-604-SPEC-LIB-IDENTITY-TS-753` (evidence), `EV-TEST-TESTS-IDENTITY-TEST-TS-555` (evidence)

### C000-GAP-002

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Cross-entity declarative rule primitives are not implemented; CORE-000 policy needs a trusted profile hook.

- Scope: CORE-000 accepted design §4.2 row C000-GAP-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-GAP-002 at the accepted design baseline: §9 G2; M:R4

- Subjects: `COMP-PROFILE` (component)

### C000-GAP-003

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Binding/verification separation is implemented (#37), but locators are coarse, core quote verification is proposed and the accepted V4 hardening is unimplemented.

- Scope: CORE-000 accepted design §4.2 row C000-GAP-003 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-GAP-003 at the accepted design baseline: §9 G3; M:V3,V4; PR #55

- Subjects: `SRC-PROVENANCE-001` (source_statement)

### C000-GAP-004

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The public API still needs a consumer harness to supply a renderer; the CLI wires one consumer-named renderer module per run, gates it on consent, containment, `profile.files` and closure, and selects no profile; a generic profile-selection CLI does not exist.

- Scope: CORE-000 accepted design §4.2 row C000-GAP-004 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-GAP-004 at the accepted design baseline: §9 G4; M:K2,K3; C000-IM-006

- Subjects: `IF-CLI` (interface)

### C000-GAP-005

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Multi-target rendering/multi-artifact is deferred and #38 now rejects zero or multiple `manifest.render` declarations; a machine-readable JSON claim export is not available in M1.

- Scope: CORE-000 accepted design §4.2 row C000-GAP-005 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-GAP-005 at the accepted design baseline: §9 G5; M:O3; PR #56

- Subjects: `IF-RENDERER` (interface)

### C000-GAP-006

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Multi-source is untested; CORE-000 uses one source and treats other documents as evidence references.

- Scope: CORE-000 accepted design §4.2 row C000-GAP-006 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-GAP-006 at the accepted design baseline: §9 G6; M:A2

- Subjects: `IF-PROJECT-MODEL` (interface)

### C000-GAP-007

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Review dimensions and a typed verification record are not core features; CORE-000 encodes them as data and profile checks.

- Scope: CORE-000 accepted design §4.2 row C000-GAP-007 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-GAP-007 at the accepted design baseline: §9 G7; M:R5

- Subjects: `DEC-D24` (decision)

## Limitations

_12 claims: 3 accepted, 1 proposed, 0 deferred, 8 none_

### C000-IM-009

- Class: `limitation`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The extension closure and static import scan are integrity/accounting guards, not a security boundary.

- Scope: CORE-000 accepted design §4.2 row C000-IM-009 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-IM-009 at the accepted design baseline: M:B3; BI "Static import scan"

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-CODE-SPEC-LIB-IDENTITY-TS-604-SPEC-LIB-IDENTITY-TS-753` (code: spec/lib/identity.ts:604; spec/lib/identity.ts:753), `EV-TEST-TESTS-IDENTITY-TEST-TS-555` (test: tests/identity.test.ts:555)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-TR-004

- Class: `limitation`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Consent permits trusted executable profile code to run in-process with builder privileges; it is not a sandbox, isolation or capability restriction.

- Scope: CORE-000 accepted design §4.2 row C000-TR-004 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-TR-004 at the accepted design baseline: C:§3.3; PR #50; §6.2

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Decisions: `DEC-35` (accepted)

### C000-EV-003

- Class: `limitation`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: No independent verification of the engine or CORE-000 exists at the baseline; every independent-verification dimension is `—`.

- Scope: CORE-000 accepted design §4.2 row C000-EV-003 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-EV-003 at the accepted design baseline: M:§7; §8.5

- Subjects: `DEC-D13` (decision)

- Decisions: `DEC-DESIGN-51` (accepted)

### C000-SV-005

- Class: `limitation`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The experiment cannot establish that the code matches the claims; that requires external evidence and independent review.

- Scope: CORE-000 accepted design §4.2 row C000-SV-005 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-SV-005 at the accepted design baseline: §7.2, §8

- Subjects: `COMP-PROJECT` (component)

### C000-LM-001

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: This design is not implemented or executed; no CORE-000 artifact, diagnostics or digest exists yet.

- Scope: CORE-000 accepted design §4.2 row C000-LM-001 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-LM-001 at the accepted design baseline: §11

- Subjects: `COMP-PROJECT` (component)

### C000-LM-002

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Statuses derive from the #39 snapshot at `f1ddcf7` plus its #35/#36/#37 snapshot updates; #38 is cited from the contract and tests; current main is `260de89`, and any later change requires re-audit.

- Scope: CORE-000 accepted design §4.2 row C000-LM-002 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-LM-002 at the accepted design baseline: §1.5, §11

- Subjects: `COMP-PROJECT` (component)

### C000-LM-003

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Claims are author-asserted data; profile checks enforce evidence presence and consistency, not truth.

- Scope: CORE-000 accepted design §4.2 row C000-LM-003 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-LM-003 at the accepted design baseline: §2.7, §11

- Subjects: `COMP-PROJECT` (component)

### C000-LM-004

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: No independent verification exists; a `release` CORE-000 build cannot claim it.

- Scope: CORE-000 accepted design §4.2 row C000-LM-004 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-LM-004 at the accepted design baseline: §8.5

- Subjects: `DEC-D13` (decision)

### C000-LM-005

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Consent is implemented, but no sandbox, isolation or capability restriction exists; process/WASM isolation remains deferred (D32).

- Scope: CORE-000 accepted design §4.2 row C000-LM-005 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-LM-005 at the accepted design baseline: §6, §11

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

### C000-LM-008

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: A `verified` provenance record is a method-specific check of a binding, not independent verification or certification.

- Scope: CORE-000 accepted design §4.2 row C000-LM-008 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-LM-008 at the accepted design baseline: C:§4, §6.3; §8

- Subjects: `SRC-PROVENANCE-001` (source_statement)

### C000-LM-006

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The model, schemas and hook rules are proposals and may change during implementation.

- Scope: CORE-000 accepted design §4.2 row C000-LM-006 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-LM-006 at the accepted design baseline: §5, §10

- Subjects: `COMP-PROJECT` (component)

### C000-LM-007

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: No claim is made about cross-platform determinism, security, hermeticity, legal effect or external conformance.

- Scope: CORE-000 accepted design §4.2 row C000-LM-007 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-LM-007 at the accepted design baseline: C:§8.3; §11

- Subjects: `COMP-PROJECT` (component)

## Trust boundary claims

_3 claims: 3 accepted, 0 proposed, 0 deferred, 0 none_

### C000-IM-007

- Class: `trust_boundary`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The profile loader requires explicit consent; absent consent fails closed before import; after consent, view/validator run in-process with builder privileges and no sandbox or isolation.

- Scope: CORE-000 accepted design §4.2 row C000-IM-007 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-IM-007 at the accepted design baseline: M:H5; `spec/lib/build.ts`; `tests/consent.test.ts`; §6.1

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Evidence: `EV-TRUST-CODE` (code: spec/lib/build.ts), `EV-CONSENT-TEST` (test: tests/consent.test.ts)

- Decisions: `DEC-35` (accepted)

### C000-IM-008

- Class: `trust_boundary`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: `external: true` is a path trust declaration, not an executable-profile opt-in and not isolation.

- Scope: CORE-000 accepted design §4.2 row C000-IM-008 at the accepted design baseline
- Verification method: Accepted design §4.2 evidence/method column for C000-IM-008 at the accepted design baseline: C:§5.7; D31; `tests/manifest.test.ts`

- Subjects: `TB-CONSUMER-EXTENSION` (trust_boundary)

- Evidence: `EV-MANIFEST-CODE` (code: spec/lib/manifest.ts), `EV-MANIFEST-TEST` (test: tests/manifest.test.ts)

- Decisions: `DEC-D31` (accepted)

### C000-TR-001

- Class: `trust_boundary`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: After explicit consent, executable profile code runs in-process with the builder process's privileges; the engine does not sandbox it.

- Scope: Executable profile loading at main dffdaa2.
- Verification method: Code inspection of spec/lib/build.ts and the accepted contract; a security review is external.

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Cites: `SRC-TR-001` (SRC-ENGINE-CONTRACT#3.3)

- Evidence: `EV-TRUST-CODE` (code: spec/lib/build.ts), `EV-TRUST-TEST` (test: tests/consent.test.ts)

- Decisions: `DEC-35` (accepted)

## Source statements and provenance verification

### SRC-TR-001

- Locator: `SRC-ENGINE-CONTRACT#3.3`
- Verification status: `verified`
- Outcome: `found`
- Method: `markdown:locator`
- Verifier: `core000/verifyProvenance`
- Source version: Contract Builder Engine — Public Contract (Rev 0.5)
- Source digest: `sha256:b68a27f0221b29eb62bfc96ed1c02617f7e80ff70f3aff5b6add28450139c06a`
- Quote: The hook is **trusted executable code**. The engine loads it with a dynamic `import()` and runs it in the same process, with the same privileges. **The engine does not sandbox it.**

### SRC-MANIFEST-001

- Locator: `SRC-ENGINE-CONTRACT#3.1`
- Verification status: `verified`
- Outcome: `found`
- Method: `markdown:locator`
- Verifier: `core000/verifyProvenance`
- Source version: Contract Builder Engine — Public Contract (Rev 0.5)
- Source digest: `sha256:b68a27f0221b29eb62bfc96ed1c02617f7e80ff70f3aff5b6add28450139c06a`
- Quote: `render` keeps its array shape for forward compatibility, but **M1 supports exactly one render declaration**. Zero declarations and more than one are rejected with `core.manifest.invalid` during manifest validation, before any input is rendered or any artifact is written; multi-target rendering is deferred.

### SRC-PROVENANCE-001

- Locator: `SRC-ENGINE-CONTRACT#4`
- Verification status: `verified`
- Outcome: `found`
- Method: `markdown:locator`
- Verifier: `core000/verifyProvenance`
- Source version: Contract Builder Engine — Public Contract (Rev 0.5)
- Source digest: `sha256:b68a27f0221b29eb62bfc96ed1c02617f7e80ff70f3aff5b6add28450139c06a`
- Quote: A `ProvenanceBinding` says where evidence is claimed to come from. It does not say that the claim was checked. The core attaches a `not-checked` verification record when it binds, so an unverified binding is explicit rather than implicit.

## Evidence

- `EV-TRUST-CODE` (code) — spec/lib/build.ts @ dffdaa2: loadProfileModule imports view/validator after the consent gate.

- `EV-TRUST-TEST` (test) — tests/consent.test.ts @ dffdaa2: Consent tests cover API/CLI rejection and success and renderer module gating.

- `EV-CONSENT-CODE` (code) — spec/lib/build.ts; spec/build.ts; spec/cli-renderers.ts @ dffdaa2: allowExecutableProfile gate, CLI flag and consumer-supplied renderer preflight.

- `EV-CONSENT-TEST` (test) — tests/consent.test.ts @ dffdaa2: API/CLI rejection, success, renderer module gating, closure preflight and lockfile cases.

- `EV-MANIFEST-CODE` (code) — spec/lib/manifest.ts @ dffdaa2: The manifest loader rejects zero or multiple render declarations with core.manifest.invalid.

- `EV-MANIFEST-TEST` (test) — tests/manifest.test.ts @ dffdaa2: Manifest tests cover the single render declaration contract.

- `EV-PROVENANCE-CODE` (code) — spec/lib/provenance.ts; spec/lib/hook.ts @ dffdaa2: Binding attaches a not-checked record; verifyProvenance claims are validated and stored separately.

- `EV-PROVENANCE-TEST` (test) — tests/provenance.test.ts @ dffdaa2: Provenance tests cover binding/verification separation, status handling and digests.

- `EV-CODE-SPEC-LIB-SCHEMA-TS` (code) — spec/lib/schema.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-LIB-IR-TS` (code) — spec/lib/ir.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-BUILD-TEST-TS` (test) — tests/build.test.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-LIB-RELATIONS-TS` (code) — spec/lib/relations.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-IR-TEST-TS` (test) — tests/ir.test.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-PROFILES-CORE001-PROFILE-JSON` (code) — profiles/core001/profile.json @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-GENERICITY-TEST-TS` (test) — tests/genericity.test.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-LIB-PROVENANCE-TS` (code) — spec/lib/provenance.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-LIB-ADAPTERS-MARKDOWN-TS` (code) — spec/lib/adapters/markdown.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-LIB-HOOK-TS` (code) — spec/lib/hook.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-LIB-DIAGNOSTICS-TS` (code) — spec/lib/diagnostics.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-HOOK-TEST-TS` (test) — tests/hook.test.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-GOLDEN-TEST-TS` (test) — tests/golden.test.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-LIB-RENDER-TS` (code) — spec/lib/render.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-RENDERER-TEST-TS` (test) — tests/renderer.test.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-LIB-IDENTITY-TS` (code) — spec/lib/identity.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-IDENTITY-TEST-TS` (test) — tests/identity.test.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-PROFILES-CORE001-CHECKS-CASES-TS` (code) — profiles/core001/checks/cases.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-CHECKS-TEST-TS` (test) — tests/checks.test.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-PACKAGE-JSON` (code) — package.json @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-BUILD-TS` (code) — spec/build.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-BUILD-TEST-TS-32-TESTS-BUILD-TEST-TS-62-TESTS-BUILD-TEST-TS-96-TESTS-BUILD-TEST-TS-110-TESTS-BUILD-TEST-TS-116-TESTS-BUILD-TEST-TS-134` (test) — tests/build.test.ts:32; tests/build.test.ts:62; tests/build.test.ts:96; tests/build.test.ts:110; tests/build.test.ts:116; tests/build.test.ts:134 @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-CLI-RENDERERS-TS` (code) — spec/cli-renderers.ts @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-CODE-SPEC-LIB-IDENTITY-TS-604-SPEC-LIB-IDENTITY-TS-753` (code) — spec/lib/identity.ts:604; spec/lib/identity.ts:753 @ 2497ed9: Accepted S2.2 register evidence locator.

- `EV-TEST-TESTS-IDENTITY-TEST-TS-555` (test) — tests/identity.test.ts:555 @ 2497ed9: Accepted S2.2 register evidence locator.

## Decisions

### DEC-35 — Explicit consent for executable profiles

- Status: `accepted`
- Owner: maintainer
- Source: Issue #35; PR #50
- Consequence: Consent is per invocation, fail-closed, not isolation and not part of inputDigest.

### DEC-PR-55 — Separate provenance binding from verification

- Status: `accepted`
- Owner: maintainer
- Source: Issue #37; PR #55
- Consequence: Binding is structural; verification is a separate recorded result with verified/failed/unavailable/stale and a VerificationRecord.

### DEC-PR-56 — Exactly one render target in M1

- Status: `accepted`
- Owner: maintainer
- Source: Issue #38; PR #56
- Consequence: Zero or multiple manifest.render declarations are rejected before rendering or writing.

### DEC-D13 — Independent-verification record representation (D13)

- Status: `accepted`
- Owner: maintainer
- Source: Canonical decision record D13 (accepted, 2026-11-02)
- Consequence: A distinct independent_verification kind/schema represents independent verification; it is not the core provenance VerificationRecord.

### DEC-D24 — Review dimensions and typed review record (D24, proposed)

- Status: `proposed`
- Owner: maintainer
- Source: Engine public contract D24 (proposed), allowed by the S2.2-B amendment
- Consequence: Review dimensions and a typed review record are proposed, not implemented; the claim is a proposal awaiting a decision outcome.

### DEC-D8-D9 — Diagnostic axes and blocking policy (D8/D9)

- Status: `accepted`
- Owner: maintainer
- Source: Engine public contract D8/D9 (accepted legend)
- Consequence: Diagnostic severity, disposition and blocking are declared; the profile owns the policy.

### DEC-D28 — Profile hook trust and identity (D28)

- Status: `accepted`
- Owner: maintainer
- Source: Engine public contract D28 (accepted legend)
- Consequence: Profile hooks run as trusted in-process code; the profile identity is digest-pinned.

### DEC-D31 — Path and trust boundary (D31)

- Status: `accepted`
- Owner: maintainer
- Source: Engine public contract D31 (accepted legend)
- Consequence: Paths are root-contained by default; external: true is an explicit trust declaration.

### DEC-TASK-C1-C14 — Task constraints C1/C14 — scope and non-goals

- Status: `accepted`
- Owner: maintainer
- Source: Accepted task constraints C1-C15 (design §5.3.1); C1/C14
- Consequence: The task does not implement CORE-000, change generic-core behaviour, or design the Portable Assurance Package.

### DEC-TASK-C4 — Task constraint C4 — trust-boundary reconciliation

- Status: `accepted`
- Owner: maintainer
- Source: Accepted task constraints C1-C15 (design §5.3.1); C4
- Consequence: CORE-000 trust-boundary claims are reconciled with the merged consent outcome; later policy changes need a new reconciliation.

### DEC-TASK-C5 — Task constraint C5 — self-validation scope

- Status: `accepted`
- Owner: maintainer
- Source: Accepted task constraints C1-C15 (design §5.3.1); C5
- Consequence: A successful self-build evidences only the checks actually run; it is not independent verification or certification.

### DEC-TASK-C7 — Task constraint C7 — implementation facts

- Status: `accepted`
- Owner: maintainer
- Source: Accepted task constraints C1-C15 (design §5.3.1); C7
- Consequence: An implementation fact does not become a normative requirement merely because it exists in the repository.

### DEC-DESIGN-51 — Accepted design register basis (PR #51)

- Status: `accepted`
- Owner: maintainer
- Source: Accepted design register §4.2; PR #51 (per-claim owner-approved)
- Consequence: The named claims are grounded in the accepted design register rows and their accepted statuses.

### DEC-DEFER-019 — Multiple renderers and artifacts deferred (CT-019)

- Status: `deferred`
- Owner: maintainer
- Source: Accepted design §4.2 row C000-CT-019; PR #56
- Consequence: Multiple renderers and artifacts per build are deferred; the Artifact[] shape is forward-compatible.

### DEC-DEFER-023 — Full self-hosting deferred (CT-023)

- Status: `deferred`
- Owner: maintainer
- Source: Accepted design §4.2 row C000-CT-023; PR #51
- Consequence: Full self-hosting is deferred; CORE-000 is a bounded step, not the M5 self-hosting program.

## Independent verification

No independent verification record exists. The engine cannot establish independent verification.

## Build diagnostics

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-008" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-016" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-017" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-018" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-019" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-020" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-021" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-022" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-023" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-CT-024" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-EV-001" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-EV-002" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-EV-003" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-GAP-001" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-GAP-002" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-GAP-003" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-GAP-004" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-GAP-005" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-GAP-006" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-GAP-007" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-IM-001" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-IM-002" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-IM-003" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-IM-004" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-IM-005" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-IM-006" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-IM-007" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-IM-008" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-IM-009" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-LM-001" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-LM-002" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-LM-003" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-LM-004" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-LM-005" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-LM-006" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-LM-007" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-LM-008" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SC-001" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SC-002" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SC-003" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SC-004" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SC-005" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-ST-001" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-ST-002" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-ST-003" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-ST-004" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SV-001" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SV-002" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SV-003" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SV-004" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SV-005" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-SV-006" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-TR-001" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-TR-002" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-TR-003" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-TR-004" (authority "external") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-TR-005" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-TR-006" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-VF-001" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-VF-002" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-VF-003" (authority "human") has no independent verification record.

- `REVIEW_REQUIRED` `core000.independent-verification.missing` claims.yml: Claim "C000-VF-004" (authority "human") has no independent verification record.

- `WARNING` `core000.surface.claim-missing` structure.yml: Public surface "COMP-ADAPTER" has no covering claim.

- `WARNING` `core000.surface.claim-missing` structure.yml: Public surface "COMP-CLI" has no covering claim.

- `WARNING` `core000.surface.claim-missing` structure.yml: Public surface "COMP-RENDERER" has no covering claim.

- `WARNING` `core000.surface.claim-missing` structure.yml: Public surface "COMP-REVIEWER" has no covering claim.

- `WARNING` `core000.surface.claim-missing` structure.yml: Public surface "IF-CONSENT-CLI-FLAG" has no covering claim.

- `WARNING` `core000.surface.claim-missing` structure.yml: Public surface "IF-CONSENT-OPTION" has no covering claim.
