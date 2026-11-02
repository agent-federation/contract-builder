import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { loadProject } from "../spec/lib/load.js";
import { loadSchemas } from "../spec/lib/schema.js";
import { buildProjectModel } from "../spec/lib/ir.js";
import { resolveContained } from "../spec/lib/manifest.js";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import { rewriteProfileCoreImports, TEST_RENDERERS } from "./support.js";

/**
 * PR 2 acceptance: manifest, project boundary and declared-input loading.
 * These tests use temporary copies of the real project; they never touch `spec/`.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const specDir = path.join(root, "spec");
const profileDir = path.join(root, "profiles", "core001");
const legacyPath = path.join(root, "CORE-001.legacy.md");

interface MutableManifest {
  profile: { source: string; external?: boolean };
  inputs: Array<Record<string, unknown>>;
  sources: Array<{ path: string; external?: boolean }>;
  render: Array<{ outputs: Record<string, string> }>;
}

const base = (dir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir: dir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: TEST_RENDERERS,
  allowExecutableProfile: true,
  ...overrides,
});

const codes = (result: Awaited<ReturnType<typeof runBuild>>): string[] =>
  result.diagnostics.map((d) => d.code);

async function copyProject(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `m1-${name}-`));
  for (const file of [
    "contract-builder.json",
    "sources.yml",
    "ontology.yml",
    "semantics.json",
    "decisions.yml",
  ]) {
    await cp(path.join(specDir, file), path.join(dir, file));
  }
  await cp(path.join(specDir, "conformance"), path.join(dir, "conformance"), {
    recursive: true,
  });

  // Absolute paths plus `external: true` keep the temporary project self-contained
  // without copying the profile or the legacy document.
  await editManifest(dir, (manifest) => {
    manifest.profile.source = profileDir;
    manifest.sources[0]!.path = legacyPath;
  });

  return dir;
}

async function editManifest(
  dir: string,
  mutate: (manifest: MutableManifest) => void,
): Promise<void> {
  const file = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as MutableManifest;
  mutate(manifest);
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

test("manifest: a missing manifest is core.manifest.missing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "m1-no-manifest-"));
  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.manifest.missing"));
});

test("manifest: an input outside the project root without external is rejected", async () => {
  const dir = await copyProject("outside-input");
  await editManifest(dir, (manifest) => {
    manifest.inputs.push({
      path: legacyPath,
      format: "yaml",
      schema: "core001:sources",
      entities: [],
    });
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.path.outside-root"));
});

test("manifest: an optional absent input is skipped without error", async () => {
  const dir = await copyProject("optional-input");
  await editManifest(dir, (manifest) => {
    manifest.inputs.push({
      path: "absent.yml",
      format: "yaml",
      schema: "core001:sources",
      entities: [],
      optional: true,
    });
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 0, result.diagnostics.map((d) => d.message).join("\n"));
  assert.equal(codes(result).includes("ERR_IO"), false);
});

test("manifest: an output path escaping the output root is rejected and nothing is written", async () => {
  const dir = await copyProject("output-escape");
  const escapeName = `escape-${path.basename(dir)}.md`;
  const escapePath = path.join(path.dirname(dir), escapeName);
  await editManifest(dir, (manifest) => {
    manifest.render[0]!.outputs.draft = `../${escapeName}`;
  });

  const result = await runBuild(base(dir, { write: true }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.path.outside-root"));
  assert.equal(existsSync(escapePath), false);
});

test("manifest: a source outside the project root without external is rejected", async () => {
  const dir = await copyProject("outside-source");
  await editManifest(dir, (manifest) => {
    delete manifest.sources[0]!.external;
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.path.outside-root"));
});

test("manifest: a profile without a sources binding fails without crashing", async () => {
  const dir = await copyProject("no-sources-binding");
  await cp(path.join(root, "profiles", "core001"), path.join(dir, "profile"), {
    recursive: true,
  });
  await rewriteProfileCoreImports(path.join(dir, "profile"));
  await editManifest(dir, (manifest) => {
    manifest.profile.source = "./profile";
    delete manifest.profile.external;
  });

  const profilePath = path.join(dir, "profile", "profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8")) as {
    documents: Array<{ key: string }>;
  };
  profile.documents = profile.documents.filter((binding) => binding.key !== "sources");
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.profile.invalid"));
});

test("manifest: containment handles the filesystem root and shared prefixes", async () => {
  assert.equal((await resolveContained("/", "/etc")).inside, true);
  assert.equal((await resolveContained("/tmp", "/tmp")).inside, true);
  assert.equal((await resolveContained("/tmp/project", "/tmp/project-other/file")).inside, false);
  assert.equal((await resolveContained("/tmp/project", "/tmp/project/file")).inside, true);
});

test("manifest: a profile whose id or version differs from the pin is rejected", async () => {
  const dir = await copyProject("profile-mismatch");
  await cp(profileDir, path.join(dir, "profile"), { recursive: true });
  await rewriteProfileCoreImports(path.join(dir, "profile"));
  await editManifest(dir, (manifest) => {
    manifest.profile.source = "./profile";
    delete manifest.profile.external;
  });

  const profilePath = path.join(dir, "profile", "profile.json");
  const original = JSON.parse(await readFile(profilePath, "utf8")) as Record<string, unknown>;

  await writeFile(profilePath, `${JSON.stringify({ ...original, version: "9.9.9" }, null, 2)}\n`);
  const versionMismatch = await runBuild(base(dir));
  assert.equal(versionMismatch.exitCode, 1);
  assert.ok(codes(versionMismatch).includes("core.profile.invalid"));

  await writeFile(profilePath, `${JSON.stringify({ ...original, id: "other" }, null, 2)}\n`);
  const idMismatch = await runBuild(base(dir));
  assert.equal(idMismatch.exitCode, 1);
  assert.ok(codes(idMismatch).includes("core.profile.invalid"));
});

test("manifest: the model carries the source bytes and identity", async () => {
  const diagnostics = new Diagnostics();
  const loaded = await loadProject(specDir, diagnostics);
  assert.ok(loaded !== null, diagnostics.report());

  const schemas = await loadSchemas(loaded.project, diagnostics);
  assert.ok(schemas !== null, diagnostics.report());

  const model = await buildProjectModel(loaded, schemas, diagnostics);
  assert.ok(model !== null, diagnostics.report());

  const source = model.sources[0];
  assert.ok(source !== undefined);
  assert.equal(source.id, "SRC-CORE001");
  assert.equal(source.identity?.document, "UIA-CORE-001");
  assert.equal(source.identity?.revision, "0.3.3");
  assert.ok(new TextDecoder().decode(source.bytes).includes("UIA-CORE-001 (Rev 0.3.3)"));
});

/**
 * Issue #36: an inverse declaration is the other half of the same edge set. These tests
 * mutate a temporary copy of the real profile and never touch `profiles/core001`.
 */

interface MutableRelationsProfile {
  relations: Array<Record<string, unknown>>;
}

async function copyProjectWithProfile(name: string): Promise<string> {
  const dir = await copyProject(name);
  await cp(profileDir, path.join(dir, "profile"), { recursive: true });
  await rewriteProfileCoreImports(path.join(dir, "profile"));
  await editManifest(dir, (manifest) => {
    manifest.profile.source = "./profile";
    delete manifest.profile.external;
  });
  return dir;
}

async function editRelations(
  dir: string,
  mutate: (relations: Array<Record<string, unknown>>) => void,
): Promise<void> {
  const file = path.join(dir, "profile", "profile.json");
  const profile = JSON.parse(await readFile(file, "utf8")) as MutableRelationsProfile;
  mutate(profile.relations);
  await writeFile(file, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

function relationIndex(relations: Array<Record<string, unknown>>, name: string): number {
  return relations.findIndex((item) => item.name === name);
}

function relation(
  relations: Array<Record<string, unknown>>,
  name: string,
): Record<string, unknown> {
  const index = relationIndex(relations, name);
  assert.ok(index >= 0, `relation "${name}" is not declared`);
  return relations[index]!;
}

function profileInvalid(result: Awaited<ReturnType<typeof runBuild>>) {
  return result.diagnostics.find((item) => item.code === "core.profile.invalid");
}

test("manifest: an inverse declaration must exist on the target kind", async () => {
  const dir = await copyProjectWithProfile("inverse-missing");
  await editRelations(dir, (relations) => {
    relations.splice(relationIndex(relations, "vectors"), 1);
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  const diagnostic = profileInvalid(result);
  assert.ok(diagnostic !== undefined, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(diagnostic.pointer, "/relations/4/inverse");
  assert.ok(diagnostic.message.includes('"vectors"'), diagnostic.message);
});

test("manifest: an inverse declaration must point back at the forward relation", async () => {
  const dir = await copyProjectWithProfile("inverse-not-reciprocal");
  await editRelations(dir, (relations) => {
    relation(relations, "vectors").inverse = "terms";
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  const diagnostic = profileInvalid(result);
  assert.ok(diagnostic !== undefined, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(diagnostic.pointer, "/relations/4/inverse");
  assert.ok(diagnostic.message.includes('"terms"'), diagnostic.message);
  assert.ok(diagnostic.message.includes('"provision"'), diagnostic.message);
});

test("manifest: an inverse declaration must reverse the forward endpoints", async () => {
  const dir = await copyProjectWithProfile("inverse-kind-mismatch");
  await editRelations(dir, (relations) => {
    // The inverse lookup is keyed by (forward.to, forward.inverse) = (provision, vectors), so
    // changing vectors.to keeps the declaration found and reaches the endpoint comparison.
    relation(relations, "vectors").to = "fragment";
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  const diagnostic = profileInvalid(result);
  assert.ok(diagnostic !== undefined, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(diagnostic.pointer, "/relations/4/inverse");
  assert.ok(diagnostic.message.includes("ведёт на вид"), diagnostic.message);
  assert.ok(diagnostic.message.includes('"fragment"'), diagnostic.message);
  assert.ok(diagnostic.message.includes('"case"'), diagnostic.message);
});

test("manifest: a declared inverse must be a non-empty string", async () => {
  const dir = await copyProjectWithProfile("inverse-invalid");
  for (const invalid of [42, null, ""]) {
    await editRelations(dir, (relations) => {
      relation(relations, "vectors").inverse = invalid;
    });

    const result = await runBuild(base(dir));
    assert.equal(result.exitCode, 1, `inverse: ${JSON.stringify(invalid)}`);
    const diagnostic = profileInvalid(result);
    assert.ok(
      diagnostic !== undefined,
      `inverse: ${JSON.stringify(invalid)}\n${result.diagnostics.map((item) => item.message).join("\n")}`,
    );
    assert.equal(diagnostic.pointer, "/relations/5/inverse");
    assert.ok(diagnostic.message.includes("inverse"), diagnostic.message);
  }
});

test("manifest: a wildcard target cannot declare an inverse", async () => {
  const dir = await copyProjectWithProfile("inverse-wildcard");
  await editRelations(dir, (relations) => {
    relations.push({
      name: "target",
      from: "provision",
      to: "*",
      cardinality: "many",
      inverse: "sources",
    });
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  const diagnostic = profileInvalid(result);
  assert.ok(diagnostic !== undefined, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(diagnostic.pointer, "/relations/8/inverse");
  assert.ok(diagnostic.message.includes('"*"'), diagnostic.message);
});

test("manifest: a reciprocal inverse declaration pair is accepted", async () => {
  const result = await runBuild(base(specDir));
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));
});
