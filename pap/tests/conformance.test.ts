import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

function stderrDiagnosticCodes(stderr: string): string[] {
  const codes: string[] = [];
  for (const line of stderr.split("\n")) {
    if (line === "") continue;
    const match = /^pap: (pap\.[a-z0-9.-]+): /.exec(line);
    assert.ok(match, `unexpected stderr line: ${line}`);
    codes.push(match[1] as string);
  }
  return [...new Set(codes)].sort();
}

function assertNoReport(result: { status: number; stdout: string; stderr: string }, entry: CaseEntry): void {
  assert.equal(result.stdout, "", "no report may be written to stdout");
  assert.equal(result.status, entry.expect?.exitCode, "no-report exit code");
  assert.deepEqual(
    stderrDiagnosticCodes(result.stderr),
    [...new Set(entry.stderrCodes ?? [])].sort(),
    `no-report stderr codes: ${result.stderr}`,
  );
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

test("an evaluated required-check FAIL does not make coverage partial", () => {
  for (const caseId of ["F02-artifact-byte", "F46-inverse-not-reciprocal", "F59-relation-duplicate"]) {
    const entry = suite.cases.find((candidate) => candidate.caseId === caseId);
    assert.ok(entry);
    const report = JSON.parse(runPap(entry.command, path.join(fixtures, caseId)).stdout);
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.coverage.full, true);
    assert.ok(report.dimensions.checks.results.some((result: any) => result.outcome === "FAIL"));
  }
});

/**
 * Codes the CLI can emit but no conformance case can reach. Each is covered by a
 * focused unit test, except the verifier-bug signal, which no package data can
 * produce. A new code in `pap/src` needs a case, a unit test, or an entry here
 * with a reason.
 */
const CODES_NOT_REACHABLE_BY_CASE: Record<
  string,
  { unitTest?: { file: string; marker: string }; reason: string }
> = {
  "pap.io.error": {
    unitTest: { file: "cli.test.ts", marker: "pap.io.error" },
    reason: "stdout write failure needs an in-process write stub; a spawn cannot provoke it reliably",
  },
  "pap.package.path-escape": {
    unitTest: { file: "paths.test.ts", marker: "path-escape" },
    reason: "the reader rejects a symlinked or non-confined declared path as symlink/non-regular before realpath can observe an escape; static fixtures cannot express a mount",
  },
  "pap.internal.error": {
    reason: "last-resort verifier-bug signal; no package data may produce it",
  },
};

const DIAGNOSTIC_TOKEN = /pap\.[a-z0-9./-]+/g;
const DIAGNOSTIC_CODE = /^pap\.[a-z0-9-]+\.[a-z0-9-]+$/;
const DOMAIN_OR_VERSION_SUFFIX = /\.v\d+(\.\d+)?$/;

function diagnosticCodesIn(source: string): string[] {
  const codes: string[] = [];
  for (const match of source.matchAll(DIAGNOSTIC_TOKEN)) {
    const token = match[0];
    if (
      DIAGNOSTIC_CODE.test(token) &&
      !DOMAIN_OR_VERSION_SUFFIX.test(token) &&
      token !== "pap.verifier.reference"
    ) {
      codes.push(token);
    }
  }
  return codes;
}

function emittedDiagnosticCodes(): string[] {
  const codes = new Set<string>();
  const sourceDir = path.join(root, "src");
  for (const file of readdirSync(sourceDir).filter((name) => name.endsWith(".ts"))) {
    for (const code of diagnosticCodesIn(readFileSync(path.join(sourceDir, file), "utf8"))) {
      codes.add(code);
    }
  }
  return [...codes].sort();
}

function unitTestedDiagnosticCodes(): Set<string> {
  const codes = new Set<string>();
  const testsDir = path.join(root, "tests");
  for (const file of readdirSync(testsDir).filter(
    (name) => name.endsWith(".test.ts") && name !== "conformance.test.ts",
  )) {
    for (const code of diagnosticCodesIn(readFileSync(path.join(testsDir, file), "utf8"))) {
      codes.add(code);
    }
  }
  return codes;
}

test("every diagnostic code emitted by pap/src is expected by a case or unit test", () => {
  const emitted = emittedDiagnosticCodes();
  assert.ok(emitted.length > 0, "no diagnostic codes were extracted from pap/src");

  const expected = new Set<string>();
  for (const entry of suite.cases as CaseEntry[]) {
    for (const code of entry.expect?.diagnosticCodes ?? []) expected.add(code);
    for (const code of entry.stderrCodes ?? []) expected.add(code);
  }
  const unitTested = unitTestedDiagnosticCodes();

  const uncovered = emitted.filter(
    (code) =>
      !expected.has(code) &&
      !unitTested.has(code) &&
      CODES_NOT_REACHABLE_BY_CASE[code] === undefined,
  );
  assert.deepEqual(
    uncovered,
    [],
    `diagnostic codes without a conformance case or unit test: ${uncovered.join(", ")}`,
  );

  for (const [code, exemption] of Object.entries(CODES_NOT_REACHABLE_BY_CASE)) {
    assert.ok(emitted.includes(code), `stale exemption for ${code}`);
    assert.ok(!expected.has(code), `${code} is expected by a case and must not be exempted`);
    if (exemption.unitTest !== undefined) {
      const testSource = readFileSync(
        path.join(root, "tests", exemption.unitTest.file),
        "utf8",
      );
      assert.ok(
        testSource.includes(exemption.unitTest.marker),
        `${code} exemption names ${exemption.unitTest.file}, which does not assert ${exemption.unitTest.marker}`,
      );
    }
  }

  const unknown = [...expected].filter((code) => !emitted.includes(code));
  assert.deepEqual(unknown, [], `cases expect codes pap/src does not emit: ${unknown.join(", ")}`);
});
