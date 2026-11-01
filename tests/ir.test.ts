import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { loadProject } from "../spec/lib/load.js";
import { loadSchemas } from "../spec/lib/schema.js";
import { buildProjectModel, resolvePointer, type Entity, type ProjectModel } from "../spec/lib/ir.js";
import { resolveRelations } from "../spec/lib/relations.js";
import { markdownAdapter } from "../spec/lib/adapters/markdown.js";
import type { SourceAdapter } from "../spec/lib/source.js";
import type { Profile } from "../spec/lib/manifest.js";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import { TEST_RENDERERS } from "./support.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const specDir = path.join(root, "spec");
const profileDir = path.join(root, "profiles", "core001");
const legacyPath = path.join(root, "CORE-001.legacy.md");

const base = (dir: string): BuildOptions => ({
  specDir: dir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: TEST_RENDERERS,
});

const codes = (result: Awaited<ReturnType<typeof runBuild>>): string[] =>
  result.diagnostics.map((d) => d.code);

interface MutableManifest {
  profile: { source: string; external?: boolean };
  sources: Array<{ path: string; external?: boolean }>;
}

interface MutableProfile {
  relations: Array<Record<string, unknown>>;
}

interface MutableSemantics {
  provisions: Array<Record<string, unknown> & { relations: Record<string, unknown> }>;
}

interface MutableOntology {
  terms: Array<Record<string, unknown>>;
}

async function copyProject(name: string, withProfile = false): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `ir-${name}-`));
  for (const file of [
    "contract-builder.json",
    "sources.yml",
    "ontology.yml",
    "semantics.json",
    "decisions.yml",
  ]) {
    await cp(path.join(specDir, file), path.join(dir, file));
  }
  await cp(path.join(specDir, "conformance"), path.join(dir, "conformance"), { recursive: true });

  if (withProfile) {
    await cp(profileDir, path.join(dir, "profile"), { recursive: true });
  }

  await editManifest(dir, (manifest) => {
    manifest.sources[0]!.path = legacyPath;
    if (withProfile) {
      manifest.profile.source = "./profile";
      delete manifest.profile.external;
    } else {
      manifest.profile.source = profileDir;
    }
  });

  return dir;
}

async function editManifest(
  dir: string,
  mutate: (manifest: MutableManifest) => void,
): Promise<void> {
  const file = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as MutableManifest;
  mutate(manifest);
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function editProfile(dir: string, mutate: (profile: MutableProfile) => void): Promise<void> {
  const file = path.join(dir, "profile", "profile.json");
  const profile = JSON.parse(await readFile(file, "utf8")) as MutableProfile;
  mutate(profile);
  await writeFile(file, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

async function editSemantics(
  dir: string,
  mutate: (document: MutableSemantics) => void,
): Promise<void> {
  const file = path.join(dir, "semantics.json");
  const document = JSON.parse(await readFile(file, "utf8")) as MutableSemantics;
  mutate(document);
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

async function editOntology(
  dir: string,
  mutate: (document: MutableOntology) => void,
): Promise<void> {
  const file = path.join(dir, "ontology.yml");
  const document = parseYaml(await readFile(file, "utf8")) as MutableOntology;
  mutate(document);
  await writeFile(file, stringifyYaml(document), "utf8");
}

async function buildModel(dir: string): Promise<ProjectModel> {
  const diagnostics = new Diagnostics();
  const loaded = await loadProject(dir, diagnostics);
  assert.ok(loaded !== null, diagnostics.report());
  const schemas = await loadSchemas(loaded.project, diagnostics);
  assert.ok(schemas !== null, diagnostics.report());
  const model = await buildProjectModel(loaded, schemas, diagnostics);
  assert.ok(model !== null, diagnostics.report());
  return model;
}

test("ir: the profile declares the seven M1 relations", async () => {
  const profile = JSON.parse(
    await readFile(path.join(profileDir, "profile.json"), "utf8"),
  ) as MutableProfile;

  assert.deepEqual(
    profile.relations.map((relation) => [
      relation.from,
      relation.name,
      relation.to,
      relation.cardinality ?? null,
      relation.inverse ?? null,
    ]),
    [
      ["provision", "fragment", "fragment", "one", null],
      ["provision", "terms", "term", "many", null],
      ["provision", "dependsOn", "decision", "many", null],
      ["provision", "mentions", "decision", "many", null],
      ["case", "provision", "provision", "one", "vectors"],
      ["case", "rationaleFragment", "fragment", "one", null],
      ["term", "fragment", "fragment", "one", null],
    ],
  );
});

test("ir: an undeclared key inside relations is core.relation.unknown", async () => {
  const dir = await copyProject("unknown-key");
  await editSemantics(dir, (document) => {
    document.provisions[0]!.relations.bogus = "TERM-ASSERTED-AT";
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.relation.unknown"));
});

test("ir: a declaration with an unknown from kind stops before resolution", async () => {
  const dir = await copyProject("unknown-from", true);
  await editProfile(dir, (profile) => {
    profile.relations.push({ name: "ghost", from: "ghost", to: "term" });
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.profile.unknown-relation"));
  assert.equal(codes(result).includes("core.reference.unresolved"), false);
});

test("ir: a declaration with an unknown to kind stops before resolution, even when unused", async () => {
  const dir = await copyProject("unknown-to", true);
  await editProfile(dir, (profile) => {
    profile.relations.push({ name: "ghost", from: "provision", to: "ghost" });
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.profile.unknown-relation"));
  assert.equal(codes(result).includes("core.reference.unresolved"), false);
});

test("ir: an ordinary field named like a relation stays in fields", async () => {
  const dir = await copyProject("ordinary-field", true);

  const schemaPath = path.join(dir, "profile", "schemas", "provision.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
    $defs: { base: { properties: Record<string, unknown> } };
  };
  schema.$defs.base.properties.dependsOn = { type: "array", items: { type: "string" } };
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");

  await editSemantics(dir, (document) => {
    document.provisions[0]!.dependsOn = ["DEC-TRUSTED-TIME"];
  });

  const model = await buildModel(dir);
  const provision = model.byId.get("REQ-TEMPORAL-MOMENT-DEFINED");
  assert.ok(provision !== undefined);
  assert.deepEqual(provision.fields.dependsOn, ["DEC-TRUSTED-TIME"]);
  assert.deepEqual(provision.relations.dependsOn, []);
});

test("ir: an unresolvable target keeps ERR_UNKNOWN_REF", async () => {
  const dir = await copyProject("unknown-target");
  await editSemantics(dir, (document) => {
    document.provisions[0]!.relations.terms = ["TERM-GHOST"];
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("ERR_UNKNOWN_REF"));
});

test("ir: cardinality one rejects an array", async () => {
  const dir = await copyProject("cardinality");
  await editSemantics(dir, (document) => {
    document.provisions[0]!.relations.fragment = ["FRAG-10.2-P1-MOMENT-DEFINED"];
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.relation.cardinality"));
});

test("ir: a missing required relation key is core.schema.entity before resolution", async () => {
  const dir = await copyProject("missing-relation");
  await editSemantics(dir, (document) => {
    delete document.provisions[0]!.relations.dependsOn;
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.schema.entity"));
  assert.equal(codes(result).includes("ERR_UNKNOWN_REF"), false);
});

test("ir: inverse vectors reproduces the case order and count", async () => {
  const model = await buildModel(specDir);
  const cases = model.documents.cases as {
    cases: Array<{ id: string; relations: { provision: string } }>;
  };

  for (const provision of model.byKind.get("provision") ?? []) {
    const expected = cases.cases
      .filter((testCase) => testCase.relations.provision === provision.id)
      .map((testCase) => testCase.id);
    assert.deepEqual(provision.relations.vectors, expected, provision.id);
  }
  assert.equal(model.byKind.get("case")?.length, 13);
});

test("ir: only fragment and decision have direct provenance", async () => {
  const model = await buildModel(specDir);

  const fragment = model.byId.get("FRAG-10.2-P1-MOMENT-DEFINED");
  assert.ok(fragment !== undefined);
  assert.deepEqual(fragment.provenance, {
    source: fragment.fields.source,
    ref: fragment.fields.source_ref,
    quote: fragment.fields.quote,
  });

  const decision = model.byId.get("DEC-TRUSTED-TIME");
  assert.ok(decision !== undefined);
  assert.deepEqual(decision.provenance, {
    source: decision.fields.source,
    ref: decision.fields.source_ref,
    quote: decision.fields.source_quote,
  });

  assert.equal(model.byId.get("TERM-ASSERTED-AT")?.provenance, undefined);
  assert.equal(model.byId.get("REQ-TEMPORAL-MOMENT-DEFINED")?.provenance, undefined);
});

test("ir: a duplicate id across kinds is ERR_DUPLICATE_ID", async () => {
  const dir = await copyProject("duplicate-cross-kind", true);

  const schemaPath = path.join(dir, "profile", "schemas", "term.schema.json");
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
    $defs: { base: { properties: { id: { pattern: string } } } };
  };
  schema.$defs.base.properties.id.pattern = "^[A-Za-z0-9-]+$";
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");

  await editOntology(dir, (document) => {
    document.terms[0]!.id = "REQ-TEMPORAL-MOMENT-DEFINED";
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("ERR_DUPLICATE_ID"));
});

test("ir: resolvePointer follows RFC 6901 array indices", () => {
  const document = { items: ["a", "b"] };

  assert.equal(resolvePointer(document, "/items/0"), "a");
  assert.equal(resolvePointer(document, "/items/1"), "b");
  assert.equal(resolvePointer(document, "/items/01"), undefined);
  assert.equal(resolvePointer(document, "/items/1e0"), undefined);
  assert.equal(resolvePointer(document, "/items/-1"), undefined);
  assert.equal(resolvePointer(document, "/items/+1"), undefined);
});

test("ir: duplicate relation targets do not duplicate the inverse", () => {
  const diagnostics = new Diagnostics();
  const profile = {
    id: "p",
    version: "1.0.0",
    entityKinds: { a: { schema: "p:a" }, b: { schema: "p:b" } },
    schemas: {},
    documents: [],
    relations: [
      { name: "many", from: "a", to: "b", cardinality: "many", inverse: "back" },
    ],
  } as unknown as Profile;

  const source: Entity = { id: "A", kind: "a", fields: {}, relations: {} };
  const target: Entity = { id: "B", kind: "b", fields: {}, relations: {} };
  const byId = new Map([
    ["A", source],
    ["B", target],
  ]);
  const raw = new Map([["A", { many: ["B", "B"] }]]);
  const locations = new Map([
    ["A", { file: "a.yml", pointer: "/a/0" }],
    ["B", { file: "b.yml", pointer: "/b/0" }],
  ]);

  const index = resolveRelations([source, target], raw, locations, profile, byId, diagnostics);
  assert.ok(index !== null, diagnostics.report());
  assert.deepEqual(source.relations.many, ["B"]);
  assert.deepEqual(target.relations.back, ["A"]);
});

test("ir: duplicate relation declarations are rejected", async () => {
  const dir = await copyProject("duplicate-declaration", true);
  await editProfile(dir, (profile) => {
    profile.relations.push({ name: "fragment", from: "provision", to: "term" });
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.profile.invalid"));
  assert.equal(codes(result).includes("core.reference.unresolved"), false);
});

test("ir: resolvePointer rejects malformed escape sequences", () => {
  const document = { items: { "a~b": 1, "a/b": 2, "a~2": 3, "a~": 4 } };

  assert.equal(resolvePointer(document, "/items/a~0b"), 1);
  assert.equal(resolvePointer(document, "/items/a~1b"), 2);
  assert.equal(resolvePointer(document, "/items/a~2"), undefined);
  assert.equal(resolvePointer(document, "/items/a~"), undefined);
});

test("ir: quote verification goes through the source adapter", async () => {
  let calls = 0;
  const spy: SourceAdapter = {
    ...markdownAdapter,
    async verifyQuote(source, ref, quote) {
      calls += 1;
      return markdownAdapter.verifyQuote(source, ref, quote);
    },
  };

  const result = await runBuild({ ...base(specDir), adapters: { markdown: spy } });
  assert.equal(result.exitCode, 0, result.diagnostics.map((d) => d.message).join("\n"));
  assert.ok(calls > 0, "verifyQuote was not called");
});
