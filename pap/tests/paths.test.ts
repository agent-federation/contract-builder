import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { streamPackageFile } from "../src/paths.js";
import { DEFAULT_LIMITS } from "../src/types.js";

test("a declared path that is not root-confined reports path-escape before reading", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pap-path-escape-"));
  writeFileSync(path.join(dir, "payload.txt"), "payload");
  const root = { supplied: dir, real: dir };

  for (const relative of ["../outside.txt", "a/../payload.txt", "./payload.txt"]) {
    const result = await streamPackageFile(root, relative, DEFAULT_LIMITS, 1_024, () => {});
    assert.equal(result.ok, false, relative);
    assert.equal(result.failure, "path-escape", relative);
  }
});
