# CORE-000 execution plan — bounded self-validation experiment

**Status:** accepted plan (PR #59). Revision 3 records the 2026-11-02 maintainer decision for the
bounded S1 package. Decision/planning record only: this document does not create the CORE-000
project or profile, does not change code, tests, schemas, fixtures or generated artifacts, and does
not start the experiment.
**Issue:** [#47](https://github.com/agent-federation/contract-builder/issues/47).
**Revision 2 (Issue [#72](https://github.com/agent-federation/contract-builder/issues/72)):**
refreshes the baseline and adds the ephemeral PoC mode and the first-slice proposal. The body below
is based on the accepted plan text (PR #59); revision-2 changes are marked in §1, §7.1, §8, §9, §11
and §12, and the companion documents are
[`core-000-baseline-refresh.md`](core-000-baseline-refresh.md) and
[`core-000-self-build-poc.md`](core-000-self-build-poc.md).
**Revision 3 (maintainer decision, 2026-11-02):** D1 A, D13 A, D15 A, P-1 B, P-4 A and P-5 A are
accepted; D14, P-2, P-3 and P-6 are explicitly deferred for S1; the bounded consumer harness is
confirmed for S1; G4 and the generic CLI/API gap remain open, and harness use is not independent
verification. S1 implementation is authorized only after the canonical
decision-record update is merged and a dedicated implementation task references it. The decision
was recorded after PR #74 merged as `1c405c2`; this follow-up is documentation-only and changes no
engine or profile behaviour. No implementation is included here.
**Design baseline:** the merged design at
[`cc645357646fe57e2bdedb1d215ae87b79e16501`](https://github.com/agent-federation/contract-builder/commit/cc645357646fe57e2bdedb1d215ae87b79e16501)
(PR #51).
**Refreshed baseline:** `c6ee64416c91ab56f9d8270114c8f8a8b9d2f608` (PR #73), current `main` at
2026-11-02; see §1 and the baseline refresh.
**Accepted design:** [`core-000-self-contract.md`](core-000-self-contract.md). Its 78 claims,
14 kinds, 29 relation declarations, 24 profile policy checks, zero independently verified claims
and open decisions D1–D15 are the baseline. This plan operationalises the design's experiment; it
does not re-open settled design choices.

---

## 0. What this plan is and is not

This plan is the execution-ready bridge between the accepted design and a future implementation
PR. It defines:

1. the exact proposed inputs and file/artifact layout, separating existing repository files from
   new proposed artifacts;
2. the mapping from each run to the existing `runBuild` pipeline and its internal phases;
3. a minimal positive/negative run matrix, including fail-closed consent, provenance binding versus
   verification, and the single `manifest.render` target;
4. the evidence class of each result and the explicit limit of self-build evidence;
5. commands, reproducibility checks, expected artifacts and the evidence-capture format;
6. generic-core gaps with exact repository evidence and separate follow-up proposals;
7. the accepted design's open decisions and the maintainer input needed before implementation.

It is **not** an implementation. No CORE-000 file, profile, schema, fixture, test, evidence record
or generated artifact is created by this plan. Execution starts only after this plan is reviewed
and explicitly accepted.

---

## 1. Baseline and constraints

| Fact | Value at this baseline |
|---|---|
| Design merge / original plan baseline | `cc645357646fe57e2bdedb1d215ae87b79e16501` (PR #51) |
| Refreshed baseline (revision 2) | `c6ee64416c91ab56f9d8270114c8f8a8b9d2f608` (PR #73), current `main` at 2026-11-02 |
| Accepted design | `docs/architecture/core-000-self-contract.md` |
| Design register | 78 claims: 37 accepted decisions, 27 implemented, 27 tested, 0 independently verified |
| Model | 14 kinds; 29 relation declarations (12 reciprocal pairs + 5 without an inverse); 24 profile policy checks |
| Trust policy | executable profiles require explicit consent; `allowExecutableProfile` defaults false; no sandbox/isolation; consent is not in `inputDigest` |
| Provenance | binding and verification are separate; the profile exports `verifyProvenance`; a `verified` record is not independent verification |
| Render | exactly one `manifest.render` declaration; one artifact per build in M1 |
| Current checks | `bun test` 292 pass / 0 fail (21 files; 169 engine + 123 PAP); typecheck clean; `bun run check` clean; `bun run build:release` exits 1 by design; CORE-001 artifact `8213a26379f1fb6e7227ce90a9db6db08e3820bd42a579eb38c2adf5dc269b51` (327 lines); `bun.lock` SHA-256 `9ab1d388…` |
| Environment | local Bun 1.4.4; pinned/CI Bun 1.4.2; Linux x86_64. The local Bun difference is a recorded deviation |
| PAP | independent v0.1 verifier implemented under `pap/`; Tier B; Gate 3 passed for PAP Phase 2a (2026-11-04, [`ODR-PAP-005`](../decisions/ODR-PAP-005-gate-3-closure-phase-2a.md)); separate product boundary; no demonstrated CORE-000 impact |

**Revision 2 note (proposed).** The original plan baseline was `cc64535`; the refreshed baseline is
`c6ee644`. `spec/` and `profiles/` are unchanged between the two, `bun.lock` is unchanged and the
CORE-001 artifact is unchanged, so the plan's interfaces, dependencies and expected outputs stand.
The test-count baseline moved because `bun test` now also discovers the PAP suite; the engine-only
count remains 169/12. See [`core-000-baseline-refresh.md`](core-000-baseline-refresh.md).

**Binding constraints for execution.**

- Use only the existing generic pipeline (`runBuild` and its modules). No generic-core change.
- Do not implement a sandbox, independent verifier, Portable Assurance Package, package split,
  publication process or broad architecture change.
- Do not claim that a successful self-build is independent verification or certification.
- Preserve the accepted design's open decisions; do not silently resolve them.
- No CORE-001 normative content changes.
- The implementation must remain reviewable as separate, focused PRs after this plan is accepted.

---

## 2. Existing files versus new proposed artifacts

### 2.1 Existing files used as-is (no changes in the execution work)

| Path | Why it matters |
|---|---|
| `spec/lib/build.ts` | `runBuild`, consent gate, closure preflight, `verifyProvenance`, one-render guard, artifact handling |
| `spec/lib/manifest.ts` | manifest/profile validation, one `render` declaration, path containment |
| `spec/lib/identity.ts` | profile closure validation and `inputDigest` |
| `spec/lib/schema.ts` | schema `$id` loading; document and entity validation |
| `spec/lib/ir.ts`, `relations.ts`, `provenance.ts` | extraction, reciprocal relations, binding and `Entity.verification` |
| `spec/lib/hook.ts` | `validate` and optional `verifyProvenance` contracts |
| `spec/lib/render.ts` | renderer registry, `TemplateSet`, artifact normalization |
| `profiles/example/`, `tests/example-profile.test.ts`, `tests/support.ts` | working profile/harness pattern to copy, not modify |
| `package.json`, `bun.lock` | scripts and the exact `nunjucks` 3.2.4 lock entry |
| `docs/architecture/engine-public-contract.md`, `implementation-status.md`, `build-identity.md` | accepted contract and evidence sources |
| `docs/architecture/core-000-self-contract.md` | accepted design and claims to encode |

### 2.2 New proposed artifacts (created only after plan acceptance)

| Path | Kind | Purpose |
|---|---|---|
| `contracts/core000/contract-builder.json` | project input | manifest |
| `contracts/core000/structure.yml` | project input | components, interfaces, phases, transitions, extension points, trust boundary, diagnostics, dependencies |
| `contracts/core000/claims.yml` | project input | source statements, 78 claims, evidence, independent-verification records (initially empty), decisions, conformance cases (initially empty) |
| `contracts/core000/output/CORE-000.draft.md` | generated artifact | generated draft; committed only if the maintainer approves the artifact rule for this project |
| `contracts/core000/mutations.ts` | test support | deterministic, named mutations for the negative cases; not a project input and not profile code |
| `contracts/core000/run.ts` | consumer harness | positive/negative mutation runs; calls `runBuild` with consent and the CORE-000 renderer; writes run evidence JSON. Not used for N14 (see §4.1). |
| `profiles/core000/profile.json` | profile | 14 kinds, 29 relation declarations, 16 schemas, documents, provenance, files, dependencies, view/validator/diagnostics |
| `profiles/core000/catalog.json` | profile | 24 CORE-000 diagnostic codes in the M1 catalog shape |
| `profiles/core000/view.ts` | profile executable | builds the artifact view |
| `profiles/core000/validator.ts` | profile executable | exports `validate` and `verifyProvenance` |
| `profiles/core000/checks/claim-evidence.ts` | profile executable | claim/evidence/decision/independent-verification policy |
| `profiles/core000/checks/trust-policy.ts` | profile executable | settled consent facts and trust-claim consistency |
| `profiles/core000/checks/provenance-verification.ts` | profile executable | reads stored `Entity.verification`; does not call the adapter again |
| `profiles/core000/renderer.ts` | profile executable | `core000-markdown` renderer, `nunjucks` 3.2.4 |
| `profiles/core000/templates/core000.md.j2` | profile | artifact template |
| `profiles/core000/schemas/structure.schema.json` | profile schema | validates `structure.yml` as a whole |
| `profiles/core000/schemas/claims.schema.json` | profile schema | validates `claims.yml` as a whole |
| `profiles/core000/schemas/<kind>.schema.json` | profile schemas | 14 entity schemas, one per kind |
| `tests/core000.test.ts` | test/harness | CI assertions for positive/negative runs and evidence capture |
| `evidence/core000/<run>/result.json` | evidence | machine-readable run evidence |
| `docs/architecture/core-000-execution-evidence.md` | evidence summary | human-readable run summary and links |
| `verification/core000/` | future evidence | independent-verification records; never generated by the engine |

**Not proposed:** changes to `spec/lib/`, the CLI renderer wiring, `profiles/core001`,
`profiles/example`, CORE-001 inputs, `spec/output/CORE-001.draft.md`, the public contract or the M1
plan.

---

## 3. Proposed project and profile layout

### 3.1 Tree

```text
contracts/core000/                         # project root (D1 A accepted 2026-11-02)
  contract-builder.json
  structure.yml
  claims.yml
  run.ts
  output/
    CORE-000.draft.md                      # generated
  mutations.ts
profiles/core000/                          # profile (outside the project root; external: true)
  profile.json
  catalog.json
  view.ts
  validator.ts
  checks/claim-evidence.ts
  checks/trust-policy.ts
  checks/provenance-verification.ts
  renderer.ts
  templates/core000.md.j2
  schemas/structure.schema.json
  schemas/claims.schema.json
  schemas/<one per kind>.schema.json       # 14 entity schemas
tests/core000.test.ts
evidence/core000/<run>/result.json
docs/architecture/core-000-execution-evidence.md
verification/core000/                      # future independent records
```

### 3.2 Manifest (exact shape)

The manifest is `contracts/core000/contract-builder.json`; paths are relative to the project root.

```json
{
  "manifestVersion": "0.1",
  "project": {
    "id": "core-000-self-contract",
    "title": "Contract Builder Engine public self-contract",
    "revision": "0.1.0"
  },
  "profile": {
    "id": "core000",
    "version": "0.1.0",
    "source": "../../profiles/core000",
    "external": true
  },
  "inputs": [
    {
      "path": "structure.yml",
      "format": "yaml",
      "schema": "core000:structure",
      "entities": [
        { "kind": "component", "pointer": "/components" },
        { "kind": "interface", "pointer": "/interfaces" },
        { "kind": "phase", "pointer": "/phases" },
        { "kind": "transition", "pointer": "/transitions" },
        { "kind": "extension_point", "pointer": "/extensionPoints" },
        { "kind": "trust_boundary", "pointer": "/trustBoundaries" },
        { "kind": "diagnostic", "pointer": "/diagnostics" },
        { "kind": "dependency", "pointer": "/dependencies" }
      ]
    },
    {
      "path": "claims.yml",
      "format": "yaml",
      "schema": "core000:claims",
      "entities": [
        { "kind": "source_statement", "pointer": "/sourceStatements" },
        { "kind": "claim", "pointer": "/claims" },
        { "kind": "evidence", "pointer": "/evidence" },
        { "kind": "independent_verification", "pointer": "/independentVerifications" },
        { "kind": "decision", "pointer": "/decisions" },
        { "kind": "conformance_case", "pointer": "/conformanceCases" }
      ]
    }
  ],
  "sources": [
    {
      "id": "SRC-ENGINE-CONTRACT",
      "path": "../../docs/architecture/engine-public-contract.md",
      "adapter": "markdown",
      "external": true,
      "identity": { "document": "Contract Builder Engine — Public Contract", "revision": "0.4" }
    }
  ],
  "render": [
    {
      "renderer": "core000-markdown",
      "template": "profile:templates/core000.md.j2",
      "outputs": {
        "draft": "output/CORE-000.draft.md",
        "release": "output/CORE-000.md"
      }
    }
  ],
  "output": { "root": "." }
}
```

The manifest has exactly one `render` declaration. The project root is `contracts/core000`; the
profile and source are outside it and therefore use `external: true`. `allowExecutableProfile` is
**not** a manifest field: the caller passes it to `runBuild` (or the CLI flag), and it is not part
of `inputDigest`.

### 3.3 Profile declaration

Use the accepted design's §5.8 `profile.json` as the source of truth, with these exact
requirements:

- `entityKinds`: the 14 accepted kinds (`component`, `interface`, `phase`, `transition`,
  `source_statement`, `claim`, `evidence`, `independent_verification`, `decision`,
  `trust_boundary`, `dependency`, `extension_point`, `diagnostic`, `conformance_case`).
- `schemas`: `core000:structure`, `core000:claims`, and one `core000:<kind>` per kind. Every schema
  file declares a real versioned `$id` such as
  `https://core000.local/schemas/claim.schema.json`; document schemas may `$ref` entity schemas by
  `$id`.
- `documents`: `{ "key": "structure", "input": "structure.yml" }` and
  `{ "key": "claims", "input": "claims.yml" }`.
- `relations`: the 29 declarations (the 28 from design §5.4 plus the owner-approved
  `hasPrerequisite` relation), including both halves of every reciprocal pair; the five no-inverse
  declarations are `startsAt`, `endsAt`, `subject`, `raisedIn`, `hasPrerequisite`.
- `provenance`: `{ "kind": "source_statement", "source": "source", "ref": "source_ref",
  "quote": "source_quote" }`.
- `files`: every profile file whose bytes affect the build: `profile.json`, `catalog.json`,
  `view.ts`, `validator.ts`, the three `checks/*.ts` modules, `renderer.ts` and
  `templates/core000.md.j2`, plus all 16 schema files.
- `dependencies`: `{ "nunjucks": "3.2.4" }`, matching `bun.lock`; no new dependency. If the
  renderer is implemented without `nunjucks`, the dependency and renderer files must change
  together, and the plan's renderer decision must be recorded.
- `view`, `validator`, `diagnostics` point at the files above. `validator.ts` exports both
  `validate(model, ctx)` and `verifyProvenance(model, ctx)`.

The profile's entity schemas must allow the reserved names (`id`, `kind`, `type`, `provenance`,
`verification`, `relations`, `review`) and may use `additionalProperties: false` for profile
fields. The document schemas validate the complete input files; entity schemas validate each
extracted object.

### 3.4 Input data content

The project data is a direct encoding of the accepted design, not new normative content:

- `structure.yml` contains the design's public components, interfaces, lifecycle phases and
  transitions, extension points, the settled `TB-PROFILE-EXEC` trust boundary, the 25 CORE-000
  diagnostic entries (24 catalog codes plus 1 core-owned) and the dependency/extension rows. Every
  entity has an ID from the design's vocabulary; no private module names become claims.
- `claims.yml` contains the 78 `C000-*` claims from design §4.2 with the same IDs, classes,
  decision/implementation/tests/verification dimensions, evidence methods and relations;
  `sourceStatements` for the contract quotes used by `cites`; `evidence` rows for the cited code,
  test, CI, source and analysis locators; and the decision entities referenced by `decidedBy`.
- `independentVerifications` starts empty: no claim is independently verified. The positive run is
  expected to emit `core000.independent-verification.missing` review diagnostics; release remains
  blocked.
- `conformanceCases` may start empty; the N1–N18 run matrix is executed by the harness, not by
  project conformance execution (which is deferred).
- `claims.yml` must not invent a claim or entity that the accepted design does not contain. If an
  encoding question requires a new claim or a new decision, stop and ask the maintainer; do not
  add it silently.

The single source is `SRC-ENGINE-CONTRACT`. The source statement quote is verbatim and uses the
current markdown adapter grammar (`#<section>`, `#<section>/table/<column>`, `#<section>/<item>`).
`sourceDigest` is the SHA-256 of the bytes the verifier checked; the accepted `identity.sha256`
pin (V4) is not implemented, so the record does not prove the source was unchanged across runs.

---

## 4. Pipeline and lifecycle-phase mapping

The experiment uses `runBuild(BuildOptions)` from `spec/lib/build.ts`. The current M1 pipeline
order is:

| Step | Code path / entry point | Internal phase | Expected output or diagnostic at this step |
|---|---|---|---|
| 1 | `loadProject` → `loadManifest` | load | parsed manifest/profile; `core.manifest.invalid` for zero/multiple `render`; path/profile diagnostics |
| 2 | `hasExecutableProfileConsent` | orchestration before closure/import | `core.profile.consent-required` when consent is absent; no profile code evaluated |
| 3 | `validateProfileClosure` | load/accounting | `core.extension.unpinned-dependency` for undeclared/unpinned files; `ERR_IO` if the lockfile cannot be read |
| 4 | `resolveOutputPath` | load | `core.path.outside-root` if output escapes |
| 5 | `loadSchemas` | structure | `core.schema.*` / `ERR_SCHEMA_DEFINITION` for missing/unparsable/`$id`-less schemas |
| 6 | `validateDocuments` | structure | `ERR_SCHEMA` for a document that fails its schema |
| 7 | `buildProjectModel` extraction | structure | `core.extract.pointer`, `core.profile.unknown-kind`, `ERR_SCHEMA` |
| 8 | identity/index | structure/reference | `core.identity.missing`, `ERR_DUPLICATE_ID` |
| 9 | relations | reference | `core.relation.unknown`, `ERR_UNKNOWN_REF`, `core.relation.cardinality`, `core.profile.invalid` for a non-reciprocal inverse |
| 10 | `bindProvenance` | provenance | `core.provenance.incomplete`, `ERR_UNKNOWN_REF`; a `not-checked` record on every binding |
| 11 | `verifyProvenance` + `applyVerificationClaims` | verification | `core.provenance.verification` for a malformed claim; a stored `verified`/`failed`/`unavailable`/`stale` record |
| 12 | `buildView` + `validate` + `resolveFindings` | consistency/review | CORE-000 policy codes from §5.7 of the design; `core.profile.unknown-code` |
| 13 | `loadRenderInputs` + renderer resolution | artifact | `core.registry.missing`; template/label errors |
| 14 | `computeBuildIdentity` | artifact | `BuildResult.identity`; `null` when the build stops earlier |
| 15 | render, path check, artifact count | artifact | `core.render.invalid` (path/one-artifact), `core.render.failed`, normalized bytes |
| 16 | draft/release/strict blocking, `check`, write | artifact | exit 0/1, `blockedBy`, `ERR_OUTPUT_STALE`; release writes nothing |

**Phase caveat.** `Phase` is an internal type in the contract; the current M1 `Diagnostic` record
is `{ severity: "error" | "warning" | "review", code, file, pointer, message }` and has **no**
`phase`, `disposition` or `data` field. The run matrix therefore maps diagnostics by code and
pipeline step, not by an observable phase field. The design's contract-shape diagnostic is
deferred (matrix G2); this plan does not change it.

**Entry points.**

- Primary positive/negative runs: `contracts/core000/run.ts` calls `runBuild` with
  `allowExecutableProfile: true` and `renderers: { "core000-markdown": core000Renderer }`.
- CI assertions: `tests/core000.test.ts` calls the same `runBuild` path (or imports a helper from
  `run.ts`); it does not use a private pipeline call.
- CLI use is limited:
  - `bun spec/build.ts --spec contracts/core000 --no-write --json` (without the consent flag)
    exercises N14 and is expected to fail with `core.profile.consent-required`;
  - with `--allow-executable-profile` the CLI still has no CORE-000 renderer, so a positive run
    is expected to fail with `core.registry.missing` (gap G4); this is a CLI probe, not a
    positive self-build;
  - the CLI is not modified in this plan.

### 4.1 Consent-boundary run (N14)

The positive harness statically imports the CORE-000 renderer at module load; every positive run
passes consent, but the import is the consumer's own trust decision. It is **not** evidence for the
consent boundary and must not be used for N14.

**Revision 2 correction (Issue #72, proposed):** the earlier N14 wording used a renderer marker as
proof. That was wrong. The CORE-000 renderer is consumer-supplied: `runBuild` never imports it, and
the CLI leaves the registry empty for a CORE-000 project, so a renderer marker could be absent even
if the consent gate failed. N14 therefore proves the boundary for the modules the engine imports,
`view` and `validator`. Consumer-supplied renderer loading is a separate trust boundary owned by
the consumer and is **not** gated by `allowExecutableProfile`.

N14 runs through the CLI without `--allow-executable-profile`:

- `spec/cli-renderers.ts` imports the built-in renderer only when the selected project declares
  profile `core001` and renderer `core001-markdown`; a CORE-000 project leaves the registry empty,
  and no CORE-000 renderer is loaded by the CLI. **Amended 2026-11-07:** superseded by
  [ODR-ENG-002](../decisions/ODR-ENG-002-consumer-supplied-renderer.md) / [#223](https://github.com/agent-federation/contract-builder/issues/223);
  the CLI now imports the consumer-named renderer module and registers nothing without it.
- `runBuild` checks consent after loading the manifest/profile and before the closure scan and any
  profile `import()`, so `view` and `validator` are not evaluated.
- The N14 test copies the positive project/profile to a temporary directory, adds a
  module-evaluation marker (a marker-file write) to `view.ts` and `validator.ts` only, runs the CLI
  in a subprocess, and asserts `core.profile.consent-required`, exit 1, `identity: null`,
  `markdown: null`, and **both markers absent**. A renderer marker is not used and would not
  demonstrate the gate.
- The marker edit is test-only in the temporary copy and is not committed to the profile.

The positive harness may statically import the renderer because every positive run is an explicit
consent run; its import order is not a claim about the no-consent path. The harness's renderer
import is the consumer's own trust decision, not the engine's consent gate.

---

## 5. Run matrix

**Order.** Run the checks in the listed order: P1 first, then the pre-import negatives (N14, N16,
N17), then the core/project negatives, then the profile negatives, then P2–P5. Every negative run
starts from a fresh temporary copy of the positive project and applies exactly one mutation from
`contracts/core000/mutations.ts`; no case combines multiple mutations and no run writes to the
repository. The N14 case is the exception: it uses the CLI and no mutation, because the consent
gate must be exercised before any CORE-000 renderer import.

**Common expectations.** Every negative run exits 1 with `blockedBy: "errors"`, writes no
artifact, and must not be classified as independent verification. N16/N17 fail during load before
profile code; N14 fails at the consent gate before profile code. All other negatives pass consent
and reach the named layer.

### 5.1 Positive runs

| ID | Project / input | Entry point and options | Expected result | Demonstrates | Does not establish |
|---|---|---|---|---|---|
| P1 | `contracts/core000` | `run.ts --mode draft --write false`; consent true; CORE-000 renderer | exit 0, `blockedBy: null`, identity non-null, artifact bytes; expected review codes only (`core000.independent-verification.missing`, `core000.decision.unresolved`; actual count recorded) | structural consistency, profile-policy compliance, implementation behavior (consent/verification called) | independent verification, correctness, security, cross-platform determinism |
| P2 | P1 in a second process | same command, separate process | same `identity.inputDigest` and artifact SHA-256 as P1 | same-environment determinism under the conditional guarantee | cross-platform determinism; extension purity |
| P3 | `contracts/core000` | `run.ts --mode release --write false`; consent true | exit 1, `blockedBy: "review"`, no release artifact | release gating of unverified claims/open decisions | that the design is incorrect; that approval is independent verification |
| P4 | P1 draft artifact | write the draft in a temp output root, then `run.ts --mode draft --check true` | no `ERR_OUTPUT_STALE`; artifact bytes match | artifact/model consistency at the recorded revision | correctness of the model or artifact |
| P5 | P1 with one claim/evidence row changed in a temp copy | `run.ts --mode draft --mutation claim`; consent true | `inputDigest` changes; artifact changes; no crash | identity sensitivity to declared inputs | that the digest is complete or that every code change is covered |

The positive draft is expected to contain review diagnostics, not zero diagnostics. The exact
count depends on the 78-claim register and its open decisions; tests assert the expected **code
set**, not a hard-coded count.

**Identifier note (revision 2, proposed).** P1–P5 here are positive-check IDs and are unrelated to
maintainer decisions P-1–P-6. The first-slice proposal renames them S1-POS-01–S1-POS-05 to make
that separation explicit.

### 5.2 Negative runs — core and project boundary

| ID | Fixture/mutation | Entry point/options | Expected diagnostic(s) | Layer/class |
|---|---|---|---|---|
| N14 | positive project copy with view/validator evaluation markers, no consent | CLI `bun spec/build.ts --spec <copy> --no-write --json` (no flag) | `core.profile.consent-required`; `identity: null`, `markdown: null`; view and validator markers absent; no CORE-000 renderer is in the CLI path | core, load/consent; implementation behavior |
| N16 | profile with a non-reciprocal inverse | `run.ts --mutation non-reciprocal-inverse` | `core.profile.invalid` | core, load/profile; structural |
| N17 | manifest with zero or two `render` declarations | `run.ts --mutation render-cardinality` | `core.manifest.invalid` | core, load; structural |
| N2 | claim `dependsOn` a missing claim/relation | `run.ts --mutation unresolved-relation` | `ERR_UNKNOWN_REF` | core, reference; structural |
| N5 | duplicate claim ID | `run.ts --mutation duplicate-id` | `ERR_DUPLICATE_ID` | core, structure/index; structural |
| N6 | pointer declares an undeclared kind | `run.ts --mutation unknown-kind` | `core.profile.unknown-kind` | core, extraction; structural |
| N7 | undeclared key inside `relations` | `run.ts --mutation undeclared-relation` | `core.relation.unknown` | core, reference; structural |

### 5.3 Negative runs — CORE-000 profile policy

| ID | Fixture/mutation | Entry point/options | Expected diagnostic(s) | Layer/class |
|---|---|---|---|---|
| N1 | interface `owner` not provided by its component | `run.ts --mutation interface-owner` | `core000.model.interface-owner-mismatch` | profile, consistency; policy |
| N3 | implemented claim without code/test/CI evidence | `run.ts --mutation implemented-without-evidence` | `core000.claim.implemented-without-evidence` | profile, consistency; policy |
| N4a | accepted guarantee without conditions/evidence | `run.ts --mutation unsupported-guarantee` | `core000.claim.unsupported-guarantee` | profile, consistency; policy |
| N4b | `verification: independently_verified` with no valid independent record | `run.ts --mutation independent-verification-missing` | `core000.claim.verification-not-independent` | profile, consistency; policy |
| N8 | quote exists outside the declared locator; verifier returns `failed`/`outside` | `run.ts --mutation quote-outside` | `core000.source.verification-failed` | profile, verification; policy |
| N9 | independent verification claims self/author independence or a record inside the project | `run.ts --mutation self-asserted-independence` | `core000.independent-verification.self` / `core000.claim.verification-not-independent` | profile, consistency; policy |
| N10 | claim says consent is pending/absent or sandboxed | `run.ts --mutation consent-contradiction` | `core000.claim.policy-mismatch` | profile, consistency; policy |
| N11 | claim decision and `decidedBy` status mismatch | `run.ts --mutation decision-mismatch` | `core000.claim.decision-required` (+ `core000.decision.unresolved` when an unresolved decision is involved) | profile, consistency; policy |
| N12 | class/status contradiction | `run.ts --mutation status-class-conflict` | `core000.claim.status-class-conflict` | profile, consistency; policy |
| N13 | missing/mismatched `subject` | `run.ts --mutation missing-subject` | `core000.claim.missing-subject` / `core000.claim.subject-kind-mismatch` | profile, consistency; policy |
| N15 | a `source_statement` has no stored verification or the record is unavailable/stale | `run.ts --mutation verification-missing` | `core000.source.verification-missing` / `core000.source.verification-unavailable` | profile, verification; policy |
| N18 | malformed provenance-verification claim (no verifier, method none, no digest) or a digest that differs from the loaded source | `run.ts --mutation malformed-verification` | (a) `core.provenance.verification` for the malformed claim; (b) a stored `stale` record plus `core000.source.verification-failed` for the digest mismatch | core/profile, verification; implementation behavior/policy |

**CLI probe C1.** `bun spec/build.ts --spec contracts/core000 --mode draft --no-write --json
--allow-executable-profile` is expected to fail with `core.registry.missing`, because the CLI
only wires the CORE-001 renderer. It is recorded as evidence of gap G4, not as a CORE-000
positive run. The CLI **without** the consent flag is N14 and must fail earlier with
`core.profile.consent-required`.

---

## 6. Evidence capture and classification

### 6.1 Evidence classes

| Class | What it is | Produced by | What it cannot show |
|---|---|---|---|
| Structural consistency | schemas, identity uniqueness, reciprocal relations, binding shape, one render declaration | generic core | semantic truth, claim completeness |
| Profile policy compliance | claim/evidence/decision/trust/provenance-verification rules | CORE-000 profile hook | that the hook is correct or independent |
| Implementation behavior | consent fail-closed, CLI renderer wiring, one adapter call per binding, test/CI results | code and tests | independent correctness or security |
| Independent verification | a verifier distinct from the author checks claims against evidence | external reviewer/harness | certification, truth beyond scope, legal effect |

No run in this matrix produces the fourth class. The positive build is self-consistency and
implementation evidence only. A `verified` provenance record is a method-specific binding check,
not independent verification.

### 6.2 Run evidence record

Each run writes one transient JSON record. This is the required base shape; S1 may add evidence
fields but must retain these. It is not a P-2 decision: P-2 decides only durable
publication/location and the human-readable summary format. Proposed shape (no absolute paths, no
secret data):

```json
{
  "run": "P1",
  "commit": "<pinned-commit>",
  "project": "contracts/core000",
  "mode": "draft",
  "allowExecutableProfile": true,
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
    { "code": "core000.independent-verification.missing", "severity": "review", "file": "claims.yml", "pointer": "/claims/0", "message": "..." }
  ],
  "expected": { "exitCode": 0, "blockedBy": null, "codes": ["core000.independent-verification.missing", "core000.decision.unresolved"] },
  "classification": ["structural", "profile_policy", "implementation_behavior"],
  "limitations": ["self-build only; no independent verification"]
}
```

Rules:

- `diagnostics` is the deterministic `BuildResult.diagnostics` array, not a screenshot or a
  re-sorted copy.
- `artifactSha256` is the SHA-256 of the exact normalized artifact bytes; when the run is blocked,
  it is `null`.
- `inputDigest` is `BuildResult.identity.inputDigest`; `identity` is `null` when the build stops
  early.
- The record may include the commit and date, but not absolute paths, hostnames, environment
  values, tokens or private material.
- The transient record is produced per run. Durable publication to
  `evidence/core000/<run>/result.json` and the human summary in
  `docs/architecture/core-000-execution-evidence.md` are P-2 decisions; the transient record and
  its schema assertion are required even if P-2 is deferred.
- Independent verification records, when they exist, go under `verification/core000/` and are
  authored/reviewed outside the engine; they are not generated by `run.ts`.

### 6.3 Evidence classification by run

- P1 classifies as structural + profile policy + implementation behavior.
- P2/P4/P5 classify as implementation behavior (same-environment determinism, artifact check,
  identity sensitivity); none is independent.
- P3 is profile policy/release-gate behavior.
- N14/N16/N17/N2/N5/N6/N7 classify as core structural/implementation behavior.
- N1/N3/N4a/N4b/N8/N9/N10/N11/N12/N13/N15 classify as profile policy compliance.
- N18 classifies as core provenance-verification behavior.
- No row is `independently_verified`.

---

## 7. Commands, reproducibility and expected artifacts

### 7.1 Setup and repository checks

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
bun run check
```

The CORE-001 artifact must remain
`8213a26379f1fb6e7227ce90a9db6db08e3820bd42a579eb38c2adf5dc269b51` (327 lines). At the refreshed
baseline `bun test` reports 292 pass / 0 fail (21 files; 169 engine + 123 PAP), and
`bun run pap:test` reports 123 pass / 0 fail (9 files). The engine-only count remains 169/12. No
CORE-000 implementation file is covered by these checks until the execution PRs land.

### 7.2 Proposed CORE-000 commands (after implementation)

```bash
# Positive baseline, draft, no repository write
bun contracts/core000/run.ts --mode draft --write false --evidence evidence/core000/P1/result.json

# Same run in a second process
bun contracts/core000/run.ts --mode draft --write false --evidence evidence/core000/P2/result.json

# Release gate
bun contracts/core000/run.ts --mode release --write false --evidence evidence/core000/P3/result.json

# Check option (not a BuildMode) after writing the draft to a temporary output root
bun contracts/core000/run.ts --mode draft --write true --output-root /tmp/core000-check --evidence evidence/core000/P4a/result.json
# both P4 commands use the same temp project directory: the first writes, the second checks
bun contracts/core000/run.ts --mode draft --check true --output-root /tmp/core000-check --evidence evidence/core000/P4b/result.json

# One-claim mutation in a temporary copy
bun contracts/core000/run.ts --mode draft --mutation claim --write false --evidence evidence/core000/P5/result.json

# Negative mutations: fresh temp copy + exactly one named mutation
bun contracts/core000/run.ts --mutation non-reciprocal-inverse --evidence evidence/core000/N16/result.json
# ... one command per N case; the harness records the expected/observed codes

# N14: CLI without consent; profile view/validator are never imported; no CORE-000 renderer is in the CLI path
bun spec/build.ts --spec /tmp/core000-n14-copy --no-write --json              # core.profile.consent-required
# CLI probe C1: consent given, but the CLI only wires the CORE-001 renderer
bun spec/build.ts --spec contracts/core000 --no-write --json --allow-executable-profile  # core.registry.missing (G4)
```

The exact CLI flags of `run.ts` are a design detail; the invariant is that it calls `runBuild`
with `allowExecutableProfile: true` (except N14), passes the CORE-000 renderer registry, and never
bypasses the public pipeline. `--output-root` and `--mutation` are harness features: the harness
copies the project to a temporary directory and rewrites the manifest output root or mutates the
temp copy; they are not `runBuild` options. The P4 check run therefore writes to the temp copy,
not to `contracts/core000/output/`.

### 7.3 Reproducibility checks

1. Run P1 twice in separate `bun` processes; compare `identity.inputDigest`, `artifactSha256` and
   the diagnostic code/order. Byte equality is claimed only for the same engine version,
   `inputDigest` and extension identities under the contract's conditional determinism.
2. Run P4 write and check; `ERR_OUTPUT_STALE` must be absent.
3. Run P5; `inputDigest` and artifact must change, and the change must be attributable to the
   declared input.
4. Keep the CORE-001 artifact unchanged (`bun run check`).
5. Do not claim cross-platform reproducibility, hermeticity or security from these checks.

### 7.4 Expected artifacts

- `contracts/core000/output/CORE-000.draft.md` — generated draft; commit only if the maintainer
  approves committing generated artifacts for this project.
- `evidence/core000/<run>/result.json` — one per run when P-2 selects durable publication; the
  transient record is required regardless.
- `docs/architecture/core-000-execution-evidence.md` — human-readable summary when P-2 selects
  that summary format; the transient record's schema assertion is required regardless.
- Release and negative runs write no artifact; P4 uses a temp output root.
- The independent-verification record is external and is not produced by any run.

---

## 8. Blockers and generic-core gaps

No core change is required for the bounded experiment if the consumer harness is accepted. The
following gaps are recorded with exact evidence and are **separate proposals**; this plan does not
implement them.

| ID | Observation / exact evidence | Effect on this plan | Workaround in the plan | Separate proposal |
|---|---|---|---|---|
| G4 | The CLI wires only the CORE-001 renderer (`spec/cli-renderers.ts`: profile `core001`, renderer `core001-markdown`); **amended 2026-11-07 — the CLI now imports the consumer-named renderer module, see [ODR-ENG-002](../decisions/ODR-ENG-002-consumer-supplied-renderer.md) / #223**; there is no generic profile-selection CLI and the package is private (`package.json`). The PAP verifier under `pap/` is a separate product boundary and does not provide a CORE-000 CLI or renderer selection. | A positive CORE-000 build cannot run through the CLI. | Use `contracts/core000/run.ts` / `tests/core000.test.ts` as the consumer harness. | Implement the M2 public API/CLI and generic renderer selection. |
| G1 | `inputDigest` covers declared inputs, sources, profile closure and extension closures (`spec/lib/identity.ts`); it does not cover code/test files cited as evidence. | Code/test evidence can go stale without changing the digest. | Pin evidence revisions; external review re-checks them; do not treat evidence as build-covered. | Add evidence-file inputs or a raw-file adapter with digest coverage. |
| G2 | No declarative cross-entity rule primitives are implemented; the profile hook is the M1 mechanism (`spec/lib/hook.ts`). | CORE-000 policy lives in a trusted in-process hook. | Profile hook `validate`; no core change. | Revisit primitives after the M3 second profile. |
| G3 | Markdown locators are section/table/item only; the declared source-byte pin and paragraph locators are accepted but unimplemented (V4; `spec/lib/adapters/markdown.ts`, `spec/lib/manifest.ts`). | Claim provenance is coarse; `sourceDigest` records bytes checked but is not a declared pin. | Use current locators; label precision; external review checks context. | Implement provenance hardening (#4/#45) separately. |
| G5 | M1 supports exactly one `manifest.render` declaration and one artifact (`spec/lib/manifest.ts`, `spec/lib/build.ts`); multi-target/`Artifact[]` and a JSON claim export are deferred. | No single-build Markdown+JSON export. | Markdown artifact + YAML inputs + evidence JSON. | M2 multi-renderer/multi-artifact work. |
| G6 | The loader accepts N sources, but the M1 path uses `sources[0]` for the legacy text and multi-source is untested (`spec/lib/build.ts`). **Amended 2026-11-07:** E2/#179 rejects more than one source with `core.manifest.invalid`; the 2026-11-07 decision (ODR-ENG-001 B4) makes absent/empty the same manifest-validation error and #229 implements it. Multi-source *semantics* remain unimplemented. | CORE-000 uses one source. | One source (`SRC-ENGINE-CONTRACT`); other docs are evidence references. | Multi-source semantics (#5/M4). |
| G7 | `ReviewState` is opaque; typed review dimensions and a typed independent-verification record are not core features (`spec/lib/ir.ts`). | Independent verification stays a CORE-000 data/profile concern. | Canonical `independent_verification` entity and external record; no core change. | Revisit with M4 review dimensions. |
| G8 | No signature, attestation or package format; PAP is a separate track (#43/#44). | Evidence is not tamper-evident to a third party. | Record commit/digest/SHA-256; do not claim authenticity. | PAP/verifier track; out of scope. |

**If the maintainer requires CLI-only execution of the positive build**, this plan is blocked by
G4 until the CLI/API work lands; the plan does not request that core change here.

---

## 9. Decision status and maintainer input

The maintainer recorded the S1 decision on 2026-11-02. Six decisions are accepted, four are
explicitly deferred for S1, and the consumer harness is confirmed for S1. The full decision record
remains open for the four deferred items:

| ID | Decision | Options | Status / consequence |
|---|---|---|---|
| D1 | Project/profile location | A: `contracts/core000/` + `profiles/core000/`; B: under `spec/core000/`; C: separate package/repo | **Accepted — A** on 2026-11-02; keeps the project/profile/trust boundary and avoids a package decision. |
| D13 | Independent-verification record schema/naming | A: separate `independent_verification` kind; B: reuse core `VerificationRecord`; C: free text | **Accepted — A** on 2026-11-02; B conflates provenance verification with independent review. |
| D14 | Consent-surface representation | A: add consent interface/diagnostic entities; B: trust-boundary prose only; C: separate profile class | **Deferred for S1 — open.** S1 adds no consent interface/diagnostic entities. |
| D15 | Provenance-verification policy | A: every source statement used by a normative claim must have a stored `verified` record; B: review diagnostic; C: no requirement | **Accepted — A** on 2026-11-02; a failed/stale/unavailable record is an error. |
| P-1 | Negative-fixture strategy | **B:** one base project (`contracts/core000`) plus one deterministic, named mutation per case in a fresh temporary copy (`contracts/core000/mutations.ts`); no per-case complete projects. | **Accepted — B** on 2026-11-02. B avoids 19 copies of a 78-claim project and the drift that duplication creates. Each run is still isolated (fresh temp dir, exactly one mutation, base commit and mutation ID recorded). The accepted design §7.8 wording is reconciled below. |
| P-2 | Durable evidence publication/location and summary format | A: `evidence/core000/<run>/result.json` + summary doc; B: Markdown summary only, raw records external/transient | **Deferred for S1 — open.** Only durable publication/location and the summary format are deferred; S1 still writes and asserts the §6.2 transient record. |
| P-3 | Commit generated CORE-000 draft? | A: commit `output/CORE-000.draft.md` after a successful run; B: keep it in temp evidence only | **Deferred for S1 — open.** S1 does not commit the generated draft. |
| P-4 | Renderer dependency | A: `nunjucks` 3.2.4 (declared, lockfile-pinned); B: no-dependency renderer | **Accepted — A** on 2026-11-02; the exact version must stay in `files`/`dependencies`. |
| P-5 | Harness shape | A: `contracts/core000/run.ts` + `tests/core000.test.ts`; B: test-only harness | **Accepted — A** on 2026-11-02; the test imports the same helper. Both are consumers, not core changes. |
| P-6 | Evidence and verification records in git | A: commit run evidence and future independent records; B: external only | **Deferred for S1 — open.** S1 does not commit run evidence or external verification records. |

**P-1 reconciliation with the accepted design §7.8.** The design described per-case complete
small projects as the illustrative fixture layout. This plan keeps the design's run semantics —
one project, one mutation, one expected diagnostic and no artifact — but chooses one base project
plus deterministic mutation functions in a fresh temporary copy. Each run copies the base to a new
temp directory, applies exactly one named mutation, rewrites only the temp paths and profile
imports, records the base commit and mutation ID in evidence, and never writes to the repository.
The mutations are deterministic functions, and the harness/test asserts exactly one expected
outcome per case. This is a fixture-layout refinement, not a change to the model, expected
diagnostics or acceptance criteria. If the maintainer prefers the literal complete-project layout,
the same mutation table can generate materialized fixtures, but the plan recommends B.

**Decision record:** the maintainer accepted D1 A, D13 A, D15 A, P-1 B, P-4 A and P-5 A, and
explicitly deferred D14, P-2, P-3 and P-6 for S1 on 2026-11-02. The full decision record remains
open for the four deferred items. The consumer harness is confirmed for S1 only; G4 and the
generic CLI/API gap remain open, and harness use is not independent verification.
S1 implementation may start only after the canonical decision-record update is merged and a
dedicated implementation task references it.

---

## 10. Implementation sequence after plan acceptance

Each step is a separate focused PR; none changes the generic core.

1. **Profile skeleton and schemas.** `profiles/core000/profile.json`, 16 schemas, catalog, view,
   validator with `validate`/`verifyProvenance`, checks, renderer/template. Add the profile closure
   `files`/`dependencies` and a smoke test that the profile loads and fails consent correctly.
2. **Project inputs.** `contracts/core000/contract-builder.json`, `structure.yml`, `claims.yml`
   encoding the accepted design; no new claims; source quotes at current locators.
3. **Harness and positive run.** `contracts/core000/run.ts`, `tests/core000.test.ts`; P1–P5 in
   §5.1 (S1-POS-01–S1-POS-05 in the first-slice proposal) with evidence records; the N14 CLI
   view/validator-marker test.
4. **Negative mutations.** `contracts/core000/mutations.ts` implements N1–N18; each run uses a
   fresh temporary copy of the base project and exactly one mutation, with exact expected codes
   and no-artifact assertions. No per-case complete-project copies.
5. **Evidence summary and review.** `docs/architecture/core-000-execution-evidence.md`; run the
   full checks; request maintainer review. Do not claim independence.
6. **Independent verification.** A verifier distinct from the author follows design §8.2 and
   writes `verification/core000/...`; only then may a claim's `verification` status become
   `independently_verified`. This is outside the engine run.

---

## 11. Plan acceptance criteria and limitations

This plan is ready for approval when a maintainer confirms that:

1. the existing/new file boundaries in §2 are correct and no core file is to be changed;
2. the manifest/profile/schema layout in §3 is executable through the current pipeline;
3. the pipeline/phase mapping in §4 matches the current `runBuild` path (including the consent,
   closure, verification and single-render order);
4. the run matrix in §5 covers the accepted design's N1–N18 and the positive/reproducibility
   checks, with no unsupported claims;
5. the evidence format and classification in §6 clearly separate structural, profile-policy,
   implementation-behavior and independent-verification evidence;
6. the commands, artifacts and reproducibility checks in §7 are reproducible;
7. the accepted P-1 strategy B is used consistently in §2, §3, §5, §7 and §10 and is reconciled
   with design §7.8 as required;
8. the N14 CLI view/validator-marker path demonstrates that the profile `view` and `validator`
   modules are not loaded without consent; it does not claim that the consumer-supplied renderer is
   gated;
9. the gaps in §8 are recorded as separate proposals, not implemented;
10. the decision status and remaining open items in §9 are explicit;
11. no implementation, CORE-001 change, core change or merge is included.

**Limitations of this plan.**

- No run has been executed; expected diagnostics are the accepted design's predictions, not
  observed results. Counts may change when the data is encoded.
- The accepted design's claims are author-asserted; the register's independent-verification
  dimension remains `—`. A successful plan execution will not change that.
- The consumer harness is confirmed for S1 only; G4 and the generic CLI/API gap remain open and
  CLI-only positive execution is still blocked.
- The source-byte pin and paragraph locators are not implemented; provenance evidence remains
  coarse.
- P-1 B is accepted and reconciled with design §7.8. D14, P-2, P-3 and P-6 are explicitly deferred
  for S1 and remain open; durable evidence publication, generated-draft commit, consent-surface
  entities and evidence-in-git policy still need later decisions.
- No sandbox/isolation, security certification or cross-platform determinism is claimed.

---

## 12. Revision 2/3 — Issue #72 additions and decision

This section records the additions requested by Issue #72. They are a companion to the accepted
plan, not a rewrite of it. The detailed proposals are in
[`core-000-self-build-poc.md`](core-000-self-build-poc.md); the refreshed facts are in
[`core-000-baseline-refresh.md`](core-000-baseline-refresh.md); the decision entries are refreshed
in [`core-000-decision-record.md`](core-000-decision-record.md).

### 12.1 Refreshed baseline result

- Current `main`: `c6ee64416c91ab56f9d8270114c8f8a8b9d2f608` (PR #73), 2026-11-02.
- Repository checks: `bun install --frozen-lockfile`, `bun run typecheck`, `bun test` (292 pass /
  0 fail / 21 files) and `bun run check` are green; `bun run build:release` exits 1 by design;
  CORE-001 artifact unchanged (`8213a263…`, 327 lines).
- `spec/` and `profiles/` are unchanged since the original plan baseline; `bun.lock` is unchanged.
- The PAP verifier is implemented as a separate product boundary under `pap/`; #73 is a docs-only
  PAP status update. Neither has a demonstrated CORE-000 impact, and neither closes G4.
- No CORE-000 project, profile, artifact, evidence or independent verification exists.
- Conclusion: no substantive CORE-000 assumption, interface, dependency, expected output or
  evidence class changes. Only baseline facts (commit, test counts, PAP context) are refreshed.

### 12.2 Ephemeral PoC mode

The companion document defines the ephemeral mode requested by Issue #72:

- **Separate hypotheses.** H1 self-build, H2 same-environment reproducibility and H3 independent
  verification have separate methods and result labels. H1 does not imply H2; H2 does not imply
  H3; only a distinct verifier can produce an H3 result.
- **Pinned inputs.** Commit, CORE-000 inputs, source document, profile closure, lockfile, Bun
  version, OS/architecture and controlled environment. A missing pin makes the run
  `INCONCLUSIVE`.
- **Execution boundary.** A fresh temporary workspace is not a security sandbox. The current
  engine has explicit consent, fail-closed import, path containment, closure digests and artifact
  normalization; it has no sandbox, privilege drop, read-only mount, network isolation or
  CPU/memory/time limits. The first slice executes only repository-owned reviewed profile code and
  claims no isolation. The consent gate covers the profile `view`/`validator`; a consumer-supplied
  renderer is a separate trust boundary imported by the consumer. Enforced isolation for untrusted
  profiles is a separate security proposal referencing #35.
- **Outputs and evidence.** Draft artifact, diagnostics, build identity, artifact SHA-256, run log,
  source-repository-clean check, separate workspace write/cleanup assertions and a transient JSON
  evidence record. No absolute paths or secrets. The transient record is required; durable
  publication is subject to P-2/P-6.
- **Repeatability.** Two fresh environments with the same pins; `inputDigest`, artifact bytes and
  diagnostics are compared. Byte equality is the only basis for `REPRODUCIBLE_BYTE_IDENTICAL`;
  a pre-declared normalization is the only path to `REPRODUCIBLE_NORMALIZED`; otherwise
  `NOT_REPRODUCIBLE`. Cross-platform, cross-version, different lockfile/commit and evidence-file
  freshness are excluded.
- **Negative cases.** The recommended P-1 strategy B (pending confirmation): one base project plus
  exactly one named mutation in a fresh copy. No combined mutations; expected diagnostic, exit 1,
  `blockedBy: "errors"` and no artifact.
- **Failure behavior.** Missing dependencies, unsupported inputs, resource exhaustion, incomplete
  checks and non-deterministic output remain visible and cannot become a success label.
- **Cleanup and retention.** Temporary workspaces, caches, marker files and host-path logs are
  deleted; evidence JSON, hashes and the comparison report are retained only under the applicable
  decision; no secrets, private material or premature generated artifact is committed.

### 12.3 First implementation slice

The first-slice proposal is in
[`core-000-self-build-poc.md`](core-000-self-build-poc.md) §10. It is a bounded 8-kind /
11-relation / 9-policy-check vertical slice over five accepted claims, with exact files, commands,
expected results, tests, negative cases (N2, N3, N8, N11, N14), exclusions, stop conditions and
acceptance criteria. The maintainer accepted D1 A, D13 A, D15 A, P-1 B, P-4 A and P-5 A for this
bounded package on 2026-11-02 and explicitly deferred D14, P-2, P-3 and P-6 for S1; the full
decision record remains open for those four items. The consumer harness is confirmed for S1 only;
G4 and the generic CLI/API gap remain open and are not closed by the harness; harness use is not
independent verification. P-2's deferral covers only durable
publication/location and the summary format; S1 still writes and asserts the transient §6.2
record. S1 implementation is authorized only after the canonical decision-record
update is merged and a dedicated implementation task references it; this document does not
implement S1. The proposed S2 follow-up package is
[`core-000-s2-package.md`](core-000-s2-package.md); it is not authorized by this plan.

### 12.4 What revisions 2 and 3 do not change

- It does not change the accepted plan's file boundaries, pipeline mapping, run matrix for the
  full model, evidence classes or generic-core constraints.
- It does not change `spec/`, `profiles/`, `spec/output/`, CORE-001 content or `pap/`.
- It records the 2026-11-02 decision but does not implement S1, execute a profile, or claim
  isolation, reproducibility, independent verification, security or correctness.
- It supersedes the earlier “B selected” wording: P-1 B is now accepted by the 2026-11-02
  decision; the reconciled §7.8 fixture strategy is the approved one.

### 12.5 Requested maintainer action

Merge the canonical decision-record documentation update. No further decision is needed for S1;
after merge, S1 implementation may start when a dedicated implementation task references the merged
record. The four deferred items (D14, P-2, P-3, P-6) remain open for later decisions; the full
decision record is not fully closed.
