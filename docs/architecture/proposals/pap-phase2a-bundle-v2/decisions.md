# Decisions — D-P2A-1, D-P2A-2, D-P2A-3

This document records the repository evidence for the three decisions requested in
[Issue #94](https://github.com/agent-federation/contract-builder/issues/94), the preliminary
position from [issue comment 6623392056](https://github.com/agent-federation/contract-builder/issues/94#issuecomment-6623392056),
the options, their consequences, and the exact proposed wording or artifact change. It is
decision input, not a decision record: the maintainer remains the owner. No option is accepted by
this document.

**Decision status:** D-P2A-1/2/3 are proposals only; no owner decision is recorded and implementation is not authorized. F58 is pending by design.

**Baseline:** `agent-federation/contract-builder` base branch at `5291f1b`; handoff bundle
`agent-federation/contract-builder-independent` at `c568051`; bundle snapshot source commit
`c6ee644`. The RFC and `cases.json` are byte-identical between `c6ee644` and `5291f1b`
(`git diff c6ee644..5291f1b -- docs/architecture/portable-assurance-package-rfc.md pap/fixtures/pap-v0.1/cases.json`
is empty). `cases.json` SHA-256 is
`8ae2693b34a31f1a49fdee0e5e5e235419e8d510d2a9b6f84e809b0c1ef154df`.

---

## D-P2A-1 — implementation identity in `AGENT_BRIEF.md`

### Preliminary position

Recommend **A**: add a normative recipe to `AGENT_BRIEF.md` that computes
`implementationDigest = extensionClosureDigest("checker", id, version, files, dependencies)` and
`checkerIdentity = H("pap.checker.identity.v1", JCS({id, version, implementationDigest}))`, require
a two-way self-check, and name the experiment-record fields. The preliminary argues that RFC
§5.8/§5.9 already define the construction, that the defect is the missing brief recipe, and that
option B would have admitted all three observed fabrications.

### Repository evidence

| Claim | Evidence |
|---|---|
| The RFC defines the algorithm, domains, framing and vector | [`portable-assurance-package-rfc.md` §5.8](../../portable-assurance-package-rfc.md) lines 1058–1071; §5.2 lines 949–955 (framed closure records); §5.7 lines 1042–1056 (declared files + pinned dependencies); table line 890; Appendix E.3 lines 4966–4984 (complete checker-identity vector) |
| The report schema requires the verifier identity fields | [`verification-report.schema.json`](../../../../pap/schemas/verification-report.schema.json) lines 25–52: `verifier` requires `id`, `version`, `implementationDigest`, `checkerIdentities[]` |
| The brief requires the digest families but not the checker identity | [`AGENT_BRIEF.md` §4.4](https://github.com/agent-federation/contract-builder-independent/blob/c568051f6a4b8feaf8c0b5fabfd5e3e735e2af98/AGENT_BRIEF.md#L171-L199): the applicable list includes "extension closure identity" (line 185) and "claim-file digests" (line 184), but no `implementationDigest`, `checkerIdentity`, `verifier.id` or `verifier.version` |
| The brief's report section only says "report package-derived identities correctly" | `AGENT_BRIEF.md` §4.5 lines 201–217; it does not mention the verifier object, checker identity, or the Appendix E.3 vector |
| Appendix E tests do not mention the checker identity | `AGENT_BRIEF.md` §7.1 lines 336–350; the list has "identity-form exclusions and record identity" but not the checker-identity vector |
| The record already captures the runtime and dependency inventory, but not the closure identity | `AGENT_BRIEF.md` §9 lines 437–451 (deliverable 4 "Dependency and toolchain inventory", 5 "Input bundle integrity record") and §10 lines 465+ (record compiler/runtime, dependency versions, Appendix E results) |
| The failure mode is "no framing", not "wrong framing" | The public [issue comment](https://github.com/agent-federation/contract-builder/issues/94#issuecomment-6623392056) summarizes the blind run: go used `sha256("pap-go-p2a-001")`; python hashed a non-existent file; rust copied a digest from `pap/fixtures/pap-v0.1/base/claims/producer-report.json` and reported `verifier.id = "pap.verifier.reference"` |

### What the RFC already fixes, and what it leaves open

The RFC fixes:

- the domain `pap.extension.closure.v1` and the checker-identity domain
  `pap.checker.identity.v1` (§5.2 lines 906–919);
- the record framing: `extension` record `(kind, id, version)`, `file` records
  `(path, normalizedTextBytes)` sorted by path, `dependency` records `(name, version, integrity)`
  sorted by name then version (§5.2 lines 949–955);
- LF normalization of declared text files; a binary declared file is an author error
  (§5.2 line 953);
- the `implementationDigest` and `checkerIdentity` formulas (§5.8 lines 1060–1065);
- a complete test vector with expected values (§E.3 lines 4966–4984);
- the rule that checker identity is verifier-side and is not compared across implementations
  (§13.6 lines 3417–3440; the comparison excludes `verifier`, `checkerIdentity` and per-check
  checker).

The RFC does **not** fix the experiment-specific declaration set:

- which files an independent checker must put in its closure (source only, build manifests,
  lockfiles, generated source?);
- how a native implementation without a lockfile represents dependencies, and what the
  `integrity` string is when the lockfile uses a non-`sha256:` form (E.3 itself uses a
  `sha512-...` string);
- the stable `id`/`version` values an independent implementation should use;
- the report and experiment-record fields that prove the values were computed rather than copied.

Those are the brief-level gaps A must close. A does not change the RFC; it fixes the declaration
convention for the experiment. The RFC's algorithm and E.3 vector are the normative baseline.

### Options

- **A — normative recipe in the brief.** Add §4.4.1 with the formula, the declaration rules, the
  E.3 vector and the self-check; add the report sentence to §4.5 and the test bullet to §7.1; name
  the record fields. Consequence: one brief change, one experiment-record schema addition, one
  report obligation; the RFC and schemas are unchanged. Independently implemented checkers can
  produce identities that are comparable within an implementation and auditable across runs.
  Affected: implementers (compute and report), the experiment owner (record and review), the
  maintainer (authorize the brief change).
- **B — "digest of your own closure", framing implementation-defined.** Add only the self-check and
  the record fields. Consequence: the three observed fabrications would still pass a vague
  wording; two implementations cannot tell whether they are using the same closure or the same
  dependency representation; the experiment record cannot distinguish a fabricated digest from a
  correct one. Affected: implementers (still choose a framing), the experiment owner (no
  comparability), the maintainer (the defect remains). The preliminary's objection is correct.
- **C — leave the brief silent.** Treat the fabrication as an implementation defect. Consequence:
  the brief remains the only authorized source for the independent implementer; the defect is not
  attributable and recurs every run; the experiment record cannot prove provenance. Affected:
  implementers (repeat the defect), the experiment owner (no provenance), the maintainer (no
  evidence to decide on). The preliminary's objection is correct.

### Recommendation: A, with the complete recipe

A is the only option that makes the identity reproducible from the authorized inputs. The recipe
must be complete, because an incomplete recipe still admits divergent identities. The proposed
wording follows. The recipe is checked two ways: [`verification.md`](verification.md) §1.4 reruns
the E.3 vector and mutates one included byte (both digests must change) and one excluded file
(neither may change); §1.5 checks the implementation record and both self-check directions.

#### Exact proposed text — insert after `AGENT_BRIEF.md` §4.4 (before §4.5)

````markdown
### 4.4.1 Checker identity

Phase 2a MUST compute and report the verifier's own checker identity. This is the
`implementationDigest` and `checkerIdentity` construction of RFC §5.8; it is not a
package-derived identity and MUST NOT be copied from package data.

```text
implementationDigest = extensionClosureDigest(kind="checker", id=<verifier-id>,
                                              version=<verifier-version>,
                                              files=<closure-files>,
                                              dependencies=<pinned-dependencies>)
checkerIdentity      = H("pap.checker.identity.v1",
                         JCS({"id": <verifier-id>, "version": <verifier-version>,
                              "implementationDigest": implementationDigest}))
```

- `<verifier-id>` is `pap.verifier.<language>`; `<verifier-version>` is `0.1.0`. The same
  values MUST appear in `verifier.id`/`verifier.version` in every report and in every check
  record's `checker` object.
- `files` is the implementation's own source closure: every tracked text file that contributes
  to building the verifier, with repo-relative POSIX paths sorted in ascending UTF-8 byte
  order. Include source, build manifests and lockfiles. Exclude tests, fixtures, documentation
  and generated files that are not build inputs. Normalize text per RFC §5.2 (UTF-8;
  CRLF/CR → LF); a binary file in the closure is an error.
- `dependencies` is the complete pinned third-party dependency closure declared by the
  implementation's lockfile/build manifest: one `(name, version, integrity)` record per package,
  sorted by name then version, with `integrity` copied verbatim from the lockfile for the artifact
  the build actually consumes (for example a Cargo checksum, a Go module `h1:` value, or the
  selected wheel/sdist hash). A lockfile may carry several integrity values for one package
  (`uv.lock` per-wheel/sdist hashes; `go.sum` module and `/go.mod` lines); the record is one per
  package, generated metadata such as `/go.mod` lines and unselected wheels are not separate
  dependencies, and the selected artifact is recorded in the experiment record's `artifact` field
  (outside the hash). The selection rule
  must be deterministic for the implementation. The language runtime and standard library are
  not dependency records; record the compiler/runtime name and version in the experiment record.
- Compute the closure at build or run time from the bytes present in the implementation
  checkout. Never copy a digest from package data, a previous run, another implementation or
  the reference verifier.
- Appendix E.3 is the normative checker-identity vector. Reproduce both its
  `implementationDigest` and `checkerIdentity` values exactly.
- Self-check, both directions, with the commands and before/after digests recorded:
  (a) change one byte of one included file; rebuild if the implementation has a build step,
  otherwise re-run, and recompute — the digest MUST change;
  (b) change a file outside the closure; rebuild/re-run and recompute — the digest MUST NOT
  change.
````

#### Exact proposed text — add to `AGENT_BRIEF.md` §4.5

> The report's `verifier` object MUST contain `id`, `version`, `implementationDigest` and
> `checkerIdentities[]`. The array MUST contain exactly one element for a one-binary
> implementation, and that element MUST equal `identities.checkerIdentity`.

#### Exact proposed text — add to `AGENT_BRIEF.md` §7.1

> - checker identity: Appendix E.3, plus the two-way closure self-check.

#### Exact proposed text — add to `AGENT_BRIEF.md` §10

> - the implementation identity record: `verifier.id`, `verifier.version`,
>   `implementationDigest`, `checkerIdentity`, the closure file list (or its hash), the dependency
>   records and both self-check results.

### Experiment-record fields

The record must prove that the digest was computed from the implementation bytes, not copied. The
following fields are proposed (the owner-side record schema gains an `implementation` object;
existing records remain valid for their bundle commits):

| Field | Meaning |
|---|---|
| `implementation.id`, `implementation.version` | the values used in the identity and in every report |
| `implementation.implementationDigest` | `sha256:<64 lowercase hex>` from the closure |
| `implementation.checkerIdentity` | `sha256:<64 lowercase hex>` from the JCS object |
| `implementation.closure.files[]` | `{path, sha256}` for every included file, in the declared sort order |
| `implementation.closure.dependencies[]` | `{name, version, integrity, artifact}` for every pinned package; `artifact` identifies the selected wheel/sdist/module zip |
| `implementation.closure.dependencySelection` | the deterministic rule used to select the artifact hash for multi-artifact lockfiles (`uv.lock`, `go.sum`, `Cargo.lock`) |
| `implementation.closure.listSha256` | optional; `sha256` of the UTF-8 bytes of `"\n".join(f"{path}\t{sha256}" for each file in declared sort order)` (no trailing newline), which makes the list tamper-evident |
| `implementation.selfCheck.includedFile` | `{path, beforeDigest, afterDigest, changed: true, command}` |
| `implementation.selfCheck.excludedFile` | `{path, beforeDigest, afterDigest, changed: false, command}` |
| `implementation.runtime` | compiler/runtime name and version (already required by §10; kept separate from the closure) |

The self-check's negative direction needs a declared non-included file (a test, a fixture or a
document); the record names it. A self-check that only proves the positive direction is
insufficient.

### Affected files and who is affected

| File | Change | Owner |
|---|---|---|
| `AGENT_BRIEF.md` (bundle; source of truth) | new §4.4.1; §4.5 sentence; §7.1 bullet; §10 bullet | maintainer authorizes; implementer applies in implementation |
| bundle snapshot | new snapshot commit containing the brief change; manifest/checksums updated | bundle publisher |
| owner-side experiment-record schema | `implementation` object above | experiment owner |
| independent verifiers | compute and report the identity; no RFC or schema change | implementers |

### Disagreements with the preliminary position

1. **A is right; the recipe is incomplete.** The preliminary's "what the closure contains
   (implementation source and build inputs, excluding tests/fixtures/generated docs)" does not
   mention build manifests/lockfiles, LF normalization, binary handling, or the dependency-record
   form. RFC §5.2 already fixes LF normalization and the dependency record; the brief must say so.
2. **`id`/`version` are unset.** Without a stable convention, two correct implementations still
   report different checker identities, and the rust failure's `pap.verifier.reference` remains
   possible. The brief must prescribe `pap.verifier.<language>` / `0.1.0` and forbid copying the
   reference id.
3. **The report fields are missing from the preliminary recipe.** `verifier.implementationDigest`
   and `verifier.checkerIdentities[]` are required by the report schema; the brief must say the
   same values are used there and in `identities.checkerIdentity`.
4. **E.3 must be named.** The vector is the executable proof of the recipe; without it, an
   implementation can pass a self-consistent but non-normative framing.
5. **A is not a security control.** A fabricated identity remains possible; the record and
   self-check make fabrication auditable. No Phase 2a verifier can prove its own identity without
   external attestation. This limitation should be stated, not hidden.

### Open questions / blockers

None for option A. The dependency representation is settled as lockfile records, one per package,
using the integrity of the artifact the build consumes; multi-artifact lockfiles (`uv.lock`,
`go.sum`, `Cargo.lock`) are reduced by a deterministic rule recorded in `dependencySelection`, and
the selected artifact is recorded in each dependency record. The runtime/compiler stays outside
the closure. This is consistent with RFC §5.2 and E.3. If the maintainer wants the
compiler/runtime inside the checker closure, RFC §5.2 has no field for it and that would be a
broader RFC change; it is not required for comparability and is not proposed.

---

## D-P2A-2 — frozen Phase 2a case set

### Preliminary position

Recommend **A**: add a separate `cases-phase2a.json` to the handoff bundle carrying the 22
outcome-comparable case ids, the 33 identity-only ids, the 6 later-phase exclusions (all Phase 2c),
the comparison profile and a case-set version. The file is consumed mechanically; the bundle
manifest and `SHA256SUMS` are updated; existing runs stay valid because they pin the old snapshot
commit.

### Repository evidence

| Claim | Evidence |
|---|---|
| Phase 2a is the skeleton only; checks are 2b; CLI/trust policy are 2c; DSSE/trust are 2d | [`portable-assurance-package-rfc.md` §14](../../portable-assurance-package-rfc.md) lines 3529–3550; §14.1 lines 3552–3565 |
| The brief forbids the three checks in Phase 2a, including relation-consistency | [`AGENT_BRIEF.md` §5](https://github.com/agent-federation/contract-builder-independent/blob/c568051f6a4b8feaf8c0b5fabfd5e3e735e2af98/AGENT_BRIEF.md#L247-L285) lines 251–261 |
| The brief requires only claim-file digests, not claim schema/cross-field parsing | `AGENT_BRIEF.md` §4.4 line 184; §4.2 lines 138–159 is manifest-only; no other "claim" requirement exists in the brief |
| F46 expects a relation-consistency check failure | [`cases.json`](../../../../pap/fixtures/pap-v0.1/cases.json) lines 1119–1143: `dimensions.checks["pap.check.relation-consistency/1"] = "FAIL"`, `verdict FAIL`, `exit 1`, `coverageFull true`; RFC §12.4 line 3178 |
| F59 expects a relation-consistency check failure | `cases.json` lines 1458–1482: same check, `verdict FAIL`, `exit 1`; RFC §12.4 line 3205 |
| Those diagnostics are emitted inside the check, not by manifest parsing | [`pap/src/checks.ts`](../../../../pap/src/checks.ts) lines 422 (`pap.claim.relation-duplicate`) and 472 (`pap.claim.inverse-not-reciprocal`) |
| A verifier without the check cannot produce the expected (verdict, dimension) pair | RFC §7.4 rule 1 (lines 1674–1679): `FAIL` if any required check is `FAIL`; the case's required check is the RC check and expects `integrity.package=PASS`. Without the check a 2a verifier reports `UNSUPPORTED`/`4` or `INCOMPLETE`/`2`; if it rejects the relation at claim-parse time it sets `integrity.package=FAIL` instead. Neither matches the case's `FAIL`/`1` + `integrity.package=PASS` |
| F25/F37/F38/F39/F41/F42 are later-phase | F25 is CLI usage (RFC F25 line 3132); F37–F39 are `inspect`/`explain` (2c); F41 is invalid trust policy (2c); F42 is `explain` (2c). The six cases are all 2c — the preliminary is correct on this point |
| F52/F61 are policy-driven limit cases, not check-decision cases | their commands use `../trust-policy/lowered-limits.json` / `relations-only-lowered.json`, which contain `"limits": {"fileBytes": 64}`; trust-policy parsing/evaluation is 2c (brief §5 lines 263–272). The default case set keeps them identity-only because the policy-driven limit (and the F61 check expectation) is later-phase, not because a check outcome decides the verdict |
| The bundle has no case set; its source commit is `c6ee644` | [`snapshot/manifest.json`](https://github.com/agent-federation/contract-builder-independent/blob/c568051f6a4b8feaf8c0b5fabfd5e3e735e2af98/snapshot/manifest.json) `source.commit`; 433 files |
| The RFC's normative list is §12 plus `cases.json`; a new file is not automatically normative | RFC §13.1 lines 3284–3300; §12.2 lines 3013–3060; §13.7 lines 3445+ |

The full cases that run with `../trust-policy/unsigned-valid.json` use the minimal policy
interface that `AGENT_BRIEF.md` §4.7 permits for Phase 2a testing; their expected outcomes do not
depend on trust evaluation. F52/F61 are different: their policy supplies the lowered `fileBytes`
limit that drives the verdict, so they are not Phase 2a outcome-comparable. This is why the
presence of a policy argument is not by itself a Phase 2a disqualification, while the F52/F61
limit-bearing policy is.

### The case-set rule

The proposal applies the following rule consistently:

- **full** — the expected exit code and verdict are decidable without the three PAP checks,
  DSSE/Ed25519/signature evaluation, the full CLI, or trust-policy evaluation. The comparison
  covers exit code, verdict, the applicable diagnostic-code subset, the
  `integrity.package`/`integrity.artifacts` dimensions and the package identity.
- **identityOnly** — the manifest can be canonicalized so `packageIdentity` is well-defined, but
  the verdict needs a later phase. Only `packageIdentity` is compared.
- **excluded** — the full outcome belongs to a later phase; the case is counted with its owning
  phase and not compared.

The rule must also reject a case whose expected verdict depends on a check even if the case's
`checks` dimension is filtered out: filtering the report field does not make the expectation
check-free. That is exactly what F46/F59 do.

### Options

- **A — separate `cases-phase2a.json` (recommended).** A new file in the bundle carrying the
  19/36/6 projection, per-case applicable codes and identity expectations; `cases.json` is
  untouched. Affected: the bundle publisher (manifest/checksums/provenance), implementers (read
  the case set), the experiment owner (consume it), the maintainer (decide the F58 scope). Cost:
  one experiment-scope file plus the provenance rule; no RFC change if it stays experiment-scope.
- **B — add a `phase`/`comparisonScope` field to every case in `cases.json`.** This edits the
  normative §12 corpus, every case entry and the case schema, embedding a Phase-2a scoping
  decision in the normative corpus. Affected: every case author/reviewer, the RFC §12.2/§12.5
  process, all `cases.json` consumers, and existing expectations; the blast radius is the whole
  corpus. Not recommended.
- **C — keep `cases.json` and publish the set out-of-band (brief appendix only).** There is no
  machine-consumable artifact; each implementer transcribes the subset and the comparison is
  prose-driven. Affected: implementers and the harness; the divergence the issue reports would
  persist. Not recommended.

The evidence for these consequences is the RFC §12.2/§12.5 corpus rules, the brief §7.4 phase
boundary discipline, and the fact that the current bundle has no case-set artifact (`cases.json`
is the only corpus index).

### Re-derived case list: 19 full / 36 identity / 6 excluded (default; F58 pending)

The 22 count is not reproducible from the public corpus under the case-set rule. F46 and F59
cannot be full because their expected `(verdict, integrity.package)` pair depends on the
relation-consistency check; F58 is a separate scope question because the brief does not require
claim cross-field validation. The
default below puts all three in identity-only: **19 full / 36 identity / 6 excluded**. If the
maintainer declares claim validation Phase 2a, F58 moves to full and the set is **20/35/6**.

#### Full cases (19)

For each case the identity expectation is the `packageIdentity` a conforming verifier reports
under the case's declarations; it is not a reference-implementation output. `null` is required
where `cases.json` says the identity is not computable (`identityRelations.packageIdentity:
null`); the other values are generated by the standalone JCS script in
[`verification.md`](verification.md). The applicable diagnostic codes are the ones a Phase 2a
verifier can emit; check-family codes are not included.

| Case | Expected | Phase-2a decidable because | Applicable codes | Identity |
|---|---|---|---|---|
| F07-unknown-check | 4/UNSUPPORTED | required check id is unsupported; checkSpecs parse | — | `sha256:55058e310ee2a1b9b0f6e13f8807e8cca48b7d6bdcdbfc685f9c935907872552` |
| F08-critical-extension | 4/UNSUPPORTED | critical extension parse | `pap.extension.critical-unsupported` | `sha256:dd62941363582d900ef34216fff2bab7ee5cec1a1a1d0f99f56e4d52e7c34662` |
| F09-newer-check | 4/UNSUPPORTED | check version parse | — | `sha256:4983f4535f40e7e03dcc5fdc85a2a44bd8bbcd48c95479e8efc53eaac5155d9b` |
| F10-newer-minor | 4/UNSUPPORTED | `papVersion` compatibility parse | `pap.compat.minor-newer` | `sha256:4389504d67eef2e6ad5d12a0d04cd3a508dd42ca4ec5e26c3c479ec3bd7c5be8` |
| F21-truncated-manifest | 1/FAIL | invalid JSON | `pap.package.manifest-json` | `null` |
| F22-path-traversal | 1/FAIL | path grammar/root confinement | `pap.package.path-invalid` | `sha256:c59d3b6d584009d51e0f6bca3e8a132844e6e1d3ae03c6e99591a8c33151b104` |
| F23-symlink | 1/FAIL | symlink rejection | `pap.package.symlink` | `sha256:48049594c1f084fa6693e1e07148b21a4842502f75ceb9b8040b1b30da2008e5` |
| F24-case-duplicate | 1/FAIL | duplicate/case-colliding path detection | `pap.package.path-duplicate` | `sha256:602ef24f955e7285982356f9445ab800e22504c0ba264f2475a054ba56aa7778` |
| F26-missing-artifact | 1/FAIL | missing declared payload | `pap.package.declared-file-missing` | `sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020` |
| F29-duplicate-key | 1/FAIL | duplicate JSON key rejection | `pap.package.duplicate-key` | `null` |
| F30-unknown-field | 1/FAIL | closed schema | `pap.package.unknown-field` | `sha256:b95246443fbece8489b9cd46b1c382a0895b61bbb7a03a65ad6610c92af7a465` |
| F33-required-feature | 4/UNSUPPORTED | required feature parse | `pap.feature.unsupported` | `sha256:e64a5844cca90fa1d2cd5c96fe1188da75e1d1f1d63bb5b1ac68c9283a13c206` |
| F35-manifest-limit | 1/FAIL | manifest resource limit | `pap.package.limit-exceeded` | `null` |
| F50-bom | 1/FAIL | BOM rejection | `pap.package.manifest-json` | `null` |
| F51-exponent-number | 1/FAIL | integer-only JSON profile | `pap.package.manifest-json` | `null` |
| F53-check-version | 1/FAIL | checkSpecs schema | `pap.package.schema` | `sha256:5728aa427d67e448d0a5802760c734627cbab20c86614c8107201c241a90df7c` |
| F54-all-optional | 2/INCOMPLETE | empty required set | `pap.package.empty-check-specs` | `sha256:5135fb69f88dc8f36422f846963db974c44e0503056c96c4a2b4a021a80ae365` |
| F57-major-version | 4/UNSUPPORTED | version compatibility | `pap.compat.version-unsupported` | `sha256:4cdc8f72b94c72f88ba52ab26ce6765412e2b39f45c3badd7c7596476a2ec9b8` |
| F60-missing-manifest | 1/FAIL | absent manifest | `pap.package.io` | `null` |

F07/F09's only expected diagnostic is `pap.check.unsupported`, which is check-family and therefore
not required from a Phase 2a verifier; the exit/verdict comparison is sufficient. F10/F57 also
expect `pap.check.not-evaluated`; it is likewise not in the applicable set. The `full` profile's
`diagnosticCodePolicy` states this explicitly: check-family codes (`pap.check.*`) are not compared
in 2a; `applicableDiagnosticCodes` is the expected subset, not the complete `cases.json` set.

F29's identity is `null`: its manifest repeats `package.id`, so RFC §5.3.1 forbids canonicalization.
The verifier rejects duplicate member names, BOM and non-integer number spellings before computing
any identity; a last-value-wins `json.loads` implementation cannot silently pass F29.

#### Identity-only cases (36)

The identity is the package identity; the verdict needs a later phase. `base` means the
`sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020` base identity; `exact`
means the value generated by the script in [`verification.md`](verification.md) (shown for the
non-base cases).

| Case | Why the verdict is later-phase | Identity |
|---|---|---|
| F01-unchanged | DI/SQ/RC checks (2b) | base |
| F02-artifact-byte | DI check (2b) | base |
| F03-source-byte | DI check (2b) | base |
| F04-input-byte | DI check (2b) | base |
| F05-quote-span | SQ check (2b) | `sha256:90bbfcccfa81920d0883d0c17e7067305518dc8fad48761c7e8cee6ccb8608d1` |
| F06-relation-edge | RC check (2b) | `sha256:6430587d9f1d0b0a98979ee2aa9850b882b2531cb76940e55e0b146a6dd3afed` |
| F11-untrusted-role | signature/trust (2d) | base |
| F12-invalid-signature | signature (2d) | base |
| F13-trusted-signature | signature/trust and checks (2b/2d) | base |
| F14-no-policy | checks (2b), signature absence (2d) | base |
| F15-stale-policy | trust policy (2d) | base |
| F16-unknown-signer | signature/trust (2d) | base |
| F17-package-not-allowed | signature/trust (2d) | base |
| F18-two-envelopes | signature/trust (2d) | base |
| F19-required-signature-absent | signature (2d) | base |
| F20-producer-mismatch | DI check (2b) and producer claim | base |
| F27-referenced-source | SQ/checks and source availability (2b) | `sha256:6bd1c79fb00cd96e4782a594b2875eac81f9afdc812b58e1432e2753826caa44` |
| F28-review-missing | human review (2d) | base |
| F31-undeclared-file | checks (2b) | base |
| F32-optional-extension | checks (2b) | `sha256:8612a147184c9bb6db19428205154d1e0ca428900ebcc9463f0c4c37dbd77d88` |
| F34-noncanonical | checks (2b) | base |
| F36-determinism | checks (2b) | base |
| F40-producer-free | checks (2b) | base |
| F43-profile-mismatch | profile recognition/trust (2d) | `sha256:804560f61d1c5a6cee6fcb101ef4088df24179b1ed3bedfaa8173a2ef71dda8c` |
| F44-no-provenance | checks (2b) | `sha256:9dccc020e94c2a2250caf8b5ea255d0638a53a2b7164d6560d99a1a8906ba21c` |
| F45-no-relations | checks (2b) | `sha256:4a1fe441eb4fdab141b689e48af14c257be6851d461ca86bbc6f08c41c6080ee` |
| F46-inverse-not-reciprocal | RC check (2b) — moved from the preliminary's full set | `sha256:861e2ae4b91cb347e3a19f9e501e67219d6f776864a906ce513ba232b146967e` |
| F47-policy-boundary-expiry | checks (2b), policy (2d) | base |
| F48-policy-boundary-issued | checks (2b), policy (2d) | base |
| F49-policy-one-second-after | policy (2d) | base |
| F52-lowered-limits | policy-driven limit (2c) and checks (2b) | base |
| F55-review-approved | human review (2d) | `sha256:6e5ca77778f45a060fd7fda00c1950e7bc64392cd55ed3f054c7e26754e53670` |
| F56-optional-mixed | signature/trust (2d) | base |
| F58-undeclared-source | claim schema/cross-field validation not required by the brief; **pending owner decision D-P2A-2** (default identity-only; alternate full, 20/35/6) | `sha256:943d9196a31bb322d421eff9447b136234f0bd0ed4b247c0a9613a0d510dd998` |
| F59-relation-duplicate | RC check (2b) — moved from the preliminary's full set | `sha256:be227cd044ae034450ef5ab217d3f161825d12ce2649a831a97dcc197c83234e` |
| F61-relations-only-lowered | policy-driven limit (2c) and RC check (2b) | `sha256:0955f1f709939b165d42762d5a6908c989cbf7c3d42a2e9ecea159acea4c8ac8` |

F58 is included in the 36 identity-only cases under the default; if the owner moves it to full,
the identity set is 35 and the full set is 20. The proposed artifact marks it
`pendingOwnerDecision: D-P2A-2` and records the alternate profile.

#### Excluded cases (6)

| Case | Owning phase | Why |
|---|---|---|
| F25-archive | 2c | `PACKAGE` is a regular file; `pap.cli.usage`/64 is the CLI contract. D-P2A-3 fixes the fixture but does not move the case into the Phase 2a outcome set |
| F37-inspect-usage | 2c | `inspect` CLI usage |
| F38-explain-usage | 2c | `explain` CLI usage |
| F39-explain-unknown | 2c | `explain` CLI unknown check |
| F41-invalid-policy | 2c | trust-policy parsing/evaluation |
| F42-explain-positive | 2c | `explain` positive output |

### Proposed artifact and reproducibility

The concrete proposal is [`cases-phase2a.proposed.json`](cases-phase2a.proposed.json), with the
checker [`verify_cases.py`](verify_cases.py). The artifact is **not** a bundle file: it is the
reviewable instance of the classification in this document, and it records that D-P2A-1/2/3 are
still owner decisions and that F58 is pending.

```bash
cd "$REPO"
python3 docs/architecture/proposals/pap-phase2a-bundle-v2/verify_cases.py \
  --repo . \
  --case-set docs/architecture/proposals/pap-phase2a-bundle-v2/cases-phase2a.proposed.json
```

Expected:

```text
OK: 61 cases; 19 full / 36 identityOnly / 6 excluded
OK: case ids, profile membership, applicable codes and packageIdentity expectations
OK: F46/F59 are identity-only; F58 is pending D-P2A-2 (default 19/36/6, alternate 20/35/6)
OK: F29 identity is null (strict duplicate-key rejection); pap.check.* codes are not compared
```

The verifier re-derives each `packageIdentity` from the frozen manifest bytes and checks it
against the proposal; it reads only `cases.json`, the fixtures and the proposed artifact. The
final bundle file uses the shape below and the `caseSetOrigin` / `caseSetCommit` provenance fields;
the proposal-only fields (`proposalStatus`, `pendingOwnerDecisions`, `summary.f58PendingOwnerDecision`)
are not copied into the bundle.

### Exact proposed `cases-phase2a.json` shape

The file is experiment-scope metadata, not an amendment to RFC §12. It references `cases.json` by
case id and stores only the Phase 2a projection; the exit code, verdict and dimension values remain
in `cases.json`, so the two files cannot drift independently.

```json
{
  "caseSetVersion": "2a.1",
  "phase": "2a",
  "normativeStatus": "experiment-scope; cases.json remains the normative §12 corpus",
  "basis": {
    "rfc": "docs/architecture/portable-assurance-package-rfc.md §14 step 2a",
    "brief": "AGENT_BRIEF.md §4.1–4.6 and §5",
    "sourceCommit": "<the source commit of the normative corpus>",
    "caseSetOrigin": "source",
    "caseSetCommit": "<the commit that contains this file>",
    "casesJson": {
      "path": "pap/fixtures/pap-v0.1/cases.json",
      "sha256": "8ae2693b34a31f1a49fdee0e5e5e235419e8d510d2a9b6f84e809b0c1ef154df"
    }
  },
  "profiles": {
    "full": {
      "compare": [
        "exitCode",
        "verdict",
        "diagnosticCodes: expected subset",
        "dimensions: integrity.package, integrity.artifacts",
        "packageIdentity: exact or relation"
      ],
      "diagnosticCodePolicy": "check-family codes (pap.check.*) are not compared in 2a; applicableDiagnosticCodes is the expected subset",
      "doNotCompare": [
        "checks",
        "coverage.full",
        "verifier",
        "identities.checkerIdentity",
        "identities.verificationRecordIdentity",
        "evaluatedAt",
        "text output"
      ]
    },
    "identityOnly": { "compare": ["packageIdentity"] },
    "excluded": { "compare": [] }
  },
  "cases": {
    "F07-unknown-check": {
      "profile": "full",
      "applicableDiagnosticCodes": [],
      "packageIdentity": "sha256:55058e310ee2a1b9b0f6e13f8807e8cca48b7d6bdcdbfc685f9c935907872552"
    },
    "F21-truncated-manifest": {
      "profile": "full",
      "applicableDiagnosticCodes": ["pap.package.manifest-json"],
      "packageIdentity": null
    },
    "F46-inverse-not-reciprocal": {
      "profile": "identityOnly",
      "packageIdentity": "sha256:861e2ae4b91cb347e3a19f9e501e67219d6f776864a906ce513ba232b146967e"
    },
    "F25-archive": {
      "profile": "excluded",
      "owningPhase": "2c"
    }
  }
}
```

The full file contains all 61 entries from the tables above. F29-duplicate-key is `null` because its
manifest has a duplicate member name (RFC §5.3.1); the strict precheck rejects duplicate keys, BOM
and non-integer number spellings before any identity is computed. `applicableDiagnosticCodes` is the
exact expected subset (not a prefix filter); `packageIdentity` is a digest, `equals-base`,
`differs-from-base`, or `null`. For `identityOnly` the harness compares only `packageIdentity`; for
`excluded` it compares nothing and counts the case under `owningPhase`.

### How success is checked mechanically

1. The proposed artifact validates with `verify_cases.py`: every `caseId` exists in
   `cases.json`, no case is missing or duplicated, the profile counts are 19/36/6 and the total is
   61. The final bundle file uses the same case entries; the verifier is re-run against it with the
   proposal-only fields removed.
2. For full cases, the expected exit code and verdict come from `cases.json`; the harness checks
   them exactly, checks the `applicableDiagnosticCodes` as an expected subset, checks the
   `integrity.package`/`integrity.artifacts` dimension statuses that `cases.json` constrains, and
   checks the `packageIdentity` exactly (or as `null`/relation).
3. For identity-only cases, the harness checks only `packageIdentity`.
4. The identity literals are generated and re-checked by `verify_cases.py` (validated against
   Appendix E.1 and E.3), after a strict canonical-JSON precheck: BOM, duplicate member names and
   non-integer number spellings yield `null` (RFC §5.3.1). F29 is asserted `null`. No verifier's
   report is used as the oracle.
5. The comparison excludes checker identity, `verificationRecordIdentity`, `evaluatedAt` and text
   output per RFC §13.6; it also excludes check outcomes because Phase 2a does not implement the
   checks.

### Provenance and bundle manifest/checksum update

The bundle's [`snapshot/manifest.json`](https://github.com/agent-federation/contract-builder-independent/blob/c568051f6a4b8feaf8c0b5fabfd5e3e735e2af98/snapshot/manifest.json)
records `source.commit: c6ee644`, and its
[`snapshot/source-provenance.md`](https://github.com/agent-federation/contract-builder-independent/blob/c568051f6a4b8feaf8c0b5fabfd5e3e735e2af98/snapshot/source-provenance.md)
says the snapshot is an exact copy of the authorized source. A new file that exists only in the
bundle would make that provenance claim incomplete. Two clean options:

- **Recommended — source-first.** Add `pap/fixtures/pap-v0.1/cases-phase2a.json` to the source
  repository at a new source commit, with the `normativeStatus` header above; regenerate the
  bundle snapshot from that commit (copy the file, set `source.commit` to the new commit, add it
  to `files`, update `SHA256SUMS` and the manifest hash). The bundle remains an exact copy; the
  new file is reviewable in the source repository; existing runs pin the old bundle commit.
- **Bundled-local alternative.** Add the file to the bundle only, with a manifest-level
  `bundle_local` section `{path, size, sha256, origin: "bundle-local", normativeStatus:
  "experiment-scope"}` and an update to `snapshot/source-provenance.md` and the snapshot verifier.
  This avoids a source change but changes the manifest format; it is not recommended unless a
  source change is undesirable.

Whichever option is chosen, the case set records `caseSetOrigin` (`source` or `bundle-local`) and
`caseSetCommit` (the commit that contains the file); `sourceCommit` remains the normative corpus
source. A bundle-local file does not change `sourceCommit`.

In both cases: add the file to `snapshot/manifest.json` (`files` or `bundle_local`), add its
SHA-256 line to `snapshot/SHA256SUMS`, recompute and update the manifest's own SHA-256 line, and
keep the path sort deterministic. Combined with D-P2A-3, the file count is 433 + 2 = 435 and
`SHA256SUMS` has 436 lines; D-P2A-2 alone gives 434 files / 435 lines. Update the owner-side
`tools/README.md` and any snapshot-verifier documentation that states 433.

The file is **not** normative PAP conformance material. If the maintainer intends it to be
normative, RFC §13.1 (the normative list includes §12 and `cases.json`) must be amended; that is a
broader RFC change and a blocker for the normative interpretation.

### Affected files and who is affected

| File | Change | Owner |
|---|---|---|
| `pap/fixtures/pap-v0.1/cases-phase2a.json` (source, then bundle) | new experiment-scope case set | maintainer authorizes; implementer adds it |
| `snapshot/manifest.json`, `snapshot/SHA256SUMS`, `snapshot/source-provenance.md` (bundle) | record the new file and its provenance; update counts | bundle publisher |
| `AGENT_BRIEF.md` §7.4 | one paragraph pointing to the case set (see below) | maintainer authorizes; implementer applies |
| owner-side comparison harness | consume the case set; no reference oracle | experiment owner |
| independent verifiers | no RFC/schema change; they read the case set as experiment scope | implementers |

Exact proposed text — add to `AGENT_BRIEF.md` §7.4 after the paragraph at lines 387–403:

> The Phase 2a comparison scope is published as
> `pap/fixtures/pap-v0.1/cases-phase2a.json`. It is experiment metadata, not an amendment to RFC
> §12: `cases.json` remains the normative corpus. Use the case set to select the cases and fields
> a Phase 2a verifier must match; record any case it excludes as later-phase and do not claim it
> as Phase 2a acceptance.

### Disagreements with the preliminary position

1. **The 22/33/6 membership is not sound.** F46 and F59 expect a relation-consistency check
   outcome; the brief forbids that check in Phase 2a. They must be identity-only. The preliminary
   repeats the 22 count without resolving that check dependency.
2. **F58 is a separate scope question.** The preliminary includes it in full; the brief requires
   claim-file digests, not claim schema/cross-field validation. The default set moves it to
   identity; if the maintainer declares claim validation Phase 2a, it moves back and the set is
   20/35/6. This is the only open question.
3. **"`packageIdentity` exact" needs an oracle.** A bundle case set cannot use the reference
   implementation's report as the expected identity: a blind implementation cannot see it, and RFC
   §13.4 says the reference is not conformance input. The proposal pins values generated from the
   frozen manifests by a standalone JCS/SHA-256 script and honours `identityRelations: null` for
   F21/F35/F50/F51/F60.
4. **The F52/F61 rationale is wrong even though the classification stands.** Their exit/verdict
   is driven by a trust policy that lowers `fileBytes` (2c), with checks left `NOT_EVALUATED`
   (F52) or a later-phase `PASS` (F61); the verdict is not decided by a check outcome. The
   proposal keeps them identity-only for the correct reason, and corrects the stated reason.
5. **The new file's provenance is not addressed.** "Update the manifest and SHA256SUMS" is
   necessary but not sufficient while `source.commit` remains `c6ee644`; the proposal requires
   source-first regeneration or an explicit bundle-local origin.
6. **The comparison filter should be per case, not a global prefix list.** A global `pap.claim.`
   prefix is unnecessary once F46/F59/F58 are out of full; a per-case applicable-code list is
   exact and avoids silently dropping a code a case requires.

### Open questions / blockers

- **F58 (open):** is claim-file schema/cross-field validation (the `pap.package.claim-invalid`
  failure) Phase 2a? Default: no → identity-only. If yes: add one sentence to `AGENT_BRIEF.md`
  §4.4/§4.2, move F58 to full (20/35/6), add `pap.package.claim-invalid` to its applicable codes,
  and update the identity table. This is a maintainer decision; it is not a blocker for the rest
  of the proposal. The architect review recommends keeping this default (identity-only, 19/36/6);
  that is input to the owner decision, not a recorded decision.
- **Normative status (boundary):** the case set is experiment-scope. If the maintainer wants it
  normative, an RFC amendment is required.
- **Provenance (implementation choice):** source-first is recommended; the bundle-local
  alternative needs a manifest format change. This is not a decision about the case list itself.

---

## D-P2A-3 — F25 archive fixture

### Preliminary position

Recommend **C**: replace F25 with a synthetic case that tests the archive-transport non-goal (a
`.tar` path rejected per §4.1/F25 semantics), restate the fixture shape, confirm that no archive
parsing is implied, and update the manifest/checksums. The preliminary rejects A as restoring "a
real archive.tar" and as inviting implementations to infer archive semantics; it rejects B as
removing a useful negative test.

### Repository evidence

| Claim | Evidence |
|---|---|
| F25 expects `pap.cli.usage`/64 with no report | [`portable-assurance-package-rfc.md` §12.4](../../portable-assurance-package-rfc.md) line 3132: `PACKAGE` is a regular `.tar` file; no document; 64; `pap.cli.usage` |
| v0.1 is directory-only; archive transport is deferred | RFC §4.2 line 428 ("A v0.1 package is a directory"); §14.1 lines 3552–3565 ("Archive transport (tar/zip) ... deferred") |
| The reference maps any non-directory package path to usage/64 | [`pap/src/paths.ts`](../../../../pap/src/paths.ts) lines 99–101 returns `not-directory`; [`pap/src/verify.ts`](../../../../pap/src/verify.ts) lines 127–128 throws `UsageError("pap.cli.usage")`; [`pap/src/cli.ts`](../../../../pap/src/cli.ts) lines 238–240 returns 64 |
| The bundle has no `archive.tar` | bundle `pap/fixtures/pap-v0.1/F25-archive/` contains only `.gitkeep`; `snapshot/manifest.json` line 905 lists only the `.gitkeep`; `snapshot/SHA256SUMS` line 180 lists only the `.gitkeep`; `grep -n archive snapshot/manifest.json snapshot/SHA256SUMS` has no match |
| The source at the frozen commit has `archive.tar` | `git show c6ee644:pap/fixtures/pap-v0.1/archive.tar` is 38 bytes, SHA-256 `81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7`, content `not a tar that a verifier may extract.\n`; the same bytes are on current `main` |
| The bundle's provenance does not declare archive.tar excluded | `snapshot/source-provenance.md` lists excluded implementation source/tests/reports/runtime/config/PR discussions only; a normative fixture is not in that list. The omission is a packaging defect, not a corpus decision |
| The reference probe reproduces the expected behavior | from `F25-archive`, `bun ../../../bin/pap verify ../archive.tar --format json` → exit 64, empty stdout, stderr `pap: pap.cli.usage: package path is not a directory: ../archive.tar` |

### Options

- **A — restore `archive.tar` and keep F25 as published.** Copy the exact 38-byte source sentinel
  into the bundle; add it to `snapshot/manifest.json` and `snapshot/SHA256SUMS`; recompute the
  manifest hash. Consequence: F25 becomes executable exactly as RFC §12.4 defines it; no
  `cases.json`, `AGENT_BRIEF.md` or RFC change; the bundle becomes consistent with its declared
  source commit. The fixture is not a real tar and no archive semantics are implied. Affected:
  the bundle publisher (one file + manifest/sums), implementers (F25 becomes executable),
  existing records (unaffected; they pin the old bundle commit).
- **B — remove F25.** Delete the case from `cases.json` and the RFC §12.4 table. Consequence:
  removes a genuinely useful negative test (regular-file/non-directory rejection); requires a
  normative corpus/RFC change; does not fix the missing source artifact. Affected: every
  `cases.json`/RFC §12.4 consumer and the case authors; the negative test is lost. Not
  recommended.
- **C — synthetic replacement.** If the replacement keeps the same `verify ../archive.tar`
  command and expectation, it is A with a different rationale. If it changes the case id, fixture
  path, command or expected codes, it changes the normative `cases.json` and RFC §12.4 table,
  requires a §12.5 acceptance change, and introduces a bundle-local normative fixture whose
  provenance is unclear. Affected: corpus authors, the RFC §12.4 table, implementers and the
  bundle publisher; the issue authorizes planning only and says not to edit the corpus, so C is a
  broader change than the defect requires. Not recommended.

### Recommendation: A

A is the minimal, source-faithful fix. [`verification.md`](verification.md) §3.1 checks the
source blob, the F25 case metadata and the bundle provenance; §3.2 reproduces the manifest/checksum
update; §3.3 runs the F25 probe against the restored scratch bundle.

- The file at the frozen source commit is a deliberate sentinel, not a real archive. The
  preliminary's A rationale ("restoring a real archive.tar") does not match the repository.
- The bundle's own provenance says the snapshot is an exact copy of the authorized source; the
  missing file is an omission. Restoring it fixes the omission without changing the case.
- F25 stays as published; no RFC, `cases.json`, schema or brief change is needed.
- C is a no-op if it keeps the same fixture/command, or a normative corpus change if it does not.
  The preliminary's concern about "archive semantics" is already addressed by the sentinel content
  and RFC §14.1/brief §5 ("Do not implement archive ... transport").

### Exact update steps

1. Copy `pap/fixtures/pap-v0.1/archive.tar` from `contract-builder` at
   `c6ee64416c91ab56f9d8270114c8f8a8b9d2f608` (identical on current `main`) into the bundle at the
   same path. Expected: 38 bytes, SHA-256
   `81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7`.
2. Add the manifest entry in ascending path order:
   ```json
   {
     "path": "pap/fixtures/pap-v0.1/archive.tar",
     "size": 38,
     "sha256": "81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7"
   }
   ```
   The `files` array becomes 434 entries. The manifest's top-level `format`, `pap_version` and
   `source.commit` do not change: the file is in the source commit.
3. Recompute the manifest's SHA-256 after the edit and replace its line in `snapshot/SHA256SUMS`;
   add the `archive.tar` line in ascending path order. `SHA256SUMS` becomes 435 lines (434 files +
   the manifest).
4. Update any owner-side documentation that states the snapshot file count (the current bundle
   verifier prints it dynamically; the owner-side `tools/README.md` says 433).
5. Run the snapshot verifier: expect `OK: verified 434 snapshot files`, `OK: manifest checksum
   verified`, `OK: checksum inventory matches manifest`.
6. Run the F25 probe from `pap/fixtures/pap-v0.1/F25-archive`:
   `bun ../../../bin/pap verify ../archive.tar --format json` (or the equivalent reference
   invocation). Expect exit 64, empty stdout, stderr starting `pap: pap.cli.usage:`.
7. Confirm no `cases.json`, `AGENT_BRIEF.md`, RFC, schema or other fixture change is in the diff.

For the D-P2A-3-only change, a scratch reproduction produced manifest SHA-256
`b19a710e059b4629021dcbeb9f60a965945ab6d8c2e9cd8873283116af57b169` and verified 434 files. If
D-P2A-2 is also applied, the manifest changes again; recompute after both changes.

### Affected files and who is affected

| File | Change | Owner |
|---|---|---|
| bundle `pap/fixtures/pap-v0.1/archive.tar` | new 38-byte sentinel from the source commit | bundle publisher |
| bundle `snapshot/manifest.json` | one entry; manifest hash changes | bundle publisher |
| bundle `snapshot/SHA256SUMS` | archive.tar line + updated manifest line | bundle publisher |
| `cases.json`, RFC, `AGENT_BRIEF.md`, schemas | no change | — |
| existing experiment records | still valid; they pin the old bundle commit and manifest hash | experiment owner |
| Phase 2a/2c implementers | F25 is executable; no archive parsing is implied | implementers |

### Disagreements with the preliminary position

1. **The premise is false.** The source `archive.tar` is 38 bytes of ASCII text, not a real
   archive. Restoring it does not "drag an archive-shaped fixture into v0.1"; the RFC already
   publishes F25 and the brief already forbids archive transport.
2. **A is smaller than C, not larger.** A changes only the bundle fixture and checksums. C, if it
   changes the case, changes the normative corpus and the RFC §12.4 table, which is outside this
   issue's planning-only boundary.
3. **C's "synthetic case" is either A or a broader change.** Keeping `verify ../archive.tar` and
   the expected `pap.cli.usage` is A; changing the path/expectation is a new corpus decision that
   should not be smuggled in under a fixture fix.
4. **B is correctly rejected.** The proposal agrees.

### Open questions / blockers

None for option A. If the maintainer wants to remove the `.tar` suffix from the test, that is a
separate corpus-change decision (C) requiring a §12.5/RFC §12.4 change; it is not needed to make
F25 executable and is not recommended here.

---

## Cross-decision effects

- **D-P2A-1 and D-P2A-2.** The checker identity is provenance, not a comparison field: RFC §13.6
  excludes `verifier`, `checkerIdentity` and per-check checker identity, and the case set excludes
  them. D-P2A-1 does not add a case; it makes the experiment record auditable.
- **D-P2A-2 and D-P2A-3.** Fixing F25 does not move it into the Phase 2a outcome set: it remains a
  Phase 2c CLI case. The combined bundle change adds two files (archive.tar + cases-phase2a.json):
  435 snapshot files and 436 `SHA256SUMS` lines. The case set's provenance fields and the
  manifest hash must be updated after both changes.
- **F58 conditional.** If F58 moves to full, the counts are 20 full / 35 identity / 6 excluded;
  the full table adds F58 with `pap.package.claim-invalid`; the identity table removes it; the
  brief needs one sentence declaring claim validation Phase 2a. No other case changes.
- **Existing runs.** Old experiment records pin the old bundle commit and manifest hash and remain
  valid. New runs record the new bundle commit, the new manifest hash and the case-set version.
  The `prepare_blind_run.py` "starting commit" is the bundle repository commit; it must not be
  rewritten after preparation.

## Decision-ready summary

| Decision | Recommendation | RFC change? | Open question |
|---|---|---|---|
| D-P2A-1 | A, with the complete §4.4.1 recipe and record fields | No | None |
| D-P2A-2 | A, separate `cases-phase2a.json`, proposed default 19/36/6 (20/35/6 if F58 is Phase 2a), experiment-scope, source-first provenance; F58 is pending | No for experiment scope; yes if it is made normative | F58 scope |
| D-P2A-3 | A, restore the 38-byte source sentinel and update manifest/checksums | No | None |

**D-P2A-2 provenance is part of the decision.** The recommended source-first option adds
`cases-phase2a.json` to `contract-builder` and regenerates the bundle from a new source commit;
`snapshot/manifest.json` `source.commit` moves from `c6ee644` to that new commit. The bundle-local
alternative keeps `c6ee644` but requires a `bundle_local` manifest extension and a verifier change.
The owner should record which provenance model is accepted as part of D-P2A-2.

The maintainer remains the decision owner. This proposal records no accepted decision and starts
no implementation.
