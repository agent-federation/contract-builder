# Repository map

Path-by-path map of the repository. The front door is [README.md](../README.md); this file is the
reference tree that used to live there.

```text
.github/workflows/ci.yml        required `check` job; C4 `pipeline` and C6 `pipeline-independent` jobs
.github/workflows/codeql.yml    CodeQL for JavaScript/TypeScript (pinned action SHAs)
.github/CODEOWNERS              code-owner review requirement
.github/ISSUE_TEMPLATE/         issue templates: bug, architecture, hardening, debt, tail
.github/PULL_REQUEST_TEMPLATE.md  proof commands, pre-review record, risk and checklist
.github/renovate.json           Renovate for bun.lock and GitHub Actions
.entire/agent-guide.md          workflow guide for the automated agent
biome.json                      Biome lint and format configuration
bun.lock                        Bun lockfile
CORE-001.legacy.md              read-only source document (Russian)
LICENSE                         Apache License 2.0
package.json                    scripts; Bun 1.4.2 pinned
tsconfig.json                   TypeScript project configuration

spec/                           CORE-001 project: declared inputs and the builder
  contract-builder.json         project manifest: inputs, source, profile, outputs
  build.ts                      CLI
  cli-renderers.ts              CLI renderer loading: validates and imports the caller-supplied module
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
    identity.ts                 build identity facade: inputDigest and profileDigest
    identity/                   digest, engine root/imports, closure and identity assembly
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
    cli.ts, inspect.ts,
    explain.ts                  CLI commands
    verify.ts                   verify orchestration facade
    verify/                     errors/options, loading, checks, trust, report
    decode.ts, manifest.ts,
    input.ts, paths.ts          strict decode boundary and path validation
    digest.ts, json.ts          digests and canonical JSON
    checks.ts, claims.ts        check evaluation and producer claims
    policy.ts, signatures.ts    trust policy and DSSE/Ed25519 adapter
    report.ts, state.ts,
    text.ts, time.ts            report shape, dimension state, text output
    types.ts, version.ts        types and version handling
  schemas/*.schema.json         package, report, policy and claim schemas
  fixtures/pap-v0.1/            base package, case set and F01–F88 case packages
  fixtures/vectors/             conformance vectors
  tests/                        vectors, conformance corpus, hostile input,
                                schema, CLI, trust policy, verdict wiring,
                                temp-directory lifecycle

pipeline/                       producer side of the CORE-000 chain
  pack.ts                       deterministic PAP packer
  mapping.ts                    CORE-000 to PAP package mapping
  claims.ts                     provenance and relation claims for CORE-000
  gate.ts                       acceptance gate over a verifier report and trust policy
  independent.ts                reference plus three independent Phase 2a verifiers (C6)
  evidence.ts                   renders the committed C6 evidence record
  ci.ts                         C4 job assertions: determinism, decisions, tampering
  release.ts                    release-tag and version-domain check
  policy/core000-trust-policy.json  CORE-000 trust policy
  pinned-now.txt                pinned evaluation time for reproducible reports
  tests/                        packer, gate, independent, release and CI-helper tests

scripts/                        deterministic CI helpers
  check-docs-links.ts           local relative-link and anchor check
  check-coverage.ts             in-process coverage floors

tests/                          builder test suite
  build.test.ts, manifest.test.ts, ir.test.ts, checks.test.ts, hook.test.ts,
  provenance.test.ts, genericity.test.ts, renderer.test.ts, golden.test.ts,
  identity.test.ts, engine-root.test.ts, example-profile.test.ts, consent.test.ts,
  core000.test.ts, envelope.test.ts, unsupported-configurations.test.ts,
  docs-freshness.test.ts        documentation freshness: contract hash, claim count, registry
  support.ts                    shared test helpers
  golden/                       golden baselines
  fixtures/                     test-owned example projects

fixtures/                       intentionally broken specifications
  broken-modality/              violated derived from a permission
  broken-source-drift/          quote not found in the legacy source
  open-decision/                provision depends on an open decision

docs/
  architecture/                 engine public contract, build identity, PAP RFC,
                                delivery governance, SDLC pipeline and evidence,
                                implementation status, diagnostic registry
  decisions/                    ODR records (engine, PAP, process, artifact envelope)
  agents/                       pre-review recipe, task envelope
  superpowers/specs/            design record
  maintainer-decision.md        maintainer decisions on PAP v0.1
```
