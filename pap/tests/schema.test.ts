import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import { domainHash } from "../src/digest.js";
import { fixtures, root, runPap } from "./support.js";

const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => any;
const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
const schemaDir = path.join(root, "schemas");
for (const name of readdirSync(schemaDir).filter((file) => file.endsWith(".schema.json"))) {
  ajv.addSchema(JSON.parse(readFileSync(path.join(schemaDir, name), "utf8")));
}

test("normative schemas compile", () => {
  for (const id of [
    "urn:pap:0.1:assurance-package",
    "urn:pap:0.1:trust-policy",
    "urn:pap:0.1:verification-report",
    "urn:pap:0.1:check-record",
    "urn:pap:0.1:claims-provenance",
    "urn:pap:0.1:claims-relations",
    "urn:pap:0.1:producer-report",
    "urn:pap:0.1:claims-reviews",
  ]) {
    assert.ok(ajv.getSchema(id), `schema ${id} is not registered`);
  }
});

test("Appendix F manifest and claims validate", () => {
  const base = path.join(fixtures, "base");
  const manifest = JSON.parse(readFileSync(path.join(base, "assurance-package.json"), "utf8"));
  const validateManifest = ajv.getSchema("urn:pap:0.1:assurance-package");
  assert.equal(validateManifest(manifest), true, JSON.stringify(validateManifest.errors));
  for (const [name, id] of [
    ["provenance", "urn:pap:0.1:claims-provenance"],
    ["relations", "urn:pap:0.1:claims-relations"],
    ["producer-report", "urn:pap:0.1:producer-report"],
  ] as const) {
    const validate = ajv.getSchema(id);
    const value = JSON.parse(readFileSync(path.join(base, "claims", `${name}.json`), "utf8"));
    assert.equal(validate(value), true, `${name}: ${JSON.stringify(validate.errors)}`);
  }
});

/**
 * Policy fixtures that must fail Appendix B. `invalid.json` violates a field
 * invariant; `strict-enum.json` carries a non-string `signature.mode` and is the
 * F85 fail-closed fixture. Every other policy fixture must validate.
 */
const INTENTIONALLY_INVALID_POLICIES = new Set(["invalid.json", "strict-enum.json"]);

test("trust policy fixtures validate except the intentionally invalid fixtures", () => {
  const validate = ajv.getSchema("urn:pap:0.1:trust-policy");
  for (const name of readdirSync(path.join(fixtures, "trust-policy"))) {
    const value = JSON.parse(readFileSync(path.join(fixtures, "trust-policy", name), "utf8"));
    const actual = validate(value);
    if (INTENTIONALLY_INVALID_POLICIES.has(name)) {
      assert.equal(actual, false, `${name} must fail Appendix B`);
    } else {
      assert.equal(actual, true, `${name}: ${JSON.stringify(validate.errors)}`);
    }
  }
});

test("the report for hostile claim values validates against Appendix C", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-schema-hostile-"));
  cpSync(path.join(fixtures, "base"), dir, { recursive: true });
  const claim = JSON.parse(readFileSync(path.join(dir, "claims", "producer-report.json"), "utf8"));
  claim.claims[0].claimedOutcome = ["PASS"];
  const bytes = Buffer.from(JSON.stringify(claim));
  writeFileSync(path.join(dir, "claims", "producer-report.json"), bytes);
  const manifestPath = path.join(dir, "assurance-package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.claims.producerReport.digest = domainHash("pap.claims.v1", bytes);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const result = runPap(["verify", ".", "--format", "json", "--now", "2026-11-02T00:00:00Z"], dir);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  const validate = ajv.getSchema("urn:pap:0.1:verification-report");
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});

test("the report for hostile envelope values validates against Appendix C", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-schema-hostile-envelope-"));
  cpSync(path.join(fixtures, "base"), dir, { recursive: true });
  mkdirSync(path.join(dir, "signatures"));
  const envelope = JSON.parse(
    readFileSync(path.join(fixtures, "signatures", "trusted.dsse.json"), "utf8"),
  );
  envelope.payloadType = ["application/vnd.pap.manifest.v0.1+json"];
  writeFileSync(path.join(dir, "signatures", "hostile.dsse.json"), JSON.stringify(envelope));
  const policyDir = mkdtempSync(path.join(tmpdir(), "pap-schema-policy-"));
  const policyPath = path.join(policyDir, "policy.json");
  writeFileSync(
    policyPath,
    readFileSync(path.join(fixtures, "trust-policy", "signature-required.json")),
  );
  const result = runPap(
    [
      "verify",
      ".",
      "--format",
      "json",
      "--now",
      "2026-11-02T00:00:00Z",
      "--trust-policy",
      policyPath,
    ],
    dir,
  );
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.signature.validity, "INVALID");
  const validate = ajv.getSchema("urn:pap:0.1:verification-report");
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});
