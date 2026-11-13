/**
 * Fail-closed behaviour for profile hooks and unexpected CLI errors (issue #285).
 *
 * A profile module is trusted code, but a thrown value must still be collected as a diagnostic:
 * the engine contract says diagnostics are never thrown, and `--json` must always produce one
 * document. These tests cover the API boundary and the CLI transport.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { markdownAdapter } from "../spec/lib/adapters/markdown.js";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { cliErrorDocument, internalErrorMessage, renderCliError } from "../spec/lib/cli-errors.js";
import type { Diagnostic } from "../spec/lib/diagnostics.js";
import type { SourceAdapter } from "../spec/lib/source.js";
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

const codes = (diagnostics: readonly Diagnostic[]): string[] =>
  diagnostics.map((diagnostic) => diagnostic.code);

const failure = (result: Awaited<ReturnType<typeof runBuild>>): string =>
  result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n");

async function writeProfileFile(dir: string, file: string, source: string): Promise<void> {
  await writeFile(path.join(dir, "profiles", "core001", file), source, "utf8");
}

function cliArgs(dir: string, json: boolean, withRenderer = true): string[] {
  const args = [cliPath, "--spec", dir, "--no-write", "--allow-executable-profile"];
  if (withRenderer) {
    args.push("--renderer-module", path.join(dir, "profiles", "core001", "renderer.ts"));
  }
  if (json) args.push("--json");
  return args;
}

const STACK_FRAME = /\n\s+at /;
const THROWING_VALIDATOR =
  'export async function validate(): Promise<never> {\n  throw new Error("validator exploded");\n}\n';

test("fail-closed: a throwing validator becomes a diagnostic, not a rejection", async () => {
  const dir = await copyProjectWithProfile("throwing-validator");
  await writeProfileFile(dir, "validator.ts", THROWING_VALIDATOR);

  const result = await runBuild(base(dir));

  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.equal(result.markdown, null);
  assert.ok(codes(result.diagnostics).includes("core.profile.hook-failed"), failure(result));
  const diagnostic = result.diagnostics.find((item) => item.code === "core.profile.hook-failed");
  assert.ok(diagnostic !== undefined);
  assert.equal(diagnostic.severity, "error");
  assert.equal(diagnostic.file, "profile.json");
  assert.match(diagnostic.message, /validator/);
  assert.match(diagnostic.message, /validator exploded/);
  assert.equal(STACK_FRAME.test(diagnostic.message), false);
});

test("fail-closed: a throwing view hook becomes a diagnostic", async () => {
  const dir = await copyProjectWithProfile("throwing-view");
  await writeProfileFile(
    dir,
    "view.ts",
    'export function buildView(): never {\n  throw new Error("view exploded");\n}\n',
  );

  const result = await runBuild(base(dir));

  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.equal(result.markdown, null);
  const diagnostic = result.diagnostics.find((item) => item.code === "core.profile.hook-failed");
  assert.ok(diagnostic !== undefined, failure(result));
  assert.match(diagnostic.message, /view/);
  assert.match(diagnostic.message, /view exploded/);
});

test("fail-closed: a throwing provenance verifier becomes a diagnostic", async () => {
  const dir = await copyProjectWithProfile("throwing-provenance");
  await writeProfileFile(
    dir,
    "validator.ts",
    [
      "export async function validate() {",
      "  return [];",
      "}",
      "export async function verifyProvenance(): Promise<never> {",
      '  throw new Error("provenance exploded");',
      "}",
      "",
    ].join("\n"),
  );

  const result = await runBuild(base(dir));

  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  const diagnostic = result.diagnostics.find((item) => item.code === "core.profile.hook-failed");
  assert.ok(diagnostic !== undefined, failure(result));
  assert.match(diagnostic.message, /provenance verifier/);
  assert.match(diagnostic.message, /provenance exploded/);
});

test("fail-closed: a validator that returns a malformed finding list is a diagnostic", async () => {
  const dir = await copyProjectWithProfile("malformed-findings");
  await writeProfileFile(
    dir,
    "validator.ts",
    "export async function validate() {\n  return undefined;\n}\n",
  );

  const result = await runBuild(base(dir));

  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  const diagnostic = result.diagnostics.find((item) => item.code === "core.profile.hook-failed");
  assert.ok(diagnostic !== undefined, failure(result));
  assert.match(diagnostic.message, /validator/);
});

test("fail-closed: a provenance verifier that returns a non-array is a diagnostic", async () => {
  const dir = await copyProjectWithProfile("malformed-provenance");
  await writeProfileFile(
    dir,
    "validator.ts",
    [
      "export async function validate() {",
      "  return [];",
      "}",
      "export async function verifyProvenance() {",
      "  return undefined;",
      "}",
      "",
    ].join("\n"),
  );

  const result = await runBuild(base(dir));

  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  const diagnostic = result.diagnostics.find((item) => item.code === "core.profile.hook-failed");
  assert.ok(diagnostic !== undefined, failure(result));
  assert.match(diagnostic.message, /provenance verifier/);
  assert.match(diagnostic.message, /array of claims/);
});

test("fail-closed: a throwing quote adapter becomes a diagnostic", async () => {
  const dir = await copyProjectWithProfile("throwing-adapter");
  const throwingAdapter: SourceAdapter = {
    ...markdownAdapter,
    async verifyQuote() {
      throw new Error("adapter exploded");
    },
  };

  const result = await runBuild(base(dir, { adapters: { [markdownAdapter.id]: throwingAdapter } }));

  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.equal(result.markdown, null);
  const diagnostic = result.diagnostics.find((item) => item.code === "core.profile.hook-failed");
  assert.ok(diagnostic !== undefined, failure(result));
  assert.equal(diagnostic.file, "contract-builder.json");
  assert.match(diagnostic.message, /quote adapter/);
  assert.match(diagnostic.message, /adapter exploded/);
});

test("fail-closed: the CLI emits the diagnostic and one valid JSON document", async () => {
  const dir = await copyProjectWithProfile("cli-throwing-validator");
  await writeProfileFile(dir, "validator.ts", THROWING_VALIDATOR);

  const run = spawnSync(process.execPath, cliArgs(dir, true, false), {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(run.status, 1, run.stderr);
  const output = JSON.parse(run.stdout) as {
    exitCode: number;
    blockedBy: string | null;
    diagnostics: Array<{ code: string }>;
  };
  assert.equal(output.exitCode, 1);
  assert.equal(output.blockedBy, "errors");
  assert.ok(output.diagnostics.some((item) => item.code === "core.profile.hook-failed"));
  assert.equal(STACK_FRAME.test(run.stdout), false);
  assert.equal(STACK_FRAME.test(run.stderr), false);
});

test("fail-closed: human CLI mode prints a one-line diagnostic, not a stack trace", async () => {
  const dir = await copyProjectWithProfile("cli-throwing-validator-human");
  await writeProfileFile(dir, "validator.ts", THROWING_VALIDATOR);

  const run = spawnSync(process.execPath, cliArgs(dir, false, false), {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stdout, /core\.profile\.hook-failed/);
  assert.match(run.stdout, /validator exploded/);
  assert.equal(STACK_FRAME.test(run.stdout), false);
  assert.equal(STACK_FRAME.test(run.stderr), false);
});

/** Writes a renderer module whose `closure` getter throws after the renderer is registered. */
async function writeThrowingClosureRenderer(dir: string): Promise<void> {
  await writeProfileFile(
    dir,
    "renderer.ts",
    [
      "export const renderer = {",
      '  id: "core001-markdown",',
      '  version: "0.1.0",',
      "  get closure() {",
      '    throw new Error("renderer closure exploded");',
      "  },",
      "  async render() {",
      "    return [];",
      "  },",
      "};",
      "",
    ].join("\n"),
  );
}

test("fail-closed: an unexpected error still emits one JSON error document", async () => {
  const dir = await copyProjectWithProfile("cli-unexpected-error");
  await writeThrowingClosureRenderer(dir);

  const run = spawnSync(process.execPath, cliArgs(dir, true), { cwd: root, encoding: "utf8" });

  assert.equal(run.status, 1, run.stderr);
  const output = JSON.parse(run.stdout) as {
    kind: string;
    exitCode: number;
    error: { code: string; message: string };
    mode?: unknown;
    diagnostics?: unknown;
  };
  assert.equal(output.kind, "error");
  assert.equal(output.exitCode, 1);
  assert.equal(output.error.code, "core.cli.internal-error");
  assert.match(output.error.message, /renderer closure exploded/);
  assert.equal("mode" in output, false, "the error document fakes a build result");
  assert.equal("diagnostics" in output, false, "the error document fakes a build result");
  assert.equal(STACK_FRAME.test(run.stdout), false);
  assert.equal(STACK_FRAME.test(run.stderr), false);
  assert.equal(run.stdout.trim().startsWith("{") && run.stdout.trim().endsWith("}"), true);
});

test("fail-closed: human mode reports an unexpected error without a stack trace", async () => {
  const dir = await copyProjectWithProfile("cli-unexpected-error-human");
  await writeThrowingClosureRenderer(dir);

  const run = spawnSync(process.execPath, cliArgs(dir, false), { cwd: root, encoding: "utf8" });

  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stderr, /An unexpected error stopped the build/);
  assert.match(run.stderr, /renderer closure exploded/);
  assert.equal(STACK_FRAME.test(run.stderr), false);
});

test("fail-closed: --json engine preflight failure emits the documented CLI code", async () => {
  const emptyEngineRoot = await mkdtemp(path.join(tmpdir(), "cli-engine-preflight-"));

  const run = spawnSync(
    process.execPath,
    [cliPath, "--json", "--engine-root", emptyEngineRoot, "--spec", root],
    { cwd: root, encoding: "utf8" },
  );

  assert.equal(run.status, 1, run.stderr);
  assert.equal(run.stderr, "");
  const output = JSON.parse(run.stdout) as {
    kind: string;
    exitCode: number;
    error: { code: string; message: string };
    mode?: unknown;
    diagnostics?: unknown;
  };
  assert.equal(output.kind, "error");
  assert.equal(output.exitCode, 1);
  assert.equal(output.error.code, "cli.engine-preflight");
  // The message must be the engine diagnostic report, not the generic fallback text.
  assert.match(output.error.message, /core\.path\.outside-root/);
  assert.match(output.error.message, /package\.json/);
  assert.equal("mode" in output, false, "the error document fakes a build result");
  assert.equal("diagnostics" in output, false, "the error document fakes a build result");
  assert.equal(STACK_FRAME.test(run.stdout), false);
});

test("fail-closed: --json renderer import failure emits the documented CLI code", async () => {
  const dir = await copyProjectWithProfile("cli-renderer-load-failed");
  // A syntactically invalid module fails while it is imported, after the pre-import gates
  // and before registration: the real cause must reach the document, not a generic error.
  await writeProfileFile(dir, "renderer.ts", "export const renderer = ;\n");

  const run = spawnSync(process.execPath, cliArgs(dir, true), { cwd: root, encoding: "utf8" });

  assert.equal(run.status, 1, run.stderr);
  assert.equal(run.stderr, "");
  const output = JSON.parse(run.stdout) as {
    kind: string;
    exitCode: number;
    error: { code: string; message: string };
    mode?: unknown;
    diagnostics?: unknown;
  };
  assert.equal(output.kind, "error");
  assert.equal(output.exitCode, 1);
  assert.equal(output.error.code, "cli.renderer-load-failed");
  assert.match(output.error.message, /Failed to load the profile renderer/);
  assert.equal("mode" in output, false, "the error document fakes a build result");
  assert.equal("diagnostics" in output, false, "the error document fakes a build result");
  assert.equal(STACK_FRAME.test(run.stdout), false);
  assert.equal(STACK_FRAME.test(run.stderr), false);
});

test("fail-closed: --json always emits a document, including for a usage error", () => {
  const run = spawnSync(process.execPath, [cliPath, "--json", "--not-a-flag"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(run.status, 1);
  assert.equal(run.stderr, "");
  const output = JSON.parse(run.stdout) as {
    kind: string;
    exitCode: number;
    error: { code: string; message: string };
  };
  assert.equal(output.kind, "error");
  assert.equal(output.exitCode, 1);
  assert.equal(output.error.code, "cli.usage");
  assert.match(output.error.message, /Unknown argument: --not-a-flag/);
  assert.equal(STACK_FRAME.test(run.stdout), false);
});

test("fail-closed: the CLI error document is machine-shaped and never a build result", () => {
  assert.deepEqual(cliErrorDocument("core.cli.internal-error", "boom"), {
    kind: "error",
    exitCode: 1,
    error: { code: "core.cli.internal-error", message: "boom" },
  });

  const human = internalErrorMessage("en", new Error("boom"));
  assert.equal(human, "An unexpected error stopped the build: boom");
  assert.equal(STACK_FRAME.test(human), false);
  assert.match(internalErrorMessage("ru", new Error("бум")), /Неожиданная ошибка/);
});

test("fail-closed: renderCliError selects exactly one stream per mode", () => {
  const json = renderCliError("cli.usage", "bad arguments", true);
  assert.equal(json.stderr, null);
  const document = JSON.parse(json.stdout ?? "") as { kind: string; error: { code: string } };
  assert.equal(document.kind, "error");
  assert.equal(document.error.code, "cli.usage");

  const human = renderCliError("cli.usage", "bad arguments", false);
  assert.equal(human.stdout, null);
  assert.equal(human.stderr, "bad arguments");
});
