# Probes — PAP Phase 2a RFC ambiguities

This document records the probes used in [`decisions.md`](decisions.md), the commands that
reproduce them, the observed results, and the parts of the evidence that are only quoted from
Issue #95. The probes use the public reference verifier under `pap/`; no private implementation
source, private audit tooling or external service is required.

**Environment used for the recorded run:** `agent-federation/contract-builder` `main` at
`0a5132ec9e36e12a85d66a2231f77f042136e13e`, Bun `1.4.4`, Linux, uid 1003, fixed
`--now 2026-11-02T00:00:00Z`. The RFC and corpus hashes are in
[`decisions.md`](decisions.md) §“Evidence baseline”.

**Scope:** the probes exercise the reference verifier only. The three independent Phase 2a
implementations (go, rust, python) and the external conformance contract v0.1.0-draft are not in
this repository and were not run. Their results are quoted from Issue #95 and labelled as such.

## 0. Setup

Run from the repository root. The script copies fixtures to a temporary directory; it never edits
the repository.

```bash
export REPO="$(git rev-parse --show-toplevel)"
export BUN="${BUN:-$HOME/.bun/bin/bun}"
export PATH="$(dirname "$BUN"):$PATH"
export P="$(mktemp -d)"
export POL="$REPO/pap/fixtures/pap-v0.1/trust-policy/unsigned-valid.json"
export NOW="2026-11-02T00:00:00Z"

# Helper: run a verify and print a compact summary.
pap-probe() {
  local name="$1"; shift
  "$BUN" "$REPO/pap/bin/pap" verify "$@" --trust-policy "$POL" --format json --now "$NOW" \
    > "$P/$name.json" 2> "$P/$name.err"
  local code=$?
  echo "== $name exit=$code"
  if [ -s "$P/$name.json" ]; then
    python3 - "$P/$name.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
dim = d.get("dimensions", {})
print("verdict:", d.get("verdict"))
print("integrity:", dim.get("integrity"))
print("coverage.full:", d.get("coverage", {}).get("full"))
print("diagnostics:", [x["code"] for x in d.get("diagnostics", [])])
print("limitations:", [x["code"] for x in d.get("limitations", [])])
PY
  fi
  [ -s "$P/$name.err" ] && sed 's/^/stderr: /' "$P/$name.err"
  return 0
}
```

`pap-probe` deliberately returns 0 so a failing case (`exit 1`/`2`/`64`/`74`) does not stop the
shell. The `exit=` line is the verifier's exit code. `--trust-policy` is absolute so the fixture
package can be run from any working directory.

## 1. R-PAP-1 — symlinked package root

### P1 — control: unchanged package

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/root-target"
pap-probe p1-control "$P/root-target"
```

Observed: `exit=0`, `PASS`, `integrity.package=PASS`, `integrity.artifacts=PASS`,
`coverage.full=true`, no diagnostics.

### P2 — root is a symlink to a valid package

```bash
ln -s "$P/root-target" "$P/root-link"
pap-probe p2-root-symlink "$P/root-link"
```

Observed: `exit=0`, `PASS`, `integrity.package=PASS`, `integrity.artifacts=PASS`,
`coverage.full=true`, no diagnostics. This reproduces the Issue #95 FS-01 reference result
(`PASS/0`).

### P3 — root is a symlink to a regular file, and a dangling symlink

```bash
ln -s "$REPO/pap/fixtures/pap-v0.1/archive.tar" "$P/file-link"
ln -s "$P/does-not-exist" "$P/dangling-link"
pap-probe p3a-file-link "$P/file-link"
pap-probe p3b-dangling "$P/dangling-link"
```

Observed:

- `p3a-file-link`: `exit=64`; no stdout; stderr
  `pap: pap.cli.usage: package path is not a directory: …/file-link`.
- `p3b-dangling`: `exit=74`; no stdout; stderr
  `pap: pap.package.not-found: package path does not resolve: …/dangling-link`.

### P4 — root symlink to a package whose declared artifact is a symlink

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F23-symlink" "$P/payload-symlink-target"
ln -s "$P/payload-symlink-target" "$P/payload-symlink-root"
pap-probe p4-payload-symlink "$P/payload-symlink-root"
```

Observed: `exit=1`, `FAIL`, `integrity.package=FAIL`, `integrity.artifacts=FAIL`,
`coverage.full=false`; diagnostics include `pap.package.symlink` (plus
`pap.package.declared-file-missing` and `pap.check.not-evaluated` from the same fixture).

**Interpretation.** The reference resolves the CLI root and does not treat it as a payload symlink;
symlinks at or below a declared payload path remain rejected. The 64/74 outcomes for a link to a
file and a dangling link match §9.7/Appendix J. See R-PAP-1 in [`decisions.md`](decisions.md).

## 2. R-PAP-2 — traversal error during the undeclared-file scan

### P5 — FS-02: a declared artifact reached through a symlinked parent

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/symlink-parent"
(cd "$P/symlink-parent" && mv artifacts artifacts.real && ln -s artifacts.real artifacts)
pap-probe p5-symlink-parent "$P/symlink-parent"
```

Observed: `exit=1`, `FAIL`, `integrity.package=FAIL`, `integrity.artifacts=FAIL`,
`coverage.full=false`; diagnostics include `pap.package.symlink`. This reproduces the Issue #95
FS-02 reference result and confirms that a symlinked **parent** inside the package is rejected,
not only a final-component symlink.

### P6 — FS-04-adjacent: a declared artifacts directory is unreadable

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/declared-dir-unreadable"
chmod 000 "$P/declared-dir-unreadable/artifacts"
pap-probe p6-declared-unreadable "$P/declared-dir-unreadable"
chmod 755 "$P/declared-dir-unreadable/artifacts"
```

Observed: `exit=1`, `FAIL`, `integrity.package=FAIL`, `integrity.artifacts=FAIL`,
`coverage.full=false`; diagnostics include `pap.package.io` and
`pap.package.declared-file-missing`. This reproduces the Issue #95 “FS-04-adjacent” result on the
reference (all four baselines `FAIL/1`).

### P7 — the actual R-PAP-2 scenario: a traversal error during the undeclared-file scan

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/scan-traversal"
mkdir -p "$P/scan-traversal/notes"
printf 'extra\n' > "$P/scan-traversal/notes/extra.txt"
chmod 000 "$P/scan-traversal/notes"
pap-probe p7-scan-traversal "$P/scan-traversal"
chmod 755 "$P/scan-traversal/notes"
```

Observed: `exit=1`, `FAIL`, `integrity.package=FAIL`, `integrity.artifacts=PASS`,
`coverage.full=true`; diagnostics `["pap.package.io"]`; limitations `["pap.package.io"]`.

**Interpretation.** The reference currently implements **B**: a scan traversal error is reported
as `pap.package.io` with severity `error`, `integrity.package` becomes `FAIL`, `coverage.full`
stays `true` (the `FAIL` is a decided result), and the exit code is 1. This is the central
disagreement with the preliminary R-PAP-2 position, which recommends A. The probe does not decide
which option is right; it establishes that adopting A changes the reference and that the current
behaviour is not the proposed `INCOMPLETE`/`coverage.full:false` outcome.

The scenario is hard to pin in a static §12 fixture: a mode-000 directory is not unreadable to a
root process and may not survive archive round-trips; symlinked/dangling directories are skipped by
the reference walker rather than producing a traversal error. The probe uses a permission error,
which is the same class of failure but host-dependent. The proposal therefore recommends a
unit/hostile test for A rather than a committed `F` package.

### P7b — the package root itself is not listable, but the manifest is readable

This covers the root case the review asked to include explicitly. The root is mode `111` (execute
but not read): the verifier can open the known manifest path but cannot enumerate the root.

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/root-unlistable"
chmod 111 "$P/root-unlistable"
pap-probe p7b-root-unlistable "$P/root-unlistable"
chmod 755 "$P/root-unlistable"
```

Observed on the current reference: `exit=1`, `FAIL`, `integrity.package=FAIL`,
`integrity.artifacts=PASS`, `coverage.full=true`; diagnostics `["pap.package.io"]`; limitations the
same. Under the proposed A rule this is a scan-incomplete condition (root included), so it would be
`pap.package.undeclared-scan-incomplete`/`coverage.full:false`/`INCOMPLETE`, not a package `FAIL`.
The probe is host-dependent: a privileged process can list a mode-111 directory.

### P12 — aggregation: scan error plus an independent FAIL

This is the aggregation case requested in review. It combines the current R-PAP-2 scan failure with
an independently established `FAIL` (F02's artifact digest mismatch) and checks that the
independent failure is not downgraded to `INCOMPLETE`.

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F02-artifact-byte" "$P/aggregation"
mkdir -p "$P/aggregation/notes"
printf 'extra\n' > "$P/aggregation/notes/extra.txt"
chmod 000 "$P/aggregation/notes"
pap-probe p12-aggregation "$P/aggregation"
chmod 755 "$P/aggregation/notes"
```

Observed on the current reference: `exit=1`, `FAIL`, `integrity.package=FAIL`,
`integrity.artifacts=FAIL`, `coverage.full=true`; diagnostics include `pap.check.failed`,
`pap.integrity.artifact-mismatch` (twice), `pap.package.io`, and
`pap.claims.producer-mismatch`. The artifact mismatch is the independent `FAIL`; the scan error adds
a package `FAIL` under the current B behaviour.

Under the proposed A rule, the same package would report the scan as
`pap.package.undeclared-scan-incomplete` (warning), leave `integrity.package` unfailed by the scan,
and set `coverage.full=false`; the artifact mismatch would still make `integrity.artifacts=FAIL` and
`pap.check.digest-integrity/1=FAIL`, so §7.4 rule 1 still gives `FAIL`, not `INCOMPLETE`. That
A-specific report is a **specification prediction**, not an executed probe: no implementation of A
exists in this baseline, and the three independent implementations are not available. The
precedence argument is explicit in §7.4: rule 1 (`FAIL`) is evaluated before rule 4
(`INCOMPLETE`), and the scan-incomplete rule contributes only `coverage.full: false` and a
limitation.

### P12b — verdict-engine aggregation check (coverage false + independent FAIL)

This is a unit-level check of the existing §7.4 precedence function, not an implementation of A. It
constructs the minimal report shape that A would produce for the aggregation case — a required
`FAIL` check and `integrity.artifacts=FAIL`, with `coverage.full=false` — and asks the reference
verdict engine for the result.

```bash
cat > "$P/p12b.ts" <<EOF
import { computeVerdict } from "$REPO/pap/src/report.ts";
const report = {
  dimensions: {
    integrity: { package: "PASS", artifacts: "FAIL" },
    sources: { integrity: "PASS", availability: "PASS" },
    signature: { validity: "NOT_APPLICABLE" },
    trust: {
      signerIdentity: "NOT_APPLICABLE",
      policyDecision: "NOT_EVALUATED",
      checkerRecognition: "NOT_APPLICABLE",
      profileRecognition: "NOT_APPLICABLE",
    },
    humanReview: { status: "NOT_APPLICABLE" },
    checks: { results: [
      { checkId: "pap.check.digest-integrity/1", outcome: "FAIL", required: true },
    ] },
  },
  coverage: { full: false },
};
const verdict = computeVerdict(report as any, {
  requiredChecks: ["pap.check.digest-integrity/1"],
  requiredDimensions: ["integrity", "checks"],
  signatureMode: "disabled",
  humanReviewRequired: false,
  policyState: "FRESH",
  limitStopped: false,
  unsupportedVersion: false,
  unsupportedFeature: false,
  emptyRequiredSet: false,
});
console.log(verdict);
EOF
"$BUN" "$P/p12b.ts"
```

Observed: `FAIL`, exit 0. The `coverage.full=false` does not downgrade the independent `FAIL`;
rule 1 is evaluated first. This is the exact aggregation property the review asked for, tested
against the reference's verdict engine. It does not execute A's scan-incomplete diagnostic path,
because that path does not exist at the baseline.

### P12c — verdict-engine check (coverage false, no independent FAIL)

This is the complementary unit-level check: the same minimal report shape, but every required check
passes and `coverage.full=false` is the only negative condition. The verdict must be `INCOMPLETE`,
never `PASS`, so a suppressed scan error cannot be rendered as success.

```bash
cat > "$P/p12c.ts" <<EOF
import { computeVerdict } from "$REPO/pap/src/report.ts";
const report = {
  dimensions: {
    integrity: { package: "PASS", artifacts: "PASS" },
    sources: { integrity: "PASS", availability: "PASS" },
    signature: { validity: "NOT_APPLICABLE" },
    trust: {
      signerIdentity: "NOT_APPLICABLE",
      policyDecision: "NOT_EVALUATED",
      checkerRecognition: "NOT_APPLICABLE",
      profileRecognition: "NOT_APPLICABLE",
    },
    humanReview: { status: "NOT_APPLICABLE" },
    checks: { results: [
      { checkId: "pap.check.digest-integrity/1", outcome: "PASS", required: true },
    ] },
  },
  coverage: { full: false },
};
const verdict = computeVerdict(report as any, {
  requiredChecks: ["pap.check.digest-integrity/1"],
  requiredDimensions: ["integrity", "checks"],
  signatureMode: "disabled",
  humanReviewRequired: false,
  policyState: "FRESH",
  limitStopped: false,
  unsupportedVersion: false,
  unsupportedFeature: false,
  emptyRequiredSet: false,
});
console.log(verdict);
EOF
"$BUN" "$P/p12c.ts"
```

Observed: `INCOMPLETE`, exit 0. This is the existing verdict engine with the A-shaped coverage
condition; the new diagnostic itself is not executed because it does not exist at the baseline.

## 3. R-PAP-3 — directory / entry ceiling

### P8 — 8 300 undeclared directories

This probe is slower (creating and walking 8 300 directories); it is optional. It demonstrates the
reference's hidden entry cap.

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/many-dirs"
mkdir -p "$P/many-dirs/bulk"
( cd "$P/many-dirs/bulk" && for i in $(seq 1 8300); do mkdir -p "d$i"; done )
pap-probe p8-many-dirs "$P/many-dirs"
```

Observed: `exit=2`, `INCOMPLETE`, `integrity.package=PASS`, `integrity.artifacts=PASS`,
`coverage.full=false`; diagnostics `["pap.package.limit-exceeded",
"pap.package.limit-exceeded"]`; limitations the same. The two diagnostics come from the walk
budget (`pap/src/verify.ts:1348–1350`) and the payload-limit propagation
(`pap/src/verify.ts:329–330`).

The reference's cap is `max(1024, effective payloadFiles × 2)` (`pap/src/paths.ts:316`). With the
default `payloadFiles = 4096`, that is 8 192 entries; 8 300 directories exceed it. The
`pap/tests/hostile.test.ts:239–255` test reaches the same branch with `payloadFiles: 1` (cap 1 024)
and 1 100 entries.

**Interpretation.** The reference already has a de facto directory/entry ceiling and reports it
with `pap.package.limit-exceeded`/`INCOMPLETE`, but §4.3.4 has no such limit. R-PAP-3 A would make
this normative; B would leave it implementation-defined and non-conformant to the current
`pap.package.limit-exceeded` definition.

### P8b — a smaller ceiling via a lowered policy

The reference's cap can be reached with a small package by lowering `payloadFiles`:

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/small-budget"
mkdir -p "$P/small-budget/notes"
( cd "$P/small-budget/notes" && for i in $(seq 1 1100); do : > "e$i"; done )
python3 - "$REPO/pap/fixtures/pap-v0.1/trust-policy/unsigned-valid.json" "$P/policy-small.json" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
p["id"] = "policy-probe-small-budget"
p["limits"] = {"payloadFiles": 1}
json.dump(p, open(sys.argv[2], "w"), indent=2)
PY
"$BUN" "$REPO/pap/bin/pap" verify "$P/small-budget" --trust-policy "$P/policy-small.json" \
  --format json --now "$NOW" > "$P/p8b.json" 2> "$P/p8b.err"
echo "exit=$?"
python3 - "$P/p8b.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print(d["verdict"], d["coverage"]["full"],
      [x["code"] for x in d["diagnostics"]],
      d.get("effectiveLimits"))
PY
```

Observed: `exit=2`, `INCOMPLETE`, `coverage.full=false`, `pap.package.limit-exceeded` (and
`pap.limit.lowered`), `effectiveLimits.payloadFiles=1`.

This is the same branch as the existing hostile test; it is included because it is much cheaper
than P8 and can be used as the basis for a future `F62` with a new `scanEntries` policy field.

### P8c — traversal-depth budget

The reference walker also stops when `depth > limits.pathSegments` (16). That is a second private
scan bound, not a §4.3.4 declared-payload limit.

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/depth-budget"
mkdir -p "$P/depth-budget/notes"
d="$P/depth-budget/notes"
for i in $(seq 1 16); do d="$d/d$i"; mkdir -p "$d"; done
printf 'x\n' > "$d/leaf.txt"
pap-probe p8c-depth-budget "$P/depth-budget"
```

Observed: `exit=2`, `INCOMPLETE`, `integrity.package=PASS`, `integrity.artifacts=PASS`,
`coverage.full=false`, two `pap.package.limit-exceeded` diagnostics. The depth stop is a private
scan bound; under R-PAP-3 B it uses the R-PAP-2 `pap.package.undeclared-scan-incomplete` code, not
`pap.package.limit-exceeded`.

## 4. R-PAP-4 — cross-class / case-only collisions

### P9 — F24: case-only duplicate within `artifacts/`

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F24-case-duplicate" "$P/f24"
pap-probe p9-f24 "$P/f24"
```

Observed: `exit=1`, `FAIL`, `integrity.package=FAIL`, `integrity.artifacts=FAIL`,
`coverage.full=false`; diagnostics include `pap.package.path-duplicate`,
`pap.package.declared-file-missing` (for the colliding entries), and
`pap.check.not-evaluated`; limitations include `pap.check.not-evaluated`,
`pap.package.declared-file-missing`, `pap.package.path-duplicate`. The expected
`pap.package.path-duplicate` is present; extra codes are allowed by `cases.json` set semantics.

### P10 — same basename in two classes

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/cross-class-basename"
python3 - "$P/cross-class-basename" <<'PY'
import json, hashlib, pathlib, shutil, sys
root = pathlib.Path(sys.argv[1])
src = root / "sources" / "acme-policy.md"
dst = root / "artifacts" / "acme-policy.md"
shutil.copyfile(src, dst)
data = dst.read_bytes()
digest = "sha256:" + hashlib.sha256(b"pap.artifact.v1\x00" + data).hexdigest()
m = json.load(open(root / "assurance-package.json"))
m["artifacts"].append({
    "id": "artifact:acme-policy-copy",
    "path": "artifacts/acme-policy.md",
    "mediaType": "text/markdown; charset=utf-8",
    "bytes": len(data),
    "digest": digest,
})
json.dump(m, open(root / "assurance-package.json", "w"), indent=2)
PY
pap-probe p10-cross-class-basename "$P/cross-class-basename"
```

Observed: `exit=0`, `PASS`, `integrity.package=PASS`, `integrity.artifacts=PASS`,
`coverage.full=true`, no diagnostics. The two files have the same basename but different
package-relative paths (`artifacts/acme-policy.md` and `sources/acme-policy.md`), so they are not a
collision.

### P11 — a declaration whose path uses another class's root

```bash
cp -a "$REPO/pap/fixtures/pap-v0.1/F01-unchanged" "$P/wrong-root"
python3 - "$P/wrong-root" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
m = json.load(open(root / "assurance-package.json"))
m["artifacts"].append({
    "id": "artifact:wrong-root",
    "path": "sources/acme-policy.md",
    "mediaType": "text/markdown",
    "bytes": 1,
    "digest": "sha256:" + "0" * 64,
})
json.dump(m, open(root / "assurance-package.json", "w"), indent=2)
PY
pap-probe p11-wrong-root "$P/wrong-root"
```

Observed: `exit=1`, `FAIL`, `integrity.package=FAIL`, `integrity.artifacts=FAIL`; diagnostics
include `pap.package.path-invalid` and `pap.package.path-duplicate` (the same path is also declared
as a source), plus `pap.package.declared-file-missing` and `pap.check.not-evaluated`.

**Interpretation.** The wrong-root declaration is `path-invalid` because an artifact must start
with `artifacts/`; the duplicate rule is global, so the same path also produces `path-duplicate`.
A well-formed package cannot make the two paths equal. See R-PAP-4 in
[`decisions.md`](decisions.md).

## 5. Evidence only quoted from Issue #95 (not reproduced)

The following results are from the 2026-11-04 probe set recorded in Issue #95. They are inputs to
the preliminary position, not probes of this package. They were not re-run because the three
independent implementations and the external conformance contract are outside this repository.

| Probe | Reference | go | rust | python | External expectation |
|---|---|---|---|---|---|
| FS-01 — package root is a symlink to a valid package | `PASS/0` | `UNSUPPORTED/4` | `INCOMPLETE/2` | `UNSUPPORTED/4` | reject `FAIL/1` |
| FS-02 — declared artifacts reached through a symlinked parent | `FAIL/1`, `pap.package.symlink` | `UNSUPPORTED/4`, no `pap.package.symlink` | `FAIL/1`, `pap.package.symlink` | `FAIL/1`, `pap.package.symlink` | reject |
| FS-04-adjacent — declared artifacts directory unreadable | `FAIL/1`, `pap.package.io`/`declared-file-missing` | same `FAIL/1` | same `FAIL/1` | same `FAIL/1` | (different scenario: scan traversal) |
| LIM-03 — manifest exactly 1 MiB / 1 MiB+1 | boundary conforms (§4.3.4) | same | same | same | not ambiguous |
| FS-04 — traversal error during the undeclared-file scan | not recorded in the Issue #95 list | not recorded | not recorded | not recorded | `INCOMPLETE/2` |

What is missing and matters:

- **FS-01:** the external expectation (`FAIL/1`) is met by no baseline, but the three
  implementations are not `PASS/0` either. B does not make them conformant; it gives them a target.
  The owner-side `EXT-FS-01` probe currently records the external `FAIL/1` expectation with
  `SPEC_AMBIGUITY`; the correction to `PASS/0` is conditional on the owner accepting B, and the
  external owner should reissue the draft rather than the lab demoting the probe.
- **FS-04:** the Issue #95 list records “FS-04-adjacent” (unreadable declared directory), which is
  a different scenario from the external FS-04 (scan traversal). The reference's scan behaviour is
  reproduced here (P7); the three implementations' scan behaviour is unknown. FS-04 must be re-run
  on go/rust/python before it is used as conformance evidence; it is on the owner-side tail list.
- **Directory-count:** there is no recorded probe row for the external directory-count test;
  P8/P8b/P8c establish the reference's hidden entry and depth caps only.
- **LIM-03:** this is validated, not one of the four R-PAP decisions; this package does not
  re-litigate it.

## 6. Probe result summary

| Probe | Exit | Verdict | `integrity.package` | `integrity.artifacts` | `coverage.full` | Key code(s) |
|---|---|---|---|---|---|---|
| P1 control | 0 | PASS | PASS | PASS | true | — |
| P2 root symlink | 0 | PASS | PASS | PASS | true | — |
| P3a link to file | 64 | — | — | — | — | `pap.cli.usage` (stderr) |
| P3b dangling link | 74 | — | — | — | — | `pap.package.not-found` (stderr) |
| P4 payload symlink under root symlink | 1 | FAIL | FAIL | FAIL | false | `pap.package.symlink` |
| P5 symlinked parent | 1 | FAIL | FAIL | FAIL | false | `pap.package.symlink` |
| P6 declared dir unreadable | 1 | FAIL | FAIL | FAIL | false | `pap.package.io`, `pap.package.declared-file-missing` |
| P7 scan traversal error | 1 | FAIL | FAIL | PASS | true | `pap.package.io` |
| P7b root unlistable, manifest readable | 1 | FAIL | FAIL | PASS | true | `pap.package.io` |
| P8 8 300 dirs | 2 | INCOMPLETE | PASS | PASS | false | `pap.package.limit-exceeded` ×2 |
| P8b lowered `payloadFiles` | 2 | INCOMPLETE | PASS | PASS | false | `pap.package.limit-exceeded`, `pap.limit.lowered` |
| P8c 16-deep undeclared tree | 2 | INCOMPLETE | PASS | PASS | false | `pap.package.limit-exceeded` ×2 |
| P9 F24 | 1 | FAIL | FAIL | FAIL | false | `pap.package.path-duplicate` |
| P10 same basename, two classes | 0 | PASS | PASS | PASS | true | — |
| P11 wrong-root declaration | 1 | FAIL | FAIL | FAIL | false | `pap.package.path-invalid`, `pap.package.path-duplicate` |
| P12 aggregation (artifact mismatch + scan error) | 1 | FAIL | FAIL | FAIL | true (current B) | `pap.check.failed`, `pap.integrity.artifact-mismatch`, `pap.package.io` |
| P12b verdict engine (`coverage.full=false` + required FAIL) | 0 | FAIL (returned) | — | — | false | `FAIL` from rule 1, not `INCOMPLETE` |
| P12c verdict engine (`coverage.full=false`, all checks PASS) | 0 | INCOMPLETE (returned) | — | — | false | `INCOMPLETE`, never `PASS` |

## 7. What the probes prove and what they do not

**Prove (reference only, at the baseline):**

- root symlink resolution, with the 64/74 mapping and the payload-symlink rejection;
- symlinked-parent rejection;
- declared unreadable-directory failure;
- the R-PAP-2 scan error currently maps to `pap.package.io`/`FAIL`/`coverage.full:true`, including
  the root-unlistable case (P7/P7b);
- the reference has an 8 192-entry scan cap and a 16-level depth cap, both reported as
  `pap.package.limit-exceeded`/`INCOMPLETE`;
- F24's within-class case-only duplicate;
- same-basename cross-class coexistence and wrong-root rejection;
- the aggregation case: an independent artifact mismatch still yields `FAIL/1`, not `INCOMPLETE`;
- the existing verdict engine returns `FAIL` for a report with `coverage.full=false` and a required
  `FAIL` (P12b), so the scan-incomplete coverage condition cannot downgrade an independent `FAIL`;
- the same engine returns `INCOMPLETE` for `coverage.full=false` with all checks passing (P12c),
  so a suppressed scan error cannot be rendered as `PASS`.

**Do not prove:**

- the behaviour of the go/rust/python implementations, which are quoted from Issue #95;
- the external contract's exact fixture or expected JSON, which is outside the repository;
- a portable §12 fixture for R-PAP-2 (the mode-000 probe is host-dependent);
- that the reference's current behaviour is correct; the probes are evidence for the decision,
  not a decision;
- the A-specific scan-incomplete report or the A-specific aggregation report, which no
  implementation in this baseline produces; those are specification predictions.

## 8. Verification commands and checks not run

### Commands actually run (local)

From the repository root with Bun 1.4.4:

| Command | Result |
|---|---|
| `bun install --frozen-lockfile` | ok (14 packages) |
| `bun run typecheck` | ok (`tsc --noEmit`, exit 0) |
| `bun test` | 311 pass, 0 fail (22 files) |
| `bun run check` | ok (exit 0; generated artifact check passed) |
| `bun test pap/tests` | 123 pass, 0 fail (9 files) |
| `git diff --check` | ok (no whitespace errors) |

The probe commands are the `pap-probe` invocations in §0–§4. P8 (8 300 directories) is the slow
probe; all others are quick. The root-unlistable probe P7b and aggregation probes P12/P12b/P12c
are in §2, and the depth-budget probe P8c is in §3. The reference probes were run on Linux with uid 1003, so a mode-000 directory
is unreadable to the process; a root/privileged run
would not reproduce P6/P7/P12's traversal error.

### Checks not run

- **The three independent Phase 2a implementations (go, rust, python).** They are not in this
  repository and were not available here; their results are quoted from Issue #95. No probe of
  their scan-failure or aggregation behaviour exists. FS-04 must be re-run on them before it is
  used as conformance evidence (owner-side tail list).
- **The external conformance contract v0.1.0-draft.** It is outside this repository; its FS-01,
  FS-04 and directory-count fixtures/expectations were not executed.
- **The A-specific R-PAP-2 and R-PAP-3 reports.** No implementation of A exists in this baseline;
  the A-specific `pap.package.undeclared-scan-incomplete` report, the `coverage.full:false`
  aggregation report and the `scanEntries` limit report are specification predictions, not
  executed tests.
- **`bun run build` and `bun run build:release`.** Not run: this change is docs-only, `bun run
  check` covers the generated artifact, and `build:release` is expected to exit 1 by design
  (REVIEW_REQUIRED diagnostics), so a green run is not a meaningful check here.
- **Platform-specific traversal failures.** P6/P7/P12 use a permission error on Linux; Windows,
  macOS archive round-trips and privileged CI runs may behave differently. This is recorded as a
  testability limitation in R-PAP-2.
- **GitHub CI.** The repository `check` job is run by the PR workflow; its result is reported in
  the PR checks, not re-implemented in this document. The local commands above are the same
  sequence the job runs.
