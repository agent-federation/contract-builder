import { after, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { opendir } from "node:fs/promises";
import path from "node:path";
import type { DirectoryOpener } from "../src/paths.js";
import { parseRfc3339 } from "../src/time.js";
import { DEFAULT_LIMITS } from "../src/types.js";
import { verifyPackage } from "../src/verify.js";
import { fixtures, runPap } from "./support.js";
import { cleanupTempDirs, tempDir } from "./temp.js";

after(cleanupTempDirs);

const NOW = "2026-11-02T00:00:00Z";
const NOW_INSTANT = parseRfc3339(NOW);
if (NOW_INSTANT === null) throw new Error(`invalid test clock: ${NOW}`);
const base = path.join(fixtures, "base");
const scanIncompleteCode = "pap.package.undeclared-scan-incomplete";
const scanIncompleteMessage =
  "the undeclared-file scan is incomplete; the absence of undeclared files was not established";
const requiredPolicy = path.join(fixtures, "trust-policy", "signature-required.json");
const runningAsRoot = typeof process.getuid === "function" && process.getuid() === 0;
const skipPermissionTest = runningAsRoot
  ? "permission bits do not bind a root process"
  : process.platform === "win32"
    ? "permission bits are not enforced on Windows"
    : false;

function tempPackage(source = base): string {
  const dir = tempDir("scan-incomplete-");
  cpSync(source, dir, { recursive: true });
  return dir;
}

function verify(
  dir: string,
  extra: string[] = [],
): { status: number; stdout: string; stderr: string } {
  return runPap(["verify", ".", "--format", "json", "--now", NOW, ...extra], dir);
}

function inProcessVerify(
  dir: string,
  options: { policyPath?: string; openDirectory?: DirectoryOpener } = {},
): ReturnType<typeof verifyPackage> {
  return verifyPackage({
    packagePath: dir,
    now: NOW_INSTANT as bigint,
    ...(options.policyPath === undefined ? {} : { policyPath: options.policyPath }),
    ...(options.openDirectory === undefined ? {} : { openDirectory: options.openDirectory }),
  });
}

/**
 * Wrap `opendir` and fail the nth call for one directory. This makes an
 * enumeration failure deterministic even when `mode 000` does not bind (for
 * example under an elevated test process).
 */
function failingOpener(directoryName: string, failOnCall: number): DirectoryOpener {
  const calls = new Map<string, number>();
  return (async (absolute, options) => {
    const key = String(absolute);
    if (path.basename(key) === directoryName) {
      const count = (calls.get(key) ?? 0) + 1;
      calls.set(key, count);
      if (count === failOnCall) {
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      }
    }
    return options === undefined
      ? opendir(absolute)
      : opendir(absolute, options as Parameters<typeof opendir>[1]);
  }) as DirectoryOpener;
}

/**
 * Return a synthetic entry stream on one open of one directory, so a private
 * entry budget can be exceeded without creating thousands of real files. The
 * earlier open (the undeclared-file walk) still uses the real directory.
 */
function overBudgetOpener(directoryName: string, openNumber: number): DirectoryOpener {
  const calls = new Map<string, number>();
  const budget = Math.max(1_024, DEFAULT_LIMITS.payloadFiles * 2);
  return (async (absolute, options) => {
    const key = String(absolute);
    if (path.basename(key) === directoryName) {
      const count = (calls.get(key) ?? 0) + 1;
      calls.set(key, count);
      if (count === openNumber) {
        return {
          close: async () => {},
          async *[Symbol.asyncIterator]() {
            for (let index = 0; index <= budget; index += 1) {
              yield {
                name: `filler-${index}.txt`,
                isFile: () => true,
                isDirectory: () => false,
                isSymbolicLink: () => false,
              };
            }
          },
        } as unknown as Awaited<ReturnType<DirectoryOpener>>;
      }
    }
    return options === undefined
      ? opendir(absolute)
      : opendir(absolute, options as Parameters<typeof opendir>[1]);
  }) as DirectoryOpener;
}

function codes(report: any): string[] {
  return report.diagnostics.map((diagnostic: any) => diagnostic.code);
}

function assertCanonicalScanIncomplete(report: any): void {
  const scan = report.diagnostics.filter(
    (diagnostic: any) => diagnostic.code === scanIncompleteCode,
  );
  assert.equal(scan.length, 1, "exactly one canonical scan-incomplete diagnostic");
  assert.equal(scan[0].code, "pap.package.undeclared-scan-incomplete");
  assert.equal(scan[0].severity, "warning");
  assert.equal(scan[0].scope, "package");
  assert.equal(scan[0].message, scanIncompleteMessage);
  const limitations = report.limitations.filter(
    (limitation: any) => limitation.code === scanIncompleteCode,
  );
  assert.equal(limitations.length, 1, "exactly one canonical scan-incomplete limitation");
  assert.equal(limitations[0].detail, scanIncompleteMessage);
  assert.equal(report.coverage.full, false);
  assert.ok(!codes(report).includes("pap.package.io"));
  assert.ok(!codes(report).includes("pap.package.limit-exceeded"));
}

function assertScanIncompleteReport(report: any, result: { status: number }): void {
  assert.equal(result.status, 2);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.integrity.package, "PASS");
  assert.equal(report.dimensions.integrity.artifacts, "PASS");
  assertCanonicalScanIncomplete(report);
}

test("an unlistable package root with a readable manifest is scan-incomplete, not a package FAIL", {
  skip: skipPermissionTest,
}, () => {
  const dir = tempPackage();
  try {
    chmodSync(dir, 0o111);
    const result = verify(dir);
    assertScanIncompleteReport(JSON.parse(result.stdout), result);
  } finally {
    chmodSync(dir, 0o755);
  }
});

test("an unreadable undeclared directory is scan-incomplete, not a package FAIL", {
  skip: skipPermissionTest,
}, () => {
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
  }
});

test("the private traversal-depth budget is scan-incomplete, never a limit violation", () => {
  const dir = tempPackage();
  let cursor = path.join(dir, "notes");
  mkdirSync(cursor);
  for (let index = 0; index < 16; index += 1) {
    cursor = path.join(cursor, `d${index}`);
    mkdirSync(cursor);
  }
  writeFileSync(path.join(cursor, "leaf.txt"), "x\n");
  const result = verify(dir);
  assertScanIncompleteReport(JSON.parse(result.stdout), result);
});

test("an unreadable signatures/ directory is scan-incomplete, not a package-I/O FAIL", {
  skip: skipPermissionTest,
}, () => {
  const dir = tempPackage();
  const signatures = path.join(dir, "signatures");
  mkdirSync(signatures);
  try {
    chmodSync(signatures, 0o000);
    const result = verify(dir);
    const report = JSON.parse(result.stdout);
    assertScanIncompleteReport(report, result);
    // RFC §4.3.3: no dimension is NOT_EVALUATED solely for the scan condition.
    assert.equal(report.dimensions.signature.validity, "NOT_APPLICABLE");
    assert.equal(report.dimensions.sources.integrity, "PASS");
    assert.equal(report.dimensions.checks.results.length, 3);
  } finally {
    chmodSync(signatures, 0o755);
  }
});

test("an unreadable signatures/ directory under a required-signature policy is scan-incomplete", {
  skip: skipPermissionTest,
}, () => {
  const dir = tempPackage();
  const signatures = path.join(dir, "signatures");
  mkdirSync(signatures);
  try {
    chmodSync(signatures, 0o000);
    const result = verify(dir, ["--trust-policy", requiredPolicy]);
    const report = JSON.parse(result.stdout);
    assertScanIncompleteReport(report, result);
    // The ordinary required-signature evaluation of an empty directory is
    // preserved; the discovery failure does not change it to something else.
    assert.equal(report.dimensions.signature.validity, "NOT_EVALUATED");
    assert.equal(report.dimensions.trust.signerIdentity, "NOT_APPLICABLE");
    assert.equal(report.dimensions.trust.policyDecision, "NOT_EVALUATED");
    assert.ok(
      !codes(report).includes("pap.signature.absent"),
      "an incomplete scan does not establish that no signature is present",
    );
  } finally {
    chmodSync(signatures, 0o755);
  }
});

test("an independently established FAIL stays FAIL under scan-incomplete coverage", {
  skip: skipPermissionTest,
}, () => {
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
  }
});

test("an injected signatures/ opendir failure is scan-incomplete, not a package-I/O FAIL", async () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  const { report, exitCode } = await inProcessVerify(dir, {
    openDirectory: failingOpener("signatures", 1),
  });
  assert.equal(exitCode, 2);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.integrity.package, "PASS");
  assert.equal(report.dimensions.integrity.artifacts, "PASS");
  assert.equal(report.dimensions.sources.integrity, "PASS");
  assert.equal(report.dimensions.signature.validity, "NOT_APPLICABLE");
  assertCanonicalScanIncomplete(report);
});

test("signature discovery alone reports the scan-incomplete condition exactly once", async () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  // The general walker enumerates `signatures/` first and succeeds; signature
  // discovery is then the only enumeration that fails.
  const { report, exitCode } = await inProcessVerify(dir, {
    openDirectory: failingOpener("signatures", 2),
  });
  assert.equal(exitCode, 2);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.integrity.package, "PASS");
  assert.equal(report.dimensions.signature.validity, "NOT_APPLICABLE");
  assertCanonicalScanIncomplete(report);
});

test("the private signature entry budget is scan-incomplete, never a limit violation", async () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  const { report, exitCode } = await inProcessVerify(dir, {
    // The first open is the undeclared-file walk; the second is signature
    // discovery, which is the scan this test drives over its private budget.
    openDirectory: overBudgetOpener("signatures", 2),
  });
  assertScanIncompleteReport(report, { status: exitCode });
  // RFC §4.3.3: no dimension is NOT_EVALUATED solely for the private stop.
  assert.equal(report.dimensions.signature.validity, "NOT_APPLICABLE");
  assert.equal(report.dimensions.trust.signerIdentity, "NOT_APPLICABLE");
  // Exact comparisons, not URL-like substring checks (CodeQL js/incomplete-url-substring-sanitization).
  assert.ok(codes(report).every((code) => code !== "pap.package.io"));
  assert.ok(codes(report).every((code) => code !== "pap.package.limit-exceeded"));
  // The synthetic stream must have reached signature discovery, not the
  // undeclared-file walk (which sees the real, empty directory).
  assert.ok(!codes(report).includes("pap.package.undeclared-file"));
});

test("the private signature entry budget under a required policy keeps the ordinary dimensions", async () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  const { report, exitCode } = await inProcessVerify(dir, {
    policyPath: requiredPolicy,
    openDirectory: overBudgetOpener("signatures", 2),
  });
  assertScanIncompleteReport(report, { status: exitCode });
  // An incomplete scan does not establish that no signature is present; the
  // ordinary required-mode empty-directory result is preserved.
  assert.equal(report.dimensions.signature.validity, "NOT_EVALUATED");
  assert.equal(report.dimensions.trust.signerIdentity, "NOT_APPLICABLE");
  assert.equal(report.dimensions.trust.policyDecision, "NOT_EVALUATED");
  assert.ok(!codes(report).includes("pap.signature.absent"));
  assert.ok(codes(report).every((code) => code !== "pap.package.limit-exceeded"));
});

test("an injected signatures/ failure under a required policy keeps the ordinary dimensions", async () => {
  const dir = tempPackage();
  mkdirSync(path.join(dir, "signatures"));
  const { report, exitCode } = await inProcessVerify(dir, {
    policyPath: requiredPolicy,
    openDirectory: failingOpener("signatures", 2),
  });
  assert.equal(exitCode, 2);
  assert.equal(report.verdict, "INCOMPLETE");
  assert.equal(report.dimensions.signature.validity, "NOT_EVALUATED");
  assert.equal(report.dimensions.trust.signerIdentity, "NOT_APPLICABLE");
  assert.equal(report.dimensions.trust.policyDecision, "NOT_EVALUATED");
  assert.ok(!codes(report).includes("pap.signature.absent"));
  assert.equal(report.coverage.full, false);
  assertCanonicalScanIncomplete(report);
});

test("an injected independent FAIL stays FAIL under the scan condition", async () => {
  const dir = tempPackage(path.join(fixtures, "F02-artifact-byte"));
  mkdirSync(path.join(dir, "signatures"));
  const { report, exitCode } = await inProcessVerify(dir, {
    openDirectory: failingOpener("signatures", 2),
  });
  assert.equal(exitCode, 1);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.coverage.full, false);
  assert.equal(report.dimensions.integrity.artifacts, "FAIL");
  assert.equal(report.dimensions.integrity.package, "PASS");
  assert.ok(codes(report).includes("pap.integrity.artifact-mismatch"));
  assertCanonicalScanIncomplete(report);
});

test("a missing declared payload remains a package FAIL, not scan-incomplete", () => {
  const dir = tempPackage();
  rmSync(path.join(dir, "artifacts/ACME-SUPPLIER.draft.md"));
  const result = verify(dir);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verdict, "FAIL");
  assert.equal(report.dimensions.integrity.package, "FAIL");
  assert.equal(report.dimensions.integrity.artifacts, "FAIL");
  assert.ok(codes(report).includes("pap.package.declared-file-missing"));
  assert.ok(!codes(report).includes(scanIncompleteCode));
});

test("an unreadable declared artifacts directory remains a declared-payload FAIL", {
  skip: skipPermissionTest,
}, () => {
  const dir = tempPackage();
  const artifacts = path.join(dir, "artifacts");
  try {
    chmodSync(artifacts, 0o000);
    const result = verify(dir);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.coverage.full, false);
    assert.equal(report.dimensions.integrity.package, "FAIL");
    assert.equal(report.dimensions.integrity.artifacts, "FAIL");
    assert.ok(codes(report).includes("pap.package.io"));
    assert.ok(codes(report).includes("pap.package.declared-file-missing"));
    assert.ok(!codes(report).includes("pap.package.limit-exceeded"));
    // The same unreadable directory also stops the undeclared-file scan;
    // that warning must not downgrade the declared-payload FAIL.
    const scan = report.diagnostics.filter(
      (diagnostic: any) => diagnostic.code === scanIncompleteCode,
    );
    assert.ok(scan.every((diagnostic: any) => diagnostic.severity === "warning"));
  } finally {
    chmodSync(artifacts, 0o755);
  }
});

test("inspect reports the same scan-incomplete code without a limit violation", {
  skip: skipPermissionTest,
}, () => {
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
  }
});
