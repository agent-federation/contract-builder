# Contract Builder Engine public self-contract

**Mode:** draft
**Counts:** components=7 · interfaces=12 · phases=9 · transitions=0 · extension points=4 · dependencies=7 · diagnostics=25 · claims=78 · source statements=3 · evidence=34 · decisions=15 · conformance cases=0
**Claim status:** accepted=37 · proposed=25 · deferred=2 · none=14 · implemented=27 · tested=27 · independently verified=0

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

## Claims

### requirement

#### C000-TR-003

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

#### C000-CT-025

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

#### C000-CT-026

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

#### C000-SC-002

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: CORE-000 describes the engine's public contract — components, interfaces, lifecycle, guarantees, constraints, dependencies, extensions, diagnostics, identity, trust, decisions, provenance and evidence — not private module structure.
- Scope: CORE-000 accepted design §4.2 row C000-SC-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SC-002 at the accepted design baseline: #47 §1; C:§1–2; §3.1

- Subjects: `COMP-CORE` (component)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-ST-002

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Important claims carry stable IDs, one class, separate status dimensions and a verification/evidence method; low-level details may be covered by evidence instead.
- Scope: CORE-000 accepted design §4.2 row C000-ST-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-ST-002 at the accepted design baseline: §4.1, §4.4

- Subjects: `C000-SC-001` (claim), `C000-SC-002` (claim), `C000-SC-004` (claim), `C000-SC-005` (claim), `C000-ST-001` (claim), `C000-ST-002` (claim), `C000-ST-003` (claim), `C000-ST-004` (claim), `C000-CT-001` (claim), `C000-CT-002` (claim), `C000-CT-003` (claim), `C000-CT-004` (claim), `C000-CT-005` (claim), `C000-CT-006` (claim), `C000-CT-007` (claim), `C000-CT-008` (claim), `C000-CT-009` (claim), `C000-CT-010` (claim), `C000-CT-011` (claim), `C000-CT-012` (claim), `C000-CT-013` (claim), `C000-CT-014` (claim), `C000-CT-015` (claim), `C000-CT-016` (claim), `C000-CT-017` (claim), `C000-CT-019` (claim), `C000-CT-021` (claim), `C000-CT-023` (claim), `C000-CT-024` (claim), `C000-CT-025` (claim), `C000-CT-026` (claim), `C000-IM-007` (claim), `C000-IM-008` (claim), `C000-TR-001` (claim), `C000-TR-002` (claim), `C000-TR-003` (claim), `C000-TR-005` (claim), `C000-TR-006` (claim), `C000-EV-001` (claim), `C000-EV-002` (claim), `C000-VF-001` (claim), `C000-VF-003` (claim), `C000-VF-004` (claim), `C000-SV-003` (claim), `C000-SV-006` (claim)

#### C000-ST-003

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Status reuses the #39 six terms in separate decision/implementation/tests/verification dimensions, with `—` (data `none`) for no supported claim and no seventh status.
- Scope: CORE-000 accepted design §4.2 row C000-ST-003 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-ST-003 at the accepted design baseline: M:§1–2; §2.3

- Subjects: `COMP-PROJECT` (component)

#### C000-CT-001

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: A project has a manifest; `contract-builder.json` is the only fixed file name, and inputs, sources, renderer and outputs are declared in it.
- Scope: CORE-000 accepted design §4.2 row C000-CT-001 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-001 at the accepted design baseline: M:P1; `spec/lib/manifest.ts`; `tests/manifest.test.ts`

- Subjects: `IF-MANIFEST` (interface)

- Evidence: `EV-CODE-MANIFEST` (code: spec/lib/manifest.ts), `EV-TEST-MANIFEST` (test: tests/manifest.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-002

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Declared inputs are validated by document schemas, then extracted by declared pointers and per-kind schemas; an undeclared kind fails.
- Scope: CORE-000 accepted design §4.2 row C000-CT-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-002 at the accepted design baseline: M:P2,R1; `spec/lib/schema.ts`, `spec/lib/ir.ts`; `tests/manifest.test.ts`, `tests/build.test.ts`

- Subjects: `IF-PROJECT-MODEL` (interface)

- Evidence: `EV-CODE-SCHEMA` (code: spec/lib/schema.ts; spec/lib/ir.ts), `EV-TEST-MANIFEST` (test: tests/manifest.test.ts), `EV-TEST-BUILD` (test: tests/build.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-003

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Entity identities are non-empty and unique across kinds; declared relation targets resolve; undeclared relation keys fail; an inverse is a reciprocal declaration (same edge set, reversed endpoints, no wildcard inverse) and an inverse declared `one` rejects a second source.
- Scope: CORE-000 accepted design §4.2 row C000-CT-003 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-003 at the accepted design baseline: M:I3,R3; C:§3.2, §5.2; `spec/lib/relations.ts`, `spec/lib/manifest.ts`; PR #52; `tests/ir.test.ts`, `tests/manifest.test.ts`

- Subjects: `IF-PROJECT-MODEL` (interface)

- Evidence: `EV-CODE-MANIFEST` (code: spec/lib/manifest.ts), `EV-CODE-RELATIONS` (code: spec/lib/relations.ts), `EV-TEST-MANIFEST` (test: tests/manifest.test.ts), `EV-TEST-IR` (test: tests/ir.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-004

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: The profile declares kinds, relations, schemas, provenance mappings and diagnostics; the core names no domain vocabulary.
- Scope: CORE-000 accepted design §4.2 row C000-CT-004 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-004 at the accepted design baseline: M:R1; `profiles/core001/profile.json`; `tests/genericity.test.ts`

- Subjects: `COMP-PROFILE` (component)

- Evidence: `EV-CODE-PROFILE-DECL` (code: profiles/core001/profile.json), `EV-TEST-GENERICITY` (test: tests/genericity.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-005

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: A provenance binding carries `{source, ref, quote}`; the source must be declared; an incomplete binding fails; binding is structural and attaches a `not-checked` verification record, never a verified one.
- Scope: CORE-000 accepted design §4.2 row C000-CT-005 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-005 at the accepted design baseline: M:V1; C:§4; `spec/lib/provenance.ts`; `tests/ir.test.ts`, `tests/provenance.test.ts`

- Subjects: `IF-PROJECT-MODEL` (interface)

- Evidence: `EV-CODE-PROVENANCE` (code: spec/lib/provenance.ts), `EV-TEST-IR` (test: tests/ir.test.ts), `EV-TEST-PROVENANCE` (test: tests/provenance.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-006

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: The markdown adapter resolves section, table-column and ordered-item locators and reports `found`/`outside`/`unknown-locator`; the profile verifier maps the outcome into a verification record and the core stores it.
- Scope: CORE-000 accepted design §4.2 row C000-CT-006 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-006 at the accepted design baseline: M:V2,V5; `spec/lib/adapters/markdown.ts`, `spec/lib/provenance.ts`; `tests/build.test.ts`, `tests/provenance.test.ts`

- Subjects: `IF-ADAPTER` (interface)

- Evidence: `EV-CODE-PROVENANCE` (code: spec/lib/provenance.ts), `EV-CODE-ADAPTER` (code: spec/lib/adapters/markdown.ts), `EV-TEST-BUILD` (test: tests/build.test.ts), `EV-TEST-PROVENANCE` (test: tests/provenance.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-024

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Core-enforced quote verification and the accepted `unknown-block` locator outcome are `proposed`, not implemented; `unsupported` exists in the `LocatorResult` type but is not produced by the M1 markdown adapter.
- Scope: CORE-000 accepted design §4.2 row C000-CT-024 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-024 at the accepted design baseline: M:V3; C:§5.2 step 7, §11; D25; `spec/lib/source.ts`

- Subjects: `SRC-PROVENANCE-001` (source_statement)

#### C000-CT-007

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Diagnostics are deterministic and catalog-resolved; an unknown finding code fails the build.
- Scope: CORE-000 accepted design §4.2 row C000-CT-007 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-007 at the accepted design baseline: M:G1,G3; `spec/lib/hook.ts`, `spec/lib/diagnostics.ts`; `tests/hook.test.ts`, `tests/golden.test.ts`

- Subjects: `IF-DIAGNOSTIC` (interface)

- Evidence: `EV-CODE-HOOK` (code: spec/lib/hook.ts), `EV-CODE-DIAGNOSTICS` (code: spec/lib/diagnostics.ts), `EV-TEST-HOOK` (test: tests/hook.test.ts), `EV-TEST-GOLDEN` (test: tests/golden.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-008

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The contract diagnostic shape (severity + disposition + phase + blocking + data) is accepted but deferred to M2; the current record is the legacy shape.
- Scope: CORE-000 accepted design §4.2 row C000-CT-008 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-008 at the accepted design baseline: M:G2; C:§7, §18; D8/D9/D17

- Subjects: `IF-DIAGNOSTIC` (interface)

- Decisions: `DEC-D8-D9` (accepted)

#### C000-CT-009

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: The renderer registry, preloaded templates and UTF-8/LF/one-trailing-newline normalization are implemented; an unknown renderer id fails.
- Scope: CORE-000 accepted design §4.2 row C000-CT-009 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-009 at the accepted design baseline: M:O1,O2; `spec/lib/render.ts`; `tests/renderer.test.ts`

- Subjects: `IF-RENDERER` (interface)

- Evidence: `EV-CODE-RENDER` (code: spec/lib/render.ts), `EV-TEST-RENDERER` (test: tests/renderer.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-010

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Build identity exposes `projectId`, `engineVersion`, `manifestVersion`, `inputDigest` and the extension list; it is not rendered into the artifact.
- Scope: CORE-000 accepted design §4.2 row C000-CT-010 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-010 at the accepted design baseline: M:B1; `spec/lib/identity.ts`; `tests/identity.test.ts`

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-CODE-IDENTITY` (code: spec/lib/identity.ts), `EV-TEST-IDENTITY` (test: tests/identity.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-013

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Paths are root-contained by default; `external: true` is an explicit trust declaration; outputs never leave the output root.
- Scope: CORE-000 accepted design §4.2 row C000-CT-013 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-013 at the accepted design baseline: M:P3; C:§5.7; D31; `tests/manifest.test.ts`

- Subjects: `IF-MANIFEST` (interface)

- Evidence: `EV-TEST-MANIFEST` (test: tests/manifest.test.ts)

- Decisions: `DEC-D31` (accepted)

#### C000-CT-014

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Extension closures, lockfile authority and the static import scan are implemented; an undeclared or unpinned import fails.
- Scope: CORE-000 accepted design §4.2 row C000-CT-014 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-014 at the accepted design baseline: M:B3; `spec/lib/identity.ts`; `tests/identity.test.ts`; BI

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-CODE-IDENTITY` (code: spec/lib/identity.ts), `EV-TEST-IDENTITY` (test: tests/identity.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-015

- Class: `requirement`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Declarative conformance vectors are stored, validated and linked to their claims; execution is deferred.
- Scope: CORE-000 accepted design §4.2 row C000-CT-015 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-015 at the accepted design baseline: M:N1,N2; C:§12; `profiles/core001/checks/cases.ts`; `tests/checks.test.ts`

- Subjects: `IF-CONFORMANCE` (interface)

- Evidence: `EV-CODE-CASES` (code: profiles/core001/checks/cases.ts), `EV-TEST-CHECKS` (test: tests/checks.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-016

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The public API (`loadProject`/`validateProject`/`buildProject`/`renderModel`/`checkArtifacts`, `BuildStatus`, phases, exit code 2) is accepted but deferred to M2.
- Scope: CORE-000 accepted design §4.2 row C000-CT-016 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-016 at the accepted design baseline: M:K2; C:§9; D7/D18

- Subjects: `IF-BUILD-RESULT` (interface)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-017

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The contract CLI (`validate` / `build` / `check`, `--json` result object) is accepted but deferred.
- Scope: CORE-000 accepted design §4.2 row C000-CT-017 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-017 at the accepted design baseline: M:K3; C:§10

- Subjects: `IF-CLI` (interface)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-019

- Class: `requirement`
- Status: decision=`deferred`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Multiple renderers and multiple artifacts per build are deferred; the `Artifact[]` shape is forward-compatible.
- Scope: CORE-000 accepted design §4.2 row C000-CT-019 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-019 at the accepted design baseline: M:O3; C:§8, §11; PR #56

- Subjects: `IF-RENDERER` (interface)

- Decisions: `DEC-DEFER-019` (deferred)

#### C000-CT-021

- Class: `requirement`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Provenance hardening (paragraph locators and a source-byte digest) is accepted but not implemented.
- Scope: CORE-000 accepted design §4.2 row C000-CT-021 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-021 at the accepted design baseline: M:V4; `provenance-hardening-rfc.md`; #45

- Subjects: `SRC-PROVENANCE-001` (source_statement)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-023

- Class: `requirement`
- Status: decision=`deferred`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Full self-hosting is deferred; CORE-000 is a bounded step, not the M5 self-hosting program.
- Scope: CORE-000 accepted design §4.2 row C000-CT-023 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-023 at the accepted design baseline: M:X3; C:§14; D26

- Subjects: `COMP-CORE` (component)

- Decisions: `DEC-DEFER-023` (deferred)

#### C000-EV-002

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Independent verification requires a verifier distinct from the author, access to evidence, a recorded method/scope/result and a per-claim record; a merge, green CI or empty approval does not qualify.
- Scope: CORE-000 accepted design §4.2 row C000-EV-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-EV-002 at the accepted design baseline: M:§7; §8

- Subjects: `DEC-D13` (decision)

#### C000-VF-001

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The engine cannot set `independently_verified`; only an external verification record can support it.
- Scope: CORE-000 accepted design §4.2 row C000-VF-001 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-VF-001 at the accepted design baseline: §8.1, §8.3

- Subjects: `DEC-D13` (decision)

#### C000-VF-004

- Class: `requirement`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: An independent-verification record carries `id`, `method`, `verifier`, `independence`, `independence_basis`, `performed`, `result`, `scope`, `revision`, `claim_results` and `limitations`; `commands`, `date` and `record_locator` are conditional per §8.3. It is separate from the core provenance `VerificationRecord`.
- Scope: CORE-000 accepted design §4.2 row C000-VF-004 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-VF-004 at the accepted design baseline: §5.3, §8.3; C:§4

- Subjects: `DEC-D13` (decision)

### guarantee

#### C000-CT-011

- Class: `guarantee`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: `inputDigest` covers the canonical manifest, declared inputs, sources, profile closure and adapter/renderer closures; clock, locale, environment, mtimes and absolute paths are excluded.
- Scope: CORE-000 accepted design §4.2 row C000-CT-011 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-011 at the accepted design baseline: M:B2; `spec/lib/identity.ts`; `tests/identity.test.ts`; BI

- Conditions: Given a project whose canonical manifest declares its inputs and sources, and whose profile and renderer closures are loaded from the declared paths, inputDigest covers those declared inputs and closures; clock, locale, environment, mtimes and absolute paths are excluded.

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-CODE-IDENTITY` (code: spec/lib/identity.ts), `EV-TEST-IDENTITY` (test: tests/identity.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-CT-012

- Class: `guarantee`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `engine`
- Lifecycle: `active`
- Statement: Byte determinism is conditional on the same engine version, `inputDigest` and extension identities, and on every trusted extension honouring its deterministic contract; it is not absolute reproducibility.
- Scope: CORE-000 accepted design §4.2 row C000-CT-012 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-012 at the accepted design baseline: C:§8.1, §8.3; BI; `tests/golden.test.ts`

- Conditions: Same engine version, inputDigest and extension identities, and every trusted extension honouring its deterministic contract.

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-TEST-GOLDEN` (test: tests/golden.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

### assumption

#### C000-TR-002

- Class: `assumption`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Determinism of profile hooks is an author obligation, not an engine guarantee; the engine cannot enforce purity.
- Scope: CORE-000 accepted design §4.2 row C000-TR-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-TR-002 at the accepted design baseline: C:§3.3; D28/D32

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Decisions: `DEC-D28` (accepted)

#### C000-TR-006

- Class: `assumption`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Loading a profile is a trust decision equivalent to installing a dependency.
- Scope: CORE-000 accepted design §4.2 row C000-TR-006 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-TR-006 at the accepted design baseline: C:§3.3; D28; PR #50

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Decisions: `DEC-D28` (accepted)

### constraint

#### C000-SC-001

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: CORE-000 is a working project identifier, not an adopted UIA standard and not a source of normative authority by itself.
- Scope: CORE-000 accepted design §4.2 row C000-SC-001 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SC-001 at the accepted design baseline: #47 naming note; §1.4

- Subjects: `COMP-PROJECT` (component)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-SC-004

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: A successful self-build or self-validation evidences only the checks actually run; it is not independent verification, certification, or proof of correctness, security, determinism or conformance.
- Scope: CORE-000 accepted design §4.2 row C000-SC-004 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SC-004 at the accepted design baseline: task C5; C:§1.1, §6.3; §7.2

- Subjects: `DEC-D13` (decision)

- Decisions: `DEC-TASK-C5` (accepted)

#### C000-SC-005

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: This task does not implement CORE-000, change generic-core behaviour, or design the Portable Assurance Package, independent verifier, sandbox or package split.
- Scope: CORE-000 accepted design §4.2 row C000-SC-005 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SC-005 at the accepted design baseline: task C1/C14; #47 non-goals; PR scope

- Subjects: `DEC-TASK-C1-C14` (decision)

- Decisions: `DEC-TASK-C1-C14` (accepted)

#### C000-ST-001

- Class: `constraint`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Only claims with class `requirement`/`constraint`/`guarantee` and decision `accepted` are normative for CORE-000; this design is `proposed`.
- Scope: CORE-000 accepted design §4.2 row C000-ST-001 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-ST-001 at the accepted design baseline: §1.4

- Subjects: `C000-SC-001` (claim), `C000-SC-002` (claim), `C000-SC-004` (claim), `C000-SC-005` (claim), `C000-ST-004` (claim), `C000-CT-001` (claim), `C000-CT-002` (claim), `C000-CT-003` (claim), `C000-CT-004` (claim), `C000-CT-005` (claim), `C000-CT-006` (claim), `C000-CT-007` (claim), `C000-CT-008` (claim), `C000-CT-009` (claim), `C000-CT-010` (claim), `C000-CT-011` (claim), `C000-CT-012` (claim), `C000-CT-013` (claim), `C000-CT-014` (claim), `C000-CT-015` (claim), `C000-CT-016` (claim), `C000-CT-017` (claim), `C000-CT-021` (claim), `C000-CT-025` (claim), `C000-CT-026` (claim), `C000-TR-003` (claim), `C000-TR-005` (claim), `C000-EV-001` (claim), `C000-SV-003` (claim)

#### C000-ST-004

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: An implementation fact does not become a normative requirement merely because it exists in the repository.
- Scope: CORE-000 accepted design §4.2 row C000-ST-004 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-ST-004 at the accepted design baseline: task C7; #47 §2; §2.2

- Subjects: `C000-IM-001` (claim), `C000-IM-002` (claim), `C000-IM-003` (claim), `C000-IM-004` (claim), `C000-IM-005` (claim), `C000-IM-006` (claim)

- Decisions: `DEC-TASK-C7` (accepted)

#### C000-TR-005

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: CORE-000 trust-boundary claims are reconciled with the merged #35/PR #50 outcome; a later consent-policy change requires a new reconciliation.
- Scope: CORE-000 accepted design §4.2 row C000-TR-005 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-TR-005 at the accepted design baseline: task C4; PR #50; §6.4

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Decisions: `DEC-TASK-C4` (accepted)

#### C000-EV-001

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Test evidence is revision-bound; a passing test is evidence of that run, not of correctness or independence.
- Scope: CORE-000 accepted design §4.2 row C000-EV-001 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-EV-001 at the accepted design baseline: M:§1, §7; §2.4

- Subjects: `EV-TRUST-TEST` (evidence), `EV-CONSENT-TEST` (evidence), `EV-MANIFEST-TEST` (evidence), `EV-PROVENANCE-TEST` (evidence), `EV-TEST-MANIFEST` (evidence), `EV-TEST-BUILD` (evidence), `EV-TEST-IR` (evidence), `EV-TEST-GENERICITY` (evidence), `EV-TEST-PROVENANCE` (evidence), `EV-TEST-HOOK` (evidence), `EV-TEST-GOLDEN` (evidence), `EV-TEST-RENDERER` (evidence), `EV-TEST-IDENTITY` (evidence), `EV-TEST-CHECKS` (evidence), `EV-TEST-CONSENT` (evidence)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-VF-003

- Class: `constraint`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Contract conformance, test-coverage sufficiency, cross-platform determinism, security/trust boundary, independence itself, semantic truth and self-description completeness require external authority.
- Scope: CORE-000 accepted design §4.2 row C000-VF-003 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-VF-003 at the accepted design baseline: §8.1

- Subjects: `DEC-D13` (decision)

#### C000-SV-003

- Class: `constraint`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: A successful build establishes only structural/relational self-consistency and CORE-000 profile-policy compliance.
- Scope: CORE-000 accepted design §4.2 row C000-SV-003 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SV-003 at the accepted design baseline: task C5; C:§1.1, §6.3; §7.2

- Subjects: `COMP-PROJECT` (component)

- Decisions: `DEC-TASK-C5` (accepted)

#### C000-SV-006

- Class: `constraint`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The release build remains blocked while review diagnostics (missing independent verification, unresolved decisions) remain; the consent policy is settled, so it is no longer a blocker.
- Scope: CORE-000 accepted design §4.2 row C000-SV-006 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SV-006 at the accepted design baseline: §7.7, §7.10

- Subjects: `C000-TR-001` (claim), `C000-TR-003` (claim), `C000-IM-004` (claim), `C000-CT-008` (claim), `C000-CT-016` (claim), `C000-CT-017` (claim), `C000-CT-018` (claim), `C000-CT-019` (claim), `C000-CT-020` (claim), `C000-CT-021` (claim), `C000-CT-022` (claim), `C000-CT-023` (claim), `C000-CT-024` (claim), `C000-EV-001` (claim), `C000-EV-002` (claim), `C000-EV-003` (claim), `C000-GAP-001` (claim), `C000-GAP-002` (claim), `C000-GAP-003` (claim), `C000-GAP-004` (claim), `C000-GAP-005` (claim), `C000-GAP-006` (claim), `C000-GAP-007` (claim), `C000-IM-001` (claim), `C000-IM-002` (claim), `C000-IM-003` (claim), `C000-IM-005` (claim), `C000-IM-006` (claim), `C000-IM-007` (claim), `C000-IM-008` (claim), `C000-IM-009` (claim), `C000-LM-001` (claim), `C000-LM-002` (claim), `C000-LM-003` (claim), `C000-LM-004` (claim), `C000-LM-005` (claim), `C000-LM-006` (claim), `C000-LM-007` (claim), `C000-LM-008` (claim), `C000-SC-001` (claim), `C000-SC-002` (claim), `C000-SC-003` (claim), `C000-SC-004` (claim), `C000-SC-005` (claim), `C000-ST-001` (claim), `C000-ST-002` (claim), `C000-ST-003` (claim), `C000-ST-004` (claim), `C000-SV-001` (claim), `C000-SV-002` (claim), `C000-SV-003` (claim), `C000-SV-004` (claim), `C000-SV-005` (claim), `C000-SV-006` (claim), `C000-TR-002` (claim), `C000-TR-004` (claim), `C000-TR-005` (claim), `C000-TR-006` (claim), `C000-VF-001` (claim), `C000-VF-002` (claim), `C000-VF-003` (claim), `C000-VF-004` (claim)

### implementation_fact

#### C000-IM-004

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: profile.view and profile.validator are dynamically imported in-process only after explicit consent; the engine's renderer is consumer-supplied, and the CLI imports the CORE-001 renderer conditionally.
- Scope: Executable profile import behaviour at main dffdaa2.
- Verification method: bun test tests/consent.test.ts tests/example-profile.test.ts

- Subjects: `IF-PROFILE-VALIDATOR` (interface)

- Evidence: `EV-CONSENT-CODE` (code: spec/lib/build.ts; spec/build.ts; spec/cli-renderers.ts), `EV-CONSENT-TEST` (test: tests/consent.test.ts)

#### C000-IM-001

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The current build entry point is `runBuild(BuildOptions)`; `package.json` is private and publishes no package surface.
- Scope: CORE-000 accepted design §4.2 row C000-IM-001 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-IM-001 at the accepted design baseline: `spec/lib/build.ts:56`; `package.json`; tests call `runBuild`

- Subjects: `IF-BUILD-RESULT` (interface)

- Evidence: `EV-CODE-BUILD` (code: spec/lib/build.ts), `EV-CODE-PACKAGE` (code: package.json), `EV-TEST-BUILD` (test: tests/build.test.ts)

#### C000-IM-002

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Current diagnostics are `{severity: error / warning / review, code, file, pointer, message}` with no disposition, phase, data or object location.
- Scope: CORE-000 accepted design §4.2 row C000-IM-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-IM-002 at the accepted design baseline: M:G1; `spec/lib/diagnostics.ts`; `tests/golden.test.ts`

- Subjects: `IF-DIAGNOSTIC` (interface)

- Evidence: `EV-CODE-DIAGNOSTICS` (code: spec/lib/diagnostics.ts), `EV-TEST-GOLDEN` (test: tests/golden.test.ts)

#### C000-IM-003

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Current exit codes are 0 and 1; usage errors exit 1; exit code 2 is not implemented.
- Scope: CORE-000 accepted design §4.2 row C000-IM-003 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-IM-003 at the accepted design baseline: `spec/lib/build.ts` result mapping; `spec/build.ts`; M:G2

- Subjects: `IF-BUILD-RESULT` (interface)

- Evidence: `EV-CODE-BUILD` (code: spec/lib/build.ts), `EV-CODE-CLI-MAP` (code: spec/build.ts), `EV-TEST-BUILD` (test: tests/build.test.ts)

#### C000-IM-005

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Build identity is computed after load/validation, is `null` when the build stops early, and is never rendered.
- Scope: CORE-000 accepted design §4.2 row C000-IM-005 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-IM-005 at the accepted design baseline: `spec/lib/build.ts`; `tests/identity.test.ts`; BI

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-CODE-IDENTITY` (code: spec/lib/identity.ts), `EV-CODE-BUILD` (code: spec/lib/build.ts), `EV-TEST-IDENTITY` (test: tests/identity.test.ts)

#### C000-IM-006

- Class: `implementation_fact`
- Status: decision=`none`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The CLI dynamically imports the CORE-001 renderer only with explicit consent, a matching profile `core001`/renderer `core001-markdown` declaration and a valid profile closure; there is no generic profile-selection CLI.
- Scope: CORE-000 accepted design §4.2 row C000-IM-006 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-IM-006 at the accepted design baseline: `spec/cli-renderers.ts`; `tests/consent.test.ts`

- Subjects: `IF-CLI` (interface)

- Evidence: `EV-CODE-CLI` (code: spec/cli-renderers.ts), `EV-TEST-CONSENT` (test: tests/consent.test.ts)

### trust_boundary

#### C000-TR-001

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

#### C000-IM-007

- Class: `trust_boundary`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The profile loader requires explicit consent; absent consent fails closed before import; after consent, view/validator run in-process with builder privileges and no sandbox or isolation.
- Scope: CORE-000 accepted design §4.2 row C000-IM-007 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-IM-007 at the accepted design baseline: M:H5; `spec/lib/build.ts`; `tests/consent.test.ts`; §6.1

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Evidence: `EV-CODE-BUILD` (code: spec/lib/build.ts), `EV-TEST-CONSENT` (test: tests/consent.test.ts)

- Decisions: `DEC-35` (accepted)

#### C000-IM-008

- Class: `trust_boundary`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: `external: true` is a path trust declaration, not an executable-profile opt-in and not isolation.
- Scope: CORE-000 accepted design §4.2 row C000-IM-008 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-IM-008 at the accepted design baseline: C:§5.7; D31; `tests/manifest.test.ts`

- Subjects: `TB-CONSUMER-EXTENSION` (trust_boundary)

- Evidence: `EV-CODE-MANIFEST` (code: spec/lib/manifest.ts), `EV-TEST-MANIFEST` (test: tests/manifest.test.ts)

- Decisions: `DEC-D31` (accepted)

### proposal

#### C000-SC-003

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: CORE-000 is self-described through the existing generic pipeline; the experiment requires no generic-core change.
- Scope: CORE-000 accepted design §4.2 row C000-SC-003 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SC-003 at the accepted design baseline: §5, §7; PR #46 (independent example profile); P:§13

- Subjects: `COMP-PROJECT` (component)

#### C000-CT-018

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Multi-source projects are proposed, not implemented or tested; M1 exercises one source.
- Scope: CORE-000 accepted design §4.2 row C000-CT-018 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-018 at the accepted design baseline: M:A2; C:§5.3; D21; #5

- Subjects: `IF-PROJECT-MODEL` (interface)

#### C000-CT-020

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Typed `ReviewState` and per-dimension review are proposed/deferred.
- Scope: CORE-000 accepted design §4.2 row C000-CT-020 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-020 at the accepted design baseline: M:R5; C:§4; D24

- Subjects: `COMP-PROJECT` (component)

#### C000-CT-022

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Packaging, publication and a declared runtime matrix are proposed/unresolved; nothing is published.
- Scope: CORE-000 accepted design §4.2 row C000-CT-022 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-CT-022 at the accepted design baseline: M:X1,X2,X4; C:§13, §17; D14/D19/D20/D29

- Subjects: `COMP-PROJECT` (component)

#### C000-VF-002

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: A concrete manual independent-review protocol exists in §8.2 but has not been performed.
- Scope: CORE-000 accepted design §4.2 row C000-VF-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-VF-002 at the accepted design baseline: §8.2

- Subjects: `DEC-D13` (decision)

#### C000-SV-001

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The self-validation experiment uses the existing generic pipeline and a consumer harness; it requires no generic-core change.
- Scope: CORE-000 accepted design §4.2 row C000-SV-001 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SV-001 at the accepted design baseline: §7.3–7.5; PR #46

- Subjects: `COMP-PROJECT` (component)

#### C000-SV-002

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The experiment checks schemas, identity, relations, provenance, CORE-000 policy, artifact normalization and build identity, and renders one Markdown artifact.
- Scope: CORE-000 accepted design §4.2 row C000-SV-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SV-002 at the accepted design baseline: §7.5–7.6

- Subjects: `COMP-PROJECT` (component)

#### C000-SV-004

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The negative cases cover at least inconsistent component/interface, unresolved dependency/relation, implemented-without-evidence and unsupported/unverified guarantee, plus identity, relation, provenance and trust cases.
- Scope: CORE-000 accepted design §4.2 row C000-SV-004 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SV-004 at the accepted design baseline: §7.8

- Subjects: `COMP-PROJECT` (component)

#### C000-GAP-001

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The generic core has no raw-file input/adapter for code/test evidence; evidence files cannot participate in `inputDigest`, so claim/evidence staleness is invisible to the build.
- Scope: CORE-000 accepted design §4.2 row C000-GAP-001 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-GAP-001 at the accepted design baseline: §9 G1

- Subjects: `EV-TRUST-CODE` (evidence), `EV-TRUST-TEST` (evidence), `EV-CONSENT-CODE` (evidence), `EV-CONSENT-TEST` (evidence), `EV-MANIFEST-CODE` (evidence), `EV-MANIFEST-TEST` (evidence), `EV-PROVENANCE-CODE` (evidence), `EV-PROVENANCE-TEST` (evidence), `EV-CODE-MANIFEST` (evidence), `EV-CODE-SCHEMA` (evidence), `EV-CODE-RELATIONS` (evidence), `EV-CODE-PROFILE-DECL` (evidence), `EV-CODE-PROVENANCE` (evidence), `EV-CODE-ADAPTER` (evidence), `EV-CODE-HOOK` (evidence), `EV-CODE-DIAGNOSTICS` (evidence), `EV-CODE-RENDER` (evidence), `EV-CODE-IDENTITY` (evidence), `EV-CODE-CASES` (evidence), `EV-CODE-BUILD` (evidence), `EV-CODE-CLI` (evidence), `EV-CODE-CLI-MAP` (evidence), `EV-CODE-PACKAGE` (evidence), `EV-TEST-MANIFEST` (evidence), `EV-TEST-BUILD` (evidence), `EV-TEST-IR` (evidence), `EV-TEST-GENERICITY` (evidence), `EV-TEST-PROVENANCE` (evidence), `EV-TEST-HOOK` (evidence), `EV-TEST-GOLDEN` (evidence), `EV-TEST-RENDERER` (evidence), `EV-TEST-IDENTITY` (evidence), `EV-TEST-CHECKS` (evidence), `EV-TEST-CONSENT` (evidence)

#### C000-GAP-002

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Cross-entity declarative rule primitives are not implemented; CORE-000 policy needs a trusted profile hook.
- Scope: CORE-000 accepted design §4.2 row C000-GAP-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-GAP-002 at the accepted design baseline: §9 G2; M:R4

- Subjects: `COMP-PROFILE` (component)

#### C000-GAP-003

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Binding/verification separation is implemented (#37), but locators are coarse, core quote verification is proposed and the accepted V4 hardening is unimplemented.
- Scope: CORE-000 accepted design §4.2 row C000-GAP-003 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-GAP-003 at the accepted design baseline: §9 G3; M:V3,V4; PR #55

- Subjects: `SRC-PROVENANCE-001` (source_statement)

#### C000-GAP-004

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The public API/CLI are not generic; the experiment needs a consumer harness, and the CLI only conditionally wires the CORE-001 renderer rather than selecting arbitrary profiles.
- Scope: CORE-000 accepted design §4.2 row C000-GAP-004 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-GAP-004 at the accepted design baseline: §9 G4; M:K2,K3; C000-IM-006

- Subjects: `IF-CLI` (interface)

#### C000-GAP-005

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Multi-target rendering/multi-artifact is deferred and #38 now rejects zero or multiple `manifest.render` declarations; a machine-readable JSON claim export is not available in M1.
- Scope: CORE-000 accepted design §4.2 row C000-GAP-005 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-GAP-005 at the accepted design baseline: §9 G5; M:O3; PR #56

- Subjects: `IF-RENDERER` (interface)

#### C000-GAP-006

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Multi-source is untested; CORE-000 uses one source and treats other documents as evidence references.
- Scope: CORE-000 accepted design §4.2 row C000-GAP-006 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-GAP-006 at the accepted design baseline: §9 G6; M:A2

- Subjects: `IF-PROJECT-MODEL` (interface)

#### C000-GAP-007

- Class: `proposal`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Review dimensions and a typed verification record are not core features; CORE-000 encodes them as data and profile checks.
- Scope: CORE-000 accepted design §4.2 row C000-GAP-007 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-GAP-007 at the accepted design baseline: §9 G7; M:R5

- Subjects: `DEC-D24` (decision)

### limitation

#### C000-IM-009

- Class: `limitation`
- Status: decision=`accepted`, implementation=`implemented`, tests=`tested`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: The extension closure and static import scan are integrity/accounting guards, not a security boundary.
- Scope: CORE-000 accepted design §4.2 row C000-IM-009 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-IM-009 at the accepted design baseline: M:B3; BI "Static import scan"

- Subjects: `IF-BUILD-IDENTITY` (interface)

- Evidence: `EV-CODE-IDENTITY` (code: spec/lib/identity.ts), `EV-TEST-IDENTITY` (test: tests/identity.test.ts)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-TR-004

- Class: `limitation`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `external`
- Lifecycle: `active`
- Statement: Consent permits trusted executable profile code to run in-process with builder privileges; it is not a sandbox, isolation or capability restriction.
- Scope: CORE-000 accepted design §4.2 row C000-TR-004 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-TR-004 at the accepted design baseline: C:§3.3; PR #50; §6.2

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

- Decisions: `DEC-35` (accepted)

#### C000-EV-003

- Class: `limitation`
- Status: decision=`accepted`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: No independent verification of the engine or CORE-000 exists at the baseline; every independent-verification dimension is `—`.
- Scope: CORE-000 accepted design §4.2 row C000-EV-003 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-EV-003 at the accepted design baseline: M:§7; §8.5

- Subjects: `DEC-D13` (decision)

- Decisions: `DEC-DESIGN-51` (accepted)

#### C000-SV-005

- Class: `limitation`
- Status: decision=`proposed`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The experiment cannot establish that the code matches the claims; that requires external evidence and independent review.
- Scope: CORE-000 accepted design §4.2 row C000-SV-005 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-SV-005 at the accepted design baseline: §7.2, §8

- Subjects: `COMP-PROJECT` (component)

#### C000-LM-001

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: This design is not implemented or executed; no CORE-000 artifact, diagnostics or digest exists yet.
- Scope: CORE-000 accepted design §4.2 row C000-LM-001 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-LM-001 at the accepted design baseline: §11

- Subjects: `COMP-PROJECT` (component)

#### C000-LM-002

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Statuses derive from the #39 snapshot at `f1ddcf7` plus its #35/#36/#37 snapshot updates; #38 is cited from the contract and tests; current main is `260de89`, and any later change requires re-audit.
- Scope: CORE-000 accepted design §4.2 row C000-LM-002 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-LM-002 at the accepted design baseline: §1.5, §11

- Subjects: `COMP-PROJECT` (component)

#### C000-LM-003

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Claims are author-asserted data; profile checks enforce evidence presence and consistency, not truth.
- Scope: CORE-000 accepted design §4.2 row C000-LM-003 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-LM-003 at the accepted design baseline: §2.7, §11

- Subjects: `COMP-PROJECT` (component)

#### C000-LM-004

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: No independent verification exists; a `release` CORE-000 build cannot claim it.
- Scope: CORE-000 accepted design §4.2 row C000-LM-004 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-LM-004 at the accepted design baseline: §8.5

- Subjects: `DEC-D13` (decision)

#### C000-LM-005

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: Consent is implemented, but no sandbox, isolation or capability restriction exists; process/WASM isolation remains deferred (D32).
- Scope: CORE-000 accepted design §4.2 row C000-LM-005 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-LM-005 at the accepted design baseline: §6, §11

- Subjects: `TB-PROFILE-EXEC` (trust_boundary)

#### C000-LM-008

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: A `verified` provenance record is a method-specific check of a binding, not independent verification or certification.
- Scope: CORE-000 accepted design §4.2 row C000-LM-008 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-LM-008 at the accepted design baseline: C:§4, §6.3; §8

- Subjects: `SRC-PROVENANCE-001` (source_statement)

#### C000-LM-006

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: The model, schemas and hook rules are proposals and may change during implementation.
- Scope: CORE-000 accepted design §4.2 row C000-LM-006 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-LM-006 at the accepted design baseline: §5, §10

- Subjects: `COMP-PROJECT` (component)

#### C000-LM-007

- Class: `limitation`
- Status: decision=`none`, implementation=`none`, tests=`none`, verification=`none`
- Authority: `human`
- Lifecycle: `active`
- Statement: No claim is made about cross-platform determinism, security, hermeticity, legal effect or external conformance.
- Scope: CORE-000 accepted design §4.2 row C000-LM-007 at the accepted design baseline 260de89; the row statement is the scope.
- Verification method: Accepted design §4.2 evidence/method for C000-LM-007 at the accepted design baseline: C:§8.3; §11

- Subjects: `COMP-PROJECT` (component)

## Source statements and provenance verification

### SRC-TR-001

- Locator: `SRC-ENGINE-CONTRACT#3.3`
- Verification status: `verified`
- Outcome: `found`
- Method: `markdown:locator`
- Verifier: `core000/verifyProvenance`
- Source version: Contract Builder Engine — Public Contract (Rev 0.4)
- Source digest: `sha256:d8aeaada521c8d73873e6894c53759013ce6ea52491af1fd2d1f64679ceb8a6e`
- Quote: The hook is **trusted executable code**. The engine loads it with a dynamic `import()` and runs it in the same process, with the same privileges. **The engine does not sandbox it.**

### SRC-MANIFEST-001

- Locator: `SRC-ENGINE-CONTRACT#3.1`
- Verification status: `verified`
- Outcome: `found`
- Method: `markdown:locator`
- Verifier: `core000/verifyProvenance`
- Source version: Contract Builder Engine — Public Contract (Rev 0.4)
- Source digest: `sha256:d8aeaada521c8d73873e6894c53759013ce6ea52491af1fd2d1f64679ceb8a6e`
- Quote: `render` keeps its array shape for forward compatibility, but **M1 supports exactly one render declaration**. Zero declarations and more than one are rejected with `core.manifest.invalid` during manifest validation, before any input is rendered or any artifact is written; multi-target rendering is deferred.

### SRC-PROVENANCE-001

- Locator: `SRC-ENGINE-CONTRACT#4`
- Verification status: `verified`
- Outcome: `found`
- Method: `markdown:locator`
- Verifier: `core000/verifyProvenance`
- Source version: Contract Builder Engine — Public Contract (Rev 0.4)
- Source digest: `sha256:d8aeaada521c8d73873e6894c53759013ce6ea52491af1fd2d1f64679ceb8a6e`
- Quote: A `ProvenanceBinding` says where evidence is claimed to come from. It does not say that the claim was checked. The core attaches a `not-checked` verification record when it binds, so an unverified binding is explicit rather than implicit.

## Evidence

- `EV-TRUST-CODE` (code) — spec/lib/build.ts @ dffdaa2: loadProfileModule imports view/validator after the consent gate.

- `EV-TRUST-TEST` (test) — tests/consent.test.ts @ dffdaa2: Consent tests cover API/CLI rejection and success and renderer isolation.

- `EV-CONSENT-CODE` (code) — spec/lib/build.ts; spec/build.ts; spec/cli-renderers.ts @ dffdaa2: allowExecutableProfile gate, CLI flag and conditional CORE-001 renderer preflight.

- `EV-CONSENT-TEST` (test) — tests/consent.test.ts @ dffdaa2: API/CLI rejection, success, renderer isolation, closure preflight and lockfile cases.

- `EV-MANIFEST-CODE` (code) — spec/lib/manifest.ts @ dffdaa2: The manifest loader rejects zero or multiple render declarations with core.manifest.invalid.

- `EV-MANIFEST-TEST` (test) — tests/manifest.test.ts @ dffdaa2: Manifest tests cover the single render declaration contract.

- `EV-PROVENANCE-CODE` (code) — spec/lib/provenance.ts; spec/lib/hook.ts @ dffdaa2: Binding attaches a not-checked record; verifyProvenance claims are validated and stored separately.

- `EV-PROVENANCE-TEST` (test) — tests/provenance.test.ts @ dffdaa2: Provenance tests cover binding/verification separation, status handling and digests.

- `EV-CODE-MANIFEST` (code) — spec/lib/manifest.ts @ 2497ed9: Code locator for: CT-001, CT-003, IM-008.

- `EV-CODE-SCHEMA` (code) — spec/lib/schema.ts; spec/lib/ir.ts @ 2497ed9: Code locator for: CT-002.

- `EV-CODE-RELATIONS` (code) — spec/lib/relations.ts @ 2497ed9: Code locator for: CT-003.

- `EV-CODE-PROFILE-DECL` (code) — profiles/core001/profile.json @ 2497ed9: Code locator for: CT-004.

- `EV-CODE-PROVENANCE` (code) — spec/lib/provenance.ts @ 2497ed9: Code locator for: CT-005, CT-006.

- `EV-CODE-ADAPTER` (code) — spec/lib/adapters/markdown.ts @ 2497ed9: Code locator for: CT-006.

- `EV-CODE-HOOK` (code) — spec/lib/hook.ts @ 2497ed9: Code locator for: CT-007.

- `EV-CODE-DIAGNOSTICS` (code) — spec/lib/diagnostics.ts @ 2497ed9: Code locator for: CT-007, IM-002.

- `EV-CODE-RENDER` (code) — spec/lib/render.ts @ 2497ed9: Code locator for: CT-009.

- `EV-CODE-IDENTITY` (code) — spec/lib/identity.ts @ 2497ed9: Code locator for: CT-010, CT-011, CT-014, IM-005, IM-009.

- `EV-CODE-CASES` (code) — profiles/core001/checks/cases.ts @ 2497ed9: Code locator for: CT-015.

- `EV-CODE-BUILD` (code) — spec/lib/build.ts @ 2497ed9: Code locator for: IM-001, IM-003, IM-005, IM-007.

- `EV-CODE-CLI` (code) — spec/cli-renderers.ts @ 2497ed9: Code locator for: IM-006.

- `EV-CODE-CLI-MAP` (code) — spec/build.ts @ 2497ed9: Code locator for: IM-003.

- `EV-CODE-PACKAGE` (code) — package.json @ 2497ed9: Code locator for: IM-001.

- `EV-TEST-MANIFEST` (test) — tests/manifest.test.ts @ 2497ed9: Test evidence for: CT-001, CT-002, CT-003, CT-013, IM-008.

- `EV-TEST-BUILD` (test) — tests/build.test.ts @ 2497ed9: Test evidence for: CT-002, CT-006, IM-001, IM-003.

- `EV-TEST-IR` (test) — tests/ir.test.ts @ 2497ed9: Test evidence for: CT-003, CT-005.

- `EV-TEST-GENERICITY` (test) — tests/genericity.test.ts @ 2497ed9: Test evidence for: CT-004.

- `EV-TEST-PROVENANCE` (test) — tests/provenance.test.ts @ 2497ed9: Test evidence for: CT-005, CT-006.

- `EV-TEST-HOOK` (test) — tests/hook.test.ts @ 2497ed9: Test evidence for: CT-007.

- `EV-TEST-GOLDEN` (test) — tests/golden.test.ts @ 2497ed9: Test evidence for: CT-007, CT-012, IM-002.

- `EV-TEST-RENDERER` (test) — tests/renderer.test.ts @ 2497ed9: Test evidence for: CT-009.

- `EV-TEST-IDENTITY` (test) — tests/identity.test.ts @ 2497ed9: Test evidence for: CT-010, CT-011, CT-014, IM-005, IM-009.

- `EV-TEST-CHECKS` (test) — tests/checks.test.ts @ 2497ed9: Test evidence for: CT-015.

- `EV-TEST-CONSENT` (test) — tests/consent.test.ts @ 2497ed9: Test evidence for: IM-006, IM-007.

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

### DEC-D8-D9 — Diagnostic axes and blocking policy

- Status: `accepted`
- Owner: maintainer
- Source: engine-public-contract D8/D9 (accepted legend)
- Consequence: Diagnostic dispositions and blocking are accepted; CT-008 is grounded.

### DEC-D13 — Independent-verification representation

- Status: `accepted`
- Owner: maintainer
- Source: core-000-decision-record D13 (accepted)
- Consequence: A separate independent_verification kind/record represents external verification; it is not the core provenance record.

### DEC-D24 — Review dimensions

- Status: `proposed`
- Owner: maintainer
- Source: engine-public-contract D24 (proposed; S2.2-B amendment)
- Consequence: Review dimensions are proposed; the S2.2-B amendment permits proposed engine-contract entries as sources for proposed decision entities.

### DEC-D28 — Profile hook trust and identity

- Status: `accepted`
- Owner: maintainer
- Source: engine-public-contract D28 (accepted legend)
- Consequence: Hooks are trusted, digest-pinned and author-owed for determinism.

### DEC-D31 — Path and trust boundary

- Status: `accepted`
- Owner: maintainer
- Source: engine-public-contract D31 (accepted legend)
- Consequence: Paths are root-contained by default; external: true is an explicit trust declaration; outputs stay contained.

### DEC-DESIGN-51 — S2.2 design acceptance (PR #51)

- Status: `accepted`
- Owner: maintainer
- Source: PR #51 design acceptance; per-claim owner-approved list
- Consequence: The 21 named claims are accepted by the design acceptance; each claim is explicitly listed in the S2.2 decision-source table.

### DEC-TASK-C1-C14 — Task constraints C1/C14

- Status: `accepted`
- Owner: maintainer
- Source: Issue #47 task constraints C1/C14
- Consequence: Task-scope constraints C1/C14 are represented as decision entities per design §5.3.1.

### DEC-TASK-C4 — Task constraint C4

- Status: `accepted`
- Owner: maintainer
- Source: Issue #47 task constraint C4
- Consequence: Task constraint C4 is represented as a decision entity per design §5.3.1.

### DEC-TASK-C5 — Task constraint C5

- Status: `accepted`
- Owner: maintainer
- Source: Issue #47 task constraint C5
- Consequence: Task constraint C5 is represented as a decision entity per design §5.3.1.

### DEC-TASK-C7 — Task constraint C7

- Status: `accepted`
- Owner: maintainer
- Source: Issue #47 task constraint C7
- Consequence: Task constraint C7 is represented as a decision entity per design §5.3.1.

### DEC-DEFER-019 — Multiple renderers/artifacts deferred

- Status: `deferred`
- Owner: maintainer
- Source: design §4.2 row; PR #56
- Consequence: Multiple renderers and artifacts are deferred; the Artifact[] shape remains forward-compatible.

### DEC-DEFER-023 — Full self-hosting deferred

- Status: `deferred`
- Owner: maintainer
- Source: design §4.2 row; PR #51
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
