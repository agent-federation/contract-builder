import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import { loadProject } from "../spec/lib/load.js";
import { loadSchemas, validateDocuments } from "../spec/lib/schema.js";
import { buildProjectModel, type ProjectModel } from "../spec/lib/ir.js";
import {
  readLockfile,
  resolveExtensionClosure,
  resolveProfileClosure,
} from "../spec/lib/identity.js";
import type { Renderer } from "../spec/lib/render.js";
import { renderer as exampleRenderer } from "../profiles/example/renderer.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const profilesDir = path.join(root, "profiles");
const exampleProfileDir = path.join(profilesDir, "example");
const exampleProjectDir = path.join(root, "tests", "fixtures", "example-project");
const invalidProjectDir = path.join(root, "tests", "fixtures", "example-project-invalid");
const invalidReferenceDir = path.join(
  root,
  "tests",
  "fixtures",
  "example-project-invalid-reference",
);

const CORE001_TOKENS = [
  "fragment",
  "term",
  "provision",
  "decision",
  "case",
  "dependsOn",
  "mentions",
  "vectors",
] as const;

const EXAMPLE_RENDERERS: Record<string, Renderer> = {
  [exampleRenderer.id]: exampleRenderer,
};

const options = (specDir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: EXAMPLE_RENDERERS,
  allowExecutableProfile: true,
  ...overrides,
});

const codes = (result: Awaited<ReturnType<typeof runBuild>>): string[] =>
  result.diagnostics.map((diagnostic) => diagnostic.code);

const failure = (result: Awaited<ReturnType<typeof runBuild>>): string =>
  result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n");

interface ManifestShape {
  profile: { source: string; external?: boolean };
  inputs: Array<{ entities: Array<{ kind: string }> }>;
}

interface ExamplesDocument {
  examples: Array<{ id: string; relations?: Record<string, unknown> }>;
}

/**
 * A self-contained temporary project: the fixture inputs plus a local copy of the example
 * profile whose engine imports point back at the repository engine.
 */
async function copyExampleProject(
  name: string,
): Promise<{ projectDir: string; profileDir: string }> {
  const base = await mkdtemp(path.join(tmpdir(), `example-${name}-`));
  const projectDir = path.join(base, "project");
  const profileDir = path.join(base, "profiles", "example");

  await cp(exampleProjectDir, projectDir, { recursive: true });
  await cp(exampleProfileDir, profileDir, { recursive: true });

  const manifestPath = path.join(projectDir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestShape;
  manifest.profile.source = "../profiles/example";
  manifest.profile.external = true;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return { projectDir, profileDir };
}

async function editExamples(
  projectDir: string,
  mutate: (document: ExamplesDocument) => void,
): Promise<void> {
  const file = path.join(projectDir, "examples.yml");
  const document = parseYaml(await readFile(file, "utf8")) as ExamplesDocument;
  mutate(document);
  await writeFile(file, stringifyYaml(document), "utf8");
}

async function editManifest(
  projectDir: string,
  mutate: (manifest: ManifestShape) => void,
): Promise<void> {
  const file = path.join(projectDir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as ManifestShape;
  mutate(manifest);
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function buildModel(projectDir: string): Promise<ProjectModel> {
  const diagnostics = new Diagnostics();
  const loaded = await loadProject(projectDir, diagnostics);
  assert.ok(loaded !== null, diagnostics.report());
  const schemas = await loadSchemas(loaded.project, diagnostics);
  assert.ok(schemas !== null, diagnostics.report());
  assert.ok(await validateDocuments(loaded, schemas, diagnostics), diagnostics.report());
  const model = await buildProjectModel(loaded, schemas, diagnostics);
  assert.ok(model !== null, diagnostics.report());
  return model;
}

async function profileDigest(projectDir: string): Promise<string> {
  const diagnostics = new Diagnostics();
  const loaded = await loadProject(projectDir, diagnostics);
  assert.ok(loaded !== null, diagnostics.report());
  const closure = await resolveProfileClosure(loaded.project, await readLockfile(), diagnostics);
  assert.ok(closure !== null, diagnostics.report());
  return closure.closureDigest;
}

async function identityOf(projectDir: string, overrides: Partial<BuildOptions> = {}) {
  const result = await runBuild(options(projectDir, overrides));
  assert.equal(result.exitCode, 0, failure(result));
  assert.ok(result.identity !== null, "build produced no identity");
  return result.identity;
}

test("example: executable profile requires explicit consent", async () => {
  const result = await runBuild(options(exampleProjectDir, { allowExecutableProfile: false }));

  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.equal(result.markdown, null);
  assert.equal(codes(result).includes("core.profile.consent-required"), true);
});

test("example: the synthetic project builds through the ordinary core entry point", async () => {
  const result = await runBuild(options(exampleProjectDir));
  assert.equal(result.exitCode, 0, failure(result));
  assert.equal(result.blockedBy, null);
  assert.equal(result.written, false);
  assert.equal(result.outputPath, path.join(exampleProjectDir, "output", "EXAMPLE.draft.md"));

  const markdown = result.markdown;
  assert.ok(markdown !== null);
  assert.ok(markdown.includes("REQ-IDEMPOTENT"));
  assert.ok(markdown.includes("EX-ORDER-ID-1"));
  assert.ok(markdown.includes("# Orders example"));

  assert.ok(result.identity !== null);
  assert.deepEqual(result.identity.extensions, [
    { kind: "profile", id: "example", version: "0.1.0" },
    { kind: "adapter", id: "markdown", version: "0.1.0" },
    { kind: "renderer", id: "example-markdown", version: "0.1.0" },
  ]);
});

test("example: the model declares only its own kinds and relations", async () => {
  const model = await buildModel(exampleProjectDir);

  assert.deepEqual([...model.byKind.keys()].sort(), ["example", "requirement"]);
  assert.deepEqual([...model.relations.keys()].sort(), ["examples", "requirement"]);

  const requirementIndex = model.relations.get("requirement");
  assert.ok(requirementIndex !== undefined);
  assert.deepEqual(
    [...(requirementIndex.get("example") ?? [])].sort(),
    ["REQ-IDEMPOTENT", "REQ-ORDER-ID"],
  );

  const examplesIndex = model.relations.get("examples");
  assert.ok(examplesIndex !== undefined);
  assert.deepEqual(
    [...(examplesIndex.get("requirement") ?? [])].sort(),
    ["EX-IDEMPOTENT-1", "EX-ORDER-ID-1"],
  );

  assert.deepEqual(model.byId.get("REQ-IDEMPOTENT")?.relations.examples, ["EX-IDEMPOTENT-1"]);
  assert.deepEqual(model.byId.get("EX-IDEMPOTENT-1")?.relations.requirement, ["REQ-IDEMPOTENT"]);

  for (const name of ["fragment", "terms", "dependsOn", "mentions", "vectors", "rationaleFragment"]) {
    assert.equal(model.relations.has(name), false, `CORE-001 relation leaked: ${name}`);
  }
});

test("example: the artifact contains no CORE-001 vocabulary", async () => {
  const result = await runBuild(options(exampleProjectDir));
  assert.equal(result.exitCode, 0, failure(result));
  const markdown = result.markdown;
  assert.ok(markdown !== null);

  for (const token of CORE001_TOKENS) {
    assert.equal(markdown.includes(token), false, `artifact contains "${token}"`);
  }
});

test("example: repeated builds are byte-identical and keep the same inputDigest", async () => {
  const first = await runBuild(options(exampleProjectDir));
  const second = await runBuild(options(exampleProjectDir));

  assert.equal(first.exitCode, 0, failure(first));
  assert.equal(second.exitCode, 0, failure(second));
  assert.equal(first.markdown, second.markdown);
  assert.equal(first.identity?.inputDigest, second.identity?.inputDigest);
});

test("example: a schema violation stops at core.schema.entity", async () => {
  const { projectDir } = await copyExampleProject("schema");
  await editExamples(projectDir, (document) => {
    delete document.examples[0]!.relations;
  });

  const result = await runBuild(options(projectDir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.schema.entity"), failure(result));
  // The M1 diagnostic shape has no `phase` field, so the boundary is observed by code:
  // a structure failure stops before the reference and consistency phases run.
  assert.equal(codes(result).includes("core.relation.unknown"), false);
  assert.equal(codes(result).includes("ERR_UNKNOWN_REF"), false);
  assert.equal(codes(result).includes("example.coverage.missing-example"), false);
});

test("example: an undeclared relation key stops at core.relation.unknown", async () => {
  const { projectDir } = await copyExampleProject("relation");
  await editExamples(projectDir, (document) => {
    document.examples[0]!.relations = {
      ...(document.examples[0]!.relations ?? {}),
      bogus: "REQ-IDEMPOTENT",
    };
  });

  const result = await runBuild(options(projectDir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.relation.unknown"), failure(result));
  assert.equal(codes(result).includes("core.schema.entity"), false);
  assert.equal(codes(result).includes("ERR_UNKNOWN_REF"), false);
  assert.equal(codes(result).includes("example.coverage.missing-example"), false);
});

test("example: an unresolved relation target stops at ERR_UNKNOWN_REF", async () => {
  const result = await runBuild(options(invalidReferenceDir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("ERR_UNKNOWN_REF"), failure(result));
  assert.equal(codes(result).includes("core.schema.entity"), false);
  assert.equal(codes(result).includes("core.relation.unknown"), false);
  assert.equal(codes(result).includes("example.coverage.missing-example"), false);
});

test("example: an undeclared kind stops at core.profile.unknown-kind", async () => {
  const { projectDir } = await copyExampleProject("unknown-kind");
  await editManifest(projectDir, (manifest) => {
    manifest.inputs[0]!.entities[0]!.kind = "operation";
  });

  const result = await runBuild(options(projectDir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.profile.unknown-kind"), failure(result));
  assert.equal(codes(result).includes("ERR_UNKNOWN_REF"), false);
  assert.equal(codes(result).includes("example.coverage.missing-example"), false);
});

test("example: the invalid fixture fails at the profile-owned policy boundary", async () => {
  const result = await runBuild(options(invalidProjectDir));
  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.equal(result.markdown, null);

  const finding = result.diagnostics.find(
    (diagnostic) => diagnostic.code === "example.coverage.missing-example",
  );
  assert.ok(finding !== undefined, failure(result));
  assert.equal(finding.severity, "error");
  assert.equal(finding.file, "requirements.yml");
  assert.match(finding.message, /REQ-ORDER-ID/);

  // The generic phases passed: only the profile-owned policy check failed.
  assert.equal(codes(result).some((code) => code.startsWith("core.")), false, failure(result));
});

test("example: the validator is selected through the declared profile path", async () => {
  const { projectDir, profileDir } = await copyExampleProject("validator-selection");

  await writeFile(
    path.join(profileDir, "validator.ts"),
    [
      "export const validate = async () => [",
      '  { code: "example.selected", location: { file: "selection.md", pointer: "" }, data: {} },',
      "];",
      "",
    ].join("\n"),
    "utf8",
  );

  const catalogPath = path.join(profileDir, "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
    codes: Array<Record<string, unknown>>;
  };
  catalog.codes.push({
    code: "example.selected",
    severity: "warning",
    message: "The declared profile validator ran.",
  });
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  const result = await runBuild(options(projectDir));
  assert.equal(result.exitCode, 0, failure(result));
  assert.ok(codes(result).includes("example.selected"), failure(result));
});

test("example: the renderer is selected by the declared registry id", async () => {
  const missing = await runBuild(options(exampleProjectDir, { renderers: {} }));
  assert.equal(missing.exitCode, 1);
  assert.ok(codes(missing).includes("core.registry.missing"), failure(missing));

  const wrongKey = await runBuild(
    options(exampleProjectDir, { renderers: { "other-markdown": exampleRenderer } }),
  );
  assert.equal(wrongKey.exitCode, 1);
  assert.ok(codes(wrongKey).includes("core.registry.missing"), failure(wrongKey));

  const selected = await runBuild(options(exampleProjectDir));
  assert.equal(selected.exitCode, 0, failure(selected));
  assert.ok(selected.identity !== null);
  assert.equal(
    selected.identity.extensions.find((extension) => extension.kind === "renderer")?.id,
    "example-markdown",
  );
});

test("example: changing a declared project input moves inputDigest", async () => {
  const { projectDir } = await copyExampleProject("identity-input");
  const before = await identityOf(projectDir);

  const file = path.join(projectDir, "requirements.yml");
  await writeFile(file, `${await readFile(file, "utf8")}# identity sentinel\n`, "utf8");
  const after = await identityOf(projectDir);

  assert.notEqual(after.inputDigest, before.inputDigest);
});

test("example: changing a profile/validator closure file moves the digests", async () => {
  const { projectDir, profileDir } = await copyExampleProject("identity-profile");
  const beforeProfile = await profileDigest(projectDir);
  const beforeBuild = await identityOf(projectDir);

  const validator = path.join(profileDir, "validator.ts");
  await writeFile(validator, `${await readFile(validator, "utf8")}\n// identity sentinel\n`, "utf8");

  const afterProfile = await profileDigest(projectDir);
  const afterBuild = await identityOf(projectDir);
  assert.notEqual(afterProfile, beforeProfile);
  assert.notEqual(afterBuild.inputDigest, beforeBuild.inputDigest);
});

test("example: changing a declared renderer closure file moves the digests", async () => {
  const { projectDir } = await copyExampleProject("identity-renderer");
  // Keep the committed layout so the renderer's relative `../../spec/lib` imports resolve:
  // the engine-import rule maps them to the repository engine during closure validation, and
  // the symlinked checkout satisfies the direct import this test performs.
  const rendererBase = await mkdtemp(path.join(tmpdir(), "example-renderer-"));
  await mkdir(path.join(rendererBase, "profiles", "example"), { recursive: true });
  await symlink(path.join(root, "spec"), path.join(rendererBase, "spec"));
  const rendererDir = path.join(rendererBase, "profiles", "example");
  const rendererFile = path.join(rendererDir, "renderer.ts");
  await cp(path.join(exampleProfileDir, "renderer.ts"), rendererFile);
  await cp(path.join(exampleProfileDir, "templates"), path.join(rendererDir, "templates"), {
    recursive: true,
  });

  const imported = (await import(pathToFileURL(rendererFile).href)) as {
    renderer: Renderer;
  };
  const renderer = imported.renderer;
  const renderers = { [renderer.id]: renderer };
  const lockfile = await readLockfile();

  const beforeClosure = await resolveExtensionClosure(
    "renderer",
    renderer.id,
    renderer.version,
    renderer.closure,
    lockfile,
    new Diagnostics(),
  );
  assert.ok(beforeClosure !== null);
  const beforeBuild = await identityOf(projectDir, { renderers });

  await writeFile(rendererFile, `${await readFile(rendererFile, "utf8")}\n// sentinel\n`, "utf8");

  const afterClosure = await resolveExtensionClosure(
    "renderer",
    renderer.id,
    renderer.version,
    renderer.closure,
    lockfile,
    new Diagnostics(),
  );
  assert.ok(afterClosure !== null);
  const afterBuild = await identityOf(projectDir, { renderers });

  assert.notEqual(afterClosure.closureDigest, beforeClosure.closureDigest);
  assert.notEqual(afterBuild.inputDigest, beforeBuild.inputDigest);
});

test("example: the example renderer does not embed the build identity", async () => {
  const result = await runBuild(options(exampleProjectDir));
  assert.equal(result.exitCode, 0, failure(result));
  assert.ok(result.identity !== null);
  const markdown = result.markdown;
  assert.ok(markdown !== null);

  // The identity is available in RenderOptions; this profile's renderer chooses not to render it.
  assert.equal(markdown.includes(result.identity.inputDigest), false);
  assert.equal(markdown.includes("sha256:"), false);
  assert.equal(markdown.includes("inputDigest"), false);
});
