import { after, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { domainHash } from "../src/digest.js";
import { fixtures, runPap } from "./support.js";
import { cleanupTempDirs, tempDir } from "./temp.js";

const NOW = "2026-11-02T00:00:00Z";
const base = path.join(fixtures, "base");

after(cleanupTempDirs);

/** The same three shapes for every enum-like field: array, object, number. */
const NON_STRINGS: [string, unknown][] = [
  ["array", ["required"]],
  ["object", { mode: "required" }],
  ["number", 1],
];

function tempPackage(): string {
  const dir = tempDir("rejection-");
  cpSync(base, dir, { recursive: true });
  return dir;
}

function manifest(dir: string): any {
  return JSON.parse(readFileSync(path.join(dir, "assurance-package.json"), "utf8"));
}

function writeManifest(dir: string, value: unknown): void {
  writeFileSync(path.join(dir, "assurance-package.json"), `${JSON.stringify(value, null, 2)}\n`);
}

function setClaim(dir: string, kind: string, file: string, value: unknown): void {
  const bytes = Buffer.from(JSON.stringify(value));
  writeFileSync(path.join(dir, "claims", file), bytes);
  const valueManifest = manifest(dir);
  valueManifest.claims[kind] = {
    path: `claims/${file}`,
    digest: domainHash("pap.claims.v1", bytes),
  };
  writeManifest(dir, valueManifest);
}

function writePolicy(value: unknown): string {
  const dir = tempDir("rejection-policy-");
  const file = path.join(dir, "policy.json");
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function policyFixture(name: string): any {
  return JSON.parse(readFileSync(path.join(fixtures, "trust-policy", name), "utf8"));
}

function verify(
  dir: string,
  extra: string[] = [],
): { status: number; stdout: string; stderr: string } {
  return runPap(["verify", ".", "--format", "json", "--now", NOW, ...extra], dir);
}

function report(result: { stdout: string }): any {
  return JSON.parse(result.stdout);
}

interface PolicyCase {
  field: string;
  mutate: (policy: any, value: unknown) => void;
}

const POLICY_CASES: PolicyCase[] = [
  {
    field: "trustPolicyVersion",
    mutate: (policy, value) => {
      policy.trustPolicyVersion = value;
    },
  },
  {
    field: "signature.mode",
    mutate: (policy, value) => {
      policy.signature.mode = value;
    },
  },
  {
    field: "keys[].algorithm",
    mutate: (policy, value) => {
      policy.keys = [{ keyId: "key-1", algorithm: "ed25519", publicKey: "A".repeat(43) }];
      policy.keys[0].algorithm = value;
    },
  },
  {
    field: "signers[].allowedRoles",
    mutate: (policy, value) => {
      policy.keys = [{ keyId: "key-1", algorithm: "ed25519", publicKey: "A".repeat(43) }];
      policy.signers = [
        { keyIds: ["key-1"], identity: "producer:acme", allowedRoles: ["producer"] },
      ];
      policy.signers[0].allowedRoles = value;
    },
  },
  {
    field: "requiredDimensions",
    mutate: (policy, value) => {
      policy.requiredDimensions = value;
    },
  },
  {
    field: "requiredChecks",
    mutate: (policy, value) => {
      policy.requiredChecks = value;
    },
  },
  {
    field: "humanReview.required",
    mutate: (policy, value) => {
      policy.humanReview.required = value;
    },
  },
];

for (const fieldCase of POLICY_CASES) {
  for (const [shape, value] of NON_STRINGS) {
    test(`invalid policy ${fieldCase.field} as ${shape}: exit 64, no report`, () => {
      const policy = policyFixture("unsigned-valid.json");
      fieldCase.mutate(policy, value);
      const file = writePolicy(policy);
      const result = verify(tempPackage(), ["--trust-policy", file]);
      assert.equal(result.status, 64, result.stdout);
      assert.equal(result.stdout, "");
      assert.ok(result.stderr.includes("pap: pap.trust.policy-invalid:"), result.stderr);
    });
  }
}

for (const [label, limits] of [
  ["prototype-chain key", { toString: 1 }],
  ["unknown plain key", { noSuchLimit: 1 }],
] as const) {
  test(`policy limits rejects a ${label}: exit 64, no report`, () => {
    // Appendix B `limits` is a closed map: membership must not fall through to
    // Object.prototype, and an unexpected key must fail closed like any other
    // unknown policy field.
    const policy = policyFixture("unsigned-valid.json");
    policy.limits = limits;
    const result = verify(tempPackage(), ["--trust-policy", writePolicy(policy)]);
    assert.equal(result.status, 64, result.stdout);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.includes("pap: pap.trust.policy-invalid:"), result.stderr);
  });
}

interface ManifestCase {
  field: string;
  mutate: (value: any, fieldValue: unknown) => void;
  scope: string;
}

const MANIFEST_CASES: ManifestCase[] = [
  {
    field: "papVersion",
    mutate: (value, fieldValue) => {
      value.papVersion = fieldValue;
    },
    scope: "$.papVersion",
  },
  {
    field: "build.extensions[].kind",
    mutate: (value, fieldValue) => {
      value.build.extensions = [{ kind: "profile", id: "extension:test", version: "1" }];
      value.build.extensions[0].kind = fieldValue;
    },
    scope: "$.build.extensions[0]",
  },
  {
    field: "inputs[].normalization",
    mutate: (value, fieldValue) => {
      value.inputs[0].normalization = fieldValue;
    },
    scope: "$.inputs[0]",
  },
  {
    field: "checkSpecs[].required",
    mutate: (value, fieldValue) => {
      value.checkSpecs[0].required = fieldValue;
    },
    scope: "$.checkSpecs[0].required",
  },
];

for (const manifestCase of MANIFEST_CASES) {
  for (const [shape, value] of NON_STRINGS) {
    test(`invalid manifest ${manifestCase.field} as ${shape}: FAIL report, package integrity`, () => {
      const dir = tempPackage();
      const valueManifest = manifest(dir);
      manifestCase.mutate(valueManifest, value);
      writeManifest(dir, valueManifest);
      const result = verify(dir);
      assert.equal(result.status, 1, result.stdout);
      const parsed = report(result);
      assert.equal(parsed.verdict, "FAIL");
      assert.equal(parsed.dimensions.integrity.package, "FAIL");
      assert.ok(
        parsed.diagnostics.some(
          (diagnostic: any) =>
            diagnostic.code === "pap.package.schema" && diagnostic.scope === manifestCase.scope,
        ),
        JSON.stringify(parsed.diagnostics),
      );
    });
  }
}

interface ClaimCase {
  field: string;
  kind: "provenance" | "relations" | "producerReport" | "reviews";
  file: string;
  load: (dir: string) => any;
  mutate: (value: any, fieldValue: unknown) => void;
}

const CLAIM_CASES: ClaimCase[] = [
  {
    field: "papClaimsVersion",
    kind: "producerReport",
    file: "producer-report.json",
    load: (dir) =>
      JSON.parse(readFileSync(path.join(dir, "claims", "producer-report.json"), "utf8")),
    mutate: (value, fieldValue) => {
      value.papClaimsVersion = fieldValue;
    },
  },
  {
    field: "provenance bindings[].locator.kind",
    kind: "provenance",
    file: "provenance.json",
    load: (dir) => JSON.parse(readFileSync(path.join(dir, "claims", "provenance.json"), "utf8")),
    mutate: (value, fieldValue) => {
      value.bindings[0].locator.kind = fieldValue;
    },
  },
  {
    field: "provenance bindings[].quote.normalization",
    kind: "provenance",
    file: "provenance.json",
    load: (dir) => JSON.parse(readFileSync(path.join(dir, "claims", "provenance.json"), "utf8")),
    mutate: (value, fieldValue) => {
      value.bindings[0].quote.normalization = fieldValue;
    },
  },
  {
    field: "producerReport claims[].claimedOutcome",
    kind: "producerReport",
    file: "producer-report.json",
    load: (dir) =>
      JSON.parse(readFileSync(path.join(dir, "claims", "producer-report.json"), "utf8")),
    mutate: (value, fieldValue) => {
      value.claims[0].claimedOutcome = fieldValue;
    },
  },
  {
    field: "reviews approvals[].decision",
    kind: "reviews",
    file: "reviews.json",
    load: () => ({
      papClaimsVersion: "0.1",
      approvals: [
        {
          id: "approval-1",
          reviewer: { identity: "reviewer:acme" },
          decision: "approved",
          decidedAt: "2026-11-02T00:00:00Z",
        },
      ],
    }),
    mutate: (value, fieldValue) => {
      value.approvals[0].decision = fieldValue;
    },
  },
];

for (const claimCase of CLAIM_CASES) {
  for (const [shape, value] of NON_STRINGS) {
    test(`invalid claim ${claimCase.field} as ${shape}: FAIL report, claim-invalid`, () => {
      const dir = tempPackage();
      const claim = claimCase.load(dir);
      claimCase.mutate(claim, value);
      setClaim(dir, claimCase.kind, claimCase.file, claim);
      const result = verify(dir);
      assert.equal(result.status, 1, result.stdout);
      const parsed = report(result);
      assert.equal(parsed.verdict, "FAIL");
      assert.equal(parsed.dimensions.integrity.package, "FAIL");
      assert.ok(
        parsed.diagnostics.some(
          (diagnostic: any) =>
            diagnostic.code === "pap.package.claim-invalid" && diagnostic.scope === claimCase.kind,
        ),
        JSON.stringify(parsed.diagnostics),
      );
    });
  }
}

interface EnvelopeCase {
  field: string;
  mutate: (value: any, fieldValue: unknown) => void;
}

const ENVELOPE_CASES: EnvelopeCase[] = [
  {
    field: "payloadType",
    mutate: (value, fieldValue) => {
      value.payloadType = fieldValue;
    },
  },
  {
    field: "payload",
    mutate: (value, fieldValue) => {
      value.payload = fieldValue;
    },
  },
  {
    field: "signatures",
    mutate: (value, fieldValue) => {
      value.signatures = fieldValue;
    },
  },
  {
    field: "signatures[].keyid",
    mutate: (value, fieldValue) => {
      value.signatures[0].keyid = fieldValue;
    },
  },
  {
    field: "signatures[].sig",
    mutate: (value, fieldValue) => {
      value.signatures[0].sig = fieldValue;
    },
  },
];

for (const envelopeCase of ENVELOPE_CASES) {
  for (const [shape, value] of NON_STRINGS) {
    test(`invalid envelope ${envelopeCase.field} as ${shape}: INVALID envelope path`, () => {
      const dir = tempPackage();
      const envelope = JSON.parse(
        readFileSync(path.join(fixtures, "signatures", "trusted.dsse.json"), "utf8"),
      );
      envelopeCase.mutate(envelope, value);
      mkdirSync(path.join(dir, "signatures"));
      writeFileSync(path.join(dir, "signatures", "hostile.dsse.json"), JSON.stringify(envelope));
      const file = writePolicy(policyFixture("signature-required.json"));
      const result = verify(dir, ["--trust-policy", file]);
      assert.equal(result.status, 1, result.stdout);
      const parsed = report(result);
      assert.equal(parsed.verdict, "FAIL");
      assert.equal(parsed.dimensions.signature.validity, "INVALID");
      assert.ok(
        parsed.diagnostics.some(
          (diagnostic: any) => diagnostic.code === "pap.signature.envelope-invalid",
        ),
        JSON.stringify(parsed.diagnostics),
      );
      assert.ok(
        !parsed.diagnostics.some(
          (diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded",
        ),
        "a structural defect must not be classified as a limit",
      );
    });
  }
}
