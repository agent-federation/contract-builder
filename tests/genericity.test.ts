import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * The guard covers the forms CORE-001 coupling actually took in this codebase:
 * quoted kind/relation names, unquoted domain words (except the TypeScript `case`
 * keyword), the CORE-001 token, CORE-001 assets, profile/fixture paths, and CORE-001
 * Russian labels. It is a ratchet, not a proof: an arbitrary identifier or template
 * expression could still carry domain meaning without matching. The scan covers the whole
 * `spec/` tree, not only `spec/lib`, so the CLI cannot reintroduce a domain-specific name.
 */
const QUOTED_KIND = /["'](fragment|term|provision|decision|case|dependsOn|mentions|vectors)["']/;
const UNQUOTED_KIND = /\b(fragment|term|provision|decision|dependsOn|mentions|vectors)\b/;
const CORE_TOKEN = /CORE-001|core001/i;
const CORE_ASSET = /labels\.ru\.json|templates\/core001|output\/CORE-001/i;
/** A generic engine module must not reach into a profile, fixture or test tree by path. */
const PROFILE_PATH = /["'][^"'\n]*(?:profiles|fixtures|tests)\/[^"'\n]*["']/;
const DOMAIN_LABEL =
  /обязанность|запрет|разрешение|дословно|пересказ|положение|кейс|термин|фрагмент/i;

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

/** Engine files that mention a forbidden CORE-001 token. */
export async function scanEngine(dir: string): Promise<string[]> {
  const offenders: string[] = [];
  for (const file of await walk(dir)) {
    const text = await readFile(file, "utf8");
    if (
      QUOTED_KIND.test(text) ||
      UNQUOTED_KIND.test(text) ||
      CORE_TOKEN.test(text) ||
      CORE_ASSET.test(text) ||
      PROFILE_PATH.test(text) ||
      DOMAIN_LABEL.test(text)
    ) {
      offenders.push(file);
    }
  }
  return offenders.sort();
}

test("genericity: the engine and its CLI carry no CORE-001 domain tokens", async () => {
  assert.deepEqual(await scanEngine(path.join(root, "spec")), []);
});

test("genericity: the guard catches a forbidden reference", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "genericity-"));
  const quoted = path.join(dir, "quoted.ts");
  const unquoted = path.join(dir, "unquoted.ts");
  const imported = path.join(dir, "imported.ts");
  const asset = path.join(dir, "asset.ts");
  const profilePath = path.join(dir, "profile-path.ts");
  await writeFile(quoted, 'const value = "provision";\n', "utf8");
  await writeFile(unquoted, "const provision = 1;\n", "utf8");
  await writeFile(
    imported,
    'import { renderer } from "../../profiles/core001/renderer.js";\n',
    "utf8",
  );
  await writeFile(asset, 'const labels = "labels.ru.json";\n', "utf8");
  await writeFile(profilePath, 'const profile = "profiles/example/profile.json";\n', "utf8");

  assert.deepEqual(await scanEngine(dir), [quoted, unquoted, imported, asset, profilePath].sort());
});

test("genericity: the guard leaves generic profile-drive code alone", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "genericity-clean-"));
  const file = path.join(dir, "generic.ts");
  await writeFile(
    file,
    [
      "export const kinds = ['requirement', 'example'];",
      "export const relation = 'requirement';",
      "export function buildTitles(entities: Array<{ id: string }>) {",
      "  return entities.map((entity) => entity.id);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  assert.deepEqual(await scanEngine(dir), []);
});
