# Decisions — R-PAP-1, R-PAP-2, R-PAP-3, R-PAP-4

This document records the repository evidence for the four decisions requested in
[Issue #95](https://github.com/agent-federation/contract-builder/issues/95), the preliminary
position from [issue comment 6623392390](https://github.com/agent-federation/contract-builder/issues/95#issuecomment-6623392390),
the options, their consequences, and the exact proposed wording or artifact change. It is
decision input, not a decision record: the maintainer remains the owner. No option is accepted by
this document.

**Baseline:** `agent-federation/contract-builder` `main` at
`0a5132ec9e36e12a85d66a2231f77f042136e13e` (2026-11-04). The RFC is
`docs/architecture/portable-assurance-package-rfc.md`, SHA-256
`a171fdcfc7da76af302eea3a270c5b63506b07ce74c3ebd784401e48e7e543c1`; the corpus is
`pap/fixtures/pap-v0.1/cases.json`, SHA-256
`8ae2693b34a31f1a49fdee0e5e5e235419e8d510d2a9b6f84e809b0c1ef154df`. Both are unchanged from
`8c3a5fa` (the previous proposal baseline), so the citations below are stable across both.

**Evidence classes.** “Repository” means a file at the baseline commit. “Reference probe” means a
run of `bun pap/bin/pap` at the baseline; the exact commands and outputs are in
[`probes.md`](probes.md). “Issue” means the probe results recorded in Issue #95 for the reference
and the three independent Phase 2a implementations; those three were not available for re-running
here.

---

## R-PAP-1 — symlinked package root

### Preliminary position

Recommend **B**: explicitly permit a `PACKAGE` that is a symlink to a directory, resolve it, and
add no diagnostic. The preliminary argues that §4.3.2/§10.5 “no symlinks” is about declared payload
paths, not the operator's own CLI argument, and that A would change reference behaviour for an
external test nobody implements. If B is accepted, the RFC should say the CLI argument may be
resolved, the resolved root must be a directory, and symlinks **inside** the package remain
rejected; external FS-01 is then demoted rather than used as a gate.

### Repository evidence

| Claim | Evidence |
|---|---|
| The “no symlinks” rule is about declared payload paths | RFC §4.3.2 lines 494–506: “Every payload path MUST resolve to a regular file inside the package directory. Symbolic links and non-regular files … are rejected.” §10.5 lines 2658–2661: “A **declared payload** that is a symlink … is an error.” |
| The `PACKAGE` argument is a directory name, not a declared payload | RFC §9.2 line 2163: “`PACKAGE` is exactly one positional argument naming an existing directory. v0.1 is directory-only (D1): archive files, OCI references, URLs and `-` are not packages.” |
| A path that exists but is not a directory is a usage error; a missing path is I/O | RFC §9.7 lines 2314–2316; Appendix J line 5587: `pap.package.not-found` for a path that does not exist, exit 74; a path that exists but is not a directory is `pap.cli.usage`, exit 64. |
| “No path outside the package root” is a payload-read rule | RFC §9.10 lines 2394–2399: reads are limited to the package tree, the policy file and process resources; “no path outside the package root is followed (§4.3.2).” |
| The reference resolves a symlinked root | `pap/src/paths.ts:79–109`: `lstat` the supplied path; if it is a symbolic link, `lstat(realpath(supplied))`; reject a non-directory; store the resolved `real` path for containment. |
| A non-directory package path is exit 64 | `pap/tests/cli.test.ts:63–71`. |
| A symlinked **parent** below the root is rejected | `pap/tests/hostile.test.ts:195–211`: `artifacts/linkdir/file.md` produces `pap.package.symlink`, `integrity.artifacts: FAIL`, exit 1. |
| The corpus does not pin root-symlink behaviour | F23 is a payload symlink (`artifacts/link.md`), not a root symlink; F25 is a regular `.tar` file. `cases.json:598–649`. |

Reference probes (see [`probes.md`](probes.md)):

| Scenario | Exit | Result |
|---|---|---|
| Root is a symlink to a valid package | 0 | `PASS`, no diagnostics |
| Root is a symlink to a regular file | 64 | `pap.cli.usage`, no report |
| Root is a dangling symlink | 74 | `pap.package.not-found`, no report |
| Root is a symlink to a package whose declared artifact is a symlink | 1 | `FAIL`, `pap.package.symlink` |

The Issue #95 evidence for the three independent implementations is: FS-01 reference `PASS/0`;
go `UNSUPPORTED/4`; rust `INCOMPLETE/2`; python `UNSUPPORTED/4`. The external contract expects
`FAIL/1`.

### What the RFC fixes and what it leaves open

The RFC fixes:

- a declared payload path must be a regular file, and a symlink there is an error;
- the CLI `PACKAGE` is an existing directory, and archive/URL/OCI forms are not packages;
- a non-directory `PACKAGE` is `pap.cli.usage`/64; a missing `PACKAGE` is
  `pap.package.not-found`/74;
- all reads after root resolution must stay inside the package root.

The RFC does not fix:

- whether “naming an existing directory” is evaluated with `lstat` (a symlink is not a directory)
  or with `stat`/`realpath` (a symlink to a directory is a directory);
- what happens when a symlink resolves to a non-directory or does not resolve;
- whether root resolution applies to `inspect` and `explain` as well as `verify`;
- whether resolving the root is compatible with §9.10's “no path outside the package root” sentence.

The reference resolves the root and treats the resolved directory as the package root; that is a
reasonable reading of §9.2 and the reading that makes §9.10's containment rule coherent for a
symlinked root. It is not the only possible reading, which is why the RFC needs the sentence.

### Options and consequences

- **A — forbid.** A `PACKAGE` that resolves through a symlink is rejected, either as a usage error
  (64) or as `FAIL/1`. Consequences: changes the reference and all four observed baselines; adds a
  new rejection path and probably a diagnostic; makes an operator-supplied alias unusable even
  though the operator can always pass the target path directly; provides no protection against the
  T1/T3 payload threats, which are about package content, not the CLI argument. External FS-01
  passes as written, but the test would be asserting a rule the format does not need. It also
  contradicts §9.2's “existing directory” if that phrase is read with `stat`, so the RFC would need
  an explicit exception.
- **B — permit, resolve, no diagnostic.** A symlink to a directory is permitted; the verifier
  resolves it once and applies every containment rule to the resolved root. Consequences: matches
  the reference; no new code; no §12 case change; the external FS-01 expectation must be corrected
  to `PASS/0`; go/rust/python must resolve the root if FS-01 is retained, because their current
  `UNSUPPORTED/4`/`INCOMPLETE/2` is not `PASS` either. The wording must state the 64/74 mapping and
  that payload symlinks inside the resolved root remain rejected. This is the smallest change.
- **C — permit with a diagnostic or limitation.** The verdict is unchanged, but an `info` (or
  `warning`) code records that the root was resolved. Consequences: adds a new code to Appendix J
  for a condition that is not a threat and that the operator already knows; adds a limitation to
  every symlinked-root run; makes the report noisier without changing a decision; the external
  FS-01 expectation still has to change from `FAIL/1` to `PASS/0` (a diagnostic does not satisfy
  “reject”). The preliminary's objection to C is sound.

### Recommendation: B, with exact root-resolution wording

B is the only option that matches the threat model, the reference, and the operator's ability to
choose the package path. The exact wording below closes the three gaps that make the current
`PASS/0` behaviour under-specified: the resolution point, the 64/74 mapping, and the scope of the
“no symlinks” rule.

#### Exact proposed wording — RFC §4.3.2

Insert after the first bullet (the “Every payload path MUST resolve…” bullet, lines 496–498):

```markdown
- The package root is the directory named by the `PACKAGE` argument after operating-system path
  resolution. A `PACKAGE` that is a symbolic link to a directory is permitted: the verifier
  resolves it once and uses the resolved directory as the root for every containment check in this
  section. A `PACKAGE` that does not resolve is `pap.package.not-found` (exit 74, no report); a
  `PACKAGE` that resolves to something other than a directory is a usage error
  (`pap.cli.usage`, exit 64, no report). Symbolic links at or below a declared payload path remain
  rejected by the first bullet; resolving the operator-supplied root is not a payload read.
```

#### Exact proposed wording — RFC §9.2

Replace the first sentence of the first bullet (line 2163):

```markdown
- `PACKAGE` is exactly one positional argument naming an existing directory. A symbolic link to a
  directory names an existing directory and is permitted after resolution (§4.3.2); a link that
  does not resolve is `pap.package.not-found` (exit 74). v0.1 is directory-only (D1): archive
  files, OCI references, URLs and `-` are not packages.
```

The same sentence applies to `verify`, `inspect` and `explain`, because §9.2 defines `PACKAGE` once
for all three commands; no further per-command wording is needed.

#### Exact proposed wording — RFC §9.10

Append to item 3 (after line 2399):

```markdown
  Resolving the operator-supplied `PACKAGE` argument to its real path (§4.3.2) is not “following a
  path outside the package root” for this rule; after resolution, no declared payload path may
  leave the resolved root.
```

#### Exact proposed wording — Appendix J, J.1

Replace the `pap.package.not-found` row (line 5587):

```markdown
| `pap.package.not-found` | error | The package path does not exist, or a symbolic link used as `PACKAGE` does not resolve; no report, exit 74. A path that exists or resolves to something that is not a directory (including an archive file) is a usage error (`pap.cli.usage`, exit 64). A symbolic link to a directory is resolved and is not this condition |
```

No new diagnostic is added. The report's `package.path` remains the supplied path (it is
host-specific and excluded from `verificationRecordIdentity` by §5.9), so the resolved target is
not leaked as an identity input.

### Affected §12 cases, implementations and external tests

- **§12 cases:** none change. F23 (payload symlink) remains `FAIL/1` with `pap.package.symlink`;
  F25 (regular `.tar` file) remains `64`; F24 is unaffected. A future case could pin a symlinked
  root (`PASS/0`) and a dangling root (`74`), but adding fixtures is implementation work, not this
  proposal.
- **Reference:** already behaves as B at the baseline. No code change is required for the three
  probe outcomes; a regression test for the root-symlink, dangling-link and link-to-file cases is
  missing (`pap/tests/cli.test.ts` covers only an existing non-directory file) and should be added
  when the decision is implemented.
- **go/rust/python:** B is not “no change” for them. FS-01 currently returns `UNSUPPORTED/4` or
  `INCOMPLETE/2`, not `PASS/0`; if the external test is retained with the corrected expectation,
  each must implement root resolution and re-run. If their non-`PASS` result is caused by a
  different missing capability, FS-01 does not isolate root handling and the external test should
  be narrowed before it is used as evidence.
- **External FS-01:** the `FAIL/1` expectation must be corrected to `PASS/0` and recorded as a
  contract defect, not merely removed from a gate. A test that is silently “demoted” leaves the
  next implementation reading the old expectation. If the external owner insists on rejection, that
  is option A and requires a normative change the threat model does not support; the maintainer
  would have to decide it explicitly.

### Where this proposal disagrees with the preliminary position

1. **“Nobody rejects it” is not the same as “everyone agrees.”** The reference passes, but three of
   the four baselines return `UNSUPPORTED/4` or `INCOMPLETE/2`. B still requires work from those
   implementations if FS-01 is a conformance test; the preliminary position treats B as if it were
   free.
2. **The exit-code mapping is missing.** “After resolution the root must be a directory” does not
   say whether a link to a file is 64 or 74, or whether a dangling link is 64 or 74. The reference's
   behaviour (64 and 74 respectively) is the natural reading of §9.7/Appendix J, but it must be in
   the text.
3. **“Demoted/resolved” is too weak for the external expectation.** The external contract should be
   corrected to `PASS/0`; a test that is not a gate but still says `FAIL/1` will mislead the next
   reader. The proposal records this as a contract change, not just a decision not to use the test.
4. **The scope of the resolution rule is unstated.** `PACKAGE` is shared by `verify`, `inspect` and
   `explain`; the wording should say so once in §9.2 rather than read as a `verify`-only rule.

The core recommendation (B, no diagnostic) is adopted by this proposal; these are precision
corrections, not a different option.

---

## R-PAP-2 — traversal error during the undeclared-file scan

### Preliminary position

Recommend **A**: a traversal error that prevents proving there are no undeclared files means the
closed-world property was not evaluated: `coverage.full: false`, affected scope `NOT_EVALUATED`,
verdict at most `INCOMPLETE`, never `PASS`. Keep the declared-file rule as
`pap.package.io`/`declared-file-missing` → `FAIL`. The proposal should choose the exact diagnostic
(reuse an Appendix J code or justify a new one), state its severity and whether a limitation is
required, and distinguish it from the CLI I/O failure (exit 74) path of §9.10. Option B is said to
turn a verifier limitation into a producer defect; option C is said to need a new normative code.

### Repository evidence

| Claim | Evidence |
|---|---|
| Only declared payloads are read; an undeclared regular file is a warning | RFC §4.3.3 lines 510–514: undeclared file is `pap.package.undeclared-file`, “is never opened, and does not affect identities.” |
| A declared file that is missing or unreadable is an error | RFC §4.3.3 lines 515–517; §7.3 lines 1606–1613 (`integrity.package` `FAIL` includes a missing declared file). |
| Undeclared-file presence does not change a PASS | RFC §12.4.3 lines 3138: F31 (`notes/extra.txt` undeclared) expects `integrity.package: PASS`, `coverage.full: true`, `PASS/0`, with `pap.package.undeclared-file`. |
| `pap.package.io` is defined for a declared file or the manifest, not for an enumeration error | Appendix J line 5588: “A declared file or the manifest cannot be read; integrity `FAIL` …” |
| The scan is required to report undeclared files, but its failure is not specified | RFC §4.3.3 line 510–512 says a present undeclared file “is a warning”; it does not say what to do when a directory cannot be enumerated. |
| `coverage.full` currently depends only on required checks/dimensions and limit stops | RFC §7.5 lines 1744–1763. A scan failure is none of those, so the reference can report `full: true` while failing. |
| The reference implements B, not A | `pap/src/verify.ts:1347–1353`: `walk.error` → `pap.package.io`, severity `error`. `pap/src/verify.ts:307–308`: `enumerationFailure` → `integrity.package = "FAIL"`. `pap/src/verify.ts:504–505` and `report.ts` compute coverage/verdict; a `FAIL` is a decided result, so `full` stays true. |
| Reference probe | An unreadable undeclared `notes/` directory produced `FAIL/1`, `integrity.package: FAIL`, `coverage.full: true`, `pap.package.io` (diagnostic and limitation). See [`probes.md`](probes.md) P7. |
| The external FS-04 scenario is not the recorded “FS-04-adjacent” probe | Issue #95 records FS-04-adjacent as a declared artifacts directory that is unreadable: all four baselines `FAIL/1` with `pap.package.io`/`declared-file-missing`. The external FS-04 is a traversal error during the undeclared-file scan; its result on the three independent implementations is not recorded. |

### What the RFC fixes and what it leaves open

The RFC fixes the declared/undeclared split:

- a declared payload that is missing or unreadable is an error and fails package integrity;
- an undeclared regular file is a warning, is not opened, and does not affect identities;
- a limit that stops evaluation is `INCOMPLETE`, not `FAIL`, unless the manifest itself cannot be
  parsed.

The RFC does not fix:

- what to do when the verifier cannot enumerate a directory while looking for undeclared files;
- whether that condition is a package error, a verifier limitation, or a warning-only condition;
- which diagnostic code and severity it uses;
- whether `coverage.full` becomes false;
- whether any dimension status changes.

The reference's choice (B) is not supported by Appendix J's stated effect for `pap.package.io`,
because the object it cannot read is not a declared file or the manifest. That does not make B
unreasonable; it makes it a choice that needs a normative rule, which is exactly what R-PAP-2 is
about.

### Options and consequences

- **A — scan failure is `INCOMPLETE`, never `FAIL`.** Emit a new warning code, record a limitation,
  set `coverage.full: false`; the verdict is at most `INCOMPLETE`; no dimension changes. Consequences:
  aligns with the declared/undeclared split and with “no silent success”; the reference must change
  from `FAIL/1` to `INCOMPLETE/2`; a new Appendix J row is required; §7.5's `full` definition needs
  a scan-completeness conjunct; no §12 fixture can portably create an unreadable directory, so the
  test is a unit/hostile test or a platform-guarded case, not a static package.
- **B — extend the declared-scope I/O rule to the scan.** `pap.package.io` error, `FAIL/1`.
  Consequences: matches the reference's current behaviour; no new code; external FS-04
  (`INCOMPLETE/2`) fails; a package whose only problem is an unreadable undeclared directory is
  reported as a producer defect even though no declared payload is bad; `coverage.full` can remain
  `true`, which says the required scope was fully evaluated while the warning scope was not. The
  preliminary's objection is directionally right, but “verifier limitation vs producer defect” is
  not the whole story: a permission bit is package state. The stronger objection is that an
  undeclared-file warning is not a required assertion, so failing the package for it overstates
  what was proven.
- **C — define a new diagnostic and dimension semantics.** A new code plus a new dimension or
  status. Consequences: a new dimension is a report-schema change and a much larger amendment;
  it is not needed to express “the scan scope was not evaluated”, because `coverage.full: false`
  plus a limitation already says that. A and C are not mutually exclusive: A needs a code, which
  is C's diagnostic part; A does not need C's dimension part.

### Recommendation: A, with a new warning code and a coverage rule

A is the only option that keeps the declared/undeclared split and prevents a warning-level scope
from becoming a package failure. It is a targeted addition: one warning code, one `coverage.full`
conjunct, one limitation, no new dimension, no report-schema change. The exact wording below also
restates the declared-file rule so the two scenarios cannot be confused, and distinguishes the
report-level outcome from the exit-74 CLI I/O path.

#### Exact proposed wording — RFC §4.3.3

Insert after the first bullet (after line 514):

```markdown
- The verifier enumerates the package tree to report undeclared files. It MUST NOT open an
  undeclared file. If a directory under the package root cannot be enumerated, the verifier MUST
  emit `pap.package.undeclared-scan-incomplete` (warning) with scope `package`, add the same code
  to `limitations[]`, and set `coverage.full: false`; the verdict is at most `INCOMPLETE` and MUST
  NOT be `PASS`. The affected scope is the undeclared-file scan; it is not a required check or
  dimension and has no separate report field, so the incompleteness is expressed by the
  diagnostic, the limitation and `coverage.full: false`, and no dimension is changed to
  `NOT_EVALUATED` solely by this condition. This is a report-level outcome
  for a package that was otherwise evaluated, not the exit-74 CLI I/O failure of §9.7: resolving
  the root still uses `pap.package.not-found` (74) when the `PACKAGE` does not exist, and an
  unreadable or missing manifest still uses `pap.package.io` with a `FAIL` report (§7.7). This rule
  does not apply to a declared payload: a missing, unreadable or non-regular declared payload
  remains `pap.package.declared-file-missing`/`pap.package.io` and `FAIL` (the next bullet; §7.3).
```

#### Exact proposed wording — RFC §7.5

Replace the first bullet (lines 1744–1745):

```markdown
- `full` is `true` only when every required check was evaluated, every required dimension was
  evaluated, and the undeclared-file scan completed; `PASS` requires `full: true`.
```

Replace the sentence at lines 1758–1763 with:

```markdown
  `full` is then `checksNotEvaluated == 0`, `checksUnsupported == 0`,
  `dimensionsEvaluated == len(requiredDimensions)`, and the undeclared-file scan completed. It is
  `false` when the required set is empty (no required check and no required dimension): the
  empty-required-set case is `INCOMPLETE` by §7.4 rule 4, never a vacuously full coverage. It is
  also `false` whenever a `pap.package.limit-exceeded` stopped evaluation of any declared payload,
  required check or signature envelope, even if the affected dimension is not in
  `requiredDimensions`, and whenever the undeclared-file scan is incomplete.
```

#### Exact proposed wording — Appendix J, J.1

Add after the `pap.package.undeclared-file` row (line 5600):

```markdown
| `pap.package.undeclared-scan-incomplete` | warning | The verifier could not enumerate part of the package tree, so the absence of undeclared files was not established; `coverage.full: false`, verdict at most `INCOMPLETE`, and a limitation with the same code. Declared payload integrity is unaffected |
```

#### Exact proposed wording — RFC §13.8

Add a row to the “Underspecified areas” table:

```markdown
| Undeclared-file scan completeness | **Resolved** by §4.3.3/§7.5: an enumeration failure yields `pap.package.undeclared-scan-incomplete`, `coverage.full: false` and `INCOMPLETE`; a declared-file failure remains `FAIL`. | a unit/hostile test; no portable static case (see below) |
```

No §7.4 change is needed: rule 4 already maps `coverage.full: false` to `INCOMPLETE`. No §9.7
change is needed: exit 74 remains the pre-evaluation CLI failure; this rule is a report-level
outcome. No report-schema change is needed: Appendix C's diagnostic/limitation code patterns admit
the new code.

### Affected §12 cases, implementations and external tests

- **§12 cases:** none change. F31 (undeclared file) remains `PASS/0` with
  `pap.package.undeclared-file`; F23/F24/F26/F60 are unaffected. A new case is desirable but hard
  to make portable: a committed directory with mode `000` is not reliably unreadable in CI (root can
  read it, and archive round-trips may not preserve the mode), and a symlinked or dangling
  directory is skipped by the reference walker rather than producing a traversal error. The
  proposal therefore recommends a unit/hostile test with a controlled filesystem error, not a
  static `F` fixture; if the maintainer requires a §12 case, the external contract's FS-04
  mechanism must be specified first.
- **Reference:** must change three places: `reportUndeclaredFiles` emits the new warning instead of
  `pap.package.io` for `walk.error`; `integrityPackage` no longer becomes `FAIL` on
  `enumerationFailure`; `computeCoverage`/`computeVerdict` receive a scan-incomplete flag and set
  `full: false`, `INCOMPLETE/2`. The existing `enumerate` hostile test currently has no
  unreadable-directory case; add one with a mocked/controlled failure or a platform guard.
- **go/rust/python:** the external FS-04 expectation (`INCOMPLETE/2`) is A, so those
  implementations already aim at the right outcome; they need the exact code and coverage rule.
  Their current scan behaviour was not recorded, so this proposal does not claim they are
  conformant.
- **External FS-04:** A matches its `INCOMPLETE/2` expectation. The external contract should name
  the diagnostic code and the `coverage.full: false` assertion, and should distinguish the declared
  unreadable-file case (which stays `FAIL/1`). The “FS-04-adjacent” probe is not a substitute for
  FS-04 in either direction.

### Where this proposal disagrees with the preliminary position

1. **A is not the status quo.** The reference currently implements B: `pap.package.io` error,
   `integrity.package: FAIL`, `coverage.full: true`, exit 1. The preliminary recommendation would
   change the reference and needs to say so; otherwise the proposal reads as if A were a
   clarification.
2. **A needs C's diagnostic, not C's dimension.** The option list presents A and C as alternatives,
   but A cannot be implemented without naming a diagnostic; C's “new diagnostic code” is part of A,
   while C's “dimension semantics” is the part A does not need. The proposal should say “A with a
   new warning code”, not “A or C”.
3. **“Verifier limitation vs producer defect” is too simple.** An unreadable directory can be
   package state (a permission bit) or a verifier limitation (an I/O error, a platform limit). The
   robust reason for A is the declared/undeclared split: undeclared-file reporting is a warning
   scope, not a required assertion, so failing the package for it overstates the result. That reason
   survives both causes.
4. **`coverage.full: true` is the silent part.** The current B result fails, so it is not a silent
   PASS; but it reports full coverage while the warning scope was not evaluated. A's `full: false`
   is the change that makes the report honest, and the preliminary position should state it as a
   `coverage` change, not only a verdict change.
5. **The testability gap is unaddressed.** A cannot be pinned by a portable static fixture in the
   current corpus. That does not make A wrong, but it means the decision needs a test strategy, not
   just wording.

The core recommendation (A, never FAIL) is adopted by this proposal; these are precision and
implementation corrections.

---

## R-PAP-3 — directory-count / entry ceiling during the scan

### Preliminary position

Recommend **B**: keep any directory-count ceiling non-normative, a robustness test only, never a
pass/fail gate. The preliminary argues that v0.1 limits are verifier safety boundaries; adding a
directory-count limit (A) requires a new default value in §4.3.4/§10.5 and changes acceptance for
existing packages, while the RFC records “no wall-clock budget” as a v0.1 limitation. The external
test is itself classified `SPEC_AMBIGUITY`. B keeps the probe useful for implementation robustness
without creating a false gate; C loses the information.

### Repository evidence

| Claim | Evidence |
|---|---|
| The normative limits are declaration/byte/JSON/collection counts; there is no directory or entry limit | RFC §4.3.4 lines 532–544 and §10.5 lines 2637–2651. `payload files` counts manifest declarations, not filesystem entries; `claims files` counts claim declarations; the JSON/relation limits are semantic collections. |
| The scan is not bounded by a normative limit | RFC §4.3.3 lines 510–520 defines the warning but no scan bound; §4.3.4 has no row for entries visited. |
| “No wall-clock budget” is a time limitation, not an entry-count limitation | RFC §10.4 T17 line 2617; §10.5 lines 2676–2677. A count limit is a different control and is compatible with deferring a wall-clock budget. |
| The threat model acknowledges resource exhaustion and the residual | T17 line 2617: CPU/memory can be consumed up to the limits; no wall-clock budget. §10.6 line 2695: DoS beyond the bounded CPU/memory limits is a host-level concern. |
| The reference already imposes an undocumented entry budget | `pap/src/paths.ts:316`: `const maxEntries = Math.max(1_024, limits.payloadFiles * 2);`; lines 317–358 count every directory entry and stop with `limitHit`. With default `payloadFiles = 4096`, the cap is 8 192 entries. |
| The reference reports the cap with a normative limit code | `pap/src/verify.ts:1348–1350`: `pap.package.limit-exceeded`, severity `error`; `:245` sets `payloads.limitHit`; `:329–330` emits a second `pap.package.limit-exceeded`. |
| The reference test expects `INCOMPLETE` | `pap/tests/hostile.test.ts:239–255`: 1 100 undeclared entries with `payloadFiles: 1` (cap 1 024) → exit 2, `INCOMPLETE`, `coverage.full: false`, `pap.package.limit-exceeded`. |
| Reference probe | 8 300 directories under an undeclared `bulk/` → `INCOMPLETE/2`, `integrity.package: PASS`, `integrity.artifacts: PASS`, `coverage.full: false`, two `pap.package.limit-exceeded` diagnostics. See [`probes.md`](probes.md) P8. |
| The corpus does not pin a directory/entry ceiling | No F case names a directory count; `cases.json` has no such case. |
| The Gate 1 audit records the missing branch | `docs/architecture/pap-v0.1-gate1-decision-audit.md:204–223`: “specified-but-unexercised branches” includes payload-count and byte limits, but no scan-entry limit; line 171 records wall-clock budgets as deferred. |

### What the RFC fixes and what it leaves open

The RFC fixes:

- limits are safety boundaries; exceeding one makes the affected scope unverifiable, not invalid;
- a limit that stops a declared payload or required check sets `coverage.full: false` and caps the
  verdict at `INCOMPLETE`, never `PASS`;
- a policy may lower a limit but not raise it;
- effective lowered limits are reported.

The RFC does not fix:

- whether the verifier may bound the undeclared-file scan at all;
- what the bound counts (directories, files, symlinks, all entries);
- what default applies and whether policy may lower it;
- what the report says when the bound is hit;
- whether `coverage.full` becomes false (the current `payloadFiles`-derived cap does set
  `payloads.limitHit`, so the reference's behaviour is `INCOMPLETE`, but that is implementation
  behaviour, not a §4.3.4 rule).

### Options and consequences

- **A — add a normative `scanEntries` limit.** Default 8 192 entries; the verifier counts every
  directory entry visited (files, directories and symbolic links) during the undeclared-file scan
  and stops at the cap; exceeding it emits `pap.package.limit-exceeded`, records the scan as
  incomplete (no dimension status change), sets `coverage.full: false`, and caps the verdict at
  `INCOMPLETE`. The policy may lower it through a new optional `limits.scanEntries` property (or
  the default is fixed and non-lowerable in v0.1; see the exact wording). Consequences: one new
  limit row in §4.3.4, one in §10.5, one in the limit-interaction table, one optional Appendix B
  property, one Appendix C `effectiveLimits` enum entry, one `coverage.full` conjunct; the external
  directory-count test becomes a conformance case that can be authored against a fixed number; the
  reference's hidden cap becomes the normative cap; a package with more than the cap changes from
  `PASS` to `INCOMPLETE`, which is a limit outcome, not a producer defect. The default 8 192 is
  2 × the 4 096 declaration limit and matches the reference's public default; a lower value
  tightens acceptance, a higher value weakens the bound.
- **B — non-normative robustness only.** No RFC change. Consequences: the reference's 8 192-entry
  cap and its `pap.package.limit-exceeded` report remain non-conformant to §4.3.4, because the
  table does not contain that limit; two conforming verifiers can disagree on the same package
  (`PASS/0` versus `INCOMPLETE/2`); the external test must be reclassified as robustness-only, and
  it must not assert a report outcome; if the reference keeps its cap, it needs a non-normative code
  or an explicit waiver; if it removes the cap, the scan is unbounded and the DoS residual grows.
  B does not resolve the question; it moves it into implementation-defined behaviour.
- **C — drop the test.** Consequences: no RFC change; the probe information is lost; the next
  implementation still has to decide whether to cap. It does not resolve the ambiguity either.

### Recommendation: A, with a normative `scanEntries` limit

A is the smaller and more deterministic change. The reference already caps enumeration; the only
question is whether the cap is a private implementation detail or part of the contract. A private
cap that changes the verdict is not a detail: it is observable behaviour that two conforming
verifiers can disagree on. The RFC's own principle — limits are a verifier safety boundary, not a
producer defect — supports making the boundary explicit. Deferring a wall-clock budget is not a
reason to leave the entry count unbounded, because the entry count is exactly the kind of
collection-size limit §4.3.4 already uses (`payload files`, `claims files`, `provenance bindings`,
`relation entities/edges`, `signature envelopes`).

A count of **entries**, not directories, is the right unit: a single directory with millions of
files bypasses a directory-only limit. The default **8 192** matches the reference's public default
and gives 2× headroom over the 4 096 declaration limit; it is a maintainer choice, and the wording
below isolates the number so it can be changed without rewriting the rule.

#### Exact proposed wording — RFC §4.3.4 table

Add a row after `payload files` (line 535):

```markdown
| filesystem entries visited by the undeclared-file scan | 8 192 |
```

#### Exact proposed wording — RFC §4.3.4 enforcement

Add a bullet after the payload-count bullet (after line 561):

```markdown
- The undeclared-file scan is bounded by `scanEntries`. The count includes every directory entry
  visited under the package root (regular files, directories and symbolic links); the package root
  itself is not counted. Exceeding the limit stops the scan, emits
  `pap.package.limit-exceeded` with the limit name `scanEntries`, records the scan as incomplete
  (the diagnostic and a limitation, with no dimension status change), sets `coverage.full: false`,
  and makes the verdict at most `INCOMPLETE` (exit 2). No dimension becomes `NOT_EVALUATED` solely
  because of this limit, and no `PASS` may be reported. Entries observed before the stop MAY still
  be reported as undeclared-file warnings, but the scan is not claimed complete.
```

Add a row to the limit-interaction summary table (after the signature-envelopes row, line 580):

```markdown
| scan entries (undeclared-file enumeration) | undeclared-file scan incomplete; no dimension status change; entries before the stop may be reported | `false` | `INCOMPLETE` |
```

#### Exact proposed wording — RFC §10.5 table

Add a row after `Payload files` (line 2640):

```markdown
| Undeclared-file scan entries | 8 192 | count every entry visited while walking; stop at the cap; do not open an undeclared file |
```

#### Exact proposed wording — RFC §7.5

The scan-completeness conjunct is the same one R-PAP-2 requires; see R-PAP-2 §“Exact proposed
wording — RFC §7.5”. If both decisions are accepted, insert it once. A limit hit is also covered by
the existing `pap.package.limit-exceeded` clause of §7.5; the new conjunct makes a scan stop
without a limit (an I/O error) expressible as well.

#### Exact proposed wording — Appendix B, `limits`

Add an optional property to the `limits` object (after `payloadFiles`, line 243):

```json
"scanEntries": {
  "type": "integer",
  "minimum": 1,
  "maximum": 8192
}
```

If the maintainer prefers no policy-schema change, omit this property and state in §4.3.4 that the
8 192 default is fixed and not lowerable in v0.1. That variant is still option A; it is narrower but
less consistent with the other limits, and it also avoids the `effectiveLimits` enum change below.
The proposal recommends the property because it makes the new limit testable with a small fixture
and keeps the “policy may lower, never raise” rule uniform.

#### Exact proposed wording — Appendix C, `effectiveLimits`

If `scanEntries` is policy-lowerable, add it to the `effectiveLimits` property-name enum:

```json
"scanEntries"
```

The property remains `{"type": "integer", "minimum": 1}` under `additionalProperties`; no other
report-shape change is needed. If the fixed non-lowerable variant is chosen, this enum addition is
not needed, because `effectiveLimits` only reports lowered limits.

#### Exact proposed wording — RFC §13.8

Add a row to the “Underspecified areas” table:

```markdown
| Undeclared-file scan bound | **Resolved** by §4.3.4/§10.5: a normative `scanEntries` limit (default 8 192); over-limit is `pap.package.limit-exceeded`, the scan is incomplete, `coverage.full: false`, `INCOMPLETE`. | a future `F62` with a lowered `scanEntries` |
```

#### Future case (not part of this proposal)

A practical case can lower the limit instead of creating 8 193 entries:

```json
{
  "caseId": "F62-scan-limit",
  "command": ["verify", ".", "--trust-policy", "../trust-policy/scan-lowered.json",
              "--format", "json", "--now", "2026-11-02T00:00:00Z"],
  "expect": {
    "exitCode": 2,
    "verdict": "INCOMPLETE",
    "dimensions": {"integrity.package": "PASS", "integrity.artifacts": "PASS"},
    "diagnosticCodes": ["pap.package.limit-exceeded", "pap.limit.lowered"],
    "limitationCodes": ["pap.package.limit-exceeded"],
    "coverageFull": false,
    "effectiveLimits": {"scanEntries": 4}
  }
}
```

`scan-lowered.json` is `unsigned-valid.json` with `limits: {"scanEntries": 4}` and a fresh
validity window; the fixture package adds five entries under `notes/` (or five directories). This
case is a future implementation artifact, not a change in this proposal.

### Affected §12 cases, implementations and external tests

- **§12 cases:** no existing case changes. F31 (one undeclared file) remains `PASS/0`; the scan
  completes under the default. A future F62 can pin the limit with a lowered policy; adding it is
  implementation work. The default 8 192 is high enough that no existing fixture is affected.
- **Reference:** replace `maxEntries = max(1024, payloadFiles × 2)` with `limits.scanEntries`
  (default 8 192); extend `Limits`, policy parsing and `effectiveLimits`; keep the existing
  `pap.package.limit-exceeded` report but align the scope/message with the new rule; update
  `pap/tests/hostile.test.ts:239–255` to lower `scanEntries` rather than `payloadFiles`. The
  `inspect` walker (if it keeps its own bound) should use the same limit and report an incomplete
  inspection rather than a package verdict.
- **go/rust/python:** each needs a bounded scan and the same `scanEntries` default to agree on a
  package at the boundary. With B, they can differ indefinitely; that is the conformance problem A
  fixes.
- **External directory-count test:** under A it becomes a conformance case; the test must either
  exceed 8 192 entries or lower `scanEntries` via policy. Its current `SPEC_AMBIGUITY` label is then
  resolvable. Under B it must be reclassified as robustness-only and must not assert
  `INCOMPLETE/2`; the current reference test would still assert it, which is the inconsistency B
  leaves behind.

### Where this proposal disagrees with the preliminary position

1. **B is not the status quo.** The reference already caps enumeration at 8 192 entries and reports
   `pap.package.limit-exceeded`; `pap/tests/hostile.test.ts` asserts `INCOMPLETE`. The preliminary
   position presents B as preserving current behaviour, but current behaviour is a non-normative
   cap that uses a normative code. B either blesses that silently or requires a code change.
2. **B leaves two conforming verifiers disagreeing.** A package with 8 300 entries is `INCOMPLETE/2`
   on the reference and `PASS/0` on a verifier without a cap. §13.4/§13.6 comparison cannot accept
   that. A gives both the same answer.
3. **“No wall-clock budget” does not imply “no entry budget.”** The RFC records a deferred time
   budget; it also uses collection-size limits extensively. An entry cap is the same kind of control
   and is compatible with deferring time.
4. **A is not a producer defect.** Over-limit yields `INCOMPLETE`, not `FAIL`, and the package is
   not declared invalid. The preliminary's own principle — limits are verifier safety, not producer
   defects — supports A, not B.
5. **A directory-only ceiling is insufficient.** The issue's name says “directory-count”, but the
   risk is total entries; one directory with many files bypasses a directory-only cap. The proposal
   uses `scanEntries`.

The core disagreement is real: the proposal recommends A, not B. If the maintainer prefers B, the
minimum coherent version is: remove the reference's `pap.package.limit-exceeded` use for the scan
cap, reclassify the external test as robustness-only, and state that a verifier-imposed scan cap is
outside the conformance contract. That is a larger behavioural change than A, which is why the
proposal does not recommend it.

---

## R-PAP-4 — cross-class / case-only path collision policy

### Preliminary position

Recommend **A**: current behaviour is normative — duplicates within a class and case-only
collisions are invalid; an identical package-relative path across different payload classes is
allowed. The preliminary argues that §4 fixes disjoint payload roots, so “the same
package-relative path in two classes” cannot occur for well-formed declarations; the live risk is
duplicates within a class and case-only collisions, which F24 already treats as `FAIL`. Option B
invents a constraint with no evidence; option C adds diagnostics for a shape the grammar makes
impossible. If A is accepted, state the rule once in §4.3.1 and cross-reference F24; if the
maintainer wants any cross-class aliasing statement, make it an explicit non-goal.

### Repository evidence

| Claim | Evidence |
|---|---|
| The path grammar admits only ASCII segments, no `.`/`..`, and fixed roots per class | RFC §4.3.1 lines 464–486, especially lines 480–483: “declared roots are fixed per file class: `artifacts/`, `inputs/`, `sources/`, `claims/`; signatures live only under `signatures/`.” |
| The duplicate/case rule is global, not per class | RFC §4.3.1 lines 484–486: “Two declarations with the same path, or paths that differ only by case, are `INVALID` even on a case-sensitive filesystem.” It does not say “within a class”. Appendix J line 5594: “Two declarations share a path, or differ only by case.” |
| Appendix A enforces the class prefix | `pap/schemas/manifest.schema.json:159` (`^artifacts/`), `:204` (`^inputs/`), `:249` (`^sources/`), `:424` (`^claims/`). |
| The reference rejects a wrong-root declaration | `pap/src/manifest.ts:373–378`: an artifact path that does not start with `artifacts/` is `pap.package.path-invalid`. The same pattern exists for inputs/sources/claims. |
| The reference's duplicate detection is global across all declared payload classes | `pap/src/manifest.ts:720–750`: one `declaredPaths` map; artifacts, inputs, sources and claims are added to the same map; `pathKey` lowercases. `pap/src/verify.ts:1374+` repeats the check for the reporting path. |
| F24 is a within-class case-only collision | `pap/fixtures/pap-v0.1/F24-case-duplicate` declares `artifacts/A.md` and `artifacts/a.md`; `cases.json:624–647` expects `FAIL/1`, `integrity.package: FAIL`, `integrity.artifacts: FAIL`, `pap.package.path-duplicate`, `coverageFull: false`. |
| Cross-class same *basename* is allowed | Reference probe P10: `artifacts/acme-policy.md` and `sources/acme-policy.md` both declared and present → `PASS/0`, no diagnostics. |
| Cross-class same *path* is not reachable for a well-formed declaration | The artifact must start with `artifacts/`, the source with `sources/`; a path cannot start with both. A malformed attempt (`sources/acme-policy.md` declared as an artifact) produces `pap.package.path-invalid` and, because the same path is also a source, `pap.package.path-duplicate` (probe P11). |

### What the RFC fixes and what it leaves open

The RFC fixes:

- the declared root is fixed per class;
- two declarations with the same path, or paths differing only by case, are invalid;
- the duplicate/case rule is reported as `pap.package.path-duplicate`, not `pap.package.schema`;
- the path is the identity of a payload file.

The RFC does not fix:

- an explicit statement that the duplicate rule is global across classes (it is implied by the
  wording and by the shared path namespace);
- an explicit statement that a cross-class collision is impossible, not merely allowed;
- what happens when a malformed declaration uses another class's path (it is already
  `path-invalid`, and the global duplicate map can also report `path-duplicate`);
- whether a verifier may add a separate cross-class collision rule (none is needed).

### Options and consequences

- **A — current behaviour is normative.** Duplicates and case-only collisions within a class are
  invalid; an identical package-relative path across classes is impossible for a well-formed
  declaration. Consequences: no code change; one clarifying sentence in §4.3.1; F24 unchanged; no
  new diagnostics; the global duplicate map is already the implementation. The only wording change
  is “impossible/not reachable” instead of “allowed”.
- **B — a package-relative path may appear only once across all payload classes.** Consequences:
  vacuous for well-formed declarations because the roots are disjoint; for malformed declarations
  the reference already applies the global duplicate map, so B is already true; if a verifier read
  B as a new constraint, it would add no detection but could change diagnostic ordering. It invents
  a constraint with no evidence, as the preliminary says.
- **C — define collision classes explicitly in §4.3.1 with diagnostics.** Consequences: new
  diagnostics for shapes the grammar already prevents; a larger normative surface; the only live
  shape is the within-class case-only collision, which F24 already covers with
  `pap.package.path-duplicate`. It is over-specification.

### Recommendation: A, with corrected wording and no new diagnostics

A is right: the duplicate/case rule is already global, and the cross-class case is structurally
impossible for a well-formed declaration. The correction is to say “impossible”, not “allowed”,
and to state that a malformed declaration that reuses another class's path is already handled by
`path-invalid` (and may additionally be `path-duplicate` because the duplicate map is global). This
avoids implying a permission that the grammar does not grant and avoids a new diagnostic.

#### Exact proposed wording — RFC §4.3.1

Replace the last bullet (lines 484–486) with:

```markdown
- the path is the identity of a payload file. Two declarations with the same path, or paths that
  differ only by case, are `INVALID` even on a case-sensitive filesystem, so a package behaves
  identically when copied to a case-insensitive one. The duplicate and case-fold rules apply to all
  declared payload paths as one set, not per class. Because the declared root is fixed per class, a
  well-formed package cannot contain one package-relative path in two classes, and an
  implementation MUST NOT add a separate cross-class collision rule. A declaration whose path does
  not start with its class root is `pap.package.path-invalid`; the duplicate rule is still
  evaluated over the same declaration set, so a malformed declaration may additionally produce
  `pap.package.path-duplicate` when it equals another declaration.
```

No Appendix J change and no new diagnostic. The rule remains `pap.package.path-duplicate`
(line 5594).

#### Exact F24 expectation

F24 remains exactly as in `cases.json:624–647`:

- fixture: `artifacts/A.md` and `artifacts/a.md` both declared;
- `integrity.package: FAIL`, `integrity.artifacts: FAIL`;
- `pap.package.path-duplicate`;
- `coverage.full: false`;
- verdict `FAIL`, exit 1.

The reference's extra diagnostics on F24 (`declared-file-missing` for the colliding entries, a
`pap.check.not-evaluated` limitation) are allowed by `cases.json`'s set semantics; they are not a
new rule and should not be added to the expectation unless a future case wants
`diagnosticCodesExact: true`.

### Affected §12 cases, implementations and external tests

- **§12 cases:** F24 unchanged. No new case is needed; a future case could pin the cross-class
  basename `PASS` (P10), but it adds little because the grammar already makes the path sets
  disjoint. No corpus change in this proposal.
- **Reference:** no code change. The global duplicate map already implements A; the cross-class
  wrong-root probe already reports `path-invalid` (and `path-duplicate` when the path is also
  declared in the other class). If a stricter “one diagnostic per declaration” rule is desired,
  that is a separate change and not required by R-PAP-4.
- **go/rust/python:** verify that duplicate detection is global across classes, not per class. The
  issue's concern is that an implementation might compare only within a class; if it does, it would
  miss the malformed cross-class reuse that the reference catches. No new diagnostics are needed.
- **External cross-class test:** if one exists, it should assert the well-formed case (same
  basename, different path → `PASS`) and the case-only within-class case (F24 → `FAIL`); it should
  not assert an “allowed” cross-class same-path case, which cannot be constructed with a valid
  manifest.

### Where this proposal disagrees with the preliminary position

1. **“Allowed” is the wrong word.** A well-formed declaration cannot produce an identical
   package-relative path in two classes because the roots are disjoint. The text should say
   “impossible/not reachable”, not “allowed”. The difference matters because “allowed” suggests a
   permission a producer may rely on; there is nothing to rely on.
2. **The global duplicate rule is already the implementation.** The preliminary says “codify
   current behaviour”, which is right, but the current `pap/src/manifest.ts` duplicate map is
   already global across artifacts, inputs, sources and claims. The proposal should cite that and
   not imply the reference is per-class.
3. **The malformed cross-class attempt is not a new collision class.** Declaring
   `sources/acme-policy.md` as an artifact produces `path-invalid`; because the path is also a
   source, it produces `path-duplicate` as well. That is the global map doing its job, not a
   separate cross-class rule. Option C would create diagnostics for a shape the grammar already
   rejects; the preliminary's objection to C is sound.
4. **The only live collision is within-class case-only.** F24 is the exact expectation; the
   proposal should cross-reference it and stop there. The preliminary's “cross-reference F24”
   suggestion is adopted here.

The core recommendation (A, no new diagnostics) is adopted by this proposal; the wording is
corrected.

---

## Cross-decision summary

| Decision | RFC sections changed | New diagnostic | New limit / schema | §12 case change | Reference change | External test effect |
|---|---|---|---|---|---|---|
| R-PAP-1 | §4.3.2, §9.2, §9.10, Appendix J row | none | none | none | none (test coverage only) | FS-01 expect `PASS/0`, not `FAIL/1` |
| R-PAP-2 | §4.3.3, §7.5, Appendix J, §13.8 | `pap.package.undeclared-scan-incomplete` (warning) | none | none (unit/hostile test; no portable static case) | `pap.package.io`/`FAIL`/`coverage.full:true` → new code/`INCOMPLETE`/`coverage.full:false` | FS-04 `INCOMPLETE/2` matches A; name the code and coverage assertion |
| R-PAP-3 | §4.3.4, §10.5, §7.5, Appendix B, Appendix C, §13.8 | none (reuse `pap.package.limit-exceeded`) | `scanEntries`, default 8 192; optional `limits.scanEntries`; optional `effectiveLimits.scanEntries` | none existing; future F62 | replace hidden 8 192 cap with the normative limit | directory-count test becomes conformance-eligible |
| R-PAP-4 | §4.3.1 wording only | none | none | none | none | assert well-formed cross-class basename `PASS`, not same-path “allowed” |

No decision requires a broader RFC amendment, a new dimension, or a reopening of D1–D12/§16.1.
R-PAP-2 adds a diagnostic code permitted by Appendix C's existing pattern. R-PAP-3 is the largest
change: it adds an optional Appendix B property and a matching Appendix C `effectiveLimits` enum
entry; both are optional if the maintainer prefers a fixed, non-lowerable default, in which case
the report schema is unchanged.
