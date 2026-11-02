import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
import { fixtures, root } from "./support.js";

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

test("trust policy fixtures validate except the intentionally invalid one", () => {
  const validate = ajv.getSchema("urn:pap:0.1:trust-policy");
  for (const name of readdirSync(path.join(fixtures, "trust-policy"))) {
    const value = JSON.parse(readFileSync(path.join(fixtures, "trust-policy", name), "utf8"));
    const actual = validate(value);
    if (name === "invalid.json") {
      assert.equal(actual, false, "invalid.json must fail Appendix B");
    } else {
      assert.equal(actual, true, `${name}: ${JSON.stringify(validate.errors)}`);
    }
  }
});
