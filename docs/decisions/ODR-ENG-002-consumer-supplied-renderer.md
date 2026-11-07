# ODR-ENG-002 — Owner Decision Record: consumer-supplied renderer wiring

**Status:** APPROVED — the M0.0 slice of the CORE-001 extraction ([#223](https://github.com/agent-federation/contract-builder/issues/223)), approved by the maintainer on 2026-11-07.
**Date:** 2026-11-07 (UTC)
**Decision scope:** who owns the renderer wiring between the engine and a project, and whether the CLI may carry a domain-specific renderer id or module.
**Related:** [#220](https://github.com/agent-federation/contract-builder/issues/220) (CORE-001 extraction epic), contract §3.3/§10/§11/§18 ([D34](../architecture/engine-public-contract.md#18-decision-register)), `spec/cli-renderers.ts`, `spec/build.ts`, `tests/consent.test.ts`.

## 1. Context

The CLI was the only engine file that knew CORE-001 by name: `CORE001_PROFILE_ID`/`CORE001_RENDERER_ID` and a static `import("../profiles/core001/renderer.js")`. The engine core (`spec/lib`) carries no CORE-001 token by construction, but `tests/genericity.test.ts` scanned only `spec/lib`, so the CLI hardcode was invisible to the guard.

Keeping that hardcode blocks the CORE-001 extraction (#220): once the project moves to the UIA repository, the engine would either break or keep a domain name it no longer owns. The contract already states the direction — D14 (package split, `proposed`), §11 ("renderers … are resolved by id from registries supplied by the consumer") and §16 M2 — but the CLI still shipped a built-in renderer.

## 2. Decision

- **The engine ships no renderer.** Renderer wiring is owned by the consumer: the CLI caller (a project script or harness).
- The CLI accepts `--renderer-module <path>` and loads that module only when all of the following hold:
  1. the caller passed `--allow-executable-profile` (the existing consent gate);
  2. the module resolves inside the selected project's profile directory (realpath-contained);
  3. the module is declared in the profile's `files`, so the profile closure digest and the import scan cover the code that will execute;
  4. the profile's declared closure validates (the same preflight as `runBuild`, against the same engine root);
  5. the imported module's reported id equals the manifest's declared `render[].renderer`.
  If any condition fails, nothing is registered and the build fails closed with `core.registry.missing` — there is no silent fallback.
- **CORE-001 wiring moves to the project.** `package.json` `build`, `build:release` and `check` pass `--renderer-module profiles/core001/renderer.ts`; the CORE-000 harness already uses the same pattern (`contracts/core000/run.ts` imports its renderer and passes the registry to `runBuild`).
- **The genericity guard covers the whole `spec/` tree**, not only `spec/lib`.

## 3. Alternatives considered

- **A — keep a built-in renderer and add a flag.** Rejected: the hardcode is the problem, and a built-in default would silently survive the extraction.
- **B — declare the renderer module in `profile.json`** (like `view`/`validator`) and let the engine import it. Deferred, not rejected: this is the M2/M3 package-split design and needs a profile-schema/consumed-set change, a closure-contract update and its own decision. M0.0 must not change the profile contract.
- **C — require a project-owned CLI wrapper with no generic flag.** Works today for CORE-000, but leaves the M1 CLI unable to build any project that has a renderer. The flag is additive (contract §13: flags may be added) and keeps one entry point.

## 4. Consequences

- **Behaviour change:** consent alone no longer produces a renderer. A build without `--renderer-module` fails with `core.registry.missing`; scripts were updated, and the committed CORE-001 artifact is unchanged (`bun run check`; golden `sha256:504bdc5b…`).
- Contract §3.3, §10 and §11 updated; decision D34 added; CORE-000 claims `C000-IM-004`, `C000-IM-006`, `C000-GAP-004` and the consent evidence descriptions updated; `contracts/core000/output/CORE-000.draft.md` regenerated with the Q9 procedure.
- The CLI carries no domain token; a project can only use a renderer module that lives inside its own profile directory, is declared in `profile.files`, and reports the id the manifest declares.

## 5. Verification

- `bun run typecheck`, `bun test`, `bun run check` green.
- `spec/output/CORE-001.draft.md` byte-identical (golden hash unchanged).
- New consent tests: no-module fallback, module outside the profile directory, module not declared in `profile.files`, id mismatch, closure-before-import, unreadable lockfile.
- CORE-000 `S2.2 artifact verification` green after regeneration.

## 6. Follow-ups

- D14/M2: decide whether `profile.json` should declare the renderer module so the engine can load it without a CLI flag (alternative B).
- Extend the pre-review rule in `AGENTS.md`: it lists `pap/`, `spec/lib/`, `profiles/` and `contracts/`, so CLI changes (`spec/build.ts`, `spec/cli-renderers.ts`) currently escape the mandatory independent pre-review.
