/**
 * Coverage policy for the in-process measured areas.
 *
 * The full test suite writes an lcov report (`bun test --coverage
 * --coverage-reporter=lcov`), but a global percentage would be misleading:
 * the PAP tests exercise the verifier by spawning its CLI, so `pap/` execution
 * is not measurable in-process. The policy therefore applies only to the areas
 * whose code runs inside the test process:
 *
 *   spec/      — the engine and declared-input builder
 *   profiles/  — the executable profile code
 *   pipeline/  — the producer, gate and release tooling
 *
 * `pap/` is deliberately excluded. The thresholds are the measured floor minus
 * a small margin (see `CONTRIBUTING.md` for the baseline and the rationale).
 *
 * Usage: `bun scripts/check-coverage.ts [--lcov <path>] [--root <repository-root>]`.
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

type Threshold = {
  /** Directory prefix, relative to the repository root. */
  area: string;
  /** Minimum line-coverage percentage. */
  minimum: number;
};

const THRESHOLDS: readonly Threshold[] = [
  { area: "spec/", minimum: 80 },
  { area: "profiles/", minimum: 87 },
  { area: "pipeline/", minimum: 72 },
];

type Totals = {
  found: number;
  hit: number;
  files: number;
};

type Reading = {
  path: string;
  line: number;
  count: number;
};

function usage(): never {
  console.error("usage: bun scripts/check-coverage.ts [--lcov <path>] [--root <repository-root>]");
  process.exit(2);
}

function isInside(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
  );
}

/** Parse lcov `SF:`/`DA:` records, keeping only files inside the repository root. */
function readCoverage(root: string, lcovPath: string): Map<string, Reading[]> {
  const readings = new Map<string, Reading[]>();
  let current: string | null = null;

  for (const line of readFileSync(lcovPath, "utf8").split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      const source = line.slice(3).trim();
      const absolute = isAbsolute(source) ? resolve(source) : resolve(root, source);
      // Bun also records instrumented files from temporary CORE-000 workspaces;
      // those paths are outside the repository and must not count towards a
      // repository coverage floor.
      current = isInside(root, absolute) && existsSync(absolute) ? absolute : null;
      if (current !== null && !readings.has(current)) {
        readings.set(current, []);
      }
      continue;
    }
    if (line.startsWith("DA:") && current !== null) {
      const [lineNumber, count] = line.slice(3).split(",");
      const executed = Number(count);
      if (lineNumber !== undefined && Number.isFinite(executed)) {
        readings.get(current)?.push({
          path: current,
          line: Number(lineNumber),
          count: executed,
        });
      }
    }
  }

  return readings;
}

function main(): void {
  const args = process.argv.slice(2);
  let root = process.cwd();
  let lcovPath = "coverage/lcov.info";

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") {
      const value = args[i + 1];
      if (value === undefined) {
        usage();
      }
      root = resolve(value);
      i += 1;
    } else if (arg === "--lcov") {
      const value = args[i + 1];
      if (value === undefined) {
        usage();
      }
      lcovPath = value;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "usage: bun scripts/check-coverage.ts [--lcov <path>] [--root <repository-root>]",
      );
      return;
    } else {
      console.error(`unknown argument: ${arg}`);
      usage();
    }
  }

  root = resolve(root);
  const absoluteLcov = isAbsolute(lcovPath) ? lcovPath : resolve(root, lcovPath);
  if (!existsSync(absoluteLcov)) {
    console.error(
      `coverage report not found: ${relative(root, absoluteLcov) || absoluteLcov}\n` +
        "run `bun test --coverage --coverage-reporter=lcov` first",
    );
    process.exit(2);
  }

  const readings = readCoverage(root, absoluteLcov);
  const totals = new Map<string, Totals>(
    THRESHOLDS.map((threshold) => [threshold.area, { found: 0, hit: 0, files: 0 }]),
  );

  for (const [file, lines] of readings) {
    const filePath = relative(root, file).split(sep).join("/");
    const threshold = THRESHOLDS.find((candidate) => filePath.startsWith(candidate.area));
    if (!threshold) {
      continue;
    }
    const area = totals.get(threshold.area);
    if (!area) {
      continue;
    }
    area.files += 1;
    for (const reading of lines) {
      area.found += 1;
      if (reading.count > 0) {
        area.hit += 1;
      }
    }
  }

  let failed = false;
  console.log(
    "coverage policy: in-process areas only (`pap/` is excluded; its tests spawn the CLI)",
  );
  for (const threshold of THRESHOLDS) {
    const area = totals.get(threshold.area) ?? { found: 0, hit: 0, files: 0 };
    const percentage = area.found === 0 ? 0 : (area.hit / area.found) * 100;
    const passed = area.found > 0 && area.hit * 100 >= threshold.minimum * area.found;
    failed ||= !passed;
    const status = area.found === 0 ? "NO DATA" : passed ? "ok" : "FAIL";
    console.log(
      `  ${threshold.area.padEnd(10)} ${percentage.toFixed(2).padStart(6)}% ` +
        `(${area.hit}/${area.found} lines, ${area.files} files) ` +
        `>= ${threshold.minimum}%  ${status}`,
    );
  }

  if (failed) {
    console.error(
      "\ncoverage policy failed: at least one in-process area is below its floor. " +
        "Add tests or update the documented policy in the same pull request.",
    );
    process.exit(1);
  }
  console.log("\ncoverage policy passed.");
}

main();
