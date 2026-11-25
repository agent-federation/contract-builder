import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_LIMITS } from "../src/types.js";
import { resolvePackageDirectory, walkPackageFiles } from "../src/paths.js";
import { cleanupTempDirs, tempDir } from "./temp.js";

after(cleanupTempDirs);

test("a package root with a trailing separator still contains its directories", async () => {
  const root = tempDir("paths-");
  mkdirSync(path.join(root, "signatures"));
  // The filesystem root ends with the platform separator; a trailing
  // separator on the resolved root must not turn the containment prefix
  // into a double separator.
  const outcome = await resolvePackageDirectory(
    { supplied: root, real: `${root}${path.sep}` },
    "signatures",
  );
  assert.equal(outcome.ok, true);
});

test("walkPackageFiles orders entries by UTF-8 bytes, not UTF-16 code units", async () => {
  // U+1F600 (supplementary plane) sorts after U+FF21 (fullwidth A, high BMP)
  // by code point, which UTF-8 byte order preserves. The default string sort
  // would put the emoji first instead: its UTF-16 leading surrogate 0xD83D is
  // below U+FF21. The walk order drives the undeclared-file diagnostic
  // sequence, so it must be byte order (#310).
  const root = tempDir("walk-order-");
  writeFileSync(path.join(root, "\uFF21.txt"), "fullwidth", "utf8");
  writeFileSync(path.join(root, "\u{1F600}.txt"), "emoji", "utf8");

  const walk = await walkPackageFiles({ supplied: root, real: root }, DEFAULT_LIMITS);
  assert.equal(walk.limitHit, false);
  assert.equal(walk.error, null);
  const names = walk.files.filter((file) => file.endsWith(".txt"));
  assert.deepEqual(names, ["\uFF21.txt", "\u{1F600}.txt"]);
});
