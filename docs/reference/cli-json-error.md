# CLI `--json` error document

`bun spec/build.ts --json` writes exactly one JSON document to stdout on every terminal path of a
build or check invocation. A build that starts returns the usual build-result object (`mode`,
`exitCode`, `blockedBy`, `written`, `output`, `identity`, `diagnostics`). When the CLI cannot
produce a build result it writes this error document instead:

```json
{
  "kind": "error",
  "exitCode": 1,
  "error": {
    "code": "core.cli.internal-error",
    "message": "An unexpected error stopped the build: <detail>"
  }
}
```

- `kind` is always `"error"`. It distinguishes the document from a build result, which has no
  `kind` field.
- `exitCode` is `1`.
- `error.code` is a stable machine identifier for the failure class.
- `error.message` is localized in the run's `--locale` (`en` by default) and never contains a
  stack trace.
- The document is the only JSON written to stdout; human framing and diagnostics are not mixed
  into it.

The error document deliberately carries none of the build-result fields. It never fabricates
`mode`, `blockedBy`, `diagnostics`, `identity`, `output` or `written`, because the CLI did not
run a build to completion; a consumer that needs those fields must not treat this document as a
result.

## Error codes

| Code | When |
|---|---|
| `core.cli.internal-error` | An unexpected error escaped the build pipeline. The CLI reports the same one-line message on stderr, without `--json`, instead of a stack trace. The diagnostic registry records this code. |
| `cli.usage` | The command line could not be parsed: unknown argument, invalid mode or locale, or a flag missing its value. |
| `cli.engine-preflight` | The engine root or engine version could not be validated before a build started. The message is the engine diagnostic report. |
| `cli.renderer-load-failed` | The consumer-supplied renderer module could not be imported. The message carries the real import error. |

The last three are CLI-level configuration failures, not engine diagnostics, so they are not
listed in the diagnostic-code registry.

## Profile hooks are a build result, not an error document

A profile hook that throws — `view.buildView`, `validator.validate`,
`validator.verifyProvenance` or a source adapter's `verifyQuote` — does not reach the CLI safety
net. The engine converts the thrown value into the `core.profile.hook-failed` diagnostic and
returns a normal build result with exit code 1. In `--json` mode that result carries the
diagnostic; in human mode the CLI prints it and no stack trace. A valid build is unaffected: the
existing CORE-001 and CORE-000 artifacts stay byte-identical.

The provenance catch encloses only the `validator.verifyProvenance` call. Its return value is
profile-supplied data, so a non-array return or a claim that is not an object with a non-empty
`entityId` is classified as profile misbehaviour (`core.profile.hook-failed`) before the engine's
`applyVerificationClaims` pass runs outside the catch. `resolveFindings` keeps its own catch: it
consumes the profile-returned finding list, so a throw while resolving a malformed list is
conservatively attributed to the validator, and an engine bug in the resolver would land in that
same tier. That is a deliberate attribution limit.

## Classification tiers and attribution limits

The codes above are one tier of a three-tier classification:

1. **CLI configuration failures** (`cli.usage`, `cli.engine-preflight`,
   `cli.renderer-load-failed`). No build result exists, so the error document is the only
   output.
2. **Build-result diagnostics.** Once `runBuild` starts, every expected failure becomes a
   diagnostic on a normal result, including the four guarded profile calls above.
3. **Unexpected escape** (`core.cli.internal-error`). Anything that reaches the CLI safety net
   lands here. This tier also covers profile-supplied executable surface read outside the four
   guarded calls — for example a throwing `renderer.closure` getter while the build identity is
   computed. The build still fails closed, but that failure is deliberately not attributed to a
   profile hook; the tiers stay distinct instead of guessing an owner.

`verifyQuote` has one further attribution limit. The adapter contract returns only `found`,
`outside`, `unsupported` or `unknown-locator`; when an adapter throws, the engine records
`core.profile.hook-failed` with the real cause and returns the `unknown-locator` sentinel so the
profile's `verifyProvenance` pass can finish. A provenance validator may therefore see
"couldn't locate" for a real adapter throw, but the blocking diagnostic is already on the result
and the build cannot pass. A distinct sentinel would change the `SourceAdapter` contract, so that
change is deferred.

## Final output write

The final `mkdir`/`writeFile` for the artifact is guarded. An OS-level failure there — a
read-only target, a path component that is not a directory, a full disk — is an expected I/O
failure, not an internal crash: the engine records the blocking `ERR_IO` diagnostic
(`ERR_IO#output-write-failed`) on a normal build result with `written: false` and exit code 1.
In `--json` mode that result is the document on stdout, not an error document.

## Human mode

Without `--json`, each failure above writes its localized message to stderr and exits 1. An
argument error also prints the usage line; an engine preflight failure prints the diagnostic
report. No path prints a stack trace. `--help` is the one exception to the JSON rule: it always
prints the human usage text, because the caller explicitly asked for it.

## Relationship to the engine contract

`docs/architecture/engine-public-contract.md` §10 describes the M2 CLI contract surface and says
`--json` emits the build or validation result only. This page records the M1 fail-closed
extension: when no result exists, the error document is the only stdout output. The contract file
is intentionally unchanged in the CB-285 pull request because the CORE-000 self-contract embeds
its digest and the ticket requires the committed CORE-001 and CORE-000 artifacts to stay
byte-identical.
