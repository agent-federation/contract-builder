import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import {
  classifyEngineSpecifier,
  readLockfile,
  resolveExtensionClosure,
} from "../spec/lib/identity.js";
import { ENGINE_RENDERERS, copyEngineProject } from "./support.js";

const root = fileURLToPath(new URL("..", import.meta.url));

const base = (dir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir: dir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: ENGINE_RENDERERS,
  allowExecutableProfile: true,
  ...overrides,
});

const codes = (result: Awaited<ReturnType<typeof runBuild>>): string[] =>
  result.diagnostics.map((item) => item.code);

const failure = (result: Awaited<ReturnType<typeof runBuild>>): string =>
  result.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n");

async function repoPackageVersion(): Promise<string> {
  const parsed = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    version: string;
  };
  return parsed.version;
}

/**
 * Adds a dependency-free renderer module to a copied project and declares it in the profile.
 * Temp copies have no `node_modules`, so the copied profile renderer (which imports `nunjucks`)
 * cannot be imported there; this module needs only a `node:` builtin.
 */
async function addProbeRenderer(
  projectDir: string,
  profileName = "example",
  rendererId = "example-markdown",
  outputPath = "output/EXAMPLE.draft.md",
): Promise<string> {
  const profileDir = path.join(projectDir, "profiles", profileName);
  const modulePath = path.join(profileDir, "probe-renderer.ts");
  await writeFile(
    modulePath,
    [
      'import { createHash } from "node:crypto";',
      'import { fileURLToPath } from "node:url";',
      'const bytes = new TextEncoder().encode("probe\\n");',
      'const sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;',
      "export const renderer = {",
      `  id: ${JSON.stringify(rendererId)},`,
      '  version: "0.1.0",',
      "  closure: {",
      '    root: fileURLToPath(new URL(".", import.meta.url)),',
      '    files: ["probe-renderer.ts"],',
      "    dependencies: {},",
      "  },",
      "  async render() {",
      `    return [{ path: ${JSON.stringify(outputPath)}, bytes, sha256 }];`,
      "  },",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );
  const profilePath = path.join(profileDir, "profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8")) as { files?: string[] };
  profile.files = [...(profile.files ?? []), "probe-renderer.ts"];
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  return modulePath;
}

/** A temp engine checkout: same layout and version, with a real `spec/lib` copy. */
async function copyEngineRoot(name: string, version?: string): Promise<string> {
  const engine = await mkdtemp(path.join(tmpdir(), `engine-root-checkout-${name}-`));
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  if (version !== undefined) pkg.version = version;
  await writeFile(path.join(engine, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  await cp(path.join(root, "bun.lock"), path.join(engine, "bun.lock"));
  await cp(path.join(root, "spec", "lib"), path.join(engine, "spec", "lib"), {
    recursive: true,
  });
  return engine;
}

test("engine-root: a copied project builds from the supplied root without rewriting imports", async () => {
  const first = await copyEngineProject("portable-a");
  const second = await copyEngineProject("portable-b");

  // Sentinel: the copies carry their own poisoned `spec/lib`; if the profile loaded the copy's
  // modules instead of the supplied root's, this module would throw during the build.
  for (const copied of [first, second]) {
    await cp(path.join(root, "spec", "lib"), path.join(copied, "spec", "lib"), {
      recursive: true,
    });
    const manifestCopy = path.join(copied, "spec", "lib", "manifest.ts");
    const manifestSource = await readFile(manifestCopy, "utf8");
    await writeFile(
      manifestCopy,
      [
        'import { writeFileSync } from "node:fs";',
        'import { fileURLToPath } from "node:url";',
        'writeFileSync(fileURLToPath(new URL("./manifest.poisoned", import.meta.url)), "executed", "utf8");',
        manifestSource,
      ].join("\n"),
      "utf8",
    );
    // The fixture profile modules only have type-only engine imports, so the test adds a
    // runtime import that must resolve against the supplied root, not the poisoned copy.
    const validatorPath = path.join(copied, "profiles", "example", "validator.ts");
    const validator = await readFile(validatorPath, "utf8");
    await writeFile(
      validatorPath,
      [
        'import { resolveContained } from "../../spec/lib/manifest.js";',
        "void resolveContained;",
        validator,
      ].join("\n"),
      "utf8",
    );
  }

  const firstBuild = await runBuild(base(first, { engineRoot: root }));
  assert.equal(firstBuild.exitCode, 0, failure(firstBuild));
  assert.ok(firstBuild.identity !== null, "the copied build produced no identity");
  assert.equal(await repoPackageVersion(), firstBuild.identity.engineVersion);

  const secondBuild = await runBuild(base(second, { engineRoot: root }));
  assert.equal(secondBuild.exitCode, 0, failure(secondBuild));
  assert.equal(secondBuild.identity!.inputDigest, firstBuild.identity!.inputDigest);

  for (const copied of [first, second]) {
    assert.equal(
      existsSync(path.join(copied, "spec", "lib", "manifest.poisoned")),
      false,
      "the copied engine modules executed",
    );
  }

  // The copied profile still carries the authored specifier; the build did not rewrite it.
  const copiedView = await readFile(path.join(first, "profiles", "example", "view.ts"), "utf8");
  assert.equal(copiedView.includes("../../spec/lib/"), true);
  assert.equal(copiedView.includes(path.join(root, "spec", "lib")), false);
});

test("engine-root: the CLI accepts --engine-root for a copied project", async () => {
  const copied = await copyEngineProject("cli");
  const rendererModule = await addProbeRenderer(copied);
  const cli = spawnSync(
    process.execPath,
    [
      path.join(root, "spec", "build.ts"),
      "--spec",
      copied,
      "--engine-root",
      root,
      "--renderer-module",
      rendererModule,
      "--no-write",
      "--json",
      "--allow-executable-profile",
    ],
    { cwd: root, encoding: "utf8", timeout: 120_000 },
  );
  assert.equal(cli.status, 0, cli.stderr);
  const parsed = JSON.parse(cli.stdout) as {
    identity: { engineVersion: string; inputDigest: string } | null;
  };
  assert.equal(parsed.identity?.engineVersion, await repoPackageVersion());
  assert.match(parsed.identity?.inputDigest ?? "", /^sha256:[0-9a-f]{64}$/);
});

test("engine-root: the CLI preflight validates against --engine-root, not the running root", async () => {
  // The distinct root pins a dependency the running lockfile does not have. Only a preflight
  // that reads the supplied root's lockfile can validate this project's profile closure.
  const engineRoot = await copyEngineRoot("cli-divergent");
  const lockPath = path.join(engineRoot, "bun.lock");
  const lock = await readFile(lockPath, "utf8");
  await writeFile(
    lockPath,
    lock.replace(
      '"packages": {',
      '"packages": {\n    "engine-root-probe": ["engine-root-probe@1.0.0", "", {}, "sha512-ZW5naW5lLXJvb3Q="],',
    ),
    "utf8",
  );

  const project = await copyEngineProject("engine-root-cli-divergent");
  const profilePath = path.join(project, "profiles", "example", "profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  profile.dependencies = { ...(profile.dependencies ?? {}), "engine-root-probe": "1.0.0" };
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");

  const rendererModule = await addProbeRenderer(
    project,
    "example",
    "example-markdown",
    "output/EXAMPLE.draft.md",
  );
  const cli = spawnSync(
    process.execPath,
    [
      path.join(root, "spec", "build.ts"),
      "--spec",
      project,
      "--engine-root",
      engineRoot,
      "--renderer-module",
      rendererModule,
      "--no-write",
      "--json",
      "--allow-executable-profile",
    ],
    { cwd: root, encoding: "utf8", timeout: 120_000 },
  );
  assert.equal(cli.status, 0, cli.stderr);
  const parsed = JSON.parse(cli.stdout) as {
    identity: { engineVersion: string } | null;
  };
  assert.equal(parsed.identity?.engineVersion, await repoPackageVersion());
});

test("engine-root: a distinct same-version root's modules are the ones executed", async () => {
  const engineRoot = await copyEngineRoot("distinct-execution");
  const markerPath = path.join(engineRoot, "spec", "lib", "manifest.marker");
  const manifestPath = path.join(engineRoot, "spec", "lib", "manifest.ts");
  const original = await readFile(manifestPath, "utf8");
  await writeFile(
    manifestPath,
    [
      'import { writeFileSync } from "node:fs";',
      'import { fileURLToPath } from "node:url";',
      'writeFileSync(fileURLToPath(new URL("./manifest.marker", import.meta.url)), "loaded", "utf8");',
      original,
    ].join("\n"),
    "utf8",
  );

  const project = await copyEngineProject("distinct-root-execution");
  // The fixture profile modules only have type-only engine imports, so the test adds a
  // runtime import: loading the validator must execute the supplied root's `manifest.ts`.
  const validatorPath = path.join(project, "profiles", "example", "validator.ts");
  const validator = await readFile(validatorPath, "utf8");
  await writeFile(
    validatorPath,
    [
      'import { writeFileSync } from "node:fs";',
      'import { resolveContained } from "../../spec/lib/manifest.js";',
      `writeFileSync(${JSON.stringify(markerPath)}, "loaded", "utf8");`,
      "void resolveContained;",
      validator,
    ].join("\n"),
    "utf8",
  );

  const result = await runBuild(base(project, { engineRoot }));
  assert.equal(result.exitCode, 0, failure(result));
  assert.ok(result.markdown?.includes("Orders example"));
  assert.equal(await readFile(markerPath, "utf8"), "loaded");
});

test("engine-root: the mapping rule recognizes nested and deeper spec/lib imports", () => {
  const profile = path.join(path.sep, "project", "profiles", "example");
  const layout = path.join(path.sep, "project");

  assert.deepEqual(
    classifyEngineSpecifier("../../spec/lib/ir.js", path.join(profile, "view.ts"), layout),
    { kind: "engine", subpath: "ir.js" },
  );
  assert.deepEqual(
    classifyEngineSpecifier(
      "../../../spec/lib/adapters/markdown.js",
      path.join(profile, "checks", "cases.ts"),
      layout,
    ),
    { kind: "engine", subpath: "adapters/markdown.js" },
  );
  assert.deepEqual(classifyEngineSpecifier("./text.js", path.join(profile, "view.ts"), layout), {
    kind: "extension",
  });
});

test("engine-root: the mapping rule rejects ambiguous, empty and escaping paths", () => {
  const profile = path.join(path.sep, "project", "profiles", "example");
  const layout = path.join(path.sep, "project");

  const ambiguous = classifyEngineSpecifier(
    "../../spec/lib/spec/lib/ir.js",
    path.join(profile, "view.ts"),
    layout,
  );
  assert.equal(ambiguous.kind, "error");
  assert.equal(
    ambiguous.kind === "error" ? ambiguous.key : "",
    "core.extension.unpinned-dependency#import-ambiguous",
  );

  const empty = classifyEngineSpecifier("../../spec/lib", path.join(profile, "view.ts"), layout);
  assert.equal(empty.kind, "error");
  assert.equal(
    empty.kind === "error" ? empty.key : "",
    "core.extension.unpinned-dependency#import-subpath-invalid",
  );

  const escapes = classifyEngineSpecifier(
    "../../../spec/lib/ir.js",
    path.join(profile, "view.ts"),
    layout,
  );
  assert.equal(escapes.kind, "error");
  assert.equal(
    escapes.kind === "error" ? escapes.key : "",
    "core.path.outside-root#import-outside-project",
  );

  const traversal = classifyEngineSpecifier(
    "../../spec/lib/../secret.js",
    path.join(profile, "view.ts"),
    layout,
  );
  // Lexical collapse removes the traversal; the result is no longer an engine candidate and
  // escapes the extension root, so the closure scan rejects it.
  assert.deepEqual(traversal, { kind: "extension" });
});

test("engine-root: a traversal out of spec/lib is rejected by the closure scan", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "engine-root-traversal-"));
  const extension = path.join(baseDir, "extension");
  await mkdir(extension);
  await writeFile(
    path.join(extension, "entry.ts"),
    'import { secret } from "../../spec/lib/../secret.js";\nexport const probe = secret;\n',
    "utf8",
  );

  const diagnostics = new Diagnostics();
  const closure = await resolveExtensionClosure(
    "renderer",
    "traversal-subpath",
    "1.0.0",
    { root: extension, files: ["entry.ts"], dependencies: {} },
    await readLockfile(),
    diagnostics,
  );
  assert.equal(closure, null);
  assert.ok(
    diagnostics.sorted().some((entry) => entry.code === "core.extension.unpinned-dependency"),
    diagnostics.report(),
  );
});

test("engine-root: a symlink escaping spec/lib is rejected", async () => {
  const engineRoot = await copyEngineRoot("symlink");
  const outside = path.join(engineRoot, "outside.ts");
  await writeFile(outside, "export const escaped = 1;\n", "utf8");
  await symlink(outside, path.join(engineRoot, "spec", "lib", "escape.ts"));

  const project = await copyEngineProject("engine-symlink-escape");
  const viewPath = path.join(project, "profiles", "example", "view.ts");
  const view = await readFile(viewPath, "utf8");
  await writeFile(
    viewPath,
    `import { escaped } from "../../spec/lib/escape.js";\n${view}\nexport const probe = escaped;\n`,
    "utf8",
  );

  const result = await runBuild(base(project, { engineRoot }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.path.outside-root"), failure(result));
});

test("engine-root: an invalid engine root fails closed", async () => {
  const project = await copyEngineProject("engine-wrong-root");
  const empty = await mkdtemp(path.join(tmpdir(), "engine-root-empty-"));

  const result = await runBuild(base(project, { engineRoot: empty }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.path.outside-root"), failure(result));
  assert.equal(result.identity, null);
});

test("engine-root: a root whose version differs from the running engine fails closed", async () => {
  const engineRoot = await copyEngineRoot("version-mismatch", "9.9.9");
  const project = await copyEngineProject("engine-version-mismatch");

  const result = await runBuild(base(project, { engineRoot }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.engine.version-mismatch"), failure(result));
  assert.equal(result.identity, null);
});

test("engine-root: absolute, file: and other URL specifiers never load", async () => {
  const cases: Array<{ specifier: string; name: string }> = [
    { specifier: '"/etc/passwd"', name: "absolute" },
    { specifier: '"file:///tmp/engine.ts"', name: "file-url" },
    { specifier: '"https://example.com/engine.ts"', name: "https-url" },
  ];

  for (const item of cases) {
    const baseDir = await mkdtemp(path.join(tmpdir(), `engine-root-specifier-${item.name}-`));
    const extension = path.join(baseDir, "extension");
    await mkdir(extension);
    await writeFile(
      path.join(extension, "entry.ts"),
      `import { value } from ${item.specifier};\nexport const probe = value;\n`,
      "utf8",
    );

    const diagnostics = new Diagnostics();
    const closure = await resolveExtensionClosure(
      "renderer",
      `reject-${item.name}`,
      "1.0.0",
      { root: extension, files: ["entry.ts"], dependencies: {} },
      await readLockfile(),
      diagnostics,
    );
    assert.equal(closure, null, `${item.name} specifier was accepted`);
    assert.ok(
      diagnostics.sorted().some((entry) => entry.code === "core.extension.unpinned-dependency"),
      diagnostics.report(),
    );
  }
});

test("engine-root: node: builtins stay outside the closure", async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), "engine-root-node-"));
  const extension = path.join(baseDir, "extension");
  await mkdir(extension);
  await writeFile(
    path.join(extension, "entry.ts"),
    'import { readFile } from "node:fs/promises";\nexport const probe = readFile;\n',
    "utf8",
  );

  const diagnostics = new Diagnostics();
  const closure = await resolveExtensionClosure(
    "renderer",
    "node-builtin",
    "1.0.0",
    { root: extension, files: ["entry.ts"], dependencies: {} },
    await readLockfile(),
    diagnostics,
  );
  assert.ok(closure !== null, diagnostics.report());
  assert.deepEqual(closure.dependencies, []);
});
