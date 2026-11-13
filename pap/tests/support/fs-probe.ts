/**
 * Test-only filesystem probe, loaded with `bun --preload` in a child process.
 *
 * It records `open`/`read`/`close`/`lstat`/`realpath` operations for one
 * declared input path and can deterministically replace or mutate that path
 * after the verifier has opened it. Subprocess isolation keeps the module mock
 * out of the main `bun test` process.
 *
 * Environment:
 *   PAP_FS_PROBE_TARGET  absolute path of the declared input to watch
 *   PAP_FS_PROBE_LOG     newline-delimited JSON log written synchronously
 *   PAP_FS_PROBE_ACTION  none | replace | mutate | fail-read | short-read | grow
 */

import { appendFileSync, renameSync, writeFileSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { mock } from "bun:test";

// Capture the real bindings before `mock.module` replaces the namespace.
const actual = { ...fsPromises };

const target = process.env.PAP_FS_PROBE_TARGET;
const logPath = process.env.PAP_FS_PROBE_LOG;
const action = process.env.PAP_FS_PROBE_ACTION ?? "none";

function record(entry: Record<string, unknown>): void {
  if (logPath !== undefined) {
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  }
}

function isTarget(candidate: unknown): boolean {
  return target !== undefined && String(candidate) === target;
}

let opens = 0;
let reads = 0;
let sawEof = false;

function replacePath(): void {
  if (target === undefined) return;
  const moved = `${target}.opened`;
  renameSync(target, moved);
  writeFileSync(target, "probe replacement\ntrailing\n");
}

function mutatePath(): void {
  if (target === undefined) return;
  // A constant replacement avoids a check-then-write race in the probe itself;
  // any change of bytes is enough to demonstrate the limited guarantee.
  writeFileSync(target, "mutated by probe\n");
}

function growPath(): void {
  if (target === undefined) return;
  appendFileSync(target, Buffer.alloc(1_000, 0x67));
}

mock.module("node:fs/promises", () => ({
  ...actual,
  async lstat(candidate: Parameters<typeof actual.lstat>[0], ...rest: unknown[]) {
    if (isTarget(candidate)) record({ op: "lstat", path: String(candidate) });
    return (actual.lstat as (...args: unknown[]) => Promise<unknown>)(candidate, ...rest);
  },
  async realpath(candidate: Parameters<typeof actual.realpath>[0], ...rest: unknown[]) {
    if (isTarget(candidate)) record({ op: "realpath", path: String(candidate) });
    return (actual.realpath as (...args: unknown[]) => Promise<unknown>)(candidate, ...rest);
  },
  async open(candidate: Parameters<typeof actual.open>[0], ...rest: unknown[]) {
    const path = String(candidate);
    const handle = await (actual.open as (...args: unknown[]) => Promise<any>)(candidate, ...rest);
    record({ op: "open", path });
    if (!isTarget(path)) return handle;
    opens += 1;
    record({ op: "target-open", path, n: opens });
    if (action === "replace" && opens === 1) replacePath();
    if (action === "grow" && opens === 1) growPath();

    const actualRead = handle.read.bind(handle);
    handle.read = async (
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number | null,
    ) => {
      reads += 1;
      record({ op: "read", path, n: reads, position });
      if (action === "fail-read" && sawEof) {
        throw Object.assign(new Error("probe read failure"), { code: "EIO" });
      }
      const wanted = action === "short-read" && sawEof ? Math.min(length, 7) : length;
      const result = await actualRead(buffer, offset, wanted, position);
      record({ op: "read-done", path, n: reads, bytesRead: result.bytesRead });
      if (result.bytesRead === 0) {
        if (!sawEof && action === "mutate") mutatePath();
        sawEof = true;
      }
      return result;
    };

    const actualClose = handle.close.bind(handle);
    handle.close = async () => {
      record({ op: "close", path });
      return actualClose();
    };
    return handle;
  },
}));
