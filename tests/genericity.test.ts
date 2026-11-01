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
 * keyword), the CORE-001 token, and CORE-001 Russian labels. It is a ratchet, not a
 * proof: an arbitrary identifier or template expression could still carry domain
 * meaning without matching.
 */
const QUOTED_KIND = /["'](fragment|term|provision|decision|case|dependsOn|mentions|vectors)["']/;
const UNQUOTED_KIND = /\b(fragment|term|provision|decision|dependsOn|mentions|vectors)\b/;
const CORE_TOKEN = /CORE-001|core001/;
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
      DOMAIN_LABEL.test(text)
    ) {
      offenders.push(file);
    }
  }
  return offenders.sort();
}

test("genericity: the engine carries no CORE-001 domain tokens", async () => {
  assert.deepEqual(await scanEngine(path.join(root, "spec", "lib")), []);
});

test("genericity: the guard catches a forbidden reference", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "genericity-"));
  const quoted = path.join(dir, "quoted.ts");
  const unquoted = path.join(dir, "unquoted.ts");
  await writeFile(quoted, 'const value = "provision";\n', "utf8");
  await writeFile(unquoted, "const provision = 1;\n", "utf8");

  assert.deepEqual(await scanEngine(dir), [quoted, unquoted].sort());
});
