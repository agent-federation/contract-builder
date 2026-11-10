import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Diagnostic } from "./diagnostics.js";
import type { ExtensionClosureDeclaration } from "./extension.js";
import type { BuildIdentity } from "./identity.js";
import type { ProjectModel } from "./ir.js";
import type { Diagnostics } from "./diagnostics.js";
import { resolveContained, type ManifestRender, type ResolvedProject } from "./manifest.js";

export type BuildMode = "draft" | "release";

export interface TemplateSet {
  /** Template entry, relative to the template root. */
  entry: string;
  /** Every text file under the template root, keyed by its relative path. */
  files: Record<string, string>;
}

export interface RenderOptions {
  mode: BuildMode;
  templates: TemplateSet;
  labels?: Record<string, string>;
  /**
   * Required by the accepted contract (§11): the engine passes the deterministic diagnostics
   * snapshot produced up to the render phase, so a renderer that embeds the report keeps the
   * artifact a pure function of the model, the options and the template.
   */
  diagnostics: readonly Diagnostic[];
  /**
   * The deterministic build identity computed before rendering: project, engine and manifest
   * versions, the authoritative `inputDigest` and the extensions used. The engine always passes
   * it on a successful build, so a renderer may render the identity without fabricating values;
   * artifact bytes stay outside the digest.
   */
  identity: BuildIdentity;
}

export interface Artifact {
  /** Relative to the project's output root. */
  path: string;
  bytes: Uint8Array;
  sha256: string;
}

export interface Renderer {
  id: string;
  version: string;
  /** Declared closure for build identity; required for a build that computes identity. */
  closure?: ExtensionClosureDeclaration;
  render(model: ProjectModel, options: RenderOptions): Promise<Artifact[]>;
}

/** Builds an artifact from rendered text; the core re-normalizes and re-hashes. */
export function artifactFrom(path: string, text: string): Artifact {
  const bytes = new TextEncoder().encode(text);
  return { path, bytes, sha256: sha256(bytes) };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Generic artifact normalization: LF line endings and exactly one trailing newline.
 * Content shaping (blank lines, trailing spaces) belongs to the renderer.
 */
export function normalizeArtifact(bytes: Uint8Array): Uint8Array {
  const lf = new TextDecoder().decode(bytes).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return new TextEncoder().encode(`${lf.replace(/\n+$/, "")}\n`);
}

/**
 * Resolves the manifest's `render` declaration: preloads the template root into a
 * `TemplateSet` and reads the optional labels file. Renderers perform no I/O.
 */
export async function loadRenderInputs(
  project: ResolvedProject,
  declaration: ManifestRender,
  diags: Diagnostics,
): Promise<{ templates: TemplateSet; labels?: Record<string, string> } | null> {
  if (declaration.template === undefined) {
    diags.error(
      "core.manifest.invalid#render-template-required",
      "contract-builder.json",
      "/render/0/template",
    );
    return null;
  }

  const entry = await resolveProfilePath(
    project,
    declaration.template,
    "/render/0/template",
    diags,
  );
  if (entry === null) return null;

  const root = path.dirname(entry);
  const files: Record<string, string> = {};
  try {
    for (const file of await walk(root)) {
      files[path.relative(root, file).split(path.sep).join("/")] = await readFile(file, "utf8");
    }
  } catch (error) {
    diags.error("core.manifest.invalid#templates-unreadable", declaration.template, "", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  let labels: Record<string, string> | undefined;
  if (declaration.labels !== undefined) {
    const labelsPath = await resolveProfilePath(
      project,
      declaration.labels,
      "/render/0/labels",
      diags,
    );
    if (labelsPath === null) return null;
    try {
      const parsed: unknown = JSON.parse(await readFile(labelsPath, "utf8"));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        diags.error("core.manifest.invalid#labels-not-object", declaration.labels, "");
        return null;
      }
      labels = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== "string") {
          diags.error("core.manifest.invalid#label-not-string", declaration.labels, `/${key}`);
          return null;
        }
        labels[key] = value;
      }
    } catch (error) {
      diags.error("core.manifest.invalid#labels-unreadable", declaration.labels, "", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  return {
    templates: { entry: path.basename(entry), files },
    ...(labels !== undefined ? { labels } : {}),
  };
}

/** Resolves a `profile:`-prefixed path inside the profile directory. */
async function resolveProfilePath(
  project: ResolvedProject,
  declared: string,
  pointer: string,
  diags: Diagnostics,
): Promise<string | null> {
  const relative = declared.startsWith("profile:") ? declared.slice("profile:".length) : declared;

  const located = await resolveContained(project.profileDir, relative);
  if (!located.inside) {
    diags.error("core.path.outside-root#profile-path-escape", "contract-builder.json", pointer, {
      declared,
    });
    return null;
  }
  return located.abs;
}

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}
