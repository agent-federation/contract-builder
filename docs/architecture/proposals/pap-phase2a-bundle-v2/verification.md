# Verification — how each decision is proved implemented

This document gives executable checks for the three decisions. The checks use only public inputs:
the RFC, `AGENT_BRIEF.md`, the fixture corpus, the published schemas, Appendix E vectors, the public
reference verifier under `pap/`, and standard Python/shell tools. No private implementation source
or audit tooling is required.

Run from the `contract-builder` checkout unless a step says otherwise. Set:

```bash
export REPO="$(git rev-parse --show-toplevel)"
export BUNDLE="${BUNDLE:-../contract-builder-independent}"   # the handoff bundle checkout
export BUN="${BUN:-$HOME/.bun/bin/bun}"                      # Bun 1.4.x
export PATH="$(dirname "$BUN"):$PATH"                        # package scripts call `bun`
```

The proposal baseline is the PR base `5291f1b`, bundle `c568051`, snapshot source `c6ee644`.
The PR head is whatever commit the PR currently shows; the commands below identify the base and
the snapshot explicitly and do not require a fixed PR head SHA.

---

## 0. Baseline and checkout identity

This proposal is based on an explicitly identified base and snapshot, not on a moving `main`:

| Item | Commit |
|---|---|
| PR base (`main` when this revision was prepared) | `5291f1b6e5ebe36781f1dccf647c869ef6dc86a6` |
| Handoff bundle | `c568051f6a4b8feaf8c0b5fabfd5e3e735e2af98` |
| Bundle snapshot source | `c6ee64416c91ab56f9d8270114c8f8a8b9d2f608` |

Run from a checkout of the PR head. The commands below pin the base and the snapshot and do not
require `HEAD` to equal either; a PR head that contains the base is sufficient.

```bash
cd "$REPO"
BASE=5291f1b6e5ebe36781f1dccf647c869ef6dc86a6
SNAPSHOT=c6ee64416c91ab56f9d8270114c8f8a8b9d2f608
git rev-parse HEAD
git cat-file -e "${BASE}^{commit}"
git cat-file -e "${SNAPSHOT}^{commit}"
git merge-base --is-ancestor "$BASE" HEAD
git diff --stat "${SNAPSHOT}"..HEAD -- \
  docs/architecture/portable-assurance-package-rfc.md \
  pap/fixtures/pap-v0.1/cases.json
sha256sum pap/fixtures/pap-v0.1/cases.json
sha256sum docs/architecture/portable-assurance-package-rfc.md
```

Expected:

- `HEAD` prints the PR head; it is not required to equal `BASE`;
- both commits exist and `git merge-base --is-ancestor` exits 0;
- the `git diff --stat` is empty (the RFC and corpus did not change between the snapshot source
  and this PR);
- `cases.json` is
  `8ae2693b34a31f1a49fdee0e5e5e235419e8d510d2a9b6f84e809b0c1ef154df`;
- the RFC is
  `a171fdcfc7da76af302eea3a270c5b63506b07ce74c3ebd784401e48e7e543c1`.

The bundle's `snapshot/manifest.json` must still name the same source commit:

```bash
cd "$BUNDLE"
git rev-parse HEAD
python3 -c 'import json; m=json.load(open("snapshot/manifest.json", encoding="utf-8")); print(m["source"])'
python3 -c 'import json; m=json.load(open("snapshot/manifest.json", encoding="utf-8")); print(len(m["files"]), "files")'
```

Expected before the two bundle changes: bundle HEAD `c568051…`; source commit `c6ee644…`; 433
files.

---

## 1. D-P2A-1 — checker identity

### 1.1 Appendix E.3 vector (normative, implementation-independent)

This reproduces the RFC's checker-identity vector with the §5.2 framing and JCS rules. It is the
control that the recipe is implemented correctly; it does not use any verifier.

```bash
cd "$REPO"
python3 - <<'PY'
import hashlib, json, struct

def H(domain, data):
    return hashlib.sha256(domain.encode("ascii") + b"\x00" + data).hexdigest()

def rec(tag, parts):
    out = struct.pack(">I", len(tag.encode("utf-8"))) + tag.encode("utf-8")
    out += struct.pack(">I", len(parts))
    for part in parts:
        if isinstance(part, str):
            part = part.encode("utf-8")
        out += struct.pack(">I", len(part)) + part
    return out

# RFC Appendix E.3 inputs.
files = [
    ("src/checks/digest.ts", b'export const checkId = "pap.check.digest-integrity/1";\n'),
    ("src/checks/source.ts", b"export const spanCheck = true;\n"),
]
deps = [("zod", "3.23.8", "sha512-9K5fXZ0G8p3oUo4WQ9m2l1v0B9m3r7Yqk1s2V4pL6c0=")]

payload = rec("extension", ["checker", "pap.verifier.reference", "0.1.0"])
for path, data in sorted(files):
    payload += rec("file", [path, data])
for name, version, integrity in sorted(deps):
    payload += rec("dependency", [name, version, integrity])
implementation_digest = "sha256:" + H("pap.extension.closure.v1", payload)

canonical = json.dumps(
    {
        "id": "pap.verifier.reference",
        "version": "0.1.0",
        "implementationDigest": implementation_digest,
    },
    sort_keys=True,
    separators=(",", ":"),
    ensure_ascii=False,
).encode("utf-8")
checker_identity = "sha256:" + H("pap.checker.identity.v1", canonical)

assert implementation_digest == "sha256:73f738b733b177c04597b0e6ab9c4d267059ea1556e6f943d543c252c5ef15c0", implementation_digest
assert checker_identity == "sha256:15a0b0149dc95f7b9711e7b28fc4189ed8539b03ffd2c96e967205316d75963f", checker_identity
print("OK: Appendix E.3 implementationDigest and checkerIdentity")
PY
```

Expected: `OK: Appendix E.3 implementationDigest and checkerIdentity`.

### 1.2 Appendix E.1 control (identity primitive)

The same JCS/H construction must reproduce the base `packageIdentity`. This is the control that the
canonicalizer and domain framing are correct for the fixture corpus.

```bash
cd "$REPO"
python3 - <<'PY'
import hashlib, json
from pathlib import Path
manifest = json.loads(Path("pap/fixtures/pap-v0.1/base/assurance-package.json").read_text(encoding="utf-8"))
canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
digest = "sha256:" + hashlib.sha256(b"pap.package.v1\x00" + canonical).hexdigest()
assert digest == "sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020", digest
print("OK: Appendix E.1 base packageIdentity")
PY
```

Expected: `OK: Appendix E.1 base packageIdentity`.

### 1.3 Report fields and equality

After the brief change is implemented, every `verify` JSON report from an **independent** Phase 2a
implementation must carry the same identity in the verifier object and the identities block. (The
public reference legitimately uses `pap.verifier.reference`; the `id != "pap.verifier.reference"`
assertion below is for the independent implementation under test.)

```bash
cd "$REPO"
# Run any Phase 2a case that produces a report; F01 is a convenient PASS case.
"$BUN" pap/bin/pap verify pap/fixtures/pap-v0.1/F01-unchanged \
  --trust-policy pap/fixtures/pap-v0.1/trust-policy/unsigned-valid.json \
  --format json --now 2026-11-02T00:00:00Z > /tmp/report.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/report.json", encoding="utf-8"))
v = r["verifier"]
assert v["id"].startswith("pap.verifier."), v["id"]
assert v["id"] != "pap.verifier.reference", "independent verifier must not use the reference id"
assert isinstance(v["version"], str) and v["version"]
assert v["implementationDigest"].startswith("sha256:") and len(v["implementationDigest"]) == 71
assert len(v["checkerIdentities"]) == 1, v["checkerIdentities"]
assert v["checkerIdentities"][0] == r["identities"]["checkerIdentity"], (v["checkerIdentities"], r["identities"]["checkerIdentity"])
assert r["identities"]["checkerIdentity"].startswith("sha256:") and len(r["identities"]["checkerIdentity"]) == 71
print("OK: verifier fields and checker identity agree")
PY
```

Note: a Phase 2a verifier may not implement `--trust-policy` fully; the check uses the minimal
policy interface the brief permits for testing (`AGENT_BRIEF.md` §4.7). If the implementation
rejects the option, use its documented minimal invocation and check the same report fields.

### 1.4 Reproducible closure self-check (E.3 vector)

This runs the self-check on the normative E.3 inputs, so it is reproducible without an
implementation. It changes exactly one byte in an included file and confirms both the
`implementationDigest` and the derived `checkerIdentity` change; it then adds a file outside the
declared closure and confirms neither changes.

```bash
cd "$REPO"
python3 - <<'PY'
import hashlib, json, struct

def H(domain, data):
    return hashlib.sha256(domain.encode("ascii") + b"\x00" + data).hexdigest()

def rec(tag, parts):
    out = struct.pack(">I", len(tag.encode("utf-8"))) + tag.encode("utf-8")
    out += struct.pack(">I", len(parts))
    for part in parts:
        if isinstance(part, str):
            part = part.encode("utf-8")
        out += struct.pack(">I", len(part)) + part
    return out

def compute(files, dependencies):
    payload = rec("extension", ["checker", "pap.verifier.reference", "0.1.0"])
    for path, data in sorted(files):
        payload += rec("file", [path, data])
    for name, version, integrity in sorted(dependencies):
        payload += rec("dependency", [name, version, integrity])
    implementation_digest = "sha256:" + H("pap.extension.closure.v1", payload)
    canonical = json.dumps(
        {"id": "pap.verifier.reference", "version": "0.1.0",
         "implementationDigest": implementation_digest},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False,
    ).encode("utf-8")
    checker_identity = "sha256:" + H("pap.checker.identity.v1", canonical)
    return implementation_digest, checker_identity

files = [
    ("src/checks/digest.ts", b'export const checkId = "pap.check.digest-integrity/1";\n'),
    ("src/checks/source.ts", b"export const spanCheck = true;\n"),
]
deps = [("zod", "3.23.8", "sha512-9K5fXZ0G8p3oUo4WQ9m2l1v0B9m3r7Yqk1s2V4pL6c0=")]

baseline = compute(files, deps)
assert baseline == (
    "sha256:73f738b733b177c04597b0e6ab9c4d267059ea1556e6f943d543c252c5ef15c0",
    "sha256:15a0b0149dc95f7b9711e7b28fc4189ed8539b03ffd2c96e967205316d75963f",
), baseline

# (a) Change exactly one byte in one included file: /1 -> /2.
mutated_files = [
    (path, data.replace(b"/1", b"/2") if path == "src/checks/digest.ts" else data)
    for path, data in files
]
mutated = compute(mutated_files, deps)
assert mutated[0] != baseline[0], "included-byte change must change implementationDigest"
assert mutated[1] != baseline[1], "included-byte change must change checkerIdentity"

# (b) Add a file that is present in the directory but outside the declared closure.
directory_files = files + [("tests/helper.ts", b"export const helper = true;\n")]
declared_files = [(path, data) for path, data in directory_files if not path.startswith("tests/")]
assert compute(declared_files, deps) == baseline, "non-included file must not change the identity"

print("baseline implementationDigest:", baseline[0])
print("baseline checkerIdentity:     ", baseline[1])
print("mutated implementationDigest: ", mutated[0])
print("mutated checkerIdentity:      ", mutated[1])
print("OK: included byte changes both digests; a non-included file changes neither")
PY
```

Expected: the four digests, then
`OK: included byte changes both digests; a non-included file changes neither`. The mutated values
are `sha256:960b89…` (implementation) and `sha256:401ff6…` (checker identity) for this exact
mutation; only the inequality assertions are normative.

### 1.5 Two-way self-check (implementation record)

The implementation must record both directions. The reviewer re-runs the recorded commands and
checks the before/after values; the check is not reproducible from the report alone.

```bash
cd <implementation checkout>
# Record the closure identity and closure list (implementation-specific command).
# (a) Positive direction: append a comment to an included source file, rebuild, recompute.
#     The implementationDigest MUST change; the closure list MUST show the same file with a new hash.
# (b) Negative direction: modify a test/fixture/document outside the closure, rebuild, recompute.
#     The implementationDigest MUST NOT change; the closure list MUST NOT change.
python3 - <<'PY'
import json, sys
rec = json.load(open("path/to/experiment-record.json", encoding="utf-8"))
impl = rec["implementation"]
sc = impl["selfCheck"]
assert impl["implementationDigest"].startswith("sha256:") and len(impl["implementationDigest"]) == 71
assert impl["checkerIdentity"].startswith("sha256:") and len(impl["checkerIdentity"]) == 71
assert sc["includedFile"]["changed"] is True
assert sc["includedFile"]["beforeDigest"] != sc["includedFile"]["afterDigest"]
assert sc["excludedFile"]["changed"] is False
assert sc["excludedFile"]["beforeDigest"] == sc["excludedFile"]["afterDigest"]
assert impl["closure"]["files"], "closure list must be non-empty"
assert impl["closure"]["listSha256"] == __import__("hashlib").sha256(
    "\n".join(f'{f["path"]}\t{f["sha256"]}' for f in impl["closure"]["files"]).encode()
).hexdigest(), "listSha256 must bind the closure list"
print("OK: identity record and both self-check directions")
PY
```

The exact fields are listed in [`decisions.md`](decisions.md) §D-P2A-1. The record is stored
outside the blind workspace, as the existing experiment records are.

### 1.6 Negative control — no package-derived copy

The rust failure copied `implementationDigest` from a value inside the package's
`claims/producer-report.json`. A conforming run must not have its digest hex appear as a
`sha256:` literal in any package file, and must not use the reference verifier id:

```bash
cd <implementation checkout>
python3 - <<'PY'
import json, re
from pathlib import Path
rec = json.load(open("path/to/experiment-record.json", encoding="utf-8"))
digest = rec["implementation"]["implementationDigest"]
hexdigest = digest.removeprefix("sha256:")
assert rec["implementation"]["id"] != "pap.verifier.reference", "independent verifier must not use the reference id"
pkg = Path("<path-to-fixture-used>")
for p in pkg.rglob("*"):
    if not p.is_file():
        continue
    text = p.read_bytes().decode("utf-8", errors="ignore")
    if hexdigest in text:
        raise SystemExit(f"implementationDigest appears as a literal in package data: {p}")
print("OK: implementationDigest is not copied from package data; id is not the reference id")
PY
```

This is a heuristic, not proof of non-fabrication; the closure list, the self-check and the record
are the evidence.

---

## 2. D-P2A-2 — case set

The following checks cover the proposal artifact in this repository and the final bundle update
after implementation. §2.1 checks the proposal classification; §2.2–§2.3 check the bundle
provenance and snapshot. The final bundle file is expected at
`$BUNDLE/pap/fixtures/pap-v0.1/cases-phase2a.json`; `cases.json` is unchanged.

### 2.1 Case-set schema, counts and identity expectations

This check runs [`verify_cases.py`](verify_cases.py) against the repository corpus and the
proposed artifact [`cases-phase2a.proposed.json`](cases-phase2a.proposed.json). It is the machine
check for the exact case list in [`decisions.md`](decisions.md): ids, counts, membership, the
F46/F59 exclusion, F58's pending status, applicable codes and `packageIdentity` expectations. It
was run while preparing this revision; the output is recorded in §5.

```bash
cd "$REPO"
python3 docs/architecture/proposals/pap-phase2a-bundle-v2/verify_cases.py \
  --repo . \
  --case-set docs/architecture/proposals/pap-phase2a-bundle-v2/cases-phase2a.proposed.json
```

Expected:

```text
OK: 61 cases; 19 full / 36 identityOnly / 6 excluded
OK: case ids, profile membership, applicable codes and packageIdentity expectations
OK: F46/F59 are identity-only; F58 is pending D-P2A-2 (default 19/36/6, alternate 20/35/6)
```

The verifier reads only `cases.json`, the fixtures and the proposed case set; it does not read any
verifier report. `cases-phase2a.proposed.json` is a proposal artifact, not the bundle file. The
final bundle file uses the shape in [`decisions.md`](decisions.md) and the `caseSetOrigin` /
`caseSetCommit` provenance fields.

### 2.2 Source-first provenance

If the case set is added source-first (recommended), the source commit named by the bundle must
contain the file, and the bundle must copy it byte-for-byte:

```bash
cd "$REPO"
# After implementation, let SRC be the new source commit and BUNDLE_COMMIT the new bundle commit.
SRC=<new-source-commit>
BUNDLE_COMMIT=<new-bundle-commit>
git cat-file -e "${SRC}:pap/fixtures/pap-v0.1/cases-phase2a.json"
git -C "$BUNDLE" cat-file -e "${BUNDLE_COMMIT}:pap/fixtures/pap-v0.1/cases-phase2a.json"
test "$(git show "${SRC}:pap/fixtures/pap-v0.1/cases-phase2a.json" | sha256sum | cut -d' ' -f1)" = \
     "$(git -C "$BUNDLE" show "${BUNDLE_COMMIT}:pap/fixtures/pap-v0.1/cases-phase2a.json" | sha256sum | cut -d' ' -f1)"
python3 - "$BUNDLE" "$SRC" "$BUNDLE_COMMIT" <<'PY'
import json, sys
from pathlib import Path
bundle, src, bundle_commit = sys.argv[1], sys.argv[2], sys.argv[3]
manifest = json.loads((Path(bundle) / "snapshot/manifest.json").read_text(encoding="utf-8"))
case_set = json.loads((Path(bundle) / "pap/fixtures/pap-v0.1/cases-phase2a.json").read_text(encoding="utf-8"))
assert manifest["source"]["commit"] == src, manifest["source"]
assert case_set["basis"]["caseSetOrigin"] == "source", case_set["basis"]
assert case_set["basis"]["caseSetCommit"] == src, case_set["basis"]
print("OK: source-first case set and manifest provenance agree")
PY
```

If the bundle-local alternative is chosen instead, the manifest must contain a `bundle_local`
entry with `origin: "bundle-local"` and the case-set path; the provenance document must say the
snapshot has one bundle-local experiment file. The check is:

```bash
python3 - "$BUNDLE" <<'PY'
import json, sys
from pathlib import Path
bundle = Path(sys.argv[1])
m = json.loads((bundle / "snapshot/manifest.json").read_text(encoding="utf-8"))
entry = [e for e in m.get("bundle_local", []) if e["path"].endswith("cases-phase2a.json")]
assert entry and entry[0]["origin"] == "bundle-local", entry
case_set = json.loads((bundle / "pap/fixtures/pap-v0.1/cases-phase2a.json").read_text(encoding="utf-8"))
assert case_set["basis"]["caseSetOrigin"] == "bundle-local", case_set["basis"]
assert m["source"]["commit"] == case_set["basis"]["sourceCommit"], (m["source"], case_set["basis"])
print("OK: bundle-local origin recorded and sourceCommit unchanged")
PY
```

### 2.3 Snapshot verification

```bash
cd "$BUNDLE"
if [ -f tools/verify_snapshot.py ]; then
  python3 tools/verify_snapshot.py --root .
else
  echo "owner-side snapshot verifier not present; use the manifest/SHA-256 checks in §3.2"
fi
```

After D-P2A-2 alone, expect `OK: verified 434 snapshot files`; after both D-P2A-2 and D-P2A-3,
expect 435. The manifest checksum and the checksum inventory must also pass. The verifier rejects
symlinks in manifest paths and reserved paths; the case set is a regular file and is not reserved.
If the owner-side tool is unavailable, the §3.2 script's own counts and `sha256sum` checks are the
publicly reproducible substitute.

### 2.4 Case-set comparison (when implementations are available)

The comparison must produce zero mismatches on the full and identity-only cases. The exact
invocation is owner-side, but the acceptance rule is public:

```text
For every full case:
  exitCode == cases.json expect.exitCode
  verdict == cases.json expect.verdict
  each applicableDiagnosticCode is present in the report's diagnostics (subset)
  integrity.package and integrity.artifacts match the cases.json values where listed
  packageIdentity matches the case set (digest, equals-base, or null)

For every identityOnly case:
  packageIdentity matches the case set
```

The comparison must not read the reference implementation's report as the expected identity; the
expected values are the literals pinned in `cases-phase2a.proposed.json` and re-checked by
`verify_cases.py` (§2.1). A mismatch is a finding; a mismatch
on F46/F59 when they are compared as full cases is expected, which is why the proposal moves them
to identity-only.

---

## 3. D-P2A-3 — F25 fixture

### 3.1 Presence, bytes and content

```bash
cd "$BUNDLE"
test -f pap/fixtures/pap-v0.1/archive.tar
test ! -d pap/fixtures/pap-v0.1/archive.tar
wc -c pap/fixtures/pap-v0.1/archive.tar
sha256sum pap/fixtures/pap-v0.1/archive.tar
cat pap/fixtures/pap-v0.1/archive.tar
```

Expected: 38 bytes; SHA-256 `81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7`;
content `not a tar that a verifier may extract.` followed by one LF. The file is a regular file,
not a tar and not a directory.

The F25 case metadata and the source provenance must agree with that path:

```bash
cd "$REPO"
python3 - <<'PY'
import json
cases = json.load(open("pap/fixtures/pap-v0.1/cases.json", encoding="utf-8"))
case = next(c for c in cases["cases"] if c["caseId"] == "F25-archive")
assert case["command"] == ["verify", "../archive.tar"], case["command"]
assert case.get("noReport") is True, case
assert case["stderrCodes"] == ["pap.cli.usage"], case["stderrCodes"]
print("OK: F25 case metadata names ../archive.tar, no report, pap.cli.usage")
PY
SNAPSHOT=c6ee64416c91ab56f9d8270114c8f8a8b9d2f608
git cat-file -e "${SNAPSHOT}:pap/fixtures/pap-v0.1/archive.tar"
test "$(git show "${SNAPSHOT}:pap/fixtures/pap-v0.1/archive.tar" | sha256sum | cut -d' ' -f1)" = \
     "81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7"
python3 - "$BUNDLE" <<'PY'
import json, sys
m = json.load(open(sys.argv[1] + "/snapshot/manifest.json", encoding="utf-8"))
assert m["source"]["commit"] == "c6ee64416c91ab56f9d8270114c8f8a8b9d2f608", m["source"]
print("OK: bundle provenance source commit matches the archive.tar source")
PY
```

The case metadata lives in `pap/fixtures/pap-v0.1/cases.json` (unchanged); the fixture is the
source blob at `c6ee644`; the bundle's provenance names that source commit.

### 3.2 Manifest and checksum update

The following reproduces the update in a scratch copy. It is the same procedure to apply to the
bundle; it does not edit the source repository. Run it on a bundle that does not yet contain the
file; the `assert entry not in manifest["files"]` below fails on a second run, which is intended.
The owner-side `tools/verify_snapshot.py` is an additional check; the script's own
manifest/SHA-256 update and verification does not require it.

```bash
set -e
SRC="$REPO"           # contract-builder checkout at c6ee644 or current main
BUNDLE="${BUNDLE:?set BUNDLE to the bundle checkout}"
cp "$SRC/pap/fixtures/pap-v0.1/archive.tar" "$BUNDLE/pap/fixtures/pap-v0.1/archive.tar"
cd "$BUNDLE"
python3 - <<'PY'
import hashlib, json
from pathlib import Path

root = Path.cwd()
manifest_path = root / "snapshot/manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
data = (root / "pap/fixtures/pap-v0.1/archive.tar").read_bytes()
entry = {
    "path": "pap/fixtures/pap-v0.1/archive.tar",
    "size": len(data),
    "sha256": hashlib.sha256(data).hexdigest(),
}
assert entry["sha256"] == "81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7"
assert entry not in manifest["files"]
manifest["files"].append(entry)
manifest["files"].sort(key=lambda item: item["path"])
new_manifest = json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
manifest_path.write_text(new_manifest, encoding="utf-8")

sums_path = root / "snapshot/SHA256SUMS"
entries = {}
for line in sums_path.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    digest, path = line.split("  ", 1)
    entries[path] = digest
entries[entry["path"]] = entry["sha256"]
entries["snapshot/manifest.json"] = hashlib.sha256(new_manifest.encode("utf-8")).hexdigest()
sums_path.write_text(
    "\n".join(f"{entries[path]}  {path}" for path in sorted(entries)) + "\n",
    encoding="utf-8",
)
print(len(manifest["files"]), "files;", len(entries), "checksum lines")
PY
if [ -f tools/verify_snapshot.py ]; then
  python3 tools/verify_snapshot.py --root .
fi
```

Expected after D-P2A-3 alone: `434 files; 435 checksum lines`; if the owner-side verifier is
present, also `OK: verified 434 snapshot files`, `OK: manifest checksum verified`,
`OK: checksum inventory matches manifest`. Without the verifier, re-run the script's checks or
compare the manifest and sums by hand; the script is the reproducible part.

The manifest's `source.commit` remains `c6ee644…`: the added file is present at that source
commit, so the snapshot is still an exact copy. The source `archive.tar` must not be edited; if
the source is already at a newer commit, verify that the file is byte-identical to the `c6ee644`
blob first.

The resulting manifest and checksum inventory must name the restored file exactly once:

```bash
cd "$BUNDLE"
python3 - <<'PY'
import json
m = json.load(open("snapshot/manifest.json", encoding="utf-8"))
entries = [f for f in m["files"] if f["path"] == "pap/fixtures/pap-v0.1/archive.tar"]
assert len(entries) == 1, entries
assert entries[0]["size"] == 38, entries[0]
assert entries[0]["sha256"] == "81f5d80365e91b9fa4ae4be8202fa440181de22cf6e88d421a20a5b3d1d9f2a7", entries[0]
print("OK: manifest entry for the restored archive.tar")
PY
grep -c 'pap/fixtures/pap-v0.1/archive.tar' snapshot/SHA256SUMS
```

Expected: `OK: manifest entry for the restored archive.tar` and `1` checksum line for the file.

### 3.3 F25 probe

Run this after §3.2 has restored the file in the same `$BUNDLE`. It exercises the case in the
bundle, not only in the source checkout:

```bash
cd "$BUNDLE/pap/fixtures/pap-v0.1/F25-archive"
"$BUN" "$REPO/pap/bin/pap" verify ../archive.tar --format json > /tmp/f25.out 2> /tmp/f25.err
code=$?
test "$code" -eq 64
test ! -s /tmp/f25.out
grep -q '^pap: pap.cli.usage:' /tmp/f25.err
printf 'OK: F25 exit=%s, no report, pap.cli.usage\n' "$code"
cat /tmp/f25.err
```

Expected: exit 64; empty stdout; stderr `pap: pap.cli.usage: package path is not a directory:
../archive.tar`. This was executed against the restored scratch bundle while preparing this
revision; the verifier is the public reference implementation under `pap/`, not private code. The
same run against the bundle before the fix returns exit 74 (`pap.package.not-found`) because the
file is absent — that is the defect being fixed.

### 3.4 Combined bundle check

After both D-P2A-2 and D-P2A-3:

```bash
cd "$BUNDLE"
if [ -f tools/verify_snapshot.py ]; then
  python3 tools/verify_snapshot.py --root .
fi
wc -l snapshot/SHA256SUMS
```

Expected: `OK: verified 435 snapshot files` and `436 snapshot/SHA256SUMS` lines (435 files + the
manifest). The case-set file and `archive.tar` must both appear in the manifest and in the sums.
The manifest hash changes after the second addition; recompute it once, after both files are in
place.

---

## 4. Proposal-only scope check

This PR is documentation only. The following checks prove that it changed no normative input:

```bash
cd "$REPO"
git status --short
git diff --check
"$BUN" run check
```

Expected: `git status` shows only
`docs/architecture/proposals/pap-phase2a-bundle-v2/README.md`,
`.../decisions.md` and `.../verification.md`; `git diff --check` is silent; `bun run check` passes
(the docs do not affect the generated CORE-001 artifact). `git diff --stat` must not list
`docs/architecture/portable-assurance-package-rfc.md`, `pap/`, `spec/`, `profiles/`, `AGENT_BRIEF.md`,
`snapshot/` or any fixture.

When the implementation is later authorized, the same check must show only the files named in the
decision being implemented; the proposal package itself must not be changed to make a check pass.

---

## 5. What was actually executed while preparing this proposal

| Check | Result |
|---|---|
| Baseline identity (§0) | `5291f1b` and `c6ee644` exist; `git diff c6ee644..HEAD` over the RFC and `cases.json` is empty; `cases.json` and RFC hashes match |
| Appendix E.3 vector (§1.1) | Passed: `implementationDigest = sha256:73f738…`, `checkerIdentity = sha256:15a0b0…` |
| Appendix E.1 base identity (§1.2) | Passed: `sha256:77a8d1d0…` |
| Reproducible closure self-check (§1.4) | Passed: baseline E.3 digests; mutating one included byte gave `sha256:960b89…` / `sha256:401ff6…`; a non-included file left the baseline unchanged |
| Proposed case-set verifier (§2.1) | Passed: `verify_cases.py` reports 61 cases, 19/36/6, F46/F59 identity-only, F58 pending (default 19/36/6, alternate 20/35/6) |
| D-P2A-3 scratch snapshot update (§3.2) | Passed: 434 files, manifest hash `b19a710e059b4629021dcbeb9f60a965945ab6d8c2e9cd8873283116af57b169`, manifest/sums entries for `archive.tar`, owner-side verifier OK |
| F25 metadata and provenance (§3.1) | Passed: case command `verify ../archive.tar`, `noReport`, `pap.cli.usage`; source blob `81f5…` at `c6ee644` |
| F25 scratch-bundle probe (§3.3) | Passed: exit 64, empty stdout, `pap.cli.usage` against the restored scratch bundle |
| `bun run check` on the proposal tree | Passed: `Результат: ok (артефакт не записан)` |
| Full local CI (`bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, `bun run check`) | Passed on the code tree: install OK, typecheck exit 0, 308 tests pass / 0 fail, check `ok (артефакт не записан)`; the later commits are documentation-only and CI reruns it |
| Implementation-record self-check (§1.5) | Not run: no implementation is authorized; the reproducible §1.4 vector self-check is the executed substitute |
| Actual bundle edit / snapshot regeneration | Not run: proposal-only; the exact procedure was reproduced in a scratch bundle |
| Three independent implementations / owner-side comparison matrix | Not run; the public issue summary is the evidence. The case-set critique is derived from the public RFC, brief and corpus. |

## 6. Limits

- The case-set verifier in §2.1 was run against the committed proposed artifact
  `cases-phase2a.proposed.json`; the final bundle file must be checked again after implementation.
  The verifier hardcodes the proposal's exact default membership, so a deliberate change to the
  case list requires updating the artifact and the verifier's constants.
- F58 is pending, not settled. The verifier asserts the default (identity-only) and the alternate
  (full, 20/35/6); it does not choose between them. The owner decision is required before the
  case set is final.
- The base and snapshot are pinned (`5291f1b` / `c6ee644`). If the PR base advances, update
  `basis.baseCommit`, `BASE` in §0 and `BASE_COMMIT` in `verify_cases.py` in the same commit and
  re-run the verifier; the RFC and `cases.json` content must remain unchanged.
- The implementation-record self-check in §1.5 depends on implementation-specific build commands;
  the record must contain the exact commands and before/after values. It is not run here because
  no implementation is authorized; the reproducible §1.4 vector self-check is run instead.
- The snapshot verifier is owner-side tooling; the public manifest and `SHA256SUMS` are the data.
  The §3.2 script reproduces the update without the tool, and the tool is only an additional
  check. If the tool is unavailable, the script's own counts and the `sha256sum` checks are
  sufficient to validate the inventory.
- The reference verifier is used only for the F25 probe; the case-set expectations and the E.3
  vector do not use it. A different conforming verifier must produce the same F25 exit code,
  empty stdout and `pap.cli.usage` code by RFC §9.
