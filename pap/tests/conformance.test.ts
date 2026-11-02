import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => any;
import { jcs } from "../src/json.js";
import {
  BASE_IDENTITY,
  fixtures,
  root,
  runPap,
  sentinelLog,
} from "./support.js";

interface CaseExpect {
  exitCode?: number;
  verdict?: string;
  dimensions?: Record<string, unknown>;
  diagnosticCodes?: string[];
  diagnosticCodesExact?: boolean;
  limitationCodes?: string[];
  coverageFull?: boolean;
  effectiveLimits?: Record<string, number>;
  identityRelations?: { packageIdentity?: "equals-base" | "differs-from-base" | null };
  humanReviewBasis?: string;
  checkOutcome?: string;
}

interface CaseEntry {
  caseId: string;
  command: string[];
  expect?: CaseExpect;
  noReport?: boolean;
  stderrCodes?: string[];
  document?: "inspection" | "explanation";
}

const casesFile = path.join(fixtures, "cases.json");
const suite = JSON.parse(readFileSync(casesFile, "utf8")) as {
  fixtureSetVersion: string;
  baseCase: string;
  cases: CaseEntry[];
};

const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
for (const name of [
  "check-record",
  "verification-report",
  "manifest",
  "trust-policy",
  "claims-provenance",
  "claims-relations",
  "claims-producer-report",
  "claims-reviews",
]) {
  ajv.addSchema(JSON.parse(readFileSync(path.join(root, "schemas", `${name}.schema.json`), "utf8")));
}
const validateReport = ajv.getSchema("urn:pap:0.1:verification-report");
assert.ok(validateReport);

const statusMap: Record<string, (report: any) => string> = {
  "integrity.package": (report) => report.dimensions.integrity.package,
  "integrity.artifacts": (report) => report.dimensions.integrity.artifacts,
  "sources.integrity": (report) => report.dimensions.sources.integrity,
  "sources.availability": (report) => report.dimensions.sources.availability,
  "signature.validity": (report) => report.dimensions.signature.validity,
  "trust.signerIdentity": (report) => report.dimensions.trust.signerIdentity,
  "trust.policyDecision": (report) => report.dimensions.trust.policyDecision,
  "trust.checkerRecognition": (report) => report.dimensions.trust.checkerRecognition,
  "trust.profileRecognition": (report) => report.dimensions.trust.profileRecognition,
  "humanReview.status": (report) => report.dimensions.humanReview.status,
  "semanticTruth": (report) => report.dimensions.semanticTruth,
  "legalEnforceability": (report) => report.dimensions.legalEnforceability,
};

function compareDimensions(report: any, expected: Record<string, unknown> | undefined): void {
  if (expected === undefined) return;
  for (const [key, value] of Object.entries(expected)) {
    if (key === "checks") {
      for (const [checkId, outcome] of Object.entries(value as Record<string, string>)) {
        const result = report.dimensions.checks.results.find(
          (entry: { checkId: string }) => entry.checkId === checkId,
        );
        assert.ok(result, `${checkId} missing from dimensions.checks.results`);
        assert.equal(result.outcome, outcome, `${checkId} outcome`);
      }
      continue;
    }
    const getter = statusMap[key];
    assert.ok(getter, `unknown dimension assertion ${key}`);
    assert.equal(getter(report), value, `${key} status`);
  }
}

function checkJsonContract(stdout: string): any {
  assert.ok(stdout.endsWith("\n"), "JSON output must end with one LF");
  assert.ok(!stdout.endsWith("\n\n"), "JSON output must have exactly one trailing LF");
  const text = stdout.slice(0, -1);
  const parsed = JSON.parse(text);
  assert.equal(jcs(parsed), text, "stdout must be JCS canonical JSON");
  return parsed;
}

function assertNoReport(result: { status: number; stdout: string; stderr: string }, entry: CaseEntry): void {
  assert.equal(result.stdout, "", "no report may be written to stdout");
  assert.notEqual(result.status, 0, "no-report case must fail");
  for (const code of entry.stderrCodes ?? []) {
    assert.ok(result.stderr.includes(`pap: ${code}:`), `stderr must contain ${code}: ${result.stderr}`);
  }
}

for (const entry of suite.cases) {
  test(`${entry.caseId}: conformance`, () => {
    const cwd = path.join(fixtures, entry.caseId);
    const first = runPap(entry.command, cwd);
    if (entry.noReport) {
      assertNoReport(first, entry);
      return;
    }
    assert.equal(first.stderr, "", "stderr must be empty on a report run");
    const document = checkJsonContract(first.stdout);
    if (entry.document === "explanation") {
      assert.equal(first.status, entry.expect?.exitCode);
      assert.equal(document.explanationVersion, "0.1");
      assert.equal(document.checkRecord?.outcome, entry.expect?.checkOutcome);
      return;
    }
    assert.equal(first.status, entry.expect?.exitCode, "exit code");
    assert.equal(document.verdict, entry.expect?.verdict, "verdict");
    assert.equal(validateReport(document), true, JSON.stringify(validateReport.errors));
    compareDimensions(document, entry.expect?.dimensions);
    const codes = new Set(document.diagnostics.map((diagnostic: { code: string }) => diagnostic.code));
    for (const code of entry.expect?.diagnosticCodes ?? []) {
      assert.ok(codes.has(code), `diagnostic ${code} missing (${[...codes].join(", ")})`);
    }
    if (entry.expect?.diagnosticCodesExact) {
      assert.deepEqual([...codes].sort(), [...(entry.expect.diagnosticCodes ?? [])].sort());
    }
    const limitations = new Set(
      document.limitations.map((limitation: { code: string }) => limitation.code),
    );
    for (const code of entry.expect?.limitationCodes ?? []) {
      assert.ok(limitations.has(code), `limitation ${code} missing`);
    }
    if (entry.expect?.coverageFull !== undefined) {
      assert.equal(document.coverage.full, entry.expect.coverageFull, "coverage.full");
    }
    for (const [name, value] of Object.entries(entry.expect?.effectiveLimits ?? {})) {
      assert.ok(document.effectiveLimits, "effectiveLimits missing");
      assert.equal(document.effectiveLimits[name], value, `effectiveLimits.${name}`);
    }
    const identityRelation = entry.expect?.identityRelations?.packageIdentity;
    if (identityRelation === "equals-base") {
      assert.equal(document.package.identity, BASE_IDENTITY);
    } else if (identityRelation === "differs-from-base") {
      assert.notEqual(document.package.identity, BASE_IDENTITY);
    } else if (identityRelation === null) {
      assert.equal(document.package.identity, null);
    }
    if (entry.expect?.humanReviewBasis !== undefined) {
      assert.equal(document.dimensions.humanReview.basis, entry.expect.humanReviewBasis);
    }

    // Every case runs twice with the same --now; the JSON document must match.
    const second = runPap(entry.command, cwd);
    assert.equal(second.status, first.status);
    assert.equal(second.stdout, first.stdout, "deterministic JSON output");
    assert.equal(second.stderr, first.stderr);
  });
}

test("F36: fixed clock yields identical verificationRecordIdentity", () => {
  const cwd = path.join(fixtures, "F36-determinism");
  const command = suite.cases.find((entry) => entry.caseId === "F36-determinism")?.command;
  assert.ok(command);
  const first = JSON.parse(runPap(command, cwd).stdout);
  const second = JSON.parse(runPap(command, cwd).stdout);
  assert.equal(first.identities.verificationRecordIdentity, second.identities.verificationRecordIdentity);
});

test("F55: humanReview PASS requires basis unbound-claim", () => {
  const cwd = path.join(fixtures, "F55-review-approved");
  const command = suite.cases.find((entry) => entry.caseId === "F55-review-approved")?.command;
  assert.ok(command);
  const report = JSON.parse(runPap(command, cwd).stdout);
  assert.equal(report.dimensions.humanReview.status, "PASS");
  assert.equal(report.dimensions.humanReview.basis, "unbound-claim");
  const negative = JSON.parse(JSON.stringify(report));
  delete negative.dimensions.humanReview.basis;
  assert.equal(validateReport(negative), false, "a PASS review without basis must be schema-invalid");
});

test("F01/F02: required text lines", () => {
  for (const caseId of ["F01-unchanged", "F02-artifact-byte"]) {
    const entry = suite.cases.find((candidate) => candidate.caseId === caseId);
    assert.ok(entry);
    const jsonCommand = entry.command;
    const textCommand = jsonCommand.flatMap((arg) => (arg === "json" ? ["text"] : [arg]));
    const result = runPap(textCommand, path.join(fixtures, caseId));
    assert.equal(result.stderr, "");
    const lines = result.stdout.trimEnd().split("\n");
    assert.equal(lines[0], `VERDICT: ${entry.expect?.verdict}`);
    const hasNotAPass = lines.slice(1).some((line) => line.startsWith("NOT A PASS"));
    assert.equal(hasNotAPass, entry.expect?.verdict !== "PASS");
    for (const dimension of [
      "integrity.package",
      "integrity.artifacts",
      "sources.integrity",
      "sources.availability",
      "signature.validity",
      "trust.signerIdentity",
      "trust.policyDecision",
      "trust.checkerRecognition",
      "trust.profileRecognition",
      "humanReview.status",
      "semanticTruth",
      "legalEnforceability",
    ]) {
      assert.ok(result.stdout.includes(dimension), `text output lacks ${dimension}`);
    }
    assert.ok(result.stdout.includes("coverage:"));
    assert.ok(result.stdout.includes("full:"));
    assert.ok(!result.stdout.includes("verified"), "text output must not use verified as a result");
  }
});

test("F42: explain text never prints a package verdict", () => {
  const result = runPap(
    ["explain", "../base", "--check", "pap.check.digest-integrity/1"],
    path.join(fixtures, "F42-explain-positive"),
  );
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("CHECK: pap.check.digest-integrity/1"));
  assert.ok(result.stdout.includes("OUTCOME: PASS"));
  assert.ok(!result.stdout.includes("VERDICT:"));
});

test("F40: producer-free environment and sentinel shims", () => {
  assert.equal(sentinelLog(), "", "the verifier must not execute producer or runtime sentinels");
});
