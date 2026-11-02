import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { domainHash } from "../src/digest.js";
import { fixtures, runPap } from "./support.js";

const NOW = "2026-11-02T00:00:00Z";
const base = path.join(fixtures, "base");

function tempPackage(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-hostile-"));
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
  valueManifest.claims[kind].digest = domainHash("pap.claims.v1", bytes);
  writeManifest(dir, valueManifest);
}

function writePolicy(name: string, value: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-policy-"));
  const file = path.join(dir, name);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function unsignedPolicy(): any {
  return JSON.parse(readFileSync(path.join(fixtures, "trust-policy", "unsigned-valid.json"), "utf8"));
}

function verify(dir: string, extra: string[] = []): { status: number; stdout: string; stderr: string } {
  return runPap(["verify", ".", "--format", "json", "--now", NOW, ...extra], dir);
}

test("manifest JSON nesting limit yields a FAIL report, not a crash", () => {
  const dir = tempPackage();
  const value = manifest(dir);
  let deep: any = 1;
  for (let index = 0; index < 70; index += 1) deep = { a: deep };
  value.extra = deep;
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.package.identity, null);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"));
});

test("claim JSON nesting limit stops the dependent check but not package integrity", () => {
  const dir = tempPackage();
  let deep: any = 1;
  for (let index = 0; index < 70; index += 1) deep = { a: deep };
  const nested = { papClaimsVersion: "0.1", entities: [], relations: [], edges: [], extra: deep };
  const bytes = Buffer.from(JSON.stringify(nested));
  writeFileSync(path.join(dir, "claims", "relations.json"), bytes);
  const value = manifest(dir);
  value.claims.relations.digest = domainHash("pap.claims.v1", bytes);
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "PASS");
  assert.equal(
    report.dimensions.checks.results.find((entry: any) => entry.checkId === "pap.check.relation-consistency/1").outcome,
    "NOT_EVALUATED",
  );
  assert.ok(report.limitations.some((limitation: any) => limitation.code === "pap.package.limit-exceeded"));
});

test("total payload byte limit is enforced and never yields PASS", () => {
  const dir = tempPackage();
  const policy = unsignedPolicy();
  policy.id = "policy-total-bytes";
  policy.limits = { totalPayloadBytes: 100 };
  const file = writePolicy("policy.json", policy);
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.effectiveLimits.totalPayloadBytes, 100);
  assert.equal(report.coverage.full, false);
});

test("signature envelope count limit reads none and leaves trust unevaluated", () => {
  const dir = tempPackage();
  const policy = unsignedPolicy();
  policy.id = "policy-envelope-limit";
  policy.signature = { mode: "optional" };
  policy.limits = { signatureEnvelopes: 2 };
  const file = writePolicy("policy.json", policy);
  const signatures = path.join(dir, "signatures");
  cpSync(path.join(fixtures, "signatures"), signatures, { recursive: true });
  const template = readFileSync(path.join(fixtures, "signatures", "trusted.dsse.json"));
  for (let index = 0; index < 3; index += 1) {
    writeFileSync(path.join(signatures, `extra-${index}.dsse.json`), template);
  }
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.signature.validity, "NOT_EVALUATED");
  assert.equal(report.dimensions.trust.signerIdentity, "NOT_EVALUATED");
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"));
});

test("a policy limit above the verifier default fails closed", () => {
  const dir = tempPackage();
  const policy = unsignedPolicy();
  policy.id = "policy-raised-limit";
  policy.limits = { fileBytes: 268_435_457 };
  const file = writePolicy("policy.json", policy);
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("pap.trust.policy-invalid"));
});

test("several limits combine without producing PASS", () => {
  const dir = tempPackage();
  const policy = unsignedPolicy();
  policy.id = "policy-two-limits";
  policy.limits = { fileBytes: 64, totalPayloadBytes: 100 };
  const file = writePolicy("policy.json", policy);
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.effectiveLimits.fileBytes, 64);
  assert.equal(report.effectiveLimits.totalPayloadBytes, 100);
});

test("Ed25519 non-canonical S is rejected", () => {
  const dir = tempPackage();
  cpSync(path.join(fixtures, "signatures"), path.join(dir, "signatures"), { recursive: true });
  const envelopeFile = path.join(dir, "signatures", "trusted.dsse.json");
  const envelope = JSON.parse(readFileSync(envelopeFile, "utf8"));
  const sig = Buffer.from(envelope.signatures[0].sig, "base64");
  const L = 7237005577332262213973186563042994240857116359379907606001950938285454250989n;
  let s = 0n;
  for (let index = 63; index >= 32; index -= 1) s = (s << 8n) | BigInt(sig[index] as number);
  s += L;
  const sBytes = Buffer.alloc(32);
  let rest = s;
  for (let index = 0; index < 32; index += 1) {
    sBytes[index] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  sBytes.copy(sig, 32);
  envelope.signatures[0].sig = sig.toString("base64");
  writeFileSync(envelopeFile, JSON.stringify(envelope));
  const policy = JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-required.json"), "utf8"),
  );
  const file = writePolicy("policy.json", policy);
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.signature.validity, "INVALID");
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.signature.invalid"));
});

test("a producer report that mimics a verifier record is invalid", () => {
  const dir = tempPackage();
  const report = JSON.parse(
    readFileSync(path.join(dir, "claims", "producer-report.json"), "utf8"),
  );
  report.claims[0].outcome = "PASS";
  delete report.claims[0].claimedOutcome;
  const bytes = Buffer.from(JSON.stringify(report));
  writeFileSync(path.join(dir, "claims", "producer-report.json"), bytes);
  const value = manifest(dir);
  value.claims.producerReport.digest = domainHash("pap.claims.v1", bytes);
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.dimensions.integrity.package, "FAIL");
  assert.ok(parsed.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.claims.spoofed-result"));
});

test("a symlinked parent path component is rejected", () => {
  const dir = tempPackage();
  rmSync(path.join(dir, "artifacts/ACME-SUPPLIER.draft.md"));
  mkdirSync(path.join(dir, "artifacts/real"));
  const content = Buffer.from("# inner\n");
  writeFileSync(path.join(dir, "artifacts/real/file.md"), content);
  symlinkSync("real", path.join(dir, "artifacts/linkdir"));
  const value = manifest(dir);
  value.artifacts[0].path = "artifacts/linkdir/file.md";
  value.artifacts[0].bytes = content.length;
  value.artifacts[0].digest = domainHash("pap.artifact.v1", content);
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.artifacts, "FAIL");
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.symlink"));
});

test("a nested package manifest is rejected", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "nested"));
  writeFileSync(path.join(dir, "nested/assurance-package.json"), "{}\n");
  const result = verify(dir);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.manifest-self-reference"));
});

test("a declared nested package manifest is a structural failure", () => {
  const dir = tempPackage();
  writeFileSync(path.join(dir, "artifacts/assurance-package.json"), "{}\n");
  const value = manifest(dir);
  value.artifacts[0].path = "artifacts/assurance-package.json";
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.equal(report.dimensions.integrity.artifacts, "NOT_EVALUATED");
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.manifest-self-reference"));
});

test("directory enumeration has a bounded entry budget", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "notes"));
  for (let index = 0; index < 1_100; index += 1) {
    writeFileSync(path.join(dir, "notes", `entry-${index}.txt`), "x");
  }
  const policy = unsignedPolicy();
  policy.id = "policy-traversal-budget";
  policy.limits = { payloadFiles: 1 };
  const file = writePolicy("policy.json", policy);
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.coverage.full, false);
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"));
});

test("an unreadable signature directory fails the package", () => {
  const dir = tempPackage();
  writeFileSync(path.join(dir, "signatures"), "not a directory");
  const policy = JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-optional.json"), "utf8"),
  );
  const file = writePolicy("policy.json", policy);
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.io"));
});

test("inspect reports structure without producing a verdict", () => {
  const result = runPap(["inspect", ".", "--format", "json"], base);
  assert.equal(result.status, 0);
  const document = JSON.parse(result.stdout);
  assert.equal(document.inspection, "COMPLETE");
  assert.equal(document.package.identity, "sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020");
  assert.ok(!result.stdout.includes('"verdict"'));
  const text = runPap(["inspect", "."], base);
  assert.ok(text.stdout.startsWith("INSPECTION: COMPLETE"));
  assert.ok(text.stdout.includes("NOT A VERIFICATION"));
  assert.ok(!text.stdout.includes("VERDICT:"));
});

test("explain reports an unsupported declared check with exit 4", () => {
  const dir = tempPackage();
  const value = manifest(dir);
  value.checkSpecs.push({ id: "pap.check.unknown/1", version: "1", required: true });
  writeManifest(dir, value);
  const result = runPap(["explain", ".", "--check", "pap.check.unknown/1", "--format", "json"], dir);
  assert.equal(result.status, 4);
  const document = JSON.parse(result.stdout);
  assert.equal(document.checkRecord, null);
  assert.ok(document.limitations.some((limitation: any) => limitation.code === "pap.check.unsupported"));
});

test("verify never reads stdin and does not require HOME or a producer runtime", () => {
  const result = runPap(["verify", ".", "--format", "json", "--now", NOW], base);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});
