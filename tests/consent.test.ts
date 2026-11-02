import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
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
