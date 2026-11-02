# Build identity

This document records the M1 build-identity implementation added by PR 6. It describes the
authoritative `inputDigest`, the extension closures it covers, and the exact byte framing used
before SHA-256. The accepted boundary is contract §8.1; the M1 shape is plan §11.

The digest is a deterministic fingerprint, not a proof. It does not establish correctness,
security, hermeticity or trustworthiness, and it does not make a trusted extension
deterministic.

## Public result

`BuildResult.identity` has the accepted shape:

```ts
interface BuildIdentity {
  projectId: string;
  engineVersion: string;
  manifestVersion: string;
  inputDigest: string; // "sha256:<hex>"
  extensions: Array<{ kind: "profile" | "adapter" | "renderer"; id: string; version: string }>;
}
```

`identity` is computed after the project has loaded and validated; it is `null` when the build
stops before identity can be computed. It is never rendered into an artifact. `--json` exposes
it; human CLI output is unchanged.

`engineVersion` is the `version` field of the repository `package.json`. No version string is
duplicated in the engine.

## Digest input boundary

`inputDigest` is SHA-256 over the following records, in this order:

1. `manifest` — the validated manifest as canonical JSON.
2. `input` — one record per loaded declared input, in manifest order:
   `{ declared path, LF-normalized bytes }`. An absent optional input contributes no record.
3. `source` — one record per loaded source document, in manifest order:
   `{ source id, adapter id, normalized bytes }`.
4. `profile` — `{ profile id, profile version, profileDigest }`, where `profileDigest` is the
   profile extension closure digest.
5. `adapter` — one record per distinct adapter used, sorted by id:
   `{ id, version, closureDigest }`.
6. `renderer` — the renderer used, sorted by id (M1 uses one):
   `{ id, version, closureDigest }`.

Excluded from the digest: clock, locale, environment variables, absolute project root, file
mtimes, user identity, network state and artifact bytes. The artifact is excluded because the
identity describes inputs, not output.

### Canonical manifest

The manifest object is JSON with object keys sorted recursively by Unicode code point. Arrays
keep their declared order — `inputs`, `sources`, `render`, `entities`, and every other array is
semantically ordered and is never sorted. Optional absent properties are omitted; `external:
true` participates because the loader preserves it. Declared paths are kept manifest-relative;
the project root itself is not inserted.

Declared input paths in digest records use POSIX separators and lose a leading `./`. Source
paths stay in the canonical manifest as declared.

### Text and binary bytes

- Declared inputs (JSON and YAML in M1) are text: UTF-8 bytes are decoded and `CRLF`/`CR` are
  normalized to `LF`.
- Source documents follow the same rule when their bytes decode as UTF-8 and contain no NUL
  byte. Bytes that are not valid UTF-8, or that contain NUL, are hashed raw; this is the M1
  binary fallback.
- Declared extension files are text and are LF-normalized.
- Normalization means `LF` and `CRLF` spellings of the same text produce the same digest. Every
  other byte change still moves it.

## Byte framing

Every component is one typed, length-prefixed record. A record is:

```text
u32 BE tag byte length
tag bytes (UTF-8)
u32 BE part count
for each part:
  u32 BE part byte length
  part bytes
```

A record family starts with a fixed ASCII envelope:

- `contract-builder/input-digest/v1\n`
- `contract-builder/extension-closure/v1\n`

The length prefixes make concatenation unambiguous: parts cannot merge across boundaries and
a record cannot absorb the next record. A test covers the ambiguous-concatenation case.

## Extension closures

An extension is identified by `{ id, version, closureDigest }`. The declaration location is:

- **Profile** — `profiles/core001/profile.json` `files: string[]` and
  `dependencies: Record<string, string>`, resolved against the profile directory.
- **Source adapter and renderer** — their optional `closure` field:
  `{ root, files, dependencies }`. `root` is an absolute locator that is never hashed. The
  core cannot discover the module layout of a consumer-supplied extension object, so the
  extension declares it.

`closureDigest` covers:

- every declared file, sorted by normalized relative path, with LF-normalized bytes;
- every package in the declared direct dependencies' complete lockfile closure, sorted by name
  and then version, recorded as `{ name, exact version, integrity }`.

`profileDigest` is the profile closure digest, so a change to any profile file, the hook, the
renderer files owned by the profile, or a relevant pinned dependency changes it.

### Dependency closure

`bun.lock` is the authority for the resolved tree. Declared direct dependencies must name the
exact locked version; a missing package, a version mismatch, a missing integrity, or an
ambiguous transitive resolution is `core.extension.unpinned-dependency` and fails the build.
The lockfile reader accepts bun's JSON-with-comments/trailing-commas format.

M1 resolves a transitive dependency by name when the lockfile contains one candidate, or by
exact version when the range is an exact version. Multiple candidate versions for a range are
reported as unpinned rather than guessed.

### Static import scan

Declared `.ts`/`.tsx`/`.mts`/`.cts` files are scanned for:

- static `import`/`export ... from` specifiers;
- literal `import("...")` specifiers.

Type-only imports are ignored. A bare package import must appear in the extension's declared
`dependencies`; a relative import inside the extension root must resolve to a declared file.
An import that leaves the extension root is accepted only when it resolves inside the engine
source directory, `spec/lib` (covered by `engineVersion`). Any other outside path is
`core.extension.unpinned-dependency`, so a project file cannot silently escape digest coverage.

The scanner is lexical: it skips comments, string literals, template literals and regex
literals before matching statements, so text such as `"import "` inside another string is not a
statement. Template text is ignored, while literal dynamic imports inside `${...}` expressions
are still scanned (expressions are not evaluated). Regex-versus-division is decided by the
previous token; a regex statement directly after `)` is treated as division.

This scan is a guard, not a sandbox. It does not see computed specifiers (`import(name)`),
`createRequire`, `process.binding`, or runtime access to files, network, clocks or environment.
Those remain profile-author obligations under the accepted trust boundary.

## Ordering rules

- Object keys in the manifest: sorted by code point.
- Manifest arrays: declared order, never sorted.
- Extension files: sorted by normalized relative path.
- Dependency records: sorted by name, then version.
- Adapters and renderers: sorted by id.
- Text normalization and digest input: no locale, clock or filesystem traversal order.

## Revert procedure

Revert the PR 6 commit. That removes `spec/lib/identity.ts`, the `identity` field from
`BuildResult`, the closure declarations in `profile.json`, the adapter and renderer objects, and
the identity tests. Existing build, CLI, diagnostics and artifact behavior are untouched, so
the revert does not need a data migration.
