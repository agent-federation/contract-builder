import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  artifactDigest,
  canonicalJson,
  canonicalJsonBytes,
  CORE000_CHECK_SPECS,
  domainHash,
  frameRecord,
  inputFileDigest,
  mapCore000Package,
  normalizeLf,
  normalizedInputSetDigest,
  rawSourceDigest,
  utf8,
  type MappingInput,
} from "../mapping.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const base = path.join(root, "pap", "fixtures", "pap-v0.1", "base");

const read = (relative: string): Promise<Uint8Array> =>
  readFile(path.join(base, relative)).then((bytes) => new Uint8Array(bytes));

function hex(value: string): Uint8Array {
  assert.equal(value.length % 2, 0);
  const out = new Uint8Array(value.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

test("Appendix E.2: artifact, source, input and input-set digest vectors", async () => {
  const artifact = await read("artifacts/ACME-SUPPLIER.draft.md");
  const source = await read("sources/acme-policy.md");
  const input = normalizeLf(await read("inputs/project.yml"));

  assert.equal(
    artifactDigest(artifact),
    "sha256:5f521a6b5bedacdf8d3536f8fb509bef6e829bfb537b1ec818cb38a8e1a2dd51",
  );
  assert.equal(
    rawSourceDigest(source),
    "sha256:d7a4ee24615f562232172021f3c992fa1a5aed7a2ae9c128446101ed8f46eecd",
  );
  assert.equal(
    inputFileDigest("inputs/project.yml", input),
    "sha256:2da40818408dec8fe7d63c86cb8e67fbc624c743a7d81b02535f318b80cb08ff",
  );
  assert.equal(
    normalizedInputSetDigest([{ path: "inputs/project.yml", bytes: input }]),
    "sha256:fccf755793cf1a1b7982631c201282669924cdcf9d6b171bdff26513fc64d80b",
  );
});

test("Appendix E.1: JCS canonical manifest and package identity", async () => {
  const manifest = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await read("assurance-package.json"),
    ),
  ) as unknown;

  assert.equal(
    domainHash("pap.package.v1", canonicalJsonBytes(manifest)),
    "sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020",
  );
});

test("Appendix E.6: domain separation and framing ambiguity vectors", () => {
  assert.equal(
    domainHash("pap.artifact.v1", utf8("hello")),
    "sha256:49ade3eaed5c81a07ee5245b923abe3c629747f0eebe57a0052307d5965d5112",
  );
  assert.equal(
    domainHash("pap.source.raw.v1", utf8("hello")),
    "sha256:8240a5313b027e89a99054c87e683a87d68f59dc566a40f16aa68edcbf1a81b7",
  );
  assert.equal(
    domainHash("pap.package.v1", utf8("hello")),
    "sha256:4cb73e2896d009395089ea045b54b15eea2bc4c03e519bc08dc0f619da308308",
  );
  assert.equal(
    domainHash("pap.test.v1", frameRecord("x", ["ab", "c"])),
    "sha256:a4ff1eac1c490e25d4a23ef485f9219a4a51b2c370ba86ed20ba0d8e5c7334e5",
  );
  assert.equal(
    domainHash("pap.test.v1", frameRecord("x", ["a", "bc"])),
    "sha256:19777dd70824683c8483961510324f7656c03378f3a4b64192e8bee7ff0ecff2",
  );
});

test("Appendix E.5: CRLF normalization and the per-file/set input vectors", () => {
  const raw = hex("613a20310d0a623a20320d0a");
  const normalized = normalizeLf(raw);

  assert.equal(
    Buffer.from(normalized).toString("hex"),
    "613a20310a623a20320a",
  );
  assert.equal(
    inputFileDigest("inputs/crlf.yml", normalized),
    "sha256:2633064c5d3066746beae7416e97e87816fe9b031c6f57af4c9b02ca1c00453b",
  );
  assert.equal(
    normalizedInputSetDigest([{ path: "inputs/crlf.yml", bytes: normalized }]),
    "sha256:92e9ec329516a5672fc40fd0b4474f2a2fd7790d87817c37b772af3347df2021",
  );
});

test("LF normalization keeps binary fallback bytes and CRLF is not hashed as LF for sources", () => {
  const binary = new Uint8Array([0x61, 0x00, 0x0d, 0x0a]);
  assert.deepEqual(normalizeLf(binary), binary);

  const invalidUtf8 = new Uint8Array([0xff, 0x0d, 0x0a]);
  assert.deepEqual(normalizeLf(invalidUtf8), invalidUtf8);

  const crlf = utf8("a\r\nb\r\n");
  assert.notEqual(rawSourceDigest(crlf), rawSourceDigest(utf8("a\nb\n")));
});

function sampleInput(): MappingInput {
  return {
    artifact: {
      id: "artifact:sample",
      path: "artifacts/SAMPLE.draft.md",
      mediaType: "text/markdown; charset=utf-8",
      bytes: utf8("# Sample\r\n"),
    },
    inputs: [
      {
        id: "input:z",
        path: "inputs/z.yml",
        mediaType: "application/yaml",
        bytes: utf8("z: 1\r\n"),
      },
      {
        id: "input:a",
        path: "inputs/a.json",
        mediaType: "application/json",
        bytes: utf8('{"a":1}\r\n'),
      },
    ],
    source: {
      id: "SRC-SAMPLE",
      path: "sources/sample.md",
      mediaType: "text/markdown; charset=utf-8",
      bytes: utf8("# Source\r\n"),
      acquisition: { method: "git", revision: "0123456789abcdef" },
    },
    build: {
      engineVersion: "9.9.9",
      manifestVersion: "0.1",
      inputDigest: `sha256:${"1".repeat(64)}`,
      extensions: [
        { kind: "renderer", id: "sample-renderer", version: "1.0.0" },
        { kind: "profile", id: "sample", version: "1.0.0" },
        { kind: "adapter", id: "markdown", version: "1.0.0" },
      ],
    },
    declaration: {
      id: "urn:pap:contract-builder:sample",
      title: "Sample package",
      producer: { name: "contract-builder", version: "9.9.9" },
      subject: { projectId: "sample", revision: "1.2.3" },
      profile: { id: "sample", version: "1.0.0" },
    },
  };
}

test("mapping fills every manifest section field by field", () => {
  const input = sampleInput();
  const plan = mapCore000Package(input);
  const manifest = plan.manifest;

  assert.equal(manifest.papVersion, "0.1");
  assert.deepEqual(manifest.package, {
    id: "urn:pap:contract-builder:sample",
    title: "Sample package",
    producer: { name: "contract-builder", version: "9.9.9" },
  });
  assert.equal("createdAt" in manifest.package, false);
  assert.deepEqual(manifest.subject, {
    projectId: "sample",
    revision: "1.2.3",
  });

  assert.equal(manifest.build.engineVersion, "9.9.9");
  assert.equal(manifest.build.manifestVersion, "0.1");
  assert.equal(manifest.build.inputDigest, `sha256:${"1".repeat(64)}`);
  assert.equal(plan.normalizedInputDigest, manifest.build.normalizedInputDigest);
  assert.deepEqual(
    manifest.build.extensions,
    [
      { kind: "adapter", id: "markdown", version: "1.0.0" },
      { kind: "profile", id: "sample", version: "1.0.0" },
      { kind: "renderer", id: "sample-renderer", version: "1.0.0" },
    ],
    "extensions are sorted for a deterministic manifest",
  );

  assert.deepEqual(manifest.artifacts, [
    {
      id: "artifact:sample",
      path: "artifacts/SAMPLE.draft.md",
      mediaType: "text/markdown; charset=utf-8",
      bytes: input.artifact.bytes.length,
      digest: artifactDigest(input.artifact.bytes),
    },
  ]);

  assert.deepEqual(
    manifest.inputs.map((entry) => entry.path),
    ["inputs/a.json", "inputs/z.yml"],
    "inputs are sorted by path",
  );
  for (const entry of manifest.inputs) {
    const payload = input.inputs.find((candidate) => candidate.path === entry.path);
    assert.ok(payload);
    const normalized = normalizeLf(payload.bytes);
    assert.equal(entry.normalization, "lf");
    assert.equal(entry.digest, inputFileDigest(entry.path, normalized));
    assert.equal(
      entry.digest,
      domainHash("pap.input.file.v1", frameRecord("input", [entry.path, normalized])),
    );
  }

  const source = manifest.sources[0];
  assert.ok(source);
  assert.equal(source.id, "SRC-SAMPLE");
  assert.equal(source.path, "sources/sample.md");
  assert.equal(source.digest, rawSourceDigest(input.source.bytes));
  assert.deepEqual(source.acquisition, {
    method: "git",
    revision: "0123456789abcdef",
  });
  assert.equal("acquiredAt" in source, false);

  assert.deepEqual(manifest.profile, { id: "sample", version: "1.0.0" });
  assert.deepEqual(manifest.checkSpecs, CORE000_CHECK_SPECS);
  assert.equal("claims" in manifest, false);

  assert.deepEqual(
    plan.files.map((file) => file.path),
    [
      "artifacts/SAMPLE.draft.md",
      "assurance-package.json",
      "inputs/a.json",
      "inputs/z.yml",
      "sources/sample.md",
    ],
  );
  const writtenInputs = plan.files.filter((file) => file.path.startsWith("inputs/"));
  assert.deepEqual(
    writtenInputs.map((file) => Buffer.from(file.bytes).toString("hex")),
    ["7b2261223a317d0a", "7a3a20310a"],
    "packaged inputs are LF-normalized",
  );

  const manifestFile = plan.files.find((file) => file.path === "assurance-package.json");
  assert.ok(manifestFile);
  const text = Buffer.from(manifestFile.bytes).toString("utf8");
  assert.equal(text.endsWith("\n"), true);
  assert.equal(text.slice(0, -1), canonicalJson(manifest));
  assert.deepEqual(JSON.parse(text), manifest);

  const serialized = text;
  assert.equal(serialized.includes("\r"), false);
  assert.equal(serialized.includes(root), false);
  assert.equal(serialized.includes("/tmp/"), false);
  assert.equal(serialized.includes("createdAt"), false);
  assert.equal(serialized.includes("acquiredAt"), false);
});

test("mapping rejects missing/crossing path prefixes and duplicates", () => {
  const baseInput = sampleInput();
  assert.throws(
    () =>
      mapCore000Package({
        ...baseInput,
        artifact: { ...baseInput.artifact, path: "inputs/SAMPLE.draft.md" },
      }),
    /artifact path must start with artifacts\//,
  );
  assert.throws(
    () =>
      mapCore000Package({
        ...baseInput,
        inputs: [
          baseInput.inputs[0]!,
          { ...baseInput.inputs[1]!, path: "inputs/z.yml" },
        ],
      }),
    /duplicate package path/,
  );
  assert.throws(
    () =>
      mapCore000Package({
        ...baseInput,
        source: { ...baseInput.source, path: "artifacts/sample.md" },
      }),
    /source path must start with sources\//,
  );
});
