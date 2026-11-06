import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import {
  artifactDigest,
  canonicalJson,
  canonicalJsonBytes,
  domainHash,
  inputFileDigest,
  normalizeLf,
  normalizedInputSetDigest,
  rawSourceDigest,
} from "../mapping.js";

const Ajv2020 = Ajv2020Module as unknown as new (
  options: Record<string, unknown>,
) => any;

const root = fileURLToPath(new URL("../..", import.meta.url));
const FIXED_NOW = "2026-11-06T00:00:00Z";

interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: readonly string[]): SpawnResult {
  const result = spawnSync(process.execPath, [...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function gitStatus(): string {
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function gitHead(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(dir, prefix), { withFileTypes: true })) {
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(dir, relative)));
    } else {
      files.push(relative);
    }
  }
  return files.sort();
}

async function readBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(file));
}

function verifyPackage(packageDir: string): SpawnResult {
  return run([
    "pap/src/cli.ts",
    "verify",
    packageDir,
    "--format",
    "json",
    "--now",
    FIXED_NOW,
  ]);
}

let validateReport: (report: unknown) => boolean = () => false;
try {
  const ajv = new Ajv2020({
    strict: false,
    validateFormats: false,
    allErrors: true,
  });
  for (const name of ["check-record", "verification-report"]) {
    ajv.addSchema(
      JSON.parse(
        await readFile(
          path.join(root, "pap", "schemas", `${name}.schema.json`),
          "utf8",
        ),
      ),
    );
  }
  const compiled = ajv.getSchema("urn:pap:0.1:verification-report");
  assert.ok(compiled);
  validateReport = compiled;
} catch (error) {
  assert.fail(`could not load the PAP verification-report schema: ${String(error)}`);
}

async function checkPackageTree(packageDir: string): Promise<void> {
  const files = await listFiles(packageDir);
  assert.deepEqual(files, [
    "artifacts/CORE-000.draft.md",
    "assurance-package.json",
    "inputs/claims.yml",
    "inputs/contract-builder.json",
    "inputs/structure.yml",
    "sources/engine-public-contract.md",
  ]);

  const manifest = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readBytes(path.join(packageDir, "assurance-package.json")),
    ),
  ) as Record<string, any>;

  assert.equal(manifest.papVersion, "0.1");
  assert.equal(manifest.package.id, "urn:pap:contract-builder:core000");
  assert.equal(
    manifest.package.title,
    "CORE-000 engine self-contract assurance package",
  );
  assert.deepEqual(manifest.package.producer, {
    name: "contract-builder",
    version: "0.1.0",
  });
  assert.equal("createdAt" in manifest.package, false, "D3 omits createdAt");
  assert.deepEqual(manifest.subject, {
    projectId: "core-000-self-contract",
    revision: "0.1.0",
  });

  assert.equal(manifest.build.engineVersion, "0.1.0");
  assert.equal(manifest.build.manifestVersion, "0.1");
  assert.match(manifest.build.inputDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(manifest.build.normalizedInputDigest, /^sha256:[0-9a-f]{64}$/);
  assert.ok(Array.isArray(manifest.build.extensions));
  assert.ok(
    manifest.build.extensions.some(
      (entry: { kind: string; id: string; version: string }) =>
        entry.kind === "profile" && entry.id === "core000" && entry.version === "0.1.0",
    ),
  );

  assert.equal(manifest.artifacts.length, 1);
  const artifact = manifest.artifacts[0];
  const artifactBytes = await readBytes(
    path.join(packageDir, "artifacts", "CORE-000.draft.md"),
  );
  assert.equal(artifact.path, "artifacts/CORE-000.draft.md");
  assert.equal(artifact.mediaType, "text/markdown; charset=utf-8");
  assert.equal(artifact.bytes, artifactBytes.length);
  assert.equal(artifact.digest, artifactDigest(artifactBytes));

  assert.equal(manifest.inputs.length, 3);
  const packagedInputs: { path: string; bytes: Uint8Array }[] = [];
  for (const input of manifest.inputs) {
    const bytes = await readBytes(path.join(packageDir, input.path));
    const normalized = normalizeLf(bytes);
    assert.deepEqual(bytes, normalized, `${input.path} is packaged LF-normalized`);
    assert.equal(input.normalization, "lf");
    assert.equal(input.digest, inputFileDigest(input.path, normalized));
    packagedInputs.push({ path: input.path, bytes: normalized });
  }
  assert.equal(
    manifest.build.normalizedInputDigest,
    normalizedInputSetDigest(packagedInputs),
  );

  assert.equal(manifest.sources.length, 1);
  const source = manifest.sources[0];
  const sourceBytes = await readBytes(
    path.join(packageDir, "sources", "engine-public-contract.md"),
  );
  assert.equal(source.id, "SRC-ENGINE-CONTRACT");
  assert.equal(source.digest, rawSourceDigest(sourceBytes));
  assert.deepEqual(source.acquisition, {
    method: "git",
    revision: gitHead(),
  });
  assert.equal("acquiredAt" in source, false, "D3 omits acquiredAt");

  assert.deepEqual(manifest.profile, { id: "core000", version: "0.1.0" });
  assert.deepEqual(manifest.checkSpecs, [
    { id: "pap.check.digest-integrity/1", version: "1", required: true },
    { id: "pap.check.source-quote/1", version: "1", required: true },
    { id: "pap.check.relation-consistency/1", version: "1", required: true },
  ]);
  assert.equal("claims" in manifest, false, "C1 packages no claims");

  const serialized = JSON.stringify(manifest);
  assert.equal(serialized.includes(root), false, "no absolute checkout path");
  assert.equal(serialized.includes(tmpdir()), false, "no absolute temporary path");

  const canonical = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      await readBytes(path.join(packageDir, "assurance-package.json")),
    ),
  );
  assert.deepEqual(canonical, manifest);
}

test("pack:core000 produces the C1 layout and both runs are byte-identical", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "pipeline-c1-"));
  const first = path.join(tempRoot, "first");
  const second = path.join(tempRoot, "second");
  const before = gitStatus();

  try {
    await mkdir(first);
    await mkdir(second);

    const firstRun = run(["run", "pack:core000", "--out", first]);
    assert.equal(firstRun.status, 0, firstRun.stderr);
    const secondRun = run(["run", "pack:core000", "--out", second]);
    assert.equal(secondRun.status, 0, secondRun.stderr);

    assert.equal(gitStatus(), before, "packing must not mutate the checkout");
    await assert.rejects(
      access(path.join(root, "tmp-package-must-not-exist")),
      "the packer must not create output inside the checkout",
    );

    assert.deepEqual(await listFiles(first), await listFiles(second));
    for (const file of await listFiles(first)) {
      assert.deepEqual(
        await readBytes(path.join(first, file)),
        await readBytes(path.join(second, file)),
        `${file} is byte-identical across runs`,
      );
    }

    await checkPackageTree(first);
    await checkPackageTree(second);

    const firstVerify = verifyPackage(first);
    const secondVerify = verifyPackage(second);
    assert.equal(firstVerify.status, 2, firstVerify.stderr);
    assert.equal(secondVerify.status, 2, secondVerify.stderr);

    const firstReport = JSON.parse(firstVerify.stdout) as Record<string, any>;
    const secondReport = JSON.parse(secondVerify.stdout) as Record<string, any>;
    assert.equal(
      validateReport(firstReport),
      true,
      JSON.stringify((validateReport as any).errors),
    );
    assert.equal(
      validateReport(secondReport),
      true,
      JSON.stringify((validateReport as any).errors),
    );

    assert.match(firstReport.package.identity, /^sha256:[0-9a-f]{64}$/);
    assert.equal(firstReport.package.identity, secondReport.package.identity);

    const manifestBytes = await readBytes(
      path.join(first, "assurance-package.json"),
    );
    const manifestText = new TextDecoder("utf-8", { fatal: true }).decode(
      manifestBytes,
    );
    const manifest = JSON.parse(manifestText) as Record<string, any>;
    assert.equal(manifestText, `${canonicalJson(manifest)}\n`);
    assert.equal(
      firstReport.package.identity,
      domainHash("pap.package.v1", canonicalJsonBytes(manifest)),
      "the verifier computes the identity from the same canonical manifest",
    );
    assert.equal(
      firstReport.identities.normalizedInputDigest,
      manifest.build.normalizedInputDigest,
    );

    assert.equal(firstReport.verdict, "INCOMPLETE");
    assert.equal(firstReport.dimensions.integrity.package, "PASS");
    assert.equal(firstReport.dimensions.integrity.artifacts, "PASS");
    assert.equal(firstReport.dimensions.sources.integrity, "PASS");
    assert.equal(firstReport.coverage.full, false);
    assert.equal(firstReport.coverage.checksPassed, 1);
    assert.equal(firstReport.coverage.checksNotEvaluated, 2);
    assert.deepEqual(
      firstReport.dimensions.checks.results.map((entry: { checkId: string; outcome: string }) => [
        entry.checkId,
        entry.outcome,
      ]),
      [
        ["pap.check.digest-integrity/1", "PASS"],
        ["pap.check.source-quote/1", "NOT_EVALUATED"],
        ["pap.check.relation-consistency/1", "NOT_EVALUATED"],
      ],
    );
    assert.deepEqual(
      firstReport.diagnostics.filter((entry: { code: string }) =>
        entry.code.startsWith("pap.package."),
      ),
      [],
      "no package schema/path failure",
    );
    assert.deepEqual(
      firstReport.diagnostics.filter((entry: { severity: string }) => entry.severity === "error"),
      [],
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pack:core000 refuses to write inside the checkout before building", async () => {
  const inside = path.join(root, "pipeline", "tmp-package-must-not-exist");
  const before = gitStatus();
  try {
    const result = run(["run", "pack:core000", "--out", inside]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refusing to write the package inside the repository/);
    assert.equal(gitStatus(), before);
    await assert.rejects(access(inside));
  } finally {
    await rm(inside, { recursive: true, force: true });
  }
});
