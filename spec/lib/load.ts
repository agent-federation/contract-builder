import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Diagnostics } from "./diagnostics.js";

export interface SpecFiles {
  sources: unknown;
  ontology: unknown;
  semantics: unknown;
  decisions: unknown;
  cases: unknown;
}

const FILES = [
  { key: "sources", file: "sources.yml", format: "yaml" },
  { key: "ontology", file: "ontology.yml", format: "yaml" },
  { key: "semantics", file: "semantics.json", format: "json" },
  { key: "decisions", file: "decisions.yml", format: "yaml" },
  { key: "cases", file: "conformance/cases.yml", format: "yaml" },
] as const;

export async function loadSpecFiles(specDir: string, diags: Diagnostics): Promise<SpecFiles | null> {
  const out: Partial<SpecFiles> = {};
  let failed = false;

  for (const entry of FILES) {
    const absolute = path.join(specDir, entry.file);
    let text: string;
    try {
      text = await readFile(absolute, "utf8");
    } catch (error) {
      diags.error("ERR_IO", entry.file, "", `Не удалось прочитать файл: ${messageOf(error)}`);
      failed = true;
      continue;
    }

    try {
      const parsed = entry.format === "json" ? JSON.parse(text) : parseYaml(text);
      if (parsed === null || typeof parsed !== "object") {
        diags.error("ERR_PARSE", entry.file, "", "Файл должен содержать объект верхнего уровня");
        failed = true;
        continue;
      }
      out[entry.key] = parsed;
    } catch (error) {
      diags.error("ERR_PARSE", entry.file, "", `Ошибка разбора: ${messageOf(error)}`);
      failed = true;
    }
  }

  return failed ? null : (out as SpecFiles);
}

export async function readLegacySource(
  specDir: string,
  relativePath: string,
  diags: Diagnostics,
): Promise<string | null> {
  try {
    return await readFile(path.resolve(specDir, relativePath), "utf8");
  } catch (error) {
    diags.error("ERR_IO", relativePath, "", `Не удалось прочитать источник: ${messageOf(error)}`);
    return null;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
