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

The expected baseline is `contract-builder` `8c3a5fa`, bundle `c568051`, snapshot source
`c6ee644`. Substitute the actual implementation commits when the decisions are implemented.

---

## 0. Baseline integrity

```bash
cd "$REPO"
git rev-parse HEAD
git diff --stat c6ee64416c91ab56f9d8270114c8f8a8b9d2f608..HEAD -- \
  docs/architecture/portable-assurance-package-rfc.md \
  pap/fixtures/pap-v0.1/cases.json
sha256sum pap/fixtures/pap-v0.1/cases.json
sha256sum docs/architecture/portable-assurance-package-rfc.md
```

Expected at the proposal baseline:

- `HEAD` is `8c3a5fa…`;
- the `git diff --stat` is empty (the RFC and corpus did not change since the snapshot source);
- `cases.json` is
  `8ae2693b34a31f1a49fdee0e5e5e235419e8d510d2a9b6f84e809b0c1ef154df`;
- the RFC is
  `a171fdcfc7da76af302eea3a270c5b63506b07ce74c3ebd784401e48e7e543c1`.

The bundle's `snapshot/manifest.json` must still name the same source commit:

```bash
cd "$BUNDLE"
git rev-parse HEAD
python3 -c 'import json; m=json.load(open("snapshot/manifest.json")); print(m["source"])'
python3 -c 'import json; m=json.load(open("snapshot/manifest.json")); print(len(m["files"]), "files")'
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
r = json.load(open("/tmp/report.json"))
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

### 1.4 Two-way self-check

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
rec = json.load(open("path/to/experiment-record.json"))
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

### 1.5 Negative control — no package-derived copy

The rust failure copied `implementationDigest` from a value inside the package's
`claims/producer-report.json`. A conforming run must not have its digest hex appear as a
`sha256:` literal in any package file, and must not use the reference verifier id:

```bash
cd <implementation checkout>
python3 - <<'PY'
import json, re
from pathlib import Path
rec = json.load(open("path/to/experiment-record.json"))
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

The following checks assume the proposed `cases-phase2a.json` is present at
`$BUNDLE/pap/fixtures/pap-v0.1/cases-phase2a.json` and that `cases.json` is unchanged.

### 2.1 Case-set schema, counts and identity expectations

This script is the machine check for the exact case list in [`decisions.md`](decisions.md). It
asserts the 19/36/6 membership, the applicability subset, the `packageIdentity` expectations and
the `cases.json` pin. It was run against a provisional generated set while preparing this
proposal; run it again against the committed file.

```bash
cd "$REPO"
CASE_SET="${BUNDLE}/pap/fixtures/pap-v0.1/cases-phase2a.json"
python3 - "$CASE_SET" <<'PY'
import hashlib, json, sys
from pathlib import Path

repo = Path.cwd()
base = repo / "pap/fixtures/pap-v0.1"
case_set = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
corpus = json.loads((base / "cases.json").read_text(encoding="utf-8"))
base_id = "sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020"

FULL = {
    "F07-unknown-check", "F08-critical-extension", "F09-newer-check", "F10-newer-minor",
    "F21-truncated-manifest", "F22-path-traversal", "F23-symlink", "F24-case-duplicate",
    "F26-missing-artifact", "F29-duplicate-key", "F30-unknown-field", "F33-required-feature",
    "F35-manifest-limit", "F50-bom", "F51-exponent-number", "F53-check-version",
    "F54-all-optional", "F57-major-version", "F60-missing-manifest",
}
IDENTITY = {
    "F01-unchanged", "F02-artifact-byte", "F03-source-byte", "F04-input-byte", "F05-quote-span",
    "F06-relation-edge", "F11-untrusted-role", "F12-invalid-signature", "F13-trusted-signature",
    "F14-no-policy", "F15-stale-policy", "F16-unknown-signer", "F17-package-not-allowed",
    "F18-two-envelopes", "F19-required-signature-absent", "F20-producer-mismatch",
    "F27-referenced-source", "F28-review-missing", "F31-undeclared-file", "F32-optional-extension",
    "F34-noncanonical", "F36-determinism", "F40-producer-free", "F43-profile-mismatch",
    "F44-no-provenance", "F45-no-relations", "F46-inverse-not-reciprocal",
    "F47-policy-boundary-expiry", "F48-policy-boundary-issued", "F49-policy-one-second-after",
    "F52-lowered-limits", "F55-review-approved", "F56-optional-mixed", "F58-undeclared-source",
    "F59-relation-duplicate", "F61-relations-only-lowered",
}
EXCLUDED = {
    "F25-archive": "2c", "F37-inspect-usage": "2c", "F38-explain-usage": "2c",
    "F39-explain-unknown": "2c", "F41-invalid-policy": "2c", "F42-explain-positive": "2c",
}

def jcs(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

def package_identity(package_dir):
    path = base / package_dir / "assurance-package.json"
    if not path.exists():
        return None
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return "sha256:" + hashlib.sha256(b"pap.package.v1\x00" + jcs(obj)).hexdigest()

def expected_identity(case):
    rel = case.get("expect", {}).get("identityRelations", {})
    if rel.get("packageIdentity") == "equals-base":
        return base_id
    if "packageIdentity" in rel and rel["packageIdentity"] is None:
        return None
    return package_identity(case.get("package", case["caseId"]))

by_id = {c["caseId"]: c for c in corpus["cases"]}
assert len(corpus["cases"]) == 61 and len(by_id) == 61
assert set(case_set["cases"]) == set(by_id)
assert {k for k, v in case_set["cases"].items() if v["profile"] == "full"} == FULL
assert {k for k, v in case_set["cases"].items() if v["profile"] == "identityOnly"} == IDENTITY
assert {k for k, v in case_set["cases"].items() if v["profile"] == "excluded"} == set(EXCLUDED)

for cid, entry in case_set["cases"].items():
    assert entry["profile"] in ("full", "identityOnly", "excluded"), (cid, entry)
    if entry["profile"] == "full":
        expected = by_id[cid].get("expect", {})
        assert "exitCode" in expected and "verdict" in expected, cid
        assert set(entry["applicableDiagnosticCodes"]) <= set(expected.get("diagnosticCodes", [])), cid
        assert entry["packageIdentity"] == expected_identity(by_id[cid]), cid
    elif entry["profile"] == "identityOnly":
        assert entry["packageIdentity"] == expected_identity(by_id[cid]), cid
    else:
        assert entry["owningPhase"] == EXCLUDED[cid], cid

assert case_set["basis"]["casesJson"]["sha256"] == hashlib.sha256((base / "cases.json").read_bytes()).hexdigest()
assert package_identity("base") == base_id
print("OK: 61 cases, 19 full / 36 identityOnly / 6 excluded")
print("OK: profile membership, applicable codes and identity expectations")
PY
```

The expected output is the two `OK:` lines. The script does not read any verifier report; the only
inputs are `cases.json`, the fixtures and the case set.

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
python3 - <<'PY'
import json
from pathlib import Path
bundle = Path("<bundle>")
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
expected values are the case-set literals generated by §2.1. A mismatch is a finding; a mismatch
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

### 3.3 F25 probe

```bash
cd "$REPO/pap/fixtures/pap-v0.1/F25-archive"
"$BUN" ../../../bin/pap verify ../archive.tar --format json > /tmp/f25.out 2> /tmp/f25.err
code=$?
test "$code" -eq 64
test ! -s /tmp/f25.out
grep -q '^pap: pap.cli.usage:' /tmp/f25.err
printf 'OK: F25 exit=%s, no report, pap.cli.usage\n' "$code"
cat /tmp/f25.err
```

Expected: exit 64; empty stdout; stderr `pap: pap.cli.usage: package path is not a directory:
../archive.tar`. This was executed while preparing the proposal against the current `main`; it is
the public reference implementation, not private code. The same run against the bundle before the
fix returns exit 74 (`pap.package.not-found`) because the file is absent — that is the defect being
fixed.

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
| Appendix E.3 vector (§1.1) | Passed: `implementationDigest = sha256:73f738…`, `checkerIdentity = sha256:15a0b0…` |
| Appendix E.1 base identity (§1.2) | Passed: `sha256:77a8d1d0…` |
| JCS/SHA-256 case-set checker (§2.1, provisional 19/36/6 set) | Passed: 61 cases, profile membership, applicable codes, identity expectations |
| D-P2A-3 scratch snapshot update (§3.2) | Passed: 434 files, manifest hash `b19a710e059b4629021dcbeb9f60a965945ab6d8c2e9cd8873283116af57b169`, snapshot verifier OK |
| F25 reference probe (§3.3) | Passed: exit 64, empty stdout, `pap.cli.usage` |
| `bun run check` on the proposal tree | Passed: `Результат: ok (артефакт не записан)` |
| Full local CI (`bun install --frozen-lockfile`, `bun run typecheck`, `bun test`, `bun run check`) | Passed: install OK, typecheck exit 0, 308 tests pass / 0 fail, check `ok (артефакт не записан)` |
| Three independent implementations / owner-side comparison matrix | Not run; their public summary is in the issue. The case-set critique is derived from the public RFC, brief and corpus. |

## 6. Limits

- The case-set checker in §2.1 was run against a provisional set generated from the proposal's
  tables; the committed file must be checked again. The checker hardcodes the proposal's exact
  membership, so a deliberate change to the case list requires updating both the file and the
  checker's constants.
- The self-check in §1.4 depends on implementation-specific build commands; the record must
  contain the exact commands and before/after values. The re-run is by the reviewer.
- The snapshot verifier is owner-side tooling; the public manifest and `SHA256SUMS` are the data.
  The §3.2 script reproduces the update without the tool, and the tool is only an additional
  check. If the tool is unavailable, the script's own counts and the `sha256sum` checks are
  sufficient to validate the inventory.
- The reference verifier is used only for the F25 probe; the case-set expectations and the E.3
  vector do not use it. A different conforming verifier must produce the same F25 exit code,
  empty stdout and `pap.cli.usage` code by RFC §9.
