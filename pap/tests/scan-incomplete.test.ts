import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtures, runPap } from "./support.js";

const NOW = "2026-11-02T00:00:00Z";
const base = path.join(fixtures, "base");
const scanIncompleteCode = "pap.package.undeclared-scan-incomplete";
const runningAsRoot = typeof process.getuid === "function" && process.getuid() === 0;
const skipPermissionTest =
  runningAsRoot
    ? "permission bits do not bind a root process"
    : process.platform === "win32"
      ? "permission bits are not enforced on Windows"
      : false;

function tempPackage(source = base): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-scan-incomplete-"));
  cpSync(source, dir, { recursive: true });
  return dir;
}

function verify(dir: string, extra: string[] = []): { status: number; stdout: string; stderr: string } {
  return runPap(["verify", ".", "--format", "json", "--now", NOW, ...extra], dir);
}

function codes(report: any): string[] {
  return report.diagnostics.map((diagnostic: any) => diagnostic.code);
}

function assertScanIncompleteReport(report: any, result: { status: number }): void {
  assert.equal(result.status, 2);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.coverage.full, false);
  assert.equal(report.dimensions.integrity.package, "PASS");
  assert.equal(report.dimensions.integrity.artifacts, "PASS");
  const scan = report.diagnostics.filter((diagnostic: any) => diagnostic.code === scanIncompleteCode);
  assert.equal(scan.length >= 1, true);
  assert.ok(scan.every((diagnostic: any) => diagnostic.severity === "warning"));
  assert.ok(scan.every((diagnostic: any) => diagnostic.scope === "package"));
  assert.ok(report.limitations.some((limitation: any) => limitation.code === scanIncompleteCode));
  assert.ok(!codes(report).includes("pap.package.limit-exceeded"));
  assert.ok(!codes(report).includes("pap.package.io"));
}

test(
  "an unlistable package root with a readable manifest is scan-incomplete, not a package FAIL",
  { skip: skipPermissionTest },
  () => {
    const dir = tempPackage();
    try {
      chmodSync(dir, 0o111);
      const result = verify(dir);
      assertScanIncompleteReport(JSON.parse(result.stdout), result);
    } finally {
      chmodSync(dir, 0o755);
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test(
  "an unreadable undeclared directory is scan-incomplete, not a package FAIL",
  { skip: skipPermissionTest },
  () => {
    const dir = tempPackage();
    const notes = path.join(dir, "notes");
    mkdirSync(notes);
    writeFileSync(path.join(notes, "extra.txt"), "extra\n");
    try {
      chmodSync(notes, 0o000);
      const result = verify(dir);
      assertScanIncompleteReport(JSON.parse(result.stdout), result);
    } finally {
      chmodSync(notes, 0o755);
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("the private traversal-depth budget is scan-incomplete, never a limit violation", () => {
  const dir = tempPackage();
  let cursor = path.join(dir, "notes");
  mkdirSync(cursor);
  for (let index = 0; index < 16; index += 1) {
    cursor = path.join(cursor, `d${index}`);
    mkdirSync(cursor);
  }
  writeFileSync(path.join(cursor, "leaf.txt"), "x\n");
  try {
    const result = verify(dir);
    assertScanIncompleteReport(JSON.parse(result.stdout), result);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "an independently established FAIL stays FAIL under scan-incomplete coverage",
  { skip: skipPermissionTest },
  () => {
    const dir = tempPackage(path.join(fixtures, "F02-artifact-byte"));
    const notes = path.join(dir, "notes");
    mkdirSync(notes);
    writeFileSync(path.join(notes, "extra.txt"), "extra\n");
    try {
      chmodSync(notes, 0o000);
      const result = verify(dir);
      assert.equal(result.status, 1);
      const report = JSON.parse(result.stdout);
      assert.equal(report.verdict, "FAIL");
      assert.equal(report.coverage.full, false);
      assert.equal(report.dimensions.integrity.artifacts, "FAIL");
      assert.equal(report.dimensions.integrity.package, "PASS");
      assert.ok(codes(report).includes("pap.integrity.artifact-mismatch"));
      assert.ok(codes(report).includes(scanIncompleteCode));
      assert.ok(!codes(report).includes("pap.package.io"));
    } finally {
      chmodSync(notes, 0o755);
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test("a missing declared payload remains a package FAIL, not scan-incomplete", () => {
  const dir = tempPackage();
  rmSync(path.join(dir, "artifacts/ACME-SUPPLIER.draft.md"));
  try {
    const result = verify(dir);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.dimensions.integrity.package, "FAIL");
    assert.equal(report.dimensions.integrity.artifacts, "FAIL");
    assert.ok(codes(report).includes("pap.package.declared-file-missing"));
    assert.ok(!codes(report).includes(scanIncompleteCode));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "inspect reports the same scan-incomplete code without a limit violation",
  { skip: skipPermissionTest },
  () => {
    const dir = tempPackage();
    const notes = path.join(dir, "notes");
    mkdirSync(notes);
    writeFileSync(path.join(notes, "extra.txt"), "extra\n");
    try {
      chmodSync(notes, 0o000);
      const result = runPap(["inspect", ".", "--format", "json"], dir);
      assert.equal(result.status, 2);
      const document = JSON.parse(result.stdout);
      assert.equal(document.inspection, "PARTIAL");
      const limitationCodes = document.limitations.map((limitation: any) => limitation.code);
      assert.ok(limitationCodes.includes(scanIncompleteCode));
      assert.ok(!limitationCodes.includes("pap.package.limit-exceeded"));
      assert.ok(!limitationCodes.includes("pap.package.io"));
    } finally {
      chmodSync(notes, 0o755);
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
