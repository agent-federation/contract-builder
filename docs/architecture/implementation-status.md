# Implementation status — engine architecture and public contract

**As-of snapshot.** Audited `main` at commit
[`f1ddcf78888d2be5130d5975526cad47c4774284`](https://github.com/agent-federation/contract-builder/commit/f1ddcf78888d2be5130d5975526cad47c4774284)
("feat: add an independent example profile and end-to-end fixture (#46)"), audit date
**2026-11-02** (UTC). Every status in this document describes that commit only; later commits may
change it.

**Snapshot update for Issue #35.** Row H5 and the consent clause in row A3 record the executable
profile consent added after `f1ddcf7` by the focused [#35](https://github.com/agent-federation/contract-builder/issues/35)
change. Their evidence links point at that change's code, not at the audited commit; every
other row still describes `f1ddcf7`.

**Snapshot update for Issue #36.** Rows R3 and I3 record the relation-inverse contract added
after `f1ddcf7` by the focused [#36](https://github.com/agent-federation/contract-builder/issues/36)
change: reciprocal inverse declarations are validated at profile load, and an inverse declared
`cardinality: "one"` is enforced when the resolver synthesizes it. Their evidence links point
at that change's code and tests, not at the audited commit; every other row still describes
`f1ddcf7`.

**Snapshot update for Issue #37.** Row V5 records the binding/verification split added after
`f1ddcf7` by the focused [#37](https://github.com/agent-federation/contract-builder/issues/37)
change: `ProvenanceVerification` and `VerificationRecord` are part of the IR, the optional profile
verifier supplies claims, and outputs render binding and verification separately. Rows V1 and
§5–§6 are revised only where that change alters their wording. Every other row still describes
`f1ddcf7`; no independent verification is claimed for the new row.

**What this is.** The audit deliverable requested by
[#39](https://github.com/agent-federation/contract-builder/issues/39): a source-backed status
matrix for the engine architecture and public contract. It separates design intent, accepted
decisions, implemented behavior, tests, independent verification and deliberate deferrals. It is
a snapshot, not a roadmap and not a milestone.

**What this is not.** It does not implement, re-decide or re-scope anything. It does not change
the accepted contract (`engine-public-contract.md`), the M1 plan
(`m1-implementation-plan.md`), CORE-001 normative content or any code. Where a document and the
code disagree, the disagreement is recorded in
[Documentation drift](#8-documentation-drift-and-smallest-corrections) with the smallest
correction; no architecture decision is rewritten here.

---

## 1. Status vocabulary

These are the only status terms used. A row states a status only where the linked evidence
supports it.

| Term | Meaning in this matrix |
|---|---|
| `proposed` | Described or recommended but not accepted as a project decision. It names no promised behavior. |
| `accepted` | Explicitly directed or approved by the maintainer, with the decision source linked. |
| `implemented` | The behavior or capability exists in the code at this commit, at the linked path. |
| `tested` | Automated tests exercise the behavior; the test path and the recorded run are linked. |
| `independently_verified` | Evidence was checked independently of the implementation author — a distinct reviewer or maintainer explicitly verified the behavior. A passing test, green CI, PR merge or the implementer's own report does **not** qualify. |
| `deferred` | Explicitly out of current scope or postponed, with the decision or plan that defers it linked. |

`—` means *no supported claim* for that dimension: not implemented, not exercised by a test, or no
independent verification exists. It is never a synonym for "failed". There is no
`not_started`, `partial` or `unknown` status here.

## 2. Reading the matrix

Decision, implementation and verification are **separate dimensions**, so a row can be
`accepted` but not implemented, or implemented but not independently verified:

| Dimension | Column | Vocabulary |
|---|---|---|
| Decision | *Decision* | `accepted`, `proposed`, `deferred`, `—` |
| Implementation in this commit | *Implementation* | `implemented`, `—` |
| Automated tests | *Tests* | `tested`, `—` |
| Verification independent of the author | *Independent verification* | `independently_verified`, `—` |

Rules applied throughout:

1. **`accepted` cites the decision, not the code.** Decision sources are the merged contract
   ([#14](https://github.com/agent-federation/contract-builder/pull/14)) and its decision
   register `D1`–`D32`, the merged M1 plan
   ([#16](https://github.com/agent-federation/contract-builder/pull/16), whose §3 records the
   maintainer-approved M1 decisions and whose §7–§8 record the approved relation and provenance
   choices), the provenance-hardening RFC
   ([#45](https://github.com/agent-federation/contract-builder/pull/45), accepted 2026-11-02), and
   the tracking issues named in a row.
2. **`implemented` cites the code path**, not a document or PR description.
3. **`tested` cites the specific test** and the recorded run in
   [§10](#10-audit-method-and-recorded-evidence). A test file existing is not a test passing;
   the run below is the evidence.
4. **`independently_verified` is not inferred.** No capability carries that status in this
   snapshot; [§7](#7-verification-evidence-audit) records the human review evidence that exists
   and why it was not promoted.
5. **Links are relative to this commit.** Code and test links use `#L` line anchors valid at
   `f1ddcf7`; they move as the code changes, which is why the snapshot is pinned.

The row grouping is the author's; it follows the capability areas required by #39. A capability
that is not implemented is still a row, so that "deferred" is visible rather than silent. A row
marked `deferred` may still have an accepted design — the term means the capability is explicitly
outside this commit's scope, and the evidence names both the decision and the milestone that
carries it.

---

## 3. Matrix

### 3.1 Project, declared inputs and project boundaries

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| P1 | A project has a manifest; `contract-builder.json` is the only fixed file name, and inputs, sources, renderer and outputs are declared in it | `accepted` | `implemented` | `tested` | `—` | Contract [§3.1](engine-public-contract.md) (D2–D4); plan [§6](m1-implementation-plan.md); [manifest.ts:101](../../spec/lib/manifest.ts#L101) `loadManifest`, [manifest.ts:264](../../spec/lib/manifest.ts#L264) `validateManifest`; [manifest.test.ts:81](../../tests/manifest.test.ts#L81), [manifest.test.ts:199](../../tests/manifest.test.ts#L199) |
| P2 | Declared inputs are loaded by manifest order, with document schemas validated before extraction; absent `optional` inputs are skipped | `accepted` | `implemented` | `tested` | `—` | Contract [§5.2](engine-public-contract.md) steps 1–2; [load.ts:21](../../spec/lib/load.ts#L21), [schema.ts:86](../../spec/lib/schema.ts#L86); [manifest.test.ts:104](../../tests/manifest.test.ts#L104), [build.test.ts:177](../../tests/build.test.ts#L177) (`ERR_SCHEMA`) |
| P3 | Path resolution is root-contained (`realpath`), out-of-root paths need `external: true`, and output paths stay inside the canonical output root (D31) | `accepted` | `implemented` | `tested` | `—` | Contract [§5.7](engine-public-contract.md) (D31); [manifest.ts:233](../../spec/lib/manifest.ts#L233) `resolveContained`, [build.ts:290](../../spec/lib/build.ts#L290) `resolveOutputPath`; [manifest.test.ts:88](../../tests/manifest.test.ts#L88), [manifest.test.ts:121](../../tests/manifest.test.ts#L121), [manifest.test.ts:135](../../tests/manifest.test.ts#L135), [manifest.test.ts:169](../../tests/manifest.test.ts#L169) |

### 3.2 Profile declaration, schemas, kinds and relations

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| R1 | A profile owns entity kinds, relation declarations, provenance mappings, document bindings, diagnostic catalog and validator/view modules; the core names no CORE-001 concept | `accepted` | `implemented` | `tested` | `—` | Contract [§3.2–3.3](engine-public-contract.md) (D6, D15, D16); plan [§7.1](m1-implementation-plan.md), [§10.2](m1-implementation-plan.md); [profile.json](../../profiles/core001/profile.json), [manifest.ts:447](../../spec/lib/manifest.ts#L447); [ir.test.ts:132](../../tests/ir.test.ts#L132), [genericity.test.ts:56](../../tests/genericity.test.ts#L56) |
| R2 | Document schemas and per-kind entity schemas carry versioned `$id`s; the reserved names (`id`, `kind`, `type`, `provenance`, `relations`, `review`) are permitted in entity schemas | `accepted` | `implemented` | `tested` | `—` | Contract [§5.5](engine-public-contract.md); plan [§7.3](m1-implementation-plan.md); [schema.ts:17](../../spec/lib/schema.ts#L17), [schema.ts:121](../../spec/lib/schema.ts#L121), [provision.schema.json](../../profiles/core001/schemas/provision.schema.json); [ir.test.ts:132](../../tests/ir.test.ts#L132), [example-profile.test.ts:216](../../tests/example-profile.test.ts#L216) |
| R3 | An undeclared kind or relation is never guessed: `core.profile.unknown-kind` and `core.profile.unknown-relation`; a duplicate `(name, from)` declaration is rejected; a declared `inverse` must be a non-empty string (`core.profile.invalid`, never normalized away) and must be declared from the target kind, point back at the forward relation and reverse the endpoints (`core.profile.invalid`) | `accepted` | `implemented` | `tested` | `—` | Contract [§3.2](engine-public-contract.md), [§5.1–5.2](engine-public-contract.md); plan [§7.4](m1-implementation-plan.md); [ir.ts:81](../../spec/lib/ir.ts#L81), [relations.ts:24](../../spec/lib/relations.ts#L24), [manifest.ts:447](../../spec/lib/manifest.ts#L447), [manifest.ts:529](../../spec/lib/manifest.ts#L529), [manifest.ts:558](../../spec/lib/manifest.ts#L558); [ir.test.ts:170](../../tests/ir.test.ts#L170), [ir.test.ts:182](../../tests/ir.test.ts#L182), [example-profile.test.ts:258](../../tests/example-profile.test.ts#L258), [manifest.test.ts:266](../../tests/manifest.test.ts#L266), [manifest.test.ts:280](../../tests/manifest.test.ts#L280), [manifest.test.ts:295](../../tests/manifest.test.ts#L295), [manifest.test.ts:313](../../tests/manifest.test.ts#L313), [manifest.test.ts:332](../../tests/manifest.test.ts#L332) |
| R4 | Declarative rule primitives (`matrix`, `substring`, `coverage`, `gate`, …) | `deferred` | `—` | `—` | `—` | Directed hook-only in M1; primitives are the M3 target (D15 narrowed, plan [§3](m1-implementation-plan.md)); contract [§3.3](engine-public-contract.md) |
| R5 | Typed `ReviewState` with N named review dimensions, and profile `vocabularies` / `renderDefaults` / `overridablePolicyKeys` | `deferred` | `—` | `—` | `—` | D16 narrowed (review stays opaque in `fields`), D24 proposed / M4; plan [§12](m1-implementation-plan.md); [ir.ts:46](../../spec/lib/ir.ts#L46) does not strip `review`, so it stays in `fields` |

### 3.3 Generic IR, identity and reference integrity

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| I1 | The IR envelope `id/kind/type/fields/provenance/relations` with profile-string kinds and relation names | `accepted` | `implemented` | `tested` | `—` | D16 (accepted, narrowed); contract [§4](engine-public-contract.md); [ir.ts:17](../../spec/lib/ir.ts#L17), [ir.ts:52](../../spec/lib/ir.ts#L52); [ir.test.ts:132](../../tests/ir.test.ts#L132), [example-profile.test.ts:167](../../tests/example-profile.test.ts#L167) |
| I2 | Every entity has a non-empty identity, unique across all kinds, and is indexed by id and kind before relations resolve | `accepted` | `implemented` | `tested` | `—` | Contract [§4](engine-public-contract.md) generic guarantees; [ir.ts:118](../../spec/lib/ir.ts#L118) (`ERR_DUPLICATE_ID`), [ir.ts:152](../../spec/lib/ir.ts#L152); [build.test.ts:191](../../tests/build.test.ts#L191) |
| I3 | Relations live only in the reserved `relations` object; declaration endpoints are validated before resolution; cardinality, unknown keys and unresolvable targets are errors; a declared inverse is validated as a reciprocal declaration, is populated in input order, and its declared `cardinality: "one"` rejects a second source | `accepted` | `implemented` | `tested` | `—` | Contract [§5.2](engine-public-contract.md) steps 6, 8 (D6); plan [§7.1](m1-implementation-plan.md), [§7.4](m1-implementation-plan.md); [relations.ts:12](../../spec/lib/relations.ts#L12), [relations.ts:51](../../spec/lib/relations.ts#L51), [relations.ts:137](../../spec/lib/relations.ts#L137), [relations.ts:148](../../spec/lib/relations.ts#L148); [ir.test.ts:159](../../tests/ir.test.ts#L159), [ir.test.ts:194](../../tests/ir.test.ts#L194), [ir.test.ts:215](../../tests/ir.test.ts#L215), [ir.test.ts:226](../../tests/ir.test.ts#L226), [ir.test.ts:249](../../tests/ir.test.ts#L249), [ir.test.ts:348](../../tests/ir.test.ts#L348), [ir.test.ts:381](../../tests/ir.test.ts#L381) |
| I4 | `Entity.type` discriminator and the experimental `extensions` map | `proposed` | `—` | `—` | `—` | D16 keeps both unused/narrowed; contract [§4](engine-public-contract.md) marks `extensions` experimental and D16 `proposed` |

### 3.4 Provenance binding and source-adapter verification

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| V1 | Direct provenance binding: profile mappings project `{source, ref, quote}` from entity fields, the source must be declared in the manifest, and incomplete bindings fail. Binding is structural and attaches a `not-checked` verification; it does not verify the quote | `accepted` | `implemented` | `tested` | `—` | Plan [§8.2](m1-implementation-plan.md) (M1 choice, merged in #16); [provenance.ts:88](../../spec/lib/provenance.ts#L88); [ir.test.ts:262](../../tests/ir.test.ts#L262) (only `fragment` and `decision` bind directly); [provenance.test.ts:92](../../tests/provenance.test.ts#L92) |
| V2 | The markdown adapter resolves section / table-column / list-item locators and reports found, outside or unknown-locator for a quote | `accepted` | `implemented` | `tested` | `—` | Contract [§11](engine-public-contract.md) adapter interface (D25 ownership stays proposed); plan [§8.3](m1-implementation-plan.md); [markdown.ts:31](../../spec/lib/adapters/markdown.ts#L31), [markdown.ts:58](../../spec/lib/adapters/markdown.ts#L58); [build.test.ts:113](../../tests/build.test.ts#L113), [build.test.ts:151](../../tests/build.test.ts#L151), [checks.test.ts:34](../../tests/checks.test.ts#L34) |
| V3 | Core-enforced quote resolution and the full `LocatorResult` (`unsupported`, `unknown-block`) | `proposed` | `—` | `—` | `—` | D25 `proposed`; plan [§8.3](m1-implementation-plan.md) records that the profile hook, not the core, maps quote outcomes in M1; [source.ts:11](../../spec/lib/source.ts#L11) keeps `unsupported` in the type only |
| V4 | Provenance hardening: paragraph locators `#<section>/p<n>` and ranges, source-byte digest verified in the core, `unknown-block` locator outcome | `accepted` | `—` | `—` | `—` | Accepted 2026-11-02 (Q1–Q11) in [provenance-hardening-rfc.md](provenance-hardening-rfc.md), merged in [#45](https://github.com/agent-federation/contract-builder/pull/45); implementation not started per its header |
| V5 | Binding and verification are separate data: `ProvenanceVerification` with `verified`/`failed`/`unavailable`/`stale` and a `VerificationRecord` (verifier, method, checked-at, source version/digest, outcome); the core attaches a not-checked record at binding, a profile verifier supplies claims, the core validates the record and digest, and outputs render both; an unverified binding is never rendered as verified | `accepted` | `implemented` | `tested` | `—` | Issue [#37](https://github.com/agent-federation/contract-builder/issues/37) and its maintainer task comment (CB-A2A-013); contract [§4](engine-public-contract.md), [§5.2](engine-public-contract.md) steps 7–8, [§6.1](engine-public-contract.md); [ir.ts:22](../../spec/lib/ir.ts#L22), [provenance.ts:20](../../spec/lib/provenance.ts#L20), [provenance.ts:152](../../spec/lib/provenance.ts#L152), [hook.ts:28](../../spec/lib/hook.ts#L28), [build.ts:182](../../spec/lib/build.ts#L182), [checks/verification.ts](../../profiles/core001/checks/verification.ts); [provenance.test.ts](../../tests/provenance.test.ts) |

### 3.5 Profile validation policy, hook and review gating

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| H1 | A profile validator hook returns findings; the core resolves the code through the profile catalog, takes severity and message from it, and fails on an unknown code | `accepted` | `implemented` | `tested` | `—` | Contract [§3.3](engine-public-contract.md) (D15, D28); [hook.ts:47](../../spec/lib/hook.ts#L47), [build.ts:127](../../spec/lib/build.ts#L127); [hook.test.ts:18](../../tests/hook.test.ts#L18), [hook.test.ts:78](../../tests/hook.test.ts#L78), [hook.test.ts:106](../../tests/hook.test.ts#L106) |
| H2 | Draft/release gating in M1: `error` and `review` block, `warning` blocks under `--strict`, and release refuses to write when anything blocks | `accepted` | `implemented` | `tested` | `—` | Accepted M1 behavior, plan [§9.4](m1-implementation-plan.md); [build.ts:250](../../spec/lib/build.ts#L250), [build.ts:255](../../spec/lib/build.ts#L255); [build.test.ts:59](../../tests/build.test.ts#L59), [build.test.ts:119](../../tests/build.test.ts#L119), [build.test.ts:131](../../tests/build.test.ts#L131) |
| H3 | Per-code, per-mode blocking computed from profile policy + project overlay + build mode (three axes) | `deferred` | `—` | `—` | `—` | D9 accepted as design, but contract [§18](engine-public-contract.md) correction 2 and plan [§9.4](m1-implementation-plan.md) place it in M2; blocking is severity-derived at [build.ts:250](../../spec/lib/build.ts#L250) |
| H4 | CORE-001 policy modules: one module per check family with a fixed order and per-module unit tests | `accepted` | `implemented` | `tested` | `—` | D15 approval requires the module split (plan [§10.1](m1-implementation-plan.md)); [validator.ts:19](../../profiles/core001/validator.ts#L19), [checks/](../../profiles/core001/checks); [checks.test.ts:34](../../tests/checks.test.ts#L34), [hook.test.ts:93](../../tests/hook.test.ts#L93) |
| H5 | Executable profile consent: a profile declaring `view`/`validator` fails closed with `core.profile.consent-required` before any profile module is imported unless the caller passes `allowExecutableProfile: true` (API) or `--allow-executable-profile` (CLI); the CLI validates the selected profile's declared closure before importing its built-in renderer, and only when the project declares profile `core001` and renderer `core001-markdown`; an unreadable lockfile is a failed preflight (`ERR_IO`), not a pass; consent is not isolation | `accepted` | `implemented` | `tested` | `—` | Issue [#35](https://github.com/agent-federation/contract-builder/issues/35); contract [§3.3](engine-public-contract.md) "Executable profile consent"; [build.ts:76](../../spec/lib/build.ts#L76) consent gate, [build.ts:362](../../spec/lib/build.ts#L362) `hasExecutableProfileConsent`, [build.ts:50](../../spec/lib/build.ts#L50) `BuildOptions.allowExecutableProfile`, [identity.ts:345](../../spec/lib/identity.ts#L345) closure preflight, [identity.ts:352](../../spec/lib/identity.ts#L352) lockfile failure; CLI [cli-renderers.ts:31](../../spec/cli-renderers.ts#L31) closure preflight before import, [cli-renderers.ts:50](../../spec/cli-renderers.ts#L50) closure check, [build.ts:62](../../spec/build.ts#L62) flag, [build.ts:130](../../spec/build.ts#L130) call; [consent.test.ts:87](../../tests/consent.test.ts#L87) API rejection, [consent.test.ts:108](../../tests/consent.test.ts#L108) API success, [consent.test.ts:121](../../tests/consent.test.ts#L121) CLI rejection and success, [consent.test.ts:148](../../tests/consent.test.ts#L148) other-profile renderer isolation, [consent.test.ts:176](../../tests/consent.test.ts#L176) closure preflight, [consent.test.ts:232](../../tests/consent.test.ts#L232) lockfile-unreadable preflight, [consent.test.ts:253](../../tests/consent.test.ts#L253) `ERR_IO` diagnostic, [example-profile.test.ts:147](../../tests/example-profile.test.ts#L147) synthetic profile rejection |

### 3.6 Diagnostics: shape, codes and phases

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| G1 | M1 diagnostic record `{severity: error\|warning\|review, code, file, pointer, message}` with a fixed deterministic order and a read-only emission-order snapshot | `accepted` | `implemented` | `tested` | `—` | Legacy shape frozen for M1, plan [§9.2–9.4](m1-implementation-plan.md); [diagnostics.ts:1](../../spec/lib/diagnostics.ts#L1), [diagnostics.ts:58](../../spec/lib/diagnostics.ts#L58); [golden.test.ts:81](../../tests/golden.test.ts#L81), [golden.test.ts:86](../../tests/golden.test.ts#L86), [golden.test.ts:99](../../tests/golden.test.ts#L99) |
| G2 | The contract diagnostic: `severity` + `disposition` + resolved `blocking`, a `phase`, `location` object and `data`; namespaced `core.*` codes; exit code 2 reserved for I/O and usage errors | `deferred` | `—` | `—` | `—` | D8 and D9 accepted, D17 proposed; contract [§18](engine-public-contract.md) corrections 1–4 and [§7](engine-public-contract.md) schedule this for M2; [diagnostics.ts:3](../../spec/lib/diagnostics.ts#L3) has no `disposition`/`phase` |
| G3 | Every emitted code is declared in the profile catalog, with variants; an unknown finding code fails the build | `accepted` | `implemented` | `tested` | `—` | Contract [§7.1](engine-public-contract.md); plan [§9.3](m1-implementation-plan.md); [hook.ts:100](../../spec/lib/hook.ts#L100), [catalog.json](../../profiles/core001/catalog.json); [hook.test.ts:62](../../tests/hook.test.ts#L62), [hook.test.ts:78](../../tests/hook.test.ts#L78), [hook.test.ts:161](../../tests/hook.test.ts#L161) |

### 3.7 Rendering, renderer registry and artifact normalization

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| O1 | The consumer supplies a renderer registry; an unknown id is `core.registry.missing`; templates are preloaded into a `TemplateSet` so renderers perform no I/O; the core normalizes artifacts to UTF-8, LF and one trailing newline | `accepted` | `implemented` | `tested` | `—` | D14 clarification (plan [§10.2](m1-implementation-plan.md)); contract [§11](engine-public-contract.md); [render.ts:43](../../spec/lib/render.ts#L43), [render.ts:65](../../spec/lib/render.ts#L65), [render.ts:74](../../spec/lib/render.ts#L74), [build.ts:421](../../spec/lib/build.ts#L421); [renderer.test.ts:37](../../tests/renderer.test.ts#L37), [renderer.test.ts:64](../../tests/renderer.test.ts#L64), [renderer.test.ts:100](../../tests/renderer.test.ts#L100) |
| O2 | The CORE-001 renderer (view mapping, labels, template) lives in `profiles/core001/`, not in the core | `accepted` | `implemented` | `tested` | `—` | D14 clarification; plan [§10.2](m1-implementation-plan.md); [renderer.ts:37](../../profiles/core001/renderer.ts#L37); [renderer.test.ts:82](../../tests/renderer.test.ts#L82), [golden.test.ts:75](../../tests/golden.test.ts#L75) |
| O3 | More than one renderer and more than one artifact per build (contract `Artifact[]`) | `deferred` | `—` | `—` | `—` | Contract [§8](engine-public-contract.md), [§11](engine-public-contract.md); M1 enforces exactly one artifact and reads only `render[0]` ([build.ts:219](../../spec/lib/build.ts#L219)); the multi-renderer surface belongs to M2 |

### 3.8 Build identity and extension closure digests

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| B1 | `BuildResult.identity` with `projectId`, `engineVersion`, `manifestVersion`, authoritative `inputDigest` (`sha256:<hex>`) and the extension list; the identity is never rendered into the artifact | `accepted` | `implemented` | `tested` | `—` | D10; contract [§8](engine-public-contract.md); plan [§11](m1-implementation-plan.md); [build-identity.md](build-identity.md); [identity.ts:358](../../spec/lib/identity.ts#L358); [identity.test.ts:90](../../tests/identity.test.ts#L90), [identity.test.ts:603](../../tests/identity.test.ts#L603), [example-profile.test.ts:409](../../tests/example-profile.test.ts#L409) |
| B2 | `inputDigest` covers the canonical manifest, every declared input, source documents, `profileDigest`, and adapter/renderer closures; LF normalization and length-prefixed record framing; clock, locale, mtimes, env, absolute paths excluded | `accepted` | `implemented` | `tested` | `—` | D10, D28; contract [§8.1](engine-public-contract.md) controls; [identity.ts:167](../../spec/lib/identity.ts#L167) `computeClosureDigest`, [identity.ts:358](../../spec/lib/identity.ts#L358); [identity.test.ts:107](../../tests/identity.test.ts#L107), [identity.test.ts:113](../../tests/identity.test.ts#L113), [identity.test.ts:281](../../tests/identity.test.ts#L281), [identity.test.ts:302](../../tests/identity.test.ts#L302), [identity.test.ts:502](../../tests/identity.test.ts#L502) |
| B3 | Extension closure declaration (`{root, files, dependencies}`), lockfile authority, and static/dynamic-literal import scanning; an undeclared or unpinned import is `core.extension.unpinned-dependency` | `accepted` | `implemented` | `tested` | `—` | D28; contract [§8.1](engine-public-contract.md); plan [§11](m1-implementation-plan.md); [extension.ts:14](../../spec/lib/extension.ts#L14), [identity.ts:344](../../spec/lib/identity.ts#L344), [identity.ts:596](../../spec/lib/identity.ts#L596); [identity.test.ts:554](../../tests/identity.test.ts#L554), [identity.test.ts:565](../../tests/identity.test.ts#L565), [identity.test.ts:579](../../tests/identity.test.ts#L579), [identity.test.ts:593](../../tests/identity.test.ts#L593) |
| B4 | Isolated hook/extension execution so determinism is engine-enforced rather than an author obligation | `deferred` | `—` | `—` | `—` | D32 deferred; contract [§3.3](engine-public-contract.md) and [§8.1](engine-public-contract.md); the static import scan is a guard, not a sandbox ([build-identity.md](build-identity.md) "Static import scan") |

### 3.9 Build/CLI result contract and public TypeScript API

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| K1 | M1 entry point: `runBuild(BuildOptions) → BuildResult` with `exitCode`, `blockedBy`, `diagnostics`, `markdown`, `outputPath`, `written`, `identity` | `accepted` | `implemented` | `tested` | `—` | The M1 narrowing is recorded: D18 deferred to M2 (plan [§12](m1-implementation-plan.md)); [build.ts:31](../../spec/lib/build.ts#L31), [build.ts:45](../../spec/lib/build.ts#L45), [build.ts:56](../../spec/lib/build.ts#L56); [build.test.ts:29](../../tests/build.test.ts#L29), [golden.test.ts:75](../../tests/golden.test.ts#L75) |
| K2 | Public API `loadProject` / `validateProject` / `buildProject` / `renderModel` / `checkArtifacts`, `BuildStatus`, `phases`, `Artifact[]` in the result, and exit code 2 | `deferred` | `—` | `—` | `—` | D7 accepted, D18 proposed and explicitly deferred; plan [§12](m1-implementation-plan.md) and contract [§18](engine-public-contract.md) place the API in M2; no exported package surface exists ([package.json](../../package.json) `private`) |
| K3 | Contract CLI (`validate` / `build` / `check` subcommands, `--json` returning the contract result object) | `deferred` | `—` | `—` | `—` | Contract [§10](engine-public-contract.md); the M1 CLI exposes `--mode/--spec/--check/--no-write/--strict/--json` flags only ([build.ts:16](../../spec/build.ts#L16), [build.ts:128](../../spec/build.ts#L128)) |

### 3.10 Adapters, multi-source behavior and the extension trust boundary

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| A1 | `SourceAdapter` interface (load + verifyQuote), one built-in `markdown` adapter, and an injectable adapter registry | `accepted` | `implemented` | `tested` | `—` | Contract [§11](engine-public-contract.md); [source.ts:13](../../spec/lib/source.ts#L13), [adapters/index.ts](../../spec/lib/adapters/index.ts); [build.test.ts:113](../../tests/build.test.ts#L113), [identity.test.ts:159](../../tests/identity.test.ts#L159) |
| A2 | Multi-source projects (N sources, a provenance binding naming exactly one) | `proposed` | `—` | `—` | `—` | D21 `proposed`, M4 (#5); M1 requires at least one source and the hook consumes `sources[0]` ([build.ts:86](../../spec/lib/build.ts#L86), [build.ts:150](../../spec/lib/build.ts#L150)); README states one-source support |
| A3 | Extension trust boundary: profiles, adapters, renderers and hooks are trusted in-process code; executable profile modules require explicit caller consent (H5); `external: true` is an explicit trust declaration; declared closures participate in identity | `accepted` | `implemented` | `tested` | `—` | D28, D31; contract [§3.3](engine-public-contract.md), [§5.7](engine-public-contract.md), [§8.1](engine-public-contract.md); [build-identity.md](build-identity.md); [identity.test.ts:427](../../tests/identity.test.ts#L427), [identity.test.ts:554](../../tests/identity.test.ts#L554), [consent.test.ts:58](../../tests/consent.test.ts#L58) |
| A4 | A second real profile (HTTP API) and an OpenAPI adapter | `deferred` | `—` | `—` | `—` | M3 (plan [§17](m1-implementation-plan.md), contract [§16.3](engine-public-contract.md)); only the synthetic `profiles/example` exists |
| A5 | A synthetic non-CORE-001 profile builds through the same core path (M1 PR 7) | `accepted` | `implemented` | `tested` | `—` | Approved plan PR 7 (plan [§13](m1-implementation-plan.md)); issue #33 acceptance; [profiles/example](../../profiles/example); [example-profile.test.ts:146](../../tests/example-profile.test.ts#L146), [example-profile.test.ts:167](../../tests/example-profile.test.ts#L167), [example-profile.test.ts:195](../../tests/example-profile.test.ts#L195), [example-profile.test.ts:206](../../tests/example-profile.test.ts#L206) |

### 3.11 Conformance: representation versus execution

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| N1 | Declarative conformance vectors are stored, structurally and referentially validated, and linked to their provisions; violated-from-permission is rejected | `accepted` | `implemented` | `tested` | `—` | D11; contract [§12](engine-public-contract.md); [cases.yml](../../spec/conformance/cases.yml), [checks/cases.ts](../../profiles/core001/checks/cases.ts), [checks/coverage.ts](../../profiles/core001/checks/coverage.ts); [build.test.ts:205](../../tests/build.test.ts#L205), [checks.test.ts:87](../../tests/checks.test.ts#L87), [checks.test.ts:112](../../tests/checks.test.ts#L112) |
| N2 | Conformance execution and implementation evaluation | `deferred` | `—` | `—` | `—` | D27 `deferred`, "never in core" (plan [§17](m1-implementation-plan.md)); a future evaluator needs its own contract (#8) |

### 3.12 Packaging, distribution, self-hosting and the remaining roadmap

| # | Capability | Decision | Implementation | Tests | Independent verification | Evidence |
|---|---|---|---|---|---|---|
| X1 | Package split into core / CLI / renderer / adapter / profile packages | `proposed` | `—` | `—` | `—` | D14 `proposed` (future target, contract [§18](engine-public-contract.md)); [package.json](../../package.json) stays one private package with no `exports` |
| X2 | Publication and distribution scope | `proposed` | `—` | `—` | `—` | D20 unresolved (blocked by #10, contract [§18](engine-public-contract.md)); D29 unresolved with a local-directory default; M5 |
| X3 | Self-hosting: the engine's own contract described as a project using the public model | `deferred` | `—` | `—` | `—` | D26 `deferred`, M5 (plan [§17](m1-implementation-plan.md); contract [§14](engine-public-contract.md)) |
| X4 | Declared runtime matrix (Node 20+ library, Bun development/CI) | `proposed` | `—` | `—` | `—` | D19 `proposed` (contract [§18](engine-public-contract.md)); CI runs Bun only ([ci.yml](../../.github/workflows/ci.yml)) |
| X5 | Remaining M2–M5 milestones (public API, three-axis diagnostics, code namespacing, rule primitives, multi-source, review dimensions, provenance hardening, packaging, self-hosting) | `deferred` | `—` | `—` | `—` | Plan [§17](m1-implementation-plan.md) "Deferred capabilities"; each has its own row above where material |

---

## 4. M1 delivery reconciliation (PRs #17–#46, Issue #33)

The M1 sequence below is the approved plan ([#16](https://github.com/agent-federation/contract-builder/pull/16)
§13). Each row records the merged commit, what the code actually delivered, and the limit of what
it proves. Merged is not the same as verified: see [§7](#7-verification-evidence-audit).

| Item | Merged as | Delivered at this commit | What it proves | What it does not prove |
|---|---|---|---|---|
| #17 golden baseline | `7c0a4ba` | Three recorded snapshots under [tests/golden/](../../tests/golden) (artifact SHA-256, rendered diagnostics, emission order) and `Diagnostics.emissionOrder()`; [golden.test.ts](../../tests/golden.test.ts) | The artifact and the rendered diagnostic report are pinned by executable snapshots | That the pinned content is normatively correct, or that checks are independently verified |
| #20 manifest / project boundary | `02f6e99` | `contract-builder.json`, declared inputs, profile pinning, root containment and `external: true`; [manifest.ts](../../spec/lib/manifest.ts) | CORE-001 is represented as a project with a manifest and a profile | That a non-CORE-001 project works (only CORE-001 does at this point) |
| #24 generic IR, relations, provenance | `6c35e4d` | `Entity`/`ProjectModel`, pointer extraction, relation declarations/resolution/inverse, provenance bindings, data migration into `relations`; [ir.ts](../../spec/lib/ir.ts), [relations.ts](../../spec/lib/relations.ts), [provenance.ts](../../spec/lib/provenance.ts) | The core mechanism is profile-driven for CORE-001 and has no CORE-001 kind names; `vectors` reproduces the case order | That kinds/relations generalize beyond CORE-001's shape; that quote verification is core-owned |
| #29 policy into the profile hook | `2186bcb` | `profiles/core001/validator.ts` + eight check modules, catalog resolution, `core.profile.unknown-code`; `spec/lib/semantic.ts` deleted | CORE-001 policy runs behind the profile hook, and the core keeps only generic invariants | That the hook is necessary or minimal; that primitives would not suffice (that is M3 evidence) |
| #34 renderer boundary | `7463ed8` | Renderer registry, `TemplateSet` preload, artifact normalization, profile-owned renderer/labels/template, `core.registry.missing`; [render.ts](../../spec/lib/render.ts) | Markdown is not a core invariant; the profile supplies the renderer | That a second real output format works (only the synthetic example renderer does) |
| #42 build identity | `e8c917f` | `inputDigest`, `profileDigest`, extension closures, lockfile authority, import scan, `core.extension.unpinned-dependency`; [identity.ts](../../spec/lib/identity.ts), [build-identity.md](build-identity.md) | The identity is deterministic over declared inputs and changes when a declared file or pin changes; it is not rendered | That the closure is provably complete (the scan is a guard), or that trusted extensions are deterministic |
| #46 PR 7 / Issue #33 | `f1ddcf7`; issue closed 2026-11-02T00:38:44Z | `profiles/example` (kinds `requirement`/`example`, one relation and its inverse, own schemas/hook/renderer) and `tests/fixtures/example-project*`; [example-profile.test.ts](../../tests/example-profile.test.ts) | One deliberately non-CORE-001 synthetic profile builds through the same entry points, and the generic core needed no change (`spec/lib/` untouched by the PR) | That a real second profile works, that the primitive set is sufficient, or that the public contract is implemented. A synthetic profile is weak genericity evidence (plan [§2](m1-implementation-plan.md), [§16](m1-implementation-plan.md)) |
| Issue #33 acceptance | closed by the maintainer at 2026-11-02T00:38:44Z | The acceptance criteria are marked complete in the issue; no further evidence artifact | That the maintainer accepted PR 7's evidence for the stated criteria | Separate independent verification of each criterion beyond that closure (see [§7](#7-verification-evidence-audit)) |

**Baseline before M1.** The plan records 16 tests, a 298-line artifact with SHA-256
`a29ce609269a8ad9185ed50576d4e6276b586f740d2ea8b4ef7f06f6c05988df`, and 15 diagnostics
(0 error, 5 review-required, 10 warning) at `2ace388`
(plan [§1](m1-implementation-plan.md)). At `f1ddcf7` the artifact is still 298 lines with the
same SHA-256 (verified locally, [§10](#10-audit-method-and-recorded-evidence)), so the M1
sequence did not change CORE-001 normative content or the generated bytes.

---

## 5. What the contract promises versus what M1 implements

The accepted contract describes the engine's full public surface. M1 delivered a bounded slice
of it. These are different kinds of claim and are not interchangeable:

- **Promise accepted but not implemented:** the public API and operations (D7; row K2, §3.9),
  the contract CLI (row K3, §3.9), three-axis diagnostics and per-code blocking (D8, D9;
  [G2](#36-diagnostics-shape-codes-and-phases), H3), provenance hardening (accepted 2026-11-02;
  V4).
- **Proposed but not implemented:** `BuildStatus` and exit code 2 (D18), code namespacing (D17),
  rule primitives (D15; R4), multi-source (D21; A2), typed review dimensions (D24; R5), packaging
  and publication (D14, D20, D29; X1–X2), runtime matrix (D19; X4).
- **A code comment is staler than the contract:** `RenderOptions.diagnostics` exists and is
  required by contract [§11](engine-public-contract.md), but
  [render.ts:27](../../spec/lib/render.ts#L27) still calls it a "proposed contract extension"
  (see [§8](#8-documentation-drift-and-smallest-corrections)).
- **Deferred:** isolated hook execution (D32; B4), conformance execution (D27; N2), self-hosting
  (D26; X3) and the M2–M5 milestone program (X5).
- **M1 narrowings that are deliberate, not accidental:** one renderer and one artifact per build
  (O3), `review` opaque inside `fields` (R5), legacy diagnostic codes preserved verbatim (G1),
  severity-based blocking (H2), source quote verification in the profile hook (V3) recorded as a
  verification status (V5).

The contract's own limit applies: a successful build is evidence of internal consistency, not of
normative correctness (contract [§1.1](engine-public-contract.md), [§6.3](engine-public-contract.md)).

---

## 6. Known gaps and limitations

Each item is a limitation of this commit, not a task list. Evidence is linked.

1. **No capability is independently verified.** No human review in the M1 record states that the
   behavior was checked independently of its author. Details and the raw evidence are in
   [§7](#7-verification-evidence-audit).
2. **Genericity evidence is synthetic and therefore weak.** PR 7 proves that one deliberately
   small profile with different kinds and vocabulary runs through the same pipeline; it does not
   prove a real second profile or an HTTP API profile (A5, A4; plan [§2](m1-implementation-plan.md),
   [§16](m1-implementation-plan.md)).
3. **Quote verification is profile-owned, not core-enforced, and is now recorded.** The core
   binds provenance shape and the declared source and stores a `ProvenanceVerification`; the
   profile verifier calls the adapter and supplies the outcome (V3, V5; plan
   [§8.3–8.4](m1-implementation-plan.md)). D25 is `proposed`, so this is not a violated decision.
4. **The locator is coarse and the source is not pinned by a declared digest.** It addresses a
   section, a table column or a list item, not a paragraph or line range. A
   `VerificationRecord` now records the SHA-256 of the bytes actually checked, but the accepted
   `identity.sha256` pin check of RFC #4 is not implemented and stays V4's scope.
5. **The extension closure is a guard, not a sandbox.** The static import scan skips computed
   specifiers, `createRequire`, `process.binding` and runtime file access; determinism of trusted
   extensions remains an author obligation (B3, B4;
   [build-identity.md](build-identity.md) "Static import scan").
6. **One source is the only source exercised.** The loader loops over declared sources and the
   manifest type allows a list, but M1 requires at least one source, the hook consumes `sources[0]`,
   and no test or fixture builds a two-source project (A2).
7. **Multi-source, review dimensions, typed `ReviewState`, per-code blocking, rule primitives and
   conformance execution are absent from the code**, not merely undocumented (R4, R5, H3, N2, A2).
8. **Diagnostics are narrower than the contract and carry legacy strings.** No `disposition`,
   `phase`, `data` or object `location`; `REVIEW_REQUIRED` is a severity, not policy; `ERR_*` /
   `REVIEW_*` / `WARN_*` names are not namespaced; exit codes are 0/1 only (G1, G2).
9. **The public API and CLI are not the contract's.** Only `runBuild` exists; there are no
   `loadProject`/`validateProject`/`buildProject`/`renderModel`/`checkArtifacts` exports and no
   `validate`/`build`/`check` subcommands (K2, K3).
10. **Nothing is packaged.** `package.json` is private with no `exports`; adapter and renderer
    "packages" are local modules (X1, X2).
11. **Conformance is declarative only.** Vectors are stored and cross-checked; no scenario is
    executed and no implementation is evaluated (N1, N2).
12. **M1 decisions narrowed the contract and the contract text still says "not started."** The
    narrowing is recorded in the plan, but the stale status lines remain in the contract and the
    plan headers, alongside a stale test count in the README and design record
    ([§8](#8-documentation-drift-and-smallest-corrections)).

---

## 7. Verification evidence audit

**What was audited.** All review records, review comments and conversation comments on the M1
PRs (#17, #20, #24, #29, #34, #42, #46), the documentation and decision PRs (#14, #16, #23, #28,
#45), the closure of Issue #33 and the CI result for the baseline commit, read with `gh` on
2026-11-02.

Only two non-bot contributor accounts act in this repository: `zaebee` (human maintainer, who
performed every merge on `main`) and `it-start` (the automated agent).
`gemini-code-assist[bot]` is the only other reviewer. Eleven of the fourteen PRs in the repository were authored by
`zaebee`, so his reviews there are self-reviews.

| PR / issue | Human review evidence | Bot evidence | Counted as `independently_verified`? |
|---|---|---|---|
| #14 contract | Author/maintainer `zaebee`; no second human reviewer | `gemini-code-assist[bot]` review passes | No — decision evidence, not implementation verification |
| #16 M1 plan | Maintainer-authored and merged; approvals recorded in the plan text for §3, 7, 8, 13 | none | No — decision evidence |
| #17, #20, #23, #24, #29, #34 | Commits and PRs authored by `zaebee`. The review comments address the implementation as if reviewing another author ("Thanks for the implementation", "I independently inspected the changed implementation"), but they are the author's own reviews of commits he authored; #23 and #24 even label a self-review "independent" | `gemini-code-assist[bot]` | No — self-review; the reviewer is the commit author |
| #42 build identity | `zaebee` (non-author) reviewed the implementation against #32 and found two gaps (relative imports escaping the closure, literal dynamic imports in template interpolations) and asked for regression tests and a green suite. `it-start` pushed a fix; **no human comment or review confirms the remediation**, and the PR was merged 12 minutes later | `gemini-code-assist[bot]` | No — substantive review, but a change request whose remediation was never confirmed; merge is not verification |
| #46 PR 7 | `zaebee` (non-author) submitted an `APPROVED` review with an empty body at 2026-11-02T00:34:21Z on head `a4efd8336`, then closed #33 as completed at 2026-11-02T00:38:44Z. The head was rewritten after the earlier reviewed commit `8d464fb` (same tree `6672cd9`, different first parent and a `Co-authored-by: zaebee` trailer); the only claim that the reviewer inspected that commit is the agent's own #33 report | `gemini-code-assist[bot]`; the author resolved its comments | No — an empty-body approval and an issue closure do not state that any behavior was verified; authorship is also ambiguous |
| #28 AGENTS.md (docs only) | `zaebee` (non-author) submitted an `APPROVED` review with an empty body for `it-start`'s documentation PR | `gemini-code-assist[bot]` | No — documentation, an approval event with no written verification |
| Baseline CI | — | `check` workflow on `f1ddcf7`: success ([run 41368060195](https://github.com/agent-federation/contract-builder/actions/runs/41368060195)) | No — green CI is explicitly not independent verification |

**Result.** The independent-verification column is `—` for every row. This is a factual finding of
the snapshot, not a claim that the behavior is wrong or that no review happened. The human
reviews above are real; they are review-of-work, and none records a verification of behavior
against the contract. `zaebee`'s own M1 text also distinguishes directed decisions from
independent verification: the plan says M1 proves separability, not genericity, and PR 7 is
"weak evidence" (plan [§2](m1-implementation-plan.md), [§16](m1-implementation-plan.md)).

**What would let a row carry `independently_verified`.** A maintainer or distinct reviewer states
in the PR, issue or matrix review that they checked the specific behavior (for example "I ran the
identity tests and confirmed the digest excludes mtimes", or "I verified the example profile is
selected by the registry") and links that statement. A review that only requests changes, an
empty approval, a merge, closed tracking issues and green CI are insufficient on their own
(Issue #39 constraint I4 / acceptance A6).

---

## 8. Documentation drift and smallest corrections

Recorded, not silently rewritten. The "correction" column is the smallest change that would make
each document true; this audit PR itself only adds the matrix and the cross-links.

| Document | Stale or conflicting claim | Evidence at `f1ddcf7` | Smallest correction |
|---|---|---|---|
| [README.md](../../README.md#L14) | "`bun test` — 82 теста" | 133 tests pass across 10 files ([§10](#10-audit-method-and-recorded-evidence)) | Change the count to 133 |
| [design record §6](../superpowers/specs/2026-11-01-core001-spec-builder-design.md) | "16 автоматических тестов" | 133 tests | Change to 133 and drop the fixed count in favour of `bun test` |
| [design record](../superpowers/specs/2026-11-01-core001-spec-builder-design.md) §2 / §8 | "MVP реализован" with "локатор источника привязан к разделу" presented as the limit; "Support several sources либо оставить ограничение" listed as next step | The source locator is unchanged; the RFC (#45) now records an accepted replacement (V4) | Add one line pointing to [provenance-hardening-rfc.md](provenance-hardening-rfc.md) as the accepted next step |
| [engine-public-contract.md](engine-public-contract.md#L7) header | "Implementation status: not started" | M1 is implemented and tested (rows P1–H2, B1–B3, O1–O2, A1/A3/A5) | Replace the line with a pointer to this matrix |
| [m1-implementation-plan.md](m1-implementation-plan.md#L7) header | "Implementation status: not started" | M1 PRs 1–7 are merged and tested (§4) | Replace the line with a pointer to this matrix |
| [README.md](../../README.md#L32) "Структура" | Lists `spec/lib/` without `extension.ts`, `identity.ts`, `adapters/index.ts`, `profiles/core001/{context,slice,text}.ts`, `tests/identity.test.ts`, `tests/example-profile.test.ts`, `profiles/example/` | These files exist at `f1ddcf7` | Add the missing entries (or state that the list is illustrative) |
| [AGENTS.md](../../AGENTS.md) "Layout" | Test list omits `identity.test.ts` and `example-profile.test.ts`; profiles list omits `context.ts`, `slice.ts`, `text.ts` | Files exist | Add them to the layout list |
| [render.ts:27](../../spec/lib/render.ts#L27) comment | Calls `RenderOptions.diagnostics` a "proposed contract extension" while the accepted contract requires it | Contract [§11](engine-public-contract.md) lists `diagnostics` as required | Delete the stale comment sentence (code-neutral) |
| [engine-public-contract.md](engine-public-contract.md) §18 / [m1-implementation-plan.md](m1-implementation-plan.md) §12 | The contract's M2 corrections and M1 narrowings are consistent with the code, but no document records the *current* state | This matrix ([§5](#5-what-the-contract-promises-versus-what-m1-implements)) | Keep the decision text; rely on this matrix for status |

The status lines and the two test counts are factual records, not architecture decisions, so
correcting them would not violate the "do not re-decide" constraint; they are deferred here to
keep this PR audit-only. The header annotations added by this PR already point at the current
status, so no reader is misled in the meantime.

---

## 9. Maintenance rule

Any future change to public behavior or contract status must update the relevant row of this
matrix in the same pull request, with the same evidence links (decision, code, test or explicit
review). A row is not updated by editing this file after the fact: the PR that changes the
behavior carries the row change, so the matrix cannot drift from the code. No new automation,
validator or status enum is introduced for this; the rule is review convention, like the
repository rules in [AGENTS.md](../../AGENTS.md).

When a row's evidence becomes false — a code path moves, a test is deleted, a decision is
revisited — that is a matrix defect: fix the row in the same PR or mark the dimension `—` and say
why.

---

## 10. Audit method and recorded evidence

**Evidence method.** Read Issue #39, the accepted contract, the M1 plan, `build-identity.md`, the
provenance RFC, the README and the design record; read every source and test file cited above at
`f1ddcf7`; read the GitHub review and comment record for #14, #16, #17, #20, #24, #29, #34, #42,
#45, #46 and Issue #33 with `gh`; then ran the repository checks below. Implementation status was
taken from the code, not from PR descriptions or design documents.

**Recorded run at the audited commit (2026-11-02, local checkout).**

```text
bun test            → 133 pass, 0 fail (10 files, ~11.6s)
bun run typecheck   → clean (tsc --noEmit)
bun run check       → clean; generated artifact matches a fresh in-memory build
sha256sum spec/output/CORE-001.draft.md
                    → a29ce609269a8ad9185ed50576d4e6276b586f740d2ea8b4ef7f06f6c05988df  (298 lines)
```

CI on the audited commit: `.github/workflows/ci.yml` job `check`
(`install --frozen-lockfile`, `typecheck`, `test`, `check`) succeeded —
[run 41368060195](https://github.com/agent-federation/contract-builder/actions/runs/41368060195).

**Not done by this audit.** No runtime code, test, schema, fixture or generated artifact was
changed; CORE-001 normative content was not touched; no contract/M1 decision was re-decided;
the generated artifact hash above was not modified.
