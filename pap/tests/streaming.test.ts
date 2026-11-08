import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { domainHash, inputFileDigest, normalizeLf } from "../src/digest.js";
import { hashInput } from "../src/input.js";
import { hashPackageFile, hashPackageRange } from "../src/paths.js";
import type { PackageRoot } from "../src/paths.js";
import { DEFAULT_LIMITS } from "../src/types.js";

function packageRoot(): PackageRoot {
  const real = mkdtempSync(path.join(tmpdir(), "pap-stream-"));
  return { supplied: real, real };
}

test("streamed input normalization crosses the 64 KiB chunk boundary", async () => {
  const root = packageRoot();
  const bytes = Buffer.alloc(70_000, 0x61);
  bytes.write("\r\n", 65_535);
  writeFileSync(path.join(root.real, "big.yml"), bytes);
  const result = await hashInput(root, "big.yml", "lf", DEFAULT_LIMITS, 1_000_000);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.digest, inputFileDigest("big.yml", normalizeLf(new Uint8Array(bytes))));
  assert.equal(result.normalizedSize, bytes.length - 1);
});

test("streamed source range hashing crosses chunks", async () => {
  const root = packageRoot();
  const bytes = Buffer.alloc(150_000, 0x62);
  writeFileSync(path.join(root.real, "source.bin"), bytes);
  const result = await hashPackageRange(
    root,
    "source.bin",
    60_000,
    140_000,
    "pap.quote.v1",
    DEFAULT_LIMITS,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.digest,
    domainHash("pap.quote.v1", new Uint8Array(bytes.subarray(60_000, 140_000))),
  );
  assert.equal(result.size, 80_000);
});

test("streamed artifact hashing does not need the payload in one buffer", async () => {
  const root = packageRoot();
  const bytes = Buffer.alloc(5_000_000, 0x63);
  writeFileSync(path.join(root.real, "artifact.bin"), bytes);
  const result = await hashPackageFile(
    root,
    "artifact.bin",
    "pap.artifact.v1",
    DEFAULT_LIMITS,
    10_000_000,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.digest, domainHash("pap.artifact.v1", new Uint8Array(bytes)));
  assert.equal(result.size, bytes.length);
});
