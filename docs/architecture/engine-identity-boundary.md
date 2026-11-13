# Engine identity and trust boundary — design note (stream B)

**Status:** proposal accepted by [ODR-ENG-001](../decisions/ODR-ENG-001-engine-identity-boundary.md) (2026-11-06).
**Scope:** the contract that ties a build's identity (`inputDigest`, extension identities, `closureDigest`) to the code the engine actually executes and consumes, plus the boundary conditions around profile files, portability, data-only profiles and multiple sources. It does not add sandboxing, a new package format or cross-platform byte-equality guarantees.
**Related:** audit #137, architecture streams B–D #170, the minimal executable-closure fix #145 (PR #158), `engine-public-contract.md` §8, `spec/lib/identity.ts`, `spec/lib/build.ts`.
**Citation baseline:** `path:line` references in this note were read at `703ab7e`, the audit baseline named in §3.

## 1. The guarantee being made precise

A build's identity is `engineVersion` **plus** the authoritative `inputDigest` over declared inputs and extension closures **plus** every executable extension identity `{id, version, closureDigest}` (contract §8.1). `engineVersion` is carried separately by `BuildIdentity` and is part of the determinism condition; it is not folded into `inputDigest`. The engine claims that the same `engineVersion` + `inputDigest` + extension identities imply the same artifact, **conditional on trusted extensions honouring their deterministic contract** (contract §8.1); cache/equality language must use the complete triple, not `inputDigest` alone.

That claim only holds if "what identity covers" equals "what executes and is consumed". The audit found that it did not: the profile's executable modules and other consumed files were not required to be part of `profile.files`, so they could be executed without being hashed or import-scanned (#145). PR #158 closed that hole by requiring the consumed set to be declared and failing closed (`core.extension.unpinned-dependency`) before any profile module is imported (`703ab7e:spec/lib/identity.ts:315-380`, `spec/lib/build.ts:417-450`).

This note fixes the remaining boundary: the contract must be complete, the identity must not depend on where the engine was launched from, and unsupported configurations must be rejected rather than partially processed.

## 2. Current identity map (at `703ab7e`)

| Identity part | Source | Where |
|---|---|---|
| `inputDigest` | canonical manifest bytes, declared inputs (LF-normalized text; raw bytes for binaries), source-adapter closure, renderer closure, profile closure | `computeBuildIdentity` (`703ab7e:spec/lib/identity.ts:425-541`) |
| extension identity | `{id, version, closureDigest}` | `resolveClosure` (`703ab7e:spec/lib/identity.ts:560-610`) |
| profile closure | `profile.files` + `profile.dependencies` resolved against the lockfile | `resolveProfileClosure` (`703ab7e:spec/lib/identity.ts:339`), `requiredProfileFiles` (`703ab7e:spec/lib/identity.ts:315`) |
| lockfile pinning | exact versions + integrity; absent dependency ⇒ `core.extension.unpinned-dependency` | `spec/lib/identity.ts` lockfile resolver |
| import scan | static scan of declared extension files; relative imports must stay inside the extension closure; `ENGINE_SOURCE_ROOT` is the running engine's source directory | `703ab7e:spec/lib/identity.ts:672-720`, root at `703ab7e:spec/lib/identity.ts:74` |

The consumed-file rule (post #158) covers `view`, `validator`, `diagnostics`, every `schemas[*]` entry, and the manifest's `render.template`/`render.labels`.

## 3. Boundary gaps found by the audit (reproduced on `main` `703ab7e`)

### B2 — identity depends on the launch location of the engine

- The import scan treats a relative import as engine-owned only when it resolves inside `ENGINE_SOURCE_ROOT`, the directory of the **running** `spec/lib` (`703ab7e:spec/lib/identity.ts:74`, `703ab7e:spec/lib/identity.ts:697`).
- A project copy (`spec/` + `profiles/` + the source document) built by the engine from another checkout fails with four `core.extension.unpinned-dependency` errors (`renderer.ts` ×2, `slice.ts`, `view.ts`), because its profile imports `../../spec/lib/*.js` resolve against the copy, not the running engine.
- `contracts/core000/run.ts:136` works around this by rewriting profile imports to the repository engine with a regex before building — a text rewrite of source files, not a contract.
- **Consequence:** the same project produces different results (or fails) depending on where the engine is launched; identity is not a property of the declared project alone.

### B3 — the documented data-only profile cannot be built

- `README.md:44` describes a profile that may be purely declarative (schemas, relations, diagnostic catalog, labels and templates as data).
- The consent gate explicitly handles the no-executable-module case (`build.ts:396-410`: `if (executable.length === 0) return true`), but `build.ts:122` and `:147` unconditionally require `view` and `validator`, so a data-only profile fails with `core.profile.invalid profile.json#/view`.
- **Consequence:** a documented architecture branch is dead; the README over-promises and the consent branch creates a false impression of support.

### B4 — multiple sources are silently accepted, only the first is used

- The manifest validator accepts an array of any length (`manifest.ts:375-405`); `build.ts:107` rejects only the empty array.
- **Amended 2026-11-07 (#233):** this observation records the pre-decision state. `validateSources` now rejects `undefined`, `[]` and more than one source with `core.manifest.invalid` during manifest validation (ODR-ENG-001 B4).
- The implementation is mixed: the M1 hook consumes the first source (`build.ts:170-171`), while other build/provenance paths index all `model.sources` by ID; the identity hashes **all** sources (`spec/lib/identity.ts` input-digest frame for sources). Multi-source M1 behaviour is therefore not established — some paths see all sources, the hook sees only the first.
- **Reproduction:** adding a second source with a different document header builds with exit 0 and no diagnostics — the second document is never checked.
- **Consequence:** an unsupported configuration is accepted, the digest covers data the semantics ignore, and a reader can believe both sources were verified.

### B1 — the closure contract is a list, not a contract

The post-#158 check is a hard-coded enumeration (`requiredProfileFiles`). It is correct today, but the contract does not say (a) which profile schema version governs the consumed set, (b) that adding a consumed field requires updating the enumeration, or (c) what "consumed" means for future profile features (e.g. additional catalogs, per-document templates). A future field added to `profile.json`/manifest render but not to the enumeration reopens the gap silently.

## 4. Decisions (recorded in ODR-ENG-001)

- **B1 — Consumed set is part of the profile contract.** The engine enumerates the consumed profile artifacts for the profile-document schema shipped with the engine (the JSON Schema under `profiles/<id>/`; this is not the profile's own `version` field, which names the profile version). Every consumed artifact must be declared in `profile.files` or the build fails closed. Adding a consumed artifact requires a contract/schema update and a test; the engine never silently ignores an undeclared consumed file. **Detection is recursive and path-based:** the contract test walks the profile-document schema (object `properties`, array `items`, and `$defs`/`$ref` after resolution) and collects **full property paths** (e.g. `/view`, `/schemas/*`, `/render/format`); each path must appear in `CONSUMED_PROFILE_FIELDS` (the engine reads it) or `IGNORED_PROFILE_FIELDS` (with a reason), with `*` for map keys. A new nested property under an already-consumed container fails the test until it is classified; a top-level-only comparison is explicitly not sufficient. The same rule covers the manifest's `render` object (template/labels are consumed although they live in the manifest schema) through an analogous `CONSUMED_MANIFEST_FIELDS`/`IGNORED_MANIFEST_FIELDS` pair. If the walker meets a schema construct it cannot enumerate (conditional schemas, unconstrained `additionalProperties`, external `$ref`), the test **fails with an "unclassified schema construct" error** rather than silently passing; the construct must be added to the walker or explicitly ignored with a reason.
- **B2 — Portability is a contract, not a workaround.** `engineRoot` is the directory that contains the engine's `spec/` and `package.json`; `runBuild`/CLI accept it explicitly (default: the running engine's root). **Specifier-to-subpath mapping (deterministic, lexical; recorded in ODR-ENG-001):**
1. Only relative specifiers starting with `./` or `../` are engine candidates; absolute paths, `file:` URLs and bare package specifiers are never engine-owned.
2. Normalize the specifier and the importing file path to `/` separators and collapse `.`/`..` **lexically** against the importing file's directory (no filesystem access); a result that escapes above the project root or is absolute fails `core.path.outside-root`.
3. Find occurrences of the contiguous segment sequence `spec/lib` in the normalized path: exactly one is required. Zero means an ordinary extension file (must be declared in `profile.files`); more than one is an ambiguous engine path and fails closed with `core.extension.unpinned-dependency`.
4. The subpath after that sequence must be non-empty, must contain no `.`/`..`/empty segments and must not start with `/`; otherwise the build fails closed.
5. Resolve `engineRoot/spec/lib/<subpath>`, require its realpath to stay under `engineRoot/spec/lib` (symlink containment), and import it by absolute `file://` URL from the supplied root — not merely classify it.

Imports that do not correspond to an engine subpath remain extension files and must be declared in `profile.files`.

**Disposition of non-relative forms (explicit, never bypassing closure validation):**

- **Absolute paths (`/x`) and `file:` URLs** are rejected before resolution with `core.extension.unpinned-dependency` ("absolute specifiers are not allowed in extension code"); they are never loaded.
- **Bare package specifiers (`yaml`)** are owned by the ordinary extension dependency resolver: they must be declared in the extension's `dependencies` and pinned in `bun.lock`; the exact package name, version and integrity enter the extension closure and therefore `closureDigest` and the cache/identity triple. An undeclared or unpinned package fails `core.extension.unpinned-dependency`. A bare specifier is never loaded outside closure validation.
- **`node:` builtins** are allowed as engine/standard-library imports and do not enter the extension closure (they are not files).
- **Other URL schemes** are rejected like absolute paths.

No form is "not engine-owned and therefore unvalidated": every executable import is either engine-owned (the B2 root rule), a declared relative extension file, or a declared/pinned package in the extension closure. **Containment:** after realpath, the resolved module must live under `engineRoot/spec/lib`; a symlink escape is rejected. **Version correspondence:** the `engineVersion` reported in `BuildIdentity` and used by the determinism condition is read from `engineRoot/package.json`, not from the running process; if the module root and the reported version do not correspond, the build fails closed with a dedicated engine-version diagnostic instead of reporting a false identity. The CORE-000 harness passes the root instead of rewriting imports.
- **B3 — M1 requires an executable profile.** `view` and `validator` stay required; a data-only profile is rejected with an explicit diagnostic and the README/contract are corrected. Implementing data-only profiles is deferred to a separate decision.
- **B4 — M1 supports exactly one source.** `sources.length !== 1` is `core.manifest.invalid`. The current mixed implementation (hook sees `sources[0]`, other paths index all sources by ID) is not a contract: M1 does not establish multi-source behaviour, and a sources map is a future design tracked separately.

## 5. Implementation slices

| Slice | Deliverable | Acceptance |
|---|---|---|
| E1 | `engineRoot` option (`runBuild` + CLI); engine-owned imports mapped and loaded per the lexical `spec/lib` rule (single occurrence, no traversal, realpath-contained, absolute `file://` URL from the supplied root); explicit dispositions for absolute/`file:`/bare/`node:` specifiers; reported `engineVersion` read from `engineRoot/package.json` with a version-correspondence check; copy-and-build test; CORE-000 harness passes the root instead of rewriting imports | project copy builds against another checkout; the loaded implementation is proven to come from the supplied root (sentinel/version assertion), not just classified; identical artifact bytes; focused positive/negative mapping tests (`../../spec/lib/x.js`, deeper levels; multiple `spec/lib` segments, traversal subpath, empty subpath, absolute specifier, symlink escape, wrong root, version mismatch); disposition tests: absolute and `file:` rejected, undeclared/unpinned bare package rejected, declared+pinned bare package appears in `closureDigest` (version change moves it), `node:` allowed, no form bypasses closure validation; `bun run check` unchanged |
| E2 | explicit failure for a profile without `view`/`validator` (clear diagnostic); `sources.length !== 1` ⇒ `core.manifest.invalid`; tests for both | no silent acceptance; diagnostics name the required configuration; existing projects build unchanged |
| E3 | update `engine-public-contract.md` (§5.7, §8.1, §8.2), README, design record where needed; snapshot-update `implementation-status.md`; regenerate the CORE-000 artifact (declared source digest changed) | docs match code; `bun test` including S2.2 artifact verification; `bun run check` green |
| E4 (optional) | import-scan hardening: `import()` expressions, `require`, template/partial references; document remaining static-analysis limits | tests for the newly covered forms; documented limits |

E1 and E2 are code slices and can proceed independently; E3 waits for both. E4 is a follow-up only if the scan's current limits are unacceptable.

## 6. Non-goals

- Sandboxing or capability isolation of profile code (D32 stays deferred).
- Cross-platform byte equality (contract §8.3 boundary).
- Implementing multi-source or data-only profiles.
- Reworking the identity hash framing itself.

## 7. Open questions for the decisions

- API shape of `engineRoot`: option on `runBuild` plus `--engine-root` on the CLI; precedence vs the current default? (Recommendation: explicit option wins, default stays "running engine".)
- Should an engine-owned import be allowed from an extension in a **copied** project when the copy also contains `spec/lib`? (Recommendation: resolve strictly against the explicit root; the copy's own `spec/lib` is not engine-owned unless it is the passed root.)
- Profile schema version bump for B1: minor schema addition with a documented consumed set, or keep the enumeration and add a contract test only? (Recommendation: keep the enumeration plus a "consumed set" test that fails when a profile field is added without an entry.)
