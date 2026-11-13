/**
 * Streamed build-input normalization and hashing.
 *
 * Inputs follow the LF rule of RFC §5.6: NUL or invalid UTF-8 falls back to raw
 * bytes; otherwise CRLF and lone CR become LF. Files are streamed in bounded
 * chunks and never buffered in full.
 *
 * ODR-PAP-008: each declared input is opened exactly once. The existing
 * size-prefixed framing needs the normalized size before the content bytes, so
 * processing uses two bounded passes over the same descriptor: analysis, then a
 * single content read feeding both the per-file and set hashers. The pathname
 * is never re-resolved between passes.
 */

import { createDomainHasher, framePrefix } from "./digest.js";
import type { DomainHasher } from "./digest.js";
import {
  closePackageFile,
  openPackageFile,
  openResolvedPackageFile,
  readPackageFileChunks,
  resolvePackageFile,
} from "./paths.js";
import type { OpenPackageFile, PackageRoot, ResolvedPath } from "./paths.js";

export type InputMode = "lf" | "raw";

export interface StreamFailure {
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
 * One opener-planned input: the manifest index, the resolved absolute path, and
 * the per-input byte cap derived from the manifest-order budget plan.
 */
export interface PlannedInput {
  index: number;
  relative: string;
  resolved: ResolvedPath;
  normalization: "lf" | "none";
  cap: number;
}

export interface PlannedInputOutcome {
  index: number;
  outcome: InputHash | StreamFailure;
}

/**
 * Phase 1 of ODR-PAP-008: resolve and stat an input without reading content.
 * The caller charges the returned size against the manifest-order budget.
 */
export async function planInput(
  root: PackageRoot,
  relative: string,
  cap: number,
): Promise<
  | { ok: true; resolved: ResolvedPath }
  | { ok: false; failure: StreamFailure["failure"]; message: string }
> {
  const resolved = await resolvePackageFile(root, relative, cap);
  if (!resolved.ok) return { ok: false, failure: resolved.failure, message: resolved.message };
  return { ok: true, resolved: resolved.file };
}

/**
 * Phase 2 of ODR-PAP-008: open each planned input once in ascending path order
 * and feed both the per-file hash and the set hash from the same descriptor.
 * The returned set digest is null unless every planned input succeeded.
 */
export async function hashPlannedInputs(
  plans: PlannedInput[],
): Promise<{ outcomes: PlannedInputOutcome[]; setDigest: string | null }> {
  const sorted = [...plans].sort((a, b) =>
    a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0,
  );
  const setHasher = createDomainHasher("pap.input.set.v1");
  const outcomes: PlannedInputOutcome[] = [];
  let complete = true;
  for (const plan of sorted) {
    const opened = await openResolvedPackageFile(plan.resolved, plan.relative, plan.cap);
    if (!opened.ok) {
      complete = false;
      outcomes.push({ index: plan.index, outcome: opened });
      continue;
    }
    try {
      const outcome = await hashOpenedInput(opened.file, plan.normalization, plan.cap, setHasher);
      outcomes.push({ index: plan.index, outcome });
      if (!outcome.ok) complete = false;
    } finally {
      await closePackageFile(opened.file.handle);
    }
  }
  return { outcomes, setDigest: complete ? setHasher.digest() : null };
}

/** Hash a single input file under `pap.input.file.v1` with streamed framing. */
export async function hashInput(
  root: PackageRoot,
  relative: string,
  normalization: "lf" | "none",
  cap: number,
): Promise<InputHash | StreamFailure> {
  const opened = await openPackageFile(root, relative, cap);
  if (!opened.ok) return opened;
  try {
    return await hashOpenedInput(opened.file, normalization, cap);
  } finally {
    await closePackageFile(opened.file.handle);
  }
}

async function hashOpenedInput(
  file: OpenPackageFile,
  normalization: "lf" | "none",
  cap: number,
  setHasher?: DomainHasher,
): Promise<InputHash | StreamFailure> {
  const analysis = await analyzeOpenInput(file, normalization, cap);
  if (!analysis.ok) return analysis;
  const hasher = createDomainHasher("pap.input.file.v1");
  const prefix = framePrefix("input", [file.relative], analysis.normalizedSize);
  hasher.update(prefix);
  if (setHasher !== undefined) setHasher.update(prefix);
  const hashers = setHasher === undefined ? [hasher] : [hasher, setHasher];
  const streamed = await hashOpenInputBytes(file, analysis.mode, cap, hashers);
  if (!streamed.ok) return streamed;
  return {
    ok: true,
    mode: analysis.mode,
    rawSize: analysis.rawSize,
    normalizedSize: analysis.normalizedSize,
    digest: hasher.digest(),
  };
}

async function analyzeOpenInput(
  file: OpenPackageFile,
  normalization: "lf" | "none",
  cap: number,
): Promise<InputAnalysis | StreamFailure> {
  if (normalization === "none") {
    const streamed = await readPackageFileChunks(file.handle, file.relative, 0, cap, () => {});
    if (!streamed.ok) return streamed;
    return { ok: true, mode: "raw", rawSize: streamed.size, normalizedSize: streamed.size };
  }

  let invalid = false;
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

  const streamed = await readPackageFileChunks(file.handle, file.relative, 0, cap, (chunk) => {
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

async function hashOpenInputBytes(
  file: OpenPackageFile,
  mode: InputMode,
  cap: number,
  hashers: DomainHasher[],
): Promise<{ ok: true } | StreamFailure> {
  const updateAll = (bytes: Uint8Array): void => {
    for (const hasher of hashers) hasher.update(bytes);
  };
  if (mode === "raw") {
    const streamed = await readPackageFileChunks(file.handle, file.relative, 0, cap, updateAll);
    return streamed.ok ? { ok: true } : streamed;
  }

  let pendingCr = false;
  let decodeFailure = false;
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
    if (out.length > 0) updateAll(encoder.encode(out));
  };
  const streamed = await readPackageFileChunks(file.handle, file.relative, 0, cap, (chunk) => {
    if (decodeFailure) return;
    try {
      emit(decoder.decode(chunk, { stream: true }));
    } catch {
      decodeFailure = true;
    }
  });
  if (!streamed.ok) return streamed;
  if (decodeFailure) {
    return {
      ok: false,
      failure: "io",
      message: `cannot decode normalized input: ${file.relative}`,
    };
  }
  try {
    emit(decoder.decode());
  } catch {
    return {
      ok: false,
      failure: "io",
      message: `cannot decode normalized input: ${file.relative}`,
    };
  }
  return { ok: true };
}
