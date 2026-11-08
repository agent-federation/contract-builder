/**
 * `bun run pack:core000 --out <dir>` — deterministic CORE-000 PAP v0.1 packer.
 *
 * The CORE-000 draft is built in a fresh temporary workspace (Q9 style), so the
 * checkout is never written to. The package bytes are a function of the built
 * artifact, the three declared inputs, the declared source and the engine build
 * identity plus the C2 provenance/relations claims: no clock, no absolute paths and
 * no producer-report claim.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareWorkspace,
  runHarness,
  type HarnessRun,
  type Workspace,
} from "../contracts/core000/run.js";
import { buildCore000Claims } from "./claims.js";
import {
  mapCore000Package,
  normalizeLf,
  type ArtifactPayload,
  type ClaimFilePayload,
  type InputPayload,
  type PackageFile,
  type PackageManifest,
  type PackagePlan,
  type SourcePayload,
} from "./mapping.js";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** CORE-000 input declarations copied into `inputs/`, in package path order. */
const INPUT_FILES = [
  {
    id: "input:contract-builder",
    file: "contract-builder.json",
    path: "inputs/contract-builder.json",
    mediaType: "application/json",
  },
  {
    id: "input:structure",
    file: "structure.yml",
    path: "inputs/structure.yml",
    mediaType: "application/yaml",
  },
  {
    id: "input:claims",
    file: "claims.yml",
    path: "inputs/claims.yml",
    mediaType: "application/yaml",
  },
] as const;

const ARTIFACT = {
  id: "artifact:core000-draft",
  path: "artifacts/CORE-000.draft.md",
  mediaType: "text/markdown; charset=utf-8",
} as const;

const SOURCE = {
  id: "SRC-ENGINE-CONTRACT",
  file: "docs/architecture/engine-public-contract.md",
  path: "sources/engine-public-contract.md",
  mediaType: "text/markdown; charset=utf-8",
} as const;

const PACKAGE_ID = "urn:pap:contract-builder:core000";

export interface PackOptions {
  readonly outDir: string;
  /**
   * Test seam: pack an already prepared temporary workspace instead of creating and
   * cleaning up one. The caller remains responsible for `workspace.cleanup()`.
   */
  readonly workspace?: Workspace;
}

export interface PackResult {
  readonly outDir: string;
  readonly manifest: PackageManifest;
  readonly files: readonly PackageFile[];
  readonly normalizedInputDigest: string;
}

interface ProjectDeclaration {
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly revision: string;
  };
  readonly profile: {
    readonly id: string;
    readonly version: string;
  };
}

/**
 * Build CORE-000 in a temporary workspace and write the C2 PAP package.
 * The output directory must be outside the checkout and empty.
 */
export async function packCore000(options: PackOptions): Promise<PackResult> {
  const outDir = path.resolve(options.outDir);
  assertOutsideRepository(outDir);
  await assertEmptyOutputDirectory(outDir);

  const owned = options.workspace === undefined;
  const workspace = options.workspace ?? (await prepareWorkspace());
  try {
    const run = await runHarness({
      mode: "draft",
      write: true,
      specDir: workspace.projectDir,
      workspaceRoot: workspace.root,
      run: "pipeline-c2-pack",
    });
    const identity = assertExpectedDraft(run);

    const project = await readProjectDeclaration(workspace.projectDir);
    const artifactBytes = new Uint8Array(await readFile(run.result.outputPath));
    assertArtifactBytes(artifactBytes, run);

    const inputs: InputPayload[] = [];
    for (const declaration of INPUT_FILES) {
      inputs.push({
        id: declaration.id,
        path: declaration.path,
        mediaType: declaration.mediaType,
        bytes: new Uint8Array(await readFile(path.join(workspace.projectDir, declaration.file))),
      });
    }

    const artifact: ArtifactPayload = {
      ...ARTIFACT,
      bytes: artifactBytes,
    };
    const source: SourcePayload = {
      ...SOURCE,
      bytes: new Uint8Array(await readFile(path.join(workspace.root, SOURCE.file))),
      ...acquisitionFor(run),
    };

    const normalizedInputs = new Map<string, Uint8Array>();
    for (const declaration of INPUT_FILES) {
      const payload = inputs.find((entry) => entry.path === declaration.path);
      if (payload === undefined) {
        throw new Error(`missing CORE-000 input: ${declaration.file}`);
      }
      normalizedInputs.set(declaration.file, normalizeLf(payload.bytes));
    }
    const claims = buildCore000Claims({
      inputBytes: normalizedInputs,
      source: { id: source.id, bytes: source.bytes },
    });
    const claimFiles: ClaimFilePayload[] = [claims.provenance, claims.relations];

    const plan: PackagePlan = mapCore000Package({
      artifact,
      inputs,
      source,
      claims: claimFiles,
      build: {
        engineVersion: identity.engineVersion,
        manifestVersion: identity.manifestVersion,
        inputDigest: identity.inputDigest,
        extensions: identity.extensions,
      },
      declaration: {
        id: PACKAGE_ID,
        title: `${project.project.title} assurance package`,
        producer: {
          name: "contract-builder",
          version: identity.engineVersion,
        },
        subject: {
          projectId: project.project.id,
          revision: project.project.revision,
        },
        profile: {
          id: project.profile.id,
          version: project.profile.version,
        },
      },
    });

    await writePackage(outDir, plan.files);
    return {
      outDir,
      manifest: plan.manifest,
      files: plan.files,
      normalizedInputDigest: plan.normalizedInputDigest,
    };
  } finally {
    if (owned) await workspace.cleanup();
  }
}

function assertExpectedDraft(run: HarnessRun): NonNullable<HarnessRun["result"]["identity"]> {
  const { result } = run;
  if (result.mode !== "draft") {
    throw new Error(`expected a draft CORE-000 build, got ${result.mode}`);
  }
  if (result.exitCode !== 0 || result.blockedBy !== null) {
    throw new Error(
      `CORE-000 draft build must succeed without blocking; exit ${result.exitCode}, blockedBy ${String(result.blockedBy)}`,
    );
  }
  if (!result.written || result.markdown === null) {
    throw new Error("CORE-000 draft build did not write its declared artifact");
  }
  if (result.identity === null) {
    throw new Error("CORE-000 draft build produced no build identity");
  }
  if (result.identity.projectId !== "core-000-self-contract") {
    throw new Error(`unexpected CORE-000 project id: ${result.identity.projectId}`);
  }
  if (result.identity.manifestVersion !== "0.1") {
    throw new Error(`unexpected CORE-000 manifest version: ${result.identity.manifestVersion}`);
  }
  if (!result.identity.extensions.some((entry) => entry.kind === "profile")) {
    throw new Error("CORE-000 build identity has no profile extension");
  }
  if (run.evidence.workspace.writeCheck !== "only_declared_outputs") {
    throw new Error(
      `temporary workspace wrote outside its declared output: ${run.evidence.workspace.writeCheck}`,
    );
  }
  return result.identity;
}

/** The engine records a plain SHA-256 of the normalized rendered bytes; the packaged file must match it. */
function assertArtifactBytes(bytes: Uint8Array, run: HarnessRun): void {
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (run.evidence.artifactSha256 === null || digest !== run.evidence.artifactSha256) {
    throw new Error(
      `packaged artifact bytes do not match the build's artifact digest: ${digest} != ${String(run.evidence.artifactSha256)}`,
    );
  }
}

function acquisitionFor(run: HarnessRun): { acquisition?: { method: string; revision?: string } } {
  const revision = run.evidence.commit;
  if (!/^[0-9a-f]{7,64}$/.test(revision)) return {};
  return { acquisition: { method: "git", revision } };
}

async function readProjectDeclaration(projectDir: string): Promise<ProjectDeclaration> {
  const bytes = new Uint8Array(await readFile(path.join(projectDir, "contract-builder.json")));
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as {
    project?: { id?: unknown; title?: unknown; revision?: unknown };
    profile?: { id?: unknown; version?: unknown };
  };
  const project = value.project;
  const profile = value.profile;
  if (
    project === undefined ||
    typeof project.id !== "string" ||
    typeof project.title !== "string" ||
    typeof project.revision !== "string" ||
    profile === undefined ||
    typeof profile.id !== "string" ||
    typeof profile.version !== "string"
  ) {
    throw new Error("CORE-000 contract-builder.json is missing project/profile declarations");
  }
  return {
    project: { id: project.id, title: project.title, revision: project.revision },
    profile: { id: profile.id, version: profile.version },
  };
}

/** Refuse a package destination inside the checkout: packing may not mutate it. */
export function assertOutsideRepository(target: string): void {
  const resolved = path.resolve(target);
  const relative = path.relative(path.resolve(REPO_ROOT), resolved);
  const inside =
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
  if (inside) {
    throw new Error(
      `refusing to write the package inside the repository (${resolved}); choose an output directory outside the checkout`,
    );
  }
}

async function assertEmptyOutputDirectory(outDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(outDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error(`cannot inspect output directory ${outDir}: ${messageOf(error)}`);
  }
  if (entries.length > 0) {
    throw new Error(`output directory is not empty: ${outDir}`);
  }
}

async function writePackage(outDir: string, files: readonly PackageFile[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (const file of files) {
    const target = path.join(outDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface CliOptions {
  readonly outDir: string;
  readonly help: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let outDir: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return { outDir: "", help: true };
    }
    if (arg === "--out") {
      const value = argv[index + 1];
      if (value === undefined || value.length === 0) {
        throw new Error("--out requires a directory");
      }
      outDir = value;
      index += 1;
      continue;
    }
    if (arg !== undefined && arg.startsWith("--out=")) {
      const value = arg.slice("--out=".length);
      if (value.length === 0) throw new Error("--out requires a directory");
      outDir = value;
      continue;
    }
    throw new Error(`unknown argument: ${String(arg)}`);
  }
  if (outDir === undefined) throw new Error("--out is required");
  return { outDir, help: false };
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`pack: ${messageOf(error)}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    console.log("Usage: bun run pack:core000 --out <dir>");
    return;
  }

  try {
    const packed = await packCore000({ outDir: options.outDir });
    console.log(`Packed CORE-000 PAP package to ${packed.outDir}`);
  } catch (error) {
    console.error(`pack: ${messageOf(error)}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main();
}
