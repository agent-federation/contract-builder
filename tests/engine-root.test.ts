import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
import { TEST_RENDERERS, copyProjectWithProfile } from "./support.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const repoSpecDir = path.join(root, "spec");
const draftPath = path.join(repoSpecDir, "output", "CORE-001.draft.md");

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
 * Copies the committed project layout — `spec/`, `profiles/core001` and the legacy source —
 * into a temp directory, exactly as a user would copy a checkout. Nothing is rewritten.
 */
async function copyEngineProject(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `engine-root-${name}-`));
  await cp(repoSpecDir, path.join(dir, "spec"), { recursive: true });
  await cp(path.join(root, "profiles", "core001"), path.join(dir, "profiles", "core001"), {
    recursive: true,
  });
  await cp(path.join(root, "CORE-001.legacy.md"), path.join(dir, "CORE-001.legacy.md"));
  return dir;
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
  const inRepo = await runBuild(base(repoSpecDir));
  assert.equal(inRepo.exitCode, 0, failure(inRepo));
  assert.ok(inRepo.identity !== null);
  const committed = await readFile(draftPath, "utf8");
  assert.equal(inRepo.markdown, committed, "the repository build's artifact changed");

  const copied = await copyEngineProject("portable");
  // Sentinel: the copy's engine modules must never execute. If the profile loaded them
  // instead of the supplied root's modules, this module would throw during the build.
  await writeFile(
    path.join(copied, "spec", "lib", "provenance.ts"),
    'throw new Error("copy engine module executed");\n',
    "utf8",
  );

  const rebuilt = await runBuild(base(path.join(copied, "spec"), { engineRoot: root }));
  assert.equal(rebuilt.exitCode, 0, failure(rebuilt));
  assert.ok(rebuilt.identity !== null, "the copied build produced no identity");
  assert.equal(rebuilt.markdown, committed, "the copied build's artifact differs");
  assert.equal(rebuilt.identity.inputDigest, inRepo.identity.inputDigest);
  assert.equal(rebuilt.identity.engineVersion, await repoPackageVersion());

  // The copied profile still carries the authored specifier; the build did not rewrite it.
  const copiedView = await readFile(
    path.join(copied, "profiles", "core001", "view.ts"),
    "utf8",
  );
  assert.equal(copiedView.includes("../../spec/lib/"), true);
  assert.equal(copiedView.includes(path.join(root, "spec", "lib")), false);
});

test("engine-root: the CLI accepts --engine-root for a copied project", async () => {
  const copied = await copyEngineProject("cli");
  const cli = spawnSync(
    process.execPath,
    [
      path.join(root, "spec", "build.ts"),
      "--spec",
      path.join(copied, "spec"),
      "--engine-root",
      root,
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

  const project = await copyProjectWithProfile("engine-root-cli-divergent");
  const profilePath = path.join(project, "profiles", "core001", "profile.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8")) as {
    dependencies?: Record<string, string>;
  };
  profile.dependencies = { ...(profile.dependencies ?? {}), "engine-root-probe": "1.0.0" };
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");

  const cli = spawnSync(
    process.execPath,
    [
      path.join(root, "spec", "build.ts"),
      "--spec",
      project,
      "--engine-root",
      engineRoot,
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
  const provenancePath = path.join(engineRoot, "spec", "lib", "provenance.ts");
  const markerPath = path.join(engineRoot, "spec", "lib", "provenance.marker");
  const original = await readFile(provenancePath, "utf8");
  await writeFile(
    provenancePath,
    [
      'import { writeFileSync } from "node:fs";',
      'import { fileURLToPath } from "node:url";',
      'writeFileSync(fileURLToPath(new URL("./provenance.marker", import.meta.url)), "loaded", "utf8");',
      original,
    ].join("\n"),
    "utf8",
  );

  const project = await copyProjectWithProfile("distinct-root-execution");
  const result = await runBuild(base(project, { engineRoot }));
  assert.equal(result.exitCode, 0, failure(result));
  assert.equal(result.markdown, await readFile(draftPath, "utf8"));
  assert.equal(await readFile(markerPath, "utf8"), "loaded");
});


test("engine-root: the mapping rule recognizes nested and deeper spec/lib imports", () => {
  const profile = path.join(path.sep, "project", "profiles", "core001");
  const layout = path.join(path.sep, "project");

  assert.deepEqual(
    classifyEngineSpecifier(
      "../../spec/lib/ir.js",
      path.join(profile, "view.ts"),
      layout,
    ),
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
  assert.deepEqual(
    classifyEngineSpecifier("./text.js", path.join(profile, "view.ts"), layout),
    { kind: "extension" },
  );
});

test("engine-root: the mapping rule rejects ambiguous, empty and escaping paths", () => {
  const profile = path.join(path.sep, "project", "profiles", "core001");
  const layout = path.join(path.sep, "project");

  const ambiguous = classifyEngineSpecifier(
    "../../spec/lib/spec/lib/ir.js",
    path.join(profile, "view.ts"),
    layout,
  );
  assert.equal(ambiguous.kind, "error");
  assert.equal(ambiguous.kind === "error" ? ambiguous.code : "", "core.extension.unpinned-dependency");

  const empty = classifyEngineSpecifier(
    "../../spec/lib",
    path.join(profile, "view.ts"),
    layout,
  );
  assert.equal(empty.kind, "error");
  assert.equal(empty.kind === "error" ? empty.code : "", "core.extension.unpinned-dependency");

  const escapes = classifyEngineSpecifier(
    "../../../spec/lib/ir.js",
    path.join(profile, "view.ts"),
    layout,
  );
  assert.equal(escapes.kind, "error");
  assert.equal(escapes.kind === "error" ? escapes.code : "", "core.path.outside-root");

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

  const project = await copyProjectWithProfile("engine-symlink-escape");
  const viewPath = path.join(project, "profiles", "core001", "view.ts");
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
  const project = await copyProjectWithProfile("engine-wrong-root");
  const empty = await mkdtemp(path.join(tmpdir(), "engine-root-empty-"));

  const result = await runBuild(base(project, { engineRoot: empty }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.path.outside-root"), failure(result));
  assert.equal(result.identity, null);
});

test("engine-root: a root whose version differs from the running engine fails closed", async () => {
  const engineRoot = await copyEngineRoot("version-mismatch", "9.9.9");
  const project = await copyProjectWithProfile("engine-version-mismatch");

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
