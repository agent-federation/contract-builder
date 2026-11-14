import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import { validateProfileClosure } from "../spec/lib/identity.js";
import { loadManifest } from "../spec/lib/manifest.js";
import type { Renderer } from "../spec/lib/render.js";
import { loadProfileRenderers } from "../spec/cli-renderers.js";
import { copyProjectWithProfile, TEST_RENDERERS } from "./support.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const cliPath = path.join(root, "spec", "build.ts");

const base = (specDir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: TEST_RENDERERS,
  allowExecutableProfile: true,
  ...overrides,
});

const codes = (result: Awaited<ReturnType<typeof runBuild>>): string[] =>
  result.diagnostics.map((diagnostic) => diagnostic.code);

const failure = (result: Awaited<ReturnType<typeof runBuild>>): string =>
  result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n");

interface CliJson {
  exitCode: number;
  blockedBy: string | null;
  written: boolean;
  identity: { inputDigest: string } | null;
  diagnostics: Array<{ code: string; severity: string; message: string }>;
}

/**
 * A buildable CORE-001 project whose `view` and `validator` modules write a marker file when
 * evaluated. Absence of the marker proves the engine never imported profile code.
 */
async function projectWithEvalMarker(name: string): Promise<{ dir: string; marker: string }> {
  const dir = await copyProjectWithProfile(name);
  const marker = path.join(dir, "profile-evaluated.marker");
  const header = 'import { writeFileSync } from "node:fs";\n';
  const footer = `\nwriteFileSync(${JSON.stringify(marker)}, "evaluated");\n`;

  for (const file of ["view.ts", "validator.ts"]) {
    const filePath = path.join(dir, "profiles", "core001", file);
    const original = await readFile(filePath, "utf8");
    await writeFile(filePath, `${header}${original}${footer}`, "utf8");
  }

  return { dir, marker };
}

interface MutableManifest {
  profile: { source: string; external?: boolean };
  render: Array<{ renderer?: string }>;
}

/** Rewrites the renderer id declared by the project manifest. */
async function setDeclaredRenderer(dir: string, rendererId: string): Promise<void> {
  const file = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as MutableManifest;
  manifest.render[0]!.renderer = rendererId;
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

test("consent: the public API rejects an executable profile without explicit consent", async () => {
  const { dir, marker } = await projectWithEvalMarker("api-no-consent");

  const result = await runBuild(base(dir, { allowExecutableProfile: false }));

  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.equal(result.markdown, null);
  assert.equal(result.identity, null);
  assert.ok(codes(result).includes("core.profile.consent-required"), failure(result));
  assert.equal(existsSync(marker), false, "profile code was evaluated without consent");

  const diagnostic = result.diagnostics.find(
    (item) => item.code === "core.profile.consent-required",
  );
  assert.ok(diagnostic !== undefined);
  assert.equal(diagnostic.severity, "error");
  assert.equal(diagnostic.file, "profile.json");
  assert.match(diagnostic.message, /allowExecutableProfile/);
  assert.match(diagnostic.message, /--allow-executable-profile/);
  assert.match(diagnostic.message, /is not isolation/);
});

test("consent: the public API builds CORE-001 only with explicit consent", async () => {
  const { dir, marker } = await projectWithEvalMarker("api-consent");

  const result = await runBuild(base(dir));

  assert.equal(result.exitCode, 0, failure(result));
  assert.equal(result.blockedBy, null);
  assert.ok(result.markdown !== null);
  assert.ok(result.identity !== null);
  assert.equal(codes(result).includes("core.profile.consent-required"), false);
  assert.equal(existsSync(marker), true, "profile code was not evaluated with consent");
});

test("consent: the CLI fails closed without the flag", async () => {
  const { dir, marker } = await projectWithEvalMarker("cli");
  const args = [cliPath, "--spec", dir, "--no-write", "--json"];

  const denied = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  assert.equal(denied.status, 1, denied.stderr);
  assert.ok(denied.stdout.trim().length > 0, denied.stderr);
  const deniedOutput = JSON.parse(denied.stdout) as CliJson;
  assert.equal(deniedOutput.exitCode, 1);
  assert.equal(deniedOutput.blockedBy, "errors");
  assert.ok(deniedOutput.diagnostics.some((item) => item.code === "core.profile.consent-required"));
  assert.equal(existsSync(marker), false, "CLI evaluated profile code without consent");
});

test("consent: the CLI builds with a consumer-supplied renderer module", async () => {
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "--spec",
      path.join(root, "spec"),
      "--check",
      "--allow-executable-profile",
      "--renderer-module",
      path.join(root, "profiles", "core001", "renderer.ts"),
      "--json",
    ],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.trim().length > 0, result.stderr);
  const output = JSON.parse(result.stdout) as CliJson;
  assert.equal(output.exitCode, 0);
  assert.equal(output.blockedBy, null);
  assert.equal(output.written, false);
  assert.ok(output.identity !== null);
});

test("consent: the CLI has no built-in renderer when the consumer names no module", async () => {
  const result = spawnSync(
    process.execPath,
    [
      cliPath,
      "--spec",
      path.join(root, "spec"),
      "--no-write",
      "--json",
      "--allow-executable-profile",
    ],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.trim().length > 0, result.stderr);
  const output = JSON.parse(result.stdout) as CliJson;
  assert.equal(output.exitCode, 1);
  assert.ok(output.diagnostics.some((item) => item.code === "core.registry.missing"));
  assert.equal(
    output.diagnostics.some((item) => item.code === "core.render.failed"),
    false,
  );
});

const FAKE_RENDERER: Renderer = {
  id: "core001-markdown",
  version: "0.1.0",
  async render() {
    return [];
  },
};

const rendererModuleOf = (dir: string): string =>
  path.join(dir, "profiles", "core001", "renderer.ts");

test("consent: the CLI preflight validates the profile closure before importing the renderer", async () => {
  // The new relative module exists (so importing it would succeed) but is not declared in
  // profile.files. The injected importer counts calls, so a nonzero count proves the
  // renderer was imported before the closure violation was rejected.
  const dir = await copyProjectWithProfile("closure-preflight");
  await writeFile(
    path.join(dir, "profiles", "core001", "undeclared.ts"),
    "export const undeclared = true;\n",
    "utf8",
  );
  const rendererPath = rendererModuleOf(dir);
  const renderer = await readFile(rendererPath, "utf8");
  await writeFile(
    rendererPath,
    `import { undeclared } from "./undeclared.js";\n${renderer}\nvoid undeclared;\n`,
    "utf8",
  );

  let imported = 0;
  const renderers = await loadProfileRenderers(true, dir, {
    rendererModule: rendererPath,
    importRenderer: async () => {
      imported += 1;
      return FAKE_RENDERER;
    },
  });

  assert.equal(imported, 0, "renderer imported before the profile closure was validated");
  assert.deepEqual(renderers, {});
});

test("consent: the CLI preflight imports a declared renderer module for a valid project", async () => {
  const dir = await copyProjectWithProfile("preflight-valid");
  let imported = 0;

  const renderers = await loadProfileRenderers(true, dir, {
    rendererModule: rendererModuleOf(dir),
    importRenderer: async () => {
      imported += 1;
      return FAKE_RENDERER;
    },
  });

  assert.equal(imported, 1);
  assert.deepEqual(renderers, { [FAKE_RENDERER.id]: FAKE_RENDERER });
});

test("consent: a renderer in an external profile imports engine modules through the mapping", async () => {
  // `copyProjectWithProfile` places the project and its profile outside the engine checkout, so
  // the renderer's `../../spec/lib/...` imports normalize outside the engine tree. They resolve
  // only when the loader imports the renderer inside the engine-import mapping (ODR-ENG-003 D4).
  const dir = await copyProjectWithProfile("external-renderer-mapping");
  const module = await addEngineImportRenderer(dir);

  const renderers = await loadProfileRenderers(true, dir, {
    engineRoot: root,
    rendererModule: module,
  });
  assert.deepEqual(Object.keys(renderers), ["core001-markdown"]);

  const result = await runBuild(base(dir, { renderers }));

  assert.equal(result.exitCode, 0, failure(result));
  assert.equal(result.blockedBy, null);
  assert.equal(result.markdown, "external renderer\n");
  assert.ok(result.identity !== null);
});

test("consent: the CLI preflight does not register a renderer whose id differs from the declaration", async () => {
  const dir = await copyProjectWithProfile("preflight-mismatch");
  await setDeclaredRenderer(dir, "other-markdown");
  let imported = 0;

  const renderers = await loadProfileRenderers(true, dir, {
    rendererModule: rendererModuleOf(dir),
    importRenderer: async () => {
      imported += 1;
      return FAKE_RENDERER;
    },
  });

  assert.equal(imported, 1, "the declared module is imported before its id is compared");
  assert.deepEqual(renderers, {}, "a renderer whose id does not match the manifest is registered");
});

test("consent: the CLI preflight imports nothing without a renderer module", async () => {
  const dir = await copyProjectWithProfile("preflight-no-module");
  let imported = 0;

  const renderers = await loadProfileRenderers(true, dir, {
    importRenderer: async () => {
      imported += 1;
      return FAKE_RENDERER;
    },
  });

  assert.equal(imported, 0);
  assert.deepEqual(renderers, {});
});

test("consent: the CLI preflight rejects a renderer module outside the profile directory", async () => {
  const dir = await copyProjectWithProfile("preflight-outside");
  let imported = 0;

  const renderers = await loadProfileRenderers(true, dir, {
    rendererModule: path.join(dir, "contract-builder.json"),
    importRenderer: async () => {
      imported += 1;
      return FAKE_RENDERER;
    },
  });

  assert.equal(imported, 0);
  assert.deepEqual(renderers, {});
});

test("consent: the CLI preflight rejects a renderer module not declared in profile.files", async () => {
  const dir = await copyProjectWithProfile("preflight-undeclared");
  const module = path.join(dir, "profiles", "core001", "undeclared-renderer.ts");
  await writeFile(
    module,
    'export const renderer = { id: "core001-markdown", version: "0.1.0", render: async () => [] };\n',
    "utf8",
  );
  let imported = 0;

  const renderers = await loadProfileRenderers(true, dir, {
    rendererModule: module,
    importRenderer: async () => {
      imported += 1;
      return FAKE_RENDERER;
    },
  });

  assert.equal(imported, 0);
  assert.deepEqual(renderers, {});
});

/**
 * Writes a renderer module into a copied profile whose `../../spec/lib/...` import only resolves
 * when the loader imports the module inside the engine-import mapping.
 */
async function addEngineImportRenderer(dir: string): Promise<string> {
  const name = "engine-import-renderer.ts";
  const module = path.join(dir, "profiles", "core001", name);
  const source = [
    'import { fileURLToPath } from "node:url";',
    'import { artifactFrom } from "../../spec/lib/render.js";',
    "export const renderer = {",
    '  id: "core001-markdown",',
    '  version: "0.1.0",',
    "  closure: {",
    '    root: fileURLToPath(new URL(".", import.meta.url)),',
    `    files: [${JSON.stringify(name)}],`,
    "    dependencies: {},",
    "  },",
    "  async render() {",
    '    return [artifactFrom("output/CORE-001.draft.md", "external renderer")];',
    "  },",
    "};",
    "",
  ].join("\n");
  await writeFile(module, source, "utf8");
  await declareProfileFile(dir, name);
  return module;
}

/** Writes a dependency-free renderer module with the given id into a copied profile. */
async function addRendererModule(dir: string, id: string): Promise<string> {
  const name = `probe-renderer-${id}.ts`;
  const module = path.join(dir, "profiles", "core001", name);
  const source = [
    'import { fileURLToPath } from "node:url";',
    'const bytes = new TextEncoder().encode("probe");',
    "export const renderer = {",
    `  id: ${JSON.stringify(id)},`,
    '  version: "0.1.0",',
    "  closure: {",
    '    root: fileURLToPath(new URL(".", import.meta.url)),',
    `    files: [${JSON.stringify(name)}],`,
    "    dependencies: {},",
    "  },",
    "  async render() {",
    '    return [{ path: "output/CORE-001.draft.md", bytes, sha256: "sha256:0" }];',
    "  },",
    "};",
    "",
  ].join("\n");
  await writeFile(module, source, "utf8");
  await declareProfileFile(dir, name);
  return module;
}

/** Adds a file to the copied project's declared profile closure. */
async function declareProfileFile(dir: string, name: string): Promise<void> {
  const file = path.join(dir, "profiles", "core001", "profile.json");
  const profile = JSON.parse(await readFile(file, "utf8")) as { files?: string[] };
  profile.files = [...(profile.files ?? []), name];
  await writeFile(file, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

test("consent: an import failure is reported instead of a generic missing renderer", async () => {
  const dir = await copyProjectWithProfile("preflight-import-error");

  await assert.rejects(
    loadProfileRenderers(true, dir, {
      rendererModule: rendererModuleOf(dir),
      importRenderer: async () => {
        throw new Error("renderer module failed to compile");
      },
    }),
    /renderer module failed to compile/,
  );
});

test("consent: a module exporting a null renderer fails loudly", async () => {
  const dir = await copyProjectWithProfile("preflight-null-renderer");
  const module = path.join(dir, "profiles", "core001", "null-renderer.ts");
  await writeFile(module, "export const renderer = null;\n", "utf8");
  await declareProfileFile(dir, "null-renderer.ts");

  await assert.rejects(
    loadProfileRenderers(true, dir, { rendererModule: module }),
    /does not export a renderer/,
  );
});

test("consent: the CLI preflight rejects a renderer module reached through a symlink out of the profile directory", async () => {
  const dir = await copyProjectWithProfile("preflight-symlink");
  const outside = path.join(dir, "outside-renderer.ts");
  await writeFile(
    outside,
    'export const renderer = { id: "core001-markdown", version: "0.1.0", render: async () => [] };\n',
    "utf8",
  );
  const link = path.join(dir, "profiles", "core001", "link-renderer.ts");
  await symlink(outside, link);
  await declareProfileFile(dir, "link-renderer.ts");

  let imported = 0;
  const renderers = await loadProfileRenderers(true, dir, {
    rendererModule: link,
    importRenderer: async () => {
      imported += 1;
      return FAKE_RENDERER;
    },
  });

  assert.equal(imported, 0, "a symlinked module escaping the profile directory was imported");
  assert.deepEqual(renderers, {});
});

test("consent: --renderer-module does not bypass the consent gate", async () => {
  const cli = spawnSync(
    process.execPath,
    [
      cliPath,
      "--spec",
      path.join(root, "spec"),
      "--no-write",
      "--json",
      "--renderer-module",
      path.join(root, "profiles", "core001", "renderer.ts"),
    ],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(cli.status, 1, cli.stderr);
  const output = JSON.parse(cli.stdout) as CliJson;
  assert.equal(output.exitCode, 1);
  assert.ok(output.diagnostics.some((item) => item.code === "core.profile.consent-required"));
  assert.equal(
    output.diagnostics.some((item) => item.code === "core.render.failed"),
    false,
  );
});

test("consent: a real renderer module whose id mismatches is imported but not registered", async () => {
  const dir = await copyProjectWithProfile("e2e-id-mismatch");
  const module = await addRendererModule(dir, "other-markdown");

  const cli = spawnSync(
    process.execPath,
    [
      cliPath,
      "--spec",
      dir,
      "--no-write",
      "--json",
      "--allow-executable-profile",
      "--renderer-module",
      module,
    ],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(cli.status, 1, cli.stderr);
  const output = JSON.parse(cli.stdout) as CliJson;
  assert.equal(output.exitCode, 1);
  assert.ok(output.diagnostics.some((item) => item.code === "core.registry.missing"));
  assert.equal(
    output.diagnostics.some((item) => item.code === "core.render.failed"),
    false,
  );
});

test("consent: the CLI preflight does not import the renderer when the lockfile is unreadable", async () => {
  const dir = await copyProjectWithProfile("lockfile-unavailable");
  let imported = 0;

  const renderers = await loadProfileRenderers(true, dir, {
    rendererModule: rendererModuleOf(dir),
    importRenderer: async () => {
      imported += 1;
      return FAKE_RENDERER;
    },
    validateClosure: (project, diagnostics) =>
      validateProfileClosure(project, diagnostics, async () => {
        throw new Error("bun.lock is unavailable");
      }),
  });

  assert.equal(imported, 0, "renderer imported although the lockfile was unreadable");
  assert.deepEqual(renderers, {});
});

test("identity: a lockfile read failure fails the profile closure preflight with ERR_IO", async () => {
  const dir = await copyProjectWithProfile("lockfile-error");
  const diagnostics = new Diagnostics();
  const project = await loadManifest(dir, diagnostics);
  assert.ok(project !== null);

  const ok = await validateProfileClosure(project, diagnostics, async () => {
    throw new Error("bun.lock is unavailable");
  });

  assert.equal(ok, false);
  assert.ok(
    diagnostics.sorted().some((item) => item.code === "ERR_IO" && item.file === "bun.lock"),
  );
});
