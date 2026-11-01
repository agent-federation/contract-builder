import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Diagnostics, type Diagnostic } from "./diagnostics.js";
import { loadSpecFiles, readLegacySource } from "./load.js";
import { validateSchemas } from "./schema.js";
import { analyze } from "./semantic.js";
import { renderMarkdown, type BuildMode } from "./render.js";
import type { RawSpec } from "./model.js";

export interface BuildOptions {
  specDir: string;
  mode: BuildMode;
  write: boolean;
  check: boolean;
  strict: boolean;
  /** Optional collector injection for tests; defaults to a fresh instance. */
  diagnostics?: Diagnostics;
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
  const outputPath = path.join(
    specDir,
    "output",
    options.mode === "release" ? "CORE-001.md" : "CORE-001.draft.md",
  );

  const files = await loadSpecFiles(specDir, diags);
  if (files === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const schemaOk = await validateSchemas(files, diags);
  if (!schemaOk) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const raw = files as unknown as RawSpec;
  const declaredSource = raw.sources.sources[0];
  if (declaredSource === undefined) {
    diags.error("ERR_UNKNOWN_REF", "sources.yml", "/sources", "Не объявлен источник документа");
    return result(options, diags, null, outputPath, false, "errors");
  }

  const legacy = await readLegacySource(specDir, declaredSource.path, diags);
  if (legacy === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const legacyName = path.basename(declaredSource.path);
  const spec = analyze(raw, legacy, legacyName, diags);

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
