/**
 * Digest and envelope framing helpers for the deterministic build identity.
 *
 * See `docs/architecture/build-identity.md` for the byte format and the input boundary.
 */

import { createHash } from "node:crypto";
import { compare } from "../diagnostics.js";
import { isObject } from "../guards.js";
import type { Manifest } from "../manifest.js";
import type { DependencyRecord } from "./types.js";

/** Text of the pre-hash envelopes, so the two digest families cannot be confused. */
export const INPUT_ENVELOPE = new TextEncoder().encode("contract-builder/input-digest/v1\n");
const CLOSURE_ENVELOPE = new TextEncoder().encode("contract-builder/extension-closure/v1\n");

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
