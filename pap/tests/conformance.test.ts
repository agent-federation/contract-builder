import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import Ajv2020Module from "ajv/dist/2020.js";
const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => any;
import { jcs } from "../src/json.js";
import { DIMENSION_ORDER, isDimensionPositive } from "../src/state.js";
import type { DimensionName } from "../src/types.js";
import { BASE_IDENTITY, fixtures, root, runPap, sentinelLog } from "./support.js";

interface CaseExpect {
  exitCode?: number;
  verdict?: string;
  dimensions?: Record<string, unknown>;
  diagnosticCodes?: string[];
  diagnosticCodesExact?: boolean;
  limitationCodes?: string[];
  coverageFull?: boolean;
  coverageRequiredDimensions?: string[];
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

interface RequirementsMap {
  verdictCause: Record<string, string | string[]>;
  verdictCauseExceptions: Record<string, string>;
}

const requirements = JSON.parse(
  readFileSync(path.join(fixtures, "requirements.json"), "utf8"),
) as RequirementsMap;

function dimensionNames(code: string): string[] {
  const mapped = requirements.verdictCause[code];
  if (mapped === undefined) return [];
  return Array.isArray(mapped) ? mapped : [mapped];
}

function reportStates(document: any): Parameters<typeof isDimensionPositive>[1] {
  return {
    integrity: {
      package: document.dimensions.integrity.package,
      artifacts: document.dimensions.integrity.artifacts,
    },
    sources: {
      integrity: document.dimensions.sources.integrity,
      availability: document.dimensions.sources.availability,
    },
    signature: { validity: document.dimensions.signature.validity },
    trust: {
      signerIdentity: document.dimensions.trust.signerIdentity,
      policyDecision: document.dimensions.trust.policyDecision,
      checkerRecognition: document.dimensions.trust.checkerRecognition,
      profileRecognition: document.dimensions.trust.profileRecognition,
    },
    checks: { results: document.dimensions.checks.results },
    humanReview: { status: document.dimensions.humanReview.status },
  };
}

/**
 * A cause dimension covers a required dimension when they are equal, when the
 * cause maps to the required dimension's root (e.g. `integrity` covers
 * `integrity.package`), or when the cause maps to one of its sub-dimensions
 * (e.g. `integrity.artifacts` covers `integrity`).
 */
function causeNamesDimension(dimension: string, named: Set<string>): boolean {
  if (named.has(dimension)) return true;
  const root = dimension.split(".")[0];
  if (root !== undefined && named.has(root)) return true;
  return [...named].some((candidate) => candidate.startsWith(`${dimension}.`));
}

/**
 * A mapped cause dimension is non-positive when the dimension itself is not
 * positive, or when one of its sub-dimensions is not. Both directions matter:
 * the map may name a root while the report decides a sub-dimension, or the
 * other way around.
 */
function isCauseDimensionNonPositive(
  dimension: string,
  states: Parameters<typeof isDimensionPositive>[1],
): boolean {
  if (!isDimensionPositive(dimension as DimensionName, states)) return true;
  return DIMENSION_ORDER.some(
    (candidate) => candidate.startsWith(`${dimension}.`) && !isDimensionPositive(candidate, states),
  );
}

/**
 * I5: every non-PASS verdict names its cause. (a) at least one diagnostic or
 * limitation code is in the map; (b) one of its dimensions is not positive in
 * the report; (c) every required dimension that is not positive is named. The
 * documented degenerate cases in `verdictCauseExceptions` keep (a) but cannot
 * satisfy (b)/(c) because their cause is a verdict context, not a dimension.
 */
function assertVerdictCause(caseId: string, document: any): void {
  const causeCodes = new Set<string>([
    ...document.diagnostics.map((diagnostic: { code: string }) => diagnostic.code),
    ...document.limitations.map((limitation: { code: string }) => limitation.code),
  ]);
  const mapped = [...causeCodes].filter((code) => requirements.verdictCause[code] !== undefined);
  assert.ok(
    mapped.length > 0,
    `${caseId}: (a) a non-PASS verdict must carry a code mapped to its cause`,
  );

  if (requirements.verdictCauseExceptions[caseId] !== undefined) return;

  const states = reportStates(document);
  const dimensions = new Set(mapped.flatMap((code) => dimensionNames(code)));
  assert.ok(
    [...dimensions].some((dimension) => isCauseDimensionNonPositive(dimension, states)),
    `${caseId}: (b) no mapped cause dimension is non-positive`,
  );

  const unnamed = (document.coverage.requiredDimensions as DimensionName[]).filter(
    (dimension) =>
      !isDimensionPositive(dimension, states) && !causeNamesDimension(dimension, dimensions),
  );
  assert.deepEqual(unnamed, [], `${caseId}: (c) required dimensions without a named cause`);
}

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
  ajv.addSchema(
    JSON.parse(readFileSync(path.join(root, "schemas", `${name}.schema.json`), "utf8")),
  );
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
  semanticTruth: (report) => report.dimensions.semanticTruth,
  legalEnforceability: (report) => report.dimensions.legalEnforceability,
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

function assertNoReport(
  result: { status: number; stdout: string; stderr: string },
  entry: CaseEntry,
): void {
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
    const codes = new Set(
      document.diagnostics.map((diagnostic: { code: string }) => diagnostic.code),
    );
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
    if (entry.expect?.coverageRequiredDimensions !== undefined) {
      assert.deepEqual(
        document.coverage.requiredDimensions,
        entry.expect.coverageRequiredDimensions,
        "coverage.requiredDimensions",
      );
    }
    if (document.verdict !== "PASS") {
      assertVerdictCause(entry.caseId, document);
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
  assert.equal(
    first.identities.verificationRecordIdentity,
    second.identities.verificationRecordIdentity,
  );
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
  assert.equal(
    validateReport(negative),
    false,
    "a PASS review without basis must be schema-invalid",
  );
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
    // RFC §9.6 item 7: the policy id, digest and state are required text.
    const report = JSON.parse(runPap(jsonCommand, path.join(fixtures, caseId)).stdout);
    assert.ok(report.policy.digest?.startsWith("sha256:"), "the corpus policy digest is set");
    assert.ok(
      result.stdout.includes(
        `policy: ${report.policy.id} digest: ${report.policy.digest} state: ${report.policy.state}`,
      ),
      "text output must render policy id/digest/state",
    );
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
  for (const caseId of [
    "F02-artifact-byte",
    "F46-inverse-not-reciprocal",
    "F59-relation-duplicate",
  ]) {
    const entry = suite.cases.find((candidate) => candidate.caseId === caseId);
    assert.ok(entry);
    const report = JSON.parse(runPap(entry.command, path.join(fixtures, caseId)).stdout);
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.coverage.full, true);
    assert.ok(report.dimensions.checks.results.some((result: any) => result.outcome === "FAIL"));
  }
});

test("every PASS case asserts an exact diagnostic set", () => {
  const missing = suite.cases
    .filter((entry) => entry.expect?.verdict === "PASS")
    .filter((entry) => entry.expect?.diagnosticCodesExact !== true)
    .map((entry) => entry.caseId);
  assert.deepEqual(missing, [], `PASS cases without diagnosticCodesExact: ${missing.join(", ")}`);
});

test("I5: a root cause dimension names a dotted required sub-dimension", () => {
  // A cause mapped to `integrity` must name a required `integrity.artifacts`
  // instead of being reported as unnamed (GLM pre-review of #196, P2 finding).
  assertVerdictCause("synthetic-dotted", {
    verdict: "FAIL",
    diagnostics: [{ code: "pap.integrity.artifact-mismatch" }],
    limitations: [],
    coverage: { requiredDimensions: ["integrity.artifacts"] },
    dimensions: {
      integrity: { package: "PASS", artifacts: "FAIL" },
      sources: { integrity: "PASS", availability: "PASS" },
      signature: { validity: "NOT_APPLICABLE" },
      trust: {
        signerIdentity: "NOT_APPLICABLE",
        policyDecision: "NOT_EVALUATED",
        checkerRecognition: "NOT_APPLICABLE",
        profileRecognition: "NOT_APPLICABLE",
      },
      checks: { results: [] },
      humanReview: { status: "NOT_APPLICABLE" },
    },
  });
});

test("I5: cause dimensions cover sub-dimensions in both directions", () => {
  assert.equal(causeNamesDimension("integrity.artifacts", new Set(["integrity"])), true);
  assert.equal(causeNamesDimension("integrity", new Set(["integrity.artifacts"])), true);
  assert.equal(causeNamesDimension("sources", new Set(["integrity"])), false);
});
