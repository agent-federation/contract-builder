# PAP v0.1 verifier

This directory contains the independent verifier for **Portable Assurance Package
v0.1**, specified by
[`docs/architecture/portable-assurance-package-rfc.md`](../docs/architecture/portable-assurance-package-rfc.md)
and accepted in issue #62. The implementation is **Tier B**: the Tier A core plus
the optional DSSE/Ed25519 adapter. The in-toto mapping is not implemented.

The verifier is a separate product boundary inside this repository:

- it imports only `node:` built-ins and its own modules under `pap/src/`;
- it never imports `spec/`, `profiles/`, a renderer or a producer runtime;
- it never renders Markdown, executes package-supplied code, opens a network
  socket or reads unlisted files;
- package content is hostile data: paths are validated before any filesystem
  call, symlinks and non-regular files are rejected, and resource limits are
  enforced while reading.

Gate 3 is **PASSED for PAP Phase 2a** (2026-11-04): separately implemented
checkers agree field-by-field on the frozen Phase 2a case set. See
[`ODR-PAP-005`](../docs/decisions/ODR-PAP-005-gate-3-closure-phase-2a.md) for the
scope and caveats; this implementation remains the reference described below.

**Packaging boundary.** RFC §9.1 requires the verifier to be a separate project
with its own release and pinned artifacts. The physical split is **deferred, not
abandoned**: [`ODR-PAP-007`](../docs/decisions/ODR-PAP-007-pap-verifier-packaging.md)
records the decision and the three trigger conditions that must all hold before
it starts — Phase 2b/2c check stability with independent C6 evidence, a D1
release model that can publish a versioned checksummed artifact with reproducible
builds, and maintainer authorization. Until then `pap/` is an enforced in-repo
product boundary and the root `package.json` exposes `pap` as a development
script/bin only. This is a recorded non-conformance with RFC §9.1, not a
conforming standalone release: no per-platform artifact, published checksum or
separate release channel is provided here.

## Commands

From the repository root:

```bash
# run the CLI directly (the package script)
bun run pap -- verify <PACKAGE> --format json --now 2026-11-02T00:00:00Z

# or use the executable entry point
bun pap/bin/pap verify <PACKAGE> --format text

bun run pap -- inspect <PACKAGE>
bun run pap -- explain <PACKAGE> --check pap.check.digest-integrity/1
bun run pap -- --version
bun run pap -- --help
```

The CLI contract is RFC §9: `verify`, `inspect`, `explain`; exit codes
`0/1/2/3/4` for the verdict and `64/70/74` for usage, internal and I/O failures.
`--format json` writes exactly one JCS document plus one LF to stdout. A report
run writes nothing to stderr.

**Timestamp grammar.** `--now` and every timestamp the verifier compares use PAP
v0.1's own grammar: an uppercase `T`, 1–9 fractional digits, an offset that is
uppercase `Z` or numeric `±HH:MM`, and no leap seconds. This is an intentional PAP
restriction, stricter than RFC 3339, which also permits lowercase `t`/`z`. Lowercase
input is rejected rather than normalised: an unparsable `--now` is a usage error
(64), an invalid policy fails closed (64, no report), and a package timestamp is
invalid package input. The pipeline gate applies the same grammar when it
re-derives policy freshness.

**Signature report order.** `dimensions.signature.signatures[]` is ordered by
`path` then `keyId` (RFC §9.9). An entry whose envelope signature has a missing
or empty `keyId` has no key to compare and sorts after every named key at the
same path.

## Tests

```bash
bun test pap/tests          # PAP vectors, conformance corpus, hostile input, CLI
bun run pap:test            # same command
bun run typecheck           # includes pap/**/*.ts
bun test                    # the repository suite plus the PAP suite
```

The conformance harness runs every case in `fixtures/pap-v0.1/cases.json` twice
with a fixed `--now`, a hostile `TZ`/`LC_ALL`, a producer-free `PATH` with
sentinel `bun`/`node`/`contract-builder` shims, and asserts:

- exit code, verdict, constrained dimensions, check outcomes and effective limits;
- required diagnostic and limitation code sets, with PASS and extended-corpus
  cases asserting the complete diagnostic set exactly;
- coverage and package-identity relations;
- Appendix C schema validity of every verify report;
- JCS-canonical stdout and deterministic repeated output;
- the required text lines for a `PASS` and a `FAIL` case;
- that the sentinel shims were never executed.

Payload hashing is streamed: artifacts and inputs are never buffered in full,
source bytes are retained only as bounded quoted ranges, signature discovery and
undeclared-file scanning are entry/depth-bounded, and each check has an aggregate
16 MiB serialized-witness budget. A §4.3.4 resource-limit stop is `NOT_EVALUATED`
with `pap.package.limit-exceeded`, never `PASS`; a private scan entry/depth budget
stop is the §4.3.3 `pap.package.undeclared-scan-incomplete` condition instead.

`fixtures/vectors/e4-identity-form.json` is the Appendix E.4 identity form used by
the record-identity and E.10 mutation tests.

## Fixture corpus

`fixtures/pap-v0.1/` is the static corpus described by RFC §12:

- `base/` — the Appendix F package, byte-identical to the E.1/E.2 vectors;
- `F01-…` through `F85-…` — one static package copy per case (empty directory
  for CLI-only variations that target `../base`). `F64` is intentionally absent:
  the IDs are stable labels, not a dense sequence, so 84 directories cover
  `F01–F63` and `F65–F85`;
- `trust-policy/` — the fixed Appendix B policy fixtures, including
  `relations-only-lowered.json` for F61 and the `*-underdeclared.json` policies
  that prove I1/E2 derivation;
- `signatures/` — the shared trusted, unknown-key and corrupted DSSE envelopes;
- `cases.json` — the generic projection-and-compare case index;
- `requirements.json` — the code/requirement/verdict-cause map validated by
  `pap/tests/requirements.test.ts`.

`F52` and `F61` use the verifier's limit interpretation: files under
`artifacts/`, `sources/` and `inputs/` are bounded by `fileBytes` and
`totalPayloadBytes`; claim files are bounded by the JSON limits. A limit that
makes a required check unevaluable stops the required check set; optional checks
that do not need the limited class may still run. In both cases the verdict is
`INCOMPLETE`, `coverage.full` is `false`, and no limit can produce `PASS`.

RFC §7.5 defines `coverage.full` as "every required check was evaluated", and a
completed `FAIL` is an evaluated check. F46/F59 therefore report `full: true`
with a `FAIL` verdict; the maintainer confirmed this on PR #64 and the RFC
matrix rows now say `true`.

## Implemented and deferred

Implemented: directory parsing and path/limit safety; Appendix A manifest and
Appendix D claim validation; I-JSON/JCS; all §5 identities; the three §8 checks
with records and witnesses; Appendix B policy parsing, freshness, recognition and
human-review evidence; DSSE/Ed25519; `verify`, `inspect`, `explain`; deterministic
JSON and text output; Appendix C report schema.

Deferred by the accepted v0.1 contract: archive/OCI transport, Sigstore/SCITT,
online revocation, signed human-review approvals, the in-toto adapter, multiple
digest algorithms, and full text-layout standardization. The verifier also does
not claim semantic truth, legal enforceability, signer authority, source
authenticity or build reproducibility.
