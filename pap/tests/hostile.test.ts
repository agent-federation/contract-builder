import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { domainHash } from "../src/digest.js";
import { jcs, parseJsonStrict } from "../src/json.js";
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
  return JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "unsigned-valid.json"), "utf8"),
  );
}

function verify(
  dir: string,
  extra: string[] = [],
): { status: number; stdout: string; stderr: string } {
  return runPap(["verify", ".", "--format", "json", "--now", NOW, ...extra], dir);
}

/** Write a valid envelope wrapped in 70 levels of nesting, over the JSON limit. */
function writeDeepEnvelope(dir: string, name: string): void {
  const trusted = readFileSync(path.join(fixtures, "signatures", "trusted.dsse.json"), "utf8");
  let nested = trusted;
  for (let index = 0; index < 70; index += 1) nested = `{"a":${nested}}`;
  writeFileSync(path.join(dir, "signatures", name), nested);
}

function signaturePolicy(): any {
  return JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-required.json"), "utf8"),
  );
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
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
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
    report.dimensions.checks.results.find(
      (entry: any) => entry.checkId === "pap.check.relation-consistency/1",
    ).outcome,
    "NOT_EVALUATED",
  );
  assert.ok(
    report.limitations.some((limitation: any) => limitation.code === "pap.package.limit-exceeded"),
  );
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
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
});

test("a deep-nesting signature envelope is a limit, not envelope-invalid", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  writeDeepEnvelope(dir, "deep.dsse.json");
  const file = writePolicy("policy.json", signaturePolicy());
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 2, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.integrity.package, "PASS");
  assert.equal(report.dimensions.signature.validity, "NOT_EVALUATED");
  assert.equal(report.dimensions.trust.signerIdentity, "NOT_EVALUATED");
  assert.equal(report.dimensions.trust.policyDecision, "NOT_EVALUATED");
  assert.equal(report.coverage.full, false);
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
  assert.ok(
    !report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.signature.envelope-invalid",
    ),
  );
  assert.ok(
    report.limitations.some((limitation: any) => limitation.code === "pap.package.limit-exceeded"),
  );
});

test("an oversized signature envelope is a limit, not envelope-invalid", () => {
  const dir = tempPackage();
  cpSync(path.join(fixtures, "signatures"), path.join(dir, "signatures"), { recursive: true });
  const policy = signaturePolicy();
  policy.id = "policy-envelope-bytes";
  policy.limits = { fileBytes: 1_024 };
  const file = writePolicy("policy.json", policy);
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 2, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.integrity.package, "PASS");
  assert.equal(report.dimensions.signature.validity, "NOT_EVALUATED");
  assert.equal(report.dimensions.trust.signerIdentity, "NOT_EVALUATED");
  assert.equal(report.dimensions.trust.policyDecision, "NOT_EVALUATED");
  assert.equal(report.coverage.full, false);
  assert.equal(report.effectiveLimits.fileBytes, 1_024);
  const limit = report.diagnostics.find(
    (diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded",
  );
  assert.ok(limit);
  assert.match(
    limit.message,
    /^signature envelope exceeds the configured byte limit: /,
    "the operator-facing limit message must name a signature envelope, not a declared file",
  );
  assert.ok(
    !report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.signature.envelope-invalid",
    ),
  );
});

test("a structurally malformed envelope keeps the INVALID path", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  const trusted = JSON.parse(
    readFileSync(path.join(fixtures, "signatures", "trusted.dsse.json"), "utf8"),
  );
  trusted.signatures[0].sig = "AAAA";
  writeFileSync(path.join(dir, "signatures", "malformed.dsse.json"), JSON.stringify(trusted));
  const file = writePolicy("policy.json", signaturePolicy());
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.dimensions.signature.validity, "INVALID");
  assert.ok(
    report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.signature.envelope-invalid",
    ),
  );
  assert.ok(
    !report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
});

test("a limit on one envelope does not mask an evaluated INVALID envelope", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  cpSync(
    path.join(fixtures, "signatures", "invalid.dsse.json"),
    path.join(dir, "signatures", "a-invalid.dsse.json"),
  );
  writeDeepEnvelope(dir, "b-deep.dsse.json");
  const file = writePolicy("policy.json", signaturePolicy());
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.dimensions.signature.validity, "INVALID");
  assert.equal(report.coverage.full, false);
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.signature.invalid"),
  );
});

test("a limit on one envelope does not mask a rejected signer", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  cpSync(
    path.join(fixtures, "signatures", "unknown.dsse.json"),
    path.join(dir, "signatures", "a-unknown.dsse.json"),
  );
  writeDeepEnvelope(dir, "b-deep.dsse.json");
  const file = writePolicy("policy.json", signaturePolicy());
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 3, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "UNTRUSTED");
  assert.equal(report.dimensions.trust.signerIdentity, "UNKNOWN");
  assert.equal(report.dimensions.trust.policyDecision, "REJECTED");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
});

test("a limit on one envelope does not mask a valid signature", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  cpSync(
    path.join(fixtures, "signatures", "trusted.dsse.json"),
    path.join(dir, "signatures", "a-trusted.dsse.json"),
  );
  writeDeepEnvelope(dir, "b-deep.dsse.json");
  const file = writePolicy("policy.json", signaturePolicy());
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 2, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.signature.validity, "VALID");
  assert.equal(report.dimensions.trust.signerIdentity, "TRUSTED");
  assert.equal(report.dimensions.trust.policyDecision, "ACCEPTED");
  assert.equal(report.coverage.full, false);
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
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
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.signature.invalid"),
  );
});

test("a producer report that mimics a verifier record is invalid", () => {
  const dir = tempPackage();
  const report = JSON.parse(readFileSync(path.join(dir, "claims", "producer-report.json"), "utf8"));
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
  assert.ok(
    parsed.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.claims.spoofed-result"),
  );
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
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.symlink"),
  );
});

test("a nested package manifest is rejected", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "nested"));
  writeFileSync(path.join(dir, "nested/assurance-package.json"), "{}\n");
  const result = verify(dir);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(
    report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.package.manifest-self-reference",
    ),
  );
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
  assert.ok(
    report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.package.manifest-self-reference",
    ),
  );
});

test("directory enumeration has a bounded entry budget", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "notes"));
  for (let index = 0; index < 1_100; index += 1) {
    writeFileSync(path.join(dir, "notes", `entry-${index}.txt`), "x");
  }
  const policy = unsignedPolicy();
  policy.id = "policy-traversal-budget";
  policy.limits = { payloadFiles: 100 };
  const file = writePolicy("policy.json", policy);
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.coverage.full, false);
  assert.equal(report.dimensions.integrity.package, "PASS");
  const scan = report.diagnostics.filter(
    (diagnostic: any) => diagnostic.code === "pap.package.undeclared-scan-incomplete",
  );
  assert.deepEqual(
    scan.map((diagnostic: any) => diagnostic.severity),
    ["warning"],
  );
  assert.ok(scan.every((diagnostic: any) => diagnostic.scope === "package"));
  assert.ok(
    report.limitations.some(
      (limitation: any) => limitation.code === "pap.package.undeclared-scan-incomplete",
    ),
  );
  assert.ok(
    !report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
  assert.ok(!report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.io"));
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

test("a symlinked signature directory outside the package is not enumerated", () => {
  const dir = tempPackage();
  const outside = mkdtempSync(path.join(tmpdir(), "pap-signatures-outside-"));
  try {
    writeFileSync(path.join(outside, "evil.dsse.json"), "{}\n");
    writeFileSync(path.join(outside, "readme.txt"), "external\n");
    symlinkSync(outside, path.join(dir, "signatures"));
    const policy = JSON.parse(
      readFileSync(path.join(fixtures, "trust-policy", "signature-optional.json"), "utf8"),
    );
    const file = writePolicy("policy.json", policy);
    const result = verify(dir, ["--trust-policy", file]);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.dimensions.integrity.package, "FAIL");
    assert.equal(report.dimensions.signature.signatures, undefined);
    const symlink = report.diagnostics.find(
      (diagnostic: any) => diagnostic.code === "pap.package.symlink",
    );
    assert.ok(symlink, "the symlinked directory must be reported as a package symlink");
    assert.equal(symlink.scope, "signatures");
    assert.equal(symlink.severity, "error");
    assert.ok(
      !result.stdout.includes("evil.dsse.json"),
      "a name outside the package must not be reported",
    );
    assert.ok(
      !result.stdout.includes("readme.txt"),
      "a name outside the package must not be reported",
    );
    assert.ok(
      !report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.signature.absent"),
      "a refused discovery is not a legitimately unsigned package",
    );
    assert.ok(
      !report.limitations.some((limitation: any) => limitation.code === "pap.signature.absent"),
      "the absence limitation must not survive a discovery failure",
    );
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test("a dangling signatures symlink fails closed as pap.package.symlink", () => {
  const dir = tempPackage();
  symlinkSync(path.join(dir, "does-not-exist"), path.join(dir, "signatures"));
  const policy = JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "signature-optional.json"), "utf8"),
  );
  const result = verify(dir, ["--trust-policy", writePolicy("policy.json", policy)]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  const symlink = report.diagnostics.find(
    (diagnostic: any) => diagnostic.code === "pap.package.symlink",
  );
  assert.ok(symlink, "a dangling signatures symlink must be reported as a symlink");
  assert.equal(symlink.scope, "signatures");
  assert.equal(symlink.severity, "error");
  assert.ok(
    !report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.signature.absent"),
    "a dangling symlink must not be reported as legitimately unsigned",
  );
});

test("inspect reports structure without producing a verdict", () => {
  const result = runPap(["inspect", ".", "--format", "json"], base);
  assert.equal(result.status, 0);
  const document = JSON.parse(result.stdout);
  assert.equal(document.inspection, "COMPLETE");
  assert.equal(
    document.package.identity,
    "sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020",
  );
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
  const result = runPap(
    ["explain", ".", "--check", "pap.check.unknown/1", "--format", "json"],
    dir,
  );
  assert.equal(result.status, 4);
  const document = JSON.parse(result.stdout);
  assert.equal(document.checkRecord, null);
  assert.ok(
    document.limitations.some((limitation: any) => limitation.code === "pap.check.unsupported"),
  );
});

test("verify never reads stdin and does not require HOME or a producer runtime", () => {
  const result = runPap(["verify", ".", "--format", "json", "--now", NOW], base);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
});

test("the strict parser treats __proto__ as an own member", () => {
  const bytes = new TextEncoder().encode('{"__proto__":{"smuggled":1},"a":1}');
  const value = parseJsonStrict(bytes, { nesting: 8, stringBytes: 1024 });
  assert.equal(Object.getPrototypeOf(value), null);
  assert.deepEqual(Object.keys(value as object).sort(), ["__proto__", "a"]);
  assert.equal(jcs(value), '{"__proto__":{"smuggled":1},"a":1}');
  assert.equal(({} as { smuggled?: number }).smuggled, undefined);
});

function manifestWithMember(dir: string, member: string, value: unknown): void {
  const manifestObj = manifest(dir);
  const text = JSON.stringify(manifestObj, null, 2);
  const body = text.slice(0, text.lastIndexOf("}")).trimEnd();
  writeFileSync(
    path.join(dir, "assurance-package.json"),
    `${body},\n  ${JSON.stringify(member)}: ${JSON.stringify(value)}\n}\n`,
  );
}

test("a __proto__ manifest member cannot collide with the package identity", () => {
  const dir = tempPackage();
  const baseline = JSON.parse(runPap(["inspect", ".", "--format", "json"], base).stdout);
  manifestWithMember(dir, "__proto__", { papVersion: "0.1" });
  const inspection = JSON.parse(runPap(["inspect", ".", "--format", "json"], dir).stdout);
  assert.notEqual(inspection.package.identity, baseline.package.identity);
  const result = verify(dir);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.unknown-field"),
  );
});

test("a required field present only under __proto__ is not accepted", () => {
  const dir = tempPackage();
  const value = manifest(dir);
  const papVersion = value.papVersion;
  delete value.papVersion;
  const text = JSON.stringify(value, null, 2);
  const body = text.slice(0, text.lastIndexOf("}")).trimEnd();
  writeFileSync(
    path.join(dir, "assurance-package.json"),
    `${body},\n  "__proto__": ${JSON.stringify({ papVersion })}\n}\n`,
  );
  const result = verify(dir);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(
    report.diagnostics.some(
      (diagnostic: any) =>
        diagnostic.code === "pap.package.schema" && diagnostic.scope === "$.papVersion",
    ),
  );
  assert.equal(report.package.papVersion, null);
});

test("claim data under __proto__ cannot change a check outcome", () => {
  const dir = tempPackage();
  const provenance = JSON.parse(readFileSync(path.join(dir, "claims", "provenance.json"), "utf8"));
  const bindings = provenance.bindings;
  delete provenance.bindings;
  const text = JSON.stringify(provenance);
  const raw = `${text.slice(0, -1)},"__proto__":{"bindings":${JSON.stringify(bindings)}}}`;
  const bytes = Buffer.from(raw);
  writeFileSync(path.join(dir, "claims", "provenance.json"), bytes);
  const value = manifest(dir);
  value.claims.provenance.digest = domainHash("pap.claims.v1", bytes);
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.notEqual(report.verdict, "PASS");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.claim-invalid"),
  );
});

test("an array-valued policy enum fails closed with exit 64 and no report", () => {
  const dir = tempPackage();
  const policy = unsignedPolicy();
  policy.id = "policy-coerced-mode";
  policy.signature = { mode: ["required"], minimumValidSigners: 1 };
  const file = writePolicy("policy.json", policy);
  const result = verify(dir, ["--trust-policy", file]);
  assert.equal(result.status, 64, result.stdout);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("pap.trust.policy-invalid"));
  assert.ok(result.stderr.includes("signature.mode"));
});

test("an array-valued manifest extension kind is a structural schema defect", () => {
  const dir = tempPackage();
  const value = manifest(dir);
  value.build.extensions = [{ kind: ["profile"], id: "extension:evil", version: "1" }];
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(
    report.diagnostics.some(
      (diagnostic: any) =>
        diagnostic.code === "pap.package.schema" && diagnostic.scope === "$.build.extensions[0]",
    ),
  );
});

test("an array-valued claim outcome is rejected, not coerced", () => {
  const dir = tempPackage();
  const claim = JSON.parse(readFileSync(path.join(dir, "claims", "producer-report.json"), "utf8"));
  claim.claims[0].claimedOutcome = ["PASS"];
  setClaim(dir, "producerReport", "producer-report.json", claim);
  const result = verify(dir);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.notEqual(report.verdict, "PASS");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.claim-invalid"),
  );
  assert.equal(
    report.dimensions.claims === undefined ? undefined : report.dimensions.claims,
    undefined,
  );
});

test("a duplicate declared source path fails package integrity", () => {
  const dir = tempPackage();
  const value = manifest(dir);
  value.sources.push({ ...value.sources[0], id: "SRC-ACME-POLICY-DUPLICATE" });
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.path-duplicate"),
  );
});

test("a duplicate declared input path fails package integrity", () => {
  const dir = tempPackage();
  const value = manifest(dir);
  value.inputs.push({ ...value.inputs[0], id: "input:project-duplicate" });
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.path-duplicate"),
  );
});

test("a duplicate declared claim path across kinds fails package integrity", () => {
  const dir = tempPackage();
  const value = manifest(dir);
  value.claims.relations = { ...value.claims.provenance };
  writeManifest(dir, value);
  const result = verify(dir);
  assert.equal(result.status, 1, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.path-duplicate"),
  );
});
