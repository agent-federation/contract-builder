import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const QUOTED_KIND = /["'](fragment|term|provision|decision|case|dependsOn|mentions|vectors)["']/;
const CORE_TOKEN = /CORE-001|core001/;
const DOMAIN_LABEL =
  /обязанность|запрет|разрешение|дословно|пересказ|положение|кейс|термин|фрагмент/i;

/** `render.ts` is the last CORE-001-aware engine module; PR 5 moves it into the profile. */
const ALLOWED = new Set(["render.ts"]);

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

test("genericity: the engine carries no CORE-001 domain tokens", async () => {
  const offenders: string[] = [];

  for (const file of await walk(path.join(root, "spec", "lib"))) {
    if (ALLOWED.has(path.basename(file))) continue;
    const text = await readFile(file, "utf8");
    if (QUOTED_KIND.test(text) || CORE_TOKEN.test(text) || DOMAIN_LABEL.test(text)) {
      offenders.push(path.relative(root, file));
    }
  }

  assert.deepEqual(offenders, []);
});
