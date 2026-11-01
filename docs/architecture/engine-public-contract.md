# Contract Builder Engine — Public Contract

**Status:** proposed for maintainer review
**Document version:** 0.1
**Baseline:** `1641540` (main after #11)
**Related:** #12 (this task), #2–#10
**Implementation status:** not started

> **Reading statuses.** `accepted` in this document means *explicitly directed by the
> maintainer in the iteration brief (§1.1–1.9)*. Nothing here was accepted on the agent's
> own judgment. Every other decision is `proposed`, `deferred` or `unresolved`.

---

## 1. Purpose and scope

The Contract Builder Engine validates and transforms an **explicitly supplied** specification
model. It does not author normative meaning, resolve ambiguity, or decide what a specification
*should* say.

This document defines the engine's public contract:

- what a project is, and what a profile is;
- which guarantees the engine provides and which it cannot;
- how diagnostics, build results and artifacts are shaped;
- how the library, CLI, adapters and renderers relate;
- how the current CORE-001 MVP maps onto that contract;
- the bounded first milestone.

Out of scope for this document: implementing the refactor, publishing packages, executing
conformance cases, migrating all of CORE-001, resolving CORE-001 normative questions.

### 1.1 Design principle

> The engine enforces **consistency of declared data**. It never infers normative effect,
> never fills missing content, never treats a permission as an obligation, and never lets an
> unresolved decision become a resolved normative condition.

A successful build is evidence of internal consistency, not of normative correctness.

---

## 2. Terminology and responsibility boundaries

| Term | Meaning |
|---|---|
| **Engine (core)** | Generic mechanisms: loading, validation pipeline, diagnostics, build orchestration, artifact checking |
| **Profile** | Domain contract: vocabularies, schemas, rule instances, provenance policy, review policy, labels, template |
| **Project** | Concrete specification content plus manifest: the data a consumer owns |
| **Adapter** | Reads one input format (YAML/JSON, OpenAPI, Markdown source) into the generic model |
| **Renderer** | Turns a validated model into artifacts (Markdown first) |
| **CLI** | Argument parsing and presentation; contains no validation logic |
| **Specification owner** | Human accountable for normative content and review decisions |

### 2.1 Responsibility map

| Responsibility | Core | Profile | Project | Adapter | Renderer | CLI |
|---|---|---|---|---|---|---|
| Read files, resolve paths | ✔ | | | ✔ | | |
| Structural validation | mechanism | schemas | data | | | |
| ID uniqueness, reference integrity | ✔ | | | | | |
| Declared consistency rules | mechanism | rule instances / hook | | | | |
| Provenance: quote located in source | mechanism | policy flag | data | ✔ | | |
| Review gating | mechanism | policy | review state | | | |
| Vocabularies and classifications | | ✔ | values | | | |
| Normative content | | | ✔ | | | |
| Output format and layout | interface | config | config | | ✔ | |
| Arguments, exit codes, JSON output | contract | | | | | ✔ |

**Rule of thumb:** if removing CORE-001 would change the code path, the logic belongs to the
profile or the project, not to the core.

---

## 3. Project manifest and profile model

### 3.1 Manifest

A project **must** have a manifest. The manifest is the only fixed file name in the contract
(`contract-builder.json`); every other path is declared.

```ts
interface Manifest {
  manifestVersion: string;             // e.g. "0.1"
  project: {
    id: string;
    title?: string;
    revision?: string;
  };
  profile: {
    id: string;
    version: string;
    source?: string;                   // local path or package specifier
  };
  inputs: InputDecl[];
  sources?: SourceDecl[];
  policy?: PolicyOverlay;              // project-level overrides
  render: RenderDecl[];
  output?: { root?: string };          // default: "."
}

interface InputDecl {
  path: string;                        // relative to the manifest
  format: "json" | "yaml";
  schema: string;                      // profile-declared schema id
  entities: Array<{                    // JSON Pointer -> array of entities
    role: EntityRole;
    pointer: string;                   // e.g. "/provisions"
  }>;
  optional?: boolean;
}

interface SourceDecl {
  id: string;
  path: string;                        // relative to the manifest
  adapter: string;                     // "markdown" | "openapi" | ...
  identity?: Record<string, unknown>;  // revision, digest, etc.
}

interface PolicyOverlay {
  requireProvenance?: boolean;
  reviewBlocking?: Record<string, { draft: boolean; release: boolean }>;
  // the profile declares which keys may be overridden (D30)
}

interface RenderDecl {
  renderer: string;                    // "markdown"
  template: string;
  labels?: string;
  outputs: Record<string, string>;     // mode -> path
}
```

Manifest path rules: all paths resolve relative to the manifest; profile `source` may be a
package specifier or a local directory; the project **may not** reach outside its root except
through declared `sources`. In `render`, a `profile:` prefix resolves inside the profile
package; without it, paths are project-relative.

### 3.2 Profile

A profile is a versioned package (or local directory) containing:

```ts
interface Profile {
  id: string;
  version: string;
  entityTypes: Partial<Record<EntityRole, {
    schema: string;                    // JSON Schema id
    idField: string;                   // default "id"
    typeField?: string;                // optional discriminator
  }>>;
  vocabularies?: Record<string, string[]>;   // named enums used by fields
  relations: RelationMapping;                // how core fills relations.* from fields
  rules: RuleInstance[];
  validator?: string;                        // optional profile hook module
  diagnostics: DiagnosticCatalog;
  provenance: {
    required: boolean;
    adapter: string;                   // adapter used to verify quotes
  };
  review: {
    dimensions: string[];              // e.g. ["normalization", "classification", "interpretation"]
    blocking: Record<string, { draft: boolean; release: boolean }>;
  };
  renderDefaults?: {
    renderer: string;
    template: string;
    labels?: string;
  };
}
```

The profile carries **no project content**. Two projects can share one profile.

Relation fields are declared, not hardcoded:

```ts
interface RelationMapping {
  dependsOn?: FieldSelector;                 // entity field listing decision ids
  mentions?: FieldSelector;                  // entity field listing decision ids
  vectors?: { role: EntityRole; field: FieldSelector };  // e.g. { role: "case", field: "provision" }
}
```

The core fills `Entity.relations` only through this mapping, so a profile can use
`decision_dependencies` or `decisions` or anything else without touching the engine.

### 3.3 Validation policy: closed primitives plus a profile hook

The core always enforces invariants: unique IDs, resolvable references, provenance binding
shape, reserved field names, and deterministic output.

Everything else is policy, and policy has two forms.

**Declarative primitives.** A closed set, parameterised by the profile. No expression syntax,
no boolean algebra, no user-defined functions.

```ts
type FieldSelector = string;

type FieldRef = { entity: EntityRole; field: FieldSelector };
// FieldSelector grammar: "name" | "name.sub" | "name[].sub" (one array level, no expressions)

type Condition =
  | { field: FieldRef; equals: string }
  | { field: FieldRef; in: string[] }
  | { field: FieldRef; notIn: string[] }
  | { field: FieldRef; nonEmpty: true }
  | { field: FieldRef; empty: true };

type RuleInstance =
  | { kind: "matrix";      when: FieldRef; then: FieldRef;
      allowed: Record<string, string[]>; code: string }
  | { kind: "substring";   field: FieldRef; within: FieldRef;
      when?: Condition; code: string }
  | { kind: "substringOfProvenance"; field: FieldRef; code: string }
  | { kind: "requiredIf";  when: Condition; require: FieldRef[]; code: string }
  | { kind: "forbidden";   fields: [FieldRef, FieldRef];
      pairs: Array<[string, string]>; code: string }
  | { kind: "coverage";    role: EntityRole; link: FieldSelector;
      min: number; code: string }
  | { kind: "gate";        when: Condition; code: string;
      blocking: { draft: boolean; release: boolean } };
```

**Profile validator hook.** A profile may ship a TypeScript module implementing:

```ts
interface ProfileValidator {
  validate(model: ProjectModel, ctx: ValidationContext): Diagnostic[];
}

interface ValidationContext {
  projectId: string;
  profile: Profile;
  documents: Readonly<Record<string, unknown>>;
}
```

The hook is pure and deterministic: no I/O, no clock, no environment, no mutation of the
model. An exception is reported as `core.profile.validator-failed` and fails the build. It is
versioned with the profile and participates in `inputDigest`.

A profile is trusted code: loading a project executes its hook with the process's privileges.
Profiles must be reviewed and pinned like any other dependency. The hook is loaded with a
dynamic `import()`: under Node it must be runnable JavaScript (compiled from TypeScript);
Bun also accepts `.ts` directly.

**Why both.** Three current MVP checks would force the primitive set to become a query
language: counting related vectors with a field filter (`violated`-vector warning), scanning
capitalised tokens (undefined-term warning), and conjunctions over review state and effect
(review gating). Byte-identical M1 therefore cannot rely on primitives alone. The hook keeps
those checks in the profile without inventing a DSL; primitives cover the checks that
generalise cleanly. The second profile (M3) is the evidence for promoting hook checks into
primitives.

Mapping of the current CORE-001 checks:

| Current check | Mechanism |
|---|---|
| modality → effect compatibility | primitive `matrix` |
| marker present in claim quote | primitive `substring` |
| classification basis inside claim | primitive `substring` |
| term definition inside source fragment | primitive `substringOfProvenance` |
| paraphrase requires explications | primitive `requiredIf` |
| `violated` + `permission`/`absent` | primitive `forbidden` |
| each provision has ≥ 1 vector | primitive `coverage` |
| open normative dependency gates release | primitive `gate` |
| source header `Doc (Rev x)` | profile hook |
| slice includes/excludes | profile hook |
| review pending / inferred-case review | profile hook |
| non-binding / unresolved / outside-slice warnings | profile hook |
| undefined-term scan, no-`violated`-vector warning | profile hook |

Invariants that are **not** policy: unique IDs, resolvable references, provenance binding
shape, reserved field names, determinism.

**Cross-entity scope.** `matrix`, `forbidden`, `gate`, `substring` and `requiredIf` constrain
fields of one entity instance; the core never joins entities inside a primitive.
`substringOfProvenance` is the only predefined join (entity field → its bound fragment text),
and `coverage` uses the declared vector link. Any other cross-entity check belongs to the
profile hook until a link primitive is justified by a second profile.

### 3.4 Minimal valid project

```text
contract-builder.json
spec.yml                 # one input, any role the profile declares
profile/                 # local profile (or a package reference)
```

The validation boundary is: manifest schema → input schemas → core invariants → profile rules
→ provenance → review gating → artifact check.

---

## 4. Generic IR and extension boundaries

```ts
interface ProjectModel {
  manifest: Manifest;
  profile: Profile;
  sources: SourceDocument[];
  entities: Entity[];
  documents: Readonly<Record<string, unknown>>;  // non-entity input blocks, opaque
  byId: ReadonlyMap<string, Entity>;
  byRole: ReadonlyMap<EntityRole, Entity[]>;
}

interface Entity {
  id: string;
  role: EntityRole;
  type?: string;                       // profile-defined discriminator
  fields: Readonly<Record<string, unknown>>;  // validated by the profile schema
  provenance?: ProvenanceBinding;
  relations: {                         // filled from Profile.relations mapping
    dependsOn: string[];
    mentions: string[];
    vectors: string[];                 // case -> provision
  };
  review: ReviewState;                 // { dimensions: Record<string, "pending"|"confirmed"> }
}
```

**Reserved field names** (core-owned, may not be redefined by a profile): `id`, `role`,
`type`, `provenance`, `relations`, `review`. Everything else is profile data and opaque to the
core.

```ts
type EntityRole = "fragment" | "term" | "provision" | "decision" | "case" | "extension";

interface ProvenanceBinding {
  source: string;                      // manifest source id
  ref: string;                         // adapter-specific locator
  quote: string;                       // verbatim text
}

interface ReviewState {
  dimensions: Record<string, "pending" | "confirmed">;
  reviewed_by?: Record<string, string>;
}
```

`ResolvedManifest` and `ResolvedProfile` are the loader's resolved forms (absolute paths,
loaded profile module). They stay internal; the public model exposes the declared `Manifest`
and `Profile`, so internal loader changes cannot break profile hooks.

**Extension boundary.** A profile adds entity types and fields by declaring them in its
schemas; the core exposes them as `Entity.fields` and never interprets them. A profile cannot
add new core mechanisms without a new rule primitive — that would be a contract change.

An **experimental** `extensions` map on entities may be used by renderers, never by core
validation. It is not part of the stable contract (`proposed`, see D16).

---

## 5. Public input contract

### 5.1 Roles

The core defines a fixed, minimal role set because its guarantees are about these roles:

| Role | Why the core knows it |
|---|---|
| `fragment` | quoted unit of a source |
| `term` | definition bound to provenance |
| `provision` | normative claim; target of review and vectors |
| `decision` | open/resolved state that can gate provisions |
| `case` | declarative conformance vector |
| `extension` | opaque profile data with integrity checks only |

A profile may leave roles unused. The role set is a **contract decision** (D6): if the second
profile shows it is CORE-001-shaped, it changes before 1.0.

### 5.2 Input extraction

Each input file is validated against its profile schema, and entities are extracted by JSON
Pointers declared in the manifest. Non-entity keys remain opaque project data.

```json
{
  "path": "ontology.yml",
  "format": "yaml",
  "schema": "core001:ontology",
  "entities": [{ "role": "term", "pointer": "/terms" }]
}
```

Rules:

- every pointer must resolve to an array of objects;
- every extracted object must satisfy the schema of its role;
- non-entity content is exposed as `ProjectModel.documents[path]` and never interpreted by
  the core;
- a file may declare several entity arrays, but each pointer maps to exactly one role.

This is deliberately not an extraction language: pointers and roles only.

### 5.3 Multiple sources

`Manifest.sources` is an array. The core supports N sources; each fragment binds to exactly
one source; provenance is verified through that source's adapter. The first milestone ships
with one source; multi-source remains a core capability with no extra API surface.

### 5.4 Formats

The core ships one adapter (`yaml-json`). Additional formats are adapters, not core changes.
A project declares the adapter per input or source.

### 5.5 Schema versions

Every schema carries a real, versioned `$id`. The manifest declares `manifestVersion`; the
profile declares its own version; input schemas are identified by id, not by file path.

### 5.6 Worked example: a non-CORE-001 project

`pub-api-001` — an HTTP API specification. Different ontology (`endpoint`, `payload`,
`error`), different classification (`level` from RFC 2119, `category`), different source model
(OpenAPI document, JSON Pointer locators), no decisions file.

```json
{
  "manifestVersion": "0.1",
  "project": { "id": "pub-api-001", "title": "Public Orders API", "revision": "2.1.0" },
  "profile": { "id": "http-api", "version": "0.1.0", "source": "../../profiles/http-api" },
  "inputs": [
    { "path": "fragments.yml", "format": "yaml", "schema": "http-api:fragments",
      "entities": [{ "role": "fragment", "pointer": "/fragments" }] },
    { "path": "requirements.yml", "format": "yaml", "schema": "http-api:requirements",
      "entities": [{ "role": "provision", "pointer": "/requirements" }] },
    { "path": "examples.yml", "format": "yaml", "schema": "http-api:examples",
      "entities": [{ "role": "case", "pointer": "/examples" }] }
  ],
  "sources": [
    { "id": "SRC-OPENAPI", "path": "openapi.yaml", "adapter": "openapi" }
  ],
  "render": [
    { "renderer": "markdown", "template": "profile:templates/api.md.j2",
      "labels": "profile:labels.en.json",
      "outputs": { "release": "build/API-001.md" } }
  ]
}
```

A fragment, a requirement and its vector, in the profile's own vocabulary:

```yaml
- id: FRAG-OPENAPI-POST-ORDERS
  source: SRC-OPENAPI
  source_ref: "#/paths/~1orders/post"
  quote: "A repeated request with the same Idempotency-Key MUST NOT create a second order."
```

```yaml
- id: API-REQ-014
  title: Order creation is idempotent
  level: MUST                      # http-api vocabulary, not CORE-001 modality
  category: endpoint
  applies_to: "POST /v1/orders"
  fragment: FRAG-OPENAPI-POST-ORDERS
  statement: "A repeated request with the same Idempotency-Key MUST NOT create a second order."
```

```yaml
- id: CASE-API-REQ-014-1
  requirement: API-REQ-014
  kind: example
  given: { method: POST, path: /v1/orders, key: "k-1" }
  when: "the same key is sent twice"
  expect: { orders_created: 1 }
  rationale: "Specified behaviour in §3.2"
  rationale_ref: "SRC-OPENAPI#/paths/~1orders/post"
```

What the core does: unique IDs, resolvable references, provenance through the OpenAPI adapter
(JSON Pointer), the profile's matrix (`MUST → endpoint-constraint`), coverage (`min: 1`),
review gating. What the profile supplies: `level`/`category` vocabularies, the effect names,
the rule instances, English labels, the template, output paths.

No CORE-001 concept (`slice`, `normative_effect`, `source_modality`, `negative_entailment`)
appears in the core. This example is the acceptance test for the role set (D6) and the rule
primitives (D15); it is not implemented in this iteration.

---

## 6. Validation guarantees and boundaries

### 6.1 Phases (internal, replaceable)

```ts
type Phase =
  | "load" | "structure" | "reference" | "provenance"
  | "consistency" | "review" | "conformance" | "artifact";

type PhaseState = "passed" | "failed" | "skipped";
```

| Phase | Guarantee | Not guaranteed |
|---|---|---|
| `load` | bytes read, manifest parsed, profile resolved | content correctness |
| `structure` | inputs match profile schemas | semantic meaning |
| `reference` | IDs unique, relations resolvable | that references are *appropriate* |
| `provenance` | quoted text located in the declared place via adapter | that the quote was well chosen |
| `consistency` | declared fields do not contradict profile rules | normative truth |
| `review` | unconfirmed content is marked and gated | that the reviewer is right |
| `conformance` | vectors are structurally and referentially consistent | execution |
| `artifact` | output is deterministic and matches the checked artifact | that the document is meaningful |

Phases are an **internal decomposition**. The public API exposes only `validate`, `build`,
`render`, `check` (D7). Phase identifiers appear in diagnostics so consumers can filter
without depending on the pipeline.

### 6.2 Phase dependencies

`structure` requires `load`; `reference`, `provenance`, `consistency`, `review`,
`conformance` require `structure`; `artifact` requires a successful build. A failing phase
marks dependent phases `skipped` in the result; skipped phases never emit diagnostics.

### 6.3 What the engine will never claim

- that a provision is legally or normatively correct;
- that a reviewed classification is correct;
- that a declarative case passes;
- that a build is reproducible outside the stated determinism boundary (§8).

---

## 7. Diagnostic model

```ts
type Severity = "error" | "warning" | "info";
type Disposition = "block" | "review" | "allow";

interface Diagnostic {
  code: string;                        // stable, namespaced: "core001.consistency.modality"
  severity: Severity;                  // intrinsic impact
  disposition: Disposition;            // policy decision
  phase: Phase;
  message: string;                     // human-readable, localizable
  location: { file: string; pointer?: string; line?: number; column?: number };
  entityId?: string;
  data: Record<string, unknown>;       // machine-readable details
  blocking: { draft: boolean; release: boolean };  // resolved for this project+mode
}
```

The three axes are intentionally separate (D8):

| Current MVP | Severity | Disposition | Blocks draft | Blocks release |
|---|---|---|---|---|
| `ERROR` | `error` | `block` | yes | yes |
| `REVIEW_REQUIRED` | `warning` | `review` | no | yes |
| `WARNING` | `warning` | `allow` | no | no |

Blocking is computed from **profile policy + project overrides + build mode**, never from the
code alone (D9). A profile may make a code block in release but not in draft, and a project
may override within the limits the profile allows.

### 7.1 Code registry

Every code is declared in the profile's `diagnostics` catalog:

```ts
interface DiagnosticCatalog {
  codes: Array<{
    code: string;                      // "core.<domain>.<name>" or "<profileId>.<domain>.<name>"
    severity: Severity;
    disposition: Disposition;
    message: string;                   // simple {{field}} interpolation, no logic
    remediation?: string;
  }>;
}
```

Core codes use the `core.` namespace; profile codes use the profile id. Codes are stable
across releases, messages may be reworded. Unknown codes are a profile validation error. In
M1 the CORE-001 catalog reuses today's strings verbatim (`ERR_MODALITY_UPGRADE`, …);
namespacing lands in M2 with an explicit mapping.

### 7.2 Exit codes

| Condition | Exit |
|---|---|
| `status: ok` | 0 |
| `status: review-required` in draft | 0 |
| `status: review-required`, `invalid` or blocked in release | 1 |
| `io-error`, usage error, internal error | 2 |

Consumers must use `status` from the API/`--json`, not the exit code alone.

---

## 8. Build result and determinism contract

```ts
type BuildMode = "draft" | "release";
type BuildStatus = "ok" | "review-required" | "invalid" | "io-error";

interface BuildResult {
  status: BuildStatus;
  mode: "draft" | "release";
  diagnostics: Diagnostic[];
  phases: Record<Phase, "passed" | "failed" | "skipped">;
  artifacts: Artifact[];
  identity: {
    projectId: string;
    inputDigest: string;               // sha256 over the declared inputs
    engineVersion: string;
    manifestVersion: string;
    profile: { id: string; version: string };
    renderer: { id: string; version: string };
  };
}

interface Artifact {
  path: string;                        // relative to output root
  bytes: number;
  sha256: string;
}
```

### 8.1 Determinism guarantee

> Same `engineVersion` + `rendererVersion` + `inputDigest` ⇒ byte-identical artifacts.

`inputDigest` covers: canonicalized manifest, all input file bytes, profile content (schemas,
rules, labels, template), renderer id/version. It deliberately excludes: clock, locale,
environment variables, absolute paths, file mtimes, user identity, network state.

### 8.2 Controls

- iteration order is explicit (arrays) or sorted by code point, never locale collation;
- artifacts are UTF-8 with LF line endings and exactly one trailing newline;
- no timestamps, hostnames, absolute paths, or environment data in artifacts;
- renderers are pure functions of the model, options and template;
- `check` compares bytes, and reports `core.artifact.drift` with the differing file.

### 8.3 Boundary

The engine does not guarantee byte stability across engine or renderer versions, across
profiles, or when inputs change. It does not guarantee that a rebuild on another OS produces
identical bytes unless the renderer contract is respected; CI covers Linux, and cross-platform
byte equality is a renderer test, not a core promise.

---

## 9. Public TypeScript API

```ts
import type { BuildMode, BuildResult, Diagnostic } from "@contract-builder/core";

interface FileSystem {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  readdir(path: string): Promise<string[]>;
}

interface LoadOptions {
  root: string;                        // directory containing the manifest
  manifest?: string;                   // default "contract-builder.json"
  fs?: FileSystem;                     // default: node fs
  signal?: AbortSignal;
}

interface LoadedProject {
  model: ProjectModel;
  diagnostics: Diagnostic[];           // load/structure diagnostics
}

export function loadProject(options: LoadOptions): Promise<LoadedProject>;

export function validateProject(
  project: LoadedProject,
): { ok: boolean; diagnostics: Diagnostic[]; phases: Record<Phase, PhaseState> };

export function buildProject(
  project: LoadedProject,
  options: {
    mode: BuildMode;
    renderer?: Renderer;
    write?: boolean;
    fs?: FileSystem;                   // defaults to the fs used by loadProject
    signal?: AbortSignal;
  },
): Promise<BuildResult>;

export function renderModel(
  model: ProjectModel,
  renderer: Renderer,
  options?: RenderOptions,
): Promise<Artifact[]>;

export function checkArtifacts(
  artifacts: Artifact[],
  options: { fs?: FileSystem; root?: string },
): Promise<CheckResult>;

interface CheckResult {
  ok: boolean;
  mismatches: Array<{ path: string; expectedSha256: string; actualSha256: string | null }>;
}
```

Public vs internal: everything under `@contract-builder/core/internal` (pipeline stages,
schema runner, loader internals) is not part of the contract. Type exports are versioned with
the package.

---

## 10. CLI contract

```text
contract-builder validate [root] [--json] [--strict]
contract-builder build    [root] [--mode draft|release] [--check] [--json] [--strict]
contract-builder check    [root] [--json]
```

- `validate` runs the pipeline without rendering; exits by the same status rules.
- `build` writes artifacts only when the mode allows it; `--check` never writes.
- `check` verifies existing artifacts against a fresh in-memory build.
- `--json` emits the `BuildResult`/`ValidationResult` object only, to stdout.
- `--strict` promotes `disposition: allow` + severity `warning` to blocking for this run.
- Human output goes to stdout; machine consumers use `--json`.

The CLI owns no validation logic: it parses arguments, calls the API, and formats output.

---

## 11. Adapter and renderer interfaces

```ts
interface SourceDocument {
  id: string;
  bytes: Uint8Array;
  adapter: string;
  identity?: Record<string, unknown>;
}

interface SourceAdapter {
  id: string;
  version: string;
  load(io: FileSystem, descriptor: SourceDecl): Promise<SourceDocument>;
  verifyQuote(source: SourceDocument, ref: string, quote: string): LocatorResult;
}

type LocatorResult = "found" | "outside" | "unsupported" | "unknown-locator";

interface Renderer {
  id: string;
  version: string;
  render(model: ProjectModel, options: RenderOptions): Promise<Artifact[]>;
}

interface RenderOptions {
  mode: BuildMode;
  template?: { path: string; text: string };  // engine-resolved and loaded
  labels?: Record<string, string>;
}
```

Renderers perform no I/O: the engine resolves `profile:` paths, loads template and labels, and
passes their content. This keeps the `FileSystem` abstraction intact and makes rendering a
pure function of the model and the supplied content.

Provenance verification belongs to the adapter because locator grammar is format-specific
(`#10.2`, `#/paths/~1orders/get`). The core only knows that a quote must resolve to
`found`.

Renderers receive only the public model; they may not mutate it. A renderer that needs
profile data reads it from `model.profile`.

---

## 12. Declarative conformance boundary

| Capability | In core contract |
|---|---|
| Store vectors | yes |
| Validate vector structure and references | yes |
| Validate declared relation to provisions | yes (coverage rule) |
| Execute scenarios | no |
| Evaluate an implementation | no |

Execution is `deferred` (D27) and, if proposed later, must be a separate package with its own
contract and its own justification. The conformance module is not a reason to introduce a rule
language.

---

## 13. Compatibility and versioning

| Surface | Versioning | Compatibility rule |
|---|---|---|
| Engine package | semver | 0.x: breaking changes allowed with notice; 1.0 after a second profile |
| Manifest | `manifestVersion` | engine publishes a supported range; an out-of-range formal version is `core.compat.manifest` |
| Profile | semver | profile version participates in `inputDigest` |
| Input schemas | versioned `$id` | schema id pins the contract |
| Diagnostic codes | registry semver | codes stable; new codes additive; removal is major |
| IR | experimental | not stable before 1.0 (D5) |
| CLI | follows engine | flags may be added; defaults do not change silently |

Deprecation policy: a deprecated surface keeps working for at least one minor release with a
`core.compat.deprecated` warning.

---

## 14. Self-hosting direction

Planned (not a first-release blocker): the engine's own contract is described as a project
using the same public model.

```text
contracts/self/
  contract-builder.json        # profiles: manifest-schema, diagnostics, rule-kinds
  profile.yml                   # the engine's own vocabularies
  rules.yml                     # invariants expressed as profile rules
```

A later milestone builds `docs/reference/manifest.md` and `docs/reference/diagnostics.md`
from that project.

**Boundary:** self-validation proves the contract is expressible and internally consistent.
It does not prove the implementation is correct. Independent verification requires tests, the
second profile, and external consumers.

---

## 15. Migration map

| Current artifact | Destination | Milestone |
|---|---|---|
| `spec/lib/load.ts` | core loader + `yaml-json` adapter + manifest paths | M1 |
| `spec/lib/schema.ts` | core structure phase + profile schemas | M1 |
| `spec/lib/semantic.ts` | core invariants + profile rule instances + profile hook + catalog | M1 |
| `spec/lib/model.ts` | core IR + profile-declared fields | M2 |
| `spec/lib/render.ts` | `renderer-markdown` + profile labels/template | M3 |
| `spec/lib/diagnostics.ts` | diagnostic contract + registry | M2 |
| `spec/lib/locator.ts` | `adapter-markdown` | M1 (interface), M3 (package) |
| `spec/lib/build.ts` | core orchestrator | M1 |
| `spec/build.ts` | `cli` package | M2 |
| `spec/*.yml`, `spec/*.json` | project data + manifest | M1 |
| `spec/schemas/`, `spec/templates/` | `profile-core001` | M1 |
| `tests/` | core contract tests + profile acceptance | M1 |
| `fixtures/` | test infrastructure | M1 |
| `CORE-001.legacy.md` | project source document | M1 |

Review shape: M1 keeps the legacy single `review.status` + `reviewed_by` and maps it to
`ReviewState.dimensions.default`; per-dimension review arrives with #3 in M4. The mapping is
declared in the profile, not hardcoded, so CORE-001 data does not need a migration in M1.

---

## 16. Phased implementation plan

### M1 — Manifest + profile extraction, byte-identical (the recommended milestone)

**Goal:** prove that CORE-001-specific configuration can leave the generic code path without
changing the generated result.

In scope:

1. Add `spec/contract-builder.json` describing inputs, sources, profile, renderer and outputs.
2. Move to `profiles/core001/`: schemas, vocabularies, rule instances, diagnostic catalog,
   labels, template, output names.
3. Make the loader read the manifest instead of the hardcoded five files.
4. Move policy checks out of core: declarative primitives where they fit, profile hook
   otherwise (§3.3). **Keep the existing diagnostic code strings** in M1 (rename in M2).
5. Keep the current IR essentially unchanged; introduce the envelope only as far as the rules
   require.
6. Add one synthetic minimal profile in tests with a different vocabulary (e.g. two
   modalities, a different effect name) to prove separation; it is not a second real profile.

Out of scope for M1: package split, public API, new diagnostic codes, multi-source, review
dimensions, OpenAPI adapter, CLI changes.

Acceptance criteria:

- [ ] CORE-001 is represented as a project with a manifest and a profile.
- [ ] No CORE-001 vocabulary, matrix, label, path or output name remains in generic code.
- [ ] Pre-refactor and post-refactor artifacts are byte-identical (baseline hash recorded
      before the refactor and asserted after).
- [ ] Existing tests pass; assertions are unchanged (imports may move).
- [ ] A test builds a non-CORE-001 synthetic profile through the same generic path.
- [ ] `draft`/`release` behavior is unchanged, including exit codes.

### M2 — Public API, package split, diagnostic contract

Core/CLI/renderer/adapter packages; `validate/build/render/check`; registry with stable codes;
CLI rewritten over the API. Acceptance: contract tests; CLI output unchanged except `--json`.

### M3 — Second profile (validation of the IR)

Implement the hypothetical HTTP API profile from §5.6, including an OpenAPI adapter. This is
the evidence that the role set and rule primitives are not CORE-001-shaped.

### M4 — Capabilities

Multi-source (#5), review dimensions (#3), stronger provenance (#4), term imports (#7). Each
requires its own decision record.

### M5 — Self-hosting and 0.x publication

Build the engine's own reference from `contracts/self/`; publish 0.x after #10 (license) and a
declared runtime matrix.

---

## 17. Non-goals and unresolved decisions

**Non-goals of the contract:** rule execution, implementation evaluation, normative
inference, cross-specification truth, package publication in this iteration, a plugin API, a
general-purpose expression language.

**Unresolved (with recommended defaults):**

1. **Distribution scope.** *Default:* npm `@contract-builder/*` public. *Changed by:* maintainer
   choosing an org scope, or #10 remaining unresolved.
2. **Profile distribution.** *Default:* local directory in M1, published package in M5.
   *Changed by:* a second consumer needing shared profiles earlier.
3. **Runtime matrix.** *Default:* library targets Node 20+, development/CI on Bun; no
   Bun-only APIs in the library. *Changed by:* maintainers deciding Bun-only.
4. **Profile hook.** *Default:* a pure, versioned profile validator hook is allowed in 0.x for
   checks the primitives cannot express; data-only remains preferred. *Changed by:* a second
   profile showing the hook is unnecessary, or a security requirement forbidding code in
   profiles.
5. **Self-hosting depth.** *Default:* manifest schema + diagnostic registry + rule kinds are
   self-described; the full document pipeline is not. *Changed by:* M5 scope decision.

---

## 18. Decision register

Legend: `A` accepted (directed in the brief §1.x), `P` proposed, `D` deferred, `U`
unresolved. "Blocks M1" means the first milestone cannot start without the decision.

| ID | Decision | Status | Selected option | Alternatives | Rationale | Consequence / impact | Blocks M1 |
|---|---|---|---|---|---|---|---|
| D1 | Core/profile/project split | A (§1.1) | core mechanisms, profile semantics, project content | core with built-in CORE-001 defaults | prevents domain leakage | profiles become a first-class artifact | no |
| D2 | Manifest | A (§1.2) | required `contract-builder.json` | convention over paths | only fixed name; everything else declared | loader rewritten in M1 | yes |
| D3 | Manifest contents | A (§1.2) | identity, versions, inputs, sources, outputs | implicit discovery | explicit contract surface | schema + tests | yes |
| D4 | Do not reuse `spec/` layout | A (§1.2) | manifest-driven roles | keep five files | layout is project policy | files become declarative | yes |
| D5 | IR stability | A (§1.3) | experimental, versioned, unstable before 1.0 | freeze now | no second profile yet | IR changes allowed with notice | no |
| D6 | Fixed role set | P | fragment/term/provision/decision/case/extension | free-form entity kinds | guarantees need known roles; sources are manifest objects, not extracted entities | validated by §5.6 example | yes |
| D7 | Public operations | A (§1.4) | `load/validate/build/render/check`; phases internal | eight public phase calls | no consumer requires per-phase API | phase data stays in diagnostics | no |
| D8 | Diagnostic axes | A (§1.5) | severity + disposition + blocking | severity only | separates impact from policy | new shape in M2 | no |
| D9 | Blocking policy | A (§1.5) | profile/project policy + mode | hardcode per code | same code may gate differently | policy lives in profile | no |
| D10 | Determinism scope | A (§1.6) | byte equality per engine+renderer+inputDigest | absolute reproducibility | honest boundary | digest + check contract | no |
| D11 | Conformance | A (§1.7) | declarative only | execution in core | avoids a rule language | execution is a separate future package | no |
| D12 | Self-hosting | A (§1.8) | planned, not a blocker | require before 1.0 | keeps M1 bounded | M5 | no |
| D13 | Non-CORE-001 evaluation | A (§1.9) | worked example, no implementation | build it now | proves separation cheaply | §5.6 in this doc | no |
| D14 | Package layout | P | core + cli + renderer-markdown + adapter-yaml-json + profile-core001 | single package with subpaths | boundaries match responsibilities; published separately | M2 | no |
| D15 | Validation policy mechanism | P | closed primitives + pure profile hook (§3.3) | data-only; code-only | byte-identical M1 needs checks that primitives cannot express without a DSL | profile hook is versioned and participates in inputDigest | yes |
| D16 | IR envelope | P | `id/role/type/fields/provenance/relations/review` | typed per-domain entities | keeps CORE-001 out of core | `extensions` experimental | yes |
| D17 | Code format | P | `profile.domain.name` strings + registry | numeric codes | readable, namespaced, stable | registry + migration map in M2 | no |
| D18 | Build status | P | `ok/review-required/invalid/io-error` | boolean ok | distinguishes review from invalid | API + exit mapping | no |
| D19 | Runtime | P | Node 20+ library, Bun dev/CI | Bun-only | library consumers use Node | CI matrix | no |
| D20 | Distribution | U | npm `@contract-builder/*`, 0.x | org scope; private tarball | default until #10 resolves | publication only | no |
| D21 | Multi-source | P | array in core, one in MVP | single-source for good | schema already allows list; #5 decides semantics | adapter boundary | no |
| D22 | Provenance optional | P | profile flag `requireProvenance` | always required | greenfield specs | profiles without sources | no |
| D23 | `slice` | P | not first-class; profile scoping data | core concept | migration-specific | CORE-001 profile carries it | no |
| D24 | Review dimensions | P | N named dimensions declared by profile | single flag | #3 in progress | M4 | no |
| D25 | Locator ownership | P | adapter verifies quotes | core parser | format-specific | adapter interface | yes |
| D26 | Self-hosting scope | D | manifest/registry/rules only | full pipeline | keep M5 bounded | revisit in M5 | no |
| D27 | Conformance execution | D | not in core | separate evaluator | needs its own contract (#8) | none now | no |
| D28 | Profile code hooks | P | allowed, pure, versioned (§3.3) | defer until primitives suffice | required for M1 behaviour parity | profile package contains code | yes |
| D29 | Profile distribution | U | local dir in M1, package in M5 | package in M1 | avoids premature publishing | M1 uses local profile | no |
| D30 | Policy override scope | P | profile defaults + project overlay, profile may forbid overrides | project free override | prevents accidental weakening | manifest `policy` | no |

**Corrections to current behavior explicitly required by this contract** (to be approved
before implementation, not silently applied):

1. `REVIEW_REQUIRED` stops being a severity and becomes `severity: warning` +
   `disposition: review` (M2).
2. Diagnostic blocking is computed per mode from policy, not from the code (M2).
3. Exit code 2 is reserved for I/O and usage errors; today they are 1 (M2).
4. Diagnostics gain a `phase` field (additive, non-breaking, M2).

M1 keeps the current behavior and codes; the corrections above are M2 work.

---

## 19. Open questions for maintainer approval

Only decisions that need an explicit answer before implementation:

1. D6 — fixed role set: accept or replace with free-form entity kinds?
2. D14 — package layout: accept the five-package split?
3. D15/D28 — validation policy: accept closed primitives plus a pure profile hook, or
   require data-only rules (which delays M1 or drops checks)?
4. D16 — IR envelope and `extensions` status.
5. D18 — build status enum.
6. D20 — distribution and scope (blocked by #10).
7. D29 — profile distribution in M1 (local directory).
8. Confirm the four behavior corrections listed at the end of §18 for M2.

Everything else is either directed by the brief (`accepted`) or has a recommended default in
§17.

---

## Appendix A — CORE-001 manifest (M1 target)

```json
{
  "manifestVersion": "0.1",
  "project": {
    "id": "uia-core-001",
    "title": "Identity, mandates, lineage and local acceptance",
    "revision": "0.3.3"
  },
  "profile": { "id": "core001", "version": "0.1.0", "source": "./profiles/core001" },
  "inputs": [
    { "path": "sources.yml", "format": "yaml", "schema": "core001:sources",
      "entities": [{ "role": "fragment", "pointer": "/fragments" }] },
    { "path": "ontology.yml", "format": "yaml", "schema": "core001:ontology",
      "entities": [{ "role": "term", "pointer": "/terms" }] },
    { "path": "semantics.json", "format": "json", "schema": "core001:semantics",
      "entities": [{ "role": "provision", "pointer": "/provisions" }] },
    { "path": "decisions.yml", "format": "yaml", "schema": "core001:decisions",
      "entities": [{ "role": "decision", "pointer": "/decisions" }] },
    { "path": "conformance/cases.yml", "format": "yaml", "schema": "core001:cases",
      "entities": [{ "role": "case", "pointer": "/cases" }] }
  ],
  "sources": [
    { "id": "SRC-CORE001", "path": "../CORE-001.legacy.md", "adapter": "markdown",
      "identity": { "document": "UIA-CORE-001", "revision": "0.3.3" } }
  ],
  "render": [
    { "renderer": "markdown", "template": "profile:templates/core001.md.j2",
      "labels": "profile:labels.ru.json",
      "outputs": {
        "draft": "output/CORE-001.draft.md",
        "release": "output/CORE-001.md"
      } }
  ]
}
```

`sources.yml` keeps `slice` and `fragments`; the redundant `sources` block moves to the
manifest with the same ids. `ontology.yml` keeps the document header as opaque project data.
Both are data migrations that do not change artifacts.

## Appendix B — Diagnostic examples

```json
{
  "code": "core001.consistency.modality",
  "severity": "error",
  "disposition": "block",
  "phase": "consistency",
  "message": "source_modality=MAY does not support normative_effect=prohibition",
  "location": { "file": "semantics.json", "pointer": "/provisions/4/normative_effect" },
  "entityId": "REQ-TIMESTAMPS-NOT-INTERCHANGEABLE",
  "data": { "source_modality": "MAY", "normative_effect": "prohibition" },
  "blocking": { "draft": true, "release": true }
}
```

```json
{
  "code": "core.review.pending",
  "severity": "warning",
  "disposition": "review",
  "phase": "review",
  "message": "normalization is not confirmed",
  "location": { "file": "semantics.json", "pointer": "/provisions/1/normalized_statement" },
  "entityId": "REQ-REVOCATION-NOT-AUTO-INVALID",
  "data": { "dimension": "normalization" },
  "blocking": { "draft": false, "release": true }
}
```

## Appendix C — What M1 must not touch

- No package publication, no new repository layout outside `spec/` and `profiles/`.
- No change to CORE-001 normative data or to the generated bytes.
- No new CLI flags, no new diagnostic codes, no IR redesign beyond the rule envelope.
- No multi-source, no review dimensions, no OpenAPI adapter.
