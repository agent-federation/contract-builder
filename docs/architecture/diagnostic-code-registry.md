# Diagnostic code registry

Canonical, machine-checked index of the `core.*` and `pap.*` diagnostic codes this repository
can emit.

`tests/docs-freshness.test.ts` scans production TypeScript string literals under `spec/`,
`profiles/`, `pap/src/`, `pipeline/` and `contracts/` (test files and fixtures excluded) and fails
when a namespaced code is emitted without a row below. The scan reads complete string literals and
no-substitution templates; a code assembled at runtime cannot be discovered statically, so emit a
diagnostic code as one literal. Namespaced identifiers that are not
diagnostics (digest domains, verifier identities) are listed in the
[allowlist](#non-diagnostic-allowlist) with a reason. The allowlist is exact-match only: no globs,
prefixes or broad suppression. The test also fails when an allowlisted identifier is documented
as a diagnostic, or when an allowlist entry is unused.

**Update rule:** adding an emitted `core.*` or `pap.*` code requires a row in this file in the
same pull request. Do not allowlist a real diagnostic to silence the check; a genuine diagnostic
belongs in its section below.

**Normative ownership.** For `core.*` codes, [engine-public-contract.md](engine-public-contract.md)
§7.1 defines the diagnostic contract and the boundary codes; this registry is the canonical list
of what the engine actually emits. For `pap.*` codes,
[portable-assurance-package-rfc.md](portable-assurance-package-rfc.md) Appendix J is normative for
severity and verdict effect; this registry is the canonical list of what the reference verifier
actually emits.

## Core engine diagnostic codes

| Code | Component | Meaning |
|---|---|---|
| `core.cli.internal-error` | CLI | An unexpected error escaped the build; the `--json` error document carries this code instead of a stack trace or a fabricated result. |
| `core.engine.root-unavailable` | Engine | The runtime cannot install the import remapping needed to load profile modules from the declared engine root. |
| `core.engine.version-mismatch` | Engine | The engine root version cannot be read or differs from the running engine. |
| `core.extension.unpinned-dependency` | Engine | An import is not engine-owned, is undeclared in the profile closure, or is not pinned in the lockfile. |
| `core.extract.pointer` | Engine | A declared input pointer is missing, or its value has the wrong shape during extraction. |
| `core.identity.missing` | Engine | An entity identity is missing or empty. |
| `core.manifest.invalid` | Engine | The project manifest, profile manifest or render declaration fails validation. |
| `core.manifest.missing` | Engine | The project manifest file is absent. |
| `core.path.outside-root` | Engine | A project, profile, output or engine-root path escapes its containment root. |
| `core.profile.consent-required` | Engine | An executable profile was supplied without the caller's explicit consent. |
| `core.profile.hook-failed` | Engine | A profile hook (view, validator, provenance verifier or quote adapter) threw; the thrown value became this diagnostic and the build stopped. |
| `core.profile.invalid` | Engine | The profile declaration is invalid (shape, consumed files, `view`/`validator` requirements). |
| `core.profile.unknown-code` | Engine | A validator hook reported a finding code that is absent from the profile diagnostic catalog. |
| `core.profile.unknown-kind` | Engine | An entity uses a kind the profile does not declare. |
| `core.profile.unknown-relation` | Engine | A relation declaration names an undeclared relation. |
| `core.provenance.incomplete` | Engine | A provenance binding omits a required field. |
| `core.provenance.verification` | Engine | A provenance verification record is malformed or internally inconsistent. |
| `core.registry.missing` | Engine | A renderer/adapter registry entry is missing, or no renderer is registered. |
| `core.relation.cardinality` | Engine | A relation value violates its declared cardinality. |
| `core.relation.unknown` | Engine | An entity uses a relation that is not declared for its kind. |
| `core.render.failed` | Engine | A renderer threw while producing an artifact. |
| `core.render.invalid` | Engine | A renderer returned the wrong artifact count or an artifact path that disagrees with the manifest. |
| `core.schema.entity` | Engine | An entity fails its entity-kind schema, or a relation value has the wrong shape. |

## PAP verifier diagnostic codes

### Package, parser and paths

| Code | Meaning |
|---|---|
| `pap.package.not-found` | The package path does not resolve; no report, exit 74. |
| `pap.package.io` | A declared file or the manifest cannot be read. |
| `pap.package.manifest-json` | The manifest is not valid UTF-8 JSON or violates the JSON profile. |
| `pap.package.duplicate-key` | A JSON object repeats a member name. |
| `pap.package.schema` | The manifest violates Appendix A or a cross-field invariant. |
| `pap.package.unknown-field` | A core object carries an unknown field. |
| `pap.package.path-invalid` | A declared path has invalid syntax or escapes the package root syntactically. |
| `pap.package.path-duplicate` | Two declarations share a path or differ only by case. |
| `pap.package.path-escape` | A syntactically valid declared path resolves outside the package root. |
| `pap.package.symlink` | A declared payload path or a payload read is a symbolic link. |
| `pap.package.non-regular` | A declared path is not a regular file. |
| `pap.package.declared-file-missing` | A manifest-declared payload file is absent or unreadable. |
| `pap.package.manifest-self-reference` | The manifest declares itself as a payload. |
| `pap.package.undeclared-file` | A regular file is present but not declared (warning). |
| `pap.package.undeclared-scan-incomplete` | The undeclared-file scan could not complete (I/O error or private budget). |
| `pap.package.limit-exceeded` | A resource limit stopped verification. |
| `pap.package.duplicate-id` | Duplicate artifact/source/input/check/claim id or check specification. |
| `pap.package.empty-check-specs` | No required check remains after the policy union. |
| `pap.package.claim-invalid` | A claim file violates Appendix D. |

### Integrity

| Code | Meaning |
|---|---|
| `pap.integrity.artifact-mismatch` | A declared artifact digest or byte count differs from the recomputed value. |
| `pap.integrity.source-mismatch` | A declared raw source digest differs from the recomputed value. |
| `pap.integrity.input-mismatch` | A declared input digest or normalized build digest differs from the recomputed value. |
| `pap.integrity.claim-mismatch` | A declared claim-file digest differs from the recomputed value. |

### Sources and checks

| Code | Meaning |
|---|---|
| `pap.source.unavailable` | A source required by a check has no embedded snapshot. |
| `pap.check.unsupported` | The verifier does not implement a required check id/version. |
| `pap.check.not-evaluated` | A required check could not run. |
| `pap.check.failed` | A required check completed with a failing assertion. |
| `pap.check.partial` | A check evaluated only part of its scope. |
| `pap.check.span-out-of-range` | A provenance byte range is outside the source snapshot or inverted. |
| `pap.check.quote-mismatch` | Extracted span bytes do not hash to the declared quote digest. |
| `pap.claim.binding-duplicate` | A provenance binding is duplicate or ambiguous. |
| `pap.claim.duplicate-entity` | The relations claim declares a duplicate entity id. |
| `pap.claim.relation-duplicate` | The relations claim declares a duplicate relation name. |
| `pap.claim.relation-unknown` | An edge names a relation that is not declared. |
| `pap.claim.edge-unknown-entity` | An edge endpoint is not a declared entity. |
| `pap.claim.relation-kind-mismatch` | Edge entity kinds do not match the relation declaration. |
| `pap.claim.inverse-missing` | A declared inverse is not declared, or a reciprocal edge is missing. |
| `pap.claim.inverse-not-reciprocal` | An inverse declaration does not point back at the forward relation. |
| `pap.claim.inverse-kind-mismatch` | An inverse declaration's endpoints are not the reverse of the forward declaration. |
| `pap.claim.unsupported-version` | A claim file declares an unknown claims version. |
| `pap.claims.producer-mismatch` | A producer claim's outcome disagrees with the independent outcome. |
| `pap.claims.spoofed-result` | A producer claim contains verifier-only fields or otherwise mimics a verifier record. |

### Signatures, trust and review

| Code | Meaning |
|---|---|
| `pap.signature.absent` | No signature envelope is present (`info` or `warning` by policy mode). |
| `pap.signature.envelope-invalid` | A signature envelope is structurally malformed. |
| `pap.signature.unsupported-format` | An envelope format, payload type or key type is outside v0.1. |
| `pap.signature.invalid` | Cryptographic signature verification failed. |
| `pap.signature.payload-mismatch` | An envelope payload does not match the package identity. |
| `pap.signature.keyid-missing` | A signature entry has no usable key identifier. |
| `pap.signature.duplicate-signer` | The same key id appears in more than one envelope signature. |
| `pap.trust.policy-absent` | No trust policy was supplied. |
| `pap.trust.policy-invalid` | The policy is unreadable, not JSON or violates Appendix B. |
| `pap.trust.policy-stale` | The policy expired before the evaluation time. |
| `pap.trust.policy-not-yet-valid` | The policy `issuedAt` is in the future. |
| `pap.trust.signer-unknown` | A valid signature comes from a signer the policy does not know. |
| `pap.trust.signer-untrusted` | A known key or identity is not authorized for this package role. |
| `pap.trust.package-not-allowed` | The package id is not in the signer's allowed package list. |
| `pap.trust.checker-unknown` | The checker identity is missing from the policy allowlist. |
| `pap.trust.checker-untrusted` | The checker identity is known but not allowed. |
| `pap.trust.profile-unknown` | The profile identity is missing from the policy allowlist. |
| `pap.trust.profile-untrusted` | The profile identity is known but not allowed. |
| `pap.trust.review-required` | Policy-required human review evidence is insufficient. |
| `pap.review.missing` | Required approval evidence is absent. |
| `pap.review.stale` | Approval evidence is older than the policy allows. |
| `pap.review.unbound` | Approval evidence is a producer claim without cryptographic binding. |
| `pap.review.unknown-reviewer` | The reviewer identity is not recognized by the policy. |
| `pap.review.binding-invalid` | Approval evidence does not bind this package or artifact set. |

### Compatibility, features and CLI

| Code | Meaning |
|---|---|
| `pap.feature.unsupported` | A required feature is not supported. |
| `pap.extension.critical-unsupported` | An unknown critical extension is present. |
| `pap.extension.ignored` | An unknown non-critical extension was ignored. |
| `pap.compat.minor-newer` | The package minor version is newer than the supported range. |
| `pap.compat.version-unsupported` | The package version cannot be safely parsed. |
| `pap.limit.lowered` | The operator lowered a resource limit. |
| `pap.cli.usage` | CLI usage error; exit 64 and no document. |
| `pap.cli.unknown-check` | `explain --check` names a well-formed id the package does not declare. |
| `pap.io.error` | The CLI could not write its output or read its own assets; exit 74. |
| `pap.internal.error` | The verifier hit an unexpected exception; exit 70. |

## Non-diagnostic allowlist

These namespaced identifiers are not diagnostics. They are digest domains, identity names or
internal markers, so the code-to-docs check must not require a diagnostic row for them. Each
entry is exact-match and must stay in use by production source; remove an entry when its last use
disappears.

| Identifier | Kind | Why it is not a diagnostic |
|---|---|---|
| `pap.artifact.v1` | Digest domain | Domain separator for the artifact digest. |
| `pap.checker.identity.v1` | Digest domain | Domain separator for the checker-identity digest. |
| `pap.claims.v1` | Digest domain | Domain separator for claim-file digests. |
| `pap.extension.closure.v1` | Digest domain | Domain separator for the extension-closure digest. |
| `pap.input.file.v1` | Digest domain | Domain separator for one framed input record. |
| `pap.input.set.v1` | Digest domain | Domain separator for the normalized input-set digest. |
| `pap.package.v1` | Digest domain | Domain separator for the package identity. |
| `pap.quote.v1` | Digest domain | Domain separator for quote digests. |
| `pap.report.v1` | Digest domain | Domain separator for the verification-record identity. |
| `pap.source.raw.v1` | Digest domain | Domain separator for raw source digests. |
| `pap.trust-policy.v1` | Digest domain | Domain separator for the trust-policy digest. |
| `pap.verifier.go` | Verifier identity | Identity of the independent Go verifier. |
| `pap.verifier.python` | Verifier identity | Identity of the independent Python verifier. |
| `pap.verifier.reference` | Verifier identity | Identity of the reference TypeScript verifier. |
| `pap.verifier.rust` | Verifier identity | Identity of the independent Rust verifier. |
