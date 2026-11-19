/**
 * Locale behaviour (Issue #208).
 *
 * English is the default locale for every CLI and build output; Russian stays available as an
 * explicit locale. A project can declare its own artifact locale, so the artifact may embed
 * diagnostics in another locale while the CLI prints the same diagnostics in English.
 *
 * These tests also pin the engine catalog: every `core.*` code in the diagnostic registry must
 * resolve to a message in every supported locale.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "../spec/lib/locale.js";
import { ENGINE_MESSAGES, cliText, messageText } from "../spec/lib/messages.js";
import { copyEngineProject, ENGINE_RENDERERS } from "./support.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const cliPath = path.join(root, "spec", "build.ts");

const base = (specDir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: ENGINE_RENDERERS,
  allowExecutableProfile: true,
  ...overrides,
});

async function project(name: string): Promise<string> {
  return copyEngineProject(name);
}

const cli = (specDir: string, args: string[]) =>
  spawnSync(
    process.execPath,
    [
      cliPath,
      "--spec",
      specDir,
      "--no-write",
      "--allow-executable-profile",
      "--renderer-module",
      path.join(specDir, "profiles", "example", "renderer.ts"),
      ...args,
    ],
    { cwd: root, encoding: "utf8" },
  );

test("locale: English is the default locale", () => {
  assert.equal(DEFAULT_LOCALE, "en");
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(typeof locale, "string");
  }
});

test("locale: the schema fallback keeps Ajv detail for en and Russian-only text for ru", async () => {
  const dir = await project("schema-oneof");
  const schemaPath = path.join(dir, "profiles", "example", "schemas", "requirements.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>;
  // Both branches match, so the only Ajv error comes from the `oneOf` keyword itself, which
  // `describe()` has no catalog entry for and resolves through its fallback.
  schema.oneOf = [{ required: ["requirements"] }, { required: ["requirements"] }];
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");

  const english = await runBuild(base(dir));
  const russian = await runBuild(base(dir, { locale: "ru" }));
  const englishDiagnostic = english.diagnostics.find((item) => item.code === "ERR_SCHEMA");
  const russianDiagnostic = russian.diagnostics.find((item) => item.code === "ERR_SCHEMA");
  assert.ok(englishDiagnostic !== undefined, "the oneOf schema must fail validation");
  assert.ok(russianDiagnostic !== undefined, "the oneOf schema must fail validation in ru");
  assert.match(englishDiagnostic.message, /must match exactly one schema in oneOf/);
  assert.equal(
    /must match exactly one schema in oneOf/.test(russianDiagnostic.message),
    false,
    russianDiagnostic.message,
  );
  assert.match(russianDiagnostic.message, /Нарушение схемы/);
});

test("locale: a JavaScript caller cannot smuggle an unsupported locale past the API", async () => {
  const dir = await project("locale-api");
  const result = await runBuild(base(dir, { locale: "en" }));
  assert.equal(result.exitCode, 0);
  // `undefined` keeps the English default, as every other test's base() shows.
  assert.equal((await runBuild(base(dir))).exitCode, 0);
  assert.equal((await runBuild(base(dir, { locale: "ru" }))).exitCode, 0);

  await assert.rejects(
    runBuild(base(dir, { locale: "xx" as unknown as Locale })),
    (error: unknown) =>
      error instanceof TypeError && /supported locales: en, ru/.test(error.message),
  );
});

test("locale: the CLI prints English framing and diagnostics by default", async () => {
  const dir = await project("cli-default");
  const result = cli(dir, []);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Build: mode=draft/);
  assert.match(result.stdout, /^Result: ok/m);
  // English output may quote Russian domain content quoted by a profile; the framing and the
  // diagnostic text itself are English.
  assert.equal(/Сборка:|Результат:/.test(result.stdout), false, result.stdout);
});

test("locale: --locale ru localizes the CLI framing", async () => {
  const dir = await project("cli-ru");
  const result = cli(dir, ["--locale", "ru"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Сборка: mode=draft/);
  assert.match(result.stdout, /^Результат: ok/m);
});

test("locale: --json keeps its shape and follows the CLI locale", async () => {
  const dir = await project("cli-json");
  const english = cli(dir, ["--json"]);
  const russian = cli(dir, ["--json", "--locale", "ru"]);
  assert.equal(english.status, 0, english.stderr);
  assert.equal(russian.status, 0, russian.stderr);

  const en = JSON.parse(english.stdout) as { diagnostics: Array<{ code: string }> };
  const ru = JSON.parse(russian.stdout) as { diagnostics: Array<{ code: string }> };
  assert.deepEqual(
    en.diagnostics.map((diagnostic) => diagnostic.code),
    ru.diagnostics.map((diagnostic) => diagnostic.code),
  );
});

test("locale: the last --locale flag wins, matching argument parsing", async () => {
  const dir = await project("cli-last-flag");
  const result = cli(dir, ["--locale", "ru", "--locale", "en"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Build: mode=draft/);
  assert.match(result.stdout, /^Result: ok/m);
});

test("locale: an unsupported locale is rejected with a localized CLI error", async () => {
  const dir = await project("cli-bad-locale");
  const result = spawnSync(
    process.execPath,
    [cliPath, "--spec", dir, "--no-write", "--locale", "xx"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid locale: xx/);
  assert.match(result.stderr, /--locale en\|ru/);
});

test("locale: every core.* registry code has an engine message in every locale", async () => {
  const registry = await readFile(
    path.join(root, "docs", "architecture", "diagnostic-code-registry.md"),
    "utf8",
  );
  const codes = [...registry.matchAll(/^\|\s*`(core\.[^`]+)`\s*\|/gm)].map((match) => match[1]!);
  assert.ok(codes.length > 0, "the registry must declare core.* codes");

  for (const code of codes) {
    const entries = ENGINE_MESSAGES.filter((entry) => entry[0] === code);
    assert.ok(entries.length > 0, `no engine message for ${code}`);
    for (const entry of entries) {
      assert.equal(typeof entry[2], "string");
      assert.equal(typeof entry[3], "string");
      assert.notEqual(entry[2].length, 0, `${code}: empty en message`);
      assert.notEqual(entry[3].length, 0, `${code}: empty ru message`);
    }
  }
});

test("locale: engine catalog messages are complete and language-consistent", () => {
  const placeholders = (template: string) =>
    [...template.matchAll(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g)].map((match) => match[1]).sort();
  const keys = new Set<string>();
  for (const entry of ENGINE_MESSAGES) {
    const [code, variant, en, ru] = entry;
    const key = `${code}#${variant}`;
    assert.equal(keys.has(key), false, `duplicate engine message key ${key}`);
    keys.add(key);
    assert.notEqual(en.length, 0, `${key}: empty en message`);
    assert.notEqual(ru.length, 0, `${key}: empty ru message`);
    assert.deepEqual(placeholders(en), placeholders(ru), `${key}: en and ru placeholders diverge`);
    assert.equal(/[А-Яа-яЁё]/.test(en), false, `${key}: English message contains Cyrillic`);
  }
});

test("locale: message interpolation refuses a missing parameter", () => {
  assert.equal(
    messageText("ERR_IO#file-read-failed", "en", { error: "boom" }),
    "Failed to read the file: boom",
  );
  assert.throws(() => messageText("ERR_IO#file-read-failed", "en", {}), /missing parameter/);
  assert.equal(cliText("cli.result.ok", "en"), "Result: ok (the artifact was not written)");
});
