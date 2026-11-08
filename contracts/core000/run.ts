import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions, type BuildResult } from "../../spec/lib/build.js";
import type { Diagnostic } from "../../spec/lib/diagnostics.js";
import type { BuildMode, Renderer } from "../../spec/lib/render.js";
import { normalizeArtifact } from "../../spec/lib/render.js";
import { renderer as core000Renderer } from "../../profiles/core000/renderer.js";
import { applyMutation, MUTATION_NAMES, type MutationName } from "./mutations.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const PROJECT_FILES = ["contract-builder.json", "structure.yml", "claims.yml"] as const;
const RENDERERS: Record<string, Renderer> = { [core000Renderer.id]: core000Renderer };

export interface Workspace {
  readonly root: string;
  readonly projectDir: string;
  cleanup(): Promise<void>;
}

export interface HarnessOptions {
  mode?: BuildMode;
  write?: boolean;
  check?: boolean;
  mutation?: MutationName;
  /** Run against an existing project copy, for example a temp workspace written by another run. */
  specDir?: string;
  /**
   * Assert that the whole workspace tree is unchanged except for declared outputs. Tests pass this
   * when they drive an existing temp workspace with `specDir`.
   */
  workspaceRoot?: string;
  evidencePath?: string;
  run?: string;
}

export interface WorkspaceAssertion {
  writeCheck: string;
  cleanup: string;
}

export interface HarnessRun {
  result: BuildResult;
  evidence: RunEvidence;
  projectDir: string;
  workspaceRoot: string | null;
  evidencePath: string | null;
}

export interface RunEvidence {
  schema: string;
  run: string;
  hypothesis: string;
  commit: string;
  project: string;
  mode: BuildMode;
  allowExecutableProfile: boolean;
  environment: {
    bun: string;
    os: string;
    arch: string;
    lockfileSha256: string;
    timezone: string | null;
    locale: string | null;
    install: string;
    isolation: {
      mode: string;
      sandbox: boolean;
      network: string;
      resourceLimits: string;
    };
  };
  command: string;
  exitCode: number;
  blockedBy: BuildResult["blockedBy"];
  written: boolean;
  output: string;
  identity: BuildResult["identity"];
  artifactSha256: string | null;
  diagnostics: Diagnostic[];
  expected: {
    exitCode: number;
    blockedBy: BuildResult["blockedBy"];
    codes: string[];
  };
  sourceRepositoryClean: boolean;
  workspace: WorkspaceAssertion;
  result: {
    H1_self_build: string;
    H2_reproducibility: string;
    H3_independent_verification: string;
  };
  classification: string[];
  limitations: string[];
}

/**
 * Creates a fresh temp workspace with real copies of the project, the CORE-000 profile and the
 * source document, preserving the committed relative manifest layout. Profile engine imports
 * stay as authored and are resolved from the explicit engine root passed to `runBuild`. No
 * symlink points back into the checkout. This is still a workspace, not a sandbox.
 */
export async function prepareWorkspace(): Promise<Workspace> {
  const root = await mkdtemp(path.join(tmpdir(), "core000-"));
  const projectDir = path.join(root, "contracts", "core000");
  await mkdir(projectDir, { recursive: true });

  for (const file of PROJECT_FILES) {
    await cp(path.join(HERE, file), path.join(projectDir, file));
  }

  const profileDir = path.join(root, "profiles", "core000");
  await cp(path.join(REPO_ROOT, "profiles", "core000"), profileDir, { recursive: true });

  const sourceDir = path.join(root, "docs", "architecture");
  await mkdir(sourceDir, { recursive: true });
  await cp(
    path.join(REPO_ROOT, "docs", "architecture", "engine-public-contract.md"),
    path.join(sourceDir, "engine-public-contract.md"),
  );

  return {
    root,
    projectDir,
    cleanup: async () => rm(root, { recursive: true, force: true }),
  };
}

export async function runHarness(options: HarnessOptions = {}): Promise<HarnessRun> {
  const mode = options.mode ?? "draft";
  if (options.write === true) {
    await assertOutsideRepository(options.specDir ?? "", "Writing the artifact");
  }
  if (options.evidencePath !== undefined) {
    await assertOutsideRepository(options.evidencePath, "Writing evidence");
  }

  const before = repositoryStatus();
  const workspace = options.specDir === undefined ? await prepareWorkspace() : undefined;
  const projectDir = options.specDir ?? workspace!.projectDir;
  const workspaceRoot = options.workspaceRoot ?? workspace?.root;

  if (options.mutation !== undefined) {
    const resolved = await realpath(projectDir);
    const tempRoot = await realpath(tmpdir());
    if (!isInside(tempRoot, resolved) || isInside(await realpath(REPO_ROOT), resolved)) {
      throw new Error("Mutations are only applied to a fresh temporary copy, never the repository");
    }
    await applyMutation(projectDir, options.mutation);
  }

  const baseline = workspaceRoot === undefined ? null : await snapshotWorkspace(workspaceRoot);
  let writeCheck = "not_applicable";
  let cleanup = "not_applicable";
  let result: BuildResult;

  try {
    const buildOptions: BuildOptions = {
      specDir: projectDir,
      mode,
      write: options.write ?? false,
      check: options.check ?? false,
      strict: false,
      renderers: RENDERERS,
      allowExecutableProfile: true,
      engineRoot: REPO_ROOT,
    };
    result = await runBuild(buildOptions);

    if (workspaceRoot !== undefined && baseline !== null) {
      writeCheck = await checkWorkspaceWrites(workspaceRoot, baseline, result);
    }
    if (workspace !== undefined) {
      cleanup = await cleanupWorkspace(workspace);
    }
  } catch (error) {
    if (workspace !== undefined) cleanup = await cleanupWorkspace(workspace);
    throw error;
  }

  const after = repositoryStatus();
  const evidence = await buildEvidence(options, result, projectDir, {
    writeCheck,
    cleanup,
    sourceRepositoryClean: before === "" && after === "",
  });

  if (options.evidencePath !== undefined) {
    await mkdir(path.dirname(options.evidencePath), { recursive: true });
    await writeFile(options.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }

  return {
    result,
    evidence,
    projectDir,
    workspaceRoot: workspaceRoot ?? null,
    evidencePath: options.evidencePath ?? null,
  };
}

async function buildEvidence(
  options: HarnessOptions,
  result: BuildResult,
  projectDir: string,
  workspace: { writeCheck: string; cleanup: string; sourceRepositoryClean: boolean },
): Promise<RunEvidence> {
  const expected = expectedOutcome(options);
  const observed = new Set(result.diagnostics.map((diagnostic) => diagnostic.code));
  const matched =
    result.exitCode === expected.exitCode &&
    result.blockedBy === expected.blockedBy &&
    expected.codes.every((code) => observed.has(code));

  const artifactSha256 =
    result.blockedBy === null && result.markdown !== null
      ? sha256(normalizeArtifact(new TextEncoder().encode(result.markdown)))
      : null;
  const workspaceOk =
    workspace.writeCheck !== "unexpected_writes" && workspace.cleanup !== "incomplete";

  return {
    schema: "core000-run-evidence/0.1",
    run: options.run ?? defaultRunName(options),
    hypothesis: "H1",
    commit: gitCommit(),
    project: "contracts/core000",
    mode: result.mode,
    allowExecutableProfile: true,
    environment: {
      bun: process.versions.bun ?? "unknown",
      os: process.platform,
      arch: process.arch,
      lockfileSha256: await sha256File(path.join(REPO_ROOT, "bun.lock")),
      timezone: process.env.TZ ?? null,
      locale: process.env.LC_ALL ?? process.env.LANG ?? null,
      install: "bun install --frozen-lockfile",
      isolation: {
        mode: "temporary_workspace_only",
        sandbox: false,
        network: "not_restricted",
        resourceLimits: "external_timeout_only",
      },
    },
    command: commandFor(options),
    exitCode: result.exitCode,
    blockedBy: result.blockedBy,
    written: result.written,
    output: outputFor(result, projectDir),
    identity: result.identity,
    artifactSha256,
    diagnostics: result.diagnostics,
    expected,
    sourceRepositoryClean: workspace.sourceRepositoryClean,
    workspace: { writeCheck: workspace.writeCheck, cleanup: workspace.cleanup },
    result: {
      H1_self_build:
        matched && workspaceOk
          ? expected.exitCode === 0 && expected.blockedBy === null
            ? "SELF_BUILD_COMPLETED"
            : "SELF_BUILD_BLOCKED"
          : "SELF_BUILD_FAILED",
      H2_reproducibility: "NOT_TESTED",
      H3_independent_verification: "NOT_PERFORMED",
    },
    classification: classificationFor(options),
    limitations: [
      "self-build only",
      "no independent verification",
      "no sandbox or isolation claimed",
      "same-environment evidence only; no cross-environment reproducibility",
    ],
  };
}

function expectedOutcome(options: HarnessOptions): RunEvidence["expected"] {
  if (options.mutation !== undefined && options.mode !== "release") {
    switch (options.mutation) {
      case "claim":
        return {
          exitCode: 0,
          blockedBy: null,
          codes: ["core000.independent-verification.missing"],
        };
      case "unresolved-subject":
        return { exitCode: 1, blockedBy: "errors", codes: ["ERR_UNKNOWN_REF"] };
      case "implemented-without-evidence":
        return {
          exitCode: 1,
          blockedBy: "errors",
          codes: ["core000.claim.implemented-without-evidence"],
        };
      case "quote-outside":
        return {
          exitCode: 1,
          blockedBy: "errors",
          codes: ["core000.source.verification-failed"],
        };
      case "decision-missing":
        return {
          exitCode: 1,
          blockedBy: "errors",
          codes: ["core000.claim.decision-required"],
        };
    }
  }

  if (options.mode === "release") {
    return {
      exitCode: 1,
      blockedBy: "review",
      codes: ["core000.independent-verification.missing"],
    };
  }

  return {
    exitCode: 0,
    blockedBy: null,
    codes: ["core000.independent-verification.missing"],
  };
}

function classificationFor(options: HarnessOptions): string[] {
  if (options.mutation === "unresolved-subject") {
    return ["structural", "implementation_behavior"];
  }
  if (
    options.mutation === "implemented-without-evidence" ||
    options.mutation === "decision-missing"
  ) {
    return ["profile_policy"];
  }
  if (options.mutation === "quote-outside") {
    return ["profile_policy", "implementation_behavior"];
  }
  if (options.mutation === "claim") {
    return ["implementation_behavior"];
  }
  if (options.mode === "release") {
    return ["profile_policy", "implementation_behavior"];
  }
  return ["structural", "profile_policy", "implementation_behavior"];
}

function defaultRunName(options: HarnessOptions): string {
  switch (options.mutation) {
    case "claim":
      return "S1-POS-05";
    case "unresolved-subject":
      return "N2";
    case "implemented-without-evidence":
      return "N3";
    case "quote-outside":
      return "N8";
    case "decision-missing":
      return "N11";
    case undefined:
      break;
  }
  if (options.mode === "release") return "S1-POS-03";
  if (options.check === true) return "S1-POS-04";
  return "S1-POS-01";
}

function commandFor(options: HarnessOptions): string {
  const parts = ["bun contracts/core000/run.ts", `--mode ${options.mode ?? "draft"}`];
  parts.push(`--write ${options.write === true ? "true" : "false"}`);
  if (options.check === true) parts.push("--check true");
  if (options.mutation !== undefined) parts.push(`--mutation ${options.mutation}`);
  if (options.specDir !== undefined) parts.push("--spec-dir <temporary-copy>");
  return parts.join(" ");
}

function outputFor(result: BuildResult, projectDir: string): string {
  return path.relative(projectDir, result.outputPath).split(path.sep).join("/");
}

async function assertOutsideRepository(target: string, action: string): Promise<void> {
  const resolved =
    target.length === 0 ? "" : await realpath(target).catch(() => path.resolve(target));
  if (resolved.length > 0 && isInside(await realpath(REPO_ROOT), resolved)) {
    throw new Error(`${action} is forbidden in the repository; use a temporary copy`);
  }
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

async function snapshotWorkspace(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  for (const file of await listFiles(root)) {
    const full = path.join(root, file);
    const stats = await lstat(full);
    snapshot.set(file, stats.isSymbolicLink() ? "symlink" : await sha256File(full));
  }
  return snapshot;
}

/**
 * Compares the whole temp workspace before and after a build. The only permitted change is the
 * declared artifact when the run wrote one; a new, modified, deleted or symlinked file anywhere
 * else is an undeclared workspace write. This is an assertion about the experiment workspace,
 * not a security boundary.
 */
async function checkWorkspaceWrites(
  root: string,
  baseline: ReadonlyMap<string, string>,
  result: BuildResult,
): Promise<string> {
  const after = await snapshotWorkspace(root);
  const output = result.written ? relativeToRoot(root, result.outputPath) : null;
  if (result.written && output === null) return "unexpected_writes";

  for (const [file, hash] of baseline) {
    const current = after.get(file);
    if (current === undefined) return "unexpected_writes";
    if (current !== hash && file !== output) return "unexpected_writes";
  }
  for (const file of after.keys()) {
    if (!baseline.has(file) && file !== output) return "unexpected_writes";
  }
  return "only_declared_outputs";
}

function relativeToRoot(root: string, target: string): string | null {
  const relative = path.relative(root, target).split(path.sep).join("/");
  if (
    relative.length === 0 ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative;
}

async function cleanupWorkspace(workspace: Workspace): Promise<string> {
  try {
    await workspace.cleanup();
    return "completed";
  } catch {
    return "incomplete";
  }
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relative)));
    } else {
      files.push(relative);
    }
  }
  return files.sort();
}

function repositoryStatus(): string | null {
  try {
    return execFileSync("git", ["status", "--porcelain"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

function gitCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

async function sha256File(file: string): Promise<string> {
  return sha256(new Uint8Array(await readFile(file)));
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

interface CliOptions extends HarnessOptions {
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--mode": {
        const value = argv[i + 1];
        if (value !== "draft" && value !== "release") {
          throw new Error(`Invalid mode: ${value ?? "(missing)"}`);
        }
        options.mode = value;
        i += 1;
        break;
      }
      case "--write":
        options.write = parseBoolean(argv[i + 1], "--write");
        i += 1;
        break;
      case "--check":
        options.check = parseBoolean(argv[i + 1], "--check");
        i += 1;
        break;
      case "--mutation": {
        const value = argv[i + 1];
        if (value === undefined || !(MUTATION_NAMES as readonly string[]).includes(value)) {
          throw new Error(`Invalid mutation: ${value ?? "(missing)"}`);
        }
        options.mutation = value as MutationName;
        i += 1;
        break;
      }
      case "--spec-dir": {
        const value = argv[i + 1];
        if (value === undefined) throw new Error("--spec-dir requires a directory");
        options.specDir = path.resolve(value);
        i += 1;
        break;
      }
      case "--evidence": {
        const value = argv[i + 1];
        if (value === undefined) throw new Error("--evidence requires a path");
        options.evidencePath = path.resolve(value);
        i += 1;
        break;
      }
      case "--run": {
        const value = argv[i + 1];
        if (value === undefined) throw new Error("--run requires a label");
        options.run = value;
        i += 1;
        break;
      }
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function parseBoolean(value: string | undefined, flag: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flag} requires true or false`);
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(
      "Usage: bun contracts/core000/run.ts --mode draft|release --write true|false --check true|false --mutation <name> --spec-dir <dir> --evidence <path> --run <label>",
    );
    return;
  }

  const run = await runHarness(options);
  console.log(
    JSON.stringify(
      {
        run: run.evidence.run,
        mode: run.result.mode,
        exitCode: run.result.exitCode,
        blockedBy: run.result.blockedBy,
        written: run.result.written,
        output: run.evidence.output,
        identity: run.result.identity,
        artifactSha256: run.evidence.artifactSha256,
        diagnostics: run.result.diagnostics,
        evidence: run.evidence,
      },
      null,
      2,
    ),
  );
  process.exitCode = run.result.exitCode;
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main();
}
