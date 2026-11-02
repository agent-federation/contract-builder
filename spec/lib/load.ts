import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { Diagnostics } from "./diagnostics.js";
import { isMissingFile, messageOf } from "./guards.js";
import { loadManifest, resolveContained, type ResolvedProject } from "./manifest.js";

export interface LoadedSpec {
  project: ResolvedProject;
  /** Raw bytes of every loaded input, keyed by the declared input path. */
  bytes: Record<string, Uint8Array>;
  /** Parsed documents keyed by the declared input path. */
  documents: Record<string, unknown>;
  /** The same documents keyed by the profile's document binding, for non-entity consumers. */
  byKey: Record<string, unknown>;
}

/**
 * Loads the manifest, then every declared input. Missing manifest, malformed input or a
 * path escaping the project root returns `null`; diagnostics carry the reason.
 */
export async function loadProject(
  specDir: string,
  diags: Diagnostics,
): Promise<LoadedSpec | null> {
  const project = await loadManifest(specDir, diags);
  if (project === null) return null;

  const bytes: Record<string, Uint8Array> = {};
  const documents: Record<string, unknown> = {};
  let failed = false;

  for (const input of project.manifest.inputs) {
    const located = await resolveContained(project.root, input.path);

    let raw: Uint8Array;
    try {
      raw = new Uint8Array(await readFile(located.abs));
    } catch (error) {
      if (isMissingFile(error) && input.optional === true) continue;
      diags.error("ERR_IO", input.path, "", `Не удалось прочитать файл: ${messageOf(error)}`);
      failed = true;
      continue;
    }

    try {
      const text = new TextDecoder().decode(raw);
      const parsed = input.format === "json" ? JSON.parse(text) : parseYaml(text);
      if (parsed === null || typeof parsed !== "object") {
        diags.error("ERR_PARSE", input.path, "", "Файл должен содержать объект верхнего уровня");
        failed = true;
        continue;
      }
      bytes[input.path] = raw;
      documents[input.path] = parsed;
    } catch (error) {
      diags.error("ERR_PARSE", input.path, "", `Ошибка разбора: ${messageOf(error)}`);
      failed = true;
    }
  }

  if (failed) return null;

  const byKey: Record<string, unknown> = {};
  for (const [index, binding] of project.profile.documents.entries()) {
    const document = documents[binding.input];
    if (document === undefined) {
      diags.error(
        "core.profile.invalid",
        "profile.json",
        `/documents/${index}/input`,
        `Привязка "${binding.key}" ссылается на незагруженный вход "${binding.input}"`,
      );
      return null;
    }
    byKey[binding.key] = document;
  }

  return { project, bytes, documents, byKey };
}
