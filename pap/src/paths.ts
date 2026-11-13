/**
 * PAP v0.1 path grammar and package-root-confined streaming reads.
 *
 * Declared paths are validated before any filesystem access. Every path
 * component is checked for a symlink; the final component must be a regular
 * file when reading a payload and a directory when resolving a package
 * directory. Reads stay under the package root and are streamed through a
 * bounded reader. Payload hashing consumes chunks and never buffers the whole
 * file.
 */

import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { concatBytes, createDomainHasher } from "./digest.js";
import type { Limits } from "./types.js";

export interface PathValidation {
  ok: boolean;
  reason?: "grammar" | "segments" | "path-bytes" | "segment-bytes";
}

const SEGMENT = /^[A-Za-z0-9._-]+$/;

export function validateDeclaredPath(value: string, limits: Limits): PathValidation {
  if (!/^[\x20-\x7e]+$/.test(value) || value.includes("\\")) {
    return { ok: false, reason: "grammar" };
  }
  const segments = value.split("/");
  if (segments.length < 1 || segments.length > limits.pathSegments) {
    return { ok: false, reason: "segments" };
  }
  if (new TextEncoder().encode(value).length > limits.pathBytes) {
    return { ok: false, reason: "path-bytes" };
  }
  for (const segment of segments) {
    if (segment.length === 0 || segment === "." || segment === ".." || !SEGMENT.test(segment)) {
      return { ok: false, reason: "grammar" };
    }
    if (new TextEncoder().encode(segment).length > limits.segmentBytes) {
      return { ok: false, reason: "segment-bytes" };
    }
  }
  return { ok: true };
}

export function pathKey(value: string): string {
  return value.toLowerCase();
}

export type ReadFailure = "missing" | "io" | "symlink" | "non-regular" | "path-escape" | "limit";

export interface ReadResult {
  ok: boolean;
  bytes?: Uint8Array;
  failure?: ReadFailure;
  message?: string;
}

export interface HashResult {
  ok: boolean;
  digest?: string;
  size?: number;
  failure?: ReadFailure;
  message?: string;
}

export interface PackageRoot {
  /** Path exactly as supplied by the caller (used only for the report). */
  supplied: string;
  /** Absolute, resolved directory used for containment checks. */
  real: string;
}

export async function resolvePackageRoot(
  supplied: string,
): Promise<
  | { ok: true; root: PackageRoot }
  | { ok: false; failure: "not-found" | "not-directory" | "io"; message: string }
> {
  let stats;
  try {
    stats = await lstat(supplied);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        ok: false,
        failure: "not-found",
        message: `package path does not exist: ${supplied}`,
      };
    }
    return { ok: false, failure: "io", message: `cannot stat package path: ${supplied}` };
  }
  if (stats.isSymbolicLink()) {
    try {
      stats = await lstat(await realpath(supplied));
    } catch {
      return {
        ok: false,
        failure: "not-found",
        message: `package path does not resolve: ${supplied}`,
      };
    }
  }
  if (!stats.isDirectory()) {
    return {
      ok: false,
      failure: "not-directory",
      message: `package path is not a directory: ${supplied}`,
    };
  }
  let real: string;
  try {
    real = await realpath(supplied);
  } catch {
    return { ok: false, failure: "io", message: `cannot resolve package path: ${supplied}` };
  }
  return { ok: true, root: { supplied, real } };
}

export interface ResolvedPath {
  absolute: string;
  size: number;
}

/** A package file that has been resolved, opened and checked exactly once. */
export interface OpenPackageFile {
  handle: FileHandle;
  relative: string;
  size: number;
}

async function resolvePackagePath(
  root: PackageRoot,
  relative: string,
  finalKind: "file" | "directory",
  cap: number,
): Promise<
  { ok: true; resolved: ResolvedPath } | { ok: false; failure: ReadFailure; message: string }
> {
  const noun = finalKind === "file" ? "declared file" : "package directory";
  const segments = relative.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return {
      ok: false,
      failure: "path-escape",
      message: `declared path is not root-confined: ${relative}`,
    };
  }
  let current = root.real;
  let finalSize = 0;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index] as string);
    let stats;
    try {
      stats = await lstat(current);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return { ok: false, failure: "missing", message: `${noun} is missing: ${relative}` };
      }
      return {
        ok: false,
        failure: "io",
        message: `cannot stat package path component: ${relative}`,
      };
    }
    if (stats.isSymbolicLink()) {
      return {
        ok: false,
        failure: "symlink",
        message: `package path contains a symlink component: ${relative}`,
      };
    }
    const final = index === segments.length - 1;
    if (final && finalKind === "file") {
      if (!stats.isFile()) {
        return {
          ok: false,
          failure: "non-regular",
          message: `${noun} is not a regular file: ${relative}`,
        };
      }
      finalSize = stats.size;
    } else if (final) {
      if (!stats.isDirectory()) {
        return {
          ok: false,
          failure: "non-regular",
          message: `${noun} is not a directory: ${relative}`,
        };
      }
    } else if (!stats.isDirectory()) {
      return {
        ok: false,
        failure: "non-regular",
        message: `package path component is not a directory: ${relative}`,
      };
    }
  }
  let resolved: string;
  try {
    resolved = await realpath(current);
  } catch {
    return { ok: false, failure: "io", message: `cannot resolve ${noun}: ${relative}` };
  }
  const prefix = root.real.endsWith(path.sep) ? root.real : `${root.real}${path.sep}`;
  if (resolved !== root.real && !resolved.startsWith(prefix)) {
    return {
      ok: false,
      failure: "path-escape",
      message: `${noun} resolves outside the package: ${relative}`,
    };
  }
  if (finalSize > cap) {
    return { ok: false, failure: "limit", message: `${noun} exceeds the byte limit: ${relative}` };
  }
  return { ok: true, resolved: { absolute: current, size: finalSize } };
}

export async function resolvePackageFile(
  root: PackageRoot,
  relative: string,
  cap: number,
): Promise<
  { ok: true; file: ResolvedPath } | { ok: false; failure: ReadFailure; message: string }
> {
  const outcome = await resolvePackagePath(root, relative, "file", cap);
  if (!outcome.ok) return outcome;
  return { ok: true, file: outcome.resolved };
}

/**
 * Resolve a package directory through the same component-wise `lstat` and
 * containment rules used for payload files. No symlink component is followed.
 */
export async function resolvePackageDirectory(
  root: PackageRoot,
  relative: string,
): Promise<{ ok: true; absolute: string } | { ok: false; failure: ReadFailure; message: string }> {
  const outcome = await resolvePackagePath(root, relative, "directory", Number.POSITIVE_INFINITY);
  if (!outcome.ok) return outcome;
  return { ok: true, absolute: outcome.resolved.absolute };
}

function payloadOpenFlags(): number {
  return constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
}

/**
 * Open a previously resolved package file exactly once. The caller owns the
 * returned handle and must close it in a `finally` block.
 */
export async function openResolvedPackageFile(
  resolved: ResolvedPath,
  relative: string,
  cap: number,
): Promise<
  { ok: true; file: OpenPackageFile } | { ok: false; failure: ReadFailure; message: string }
> {
  let handle: FileHandle;
  try {
    handle = await open(resolved.absolute, payloadOpenFlags());
  } catch {
    return { ok: false, failure: "io", message: `cannot open declared file: ${relative}` };
  }
  let size: number;
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) {
      await handle.close();
      return {
        ok: false,
        failure: "non-regular",
        message: `declared file is not a regular file: ${relative}`,
      };
    }
    size = opened.size;
    if (size > cap) {
      await handle.close();
      return {
        ok: false,
        failure: "limit",
        message: `declared file exceeds the byte limit: ${relative}`,
      };
    }
  } catch {
    await handle.close();
    return { ok: false, failure: "io", message: `cannot read declared file: ${relative}` };
  }
  return { ok: true, file: { handle, relative, size } };
}

/** Resolve and open a package file once; the caller owns and closes the handle. */
export async function openPackageFile(
  root: PackageRoot,
  relative: string,
  cap: number,
): Promise<
  { ok: true; file: OpenPackageFile } | { ok: false; failure: ReadFailure; message: string }
> {
  const resolved = await resolvePackageFile(root, relative, cap);
  if (!resolved.ok) return resolved;
  return openResolvedPackageFile(resolved.file, relative, cap);
}

/**
 * Read a package file from an already-open descriptor starting at an explicit
 * byte position. Node and Bun expose no separate seek, so every chunk read
 * passes its position to `handle.read`. The descriptor is never reopened or
 * re-resolved here.
 */
export async function readPackageFileChunks(
  handle: FileHandle,
  relative: string,
  start: number,
  cap: number,
  onChunk: (chunk: Uint8Array) => void | Promise<void>,
): Promise<{ ok: true; size: number } | { ok: false; failure: ReadFailure; message: string }> {
  try {
    const buffer = new Uint8Array(65_536);
    let position = start;
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      total += bytesRead;
      if (total > cap) {
        return {
          ok: false,
          failure: "limit",
          message: `declared file exceeds the byte limit: ${relative}`,
        };
      }
      await onChunk(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    return { ok: true, size: total };
  } catch {
    return { ok: false, failure: "io", message: `cannot read declared file: ${relative}` };
  }
}

/**
 * Stream a package file through a bounded reader. The callback receives chunks
 * that are safe to retain; the whole payload is never buffered here.
 */
export async function streamPackageFile(
  root: PackageRoot,
  relative: string,
  _limits: Limits,
  cap: number,
  onChunk: (chunk: Uint8Array) => void | Promise<void>,
): Promise<{ ok: true; size: number } | { ok: false; failure: ReadFailure; message: string }> {
  const opened = await openPackageFile(root, relative, cap);
  if (!opened.ok) return opened;
  try {
    return await readPackageFileChunks(opened.file.handle, relative, 0, cap, onChunk);
  } finally {
    await opened.file.handle.close();
  }
}

/** Buffer a bounded JSON/document file (manifest, claim, signature envelope). */
export async function readPackageFile(
  root: PackageRoot,
  relative: string,
  limits: Limits,
  cap: number = limits.fileBytes,
): Promise<ReadResult> {
  const chunks: Uint8Array[] = [];
  const streamed = await streamPackageFile(root, relative, limits, cap, (chunk) => {
    chunks.push(chunk);
  });
  if (!streamed.ok) {
    return { ok: false, failure: streamed.failure, message: streamed.message };
  }
  return { ok: true, bytes: concatBytes(chunks) };
}

/** Hash a package file without retaining its bytes. */
export async function hashPackageFile(
  root: PackageRoot,
  relative: string,
  domain: string,
  limits: Limits,
  cap: number,
): Promise<HashResult> {
  const hasher = createDomainHasher(domain);
  const streamed = await streamPackageFile(root, relative, limits, cap, (chunk) => {
    hasher.update(chunk);
  });
  if (!streamed.ok) {
    return { ok: false, failure: streamed.failure, message: streamed.message };
  }
  return { ok: true, digest: hasher.digest(), size: streamed.size };
}

/** Hash one byte range of a package file without retaining the span. */
export async function hashPackageRange(
  root: PackageRoot,
  relative: string,
  start: number,
  end: number,
  domain: string,
  limits: Limits,
): Promise<HashResult> {
  const resolved = await resolvePackageFile(root, relative, limits.fileBytes);
  if (!resolved.ok) return resolved;
  if (start > end || end > resolved.file.size) {
    return {
      ok: false,
      failure: "non-regular",
      message: `range [${start}, ${end}) is outside ${relative}`,
    };
  }
  const hasher = createDomainHasher(domain);
  let handle;
  try {
    handle = await open(resolved.file.absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return { ok: false, failure: "io", message: `cannot open declared file: ${relative}` };
  }
  try {
    const buffer = new Uint8Array(65_536);
    let position = start;
    let length = 0;
    while (position < end) {
      const wanted = Math.min(buffer.length, end - position);
      const { bytesRead } = await handle.read(buffer, 0, wanted, position);
      if (bytesRead === 0) break;
      hasher.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
      length += bytesRead;
    }
    if (length !== end - start) {
      return { ok: false, failure: "io", message: `short read of range [${start}, ${end})` };
    }
    return { ok: true, digest: hasher.digest(), size: length };
  } catch {
    return { ok: false, failure: "io", message: `cannot read declared range: ${relative}` };
  } finally {
    await handle.close();
  }
}

export interface WalkResult {
  files: string[];
  limitHit: boolean;
  error: string | null;
}

/**
 * Bound directory enumeration by entry count and depth. Directory read errors
 * other than an absent directory are returned, never silently ignored.
 */
export async function walkPackageFiles(root: PackageRoot, limits: Limits): Promise<WalkResult> {
  const files: string[] = [];
  const maxEntries = Math.max(1_024, limits.payloadFiles * 2);
  let entries = 0;
  let limitHit = false;
  let error: string | null = null;
  const visit = async (relativeDir: string, depth: number): Promise<void> => {
    if (limitHit || error !== null) return;
    if (depth > limits.pathSegments) {
      limitHit = true;
      return;
    }
    const absolute =
      relativeDir === "" ? root.real : path.join(root.real, ...relativeDir.split("/"));
    let directory;
    try {
      directory = await opendir(absolute);
    } catch (readError) {
      const code = (readError as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        error = `cannot read directory ${relativeDir || "."}`;
      }
      return;
    }
    try {
      for await (const entry of directory) {
        entries += 1;
        if (entries > maxEntries) {
          limitHit = true;
          return;
        }
        const relative = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          await visit(relative, depth + 1);
        } else if (entry.isFile()) {
          files.push(relative);
        }
      }
    } catch {
      error = `cannot enumerate directory ${relativeDir || "."}`;
    }
  };
  await visit("", 1);
  files.sort();
  return { files, limitHit, error };
}

export function declaredFileKind(
  relative: string,
): "artifact" | "input" | "source" | "claim" | "signature" | "other" {
  if (relative.startsWith("artifacts/")) return "artifact";
  if (relative.startsWith("inputs/")) return "input";
  if (relative.startsWith("sources/")) return "source";
  if (relative.startsWith("claims/")) return "claim";
  if (relative.startsWith("signatures/")) return "signature";
  return "other";
}
