# RFC: Stronger provenance — paragraph locators and a source-document digest

**Status:** proposed for maintainer decision. This is an RFC, not an accepted decision record:
every choice below is `proposed` unless it restates a decision already directed elsewhere.
**Issue:** [#4](https://github.com/agent-federation/contract-builder/issues/4) — «Усилить
provenance: блочный локатор и хеш исходного документа».
**Baseline:** `e8c917f` (main after #42; the RFC branch merged main in `a504fdd`).
**Document version:** 1.0
**Implementation status:** not started. This change is documentation only; no code, data or
generated artifact is modified by the RFC pull request.

**Related:** [#37](https://github.com/agent-federation/contract-builder/issues/37) (binding
vs verification), [#32](https://github.com/agent-federation/contract-builder/issues/32)
(`inputDigest`), [#5](https://github.com/agent-federation/contract-builder/issues/5)
(multi-source); `docs/architecture/engine-public-contract.md` §3.1, §5.2 step 7, §8.1, §11,
§16 (M4); `docs/architecture/m1-implementation-plan.md` §8;
`docs/architecture/build-identity.md` (implemented in #42); the design record
`docs/superpowers/specs/2026-11-01-core001-spec-builder-design.md` §7 item 7 and §8;
`README.md` sections «Гарантии» and «Ограничения MVP».

> **Reading statuses.** `proposed` — a decision this RFC asks the maintainer to approve.
> `directed` — already accepted in the engine public contract or the M1 plan; the RFC only
> restates it. `deferred` — deliberately not in this increment, with a condition to revisit.
> `unresolved` — open question listed in §10. Nothing here is accepted on the author's own
> judgment.

---

## 1. Summary

Issue #4 asks for three things: a finer source locator than a section, an integrity pin on the
source document itself, and tests that prove both. The current implementation verifies a quote
against a *section* span, a *table row* or an *ordered list item*
(`spec/lib/adapters/markdown.ts:58–122`) and compares only the header line
`UIA-CORE-001 (Rev 0.3.3)` (`profiles/core001/checks/source.ts:11–18`).

This RFC proposes:

| # | Gap today | Proposal | Issue bullet |
|---|---|---|---|
| G1 | A section is one contiguous string: a quote may cross paragraph boundaries, and a `#10` locator also accepts text from the nested §10.1/§10.2. | Numbered **paragraph locators** `#<section>/p<n>` and declared **paragraph ranges** `#<section>/p<s>-p<e>`; the table locator is narrowed to the addressed value cell. The section locator is kept for compatibility but documented as the weak form. | «опциональный `block_id` или диапазон строк» |
| G2 | Editing the legacy document outside quoted fragments is invisible: only the revision header is checked. | A source-byte digest `sources[].identity.sha256` in `contract-builder.json`, verified in the core **before** any quote is checked; a mismatch is an error. | «`document_sha256` в `sources.yml`, проверяемый при сборке» |
| G3 | There is no block identity, so a locator can drift when the document is edited. | A paragraph number is relative to the section's own body; existing fragment IDs (`FRAG-10.1-P2`, `FRAG-10.2-P4-5`) already encode exactly this numbering. Any source edit is surfaced by G2, and the quote check fails in the common case; a re-pin plus a coincidental in-paragraph match remains a human-review risk (§7.2). | «локатор не является стабильным блочным ID» |
| G4 | The README guarantee is imprecise. | Exact wording in §4.6; every new diagnostic is documented in §4.5, the profile catalog and the README. | «Гарантия в README сформулирована точно, новый код ошибки задокументирован» |

Two adjacent precision corrections are proposed as part of the same design: a quote from a
table key cell no longer satisfies a `table/<key>` locator (§4.1.3), and paragraph numbering
explicitly skips list items, table rows, headings and code fences (§4.2).

### 1.1 Recommended decisions

| ID | Decision | Recommendation | Main alternative |
|---|---|---|---|
| L1 | Locator grammar v2: `p<n>`, `p<s>-p<e>`, section/table/item retained | adopt | content-addressed block IDs; sidecar block map; anchors in the legacy file |
| L2 | Paragraph model (section **direct body**, blank-line paragraphs, excluded constructs) | adopt | full CommonMark parse; blank-line-only blocks |
| L3 | Absolute line-span locator `L<s>-L<e>` | `deferred` | include now |
| D1 | Source digest in `sources[].identity.sha256`, raw bytes, core-owned check | adopt | `sources.yml` field; LF-normalised digest; adapter-owned check |
| D2 | Digest mismatch severity | `error` in draft and release | `REVIEW_REQUIRED`; warning with opt-in |
| D3 | Digest absence when the profile maps provenance | `core.provenance.digest-missing`, non-blocking | required field; silent absence |
| D4 | CORE-001 data migration | separate PR after L1+D1, paragraph range `#10.2/p4-p5` for the one cross-paragraph fragment | migrate inside the first PR; split the fragment into two atomic fragments |
| D5 | Table locator narrowed from row to value cell | adopt | keep whole-row matching |

---

## 2. Current state, measured at the baseline

### 2.1 Where provenance verification lives

| Layer | Code | What it does today |
|---|---|---|
| Adapter | `spec/lib/adapters/markdown.ts:31–56` | `parseLocator` accepts `<SOURCE>#<section>`, `#<section>/table/<column>`, `#<section>/<item>`. Returns `null` for anything else. |
| Adapter | `spec/lib/adapters/markdown.ts:58–72` | `locateQuote` resolves the section span, selects a block, and checks a whitespace-collapsed substring. Outcomes: `found`, `outside`, `unknown-locator`. |
| Adapter | `spec/lib/adapters/markdown.ts:91–105` | `sectionSpan` matches headings by their numeric label and ends at the next heading of the same or higher level. |
| Adapter | `spec/lib/adapters/markdown.ts:107–122` | `selectBlock`: `section` → the whole span; `table` → every line whose **first** cell equals the column, i.e. the whole row; `item` → the n-th `^\s*\d+\.\s` line, i.e. ordered items only. |
| Interface | `spec/lib/source.ts:11` | `LocatorResult` is one of `found`, `outside`, `unsupported`, `unknown-locator`. |
| Profile hook | `profiles/core001/checks/source.ts:20–73`, `:75–118` | First checks the quote exists anywhere in the document (`ERR_SOURCE_QUOTE_NOT_FOUND`), then calls `ctx.verifyQuote` and maps outcomes onto `ERR_SOURCE_LOCATOR_UNKNOWN`, `ERR_SOURCE_LOCATOR_MISMATCH`, `ERR_SOURCE_LOCATOR_UNSUPPORTED`. |
| Core | `spec/lib/build.ts:155–167` | Exposes `verifyQuote(sourceId, ref, quote)` over loaded sources; the core itself does not resolve quotes. |
| Core | `spec/lib/ir.ts:188–220` | `loadSources` reads bytes through the adapter and passes `identity` through verbatim. `identity` is validated as `{document, revision}` in `spec/lib/manifest.ts:22–28`, `:383–399`. |
| Core | `spec/lib/provenance.ts` | Binds the three mapped selectors into `ProvenanceBinding`; it does not verify them. |

The engine public contract mirrors this split: the adapter owns locator grammar, the core only
requires that a quote resolves to `found` (contract §5.2 step 7, §11). Verification of the
source document *as a whole* is not specified today.

### 2.2 What the build actually guarantees today

| Claim in `README.md` | Reality at the baseline |
|---|---|
| «цитата действительно из источника» (`README.md:108`) | True: the collapsed quote must occur somewhere in the document (`checks/source.ts:23`). |
| «цитата находится в объявленном месте» (`README.md:109`) | Partly true. It must lie inside the section span, the row or the ordered item — but a section is contiguous, so the quote may cross paragraph boundaries and may live in a nested subsection. A table locator matches the whole row, so a quote from the key cell also passes. |
| source identity | Only `UIA-CORE-001 (Rev 0.3.3)` in the first 500 characters is compared (`checks/source.ts:11–18`). No byte-level pin exists. |

### 2.3 The three gaps, demonstrated on CORE-001

**G1 — a section is not atomic.** `#10.2` resolves to lines 999–1016 (heading to the next
same-level heading). A quote made of the two paragraphs at lines 1013 and 1015 passes a
section-level check because `collapse` joins the whole span, even though the quote crosses a
blank line and a paragraph boundary. That is not hypothetical: the data already does it.
`FRAG-10.2-P4-5-REVOCATION` is exactly such a two-paragraph quote
(`spec/sources.yml:42–45`). Likewise, `#10` covers §10.1 and §10.2, so a quote from §10.1 would
satisfy a `#10` locator.

**G2 — edits outside the quoted fragments are invisible.** The header check only proves that the
document claims revision 0.3.3. Editing, for example, a sentence in §10.3 or any line in
§4 keeps the build green and keeps every quote "verified" - against a document that is no
longer the declared source. The only integrity control today is the human-readable header.
`sha256sum CORE-001.legacy.md` at the baseline is
`f40876bb3b3f38c068e4e094a715709836dafc587eae8434ecddba69df981db1`.

**G3 — no block identity.** A section/row/item locator has no notion of a paragraph. The data
model already names paragraphs in its IDs: `FRAG-10.1-P2-TRUST-CONDITION`,
`FRAG-10.1-P5-NO-GLOBAL-TIME`, `FRAG-10.2-P1-MOMENT-DEFINED`, `FRAG-10.2-P4-5-REVOCATION`,
`FRAG-10-P-NOT-INTERCHANGEABLE`. The `P<n>` part is a paragraph ordinal relative to the
section, but nothing checks it. Introducing it as a locator gives the reference a
machine-verified paragraph anchor and the issue's "block id" without editing the read-only
source. It does not yet check that the `P<n>` in a fragment ID equals the ordinal in its
`source_ref`: that agreement is currently by convention, and a small profile check could enforce
it later (not part of this increment).

### 2.4 Measured surface (for sizing only)

On the refreshed baseline (after #42) `bun run typecheck`, `bun test` (117 tests across 9
files) and `bun run check` are green; the draft artifact is unchanged at 298 lines with SHA-256
`a29ce609269a8ad9185ed50576d4e6276b586f740d2ea8b4ef7f06f6c05988df` and 15 diagnostics
(0 error, 5 `REVIEW_REQUIRED`, 10 `WARNING`). These numbers matter because two proposed
increments differ in whether they touch the golden baseline (§5.3, §7.3).

### 2.5 Boundaries with neighbouring issues

- **#37 (binding vs verification).** This RFC adds one concrete verification check (document
  digest) and one stricter locator; it does **not** introduce a `VerificationRecord`, a
  verification status dimension or a way for outputs to distinguish bound-but-unverified
  provenance. That remains #37's scope. The digest introduced here is an input to such a
  record, not a replacement for one.
- **#32 (`inputDigest`, implemented in #42).** `inputDigest` is a derived identity of *all*
  build inputs and extension closures, computed to make reproducibility checkable; it is
  documented in `docs/architecture/build-identity.md`. `identity.sha256` is a declared
  *expectation* owned by the project. They answer different questions ("what went into this
  build?" vs "is this still the source we pinned?") and must not be conflated. `inputDigest`
  normalises text input and source bytes to LF (contract §8.1); `identity.sha256` deliberately
  does not. Adding the digest to the manifest changes the canonical manifest record and
  therefore `inputDigest` — expected, and covered in §7.3.
- **#5 (multi-source).** The digest is declared per source and checked per source, so it scales
  with the manifest array, but this RFC does not change the current single-source limitation.
- **Signing / authenticity (#44).** A digest is not a signature. Anyone who edits the document
  can also edit the digest. §7.5 states this limit explicitly.

---

## 3. Requirements and non-goals

### 3.1 Requirements (issue acceptance plus the measured gaps)

| ID | Requirement |
|---|---|
| R1 | A fragment can declare an atomic source location finer than a section, without modifying `CORE-001.legacy.md`. |
| R2 | A quote that crosses a paragraph boundary fails when the locator is atomic (issue test 2). |
| R3 | Previously used locators (`#<section>`, `#<section>/table/<column>`, `#<section>/<item>`) keep working for existing data. |
| R4 | The build verifies that the source bytes match the declared source identity and fails when they do not (issue test 1). |
| R5 | The failure is loud and actionable: it names the expected and actual value and says how to re-pin after review. |
| R6 | The README states the guarantee precisely, including what is *not* guaranteed. |
| R7 | New diagnostic codes are documented in the profile catalog (where profile-owned) and in the README/contract (where core-owned). |
| R8 | The build stays byte-deterministic; existing golden tests stay meaningful. |

### 3.2 Non-goals

- Signing, signature verification, authenticity or non-repudiation (#44).
- A general verification-record / status model (#37).
- A full CommonMark parser. The markdown adapter stays a documented subset (§4.2.4).
- Changing the read-only `CORE-001.legacy.md` (AGENTS.md forbids it without a decision record;
  this RFC deliberately does not).
- Migrating normative content, re-reviewing provisions, or touching conformance cases.
- Deprecating section locators in this increment (they remain valid and documented as weak).
- Multi-source semantics (#5) and review dimensions (#3).

---

## 4. Proposal

### 4.1 Locator grammar v2

A `source_ref` remains `<SOURCE_ID>#<section>[/<selector>]`. The section label grammar does not
change. One new selector family is added; the existing two are retained.

| Form | Example | Meaning | Atomicity |
|---|---|---|---|
| `<SOURCE>#<section>` | `SRC-CORE001#10.2` | the whole section span (back-compatible) | none: a quote may cross paragraphs and subsections |
| `<SOURCE>#<section>/p<n>` | `SRC-CORE001#10.1/p2` | the n-th **paragraph** in the section's direct body, 1-based | atomic: the quote must lie inside one paragraph |
| `<SOURCE>#<section>/p<s>-p<e>` | `SRC-CORE001#10.2/p4-p5` | a declared, contiguous range of paragraphs, `s ≤ e` | bounded: the quote may cross paragraphs only inside the declared range |
| `<SOURCE>#<section>/table/<key>` | `SRC-CORE001#10/table/asserted_at` | the value cell(s) of the row whose first cell equals `<key>` | atomic per cell: the quote must lie inside one value cell |
| `<SOURCE>#<section>/<n>` | `SRC-CORE001#15/5` | the n-th ordered list item in the section, 1-based | atomic: the quote must lie inside one item |

Grammar in ABNF-like form:

```text
source_ref = source-id "#" section [ "/" selector ]
selector   = "p" 1*DIGIT [ "-p" 1*DIGIT ]
           / "table" "/" 1*VCHAR
           / 1*DIGIT
section    = 1*DIGIT *( "." 1*DIGIT )
```

Absolute line spans `L<s>-L<e>` were considered and are `deferred` (§6, option L3): paragraph
ranges cover the only cross-paragraph prose case in the slice, and line numbers are
revision-bound and less reviewable. If they are approved, the grammar adds one selector and the
resolution rules in §4.3 gain one row; nothing else changes.

#### 4.1.1 Compatibility

- `parseLocator` keeps accepting the three existing forms with unchanged semantics, except for
  the deliberate table narrowing in §4.1.3.
- `sectionInSlice` (`profiles/core001/slice.ts:8–18`) reads only `locator.section`, so new
  selectors need no slice change.
- The fragment schema only requires `source_ref` to be a non-empty string
  (`profiles/core001/schemas/fragment.schema.json`), so no schema migration is needed to use
  the new forms.

#### 4.1.2 Resolution of `p<n>` and `p<s>-p<e>`

1. Resolve the section span exactly as today (`sectionSpan`). Section not found →
   `unknown-locator`.
2. Restrict the search to the section's **direct body**: lines after the heading, up to the
   next heading of *any* level (or the section end if none). The whole section span remains
   addressable by the bare-section form; **all block selectors** (`p`, `table`, `item`) address
   only content the section owns directly. This is what makes `#10/p3` a mistake rather than an
   accidental address in §10.1, and it applies to tables and lists in the same way (no current
   data has a table or list inside a nested subsection; §7.1 records the behaviour change).
3. Segment the direct body into paragraphs (§4.2) and index them 1-based.
4. For `p<n>`: `n` not in `1..count` → `unknown-block`. Otherwise the quote must be a
   whitespace-collapsed substring of that paragraph's text, else `outside`.
5. For `p<s>-p<e>`: `s > e`, or either ordinal out of range → `unknown-block`. Otherwise join
   the texts of paragraphs `s..e` (in order, with `\n`) and apply the same collapsed substring
   check; a quote may therefore cross paragraph boundaries inside the declared range, and only
   there.

A range is not a loophole for what the issue calls "crossing a paragraph boundary by accident":
using it is an explicit data decision that a reviewer sees in `sources.yml`, and any edit
outside the range is still caught by the digest (§4.4).

#### 4.1.3 Resolution of `table/<key>` (narrowed)

Today `selectBlock` returns the whole row whose first cell equals `<key>`, so a quote taken from
the key cell itself, or from another column, would pass (`markdown.ts:111–115`). The proposal:

1. Find the row (line starting with `|`) in the section's direct body whose **first cell**
   (trimmed) equals `<key>`. Not found → `unknown-block`.
2. The addressable text is the row's **value cells**: the cells after the first. Each value cell
   is checked separately, so a quote cannot span cells. A quote found only in the key cell does
   not satisfy the locator.
3. Cell splitting is the minimal markdown subset: the cells are the segments **between the first
   and the last `|`** of the row (the outer pipes are delimiters, not empty cells; only the
   leading/trailing empty segments are dropped), split on unescaped `|` (a `\|` is a literal
   pipe) and trimmed. A naive split on `|` without dropping the outer segments yields
   `["", "asserted_at", "Время…", ""]`, so the key lookup would fail. No support for multi-line
   cells or inline HTML. The existing two CORE-001 terms continue to match their value cells
   exactly.

This is a behaviour change on error paths only: no current data is affected, because both
CORE-001 table quotes are value cells.

#### 4.1.4 Resolution of `/<n>` (unchanged)

The n-th line matching `^\s*\d+\.\s` in the section's direct body, as today. Unordered
bullets are **not**
addressed by this selector; they are also excluded from paragraph numbering (§4.2). A bullet
list's text can currently only be located by the bare section or, after approval of L3, by a
line span. This is a documented limitation, not a new gap for the slice (no quoted fragment is
a bullet item; §10.2's bullet list is not quoted directly).

### 4.2 Paragraph model

#### 4.2.1 Direct body

For a section with heading line `h` and span end `end` (exclusive, as computed by
`sectionSpan`), the **direct body** is `(h, end)` truncated at the first subsequent ATX heading
of any level. If the next heading is the next same-or-higher-level heading, the direct body ends
exactly at the section end. The section *resolver* keeps matching numeric labels as today; the
direct-body *boundary* is any heading, including one with a non-numeric label (the current
`headings()` helper only collects numeric labels, so the implementation needs a separate
generic-ATX scan — an implementation detail this RFC fixes explicitly rather than leaving to
guesswork). This makes `#10.2/p1` address §10.2's own first paragraph and makes
`#10/p3` correctly impossible: §10 owns only two paragraphs because §10.1 starts right after
them.

#### 4.2.2 Segmentation rules

Scan the direct body top to bottom, ignoring blank lines (`^\s*$`). A block starts at the first
line not consumed by a previous block and is one of:

| Kind | Starts when | Ends |
|---|---|---|
| fenced code | line begins (after optional spaces) with an opening fence: three or more backticks, or three or more tildes | the matching closing fence line, inclusive; an unterminated fence ends at the direct-body end |
| heading | `#{1,6}\s+` | same line |
| table row | the line is a pipe-table row (its first non-space character is the table delimiter) | same line |
| thematic break | line is only `-`, `*` or `_` repeated at least three times, optionally spaced; checked **before** list items | same line |
| list item | line begins with an ordered (`1.`) or unordered (`-`, `*`, `+`) marker followed by whitespace | before the next blank line, heading, table row, list-item marker or fence |
| paragraph | anything else | before the next blank line, heading, table row, list-item marker, fence or thematic break |

Precedence is the order above: fence → heading → table row → thematic break → list item →
paragraph. A line such as `- - -` is a thematic break, never a list item, although the list-item
regex alone would accept it.

Exact patterns used by the adapter, kept outside the table so the raw markdown is unambiguous
(a literal pipe inside a table cell has to be written `\|`, which reads like a regex escape):

```text
list item: ^\s*(\d+\.|[-*+])\s+
```

Only **paragraph** blocks are numbered for `p<n>`. Headings, table rows, list items, fenced
code and thematic breaks are not paragraphs; they are addressed by their own selectors or by
the bare section. Consecutive non-blank lines with the same paragraph style form one paragraph,
so a wrapped paragraph is one ordinal.

#### 4.2.3 Numbering and stability

Paragraph ordinals are relative to the section's direct body, so:

- inserting a section or heading *above* the section does not change `#10.2/p4`;
- editing a paragraph's text does not change its ordinal but fails the digest (§4.4) and, after
  re-pinning, fails the quote check if the quoted text changed;
- inserting or deleting a paragraph *inside* the section shifts later ordinals; the digest makes
  the edit explicit, the quote check then reports the affected fragment (usually
  `ERR_SOURCE_LOCATOR_MISMATCH` or `ERR_SOURCE_QUOTE_NOT_FOUND`), so the common case is loud
  rather than silent; §7.2 states the residual risk when a re-pin and a data edit coincide;
- this is why existing IDs already line up: `FRAG-10.1-P2` → `#10.1/p2`, `FRAG-10.1-P5` →
  `#10.1/p5`, `FRAG-10.2-P1` → `#10.2/p1` (Appendix A is the full measured map).

#### 4.2.4 Subset, stated honestly

The adapter is not a CommonMark parser and this RFC does not make it one. It understands ATX
headings, pipe tables, ordered and unordered lists, fenced code and blank-line paragraphs — the
constructs the slice uses. Setext headings, HTML blocks, link-reference definitions and
multi-line table cells are treated as paragraph text. This is deliberately narrower than
CommonMark and roughly the subset the adapter already handles for headings, tables and ordered
items; the paragraph, fenced-code and thematic-break rules are specified here for the first time
because atomic locators depend on them. Stating the subset keeps the guarantee from overclaiming.

### 4.3 Outcomes and their mapping

`LocatorResult` gains one value; the adapter-local `LocatorOutcome`
(`markdown.ts:29`) mirrors it:

```ts
type LocatorResult = "found" | "outside" | "unsupported" | "unknown-locator" | "unknown-block";
```

| Outcome | Meaning | Profile mapping (fragment/decision) |
|---|---|---|
| `found` | the quote is inside the resolved block/span | none |
| `outside` | the place exists, but the quote is not inside it (e.g. it is in the next paragraph) | `ERR_SOURCE_LOCATOR_MISMATCH` (existing) |
| `unknown-locator` | the ref cannot be parsed, or the section does not exist | `ERR_SOURCE_LOCATOR_UNKNOWN` (existing) |
| `unknown-block` | the section exists, but the selected paragraph/range/cell/item does not | `ERR_SOURCE_BLOCK_UNKNOWN` (new) |
| `unsupported` | the adapter cannot verify this locator | `ERR_SOURCE_LOCATOR_UNSUPPORTED` (existing) |

Today a missing table key or an out-of-range item returns `outside` because the selected block
is empty (`markdown.ts:67–68`). The proposal makes "the declared place does not exist" distinct
from "the quote is not in the declared place", which is what the new code documents. No current
data or golden diagnostic uses an error path, so this changes no existing message.

Precedence in the current hook: the global document check runs before `verifyQuote`
(`checks/source.ts:23`), so `outside` and `unknown-block` reach the profile only for a quote that
exists somewhere in the document; when the quote was removed too, `ERR_SOURCE_QUOTE_NOT_FOUND`
wins. This RFC keeps that precedence in M1 — resolving the locator first would change existing
diagnostics — so the `unknown-block` rows in the test matrix use quotes that exist elsewhere in
the document. Inverting the precedence can be a separate change.

### 4.4 Source identity digest

#### 4.4.1 Where it lives

`sources[].identity` in `contract-builder.json` gains an optional field:

```json
{
  "id": "SRC-CORE001",
  "path": "../CORE-001.legacy.md",
  "adapter": "markdown",
  "external": true,
  "identity": {
    "document": "UIA-CORE-001",
    "revision": "0.3.3",
    "sha256": "f40876bb3b3f38c068e4e094a715709836dafc587eae8434ecddba69df981db1"
  }
}
```

The existing `document`/`revision` requirements are unchanged; the digest is additive, and the
header check in `profiles/core001/checks/source.ts` remains a separate, human-readable guard.

The implementation must also change `ManifestSource.identity` (`spec/lib/manifest.ts:27`) and,
critically, `validateSources`, which currently rebuilds `identity` as `{document, revision}`
(`spec/lib/manifest.ts:399`) and would silently drop `sha256`. If that line is missed, the
digest is never checked and the build stays green with only the missing-digest warning. A
manifest test must assert that the field survives validation (extend
`tests/manifest.test.ts:199`).

The issue says `document_sha256` in `sources.yml`. That wording predates M1: the source
declaration moved to the manifest in #19 (merged as #20) and to the generic IR in #21 (merged as
#24), and `sources.yml` now holds only `slice` and
`fragments`. Keeping source identity next to the source declaration (`path`, `adapter`,
`document`, `revision`) avoids two homes for one declaration and lets the **core** verify the
digest generically. This is an open question for approval (§10, Q2).

#### 4.4.2 Format and bytes

- Field name `sha256`, value: 64 lowercase hexadecimal characters, no `sha256:` prefix.
  The algorithm is fixed by the field name; algorithm agility is not introduced in v1.
  Validation: present but not matching `^[0-9a-f]{64}$` → `core.manifest.invalid` at
  `/sources/<i>/identity/sha256`.
- The hash is SHA-256 over the **raw bytes** of the file as read by the adapter and exposed as
  `SourceDocument.bytes`, i.e. the exact bytes a build consumed. There is no LF/CRLF
  normalisation, no BOM stripping and no Unicode normalisation.
- Rationale over a normalised digest: the claim being pinned is "the document is unchanged",
  not "the text content modulo line endings is unchanged". The cost is that a checkout that
  rewrites line endings would fail. The repository therefore pins the file to LF with a
  `.gitattributes` rule (`CORE-001.legacy.md text eol=lf`). The alternative (normalised digest)
  is discussed in §6, option D1b. The contract's LF normalisation for `inputDigest` (§8.1) is a
  different purpose and does not apply here; `inputDigest` now normalises source bytes to LF,
  while this digest hashes the bytes as stored.

#### 4.4.3 Verification point

The core verifies the digest in `loadSources` (`spec/lib/ir.ts:188–220`) immediately after
`adapter.load`, **before** relation resolution and provenance binding:

1. If `identity.sha256` is present: compute `createHash("sha256").update(source.bytes).digest("hex")`
   and compare. Mismatch → one `core.provenance.digest` error per source, then stop model
   construction (return `null`), consistent with the existing `ERR_IO` handling for unreadable
   sources. Reasoning: every later check would otherwise run against bytes that are not the
   declared source, producing diagnostics whose provenance claim is already known to be false.
   All sources are checked so that multi-source manifests report every mismatch, not only the
   first. This does not move quote verification into the core: the digest is a statement about
   the source bytes, not about locator resolution; the adapter still owns the latter.
2. If `identity.sha256` is absent and the profile declares provenance mappings
   (`profile.provenance` non-empty): one `core.provenance.digest-missing` warning per source.
   Greenfield specs without provenance are not nagged. The trigger is deliberately the mapping
   list, not a policy flag: M1 plan §8.2 names `requireProvenance: true`, but `Profile` and
   `profile.json` do not implement it (`spec/lib/manifest.ts:72–86` has no such field), so the
   mapping list is the accurate M1 proxy. Implementing the flag is a separate decision (Q5).
3. If the digest is present and correct, behaviour is unchanged.

Core ownership follows contract §5.2 step 7: provenance *binding shape* is core; locator
*grammar* is the adapter. The digest is format-agnostic (it needs only bytes), so it belongs to
the core, not to the markdown adapter.

#### 4.4.4 Gating and the deliberate-update workflow

A digest mismatch is an **error in draft and release**. It is the exact-content counterpart of
the existing header check, which is already an error (`ERR_SOURCE_REVISION_MISMATCH`): if the
declared revision is wrong, no quote claim is trustworthy; if the declared bytes are wrong, the
same is true. Making it a warning would allow a stale pin to enter draft silently and would
reintroduce G2 for every consumer that ignores warnings. `REVIEW_REQUIRED` is not right either:
it marks content that is valid but unconfirmed (pending normalization, editorial inference), and
draft publishes it with a visible marker. A digest mismatch is not content uncertainty; it makes
the source premise of every provenance claim false, so publishing it in draft would misrepresent
what was checked.

The issue's "warning if this is a conscious mode" is answered by an explicit **re-pin
workflow**, not by a softer severity:

1. edit the source (a deliberate normative change);
2. `bun run build` fails with `core.provenance.digest` before quote checking, naming expected
   and actual digests;
3. review the source diff and decide whether any normative data must change;
4. update `identity.sha256` (and `document`/`revision` if the source itself was re-issued);
5. rebuild: quotes and atomic locators are verified against the new document; any drift now
   surfaces as `ERR_SOURCE_*` at the affected fragment;
6. if the artifact changes, update the golden baseline with an explicit rationale.

#### 4.4.5 Relation to other identities

| Identity | Question it answers | Owner |
|---|---|---|
| `identity.document` + `identity.revision` | which document revision the source claims to be | project (manifest) |
| `identity.sha256` (this RFC) | are the bytes still the pinned source | project (manifest), verified by core |
| `inputDigest` (#32, implemented in #42) | what exact inputs and extension closures produced this build | engine |
| signature / verification record (#37, #44) | who attested, and what was independently verified | not in this RFC |

### 4.5 Diagnostics

| Code | Severity | Owner | Draft | Release | Trigger |
|---|---|---|---|---|---|
| `core.provenance.digest` | error | core | blocks | blocks | declared digest ≠ actual bytes |
| `core.provenance.digest-missing` | warning | core | passes, visible | passes (blocks under `--strict`) | provenance is mapped, source has no digest |
| `ERR_SOURCE_BLOCK_UNKNOWN` | error | profile catalog | blocks | blocks | `p`/range/cell/item selector does not resolve |
| `ERR_SOURCE_LOCATOR_MISMATCH` | error | profile catalog | blocks | blocks | quote exists in the document but not inside the declared block (includes a quote crossing an atomic paragraph boundary) |
| `ERR_SOURCE_LOCATOR_UNKNOWN` | error | profile catalog | blocks | blocks | ref unparsable or section not found |
| `ERR_SOURCE_LOCATOR_UNSUPPORTED` | error | profile catalog | blocks | blocks | adapter cannot verify the locator |

Proposed messages. Profile codes are interpolated from the catalog (`{{name}}` is resolved by
`resolveFindings`, `spec/lib/hook.ts:112`). Core codes have no catalog entry, and
`Diagnostics.error/warning` store literal strings (`spec/lib/diagnostics.ts:30–36`), so
`spec/lib/ir.ts` must build their text with template literals and set the location explicitly —
the `{{...}}` syntax below must not be copied into the core.

Core codes, location `contract-builder.json`, pointer `/sources/<i>/identity/sha256`:

- `core.provenance.digest`:
  `Источник "${source.id}" не совпадает с объявленным identity.sha256: ожидался ${expected},
  получен ${actual}. Если изменение источника намеренное, обновите identity.sha256 после
  ревью; иначе восстановите файл.`
- `core.provenance.digest-missing`:
  `Источник "${source.id}" не закреплён хешем (identity.sha256). Цитаты проверяются по
  текущему файлу, но совпадение с объявленной ревизией не доказывается.`

Profile codes (catalog interpolation, as today):

```text
ERR_SOURCE_BLOCK_UNKNOWN (fragment)
  Объявленный блок "{{ref}}" не найден в {{legacyName}}: раздел существует, но параграф,
  диапазон или ячейка не разрешаются.

ERR_SOURCE_BLOCK_UNKNOWN (decision)
  Объявленный блок "{{ref}}" не найден в {{legacyName}}.
```

The `ERR_SOURCE_LOCATOR_UNKNOWN` message string should be extended to mention the new forms;
its current text still lists only `[/table/<column>|/<item>]`.

`core.provenance.digest` and `core.provenance.digest-missing` are core codes and follow the
`core.*` convention of the contract (D17), not the profile's `ERR_SOURCE_*` family. They do not
belong in `profiles/core001/catalog.json`, which resolves profile-owned findings only; they are
documented in the contract and in the README row above. If the
maintainer prefers one family, `ERR_SOURCE_DIGEST_MISMATCH` is the alternative; the decision is
recorded as an open question (§10, Q9).

### 4.6 What the README will say

One guarantee row is added, one is rewritten, and the locator limitation is replaced and
extended. Exact proposed text:

**`## Гарантии`** — replace the locator row with:

```text
| цитата находится в объявленном месте | `source_ref` разбирается как раздел / абзац / диапазон абзацев / ячейка таблицы / пункт списка; для `#<section>/p<n>` цитата не может пересекать границу абзаца, для `#<section>/p<s>-p<e>` — только объявленный диапазон, `ERR_SOURCE_LOCATOR_MISMATCH`, `ERR_SOURCE_LOCATOR_UNKNOWN`, `ERR_SOURCE_BLOCK_UNKNOWN` |
```

and add:

```text
| байты источника совпадают с закреплённым хешем | `sources[].identity.sha256` в `contract-builder.json` сверяется с байтами файла в ядре до привязки provenance, `core.provenance.digest` |
```

**`## Ограничения MVP`** — replace the locator bullet with:

```text
- Локатор адресует абзац (`#10.2/p4`), диапазон абзацев (`#10.2/p4-p5`), ячейку таблицы и
  пункт списка атомарно; ссылка на раздел целиком (`#10.2`) остаётся для совместимости и не
  запрещает цитате пересекать границы абзацев. Абсолютные диапазоны строк не поддерживаются
  (отложено, см. RFC).
- Если `identity.sha256` не объявлен, цитаты проверяются по текущему файлу и выдаётся
  `core.provenance.digest-missing` (WARNING): совпадение с объявленной ревизией не
  доказывается. Хеш — закрепление содержимого, не подпись и не доказательство авторства.
```

### 4.7 Documentation and contract amendments

| Document | Change |
|---|---|
| `docs/architecture/engine-public-contract.md` §3.1 | `SourceDecl.identity` documents the optional `sha256` field and its raw-byte semantics. |
| same §5.2 step 7 | add digest verification before provenance binding; add `unknown-block`; state that in M1 the profile hook maps adapter outcomes (`m1-plan §8.3`) and core-side mapping remains D25/M2. |
| same §7 diagnostic contract | `core.provenance.*` are engine diagnostics emitted outside the profile catalog; reconcile the "every code is in the profile catalog" wording (Appendix C). |
| same §11 | `LocatorResult` union gains `unknown-block`; add one sentence that the digest is core-owned because it is format-agnostic, and that the M1 hook — not the core — maps outcomes to codes. |
| same §17/§18 | add decision register entries for the paragraph locator model, the source digest and the deferred line span. |
| `docs/architecture/m1-implementation-plan.md` §8.3 | note that the M1 hook now also maps `unknown-block`; record the digest check as core, not hook. |
| design record §7 item 7 and §8 bullet 3 | mark the locator/hash question as resolved by this RFC once approved, and link the implementation. |
| `README.md` | §4.6 text. |
| `AGENTS.md` | none: the source file stays read-only; the `.gitattributes` rule does not change content. |

Contract changes can land with the implementation PRs (after this RFC is approved) so the
contract never describes unshipped behaviour; alternatively they can be part of the RFC PR.
Recommended: with the implementation (§10, Q10).

---

## 5. CORE-001 data migration

### 5.1 Proposed references

The paragraph numbers below are measured at the baseline (Appendix A is the raw map) and align
exactly with the existing fragment IDs. Referrers matter: provision and term `source_ref` must
equal the fragment's ref (`ERR_SOURCE_REF_MISMATCH` in `profiles/core001/checks/provision.ts:47` /
`profiles/core001/checks/ontology.ts:17`), so a fragment migration also updates them.

**Fragments (`spec/sources.yml`)**

| Fragment | Current `source_ref` | Proposed | Why |
|---|---|---|---|
| `FRAG-10-TABLE-ASSERTED-AT` | `SRC-CORE001#10/table/asserted_at` | unchanged | already atomic; now cell-scoped |
| `FRAG-10-TABLE-SIGNED-AT` | `SRC-CORE001#10/table/signed_at` | unchanged | already atomic; now cell-scoped |
| `FRAG-10-P-NOT-INTERCHANGEABLE` | `SRC-CORE001#10` | `SRC-CORE001#10/p2` | §10 direct body, paragraph 2 |
| `FRAG-10.1-P2-TRUST-CONDITION` | `SRC-CORE001#10.1` | `SRC-CORE001#10.1/p2` | ID already says P2 |
| `FRAG-10.1-P5-NO-GLOBAL-TIME` | `SRC-CORE001#10.1` | `SRC-CORE001#10.1/p5` | ID already says P5 |
| `FRAG-10.2-P1-MOMENT-DEFINED` | `SRC-CORE001#10.2` | `SRC-CORE001#10.2/p1` | ID already says P1 |
| `FRAG-10.2-P4-5-REVOCATION` | `SRC-CORE001#10.2` | `SRC-CORE001#10.2/p4-p5` | the quote genuinely spans paragraphs 4–5 (lines 1013 and 1015) |

**Referrers (`spec/semantics.json`, `spec/ontology.yml`)**

| Entity | Field | Current | Proposed |
|---|---|---|---|
| `REQ-TEMPORAL-MOMENT-DEFINED` | `source_ref` | `SRC-CORE001#10.2` | `SRC-CORE001#10.2/p1` |
| `REQ-REVOCATION-NOT-AUTO-INVALID` | `source_ref` | `SRC-CORE001#10.2` | `SRC-CORE001#10.2/p4-p5` |
| `REQ-SIGNED-AT-TRUST-CONDITION` | `source_ref` | `SRC-CORE001#10.1` | `SRC-CORE001#10.1/p2` |
| `INV-NO-GLOBAL-TRUSTED-TIME` | `source_ref` | `SRC-CORE001#10.1` | `SRC-CORE001#10.1/p5` |
| `REQ-TIMESTAMPS-NOT-INTERCHANGEABLE` | `source_ref` | `SRC-CORE001#10` | `SRC-CORE001#10/p2` |
| `TERM-ASSERTED-AT`, `TERM-SIGNED-AT` | `source_ref` | table refs | unchanged |
| `DEC-TRUSTED-TIME` (`spec/decisions.yml`) | `source_ref` | `SRC-CORE001#15/5` | unchanged (5th ordered item, line 1612) |

Case entities reference fragments through the `rationaleFragment` relation
(`spec/conformance/cases.yml`), not through a duplicated `source_ref`, so they need no edit.

### 5.2 Digest pin

Add `identity.sha256` with the baseline value to the root project manifest and to the three
fixture manifests (they all point at the same read-only file, so the value is identical). This
four-fold duplication is a fixture artefact, not a design goal; a shared source declaration
belongs to the multi-source work (#5) and is out of scope here.

```text
f40876bb3b3f38c068e4e094a715709836dafc587eae8434ecddba69df981db1
```

Reproduce with `sha256sum CORE-001.legacy.md`. Add the `.gitattributes` rule in the same PR.

### 5.3 Artifact and golden impact

| Increment | Artifact bytes | Golden SHA-256 | Golden diagnostics |
|---|---|---|---|
| L1 (locator grammar) + D1 (digest) | unchanged: no ref is migrated and the digest is not rendered; CORE-001 declares a digest, so no new warning | unchanged (`a29ce609…`) | unchanged (no new diagnostics on a valid build) |
| Migration (§5.1) | ten `source_ref` strings change: five provision rows render `p.sourceRef` (`profiles/core001/templates/core001.md.j2:56`) and five Appendix A rows render `row.sourceRef` (template line 155). No other artifact line changes | must be regenerated and updated deliberately | unchanged (diagnostic messages do not embed refs) |

A dry run of the migration with a throwaway prototype of the proposed grammar — passed as the
`markdown` adapter to `runBuild` against a copy of `spec/` with the proposed refs and a rewritten
source path — gave: all ten refs resolve, the diagnostics stay at 15 with the same codes, and the
artifact diff is exactly those ten ref strings (five provision rows, five Appendix A rows). The
recipe: copy the five inputs plus `conformance/`, rewrite `profile.source` and
`sources[0].path`, apply the ref edits from §5.1, then call
`runBuild({ specDir, mode: "draft", write: false, renderers, adapters: { markdown: prototype } })`.
The migration PR should reproduce that and demonstrate the diff, then update
`tests/golden/core001.draft.sha256` with a stated rationale — the same discipline M1 applied,
not a blind regeneration. If the maintainer prefers zero golden churn in one increment, split as
recommended in §8 (L1+D1 first, migration second); the guarantee for CORE-001 data becomes
atomic only after the second PR.

---

## 6. Alternatives considered

| Option | Description | Verdict |
|---|---|---|
| L1a | `block_id` as a content hash (`#10.2@sha256:<block-hash>`) | rejected: opaque, every wording edit re-pins every ID, and it duplicates what the document digest already does; no reviewability gain |
| L1b | Stable logical block IDs in a sidecar map (e.g. `spec/source-blocks.yml`) | rejected for v1: a second source of truth that itself needs validation and review; can be layered on later if cross-revision stable IDs are needed |
| L1c | Insert anchors (`<!-- block-id -->`) into `CORE-001.legacy.md` | rejected: the legacy file is the read-only normative source (AGENTS.md); editing it changes the document being evidenced and invalidates every existing digest |
| L1d | Paragraph ordinals, as proposed | adopted: derived, reviewable, already encoded in fragment IDs, no source edits |
| L1e | A separate `block` field on the fragment entity, leaving `source_ref` section-level | rejected: two locator fields that can disagree, and the schema already carries one locator; the existing convention is `source_ref`-in-band (`#10/table/<col>`, `#15/5`) |
| L2a | Only blank-line-separated blocks (count table rows and list items as paragraphs) | rejected: it would make `#10.2/p<n>` numbering diverge from the existing P-numbering (list items would occupy ordinals 3–7), breaking the natural mapping |
| L2b | Full CommonMark parser | rejected: scope and dependency; the subset is documented (§4.2.4) |
| L3 | Absolute line spans `L<s>-L<e>` | deferred, not rejected: the only current cross-paragraph quote is prose and is covered by `p<s>-p<e>`; line spans are revision-bound and less reviewable. Revisit when a non-paragraph multi-block quote appears (e.g. a code fence) |
| D1a | Digest in `sources.yml` as `document_sha256` | rejected: the source declaration moved to the manifest in M1; two homes would let them disagree; core could not verify a profile-file field generically |
| D1b | LF-normalised digest | rejected: weakens the "same bytes" claim and makes line-ending changes invisible; `.gitattributes` handles portability instead |
| D1c | Adapter-owned digest verification | rejected: the digest needs only bytes; locator grammar is the adapter's format-specific concern (contract §11) |
| D1d | Profile-hook-owned digest verification (the hook already receives `ctx.sources` bytes and emits `ERR_SOURCE_*`) | rejected: the guarantee would exist only for profiles that ship the check, would need a profile-catalog code instead of a generic engine diagnostic, and a project could drop it by editing a profile; the cost of the chosen core path is two core codes and one contract sentence |
| D2 | Mismatch as `REVIEW_REQUIRED` or warning | rejected: same class as the existing revision-header error; a warning lets a stale pin pass draft silently |
| D2b | Collect digest mismatches and continue with quote/locator checks against the unpinned bytes | rejected: every downstream provenance finding would mix a true observation with an already-invalid claim; fail-fast matches the existing `ERR_IO` handling and keeps the re-pin workflow single-purpose |
| D3 | Digest required in the manifest schema | deferred for the generic engine (other projects may not use provenance); CORE-001 declares it, and absence with provenance mapped is a warning |
| D4a | Split `FRAG-10.2-P4-5-REVOCATION` into two atomic fragments | deferred: changes relations and case traceability more than the value of atomicity; the declared range is explicit and digest-backed. Revisit if quote granularity becomes a requirement |
| D4b | Migrate CORE-001 refs in the same PR as the grammar | rejected: mixes a capability change with a golden-artifact change and makes bisection harder |
| D5 | Keep table row matching, only add paragraph locators | rejected: the issue is about precision; a quote from a key cell passing `table/<key>` is the same class of looseness as G1 |

---

## 7. Compatibility, impact and risks

### 7.1 Data and schema compatibility

- `fragment.schema.json` needs no change (`source_ref` is a free string);
  `parseLocator`'s internal `BlockLocator` union gains `paragraph` and `paragraph-range` variants
  (`markdown.ts:19–22`).
- Atomic selectors (`p`, `table`, `item`) now resolve in the section's direct body. Today they
  scan the whole section span, so a locator that addressed a table or list inside a nested
  subsection would now be `unknown-block`. No current project data does this; the stronger
  semantics are what make the parent section's paragraph numbering unambiguous.
- The manifest survives without `identity.sha256`; only the verification guarantee changes and
  is reported by a warning when provenance is mapped.
- Existing refs keep working. The only semantic tightening is that a `table/<key>` quote must
  now be in a value cell, and out-of-range selectors return `unknown-block` instead of `outside`.
- An external project that relied on `#<section>` to accept a subsection quote keeps that
  behaviour; atomicity is opt-in per fragment, which is exactly the issue's "optional block id".

### 7.2 Failing loudly, never silently re-pointing

The two mechanisms are complementary, and the RFC relies on both:

- the digest detects *any* source edit, including edits no locator would see;
- atomic locators fail when the quoted text moved out of the declared paragraph, even after a
  deliberate re-pin;
- a re-pin without checking the data produces `ERR_SOURCE_LOCATOR_MISMATCH` /
  `ERR_SOURCE_QUOTE_NOT_FOUND` at the affected fragment, not a green build.

The residual risk is a re-pin performed together with a data edit that keeps the quote inside a
newly chosen paragraph by coincidence. That is a human-review risk of the data model, not a
mechanical one; #37's verification records are where this class of risk belongs.

### 7.3 Repositories and fixtures affected

| Area | Effect |
|---|---|
| `spec/contract-builder.json` and `fixtures/*/spec/contract-builder.json` | add `identity.sha256` (four files, one value; all point at the same file) |
| `.gitattributes` | new one-line rule pinning `CORE-001.legacy.md` to LF |
| `tests/build.test.ts` `legacy-drift` case | currently mutates the copied legacy and expects `ERR_SOURCE_QUOTE_NOT_FOUND`. With a pinned digest the mismatch is detected first, so the case becomes the digest test; a second case must re-compute the digest after mutation to keep coverage of quote drift against a pinned source |
| `tests/golden/*` | unchanged for L1+D1; artifact SHA only for the migration PR |
| `tests/identity.test.ts` (#42) | adding `identity.sha256` changes the canonical manifest and therefore `inputDigest`; PR 1 changes `markdown.ts` inside the adapter's declared closure and PR 3 changes declared inputs, so their `closureDigest`/`inputDigest` move too. The suite asserts relationships, not a fixed digest, so no golden value needs editing — confirm in each PR |
| `spec/output/CORE-001.draft.md` | unchanged for L1+D1; the ten `source_ref` lines change for the migration |

A test helper that recomputes the manifest digest after mutating a copied legacy file belongs in
`tests/support.ts`; it keeps every existing "mutate the source" test meaningful.

### 7.4 Determinism

- Paragraph segmentation is a pure function of lines; iteration is in document order; no
  locale, clock or filesystem order is involved.
- The digest is computed over bytes; the same build inputs produce the same diagnostics and
  artifact. Error messages contain stable digests, not timestamps.
- The diagnostics ordering is unchanged (severity, file, pointer, code, message).

### 7.5 Security and trust limits

- The digest is an integrity pin, not authentication: anyone who can edit the source can edit
  the manifest. It protects against accidental drift and against un-reviewed changes in a
  review-gated repository, not against a malicious maintainer.
- SHA-256 collisions are out of scope; algorithm agility is not introduced.
- The read-only legacy file stays byte-identical, so the digest pins the same bytes the
  normative quotes were reviewed against.
- Profile hooks remain trusted in-process code (contract D28); this RFC adds no sandboxing.

---

## 8. Implementation plan

Each PR is independently revertible; the RFC itself is PR 0.

### PR 0 — this document

- Add this RFC; no code or data change; add a link from the related docs if the maintainer
  wants the RFC discoverable before approval.
- Acceptance: checks green (documentation-only), maintainer decision on §10.

### PR 1 — paragraph locators and the new outcome (L1, L2, L3-deferred)

Files: `spec/lib/adapters/markdown.ts` (parser, paragraph segmentation, cell scoping, new
outcome), `spec/lib/source.ts` (`LocatorResult`), `profiles/core001/checks/source.ts` (map
`unknown-block`), `profiles/core001/catalog.json` (new code, message update), a new
`tests/locator.test.ts`, updates to `tests/checks.test.ts` and `tests/build.test.ts`,
`tests/support.ts` (move/export `copySpec` for reuse), and `README.md` (locator guarantee row
and limitation text from §4.6). No data or artifact change.

Acceptance:

- [ ] All existing tests pass; golden artifact and diagnostics unchanged.
- [ ] A quote inside one paragraph resolves with `p<n>`; a quote spanning two paragraphs fails
      with `outside` under `p<n>` and resolves under `p<s>-p<e>`; out-of-range → `unknown-block`;
      table key cell vs value cell distinguished; `#15/5` unchanged; section locators unchanged.
- [ ] Slice containment still reads the section correctly for all new forms.
- [ ] README locator guarantee and limitation text match the shipped grammar (data still uses
      section refs until PR 3; the limitation text says so).

### PR 2 — source digest (D1, D2, D3)

Files: `spec/lib/manifest.ts` (type + validation), `spec/lib/ir.ts` (verify in `loadSources`),
`spec/contract-builder.json` and the three fixture manifests (pin the value), `.gitattributes`,
`tests/build.test.ts` and `tests/support.ts` (mutation + re-pin helper), `README.md` (digest
guarantee row and the missing-hash bullet from §4.6).

Acceptance:

- [ ] Valid digest: draft, release-gate behaviour, `--check` and golden output unchanged.
- [ ] One-byte edit outside every quote: `core.provenance.digest`, exit 1, no artifact written.
- [ ] Edit inside a quote with a recomputed digest: the quote/locator error appears (coverage of
      the existing drift test is preserved).
- [ ] Malformed digest: `core.manifest.invalid` at the field; missing digest with mapped
      provenance: `core.provenance.digest-missing`, build continues, `--strict` blocks.
- [ ] `validateSources` carries `identity.sha256` into the model (extend
      `tests/manifest.test.ts:199`); otherwise the digest check silently never runs.
- [ ] A CRLF-rewritten file fails the digest (raw-byte semantics are tested, not assumed).

### PR 3 — CORE-001 migration and docs (D4)

Files: `spec/sources.yml`, `spec/semantics.json` (referrer refs), `spec/output/CORE-001.draft.md`
(regenerated), `tests/golden/core001.draft.sha256`, design record §7/§8 updates.

Acceptance:

- [ ] The only artifact diff is `source_ref` strings: five provision `Источник` rows and five
      Appendix A rows; no normative or diagnostic text changes.
- [ ] No diagnostics change; golden diagnostics snapshot unchanged.
- [ ] The `REQ-REVOCATION-NOT-AUTO-INVALID` range case builds with `p4-p5`; all other fragments
      use atomic `p<n>`.
- [ ] README limitation text (shipped in PR 1) remains accurate after the data migration.

### PR 4 (optional, with implementation) — contract and M1 plan amendments

Apply §4.7 so the public contract and the plan describe the shipped behaviour; add the decision
register entries.

Every PR runs the repository's checks from the repository root: `bun run typecheck`, `bun test`,
`bun run check`, and `bun run build` when the artifact is intentionally regenerated.

---

## 9. Test matrix

Issue acceptance tests are in bold.

| # | Scenario | Expected result |
|---|---|---|
| 1 | **Edit the legacy outside every quote; declared digest kept** | `core.provenance.digest` (error), exit 1, no artifact; no quote errors (fail-fast) |
| 2 | **Quote spanning two paragraphs under an atomic `p<n>` locator** | `ERR_SOURCE_LOCATOR_MISMATCH` (the quote is found in the document, not inside the paragraph) |
| 3 | Quote spanning two paragraphs under a declared `p<s>-p<e>` | builds (the data explicitly declares the range) |
| 4 | Quote inside one paragraph under `p<n>` | resolves; no diagnostic |
| 5 | `p<n>` with `n` beyond the paragraph count | `ERR_SOURCE_BLOCK_UNKNOWN` |
| 6 | `p<s>-p<e>` with `s > e` or an out-of-range end | `ERR_SOURCE_BLOCK_UNKNOWN` |
| 7 | Paragraph number that exists only in a nested subsection, addressed via the parent section | `ERR_SOURCE_BLOCK_UNKNOWN` (direct-body semantics) |
| 8 | Bare section locator with a quote crossing paragraphs | still resolves (documented weak form) |
| 9 | `table/<key>` with the quote in the value cell | resolves |
| 10 | `table/<key>` with the quote only in the key cell | `ERR_SOURCE_LOCATOR_MISMATCH` |
| 11 | `table/<missing-key>` | `ERR_SOURCE_BLOCK_UNKNOWN` |
| 12 | `#15/5` quote | resolves unchanged |
| 13 | `#15/99` | `ERR_SOURCE_BLOCK_UNKNOWN` |
| 14 | Unparsable selector / missing section | `ERR_SOURCE_LOCATOR_UNKNOWN` |
| 15 | Two sources, one digest wrong | one `core.provenance.digest`, fail-fast after checking all sources |
| 16 | Digest absent, profile maps provenance | `core.provenance.digest-missing` warning, draft exit 0, `--strict` exit 1 |
| 17 | Digest absent, profile maps no provenance | no warning |
| 18 | Malformed digest value | `core.manifest.invalid` at `/sources/<i>/identity/sha256` |
| 19 | CRLF line endings on the source | `core.provenance.digest` (raw bytes) |
| 20 | Same inputs twice | identical artifact and diagnostics (determinism) |
| 21 | Fenced code block containing blank lines | one block; not a paragraph; `p<n>` numbering unaffected |
| 22 | Table row inside the section | not counted as a paragraph |
| 23 | Migration: all refs updated consistently | `bun run check` green after deliberate golden update; only source-ref strings differ (five provision rows + five Appendix A rows) |
| 24 | Migration: fragment ref updated, provision ref not | `ERR_SOURCE_REF_MISMATCH` |
| 25 | Manifest validation preserves `identity.sha256` in the model | field present; without it the digest check would silently never run |

For the `unknown-block` rows (5, 6, 11, 13), the quote must exist somewhere else in the
document because of the precedence in §4.3; otherwise `ERR_SOURCE_QUOTE_NOT_FOUND` is reported
first and the block outcome is never reached.

Fixture policy: cases 1–22 belong in `tests/locator.test.ts` (pure locator/segmentation cases
over `locateQuote`) and `tests/build.test.ts` (integration). `copySpec` is currently a
non-exported local (`tests/build.test.ts:240`), so PR 1 must move or export it to
`tests/support.ts`; the digest re-pin helper planned for PR 2 lives in the same file and both
PRs reuse it. No new `fixtures/` directory is needed, which keeps the repository's rule that
fixtures are intentionally broken *specs*, not copies of the legacy document.

---

## 10. Open questions for maintainer approval

| ID | Question | Recommendation |
|---|---|---|
| Q1 | Approve the grammar `p<n>` / `p<s>-p<e>` (and keep section/table/item)? | yes; it matches the existing `P*` IDs and the issue's "block id" intent |
| Q2 | Digest in `sources[].identity.sha256` (manifest) instead of `document_sha256` in `sources.yml`? | yes; M1 moved source declarations to the manifest. The issue wording is superseded |
| Q3 | Absolute line spans `L<s>-L<e>` now or deferred? | deferred; paragraph ranges cover the slice; revisit for non-paragraph multi-block quotes |
| Q4 | Digest mismatch severity: error in both modes, no warning mode? | yes; same class as the revision header, explicit re-pin workflow instead |
| Q5 | Digest absence: non-blocking warning vs required field? | warning when provenance is mapped; CORE-001 declares the digest. The trigger is the mapping list because `requireProvenance` is named in the M1 plan but not implemented (Q5 note in §4.4.3) |
| Q6 | Raw bytes + `.gitattributes` LF pin vs normalised digest? | raw bytes + LF pin |
| Q7 | CORE-001 migration: `#10.2/p4-p5` range now, split the fragment later? | range now; splitting is a separate data-model decision |
| Q8 | Narrow `table/<key>` to value cells? | yes; no current data breaks |
| Q9 | Core code family: `core.provenance.digest*` vs `ERR_SOURCE_DIGEST_MISMATCH`? | `core.provenance.*` follows the contract's D17; one family is also acceptable if preferred |
| Q10 | Contract amendments in the RFC PR or with implementation? | with implementation, so the contract never describes unshipped behaviour |
| Q11 | Warn on bare-section locators after CORE-001 migrates, to nudge toward atomic locators? | no warning now: after the migration the project data is atomic, and a generic warning would penalise external projects. Revisit if coarse locators reappear |

Approval of Q1–Q9 is enough to start PR 1 and PR 2; Q7 gates PR 3.

---

## 11. Decision register

Legend: all entries are `proposed` unless marked otherwise.

| ID | Decision | Status | Selected | Alternatives | Rationale | Consequence |
|---|---|---|---|---|---|---|
| P-L1 | Locator grammar v2 | proposed | paragraph ordinals and ranges; section/table/item retained | block hash, sidecar map, legacy anchors | reviewable, source stays read-only, matches existing IDs | adapter + hook + catalog changes |
| P-L2 | Paragraph model | proposed | direct body; blank-line paragraphs; exclude headings, table rows, list items, fences, thematic breaks | full CommonMark; blank-line-only | matches the slice and the existing P-numbering | documented subset; bullet lists not atomically addressable |
| P-L3 | Absolute line spans | deferred | not in v1 | include now | no current need; revision-bound | one selector can be added later |
| P-D1 | Source digest | proposed | `sources[].identity.sha256`, raw bytes, core check | `sources.yml`; normalized; adapter-owned | one declaration home; format-agnostic | manifest field, core diagnostic, `.gitattributes` |
| P-D2 | Digest severity | proposed | error both modes | review; warning | invalidates the source identity for every quote | explicit re-pin workflow |
| P-D3 | Digest absence | proposed | warning when provenance mapped | required field; silent | keeps greenfield specs usable, makes the weaker guarantee visible | CORE-001 must declare it |
| P-D4 | Migration | proposed | separate PR; `p4-p5` for the cross-paragraph fragment | split the fragment; migrate with grammar | keeps golden-artifact change isolated and reviewable | source-ref lines and golden SHA change in PR 3 only |
| P-D5 | Table narrowing | proposed | value-cell matching | keep row-wide | removes a same-class looseness as G1 | error-path behaviour change only |

---

## Appendix A — measured paragraph map (baseline document)

Only paragraphs are numbered. Lines are 1-based. `§` direct body means the map stops at the
next sub-heading. These numbers are what §5.1 relies on.

### §10 (direct body: lines 974–986)

| Ordinal | Line | Text (truncated) |
|---|---|---|
| p1 | 975 | `UIA различает пять временных характеристик.` |
| p2 | 985 | `Эти временные метки не являются взаимозаменяемыми.` |

Table rows at lines 977–983 are blocks but not paragraphs; they are addressed by
`#10/table/<key>`.

### §10.1 (direct body: lines 988–998)

| Ordinal | Line | Text (truncated) |
|---|---|---|
| p1 | 989 | `` `asserted_at` является заявленным временем… `` |
| p2 | 991 | `` ` signed_at` может считаться удостоверенным временем… `` |
| p3 | 993 | `` `ingested_at` отражает локальный факт… `` |
| p4 | 995 | `` `assessed_at` и `decided_at` относятся… `` |
| p5 | 997 | `UIA не предполагает наличие единого глобального доверенного времени.` |

### §10.2 (direct body: lines 1000–1016)

| Ordinal | Line | Text (truncated) |
|---|---|---|
| p1 | 1001 | `При проверке Credential домен MUST определить…` |
| p2 | 1003 | `В зависимости от политики это может быть:` |
| — | 1005–1009 | bullet list, not a paragraph |
| p3 | 1011 | `Для исторической проверки подписи и для будущей авторизации…` |
| p4 | 1013 | `Отзыв Credential после подписания не означает автоматически…` |
| p5 | 1015 | `Однако последующая подтверждённая компрометация…` |

`FRAG-10.2-P4-5-REVOCATION` covers p4–p5; its ID already says P4-5.

### §15 (direct body: lines 1605–1623)

Ordered items only: item 5 is line 1612, so `#15/5` (used by `DEC-TRUSTED-TIME`) is unchanged.
The check `sectionInSlice("#15/5", …)` still reads section `15`.

---

## Appendix B — worked resolution examples

| Ref and text | Resolution trace | Outcome |
|---|---|---|
| `#10.1/p2` + `` ` signed_at` может считаться… `` | section 10.1 → direct body 988–998 → p2 = line 991 → quote inside | `found` |
| `#10.1/p3` + `` ` signed_at` может считаться… `` | p3 = line 993; the collapsed quote is not a substring | `outside` → `ERR_SOURCE_LOCATOR_MISMATCH` |
| `#10.1/p9` | p9 does not exist | `unknown-block` → `ERR_SOURCE_BLOCK_UNKNOWN` |
| `#10/p3` | §10 direct body has p1–p2 only (§10.1 owns the rest) | `unknown-block` |
| `#10/p1` + `UIA не предполагает…` | the quote lives in §10.1, not in §10's direct body | `outside` → `ERR_SOURCE_LOCATOR_MISMATCH` |
| `#10.2/p4-p5` + both revocation sentences | paragraphs 4 and 5 joined, quote spans the joining `\n` | `found` |
| `#10/table/asserted_at` + `Время заявления…` | key `asserted_at` at line 979; value cell contains the quote | `found` |
| `#10/table/asserted_at` + `asserted_at` | the quote is in the key cell, not a value cell | `outside` → `ERR_SOURCE_LOCATOR_MISMATCH` |
| `#15/5` + `Универсальный механизм доверенного времени.` | line 1612 is the 5th ordered item | `found` |

---

## Appendix C — proposed profile catalog entries

Add to `profiles/core001/catalog.json` (the profile-side code; the core-side digest codes are
emitted by `spec/lib/ir.ts` and are not catalog entries):

```json
{
  "code": "ERR_SOURCE_BLOCK_UNKNOWN",
  "variant": "fragment",
  "severity": "error",
  "message": "Объявленный блок \"{{ref}}\" не найден в {{legacyName}}: раздел существует, но параграф, диапазон или ячейка не разрешаются."
}
```

and the same code with `"variant": "decision"` and the shorter message. Extend the
`ERR_SOURCE_LOCATOR_UNKNOWN` messages with `[/p<абзац>|/p<начало>-p<конец>|/table/<колонка>|/<пункт>]`.

## Appendix D — reproducing the measured facts

```bash
sha256sum CORE-001.legacy.md
# f40876bb3b3f38c068e4e094a715709836dafc587eae8434ecddba69df981db1

bun run typecheck && bun test && bun run check   # baseline: green, 117 tests
```

---

## Appendix E — issue #4 acceptance mapping

| Issue checkbox | Where resolved |
|---|---|
| optional `block_id` or line range for a fragment | paragraph locators and paragraph ranges (§4.1); line spans deferred (§6, L3) |
| `document_sha256` in `sources.yml`, verified at build | manifest `identity.sha256`, verified in the core (§4.4); location superseded (§10, Q2) |
| test: editing the legacy outside the quote → an error | test matrix row 1; severity decision (§4.4.4) |
| test: quote crossing paragraph boundaries under a block locator → an error | test matrix rows 2–3; atomic vs declared range (§4.1.2) |
| README guarantee precise, new error code documented | §4.5, §4.6, Appendix C |
