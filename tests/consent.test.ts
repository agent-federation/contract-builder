import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
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
    const filePath = path.join(dir, "profile", file);
    const original = await readFile(filePath, "utf8");
    await writeFile(filePath, `${header}${original}${footer}`, "utf8");
  }

  return { dir, marker };
}

interface MutableManifest {
  profile: { source: string; external?: boolean };
  render: Array<{ renderer?: string }>;
}

/** A copy of the synthetic example project with its declared renderer id replaced. */
async function copyExampleProjectWithRenderer(
  name: string,
  rendererId: string,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `consent-${name}-`));
  await cp(path.join(root, "tests", "fixtures", "example-project"), dir, { recursive: true });

  const manifestPath = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as MutableManifest;
  manifest.profile.source = path.join(root, "profiles", "example");
  manifest.profile.external = true;
  manifest.render[0]!.renderer = rendererId;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return dir;
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

  const diagnostic = result.diagnostics.find((item) => item.code === "core.profile.consent-required");
  assert.ok(diagnostic !== undefined);
  assert.equal(diagnostic.severity, "error");
  assert.equal(diagnostic.file, "profile.json");
  assert.match(diagnostic.message, /allowExecutableProfile/);
  assert.match(diagnostic.message, /--allow-executable-profile/);
  assert.match(diagnostic.message, /не является изоляцией/);
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

test("consent: the CLI fails closed without the flag and builds with it", async () => {
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

  const allowed = spawnSync(process.execPath, [...args, "--allow-executable-profile"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.ok(allowed.stdout.trim().length > 0, allowed.stderr);
  const allowedOutput = JSON.parse(allowed.stdout) as CliJson;
  assert.equal(allowedOutput.exitCode, 0);
  assert.equal(allowedOutput.blockedBy, null);
  assert.ok(allowedOutput.identity !== null);
  assert.match(allowedOutput.identity.inputDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(existsSync(marker), true, "CLI did not evaluate profile code with consent");
});

test("consent: the CLI does not execute the CORE-001 renderer for another profile", async () => {
  // The synthetic profile declares the CORE-001 renderer id. If the CLI imported the
  // built-in renderer on the consent flag alone, runBuild would run it and fail with
  // core.render.failed; gating on the selected project's profile must leave it unregistered.
  const dir = await copyExampleProjectWithRenderer("other-profile", "core001-markdown");

  const result = spawnSync(
    process.execPath,
    [cliPath, "--spec", dir, "--no-write", "--json", "--allow-executable-profile"],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stdout.trim().length > 0, result.stderr);
  const output = JSON.parse(result.stdout) as CliJson;
  assert.equal(output.exitCode, 1);
  assert.ok(output.diagnostics.some((item) => item.code === "core.registry.missing"));
  assert.equal(output.diagnostics.some((item) => item.code === "core.render.failed"), false);
});

const FAKE_RENDERER: Renderer = {
  id: "core001-markdown",
  version: "0.1.0",
  async render() {
    return [];
  },
};

test("consent: the CLI preflight validates the profile closure before importing the renderer", async () => {
  // The new relative module exists (so importing it would succeed) but is not declared in
  // profile.files. The injected importer counts calls, so a nonzero count proves the
  // renderer was imported before the closure violation was rejected.
  const dir = await copyProjectWithProfile("closure-preflight");
  await writeFile(
    path.join(dir, "profile", "undeclared.ts"),
    "export const undeclared = true;\n",
    "utf8",
  );
  const rendererPath = path.join(dir, "profile", "renderer.ts");
  const renderer = await readFile(rendererPath, "utf8");
  await writeFile(
    rendererPath,
    `import { undeclared } from "./undeclared.js";\n${renderer}\nvoid undeclared;\n`,
    "utf8",
  );

  let imported = 0;
  const renderers = await loadProfileRenderers(true, dir, async () => {
    imported += 1;
    return FAKE_RENDERER;
  });

  assert.equal(imported, 0, "renderer imported before the profile closure was validated");
  assert.deepEqual(renderers, {});
});

test("consent: the CLI preflight imports the renderer only for a declared valid project", async () => {
  const dir = await copyProjectWithProfile("preflight-valid");
  let imported = 0;

  const renderers = await loadProfileRenderers(true, dir, async () => {
    imported += 1;
    return FAKE_RENDERER;
  });

  assert.equal(imported, 1);
  assert.deepEqual(renderers, { [FAKE_RENDERER.id]: FAKE_RENDERER });
});

test("consent: the CLI preflight skips the renderer for another profile", async () => {
  // The synthetic profile declares the CORE-001 renderer id; profile gating must still skip
  // the import even when the renderer id matches.
  const dir = await copyExampleProjectWithRenderer("preflight-other", "core001-markdown");
  let imported = 0;

  const renderers = await loadProfileRenderers(true, dir, async () => {
    imported += 1;
    return FAKE_RENDERER;
  });

  assert.equal(imported, 0);
  assert.deepEqual(renderers, {});
});

test("consent: the CLI preflight does not import the renderer when the lockfile is unreadable", async () => {
  const dir = await copyProjectWithProfile("lockfile-unavailable");
  let imported = 0;

  const renderers = await loadProfileRenderers(
    true,
    dir,
    async () => {
      imported += 1;
      return FAKE_RENDERER;
    },
    (project, diagnostics) =>
      validateProfileClosure(project, diagnostics, async () => {
        throw new Error("bun.lock is unavailable");
      }),
  );

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
