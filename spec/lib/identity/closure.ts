/**
 * Profile, adapter and renderer closure computation.
 *
 * See `docs/architecture/build-identity.md` "Static import scan" and the closure contract.
 */

import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";
import { compare, type Diagnostics } from "../diagnostics.js";
import type { ExtensionClosureDeclaration } from "../extension.js";
import { isNonEmptyString, messageOf } from "../guards.js";
import { localizedDetail } from "../messages.js";
import { resolveContained, type ResolvedProject } from "../manifest.js";
import { computeClosureDigest } from "./digest.js";
import {
  type EngineImportMapping,
  classifyEngineSpecifier,
  createEngineImportMapping,
  normalizeImportKey,
  resolveEngineModule,
} from "./engine-imports.js";
import { defaultEngineRoot, readLockfile } from "./engine-root.js";
import { importSpecifiers } from "./import-specifiers.js";
import type {
  DependencyRecord,
  ExtensionKind,
  Lockfile,
  LockfilePackage,
  ResolvedExtensionClosure,
} from "./types.js";

/**
 * Resolves a declared direct dependency set against the lockfile and returns the complete
 * pinned closure. A package missing from the lockfile, a declared version that differs from
 * the locked version, a missing integrity or an ambiguous transitive resolution is reported
 * as `core.extension.unpinned-dependency`.
 */
export function resolveDependencyClosure(
  direct: Readonly<Record<string, string>>,
  lockfile: Lockfile,
  diagnostics: Diagnostics,
  diagnosticFile: string,
): DependencyRecord[] | null {
  const byName = new Map<string, LockfilePackage[]>();
  for (const pkg of lockfile.packages) {
    const list = byName.get(pkg.name) ?? [];
    list.push(pkg);
    byName.set(pkg.name, list);
  }

  let ok = true;
  const resolved = new Map<string, DependencyRecord>();
  const visit = (pkg: LockfilePackage): void => {
    const key = `${pkg.name}\u0000${pkg.version}`;
    if (resolved.has(key)) return;
    if (pkg.integrity.length === 0) {
      diagnostics.error(
        "core.extension.unpinned-dependency#dependency-unpinned",
        diagnosticFile,
        "/dependencies",
        { name: pkg.name, version: pkg.version },
      );
      ok = false;
      return;
    }
    resolved.set(key, { name: pkg.name, version: pkg.version, integrity: pkg.integrity });
    for (const [name, range] of Object.entries(pkg.dependencies)) {
      const candidates = byName.get(name) ?? [];
      const next =
        candidates.length === 1
          ? candidates[0]
          : candidates.find((candidate) => candidate.version === range);
      if (next === undefined) {
        diagnostics.error(
          candidates.length === 0
            ? "core.extension.unpinned-dependency#transitive-missing"
            : "core.extension.unpinned-dependency#transitive-ambiguous",
          diagnosticFile,
          "/dependencies",
          { name },
        );
        ok = false;
        continue;
      }
      visit(next);
    }
  };

  for (const [name, version] of Object.entries(direct)) {
    const candidates = byName.get(name) ?? [];
    const exact = candidates.find((candidate) => candidate.version === version);
    if (candidates.length === 0) {
      diagnostics.error(
        "core.extension.unpinned-dependency#dependency-not-found",
        diagnosticFile,
        "/dependencies",
        { name: name },
      );
      ok = false;
      continue;
    }
    if (exact === undefined) {
      const found = candidates
        .map((candidate) => candidate.version)
        .sort(compare)
        .join(", ");
      diagnostics.error(
        "core.extension.unpinned-dependency#dependency-version-mismatch",
        diagnosticFile,
        "/dependencies",
        { name, version: version, found: found },
      );
      ok = false;
      continue;
    }
    visit(exact);
  }

  if (!ok) return null;
  return [...resolved.values()].sort(
    (a, b) => compare(a.name, b.name) || compare(a.version, b.version),
  );
}

/**
 * Resolves one adapter or renderer closure. The extension must declare its files and direct
 * dependencies; the core cannot discover them from the object it receives.
 */
export async function resolveExtensionClosure(
  kind: Exclude<ExtensionKind, "profile">,
  id: string,
  version: string,
  declaration: ExtensionClosureDeclaration | undefined,
  lockfile: Lockfile,
  diagnostics: Diagnostics,
  engineRoot: string = defaultEngineRoot(),
): Promise<ResolvedExtensionClosure | null> {
  return resolveClosure({
    kind,
    id,
    version,
    declaration,
    lockfile,
    diagnostics,
    diagnosticFile: `${kind}:${id}`,
    engine: {
      engineRoot,
      // An adapter or renderer has no manifest-bound project root; the lexical `spec/lib`
      // sequence is still enough to recognize engine code, and there is no project boundary
      // to escape from.
      layoutRoot: path.parse(path.resolve(declaration?.root ?? ".")).root,
      mappings: new Map(),
    },
  });
}

/** Profiles may declare render inputs with a `profile:` prefix; the closure uses bare paths. */
function stripProfilePrefix(value: string): string {
  return value.startsWith("profile:") ? value.slice("profile:".length) : value;
}

/**
 * Files the engine executes or consumes beyond the profile's declared closure entries: the
 * view and validator modules, the diagnostic catalog, every schema, and the render template
 * and labels declared by the manifest. They must be part of `profile.files`, otherwise the
 * closure digest and the import scan would not cover them.
 */
function requiredProfileFiles(project: ResolvedProject): Array<{ path: string; origin: string }> {
  const { profile, manifest } = project;
  const required: Array<{ path: string; origin: string }> = [];
  const add = (value: string | undefined, origin: string, prefixed = false): void => {
    if (isNonEmptyString(value)) {
      required.push({ path: prefixed ? stripProfilePrefix(value) : value, origin });
    }
  };

  add(profile.view, "view");
  add(profile.validator, "validator");
  add(profile.diagnostics, "diagnostics");
  for (const [id, schema] of Object.entries(profile.schemas)) {
    add(schema, `schemas[${JSON.stringify(id)}]`);
  }
  const render = manifest.render[0];
  add(render?.template, "render.template", true);
  add(render?.labels, "render.labels", true);
  return required;
}

/** Resolves the profile extension closure declared by `profile.json`. */
export async function resolveProfileClosure(
  project: ResolvedProject,
  lockfile: Lockfile,
  diagnostics: Diagnostics,
  engine: EngineImportMapping = createEngineImportMapping(project, defaultEngineRoot()),
): Promise<ResolvedExtensionClosure | null> {
  const declared = project.profile.files;
  if (declared === undefined || declared.length === 0) {
    diagnostics.error(
      "core.extension.unpinned-dependency#profile-files-missing",
      "profile.json",
      "/files",
    );
    return null;
  }

  const declaredPaths = new Set<string>();
  for (const value of declared) {
    const normalized = normalizeRelativePath(value);
    if (normalized !== null) declaredPaths.add(normalized);
  }

  const reported = new Set<string>();
  let covered = true;
  for (const required of requiredProfileFiles(project)) {
    const normalized = normalizeRelativePath(required.path);
    const entry = normalized ?? required.path.replace(/\\/g, "/");
    if (reported.has(entry)) continue;
    reported.add(entry);
    if (normalized !== null && declaredPaths.has(normalized)) continue;

    diagnostics.error(
      "core.extension.unpinned-dependency#profile-file-uncovered",
      "profile.json",
      "/files",
      { entry, origin: required.origin },
    );
    covered = false;
  }
  if (!covered) return null;

  return resolveClosure({
    kind: "profile",
    id: project.profile.id,
    version: project.profile.version,
    declaration: {
      root: project.profileDir,
      files: declared,
      ...(project.profile.dependencies !== undefined
        ? { dependencies: project.profile.dependencies }
        : {}),
    },
    lockfile,
    diagnostics,
    diagnosticFile: "profile.json",
    engine,
  });
}

/**
 * Validates the profile closure before the core imports profile modules, so an undeclared
 * import is reported as `core.extension.unpinned-dependency` instead of failing later as a
 * profile load error. A lockfile that cannot be read is a hard preflight failure: the closure
 * cannot be verified, so the build stops before profile modules are imported.
 * `computeBuildIdentity` keeps its own ERR_IO for direct identity computation.
 */
export async function validateProfileClosure(
  project: ResolvedProject,
  diagnostics: Diagnostics,
  lockfileReader?: () => Promise<Lockfile>,
  engine?: EngineImportMapping,
): Promise<boolean> {
  const mapping = engine ?? createEngineImportMapping(project, defaultEngineRoot());
  const reader = lockfileReader ?? (() => readLockfile(mapping.engineRoot));
  let lockfile: Lockfile;
  try {
    lockfile = await reader();
  } catch (error) {
    diagnostics.error("ERR_IO#lockfile-read-failed", "bun.lock", "", {
      error: localizedDetail(error),
    });
    return false;
  }
  return (await resolveProfileClosure(project, lockfile, diagnostics, mapping)) !== null;
}

interface ClosureRequest {
  kind: ExtensionKind;
  id: string;
  version: string;
  declaration: ExtensionClosureDeclaration | undefined;
  lockfile: Lockfile;
  diagnostics: Diagnostics;
  diagnosticFile: string;
  engine: EngineImportMapping;
}

async function resolveClosure(request: ClosureRequest): Promise<ResolvedExtensionClosure | null> {
  const { kind, id, version, declaration, lockfile, diagnostics, diagnosticFile, engine } = request;
  if (declaration === undefined) {
    diagnostics.error(
      "core.extension.unpinned-dependency#extension-closure-missing",
      diagnosticFile,
      "/closure",
      { kind, id: id },
    );
    return null;
  }

  const declared = declaration.files;
  if (declared.length > 0 && !isNonEmptyString(declaration.root)) {
    diagnostics.error(
      "core.extension.unpinned-dependency#extension-root-missing",
      diagnosticFile,
      "/closure/root",
      { kind, id: id },
    );
    return null;
  }

  const files = await readDeclaredFiles(
    declaration.root ?? ".",
    declared,
    diagnosticFile,
    diagnostics,
  );
  if (files === null) return null;

  const dependencies = resolveDependencyClosure(
    declaration.dependencies ?? {},
    lockfile,
    diagnostics,
    diagnosticFile,
  );
  if (dependencies === null) return null;

  if (
    !(await scanImports(
      files,
      declaration.dependencies ?? {},
      declaration.root ?? ".",
      diagnostics,
      engine,
    ))
  ) {
    return null;
  }

  return {
    kind,
    id,
    version,
    closureDigest: computeClosureDigest(files, dependencies),
    files,
    dependencies,
  };
}

async function readDeclaredFiles(
  root: string,
  declared: readonly string[],
  diagnosticFile: string,
  diagnostics: Diagnostics,
): Promise<Array<{ path: string; bytes: Uint8Array }> | null> {
  const seen = new Set<string>();
  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  let ok = true;

  for (const value of declared) {
    const relative = normalizeRelativePath(value);
    if (relative === null) {
      diagnostics.error(
        "core.extension.unpinned-dependency#declared-path-escape",
        diagnosticFile,
        "/files",
        { value: value },
      );
      ok = false;
      continue;
    }
    if (seen.has(relative)) continue;
    seen.add(relative);

    const located = await resolveContained(root, relative);
    if (!located.inside) {
      diagnostics.error(
        "core.extension.unpinned-dependency#declared-file-escape",
        diagnosticFile,
        "/files",
        { relative: relative },
      );
      ok = false;
      continue;
    }

    try {
      files.push({ path: relative, bytes: new Uint8Array(await readFile(located.abs)) });
    } catch (error) {
      diagnostics.error(
        "core.extension.unpinned-dependency#declared-file-unreadable",
        diagnosticFile,
        "/files",
        { relative, error: messageOf(error) },
      );
      ok = false;
    }
  }

  if (!ok) return null;
  return files.sort((a, b) => compare(a.path, b.path));
}

async function scanImports(
  files: ReadonlyArray<{ path: string; bytes: Uint8Array }>,
  dependencies: Readonly<Record<string, string>>,
  root: string,
  diagnostics: Diagnostics,
  engine: EngineImportMapping,
): Promise<boolean> {
  const declared = new Set(files.map((file) => file.path));
  let ok = true;

  for (const file of files) {
    if (!/\.(ts|tsx|mts|cts)$/.test(file.path)) continue;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    } catch {
      continue;
    }

    const importer = path.join(root, file.path);
    for (const specifier of importSpecifiers(text)) {
      if (specifier.startsWith("/")) {
        diagnostics.error("core.extension.unpinned-dependency#absolute-import", file.path, "", {
          specifier,
        });
        ok = false;
        continue;
      }

      const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(specifier);
      if (scheme !== null) {
        if (scheme[1] === "node") continue; // standard-library import, not a closure file
        diagnostics.error("core.extension.unpinned-dependency#import-scheme", file.path, "", {
          specifier,
          scheme: scheme[1],
        });
        ok = false;
        continue;
      }

      if (specifier.startsWith(".")) {
        const classification = classifyEngineSpecifier(specifier, importer, engine.layoutRoot);
        if (classification.kind === "error") {
          diagnostics.error(classification.key, file.path, "", classification.params);
          ok = false;
          continue;
        }

        if (classification.kind === "engine") {
          const resolved = await resolveEngineModule(engine.engineRoot, classification.subpath);
          if ("key" in resolved) {
            diagnostics.error(resolved.key, file.path, "", resolved.params);
            ok = false;
            continue;
          }
          engine.mappings.set(`${normalizeImportKey(importer)}\u0000${specifier}`, resolved.target);
          continue;
        }

        const resolved = resolveImport(root, file.path, specifier);
        if (resolved.escapes) {
          diagnostics.error(
            "core.extension.unpinned-dependency#import-outside-files",
            file.path,
            "",
            { specifier: specifier },
          );
          ok = false;
          continue;
        }
        if (!resolved.relative.some((candidate) => declared.has(candidate))) {
          diagnostics.error(
            "core.extension.unpinned-dependency#relative-import-undeclared",
            file.path,
            "",
            { specifier: specifier },
          );
          ok = false;
        }
        continue;
      }

      if (isBuiltin(specifier)) continue;

      const packageName = packageNameOf(specifier);
      if (packageName === null) continue;
      if (!(packageName in dependencies)) {
        diagnostics.error(
          "core.extension.unpinned-dependency#import-dependency-undeclared",
          file.path,
          "",
          { specifier: specifier },
        );
        ok = false;
      }
    }
  }

  return ok;
}

interface ResolvedImport {
  /** Candidates relative to the extension root; used to match the declared file set. */
  relative: string[];
  /** The same candidates as absolute paths; used to recognize engine-owned code. */
  absolute: string[];
  /** True when the import target resolves outside the extension root. */
  escapes: boolean;
}

function resolveImport(root: string, file: string, specifier: string): ResolvedImport {
  const base = path.isAbsolute(specifier)
    ? path.resolve(specifier)
    : path.resolve(root, path.dirname(file), specifier);
  const relativeTarget = path.relative(root, base).split(path.sep).join("/");
  const escapes =
    relativeTarget === ".." || relativeTarget.startsWith("../") || path.isAbsolute(relativeTarget);

  const withoutExtension = base.replace(/\.(?:js|mjs|cjs|jsx)$/, "");
  const absolute =
    withoutExtension !== base
      ? [".ts", ".tsx", ".mts", ".cts"].map((extension) => `${withoutExtension}${extension}`)
      : [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")];
  const normalizedAbsolute = [...new Set(absolute.map((candidate) => path.resolve(candidate)))];

  return {
    absolute: normalizedAbsolute,
    relative: normalizedAbsolute.map((candidate) =>
      path.relative(root, candidate).split(path.sep).join("/"),
    ),
    escapes,
  };
}

function normalizeRelativePath(value: string): string | null {
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (normalized.length === 0 || normalized === ".") return null;
  if (normalized.startsWith("../") || normalized === "..") return null;
  if (path.posix.isAbsolute(normalized)) return null;
  return normalized;
}

function packageNameOf(specifier: string): string | null {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (parts.length < 2 || parts[1] === undefined || parts[1].length === 0) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? null;
}
