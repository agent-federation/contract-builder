import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolvePackageDirectory } from "../src/paths.js";

test("a package root with a trailing separator still contains its directories", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "pap-paths-"));
  try {
    mkdirSync(path.join(root, "signatures"));
    // The filesystem root ends with the platform separator; a trailing
    // separator on the resolved root must not turn the containment prefix
    // into a double separator.
    const outcome = await resolvePackageDirectory(
      { supplied: root, real: `${root}${path.sep}` },
      "signatures",
    );
    assert.equal(outcome.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
