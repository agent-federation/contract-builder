import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onTempCleanup, tempDir } from "./temp.js";

export const root = fileURLToPath(new URL("..", import.meta.url));
export const fixtures = path.join(root, "fixtures", "pap-v0.1");
export const cli = path.join(root, "src", "cli.ts");
export const fsProbe = path.join(root, "tests", "support", "fs-probe.ts");
export const BASE_IDENTITY =
  "sha256:77a8d1d0882428efdfa5bfc38faa1ff7ba772aff9373b9e6135a8bb744119020";

export interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

let sentinel: { dir: string; log: string } | undefined;

// The sentinel directory lives under the per-file temp root, so drop the cache
// when that root is removed; the next `runPap` call creates a fresh sentinel.
onTempCleanup(() => {
  sentinel = undefined;
});

function sentinelEnv(): { dir: string; log: string } {
  if (sentinel !== undefined) return sentinel;
  const dir = tempDir("sentinel-");
  const log = path.join(dir, "executed.log");
  writeFileSync(
    path.join(dir, "contract-builder"),
    `#!/bin/sh\necho contract-builder >> "${log}"\nexit 99\n`,
    { mode: 0o755 },
  );
  writeFileSync(path.join(dir, "node"), `#!/bin/sh\necho node >> "${log}"\nexit 99\n`, {
    mode: 0o755,
  });
  writeFileSync(path.join(dir, "bun"), `#!/bin/sh\necho bun >> "${log}"\nexit 99\n`, {
    mode: 0o755,
  });
  sentinel = { dir, log };
  return sentinel;
}

export interface ProbeOptions {
  target: string;
  log: string;
  action: "none" | "replace" | "mutate" | "fail-read" | "short-read" | "grow";
}

export function runPap(argv: string[], cwd: string, probe?: ProbeOptions): RunResult {
  const env = sentinelEnv();
  const args = probe === undefined ? [cli, ...argv] : ["--preload", fsProbe, cli, ...argv];
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: {
      PATH: `${env.dir}:/usr/bin:/bin`,
      HOME: env.dir,
      TMPDIR: tmpdir(),
      TZ: "Pacific/Kiritimati",
      LC_ALL: "tr_TR.UTF-8",
      LANG: "tr_TR.UTF-8",
      NO_COLOR: "1",
      SENTINEL_LOG: env.log,
      ...(probe === undefined
        ? {}
        : {
            PAP_FS_PROBE_TARGET: probe.target,
            PAP_FS_PROBE_LOG: probe.log,
            PAP_FS_PROBE_ACTION: probe.action,
          }),
    },
    timeout: 60_000,
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function sentinelLog(): string {
  const env = sentinelEnv();
  try {
    return readFileSync(env.log, "utf8");
  } catch {
    return "";
  }
}
