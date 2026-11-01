import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Diagnostics, type Diagnostic } from "./diagnostics.js";
import { loadProject } from "./load.js";
import { loadSchemas, validateDocuments } from "./schema.js";
import { buildProjectModel } from "./ir.js";
import { DEFAULT_ADAPTERS } from "./adapters/index.js";
import {
  resolveFindings,
  type DiagnosticCatalog,
  type ProfileValidator,
  type ProfileViewModule,
  type ValidatorContext,
} from "./hook.js";
import { messageOf } from "./guards.js";
import {
  loadRenderInputs,
  normalizeArtifact,
  type BuildMode,
  type Renderer,
} from "./render.js";
import { resolveContained, type ResolvedProject } from "./manifest.js";
import type { SourceAdapter } from "./source.js";
import { pathToFileURL } from "node:url";

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
  /** Optional renderer registry; the profile renderer is always registered. */
  renderers?: Record<string, Renderer>;
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

  if ((loaded.project.manifest.sources ?? []).length === 0) {
    diags.error(
      "ERR_UNKNOWN_REF",
      "contract-builder.json",
      "/sources",
      "Не объявлен источник документа",
    );
    return result(options, diags, null, outputPath, false, "errors");
  }

  const model = await buildProjectModel(loaded, schemas, diags, options.adapters);
  if (model === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const viewModule = await loadProfileModule<ProfileViewModule>(loaded.project, "view", diags);
  if (viewModule === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }
  for (const key of viewModule.requires ?? []) {
    if (model.documents[key] === undefined) {
      diags.error(
        "core.profile.invalid",
        "profile.json",
        "/documents",
        `Профиль не связывает обязательный документ "${key}"`,
      );
      return result(options, diags, null, outputPath, false, "errors");
    }
  }
  if (typeof viewModule.buildView !== "function") {
    diags.error(
      "core.profile.invalid",
      "profile.json",
      "/view",
      "Модуль представления профиля не экспортирует buildView",
    );
    return result(options, diags, null, outputPath, false, "errors");
  }
  const view = viewModule.buildView(model);

  const validator = await loadProfileModule<ProfileValidator>(
    loaded.project,
    "validator",
    diags,
  );
  if (validator === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }
  if (typeof validator.validate !== "function") {
    diags.error(
      "core.profile.invalid",
      "profile.json",
      "/validator",
      "Модуль валидатора профиля не экспортирует validate",
    );
    return result(options, diags, null, outputPath, false, "errors");
  }

  const catalog = await loadCatalog(loaded.project, diags);
  if (catalog === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const legacyName = path.basename(model.manifest.sources?.[0]?.path ?? "source");
  const legacyText = new TextDecoder().decode(model.sources[0]?.bytes ?? new Uint8Array());
  const sourcesById = new Map(model.sources.map((source) => [source.id, source]));
  const adapters = options.adapters ?? DEFAULT_ADAPTERS;

  const context: ValidatorContext = {
    view,
    sources: model.sources,
    legacyText,
    legacyName,
    async verifyQuote(sourceId, ref, quote) {
      const source = sourcesById.get(sourceId);
      if (source === undefined) return "unknown-locator";
      const adapter = adapters[source.adapter];
      if (adapter === undefined) return "unknown-locator";
      return adapter.verifyQuote(source, ref, quote);
    },
  };

  const findings = await validator.validate(model, context);
  if (!resolveFindings(findings, model, catalog, diags)) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const renderDeclaration = loaded.project.manifest.render[0];
  if (renderDeclaration === undefined) {
    diags.error(
      "core.manifest.invalid",
      "contract-builder.json",
      "/render",
      "Манифест не объявляет ни одного render",
    );
    return result(options, diags, null, outputPath, false, "errors");
  }

  const renderInputs = await loadRenderInputs(loaded.project, renderDeclaration, diags);
  if (renderInputs === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const renderer = await resolveRenderer(
    loaded.project,
    renderDeclaration.renderer,
    options.renderers,
    diags,
  );
  if (renderer === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  if (diags.errors > 0) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  let markdown: string;
  try {
    markdown = normalizeArtifact(
      await renderer.render(model, {
        mode: options.mode,
        templates: renderInputs.templates,
        ...(renderInputs.labels !== undefined ? { labels: renderInputs.labels } : {}),
        diagnostics: diags.sorted(),
      }),
    );
  } catch (error) {
    diags.error(
      "core.render.failed",
      "contract-builder.json",
      "/render/0",
      `Рендерер завершился с ошибкой: ${messageOf(error)}`,
    );
    return result(options, diags, null, outputPath, false, "errors");
  }

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

async function loadProfileModule<T>(
  project: ResolvedProject,
  key: "view" | "validator" | "renderer",
  diags: Diagnostics,
): Promise<T | null> {
  const relative =
    key === "view"
      ? project.profile.view
      : key === "validator"
        ? project.profile.validator
        : project.profile.renderer;
  if (relative === undefined) {
    diags.error("core.profile.invalid", "profile.json", `/${key}`, `Профиль не объявляет ${key}`);
    return null;
  }

  const located = await resolveContained(project.profileDir, relative);
  if (!located.inside) {
    diags.error(
      "core.path.outside-root",
      "profile.json",
      `/${key}`,
      `Модуль профиля "${relative}" выходит за пределы каталога профиля`,
    );
    return null;
  }

  try {
    return (await import(pathToFileURL(located.abs).href)) as T;
  } catch (error) {
    diags.error(
      "core.profile.invalid",
      relative,
      "",
      `Модуль профиля не загружен: ${messageOf(error)}`,
    );
    return null;
  }
}

async function loadCatalog(
  project: ResolvedProject,
  diags: Diagnostics,
): Promise<DiagnosticCatalog | null> {
  const relative = project.profile.diagnostics;
  if (relative === undefined) {
    diags.error("core.profile.invalid", "profile.json", "/diagnostics", "Профиль не объявляет каталог");
    return null;
  }

  const located = await resolveContained(project.profileDir, relative);
  if (!located.inside) {
    diags.error(
      "core.path.outside-root",
      "profile.json",
      "/diagnostics",
      `Каталог "${relative}" выходит за пределы каталога профиля`,
    );
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(await readFile(located.abs, "utf8"));
    if (!isCatalog(parsed)) {
      diags.error(
        "core.profile.invalid",
        relative,
        "",
        "Каталог профиля должен содержать массив codes с полями code, severity и message",
      );
      return null;
    }
    return parsed;
  } catch (error) {
    diags.error(
      "core.profile.invalid",
      relative,
      "",
      `Каталог профиля не прочитан: ${messageOf(error)}`,
    );
    return null;
  }
}

async function resolveRenderer(
  project: ResolvedProject,
  id: string | undefined,
  injected: Record<string, Renderer> | undefined,
  diags: Diagnostics,
): Promise<Renderer | null> {
  if (id === undefined) {
    diags.error(
      "core.manifest.invalid",
      "contract-builder.json",
      "/render/0/renderer",
      "render.renderer обязателен",
    );
    return null;
  }

  const registry: Record<string, Renderer> = {};

  if (project.profile.renderer !== undefined) {
    const module = await loadProfileModule<{ renderer?: Renderer }>(
      project,
      "renderer",
      diags,
    );
    if (module === null) return null;
    if (
      module.renderer === undefined ||
      typeof module.renderer.id !== "string" ||
      module.renderer.id.trim() === "" ||
      typeof module.renderer.render !== "function"
    ) {
      diags.error(
        "core.profile.invalid",
        "profile.json",
        "/renderer",
        "Модуль рендерера должен экспортировать renderer с текстовым id и функцией render",
      );
      return null;
    }
    registry[module.renderer.id] = module.renderer;
  }

  // Injected renderers win, so a consumer or test can override the profile renderer.
  if (injected !== undefined) {
    Object.assign(registry, injected);
  }

  const renderer = registry[id];
  if (renderer === undefined) {
    diags.error(
      "core.registry.missing",
      "contract-builder.json",
      "/render/0/renderer",
      `Рендерер "${id}" не зарегистрирован`,
    );
    return null;
  }

  return renderer;
}

function isCatalog(value: unknown): value is DiagnosticCatalog {
  if (typeof value !== "object" || value === null) return false;
  const codes = (value as { codes?: unknown }).codes;
  if (!Array.isArray(codes)) return false;

  return codes.every((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const candidate = entry as Record<string, unknown>;
    return (
      typeof candidate.code === "string" &&
      typeof candidate.message === "string" &&
      (candidate.severity === "error" ||
        candidate.severity === "warning" ||
        candidate.severity === "review")
    );
  });
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
