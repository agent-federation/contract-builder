# End-to-end SDLC pipeline — producer, package and acceptance gate (stream C)

**Status:** proposal for maintainer decision (design note). No code is prescribed here; decisions D1–D6 at the end are the ones to accept or change before implementation.
**Scope:** the producer side of PAP v0.1 and the acceptance step around the existing verifier: a deterministic package assembler for CORE-000, the CORE-000 trust policy, the acceptance gate, and the CI job that exercises the chain. The artifact-presentation envelope from #130 is included as a separate, later slice.
**Related:** audit umbrella #137, architecture streams #170 (stream C), CORE-000 producer issue #135, artifact envelope #130, PAP RFC (`docs/architecture/portable-assurance-package-rfc.md`), verifier `pap/`, engine contract §8, CORE-000 harness `contracts/core000/run.ts`.

## 1. The problem

The repository produces a CORE-000 draft artifact and has an independent PAP v0.1 verifier, but the chain between them is missing:

```text
CORE-000 declared inputs ──build──▶ CORE-000.draft.md + BuildIdentity + diagnostics
                                          │
                                          ▼   (missing) deterministic PAP package assembler
                                  assurance-package/
                                          │
                                          ▼   exists: pap verify / inspect / explain
                                  verification report
                                          │
                                          ▼   (missing) trust policy + acceptance gate
                                  accept / reject decision
```

Baseline: `bun run pap -- verify contracts/core000` correctly returns `FAIL`/`pap.package.*` because a producer source tree is not a PAP package. The verifier is not the gap; the producer and the acceptance rule are.

The audit also found that the two generated artifacts (CORE-001 and CORE-000) lack a stated common presentation envelope (#130): it is unclear which top-level elements are build metadata, which are diagnostic/gating status, and which are profile-specific. That is a presentation concern, kept as slice C5 so it does not block the packaging work.

## 2. Boundary rules (non-negotiable)

- **Producer ≠ verifier.** The packager and gate live outside `pap/`; `pap/` never imports them, executes them or trusts their output. The producer may import the engine (`spec/lib`) and the CORE-000 harness; the verifier still imports only `node:` built-ins and `pap/src/`.
- **The verifier's report is the only authority on the verdict.** The producer's claims (including any `producer-report.json`) are untrusted; a claimed `PASS` cannot override an independent `FAIL` (RFC §4.7.3).
- **The gate reads the report, not internals.** It consumes the verifier's JSON report (schema-validated), not `pap/src` functions, so it also works with an independent verifier that produces the same report shape.
- **No signing, publication or semantic truth in v0.1.** The package proves integrity/provenance of packaged bytes, not normative correctness; signer/key infrastructure stays deferred.

## 3. Package mapping (CORE-000)

The producer builds into a temporary directory with the fixed PAP layout (§4): `artifacts/`, `inputs/`, `sources/`, `claims/`, `assurance-package.json`.

| PAP section | CORE-000 source | Decision / caveat |
|---|---|---|
| `artifacts[]` | packaged copy of `contracts/core000/output/CORE-000.draft.md` | `digest = H("pap.artifact.v1", raw packaged bytes)` and exact `bytes`; this is **not** the engine's `Artifact.sha256` over pre-normalization renderer output (RFC §5.14). Media type `text/markdown; charset=utf-8`. |
| `inputs[]` | copies of `contracts/core000/contract-builder.json`, `structure.yml`, `claims.yml` | LF normalization per RFC §5.6 (`normalization: "lf"`); media types `application/json`, `application/yaml`. `build.normalizedInputDigest` is computed per RFC §5.6 and verified by the verifier against these inputs. |
| `sources[]` | `docs/architecture/engine-public-contract.md` (the declared `SRC-ENGINE-CONTRACT`) | raw bytes (no LF normalization; `H("pap.source.raw.v1", bytes)`), media type `text/markdown`. `acquisition: {method: "git", revision: <commit>}` is a producer claim; a repository URI may be included but is not fetched by the verifier. `acquiredAt` policy is D3. |
| `claims.provenance` | engine provenance bindings / `claims.yml` source statements and evidence | PAP requires **byte ranges into the packaged source**: `{id, entityId, sourceId, locator:{kind:"byte-range",start,end}, quote:{normalization,digest}}`. The engine's structural locators are not byte ranges; the producer must resolve each exact quote in the raw source bytes. Ambiguous/missing quote ⇒ packaging fails (no silent skip). |
| `claims.relations` | CORE-000 claim relations and structure relations | Explicit entities, relation declarations (name/inverse) and edges. Unsupported relation kinds ⇒ packaging fails, not a partial package. Declarations must be complete for the verifier's inverse-consistency check. |
| `claims.producerReport` | (not in phase C1–C3) | Optional claim file. Start without it: producing it requires the producer to evaluate PAP checks itself, which duplicates verifier work and adds no authority. Revisit only if there is a concrete need; producer claims are never results. |
| `claims.reviews` | none in v0.1 | Human-review evidence is optional and not required by the CORE-000 policy. |
| `papVersion` | `"0.1"` | |
| `package` | `{id, title, createdAt?, producer:{name:"contract-builder", version}}` | `id` is a stable label (e.g. `urn:pap:contract-builder:core000`), not an identity. `createdAt` is inside `packageIdentity` (RFC §5.3); D3 decides whether it is omitted or derived from the commit. |
| `subject` | `{projectId: "core-000-self-contract", revision: <project revision>}` | Producer claim about what the package is about. |
| `build` | `{engineVersion, manifestVersion, inputDigest, normalizedInputDigest, extensions[]}` | `engineVersion`/`manifestVersion`/`extensions` come from the engine `BuildIdentity`; `inputDigest` is the engine build digest (a producer claim, explicitly untrusted); `normalizedInputDigest` is the PAP §5.6 computation over packaged inputs. |
| `profile` | `{id:"core000", version}` | Identity only; no profile code is packaged or executed by the verifier. `closureDigest` is optional and, if included, must be the engine's profile closure digest as a claim. |
| `checkSpecs` | the three PAP checks required for CORE-000 | `pap.check.digest-integrity/1`, `pap.check.source-quote/1`, `pap.check.relation-consistency/1`, all `required: true`. |

The producer never declares its own package identity: the verifier computes `packageIdentity = H("pap.package.v1", JCS(manifest))` (RFC §5.3) from the canonical manifest. A package cannot self-digest.

## 4. Determinism and timestamps

- The package bytes must be a pure function of the declared inputs and the engine identity: sorted declarations, JCS canonical JSON, LF line endings, no absolute paths, no wall-clock timestamps, no host data.
- `createdAt` and `acquiredAt` are manifest fields inside `packageIdentity`. **D3**: omit them for byte-reproducible packages, or derive them from `SOURCE_DATE_EPOCH`/the git commit date; never call the clock. If a readable package date is required, the CI value must be pinned.
- Two packing runs in the same environment must produce byte-identical package files and the same `packageIdentity`; the verifier report must be identical for a fixed `--now`.
- The producer implements PAP digests from the RFC domains (Appendix E vectors are the test oracle); it must not reuse engine digest helpers that use different domains. A mismatch is caught by the verifier as package `FAIL`, not silently normalised.
- Build evidence: the CORE-000 harness `RunEvidence` (artifact sha256, `BuildIdentity`, commit, environment, workspace assertions) is the producer's provenance record. The packager should consume a run performed in a temporary workspace, not mutate the checkout.

## 5. CORE-000 trust policy and acceptance gate

**Policy** (`pipeline/policy/core000-trust-policy.json`, Appendix B shape):

- `id`, `issuedAt`, `expiresAt`: fixed values with a long validity window (CI passes a fixed `--now` inside it);
- `signature.mode: "disabled"` (no signing in v0.1; signature/trust are not required dimensions);
- `requiredChecks`: the three checks; `requiredDimensions: ["integrity","sources","checks"]`;
- `checkers: []`, `profiles: []`, `humanReview.required: false`.

**Gate rule** (acceptor, reads only the JSON report):

1. The report validates against Appendix C and was produced by a verifier whose identity is recorded.
2. `verdict == "PASS"`; `coverage.full == true`; every required dimension is in its positive state; no `FAIL`/`UNTRUSTED`/`UNSUPPORTED` dimension, no limit-stopped scope.
3. Either `signature.mode: disabled` (the policy does not require trust) or the signature/trust dimensions are `ACCEPTED` per policy.
4. Output a decision document: `{packageIdentity, policyId, policyDigest, reportDigest, verdict, decision: "ACCEPTED" | "NOT_ACCEPTED", reasons: string[], verifier: {id, version, implementationDigest}, evaluatedAt}`. It is evidence, not authority; the human owner still accepts in v0.1.
5. Anything else — including `INCOMPLETE`, `UNSUPPORTED`, `UNTRUSTED`, schema-invalid reports, missing report — is `NOT_ACCEPTED` with the reason. The gate never converts a non-PASS into a pass.

**Phase 2a caveat:** the in-repo verifier implements the three checks and can PASS this package; independent verifiers may report `UNSUPPORTED`/`INCOMPLETE` for checks outside Phase 2a. The gate must treat that as `NOT_ACCEPTED`, and the comparison matrix is recorded separately (blind-lab), not hidden in the package. CI behaviour for that expected limitation is decision **D5**.

## 6. Artifact envelope (#130), separate slice

Do not merge the CORE-000 and CORE-001 domain models. Define a **presentation envelope** — which top-level elements every generated contract artifact exposes — with the body remaining profile-specific. Proposed elements (decision **D6**):

| Element | Status | CORE-000 | CORE-001 |
|---|---|---|---|
| document/project identity + revision | mandatory | project id, revision, engine version | document id, source revision, slice id |
| generated/source-of-truth notice | mandatory | present | present |
| build mode + scope/exclusions | mandatory | draft/release; project scope | draft/release; `SLICE-CORE001-10`, exclusions §4.4.2/§15 |
| profile/renderer identity + build identity | mandatory where available | profile id/version, renderer id, `inputDigest` | same fields |
| diagnostic/gating summary | mandatory | counts + blocked/not blocked | counts + `REVIEW_REQUIRED` gate |
| stable section order | recommended | profile order | profile order |
| substantive body | profile-specific | architecture/claims/evidence | provisions/quotes/vectors/provenance |

Any template change is a separate PR with regenerated artifacts and golden updates; it must not touch `CORE-001.legacy.md` or domain content.

## 7. Components and CI

**Producer-side layout (new, outside `pap/`):**

```text
pipeline/
  pack.ts              # CLI: build (temp workspace) -> package dir
  mapping.ts           # CORE-000 model -> PAP sections; digest/domain helpers (RFC)
  claims.ts            # provenance/relations mapping, byte-range resolution
  gate.ts              # report -> acceptance decision
  policy/core000-trust-policy.json
  tests/               # mapping, determinism, negative cases, gate table tests
```

Scripts: `bun run pack:core000`, `bun run gate:core000`, `bun run pipeline:test`. The producer imports the engine/harness; `pap/` imports neither.

**CI (new job `pipeline`, after `check`):**

1. build CORE-000 in a temporary workspace (Q9-style, no checkout mutation);
2. pack twice; require byte-identical package files and `packageIdentity` (verifier output);
3. `bun run pap -- verify <tmp package> --trust-policy pipeline/policy/core000-trust-policy.json --format json --now <pinned> > report.json`;
4. `bun run gate:core000 report.json > acceptance-decision.json`; upload both files as CI artifacts;
5. fail the job on `NOT_ACCEPTED`, invalid schema, non-deterministic package, or any unexpected diagnostic; no network, no secrets;
6. optionally record the independent-verifier matrix as a separate job/artifact (manual blind-lab, not CI-blocking).

## 8. Phases

| Slice | Deliverable | Acceptance |
|---|---|---|
| C1 | Mapping + minimal packer: artifact, inputs, source, manifest; no claims | package shape accepted by `pap verify` (checks may be INCOMPLETE without claims); two-run determinism; no checkout mutation |
| C2 | Claims: provenance (byte ranges) + relations; negative mapping cases | source-quote and relation-consistency checks PASS; ambiguous quotes/unknown relations fail packaging |
| C3 | CORE-000 policy + gate + decision document | gate table tests (PASS/FAIL/INCOMPLETE/UNTRUSTED/UNSUPPORTED/schema-invalid); decision artifact deterministic given report |
| C4 | CI `pipeline` job | chain runs on PRs; deterministic package; gate fails closed; artifacts uploaded |
| C5 | Artifact envelope (#130) decision + implementation | common elements decided; templates/regenerated artifacts + goldens updated; no domain merge |
| C6 (optional) | Independent-verifier comparison matrix | reference + independent reports recorded with differences explained, never hidden |

## 9. Decisions requested (D1–D6)

- **D1 — producer location and commands.** Recommend `pipeline/` with `bun run pack:core000` / `gate:core000`; no new published package in v0.1.
- **D2 — mapping scope.** Recommend artifacts+inputs+source for C1, provenance+relations for C2, **no producer-report** in v0.1.
- **D3 — timestamps.** Recommend **omit** `createdAt`/`acquiredAt` for byte-reproducible packages; if a date is required, derive from `SOURCE_DATE_EPOCH`/commit date and pin it in CI. (Omitting changes package identity versus including a date; the decision is which identity the repo wants.)
- **D4 — gate authority.** Recommend: the gate emits `ACCEPTED`/`NOT_ACCEPTED` evidence and CI fails closed; a human owner still accepts in v0.1; signing/publication deferred.
- **D5 — expected Phase 2a outcome.** Recommend: the reference verifier is expected to PASS the CORE-000 package for the three checks; an independent verifier's `UNSUPPORTED`/`INCOMPLETE` is `NOT_ACCEPTED` and recorded in a separate matrix. CI blocks on `NOT_ACCEPTED`; it does not silently allowlist it.
- **D6 — envelope scope.** Recommend the mandatory/optional table in §6; implement in C5 as a presentation-only change with regenerated artifacts and goldens.

## 10. Non-goals

- Changing PAP verifier semantics, case set or phase evidence.
- Signing, key management, registry/OCI publication, online revocation.
- Claiming semantic truth, legal enforceability or full PAP conformance.
- Merging CORE-000 and CORE-001 domain models or forcing identical sections.
- Replacing the human acceptance decision in v0.1.
