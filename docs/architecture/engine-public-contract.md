# Contract Builder Engine — Public Contract

**Status:** proposed for maintainer review
**Document version:** 0.4
**Baseline:** `1641540` (main after #11)
**Related:** #12 (this task), #2–#10
**Implementation status:** not started (pre-M1 record)
**Current implementation status:** M1 implemented and tested as of `f1ddcf7`; see the [implementation-status matrix](implementation-status.md) for the as-of audit and per-row evidence.

> **Reading statuses.** `accepted` in this document means *explicitly directed by the
> maintainer* — in the iteration brief (§1.1–1.9) or in the final revision brief (§1–§4).
> Nothing here was accepted on the agent's own judgment. Every other decision is `proposed`,
> `deferred` or `unresolved`.

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
| **Engine (core)** | Generic mechanisms: loading, extraction, identity and reference integrity, provenance plumbing, diagnostics, build orchestration, artifact checking |
| **Profile** | Domain contract: entity kinds, relation types, schemas, provenance mappings, rules, review policy, labels, templates |
| **Project** | Concrete specification content plus manifest: the data a consumer owns |
| **Adapter** | Reads one input format and resolves locators into source text |
| **Renderer** | Turns a validated model into artifacts (Markdown first) |
| **CLI** | Argument parsing and presentation; no validation logic |
| **Specification owner** | Human accountable for normative content and review decisions |

### 2.1 Responsibility map

| Responsibility | Core | Profile | Project | Adapter | Renderer | CLI |
|---|---|---|---|---|---|---|
| Read files, resolve paths | ✔ | | | ✔ | | |
| Declare entity kinds and relation types | | ✔ | | | | |
| Structural validation | mechanism | schemas | data | | | |
| Identity extraction and indexing | ✔ | identity field | values | | | |
| Reference integrity | ✔ | relation declarations | values | | | |
| Declared consistency rules | mechanism | rule instances / hook | | | | |
| Provenance binding | mechanism | field mapping + policy | data | ✔ | | |
| Review metadata | mechanism | policy | state | | | |
| Vocabularies and classifications | | ✔ | values | | | |
| Normative content | | | ✔ | | | |
| Output format and layout | interface | config | config | | ✔ | |
| Arguments, exit codes, JSON output | contract | | | | | ✔ |

**Rule of thumb:** no entity kind name, relation name or vocabulary value from any one
specification may appear in the core's code or schemas. The core mentions `kind` and
`relation` only as strings supplied by the profile.

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
    source?: string;                   // package specifier or local path
    external?: boolean;                // required when a local path leaves the project root
  };
  inputs: InputDecl[];
  sources?: SourceDecl[];
  policy?: PolicyOverlay;              // project-level overrides
  render: RenderDecl[];
  output?: { root?: string };          // default: "."; must stay inside the project root
}

interface InputDecl {
  path: string;                        // relative to the manifest
  format: "json" | "yaml";
  schema: string;                      // document schema id (validates the whole file)
  entities: Array<{                    // JSON Pointer -> array of entities
    kind: string;                      // declared in profile.entityKinds
    pointer: string;                   // e.g. "/provisions"
  }>;
  external?: boolean;                  // default false; see 5.7
  optional?: boolean;
}

interface SourceDecl {
  id: string;
  path: string;                        // relative to the manifest or project root
  adapter: string;                     // "markdown" | "openapi" | ...
  external?: boolean;                  // default false; see 5.7
  identity?: Record<string, unknown>;  // revision, digest, etc.
}

interface PolicyOverlay {
  requireProvenance?: boolean;
  reviewBlocking?: Record<string, { draft: boolean; release: boolean }>;
  // the profile declares which keys may be overridden (overridablePolicyKeys)
}

interface RenderDecl {
  renderer?: string;                   // defaults to profile.renderDefaults.renderer
  template?: string;                   // entry, defaults to profile.renderDefaults.template
  templates?: string;                  // root preloaded as TemplateSet; default: dirname(entry)
  labels?: string;
  external?: boolean;                  // required when templates leave the project root
  outputs: Record<string, string>;     // mode -> path
}
```

`renderer` and `template` may be omitted when `profile.renderDefaults` supplies them; after
resolution both must be present (`core.manifest.render` otherwise).

Path resolution and trust are defined in **5.7**; no path may leave the project root without an
explicit `external: true` on the declaration that owns it. Output paths are stricter: neither
`output.root` nor any `render[].outputs` path may leave the canonical output root, which itself
must stay inside the project root.

### 3.2 Profile

A profile is a versioned package (or local directory) containing:

```ts
interface Profile {
  id: string;
  version: string;
  entityKinds: Record<string, EntityKindDecl>;
  relations?: RelationDecl[];
  provenance?: ProvenanceMapping[];
  vocabularies?: Record<string, Array<string | boolean | number>>;
  rules: RuleInstance[];
  validator?: string;                        // optional profile hook module
  diagnostics: DiagnosticCatalog;
  review?: ReviewPolicy;
  overridablePolicyKeys?: string[];          // project PolicyOverlay may change only these
  renderDefaults?: {
    renderer: string;
    template: string;
    labels?: string;
  };
}

interface EntityKindDecl {
  schema: string;                            // JSON Schema id
  identity: FieldSelector;                   // default "id"
  description?: string;
}

interface RelationDecl {
  name: string;                              // relation type, e.g. "dependsOn"
  from: string;                              // entity kind
  to: string;                                // entity kind or "*"
  cardinality?: "one" | "many";
  inverse?: string;                          // reciprocal relation, declared from "to"
}

interface ProvenanceMapping {
  kind: string;
  source: FieldSelector;                     // field with a source id
  ref: FieldSelector;                        // adapter locator
  quote: FieldSelector;                      // verbatim text
}

interface ReviewPolicy {
  dimensions: string[];
  blocking: Record<string, { draft: boolean; release: boolean }>;
}
```

The profile carries **no project content**. Two projects can share one profile.

**Unknown kinds and relations are not guessed.** An input that declares a kind missing from
`entityKinds`, a `RelationDecl` with an unknown `from`/`to`, or a key inside the reserved
`relations` object that no declaration defines, is reported with a catalog code
(`core.profile.unknown-kind`, `core.profile.unknown-relation`, `core.relation.unknown`). The
profile's catalog decides the disposition; the core never silently accepts or interprets it.

**An inverse declaration is a bidirectional contract.** `RelationDecl.inverse` names the other
half of the same edge set, so the pair must agree: the inverse is declared from the forward
declaration's `to` kind, names the forward relation back in its own `inverse`, and reverses the
forward `from`/`to` endpoints. A pair that fails any of these is `core.profile.invalid` before
resolution starts, and a forward declaration whose `to` is `"*"` cannot declare an inverse
because the inverse's kind would be undetermined. A declared `inverse` that is not a non-empty
string is `core.profile.invalid` as well: it is never normalized away into "no inverse".

Cardinality describes the values of one direction, not the declaration pair, so the two
declarations do not have to agree; every combination is a legitimate relationship shape. The
relationship is named from the forward declaration's source side, so the forward column states
how many targets one source relates to, and the inverse column how many sources one target
relates to:

| Forward | Inverse | Relationship |
|---|---|---|
| `one` | `one` | one-to-one: one source relates to one target |
| `one` | `many` | many-to-one: many sources share one target |
| `many` | `one` | one-to-many: one source relates to many targets |
| `many` | `many` | many-to-many |

For example, CORE-001's `case.provision` (`cardinality: "one"`) with inverse `vectors`
(`cardinality: "many"`) is many-to-one: many cases share one provision.

The resolver enforces the inverse column on the values it synthesizes, so an inverse declared
`cardinality: "one"` rejects the second source with `core.relation.cardinality`.

Relation values live in a dedicated `relations` object on the entity, never among ordinary
fields (option A in the audit). Inferring intent from an ordinary field name would require
guessing; dropping the check (option B) would lose `core.relation.unknown` entirely. The
namespace costs a one-time data migration in M1 and keeps both guarantees: ordinary fields are
never interpreted as relations, and a typo inside `relations` fails loudly.

### 3.3 Validation policy: closed primitives plus a profile hook

The core always enforces invariants: unique identities, resolvable declared references,
provenance binding shape, known declared kinds and relations, and deterministic output.

Everything else is policy, and policy has two forms.

**Declarative primitives.** A closed set, parameterised by the profile. No expression syntax,
no boolean algebra, no user-defined functions.

```ts
type FieldSelector = string;
// grammar: "name" | "name.sub" | "name[].sub" (one array level, no expressions)

type Scalar = string | boolean | number;

type Condition =
  | { field: FieldSelector; equals: Scalar }
  | { field: FieldSelector; oneOf: Scalar[] }
  | { field: FieldSelector; notIn: Scalar[] }
  | { field: FieldSelector; nonEmpty: true }
  | { field: FieldSelector; empty: true };

type RuleInstance =
  | { rule: "matrix";      entityKind: string;
      when: FieldSelector; then: FieldSelector;
      allowed: Record<string, Scalar[]>; code: string }
  | { rule: "substring";   entityKind: string;
      field: FieldSelector; within: FieldSelector;
      when?: Condition; code: string }
  | { rule: "substringOfProvenance"; entityKind: string;
      field: FieldSelector; code: string }
  | { rule: "requiredIf";  entityKind: string;
      when: Condition; require: FieldSelector[]; code: string }
  | { rule: "forbidden";   entityKind: string;
      fields: [FieldSelector, FieldSelector];
      pairs: Array<[Scalar, Scalar]>; code: string }
  | { rule: "coverage";    targetKind: string; sourceKind: string;
      relation: string; min: number; code: string }
  | { rule: "gate";        entityKind: string; when: Condition;
      code: string; blocking: { draft: boolean; release: boolean } };
```

The entity kind is scoped at the rule level, so a rule cannot reference two kinds;
`coverage` names the covered kind (`targetKind`), the kind holding the link (`sourceKind`), and
a relation declared on the source that points at the target. For CORE-001:
`targetKind: "provision"`, `sourceKind: "case"`, `relation: "vectors"`.

**Profile validator hook.** A profile may ship a module implementing:

```ts
interface ValidatorFinding {
  code: string;                        // must exist in the profile catalog
  entityId?: string;
  location?: { file: string; pointer?: string; line?: number; column?: number };
  data?: Record<string, unknown>;
}

interface ProfileValidator {
  validate(model: ProjectModel): ValidatorFinding[];
}
```

The hook reports findings, not diagnostics. The core looks the code up in the profile catalog,
applies `severity`, `disposition`, `message` and per-mode `blocking`, and sets
`phase: "consistency"`. A finding with an unknown code fails validation
(`core.profile.unknown-code`).

#### Hook trust and determinism boundary

- The hook is **trusted executable code**. The engine loads it with a dynamic `import()` and
  runs it in the same process, with the same privileges. **The engine does not sandbox it.**
- Withholding I/O from the hook's signature is not isolation: the code can import `node:fs`,
  `node:process`, network clients or anything else. Purity is not enforced by the engine.
- Therefore **determinism is a profile-author obligation**, not an engine guarantee, unless
  execution is isolated or otherwise constrained (deferred, `D32`).
- A hook must not depend on clocks, randomness, network, filesystem, process environment or
  mutable external state, and must not mutate the model. Violations are author defects the
  engine cannot detect.
- Local profiles are arbitrary code writable by the user; package profiles add supply-chain
  risk. Pin exact versions, review the code, and prefer first-party profiles. Loading a
  profile is a trust decision equivalent to installing a dependency.
- The hook is versioned with the profile. Its module bytes and all behavior-affecting
  dependencies must participate in build identity: the profile declares its files and exact
  dependency versions (lockfile); the engine hashes them into `profileDigest`, which is part of
  `inputDigest`. Code outside that declared set is an author violation; an unpinned dependency
  is reported as `core.extension.unpinned-dependency`.

#### Executable profile consent

A profile is **declarative** when it supplies only validated data — schemas, relations,
declarative rules, the diagnostic catalogue, labels and templates. It is **executable** when it
ships code modules that the engine imports, currently `view` and `validator` (with their
transitive imports). Declarative data is not thereby risk-free: parsing, schema validation and
resource exhaustion are separate risks.

The engine must not import or evaluate an executable profile module without an explicit
caller decision. Consent is a caller-supplied build option (`allowExecutableProfile: true`; the
M1 CLI flag is `--allow-executable-profile`), never an environment variable and never a
manifest or profile field: a project cannot grant trust to itself. A build whose profile
declares executable modules fails closed with `core.profile.consent-required` before the
first profile module is imported.

Consent is permission to run trusted code in the builder process with the builder's
privileges. It is not sandboxing, capability restriction or isolation; process or WASM
isolation remains deferred (`D32`). Build identity and the static import scan are
integrity/accounting mechanisms, not security boundaries, and they neither grant consent nor
isolate execution. Consumer-supplied adapters and renderers are imported by the consumer and
are trusted by construction; the M1 CLI gates its own profile renderer import on the same
consent flag, on the selected project's declared profile id and `render[].renderer`, and on
successful validation of the selected profile's declared closure. It therefore executes no
built-in renderer that the project did not request and imports no profile code before the
closure is validated. An unreadable lockfile is not treated as a pass: the closure is
unverifiable, so the preflight returns false and the build fails closed with `ERR_IO` before
profile code is imported.

#### Why both

Three current MVP checks would force the primitive set to become a query language: counting
related entities with a field filter (the no-`violated`-vector warning), scanning capitalised
tokens (undefined-term warning), and conjunctions over review state and effect (review
gating). Byte-identical M1 therefore cannot rely on primitives alone. The hook keeps those
checks in the profile without inventing a DSL; primitives cover checks that generalise
cleanly. The second profile (M3) is the evidence for promoting hook checks into primitives.

Mapping of the current CORE-001 checks (kind names are CORE-001 profile data, not core):

| Current check | Mechanism |
|---|---|
| modality → effect compatibility | primitive `matrix` on kind `provision` |
| marker present in claim quote | primitive `substring` |
| classification basis inside claim | primitive `substring` |
| term definition inside source fragment | primitive `substringOfProvenance` on kind `term` |
| paraphrase requires explications | primitive `requiredIf` |
| `violated` + `permission`/`absent` | primitive `forbidden` |
| each provision has ≥ 1 vector | primitive `coverage` |
| open normative dependency gates release | primitive `gate` |
| source header `Doc (Rev x)` | profile hook |
| slice includes/excludes | profile hook |
| review pending / inferred-case review | profile hook |
| non-binding / unresolved / outside-slice warnings | profile hook |
| undefined-term scan, no-`violated`-vector warning | profile hook |

**Cross-entity scope.** The primitives constrain one entity kind named by `entityKind`;
`substringOfProvenance` resolves the entity's own provenance; `coverage` is the only primitive
with an explicit relation. Any other cross-entity check belongs to the profile hook until a
link primitive is justified by a second profile.
### 3.4 Minimal valid project

```text
contract-builder.json
spec.yml                 # one input, any kind the profile declares
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
  byKind: ReadonlyMap<string, Entity[]>;
  relations: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;  // name -> from -> targets
}

interface Entity {
  id: string;
  kind: string;                        // declared in profile.entityKinds
  type?: string;                       // optional profile discriminator
  fields: Readonly<Record<string, unknown>>;  // validated by the kind schema
  provenance?: ProvenanceBinding;
  verification?: ProvenanceVerification;  // result of checking the binding; never implied by it
  relations: Readonly<Record<string, string[]>>;  // declared relation -> target ids
  review?: ReviewState;
}
```

**Reserved field names** (core-owned, may not be redefined by a profile): `id`, `kind`,
`type`, `fields`, `provenance`, `verification`, `relations`, `review`. Everything else is profile
data and opaque to the core.

```ts
interface ProvenanceBinding {
  source: string;                      // manifest source id
  ref: string;                         // adapter-specific locator, passed verbatim
  quote: string;                       // verbatim text
}

type ProvenanceVerificationStatus = "verified" | "failed" | "unavailable" | "stale";

interface ProvenanceVerification {
  status: ProvenanceVerificationStatus;
  record: VerificationRecord;
}

interface VerificationRecord {
  entity: string;
  source: string;
  ref: string;
  verifier: string | null;             // null: no verifier ran
  method: string;                      // "none" for a not-checked record
  checkedAt: string | null;            // null: deterministic build has no trusted clock
  sourceVersion: string | null;        // manifest-declared version, when available
  sourceDigest: string | null;         // "sha256:<hex>" of the bytes the outcome covers
  outcome: string;                     // method-specific result, e.g. found/outside/not-checked
}

interface ReviewState {
  dimensions: Record<string, "pending" | "confirmed">;
  reviewed_by?: Record<string, string>;
}
```

**The core assigns no domain meaning to `kind` or relation names.** It indexes them, verifies
that they are declared, and enforces the generic guarantees below. A specification's ontology
lives entirely in its profile:

- kinds: `fragment | term | provision | decision | case` in CORE-001; `requirement | example |
  operation` in the HTTP API example;
- relations: `dependsOn`, `mentions`, `vectors` in CORE-001; `requirement`, `examples` in the
  HTTP API example.

Generic guarantees:

- every entity has a non-empty identity, unique across the project;
- every declared relation target resolves to an existing entity;
- every `ProvenanceBinding` has the mapped fields and names a declared source — this is the
  binding guarantee, not proof of evidence;
- every entity kind and relation name is declared by the profile;
- output is deterministic.

**Binding versus verification.** A `ProvenanceBinding` says where evidence is claimed to come
from. It does not say that the claim was checked. The core attaches a `not-checked` verification
record when it binds, so an unverified binding is explicit rather than implicit. A profile
verifier may replace that record through the optional hook in §5.2 step 8. A status of
`verified` means only that the declared method found the quote at the declared locator for the
source bytes identified by `sourceDigest`. It is not independent cryptographic verification,
not proof that the quote was well chosen and not a statement about normative meaning. The core
downgrades a `verified` or `failed` record that has no source digest, or whose digest differs
from the loaded source, to `unavailable` or `stale`.

A checked status (`verified`, `failed` or `stale`) must name a verifier, a method other than
`"none"` and an outcome other than `"not-checked"`; a contradictory claim is
`core.provenance.verification`, because it would otherwise present "no verifier ran" as evidence.
`checkedAt` may stay null: a deterministic build has no trusted clock.

**Identity scope.** Global uniqueness across all kinds is a mandatory core invariant. A
relation may target an id from any input, so one namespace keeps lookups unambiguous; a
profile that wants per-kind identity encodes the kind in the id (for example
`API-REQ-014`). The core does not vary the scope per profile.

**Review state.** `pending` and `confirmed` are core-standardized: renderers, diagnostics and
review gates need one stable meaning for these two values. Dimension names and the blocking
policy remain profile-defined, and a profile may leave `review` unused. The core does not add
statuses beyond these two.

`ResolvedManifest` and `ResolvedProfile` are the loader's resolved forms (absolute paths,
loaded profile module). They stay internal; the public model exposes the declared `Manifest`
and `Profile`, so internal loader changes cannot break profile hooks.

**Extension boundary.** A profile adds kinds and fields by declaring them in its schemas; the
core exposes them as `Entity.fields` and never interprets them. A profile cannot add new core
mechanisms without a new primitive or contract change.

An **experimental** `extensions` map on entities may be used by renderers, never by core
validation. It is not part of the stable contract (`proposed`, see D16).

---

## 5. Public input contract

### 5.1 Entity kinds are declared, not assumed

There is no built-in kind list. The profile declares every kind it needs:

```ts
entityKinds: {
  requirement: { schema: "http-api:requirement", identity: "id" },
  example:     { schema: "http-api:example",     identity: "id" },
  operation:   { schema: "http-api:operation",   identity: "operationId" },
}
```

CORE-001 declares `fragment`, `term`, `provision`, `decision`, `case`; the HTTP API profile
declares `requirement`, `example`, `operation`. The core never names any of them. Rules,
relations and coverage refer to kinds by the strings the profile supplied.

The set of kinds is open: an input that declares an undeclared kind fails with
`core.profile.unknown-kind`; nothing is inferred from the name.

### 5.2 Input extraction

Each input file is validated against the schema of each declared kind it extracts. Entities
are extracted by JSON Pointers declared in the manifest.

```json
{
  "path": "requirements.yml",
  "format": "yaml",
  "schema": "http-api:requirements",
  "entities": [{ "kind": "requirement", "pointer": "/requirements" }]
}
```

Extraction and normalization, step by step. Steps 1–5 run for every input before any relation
is resolved; a relation may target an entity from another input.

1. **Document schema.** `InputDecl.schema` validates the complete input document as a whole.
   A document that does not match is `core.schema.document`; extraction does not start.
2. **Pointer.** Every `pointer` must resolve to an array of objects inside the validated
   document. Missing value or wrong shape is `core.extract.pointer`; an `optional` input that
   is absent is skipped.
3. **Kind and entity schema.** The `kind` must exist in `profile.entityKinds`, and every
   extracted object is validated by that kind's `EntityKindDecl.schema`. Unknown kind is
   `core.profile.unknown-kind`; a failed entity schema is `core.schema.entity`.
4. **Identity and fields.** The kind's `identity` selector (default `id`) must yield a
   non-empty string. Missing or empty is `core.identity.missing`; a duplicate across the whole
   project is `core.identity.duplicate`. The validated object becomes `Entity.fields` minus the
   reserved names (`id`, `kind`, `type`, `provenance`, `verification`, `relations`, `review`);
   **fields named
   by provenance mappings are retained** — mappings are projections, not moves. Ordinary fields
   are never inspected for relation intent.
5. **Index (pass 1).** After all inputs are processed, every entity is indexed by id and kind.
   This is the point after which any reference can be resolved.
6. **Relations (pass 2).** Every entity may carry the reserved `relations` object, whose keys
   are relation names declared by a `RelationDecl` with `from` equal to the entity kind. Each
   value (a string or an array of strings) is resolved against `to` (`"*"` means any kind). A
   missing target is `core.reference.unresolved`; `cardinality: "one"` rejects arrays. Resolved
   ids populate `Entity.relations[name]`; the inverse relation, if declared, is populated on the
   target in input order. The inverse obeys its own reciprocal declaration (section 3.2): a
   declaration that cannot reciprocate stops the build before resolution, and an inverse
   declared `cardinality: "one"` rejects a second source with `core.relation.cardinality`.
7. **Provenance binding.** For every `ProvenanceMapping` of the kind, the three selectors are
   read verbatim into `ProvenanceBinding`; the source fields stay in `Entity.fields`. Missing or
   empty is `core.provenance.incomplete`; an undeclared source is `ERR_UNKNOWN_REF`. The binding
   phase attaches an `unavailable`/`not-checked` verification record. It does not check the quote.
8. **Provenance verification.** The profile validator module may export
   `verifyProvenance(model, ctx)`. It returns claims with `status`, `verifier`, `method`,
   `checkedAt`, `sourceVersion`, `sourceDigest` and `outcome`. The core checks each claim against
   the entity's binding and the digest of the loaded source bytes, then stores the result in
   `Entity.verification`; a claim for an entity without a binding, or a malformed claim, is
   `core.provenance.verification`. A profile that omits the hook leaves every binding
   `unavailable`/`not-checked`; the core never invents a verifier, method, time or outcome.
   Locator grammar and quote resolution remain adapter/profile-owned in M1 (D25), so the
   profile hook maps `found`, `outside`, `unsupported` and `unknown-locator` to verification
   statuses; §8.3 of the M1 plan records that boundary. Profile checks that need the quote or
   locator outcome read the stored record instead of calling the adapter again, so one evidence
   claim has one verification result. CORE-001 maps that result to its existing `ERR_SOURCE_*`
   diagnostics and reports a missing, unavailable or stale result as
   `ERR_PROVENANCE_NOT_VERIFIED`.
9. **Unknown relations.** A key inside `relations` that no `RelationDecl` defines is
   `core.relation.unknown`; it is never interpreted or dropped silently. Ordinary fields are
   exempt by construction, because relations cannot live there.

Generic vs profile:

| Step | Core mechanism | Profile configuration |
|---|---|---|
| Pointer extraction | executes pointers, validates shapes | which pointers, which kinds |
| Identity | uniqueness, indexing | identity field per kind |
| References | resolution, inverse population, integrity | relation names, endpoints, cardinality |
| Provenance binding | binding shape, declared source, not-checked record | field mapping, required flag |
| Provenance verification | claim validation, digest consistency, record storage | verifier, method, outcome vocabulary |
| Field semantics | none | schemas, vocabularies, rules |

### 5.3 Multiple sources

`Manifest.sources` is an array. The core supports N sources; each provenance binding names
exactly one source; provenance is verified through that source's adapter. A `VerificationRecord`
identifies the source digest and declared version its outcome covers. Recording that digest is
not a check of a declared `identity.sha256` pin: the digest-pin check accepted in the
provenance-hardening RFC (#4) remains unimplemented and is a separate input to a future record.
The first milestone ships with one source; multi-source remains a core capability with no extra
API surface.

### 5.4 Formats

The default distribution ships one adapter (`yaml-json`). Additional formats are adapters, not
core changes. A project declares the adapter per input or source.

### 5.5 Schema versions

Every schema carries a real, versioned `$id`. The manifest declares `manifestVersion`; the
profile declares its own version; input schemas are identified by id, not by file path.

### 5.6 Worked example: a non-CORE-001 project

`pub-api-001` — an HTTP API specification. It declares its own kinds, relations and
vocabularies; none of CORE-001's names appear.

```json
{
  "manifestVersion": "0.1",
  "project": { "id": "pub-api-001", "title": "Public Orders API", "revision": "2.1.0" },
  "profile": { "id": "http-api", "version": "0.1.0",
               "source": "../../profiles/http-api", "external": true },
  "inputs": [
    { "path": "requirements.yml", "format": "yaml", "schema": "http-api:requirements",
      "entities": [{ "kind": "requirement", "pointer": "/requirements" }] },
    { "path": "examples.yml", "format": "yaml", "schema": "http-api:examples",
      "entities": [{ "kind": "example", "pointer": "/examples" }] }
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

The profile declares kinds, relations, provenance and rules:

```ts
entityKinds: {
  requirement: { schema: "http-api:requirement", identity: "id" },
  example:     { schema: "http-api:example",     identity: "id" },
  operation:   { schema: "http-api:operation",   identity: "operationId" },
},
relations: [
  { name: "requirement", from: "example", to: "requirement",
    cardinality: "one", inverse: "examples" },
],
provenance: [
  { kind: "requirement", source: "source", ref: "source_ref", quote: "quote" },
],
rules: [
  { rule: "matrix", entityKind: "requirement", when: "level", then: "effect",
    allowed: { MUST: ["binding"], SHOULD: ["recommended"], MAY: ["permitted"] },
    code: "http-api.consistency.level" },
  { rule: "coverage", targetKind: "requirement", sourceKind: "example",
    relation: "requirement", min: 1, code: "http-api.conformance.coverage" },
],
```

Input data:

```yaml
requirements:
  - id: API-REQ-014
    level: MUST
    effect: binding
    category: endpoint
    applies_to: "POST /v1/orders"
    source: SRC-OPENAPI
    source_ref: "#/paths/~1orders/post"
    quote: "A repeated request with the same Idempotency-Key MUST NOT create a second order."

examples:
  - id: CASE-API-REQ-014-1
    given: { method: POST, path: /v1/orders, key: "k-1" }
    expect: { orders_created: 1 }
    relations:
      requirement: API-REQ-014
```

Transformation to the IR (mapped fields stay in `fields`; `provenance` is a projection):

```json
{
  "id": "API-REQ-014",
  "kind": "requirement",
  "fields": {
    "level": "MUST", "effect": "binding", "category": "endpoint",
    "applies_to": "POST /v1/orders",
    "source": "SRC-OPENAPI", "source_ref": "#/paths/~1orders/post",
    "quote": "A repeated request with the same Idempotency-Key MUST NOT create a second order."
  },
  "provenance": {
    "source": "SRC-OPENAPI",
    "ref": "#/paths/~1orders/post",
    "quote": "A repeated request with the same Idempotency-Key MUST NOT create a second order."
  },
  "relations": { "examples": ["CASE-API-REQ-014-1"] }
}
```

The example shows the binding projection. Without a profile `verifyProvenance` hook the entity
also carries a not-checked record: `verification: { status: "unavailable", record: { verifier:
null, method: "none", checkedAt: null, sourceVersion, sourceDigest: null, outcome:
"not-checked" } }`. A hook may replace it only with the evidence it actually produced.

Validation trace:

1. `requirement` and `example` are declared kinds — otherwise `core.profile.unknown-kind`.
2. Identities are present and unique — otherwise `core.identity.missing` /
   `core.identity.duplicate`.
3. `example.relations.requirement` resolves to an entity — otherwise `core.reference.unresolved`;
   the inverse `examples` is populated on the requirement.
4. If the profile provides a verifier, the OpenAPI adapter locates the quote at
   `#/paths/~1orders/post`; a missing quote or locator is rendered as `failed`, an unsupported
   adapter as `unavailable`. Without a verifier the binding stays `unavailable`/`not-checked`.
5. `level=MUST` allows `effect=binding` — otherwise `http-api.consistency.level`.
6. The requirement has at least one example — otherwise `http-api.conformance.coverage`.

No CORE-001 concept (`slice`, `fragment`, `normative_effect`, `source_modality`) appears in the
core or in this profile. The example is the acceptance test for D6 and D15; it is not
implemented in this iteration.

### 5.7 Path resolution and trust

The project root is the directory containing the manifest, canonicalized with `realpath`.
Every declared path is resolved against it and then checked for containment; `..` is applied
before the check, so it cannot escape silently.

| Category | May leave the root? | Condition |
|---|---|---|
| Project inputs | yes | `inputs[].external: true` |
| Source documents | yes | `sources[].external: true` |
| Local profile directory | yes | `profile.external: true` |
| Renderer templates/assets | yes | `render[].external: true` |
| Output root and artifacts | no | canonicalized, containment-checked; traversal or symlink escape is `core.path.outside-root` |
| Installed packages | n/a | resolved by the host resolver |

Rules:

- Without the matching `external: true`, an out-of-root path is `core.path.outside-root`.
- Every output path is resolved against the canonical output root and must remain inside it;
  `..`, absolute paths and symlinks that escape the output root are rejected with the same
  code. Outputs are never allowed outside the project root.
- `external: true` is an explicit trust declaration in the manifest; it is visible in review
  and participates in `inputDigest`.
- Installed profile/adapter/renderer packages are resolved by the runtime's package resolver,
  not by path traversal; their exact version is pinned in the manifest and hashed into the
  build identity.
- Symlinks are resolved before the containment check; a symlink that escapes the root is
  treated as out-of-root.
- The engine never rewrites or normalizes a source locator (`ref`); it is opaque and passed to
  the adapter verbatim.

---

## 6. Validation guarantees and boundaries

### 6.1 Phases (internal, replaceable)

```ts
type Phase =
  | "load" | "structure" | "reference" | "provenance" | "verification"
  | "consistency" | "review" | "conformance" | "artifact";

type PhaseState = "passed" | "failed" | "skipped";
```

| Phase | Guarantee | Not guaranteed |
|---|---|---|
| `load` | bytes read, manifest parsed, profile resolved | content correctness |
| `structure` | documents match input schemas; extracted entities match kind schemas | semantic meaning |
| `reference` | IDs unique, relations resolvable | that references are *appropriate* |
| `provenance` | binding shape and declared source; a `ProvenanceVerification` result is stored separately with its own status and record | that the quote is in the source; that a binding is verified evidence |
| `verification` | profile verifier's recorded result is well formed and tied to the loaded source digest | that the verifier is honest, independent or correct; that the quote was well chosen |
| `consistency` | declared fields do not contradict profile rules | normative truth |
| `review` | unconfirmed content is marked and gated | that the reviewer is right |
| `conformance` | vectors are structurally and referentially consistent | execution |
| `artifact` | output is deterministic and matches the checked artifact | that the document is meaningful |

Phases are an **internal decomposition**. The public API exposes only `validate`, `build`,
`render`, `check` (D7). Phase identifiers appear in diagnostics so consumers can filter
without depending on the pipeline.

### 6.2 Phase dependencies

`structure` requires `load`; `reference`, `provenance`, `verification`, `consistency`, `review`,
`conformance` require `structure`; `verification` requires `provenance`; `artifact` requires a
successful build. A failing phase marks dependent phases `skipped` in the result; skipped phases
never emit diagnostics.

### 6.3 What the engine will never claim

- that a provision is legally or normatively correct;
- that a reviewed classification is correct;
- that a declarative case passes;
- that a structurally valid `ProvenanceBinding` is verified evidence, or that `verified` means
  independent or cryptographic verification;
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

`core.provenance.verification` is a core-owned check of the verifier's own claim: it fires for a
claim about an entity without a direct binding, or for a malformed status, method, outcome or
source digest. It validates the record's shape and digest consistency only; it never asserts
that the verification result is true.

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
  mode: BuildMode;
  diagnostics: Diagnostic[];
  phases: Record<Phase, PhaseState>;
  artifacts: Artifact[];
  identity: {
    projectId: string;
    engineVersion: string;
    manifestVersion: string;
    inputDigest: string;               // authoritative: inputs + all extension identities/closures
    extensions: Array<{                // complete set used; no hashes duplicated
      kind: "profile" | "adapter" | "renderer";
      id: string;
      version: string;
    }>;
  };
}

interface Artifact {
  path: string;                        // relative to output root
  bytes: number;
  sha256: string;
}
```

### 8.1 Determinism guarantee

> Same `engineVersion` + `inputDigest` + the identity of every executable extension ⇒
> byte-identical artifacts, **provided every extension honours its deterministic contract**.

`inputDigest` covers:

- the canonicalized manifest, including `external` flags;
- all text input bytes normalized to LF (JSON, YAML, Markdown, templates); binary sources
  hashed as raw bytes;
- `profileDigest` — the profile extension, including its hook module;
- for every source adapter used: `{ id, version, closureDigest }`;
- for every renderer used: `{ id, version, closureDigest }`.

An extension identity is `{ id, version, closureDigest }`. `closureDigest` hashes the
extension's declared files and its **complete dependency closure** as recorded in its lockfile
(name, exact version, integrity). For a profile this includes the hook module and everything
the hook can import; a dependency absent from the lockfile is
`core.extension.unpinned-dependency`. Code outside the declared closure is an author violation
the engine cannot detect.

Determinism is **conditional**: adapters, renderers and profile hooks are trusted executable
extensions. They run in-process, are not sandboxed, and the engine cannot enforce that they
avoid clocks, randomness, network, filesystem, environment or mutable external state. If any
extension violates its deterministic contract, byte-identical output is not guaranteed.

Excluded from `inputDigest`: clock, locale, environment variables, absolute paths, file
mtimes, user identity, network state.

`inputDigest` is the authoritative build identity. `identity.extensions` lists every profile,
adapter and renderer used, so a consumer can inspect what produced the artifact without the
closure hashes being duplicated; the singular `renderer` field of earlier drafts is removed
because a build may use several.

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
byte equality is a renderer test, not a core promise. Nor does it guarantee determinism when a
trusted extension violates its deterministic contract — the identity in `inputDigest` makes
such a violation visible only if the extension's bytes or closure change.

---

## 9. Public TypeScript API

```ts
import type { BuildMode, BuildResult, Diagnostic } from "@contract-builder/core";

interface FileSystem {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  readdir(path: string): Promise<string[]>;
  mkdir(path: string): Promise<void>;   // creates missing parents
}

interface LoadOptions {
  root: string;                        // directory containing the manifest
  manifest?: string;                   // default "contract-builder.json"
  fs?: FileSystem;                     // default: node fs
  adapters?: Record<string, SourceAdapter>;  // by adapter id
  signal?: AbortSignal;
}

interface LoadedProject {
  model: ProjectModel;
  diagnostics: Diagnostic[];           // load/structure diagnostics
}

export function loadProject(options: LoadOptions): Promise<LoadedProject>;

export interface ValidationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  phases: Record<Phase, PhaseState>;
}

export function validateProject(project: LoadedProject): Promise<ValidationResult>;

export function buildProject(
  project: LoadedProject,
  options: {
    mode: BuildMode;
    renderer?: Renderer;               // single-use override
    renderers?: Record<string, Renderer>;  // by renderer id
    write?: boolean;
    fs?: FileSystem;                   // defaults to the fs used by loadProject
    signal?: AbortSignal;
    allowExecutableProfile?: boolean;  // explicit consent; see §3.3
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

The M1 implementation exposes only `runBuild(BuildOptions)` from `spec/lib/build.ts`; the
operations above are the M2 target and are not implemented (see the
[implementation-status matrix](implementation-status.md)). `BuildOptions` carries the same
consent field: `allowExecutableProfile?: boolean`, default `false`, as described in §3.3.

---

## 10. CLI contract

```text
contract-builder validate [root] [--json] [--strict]
contract-builder build    [root] [--mode draft|release] [--check] [--json] [--strict]
contract-builder check    [root] [--json]
```

The M1 CLI exposes `--allow-executable-profile`; without it a build whose profile declares
executable modules fails closed with `core.profile.consent-required` and imports no profile
code. The CLI loads its built-in profile renderer only when the selected project declares both
that profile and that renderer id and the profile's declared closure validates; consent alone
never selects executable code. The contract CLI must carry an equivalent explicit consent flag
when it is implemented; consent must never be supplied by a manifest, profile or environment
variable alone.

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
  verifyQuote(source: SourceDocument, ref: string, quote: string): Promise<LocatorResult>;
}

type LocatorResult = "found" | "outside" | "unsupported" | "unknown-locator";

interface Renderer {
  id: string;
  version: string;
  render(model: ProjectModel, options: RenderOptions): Promise<Artifact[]>;
}

interface TemplateSet {
  entry: string;                       // e.g. "core001.md.j2"
  files: Record<string, string>;       // path -> text, all preloaded
}

interface RenderOptions {
  mode: BuildMode;
  templates: TemplateSet;
  labels?: Record<string, string>;
  diagnostics: readonly Diagnostic[];
}
```

Renderers perform no I/O: the engine resolves `profile:` paths, preloads every text file under
the template root (the entry's directory by default) and passes them as a `TemplateSet`, so
`{% include %}` and `{% extends %}` work without file access. All template files participate
in `inputDigest`; rendering stays a pure function of the model and the supplied content.

`diagnostics` is **required**: the engine always passes the deterministic diagnostic snapshot
produced up to the render phase, in rendered order (`Diagnostic[]`). It is supplied because an
artifact may embed the diagnostics report, and passing it keeps that artifact a pure function of
the model, the options and the template. A renderer that does not embed diagnostics may ignore
the field.

Adapters and renderers are **trusted executable extensions**: they run in-process, are not
sandboxed, and must honour the deterministic contract. They are resolved by id from registries
supplied by the consumer; the CLI wires the built-in packages (`adapter-yaml-json`,
`renderer-markdown`). A missing id is `core.registry.missing`, not a silent fallback. Each
extension's `{ id, version, closureDigest }` participates in `inputDigest` (§8.1). The engine's
consent option governs profile modules it loads from the manifest; a consumer that imports an
adapter or renderer before calling the engine has made its own trust decision. The M1 CLI must
not import the profile-owned renderer unless the caller passed the consent flag, the selected
project declares that profile and renderer id, and the selected profile's declared closure has
validated.

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
| Validate declared relation to the target kind | yes (coverage rule) |
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
| `spec/lib/model.ts` | core IR: ids, kinds and relations from profile declarations | M2 |
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
2. Move to `profiles/core001/`: entity kind declarations, relation declarations, schemas,
   vocabularies, rule instances, diagnostic catalog, labels, template, output names, hook.
3. Make the loader read the manifest and extract entities by declared kind and pointer.
4. Move policy checks out of core: declarative primitives where they fit, profile hook
   otherwise (§3.3). **Keep the existing diagnostic code strings** in M1 (rename in M2).
5. Introduce the IR envelope with `kind` as a profile string and declared relation names; no
   CORE-001 kind or relation name may appear in core code or core schemas.
6. Add one synthetic minimal profile in tests with different kinds and vocabulary (e.g.
   `requirement` and `example`, not renamed CORE-001 kinds) to prove separation; it is not a
   second real profile.
7. Move CORE-001 relation values into the reserved `relations` object (relation namespace,
   §5.2); ordinary fields and generated artifacts are unchanged.

Out of scope for M1: package split, public API, new diagnostic codes, multi-source, review
dimensions, OpenAPI adapter, CLI changes.

Acceptance criteria:

- [ ] CORE-001 is represented as a project with a manifest and a profile.
- [ ] No CORE-001 vocabulary, matrix, label, path or output name remains in generic code.
- [ ] No CORE-001 kind or relation name (`fragment`, `term`, `provision`, `decision`, `case`,
      `dependsOn`, `mentions`, `vectors`) appears in core code or core schemas.
- [ ] The profile hook is loaded from the profile; its module and declared dependencies are in
      `profileDigest`.
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
the evidence that the kind set and rule primitives are not CORE-001-shaped.

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
4. **Profile hook.** *Default:* a trusted, digest-pinned profile validator hook is allowed in
   0.x for checks the primitives cannot express; determinism is an author obligation, data-only
   remains preferred. *Changed by:* a second profile showing the hook is unnecessary, or a
   requirement to isolate execution.
5. **Self-hosting depth.** *Default:* manifest schema + diagnostic registry + rule kinds are
   self-described; the full document pipeline is not. *Changed by:* M5 scope decision.

---

## 18. Decision register

Legend: `A` accepted (directed in the iteration brief §1.x or the final revision brief §1–§4),
`P` proposed, `D` deferred, `U` unresolved. "Blocks M1" means the first milestone cannot start
without the decision.

| ID | Decision | Status | Selected option | Alternatives | Rationale | Consequence / impact | Blocks M1 |
|---|---|---|---|---|---|---|---|
| D1 | Core/profile/project split | A (§1.1) | core mechanisms, profile semantics, project content | core with built-in CORE-001 defaults | prevents domain leakage | profiles become a first-class artifact | no |
| D2 | Manifest | A (§1.2) | required `contract-builder.json` | convention over paths | only fixed name; everything else declared | loader rewritten in M1 | yes |
| D3 | Manifest contents | A (§1.2) | identity, versions, inputs, sources, outputs | implicit discovery | explicit contract surface | schema + tests | yes |
| D4 | Do not reuse `spec/` layout | A (§1.2) | manifest-driven inputs and kinds | keep five files | layout is project policy | files become declarative | yes |
| D5 | IR stability | A (§1.3) | experimental, versioned, unstable before 1.0 | freeze now | no second profile yet | IR changes allowed with notice | no |
| D6 | Entity kinds and relation types | A (rev. §1) | declared by the profile; relation values in a reserved `relations` namespace; core indexes strings | fixed enum; inference from ordinary fields | no domain assumptions in core; no guessing | profile declares its ontology; validated by §5.6 | yes |
| D7 | Public operations | A (§1.4) | `load/validate/build/render/check`; phases internal | eight public phase calls | no consumer requires per-phase API | phase data stays in diagnostics | no |
| D8 | Diagnostic axes | A (§1.5) | severity + disposition + blocking | severity only | separates impact from policy | new shape in M2 | no |
| D9 | Blocking policy | A (§1.5) | profile/project policy + mode | hardcode per code | same code may gate differently | policy lives in profile | no |
| D10 | Determinism scope | A (§1.6) | byte equality per engine + inputDigest + extension identities, conditional on extension contracts | absolute reproducibility | extensions are trusted and not sandboxed | adapter/renderer/hook closures in digest | no |
| D11 | Conformance | A (§1.7) | declarative only | execution in core | avoids a rule language | execution is a separate future package | no |
| D12 | Self-hosting | A (§1.8) | planned, not a blocker | require before 1.0 | keeps M1 bounded | M5 | no |
| D13 | Non-CORE-001 evaluation | A (§1.9) | worked example, no implementation | build it now | proves separation cheaply | §5.6 in this doc | no |
| D14 | Package layout | P | core + cli + renderer-markdown + adapter-yaml-json + profile-core001 | single package with subpaths | boundaries match responsibilities; published separately | M2 | no |
| D15 | Validation policy mechanism | P | closed primitives keyed by `entityKind` + trusted profile hook (§3.3) | data-only; code-only | byte-identical M1 needs checks that primitives cannot express without a DSL | profile hook is versioned and participates in inputDigest | yes |
| D16 | IR envelope | P | `id/kind/type/fields/provenance/relations/review` | typed per-domain entities | keeps any one specification's ontology out of core | global id namespace; review states core-standardized, dimensions profile-defined; `extensions` experimental | yes |
| D17 | Code format | P | `profile.domain.name` strings + registry | numeric codes | readable, namespaced, stable | registry + migration map in M2 | no |
| D18 | Build status | P | `ok/review-required/invalid/io-error` | boolean ok | distinguishes review from invalid | API + exit mapping | no |
| D19 | Runtime | P | Node 20+ library, Bun dev/CI | Bun-only | library consumers use Node | CI matrix | no |
| D20 | Distribution | U | npm `@contract-builder/*`, 0.x | org scope; private tarball | default until #10 resolves | publication only | no |
| D21 | Multi-source | P | array in core, one in MVP | single-source for good | schema already allows list; #5 decides semantics | adapter boundary | no |
| D22 | Provenance optional | P | profile flag `requireProvenance` | always required | greenfield specs | profiles without sources | no |
| D23 | `slice` | P | not first-class; profile scoping data | core concept | migration-specific | CORE-001 profile carries it | no |
| D24 | Review dimensions | P | N named dimensions declared by profile; `pending`/`confirmed` core-standardized | fully profile-defined states | gating needs one vocabulary | M4 | no |
| D25 | Locator ownership | P | adapter verifies quotes | core parser | format-specific | adapter interface | yes |
| D26 | Self-hosting scope | D | manifest/registry/rules only | full pipeline | keep M5 bounded | revisit in M5 | no |
| D27 | Conformance execution | D | not in core | separate evaluator | needs its own contract (#8) | none now | no |
| D28 | Profile hook trust and identity | A (rev. §2) | trusted code, no sandbox, author-owed determinism, digest-pinned | sandbox; forbid hooks | the engine cannot enforce purity | security review, lockfile, `profileDigest` | yes |
| D29 | Profile distribution | U | local dir in M1, package in M5 | package in M1 | avoids premature publishing | M1 uses local profile | no |
| D30 | Policy override scope | P | profile defaults + project overlay, profile may forbid overrides | project free override | prevents accidental weakening | manifest `policy` | no |
| D31 | Path and trust boundary | A (rev. §4) | root-contained by default; explicit `external: true`; outputs always contained | implicit relative paths | prevents silent traversal and symlink escape | manifest flags, `core.path.outside-root` | yes |
| D32 | Isolated hook execution | D | not in 0.x; hooks run in-process | sandbox/worker isolation | no implementation in this PR | revisit if isolation is required | no |
| D33 | Provenance binding versus verification | A (#37) | binding is structural; verification is a separate recorded result with `verified`/`failed`/`unavailable`/`stale` and a `VerificationRecord` | one boolean "verified" flag; treat a binding as evidence | consumers must be able to tell a well-formed binding from a checked result | `Entity.verification`, optional profile `verifyProvenance` hook, output provenance section; source digest records what was checked, not a declared pin | no |

D33 is accepted by the maintainer's Issue [#37](https://github.com/agent-federation/contract-builder/issues/37)
task comment (2026-11-02), which directs the binding/verification split; it is not part of the
original iteration brief that sourced D1–D32.

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

1. D14 — package layout: accept the five-package split?
2. D15 — validation primitives: accept the closed set keyed by `entityKind` (the hook itself
   is directed in rev. §2)?
3. D16 — IR envelope and `extensions` status.
4. D18 — build status enum.
5. D20 — distribution and scope (blocked by #10).
6. D29 — profile distribution in M1 (local directory).
7. Confirm the four behavior corrections listed at the end of §18 for M2.

Everything else is either directed by the briefs (`accepted`) or has a recommended default in
§17. D6 (profile-declared kinds and relations) and D31 (path trust, rev. §4) are directed.

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
      "entities": [{ "kind": "fragment", "pointer": "/fragments" }] },
    { "path": "ontology.yml", "format": "yaml", "schema": "core001:ontology",
      "entities": [{ "kind": "term", "pointer": "/terms" }] },
    { "path": "semantics.json", "format": "json", "schema": "core001:semantics",
      "entities": [{ "kind": "provision", "pointer": "/provisions" }] },
    { "path": "decisions.yml", "format": "yaml", "schema": "core001:decisions",
      "entities": [{ "kind": "decision", "pointer": "/decisions" }] },
    { "path": "conformance/cases.yml", "format": "yaml", "schema": "core001:cases",
      "entities": [{ "kind": "case", "pointer": "/cases" }] }
  ],
  "sources": [
    { "id": "SRC-CORE001", "path": "../CORE-001.legacy.md", "adapter": "markdown",
      "external": true,
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

The profile declares the kinds `fragment`, `term`, `provision`, `decision`, `case` and the
relations `dependsOn`, `mentions`, `vectors`; these strings exist only in `profiles/core001`,
never in the core.

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
