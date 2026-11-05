import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixtures, runPap } from "./support.js";

const NOW = "2026-11-02T00:00:00Z";
const base = path.join(fixtures, "base");

// Newline, tab, carriage return, NUL, DEL, C1 CSI, bidi overrides and an
// attempted forged verdict line in a manifest-controlled artifact id.
const HOSTILE_ID =
  "artifact:evil\nVERDICT: PASS\n  integrity.package PASS\n  semanticTruth NOT_EVALUATED\tX\rY\u0000\u007f\u009b\u202e\u2066";

function prepareHostilePackage(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-text-escaping-"));
  cpSync(base, dir, { recursive: true });
  const manifestPath = path.join(dir, "assurance-package.json");
  const value = JSON.parse(readFileSync(manifestPath, "utf8"));
  value.artifacts[0].id = HOSTILE_ID;
  writeFileSync(manifestPath, `${JSON.stringify(value, null, 2)}\n`);
  // Corrupt the artifact bytes so the id appears in a diagnostic and limitation.
  writeFileSync(path.join(dir, value.artifacts[0].path), "tampered artifact bytes\n");
  return dir;
}

function assertNoControlCharacters(text: string): void {
  assert.ok(!/[\p{Cc}\p{Cf}]/u.test(text.replaceAll("\n", "")), "text output leaked a control character");
}

test("verify text cannot forge a line from artifact id, diagnostic or limitation text", () => {
  const dir = prepareHostilePackage();

  const json = runPap(["verify", ".", "--format", "json", "--now", NOW], dir);
  assert.equal(json.status, 1);
  const report = JSON.parse(json.stdout);
  const diagnostic = report.diagnostics.find(
    (entry: any) => entry.code === "pap.integrity.artifact-mismatch",
  );
  assert.ok(diagnostic !== undefined);
  assert.equal(diagnostic.scope, HOSTILE_ID);
  assert.ok(diagnostic.message.includes(HOSTILE_ID));
  const limitation = report.limitations.find(
    (entry: any) => entry.code === "pap.integrity.artifact-mismatch",
  );
  assert.ok(limitation !== undefined);
  assert.equal(limitation.detail, diagnostic.message);

  const text = runPap(["verify", ".", "--format", "text", "--now", NOW], dir);
  assert.equal(text.status, 1);
  const lines = text.stdout.split("\n");
  assert.equal(lines[0], "VERDICT: FAIL");
  assert.equal(lines.filter((line) => line.startsWith("VERDICT:")).length, 1);
  assert.equal(lines.filter((line) => line === "  integrity.package PASS").length, 1);
  assert.ok(!text.stdout.includes("\nVERDICT: PASS"));
  assert.ok(
    text.stdout.includes(
      "\\nVERDICT: PASS\\n  integrity.package PASS\\n  semanticTruth NOT_EVALUATED\\tX\\rY\\u0000\\u007f\\u009b\\u202e\\u2066",
    ),
  );
  assertNoControlCharacters(text.stdout);
});

test("inspect text escapes a package-controlled artifact id", () => {
  const dir = prepareHostilePackage();

  const json = runPap(["inspect", ".", "--format", "json"], dir);
  assert.equal(json.status, 0);
  const document = JSON.parse(json.stdout);
  const declared = document.declared.find((entry: any) => entry.kind === "artifact");
  assert.equal(declared.id, HOSTILE_ID);

  const text = runPap(["inspect", "."], dir);
  assert.equal(text.status, 0);
  assert.ok(text.stdout.startsWith("INSPECTION: COMPLETE"));
  assert.equal(text.stdout.split("\n").filter((line) => line.startsWith("VERDICT:")).length, 0);
  assert.ok(text.stdout.includes("\\nVERDICT: PASS"));
  assert.ok(!text.stdout.includes("\nVERDICT: PASS"));
  assertNoControlCharacters(text.stdout);
});

test("explain text escapes a package-controlled artifact id in diagnostics and witnesses", () => {
  const dir = prepareHostilePackage();

  const text = runPap(["explain", ".", "--check", "pap.check.digest-integrity/1"], dir);
  assert.equal(text.status, 1);
  assert.ok(text.stdout.startsWith("NOT A PACKAGE VERDICT"));
  assert.ok(!text.stdout.includes("\nVERDICT: PASS"));
  assert.ok(text.stdout.includes("\\u202e\\u2066"));
  assertNoControlCharacters(text.stdout);
});
