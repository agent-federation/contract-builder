# M1 Implementation Plan — Manifest, Profile and Generic Core

**Status:** proposed for maintainer review
**Depends on:** merged `docs/architecture/engine-public-contract.md` (PR #14)
**Baseline commit:** `2ace388`
**Document version:** 1.0
**Implementation status:** not started (pre-M1 record)
**Current implementation status:** M1 PRs 1–7 implemented and tested as of `f1ddcf7`; see the [implementation-status matrix](implementation-status.md).

> **Authority.** This document does not accept any ADR. It records the decisions the
> maintainer approved for M1 (section 3), the implementation choices those decisions force
> (marked *implementation choice*), and the questions that stay open (section 18).
> Where this document and `engine-public-contract.md` disagree, the contract wins and the
> disagreement is listed in section 18.

---

## 1. Measured baseline

Taken at `2ace388` before any change:

| Fact | Value |
|---|---|
| Tests | 16 pass, 0 fail (`bun test`) |
| Typecheck | clean (`tsc --noEmit`) |
| `bun run check` | clean — committed artifact matches a fresh build |
| Artifact | `spec/output/CORE-001.draft.md`, 298 lines |
| Artifact SHA-256 | `a29ce609269a8ad9185ed50576d4e6276b586f740d2ea8b4ef7f06f6c05988df` |
| Diagnostics | 15 total: 0 error, 5 review, 10 warning |
| Distinct diagnostic codes | 8 (all `REVIEW_*` / `WARN_*`; no `ERR_*`) |
| Kinds in data | `fragment` (7), `term` (2), `provision` (5), `decision` (1), `case` (13) |
| Input files | 5 (`sources.yml`, `ontology.yml`, `semantics.json`, `decisions.yml`, `conformance/cases.yml`) |

The absence of `ERR_*` diagnostics in the golden build matters: core diagnostic codes may
change for error paths without touching the artifact. Test assertions are the binding
constraint there, not the hash.

---

## 2. How to read this document

| Label | Meaning |
|---|---|
| **Directed** | Accepted in `engine-public-contract.md` (D1–D13, D28, D31) or approved by the maintainer for M1 (section 3). |
| **Implementation choice** | A decision this document makes inside the space the contract leaves open. Reviewable, not an ADR. |
| **Open** | Not decided. Blocks nothing in M1 unless stated; must not be resolved silently. |

**Section references.** `section N` means a section of this document. `contract §N` means a
section of `engine-public-contract.md`. Bare `§N` is not used, because both documents have
sections with the same numbers.

M1 proves **separability**, not genericity. Moving CORE-001 policy into `profiles/core001/`
demonstrates that the core can run without it. Only an independent profile (PR 7, synthetic)
gives evidence about genericity, and a synthetic profile is weak evidence.

---

## 3. Approved decisions and their M1 effect

| ID | Decision | Status after this task | M1 effect |
|---|---|---|---|
| D14 | Package layout | **Directed: future target, not M1 scope.** A profile may provide a renderer module registered by the consumer through the renderer registry. | No packages. Module layout stays under `spec/lib/`. `profiles/core001/renderer.ts` exists and is registered by the CLI/test harness. |
| D15 | Validation policy mechanism | **Directed: hook-only in M1.** The closed primitive set is deferred to M3. | Every CORE-001 semantic check lives in `profiles/core001/`. The core implements no rule primitives. The hook is modular (section 10.1). |
| D16 | IR envelope | **Directed: accept, narrowed.** | `id/kind/fields/provenance/relations` implemented. `review` stays opaque profile data inside `fields`. `type` and `extensions` unused. |
| D18 | Build status enum | **Directed: defer.** | `BuildResult` keeps `exitCode`/`blockedBy`/`markdown`/`written`/`outputPath`. No `status` field. |
| D20 | Distribution | **Directed: defer.** | Nothing published. No package metadata. |
| D29 | Profile distribution | **Directed: local directory.** | `profiles/core001/` at repository root, referenced from the manifest with `external: true`. No remote resolution. |

D15 is narrowed, not re-decided: the hook remains the M1 mechanism, and the primitive set is
still the M3 target. D16 is narrowed: the envelope is implemented, the review half is not.

---

## 4. Audit — current modules and their M1 destination

| Current module | What it does today | Destination | PR |
|---|---|---|---|
| `spec/lib/load.ts` | 5 hardcoded filenames + formats; reads the legacy document by relative path | Generic loader: manifest → declared inputs → parsed documents | 2 |
| `spec/lib/schema.ts` | 5 hardcoded schema files; validates whole documents only | Structure phase: document schema by id, then per-kind entity schema by id | 2, 3 |
| `spec/lib/model.ts` | The CORE-001 ontology (`SourceModality`, `NormativeEffect`, 5 entity interfaces) plus derived axes | Generic IR (`Entity`, `ProjectModel`); CORE-001 types move to the profile | 3 |
| `spec/lib/semantic.ts` | 670 lines: indexing, every CORE-001 check, derived view | Split: indexing/identity/reference → core; all checks → profile hook | 3, 4 |
| `spec/lib/diagnostics.ts` | `severity: error\|warning\|review`; no phase, disposition or blocking | **Unchanged in M1.** One read-only accessor added for the golden snapshot. | 1 |
| `spec/lib/locator.ts` | Markdown section / table-column / list-item locator | `spec/lib/adapters/markdown.ts` behind `SourceAdapter` | 3 |
| `spec/lib/render.ts` | CORE-001 view mapping, nunjucks, byte finalization | Core: registry, `TemplateSet` preloading, artifact normalization. CORE-001 view → `profiles/core001/renderer.ts` | 5 |
| `spec/lib/build.ts` | Orchestration, hardcoded output names, severity-based blocking | Generic orchestrator; output paths from `render[].outputs` | 2–6 |
| `spec/build.ts` | CLI: arguments, human and JSON output | Unchanged except project-root resolution | 2 |
| `spec/*.yml`, `spec/*.json` | Project data, one file per kind | Same files + `contract-builder.json`; `sources` block moves out; relation values move into `relations` | 2, 3 |
| `spec/schemas/` | Document and entity schema combined per file | `profiles/core001/schemas/`: document schemas + per-kind entity schemas | 3 |
| `spec/templates/` | One template | `profiles/core001/templates/` | 5 |
| `tests/build.test.ts` | 16 tests against `runBuild` | Kept; assertions unchanged | — |
| `fixtures/*` | 3 full copies of all 5 data files | Same directories + manifests; `sources` block removed | 2, 3 |

**What stays unchanged:** the CLI surface, `BuildResult` shape, `Diagnostics` shape and labels,
all 16 test assertions, the artifact bytes, the exit-code mapping.

---

## 5. Target M1 architecture

```text
contract-builder/
  spec/                              # PROJECT ROOT (directory containing the manifest)
    contract-builder.json            # NEW: manifest
    sources.yml ontology.yml         # project data (sources block removed)
    semantics.json decisions.yml
    conformance/cases.yml
    output/CORE-001.draft.md         # generated, committed
    lib/                             # ENGINE (temporary home; moves at the M2 split)
      manifest.ts                    # manifest parse + resolution
      load.ts                        # declared inputs -> documents
      schema.ts                      # document + entity schema by id
      ir.ts                          # Entity, ProjectModel, extraction
      relations.ts                   # declarations, resolution, inverse
      provenance.ts                  # binding shape + declared source
      diagnostics.ts                 # unchanged
      registry.ts                    # renderer registry lookup
      identity.ts                    # inputDigest, closure digests
      render.ts                      # TemplateSet preload + artifact normalization
      build.ts                       # orchestration
      adapters/markdown.ts           # locator behind SourceAdapter
    build.ts                         # CLI (unchanged surface)
  profiles/core001/                  # PROFILE (external to the project root)
    profile.json                     # kinds, relations, provenance, documents, catalog, files
    schemas/*.schema.json            # document + per-kind entity schemas
    validator.ts                     # hook aggregator
    checks/*.ts                      # one module per check family
    renderer.ts                      # CORE-001 renderer (view mapping)
    templates/core001.md.j2
    labels.ru.json
  profiles/example/                  # PR 7: minimal independent profile
```

**Implementation choice (project root).** The project root is `spec/`, matching Appendix A.
Consequence: `profiles/core001` is outside the project root and therefore requires
`"external": true`; `CORE-001.legacy.md` is outside and requires `"external": true` on the
source declaration. This is deliberate — it exercises the accepted D31 trust boundary on the
two extensions M1 actually uses.

**Implementation choice (engine location).** The engine stays in `spec/lib/` for M1, inside the
project root. This is layout debt accepted under D14 ("keep the current module layout") and
removed by the M2 package split. It does not affect `inputDigest`, which covers declared inputs
only.

---

## 6. Project boundary and manifest

`spec/contract-builder.json`:

```json
{
  "manifestVersion": "0.1",
  "project": { "id": "uia-core-001", "title": "Identity, mandates, lineage and local acceptance", "revision": "0.3.3" },
  "profile": { "id": "core001", "version": "0.1.0", "source": "../profiles/core001", "external": true },
  "inputs": [
    { "path": "sources.yml",             "format": "yaml", "schema": "core001:sources",     "entities": [{ "kind": "fragment",  "pointer": "/fragments" }] },
    { "path": "ontology.yml",            "format": "yaml", "schema": "core001:ontology",    "entities": [{ "kind": "term",      "pointer": "/terms" }] },
    { "path": "semantics.json",          "format": "json", "schema": "core001:semantics",   "entities": [{ "kind": "provision", "pointer": "/provisions" }] },
    { "path": "decisions.yml",           "format": "yaml", "schema": "core001:decisions",   "entities": [{ "kind": "decision",  "pointer": "/decisions" }] },
    { "path": "conformance/cases.yml",   "format": "yaml", "schema": "core001:cases",       "entities": [{ "kind": "case",      "pointer": "/cases" }] }
  ],
  "sources": [
    { "id": "SRC-CORE001", "path": "../CORE-001.legacy.md", "adapter": "markdown", "external": true,
      "identity": { "document": "UIA-CORE-001", "revision": "0.3.3" } }
  ],
  "render": [
    { "renderer": "core001-markdown", "template": "profile:templates/core001.md.j2",
      "labels": "profile:labels.ru.json",
      "outputs": { "draft": "output/CORE-001.draft.md", "release": "output/CORE-001.md" } }
  ],
  "output": { "root": "." }
}
```

**Correction to Appendix A.** Appendix A writes `"source": "./profiles/core001"` with the
manifest in `spec/`. That resolves to `spec/profiles/core001`, which does not exist. The
correct declaration for a repository-root `profiles/` directory is `../profiles/core001` with
`external: true`.

**Data migration in the same PR.** The `sources:` block is removed from `sources.yml`; the
document schema for `core001:sources` drops that property. `slice` and `fragments` stay.
`fragment.source` keeps referencing `SRC-CORE001`, now declared in the manifest.

---

## 7. IR and the `relations` namespace

### 7.1 Relation inventory (complete)

Every relation-shaped field in the current data, derived from the schemas and the entities,
not from naming:

| # | From kind | Field today | Relation name | To kind | Cardinality | Required | Inverse | Occurrences |
|---|---|---|---|---|---|---|---|---|
| 1 | `provision` | `fragment` | `fragment` | `fragment` | one | required | none | 5/5 |
| 2 | `provision` | `terms[]` | `terms` | `term` | many | required (may be empty) | none | 3 entities, 4 refs |
| 3 | `provision` | `decision_dependencies[]` | `dependsOn` | `decision` | many | required (may be empty) | none | 0 refs |
| 4 | `provision` | `decision_mentions[]` | `mentions` | `decision` | many | required (may be empty) | none | 2 refs |
| 5 | `case` | `provision` | `provision` | `provision` | one | required | **`vectors`** on `provision` | 13/13 |
| 6 | `case` | `rationale_fragment` | `rationaleFragment` | `fragment` | one | required | none | 13/13 |
| 7 | `term` | `fragment` | `fragment` | `fragment` | one | required | none | 2/2 |

Seven declarations, seven field occurrences, six distinct field names (`fragment` is declared
once for `provision` and once for `term`).

**Source field names are migration metadata, not identifiers.** The `Field today` column names
the fields in the current data files. The `Relation name` column is the profile-owned identifier
that appears as a key inside the `relations` object and that the core indexes. The two are
deliberately different where the accepted contract already defines an identifier: the data field
`decision_dependencies` becomes `dependsOn`, and `decision_mentions` becomes `mentions`.

**Where requiredness is enforced.** `RelationDecl` has no `required` property (contract §3.2),
and M1 does not add one. The three concerns have three owners:

| Concern | Owner | Mechanism |
|---|---|---|
| Key presence | Profile-owned entity schema | `required: ["relations"]` on each kind that has outgoing relations, plus `required: [...]` inside the `relations` property |
| Cardinality | Core relation resolver | `cardinality: "one"` rejects an array; `"many"` accepts a string or an array |
| Target existence | Core relation resolver | `ERR_UNKNOWN_REF` when a target id is not indexed |

The entity schema does not duplicate cardinality: it types relation values as
`string | string[]`, so each concern has exactly one enforcement point. A missing required
relation key is therefore a structure-phase failure (`core.schema.entity`) reported before
relation resolution runs. For CORE-001 the required keys are `fragment`, `terms`, `dependsOn`,
`mentions` on `provision`; `provision`, `rationaleFragment` on `case`; `fragment` on `term`.
`vectors` is resolver-populated from `case.provision`, so it is never a required key in the
source data and validation must not run after the inverse is added.

**Reconciliation with the contract.** An earlier draft of this plan reported "six additional
fields" beyond Appendix A. That figure was wrong. The accurate reconciliation is:

- Appendix A names three relations: `dependsOn`, `mentions`, `vectors`. The table uses those
  identifiers verbatim; they are not renamed.
- Those names cover **two forward fields** (`decision_dependencies` → `dependsOn`,
  `decision_mentions` → `mentions`) and **one inverse** (`vectors`).
- `vectors`' forward counterpart (`case.provision`) has no name in Appendix A.
- **Five field occurrences have no name in Appendix A**: `provision.fragment`,
  `provision.terms`, `case.provision` (forward), `case.rationale_fragment`, `term.fragment`.
- Therefore Appendix A is incomplete, and the profile declares seven relations, not three.

**Inverse relations.** Only one inverse is required, and it is required by the artifact, not by
taste: `p.cases` renders every case for a provision (`core001.md.j2` lines 126–130), and
`counts` derive from it. No other reverse traversal is rendered — fragments and decisions are
never listed against the entities that point at them. `vectors` is populated by appending in
input order so the rendered case order is preserved.

**Relation names are profile data (D6).** `dependsOn`, `mentions` and `vectors` are Appendix A's
identifiers, used verbatim. `fragment`, `terms`, `provision` and `rationaleFragment` are
extensions, because Appendix A does not name those relations. All seven are profile data: they
never appear in core code or core schemas.

### 7.2 Not relations

These are references, but not entity relations, and the core must not route them through the
`relations` namespace:

| Field | What it points at | Enforced by |
|---|---|---|
| `fragment.source`, `decision.source` | a source document declared in the manifest | provenance binding (`source` must be a declared source id) |
| `document.source` | a source document | profile hook (header consistency) |
| `document.slice` | the slice block in `sources.yml` | profile hook |
| `provision.outside_slice_refs[].target` | a free-form external document reference (`UIA-CORE-001#4.4.2`) | profile hook (warning) |
| `provision.precondition`, `exception`, `classification_basis`, `scenario` | inline objects, not entities | entity schema |

### 7.3 Entity schemas

Today one schema validates both the document and its entity items, and every entity uses
`additionalProperties: false`. Two consequences:

1. Each schema splits into a document schema (`core001:<name>`) and a per-kind entity schema
   (`core001:<kind>`), each with a real versioned `$id`.
2. Entity schemas must permit the reserved names (`id`, `kind`, `type`, `provenance`,
   `relations`, `review`). The extraction order is: validate the object, then strip reserved
   names into their slots, then keep the remainder as `Entity.fields`. Provenance-mapped
   fields stay in `fields` (mappings are projections, not moves).

### 7.4 Relation declaration validation

A `RelationDecl` is validated when the profile is loaded, before inputs are extracted and in any
case before any relation is resolved. The two relation failures the contract defines are kept
separate:

| Failure | Code | Input | Phase |
|---|---|---|---|
| A declaration's `from` or `to` names an undeclared kind | `core.profile.unknown-relation` | `profile.json` | load, before extraction |
| An entity carries a key in `relations` that no declaration matches on `(name, from)` | `core.relation.unknown` | project input | reference, during resolution |

Rules:

- Every declaration's `from` and `to` must name a kind declared in `profile.entityKinds`;
  `to: "*"` is the only wildcard.
- An unknown `from` or `to` fails the build **before relation resolution starts**. A declaration
  that cannot be resolved would otherwise match nothing and silently accept data.
- A profile with an invalid declaration is rejected even when no entity uses that relation: the
  defect is in the profile, not in the project data, and it affects every project sharing it.
- The entity-data failure is reported per key, with the entity id, so a typo inside `relations`
  names the offending entity rather than the profile.

Collapsing the two would lose that distinction: a declaration error would be reported as a data
error on whichever entity happened to use the relation first.

---

## 8. Provenance

### 8.1 Enumerated entities

Every entity that carries verbatim text and a locator:

| Kind | `source` | `ref` | `quote` | Count | Verdict |
|---|---|---|---|---|---|
| `fragment` | `source` ✓ | `source_ref` ✓ | `quote` ✓ | 7 | **Direct mapping**, complete today |
| `decision` | `source` ✓ | `source_ref` ✓ | `source_quote` ✓ | 1 | **Direct mapping**, complete today |
| `term` | — | `source_ref` ✓ | `definition` | 2 | Fragment-mediated |
| `provision` | — | `source_ref` ✓ | `source_quote` | 5 | Fragment-mediated |
| `case` | — | — | — | 13 | No verbatim quote of its own |

### 8.2 Final choice: no new `source` fields

The profile declares provenance mappings for `fragment` and `decision` only. `term` and
`provision` are covered transitively, and this is why they cannot use a direct mapping:

- A direct mapping requires all three selectors to be fields of the entity. `term` and
  `provision` have `source_ref` and a quote, but no `source`.
- Adding `source` to 7 entities would duplicate `SRC-CORE001`, a value that is constant for the
  whole project and is already carried by the fragment each entity points at.
- The existing guarantees do not disappear: the hook already enforces
  `definition ⊂ fragment.quote` and `source_quote ⊂ fragment.quote`, plus `source_ref` equality
  with the fragment. The fragment's own binding is directly provenanced.

Therefore: **zero new `source` fields; two mappings** (`fragment`, `decision`). The earlier
estimate of "eight entities need `source`" is withdrawn — it assumed direct provenance for
kinds whose provenance is fragment-mediated.

`requireProvenance: true` is declared at profile level (D22). The contract places the flag in
`PolicyOverlay` (contract §3.1) and in the profile (D22); M1 uses the profile, and the project overlay
stays unused (D30 is proposed).

### 8.3 Quote resolution stays in the profile hook (implementation choice)

The contract's `LocatorResult` is `found | outside | unsupported | unknown-locator`. The
current code distinguishes a third case the enum cannot express: the quote is absent from the
whole document (`ERR_SOURCE_QUOTE_NOT_FOUND`) versus present but outside the declared block
(`ERR_SOURCE_LOCATOR_MISMATCH`). Both are asserted by tests.

M1 therefore splits the phase:

- **Core provenance phase:** binding shape (three selectors present and non-empty →
  `core.provenance.incomplete`) and `source` is a declared manifest source id (`ERR_UNKNOWN_REF`,
  the legacy string this check already emits today). No quote resolution.
- **Profile hook:** quote containment and locator verification, calling
  `adapters/markdown.verifyQuote`, emitting the existing `ERR_SOURCE_*` codes and messages.

D25 (locator ownership) is `proposed`, so this does not decide it. Recorded consequence: in M1
the core guarantee "the quote resolves through the adapter" is enforced by the profile, not the
core. Closing that gap is M2 work conditional on D25.

---

## 9. Diagnostics

### 9.1 Golden baseline (PR 1)

Three recorded artifacts under `tests/golden/`:

1. `core001.draft.sha256` — the artifact hash above.
2. `core001.diagnostics.json` — the 15 diagnostics in **rendered order** (`code`, `severity`,
   `file`, `pointer`, `message`). This is the hard gate, because the artifact embeds these
   values.
3. `core001.emission.json` — the same tuples in **raw emission order**. Also gated, but a
   mismatch may be resolved by updating the snapshot with an explicit rationale, provided (1)
   and (2) are unchanged. Moving checks between modules (PR 4) will legitimately change
   emission order while leaving the rendered order and the bytes identical.

Byte identity is an **M1 migration acceptance criterion**, not a permanent prohibition on
diagnostic evolution. Any intentional change updates the baseline in the same PR, with the
reason in the PR description.

### 9.2 Code policy

| Situation | M1 behaviour |
|---|---|
| Existing code, any owner (`ERR_DUPLICATE_ID`, `ERR_SCHEMA`, `ERR_OUTPUT_STALE`, `ERR_IO`, `ERR_PARSE`, `ERR_UNKNOWN_REF`, `ERR_SOURCE_*`, `ERR_MODALITY_*`, `REVIEW_*`, `WARN_*`) | **String preserved verbatim**, including severity label and message. Namespacing is M2. |
| New check introduced by the accepted contract with no legacy equivalent (`core.relation.unknown`, `core.profile.unknown-kind`, `core.profile.unknown-relation`, `core.profile.unknown-code`, `core.manifest.missing`, `core.schema.entity`, `core.path.outside-root`, `core.registry.missing`, `core.extension.unpinned-dependency`, `core.provenance.incomplete`) | Emits the `core.*` code. |
| New core diagnostic firing on CORE-001 data | **Not allowed in M1.** All new codes above must be unreachable for the golden project. A test asserts the golden build contains no `core.*` diagnostic. |

**Document schema versus entity schema.** Document-level schema validation is today's check and
keeps `ERR_SCHEMA`. Entity-level schema validation does not exist today, so it is a new check and
emits `core.schema.entity`. The two are separate codes because the contract distinguishes
`core.schema.document` from `core.schema.entity` (contract §5.2, steps 1 and 3); the document half
is renamed in M2, the entity half starts with its final name.

**Core codes in the catalog (implementation choice).** Every code a build can emit is declared in
the profile catalog (contract §7.1), the `core.*` codes included. For a `core.*` code the catalog
entry mirrors the core's fixed severity and message; a profile does not restyle core diagnostics
in M1, so the "do not weaken a required core diagnostic" rule is visible in one file.

No required core diagnostic is weakened or removed to protect the hash. Three existing test
assertions (`ERR_SCHEMA`, `ERR_DUPLICATE_ID`, `ERR_OUTPUT_STALE`) therefore stay untouched.

### 9.3 Catalog shape

The profile catalog carries `code`, `severity`, `message`, and optional `remediation`. In M1
`severity` uses the legacy vocabulary `error | warning | review` so `SEVERITY_LABEL` and the
artifact stay identical. The three-axis shape (`severity` + `disposition` + `blocking`) is M2
(D8, contract §18 corrections).

**Message resolution (implementation choice).** `{{name}}` resolves against the finding's
`data` first, then against the entity's fields. Some current messages contain computed
fragments (for example `Допустимо: obligation, prohibition`). The hook supplies those as
pre-joined strings in `data`. This is the only way to satisfy "preserve existing messages"
without extending the catalog into a template language.

### 9.4 Blocking policy in M1

Unchanged: `error` and `review` block, `warning` blocks only under `--strict`, and `release`
refuses to write when anything blocks. `blockedBy` keeps its four values. Per-code blocking
from profile policy is M2 (D9, contract §18 correction 2). Consequence: the catalog's severity values
must reproduce today's mapping exactly, and a test asserts it.

### 9.5 Emission order

The hook is the only producer of CORE-001 diagnostics. Its modules run in a fixed order, and
within a module findings are emitted in input order. The core never reorders; `Diagnostics`
sorts for rendering exactly as today. A test asserts the rendered order; the emission snapshot
guards against accidental reordering.

---

## 10. Renderer boundary

### 10.1 Hook modularity (D15 approval)

`profiles/core001/validator.ts` is a thin aggregator. Each family is a separate module with a
`check(ctx): ValidatorFinding[]` signature and its own unit test against a hand-built
`ProjectModel`:

| Module | Checks moved from `semantic.ts` | Codes |
|---|---|---|
| `checks/source.ts` | header revision, slice containment, fragment/decision quote + locator | `ERR_SOURCE_*`, `ERR_OUT_OF_SLICE_CONTENT` |
| `checks/ontology.ts` | term definition in fragment, `source_ref` equality | `ERR_QUOTE_NOT_IN_FRAGMENT`, `ERR_SOURCE_REF_MISMATCH` |
| `checks/provision.ts` | quote containment, clause markers, modality matrix, classification basis, explications, decision refs/mentions, unresolved conditions, outside-slice refs | `ERR_CLAIM_NOT_IN_SOURCE`, `ERR_MODALITY_MARKER`, `ERR_MODALITY_UPGRADE`, `ERR_CLASSIFICATION_BASIS`, `ERR_UNEXPLAINED_PARAPHRASE`, `ERR_EXPLICATION_NOT_IN_STATEMENT`, `WARN_*` |
| `checks/cases.ts` | violated determinism and basis, inferred review, rationale fragment | `ERR_CASE_VIOLATED_UNDETERMINED`, `ERR_MODALITY_UPGRADE`, `REVIEW_CASE_INTERPRETATION`, `WARN_TRACE_INCOMPLETE` |
| `checks/review.ts` | normalization pending, classification review, reviewer warnings | `REVIEW_NORMALIZATION_PENDING`, `REVIEW_EFFECT_CLASSIFICATION`, `WARN_REVIEW_WITHOUT_REVIEWER` |
| `checks/coverage.ts` | missing vector, no-violated-vector | `ERR_MISSING_VECTOR`, `WARN_NO_VIOLATED_VECTOR` |
| `checks/terms.ts` | undefined-term scan | `WARN_UNDEFINED_TERM_IN_QUOTE` |
| `checks/dependencies.ts` | open normative / editorial dependency | `REVIEW_OPEN_NORMATIVE_DEPENDENCY`, `WARN_OPEN_EDITORIAL_DEPENDENCY` |

`WARN_NON_BINDING_PROVISION` and `WARN_UNRESOLVED_CONDITION` stay in `checks/provision.ts`.
`ERR_DUPLICATE_ID` and `ERR_UNKNOWN_REF` do **not** move: they become core invariants, emitted by
the core under their existing strings (section 9.2).

### 10.2 Profile renderer registration

- `profiles/core001/renderer.ts` exports `{ id: "core001-markdown", version: "0.1.0", render }`.
- The CLI and the test harness build the registry explicitly:
  `renderers: { "core001-markdown": core001Renderer }`, then call
  `runBuild({ ...options, renderers })`. The entry point stays `runBuild` in M1 (section 12).
- The manifest selects it by id: `render[].renderer = "core001-markdown"`.
- The core looks the id up in the consumer registry. A miss is `core.registry.missing`; there is
  no fallback.
- The core passes `{ model, mode, templates, labels, diagnostics }`. It preloads every file under
  the template root into a `TemplateSet`, so the renderer performs no I/O. `diagnostics` is the
  deterministic build snapshot in rendered order (contract §11); a renderer that does not embed
  it may ignore the field.
- The core never imports the profile. `profiles/core001/` is loaded by the consumer, exactly as
  contract §11 describes for extensions.

All CORE-001 view logic — label maps, `provisionView`, derived axes (`normalization_status`,
`applicability`, `binding`, `violated_cases`) — lives in `profiles/core001/renderer.ts` (with
shared derivation in `profiles/core001/view.ts` so the hook and renderer agree). The core has no
Markdown, no Russian strings and no CORE-001 field names.

### 10.3 Renderer identity and closure

The renderer participates in build identity as
`{ kind: "renderer", id: "core001-markdown", version: "0.1.0", closureDigest }`.

`closureDigest` is SHA-256 over the profile-declared file set for that renderer, sorted by
relative path, each entry hashed as `path \0 bytes`:

- `profiles/core001/renderer.ts`
- `profiles/core001/view.ts`
- `profiles/core001/templates/core001.md.j2`
- `profiles/core001/labels.ru.json`

Its runtime dependency is `nunjucks`, pinned at `3.2.4` in `bun.lock`. The profile declares its
**direct** imports in `dependencies: { "nunjucks": "3.2.4" }`; the closure digest additionally
folds in each declared package's transitive closure as recorded in `bun.lock` (name, exact
version, integrity), per contract §8.1. A bare import not in the direct map, or a version that does not
match `bun.lock`, is `core.extension.unpinned-dependency`. Relative imports must resolve to a
file in the declared set.

### 10.4 Artifact normalization

The core, not the renderer, guarantees: UTF-8, LF line endings, exactly one trailing newline.
The profile renderer keeps the current `finalize()` behaviour (trailing-whitespace strip, blank
line collapse) because that is content-shaping, not an encoding guarantee. Order: renderer →
core normalization. With the current renderer the core step is a no-op, so bytes do not move.

---

## 11. Build identity

```ts
interface BuildIdentity {
  projectId: string;        // "uia-core-001"
  engineVersion: string;    // "0.1.0"
  manifestVersion: string;  // "0.1"
  inputDigest: string;      // "sha256:<hex>"
  extensions: Array<{
    kind: "profile" | "adapter" | "renderer";
    id: string;
    version: string;
  }>;
}
```

For CORE-001 the resolved value is `projectId: "uia-core-001"`, `engineVersion: "0.1.0"`,
`manifestVersion: "0.1"`, and three extensions: `core001` (profile), `markdown` (adapter) and
`core001-markdown` (renderer), each at `0.1.0`.

`inputDigest` = SHA-256 over, in this order:

1. the canonicalized manifest (JSON, sorted keys, LF, manifest-relative paths);
2. every declared input's bytes normalized to LF, prefixed by its manifest path;
3. every declared source document's bytes (text normalized to LF; binary raw);
4. `profileDigest` — SHA-256 over the profile's declared `files`, sorted by path;
5. `{ id, version, closureDigest }` for every adapter and renderer used.

Excluded: clock, locale, environment, absolute paths, file mtimes, user identity, network state.
`identity` is computed but **not rendered**, so it cannot move the artifact.

**Implementation choice (closure declaration).** The contract says an extension's closure is its
declared files plus its lockfile dependencies but does not say where the declaration lives. M1
puts it in `profiles/core001/profile.json` as `files: string[]` and
`dependencies: Record<string, string>`, and validates it by scanning the profile's TypeScript
files for static imports **and** dynamic `import()` expressions with literal specifiers.

The scan is a guard, not a sandbox. A computed specifier (`import(name)`), `createRequire`, or
`process.binding` bypasses it, and D28 already places that class of violation on the profile
author. `core.extension.unpinned-dependency` therefore means "an undeclared literal import was
found", not "the closure is provably complete".

---

## 12. M1 scope

**In scope**

1. `spec/contract-builder.json` and the explicit project boundary, including path containment
   and `external: true`.
2. `profiles/core001/` owning kinds, relations, provenance mappings, document bindings,
   schemas, diagnostic catalog, template, labels, validator hook and renderer.
3. A generic core with no CORE-001 kind, relation, vocabulary, label, path or output name.
4. The generic IR envelope with `kind` and `relations` as profile strings, and `provenance`
   populated from profile mappings.
5. The `relations` namespace: declaration validation, resolution, inverse population, unknown-key
   rejection, and the one-time data migration.
6. All CORE-001 semantic checks in the profile hook, modular and unit-tested.
7. A renderer boundary that does not make Markdown a core invariant, with the profile renderer
   registered by the consumer.
8. Deterministic output and the existing structured diagnostics, preserved byte for byte.
9. A CLI that delegates to the library entry point, unchanged in surface.
10. Build identity covering inputs and extension closures.
11. A minimal independent profile proving the core does not require CORE-001.
12. Tests for every guarantee above, including the two negative relation invariants.

**Out of scope, with reason**

| Excluded | Reason |
|---|---|
| Package split, published packages, public API surface | D14/D20 deferred; M2 |
| `BuildStatus` enum, new exit codes, three-axis diagnostics, code namespacing | M2 per contract §18; each changes behaviour the artifact or tests pin |
| Rule primitives | D15 narrowed to hook-only for M1; M3 |
| Second *real* profile, OpenAPI adapter | M3; a synthetic profile is enough to prove separability |
| Multi-source, review dimensions, typed `ReviewState`, `Entity.type`, `extensions` | M4 / not justified in M1 |
| Conformance execution, self-hosting, isolated hook execution | D27 / D26 / D32 deferred |
| Core-enforced quote resolution | D25 proposed; see 8.3 |

**Narrowings to record.** M1 does not implement `ReviewState`; it does not decide D25; it keeps
legacy diagnostic strings; it keeps severity-based blocking; and it keeps `runBuild(BuildOptions)`
as the single entry point. The contract's `loadProject` / `validateProject` / `buildProject` /
`renderModel` / `checkArtifacts` signatures are M2. M1 only adds the `renderers` registry to
`BuildOptions`.

---

## 13. PR sequence

Each PR ends with `bun test`, `bun run typecheck` and `bun run check` green, and is revertible on
its own.

### PR 0 — this document

`docs/architecture/m1-implementation-plan.md`. Records the approved decisions, the clarifications,
the relation inventory, the provenance choice and the PR sequence.

**Acceptance:** maintainer approves sections 3, 7, 8 and 13.

### PR 1 — Golden baseline

- `tests/golden/core001.draft.sha256`
- `tests/golden/core001.diagnostics.json` (15 diagnostics, rendered order)
- `tests/golden/core001.emission.json` (raw emission order)
- `tests/golden.test.ts`
- `Diagnostics.emissionOrder()` read-only accessor (no behaviour change)

**Acceptance tests**

1. In-memory draft build's SHA-256 equals the recorded artifact hash.
2. `diagnostics.sorted()` equals the recorded rendered snapshot, in order.
3. `diagnostics.emissionOrder()` equals the recorded emission snapshot, in order.
4. The recorded hash equals `sha256sum spec/output/CORE-001.draft.md`.

**Revert:** delete the added files and the accessor.

### PR 2 — Manifest, project boundary, declared inputs

- `spec/contract-builder.json`; `profiles/core001/profile.json` (kinds, schema map, document
  bindings, `files`, `dependencies`); `profiles/core001/schemas/` populated by moving the five
  existing schemas.
- `sources:` block removed from `sources.yml` and from its schema; `contract-builder.json`
  declares the source.
- `lib/manifest.ts`; `lib/load.ts` rewritten to load declared inputs; `lib/schema.ts` resolves
  schema ids from the profile.
- `EntityKindDecl.schema` ids are declared in PR 2 but **not enforced** until PR 3, when entity
  schemas are split out. PR 2 validates whole documents only, which is today's behaviour; the
  intermediate state is green and the declaration is not dead for long.
- Path containment and `external: true` (`core.path.outside-root`).
- `lib/build.ts` resolves output paths from `render[].outputs`.
- **Transitional view assembly.** Removing `sources:` breaks both readers of
  `raw.sources.sources`: `lib/build.ts:48` and `lib/semantic.ts:78,98,173`. PR 2 therefore has
  `lib/load.ts` re-insert the manifest's `sources` array into the assembled `RawSpec` view, so
  both keep working unchanged through PR 3. One shim in one place rather than two call-site
  edits; it is removed in PR 4, when `semantic.ts` is deleted and `build.ts` reads the source
  from the manifest.
- The three fixture projects get manifests and the same `sources.yml` edit.

**Acceptance tests**

1. Golden hash unchanged; `bun run check` green.
2. All 16 existing assertions unchanged and passing.
3. Missing manifest → `core.manifest.missing`, exit 1.
4. Input outside the project root without `external: true` → `core.path.outside-root`.
5. Optional absent input is skipped without error.
6. Output path escaping the output root → `core.path.outside-root`, nothing written.
7. The transitional view's `sources` array deep-equals the manifest's `sources`, so `build.ts`
   and `semantic.ts` see the same source id, document and revision as before.

**Revert:** restore `sources.yml`, delete the manifest and profile skeleton, restore `load.ts`.

### PR 3 — Generic IR, extraction, relations, provenance

- `lib/ir.ts`: `Entity`, `ProjectModel`, `byId`, `byKind`, `documents`; extraction by declared
  pointer; identity from `EntityKindDecl.identity`; reserved-name stripping.
- `lib/relations.ts`: declaration validation (`from`/`to` against `entityKinds` →
  `core.profile.unknown-relation`, before resolution), resolution against `to` (`*` supported),
  cardinality, inverse population, `core.relation.unknown`.
- `lib/provenance.ts`: binding shape and declared-source check.
- `lib/adapters/markdown.ts`: current `locator.ts` behind `SourceAdapter`.
- `profiles/core001/schemas/`: document schemas and per-kind entity schemas with versioned
  `$id`; reserved names permitted; required relation keys declared (section 7.1).
- Data migration in `spec/` and all three fixtures: the seven relation field occurrences move
  into `relations` under the identifiers in section 7.1; `semantic.ts` reads relations (forward)
  and `vectors` (inverse).
- `spec/lib/model.ts` is replaced by `spec/lib/ir.ts`; the CORE-001 types move to
  `profiles/core001/view.ts`. Recorded debt: `spec/lib/semantic.ts` (deleted in PR 4) and
  `spec/lib/render.ts` (made generic in PR 5) import those types from the profile until they
  move. The imports are `import type` only — erased at compile time, no runtime dependency — and
  the last one disappears in PR 5.

**Acceptance tests**

1. Golden hash unchanged; `bun run check` green.
2. The profile declares exactly the seven relations in section 7.1, with the stated endpoints,
   cardinalities and the single inverse; `dependsOn`, `mentions` and `vectors` are spelled as in
   contract Appendix A, and `provision.relations.dependsOn` / `mentions` are the keys in the
   migrated data.
3. Unknown key inside an entity's `relations` → `core.relation.unknown`; the build fails.
4. A `RelationDecl` whose `from` names an undeclared kind → `core.profile.unknown-relation`, and
   the result contains no `core.reference.unresolved`: declaration validation fails before
   resolution runs.
5. A `RelationDecl` whose `to` names an undeclared kind → the same code and the same ordering,
   including when no entity uses the relation.
6. An ordinary field named like a relation (a test-only profile whose kind schema allows extra
   properties) is preserved in `fields`, creates no relation and raises no reference error.
7. Unresolvable relation target → `ERR_UNKNOWN_REF` (legacy string retained).
8. `cardinality: "one"` rejects an array.
9. A missing required relation key (for example a `provision` with no `dependsOn` in
   `relations`) → `core.schema.entity`, reported before relation resolution.
10. `provision.relations.vectors` lists the same case ids, in the same order, as the old
    `p.cases`; `counts.cases` is 13.
11. `fragment`/`decision` entities carry a `provenance` binding equal to their three fields;
    `term`/`provision` carry none.
12. Duplicate id across kinds → `ERR_DUPLICATE_ID`.

**Revert:** move relation values back into fields; restore `model.ts` and the schemas.

### PR 4 — Policy into the profile hook

- `profiles/core001/validator.ts` + `checks/*.ts` (section 10.1), `profiles/core001/view.ts`.
- Core resolves findings through the profile catalog, sets severity from the catalog, resolves
  `{{name}}` from `data` then fields.
- `lib/semantic.ts` deleted; core keeps identity, reference, relation and provenance-shape
  invariants.
- Static genericity guard: no CORE-001 token in `spec/lib/**`.

**Acceptance tests**

1. Golden hash unchanged.
2. Rendered diagnostic snapshot unchanged (15 diagnostics, same order).
3. Emission-order snapshot updated with rationale — rendered order and hash unchanged.
4. Each `checks/*.ts` module has a unit test over a hand-built `ProjectModel`.
5. Unknown finding code from the hook → `core.profile.unknown-code`, build fails.
6. Genericity guard passes: no `fragment|term|provision|decision|case|dependsOn|mentions|vectors`
   as a kind or relation name, no `CORE-001`, no Russian label string in `spec/lib/**`.
7. `broken-modality`, `broken-source-drift`, `open-decision` still fail with their existing
   codes.

**Revert:** restore `semantic.ts`, delete the hook.

### PR 5 — Renderer boundary

- `lib/render.ts`: registry lookup, `TemplateSet` preloading, artifact normalization.
- `profiles/core001/renderer.ts`, `templates/core001.md.j2`, `labels.ru.json`.
- `core.registry.missing` on an unknown renderer id.

**Acceptance tests**

1. Golden hash unchanged.
2. Unknown renderer id → `core.registry.missing`, exit 1.
3. A second trivial renderer (test-only, emits a plain text listing) produces a valid artifact
   through the same boundary — the core does not require Markdown.
4. The renderer receives only `{model, mode, templates, labels}`; a test asserts no `fs` is passed
   to it. This checks the interface, not runtime isolation: a renderer can still import
   `node:fs` itself, which is the D32 trust boundary and is not something this test enforces.
5. Artifact ends with exactly one `\n` and contains no `\r`.

**Revert:** restore `render.ts`, move template back.

### PR 6 — Build identity

- `lib/identity.ts`: canonical manifest, LF-normalized inputs, `profileDigest`, extension
  closures, static import scan, `core.extension.unpinned-dependency`.
- `BuildResult.identity` populated (not rendered).

**Acceptance tests**

1. Golden hash unchanged; identity is absent from the artifact.
2. Two consecutive builds produce the same `inputDigest`.
3. A one-byte change in any declared input changes `inputDigest`.
4. A change to any file in the profile's declared closure changes `profileDigest` and
   `inputDigest`.
5. Touching an mtime, changing the temporary directory, or changing an environment variable does
   not change `inputDigest`.
6. An import of a package absent from `dependencies` → `core.extension.unpinned-dependency`.
7. A declared dependency version that differs from `bun.lock` → same code.
8. A hook that reads the clock (test-only profile) produces different bytes on two builds while
   `inputDigest` stays equal, and `BuildResult` exposes no determinism guarantee — the digest is
   the only claim.

**Revert:** remove `identity.ts` and the `identity` field.

### PR 7 — Minimal independent profile

- `profiles/example/`: kinds `requirement` and `example`, one relation (`requirement` from
  `example`, inverse `examples`), one hook check, one trivial renderer, its own schema and
  template.
- `tests/fixtures/example-project/`: manifest + two small inputs.
- No CORE-001 code, no CORE-001 name.

**Acceptance tests**

1. The project builds through the same core entry points and produces a deterministic artifact.
2. Its artifact contains none of `fragment|term|provision|decision|case|dependsOn|mentions|vectors`.
3. Its profile declares its own kinds and relations; a test asserts `model.relations` contains
   `requirement` and `examples` and nothing from CORE-001.
4. An unknown kind in its input → `core.profile.unknown-kind`.
5. **This PR modifies no file under `spec/lib/`.** If it does, the core is not generic and the PR
   is rejected.

**Revert:** delete the profile and fixture.

---

## 14. Acceptance test matrix

Mapping of the required acceptance criteria to concrete tests.

| # | Criterion | Test | PR |
|---|---|---|---|
| 1 | CORE-001 builds through the new architecture | `runBuild({ specDir: "spec", mode: "draft" })` → markdown hash equals golden | 2+ |
| 2 | A profile defines its own kinds and relations | Assert the five kinds and seven relations in `model.profile` / `model.relations` | 3 |
| 3 | Core rejects unknown relation keys in `relations` | Inject `relations: {nope: "X"}` → `core.relation.unknown` | 3 |
| 4 | Ordinary fields are never interpreted as relations | Test-only profile whose kind allows extra properties; a plain `dependsOn` field on a kind that does not declare that relation stays in `fields`, `relations` empty | 3 |
| 5 | A second profile uses the core without CORE-001 code | `profiles/example` builds; PR touches no core file | 7 |
| 6 | Build identity covers inputs and extension identities | Input byte flip, hook edit, template edit change the digest; mtime/path do not | 6 |
| 7 | Untrusted behaviour is not falsely deterministic | Clock-reading hook: bytes differ, digest equal, no guarantee field | 6 |
| 8 | Draft/release and blocking remain explicit | Existing release-blocked, `blockedBy: "review"`, `--strict`, exit codes | 1–4 |
| 9 | MVP behaviour preserved | All 16 assertions unchanged; golden hash; `--check` green | every PR |
| 10 | Invalid relation declarations are rejected before resolution | `from` or `to` naming an undeclared kind → `core.profile.unknown-relation`, no `core.reference.unresolved` | 3 |
| 11 | Relation requiredness is enforced | Missing required key in `relations` → `core.schema.entity`, before resolution | 3 |

---

## 15. Migration and compatibility

**Data migrations (all artifact-neutral)**

| Migration | Files | Reversible |
|---|---|---|
| `sources:` block → manifest `sources[]` | `sources.yml` + schema, 4 copies (spec + 3 fixtures) | yes |
| Seven relation field occurrences → `relations`, keyed by the profile identifiers in section 7.1 (`dependsOn`, `mentions`, `vectors`, …); source field names survive only as migration metadata | `sources.yml`, `ontology.yml`, `semantics.json`, `conformance/cases.yml`, 4 copies | yes (move back) |
| Document schema split into document + entity schemas | `spec/schemas/` → `profiles/core001/schemas/` | yes |
| Reserved names permitted in entity schemas | same | yes |
| Output paths from the manifest | none (data unchanged) | yes |

**No new `source` fields** (section 8.2). **No change to CORE-001 normative content**: no
`source_modality`, `normative_effect`, `classification_basis`, `explications`, decision status,
case outcome or quote text changes. The migration moves references and adds a manifest.

**Generated artifacts.** `spec/output/CORE-001.draft.md` keeps its bytes. `--check` stays green
after every PR. The release artifact stays absent, because release remains blocked by the same
five review diagnostics.

**Compatibility breaks.** None user-visible. Internal TypeScript types (`RawSpec`,
`AnalyzedSpec`, `BuildOptions`) are not public and change freely; `runBuild`'s result shape is
frozen for M1.

**Test fixture updates.** Each fixture directory gains a manifest and loses the `sources:` block.
The fixtures are full copies of all five data files (4 copies of every file in the repository);
PR 3 must apply the relation migration to all of them. Recommended follow-up, not M1-blocking:
convert the three static fixtures to `copySpec` + mutation overlays, which the tests already do
for six cases.

**Rollback.** Every PR is independently revertible. The golden hash plus the rendered diagnostic
snapshot is the safety net: a revert that changes bytes fails immediately.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| Byte identity freezes the diagnostic catalog, messages and order | PR 1 makes the constraint executable; intentional changes update the baseline in the same PR with a rationale |
| "Generic core" achieved by relocation, not genericity | Stated as a non-claim; PR 7 is the only evidence, and it is weak (synthetic) |
| The hook becomes a 700-line monolith | D15 approval requires module split; each module has a unit test |
| PR 3 is the largest diff | Two reviewable commits (IR+relations, data migration); split into 3a/3b if review load demands |
| Relation migration silently drops a field | Entity schemas require the reserved names and forbid unknown fields; a test compares entity counts and every rendered id before/after |
| Inverse `vectors` reorders cases | Append in input order; test asserts exact case order |
| `inputDigest` instability from an imprecise closure | Closure is an explicit declared file list; a test flips each declared file and asserts the digest moves |
| Fixture drift (4 copies of every data file) | Migration applied in one PR; de-duplication recommended as a follow-up |
| Genericity guard produces false positives ("case" in generic prose) | Word-boundary match on a fixed token list; guard lives in its own test file with an explicit allowlist |
| `spec/lib/` inside the project root is conceptual debt | Recorded; removed by the M2 package split; does not affect the digest |

---

## 17. Deferred capabilities

M2: package split, public API (`load/validate/build/render/check`), `BuildStatus`, exit code 2,
three-axis diagnostics, per-code blocking, code namespacing, core-enforced quote resolution
(conditional on D25).

M3: rule primitives justified by the second real profile; the HTTP API profile; OpenAPI adapter;
generic `renderer-markdown`.

M4: multi-source, review dimensions, typed `ReviewState`, stronger provenance, term imports.

M5: self-hosting, 0.x publication, distribution and scope (D20, #10).

Never in core: conformance execution (D27), isolated hook execution in 0.x (D32).

---

## 18. Recorded conflicts and open items

Conflicts between the accepted contract and the current code, and how M1 handles them. None is
resolved silently.

| # | Conflict | M1 handling | Status |
|---|---|---|---|
| 1 | Appendix A names three relations; the data needs seven declarations | Section 7.1 inventory; Appendix A recorded as incomplete | implementation choice |
| 2 | `gate` cannot express the open-decision condition (cross-entity) | D15 hook-only | resolved by decision |
| 3 | `{{field}}` interpolation cannot reproduce computed messages | Resolve from `data`; hook supplies pre-joined strings | implementation choice |
| 4 | No contract surface for profile view logic | Profile renderer via consumer registry | resolved by D14 clarification |
| 5 | contract §15 claims a declared `ReviewState` mapping that contract §3.2 does not define | `review` stays opaque in `fields` | resolved by D16 narrowing |
| 6 | `ProvenanceMapping.source` needs a field that `term`/`provision` lack | Fragment-mediated provenance; two mappings only | resolved by enumeration (8.2) |
| 7 | `documents` keying unspecified | Profile declares named document bindings | implementation choice |
| 8 | Entity schemas reject `relations` (`additionalProperties: false`) | Schema split; reserved names permitted | migration item |
| 9 | "No new diagnostic codes" vs accepted `core.*` codes | Legacy strings kept; new codes additive and unreachable for CORE-001 | implementation choice, section 9.2 |
| 10 | Source references look like relations | Section 7.2: not relations; core never routes them | recorded |
| 11 | Appendix A's `./profiles/core001` does not resolve from `spec/` | `../profiles/core001` + `external: true` | implementation choice |
| 12 | `LocatorResult` cannot express "absent from document" | Quote resolution stays in the hook; D25 undecided | open (D25) |
| 13 | contract §7.1 says codes stay verbatim in M1, contract §3.2 names `core.*` codes | Existing strings verbatim, new codes `core.*` | implementation choice |
| 14 | `requireProvenance` is in `PolicyOverlay` (contract §3.1) and in the profile (D22) | Profile-level flag; overlay unused | open (D22/D30) |
| 15 | `RelationDecl` has no `required`, but section 7.1 marks seven relations required | Key presence is profile-schema-owned; cardinality and target existence are resolver-owned (section 7.1) | implementation choice |
| 16 | One code family for relation errors hides two different defects | `core.profile.unknown-relation` (profile) is separate from `core.relation.unknown` (data); the first fails before resolution (section 7.4) | implementation choice |

---

## 19. First implementation PR

**PR 1 — Golden baseline.** It changes no behaviour, adds no dependency and is revertible by
deleting three data files, one test file and one accessor.

Exact acceptance tests:

1. `const result = await runBuild(base()); assert.ok(result.markdown !== null);` then
   `sha256(result.markdown)` equals the recorded hash, and the recorded hash equals the hash of
   the committed artifact:
   `sha256sum spec/output/CORE-001.draft.md` → `a29ce609269a8ad9185ed50576d4e6276b586f740d2ea8b4ef7f06f6c05988df`.
2. `diagnostics.sorted()` deep-equals the 15-entry rendered snapshot, in this exact order
   (`severity code file pointer`):

   ```text
   review  REVIEW_CASE_INTERPRETATION     conformance/cases.yml /cases/12/source_determination
   review  REVIEW_CASE_INTERPRETATION     conformance/cases.yml /cases/8/source_determination
   review  REVIEW_NORMALIZATION_PENDING   semantics.json        /provisions/1/normalized_statement
   review  REVIEW_NORMALIZATION_PENDING   semantics.json        /provisions/2/normalized_statement
   review  REVIEW_EFFECT_CLASSIFICATION   semantics.json        /provisions/4/classification_basis
   warning WARN_UNDEFINED_TERM_IN_QUOTE   semantics.json        /provisions/0/source_quote
   warning WARN_NO_VIOLATED_VECTOR        semantics.json        /provisions/1/id
   warning WARN_OUTSIDE_SLICE_REF         semantics.json        /provisions/1/outside_slice_refs/0
   warning WARN_UNDEFINED_TERM_IN_QUOTE   semantics.json        /provisions/1/source_quote
   warning WARN_OUTSIDE_SLICE_REF         semantics.json        /provisions/2/decision_mentions/0
   warning WARN_NON_BINDING_PROVISION     semantics.json        /provisions/2/normative_effect
   warning WARN_UNRESOLVED_CONDITION      semantics.json        /provisions/2/unresolved_conditions
   warning WARN_OUTSIDE_SLICE_REF         semantics.json        /provisions/3/decision_mentions/0
   warning WARN_NO_VIOLATED_VECTOR        semantics.json        /provisions/3/id
   warning WARN_NON_BINDING_PROVISION     semantics.json        /provisions/3/normative_effect
   ```

   Note the ordering rule this pins: severity, then file, then pointer (code-point), then code,
   then message. `conformance/cases.yml` sorts before `semantics.json`, so both case reviews
   lead.
3. `diagnostics.emissionOrder()` deep-equals the recorded emission snapshot.
4. `bun test` reports 20 passing tests (16 existing + 4 golden); `bun run typecheck` clean;
   `bun run check` green.

Every later PR's "artifact unchanged" claim is checked against this baseline rather than asserted.
