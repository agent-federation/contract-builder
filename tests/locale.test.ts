/**
 * Locale behaviour (Issue #208).
 *
 * English is the default locale for every CLI and build output; Russian stays available as an
 * explicit locale. The rendered CORE-001 artifact keeps its declared `ru` locale, so the
 * artifact embeds Russian diagnostics while the CLI prints the same diagnostics in English.
 *
 * These tests also pin the catalogs: every code declared by the core001 profile and every
 * `core.*` code in the diagnostic registry must resolve to a message in every supported
 * locale.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../spec/lib/locale.js";
import { ENGINE_MESSAGES, cliText, messageText } from "../spec/lib/messages.js";
import { TEST_RENDERERS } from "./support.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const specDir = path.join(root, "spec");
const cliPath = path.join(root, "spec", "build.ts");
const fixture = (name: string) => path.join(root, "fixtures", name, "spec");

const base = (overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: TEST_RENDERERS,
  allowExecutableProfile: true,
  ...overrides,
});

const cli = (args: string[]) =>
  spawnSync(
    process.execPath,
    [
      cliPath,
      "--spec",
      specDir,
      "--allow-executable-profile",
      "--renderer-module",
      path.join(root, "profiles", "core001", "renderer.ts"),
      ...args,
    ],
    { cwd: root, encoding: "utf8" },
  );

test("locale: English is the default for build diagnostics", async () => {
  assert.equal(DEFAULT_LOCALE, "en");
  const result = await runBuild(base());
  const warning = result.diagnostics.find(
    (diagnostic) => diagnostic.code === "WARN_UNDEFINED_TERM_IN_QUOTE",
  );
  assert.ok(warning !== undefined);
  assert.match(warning.message, /mentions terms outside the slice/);
});

test("locale: the ru locale reproduces the recorded Russian diagnostics", async () => {
  const result = await runBuild(base({ locale: "ru" }));
  const recorded = JSON.parse(
    await readFile(path.join(root, "tests", "golden", "core001.diagnostics.json"), "utf8"),
  ) as Array<{ code: string; message: string }>;
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    recorded.map((diagnostic) => diagnostic.code),
  );
  for (const [index, diagnostic] of result.diagnostics.entries()) {
    assert.equal(diagnostic.message, recorded[index]?.message);
  }
});

test("locale: the CORE-001 artifact renders diagnostics in ru while the CLI is English", async () => {
  const result = await runBuild(base());
  assert.ok(result.markdown !== null);
  const warning = result.diagnostics.find(
    (diagnostic) => diagnostic.code === "WARN_UNDEFINED_TERM_IN_QUOTE",
  );
  assert.ok(warning !== undefined);
  assert.match(warning.message, /^The quote of provision/);
  assert.ok(
    result.markdown.includes(
      'В цитате положения "REQ-TEMPORAL-MOMENT-DEFINED" упоминаются термины вне среза: Credential.',
    ),
    "the artifact must keep its Russian Appendix B text",
  );
  assert.equal(
    result.markdown.includes(warning.message),
    false,
    "the artifact must not embed the English CLI text",
  );
});

test("locale: fixtures print English engine diagnostics by default and Russian in ru", async () => {
  const english = await runBuild(base({ specDir: fixture("broken-modality") }));
  assert.notEqual(english.exitCode, 0);
  const englishDiagnostic = english.diagnostics.find(
    (item) => item.code === "ERR_MODALITY_UPGRADE" || item.code === "ERR_MODALITY_MARKER",
  );
  assert.ok(englishDiagnostic !== undefined, "fixture must emit its modality diagnostic");
  assert.match(englishDiagnostic.message, /[A-Za-z]/);
  assert.equal(/[А-Яа-яЁё]/.test(englishDiagnostic.message), false, englishDiagnostic.message);

  const russian = await runBuild(base({ specDir: fixture("broken-modality"), locale: "ru" }));
  const russianDiagnostic = russian.diagnostics.find(
    (item) => item.code === englishDiagnostic.code,
  );
  assert.ok(russianDiagnostic !== undefined);
  assert.match(russianDiagnostic.message, /[А-Яа-яЁё]/, russianDiagnostic.message);
  assert.notEqual(russianDiagnostic.message, englishDiagnostic.message);
});

test("locale: the CLI prints English framing and diagnostics by default", () => {
  const result = cli(["--check"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Build: mode=draft/);
  assert.match(result.stdout, /^Result: ok/m);
  assert.match(result.stdout, /The normalization of provision/);
  // English output may quote Russian domain content (for example an unresolved condition
  // copied from semantics.json); the framing and the diagnostic text itself are English.
  assert.equal(/Сборка:|Результат:/.test(result.stdout), false, result.stdout);
});

test("locale: --locale ru localizes the CLI framing", () => {
  const result = cli(["--check", "--locale", "ru"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Сборка: mode=draft/);
  assert.match(result.stdout, /^Результат: ok/m);
});

test("locale: --json keeps its shape and follows the CLI locale", () => {
  const english = cli(["--check", "--json"]);
  const russian = cli(["--check", "--json", "--locale", "ru"]);
  assert.equal(english.status, 0, english.stderr);
  assert.equal(russian.status, 0, russian.stderr);

  const en = JSON.parse(english.stdout) as {
    diagnostics: Array<{ code: string; message: string }>;
  };
  const ru = JSON.parse(russian.stdout) as {
    diagnostics: Array<{ code: string; message: string }>;
  };
  assert.deepEqual(
    en.diagnostics.map((diagnostic) => diagnostic.code),
    ru.diagnostics.map((diagnostic) => diagnostic.code),
  );
  const enWarning = en.diagnostics.find(
    (diagnostic) => diagnostic.code === "WARN_UNDEFINED_TERM_IN_QUOTE",
  );
  const ruWarning = ru.diagnostics.find(
    (diagnostic) => diagnostic.code === "WARN_UNDEFINED_TERM_IN_QUOTE",
  );
  assert.match(enWarning?.message ?? "", /mentions terms outside the slice/);
  assert.match(ruWarning?.message ?? "", /упоминаются термины вне среза/);
});

test("locale: an unsupported locale is rejected with a localized CLI error", () => {
  const result = spawnSync(
    process.execPath,
    [cliPath, "--spec", specDir, "--check", "--locale", "xx"],
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

test("locale: every core001 catalog code has a message in every locale", async () => {
  const catalog = JSON.parse(
    await readFile(path.join(root, "profiles", "core001", "catalog.json"), "utf8"),
  ) as {
    codes: Array<{ code: string; variant?: string; messages?: Record<string, string> }>;
  };
  assert.ok(catalog.codes.length > 0);
  for (const entry of catalog.codes) {
    for (const locale of SUPPORTED_LOCALES) {
      const text = entry.messages?.[locale];
      assert.equal(typeof text, "string", `${entry.code}: no ${locale} message`);
      assert.notEqual(text?.length, 0, `${entry.code}: empty ${locale} message`);
    }
    const placeholders = (template: string) =>
      [...template.matchAll(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(
      placeholders(entry.messages?.en ?? ""),
      placeholders(entry.messages?.ru ?? ""),
      `${entry.code}: en and ru placeholders diverge`,
    );
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
