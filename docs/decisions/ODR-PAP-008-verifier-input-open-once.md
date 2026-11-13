# ODR-PAP-008 — Owner Decision Record: verifier input open-once semantics

**Status:** APPROVED — the maintainer accepted option A with corrections in
[#287 comment 6850514836](https://github.com/agent-federation/contract-builder/issues/287#issuecomment-6850514836)
(2026-11-13). This record publishes the durable decision, the binding implementation design and the
RFC erratum; it authorizes documentation updates only. Implementation is a separate issue, opened
after this record is merged.
**Date:** 2026-11-13 (UTC)
**Decision scope:** the verifier's input-read semantics (RFC §4.3.2 and threat table T16) and the
implementation design that makes the one-open guarantee possible without changing digest framing,
digest values, limits or report semantics.
**Baseline:** `contract-builder` main `0bb013e` (2026-11-13).
**Related:** [#287](https://github.com/agent-federation/contract-builder/issues/287),
[ODR-PAP-004](ODR-PAP-004-phase-2a-stage-1-implementation-authorization.md),
[RFC §4.3.2](../architecture/portable-assurance-package-rfc.md) and T16, `pap/src/input.ts`,
`pap/src/paths.ts`, `pap/src/verify/loading.ts`.

## 1. Context

The RFC requires the verifier to open each path without following symlinks, "read the bytes once,
and hash exactly the bytes read" (§4.3.2), and threat table T16 states "each file is opened once
and hashed from the same descriptor; byte counts and digests come from that read; the policy file
is read once and digested; no re-read by path".

The reference verifier does not meet that today. For every declared input it performs **three
reads through three separate opens**:

1. `pap/src/input.ts` `hashInput()` → `analyzeInput()` — determines the LF/raw mode and the
   normalized size (first full stream);
2. `hashInput()` → `streamInputBytes()` — hashes the same bytes for `pap.input.file.v1`;
3. `pap/src/verify/loading.ts` → `normalizedInputSetDigestStream()` — re-streams every input in
   ascending path order for `pap.input.set.v1`.

Two properties of the existing format make a literal single read impossible without changing
published digests: both framings place the **normalized size before the content bytes**, and the
set digest is ordered by **path** while per-file results follow **manifest order**.

## 2. Decision

**Adopt option A: one open per declared input, bounded passes over the same descriptor.**

The precise guarantee, as directed by the maintainer:

> Each declared input is opened once. All bounded passes read through that same descriptor; the
> pathname is never re-resolved. This prevents pathname replacement from redirecting later passes,
> but does not provide an immutable snapshot against concurrent in-place writes. Such mutation
> remains outside the v0.1 threat model.

The implementation must satisfy this guarantee without changing digest framing, digest values,
limits, diagnostics, report identity or CLI behaviour. RFC §4.3.2's "reads the bytes once" is
superseded by the dated erratum in §4; it must not be described as a literal single-read or
immutable-snapshot guarantee.

## 3. Binding implementation design

The issue following this record must implement this design, or report `needs-decision` if it cannot.

**Phase 1 — plan, manifest order, no content read.**
Resolve each declared input once (containment, no symlinks, regular file), `stat` its raw size, and
charge the `totalPayloadBytes` budget in manifest order with the existing `fileBytes` cap and the
existing stop-at-first-overflow rule. Store the per-input plan (`path`, `cap`, evaluable/limited).
This preserves which inputs are limited by the total budget without reading content.

**Phase 2 — content, ascending path order, one open per input.**
For each evaluable input: open once without following symlinks; **pass 1** re-runs the existing
analysis to determine mode (`lf`/`raw`) and `normalizedSize`; `seek(0)`; **pass 2** is a single
content read that feeds **two** hashers at once — the per-file hasher (`pap.input.file.v1`, framed
with path and `normalizedSize`) and the set hasher (`pap.input.set.v1`, the same framing, in
ascending path order). The per-file result is stored keyed by input; the set hasher accumulates in
path order. Close the descriptor in `finally` on every path (success, limit, read/seek failure,
exception). At most one input descriptor is open at a time; the implementation must not depend on
`payloadFiles` as a descriptor budget. Paths are never reopened for the set pass.

**Preserved behaviour:** LF/raw classification, normalized sizes, all digest values, limit
diagnostics and ordering, report identity and CLI output. Short reads or seek failures map to the
input's existing failure class (`pap.package.io`), never to a silent skip.

**Documented narrow difference:** because the budget is planned from `stat` sizes before content is
read, an unreadable or racing input releases its planned charge and reports its existing I/O
diagnostic; the conformance and hostile-input corpus must confirm that the specified fixtures and
limit vectors keep their exact diagnostics. If a corpus case changes, the implementation issue must
call it out rather than adjust expectations silently.

**Tests (binding):**

- an instrumented filesystem counts opens and asserts exactly one open per successfully opened
  declared input, with no path resolution or open after the first;
- pathname replacement after the first open: the later passes still use the originally opened
  object;
- concurrent in-place mutation is exercised to demonstrate the limited guarantee, without claiming
  snapshot consistency;
- seek/read failures and short reads; descriptor cleanup on every failure path;
- manifest-order total-byte-budget behaviour (the same input is limited as today) and ascending-path
  set-digest ordering;
- existing LF/raw, hostile-input, path-safety and limit suites, plus the full conformance corpus.

## 4. RFC erratum (dated 2026-11-13)

> **Input hashing clarification (ODR-PAP-008, 2026-11-13).** Each declared input is opened once and
> all processing reads are performed through that same file descriptor. Because the existing
> size-prefixed digest framing requires the normalized size before the content bytes, processing
> uses bounded passes over the descriptor (analysis, per-file digest, and input-set digest
> contribution). The pathname is not re-resolved between passes. This is an open-once guarantee,
> not a literal single-read or immutable-snapshot guarantee; concurrent in-place mutation is
> outside the v0.1 threat model. Digest framing and digest values are unchanged.

The note is added to RFC §4.3.2 and referenced from T16 in the same pull request that carries this
record.

## 5. Consequences and non-goals

- This record changes documentation only: no verifier behavior, schema, fixture, conformance case,
  digest or generated artifact changes.
- It does not authorize the implementation; the implementation issue is opened only after this
  record is merged, within the design above.
- Non-goals: an immutable-snapshot guarantee, a literal single-read guarantee, protection against
  concurrent in-place writes, buffering all inputs, temp-file copies, and any change to the
  `pap.input.file.v1` / `pap.input.set.v1` framing or values.
- The open-once guarantee is about pathname resolution and descriptor identity; it does not upgrade
  the general filesystem threat model, which stays as recorded in T16 and §10.

## 6. Owner approval

The maintainer's decision is recorded in
[#287 comment 6850514836](https://github.com/agent-federation/contract-builder/issues/287#issuecomment-6850514836):
"**Accept A, subject to the descriptor-lifecycle/resource-bound design and the guarantee wording
above.**" The same comment requires the RFC amendment to stay explicit and states that no
implementation or follow-up issue is opened until the decision is recorded. This record is that
recording; it becomes durable when the pull request carrying it is merged.
