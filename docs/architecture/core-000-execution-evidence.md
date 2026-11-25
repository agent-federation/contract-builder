# CORE-000 execution evidence (S2.3)

Human-readable summary of the producer-generated S2.3 run evidence persisted under
`evidence/core000/<run>/result.json` (P-2/P-6). Each JSON record is the transient harness
evidence for one run, committed verbatim; this page is the summary, not a substitute.

S2 creates **zero** independent-verification records; every record below is producer
self-build evidence only. `H2_reproducibility` is `NOT_TESTED` and
`H3_independent_verification` is `NOT_PERFORMED` in every record.

Base commit for all runs: `699ea3338c200a2628866a4ad5e17d6949ddc5d2` (post-#326 `main`),
Bun 1.4.2, linux/x64. The committed artifact
`contracts/core000/output/CORE-000.draft.md` is byte-identical to the pre-S2.3 draft:
S2.3 changes no declared input (P-3), verified by the `S2.2 artifact verification` test.

## Runs

| Run | Mutation | Expected outcome | Observed |
|---|---|---|---|
| `S2.3-POSITIVE` | — | exit 0; unblocked; 62 `independent-verification.missing` reviews + 6 `surface.claim-missing` warnings; 0 errors | match |
| `S2.3-RELEASE` | — | exit 1; blocked by `review`; no release artifact | match |
| `S2.3-GUARANTEE-CONDITIONS` | `guarantee-conditions` | exit 1; blocked by `errors`; exactly one added `core000.claim.unsupported-guarantee` (`C000-CT-011`) | match |
| `S2.3-INTERFACE-OWNER` | `interface-owner` | exit 1; blocked by `errors`; exactly one added `core000.model.interface-owner-mismatch` (`IF-BUILD-IDENTITY`) | match |
| `S2.3-EVIDENCE-LOCATOR` | `evidence-locator` | exit 1; blocked by `errors`; exactly one added `core000.evidence.locator` (`EV-CODE-SPEC-LIB-IDENTITY-TS`, whitespace-only locator) | match |
| `S2.3-EVIDENCE-ORPHAN` | `evidence-orphan` | exit 0; unblocked; exactly one added `core000.evidence.orphan` warning (`EV-CODE-SPEC-LIB-IDENTITY-TS-604-SPEC-LIB-IDENTITY-TS-753`) | match |

Each mutation run differs from the baseline by exactly its one focused finding and no
removed baseline finding (asserted in `tests/core000.test.ts`).

## Method notes

- The `surface.claim-missing` focused case is synthetic (in-memory model) rather than a
  harness mutation: every public surface in the accepted register is covered by at least
  two active claims, so no single-field mutation isolates one added warning. This is the
  #136 stop condition ("a focused negative case cannot be isolated to exactly one
  mutation"); the real-register behavior stays pinned by the S2.2 positive assertions
  (exact six warning entity IDs).
- Harness mutations are deterministic one-field edits applied to fresh temporary copies
  only; the repository checkout is never a mutation or write target.
