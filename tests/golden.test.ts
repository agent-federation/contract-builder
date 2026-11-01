import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { Diagnostics, type Diagnostic } from "../spec/lib/diagnostics.js";

/**
 * Golden baseline for the CORE-001 draft build.
 *
 * These snapshots record the behaviour that exists at the start of the M1 migration:
 * the artifact bytes, the diagnostics as rendered (sorted), and the diagnostics in the
 * order the checks emitted them. Every later M1 PR must keep the artifact and the rendered
 * snapshot byte-identical. The emission snapshot may be updated with an explicit rationale
 * when checks move between modules, provided the artifact and the rendered snapshot do not
 * change (see docs/architecture/m1-implementation-plan.md, section 9.1).
 *
 * Do not regenerate these files to make a failing build pass.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const specDir = path.join(root, "spec");
const goldenDir = path.join(root, "tests", "golden");

interface DiagnosticSnapshot {
  code: string;
  severity: string;
  file: string;
  pointer: string;
  message: string;
}

const toSnapshot = (diagnostic: Diagnostic): DiagnosticSnapshot => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  file: diagnostic.file,
  pointer: diagnostic.pointer,
  message: diagnostic.message,
});

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

async function recordedHash(): Promise<string> {
  const text = await readFile(path.join(goldenDir, "core001.draft.sha256"), "utf8");
  const hash = text.trim().split(/\s+/)[0];
  assert.ok(hash !== undefined && /^[0-9a-f]{64}$/.test(hash), "golden hash file is malformed");
  return hash;
}

async function recordedSnapshot(name: string): Promise<DiagnosticSnapshot[]> {
  return JSON.parse(await readFile(path.join(goldenDir, name), "utf8")) as DiagnosticSnapshot[];
}

async function draftBuild(
  overrides: Partial<BuildOptions> = {},
): Promise<{ result: Awaited<ReturnType<typeof runBuild>>; diagnostics: Diagnostics }> {
  const diagnostics = new Diagnostics();
  const result = await runBuild({
    specDir,
    mode: "draft",
    write: false,
    check: false,
    strict: false,
    diagnostics,
    ...overrides,
  });
  return { result, diagnostics };
}

test("golden: draft build is byte-identical to the recorded hash", async () => {
  const { result } = await draftBuild();
  assert.ok(result.markdown !== null, "draft build produced no markdown");
  assert.equal(sha256(result.markdown), await recordedHash());
});

test("golden: rendered diagnostics match the recorded snapshot in order", async () => {
  const { diagnostics } = await draftBuild();
  assert.deepEqual(diagnostics.sorted().map(toSnapshot), await recordedSnapshot("core001.diagnostics.json"));
});

test("golden: emission order matches the recorded snapshot", async () => {
  const { diagnostics } = await draftBuild();
  assert.deepEqual(
    diagnostics.emissionOrder().map(toSnapshot),
    await recordedSnapshot("core001.emission.json"),
  );
});

test("golden: recorded hash matches the committed artifact", async () => {
  const artifact = await readFile(path.join(specDir, "output", "CORE-001.draft.md"), "utf8");
  assert.equal(sha256(artifact), await recordedHash());
});

test("golden: sorted() also returns copies and cannot mutate the collector", () => {
  const diagnostics = new Diagnostics();
  diagnostics.error("ERR_SENTINEL", "sentinel.yml", "/sentinel", "sentinel message");

  const first = diagnostics.sorted();
  first[0]!.code = "MUTATED";
  first[0]!.message = "mutated";

  const second = diagnostics.sorted();
  assert.equal(second.length, 1);
  assert.equal(second[0]!.code, "ERR_SENTINEL");
  assert.equal(second[0]!.message, "sentinel message");
});

test("golden: emissionOrder() returns a copy and cannot mutate the collector", () => {
  const diagnostics = new Diagnostics();
  diagnostics.warning("WARN_SENTINEL", "sentinel.yml", "/sentinel", "sentinel message");

  const first = diagnostics.emissionOrder();
  first.reverse();
  first[0]!.code = "MUTATED";
  first[0]!.message = "mutated";

  const second = diagnostics.emissionOrder();
  assert.equal(second.length, 1);
  assert.equal(second[0]!.code, "WARN_SENTINEL");
  assert.equal(second[0]!.message, "sentinel message");
  assert.deepEqual(diagnostics.sorted().map(toSnapshot), [
    {
      code: "WARN_SENTINEL",
      severity: "warning",
      file: "sentinel.yml",
      pointer: "/sentinel",
      message: "sentinel message",
    },
  ]);
});
