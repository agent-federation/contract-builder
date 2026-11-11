import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Diagnostics, type Diagnostic } from "./diagnostics.js";
import { loadProject, type LoadedSpec } from "./load.js";
import { loadSchemas, validateDocuments } from "./schema.js";
import { buildProjectModel } from "./ir.js";
import { DEFAULT_ADAPTERS } from "./adapters/index.js";
import {
  resolveFindings,
  type DiagnosticCatalog,
  type ProfileValidator,
  type ProfileViewModule,
  type ValidatorContext,
  type ValidatorFinding,
  type VerificationContext,
} from "./hook.js";
import { applyVerificationClaims, sourceDigest, sourceVersionOf } from "./provenance.js";
import { messageOf } from "./guards.js";
import { localizedDetail } from "./messages.js";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from "./locale.js";
import { loadRenderInputs, normalizeArtifact, type BuildMode, type Renderer } from "./render.js";
import { resolveContained, type ResolvedProject } from "./manifest.js";
import {
  computeBuildIdentity,
  createEngineImportMapping,
  installEngineImportPlugin,
  loadEngineRoot,
  validateProfileClosure,
  verifyEngineVersion,
  withEngineImportMapping,
  type BuildIdentity,
  type EngineImportMapping,
  type EngineRoot,
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
   * Absolute engine root: the directory that contains the engine's `spec/` and
   * `package.json`. Engine-owned profile imports are resolved and loaded from this root, and
   * `engineVersion` is read from its `package.json`. Defaults to the running engine's root.
   */
  engineRoot?: string;
  /**
   * Explicit consent to load and evaluate the executable profile modules declared by
   * `profile.json` (`view` and `validator`). Defaults to `false`: a build whose profile
   * declares executable modules fails closed with `core.profile.consent-required` before
   * any profile code is imported. Consent is permission to run trusted in-process code,
   * not isolation.
   */
  allowExecutableProfile?: boolean;
  /**
   * Locale for human-readable CLI/build output (diagnostics and framing). Defaults to
   * English when omitted; any other value outside `SUPPORTED_LOCALES` (`en`, `ru`) throws a
   * `TypeError` naming the supported locales. It never affects artifact bytes: a project
   * declares its artifact locale in the manifest, and the renderer receives diagnostics
   * resolved in that locale.
   */
  locale?: Locale;
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
  // A JavaScript caller can bypass the type. Fail closed instead of silently rendering the
  // default locale, so an unsupported choice is visible rather than producing mixed output.
  if (options.locale !== undefined && !isLocale(options.locale)) {
    throw new TypeError(
      `Unsupported locale "${String(options.locale)}"; supported locales: ${SUPPORTED_LOCALES.join(", ")}`,
    );
  }

  const specDir = path.resolve(options.specDir);
  const diags = options.diagnostics ?? new Diagnostics();

  // The engine root is resolved before the project so a missing or mismatched root fails
  // closed, and so the modules the profile imports can be loaded from it.
  const engine = await loadEngineRoot(options.engineRoot, diags);
  if (engine === null) {
    return result(options, diags, null, "", false, "errors");
  }
  if (!(await verifyEngineVersion(engine, diags))) {
    return result(options, diags, null, "", false, "errors");
  }
  if (!installEngineImportPlugin()) {
    diags.error("core.engine.root-unavailable#import-remap-unavailable", "package.json", "");
    return result(options, diags, null, "", false, "errors");
  }

  const loaded = await loadProject(specDir, diags);
  if (loaded === null) {
    return result(options, diags, null, "", false, "errors");
  }

  const mapping = createEngineImportMapping(loaded.project, engine.root);
  return withEngineImportMapping(loaded.project.profileDir, mapping, () =>
    buildResolvedProject(options, specDir, loaded, engine, mapping, diags),
  );
}

async function buildResolvedProject(
  options: BuildOptions,
  specDir: string,
  loaded: LoadedSpec,
  engine: EngineRoot,
  mapping: EngineImportMapping,
  diags: Diagnostics,
): Promise<BuildResult> {
  // Consent is checked before the closure scan and before any profile module is imported:
  // reading a profile's declared files is not execution, but failing first keeps the
  // boundary explicit and makes the diagnostic about consent rather than a downstream error.
  if (!hasExecutableProfileConsent(loaded.project, options, diags)) {
    return result(options, diags, null, "", false, "errors");
  }

  // Validate the profile closure before importing profile modules: an undeclared import is
  // an identity problem, not a profile load error. The scan also resolves every engine-owned
  // import under the explicit root, so the runtime mapping below can only load those modules.
  if (!(await validateProfileClosure(loaded.project, diags, undefined, mapping))) {
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
    diags.error("ERR_UNKNOWN_REF#source-undeclared", "contract-builder.json", "/sources");
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
      diags.error("core.profile.invalid#document-unbound", "profile.json", "/documents", {
        key,
      });
      return result(options, diags, null, outputPath, false, "errors");
    }
  }
  if (typeof viewModule.buildView !== "function") {
    diags.error("core.profile.invalid#view-export-missing", "profile.json", "/view");
    return result(options, diags, null, outputPath, false, "errors");
  }

  const validator = await loadProfileModule<ProfileValidator>(loaded.project, "validator", diags);
  if (validator === null) {
    return result(options, diags, null, outputPath, false, "errors");
  }
  if (typeof validator.validate !== "function") {
    diags.error("core.profile.invalid#validator-export-missing", "profile.json", "/validator");
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
    try {
      return await adapter.verifyQuote(source, ref, quote);
    } catch (error) {
      // The adapter is invoked by profile code; a throw must become a diagnostic, never escape
      // the build as a stack trace. `unknown-locator` keeps the context callable while the
      // recorded error stops the build at the diagnostics gate.
      profileHookFailed(diags, "quote adapter", "contract-builder.json", "/sources", error);
      return "unknown-locator" as const;
    }
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

    try {
      const claims = await validator.verifyProvenance(model, verificationContext);
      if (!applyVerificationClaims(model, model.sources, claims, diags)) {
        return result(options, diags, null, outputPath, false, "errors");
      }
    } catch (error) {
      profileHookFailed(diags, "provenance verifier", "profile.json", "/validator", error);
      return result(options, diags, null, outputPath, false, "errors");
    }
  }

  // Build the view after verification so it carries the records the renderer must show.
  let view: unknown;
  try {
    view = viewModule.buildView(model);
  } catch (error) {
    profileHookFailed(diags, "view", "profile.json", "/view", error);
    return result(options, diags, null, outputPath, false, "errors");
  }

  const context: ValidatorContext = {
    view,
    sources: model.sources,
    legacyText,
    legacyName,
    verifyQuote,
  };

  let findings: ValidatorFinding[];
  try {
    findings = await validator.validate(model, context);
  } catch (error) {
    profileHookFailed(diags, "validator", "profile.json", "/validator", error);
    return result(options, diags, null, outputPath, false, "errors");
  }

  let findingsOk: boolean;
  try {
    findingsOk = resolveFindings(findings, model, catalog, diags);
  } catch (error) {
    // A malformed return value is also profile misbehaviour; keep it a diagnostic, not a crash.
    profileHookFailed(diags, "validator", "profile.json", "/validator", error);
    return result(options, diags, null, outputPath, false, "errors");
  }
  if (!findingsOk) {
    return result(options, diags, null, outputPath, false, "errors");
  }

  // `validateManifest` guarantees exactly one render declaration; the guard keeps the
  // build safe for a manifest constructed outside the loader.
  const renderDeclaration = loaded.project.manifest.render[0];
  if (renderDeclaration === undefined) {
    diags.error("core.manifest.invalid#render-target-missing", "contract-builder.json", "/render");
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
    engineRoot: engine.root,
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
      diagnostics: diags.sorted(artifactLocale(loaded.project)),
      identity,
    });
    if (artifacts.length !== 1) {
      diags.error("core.render.invalid#artifact-count", "contract-builder.json", "/render/0", {
        count: artifacts.length,
      });
      return result(options, diags, null, outputPath, false, "errors", identity);
    }
    const artifact = artifacts[0]!;
    const declared = renderDeclaration.outputs[options.mode] ?? "";
    if (artifact.path !== declared) {
      diags.error(
        "core.render.invalid#artifact-path-mismatch",
        "contract-builder.json",
        "/render/0",
        { path: artifact.path, declared: declared },
      );
      return result(options, diags, null, outputPath, false, "errors", identity);
    }
    markdown = new TextDecoder().decode(normalizeArtifact(artifact.bytes));
  } catch (error) {
    diags.error("core.render.failed#render-failed", "contract-builder.json", "/render/0", {
      error: messageOf(error),
    });
    return result(options, diags, null, outputPath, false, "errors", identity);
  }

  const blocking = diags.sorted(options.locale ?? DEFAULT_LOCALE).filter((d) => {
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
      diags.error("ERR_OUTPUT_STALE#output-stale", path.relative(specDir, outputPath), "");
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
 * Resolves the artifact path for `mode` from the single render declaration's `outputs`.
 * Both the output root and the artifact must stay inside the project root; neither may
 * escape. `validateManifest` has already rejected zero or multiple render declarations.
 */
async function resolveOutputPath(
  project: ResolvedProject,
  mode: BuildMode,
  diags: Diagnostics,
): Promise<string | null> {
  const render = project.manifest.render[0];
  if (render === undefined) {
    diags.error("core.manifest.invalid#render-target-missing", "contract-builder.json", "/render");
    return null;
  }

  const relative = render.outputs[mode];
  if (relative === undefined) {
    diags.error(
      "core.manifest.invalid#output-mode-missing",
      "contract-builder.json",
      `/render/0/outputs/${mode}`,
      { mode: mode },
    );
    return null;
  }

  const outputRoot = await resolveContained(project.root, project.manifest.output?.root ?? ".");
  if (!outputRoot.inside) {
    diags.error(
      "core.path.outside-root#output-root-escape",
      "contract-builder.json",
      "/output/root",
    );
    return null;
  }

  const target = await resolveContained(outputRoot.abs, relative);
  if (!target.inside) {
    diags.error(
      "core.path.outside-root#output-path-escape",
      "contract-builder.json",
      `/render/0/outputs/${mode}`,
      { relative: relative },
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

  // `validateProfile` rejects a data-only profile during project loading (ODR-ENG-001 B3),
  // so a project that reaches this gate always declares at least one executable module: there
  // is no "nothing to execute" path that could silently skip consent.
  const executable = [project.profile.view, project.profile.validator].filter(
    (relative): relative is string => relative !== undefined,
  );

  diags.error("core.profile.consent-required#consent-required", "profile.json", "", {
    modules: executable.join(", "),
  });
  return false;
}

async function loadProfileModule<T>(
  project: ResolvedProject,
  key: "view" | "validator",
  diags: Diagnostics,
): Promise<T | null> {
  const relative = key === "view" ? project.profile.view : project.profile.validator;
  if (relative === undefined) {
    diags.error("core.profile.invalid#profile-module-missing", "profile.json", `/${key}`, {
      key,
    });
    return null;
  }

  const located = await resolveContained(project.profileDir, relative);
  if (!located.inside) {
    diags.error("core.path.outside-root#module-path-escape", "profile.json", `/${key}`, {
      relative,
    });
    return null;
  }

  try {
    return (await import(pathToFileURL(located.abs).href)) as T;
  } catch (error) {
    diags.error("core.profile.invalid#module-load-failed", relative, "", {
      error: messageOf(error),
    });
    return null;
  }
}

async function loadCatalog(
  project: ResolvedProject,
  diags: Diagnostics,
): Promise<DiagnosticCatalog | null> {
  const relative = project.profile.diagnostics;
  if (relative === undefined) {
    diags.error("core.profile.invalid#catalog-missing", "profile.json", "/diagnostics");
    return null;
  }

  const located = await resolveContained(project.profileDir, relative);
  if (!located.inside) {
    diags.error("core.path.outside-root#catalog-path-escape", "profile.json", "/diagnostics", {
      relative,
    });
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(await readFile(located.abs, "utf8"));
    if (!isCatalog(parsed)) {
      diags.error("core.profile.invalid#catalog-invalid", relative, "");
      return null;
    }
    return parsed;
  } catch (error) {
    diags.error("core.profile.invalid#catalog-unreadable", relative, "", {
      error: messageOf(error),
    });
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
      "core.manifest.invalid#renderer-required",
      "contract-builder.json",
      "/render/0/renderer",
    );
    return null;
  }

  const renderer = registry?.[id];
  if (renderer === undefined) {
    diags.error(
      "core.registry.missing#renderer-not-registered",
      "contract-builder.json",
      "/render/0/renderer",
      { id: id },
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
    const severityOk =
      candidate.severity === "error" ||
      candidate.severity === "warning" ||
      candidate.severity === "review";
    if (typeof candidate.code !== "string" || !severityOk) return false;
    if (candidate.message !== undefined && typeof candidate.message !== "string") return false;
    if (candidate.messages === undefined) return candidate.message !== undefined;
    if (typeof candidate.messages !== "object" || candidate.messages === null) return false;
    const messages = candidate.messages as Record<string, unknown>;
    return Object.entries(messages).every(
      ([locale, text]) => isLocale(locale) && typeof text === "string",
    );
  });
}

/** The locale a project declares for its rendered artifact; English when absent. */
function artifactLocale(project: ResolvedProject): Locale {
  return project.manifest.locale ?? DEFAULT_LOCALE;
}

/**
 * Converts a thrown profile value into a diagnostic. Diagnostics are collected, never thrown:
 * the build stops through the normal result path with exit code 1 and a localized message.
 */
function profileHookFailed(
  diags: Diagnostics,
  hook: string,
  file: string,
  pointer: string,
  error: unknown,
): void {
  diags.error("core.profile.hook-failed#hook-failed", file, pointer, {
    hook,
    error: localizedDetail(error),
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
    diagnostics: diags.sorted(options.locale ?? DEFAULT_LOCALE),
    markdown,
    outputPath,
    written,
    identity,
    blockedBy,
  };
}
