import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtures, runPap } from "./support.js";

/**
 * S3 boundary regressions (ODR-PAP-006 §2 I1–I5, design note §6 S3).
 *
 * `verify.ts` derives the required dimensions (I1/E2), computes coverage from
 * that same set (I4) and hands the fold one normalized `VerdictContext`. These
 * tests pin the boundary outcomes the design note requires: quorum unmet,
 * explicit rejection, stale policy with full coverage, empty required set,
 * manifest-level limit and post-manifest limit. The quorum case itself lives in
 * `branches.test.ts` because it needs a generated second signer.
 */

const NOW = "2026-11-02T00:00:00Z";
const base = path.join(fixtures, "base");

const suite = JSON.parse(readFileSync(path.join(fixtures, "cases.json"), "utf8")) as {
  cases: { caseId: string; command: string[] }[];
};

function fixtureReport(caseId: string): { status: number; report: any } {
  const entry = suite.cases.find((candidate) => candidate.caseId === caseId);
  assert.ok(entry, `${caseId} is missing from the corpus`);
  const result = runPap(entry.command, path.join(fixtures, caseId));
  assert.equal(result.stderr, "", `${caseId}: ${result.stderr}`);
  return { status: result.status, report: JSON.parse(result.stdout) };
}

function tempPackage(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-verdict-wiring-"));
  cpSync(base, dir, { recursive: true });
  return dir;
}

function writePolicy(value: unknown): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "pap-verdict-policy-")), "policy.json");
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function fixturePolicy(name: string): any {
  return JSON.parse(readFileSync(path.join(fixtures, "trust-policy", name), "utf8"));
}

function verify(dir: string, policy: string): { status: number; report: any } {
  const result = runPap(
    ["verify", ".", "--trust-policy", policy, "--format", "json", "--now", NOW],
    dir,
  );
  assert.equal(result.stderr, "", result.stderr);
  return { status: result.status, report: JSON.parse(result.stdout) };
}

test("S3 derivation: mode required adds signature/trust to the reported requirement set", () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  writeFileSync(
    path.join(dir, "signatures", "trusted.dsse.json"),
    readFileSync(path.join(fixtures, "signatures", "trusted.dsse.json")),
  );
  const policy = fixturePolicy("signature-required.json");
  policy.id = "policy-verdict-wiring-required";
  // Deliberately omit the derived dimensions: I1 says the operator list can
  // only add, so this must still evaluate the signature and trust domains.
  policy.requiredDimensions = ["integrity"];
  const { status, report } = verify(dir, writePolicy(policy));
  assert.equal(status, 0, JSON.stringify(report.diagnostics));
  assert.equal(report.verdict, "PASS");
  assert.deepEqual(report.coverage.requiredDimensions, [
    "integrity",
    "sources",
    "signature",
    "trust",
    "checks",
  ]);
  assert.equal(report.coverage.full, true);
  assert.equal(report.dimensions.trust.policyDecision, "ACCEPTED");
});

test("S3 derivation: humanReview.required adds the humanReview dimension", () => {
  const policy = fixturePolicy("review-required.json");
  policy.id = "policy-verdict-wiring-review";
  policy.requiredDimensions = ["integrity", "sources", "checks"];
  const result = runPap(
    ["verify", ".", "--trust-policy", writePolicy(policy), "--format", "json", "--now", NOW],
    path.join(fixtures, "F55-review-approved"),
  );
  assert.equal(result.stderr, "", result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(result.status, 0, JSON.stringify(report.diagnostics));
  assert.equal(report.verdict, "PASS");
  assert.equal(report.dimensions.humanReview.status, "PASS");
  assert.ok(report.coverage.requiredDimensions.includes("humanReview"));
  assert.equal(report.coverage.full, true);
});

test("S3 boundary: explicit REJECTED stays UNTRUSTED when trust is not required", () => {
  const { status, report } = fixtureReport("F56-optional-mixed");
  assert.equal(status, 3);
  assert.equal(report.verdict, "UNTRUSTED");
  assert.equal(report.dimensions.trust.policyDecision, "REJECTED");
  assert.ok(!report.coverage.requiredDimensions.includes("trust"));
  assert.equal(report.coverage.full, true, "the required work was evaluated");
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.signature.invalid"));
});

test("S3 boundary: stale policy with all required work evaluated keeps coverage.full true", () => {
  const { status, report } = fixtureReport("F49-policy-one-second-after");
  assert.equal(status, 2);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.trust.policyDecision, "STALE");
  assert.equal(report.coverage.full, true);
  assert.equal(report.coverage.dimensionsEvaluated, report.coverage.requiredDimensions.length);
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.trust.policy-stale"));
});

test("S3 boundary: empty required set is INCOMPLETE with partial coverage", () => {
  const { status, report } = fixtureReport("F54-all-optional");
  assert.equal(status, 2);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.deepEqual(report.coverage.requiredDimensions, []);
  assert.equal(report.coverage.full, false);
  assert.ok(
    report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.package.empty-check-specs",
    ),
  );
});

test("S3 boundary: a manifest-level limit is FAIL, not INCOMPLETE", () => {
  const { status, report } = fixtureReport("F35-manifest-limit");
  assert.equal(status, 1);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.equal(report.package.identity, null);
  assert.equal(report.coverage.full, false);
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"));
});

test("S3 boundary: a post-manifest limit is INCOMPLETE, never FAIL", () => {
  const { status, report } = fixtureReport("F52-lowered-limits");
  assert.equal(status, 2);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.integrity.package, "PASS");
  assert.equal(report.dimensions.integrity.artifacts, "NOT_EVALUATED");
  assert.equal(report.coverage.full, false);
  assert.ok(report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"));
});

test("I5: each S3 boundary non-PASS verdict carries a diagnostic or limitation", () => {
  for (const caseId of [
    "F56-optional-mixed",
    "F49-policy-one-second-after",
    "F54-all-optional",
    "F35-manifest-limit",
    "F52-lowered-limits",
  ]) {
    const { report } = fixtureReport(caseId);
    assert.notEqual(report.verdict, "PASS", caseId);
    assert.ok(
      report.diagnostics.length + report.limitations.length > 0,
      `${caseId}: a non-PASS verdict must name a cause`,
    );
  }
});
