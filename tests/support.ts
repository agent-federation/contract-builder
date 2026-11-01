import { cp, mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildView } from "../profiles/core001/view.js";
import type { CheckContext } from "../profiles/core001/context.js";
import type { Entity, ProjectModel } from "../spec/lib/ir.js";

export const LEGACY_TEXT = "DOC (Rev 1)\nMUST do";

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
    sources: [
      { id: "SRC", bytes: new TextEncoder().encode(LEGACY_TEXT), adapter: "markdown" },
    ],
    entities,
    documents: DOCUMENTS,
    byId,
    byKind,
    relations: new Map(),
  };
}

export function context(
  model: ProjectModel,
  verifyQuote: CheckContext["verifyQuote"] = async () => "found",
): CheckContext {
  return {
    model,
    view: buildView(model),
    legacyText: LEGACY_TEXT,
    legacyName: "legacy.md",
    verifyQuote,
  };
}

export const PROVISION_FIELDS: Record<string, unknown> = {
  title: "t",
  source_ref: "SRC#1",
  source_quote: "MUST do",
  claim_quote: "MUST do",
  normalized_statement: "MUST do",
  explications: [],
  source_modality: "MUST",
  modality_marker: "MUST",
  normative_effect: "obligation",
  classification_basis: { kind: "explicit", quote: "MUST", text: "t" },
  precondition: null,
  exception: null,
  unresolved_conditions: [],
  outside_slice_refs: [],
  review: { status: "unreviewed", reviewed_by: null },
};

export const PROVISION_RELATIONS: Record<string, string[]> = {
  fragment: ["F1"],
  terms: [],
  dependsOn: [],
  mentions: [],
};

export function fragment(): Entity {
  return entity("F1", "fragment", {
    source: "SRC",
    source_ref: "SRC#1",
    quote: "MUST do",
    in_scope: true,
  });
}

const root = fileURLToPath(new URL("..", import.meta.url));
const libDir = path.join(root, "spec", "lib");
const profileDir = path.join(root, "profiles", "core001");
const legacyPath = path.join(root, "CORE-001.legacy.md");

async function walkTs(dir: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkTs(full)));
    else if (entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

/** Copies the project and profile into a temp dir, rewriting the profile's core imports. */
export async function copyProjectWithProfile(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `hook-${name}-`));
  for (const file of [
    "contract-builder.json",
    "sources.yml",
    "ontology.yml",
    "semantics.json",
    "decisions.yml",
  ]) {
    await cp(path.join(root, "spec", file), path.join(dir, file));
  }
  await cp(path.join(root, "spec", "conformance"), path.join(dir, "conformance"), {
    recursive: true,
  });
  await cp(profileDir, path.join(dir, "profile"), { recursive: true });
  // The profile renderer imports `nunjucks`; resolve it from the repository.
  await symlink(path.join(root, "node_modules"), path.join(dir, "node_modules"), "junction");

  for (const file of await walkTs(path.join(dir, "profile"))) {
    const text = await readFile(file, "utf8");
    await writeFile(file, text.replace(/(?:\.\.\/)+spec\/lib\//g, `${libDir}/`), "utf8");
  }

  const manifestPath = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    profile: { source: string; external?: boolean };
    sources: Array<{ path: string; external?: boolean }>;
  };
  manifest.profile.source = "./profile";
  delete manifest.profile.external;
  manifest.sources[0]!.path = legacyPath;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return dir;
}
