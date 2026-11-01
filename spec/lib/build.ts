import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Diagnostics, type Diagnostic } from "./diagnostics.js";
import { loadProject } from "./load.js";
import { loadSchemas, validateDocuments } from "./schema.js";
import { buildProjectModel } from "./ir.js";
import { analyze } from "./semantic.js";
import { renderMarkdown, type BuildMode } from "./render.js";
import { resolveContained, type ResolvedProject } from "./manifest.js";
import type { SourceAdapter } from "./source.js";

export interface BuildOptions {
  specDir: string;
  mode: BuildMode;
  write: boolean;
  check: boolean;
  strict: boolean;
  /** Optional collector injection for tests; defaults to a fresh instance. */
  diagnostics?: Diagnostics;
  /** Optional adapter registry; defaults to the built-in markdown adapter. */
  adapters?: Record<string, SourceAdapter>;
}

export interface BuildResult {
  exitCode: number;
  mode: BuildMode;
  diagnostics: Diagnostic[];
  markdown: string | null;
  outputPath: string;
  written: boolean;
  blockedBy: "errors" | "review" | "warnings" | "stale-output" | null;
}

export async function runBuild(options: BuildOptions): Promise<BuildResult> {
  const specDir = path.resolve(options.specDir);
  const diags = options.diagnostics ?? new Diagnostics();

  const loaded = await loadProject(specDir, diags);
  if (loaded === null) {
    return result(options, diags, null, "", false, "errors");
  }

  const outputPath = await resolveOutputPath(loaded.project, options.mode, diags);
  if (outputPath === null) {
    return result(options, diags, null, "", false, "errors");
  }

  const schemas = await loadSchemas(loaded.project, diags);
  if (schemas === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const documentsOk = await validateDocuments(loaded, schemas, diags);
  if (!documentsOk) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const model = await buildProjectModel(loaded, schemas, diags, options.adapters);
  if (model === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const legacyName = path.basename(model.manifest.sources?.[0]?.path ?? "source");
  const spec = await analyze(model, legacyName, diags, options.adapters);
  if (spec === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  if (diags.errors > 0) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const markdown = renderMarkdown(spec, options.mode, diags.sorted(), legacyName);

  const blocking = diags.sorted().filter((d) => {
    if (d.severity === "error" || d.severity === "review") return true;
    return options.strict && d.severity === "warning";
  });

  if (options.mode === "release" && blocking.length > 0) {
    return result(options, diags, markdown, outputPath, false, "review");
  }

  if (options.strict && diags.warnings > 0) {
    return result(options, diags, markdown, outputPath, false, "warnings");
  }

  if (options.check) {
    const existing = await readFile(outputPath, "utf8").catch(() => null);
    if (existing !== markdown) {
      diags.error(
        "ERR_OUTPUT_STALE",
        path.relative(specDir, outputPath),
        "",
        "Сгенерированный документ отличается от сохранённого. Запустите сборку без --check.",
      );
      return result(options, diags, markdown, outputPath, false, "stale-output");
    }
    return result(options, diags, markdown, outputPath, false, null);
  }

  if (!options.write) {
    return result(options, diags, markdown, outputPath, false, null);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return result(options, diags, markdown, outputPath, true, null);
}

/**
 * Resolves the artifact path for `mode` from `render[].outputs`. Both the output root and
 * the artifact must stay inside the project root; neither may escape.
 */
async function resolveOutputPath(
  project: ResolvedProject,
  mode: BuildMode,
  diags: Diagnostics,
): Promise<string | null> {
  const render = project.manifest.render[0];
  if (render === undefined) {
    diags.error(
      "core.manifest.invalid",
      "contract-builder.json",
      "/render",
      "Манифест не объявляет ни одного render",
    );
    return null;
  }

  const relative = render.outputs[mode];
  if (relative === undefined) {
    diags.error(
      "core.manifest.invalid",
      "contract-builder.json",
      `/render/0/outputs/${mode}`,
      `Не объявлен выход для режима ${mode}`,
    );
    return null;
  }

  const outputRoot = await resolveContained(project.root, project.manifest.output?.root ?? ".");
  if (!outputRoot.inside) {
    diags.error(
      "core.path.outside-root",
      "contract-builder.json",
      "/output/root",
      "Корень вывода выходит за пределы проекта",
    );
    return null;
  }

  const target = await resolveContained(outputRoot.abs, relative);
  if (!target.inside) {
    diags.error(
      "core.path.outside-root",
      "contract-builder.json",
      `/render/0/outputs/${mode}`,
      `Путь вывода "${relative}" выходит за пределы корня вывода`,
    );
    return null;
  }

  return target.abs;
}

function result(
  options: BuildOptions,
  diags: Diagnostics,
  markdown: string | null,
  outputPath: string,
  written: boolean,
  blockedBy: BuildResult["blockedBy"],
): BuildResult {
  return {
    exitCode: blockedBy === null ? 0 : 1,
    mode: options.mode,
    diagnostics: diags.sorted(),
    markdown,
    outputPath,
    written,
    blockedBy,
  };
}
