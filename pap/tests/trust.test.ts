import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrust } from "../src/verify.js";
import type { TrustPolicy } from "../src/policy.js";
import type { SignatureEvaluation } from "../src/signatures.js";
import type { Diagnostic, VerificationReport } from "../src/types.js";

/**
 * A policy may pin a checker identity other than the running verifier's own.
 * The fixture corpus may not pin the reference implementation's identity
 * (RFC §12.1), so the UNTRUSTED recognition branch is exercised here with a
 * synthetic checker.
 */
test("checker implementation mismatch is pap.trust.checker-untrusted", () => {
  const policy: TrustPolicy = {
    trustPolicyVersion: "0.1",
    id: "policy-synthetic-checker-2026-11",
    issuedAt: "2026-11-01T00:00:00Z",
    expiresAt: "2026-12-01T00:00:00Z",
    signature: { mode: "disabled", minimumValidSigners: 1 },
    keys: [],
    signers: [],
    checkers: [
      {
        id: "pap.checker.synthetic",
        version: "1",
        implementationDigest: `sha256:${"2".repeat(64)}`,
      },
    ],
    profiles: [],
    requiredChecks: ["pap.check.digest-integrity/1"],
    requiredDimensions: ["integrity"],
    humanReview: { required: false, maxAgeSeconds: 2_592_000 },
  };
  const signature: SignatureEvaluation = {
    validity: "NOT_APPLICABLE",
    entries: [],
    signerIdentity: "NOT_APPLICABLE",
    policyDecision: "NOT_EVALUATED",
    envelopeLimitHit: false,
    discoveryFailure: false,
    diagnostics: [],
  };
  const diagnostics: Diagnostic[] = [];
  const trust: VerificationReport["dimensions"]["trust"] = evaluateTrust({
    policy,
    state: "FRESH",
    signature,
    manifest: null,
    checker: {
      id: "pap.checker.synthetic",
      version: "1",
      implementationDigest: `sha256:${"1".repeat(64)}`,
    },
    diag: (code, severity, scope, message) => diagnostics.push({ code, severity, scope, message }),
  });
  assert.equal(trust.checkerRecognition, "UNTRUSTED");
  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ["pap.trust.checker-untrusted"],
  );
});
