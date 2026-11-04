#!/usr/bin/env python3
"""Verify the proposed Phase 2a case set against the public corpus.

This is a proposal-package tool, not a bundle or verifier artifact. It reads
`pap/fixtures/pap-v0.1/cases.json`, the fixtures and the proposed case set, and
checks that the proposal is internally consistent:

- every case id exists exactly once and the 61-case total is complete;
- the declared 19/36/6 classification is the one in the file;
- F46/F59 are not outcome-comparable (they need the Phase 2b RC check);
- F58 is visibly pending the owner decision, with the 20/35/6 alternate;
- the applicable diagnostic codes are a subset of cases.json;
- every packageIdentity is recomputed from the frozen manifest bytes after a strict
  canonical-JSON precheck (BOM, duplicate member names and non-integer number spellings
  yield null), using cases.json's `identityRelations` for equals-base/null;
- F29 is null (its manifest repeats `package.id`) and is asserted as such.

Usage:
    python3 verify_cases.py --repo <contract-builder checkout> \
        --case-set cases-phase2a.proposed.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

BASE_ID = "sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020"
BASE_COMMIT = "5249aaba63ef5bf0134a77f08b24911eec7fe98d"
SNAPSHOT_COMMIT = "c6ee64416c91ab56f9d8270114c8f8a8b9d2f608"
CASES_SHA256 = "8ae2693b34a31f1a49fdee0e5e5e235419e8d510d2a9b6f84e809b0c1ef154df"

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


class StrictJSONError(ValueError):
    pass


def _reject_duplicate_pairs(pairs):
    obj = {}
    for key, value in pairs:
        if key in obj:
            raise StrictJSONError(f"duplicate member name: {key}")
        obj[key] = value
    return obj


def _parse_int(token: str) -> int:
    if token == "-0":
        raise StrictJSONError("negative zero is not an integer spelling")
    value = int(token)
    if abs(value) > 2**53 - 1:
        raise StrictJSONError(f"integer outside the I-JSON range: {token}")
    return value


def _reject_constant(token: str):
    raise StrictJSONError(f"invalid JSON constant: {token}")


def _parse_float(token: str):
    raise StrictJSONError(f"non-integer number token: {token}")


def strict_canonical_object(raw: bytes):
    """Parse only the I-JSON subset that RFC 8785 can canonicalize.

    RFC §5.3.1: BOM, duplicate member names and non-integer number spellings
    are invalid and must be rejected rather than silently coerced.
    """
    if raw.startswith(b"\xef\xbb\xbf"):
        raise StrictJSONError("UTF-8 BOM")
    text = raw.decode("utf-8")
    return json.loads(
        text,
        object_pairs_hook=_reject_duplicate_pairs,
        parse_int=_parse_int,
        parse_float=_parse_float,
        parse_constant=_reject_constant,
    )


def package_identity(base: Path, package_dir: str):
    path = base / package_dir / "assurance-package.json"
    if not path.exists():
        return None
    try:
        obj = strict_canonical_object(path.read_bytes())
    except Exception:
        return None
    return "sha256:" + hashlib.sha256(b"pap.package.v1\x00" + jcs(obj)).hexdigest()


def expected_identity(base: Path, case):
    rel = case.get("expect", {}).get("identityRelations", {})
    if rel.get("packageIdentity") == "equals-base":
        return BASE_ID
    if "packageIdentity" in rel and rel["packageIdentity"] is None:
        return None
    return package_identity(base, case.get("package", case["caseId"]))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default=".", help="contract-builder checkout")
    parser.add_argument(
        "--case-set",
        default=str(Path(__file__).with_name("cases-phase2a.proposed.json")),
        help="proposed case-set JSON",
    )
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    base = repo / "pap/fixtures/pap-v0.1"
    corpus_raw = (base / "cases.json").read_bytes()
    corpus = json.loads(corpus_raw)
    case_set = json.loads(Path(args.case_set).read_text(encoding="utf-8"))

    assert hashlib.sha256(corpus_raw).hexdigest() == CASES_SHA256
    assert case_set["basis"]["casesJson"]["sha256"] == CASES_SHA256
    assert case_set["basis"]["baseCommit"] == BASE_COMMIT
    assert case_set["basis"]["snapshotSourceCommit"] == SNAPSHOT_COMMIT
    assert "proposed only" in case_set["proposalStatus"]
    assert set(case_set["pendingOwnerDecisions"]) == {"D-P2A-1", "D-P2A-2", "D-P2A-3"}

    by_id = {case["caseId"]: case for case in corpus["cases"]}
    assert len(corpus["cases"]) == 61 and len(by_id) == 61
    assert set(case_set["cases"]) == set(by_id), "case-set ids must match cases.json exactly"

    counts = {"full": 0, "identityOnly": 0, "excluded": 0}
    for cid, entry in case_set["cases"].items():
        profile = entry["profile"]
        assert profile in counts, (cid, profile)
        counts[profile] += 1
        if profile == "full":
            expected = by_id[cid].get("expect", {})
            assert "exitCode" in expected and "verdict" in expected, cid
            assert set(entry["applicableDiagnosticCodes"]) <= set(expected.get("diagnosticCodes", [])), cid
        if profile in ("full", "identityOnly"):
            assert entry["packageIdentity"] == expected_identity(base, by_id[cid]), cid
        if profile == "excluded":
            assert entry["owningPhase"] == EXCLUDED[cid], cid

    assert counts == {"full": 19, "identityOnly": 36, "excluded": 6}, counts
    assert case_set["summary"]["full"] == counts["full"]
    assert case_set["summary"]["identityOnly"] == counts["identityOnly"]
    assert case_set["summary"]["excluded"] == counts["excluded"]
    assert case_set["summary"]["total"] == 61

    assert {k for k, v in case_set["cases"].items() if v["profile"] == "full"} == FULL
    assert {k for k, v in case_set["cases"].items() if v["profile"] == "identityOnly"} == IDENTITY
    assert {k for k, v in case_set["cases"].items() if v["profile"] == "excluded"} == set(EXCLUDED)

    # The two cases that cannot be compared without the Phase 2b RC check.
    for cid in ("F46-inverse-not-reciprocal", "F59-relation-duplicate"):
        assert case_set["cases"][cid]["profile"] == "identityOnly", cid

    # F58 is not settled: default excludes it, alternate is full. The owner decision is pending.
    f58 = case_set["cases"]["F58-undeclared-source"]
    assert f58["profile"] == "identityOnly", f58
    assert f58["pendingOwnerDecision"] == "D-P2A-2", f58
    assert f58["alternateProfile"] == "full", f58
    assert f58["alternateApplicableDiagnosticCodes"] == ["pap.package.claim-invalid"], f58
    pending = case_set["summary"]["f58PendingOwnerDecision"]
    assert pending["defaultProfile"] == "identityOnly", pending
    assert pending["alternateProfile"] == "full", pending
    assert pending["alternateSummary"] == {"full": 20, "identityOnly": 35, "excluded": 6}, pending

    # F29's manifest has a duplicate package.id; RFC §5.3.1 forbids coercion.
    f29 = case_set["cases"]["F29-duplicate-key"]
    assert f29["profile"] == "full", f29
    assert f29["packageIdentity"] is None, f29
    assert package_identity(base, "F29-duplicate-key") is None, "F29 must not canonicalize"

    full_profile = case_set["profiles"]["full"]
    assert "pap.check.*" in full_profile.get("diagnosticCodePolicy", ""), full_profile

    assert package_identity(base, "base") == BASE_ID
    print("OK: 61 cases; %d full / %d identityOnly / %d excluded" % (
        counts["full"], counts["identityOnly"], counts["excluded"]))
    print("OK: case ids, profile membership, applicable codes and packageIdentity expectations")
    print("OK: F46/F59 are identity-only; F58 is pending D-P2A-2 (default 19/36/6, alternate 20/35/6)")
    print("OK: F29 identity is null (strict duplicate-key rejection); pap.check.* codes are not compared")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
