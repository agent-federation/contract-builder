/**
 * `bun run release:check --tag vX.Y.Z`
 *
 * The release gate for the engine version and the three independent version
 * domains (decision D1, `docs/architecture/delivery-governance.md`):
 *
 * - engine: `package.json` `version`;
 * - profile: each `profiles/*\/profile.json` `version`;
 * - project: each `contracts/*\/contract-builder.json` `project.revision`.
 *
 * The domains are independent and are never compared with each other. This
 * check only requires every value to be present and semver-shaped: the
 * canonical CORE-001 example carries `project.revision` 0.3.3 with
 * `profile.version` 0.1.0, so a cross-domain equality rule would reject a
 * valid release.
 *
 * The release tag is the tag-side source of the engine version: it must be
 * semver-shaped with a leading `v` and equal `package.json` `version`.
 * `check:all` and the identity tests already cover the other engine-version
 * source pair (`package.json` <-> generated artifacts/provenance); this gate
 * adds only the tag. Until tags exist, the repository is in its declared
 * "MVP without public releases" state.
 *
 * Exit codes: 0 pass, 1 version-domain or tag failure, 2 usage error.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

const USAGE = `Usage: bun run release:check --tag vX.Y.Z

Validates the three independent version domains (engine, profile and project)
for presence and semver shape - they are never compared with each other - then
requires the release tag to equal the engine version in package.json.

Exit codes: 0 pass, 1 version-domain or tag failure, 2 usage error.`;

/**
 * SemVer 2.0.0 (https://semver.org), without the `v` prefix. The same shape is
 * required of the bare `version`/`revision` fields and of the tag after its
 * leading `v` is stripped.
 */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

export type VersionDomainKind = "engine" | "profile" | "project";

export interface VersionDomain {
  readonly kind: VersionDomainKind;
  /** Repository-relative file the value is declared in. */
  readonly source: string;
  /** Field path inside `source`. */
  readonly field: string;
  readonly version: string;
}

export interface VersionDomainReport {
  readonly domains: readonly VersionDomain[];
  /** Human-readable failures; empty when every domain is present and shaped. */
  readonly problems: readonly string[];
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonObject(file: string): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new Error(`cannot read file: ${messageOf(error)}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`is not valid JSON: ${messageOf(error)}`);
  }
  if (!isObject(value)) throw new Error("is not a JSON object");
  return value;
}

/** Profile and contract directories, sorted so the report is deterministic. */
async function subdirectories(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function requireVersion(
  source: string,
  field: string,
  value: unknown,
  problems: string[],
): string | null {
  if (typeof value !== "string" || value.length === 0) {
    problems.push(`${source}: ${field} is missing or is not a non-empty string`);
    return null;
  }
  if (!SEMVER.test(value)) {
    problems.push(
      `${source}: ${field} ${JSON.stringify(value)} is not semver-shaped (expected X.Y.Z)`,
    );
    return null;
  }
  return value;
}

async function inspectEngine(root: string, report: VersionDomain[], problems: string[]): Promise<void> {
  const source = "package.json";
  try {
    const parsed = await readJsonObject(path.join(root, source));
    const version = requireVersion(source, "version", parsed.version, problems);
    if (version !== null) report.push({ kind: "engine", source, field: "version", version });
  } catch (error) {
    problems.push(`${source}: ${messageOf(error)}`);
  }
}

async function inspectProfiles(root: string, report: VersionDomain[], problems: string[]): Promise<void> {
  let profiles: string[];
  try {
    profiles = await subdirectories(path.join(root, "profiles"));
  } catch (error) {
    problems.push(`profiles/: cannot list profiles: ${messageOf(error)}`);
    return;
  }
  if (profiles.length === 0) {
    problems.push("profiles/: no profiles/*/profile.json declarations found");
    return;
  }
  for (const name of profiles) {
    const source = `profiles/${name}/profile.json`;
    try {
      const parsed = await readJsonObject(path.join(root, source));
      const version = requireVersion(source, "version", parsed.version, problems);
      if (version !== null) report.push({ kind: "profile", source, field: "version", version });
    } catch (error) {
      problems.push(`${source}: ${messageOf(error)}`);
    }
  }
}

async function inspectProjects(root: string, report: VersionDomain[], problems: string[]): Promise<void> {
  let contracts: string[];
  try {
    contracts = await subdirectories(path.join(root, "contracts"));
  } catch (error) {
    problems.push(`contracts/: cannot list contracts: ${messageOf(error)}`);
    return;
  }
  if (contracts.length === 0) {
    problems.push("contracts/: no contracts/*/contract-builder.json declarations found");
    return;
  }
  for (const name of contracts) {
    const source = `contracts/${name}/contract-builder.json`;
    try {
      const parsed = await readJsonObject(path.join(root, source));
      const project = parsed.project;
      if (!isObject(project)) {
        problems.push(`${source}: project is missing or is not a JSON object`);
        continue;
      }
      const revision = requireVersion(source, "project.revision", project.revision, problems);
      if (revision !== null) {
        report.push({ kind: "project", source, field: "project.revision", version: revision });
      }
    } catch (error) {
      problems.push(`${source}: ${messageOf(error)}`);
    }
  }
}

/**
 * Reads the three version domains under `root` and checks each value for
 * presence and semver shape. It deliberately performs no comparison between
 * domains: equal or different values both pass.
 */
export async function inspectVersionDomains(root: string = REPO_ROOT): Promise<VersionDomainReport> {
  const domains: VersionDomain[] = [];
  const problems: string[] = [];
  await inspectEngine(root, domains, problems);
  await inspectProfiles(root, domains, problems);
  await inspectProjects(root, domains, problems);
  return { domains, problems };
}

export interface TagCheck {
  readonly ok: boolean;
  /** The tag with its leading `v` stripped, or null when it is not semver-shaped. */
  readonly version: string | null;
  readonly message: string;
}

/**
 * Requires `tag` to be `v` plus a semver-shaped value and to equal the engine
 * `package.json` version exactly.
 */
export function checkReleaseTag(tag: string, engineVersion: string): TagCheck {
  const expected = `v${engineVersion}`;
  if (!tag.startsWith("v")) {
    return {
      ok: false,
      version: null,
      message: `release tag ${JSON.stringify(tag)} must start with "v" (expected ${expected})`,
    };
  }
  const version = tag.slice(1);
  if (!SEMVER.test(version)) {
    return {
      ok: false,
      version: null,
      message: `release tag ${JSON.stringify(tag)} is not semver-shaped; expected ${expected}`,
    };
  }
  if (version !== engineVersion) {
    return {
      ok: false,
      version,
      message: `release tag ${tag} does not match package.json version ${engineVersion}`,
    };
  }
  return { ok: true, version, message: `release tag ${tag} matches package.json version ${engineVersion}` };
}

export interface ReleaseArgs {
  /** Undefined only with `--help`. */
  readonly tag?: string;
  readonly help: boolean;
}

/** Parses the CLI. A missing `--tag` is a usage error, never a silent pass. */
export function parseReleaseArgs(argv: readonly string[]): ReleaseArgs {
  let tag: string | undefined;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--tag") {
      if (tag !== undefined) throw new UsageError("--tag may be given only once");
      const value = argv[index + 1];
      if (value === undefined || value.length === 0) {
        throw new UsageError("--tag requires a version tag such as vX.Y.Z");
      }
      tag = value;
      index += 1;
      continue;
    }
    if (arg.startsWith("--tag=")) {
      if (tag !== undefined) throw new UsageError("--tag may be given only once");
      const value = arg.slice("--tag=".length);
      if (value.length === 0) throw new UsageError("--tag requires a version tag such as vX.Y.Z");
      tag = value;
      continue;
    }
    throw new UsageError(`unknown argument: ${arg}`);
  }
  if (help) return tag === undefined ? { help: true } : { help: true, tag };
  if (tag === undefined) throw new UsageError("missing required --tag vX.Y.Z");
  return { help: false, tag };
}

async function main(): Promise<void> {
  let args: ReleaseArgs;
  try {
    args = parseReleaseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`release:check: ${error.message}`);
      console.error(USAGE);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const report = await inspectVersionDomains();
  if (report.problems.length > 0) {
    for (const problem of report.problems) console.error(`release:check: ${problem}`);
    console.error(
      "release:check: every version domain must be present and semver-shaped; " +
        "the domains are independent and are never compared with each other",
    );
    process.exitCode = 1;
    return;
  }
  for (const domain of report.domains) {
    console.log(`version domain (${domain.kind}): ${domain.source} ${domain.field} = ${domain.version}`);
  }

  const engine = report.domains.find((domain) => domain.kind === "engine");
  if (engine === undefined) {
    console.error("release:check: package.json version was not resolved");
    process.exitCode = 1;
    return;
  }
  const tag = args.tag;
  if (tag === undefined) {
    console.error("release:check: missing required --tag vX.Y.Z");
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const check = checkReleaseTag(tag, engine.version);
  if (!check.ok) {
    console.error(`release:check: ${check.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`release:check: ${check.message}`);
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(`release:check: ${messageOf(error)}`);
    process.exitCode = 1;
  });
}
