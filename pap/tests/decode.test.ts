import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  decodeClaimFile,
  decodeManifest,
  decodeSignatureEnvelope,
  decodeTrustPolicy,
  PolicyInvalid,
} from "../src/decode.js";
import { DEFAULT_LIMITS } from "../src/types.js";
import type { JsonObject } from "../src/types.js";
import { fixtures } from "./support.js";

const base = path.join(fixtures, "base");

function readJson(file: string): JsonObject {
  return JSON.parse(readFileSync(file, "utf8")) as JsonObject;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A non-string value of each JSON shape that must never be coerced. */
const NON_STRINGS: [string, unknown][] = [
  ["array", ["required"]],
  ["object", { mode: "required" }],
  ["number", 1],
];

const unsignedPolicy = () =>
  readJson(path.join(fixtures, "trust-policy", "unsigned-valid.json"));
const baseManifest = () => readJson(path.join(base, "assurance-package.json"));
const producerReport = () => readJson(path.join(base, "claims", "producer-report.json"));
const provenance = () => readJson(path.join(base, "claims", "provenance.json"));

const reviews = (): JsonObject =>
  clone({
    papClaimsVersion: "0.1",
    approvals: [
      {
        id: "approval-1",
        reviewer: { identity: "reviewer:acme" },
        decision: "approved",
        decidedAt: "2026-11-02T00:00:00Z",
      },
    ],
  }) as JsonObject;

interface PolicyCase {
  field: string;
  mutate: (policy: JsonObject, value: unknown) => void;
  message: RegExp;
}

const POLICY_CASES: PolicyCase[] = [
  {
    field: "trustPolicyVersion",
    mutate: (policy, value) => {
      policy.trustPolicyVersion = value as never;
    },
    message: /trustPolicyVersion/,
  },
  {
    field: "signature.mode",
    mutate: (policy, value) => {
      (policy.signature as JsonObject).mode = value as never;
    },
    message: /signature\.mode/,
  },
  {
    field: "keys[].algorithm",
    mutate: (policy, value) => {
      policy.keys = [
        { keyId: "key-1", algorithm: "ed25519", publicKey: "A".repeat(43) },
      ];
      (policy.keys as JsonObject[])[0]!.algorithm = value as never;
    },
    message: /keys\[0\]/,
  },
  {
    field: "signers[].allowedRoles",
    mutate: (policy, value) => {
      policy.keys = [
        { keyId: "key-1", algorithm: "ed25519", publicKey: "A".repeat(43) },
      ];
      policy.signers = [
        { keyIds: ["key-1"], identity: "producer:acme", allowedRoles: ["producer"] },
      ];
      (policy.signers as JsonObject[])[0]!.allowedRoles = value as never;
    },
    message: /signers\[0\]/,
  },
  {
    field: "requiredDimensions",
    mutate: (policy, value) => {
      policy.requiredDimensions = value as never;
    },
    message: /requiredDimensions/,
  },
  {
    field: "requiredChecks",
    mutate: (policy, value) => {
      policy.requiredChecks = value as never;
    },
    message: /requiredChecks/,
  },
  {
    field: "humanReview.required",
    mutate: (policy, value) => {
      (policy.humanReview as JsonObject).required = value as never;
    },
    message: /humanReview/,
  },
];

for (const fieldCase of POLICY_CASES) {
  for (const [shape, value] of NON_STRINGS) {
    test(`trust policy rejects ${fieldCase.field} as ${shape}`, () => {
      const policy = unsignedPolicy();
      fieldCase.mutate(policy, value);
      assert.throws(
        () => decodeTrustPolicy(policy, DEFAULT_LIMITS),
        (error: unknown) =>
          error instanceof PolicyInvalid && fieldCase.message.test(error.message),
      );
    });
  }
}

test("trust policy: valid fixture decodes and the array-valued mode is rejected", () => {
  const valid = unsignedPolicy();
  assert.equal(decodeTrustPolicy(valid, DEFAULT_LIMITS).signature.mode, "disabled");
  const invalid = unsignedPolicy();
  invalid.signature = { mode: ["required"], minimumValidSigners: 1 };
  assert.throws(() => decodeTrustPolicy(invalid, DEFAULT_LIMITS), /signature\.mode/);
});

interface ManifestCase {
  field: string;
  mutate: (manifest: JsonObject, value: unknown) => void;
  scope: string;
}

const MANIFEST_CASES: ManifestCase[] = [
  {
    field: "papVersion",
    mutate: (manifest, value) => {
      manifest.papVersion = value as never;
    },
    scope: "$.papVersion",
  },
  {
    field: "build.extensions[].kind",
    mutate: (manifest, value) => {
      (manifest.build as JsonObject).extensions = [
        { kind: "profile", id: "extension:test", version: "1" },
      ];
      ((manifest.build as JsonObject).extensions as JsonObject[])[0]!.kind = value as never;
    },
    scope: "$.build.extensions[0]",
  },
  {
    field: "inputs[].normalization",
    mutate: (manifest, value) => {
      (manifest.inputs as JsonObject[])[0]!.normalization = value as never;
    },
    scope: "$.inputs[0]",
  },
  {
    field: "checkSpecs[].required",
    mutate: (manifest, value) => {
      (manifest.checkSpecs as JsonObject[])[0]!.required = value as never;
    },
    scope: "$.checkSpecs[0].required",
  },
];

for (const manifestCase of MANIFEST_CASES) {
  for (const [shape, value] of NON_STRINGS) {
    test(`manifest rejects ${manifestCase.field} as ${shape}`, () => {
      const manifest = baseManifest();
      manifestCase.mutate(manifest, value);
      const decoded = decodeManifest(manifest, DEFAULT_LIMITS);
      const defect = decoded.defects.find((entry) => entry.scope === manifestCase.scope);
      assert.ok(defect, JSON.stringify(decoded.defects));
      assert.equal(defect.code, "pap.package.schema");
      assert.equal(defect.structural, true);
    });
  }
}

test("manifest: valid fixture decodes without defects", () => {
  const decoded = decodeManifest(baseManifest(), DEFAULT_LIMITS);
  assert.deepEqual(decoded.defects, []);
  assert.notEqual(decoded.manifest, null);
  assert.equal(decoded.payloadsUsable, true);
});

interface ClaimCase {
  field: string;
  kind: "provenance" | "relations" | "producerReport" | "reviews";
  value: () => JsonObject;
  mutate: (claim: JsonObject, value: unknown) => void;
}

const CLAIM_CASES: ClaimCase[] = [
  {
    field: "papClaimsVersion",
    kind: "producerReport",
    value: producerReport,
    mutate: (claim, value) => {
      claim.papClaimsVersion = value as never;
    },
  },
  {
    field: "provenance bindings[].locator.kind",
    kind: "provenance",
    value: provenance,
    mutate: (claim, value) => {
      const binding = (claim.bindings as JsonObject[])[0]!;
      (binding.locator as JsonObject).kind = value as never;
    },
  },
  {
    field: "provenance bindings[].quote.normalization",
    kind: "provenance",
    value: provenance,
    mutate: (claim, value) => {
      const binding = (claim.bindings as JsonObject[])[0]!;
      (binding.quote as JsonObject).normalization = value as never;
    },
  },
  {
    field: "producerReport claims[].claimedOutcome",
    kind: "producerReport",
    value: producerReport,
    mutate: (claim, value) => {
      ((claim.claims as JsonObject[])[0]!).claimedOutcome = value as never;
    },
  },
  {
    field: "reviews approvals[].decision",
    kind: "reviews",
    value: reviews,
    mutate: (claim, value) => {
      ((claim.approvals as JsonObject[])[0]!).decision = value as never;
    },
  },
];

for (const claimCase of CLAIM_CASES) {
  for (const [shape, value] of NON_STRINGS) {
    test(`claim rejects ${claimCase.field} as ${shape}`, () => {
      const claim = claimCase.value();
      claimCase.mutate(claim, value);
      const decoded = decodeClaimFile(
        claimCase.kind,
        Buffer.from(JSON.stringify(claim)),
        DEFAULT_LIMITS,
        new Set(["SRC-ACME-POLICY"]),
      );
      assert.equal(decoded.ok, false);
      if (!decoded.ok) assert.equal(decoded.failure, "invalid");
    });
  }
}

test("claims: valid fixtures decode", () => {
  for (const [kind, value] of [
    ["provenance", provenance()],
    ["producerReport", producerReport()],
    ["reviews", reviews()],
  ] as const) {
    const decoded = decodeClaimFile(
      kind,
      Buffer.from(JSON.stringify(value)),
      DEFAULT_LIMITS,
      new Set(["SRC-ACME-POLICY"]),
    );
    assert.equal(decoded.ok, true, `${kind} must decode`);
  }
});

const trustedEnvelope = () =>
  readJson(path.join(fixtures, "signatures", "trusted.dsse.json"));

interface EnvelopeCase {
  field: string;
  mutate: (envelope: JsonObject, value: unknown) => void;
}

const ENVELOPE_CASES: EnvelopeCase[] = [
  {
    field: "payloadType",
    mutate: (envelope, value) => {
      envelope.payloadType = value as never;
    },
  },
  {
    field: "payload",
    mutate: (envelope, value) => {
      envelope.payload = value as never;
    },
  },
  {
    field: "signatures",
    mutate: (envelope, value) => {
      envelope.signatures = value as never;
    },
  },
  {
    field: "signatures[].keyid",
    mutate: (envelope, value) => {
      ((envelope.signatures as JsonObject[])[0]!).keyid = value as never;
    },
  },
  {
    field: "signatures[].sig",
    mutate: (envelope, value) => {
      ((envelope.signatures as JsonObject[])[0]!).sig = value as never;
    },
  },
];

for (const envelopeCase of ENVELOPE_CASES) {
  for (const [shape, value] of NON_STRINGS) {
    test(`signature envelope rejects ${envelopeCase.field} as ${shape}`, () => {
      const envelope = trustedEnvelope();
      envelopeCase.mutate(envelope, value);
      const decoded = decodeSignatureEnvelope(envelope);
      assert.equal(decoded.ok, false);
    });
  }
}

test("signature envelope: valid fixture decodes", () => {
  const decoded = decodeSignatureEnvelope(trustedEnvelope());
  assert.equal(decoded.ok, true);
  if (decoded.ok) {
    assert.equal(decoded.signatures.length, 1);
    assert.equal(decoded.signatures[0]!.sig.length, 64);
  }
});
