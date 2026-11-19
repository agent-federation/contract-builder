import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { copyEngineProject, ENGINE_RENDERERS } from "./support.js";

const base = (specDir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: ENGINE_RENDERERS,
  allowExecutableProfile: true,
  ...overrides,
});

test("вывод: ошибка записи артефакта — диагностика ERR_IO, а не внутренняя ошибка", async () => {
  const dir = await copyEngineProject("output-write-failure");
  // A regular file where the output directory must go makes the final mkdir fail.
  await writeFile(path.join(dir, "output"), "not a directory\n", "utf8");

  const result = await runBuild(base(dir, { write: true }));

  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.equal(result.written, false);
  assert.ok(result.markdown !== null, "the rendered markdown was discarded");
  const diagnostic = result.diagnostics.find((d) => d.code === "ERR_IO");
  assert.ok(diagnostic !== undefined, result.diagnostics.map((d) => d.message).join("\n"));
  assert.equal(diagnostic.file, "output/EXAMPLE.draft.md");
  assert.match(diagnostic.message, /Failed to write the output/);
  assert.equal(
    result.diagnostics.some((item) => item.code.startsWith("core.")),
    false,
    "the write failure was classified as an engine diagnostic",
  );
});
