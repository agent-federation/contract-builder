/**
 * PAP v0.1 path grammar and package-root-confined file reads.
 *
 * Declared paths are validated before any filesystem access. Reads reject
 * symlinks, non-regular files, paths that resolve outside the package root and
 * files that exceed the configured byte limit.
 */

import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
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

export type ReadFailure =
  | "missing"
  | "io"
  | "symlink"
  | "non-regular"
  | "path-escape"
  | "limit";

export interface ReadResult {
  ok: boolean;
  bytes?: Uint8Array;
  failure?: ReadFailure;
  message?: string;
}

export interface PackageRoot {
  /** Path exactly as supplied by the caller (used only for the report). */
  supplied: string;
  /** Absolute, resolved directory used for containment checks. */
  real: string;
}

export async function resolvePackageRoot(supplied: string): Promise<
  { ok: true; root: PackageRoot } | { ok: false; failure: "not-found" | "not-directory" | "io"; message: string }
> {
  let stats;
  try {
    stats = await lstat(supplied);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, failure: "not-found", message: `package path does not exist: ${supplied}` };
    }
    return { ok: false, failure: "io", message: `cannot stat package path: ${supplied}` };
  }
  if (stats.isSymbolicLink()) {
    try {
      stats = await lstat(await realpath(supplied));
    } catch {
      return { ok: false, failure: "not-found", message: `package path does not resolve: ${supplied}` };
    }
  }
  if (!stats.isDirectory()) {
    return { ok: false, failure: "not-directory", message: `package path is not a directory: ${supplied}` };
  }
  let real: string;
  try {
    real = await realpath(supplied);
  } catch {
    return { ok: false, failure: "io", message: `cannot resolve package path: ${supplied}` };
  }
  return { ok: true, root: { supplied, real } };
}

export async function readPackageFile(
  root: PackageRoot,
  relative: string,
  limits: Limits,
  cap: number = limits.fileBytes,
): Promise<ReadResult> {
  const absolute = path.join(root.real, ...relative.split("/"));
  let info;
  try {
    info = await lstat(absolute);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, failure: "missing", message: `declared file is missing: ${relative}` };
    }
    return { ok: false, failure: "io", message: `cannot stat declared file: ${relative}` };
  }
  if (info.isSymbolicLink()) {
    return { ok: false, failure: "symlink", message: `declared file is a symlink: ${relative}` };
  }
  if (!info.isFile()) {
    return { ok: false, failure: "non-regular", message: `declared file is not a regular file: ${relative}` };
  }
  let resolved: string;
  try {
    resolved = await realpath(absolute);
  } catch {
    return { ok: false, failure: "io", message: `cannot resolve declared file: ${relative}` };
  }
  if (resolved !== root.real && !resolved.startsWith(`${root.real}${path.sep}`)) {
    return { ok: false, failure: "path-escape", message: `declared file resolves outside the package: ${relative}` };
  }
  if (info.size > cap) {
    return { ok: false, failure: "limit", message: `declared file exceeds the byte limit: ${relative}` };
  }

  let handle;
  try {
    const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
    handle = await open(absolute, flags);
  } catch {
    return { ok: false, failure: "io", message: `cannot open declared file: ${relative}` };
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) {
      return { ok: false, failure: "non-regular", message: `declared file is not a regular file: ${relative}` };
    }
    if (opened.size > cap) {
      return { ok: false, failure: "limit", message: `declared file exceeds the byte limit: ${relative}` };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const buffer = new Uint8Array(65_536);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      total += bytesRead;
      if (total > cap) {
        return { ok: false, failure: "limit", message: `declared file exceeds the byte limit: ${relative}` };
      }
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, failure: "io", message: `cannot read declared file: ${relative}` };
  } finally {
    await handle.close();
  }
}

/** List regular files under the package, relative paths with `/` separators. */
export async function walkPackageFiles(root: PackageRoot): Promise<string[]> {
  const files: string[] = [];
  const visit = async (relativeDir: string): Promise<void> => {
    const absolute = relativeDir === "" ? root.real : path.join(root.real, ...relativeDir.split("/"));
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(relative);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  };
  await visit("");
  files.sort();
  return files;
}

export function declaredFileKind(relative: string): "artifact" | "input" | "source" | "claim" | "signature" | "other" {
  if (relative.startsWith("artifacts/")) return "artifact";
  if (relative.startsWith("inputs/")) return "input";
  if (relative.startsWith("sources/")) return "source";
  if (relative.startsWith("claims/")) return "claim";
  if (relative.startsWith("signatures/")) return "signature";
  return "other";
}
