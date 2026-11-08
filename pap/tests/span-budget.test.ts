import { after, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { domainHash } from "../src/digest.js";
import { fixtures, runPap } from "./support.js";
import { cleanupTempDirs, tempDir } from "./temp.js";

const NOW = "2026-11-02T00:00:00Z";
const base = path.join(fixtures, "base");

after(cleanupTempDirs);

function tempPackage(): string {
  const dir = tempDir("span-");
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
  const file = path.join(tempDir("span-policy-"), "policy.json");
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}
function unsignedPolicy(): any {
  return JSON.parse(
    readFileSync(path.join(fixtures, "trust-policy", "unsigned-valid.json"), "utf8"),
  );
}
function setProvenance(
  dir: string,
  sourceBytes: Buffer,
  bindings: { start: number; end: number }[],
): void {
  const value = manifest(dir);
  value.sources[0].digest = domainHash("pap.source.raw.v1", sourceBytes);
  writeFileSync(path.join(dir, "sources/acme-policy.md"), sourceBytes);
  const claim = {
    papClaimsVersion: "0.1",
    bindings: bindings.map((range, index) => ({
      id: `binding:${index}`,
      entityId: `REQ-${index}`,
      sourceId: "SRC-ACME-POLICY",
      locator: { kind: "byte-range", start: range.start, end: range.end },
      quote: {
        normalization: "none",
        digest: domainHash("pap.quote.v1", sourceBytes.subarray(range.start, range.end)),
      },
    })),
  };
  const bytes = Buffer.from(JSON.stringify(claim));
  writeFileSync(path.join(dir, "claims/provenance.json"), bytes);
  value.claims.provenance.digest = domainHash("pap.claims.v1", bytes);
  writeManifest(dir, value);
}
function verify(dir: string, policy: string): { status: number; stdout: string; stderr: string } {
  return runPap(["verify", ".", "--trust-policy", policy, "--format", "json", "--now", NOW], dir);
}

test("identical source ranges are read once even when repeated many times", () => {
  const dir = tempPackage();
  const source = Buffer.alloc(2 * 1024 * 1024, 0x61);
  setProvenance(
    dir,
    source,
    Array.from({ length: 200 }, () => ({ start: 0, end: source.length })),
  );
  const policy = unsignedPolicy();
  policy.id = "policy-span-dedup";
  policy.limits = { totalPayloadBytes: 5 * 1024 * 1024 };
  const result = verify(dir, writePolicy(policy));
  assert.equal(result.status, 0, result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "PASS");
  assert.equal(
    report.dimensions.checks.results.find(
      (entry: any) => entry.checkId === "pap.check.source-quote/1",
    ).outcome,
    "PASS",
  );
});

test("overlapping non-identical ranges are charged to the total payload budget", () => {
  const dir = tempPackage();
  const source = Buffer.alloc(2 * 1024 * 1024, 0x61);
  setProvenance(dir, source, [
    { start: 0, end: 1_572_864 },
    { start: 524_288, end: 2_097_152 },
  ]);
  const policy = unsignedPolicy();
  policy.id = "policy-span-overlap";
  policy.limits = { totalPayloadBytes: 5 * 1024 * 1024 };
  const result = verify(dir, writePolicy(policy));
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(
    report.dimensions.checks.results.find(
      (entry: any) => entry.checkId === "pap.check.source-quote/1",
    ).outcome,
    "NOT_EVALUATED",
  );
  assert.ok(
    report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
  );
});
