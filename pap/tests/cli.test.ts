import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtures, runPap } from "./support.js";

const base = path.join(fixtures, "base");

test("--version prints the pinned version surface", () => {
  const result = runPap(["--version"], base);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const lines = result.stdout.trimEnd().split("\n");
  assert.equal(lines[0], "pap 0.1.0");
  assert.equal(lines[1], "papVersion support: 0.1");
  assert.equal(lines[2], "reportVersion support: 0.1");
  assert.match(lines[3] as string, /^implementationDigest: sha256:[0-9a-f]{64}$/);
});

test("--help prints the synopsis and exit-code table", () => {
  const result = runPap(["--help"], base);
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes("pap verify PACKAGE"));
  assert.ok(result.stdout.includes("exit codes:"));
  assert.ok(result.stdout.includes("64 usage error"));
});

test("usage errors exit 64 with stderr and no stdout", () => {
  const cases: string[][] = [
    [],
    ["unknown"],
    ["verify"],
    ["verify", ".", "extra"],
    ["verify", ".", "--format", "yaml"],
    ["verify", ".", "--format", "text", "--format", "json"],
    ["verify", ".", "--trust-policy"],
    ["verify", ".", "--now", "not-a-time"],
    ["inspect", ".", "--trust-policy", "policy.json"],
    ["inspect", ".", "--now", "2026-11-02T00:00:00Z"],
    ["explain", ".", "--trust-policy", "policy.json", "--check", "pap.check.digest-integrity/1"],
    ["explain", ".", "--now", "2026-11-02T00:00:00Z", "--check", "pap.check.digest-integrity/1"],
    ["explain", "."],
    ["explain", ".", "--check", "pap.check.digest-integrity/1", "--check", "pap.check.source-quote/1"],
    ["--version", "extra"],
    ["--help", "verify"],
  ];
  for (const argv of cases) {
    const result = runPap(argv, base);
    assert.equal(result.status, 64, `${argv.join(" ")} must exit 64`);
    assert.equal(result.stdout, "", `${argv.join(" ")} must not write stdout`);
    assert.ok(result.stderr.length > 0, `${argv.join(" ")} must write a stderr diagnostic`);
  }
});

test("a missing package path is an I/O failure (74)", () => {
  const result = runPap(["verify", "does-not-exist"], base);
  assert.equal(result.status, 74);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("pap.package.not-found"));
});

test("an existing non-directory package path is a usage error (64)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-cli-"));
  const file = path.join(dir, "package.tar");
  writeFileSync(file, "not a directory");
  const result = runPap(["verify", file], base);
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("pap.cli.usage"));
});

test("explain with an undeclared check exits 64", () => {
  const result = runPap(["explain", ".", "--check", "pap.check.absent/1"], base);
  assert.equal(result.status, 64);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("pap.cli.unknown-check"));
});

test("-- ends option parsing so a package path may start with a dash", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "pap-dash-"));
  const packageDir = path.join(parent, "-pkg");
  cpSync(base, packageDir, { recursive: true });
  const result = runPap(["verify", "--format", "json", "--now", "2026-11-02T00:00:00Z", "--", "-pkg"], parent);
  assert.notEqual(result.status, 64);
  assert.ok(result.stdout.includes('"verdict":"PASS"'));
});

test("--now normalises offsets and preserves the fraction, rejecting leap seconds", () => {
  const offset = runPap(
    ["verify", ".", "--format", "json", "--now", "2026-11-02T01:00:00+01:00"],
    base,
  );
  assert.equal(offset.status, 0);
  assert.equal(JSON.parse(offset.stdout).evaluatedAt, "2026-11-02T00:00:00Z");

  const fraction = runPap(
    ["verify", ".", "--format", "json", "--now", "2026-11-02T00:00:00.120000000Z"],
    base,
  );
  assert.equal(fraction.status, 0);
  assert.equal(JSON.parse(fraction.stdout).evaluatedAt, "2026-11-02T00:00:00.12Z");

  const leap = runPap(["verify", ".", "--now", "2026-11-02T00:00:60Z"], base);
  assert.equal(leap.status, 64);
  assert.equal(leap.stdout, "");
});
