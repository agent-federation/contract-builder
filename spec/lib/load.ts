import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Diagnostics } from "./diagnostics.js";
import {
  loadManifest,
  resolveContained,
  type ManifestSource,
  type ResolvedProject,
} from "./manifest.js";

/**
 * Transitional view of the five CORE-001 documents.
 *
 * The names match the pre-manifest `SpecFiles` shape so `build.ts` and `semantic.ts`
 * keep working unchanged until PR 3 replaces them with the generic IR. The view is
 * assembled from the profile's `documents` bindings, not from fixed file names.
 */
export interface SpecFiles {
  sources: unknown;
  ontology: unknown;
  semantics: unknown;
  decisions: unknown;
  cases: unknown;
}

export interface LegacySource {
  id: string;
  path: string;
  document: string;
  revision: string;
}

export interface LoadedSpec {
  project: ResolvedProject;
  /** Parsed documents keyed by the declared input path. */
  documents: Record<string, unknown>;
  /** Transitional `RawSpec` view; removed with `semantic.ts` in PR 4. */
  files: SpecFiles;
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

  const documents: Record<string, unknown> = {};
  let failed = false;

  for (const input of project.manifest.inputs) {
    const located = await resolveContained(project.root, input.path);

    let text: string;
    try {
      text = await readFile(located.abs, "utf8");
    } catch (error) {
      if (isMissing(error) && input.optional === true) continue;
      diags.error("ERR_IO", input.path, "", `Не удалось прочитать файл: ${messageOf(error)}`);
      failed = true;
      continue;
    }

    try {
      const parsed = input.format === "json" ? JSON.parse(text) : parseYaml(text);
      if (parsed === null || typeof parsed !== "object") {
        diags.error("ERR_PARSE", input.path, "", "Файл должен содержать объект верхнего уровня");
        failed = true;
        continue;
      }
      documents[input.path] = parsed;
    } catch (error) {
      diags.error("ERR_PARSE", input.path, "", `Ошибка разбора: ${messageOf(error)}`);
      failed = true;
    }
  }

  if (failed) return null;

  const files = {} as SpecFiles;
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
    (files as unknown as Record<string, unknown>)[binding.key] = document;
  }

  // Transitional shim: `sources:` moved to the manifest, but `build.ts` and `semantic.ts`
  // still read `raw.sources.sources`. Removed in PR 4 together with the view.
  const sourcesDocument = files.sources;
  if (sourcesDocument !== null && typeof sourcesDocument === "object") {
    (files as unknown as Record<string, unknown>).sources = {
      ...(sourcesDocument as Record<string, unknown>),
      sources: (project.manifest.sources ?? []).map(toLegacySource),
    };
  }

  return { project, documents, files };
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

function toLegacySource(source: ManifestSource): LegacySource {
  return {
    id: source.id,
    path: source.path,
    document: source.identity?.document ?? "",
    revision: source.identity?.revision ?? "",
  };
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
