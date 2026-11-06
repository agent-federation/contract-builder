import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { streamPackageFile } from "../src/paths.js";
import { evaluateSignatures } from "../src/signatures.js";
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

test("signature discovery maps an escaping package path to pap.package.path-escape", async () => {
  const parent = mkdtempSync(path.join(tmpdir(), "pap-path-escape-mapping-"));
  const outside = path.join(parent, "outside");
  mkdirSync(path.join(outside, "signatures"), { recursive: true });
  const link = path.join(parent, "link");
  symlinkSync(outside, link, "dir");

  // The CLI canonicalizes the package root before verification; this test feeds
  // a non-canonical root directly to the contained directory resolver so the
  // defensive escape branch and its diagnostic mapping are exercised.
  const result = await evaluateSignatures({
    root: { supplied: link, real: link },
    canonicalManifest: new TextEncoder().encode("{}"),
    policy: undefined,
    policyFresh: true,
    packageId: "urn:test:package",
    packageIdentity: `sha256:${"0".repeat(64)}`,
    mode: "optional",
    limits: DEFAULT_LIMITS,
  });
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    ["pap.package.path-escape"],
  );
});
