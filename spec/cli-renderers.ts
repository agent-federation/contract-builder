import { Diagnostics } from "./lib/diagnostics.js";
import {
  createEngineImportMapping,
  defaultEngineRoot,
  validateProfileClosure,
} from "./lib/identity.js";
import { loadManifest, type ResolvedProject } from "./lib/manifest.js";
import type { Renderer } from "./lib/render.js";

const CORE001_PROFILE_ID = "core001";
const CORE001_RENDERER_ID = "core001-markdown";

/** Loads the built-in renderer module. Injectable so tests can observe the import order. */
export type RendererImporter = () => Promise<Renderer>;

/** The closure preflight. Injectable so tests can simulate an unavailable lockfile. */
export type ProfileClosureValidator = (
  project: ResolvedProject,
  diagnostics: Diagnostics,
) => Promise<boolean>;

export interface ProfileRendererOptions {
  /** Renderer importer injection; defaults to the built-in CORE-001 renderer module. */
  importRenderer?: RendererImporter;
  /** Closure validator injection; defaults to `validateProfileClosure`. */
  validateClosure?: ProfileClosureValidator;
  /**
   * Engine root the preflight validates against. The CLI resolves it once and passes it here
   * so the preflight cannot disagree with `runBuild({ engineRoot })`.
   */
  engineRoot?: string;
}

const importCore001Renderer: RendererImporter = async () => {
  const { renderer } = await import("../profiles/core001/renderer.js");
  return renderer;
};

/**
 * The built-in CORE-001 renderer is an executable profile-owned module. The CLI, as the
 * consumer that wires it, imports it only when (a) the caller passed the same explicit
 * consent flag that `runBuild` requires, (b) the selected project declares the CORE-001
 * profile and this renderer, and (c) the selected profile's declared closure validates.
 * The closure is checked before the dynamic import, so an invalid or unverifiable profile
 * cannot cause its renderer/view modules to run first.
 */
export async function loadProfileRenderers(
  allow: boolean,
  specDir: string,
  options: ProfileRendererOptions = {},
): Promise<Record<string, Renderer>> {
  if (!allow) return {};
  const importRenderer = options.importRenderer ?? importCore001Renderer;
  const engineRoot = options.engineRoot ?? defaultEngineRoot();
  const validateClosure: ProfileClosureValidator =
    options.validateClosure ??
    ((project, diagnostics) =>
      validateProfileClosure(
        project,
        diagnostics,
        undefined,
        createEngineImportMapping(project, engineRoot),
      ));

  // Read and validate the manifest/profile declaration before importing profile code. This
  // is declarative data only; no executable module is loaded by `loadManifest`.
  const diagnostics = new Diagnostics();
  const project = await loadManifest(specDir, diagnostics);
  if (project === null) return {};
  if (project.profile.id !== CORE001_PROFILE_ID) return {};
  if (project.manifest.render[0]?.renderer !== CORE001_RENDERER_ID) return {};

  // Preflight the same profile closure `runBuild` validates, against the same engine root.
  // CORE-001 declares renderer.ts and view.ts in profile.files, so this covers the modules
  // imported below (their imports and dependency pins) before any executable profile code runs.
  if (!(await validateClosure(project, diagnostics))) return {};

  const renderer = await importRenderer();
  return { [renderer.id]: renderer };
}
