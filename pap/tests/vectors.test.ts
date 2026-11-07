import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  canonicalBase64Decode,
  domainHash,
  extensionClosureDigest,
  frameRecord,
  inputFileDigest,
  normalizeLf,
  normalizedInputSetDigest,
  sha256Hex,
  utf8,
} from "../src/digest.js";
import { JsonParseError, jcs, jcsBytes, parseJsonStrict } from "../src/json.js";
import { paeBytes } from "../src/signatures.js";
import { verificationRecordIdentity } from "../src/report.js";
import { fixtures, root } from "./support.js";

const baseDir = path.join(fixtures, "base");
const readBase = (relative: string): Uint8Array =>
  new Uint8Array(readFileSync(path.join(baseDir, relative)));
const baseManifest = JSON.parse(
  readFileSync(path.join(baseDir, "assurance-package.json"), "utf8"),
);

test("E.1 canonical manifest bytes and package identity", () => {
  assert.equal(
    domainHash("pap.package.v1", jcsBytes(baseManifest)),
    "sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020",
  );
  assert.equal(jcsBytes(baseManifest).length, 1874);
});

test("E.2 payload, quote, input and claim digests", () => {
  const artifact = readBase("artifacts/ACME-SUPPLIER.draft.md");
  const source = readBase("sources/acme-policy.md");
  assert.equal(
    domainHash("pap.artifact.v1", artifact),
    "sha256:5f521a6b5bedacdf8d3536f8fb509bef6e829bfb537b1ec818cb38a8e1a2dd51",
  );
  assert.equal(
    domainHash("pap.source.raw.v1", source),
    "sha256:d7a4ee24615f562232172021f3c992fa1a5aed7a2ae9c128446101ed8f46eecd",
  );
  assert.equal(
    domainHash("pap.quote.v1", source.subarray(24, 76)),
    "sha256:619cb81063fff535c31b93b66e274e6df0a1cef4582d17c7a6362c98fac48909",
  );
  const input = normalizeLf(readBase("inputs/project.yml"));
  assert.equal(
    inputFileDigest("inputs/project.yml", input),
    "sha256:2da40818408dec8fe7d63c86cb8e67fbc624c743a7d81b02535f318b80cb08ff",
  );
  assert.equal(
    normalizedInputSetDigest([{ path: "inputs/project.yml", bytes: input }]),
    "sha256:fccf755793cf1a1b7982631c201282669924cdcf9d6b171bdff26513fc64d80b",
  );
  assert.equal(
    domainHash("pap.claims.v1", readBase("claims/provenance.json")),
    "sha256:8044adf1df927b30e67e743d6ca348a8f197f8af4e9e7cc668ebf525e6e7b95b",
  );
  assert.equal(
    domainHash("pap.claims.v1", readBase("claims/relations.json")),
    "sha256:992cd64e230f2480a88ab7128d802796abfbd44605809ba52cb16828559f83ab",
  );
  assert.equal(
    domainHash("pap.claims.v1", readBase("claims/producer-report.json")),
    "sha256:f45a69883bed0d0e62c69c7ff0105e902f86006e89c56d77cef1cc9630846e95",
  );
});

test("E.3 checker closure and checker identity", () => {
  const digest = extensionClosureDigest(
    "checker",
    "pap.verifier.reference",
    "0.1.0",
    [
      { path: "src/checks/digest.ts", bytes: utf8('export const checkId = "pap.check.digest-integrity/1";\n') },
      { path: "src/checks/source.ts", bytes: utf8("export const spanCheck = true;\n") },
    ],
    [{ name: "zod", version: "3.23.8", integrity: "sha512-9K5fXZ0G8p3oUo4WQ9m2l1v0B9m3r7Yqk1s2V4pL6c0=" }],
  );
  assert.equal(digest, "sha256:73f738b733b177c04597b0e6ab9c4d267059ea1556e6f943d543c252c5ef15c0");
  assert.equal(
    domainHash(
      "pap.checker.identity.v1",
      jcsBytes({
        id: "pap.verifier.reference",
        version: "0.1.0",
        implementationDigest: digest,
      }),
    ),
    "sha256:15a0b0149dc95f7b9711e7b28fc4189ed8539b03ffd2c96e967205316d75963f",
  );
});

test("E.4 verification record identity form", () => {
  const form = JSON.parse(
    readFileSync(path.join(root, "fixtures", "vectors", "e4-identity-form.json"), "utf8"),
  );
  assert.equal(
    domainHash("pap.report.v1", jcsBytes(form)),
    "sha256:147aad0ab0f4b9274b7f66182de179ad69ae2924f311dcf723e67d39b07527ea",
  );
});

test("E.5 LF normalization and CRLF vectors", () => {
  const raw = Buffer.from("613a20310d0a623a20320d0a", "hex");
  assert.equal(Buffer.from(normalizeLf(new Uint8Array(raw))).toString("hex"), "613a20310a623a20320a");
  assert.equal(
    inputFileDigest("inputs/crlf.yml", normalizeLf(new Uint8Array(raw))),
    "sha256:2633064c5d3066746beae7416e97e87816fe9b031c6f57af4c9b02ca1c00453b",
  );
  assert.equal(
    normalizedInputSetDigest([{ path: "inputs/crlf.yml", bytes: normalizeLf(new Uint8Array(raw)) }]),
    "sha256:92e9ec329516a5672fc40fd0b4474f2a2fd7790d87817c37b772af3347df2021",
  );
});

test("E.6 domain separation and framing ambiguity", () => {
  const hello = utf8("hello");
  assert.equal(
    domainHash("pap.artifact.v1", hello),
    "sha256:49ade3eaed5c81a07ee5245b923abe3c629747f0eebe57a0052307d5965d5112",
  );
  assert.equal(
    domainHash("pap.source.raw.v1", hello),
    "sha256:8240a5313b027e89a99054c87e683a87d68f59dc566a40f16aa68edcbf1a81b7",
  );
  assert.equal(
    domainHash("pap.package.v1", hello),
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

test("E.7 DSSE pre-authentication encoding", () => {
  const payload = jcsBytes(baseManifest);
  const pae = paeBytes("application/vnd.pap.manifest.v0.1+json", payload);
  assert.equal(pae.length, 1928);
  assert.equal(
    `sha256:${sha256Hex(pae)}`,
    "sha256:4efbb78e8d9fa00d01f0f07b29cdf5a000e7748cc144ecbbc1eaf0dcdd2919d4",
  );
  const illustrative = paeBytes("application/vnd.pap.manifest.v0.1+json", utf8("{}"));
  assert.equal(
    Buffer.from(illustrative).toString("utf8"),
    "DSSEv1 38 application/vnd.pap.manifest.v0.1+json 2 {}",
  );
  assert.equal(
    `sha256:${sha256Hex(illustrative)}`,
    "sha256:163a4832de57f229c9f653684640f74b07baafd9568ee683fa470a1352316bb2",
  );
});

test("E.9 JCS edge vectors", () => {
  assert.equal(
    jcs({ a: 1, "😀": 2, "\ufffd": 3, A: 4, b: 5 }),
    '{"A":4,"a":1,"b":5,"😀":2,"�":3}',
  );
  assert.equal(jcsBytes({ a: 1, "😀": 2, "\ufffd": 3, A: 4, b: 5 }).length, 36);
  assert.equal(
    `sha256:${sha256Hex(jcsBytes({ a: 1, "😀": 2, "\ufffd": 3, A: 4, b: 5 }))}`,
    "sha256:9267454f732ed7ef9939b28dc1e451c88c2967ff4a6b1746bf638d313e72b508",
  );
  assert.equal(jcs({ s: "\u0001\t\n\"\\é😀" }), '{"s":"\\u0001\\t\\n\\"\\\\é😀"}');
  assert.equal(jcsBytes({ s: "\u0001\t\n\"\\é😀" }).length, 28);
  assert.equal(
    `sha256:${sha256Hex(jcsBytes({ s: "\u0001\t\n\"\\é😀" }))}`,
    "sha256:9033f8f21bc1c3367ebcad55e2298bf113b63f9e5f21c20678de00e760c5ff5d",
  );
});

test("E.10 identity mutation vectors", () => {
  const baseline = JSON.parse(
    readFileSync(path.join(root, "fixtures", "vectors", "e4-identity-form.json"), "utf8"),
  );
  const hash = (value: unknown): string => verificationRecordIdentity(value as never);
  assert.equal(hash(baseline), "sha256:147aad0ab0f4b9274b7f66182de179ad69ae2924f311dcf723e67d39b07527ea");

  const outcome = JSON.parse(JSON.stringify(baseline));
  outcome.dimensions.checks.results[0].outcome = "FAIL";
  assert.equal(hash(outcome), "sha256:f9f2c22f90baa970ebed16d3cceae08a2aac6544f617320dd06c95745d1b7e30");

  const range = JSON.parse(JSON.stringify(baseline));
  range.checks[1].witnesses[0].range.end = 75;
  assert.equal(hash(range), "sha256:83d9147e35f2dc528f481f0f39335497b3c32ea7f45ed083cf8a448679f24c4c");

  const scope = JSON.parse(JSON.stringify(baseline));
  scope.checks[0].scope.artifacts = [];
  assert.equal(hash(scope), "sha256:652798f36a18daec12268ebe05eeb6022d5d1be704897d51a98a2d30adc044f8");

  const diagnostic = JSON.parse(JSON.stringify(baseline));
  diagnostic.checks[1].diagnostics.push({ code: "pap.check.partial", severity: "warning" });
  assert.equal(diagnostic.checks[1].diagnostics[0].code, "pap.check.partial");
  assert.equal(hash(diagnostic), "sha256:635dcc4a65d44e5e011f8193705e9eb6c62eae8e553fd8068b60bc2ca59fc9e3");

  const quote = JSON.parse(JSON.stringify(baseline));
  quote.checks[1].witnesses[0].quoteBase64 = "UkVRLTAwMQ==";
  assert.equal(hash(quote), "sha256:147aad0ab0f4b9274b7f66182de179ad69ae2924f311dcf723e67d39b07527ea");
});

test("strict I-JSON parser rejects invalid documents", () => {
  const limits = { nesting: 4, stringBytes: 32 };
  for (const text of [
    '{"a":1,"a":2}',
    '{"a":1.0}',
    '{"a":1e3}',
    '{"a":-0}',
    '{"a":9007199254740992}',
    '{"a":"\\ud800"}',
    '{"a":1} trailing',
  ]) {
    assert.throws(() => parseJsonStrict(utf8(text), limits), JsonParseError, text);
  }
  assert.throws(() => parseJsonStrict(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), limits));
  assert.throws(() => parseJsonStrict(utf8('{"a":{"b":{"c":{"d":{"e":1}}}}}'), limits));
  assert.equal(jcs(parseJsonStrict(utf8('{"b":2,"a":1}'), limits)), '{"a":1,"b":2}');
});

test("base64 decoder accepts only canonical encodings", () => {
  assert.equal(canonicalBase64Decode("aGVsbG8=")?.length, 5);
  assert.equal(canonicalBase64Decode("aGVsbG8"), null);
  assert.equal(canonicalBase64Decode("aGVs bG8="), null);
  assert.equal(canonicalBase64Decode("aGVsbG9="), null);
});
