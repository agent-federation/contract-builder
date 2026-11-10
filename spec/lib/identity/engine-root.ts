/**
 * Engine-root validation, version correspondence and lockfile parsing.
 *
 * See `docs/decisions/ODR-ENG-001-engine-identity-boundary.md` (B2).
 */

import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagnostics } from "../diagnostics.js";
import { isNonEmptyString, isObject } from "../guards.js";
import { LocalizedTextError, cliLocalized, localizedDetail } from "../messages.js";
import type { Lockfile, LockfilePackage } from "./types.js";

/**
 * Default engine root: the checkout that contains the running engine's `spec/` and
 * `package.json`. See `docs/decisions/ODR-ENG-001-engine-identity-boundary.md` (B2).
 */
export function defaultEngineRoot(): string {
  return fileURLToPath(new URL("../../../", import.meta.url));
}

/** A validated engine root and the version its own `package.json` declares. */
export interface EngineRoot {
  /** Canonical (realpath) engine root. */
  root: string;
  version: string;
}

/**
 * Validates an explicit engine root and reads its version. A root must be an absolute
 * directory that contains `spec/lib` and `package.json`; the version is the one reported in
 * `BuildIdentity`, never the running process's own version.
 */
export async function loadEngineRoot(
  requested: string | undefined,
  diagnostics: Diagnostics,
): Promise<EngineRoot | null> {
  const candidate = requested ?? defaultEngineRoot();
  if (!path.isAbsolute(candidate)) {
    diagnostics.error("core.path.outside-root#engine-root-absolute", "package.json", "", {
      candidate,
    });
    return null;
  }

  let root: string;
  try {
    root = await realpath(candidate);
  } catch (error) {
    diagnostics.error("core.path.outside-root#engine-root-unavailable", "package.json", "", {
      candidate,
      error: localizedDetail(error),
    });
    return null;
  }

  const libOk = await stat(path.join(root, "spec", "lib"))
    .then((entry) => entry.isDirectory())
    .catch(() => false);
  const packageOk = await stat(path.join(root, "package.json"))
    .then((entry) => entry.isFile())
    .catch(() => false);
  if (!libOk || !packageOk) {
    diagnostics.error("core.path.outside-root#engine-root-layout", "package.json", "", {
      root,
    });
    return null;
  }

  let version: string;
  try {
    version = await readEngineVersion(root);
  } catch (error) {
    diagnostics.error(
      "core.engine.version-mismatch#engine-root-version-failed",
      "package.json",
      "/version",
      { root, error: localizedDetail(error) },
    );
    return null;
  }
  return { root, version };
}

/**
 * Version correspondence: the modules loaded from the engine root must be the same engine
 * release the running process belongs to. Otherwise an identity would be reported for code
 * the running engine cannot vouch for, so the build fails closed.
 */
export async function verifyEngineVersion(
  engine: EngineRoot,
  diagnostics: Diagnostics,
): Promise<boolean> {
  let running: string;
  try {
    running = await readEngineVersion();
  } catch (error) {
    diagnostics.error("ERR_IO#running-engine-version-failed", "package.json", "/version", {
      error: localizedDetail(error),
    });
    return false;
  }

  if (running !== engine.version) {
    diagnostics.error(
      "core.engine.version-mismatch#engine-version-mismatch",
      "package.json",
      "/version",
      { root: engine.root, version: engine.version, running: running },
    );
    return false;
  }
  return true;
}

/** Reads the engine version declared by `engineRoot/package.json` (default: running engine). */
export async function readEngineVersion(engineRoot: string = defaultEngineRoot()): Promise<string> {
  const text = await readFile(path.join(engineRoot, "package.json"), "utf8");
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed) || !isNonEmptyString(parsed.version)) {
    throw new LocalizedTextError(cliLocalized("engine.version-missing"));
  }
  return parsed.version;
}

/** Reads the engine lockfile (default: running engine). */
export async function readLockfile(engineRoot: string = defaultEngineRoot()): Promise<Lockfile> {
  const text = await readFile(path.join(engineRoot, "bun.lock"), "utf8");
  return parseLockfile(text);
}

/**
 * Parses `bun.lock` without depending on a JSONC package. Comments and trailing commas are
 * removed outside strings, then the result is parsed as JSON.
 */
export function parseLockfile(text: string): Lockfile {
  const raw: unknown = JSON.parse(stripJsonc(text));
  if (!isObject(raw) || !isObject(raw.packages)) {
    throw new LocalizedTextError(cliLocalized("engine.lockfile-no-packages"));
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

/**
 * JSONC-only comment and trailing-comma removal. JSON strings are double-quoted, so this does
 * not need the string/template/regex handling the TypeScript import scanner uses.
 */
function stripJsonc(text: string): string {
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
    if (char === '"') {
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
    if (char === ",") {
      let next = index + 1;
      while (next < text.length && /\s/.test(text[next]!)) next += 1;
      const following = text[next];
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

function splitResolved(resolved: string): { name: string; version: string } | null {
  const at = resolved.lastIndexOf("@");
  if (at <= 0) return null;
  const version = resolved.slice(at + 1);
  if (version.length === 0) return null;
  return { name: resolved.slice(0, at), version };
}
