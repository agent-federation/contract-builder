import { after, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import path from "node:path";
import { jcsBytes, parseJsonStrict } from "../src/json.js";
import { paeBytes } from "../src/signatures.js";
import { evaluateTrust } from "../src/verify.js";
import type { TrustPolicy } from "../src/policy.js";
import type { SignatureEvaluation } from "../src/signatures.js";
import type { Diagnostic, VerificationReport } from "../src/types.js";
import { fixtures, runPap } from "./support.js";
import { cleanupTempDirs, tempDir } from "./temp.js";

const NOW = "2026-11-02T00:00:00Z";
const PAYLOAD_TYPE = "application/vnd.pap.manifest.v0.1+json";

after(cleanupTempDirs);

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
    scanIncomplete: false,
    readNone: false,
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

/**
 * RFC §9.9 orders `dimensions.signature.signatures[]` by `path` then `keyId`.
 * A single envelope may carry several key IDs in producer order, so the report
 * must reorder them; an entry with no key ID sorts last at its path.
 */
test("signature entries are ordered by path then keyId with an empty keyId last", () => {
  const dir = tempDir("signature-order-");
  cpSync(path.join(fixtures, "base"), dir, { recursive: true });
  const payload = jcsBytes(
    parseJsonStrict(readFileSync(path.join(dir, "assurance-package.json")), {
      nesting: 64,
      stringBytes: 16_777_216,
    }),
  );
  const pae = paeBytes(PAYLOAD_TYPE, payload);
  const makeKey = (keyId: string): { keyId: string; publicKey: string; signature: string } => {
    const pair = generateKeyPairSync("ed25519");
    const raw = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
    return {
      keyId,
      publicKey: raw.toString("base64url"),
      signature: sign(null, pae, pair.privateKey).toString("base64"),
    };
  };
  const alpha = makeKey("key-alpha");
  const zulu = makeKey("key-zulu");
  const envelope = (signatures: { keyid: string; sig: string }[]) => ({
    payloadType: PAYLOAD_TYPE,
    payload: Buffer.from(payload).toString("base64"),
    signatures,
  });
  mkdirSync(path.join(dir, "signatures"), { recursive: true });
  // Producer order is deliberately not report order: zulu before alpha, and
  // the empty keyId sits between them.
  writeFileSync(
    path.join(dir, "signatures", "a.dsse.json"),
    JSON.stringify(
      envelope([
        { keyid: zulu.keyId, sig: zulu.signature },
        { keyid: "", sig: alpha.signature },
        { keyid: alpha.keyId, sig: alpha.signature },
      ]),
    ),
  );
  writeFileSync(
    path.join(dir, "signatures", "z.dsse.json"),
    JSON.stringify(envelope([{ keyid: zulu.keyId, sig: zulu.signature }])),
  );
  const policy = JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-optional.json"), "utf8"),
  );
  policy.id = "policy-signature-order";
  policy.keys = [
    { keyId: alpha.keyId, algorithm: "ed25519", publicKey: alpha.publicKey },
    { keyId: zulu.keyId, algorithm: "ed25519", publicKey: zulu.publicKey },
  ];
  policy.signers = [
    { keyIds: [alpha.keyId], identity: "alpha", allowedRoles: ["producer"] },
    { keyIds: [zulu.keyId], identity: "zulu", allowedRoles: ["producer"] },
  ];
  const policyFile = path.join(tempDir("signature-order-policy-"), "policy.json");
  writeFileSync(policyFile, JSON.stringify(policy));
  const result = runPap(
    ["verify", ".", "--trust-policy", policyFile, "--format", "json", "--now", NOW],
    dir,
  );
  const report = JSON.parse(result.stdout);
  assert.deepEqual(
    report.dimensions.signature.signatures.map((entry: any) => [entry.path, entry.keyId ?? ""]),
    [
      ["signatures/a.dsse.json", "key-alpha"],
      ["signatures/a.dsse.json", "key-zulu"],
      ["signatures/a.dsse.json", ""],
      ["signatures/z.dsse.json", "key-zulu"],
    ],
  );
  assert.equal(report.dimensions.signature.signatures[2].policyDecision, "REJECTED");
});
