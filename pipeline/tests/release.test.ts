/**
 * Unit tests for the D1 release gate (`pipeline/release.ts`).
 *
 * The important negative case is the one D1 warns about: profile versions and
 * project revisions are independent domains, so a project revision that differs
 * from the engine and profile versions must still pass. Equality is tested only
 * within the engine domain (the release tag against `package.json`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO_ROOT,
  UsageError,
  checkReleaseTag,
  inspectVersionDomains,
  parseReleaseArgs,
  type VersionDomainReport,
} from "../release.js";

interface FixtureOptions {
  /** Undefined omits package.json `version`; null omits package.json. */
  readonly engine?: string | null;
  /** A null value omits that profile's `version`. */
  readonly profiles?: Readonly<Record<string, string | null>>;
  /** A null value omits that project's `project.revision`. */
  readonly contracts?: Readonly<Record<string, string | null>>;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function withFixture(
  options: FixtureOptions,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "release-check-"));
  try {
    if (options.engine !== null) {
      await writeJson(
        path.join(root, "package.json"),
        options.engine === undefined ? {} : { version: options.engine },
      );
    }
    for (const [id, version] of Object.entries(options.profiles ?? {})) {
      await writeJson(
        path.join(root, "profiles", id, "profile.json"),
        version === null ? {} : { version },
      );
    }
    for (const [id, revision] of Object.entries(options.contracts ?? {})) {
      await writeJson(
        path.join(root, "contracts", id, "contract-builder.json"),
        revision === null ? { project: {} } : { project: { revision } },
      );
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function hasProblem(report: VersionDomainReport, fragment: string): boolean {
  return report.problems.some((problem) => problem.includes(fragment));
}

test("version domains: the current repository declares all three domains", async () => {
  const report = await inspectVersionDomains(REPO_ROOT);
  assert.deepEqual(report.problems, []);
  const kinds = report.domains.map((domain) => domain.kind);
  assert.ok(kinds.includes("engine"));
  assert.ok(kinds.includes("profile"));
  assert.ok(kinds.includes("project"));

  const packageJson = JSON.parse(
    await readFile(path.join(REPO_ROOT, "package.json"), "utf8"),
  ) as { version: string };
  assert.equal(report.domains.find((domain) => domain.kind === "engine")?.version, packageJson.version);
});

test("version domains: different engine/profile/project versions pass (no equality rule)", async () => {
  await withFixture(
    {
      engine: "9.9.9",
      profiles: { core001: "0.1.0" },
      contracts: { core001: "0.3.3" },
    },
    async (root) => {
      const report = await inspectVersionDomains(root);
      assert.deepEqual(report.problems, []);
      assert.equal(report.domains.find((domain) => domain.kind === "engine")?.version, "9.9.9");
      assert.equal(report.domains.find((domain) => domain.kind === "profile")?.version, "0.1.0");
      assert.equal(report.domains.find((domain) => domain.kind === "project")?.version, "0.3.3");
    },
  );
});

test("version domains: the canonical CORE-001 0.3.3 / 0.1.0 pair passes", async () => {
  await withFixture(
    {
      engine: "0.1.0",
      profiles: { core001: "0.1.0" },
      contracts: { core001: "0.3.3" },
    },
    async (root) => {
      assert.deepEqual((await inspectVersionDomains(root)).problems, []);
    },
  );
});

test("version domains: a missing engine version fails", async () => {
  await withFixture(
    { profiles: { core001: "0.1.0" }, contracts: { core001: "0.3.3" } },
    async (root) => {
      const report = await inspectVersionDomains(root);
      assert.ok(hasProblem(report, "package.json: version is missing"));
    },
  );
});

test("version domains: a malformed engine version fails", async () => {
  await withFixture(
    { engine: "0.1", profiles: { core001: "0.1.0" }, contracts: { core001: "0.3.3" } },
    async (root) => {
      const report = await inspectVersionDomains(root);
      assert.ok(hasProblem(report, "package.json: version"));
      assert.ok(hasProblem(report, "not semver-shaped"));
    },
  );
});

test("version domains: a missing profile version fails", async () => {
  await withFixture(
    { engine: "0.1.0", profiles: { core001: null }, contracts: { core001: "0.3.3" } },
    async (root) => {
      const report = await inspectVersionDomains(root);
      assert.ok(hasProblem(report, "profiles/core001/profile.json: version is missing"));
    },
  );
});

test("version domains: a malformed profile version fails", async () => {
  await withFixture(
    { engine: "0.1.0", profiles: { core001: "v0.1.0" }, contracts: { core001: "0.3.3" } },
    async (root) => {
      const report = await inspectVersionDomains(root);
      assert.ok(hasProblem(report, "profiles/core001/profile.json: version"));
      assert.ok(hasProblem(report, "not semver-shaped"));
    },
  );
});

test("version domains: a missing project revision fails", async () => {
  await withFixture(
    { engine: "0.1.0", profiles: { core001: "0.1.0" }, contracts: { core001: null } },
    async (root) => {
      const report = await inspectVersionDomains(root);
      assert.ok(
        hasProblem(report, "contracts/core001/contract-builder.json: project.revision is missing"),
      );
    },
  );
});

test("version domains: a malformed project revision fails", async () => {
  await withFixture(
    { engine: "0.1.0", profiles: { core001: "0.1.0" }, contracts: { core001: "0.3.3.4" } },
    async (root) => {
      const report = await inspectVersionDomains(root);
      assert.ok(hasProblem(report, "contracts/core001/contract-builder.json: project.revision"));
      assert.ok(hasProblem(report, "not semver-shaped"));
    },
  );
});

test("version domains: absent profile and contract declarations fail closed", async () => {
  await withFixture({ engine: "0.1.0" }, async (root) => {
    const report = await inspectVersionDomains(root);
    assert.ok(hasProblem(report, "no profiles/*/profile.json"));
    assert.ok(hasProblem(report, "no contracts/*/contract-builder.json"));
  });
});

test("tag: a matching tag passes", () => {
  assert.deepEqual(checkReleaseTag("v0.1.0", "0.1.0"), {
    ok: true,
    version: "0.1.0",
    message: "release tag v0.1.0 matches package.json version 0.1.0",
  });
});

test("tag: a prerelease tag matches the same prerelease package version", () => {
  assert.equal(checkReleaseTag("v1.2.3-rc.1", "1.2.3-rc.1").ok, true);
});

test("tag: a mismatching tag fails and names both versions", () => {
  const result = checkReleaseTag("v0.2.0", "0.1.0");
  assert.equal(result.ok, false);
  assert.match(result.message, /v0\.2\.0/);
  assert.match(result.message, /0\.1\.0/);
});

test("tag: malformed tags fail", () => {
  for (const tag of ["0.1.0", "v0.1", "v0.1.0.0", "v0.1.x", "v", "release-0.1.0"]) {
    const result = checkReleaseTag(tag, "0.1.0");
    assert.equal(result.ok, false, `tag ${JSON.stringify(tag)} must not pass`);
    assert.equal(result.version, null);
  }
});

test("usage: a missing --tag is a usage error", () => {
  assert.throws(() => parseReleaseArgs([]), UsageError);
  assert.throws(() => parseReleaseArgs(["--verbose"]), UsageError);
  assert.throws(() => parseReleaseArgs(["--tag"]), UsageError);
});

test("usage: --help does not require a tag, --tag=value is accepted", () => {
  assert.equal(parseReleaseArgs(["--help"]).help, true);
  assert.deepEqual(parseReleaseArgs(["--tag=v0.1.0"]), { help: false, tag: "v0.1.0" });
});

test("cli: release:check passes for v<package version> on the repository", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(REPO_ROOT, "package.json"), "utf8"),
  ) as { version: string };
  const run = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "pipeline", "release.ts"), "--tag", `v${packageJson.version}`],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /matches package\.json version/);
});

test("cli: a mismatching tag exits non-zero", () => {
  const run = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "pipeline", "release.ts"), "--tag", "v999.0.0"],
    { cwd: REPO_ROOT, encoding: "utf8" },
  );
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /does not match package\.json version/);
});

test("cli: a missing tag is a usage error, not a silent pass", () => {
  const run = spawnSync(process.execPath, [path.join(REPO_ROOT, "pipeline", "release.ts")], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /--tag/);
});
