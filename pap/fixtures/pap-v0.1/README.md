# PAP v0.1 conformance corpus

This directory is the static corpus from RFC §12. Each `F<NN>-<slug>/` directory
is a complete package copy, except CLI-only variations (such as `F42`)
whose directory is empty and whose command targets `../base`; nothing is generated
or mutated at test time.

- `base/` — the Appendix F package. Its package identity, artifact/source/quote,
  input and claim digests are the Appendix E.1/E.2 literals.
- `F01-…`–`F85-…` — one package per normative case. A case differs from `base/`
  only in the defect or variation it names. `F62` and later cover the diagnostic
  codes the original corpus never asserted; `F81`–`F85` pin the S3 derivation
  and hostile-input boundaries.
- `trust-policy/` — the fixed Appendix B policies. `invalid.json` is intentionally
  schema-invalid; `relations-only-lowered.json` is the F61 policy. The
  `*-underdeclared.json` policies omit the dimensions their feature derives, so
  the corpus proves I1/E2 derivation rather than operator duplication;
  `strict-enum.json` is the non-string `signature.mode` fail-closed fixture.
- `signatures/` — shared DSSE envelopes. The keys are test fixtures; no private
  key is committed. `trusted.dsse.json` and `unknown.dsse.json` are signed over
  the base canonical manifest; `invalid.dsse.json` has one corrupted signature.
- `cases.json` — the case index consumed by
  `pap/tests/conformance.test.ts`. PASS cases and the F62+ cases assert their
  complete diagnostic code set (`diagnosticCodesExact`); F02-F05 keep the
  RFC-mandated subset because `pap.claims.producer-mismatch` is MAY-level.
  No-report cases assert the exact exit code and stderr code set.
- `requirements.json` — the machine-readable map from every emitted diagnostic
  code and every RFC requirement R1-R12 to its cases, plus the `verdictCause`
  map and its documented degenerate exceptions (ODR-PAP-006 A6, design note
  §2 I5/I6). `pap/tests/requirements.test.ts` fails when a code or requirement
  is uncovered; `pap/tests/conformance.test.ts` checks the I5 correlation on the
  reports it emits.

Run the corpus:

```bash
bun test pap/tests/conformance.test.ts
```

The harness runs each `command` (argv after `pap`) with the case directory as cwd,
a fixed `--now`, a hostile `TZ`/`LC_ALL`, a producer-free `PATH` with sentinel
`bun`/`node`/`contract-builder` shims, and asserts the projection in
`cases.json`: exit code, verdict, constrained dimensions, check outcomes,
diagnostic and limitation code sets, coverage, effective limits, identity
relations, Appendix C schema validity, JCS bytes and deterministic reruns.

## Limit cases

`F52` and `F61` exercise `fileBytes: 64`. Files under `artifacts/`, `sources/` and
`inputs/` are bounded by `fileBytes`/`totalPayloadBytes`/`payloadFiles`; claim
files are bounded by the JSON document limits. A limit that makes a required
check unevaluable stops the required check set; optional checks that do not need
the limited class may still run. No limit can produce `PASS`: both cases are
`INCOMPLETE` with `coverage.full: false`.

## Matrix note

`F46` and `F59` complete a failing relation check and therefore report
`coverage.full: true`: RFC §7.5 counts an evaluated `FAIL` as evaluated. This was
confirmed by the maintainer on PR #64 and the RFC matrix rows were updated to
match; the verdict remains `FAIL`.
