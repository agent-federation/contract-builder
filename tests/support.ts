import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderer as exampleRenderer } from "../profiles/example/renderer.js";
import type { BuildIdentity } from "../spec/lib/identity.js";
import type { Renderer } from "../spec/lib/render.js";
import type { Entity, ProjectModel } from "../spec/lib/ir.js";

export const LEGACY_TEXT = "DOC (Rev 1)\nMUST do";

/** Renderer input the engine always supplies on a successful build. */
export const TEST_IDENTITY: BuildIdentity = {
  projectId: "test-project",
  engineVersion: "0.0.0",
  manifestVersion: "0.1",
  inputDigest: `sha256:${"0".repeat(64)}`,
  extensions: [],
};

const DOCUMENTS = {
  sources: { slice: { id: "S", includes: ["#1"], excludes: [] } },
  ontology: {
    document: {
      id: "DOC",
      title: "t",
      revision: "1",
      source: "SRC",
      slice: "S",
      slice_title: "s",
    },
  },
};

export function entity(
  id: string,
  kind: string,
  fields: Record<string, unknown>,
  relations: Record<string, string[]> = {},
): Entity {
  return { id, kind, fields, relations };
}

export function modelWith(entities: Entity[]): ProjectModel {
  const byId = new Map(entities.map((item) => [item.id, item]));
  const byKind = new Map<string, Entity[]>();
  for (const item of entities) {
    const list = byKind.get(item.kind) ?? [];
    list.push(item);
    byKind.set(item.kind, list);
  }

  return {
    manifest: {
      manifestVersion: "0.1",
      project: { id: "t" },
      profile: { id: "p", version: "1", source: "." },
      inputs: [],
      sources: [
        {
          id: "SRC",
          path: "legacy.md",
          adapter: "markdown",
          identity: { document: "DOC", revision: "1" },
        },
      ],
      render: [{ outputs: {} }],
    },
    profile: { id: "p", version: "1", entityKinds: {}, schemas: {}, documents: [] },
    sources: [{ id: "SRC", bytes: new TextEncoder().encode(LEGACY_TEXT), adapter: "markdown" }],
    entities,
    documents: DOCUMENTS,
    byId,
    byKind,
    relations: new Map(),
  };
}

const root = fileURLToPath(new URL("..", import.meta.url));

const engineFixtureDir = path.join(root, "tests", "fixtures", "engine-project");
const exampleProfileDir = path.join(root, "profiles", "example");

/**
 * Temp roots created by the tests under the system temp dir. Tests register each root
 * here and sweep them in a single `after(removeTrackedTempDirs)` so a full test run
 * leaves no new directories behind (#322).
 */
const trackedTempRoots: string[] = [];

/** Registers a temp directory for the end-of-file `removeTrackedTempDirs` sweep. */
export function trackTempDir(dir: string): void {
  trackedTempRoots.push(dir);
}

/** Removes every tracked temp root; safe to call from `after` in each test file. */
export async function removeTrackedTempDirs(): Promise<void> {
  const roots = trackedTempRoots.splice(0);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}

/**
 * Copies the synthetic engine project fixture (`tests/fixtures/engine-project/`) and the
 * `profiles/example` profile into a temp dir, with the profile copied inside the project
 * (`./profiles/example`) so tests can mutate the copy without touching the repository.
 * The copy is tracked for removal by `removeTrackedTempDirs`.
 */
export async function copyEngineProject(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `engine-${name}-`));
  trackTempDir(dir);
  await cp(engineFixtureDir, dir, { recursive: true });
  await cp(exampleProfileDir, path.join(dir, "profiles", "example"), { recursive: true });

  const manifestPath = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    profile: { source: string; external?: boolean };
  };
  manifest.profile.source = "./profiles/example";
  delete manifest.profile.external;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return dir;
}

/** Consumer-supplied renderer registry for the engine project fixture. */
export const ENGINE_RENDERERS: Record<string, Renderer> = {
  [exampleRenderer.id]: exampleRenderer,
};
