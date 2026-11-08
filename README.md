# Contract Builder

**Declared contracts in. Deterministic artifacts and independently verifiable assurance out.**

This repository is a research-grade reference implementation of two composable pieces:

1. **Contract Builder** — an engine that compiles an explicitly declared contract model
   (structured inputs plus a domain profile) into a deterministic artifact with provenance
   bindings, review gates and a build identity. It enforces consistency of what is declared; it
   never infers normative meaning.
2. **PAP v0.1** — a Portable Assurance Package format and an independent verifier CLI. A package
   carries an artifact, its declared inputs, its sources and its claims; the verifier recomputes
   every digest and check itself and reports a verdict without trusting the producer.

Two verticals exercise the engine: `CORE-001`, a demo slice of a real normative document
(`CORE-001.legacy.md` §10.1–10.2, Temporal Reference Model), and `CORE-000`, the engine's own
public contract declared as a contract and compiled by the same engine.

> **Status:** research prototype, actively developed. Read
> [what is proven and what is not](#status-what-is-proven-and-what-is-not) before relying on it.

## Why

Three distinctions are the whole point:

| Distinction | What it means |
|---|---|
| **build ≠ verification** | A successful build says the declared data is internally consistent. It does not say the contract is correct. |
| **provenance ≠ proof** | A provenance binding says where a statement is claimed to come from. Only an independent recomputation says whether that is true. |
| **PASS ≠ truth** | A verifier can prove integrity and provenance of packaged bytes. It cannot prove semantic truth, safety, legitimacy or consent — and it says so in the report. |

If you have to answer *"what produced this artifact, from which declared inputs, and can I check
it without trusting the producer"*, this repository is built for that question. The nearest
audiences are software supply-chain and assurance work, agent identity and governance, and
normative specifications kept as data rather than prose.

## 60-second demo

Requires [Bun](https://bun.sh/) 1.4+.

```bash
bun install --frozen-lockfile
bun run pap -- verify pap/fixtures/pap-v0.1/base
```

```text
VERDICT: PASS
package: sha256:77a8d1d0…4020 (papVersion 0.1)
verifier: pap 0.1.0  policy: none state: ABSENT
dimensions
  integrity.package PASS
  integrity.artifacts PASS
  sources.integrity PASS
  sources.availability PASS
  …
checks
  pap.check.digest-integrity/1 PASS
  pap.check.source-quote/1 PASS
  pap.check.relation-consistency/1 PASS
coverage: checksEvaluated 3, checksPassed 3, checksFailed 0, … full: true
limitations
  pap.trust.policy-absent — no trust policy supplied
PRODUCER CLAIMS (UNTRUSTED — NOT VERIFICATION RESULTS)
  pap.check.digest-integrity/1 claimed PASS independent PASS AGREES
  pap.check.source-quote/1 claimed PASS independent PASS AGREES
```

Now break one byte of a declared artifact and verify the same way:

```bash
bun run pap -- verify pap/fixtures/pap-v0.1/F02-artifact-byte; echo "exit=$?"
```

```text
VERDICT: FAIL
NOT A PASS — a declared artifact does not match its declaration
dimensions
  integrity.package PASS
  integrity.artifacts FAIL
  …
checks
  pap.check.digest-integrity/1 FAIL
  pap.check.source-quote/1 PASS
  pap.check.relation-consistency/1 PASS
limitations
  pap.check.failed — a required check failed
  pap.claims.producer-mismatch — producer claim disagrees with the independent check outcome
  pap.integrity.artifact-mismatch — artifact artifact:acme-supplier declares
  sha256:5f521a…/80 bytes but computed sha256:23dfa7…/80
  pap.trust.policy-absent — no trust policy supplied
PRODUCER CLAIMS (UNTRUSTED — NOT VERIFICATION RESULTS)
  pap.check.digest-integrity/1 claimed PASS independent FAIL DISAGREES
  pap.check.source-quote/1 claimed PASS independent PASS AGREES
exit=1
```

*(Output trimmed for the README; digests abbreviated.)*

The verifier imports only `node:` built-ins and its own modules. It never imports the builder,
never executes package code, never opens a network socket, and treats package content as hostile
input: paths are validated before any filesystem call, symlinks and non-regular files are
rejected, and resource limits are enforced while reading.

To build the artifact a package would carry:

```bash
bun run build     # draft: writes spec/output/CORE-001.draft.md
bun run check     # rebuilds in memory and compares against the committed artifact
```

The build is byte-deterministic: no clock and no absolute paths in the output, fixed ordering, so
rebuilding an unchanged specification leaves the working tree clean.

## What is in the repository

| Path | What it is |
|---|---|
| `spec/`, `profiles/` | the CORE-001 vertical: declared inputs, builder core, profile checks and renderer |
| `contracts/core000/` | the CORE-000 self-contract: declared inputs, harness, generated artifact |
| `pap/` | PAP v0.1 verifier: CLI, schemas, conformance corpus, fixtures |
| `pipeline/` | producer side: deterministic CORE-000 PAP packer (in progress, [#135](https://github.com/agent-federation/contract-builder/issues/135)) |
| `docs/` | engine public contract, RFCs, decision records, implementation status |
| `tests/` | builder, profile, provenance, identity and self-contract tests |
| `fixtures/` | intentionally broken specifications used by tests and examples |
| `CORE-001.legacy.md` | read-only source document that the CORE-001 slice quotes |

Full path-by-path tree: [docs/repository-map.md](docs/repository-map.md).

## How the pieces fit

```text
declared inputs ──▶ Contract Builder ──▶ artifact + BuildIdentity + diagnostics
(spec/, profiles/)          │                        │
                            │                        ▼
                            │             pipeline/ packer (CORE-000, in progress)
                            │                        │
                            │                        ▼
                            │             assurance package (PAP v0.1)
                            │                        │
                            └───────────▶ pap verify ◀┘
                                                     │
                                                     ▼
                       report: PASS / FAIL / INCOMPLETE / UNSUPPORTED
                       with dimensions, witnesses and explicit limitations
```

The producer never declares its own package identity: the verifier computes it from the canonical
manifest, so a package cannot self-digest. A producer's claimed `PASS` cannot override an
independent `FAIL`.

## Guarantees

The engine's public contract is
[docs/architecture/engine-public-contract.md](docs/architecture/engine-public-contract.md). The
short version:

| Guarantee | How it is checked |
|---|---|
| stable unique identifiers | global duplicate check, `ERR_DUPLICATE_ID` |
| reference integrity | terms, fragments, decisions, provisions, cases — `ERR_UNKNOWN_REF` |
| provenance binding and separate verification | a binding is not a verification: `verified` means the quote was found in the declared locator of the current source; `failed`, `unavailable` and `stale` stay distinct, and an unverified record is blocked by `ERR_PROVENANCE_NOT_VERIFIED` |
| quote found, and in the declared place | profile checks resolve `source_ref` to a section, table row or list item |
| modality is never upgraded | `source_modality × normative_effect` matrix, `ERR_MODALITY_UPGRADE` |
| paraphrase is marked | text comparison plus explicit `explications[]`, `ERR_UNEXPLAINED_PARAPHRASE` |
| an open decision cannot become a norm | `REVIEW_OPEN_NORMATIVE_DEPENDENCY`, release gate |
| determinism | no clock, no absolute paths, fixed ordering, byte-for-byte comparison |
| no invented content | required fields, `throwOnUndefined`, verbatim substrings, no defaults |

`bun run build:release` currently exits 1 on purpose: the demo slice carries five
`REVIEW_REQUIRED` diagnostics (unconfirmed normalizations, inferred cases, editorial
classification). **The gate is the feature** — do not loosen it to get a green release run.

## Status: what is proven and what is not

Proven enough to rely on:

- the builder engine (M1), its profiles, provenance plumbing and build identity are implemented and
  covered by the test suite in CI;
- the CORE-000 self-contract builds itself, and its committed artifact is verified by a dedicated
  test (`S2.2 artifact verification`);
- PAP v0.1 Gate 3 is **PASSED for Phase 2a**: three independently written implementations (Go,
  Python, Rust; two model families) agree field-by-field on a frozen case set. Scope and caveats —
  six later-phase cases excluded, no Tier B or full-PAP claim, one owner/harness — are recorded in
  [ODR-PAP-005](docs/decisions/ODR-PAP-005-gate-3-closure-phase-2a.md).

Not proven and not claimed:

- no semantic truth, safety, legitimacy or authorization;
- no signed human-review approval: PAP v0.1 carries review as an explicitly unbound claim;
- no standalone, published verifier release yet (the RFC §9.1 packaging boundary is open);
- no in-toto mapping, archive transport, online revocation or Sigstore/SCITT integration (outside
  PAP v0.1);
- the demo slice's source document and its rendered artifact are in Russian; the engine and the
  verifier are language-neutral, but engine diagnostics are currently Russian-only
  ([#208](https://github.com/agent-federation/contract-builder/issues/208)).

A snapshot of the full implementation status lives in
[docs/architecture/implementation-status.md](docs/architecture/implementation-status.md).

## Commands

| Command | What it does |
|---|---|
| `bun run build` | draft build: writes `spec/output/CORE-001.draft.md` |
| `bun run build:release` | release build: writes `spec/output/CORE-001.md` only if there is no ERROR and no REVIEW_REQUIRED (currently blocked by design) |
| `bun run check` | builds in memory and compares with the committed artifact |
| `bun run release:check --tag vX.Y.Z` | release gate: the tag must equal the engine `package.json` `version`; also validates the three version domains for presence and shape |
| `bun test` | builder, verifier and pipeline tests |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | Biome lint and format check |
| `bun run format` | apply Biome formatting |
| `bun run format:check` | check formatting without writing |
| `bun run pap -- verify <PACKAGE>` | PAP v0.1 verifier: `verify`, `inspect`, `explain` |
| `bun run pap:test` | PAP vectors, conformance corpus, hostile input, CLI |
| `bun run pack:core000` | deterministic CORE-000 PAP packer (producer side) |

CI runs `bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`,
`bun run format:check`, `bun test`, `bun run check`; all steps must be green before a pull request
can land.

## Version domains and releases

Three version domains are independent and must never be synchronised:

| Domain | Authoritative field | What it versions |
|---|---|---|
| Engine | `package.json` `version` | the engine release; embedded in build identity and artifact provenance |
| Profile | `profiles/*/profile.json` `version` | each profile's own evolution |
| Project | `contracts/*/contract-builder.json` `project.revision` | the particular project/content revision |

They coincide today (`0.1.0`) only by accident. The canonical CORE-001 example already shows the
distinction: `project.revision` `0.3.3` with `profile.version` `0.1.0`. Forcing the three equal
would encode an invalid coupling, so `bun run release:check` validates each value for presence and
semver shape and never compares one domain with another.

`bun run release:check --tag vX.Y.Z` is the release gate once tags exist: the tag must be
semver-shaped with a leading `v` and equal the engine `package.json` `version`; a mismatch or a
malformed tag exits non-zero, and a missing `--tag` is a usage error rather than a silent pass.
The repository is currently in its declared **MVP without public releases** state, so there are no
tags and the check is not wired into CI yet. `bun run check:all` and the identity tests already
cover the other engine-version source pair (`package.json` ↔ generated artifacts/provenance); the
release tag is the only source this check adds. A release tag names the engine release only; when
one is eventually created, its notes must list the profile versions and project revisions shipped
alongside it.

## Relation to adjacent work

- **in-toto, SLSA, Sigstore, SCITT** describe attestations, build provenance and transparency for
  software supply chains. PAP v0.1 is a self-contained package plus an offline verifier with an
  explicit verdict model: it does not require a transparency log or trusting the producer, and
  in-toto mapping is out of scope for v0.1. It is not a drop-in replacement for any of them.
- **OpenAPI, JSON Schema and contract testing** describe API shapes and compatibility. The
  "contract" here is a normative specification with provenance and review state, not an API
  schema.
- **TLA+, Alloy and model checkers** prove properties of a model. The builder does not prove
  properties: it checks that declared data is consistent and refuses to infer normative meaning.
- **SBOM formats (SPDX, CycloneDX)** inventory components. PAP packages an artifact together with
  its inputs, sources and claims; it is not a component inventory.

## Contributing

[AGENTS.md](AGENTS.md) is the detailed workflow for humans and automated agents,
[CONTRIBUTING.md](CONTRIBUTING.md) the short onboarding guide, and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) governs participation. Pull requests are in English and
follow Conventional Commits. The automated agent account may open pull requests but never merges;
a human maintainer merges every change.

Русская версия README: [README.ru.md](README.ru.md).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
