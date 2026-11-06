# ODR-ART-001 — Owner Decision Record: artifact presentation envelope

**Status:** APPROVED — maintainer directive in [#212](https://github.com/agent-federation/contract-builder/issues/212) (2026-11-06) to implement C5 under design note §6/D6 as documentation and decision only. Template/artifact implementation is the separate C5b follow-up recorded in §5.
**Date:** 2026-11-06 (UTC)
**Decision scope:** the top-level presentation envelope of generated contract artifacts — which elements every artifact exposes, which are mandatory, recommended or profile-specific — plus the element-by-element mapping of the current CORE-000 and CORE-001 drafts. It does not decide substantive contract content, domain vocabulary or the release gate semantics.
**Baseline:** `main` [`6fa3c28`](https://github.com/agent-federation/contract-builder/commit/6fa3c28e0605253e1d8a0bfc5e5cbf6733d07e15) (C1–C4 merged). Line anchors in §3 refer to that revision.
**Related:** artifact-envelope audit [#130](https://github.com/agent-federation/contract-builder/issues/130), stream C [#170](https://github.com/agent-federation/contract-builder/issues/170), C5 [#212](https://github.com/agent-federation/contract-builder/issues/212), design note [sdlc-pipeline.md §6](../architecture/sdlc-pipeline.md#6-artifact-envelope-130-separate-slice), [CORE-000 draft](../../contracts/core000/output/CORE-000.draft.md), [CORE-001 draft](../../spec/output/CORE-001.draft.md).

## 1. Context

The two generated contract artifacts have different bodies and different consumers, but no stated common presentation contract: a reader cannot tell from the artifact which top-level fields are build metadata, which are the source-of-truth notice, which are diagnostics or gating, and which are the profile's substantive content. The audit recorded this as [#130](https://github.com/agent-federation/contract-builder/issues/130); the stream-C design note proposed the envelope in §6 and decision **D6**.

The envelope is deliberately **presentation-only**. It does not merge the CORE-000 domain model (engine components, interfaces, claims, evidence) with the CORE-001 domain model (provisions, quotes, conformance vectors, provenance), and it does not require them to share substantive sections, headings, wording or language. The bodies remain profile-specific and independently owned.

C1–C4 (PAP package mapping, provenance/relations claims, trust policy and gate, CI job) are merged at the baseline. C5 records the decision and the current mapping; C5b implements the missing elements in the renderers/templates and regenerates the artifacts. C5 intentionally changes no `spec/`, `profiles/`, `contracts/` or `pap/` file.

## 2. Decision

### 2.1 Definition

A generated contract artifact exposes an **envelope**: the top-level presentation elements that identify the document, state how it was generated and what it covers, identify the build, and summarize diagnostics and gating. The envelope is a contract about element presence and meaning, not a shared template. Each profile chooses its own labels, language, layout and section order.

### 2.2 Envelope elements

| # | Element | Status | Minimum content |
|---|---|---|---|
| 1 | Document/project identity + revision | **mandatory** | A visible title and a stable document/project identifier, plus the revision of the source or project it renders. For a sliced document, the slice id and the included sections are part of the identity, not removable decoration. |
| 2 | Generated/source-of-truth notice | **mandatory** | A visible statement that the artifact is generated, must not be hand-edited, and is not the source of truth; the declared inputs are authoritative. The notice belongs in the artifact, not only in repository documentation. |
| 3 | Build mode + scope/exclusions | **mandatory** | The build mode (`draft`/`release`), the rendered scope (project or slice), and any explicit exclusions or limitations. A sliced artifact must state which sections are included and excluded. |
| 4 | Profile/renderer identity + build identity where available | **mandatory where available** | Profile id and version; renderer id and version; and, when the engine makes them available to the renderer, `engineVersion`, `manifestVersion` and `inputDigest`. Values must never be fabricated. `BuildResult.identity` is computed on every successful build; making it available to the renderers is C5b work (§5). |
| 5 | Diagnostic/gating summary | **mandatory** | Counts by severity (`ERROR`, `REVIEW_REQUIRED`, `WARNING`), derived from the emitted diagnostics (not from a declared diagnostic catalog), and the gating conclusion: whether the `release` mode is permitted or blocked and why. Full diagnostic detail may live in an appendix or a separate section. |
| 6 | Stable section order | **recommended** | Within one profile, the order of body sections is stable across builds. The order is profile-local: no cross-profile ordering or shared headings are required. |
| 7 | Substantive body | **profile-specific** | The profile's own content — sections, vocabulary, language and layout. This element is never standardized by the envelope. |

**Mandatory** means a future implementation must render the element for an artifact to claim envelope conformance. **Recommended** means the profile should keep it stable but the envelope does not gate on it. **Profile-specific** means the envelope imposes no content requirement beyond the profile's own contract.

`engineVersion` and `manifestVersion` identify the build that produced the artifact, not the document being rendered, so they are classified under element 4 even though the design note's CORE-000 cell lists `engineVersion` next to project identity. Document identity (element 1) is the contract/project id and its revision; build identity (element 4) is the engine/renderer/profile that produced it. The separation matters when a document is rebuilt by a different engine or profile.

The envelope is a documented convention, not a JSON schema and not a template. C5 records it; C5b adds focused artifact tests for conformance. The envelope never constrains the substantive body beyond the profile's own contract.

### 2.3 Invariants and non-goals

- **No domain-model merge.** The envelope does not merge CORE-000 and CORE-001 models, ontologies, claim/provision semantics or source documents.
- **No shared substantive sections or vocabulary.** CORE-000 sections (components, interfaces, trust boundaries, claims, evidence) are not required in CORE-001, and CORE-001 sections (terms, provisions, quotes, conformance vectors, provenance matrices) are not required in CORE-000. The envelope is not a template for the body.
- **No forced language or wording.** CORE-001 is rendered in Russian; CORE-000 is rendered in English. The envelope permits that; only the element semantics are shared.
- **No legacy-source change.** `CORE-001.legacy.md` is the quoted source; this decision does not change it or authorize changing it.
- **No release-gate weakening.** The diagnostic/gating summary reports the existing gate; it does not create a new pass, relax `REVIEW_REQUIRED`, or make a draft releasable.
- **No artifact or template change in C5.** C5 is documentation/decision only; the implementation belongs to C5b (§5).

### 2.4 CORE-001 slice identity is preserved

The CORE-001 artifact is only the `SLICE-CORE001-10` build (§10.1–10.2 of the legacy source), with sections #4.4.2 and #15 explicitly excluded. It is **not** the complete CORE-001 document. The current artifact states this in its identity block:

```markdown
| Срез | `SLICE-CORE001-10` — §10.1–10.2. Temporal Reference Model: доверие к меткам времени и временная валидация |
| Включает разделы | #10, #10.1, #10.2 |
| Исключает разделы | #4.4.2, #15 |
```

([CORE-001 draft lines 11–13](../../spec/output/CORE-001.draft.md#L11-L13))

The envelope must keep that statement. Rendering profile/renderer/build identity, adding a notice or changing the header layout must not replace the slice with a "complete CORE-001" claim, import excluded sections, or imply that the exclusions are unimplemented parts of the same slice. C5b updates the golden hash only after the slice statement is re-checked.

## 3. Element-by-element mapping (baseline `6fa3c28`)

Legend:

- **present** — rendered and meets the minimum content;
- **partial** — some of the minimum content is rendered, but at least one required part is missing;
- **missing** — no rendered evidence;
- **profile-specific** — the element is the body; assessed only for presence, not for a shared form.

The mapping is a baseline snapshot. C5b updates the statuses as it closes the gaps.

### 3.1 CORE-000 — `contracts/core000/output/CORE-000.draft.md`

| Element | Status | Rendered evidence | Gap for C5b |
|---|---|---|---|
| Document/project identity + revision | **partial** | The title is rendered at [line 1](../../contracts/core000/output/CORE-000.draft.md#L1). The project id `core-000-self-contract` and revision `0.1.0` exist only in the manifest ([lines 3–7](../../contracts/core000/contract-builder.json#L3-L7)); the artifact does not name them. | Render the project id and project revision (and keep the title). |
| Generated/source-of-truth notice | **missing** | The header runs from the title to `**Mode:** draft` and `**Counts:**` with no generated/source-of-truth notice ([lines 1–4](../../contracts/core000/output/CORE-000.draft.md#L1-L4)). | Add a visible notice naming `contracts/core000/` inputs as the source of truth and the artifact as generated and not hand-edited. |
| Build mode + scope/exclusions | **partial** | `**Mode:** draft` is rendered ([line 3](../../contracts/core000/output/CORE-000.draft.md#L3)). No project scope or exclusions are rendered; the manifest declares project identity but no slice. | Render the declared project scope and the artifact's explicit limitations/exclusions. |
| Profile/renderer identity + build identity | **missing** | The header contains no profile id/version, renderer id/version, `engineVersion`, `manifestVersion` or `inputDigest`. The values exist: profile `core000` `0.1.0` ([profile.json lines 1–3](../../profiles/core000/profile.json#L1-L3)), renderer `core000-markdown` `0.1.0` ([renderer.ts lines 23–25](../../profiles/core000/renderer.ts#L23-L25)); the engine computes `BuildResult.identity` ([build.ts lines 290–314](../../spec/lib/build.ts#L290-L314)) but `RenderOptions` passes only mode, templates, labels and diagnostics ([render.ts lines 23–33](../../spec/lib/render.ts#L23-L33)). | Render profile and renderer identity; expose the computed build identity to renderers (a C5b engine/renderer-contract change) or record the unavailable subset explicitly instead of fabricating it. |
| Diagnostic/gating summary | **partial** | `diagnostics=25` in the header is the declared diagnostic-catalog size, not the emitted count ([view.ts lines 474–490](../../profiles/core000/view.ts#L474-L490)). The emitted diagnostics are listed under `## Build diagnostics` ([line 1777](../../contracts/core000/output/CORE-000.draft.md#L1777)): 62 `REVIEW_REQUIRED` and 6 `WARNING` in this baseline ([S2.2 verification](../../tests/core000.test.ts#L1808-L1832)). The header has no severity counts and no summary-level gate/blocked statement; the body records release blocking in two claim statements ([line 1038](../../contracts/core000/output/CORE-000.draft.md#L1038), [line 1447](../../contracts/core000/output/CORE-000.draft.md#L1447)). | Render `ERROR`/`REVIEW_REQUIRED`/`WARNING` counts from the emitted diagnostics and a summary-level gate conclusion; keep the full list or an appendix. |
| Stable section order | **present (recommended)** | Fixed template order: Components ([line 6](../../contracts/core000/output/CORE-000.draft.md#L6)), Interfaces ([58](../../contracts/core000/output/CORE-000.draft.md#L58)), Trust boundaries ([144](../../contracts/core000/output/CORE-000.draft.md#L144)), Phases ([164](../../contracts/core000/output/CORE-000.draft.md#L164)), Transitions ([229](../../contracts/core000/output/CORE-000.draft.md#L229)), Extension points ([233](../../contracts/core000/output/CORE-000.draft.md#L233)), Dependencies ([273](../../contracts/core000/output/CORE-000.draft.md#L273)), Diagnostic catalog ([319](../../contracts/core000/output/CORE-000.draft.md#L319)), Conformance cases ([371](../../contracts/core000/output/CORE-000.draft.md#L371)), Requirements ([375](../../contracts/core000/output/CORE-000.draft.md#L375)), Independent verification ([1773](../../contracts/core000/output/CORE-000.draft.md#L1773)), Build diagnostics ([1777](../../contracts/core000/output/CORE-000.draft.md#L1777)). | Keep the order stable. |
| Substantive body | **profile-specific** | Engine self-contract content: components, interfaces, trust boundaries, phases, extension points, dependencies, diagnostic catalog, claims, source statements, evidence, decisions, independent verification. It contains no CORE-001 provision/quote/vector sections. | Preserve; do not import CORE-001 body sections. |

### 3.2 CORE-001 — `spec/output/CORE-001.draft.md`

| Element | Status | Rendered evidence | Gap for C5b |
|---|---|---|---|
| Document/project identity + revision | **present** | Title at [line 1](../../spec/output/CORE-001.draft.md#L1); `Документ`, `Ревизия источника`, `Исходный файл`, `Срез`, `Включает разделы` and `Исключает разделы` at [lines 8–13](../../spec/output/CORE-001.draft.md#L8-L13). | Keep, including the `SLICE-CORE001-10` identity and exclusions. |
| Generated/source-of-truth notice | **present** | Visible notice at [lines 3–4](../../spec/output/CORE-001.draft.md#L3-L4): generated build artifact, `spec/` inputs are the source of truth, not hand-edited, not the source of normative changes. | Keep. |
| Build mode + scope/exclusions | **present** | Slice/included/excluded sections at [lines 11–13](../../spec/output/CORE-001.draft.md#L11-L13); `Режим сборки` at [line 14](../../spec/output/CORE-001.draft.md#L14). | Keep; the exclusions are part of the slice identity. |
| Profile/renderer identity + build identity | **missing** | The header ([lines 1–22](../../spec/output/CORE-001.draft.md#L1-L22)) has no profile id/version, renderer id/version, `engineVersion`, `manifestVersion` or `inputDigest`. The values exist: profile `core001` `0.1.0` ([profile.json lines 1–3](../../profiles/core001/profile.json#L1-L3)), renderer `core001-markdown` `0.1.0` ([renderer.ts lines 37–39](../../profiles/core001/renderer.ts#L37-L39)); the engine computes the identity but does not pass it to the renderer (same [build.ts](../../spec/lib/build.ts#L290-L314) and [render.ts](../../spec/lib/render.ts#L23-L33) gap). | Render profile and renderer identity; expose and render the computed build identity, or record the unavailable subset explicitly. Keep the slice identity intact. |
| Diagnostic/gating summary | **present** | Severity counts at [line 20](../../spec/output/CORE-001.draft.md#L20): `ERROR=0 · REVIEW_REQUIRED=5 · WARNING=10`; explicit draft/release gate note at [line 22](../../spec/output/CORE-001.draft.md#L22); full diagnostics in [Appendix B](../../spec/output/CORE-001.draft.md#L302). | Keep. |
| Stable section order | **present (recommended)** | Fixed order: How to read ([line 24](../../spec/output/CORE-001.draft.md#L24)), Terms ([45](../../spec/output/CORE-001.draft.md#L45)), Provisions ([52](../../spec/output/CORE-001.draft.md#L52)), Decisions ([261](../../spec/output/CORE-001.draft.md#L261)), Provenance ([269](../../spec/output/CORE-001.draft.md#L269)), Appendix A ([292](../../spec/output/CORE-001.draft.md#L292)), Appendix B ([302](../../spec/output/CORE-001.draft.md#L302)). | Keep. |
| Substantive body | **profile-specific** | Temporal Reference Model content: terms, provisions, verbatim quotes, conformance vectors, decisions, provenance binding/verification and traceability matrix. It contains no CORE-000 component/claim sections. | Preserve; do not import CORE-000 body sections. |

### 3.3 Gap summary

| Element | CORE-000 | CORE-001 |
|---|---|---|
| Document/project identity + revision | partial — title only | present |
| Generated/source-of-truth notice | missing | present |
| Build mode + scope/exclusions | partial — mode only | present |
| Profile/renderer identity + build identity | missing | missing |
| Diagnostic/gating summary | partial — list, no severity counts or summary gate | present |
| Stable section order | present | present |
| Substantive body | profile-specific | profile-specific |

Both artifacts are currently valid **drafts**, but neither is envelope-conformant. C5 makes no claim that they are; it records what is missing so C5b can close it without touching the bodies.

### 3.4 C5b closure

C5b closes the gaps recorded above. The §3.1–3.2 tables remain the pre-C5b baseline snapshot;
this table records the post-C5b state of each element.

| Element | CORE-000 | CORE-001 |
|---|---|---|
| Document/project identity + revision | present | present |
| Generated/source-of-truth notice | present | present |
| Build mode + scope/exclusions | present | present |
| Profile/renderer identity + build identity | present | present |
| Diagnostic/gating summary | present | present |
| Stable section order | present (recommended) | present (recommended) |
| Substantive body | profile-specific | profile-specific |

CORE-001 keeps `SLICE-CORE001-10` and the §4.4.2/#15 exclusions; C5b adds no CORE-001 body
section. CORE-000 renders emitted severity counts and the release gate conclusion, not the
catalog size. `tests/envelope.test.ts` asserts the mandatory elements, the slice statement and
the profile-specific bodies.

## 4. Consequences

- The envelope is a shared presentation contract, not a shared document. CORE-000 and CORE-001 keep their own bodies, vocabulary, language and section order.
- The CORE-001 artifact remains a slice artifact: `SLICE-CORE001-10`, §10.1–10.2, exclusions #4.4.2/#15. Envelope work must not turn it into a complete-CORE-001 claim, and `CORE-001.legacy.md` is unchanged.
- CORE-000's header currently gives a diagnostic-catalog count, not an emitted-diagnostic count; the envelope requires the emitted severity counts and the gate conclusion in the summary. The body already records release blocking in two claim statements, but not as a summary element. That is a presentation change only; the underlying diagnostics and gate semantics do not change.
- Rendering profile/renderer/build identity is a new artifact field. The engine already computes `BuildResult.identity`; C5b must make it available to the renderers (or record the unavailable subset) and update the implementation-status statement that currently says the identity is never rendered (B1) so the documentation and the artifact agree.
- Because `contracts/core000/output/CORE-000.draft.md` is packaged as the PAP artifact, C5b's new bytes change that artifact's digest and the package identity derived from it. No committed CORE-000 artifact digest is currently pinned in tests (the pipeline tests rebuild the artifact), but C5b must rerun the packaging/determinism checks and update any evidence that quotes the old bytes.
- The decision does not create a new release gate or change `build:release`; the release mode remains blocked by the existing `REVIEW_REQUIRED` diagnostics.

## 5. C5b — separate follow-up

**Status:** implemented by C5b (#215); §3.4 records the post-C5b element status and
`tests/envelope.test.ts` is the artifact check.

C5b is the template/artifact implementation slice. It is explicitly **not** part of C5 and must not be folded into this documentation change.

**Scope**

1. Add the missing mandatory elements to both profile templates/renderers, using each profile's own labels and layout:
   - CORE-000: project id/revision, generated/source-of-truth notice, project scope/exclusions, profile/renderer/build identity, emitted severity counts and gate conclusion.
   - CORE-001: profile/renderer/build identity; keep the existing identity, notice, scope/exclusions and diagnostic/gating block unchanged.
2. Make the computed `BuildResult.identity` available to renderers if the build identity is rendered. `RenderOptions` currently carries only mode, templates, labels and diagnostics; that contract change is in C5b, not C5. Profile and renderer ids are already available (`model.profile`, static renderer metadata).
3. Add focused envelope tests (mandatory elements present; CORE-001 slice statement intact; no cross-profile body sections) in addition to the existing golden and CORE-000 checks.
4. Regenerate both artifacts with the repository's artifact rules.

**Golden and determinism requirements**

- **CORE-001:** run `bun run build`; update `tests/golden/core001.draft.sha256` in the same pull request and state the reason, as `tests/golden.test.ts` requires for an intentional artifact change. The diagnostic snapshots (`core001.diagnostics.json`, `core001.emission.json`) stay byte-identical because the envelope adds no diagnostics.
- **CORE-000:** regenerate with the Q9 copy-from-temporary-workspace procedure in `AGENTS.md`; run `bun test tests/core000.test.ts -t "S2.2 artifact verification"` to prove the committed bytes rebuild identically. The envelope must not change the 68-diagnostic multiset or the existing gate; the test's counts remain the guard.
- **Determinism:** the artifacts remain pure functions of the declared inputs, options and templates — no clock, timestamps, absolute paths, host data or environment data. Build twice and compare bytes; `bun run check:all` must be green. The CORE-000 packaging tests (`bun test pipeline/tests`) must still pass with the new artifact bytes.
- **Scope guards:** no `CORE-001.legacy.md` change; no domain content, section or vocabulary change; no release-gate change; no `pap/` semantics change.

**Out of scope for C5b:** choosing a shared template, unifying the two bodies, adding new substantive sections, changing the diagnostic catalog, changing the trust policy or merging the domain models. Any of those needs its own decision.

## 6. Verification of this decision record

- `bun run typecheck`, `bun test` and `bun run check:all` are green on the C5 branch; the change is docs-only.
- `git diff --stat` touches only `docs/`; `spec/output/CORE-001.draft.md` and `contracts/core000/output/CORE-000.draft.md` are byte-unchanged.
- The mapping above re-checks the claims against the baseline artifacts and the engine's render path; no template, renderer or artifact was modified in C5.
- The CORE-001 identity statement and the `SLICE-CORE001-10` exclusions are quoted and preserved.
