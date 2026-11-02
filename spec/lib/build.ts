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
  type VerificationContext,
} from "./hook.js";
import {
  applyVerificationClaims,
  sourceDigest,
  sourceVersionOf,
} from "./provenance.js";
import { messageOf } from "./guards.js";
import {
  loadRenderInputs,
  normalizeArtifact,
  type BuildMode,
  type Renderer,
} from "./render.js";
import { resolveContained, type ResolvedProject } from "./manifest.js";
import {
  computeBuildIdentity,
  validateProfileClosure,
  type BuildIdentity,
} from "./identity.js";
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
  /** Renderer registry supplied by the consumer; the core never loads the profile. */
  renderers?: Record<string, Renderer>;
  /**
   * Explicit consent to load and evaluate the executable profile modules declared by
   * `profile.json` (`view` and `validator`). Defaults to `false`: a build whose profile
   * declares executable modules fails closed with `core.profile.consent-required` before
   * any profile code is imported. Consent is permission to run trusted in-process code,
   * not isolation.
   */
  allowExecutableProfile?: boolean;
}

export interface BuildResult {
  exitCode: number;
  mode: BuildMode;
  diagnostics: Diagnostic[];
  markdown: string | null;
  outputPath: string;
  written: boolean;
  identity: BuildIdentity | null;
  blockedBy: "errors" | "review" | "warnings" | "stale-output" | null;
}

export async function runBuild(options: BuildOptions): Promise<BuildResult> {
  const specDir = path.resolve(options.specDir);
  const diags = options.diagnostics ?? new Diagnostics();

  const loaded = await loadProject(specDir, diags);
  if (loaded === null) {
    return result(options, diags, null, "", false, "errors");
  }

  // Consent is checked before the closure scan and before any profile module is imported:
  // reading a profile's declared files is not execution, but failing first keeps the
  // boundary explicit and makes the diagnostic about consent rather than a downstream error.
  if (!hasExecutableProfileConsent(loaded.project, options, diags)) {
    return result(options, diags, null, "", false, "errors");
  }

  // Validate the profile closure before importing profile modules: an undeclared import is
  // an identity problem, not a profile load error.
  if (!(await validateProfileClosure(loaded.project, diags))) {
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
  const verifyQuote = async (sourceId: string, ref: string, quote: string) => {
    const source = sourcesById.get(sourceId);
    if (source === undefined) return "unknown-locator" as const;
    const adapter = adapters[source.adapter];
    if (adapter === undefined) return "unknown-locator" as const;
    return adapter.verifyQuote(source, ref, quote);
  };

  if (typeof validator.verifyProvenance === "function") {
    const declaration = new Map(
      (model.manifest.sources ?? []).map((source) => [source.id, source]),
    );
    const verificationContext: VerificationContext = {
      sources: model.sources,
      legacyText,
      legacyName,
      verifyQuote,
      sourceDigest: (sourceId) => {
        const source = sourcesById.get(sourceId);
        return source === undefined ? null : sourceDigest(source.bytes);
      },
      sourceVersion: (sourceId) => sourceVersionOf(declaration.get(sourceId)),
    };

    const claims = await validator.verifyProvenance(model, verificationContext);
    if (!applyVerificationClaims(model, model.sources, claims, diags)) {
      return result(options, diags, null, outputPath, false, "errors");
    }
  }

  // Build the view after verification so it carries the records the renderer must show.
  const view = viewModule.buildView(model);

  const context: ValidatorContext = {
    view,
    sources: model.sources,
    legacyText,
    legacyName,
    verifyQuote,
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

  const renderer = resolveRenderer(renderDeclaration.renderer, options.renderers, diags);
  if (renderer === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  const identity = await computeBuildIdentity({
    project: loaded.project,
    loaded,
    sources: model.sources,
    adapters,
    renderer,
    diagnostics: diags,
  });
  if (identity === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  if (diags.errors > 0) {
    return result(options, diags, null, outputPath, false, "errors", identity);
  }

  let markdown: string;
  try {
    const artifacts = await renderer.render(model, {
      mode: options.mode,
      templates: renderInputs.templates,
      ...(renderInputs.labels !== undefined ? { labels: renderInputs.labels } : {}),
      diagnostics: diags.sorted(),
    });
    if (artifacts.length !== 1) {
      diags.error(
        "core.render.invalid",
        "contract-builder.json",
        "/render/0",
        `Рендерер должен вернуть ровно один артефакт в M1, получено ${artifacts.length}`,
      );
      return result(options, diags, null, outputPath, false, "errors", identity);
    }
    const artifact = artifacts[0]!;
    const declared = renderDeclaration.outputs[options.mode] ?? "";
    if (artifact.path !== declared) {
      diags.error(
        "core.render.invalid",
        "contract-builder.json",
        "/render/0",
        `Рендерер вернул путь "${artifact.path}", ожидается "${declared}"`,
      );
      return result(options, diags, null, outputPath, false, "errors", identity);
    }
    markdown = new TextDecoder().decode(normalizeArtifact(artifact.bytes));
  } catch (error) {
    diags.error(
      "core.render.failed",
      "contract-builder.json",
      "/render/0",
      `Рендерер завершился с ошибкой: ${messageOf(error)}`,
    );
    return result(options, diags, null, outputPath, false, "errors", identity);
  }

  const blocking = diags.sorted().filter((d) => {
    if (d.severity === "error" || d.severity === "review") return true;
    return options.strict && d.severity === "warning";
  });

  if (options.mode === "release" && blocking.length > 0) {
    return result(options, diags, markdown, outputPath, false, "review", identity);
  }

  if (options.strict && diags.warnings > 0) {
    return result(options, diags, markdown, outputPath, false, "warnings", identity);
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
      return result(options, diags, markdown, outputPath, false, "stale-output", identity);
    }
    return result(options, diags, markdown, outputPath, false, null, identity);
  }

  if (!options.write) {
    return result(options, diags, markdown, outputPath, false, null, identity);
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  return result(options, diags, markdown, outputPath, true, null, identity);
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

/**
 * Executable profile modules are trusted in-process code, so the engine refuses to import
 * them without an explicit caller choice. A manifest or profile cannot grant consent to
 * itself; only the caller of `runBuild` (or the CLI flag) can.
 */
function hasExecutableProfileConsent(
  project: ResolvedProject,
  options: BuildOptions,
  diags: Diagnostics,
): boolean {
  if (options.allowExecutableProfile === true) return true;

  const executable = [project.profile.view, project.profile.validator].filter(
    (relative): relative is string => relative !== undefined,
  );
  if (executable.length === 0) return true;

  diags.error(
    "core.profile.consent-required",
    "profile.json",
    "",
    `Профиль объявляет исполняемые модули (${executable.join(", ")}). Их загрузка требует явного согласия вызывающего: allowExecutableProfile: true в runBuild или --allow-executable-profile в CLI. Согласие разрешает выполнить доверенный код в процессе сборщика и не является изоляцией.`,
  );
  return false;
}

async function loadProfileModule<T>(
  project: ResolvedProject,
  key: "view" | "validator",
  diags: Diagnostics,
): Promise<T | null> {
  const relative = key === "view" ? project.profile.view : project.profile.validator;
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

function resolveRenderer(
  id: string | undefined,
  registry: Record<string, Renderer> | undefined,
  diags: Diagnostics,
): Renderer | null {
  if (id === undefined) {
    diags.error(
      "core.manifest.invalid",
      "contract-builder.json",
      "/render/0/renderer",
      "render.renderer обязателен",
    );
    return null;
  }

  const renderer = registry?.[id];
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
  identity: BuildIdentity | null = null,
): BuildResult {
  return {
    exitCode: blockedBy === null ? 0 : 1,
    mode: options.mode,
    diagnostics: diags.sorted(),
    markdown,
    outputPath,
    written,
    identity,
    blockedBy,
  };
}
