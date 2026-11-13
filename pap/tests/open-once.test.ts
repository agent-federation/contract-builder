import { after, test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inputFileDigest, normalizedInputSetDigest, normalizeLf } from "../src/digest.js";
import { fixtures, runPap } from "./support.js";
import { cleanupTempDirs, tempDir } from "./temp.js";

const NOW = "2026-11-02T00:00:00Z";
const base = path.join(fixtures, "base");
const policy = path.join(fixtures, "trust-policy", "unsigned-valid.json");

after(cleanupTempDirs);

interface Op {
  op: string;
  path: string;
  position?: number | null;
  bytesRead?: number;
}

function tempPackage(): string {
  const dir = tempDir("open-once-");
  cpSync(base, dir, { recursive: true });
  return dir;
}

function readOps(log: string): Op[] {
  try {
    return readFileSync(log, "utf8")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Op);
  } catch {
    return [];
  }
}

function verify(
  dir: string,
  target: string,
  action: "none" | "replace" | "mutate" | "fail-read" | "short-read" | "grow",
  extra: string[] = [],
  policyPath: string = policy,
): { status: number; stdout: string; stderr: string; ops: Op[] } {
  const log = path.join(tempDir("open-once-log-"), "ops.jsonl");
  const result = runPap(
    ["verify", ".", "--trust-policy", policyPath, "--format", "json", "--now", NOW, ...extra],
    dir,
    { target, log, action },
  );
  return { ...result, ops: readOps(log) };
}

function declaredSetDigest(dir: string): string {
  const manifest = JSON.parse(readFileSync(path.join(dir, "assurance-package.json"), "utf8"));
  return manifest.build.normalizedInputDigest;
}

function openCount(ops: Op[], target: string): number {
  return ops.filter((op) => op.op === "open" && op.path === target).length;
}

function closeCount(ops: Op[], target: string): number {
  return ops.filter((op) => op.op === "close" && op.path === target).length;
}

function resolutionCount(ops: Op[], target: string, op: "lstat" | "realpath"): number {
  return ops.filter((entry) => entry.op === op && entry.path === target).length;
}

/**
 * Pin ODR-PAP-008 for one declared input: exactly one resolution in the plan
 * phase, exactly one open, and no pathname re-resolution after that open. The
 * exact counts catch a phase-2 re-resolution that happens before the open even
 * though the "after the first open" window stays clean.
 */
function assertResolvedAndOpenedOnce(ops: Op[], target: string, label = target): void {
  assert.equal(resolutionCount(ops, target, "lstat"), 1, `${label}: lstat'd exactly once`);
  assert.equal(resolutionCount(ops, target, "realpath"), 1, `${label}: realpath'd exactly once`);
  assert.equal(openCount(ops, target), 1, `${label}: opened exactly once`);
  const openedAt = ops.findIndex((entry) => entry.op === "open" && entry.path === target);
  assert.ok(openedAt >= 0, `${label}: open is recorded`);
  assert.ok(
    !ops
      .slice(openedAt + 1)
      .some((entry) => entry.path === target && (entry.op === "lstat" || entry.op === "realpath")),
    `${label}: no pathname resolution after the first open`,
  );
}

test("open-once: a pathname replacement after the first open cannot redirect later passes", () => {
  const dir = tempPackage();
  const target = path.join(dir, "inputs", "project.yml");
  const expectedSet = declaredSetDigest(dir);
  const result = verify(dir, target, "replace");

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "PASS");
  assert.equal(report.identities.normalizedInputDigest, expectedSet);
  assert.ok(
    !report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.integrity.input-mismatch",
    ),
  );

  assertResolvedAndOpenedOnce(result.ops, target, "the replaced input");
  assert.equal(closeCount(result.ops, target), 1, "the descriptor must be closed");

  const reads = result.ops.filter((op) => op.op === "read" && op.path === target);
  assert.equal(reads[0]?.position, 0, "the analysis pass starts at byte 0");
  const firstEof = result.ops.findIndex(
    (op) => op.op === "read-done" && op.path === target && op.bytesRead === 0,
  );
  assert.ok(firstEof >= 0);
  const contentPass = result.ops
    .slice(firstEof + 1)
    .find((op) => op.op === "read" && op.path === target);
  assert.equal(contentPass?.position, 0, "the content pass repositions explicitly at byte 0");
});

test("open-once: concurrent in-place mutation is visible and never claimed as a snapshot", () => {
  const dir = tempPackage();
  const target = path.join(dir, "inputs", "project.yml");
  const result = verify(dir, target, "mutate");

  const report = JSON.parse(result.stdout);
  assert.notEqual(report.verdict, "PASS");
  assert.ok(
    report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.integrity.input-mismatch",
    ),
    "the mutated content must be reported, not hidden",
  );
  assert.notEqual(
    report.identities.normalizedInputDigest,
    declaredSetDigest(dir),
    "the set digest is computed from the bytes actually read",
  );
  assertResolvedAndOpenedOnce(result.ops, target, "the mutated input");
  assert.equal(closeCount(result.ops, target), 1);
});

test("open-once: a read-position failure maps to pap.package.io and closes the descriptor", () => {
  const dir = tempPackage();
  const target = path.join(dir, "inputs", "project.yml");
  const result = verify(dir, target, "fail-read");

  const report = JSON.parse(result.stdout);
  assert.equal(report.identities.normalizedInputDigest, null);
  const io = report.diagnostics.find(
    (diagnostic: any) =>
      diagnostic.code === "pap.package.io" && diagnostic.scope === "input:project",
  );
  assert.ok(io, "the content-pass read failure is reported as an input I/O error");
  assert.equal(io.severity, "error");
  assert.ok(
    !report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
    "an unreadable input must not be reported as a byte limit",
  );
  assertResolvedAndOpenedOnce(result.ops, target, "the unreadable input");
  assert.equal(closeCount(result.ops, target), 1, "the descriptor is closed on the error path");
});

test("open-once: hitting a read limit closes the descriptor and releases the charge", () => {
  const dir = tempPackage();
  const target = path.join(dir, "inputs", "project.yml");
  const log = path.join(tempDir("open-once-log-"), "ops.jsonl");
  const budget = writeBudgetPolicy(305);
  const result = runPap(
    ["verify", ".", "--trust-policy", budget, "--format", "json", "--now", NOW],
    dir,
    { target, log, action: "grow" },
  );
  const ops = readOps(log);
  const report = JSON.parse(result.stdout);
  assert.equal(report.identities.normalizedInputDigest, null);
  const limit = report.diagnostics.find(
    (diagnostic: any) =>
      diagnostic.code === "pap.package.limit-exceeded" && diagnostic.scope === "input:project",
  );
  assert.ok(limit, "the growth past the planned cap is a limit, not a silent truncation");
  assert.equal(limit.severity, "error");
  assert.equal(limit.message, "declared file exceeds the byte limit: inputs/project.yml");
  assertResolvedAndOpenedOnce(ops, target, "the grown input");
  assert.equal(closeCount(ops, target), 1, "the descriptor is closed on the limit path");
});

test("open-once: short reads during the content pass still hash the same bytes", () => {
  const dir = tempPackage();
  const target = path.join(dir, "inputs", "project.yml");
  const result = verify(dir, target, "short-read");

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "PASS");
  assert.equal(report.identities.normalizedInputDigest, declaredSetDigest(dir));
  const reads = result.ops.filter((op) => op.op === "read" && op.path === target);
  const short = result.ops.filter(
    (op) => op.op === "read-done" && op.path === target && op.bytesRead === 7,
  );
  assert.ok(reads.length > 2);
  assert.ok(short.length > 0, "the probe returned short reads after the analysis pass");
  assertResolvedAndOpenedOnce(result.ops, target, "the short-read input");
  assert.equal(closeCount(result.ops, target), 1);
});

interface ExtraInput {
  id: string;
  file: string;
  bytes: Buffer;
}

function addInputs(dir: string, extras: ExtraInput[]): void {
  const manifestPath = path.join(dir, "assurance-package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const existing = manifest.inputs[0];
  const entries = [
    {
      path: existing.path,
      bytes: normalizeLf(new Uint8Array(readFileSync(path.join(dir, existing.path)))),
    },
  ];
  for (const extra of extras) {
    writeFileSync(path.join(dir, extra.file), extra.bytes);
    const normalized = normalizeLf(new Uint8Array(extra.bytes));
    manifest.inputs.push({
      id: extra.id,
      path: extra.file,
      mediaType: "application/yaml",
      digest: inputFileDigest(extra.file, normalized),
      normalization: "lf",
    });
    entries.push({ path: extra.file, bytes: normalized });
  }
  manifest.build.normalizedInputDigest = normalizedInputSetDigest(entries);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function writeBudgetPolicy(totalPayloadBytes: number): string {
  const value = JSON.parse(readFileSync(policy, "utf8"));
  value.id = "policy-open-once-budget";
  value.limits = { totalPayloadBytes };
  const file = path.join(tempDir("open-once-policy-"), "policy.json");
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

test("manifest-order budget still limits the same input while the set digest is path-ordered", () => {
  const dir = tempPackage();
  // Manifest order is project, z, a; ascending path order is a, project, z.
  addInputs(dir, [
    { id: "input:z", file: "inputs/z.yml", bytes: Buffer.from("z input\n") },
    { id: "input:a", file: "inputs/a.yml", bytes: Buffer.from("a input\n") },
  ]);
  // 80 artifact + 127 source + 49 project + 8 z leaves nothing for a.
  const budget = writeBudgetPolicy(264);
  const log = path.join(tempDir("open-once-log-"), "ops.jsonl");
  const target = path.join(dir, "inputs", "a.yml");
  const result = runPap(
    ["verify", ".", "--trust-policy", budget, "--format", "json", "--now", NOW],
    dir,
    { target, log, action: "none" },
  );
  const ops = readOps(log);
  const report = JSON.parse(result.stdout);
  assert.equal(report.identities.normalizedInputDigest, null);
  const limited = report.diagnostics.find(
    (diagnostic: any) =>
      diagnostic.code === "pap.package.limit-exceeded" && diagnostic.scope === "input:a",
  );
  assert.ok(limited, "the manifest-order plan must limit input:a, not an earlier path");
  assert.equal(limited.severity, "error");
  assert.equal(limited.message, "total payload byte limit exceeded");
  assert.ok(
    !report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.integrity.input-mismatch",
    ),
  );
  assert.notEqual(report.verdict, "PASS");
  assert.equal(openCount(ops, target), 0, "a limited input is never opened");
  assert.equal(
    resolutionCount(ops, target, "lstat") + resolutionCount(ops, target, "realpath"),
    0,
    "a cap-limited input is never resolved",
  );
  for (const relative of ["inputs/project.yml", "inputs/z.yml"]) {
    assertResolvedAndOpenedOnce(ops, path.join(dir, relative), relative);
  }
});

test("the set digest is assembled in ascending path order regardless of manifest order", () => {
  const dir = tempPackage();
  addInputs(dir, [
    { id: "input:z", file: "inputs/z.yml", bytes: Buffer.from("z input\n") },
    { id: "input:a", file: "inputs/a.yml", bytes: Buffer.from("a input\r\n") },
  ]);
  const expected = declaredSetDigest(dir);
  const target = path.join(dir, "inputs", "z.yml");
  const result = verify(dir, target, "none");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "PASS");
  assert.equal(report.identities.normalizedInputDigest, expected);
  for (const relative of ["inputs/project.yml", "inputs/z.yml", "inputs/a.yml"]) {
    assertResolvedAndOpenedOnce(result.ops, path.join(dir, relative), relative);
  }
});

const KNOWN_INPUT_DIAGNOSTIC_CODES = new Set([
  "pap.package.io",
  "pap.package.limit-exceeded",
  "pap.check.not-evaluated",
  "pap.limit.lowered",
  "pap.package.declared-file-missing",
  "pap.integrity.input-mismatch",
]);

test("stat-plan ordering: an earlier failing input can limit a later input (documented narrow difference)", () => {
  const dir = tempPackage();
  const target = path.join(dir, "inputs", "project.yml");
  // Manifest order: project (unreadable, 49 B), second (390 B), third (6 B).
  // 80 artifact + 127 source + 49 + 390 leaves no cap for third.
  addInputs(dir, [
    { id: "input:second", file: "inputs/second.yml", bytes: Buffer.from("s".repeat(390)) },
    { id: "input:third", file: "inputs/third.yml", bytes: Buffer.from("third\n") },
  ]);
  const budget = writeBudgetPolicy(646);
  const result = verify(dir, target, "fail-read", [], budget);

  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.identities.normalizedInputDigest, null);
  const io = report.diagnostics.find(
    (diagnostic: any) =>
      diagnostic.code === "pap.package.io" && diagnostic.scope === "input:project",
  );
  assert.ok(io, "the unreadable input keeps its primary I/O diagnostic");
  const limited = report.diagnostics.find(
    (diagnostic: any) =>
      diagnostic.code === "pap.package.limit-exceeded" && diagnostic.scope === "input:third",
  );
  assert.ok(limited, "the stat charge fixed later caps before the failure is known");
  assert.equal(limited.message, "total payload byte limit exceeded");
  assert.ok(
    !report.diagnostics.some(
      (diagnostic: any) =>
        diagnostic.code === "pap.package.limit-exceeded" && diagnostic.scope === "input:second",
    ),
    "the readable input that fits its planned cap is still hashed",
  );
  const integrity = report.checks.find(
    (check: any) => check.checkId === "pap.check.digest-integrity/1",
  );
  assert.equal(integrity.outcome, "NOT_EVALUATED");
  assert.ok(
    report.diagnostics.every((diagnostic: any) =>
      KNOWN_INPUT_DIAGNOSTIC_CODES.has(diagnostic.code),
    ),
    "the narrow difference adds no new diagnostic code",
  );
  assert.equal(
    openCount(result.ops, path.join(dir, "inputs", "third.yml")),
    0,
    "a cap-limited input is never opened",
  );
  for (const relative of ["inputs/project.yml", "inputs/second.yml"]) {
    assertResolvedAndOpenedOnce(result.ops, path.join(dir, relative), relative);
  }
  assert.equal(
    resolutionCount(result.ops, path.join(dir, "inputs", "third.yml"), "lstat") +
      resolutionCount(result.ops, path.join(dir, "inputs", "third.yml"), "realpath"),
    0,
    "a cap-limited input is never resolved",
  );
});

test("stat-plan ordering: a failing input last in manifest and first in path leaves earlier caps intact", () => {
  const dir = tempPackage();
  // Manifest order: project, second, a-fail (last). Path order: a-fail, project,
  // second: the failing input is opened first but planned last, so it cannot
  // constrain the caps of the readable inputs.
  addInputs(dir, [
    { id: "input:second", file: "inputs/second.yml", bytes: Buffer.from("s".repeat(390)) },
    { id: "input:a-fail", file: "inputs/a-fail.yml", bytes: Buffer.from("failing\n") },
  ]);
  const target = path.join(dir, "inputs", "a-fail.yml");
  const result = verify(dir, target, "fail-read");

  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "FAIL");
  const io = report.diagnostics.find(
    (diagnostic: any) =>
      diagnostic.code === "pap.package.io" && diagnostic.scope === "input:a-fail",
  );
  assert.ok(io, "the failing input is reported as pap.package.io");
  assert.ok(
    !report.diagnostics.some((diagnostic: any) => diagnostic.code === "pap.package.limit-exceeded"),
    "the earlier planned caps are unaffected when the failure is last in manifest order",
  );
  assert.ok(
    !report.diagnostics.some(
      (diagnostic: any) => diagnostic.code === "pap.integrity.input-mismatch",
    ),
    "the readable inputs keep their correct digests",
  );
  assert.ok(
    report.diagnostics.every((diagnostic: any) =>
      KNOWN_INPUT_DIAGNOSTIC_CODES.has(diagnostic.code),
    ),
  );
  for (const relative of ["inputs/a-fail.yml", "inputs/project.yml", "inputs/second.yml"]) {
    assertResolvedAndOpenedOnce(result.ops, path.join(dir, relative), relative);
  }
});
