/**
 * Deterministic build identity: the authoritative `inputDigest` plus the extension
 * closures it covers.
 *
 * The digest is not a proof of correctness, security, hermeticity or trustworthiness. It is
 * a deterministic fingerprint of the declared inputs and of the declared extension closures.
 * Extensions are trusted in-process code; the import scan below is a guard, not a sandbox.
 * It cannot see computed specifiers, `createRequire`, `process.binding`, or runtime access
 * to external state.
 *
 * See `docs/architecture/build-identity.md` for the byte format and the input boundary.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";
import { compare, type Diagnostics } from "./diagnostics.js";
import type { ExtensionClosureDeclaration } from "./extension.js";
import { isNonEmptyString, isObject, messageOf } from "./guards.js";
import type { LoadedSpec } from "./load.js";
import { resolveContained, type Manifest, type ResolvedProject } from "./manifest.js";
import type { Renderer } from "./render.js";
import type { SourceAdapter, SourceDocument } from "./source.js";

export type ExtensionKind = "profile" | "adapter" | "renderer";

export interface BuildIdentity {
  projectId: string;
  engineVersion: string;
  manifestVersion: string;
  inputDigest: string;
  extensions: Array<{ kind: ExtensionKind; id: string; version: string }>;
}

export interface DependencyRecord {
  name: string;
  version: string;
  integrity: string;
}

interface LockfilePackage extends DependencyRecord {
  dependencies: Record<string, string>;
}

export interface Lockfile {
  packages: LockfilePackage[];
}

export interface ResolvedExtensionClosure {
  kind: ExtensionKind;
  id: string;
  version: string;
  closureDigest: string;
  files: Array<{ path: string; bytes: Uint8Array }>;
  dependencies: DependencyRecord[];
}

export interface IdentityInput {
  project: ResolvedProject;
  loaded: LoadedSpec;
  sources: readonly SourceDocument[];
  adapters: Record<string, SourceAdapter>;
  renderer: Renderer;
  diagnostics: Diagnostics;
}

/** Text of the pre-hash envelopes, so the two digest families cannot be confused. */
const INPUT_ENVELOPE = new TextEncoder().encode("contract-builder/input-digest/v1\n");
const CLOSURE_ENVELOPE = new TextEncoder().encode("contract-builder/extension-closure/v1\n");

/** Reads the repository package version, the M1 source of `engineVersion`. */
export async function readEngineVersion(): Promise<string> {
  const text = await readFile(new URL("../../package.json", import.meta.url), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed) || !isNonEmptyString(parsed.version)) {
    throw new Error("package.json не содержит version");
  }
  return parsed.version;
}

/** Reads the repository lockfile; `bun.lock` is JSON with comments and trailing commas. */
export async function readLockfile(): Promise<Lockfile> {
  const text = await readFile(new URL("../../bun.lock", import.meta.url), "utf8");
  return parseLockfile(text);
}

/**
 * Parses `bun.lock` without depending on a JSONC package. Comments and trailing commas are
 * removed outside strings, then the result is parsed as JSON.
 */
export function parseLockfile(text: string): Lockfile {
  const raw: unknown = JSON.parse(stripJsonc(text));
  if (!isObject(raw) || !isObject(raw.packages)) {
    throw new Error("bun.lock не содержит packages");
  }

  const packages: LockfilePackage[] = [];
  for (const entry of Object.values(raw.packages)) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    const resolved = splitResolved(entry[0]);
    if (resolved === null) continue;
    const metadata = isObject(entry[2]) ? entry[2] : {};
    const dependencies: Record<string, string> = {};
    if (isObject(metadata.dependencies)) {
      for (const [name, range] of Object.entries(metadata.dependencies)) {
        if (typeof range === "string") dependencies[name] = range;
      }
    }
    packages.push({
      name: resolved.name,
      version: resolved.version,
      integrity: typeof entry[3] === "string" ? entry[3] : "",
      dependencies,
    });
  }
  return { packages };
}

/** Normalizes declared bytes to LF when they are UTF-8 text; binary bytes stay raw. */
export function normalizeTextBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.includes(0)) return bytes;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return bytes;
  }
  return new TextEncoder().encode(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
}

/** Normalizes a declared relative path to POSIX separators and drops a leading `./`. */
export function normalizeDeclaredPath(value: string): string {
  let normalized = value.replace(/\\/g, "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized;
}

/**
 * Canonical JSON for the manifest: recursively sorted object keys, arrays kept in declared
 * order, no insignificant whitespace. Keys are sorted by code point, never locale collation.
 */
export function canonicalManifestJson(manifest: Manifest): string {
  return JSON.stringify(sortJson(manifest));
}

/**
 * One typed, length-prefixed record. Layout: u32 tag length, tag bytes, u32 part count, then
 * for each part a u32 length and the bytes. The lengths make concatenation unambiguous.
 */
export function frameRecord(tag: string, parts: ReadonlyArray<string | Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const tagBytes = new TextEncoder().encode(tag);
  chunks.push(lengthPrefix(tagBytes.length), tagBytes, lengthPrefix(parts.length));
  for (const part of parts) {
    const bytes = typeof part === "string" ? new TextEncoder().encode(part) : part;
    chunks.push(lengthPrefix(bytes.length), bytes);
  }
  return concatChunks(chunks);
}

/** SHA-256 over declared files (sorted by path) and the resolved dependency records. */
export function computeClosureDigest(
  files: ReadonlyArray<{ path: string; bytes: Uint8Array }>,
  dependencies: ReadonlyArray<DependencyRecord>,
): string {
  const hash = createHash("sha256");
  hash.update(CLOSURE_ENVELOPE);

  const sortedFiles = [...files].sort((a, b) => compare(a.path, b.path));
  for (const file of sortedFiles) {
    hash.update(frameRecord("file", [file.path, normalizeTextBytes(file.bytes)]));
  }

  const sortedDependencies = [...dependencies].sort(
    (a, b) => compare(a.name, b.name) || compare(a.version, b.version),
  );
  for (const dependency of sortedDependencies) {
    hash.update(
      frameRecord("dependency", [dependency.name, dependency.version, dependency.integrity]),
    );
  }

  return `sha256:${hash.digest("hex")}`;
}

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
        "core.extension.unpinned-dependency",
        diagnosticFile,
        "/dependencies",
        `У зависимости "${pkg.name}@${pkg.version}" отсутствует integrity в bun.lock`,
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
          "core.extension.unpinned-dependency",
          diagnosticFile,
          "/dependencies",
          candidates.length === 0
            ? `Транзитивная зависимость "${name}" не найдена в bun.lock`
            : `Транзитивная зависимость "${name}" из bun.lock неоднозначна`,
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
        "core.extension.unpinned-dependency",
        diagnosticFile,
        "/dependencies",
        `Зависимость "${name}" не найдена в bun.lock`,
      );
      ok = false;
      continue;
    }
    if (exact === undefined) {
      const found = candidates.map((candidate) => candidate.version).sort(compare).join(", ");
      diagnostics.error(
        "core.extension.unpinned-dependency",
        diagnosticFile,
        "/dependencies",
        `Версия зависимости "${name}" объявлена как "${version}", а bun.lock содержит ${found}`,
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
): Promise<ResolvedExtensionClosure | null> {
  return resolveClosure({
    kind,
    id,
    version,
    declaration,
    lockfile,
    diagnostics,
    diagnosticFile: `${kind}:${id}`,
  });
}

/** Resolves the profile extension closure declared by `profile.json`. */
export async function resolveProfileClosure(
  project: ResolvedProject,
  lockfile: Lockfile,
  diagnostics: Diagnostics,
): Promise<ResolvedExtensionClosure | null> {
  const declared = project.profile.files;
  if (declared === undefined || declared.length === 0) {
    diagnostics.error(
      "core.extension.unpinned-dependency",
      "profile.json",
      "/files",
      "Профиль не объявляет files, поэтому его замыкание нельзя определить",
    );
    return null;
  }

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
  });
}

/**
 * Validates the profile closure before the core imports profile modules, so an undeclared
 * import is reported as `core.extension.unpinned-dependency` instead of failing later as a
 * profile load error. A lockfile read failure is left for `computeBuildIdentity`, which owns
 * that diagnostic.
 */
export async function validateProfileClosure(
  project: ResolvedProject,
  diagnostics: Diagnostics,
): Promise<boolean> {
  let lockfile: Lockfile;
  try {
    lockfile = await readLockfile();
  } catch {
    return true;
  }
  return (await resolveProfileClosure(project, lockfile, diagnostics)) !== null;
}

/** Computes the complete build identity for a resolved project. */
export async function computeBuildIdentity(input: IdentityInput): Promise<BuildIdentity | null> {
  const { project, loaded, sources, adapters, renderer, diagnostics } = input;

  let engineVersion: string;
  let lockfile: Lockfile;
  try {
    engineVersion = await readEngineVersion();
  } catch (error) {
    diagnostics.error(
      "ERR_IO",
      "package.json",
      "/version",
      `Не удалось определить версию движка: ${messageOf(error)}`,
    );
    return null;
  }
  try {
    lockfile = await readLockfile();
  } catch (error) {
    diagnostics.error(
      "ERR_IO",
      "bun.lock",
      "",
      `Не удалось прочитать bun.lock: ${messageOf(error)}`,
    );
    return null;
  }

  const profileClosure = await resolveProfileClosure(project, lockfile, diagnostics);
  if (profileClosure === null) return null;

  const adapterIds = [
    ...new Set((project.manifest.sources ?? []).map((source) => source.adapter)),
  ].sort(compare);
  const adapterClosures: ResolvedExtensionClosure[] = [];
  for (const adapterId of adapterIds) {
    const adapter = adapters[adapterId];
    if (adapter === undefined) return null;
    const closure = await resolveExtensionClosure(
      "adapter",
      adapter.id,
      adapter.version,
      adapter.closure,
      lockfile,
      diagnostics,
    );
    if (closure === null) return null;
    adapterClosures.push(closure);
  }

  const rendererClosure = await resolveExtensionClosure(
    "renderer",
    renderer.id,
    renderer.version,
    renderer.closure,
    lockfile,
    diagnostics,
  );
  if (rendererClosure === null) return null;

  const hash = createHash("sha256");
  hash.update(INPUT_ENVELOPE);
  hash.update(frameRecord("manifest", [canonicalManifestJson(project.manifest)]));

  for (const input of project.manifest.inputs) {
    const bytes = loaded.bytes[input.path];
    if (bytes === undefined) continue;
    hash.update(
      frameRecord("input", [normalizeDeclaredPath(input.path), normalizeTextBytes(bytes)]),
    );
  }

  for (const source of sources) {
    hash.update(
      frameRecord("source", [source.id, source.adapter, normalizeTextBytes(source.bytes)]),
    );
  }

  hash.update(
    frameRecord("profile", [
      profileClosure.id,
      profileClosure.version,
      profileClosure.closureDigest,
    ]),
  );

  for (const closure of adapterClosures.sort((a, b) => compare(a.id, b.id))) {
    hash.update(
      frameRecord("adapter", [closure.id, closure.version, closure.closureDigest]),
    );
  }

  hash.update(
    frameRecord("renderer", [
      rendererClosure.id,
      rendererClosure.version,
      rendererClosure.closureDigest,
    ]),
  );

  const extensions: BuildIdentity["extensions"] = [
    { kind: "profile", id: profileClosure.id, version: profileClosure.version },
  ];
  for (const closure of adapterClosures) {
    extensions.push({ kind: "adapter", id: closure.id, version: closure.version });
  }
  extensions.push({
    kind: "renderer",
    id: rendererClosure.id,
    version: rendererClosure.version,
  });

  return {
    projectId: project.manifest.project.id,
    engineVersion,
    manifestVersion: project.manifest.manifestVersion,
    inputDigest: `sha256:${hash.digest("hex")}`,
    extensions,
  };
}

interface ClosureRequest {
  kind: ExtensionKind;
  id: string;
  version: string;
  declaration: ExtensionClosureDeclaration | undefined;
  lockfile: Lockfile;
  diagnostics: Diagnostics;
  diagnosticFile: string;
}

async function resolveClosure(request: ClosureRequest): Promise<ResolvedExtensionClosure | null> {
  const { kind, id, version, declaration, lockfile, diagnostics, diagnosticFile } = request;
  if (declaration === undefined) {
    diagnostics.error(
      "core.extension.unpinned-dependency",
      diagnosticFile,
      "/closure",
      `Расширение "${kind}:${id}" не объявляет files и dependencies`,
    );
    return null;
  }

  const declared = declaration.files;
  if (declared.length > 0 && !isNonEmptyString(declaration.root)) {
    diagnostics.error(
      "core.extension.unpinned-dependency",
      diagnosticFile,
      "/closure/root",
      `Расширение "${kind}:${id}" объявляет files без корневого каталога`,
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

  if (!scanImports(files, declaration.dependencies ?? {}, diagnostics)) {
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
        "core.extension.unpinned-dependency",
        diagnosticFile,
        "/files",
        `Объявленный путь "${value}" должен оставаться внутри каталога расширения`,
      );
      ok = false;
      continue;
    }
    if (seen.has(relative)) continue;
    seen.add(relative);

    const located = await resolveContained(root, relative);
    if (!located.inside) {
      diagnostics.error(
        "core.extension.unpinned-dependency",
        diagnosticFile,
        "/files",
        `Объявленный файл "${relative}" выходит за пределы каталога расширения`,
      );
      ok = false;
      continue;
    }

    try {
      files.push({ path: relative, bytes: new Uint8Array(await readFile(located.abs)) });
    } catch (error) {
      diagnostics.error(
        "core.extension.unpinned-dependency",
        diagnosticFile,
        "/files",
        `Объявленный файл "${relative}" не прочитан: ${messageOf(error)}`,
      );
      ok = false;
    }
  }

  if (!ok) return null;
  return files.sort((a, b) => compare(a.path, b.path));
}

function scanImports(
  files: ReadonlyArray<{ path: string; bytes: Uint8Array }>,
  dependencies: Readonly<Record<string, string>>,
  diagnostics: Diagnostics,
): boolean {
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

    for (const specifier of importSpecifiers(text)) {
      if (specifier.startsWith(".")) {
        const candidates = resolveRelativeImport(file.path, specifier);
        if (candidates === null) continue; // outside the extension root: engine code
        if (!candidates.some((candidate) => declared.has(candidate))) {
          diagnostics.error(
            "core.extension.unpinned-dependency",
            file.path,
            "",
            `Относительный импорт "${specifier}" не входит в объявленные files расширения`,
          );
          ok = false;
        }
        continue;
      }

      if (specifier.startsWith("/")) continue;
      if (isBuiltin(specifier)) continue;
      if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier)) continue;

      const packageName = packageNameOf(specifier);
      if (packageName === null) continue;
      if (!(packageName in dependencies)) {
        diagnostics.error(
          "core.extension.unpinned-dependency",
          file.path,
          "",
          `Импорт "${specifier}" не объявлен в dependencies расширения`,
        );
        ok = false;
      }
    }
  }

  return ok;
}

/**
 * Conservative textual extraction of static `import`/`export ... from` specifiers and literal
 * `import("...")` specifiers. Comments are removed first. Computed specifiers are not seen;
 * that limitation is part of the trust boundary, not an oversight.
 */
export function importSpecifiers(text: string): string[] {
  const source = stripComments(text);
  const found: string[] = [];

  const staticPattern =
    /\b(import|export)\s+(type\s+)?(?:[^;"']*?\bfrom\s*)?["']([^"']+)["']/g;
  for (const match of source.matchAll(staticPattern)) {
    const typeKeyword = match[2];
    const specifier = match[3];
    if (specifier === undefined || typeKeyword !== undefined) continue;
    found.push(specifier);
  }

  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(dynamicPattern)) {
    const specifier = match[1];
    if (specifier !== undefined) found.push(specifier);
  }

  return [...new Set(found)];
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isObject(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort(compare)) {
      const child = value[key];
      if (child !== undefined) sorted[key] = sortJson(child);
    }
    return sorted;
  }
  return value;
}

function stripComments(text: string): string {
  let result = "";
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < text.length) {
    const char = text[index]!;
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = true;
      result += char;
      index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }
    result += char;
    index += 1;
  }

  return result;
}

function stripJsonc(text: string): string {
  const withoutComments = stripComments(text);
  let result = "";
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < withoutComments.length) {
    const char = withoutComments[index]!;
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      index += 1;
      continue;
    }
    if (char === ",") {
      let next = index + 1;
      while (next < withoutComments.length && /\s/.test(withoutComments[next]!)) next += 1;
      const following = withoutComments[next];
      if (following === "}" || following === "]") {
        index += 1;
        continue;
      }
    }
    result += char;
    index += 1;
  }

  return result;
}

function resolveRelativeImport(file: string, specifier: string): string[] | null {
  const target = path.posix.normalize(
    path.posix.join(path.posix.dirname(file), specifier),
  );
  if (target.startsWith("..") || path.posix.isAbsolute(target)) return null;

  const withoutExtension = target.replace(/\.(?:js|mjs|cjs|jsx)$/, "");
  if (withoutExtension !== target) {
    return [".ts", ".tsx", ".mts", ".cts"].map((extension) => `${withoutExtension}${extension}`);
  }
  return [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`];
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

function splitResolved(resolved: string): { name: string; version: string } | null {
  const at = resolved.lastIndexOf("@");
  if (at <= 0) return null;
  const version = resolved.slice(at + 1);
  if (version.length === 0) return null;
  return { name: resolved.slice(0, at), version };
}

function lengthPrefix(length: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, length, false);
  return bytes;
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
