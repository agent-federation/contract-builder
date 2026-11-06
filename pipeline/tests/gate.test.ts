/**
 * C3 gate tests: the acceptance table, fail-closed report handling, determinism
 * and the end-to-end C2 -> `pap verify` -> gate chain.
 *
 * The table starts from a real verifier report produced from a real CORE-000
 * package, so a PASS row also proves the policy is accepted by `pap verify` and
 * that the report has full coverage. Every other row mutates that report.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import { canonicalJson } from "../mapping.js";
import { gateCore000, type AcceptanceDecision } from "../gate.js";
import { packCore000 } from "../pack.js";

const Ajv2020 = Ajv2020Module as unknown as new (
  options: Record<string, unknown>,
) => any;

const root = fileURLToPath(new URL("../..", import.meta.url));
const POLICY = path.join(root, "pipeline", "policy", "core000-trust-policy.json");
const FIXED_NOW = "2026-11-06T00:00:00Z";

interface SpawnResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(args: readonly string[]): SpawnResult {
  const result = spawnSync(process.execPath, [...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function gitStatus(): string {
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

type Report = Record<string, any>;

let tempRoot: string | null = null;
let baselineReportPath = "";
let baselineReportBytes = new Uint8Array();
let baselineReport: Report = {};
let baselinePolicy: Record<string, any> = {};

before(async () => {
  const beforeStatus = gitStatus();
  tempRoot = await mkdtemp(path.join(tmpdir(), "pipeline-c3-gate-"));
  const packageDir = path.join(tempRoot, "package");

  await packCore000({ outDir: packageDir });
  const verified = run([
    "pap/src/cli.ts",
    "verify",
    packageDir,
    "--trust-policy",
    POLICY,
    "--format",
    "json",
    "--now",
    FIXED_NOW,
  ]);
  assert.equal(verified.status, 0, verified.stderr);
  baselineReportBytes = new Uint8Array(Buffer.from(verified.stdout, "utf8"));
  baselineReport = JSON.parse(verified.stdout) as Report;

  baselineReportPath = path.join(tempRoot, "report.json");
  await writeFile(baselineReportPath, baselineReportBytes);
  baselinePolicy = JSON.parse(await readFile(POLICY, "utf8")) as Record<string, any>;

  // The chain is only a meaningful baseline when the verifier actually used the
  // policy and completed every required check.
  assert.equal(baselineReport.verdict, "PASS");
  assert.equal(baselineReport.coverage.full, true);
  assert.equal(baselineReport.policy.state, "FRESH");
  assert.equal(
    baselineReport.diagnostics.some(
      (entry: { code: string }) => entry.code === "pap.trust.policy-absent",
    ),
    false,
    "the policy must be supplied to the verifier",
  );
  assert.equal(gitStatus(), beforeStatus, "packing and verifying must not mutate the checkout");
});

after(async () => {
  if (tempRoot !== null) await rm(tempRoot, { recursive: true, force: true });
});

function cloneReport(): Report {
  return structuredClone(baselineReport);
}

async function writeJson(name: string, value: unknown): Promise<string> {
  assert.ok(tempRoot !== null);
  const file = path.join(tempRoot, `${name}.json`);
  await writeFile(file, `${canonicalJson(value)}\n`, "utf8");
  return file;
}

async function decide(reportPath: string, policyPath = POLICY) {
  return gateCore000({ reportPath, policyPath });
}

async function expectAccepted(
  name: string,
  report: Report,
): Promise<AcceptanceDecision> {
  const file = await writeJson(name, report);
  const result = await decide(file);
  assert.equal(result.exitCode, 0, `${name}: ${JSON.stringify(result.decision.reasons)}`);
  assert.equal(result.decision.decision, "ACCEPTED", name);
  assert.deepEqual(result.decision.reasons, [], name);
  return result.decision;
}

async function expectRejected(
  name: string,
  report: unknown,
  pattern: RegExp,
): Promise<AcceptanceDecision> {
  const file = await writeJson(name, report);
  const result = await decide(file);
  assert.equal(result.exitCode, 1, name);
  assert.equal(result.decision.decision, "NOT_ACCEPTED", name);
  assert.match(result.decision.reasons.join(" | "), pattern, name);
  return result.decision;
}

test("CORE-000 policy is a complete, schema-valid Appendix B instance", async () => {
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
  ajv.addSchema(
    JSON.parse(
      await readFile(path.join(root, "pap", "schemas", "trust-policy.schema.json"), "utf8"),
    ),
  );
  const validate = ajv.getSchema("urn:pap:0.1:trust-policy");
  assert.ok(validate);

  const policy = JSON.parse(await readFile(POLICY, "utf8")) as Record<string, any>;
  assert.equal(validate(policy), true, JSON.stringify(validate.errors));
  assert.equal(policy.trustPolicyVersion, "0.1");
  assert.equal(policy.id, "policy-core000-unsigned-2026-11");
  assert.equal(policy.signature.mode, "disabled");
  assert.deepEqual(policy.keys, []);
  assert.deepEqual(policy.signers, []);
  assert.deepEqual(policy.checkers, []);
  assert.deepEqual(policy.profiles, []);
  assert.deepEqual(policy.requiredChecks, [
    "pap.check.digest-integrity/1",
    "pap.check.source-quote/1",
    "pap.check.relation-consistency/1",
  ]);
  assert.deepEqual(policy.requiredDimensions, ["integrity", "sources", "checks"]);
  assert.deepEqual(policy.humanReview, { required: false, maxAgeSeconds: 2592000 });
  assert.ok(
    Date.parse(policy.expiresAt) - Date.parse(policy.issuedAt) >= 365 * 24 * 60 * 60 * 1000,
    "the policy validity window is long enough for a pinned CI time",
  );
});

test("end-to-end: C2 pack -> pap verify with the policy -> gate ACCEPTED", async () => {
  const decision = await expectAccepted("baseline", baselineReport);

  assert.equal(decision.verdict, "PASS");
  assert.equal(decision.packageIdentity, baselineReport.identities.packageIdentity);
  assert.notEqual(decision.packageIdentity, null);
  assert.equal(decision.policyId, baselinePolicy.id);
  assert.equal(decision.policyDigest, baselineReport.policy.digest);
  assert.equal(decision.reportDigest, sha256(baselineReportBytes));
  assert.deepEqual(decision.verifier, {
    id: baselineReport.verifier.id,
    version: baselineReport.verifier.version,
    implementationDigest: baselineReport.verifier.implementationDigest,
  });
  assert.equal(decision.evaluatedAt, FIXED_NOW, "evaluatedAt is copied from the report");
  assert.deepEqual(Object.keys(decision).sort(), [
    "decision",
    "evaluatedAt",
    "packageIdentity",
    "policyDigest",
    "policyId",
    "reasons",
    "reportDigest",
    "verdict",
    "verifier",
  ]);
  assert.deepEqual(Object.keys(decision.verifier).sort(), [
    "id",
    "implementationDigest",
    "version",
  ]);
  assert.equal(baselineReport.coverage.full, true);
  assert.equal(baselineReport.policy.state, "FRESH");
  assert.equal(
    baselineReport.diagnostics.some(
      (entry: { code: string }) => entry.code === "pap.trust.policy-absent",
    ),
    false,
    "no pap.trust.policy-absent diagnostic",
  );
});

test("gate table: PASS is the only accepted verdict", async () => {
  await expectAccepted("table-pass", baselineReport);

  await expectRejected(
    "table-fail",
    (() => {
      const report = cloneReport();
      report.verdict = "FAIL";
      report.dimensions.integrity.package = "FAIL";
      return report;
    })(),
    /verdict is FAIL/,
  );

  await expectRejected(
    "table-incomplete",
    (() => {
      const report = cloneReport();
      report.verdict = "INCOMPLETE";
      report.coverage.full = false;
      report.coverage.checksNotEvaluated = 1;
      return report;
    })(),
    /coverage\.full is false/,
  );

  await expectRejected(
    "table-unsupported",
    (() => {
      const report = cloneReport();
      report.verdict = "UNSUPPORTED";
      report.dimensions.checks.results[1].outcome = "UNSUPPORTED";
      report.dimensions.trust.checkerRecognition = "UNSUPPORTED";
      report.coverage.checksUnsupported = 1;
      return report;
    })(),
    /UNSUPPORTED/,
  );

  await expectRejected(
    "table-untrusted",
    (() => {
      const report = cloneReport();
      report.verdict = "UNTRUSTED";
      report.dimensions.trust.signerIdentity = "UNTRUSTED";
      report.dimensions.trust.policyDecision = "REJECTED";
      return report;
    })(),
    /UNTRUSTED|REJECTED/,
  );
});

test("gate fails closed when a PASS verdict hides a negative required dimension", async () => {
  await expectRejected(
    "forged-pass-dimension",
    (() => {
      const report = cloneReport();
      report.dimensions.integrity.artifacts = "FAIL";
      return report;
    })(),
    /required dimension integrity is not positive/,
  );

  await expectRejected(
    "forged-pass-check",
    (() => {
      const report = cloneReport();
      report.dimensions.checks.results[0].outcome = "FAIL";
      return report;
    })(),
    /check pap\.check\.digest-integrity\/1 is FAIL/,
  );
});

test("gate rejects a report that is missing, invalid JSON or schema-invalid", async () => {
  assert.ok(tempRoot !== null);

  const missing = await decide(path.join(tempRoot, "does-not-exist.json"));
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.decision.decision, "NOT_ACCEPTED");
  assert.match(missing.decision.reasons.join(" | "), /report file is missing/);
  assert.equal(missing.decision.reportDigest, null);
  assert.equal(missing.decision.evaluatedAt, null, "no clock is read");

  const malformedPath = path.join(tempRoot, "malformed.json");
  await writeFile(malformedPath, "{ not json", "utf8");
  const malformed = await decide(malformedPath);
  assert.equal(malformed.exitCode, 1);
  assert.equal(malformed.decision.decision, "NOT_ACCEPTED");
  assert.match(malformed.decision.reasons.join(" | "), /not valid UTF-8 JSON/);
  assert.equal(malformed.decision.reportDigest, sha256(new TextEncoder().encode("{ not json")));

  const schemaInvalid = await decide(
    await writeJson("schema-invalid", { reportVersion: "0.1" }),
  );
  assert.equal(schemaInvalid.exitCode, 1);
  assert.equal(schemaInvalid.decision.decision, "NOT_ACCEPTED");
  assert.match(
    schemaInvalid.decision.reasons.join(" | "),
    /does not match the PAP v0\.1 verification-report schema/,
  );
  assert.equal(schemaInvalid.decision.evaluatedAt, null);

  const badDate = cloneReport();
  badDate.evaluatedAt = "not-a-date";
  await expectRejected(
    "invalid-evaluated-at",
    badDate,
    /report evaluatedAt is not an RFC 3339 instant/,
  );
});

test("gate rejects policy absence, schema-invalid policy and policy mismatch", async () => {
  assert.ok(tempRoot !== null);

  const missingPolicy = await decide(
    baselineReportPath,
    path.join(tempRoot, "does-not-exist-policy.json"),
  );
  assert.equal(missingPolicy.exitCode, 1);
  assert.match(missingPolicy.decision.reasons.join(" | "), /trust policy file is missing/);

  const invalidPolicy = await decide(
    baselineReportPath,
    await writeJson("invalid-policy", { trustPolicyVersion: "0.1" }),
  );
  assert.equal(invalidPolicy.exitCode, 1);
  assert.match(
    invalidPolicy.decision.reasons.join(" | "),
    /does not match the PAP v0\.1 Appendix B schema/,
  );

  const digestMismatch = cloneReport();
  digestMismatch.policy.digest = `sha256:${"0".repeat(64)}`;
  const digestDecision = await expectRejected(
    "policy-digest-mismatch",
    digestMismatch,
    /policy digest mismatch/,
  );
  assert.equal(digestDecision.policyId, baselinePolicy.id);
  assert.equal(digestDecision.policyDigest, baselineReport.policy.digest);

  const idMismatch = cloneReport();
  idMismatch.policy.id = "policy-someone-else";
  await expectRejected("policy-id-mismatch", idMismatch, /policy id mismatch/);

  const stale = cloneReport();
  stale.policy.state = "STALE";
  await expectRejected("policy-stale", stale, /report policy state is STALE/);
});

test("gate rejects limit-stopped scope even when other fields claim PASS", async () => {
  await expectRejected(
    "limit-stopped",
    (() => {
      const report = cloneReport();
      report.verdict = "INCOMPLETE";
      report.coverage.full = false;
      report.diagnostics.push({
        code: "pap.package.limit-exceeded",
        severity: "error",
        scope: "package",
        message: "a resource limit stopped payload evaluation",
      });
      report.limitations.push({
        code: "pap.package.limit-exceeded",
        detail: "a resource limit stopped payload evaluation",
      });
      return report;
    })(),
    /limit-stopped scope/,
  );
});

test("gate copies evaluatedAt from the report and never reads the clock", async () => {
  const report = cloneReport();
  const copied = "2027-06-01T00:00:00Z";
  report.evaluatedAt = copied;
  const decision = await expectAccepted("evaluated-at", report);
  assert.equal(decision.evaluatedAt, copied);
});

test("gate re-derives the policy validity window from the report timestamp", async () => {
  await expectRejected(
    "window-before-issued",
    (() => {
      const report = cloneReport();
      report.evaluatedAt = "2026-10-31T23:59:59Z";
      return report;
    })(),
    /before the trust policy issuedAt/,
  );

  await expectRejected(
    "window-after-expiry",
    (() => {
      const report = cloneReport();
      report.evaluatedAt = "2027-11-01T00:00:01Z";
      return report;
    })(),
    /after the trust policy expiresAt/,
  );

  for (const [name, evaluatedAt] of [
    ["window-issued-boundary", "2026-11-01T00:00:00Z"],
    ["window-expiry-boundary", "2027-11-01T00:00:00Z"],
    ["window-inside", "2027-06-01T00:00:00Z"],
    ["window-offset-issued-boundary", "2026-11-01T01:00:00+01:00"],
  ] as const) {
    const report = cloneReport();
    report.evaluatedAt = evaluatedAt;
    const decision = await expectAccepted(name, report);
    assert.equal(decision.evaluatedAt, evaluatedAt, name);
  }
});

test("gate rejects duplicate JSON member names instead of trusting the last value", async () => {
  assert.ok(tempRoot !== null);
  const baselineText = await readFile(baselineReportPath, "utf8");
  const forged = baselineText.replace(
    '"verdict":"PASS"',
    '"verdict":"FAIL","verdict":"PASS"',
  );
  assert.notEqual(forged, baselineText, "the baseline report has a verdict member");
  assert.equal(
    (JSON.parse(forged) as Record<string, unknown>).verdict,
    "PASS",
    "JSON.parse alone would accept the forged shadow",
  );

  const forgedPath = path.join(tempRoot, "duplicate-verdict.json");
  await writeFile(forgedPath, forged, "utf8");
  const result = await decide(forgedPath);
  assert.equal(result.exitCode, 1);
  assert.equal(result.decision.decision, "NOT_ACCEPTED");
  assert.match(
    result.decision.reasons.join(" | "),
    /duplicate JSON object member "verdict"/,
  );
});

test("gate decision bytes are deterministic for a fixed report and policy", async () => {
  const first = await decide(baselineReportPath);
  const second = await decide(baselineReportPath);
  assert.equal(first.exitCode, 0);
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(
    new TextDecoder("utf-8").decode(first.bytes),
    `${canonicalJson(first.decision)}\n`,
  );

  assert.ok(tempRoot !== null);
  const outA = path.join(tempRoot, "decision-a.json");
  const outB = path.join(tempRoot, "decision-b.json");
  const runA = run([
    "run",
    "gate:core000",
    "--report",
    baselineReportPath,
    "--policy",
    POLICY,
    "--out",
    outA,
  ]);
  const runB = run([
    "run",
    "gate:core000",
    "--report",
    baselineReportPath,
    "--policy",
    POLICY,
    "--out",
    outB,
  ]);
  assert.equal(runA.status, 0, runA.stderr);
  assert.equal(runB.status, 0, runB.stderr);
  assert.deepEqual(
    new Uint8Array(await readFile(outA)),
    new Uint8Array(await readFile(outB)),
  );
});

test("gate CLI writes --out and uses exit 0 for ACCEPTED, 1 for NOT_ACCEPTED", async () => {
  assert.ok(tempRoot !== null);

  const acceptedOut = path.join(tempRoot, "cli-accepted.json");
  const accepted = run([
    "run",
    "gate:core000",
    "--report",
    baselineReportPath,
    "--policy",
    POLICY,
    "--out",
    acceptedOut,
  ]);
  assert.equal(accepted.status, 0, accepted.stderr);
  const acceptedDecision = JSON.parse(
    await readFile(acceptedOut, "utf8"),
  ) as Record<string, any>;
  assert.equal(acceptedDecision.decision, "ACCEPTED");
  assert.deepEqual(acceptedDecision.reasons, []);

  const failedReport = cloneReport();
  failedReport.verdict = "FAIL";
  failedReport.dimensions.integrity.package = "FAIL";
  const failedPath = await writeJson("cli-failed-report", failedReport);
  const rejectedOut = path.join(tempRoot, "cli-rejected.json");
  const rejected = run([
    "run",
    "gate:core000",
    "--report",
    failedPath,
    "--policy",
    POLICY,
    "--out",
    rejectedOut,
  ]);
  assert.equal(rejected.status, 1);
  const rejectedDecision = JSON.parse(
    await readFile(rejectedOut, "utf8"),
  ) as Record<string, any>;
  assert.equal(rejectedDecision.decision, "NOT_ACCEPTED");
  assert.ok(rejectedDecision.reasons.length > 0);
});

test("gate CLI rejects a positional report together with --report", () => {
  const result = run([
    "run",
    "gate:core000",
    "--report",
    baselineReportPath,
    "--policy",
    POLICY,
    "stray.json",
  ]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unexpected argument: stray\.json/);
});

test("the gate has no verifier implementation dependency", async () => {
  const source = await readFile(path.join(root, "pipeline", "gate.ts"), "utf8");
  assert.equal(
    /from\s+"[^"]*pap\/src|import\s*\(\s*"[^"]*pap\/src/.test(source),
    false,
    "gate.ts must consume the report, not pap/src",
  );
  assert.match(source, /pap", "schemas"/, "schemas are read as data");
});
