# Pipeline evidence — C6 independent verification

**Status:** evidence record for C6 ([#216](https://github.com/agent-federation/contract-builder/issues/216)), part of the
end-to-end SDLC pipeline stream C ([#170](https://github.com/agent-federation/contract-builder/issues/170)). This is the
required comparison record, not a certification, a gate decision or a claim of semantic truth.

## 1. Run provenance

| Field | Value |
|---|---|
| Contract-builder run commit | [`542052d781edc92e2583f7bd0e47f596aa7c19f4`](https://github.com/agent-federation/contract-builder/commit/542052d781edc92e2583f7bd0e47f596aa7c19f4) |
| Pinned `--now` | `2026-11-06T00:00:00Z` |
| Trust policy | `policy-core000-unsigned-2026-11` |
| Trust-policy path used by all four runs | Run-local copy of `pipeline/policy/core000-trust-policy.json` (identical bytes; the same absolute path for all four runs; retained in `batch.json`) |
| Trust-policy digest (verifier-reported) | `e7dc5f2928ef0cf0825dbaf4384ed32a26a342d71f16a1a33e1b998ee65cda58` |
| Independent-verifier provenance | [`agent-federation/blind-lab@e5da9ac404547579d184d2f47d33c1e1ac866495`](https://github.com/agent-federation/blind-lab/commit/e5da9ac404547579d184d2f47d33c1e1ac866495) ([PR #42](https://github.com/agent-federation/blind-lab/pull/42)) |
| Provenance handoff | `audit/c6-independent-2026-11-07` |
| Input protection | Package tree and run-local policy copy made read-only during verifier execution and re-hashed after every verifier; any mutation is a problem and fails the batch (`inputIntegrity` in `batch.json`). |
| Machine-readable batch | The CI job retains its own run's `batch.json` and reports as the `pipeline-independent-evidence` artifact (90 days). The values in this record are from the run commit above, not from that artifact. |

The three independent implementations are the blind-lab Gate 3 Phase 2a set. This run
builds them from their pinned public commit archives, verifies each archive's SHA-256
before extraction and asserts each report's self-reported `implementationDigest`. The
blind-lab handoff reports are provenance, not the source of truth.

## 2. Package under test

| Field | Value |
|---|---|
| `packageIdentity` | `sha256:57280f75156896cb899981a4d5455f3a6bc761f4f07bfb0ebcf4a80268339bbb` |
| Manifest SHA-256 (`assurance-package.json`) | `339d40a6502a66471212fb746e4a86bef74c91695ca069294c9a6d5610e142e6` |
| PAP version | `0.1` |
| Build `engineVersion` | `0.1.0` |
| Build `manifestVersion` | `0.1` |
| Build `inputDigest` | `sha256:971b95db2a37658035f2daf2aa9deeaa7acdfec1fa29a64a1e02bee85d5acbf6` |
| Build `normalizedInputDigest` | `sha256:1db33846e31cd3d181792c0a4086a819754276eeeff606f9412179efa179b593` |
| Packaged artifact digest | `sha256:85e3974e59261b0a8ff34aaf74c602b4c091e2b9313836ee236c3248b38e97dc` |
| Packaged source digest | `sha256:4c972c324fd037599d843f0bdebbd670a1fbff944b5fd3f11c9511f42b4f8876` |
| Packaged files | 8 (listed in the retained `batch.json`) |

**Commit binding.** `packageIdentity` is commit-bound: the manifest's
`sources[].acquisition.revision` is the packing checkout's git HEAD, so the identity
above is valid for `542052d781edc92e2583f7bd0e47f596aa7c19f4` only. A CI run packs its own
checkout (on a pull request, the merge commit) and therefore records a different
identity. The evidence pin is the run commit stated here, not a constant.

## 3. Verifier identities and verdicts

| Verifier | id | version | implementationDigest | verdict | exit | report SHA-256 |
|---|---|---|---|---|---|---|
| reference | pap.verifier.reference | 0.1.0 | `sha256:fc9478c781922d37458efc7f2aef8e5fcb4d38d3e74a94778790a6db40a5081e` | PASS | 0 | `b42392158e6bf99df01a6872a2f5b641ad843604d2f6dbe0e10e48ebaee550ed` |
| rust | pap.verifier.rust | 0.1.0 | `sha256:e5d6ab21a1ea94d17e0ed60f1873ca622db03b2fac70ebda0f172f24c4c1454d` | UNSUPPORTED | 4 | `9256c7c36c812a40632c88cbe0d5b457b5c753bc0b14dac1766aeef6b01121fc` |
| go | pap.verifier.go | 0.1.0 | `sha256:f386a6f8712bdb290be2b272d93bc70bfb589d6c4289bfbd9044b2b118c7dc14` | UNSUPPORTED | 4 | `b00a21010a428e048f74d561f8e1230c29e81859692890f69aea795e39a0c3b6` |
| python | pap.verifier.python | 0.1.0 | `sha256:367c40ff74b93d34b927485035000cbeb465f8e4ebcde8cd85c61743efd41393` | UNSUPPORTED | 4 | `cd2d341202965ca236c78a8452ce9b5045e4eb2bdfb9ee860ca88301ce3fa76e` |

### Pinned independent sources

| Verifier | Repository | Commit | Tag | Archive SHA-256 | Build |
|---|---|---|---|---|---|
| rust | `agent-federation/contract-builder-independent-rs-v2` | `0b31dac728fbfdfab4f2948ccede3b5957b17fc9` | `pap-rs-p2a-003-result` | `0539d883aed7a07fe19a3e83187c6a172daf1e4a7637231de6c64339a0f33b68` | `cargo build --release --offline` |
| go | `agent-federation/contract-builder-independent-go-v2` | `8d49d694ce9e3b081959f5325bc6a9972f7708de` | `pap-go-p2a-003-result` | `ccafd542b66024b6f64137ebd9af34d3d4a3965dd034f668f7c85a9b163cedbb` | `go build -o pap .` |
| python | `agent-federation/contract-builder-independent-py-v2` | `58f368cd9b46d88e20e6cd26f9169c65a807fc4b` | `pap-py-p2a-003-result` | `ad1d3326aec39edc255d1fbdd71e39a116454d9a6fd56302d9a7abb756522140` | `none (Python standard library; run from the extracted tree)` |

Each archive is checked against the recorded SHA-256 before extraction, including a
cached archive; the self-reported `implementationDigest` above is a second pin.

An `UNSUPPORTED` verdict (exit 4) means the verifier executed and retained a report;
it does **not** mean PASS. A report's verdict is never rewritten or converted here.

## 4. Dimension and check matrix

| Dimension / required check | reference | rust | go | python |
|---|---|---|---|---|
| `integrity.package` | PASS | PASS | PASS | PASS |
| `integrity.artifacts` | PASS | PASS | PASS | PASS |
| `sources.availability` | PASS | PASS | PASS | PASS |
| `sources.integrity` | PASS | PASS | PASS | PASS |
| `trust.policyDecision` | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED | NOT_EVALUATED |
| `verdict` | PASS | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |
| `pap.check.digest-integrity/1` | PASS | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |
| `pap.check.source-quote/1` | PASS | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |
| `pap.check.relation-consistency/1` | PASS | UNSUPPORTED | UNSUPPORTED | UNSUPPORTED |

The reference verifier evaluates all three required checks. The three independent
implementations are PAP v0.1 **Phase 2a** only (walker, manifest schema, JCS, digests,
report and exit codes); the three required check implementations are **Phase 2b**, which
is out of scope for this evidence record. The independent verdict is therefore
`UNSUPPORTED`; the package/artifact/source integrity and availability dimensions still
agree with the reference on the same package bytes.

## 5. Differences and limitations

- The independent runs agree with the reference on packageIdentity and on package/artifact/source integrity and source availability; they do not evaluate the CORE-000 required checks, which are Phase 2b scope and out of scope for C6.
- The package is commit-bound: packageIdentity includes sources[].acquisition.revision, the packing checkout's git HEAD. Re-running from another commit, including the CI merge commit, produces a different identity.
- Verifier reports carry absolute package and policy paths, so the report SHA-256 values are path-dependent. The hashes in this batch are for the recorded run paths; CI regenerates them for its own checkout.
- All three independent implementations were produced in blind-lab by one owner/harness (two model families). This supports implementation independence, not team independence (the Gate 3 caveat).
- No CORE-000 claim is promoted to independently_verified; H3 is executed-not-evaluated for the Phase 2b checks.

### Recorded differences

- The reference verifier evaluates the three required checks and reports PASS (exit 0).
- The three independent implementations implement PAP v0.1 Phase 2a only: the three required checks are UNSUPPORTED (exit 4), so their verdict is UNSUPPORTED and never PASS.

### Path-dependent hashes

Verifier reports include the absolute `package.path` and `policy.path`, so the report
SHA-256 values in section 3 depend on the run directory. They are hashes of the reports
produced by the run recorded in section 1. The raw reports are not committed because they
carry those absolute paths; this record pins their hashes instead. The CI job retains a
separate run's reports for 90 days; that run packs its own commit, so its identity and
report hashes differ from this record and from any other checkout.

### Report retention

The report hashes above are the permanent pin for the recorded run. The raw reports and
`batch.json` for a CI run are retained only as the 90-day `pipeline-independent-evidence`
artifact. Neither the committed hashes nor the artifact is portable to another checkout:
both the run commit and the absolute paths change.

## 6. Reproduce

```bash
bun install --frozen-lockfile
bun run pipeline:independent --out "$RUNNER_TEMP/pipeline-independent" \
  --now 2026-11-06T00:00:00Z
```

The `pipeline-independent` CI job runs this command on every pull request. It is a
separate, non-blocking job: it is not a required status and does not gate the reference
`pipeline` job. It uploads `batch.json`, the four reports and the package manifest for
90 days. A missing report, an unparseable report, a pinned-identity mismatch, a
`packageIdentity` disagreement or an input mutation fails the job explicitly.

## 7. What this does and does not establish

- It establishes that the reference and the three independent Phase 2a verifiers
  executed against the same CORE-000 package bytes, with one pinned `--now` and one
  absolute trust-policy path, and that all four agree on `packageIdentity` and on
  package/artifact/source integrity and availability.
- `UNSUPPORTED` is a recorded, executed result. It is not PASS, and no CORE-000 claim
  is promoted to `independently_verified` by this record.
- The runner copies the policy into the run directory, makes the package tree and policy
  copy read-only, and re-hashes both after every verifier. A verifier that mutates packaged
  bytes or the policy makes the batch fail closed and stops the remaining runs; the mutation
  diagnostics are retained in `batch.json`.
- Phase 2b check implementations, cross-environment reproducibility (H2), signing,
  semantic truth and team independence are out of scope.
