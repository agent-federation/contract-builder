import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import YAML from "yaml";
import {
  artifactDigest,
  canonicalJson,
  canonicalJsonBytes,
  domainHash,
  inputFileDigest,
  normalizeLf,
  normalizedInputSetDigest,
  rawSourceDigest,
  utf8,
} from "../mapping.js";
import { packCore000, REPO_ROOT, assertOutsideRepository } from "../pack.js";
import { prepareWorkspace } from "../../contracts/core000/run.js";

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

/** Null outside a checkout (for example a pre-review extraction with no `.git`). */
function gitStatus(): string | null {
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" },
  );
  return result.status === 0 ? result.stdout : null;
}

/** Null when the checkout has no git metadata; the packer then omits acquisition. */
function gitHead(): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
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
    "claims/provenance.json",
    "claims/relations.json",
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
    "Contract Builder Engine public self-contract assurance package",
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
  const head = gitHead();
  if (head === null) {
    // The packer only claims a git acquisition when the checkout carries one.
    assert.equal(source.acquisition, undefined, "no git metadata means no acquisition");
  } else {
    assert.deepEqual(source.acquisition, {
      method: "git",
      revision: head,
    });
  }
  assert.equal("acquiredAt" in source, false, "D3 omits acquiredAt");

  assert.deepEqual(manifest.profile, { id: "core000", version: "0.1.0" });
  assert.deepEqual(manifest.checkSpecs, [
    { id: "pap.check.digest-integrity/1", version: "1", required: true },
    { id: "pap.check.source-quote/1", version: "1", required: true },
    { id: "pap.check.relation-consistency/1", version: "1", required: true },
  ]);

  assert.deepEqual(Object.keys(manifest.claims).sort(), ["provenance", "relations"]);
  assert.deepEqual(manifest.claims.provenance.path, "claims/provenance.json");
  assert.deepEqual(manifest.claims.relations.path, "claims/relations.json");
  const provenanceBytes = await readBytes(
    path.join(packageDir, manifest.claims.provenance.path),
  );
  const relationsBytes = await readBytes(
    path.join(packageDir, manifest.claims.relations.path),
  );
  assert.equal(
    manifest.claims.provenance.digest,
    domainHash("pap.claims.v1", provenanceBytes),
  );
  assert.equal(
    manifest.claims.relations.digest,
    domainHash("pap.claims.v1", relationsBytes),
  );

  const provenance = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(provenanceBytes),
  ) as Record<string, any>;
  assert.equal(provenance.papClaimsVersion, "0.1");
  assert.equal(provenance.bindings.length, 3);
  for (const binding of provenance.bindings) {
    assert.equal(binding.sourceId, source.id);
    assert.equal(binding.quote.normalization, "none");
    const extracted = sourceBytes.subarray(binding.locator.start, binding.locator.end);
    assert.equal(binding.quote.digest, domainHash("pap.quote.v1", extracted));
  }

  const relations = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(relationsBytes),
  ) as Record<string, any>;
  assert.equal(relations.papClaimsVersion, "0.1");
  assert.ok(relations.entities.some((entity: { id: string }) => entity.id === "SRC-TR-001"));
  assert.ok(
    relations.edges.some(
      (edge: { relation: string; from: string; to: string }) =>
        edge.relation === "cites" && edge.from === "C000-TR-001" && edge.to === "SRC-TR-001",
    ),
  );

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

test("pack:core000 produces the C2 layout and both runs are byte-identical", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "pipeline-c2-pack-"));
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
    assert.equal(firstVerify.status, 0, firstVerify.stderr);
    assert.equal(secondVerify.status, 0, secondVerify.stderr);

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

    assert.equal(firstReport.verdict, "PASS");
    assert.equal(firstReport.dimensions.integrity.package, "PASS");
    assert.equal(firstReport.dimensions.integrity.artifacts, "PASS");
    assert.equal(firstReport.dimensions.sources.integrity, "PASS");
    assert.equal(firstReport.dimensions.sources.availability, "PASS");
    assert.equal(firstReport.coverage.full, true);
    assert.equal(firstReport.coverage.checksEvaluated, 3);
    assert.equal(firstReport.coverage.checksPassed, 3);
    assert.equal(firstReport.coverage.checksFailed, 0);
    assert.equal(firstReport.coverage.checksNotEvaluated, 0);
    assert.deepEqual(
      firstReport.dimensions.checks.results.map((entry: { checkId: string; outcome: string }) => [
        entry.checkId,
        entry.outcome,
      ]),
      [
        ["pap.check.digest-integrity/1", "PASS"],
        ["pap.check.source-quote/1", "PASS"],
        ["pap.check.relation-consistency/1", "PASS"],
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

test("pack:core000 fails closed on an ambiguous provenance quote", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "pipeline-c2-ambiguous-"));
  const out = path.join(tempRoot, "package");
  const workspace = await prepareWorkspace();
  try {
    const sourcePath = path.join(
      workspace.root,
      "docs",
      "architecture",
      "engine-public-contract.md",
    );
    const source = await readFile(sourcePath, "utf8");
    const claims = YAML.parse(
      await readFile(path.join(workspace.projectDir, "claims.yml"), "utf8"),
    ) as { sourceStatements: { source_quote: string }[] };
    const quote = claims.sourceStatements[0]?.source_quote;
    assert.ok(quote);
    await writeFile(sourcePath, `${source}\n\n${quote}\n`, "utf8");
    await assert.rejects(
      packCore000({ outDir: out, workspace }),
      /ambiguous in the source/,
    );
    await assert.rejects(access(out), "no partial package is written");
  } finally {
    await workspace.cleanup();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pack:core000 declares claim digests; a mutated claim fails verification", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "pipeline-c2-claim-digest-"));
  const packageDir = path.join(tempRoot, "package");
  try {
    await mkdir(packageDir);
    const packed = run(["run", "pack:core000", "--out", packageDir]);
    assert.equal(packed.status, 0, packed.stderr);

    const manifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await readBytes(path.join(packageDir, "assurance-package.json")),
      ),
    ) as Record<string, any>;
    const claimPaths = [manifest.claims.provenance.path, manifest.claims.relations.path] as string[];
    for (const claimPath of claimPaths) {
      assert.match(
        await readFile(path.join(packageDir, claimPath), "utf8"),
        /^\{/,
        `${claimPath} is packaged`,
      );
    }

    const tampered = path.join(packageDir, manifest.claims.provenance.path);
    const original = await readFile(tampered);
    await writeFile(tampered, Buffer.concat([original, Buffer.from(" ")]));

    const verified = verifyPackage(packageDir);
    assert.equal(verified.status, 1, verified.stderr);
    const report = JSON.parse(verified.stdout) as Record<string, any>;
    assert.equal(report.verdict, "FAIL");
    assert.equal(report.dimensions.integrity.package, "FAIL");
    assert.ok(
      report.diagnostics.some(
        (diagnostic: { code: string }) => diagnostic.code === "pap.integrity.claim-mismatch",
      ),
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("pack:core000 evidence: a mutated range with a valid claim digest fails source-quote", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "pipeline-c2-range-"));
  const packageDir = path.join(tempRoot, "package");
  try {
    await mkdir(packageDir);
    const packed = run(["run", "pack:core000", "--out", packageDir]);
    assert.equal(packed.status, 0, packed.stderr);

    const manifestPath = path.join(packageDir, "assurance-package.json");
    const manifest = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(await readBytes(manifestPath)),
    ) as Record<string, any>;
    const claimPath = path.join(packageDir, manifest.claims.provenance.path as string);
    const claim = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(await readBytes(claimPath)),
    ) as Record<string, any>;
    claim.bindings[0].locator.start += 1;

    const claimBytes = utf8(`${canonicalJson(claim)}\n`);
    await writeFile(claimPath, claimBytes);
    manifest.claims.provenance.digest = domainHash("pap.claims.v1", claimBytes);
    await writeFile(manifestPath, utf8(`${canonicalJson(manifest)}\n`));

    const verified = verifyPackage(packageDir);
    assert.equal(verified.status, 1, verified.stderr);
    const report = JSON.parse(verified.stdout) as Record<string, any>;
    assert.equal(report.verdict, "FAIL");
    const sourceQuote = report.checks.find(
      (check: { checkId: string }) => check.checkId === "pap.check.source-quote/1",
    );
    assert.ok(sourceQuote);
    assert.equal(sourceQuote.outcome, "FAIL");
    assert.ok(
      sourceQuote.diagnostics.some(
        (diagnostic: { code: string }) => diagnostic.code === "pap.check.quote-mismatch",
      ),
    );
    assert.equal(report.dimensions.integrity.package, "PASS", "the recomputed claim digest keeps integrity");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("REPO_ROOT is the checkout, so only the checkout is refused", () => {
  assert.equal(path.resolve(REPO_ROOT), path.resolve(root), "REPO_ROOT is the repository root");
  assert.throws(
    () => assertOutsideRepository(path.join(root, "pipeline", "tmp-package")),
    /inside the repository/,
  );
  assert.doesNotThrow(
    () => assertOutsideRepository(path.join(root, "..", "outside-package")),
    "a sibling of the checkout is a valid package destination",
  );
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
