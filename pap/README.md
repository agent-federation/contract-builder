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

The implementation does not establish Gate 3. Gate 3 still requires a separately
implemented checker compared field-by-field against the same corpus under the
same tier.

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
- required diagnostic and limitation code sets;
- coverage and package-identity relations;
- Appendix C schema validity of every verify report;
- JCS-canonical stdout and deterministic repeated output;
- the required text lines for a `PASS` and a `FAIL` case;
- that the sentinel shims were never executed.

`fixtures/vectors/e4-identity-form.json` is the Appendix E.4 identity form used by
the record-identity and E.10 mutation tests.

## Fixture corpus

`fixtures/pap-v0.1/` is the static corpus described by RFC §12:

- `base/` — the Appendix F package, byte-identical to the E.1/E.2 vectors;
- `F01-…` through `F61-…` — one complete static package copy per case;
- `trust-policy/` — the fixed Appendix B policy fixtures, including
  `relations-only-lowered.json` for F61;
- `signatures/` — the shared trusted, unknown-key and corrupted DSSE envelopes;
- `cases.json` — the generic projection-and-compare case index.

`F52` and `F61` use the verifier's limit interpretation: files under
`artifacts/`, `sources/` and `inputs/` are bounded by `fileBytes` and
`totalPayloadBytes`; claim files are bounded by the JSON limits. A limit that
makes a required check unevaluable stops the required check set; optional checks
that do not need the limited class may still run. In both cases the verdict is
`INCOMPLETE`, `coverage.full` is `false`, and no limit can produce `PASS`.

The RFC matrix lists `coverage.full: false` for F46/F59 even though both cases
have a completed, failing relation check. RFC §7.5 defines `full` as "every
required check was evaluated", and a `FAIL` is evaluated, so this implementation
reports `true` for those two cases and records the discrepancy in
`docs/architecture/pap-v0.1-implementation-report.md`.

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
