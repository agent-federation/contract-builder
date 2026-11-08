# Repository map

Path-by-path map of the repository. The front door is [README.md](../README.md); this file is the
reference tree that used to live there.

```text
.github/workflows/ci.yml        typecheck + tests + check
.entire/agent-guide.md          workflow guide for the automated agent
bun.lock                        Bun lockfile
CORE-001.legacy.md              read-only source document (Russian)
LICENSE                         Apache License 2.0
package.json                    scripts; Bun 1.4.2 pinned

spec/                           CORE-001 project: declared inputs and the builder
  contract-builder.json         project manifest: inputs, source, profile, outputs
  build.ts                      CLI
  lib/
    build.ts                    build orchestration
    manifest.ts                 manifest, profile and project boundaries
    load.ts                     declared-input loading
    schema.ts                   JSON Schema (ajv): documents and entity kinds
    ir.ts                       shared IR: entities, indexes, extraction
    relations.ts                relation declarations and resolution
    provenance.ts               bindings and provenance-verification records
    hook.ts                     hook contract and finding resolution
    extension.ts                extension closure: declaration, lockfile, import scan
    identity.ts                 build identity: inputDigest and profileDigest
    render.ts                   renderer boundary and artifact normalization
    diagnostics.ts              ERROR / REVIEW_REQUIRED / WARNING
    guards.ts                   shared type checks
    source.ts                   SourceDocument and SourceAdapter
    adapters/markdown.ts        markdown locators and source adapter
    adapters/index.ts           built-in adapter registry
  sources.yml                   slice boundaries and verbatim fragments
  ontology.yml                  document and terms
  semantics.json                normative provisions
  decisions.yml                 open and closed decisions
  conformance/cases.yml         declarative conformance vectors
  output/CORE-001.draft.md      generated artifact

profiles/                       domain contracts
  core001/                      the CORE-001 profile
    profile.json                kinds, relations, provenance, document bindings
    view.ts, context.ts,
    slice.ts, text.ts,
    validator.ts                view/check support and the check aggregator
    checks/*.ts                 checks by family (cases, coverage, dependencies,
                                ontology, provision, review, source, terms)
    checks/verification.ts      CORE-001 provenance verification
    catalog.json                diagnostic codes, severity and messages (Russian)
    renderer.ts                 CORE-001 Markdown renderer
    labels.ru.json              view labels
    templates/core001.md.j2     renderer template
    schemas/*.schema.json       document and entity-kind schemas
  core000/                      the CORE-000 self-contract profile
    profile.json, view.ts,
    validator.ts, renderer.ts,
    catalog.json                view, checks, renderer, diagnostics
    checks/*.ts                 claim evidence, conformance, model structure,
                                provenance verification, trust policy
    schemas/*.schema.json       self-contract schemas
    templates/core000.md.j2     renderer template
  example/                      synthetic non-CORE-001 profile (genericity check)

contracts/core000/              the engine's public contract, declared as a contract
  contract-builder.json         self-contract project manifest
  claims.yml                    claim register (78 claims), evidence and decisions
  structure.yml                 components, interfaces, phases and trust boundaries
  run.ts                        harness: temporary workspace and build
  mutations.ts                  named mutations for negative tests
  output/CORE-000.draft.md      generated artifact (written through the harness only)

pap/                            PAP v0.1 verifier (independent product boundary)
  README.md                     commands and conformance notes
  bin/pap                       executable entry point
  src/
    cli.ts, verify.ts,
    inspect.ts, explain.ts      CLI commands
    decode.ts, manifest.ts,
    input.ts, paths.ts          strict decode boundary and path validation
    digest.ts, json.ts          digests and canonical JSON
    checks.ts, claims.ts        check evaluation and producer claims
    policy.ts, signatures.ts    trust policy and DSSE/Ed25519 adapter
    report.ts, state.ts,
    text.ts, time.ts            report shape, dimension state, text output
    types.ts, version.ts        types and version handling
  schemas/*.schema.json         package, report, policy and claim schemas
  fixtures/pap-v0.1/            base package, case set and F01–F26 variants
  fixtures/vectors/             conformance vectors
  tests/                        vectors, conformance corpus, hostile input,
                                schema, CLI, trust policy, verdict wiring

pipeline/                       producer side of the CORE-000 chain
  pack.ts                       deterministic PAP packer
  mapping.ts                    CORE-000 to PAP package mapping
  claims.ts                     provenance and relation claims for CORE-000
  tests/                        packer tests

tests/                          builder test suite
  build.test.ts, manifest.test.ts, ir.test.ts, checks.test.ts, hook.test.ts,
  provenance.test.ts, genericity.test.ts, renderer.test.ts, golden.test.ts,
  identity.test.ts, example-profile.test.ts, consent.test.ts, core000.test.ts,
  docs-freshness.test.ts        keeps documentation counts in sync with inputs
  golden/                       golden baselines

fixtures/                       intentionally broken specifications
  broken-modality/              violated derived from a permission
  broken-source-drift/          quote not found in the legacy source
  open-decision/                provision depends on an open decision

docs/
  architecture/                 engine public contract, build identity, PAP RFC,
                                SDLC pipeline, implementation status, diagnostic registry
  decisions/                    ODR records (engine, PAP, process)
  agents/                       pre-review recipe, task envelope
  superpowers/specs/            design record
  maintainer-decision.md        maintainer decisions on PAP v0.1
```
