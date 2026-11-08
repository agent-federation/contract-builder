import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { domainHash } from "../src/digest.js";
import { jcsBytes, parseJsonStrict } from "../src/json.js";
import { paeBytes } from "../src/signatures.js";
import { CHECKER } from "../src/version.js";
import { fixtures, runPap } from "./support.js";

const NOW = "2026-11-02T00:00:00Z";
const base = path.join(fixtures, "base");

function tempPackage(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-branch-"));
  cpSync(base, dir, { recursive: true });
  return dir;
}
function manifest(dir: string): any {
  return JSON.parse(readFileSync(path.join(dir, "assurance-package.json"), "utf8"));
}
function writeManifest(dir: string, value: unknown): void {
  writeFileSync(path.join(dir, "assurance-package.json"), `${JSON.stringify(value, null, 2)}\n`);
}
function writePolicy(value: unknown): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "pap-branch-policy-")), "policy.json");
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}
function unsignedPolicy(): any {
  return JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "unsigned-valid.json"), "utf8"),
  );
}
function reviewPolicy(): any {
  return JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "review-required.json"), "utf8"),
  );
}
function setReviews(dir: string, approvals: unknown[]): void {
  const bytes = Buffer.from(JSON.stringify({ papClaimsVersion: "0.1", approvals }));
  writeFileSync(path.join(dir, "claims", "reviews.json"), bytes);
  const value = manifest(dir);
  value.claims.reviews = {
    path: "claims/reviews.json",
    digest: domainHash("pap.claims.v1", bytes),
  };
  writeManifest(dir, value);
}
function verify(dir: string, policy: string): { status: number; stdout: string; stderr: string } {
  return runPap(["verify", ".", "--trust-policy", policy, "--format", "json", "--now", NOW], dir);
}

const approval = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "approval:1",
  reviewer: { identity: "alice" },
  decision: "approved",
  decidedAt: NOW,
  scope: { artifacts: ["artifact:acme-supplier"] },
  ...overrides,
});

test("human review: stale approval is INCOMPLETE", () => {
  const dir = tempPackage();
  setReviews(dir, [approval({ decidedAt: "2020-01-01T00:00:00Z" })]);
  const result = verify(dir, writePolicy(reviewPolicy()));
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.humanReview.status, "INCOMPLETE");
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.review.stale"));
});

test("human review: out-of-scope approval is binding-invalid", () => {
  const dir = tempPackage();
  setReviews(dir, [approval({ scope: { artifacts: ["artifact:other"] } })]);
  const result = verify(dir, writePolicy(reviewPolicy()));
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.humanReview.status, "INCOMPLETE");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.review.binding-invalid"),
  );
});

test("human review: unknown reviewer is UNKNOWN", () => {
  const dir = tempPackage();
  setReviews(dir, [approval({ reviewer: { identity: "bob" } })]);
  const result = verify(dir, writePolicy(reviewPolicy()));
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.humanReview.status, "UNKNOWN");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.review.unknown-reviewer"),
  );
});

test("human review: an in-scope rejection blocks a valid approval", () => {
  const dir = tempPackage();
  setReviews(dir, [approval(), approval({ id: "approval:2", decision: "rejected" })]);
  const result = verify(dir, writePolicy(reviewPolicy()));
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.humanReview.status, "INCOMPLETE");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.trust.review-required"),
  );
});

test("checker recognition: pin match, digest mismatch and unknown pin", () => {
  const policy = unsignedPolicy();
  policy.id = "policy-checker-recognition";
  policy.requiredDimensions = ["trust.checkerRecognition"];
  policy.checkers = [
    {
      id: CHECKER.id,
      version: CHECKER.version,
      implementationDigest: CHECKER.implementationDigest,
    },
  ];
  const dir = tempPackage();
  let result = verify(dir, writePolicy(policy));
  let report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.trust.checkerRecognition, "PASS");
  assert.equal(report.verdict, "PASS");

  policy.checkers[0].implementationDigest = "sha256:" + "1".repeat(64);
  result = verify(dir, writePolicy(policy));
  report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.trust.checkerRecognition, "UNTRUSTED");
  assert.equal(report.verdict, "UNTRUSTED");

  policy.checkers[0].id = "another.checker";
  policy.checkers[0].implementationDigest = CHECKER.implementationDigest;
  result = verify(dir, writePolicy(policy));
  report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.trust.checkerRecognition, "UNSUPPORTED");
  assert.equal(report.verdict, "UNSUPPORTED");
});

test("profile recognition: pin match and pinned closure mismatch", () => {
  const policy = unsignedPolicy();
  policy.id = "policy-profile-recognition";
  policy.requiredDimensions = ["trust.profileRecognition"];
  policy.profiles = [{ id: "acme-supplier", version: "0.1.0" }];
  const dir = tempPackage();
  let result = verify(dir, writePolicy(policy));
  let report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.trust.profileRecognition, "PASS");
  assert.equal(report.verdict, "PASS");

  const value = manifest(dir);
  value.profile.closureDigest = "sha256:" + "2".repeat(64);
  writeManifest(dir, value);
  policy.profiles[0].closureDigest = "sha256:" + "3".repeat(64);
  result = verify(dir, writePolicy(policy));
  report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.trust.profileRecognition, "UNTRUSTED");
  assert.equal(report.verdict, "UNTRUSTED");
});

test("payload count limit reads none of the affected class", () => {
  const dir = tempPackage();
  const value = manifest(dir);
  const artifact = value.artifacts[0];
  writeFileSync(path.join(dir, "artifacts/second.md"), "# second\n");
  value.artifacts.push({
    ...artifact,
    id: "artifact:second",
    path: "artifacts/second.md",
    bytes: 9,
    digest: domainHash("pap.artifact.v1", Buffer.from("# second\n")),
  });
  writeManifest(dir, value);
  const policy = unsignedPolicy();
  policy.id = "policy-payload-count";
  policy.limits = { payloadFiles: 1 };
  const result = verify(dir, writePolicy(policy));
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.artifacts, "NOT_EVALUATED");
  assert.ok(report.identities.artifacts.every((entry: any) => entry.computed === null));
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
});

test("signature: duplicate signer is reported and counted once", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"), { recursive: true });
  const template = readFileSync(path.join(fixtures, "signatures", "trusted.dsse.json"));
  writeFileSync(path.join(dir, "signatures", "trusted.dsse.json"), template);
  writeFileSync(path.join(dir, "signatures", "second.dsse.json"), template);
  const policy = JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-optional.json"), "utf8"),
  );
  const result = verify(dir, writePolicy(policy));
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "PASS");
  assert.ok(
    report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.signature.duplicate-signer",
    ),
  );
});

test("signature quorum counts distinct signer entries, not key IDs", () => {
  const dir = tempPackage();
  const payload = jcsBytes(
    parseJsonStrict(readFileSync(path.join(dir, "assurance-package.json")), {
      nesting: 64,
      stringBytes: 16_777_216,
    }),
  );
  const payloadType = "application/vnd.pap.manifest.v0.1+json";
  const pae = paeBytes(payloadType, payload);
  const makeKey = (): {
    publicKey: string;
    envelope: (keyId: string) => Record<string, unknown>;
  } => {
    const pair = generateKeyPairSync("ed25519");
    const raw = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
    return {
      publicKey: raw.toString("base64url"),
      envelope: (keyId: string) => ({
        payloadType,
        payload: Buffer.from(payload).toString("base64"),
        signatures: [{ keyid: keyId, sig: sign(null, pae, pair.privateKey).toString("base64") }],
      }),
    };
  };
  const first = makeKey();
  const second = makeKey();
  mkdirSync(path.join(dir, "signatures"), { recursive: true });
  writeFileSync(
    path.join(dir, "signatures/first.dsse.json"),
    JSON.stringify(first.envelope("key-first")),
  );
  writeFileSync(
    path.join(dir, "signatures/second.dsse.json"),
    JSON.stringify(second.envelope("key-second")),
  );
  const policy = JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-required.json"), "utf8"),
  );
  policy.id = "policy-quorum-two-signers";
  policy.signature.minimumValidSigners = 2;
  policy.keys = [
    { keyId: "key-first", algorithm: "ed25519", publicKey: first.publicKey },
    { keyId: "key-second", algorithm: "ed25519", publicKey: second.publicKey },
  ];
  policy.signers = [
    { keyIds: ["key-first"], identity: "signer-one", allowedRoles: ["producer"] },
    { keyIds: ["key-second"], identity: "signer-two", allowedRoles: ["producer"] },
  ];
  let result = verify(dir, writePolicy(policy));
  let report = JSON.parse(result.stdout);
  assert.equal(result.status, 0, result.stdout);
  assert.equal(report.verdict, "PASS");
  assert.equal(report.dimensions.trust.policyDecision, "ACCEPTED");

  // One signer entry with both keys cannot satisfy a two-signer quorum.
  policy.id = "policy-quorum-one-signer";
  policy.signers = [
    { keyIds: ["key-first", "key-second"], identity: "signer-one", allowedRoles: ["producer"] },
  ];
  result = verify(dir, writePolicy(policy));
  assert.equal(result.status, 64, result.stdout);
  assert.ok(result.stderr.includes("pap.trust.policy-invalid"));
});

test("a keyId enrolled in two signer entries is a policy error", () => {
  const policy = JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-required.json"), "utf8"),
  );
  policy.id = "policy-duplicate-key-owner";
  policy.signers = [
    { keyIds: ["key-acme-producer"], identity: "signer-one", allowedRoles: ["producer"] },
    { keyIds: ["key-acme-producer"], identity: "signer-two", allowedRoles: ["producer"] },
  ];
  const result = verify(tempPackage(), writePolicy(policy));
  assert.equal(result.status, 64);
  assert.ok(result.stderr.includes("pap.trust.policy-invalid"));
});

test("signature: missing keyId leaves the entry unknown and rejects the policy decision", () => {
  const dir = tempPackage();
  cpSync(path.join(fixtures, "signatures"), path.join(dir, "signatures"), { recursive: true });
  const envelopeFile = path.join(dir, "signatures", "trusted.dsse.json");
  const envelope = JSON.parse(readFileSync(envelopeFile, "utf8"));
  envelope.signatures[0].keyid = "";
  writeFileSync(envelopeFile, JSON.stringify(envelope));
  const policy = JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-optional.json"), "utf8"),
  );
  const result = verify(dir, writePolicy(policy));
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.trust.policyDecision, "REJECTED");
  assert.equal(report.verdict, "UNTRUSTED");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.signature.keyid-missing"),
  );
});

test("signature quorum: required mode with an unmet minimumValidSigners is INCOMPLETE", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"), { recursive: true });
  writeFileSync(
    path.join(dir, "signatures", "trusted.dsse.json"),
    readFileSync(path.join(fixtures, "signatures", "trusted.dsse.json")),
  );
  const policy = JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-required.json"), "utf8"),
  );
  // The operator's `mode: required` is the trust requirement; a second,
  // unrelated field must not decide whether it is evaluated.
  policy.id = "policy-quorum-unmet";
  policy.requiredDimensions = ["integrity", "sources", "checks"];
  // A second configured signer the package does not sign with: the quorum is
  // representable in the policy but not met by the package.
  const second = generateKeyPairSync("ed25519");
  const secondPublicKey = second.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  policy.keys.push({
    keyId: "key-acme-second",
    algorithm: "ed25519",
    publicKey: secondPublicKey.toString("base64url"),
  });
  policy.signers.push({
    keyIds: ["key-acme-second"],
    identity: "acme-second",
    allowedRoles: ["producer"],
  });

  policy.signature.minimumValidSigners = 2;
  const unmet = verify(dir, writePolicy(policy));
  assert.equal(unmet.status, 2, unmet.stdout);
  const report = JSON.parse(unmet.stdout);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.signature.validity, "VALID");
  assert.equal(report.dimensions.trust.signerIdentity, "TRUSTED");
  assert.equal(report.dimensions.trust.policyDecision, "NOT_EVALUATED");
  // I1/E2: `mode: required` derives signature/trust even though the operator
  // omitted them; the unmet quorum then makes I4 coverage partial.
  assert.deepEqual(report.coverage.requiredDimensions, [
    "integrity",
    "sources",
    "signature",
    "trust",
    "checks",
  ]);
  assert.equal(report.coverage.full, false);
  // Discriminating coverage: every required check is still evaluated; only the
  // derived `trust` dimension is undecided. A comparison case that collapsed
  // checks or dimensions would fail these counts even though `full` is false.
  assert.deepEqual(report.coverage.requiredChecks, [
    "pap.check.digest-integrity/1",
    "pap.check.source-quote/1",
    "pap.check.relation-consistency/1",
  ]);
  assert.equal(report.coverage.checksEvaluated, report.coverage.requiredChecks.length);
  assert.equal(report.coverage.checksPassed, report.coverage.requiredChecks.length);
  assert.equal(report.coverage.checksNotEvaluated, 0);
  assert.equal(report.coverage.checksUnsupported, 0);
  assert.equal(report.coverage.dimensionsEvaluated, report.coverage.requiredDimensions.length - 1);
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.signature.absent"),
  );
  assert.ok(
    report.limitations.some((limitation: any) => limitation.code === "pap.signature.absent"),
  );

  // A met quorum with the same required dimensions still passes.
  policy.id = "policy-quorum-met";
  policy.signature.minimumValidSigners = 1;
  const met = verify(dir, writePolicy(policy));
  assert.equal(met.status, 0, met.stdout);
  const metReport = JSON.parse(met.stdout);
  assert.equal(metReport.verdict, "PASS");
  assert.equal(metReport.dimensions.trust.policyDecision, "ACCEPTED");
  assert.equal(metReport.coverage.full, true);
  assert.deepEqual(metReport.coverage.requiredDimensions, [
    "integrity",
    "sources",
    "signature",
    "trust",
    "checks",
  ]);
  assert.equal(metReport.coverage.checksEvaluated, metReport.coverage.requiredChecks.length);
  assert.equal(
    metReport.coverage.dimensionsEvaluated,
    metReport.coverage.requiredDimensions.length,
  );
});

test("human review: an array-valued decision is a claim-invalid, not an approval", () => {
  const dir = tempPackage();
  setReviews(dir, [approval({ decision: ["approved"] })]);
  const result = verify(dir, writePolicy(reviewPolicy()));
  const report = JSON.parse(result.stdout);
  assert.notEqual(report.verdict, "PASS");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.claim-invalid"),
  );
  assert.notEqual(report.dimensions.humanReview.status, "PASS");
});
