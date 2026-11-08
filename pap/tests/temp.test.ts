import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanupTempDirs, tempDir } from "./temp.js";

after(cleanupTempDirs);

const testFile = fileURLToPath(import.meta.url);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const CHILD_FLAG = "PAP_TEMP_FAILURE_CHILD";
const CHILD_MARKER = "PAP_TEMP_FAILURE_MARKER";

if (process.env[CHILD_FLAG] === "1") {
  // The parent run of this file starts a child suite from the `else` branch
  // below; this branch is the deliberately failing test inside that child.
  test("a failing test still leaves no temp directory behind", () => {
    const dir = tempDir("failing-child-");
    writeFileSync(process.env[CHILD_MARKER] as string, dir);
    throw new Error("simulated failure");
  });
} else {
  test("temp directories share one owned root and cleanup removes all of them", () => {
    const first = tempDir("first-");
    const second = tempDir("second-");
    assert.equal(path.dirname(first), path.dirname(second));
    assert.ok(path.basename(path.dirname(first)).startsWith("pap-test-root-"));
    assert.ok(existsSync(first));
    assert.ok(existsSync(second));

    cleanupTempDirs();
    assert.equal(existsSync(first), false);
    assert.equal(existsSync(second), false);

    const next = tempDir("next-");
    assert.ok(existsSync(next));
  });

  test("suite teardown removes the temp root when a test fails", () => {
    const marker = path.join(tempDir("failure-marker-"), "created.txt");
    const child = spawnSync(process.execPath, ["test", testFile], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, [CHILD_FLAG]: "1", [CHILD_MARKER]: marker },
      timeout: 60_000,
    });
    assert.notEqual(child.status, 0, "the simulated failing test must fail the child run");
    assert.match(child.stdout + child.stderr, /simulated failure/);

    const created = readFileSync(marker, "utf8");
    assert.equal(existsSync(created), false, `suite teardown left ${created} behind`);
  });
}
