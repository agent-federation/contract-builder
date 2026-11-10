/**
 * Lexical engine-import classification and the runtime resolver that loads engine-owned
 * profile imports from the explicit engine root (ODR-ENG-001 B2).
 */

import { realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { messageOf } from "../guards.js";
import type { DiagnosticMessageKey, MessageParams } from "../messages.js";
import type { ResolvedProject } from "../manifest.js";

/** One engine-owned import: the lexical subpath and the module resolved under the engine root. */
export interface EngineImportMapping {
  engineRoot: string;
  /** Deepest ancestor of the project root and the profile directory. */
  layoutRoot: string;
  /** `"<importer>\u0000<specifier>"` → resolved absolute module path under `<engineRoot>/spec/lib`. */
  mappings: Map<string, string>;
}

/** Lexical classification result for one relative specifier. */
export type EngineSpecifierClassification =
  | { kind: "engine"; subpath: string }
  | { kind: "extension" }
  | { kind: "error"; key: DiagnosticMessageKey; params?: MessageParams };

/** POSIX form of a filesystem path, used by the lexical mapping rule. */
function posixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

/** Deepest common ancestor of two absolute directories. */
function commonAncestor(first: string, second: string): string {
  const a = path.resolve(first).split(path.sep);
  const b = path.resolve(second).split(path.sep);
  const shared: string[] = [];
  for (let index = 0; index < a.length && index < b.length; index += 1) {
    if (a[index] !== b[index]) break;
    shared.push(a[index]!);
  }
  const joined = shared.join(path.sep);
  return joined.length === 0 ? path.parse(path.resolve(first)).root : joined;
}

/** Layout root used to decide whether an engine candidate escapes the project. */
function projectLayoutRoot(project: ResolvedProject): string {
  return commonAncestor(project.root, project.profileDir);
}

/** Creates the engine-import mapping a profile closure is scanned and loaded with. */
export function createEngineImportMapping(
  project: ResolvedProject,
  engineRoot: string,
): EngineImportMapping {
  return {
    engineRoot,
    layoutRoot: projectLayoutRoot(project),
    mappings: new Map(),
  };
}

/**
 * Exact lexical `spec/lib` mapping rule (ODR-ENG-001 B2): only relative specifiers are engine
 * candidates; collapse `.`/`..` against the importing file's directory without touching the
 * filesystem, reject a result that escapes the project layout root, require exactly one
 * contiguous `spec/lib` segment sequence, and validate the subpath that follows it.
 */
export function classifyEngineSpecifier(
  specifier: string,
  importer: string,
  layoutRoot: string,
): EngineSpecifierClassification {
  const importerFile = posixPath(path.resolve(importer));
  const root = posixPath(path.resolve(layoutRoot));
  const collapsed = path.posix.normalize(
    path.posix.join(path.posix.dirname(importerFile), posixPath(specifier)),
  );
  const relative = path.posix.relative(root, collapsed);
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.posix.isAbsolute(relative)
  ) {
    return {
      kind: "error",
      key: "core.path.outside-root#import-outside-project",
      params: { specifier },
    };
  }

  const segments = relative.split("/");
  const occurrences: number[] = [];
  for (let index = 0; index + 1 < segments.length; index += 1) {
    if (segments[index] === "spec" && segments[index + 1] === "lib") {
      occurrences.push(index);
    }
  }
  if (occurrences.length === 0) return { kind: "extension" };
  if (occurrences.length > 1) {
    return {
      kind: "error",
      key: "core.extension.unpinned-dependency#import-ambiguous",
      params: { specifier, occurrences: occurrences.length },
    };
  }

  const subpath = segments.slice(occurrences[0]! + 2);
  if (
    subpath.length === 0 ||
    subpath.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
    subpath.join("/").startsWith("/")
  ) {
    return {
      kind: "error",
      key: "core.extension.unpinned-dependency#import-subpath-invalid",
      params: { specifier },
    };
  }
  return { kind: "engine", subpath: subpath.join("/") };
}

/** Candidate files for an engine subpath; `.js` specifiers map to TypeScript sources. */
function engineModuleCandidates(target: string): string[] {
  const stripped = target.replace(/\.(?:js|mjs|cjs|jsx)$/, "");
  if (stripped !== target) {
    return [`${stripped}.ts`, `${stripped}.tsx`, `${stripped}.mts`, `${stripped}.cts`, target];
  }
  return [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.mts`,
    `${target}.cts`,
    path.join(target, "index.ts"),
  ];
}

/**
 * Resolves an engine subpath to a module under `<engineRoot>/spec/lib` whose realpath stays
 * inside that directory. A symlink escaping the directory is rejected; a missing module is
 * an unpinned engine dependency. The returned path is the real module the build must load.
 */
export async function resolveEngineModule(
  engineRoot: string,
  subpath: string,
): Promise<{ target: string } | { key: DiagnosticMessageKey; params?: MessageParams }> {
  let libRoot: string;
  try {
    libRoot = await realpath(path.join(engineRoot, "spec", "lib"));
  } catch (error) {
    return {
      key: "core.path.outside-root#engine-lib-unavailable",
      params: { error: messageOf(error) },
    };
  }

  const target = path.join(libRoot, ...subpath.split("/"));
  for (const candidate of engineModuleCandidates(target)) {
    let real: string;
    try {
      real = await realpath(candidate);
    } catch {
      continue;
    }
    if (!isInside(libRoot, real)) {
      return {
        key: "core.path.outside-root#engine-module-escape",
        params: { subpath, libRoot },
      };
    }
    return { target: real };
  }
  return {
    key: "core.extension.unpinned-dependency#engine-module-missing",
    params: { subpath, libRoot },
  };
}

interface EngineImportRegistration {
  root: string;
  mappings: Map<string, string>;
}

/** Registered profile roots the runtime resolver may remap, keyed by normalized profile dir. */
const engineImportRegistry = new Map<string, EngineImportRegistration>();
let engineImportPluginState: "unknown" | "installed" | "unavailable" = "unknown";

export function normalizeImportKey(value: string): string {
  const file = value.startsWith("file:") ? fileURLToPath(value) : value;
  return posixPath(path.resolve(file));
}

/**
 * Installs the process-wide Bun resolver that loads engine-owned profile imports from the
 * supplied root by absolute `file://` URL. Static classification alone is not enough: the
 * module that executes must come from `engineRoot`. Returns false when the runtime cannot
 * remap imports, so the build can fail closed instead of silently loading the wrong module.
 */
export function installEngineImportPlugin(): boolean {
  if (engineImportPluginState === "installed") return true;
  if (engineImportPluginState === "unavailable") return false;

  const runtime = (
    globalThis as {
      Bun?: { plugin?: (plugin: unknown) => unknown };
    }
  ).Bun;
  if (runtime?.plugin === undefined) {
    engineImportPluginState = "unavailable";
    return false;
  }

  runtime.plugin({
    name: "contract-builder-engine-root",
    setup(build: {
      onResolve: (
        options: { filter: RegExp },
        handler: (args: { path: string; importer?: string }) => { path: string } | undefined,
      ) => void;
    }) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (typeof args.importer !== "string" || args.importer.length === 0) return undefined;
        const importer = normalizeImportKey(args.importer);
        for (const entry of engineImportRegistry.values()) {
          if (importer !== entry.root && !importer.startsWith(`${entry.root}/`)) continue;
          const target = entry.mappings.get(`${importer}\u0000${args.path}`);
          // The absolute path is the module identity the runtime turns into the absolute
          // `file://` URL it loads. Bun 1.4.2 does not accept a URL string in this field.
          if (target !== undefined) return { path: target };
        }
        return undefined;
      });
    },
  });
  engineImportPluginState = "installed";
  return true;
}

/** Runs `body` with the profile's engine imports mapped to the supplied root. */
export async function withEngineImportMapping<T>(
  profileDir: string,
  mapping: EngineImportMapping,
  body: () => Promise<T>,
): Promise<T> {
  const root = normalizeImportKey(profileDir);
  engineImportRegistry.set(root, { root, mappings: mapping.mappings });
  try {
    return await body();
  } finally {
    engineImportRegistry.delete(root);
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}
