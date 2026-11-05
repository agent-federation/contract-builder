# ODR-ENG-001 — Owner Decision Record: engine identity and trust boundary

**Status:** APPROVED — maintainer directive in the 2026-11-06 stream-B planning session (plan accepted with the recommended options); the decision record is published for implementation.
**Date:** 2026-11-06 (UTC)
**Decision scope:** the contract that ties a build's identity (`inputDigest`, extension identities, `closureDigest`) to the code the engine executes and consumes — profile closure completeness, engine portability, data-only profiles and multiple sources.
**Related:** audit umbrella [#137](https://github.com/agent-federation/contract-builder/issues/137), architecture streams B–D [#170](https://github.com/agent-federation/contract-builder/issues/170), minimal executable-closure fix #145 (PR #158), `engine-public-contract.md` §8, `spec/lib/identity.ts`, `spec/lib/build.ts`.
**Design note:** [engine-identity-boundary.md](../architecture/engine-identity-boundary.md).

## 1. Context

The 2026-11-05 audit found that the engine could execute profile code that was not covered by the closure digest or the import scan (finding #145). PR #158 fixed the reproduction by requiring `view`, `validator`, `diagnostics`, every `schemas[*]` entry and the manifest's `render.template`/`render.labels` to be declared in `profile.files`, failing closed with `core.extension.unpinned-dependency` before any profile module is imported.

That closed the hole but not the class. The audit also reproduced three boundary gaps on `main` `703ab7e`:

1. **Portability (B2).** A project copy built by the engine of another checkout fails with four `core.extension.unpinned-dependency` errors because relative profile imports are judged engine-owned only when they resolve inside the *running* engine's `spec/lib` (`identity.ts:74`, `identity.ts:697`). The CORE-000 harness works around this with a regex rewrite of profile imports (`contracts/core000/run.ts:136`).
2. **Data-only profile (B3).** The README describes a declarative (no-code) profile and the consent gate handles the no-executable case, but `build.ts:122,147` unconditionally require `view` and `validator`; removing them yields `core.profile.invalid profile.json#/view`.
3. **Multiple sources (B4).** The manifest accepts any source array; only `sources[0]` is used (`build.ts:170-171`) while the identity hashes all sources. Adding a second source with a different header builds with exit 0 and no diagnostics.

A fourth question is contractual: the consumed set is a hard-coded enumeration (`requiredProfileFiles`, `identity.ts:315`), and nothing states how it is kept complete when the profile schema grows (B1).

## 2. Decisions

**B1 — The consumed set is part of the profile contract.** The engine enumerates, per profile schema version, every profile artifact it executes or consumes (modules, catalogs, schemas, templates, label maps, and any future field the engine reads). Each entry must be declared in `profile.files`; otherwise the build fails closed with `core.extension.unpinned-dependency` naming the file and its origin. Adding a consumed artifact requires a contract update and a test; the engine never silently ignores an undeclared consumed artifact. The enumeration stays explicit in code for M1; a contract test must fail when a new consumed profile field is introduced without an entry.

**B2 — Portability is a contract, not a workaround.** `runBuild` and the CLI accept an explicit engine root (`engineRoot` option / `--engine-root` flag); the default remains the running engine's own root. Extension imports that resolve inside that root are engine-owned; any other relative import must stay inside the extension's declared files. The CORE-000 harness passes the root instead of rewriting imports. The same declared project must produce the same artifact bytes and `inputDigest` regardless of where the engine is launched from.

**B3 — M1 requires an executable profile.** `view` and `validator` remain required. A profile without them is rejected with an explicit diagnostic that names the M1 requirement (not a generic "profile does not declare view"), and the README/contract statement about declarative profiles is corrected. Implementing data-only profiles is deferred to a separate decision.

**B4 — M1 supports exactly one source.** A manifest with `sources.length !== 1` is `core.manifest.invalid`. Silent first-source behaviour is removed. A sources map (registry, per-source verification/render semantics) is a future design tracked separately, not implied by an accepted array.

## 3. Consequences

- Identity becomes a property of the declared project plus the explicit engine root, not of the launch location; the copy-and-build test is the enforcement.
- Unsupported configurations fail with an explicit diagnostic instead of degrading partially; this is a deliberate behaviour change for data-only profiles and multi-source manifests and is covered by tests.
- The CORE-000 harness no longer rewrites source text; it passes an engine root.
- A new consumed profile field cannot silently escape identity: the contract test fails until it is added to the enumeration and to `profile.files` requirements.
- `engine-public-contract.md` §5.7/§8.1/§8.2 and the README must be updated; the CORE-000 artifact must be regenerated because `engine-public-contract.md` is a declared source whose digest is embedded in that artifact (Q9 procedure in `AGENTS.md`).

## 4. Implementation slices

1. **E1 — portability.** `engineRoot` in `runBuild`/CLI; identity/import scan resolves engine-owned code against it; `contracts/core000/run.ts` passes the root instead of rewriting imports; copy-and-build test (project copy + engine from another checkout → identical artifact bytes and `inputDigest`); negative case for a wrong root.
2. **E2 — explicit rejection.** Clear diagnostic for a profile without `view`/`validator`; `sources.length !== 1` ⇒ `core.manifest.invalid`; tests; existing projects build unchanged.
3. **E3 — documents.** `engine-public-contract.md` (§5.7, §8.1, §8.2), README, `implementation-status.md` snapshot update, regenerated CORE-000 artifact.
4. **E4 (optional).** Import-scan hardening (`import()` expressions, `require`, template/partial references) with documented static-analysis limits.

E1 and E2 can proceed in parallel; E3 waits for both.

## 5. Verification

- `bun run typecheck`, `bun test`, `bun run check` green for every slice.
- E1: copy-and-build produces byte-identical artifacts and the same `inputDigest`; the repository build is unchanged.
- E2: a data-only profile and a multi-source manifest are rejected with the specific diagnostics; no fixture or existing project regresses.
- E3: `bun test` includes the S2.2 artifact verification; `bun run check` validates CORE-001; the regenerated CORE-000 artifact matches the changed declared source.

## 6. Follow-ups

- Data-only profiles: separate decision (implement or keep deferred) — #170 stream B.
- Multi-source: separate design (sources map) — #170 stream B.
- Import-scan completeness (dynamic `import()`, `require`, template references) — E4 or a dedicated decision if the static limits matter.
- Revisit `engineRoot` default and precedence when profiles are distributed as packages.
