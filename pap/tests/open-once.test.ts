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
): { status: number; stdout: string; stderr: string; ops: Op[] } {
  const log = path.join(tempDir("open-once-log-"), "ops.jsonl");
  const result = runPap(
    ["verify", ".", "--trust-policy", policy, "--format", "json", "--now", NOW, ...extra],
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

  const opens = result.ops.filter((op) => op.op === "open" && op.path === target);
  assert.equal(opens.length, 1, "each declared input must be opened exactly once");
  assert.equal(closeCount(result.ops, target), 1, "the descriptor must be closed");

  const firstOpen = result.ops.findIndex((op) => op.op === "open" && op.path === target);
  assert.ok(firstOpen >= 0);
  const afterOpen = result.ops.slice(firstOpen + 1);
  assert.ok(
    !afterOpen.some(
      (op) => op.path === target && (op.op === "lstat" || op.op === "realpath" || op.op === "open"),
    ),
    "no path resolution or open may follow the first open",
  );

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
  assert.equal(openCount(result.ops, target), 1);
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
  assert.equal(openCount(result.ops, target), 1);
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
  assert.equal(openCount(ops, target), 1);
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
  assert.equal(openCount(result.ops, target), 1);
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
  for (const relative of ["inputs/project.yml", "inputs/z.yml"]) {
    assert.equal(openCount(ops, path.join(dir, relative)), 1);
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
    assert.equal(
      openCount(result.ops, path.join(dir, relative)),
      1,
      `${relative} is opened exactly once`,
    );
  }
});
