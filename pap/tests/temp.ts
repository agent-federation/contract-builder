import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * One test-owned temporary root. The root is created lazily on the first
 * `tempDir` call and removed by `cleanupTempDirs`, which each test file
 * registers with the runner as a suite-level `after` hook:
 *
 *     import { after, test } from "node:test";
 *     import { cleanupTempDirs, tempDir } from "./temp.js";
 *     after(cleanupTempDirs);
 *
 * The hook runs even when a test fails or throws, so a failing suite still
 * leaves no `pap-test-root-*` directory behind. Tests must not remove the root
 * themselves; when a test needs to stop using a directory early it can call
 * `cleanupTempDirs` explicitly and the next `tempDir` call starts a fresh root.
 */
let root: string | undefined;
const cleanupListeners = new Set<() => void>();

/**
 * Register state that must be reset together with the temp root. `support.ts`
 * uses it to drop its cached sentinel directory, which lives under the root.
 */
export function onTempCleanup(listener: () => void): void {
  cleanupListeners.add(listener);
}

/** Create a unique directory below the shared test-owned temporary root. */
export function tempDir(prefix: string): string {
  if (root === undefined) {
    root = mkdtempSync(path.join(tmpdir(), "pap-test-root-"));
  }
  return mkdtempSync(path.join(root, prefix));
}

/** Remove the whole test-owned temporary root, including every child directory. */
export function cleanupTempDirs(): void {
  const current = root;
  root = undefined;
  try {
    for (const listener of cleanupListeners) {
      try {
        listener();
      } catch {
        // A listener only drops cached state; one failure must not keep the
        // root (and its directories) on disk or skip the next listener.
      }
    }
  } finally {
    if (current !== undefined) {
      rmSync(current, { recursive: true, force: true, maxRetries: 3 });
    }
  }
}
