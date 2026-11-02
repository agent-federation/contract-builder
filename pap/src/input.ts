/**
 * Streamed build-input normalization and hashing.
 *
 * Inputs follow the LF rule of RFC §5.6: NUL or invalid UTF-8 falls back to raw
 * bytes; otherwise CRLF and lone CR become LF. Files are streamed in bounded
 * chunks and never buffered in full.
 */

import { createDomainHasher, framePrefix } from "./digest.js";
import type { DomainHasher } from "./digest.js";
import { streamPackageFile } from "./paths.js";
import type { PackageRoot } from "./paths.js";
import type { Limits } from "./types.js";

export type InputMode = "lf" | "raw";

interface StreamFailure {
  ok: false;
  failure: "limit" | "missing" | "symlink" | "non-regular" | "path-escape" | "io";
  message: string;
}

export interface InputAnalysis {
  ok: true;
  mode: InputMode;
  rawSize: number;
  normalizedSize: number;
}

export interface InputHash {
  ok: true;
  mode: InputMode;
  rawSize: number;
  normalizedSize: number;
  digest: string;
}

/**
 * One pass: determine whether the declared `lf` normalization applies and
 * measure the normalized byte length. `none` is always raw.
 */
export async function analyzeInput(
  root: PackageRoot,
  relative: string,
  normalization: "lf" | "none",
  limits: Limits,
  cap: number,
): Promise<InputAnalysis | StreamFailure> {
  if (normalization === "none") {
    let rawSize = 0;
    const streamed = await streamPackageFile(root, relative, limits, cap, (chunk) => {
      rawSize += chunk.length;
    });
    if (!streamed.ok) return streamed;
    return { ok: true, mode: "raw", rawSize: streamed.size, normalizedSize: streamed.size };
  }

  let invalid = false;
  let rawSize = 0;
  let normalizedSize = 0;
  let pendingCr = false;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  const consume = (text: string): void => {
    let out = "";
    for (const char of text) {
      if (pendingCr) {
        pendingCr = false;
        if (char === "\n") continue;
      }
      if (char === "\r") {
        out += "\n";
        pendingCr = true;
      } else {
        out += char;
      }
    }
    if (out.length > 0) normalizedSize += encoder.encode(out).length;
  };

  const streamed = await streamPackageFile(root, relative, limits, cap, (chunk) => {
    rawSize += chunk.length;
    if (invalid) return;
    if (chunk.includes(0)) {
      invalid = true;
      return;
    }
    try {
      consume(decoder.decode(chunk, { stream: true }));
    } catch {
      invalid = true;
    }
  });
  if (!streamed.ok) return streamed;
  if (!invalid) {
    try {
      consume(decoder.decode());
    } catch {
      invalid = true;
    }
  }
  if (invalid) {
    return { ok: true, mode: "raw", rawSize: streamed.size, normalizedSize: streamed.size };
  }
  return { ok: true, mode: "lf", rawSize: streamed.size, normalizedSize };
}

/** Hash a single input file under `pap.input.file.v1` with streamed framing. */
export async function hashInput(
  root: PackageRoot,
  relative: string,
  normalization: "lf" | "none",
  limits: Limits,
  cap: number,
): Promise<InputHash | StreamFailure> {
  const analysis = await analyzeInput(root, relative, normalization, limits, cap);
  if (!analysis.ok) return analysis;
  const hasher = createDomainHasher("pap.input.file.v1");
  hasher.update(framePrefix("input", [relative], analysis.normalizedSize));
  const streamed = await streamInputBytes(root, relative, analysis.mode, limits, cap, hasher);
  if (!streamed.ok) return streamed;
  return {
    ok: true,
    mode: analysis.mode,
    rawSize: analysis.rawSize,
    normalizedSize: analysis.normalizedSize,
    digest: hasher.digest(),
  };
}

/** Hash the set of packaged inputs in ascending path order. */
export async function normalizedInputSetDigestStream(
  root: PackageRoot,
  entries: { path: string; mode: InputMode; normalizedSize: number }[],
  limits: Limits,
): Promise<string | null> {
  const hasher = createDomainHasher("pap.input.set.v1");
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const entry of sorted) {
    hasher.update(framePrefix("input", [entry.path], entry.normalizedSize));
    const streamed = await streamInputBytes(
      root,
      entry.path,
      entry.mode,
      limits,
      limits.fileBytes,
      hasher,
    );
    if (!streamed.ok) return null;
  }
  return hasher.digest();
}

async function streamInputBytes(
  root: PackageRoot,
  relative: string,
  mode: InputMode,
  limits: Limits,
  cap: number,
  hasher: DomainHasher,
): Promise<{ ok: true } | StreamFailure> {
  if (mode === "raw") {
    const streamed = await streamPackageFile(root, relative, limits, cap, (chunk) => {
      hasher.update(chunk);
    });
    return streamed.ok ? { ok: true } : streamed;
  }

  let pendingCr = false;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  const emit = (text: string): void => {
    let out = "";
    for (const char of text) {
      if (pendingCr) {
        pendingCr = false;
        if (char === "\n") continue;
      }
      if (char === "\r") {
        out += "\n";
        pendingCr = true;
      } else {
        out += char;
      }
    }
    if (out.length > 0) hasher.update(encoder.encode(out));
  };
  try {
    const streamed = await streamPackageFile(root, relative, limits, cap, (chunk) => {
      emit(decoder.decode(chunk, { stream: true }));
    });
    if (!streamed.ok) return streamed;
    emit(decoder.decode());
    return { ok: true };
  } catch {
    return { ok: false, failure: "io", message: `cannot decode normalized input: ${relative}` };
  }
}
