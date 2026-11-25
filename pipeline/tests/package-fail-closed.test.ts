/**
 * #135 failure-path evidence on the real producer-built CORE-000 package.
 *
 * `pack.test.ts` proves the positive path (C2 layout, two-run byte identity, a
 * PASS report) and the claim-file negatives. The cases below mutate the
 * *package* after `bun run pack:core000` — artifact bytes, the manifest, the
 * package tree — and follow each mutation through both consumers a recipient
 * has (sdlc-pipeline.md §2): `pap verify`, the only authority on the verdict,
 * and `gateCore000`, the function behind `gate:core000` and the only producer
 * of an acceptance decision.
 *
 * Each failure case is the RFC §12 corpus case for the same mutation (F02,
 * F21, F30), and the undeclared-file case is the corpus warning case (F31),
 * observed on the CORE-000 package instead of the Appendix F fixture. No
 * fixture is edited: every case starts from a fresh copy of one real pack, so
 * a diagnostic is attributable to that case's mutation alone.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import { gateCore000, type AcceptanceDecision, type GateResult } from "../gate.js";

const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => any;

const root = fileURLToPath(new URL("../..", import.meta.url));
const POLICY = path.join(root, "pipeline", "policy", "core000-trust-policy.json");
/** The `pipeline` CI job's pin: these cases evaluate at the same `--now` as CI. */
const FIXED_NOW = (await readFile(path.join(root, "pipeline", "pinned-now.txt"), "utf8")).trim();
const ARTIFACT_PATH = "artifacts/CORE-000.draft.md";
const ARTIFACT_ID = "artifact:core000-draft";
const MANIFEST = "assurance-package.json";
const DIGEST_INTEGRITY = "pap.check.digest-integrity/1";
const SOURCE_QUOTE = "pap.check.source-quote/1";
const RELATION_CONSISTENCY = "pap.check.relation-consistency/1";

type Report = Record<string, any>;

const SPAWN_OPTIONS = { cwd: root, encoding: "utf8", timeout: 180_000 } as const;

function run(args: readonly string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [...args], SPAWN_OPTIONS);
  return { status, stdout, stderr };
}

const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: true });
for (const name of ["check-record", "verification-report"]) {
  ajv.addSchema(
    JSON.parse(await readFile(path.join(root, "pap", "schemas", `${name}.schema.json`), "utf8")),
  );
}
const compiled = ajv.getSchema("urn:pap:0.1:verification-report");
assert.ok(compiled, "the Appendix C report schema compiles");
const validateReport: (report: unknown) => boolean = compiled;

let tempRoot: string | null = null;
let packageDir = "";
let baseline: Report = {};
let baselineStdout = "";
let decisionCount = 0;

/** `pap verify` with the CORE-000 policy at the pinned time; the report must be Appendix C valid. */
function verify(dir: string) {
  const result = run([
    "pap/src/cli.ts",
    "verify",
    dir,
    "--trust-policy",
    POLICY,
    "--format",
    "json",
    "--now",
    FIXED_NOW,
  ]);
  assert.equal(result.stderr, "", "a report run writes nothing to stderr");
  const report: unknown = result.stdout.trim().length > 0 ? JSON.parse(result.stdout) : null;
  assert.equal(validateReport(report), true, `Appendix C: ${JSON.stringify(compiled.errors)}`);
  return { ...result, report: report as Report };
}

/** Hand the gate the exact verifier stdout: it decides on the report bytes, not on a reparsed copy. */
async function decide(stdout: string): Promise<GateResult> {
  assert.ok(tempRoot !== null);
  const reportPath = path.join(tempRoot, `report-${decisionCount}.json`);
  decisionCount += 1;
  await writeFile(reportPath, stdout, "utf8");
  return gateCore000({ reportPath, policyPath: POLICY });
}

async function copyPackage(name: string): Promise<string> {
  assert.ok(tempRoot !== null);
  const dir = path.join(tempRoot, name);
  await cp(packageDir, dir, { recursive: true });
  return dir;
}

/**
 * `[code, severity, scope]` of each diagnostic, sorted: the stable parts of an
 * Appendix J diagnostic. The message is not normative and emission order is
 * not pinned.
 */
function shape(diagnostics: readonly Report[]): string[][] {
  return diagnostics.map((entry) => [entry.code, entry.severity, entry.scope]).sort();
}

function errorCodes(report: Report): Set<string> {
  return new Set(
    report.diagnostics
      .filter((entry: Report) => entry.severity === "error")
      .map((entry: Report) => entry.code),
  );
}

function checkOutcomes(report: Report): string[][] {
  return report.dimensions.checks.results.map((entry: { checkId: string; outcome: string }) => [
    entry.checkId,
    entry.outcome,
  ]);
}

/** The gate's reasons as one line, for matchers and failure messages. */
function reasonsOf(decision: AcceptanceDecision): string {
  return decision.reasons.join(" | ");
}

before(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), "pipeline-135-fail-closed-"));
  packageDir = path.join(tempRoot, "package");

  const packed = run(["run", "pack:core000", "--out", packageDir]);
  assert.equal(packed.status, 0, packed.stderr);

  const first = verify(packageDir);
  assert.equal(first.status, 0, first.stderr);
  baseline = first.report;
  baselineStdout = first.stdout;
  // A diagnostic in a mutated copy is attributable to its mutation alone only
  // when the unmodified package reports none.
  assert.equal(baseline.verdict, "PASS");
  assert.equal(baseline.coverage.full, true);
  assert.deepEqual(baseline.diagnostics, []);
  assert.deepEqual(baseline.limitations, []);
  assert.equal(baseline.policy.state, "FRESH");
});

after(async () => {
  if (tempRoot !== null) await rm(tempRoot, { recursive: true, force: true });
});

test("control: the unmodified pack is a clean PASS and the gate ACCEPTS it", async () => {
  const { exitCode, decision } = await decide(baselineStdout);

  assert.equal(exitCode, 0, reasonsOf(decision));
  assert.equal(decision.decision, "ACCEPTED");
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.verdict, "PASS");
  assert.equal(decision.packageIdentity, baseline.identities.packageIdentity);
  assert.equal(decision.evaluatedAt, FIXED_NOW, "evaluatedAt is copied from the report");
});

test("a tampered artifact byte fails digest-integrity and the gate rejects the package", async () => {
  const dir = await copyPackage("tampered-artifact");
  const artifactPath = path.join(dir, ARTIFACT_PATH);
  const original = await readFile(artifactPath, "utf8");
  // One letter changes case: the byte count stays equal, so only the digest can detect it.
  const tampered = original.replace(/[a-z]/, (letter) => letter.toUpperCase());
  assert.notEqual(tampered, original);
  assert.equal(Buffer.byteLength(tampered), Buffer.byteLength(original));
  await writeFile(artifactPath, tampered, "utf8");

  const { status, stderr, stdout, report } = verify(dir);
  assert.equal(status, 1, stderr);
  assert.equal(report.verdict, "FAIL");
  // A completed FAIL is an evaluated check (F02; coverage is not a verdict alias).
  assert.equal(report.coverage.full, true);
  assert.deepEqual(report.dimensions.integrity, { package: "PASS", artifacts: "FAIL" });
  assert.deepEqual(checkOutcomes(report), [
    [DIGEST_INTEGRITY, "FAIL"],
    [SOURCE_QUOTE, "PASS"],
    [RELATION_CONSISTENCY, "PASS"],
  ]);
  assert.deepEqual(
    errorCodes(report),
    new Set(["pap.check.failed", "pap.integrity.artifact-mismatch"]),
  );
  const scoped = report.diagnostics.filter((entry: Report) => entry.scope === ARTIFACT_ID);
  assert.deepEqual(
    shape(scoped),
    [["pap.integrity.artifact-mismatch", "error", ARTIFACT_ID]],
    "the mismatch names the artifact",
  );
  // The manifest is untouched, so the package identity is too: the artifact
  // digest declared in the manifest is what detects the swapped bytes.
  assert.equal(report.package.identity, baseline.identities.packageIdentity);
  const [artifactIdentity] = report.identities.artifacts;
  assert.equal(artifactIdentity.declared, baseline.identities.artifacts[0].declared);
  assert.notEqual(artifactIdentity.computed, artifactIdentity.declared);

  const { exitCode, decision } = await decide(stdout);
  assert.equal(exitCode, 1, reasonsOf(decision));
  assert.equal(decision.decision, "NOT_ACCEPTED");
  assert.equal(decision.verdict, "FAIL");
  assert.equal(decision.packageIdentity, baseline.identities.packageIdentity);
  assert.match(reasonsOf(decision), /integrity\.artifacts is FAIL/);
  assert.match(reasonsOf(decision), /verifier verdict is FAIL/);
});

test("an unparseable manifest yields no identity, FAIL, and a NOT_ACCEPTED decision", async () => {
  const dir = await copyPackage("broken-manifest");
  const manifestPath = path.join(dir, MANIFEST);
  const original = await readFile(manifestPath, "utf8");
  // Cut just after the first member's colon: the document is truncated, not
  // merely followed by trailing data.
  const truncated = original.slice(0, original.indexOf(":") + 12);
  assert.throws(() => JSON.parse(truncated));
  await writeFile(manifestPath, truncated, "utf8");

  const { status, stderr, stdout, report } = verify(dir);
  assert.equal(status, 1, stderr);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.coverage.full, false);
  assert.deepEqual(report.coverage.requiredChecks, []);
  assert.equal(report.package.identity, null, "no manifest, no package identity");
  assert.deepEqual(report.dimensions.integrity, { package: "FAIL", artifacts: "NOT_EVALUATED" });
  assert.deepEqual(report.checks, []);
  assert.deepEqual(shape(report.diagnostics), [["pap.package.manifest-json", "error", MANIFEST]]);
  assert.deepEqual(
    report.limitations.map((entry: Report) => entry.code),
    ["pap.package.manifest-json"],
  );

  const { exitCode, decision } = await decide(stdout);
  assert.equal(exitCode, 1, reasonsOf(decision));
  assert.equal(decision.decision, "NOT_ACCEPTED");
  assert.equal(decision.packageIdentity, null);
  assert.match(reasonsOf(decision), /integrity\.package is FAIL/);
  assert.match(reasonsOf(decision), /coverage\.full is false/);
  assert.match(reasonsOf(decision), /pap\.check\.digest-integrity\/1 is missing from the report/);
});

test("a manifest with an unknown member is FAIL and NOT_ACCEPTED (F30)", async () => {
  const dir = await copyPackage("edited-manifest");
  const manifestPath = path.join(dir, MANIFEST);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  // The corpus mutation: an extra member on an artifact entry.
  manifest.artifacts[0].sha256 = "deadbeef";
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");

  const { status, stderr, stdout, report } = verify(dir);
  assert.equal(status, 1, stderr);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.coverage.full, false);
  assert.equal(report.coverage.checksNotEvaluated, 3);
  // The edited manifest parses, so it has an identity: a different package, not the packed one.
  assert.match(report.package.identity, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(report.package.identity, baseline.identities.packageIdentity);
  assert.deepEqual(report.dimensions.integrity, { package: "FAIL", artifacts: "NOT_EVALUATED" });
  assert.deepEqual(checkOutcomes(report), [
    [DIGEST_INTEGRITY, "NOT_EVALUATED"],
    [SOURCE_QUOTE, "NOT_EVALUATED"],
    [RELATION_CONSISTENCY, "NOT_EVALUATED"],
  ]);
  // The corpus asserts this exact code set: the schema violation, and the
  // reason each required check could not run.
  assert.deepEqual(shape(report.diagnostics), [
    ["pap.check.not-evaluated", "warning", DIGEST_INTEGRITY],
    ["pap.check.not-evaluated", "warning", RELATION_CONSISTENCY],
    ["pap.check.not-evaluated", "warning", SOURCE_QUOTE],
    ["pap.package.unknown-field", "error", "$.artifacts[0].sha256"],
  ]);
  assert.deepEqual(
    new Set(report.limitations.map((entry: Report) => entry.code)),
    new Set(["pap.check.not-evaluated", "pap.package.unknown-field"]),
  );

  const { exitCode, decision } = await decide(stdout);
  assert.equal(exitCode, 1, reasonsOf(decision));
  assert.equal(decision.decision, "NOT_ACCEPTED");
  assert.equal(decision.packageIdentity, report.package.identity);
  assert.match(reasonsOf(decision), /integrity\.package is FAIL/);
  assert.match(
    reasonsOf(decision),
    /policy-required check pap\.check\.digest-integrity\/1 is NOT_EVALUATED/,
  );
});

/**
 * RFC §4.3.3 and F31: an undeclared regular file is a warning. RFC §4.3.3
 * says the verifier never opens it; what this case observes is that it leaves
 * package-derived identities and the verdict unchanged. The recorded gate rule
 * (sdlc-pipeline.md §5, rule 2) names verdict, coverage, dimensions and
 * limit-stopped scope, so the gate ACCEPTS the report with the warning in
 * `limitations[]`. This is a characterization, not a failure path: it pins the
 * outcome so that a change in either direction is a visible decision.
 *
 * Maintainer decision (D5a): the CI `determinism` helper (`pipeline/ci.ts`)
 * fails on any diagnostic, and D5a says the gate does not silently allowlist
 * expected limitations. Whether `gate:core000` should reject a PASS report
 * that carries a diagnostic other than a limit stop is a gate-rule decision;
 * this test records the current behaviour and does not make it.
 */
test("an undeclared file is a warning: package identities and the acceptance outcome do not change", async () => {
  const dir = await copyPackage("undeclared-file");
  const extra = path.join(dir, "artifacts", "EXTRA.md");
  await writeFile(extra, "not declared by the manifest\n", "utf8");

  const { status, stderr, stdout, report } = verify(dir);
  assert.equal(status, 0, stderr);
  assert.equal(report.verdict, "PASS");
  assert.equal(report.coverage.full, true);
  const { verificationRecordIdentity, ...packageIdentities } = report.identities;
  const { verificationRecordIdentity: baselineRecord, ...baselinePackageIdentities } =
    baseline.identities;
  assert.deepEqual(packageIdentities, baselinePackageIdentities);
  // The warning is part of the record, so the record identity differs (RFC §5.9).
  assert.notEqual(verificationRecordIdentity, baselineRecord);
  assert.deepEqual(shape(report.diagnostics), [
    ["pap.package.undeclared-file", "warning", "artifacts/EXTRA.md"],
  ]);
  assert.deepEqual(
    report.limitations.map((entry: Report) => entry.code),
    ["pap.package.undeclared-file"],
  );

  const { exitCode, decision } = await decide(stdout);
  assert.equal(exitCode, 0, reasonsOf(decision));
  assert.equal(decision.decision, "ACCEPTED");
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.packageIdentity, baseline.identities.packageIdentity);
});
