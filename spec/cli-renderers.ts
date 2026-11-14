import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Diagnostics } from "./lib/diagnostics.js";
import {
  createEngineImportMapping,
  defaultEngineRoot,
  installEngineImportPlugin,
  validateProfileClosure,
  withEngineImportMapping,
} from "./lib/identity.js";
import { loadManifest, type ResolvedProject } from "./lib/manifest.js";
import { LocalizedError } from "./lib/messages.js";
import type { Renderer } from "./lib/render.js";

/**
 * Loads one renderer module from an absolute path. Injectable so tests can observe the
 * import order without executing the real module.
 */
export type RendererImporter = (modulePath: string) => Promise<Renderer>;

/** The closure preflight. Injectable so tests can simulate an unavailable lockfile. */
export type ProfileClosureValidator = (
  project: ResolvedProject,
  diagnostics: Diagnostics,
) => Promise<boolean>;

export interface ProfileRendererOptions {
  /**
   * Absolute path of the consumer-supplied renderer module. The engine ships no renderer of
   * its own and has no default: without this option no executable renderer is registered.
   */
  rendererModule?: string;
  /** Renderer importer injection; defaults to a dynamic import of `rendererModule`. */
  importRenderer?: RendererImporter;
  /** Closure validator injection; defaults to `validateProfileClosure`. */
  validateClosure?: ProfileClosureValidator;
  /**
   * Engine root the preflight validates against. The CLI resolves it once and passes it here
   * so the preflight cannot disagree with `runBuild({ engineRoot })`.
   */
  engineRoot?: string;
}

const importRendererModule: RendererImporter = async (modulePath) => {
  const loaded = (await import(pathToFileURL(modulePath).href)) as { renderer?: Renderer };
  if (loaded.renderer === undefined || loaded.renderer === null) {
    throw new LocalizedError("cli.renderer-not-exported", { path: modulePath });
  }
  return loaded.renderer;
};

/**
 * Resolves a consumer-supplied renderer module against the selected project. The module must
 * be a regular file inside the profile directory and be declared in `profile.files`, so the
 * profile closure digest and the import scan cover the code that is about to run. A module
 * outside that boundary is never imported.
 */
async function resolveRendererModule(
  project: ResolvedProject,
  modulePath: string,
): Promise<string | null> {
  if (!path.isAbsolute(modulePath)) return null;
  const module = await realpath(modulePath).catch(() => null);
  if (module === null) return null;
  const info = await stat(module).catch(() => null);
  if (info === null || !info.isFile()) return null;
  const profileDir = await realpath(project.profileDir).catch(() => null);
  if (profileDir === null) return null;

  const relative = path.relative(profileDir, module);
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  const posixRelative = relative.split(path.sep).join("/");
  if (project.profile.files?.includes(posixRelative) !== true) return null;
  return module;
}

/**
 * Wires the one renderer declared by the selected project. The CLI, as the consumer, imports
 * a module the consumer names explicitly. Pre-import gates, all required before the import:
 * (a) the caller passed the same explicit consent flag that `runBuild` requires, (b) the module
 * resolves inside the selected project's profile directory (realpath containment), (c) it is
 * declared in `profile.files`, and (d) the selected profile's declared closure validates. The
 * import evaluates the module inside the engine-import mapping, exactly like the profile
 * `view`/`validator` modules `runBuild` loads, so a consumer profile outside the engine checkout
 * can import engine modules. After the import, and before registration, the module's reported
 * id must equal the manifest's declared `render[].renderer`: a mismatch prevents registration,
 * not execution. The closure is checked before the dynamic import, so an invalid or
 * unverifiable profile cannot cause its renderer/view modules to run first.
 */
export async function loadProfileRenderers(
  allow: boolean,
  specDir: string,
  options: ProfileRendererOptions = {},
): Promise<Record<string, Renderer>> {
  if (!allow) return {};
  const importRenderer = options.importRenderer ?? importRendererModule;
  const engineRoot = options.engineRoot ?? defaultEngineRoot();

  // Read and validate the manifest/profile declaration before importing profile code. This
  // is declarative data only; no executable module is loaded by `loadManifest`.
  const diagnostics = new Diagnostics();
  const project = await loadManifest(specDir, diagnostics);
  if (project === null) return {};

  // One mapping serves the closure preflight and the import: the scan records every
  // engine-owned specifier it resolved, and the same map must be active while the renderer
  // is evaluated. The preflight always runs before the import below.
  const mapping = createEngineImportMapping(project, engineRoot);
  const validateClosure: ProfileClosureValidator =
    options.validateClosure ??
    ((project, diagnostics) => validateProfileClosure(project, diagnostics, undefined, mapping));

  const declaredRenderer = project.manifest.render[0]?.renderer;
  if (declaredRenderer === undefined) return {};

  if (options.rendererModule === undefined) return {};
  const modulePath = await resolveRendererModule(project, options.rendererModule);
  if (modulePath === null) return {};

  // Preflight the same profile closure `runBuild` validates, against the same engine root.
  if (!(await validateClosure(project, diagnostics))) return {};

  // The renderer runs in the same mapping scope as the profile modules `runBuild` imports, so
  // engine imports resolve from `engineRoot` even when the profile lives outside the engine
  // checkout (ODR-ENG-003 D4). A runtime without import remapping fails closed; `runBuild`
  // reports the missing capability with its own diagnostic.
  if (!installEngineImportPlugin()) return {};
  const renderer = await withEngineImportMapping(project.profileDir, mapping, () =>
    importRenderer(modulePath),
  );
  if (renderer.id !== declaredRenderer) return {};
  return { [renderer.id]: renderer };
}
