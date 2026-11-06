/**
 * CI assertions for the C4 `pipeline` job.
 *
 * The job itself lives in `.github/workflows/ci.yml` and runs the public
 * `pack:core000`, `pap verify` and `gate:core000` commands. This helper only
 * asserts the invariants those commands cannot state on their own:
 *
 * - `determinism <report-a> <report-b>`: both verifier reports carry the same
 *   `packageIdentity`, have a clean PASS report, and are identical once the
 *   package path (the only field that legitimately differs between two pack
 *   directories) is normalized.
 * - `tamper <report> <out>`: write a copy whose verdict is `FAIL`, so the job
 *   can prove the gate fails closed on a non-PASS report.
 * - `assert-decision <decision> <ACCEPTED|NOT_ACCEPTED>`: assert the gate's
 *   decision document says what its exit code already implies.
 *
 * This is a CI-only assertion surface; `pack.ts` and `gate.ts` remain the
 * producer and acceptor, and neither imports this module.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, unknown>;

const USAGE =
  "Usage: bun pipeline/ci.ts <determinism <report-a> <report-b> | tamper <report> <out> | assert-decision <decision> <ACCEPTED|NOT_ACCEPTED>>";

class CiFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CiFailure";
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string): never {
  throw new CiFailure(message);
}

function asObject(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} is not a JSON object`);
  }
  return value as JsonObject;
}

async function readJsonFile(file: string): Promise<JsonObject> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    fail(`cannot read ${file}: ${messageOf(error)}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail(`${file} is not valid JSON: ${messageOf(error)}`);
  }
  return asObject(value, file);
}

/**
 * Assert the report is a clean PASS and return its verifier-reported package
 * identity. A diagnostic or limitation is unexpected for the CORE-000 package;
 * the gate only rejects a known limit stop, so this makes every other
 * diagnostic fail closed too.
 */
function assertCleanPass(report: JsonObject, label: string): string {
  if (report.verdict !== "PASS") {
    fail(`${label}: verdict is ${JSON.stringify(report.verdict)}, expected PASS`);
  }

  const coverage = asObject(report.coverage, `${label}.coverage`);
  if (coverage.full !== true) {
    fail(
      `${label}: coverage.full is ${JSON.stringify(coverage.full)}, expected true`,
    );
  }

  for (const field of ["diagnostics", "limitations"] as const) {
    const entries = report[field];
    if (!Array.isArray(entries)) {
      fail(`${label}.${field} is not an array`);
    }
    if (entries.length > 0) {
      fail(`${label}.${field} is not empty: ${JSON.stringify(entries)}`);
    }
  }

  const identities = asObject(report.identities, `${label}.identities`);
  const identity = identities.packageIdentity;
  if (typeof identity !== "string" || identity.length === 0) {
    fail(`${label}: identities.packageIdentity is missing`);
  }

  const pkg = asObject(report.package, `${label}.package`);
  if (pkg.identity !== identity) {
    fail(
      `${label}: package.identity ${JSON.stringify(pkg.identity)} does not match identities.packageIdentity ${JSON.stringify(identity)}`,
    );
  }

  return identity;
}

/** The package path is the only field expected to differ between two pack runs. */
function normalizeReport(report: JsonObject): string {
  const copy = structuredClone(report);
  const pkg = asObject(copy.package, "package");
  pkg.path = "<package>";
  return JSON.stringify(copy);
}

async function checkDeterminism(args: readonly string[]): Promise<void> {
  const [first, second] = args;
  if (first === undefined || second === undefined || args.length !== 2) {
    fail("determinism requires exactly <report-a> <report-b>");
  }

  const firstReport = await readJsonFile(first);
  const secondReport = await readJsonFile(second);
  const firstIdentity = assertCleanPass(firstReport, "report-a");
  const secondIdentity = assertCleanPass(secondReport, "report-b");

  if (firstIdentity !== secondIdentity) {
    fail(
      `packageIdentity differs between pack runs: ${firstIdentity} != ${secondIdentity}`,
    );
  }
  if (normalizeReport(firstReport) !== normalizeReport(secondReport)) {
    fail("verifier reports differ after normalizing package.path");
  }

  console.log(
    `determinism: packageIdentity ${firstIdentity}; reports identical after normalizing package.path`,
  );
}

async function tamperReport(args: readonly string[]): Promise<void> {
  const [source, target] = args;
  if (source === undefined || target === undefined || args.length !== 2) {
    fail("tamper requires exactly <report> <out>");
  }

  const report = await readJsonFile(source);
  if (report.verdict !== "PASS") {
    fail(
      `tamper baseline verdict is ${JSON.stringify(report.verdict)}, expected PASS`,
    );
  }
  report.verdict = "FAIL";

  try {
    await writeFile(target, `${JSON.stringify(report)}\n`, "utf8");
  } catch (error) {
    fail(`cannot write ${target}: ${messageOf(error)}`);
  }

  console.log(`tamper: wrote ${target} with verdict FAIL`);
}

async function assertDecision(args: readonly string[]): Promise<void> {
  const [file, expected] = args;
  if (file === undefined || expected === undefined || args.length !== 2) {
    fail(
      "assert-decision requires exactly <decision> <ACCEPTED|NOT_ACCEPTED>",
    );
  }
  if (expected !== "ACCEPTED" && expected !== "NOT_ACCEPTED") {
    fail(`unknown decision ${JSON.stringify(expected)}`);
  }

  const decision = await readJsonFile(file);
  if (decision.decision !== expected) {
    fail(
      `decision is ${JSON.stringify(decision.decision)}, expected ${expected}`,
    );
  }

  const reasons = decision.reasons;
  if (!Array.isArray(reasons)) {
    fail("decision.reasons is not an array");
  }

  if (expected === "ACCEPTED") {
    if (reasons.length > 0) {
      fail(`ACCEPTED decision has reasons: ${JSON.stringify(reasons)}`);
    }
    if (decision.verdict !== "PASS") {
      fail(
        `ACCEPTED decision verdict is ${JSON.stringify(decision.verdict)}, expected PASS`,
      );
    }
    if (
      typeof decision.packageIdentity !== "string" ||
      decision.packageIdentity.length === 0
    ) {
      fail("ACCEPTED decision has no packageIdentity");
    }
  } else if (reasons.length === 0) {
    fail("NOT_ACCEPTED decision has no reasons");
  }

  console.log(`assert-decision: ${file} is ${expected}`);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "determinism":
      await checkDeterminism(args);
      return;
    case "tamper":
      await tamperReport(args);
      return;
    case "assert-decision":
      await assertDecision(args);
      return;
    default:
      console.error(USAGE);
      process.exitCode = 2;
  }
}

const invokedPath =
  process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(`ci-pipeline: ${messageOf(error)}`);
    process.exitCode = 1;
  });
}
