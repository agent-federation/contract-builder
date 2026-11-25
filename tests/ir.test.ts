import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { loadProject } from "../spec/lib/load.js";
import { loadSchemas } from "../spec/lib/schema.js";
import {
  buildProjectModel,
  resolvePointer,
  type Entity,
  type ProjectModel,
} from "../spec/lib/ir.js";
import { resolveRelations } from "../spec/lib/relations.js";
import type { Profile } from "../spec/lib/manifest.js";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import { ENGINE_RENDERERS, copyEngineProject, removeTrackedTempDirs } from "./support.js";
after(removeTrackedTempDirs);

const base = (dir: string): BuildOptions => ({
  specDir: dir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: ENGINE_RENDERERS,
  allowExecutableProfile: true,
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

interface MutableSchema {
  $defs: { base: { properties: Record<string, unknown> } };
}

async function copyProject(name: string): Promise<string> {
  return copyEngineProject(name);
}

async function editProfile(dir: string, mutate: (profile: MutableProfile) => void): Promise<void> {
  const file = path.join(dir, "profiles", "example", "profile.json");
  const profile = JSON.parse(await readFile(file, "utf8")) as MutableProfile;
  mutate(profile);
  await writeFile(file, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

async function editEntitySchema(
  dir: string,
  name: string,
  mutate: (schema: MutableSchema) => void,
): Promise<void> {
  const file = path.join(dir, "profiles", "example", "schemas", name);
  const schema = JSON.parse(await readFile(file, "utf8")) as MutableSchema;
  mutate(schema);
  await writeFile(file, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
}

async function editRequirements(
  dir: string,
  mutate: (requirements: Array<Record<string, unknown>>) => void,
): Promise<void> {
  const file = path.join(dir, "requirements.yml");
  const document = parseYaml(await readFile(file, "utf8")) as {
    requirements: Array<Record<string, unknown>>;
  };
  mutate(document.requirements);
  await writeFile(file, stringifyYaml(document), "utf8");
}

async function editExamples(
  dir: string,
  mutate: (examples: Array<Record<string, unknown>>) => void,
): Promise<void> {
  const file = path.join(dir, "examples.yml");
  const document = parseYaml(await readFile(file, "utf8")) as {
    examples: Array<Record<string, unknown>>;
  };
  mutate(document.examples);
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

test("ir: an undeclared key inside relations is core.relation.unknown", async () => {
  const dir = await copyProject("unknown-key");
  await editExamples(dir, (examples) => {
    examples[0]!.relations = { requirement: "REQ-IDEMPOTENT", bogus: "REQ-ORDER-ID" };
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.relation.unknown"));
});

test("ir: a declaration with an unknown from kind stops before resolution", async () => {
  const dir = await copyProject("unknown-from");
  await editProfile(dir, (profile) => {
    profile.relations.push({ name: "ghost", from: "ghost", to: "requirement" });
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.profile.unknown-relation"));
  assert.equal(codes(result).includes("core.reference.unresolved"), false);
});

test("ir: a declaration with an unknown to kind stops before resolution, even when unused", async () => {
  const dir = await copyProject("unknown-to");
  await editProfile(dir, (profile) => {
    profile.relations.push({ name: "ghost", from: "example", to: "ghost" });
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.profile.unknown-relation"));
  assert.equal(codes(result).includes("core.reference.unresolved"), false);
});

test("ir: an ordinary field named like a relation stays in fields", async () => {
  const dir = await copyProject("ordinary-field");

  await editEntitySchema(dir, "requirement.schema.json", (schema) => {
    schema.$defs.base.properties.examples = { type: "array", items: { type: "string" } };
  });

  // Remove the example that covers REQ-ORDER-ID, so no inverse relation fills the field.
  await editExamples(dir, (examples) => {
    examples.splice(1, 1);
  });
  await editRequirements(dir, (requirements) => {
    requirements[1]!.examples = ["EX-IDEMPOTENT-1"];
  });

  const model = await buildModel(dir);
  const requirement = model.byId.get("REQ-ORDER-ID");
  assert.ok(requirement !== undefined);
  assert.deepEqual(requirement.fields.examples, ["EX-IDEMPOTENT-1"]);
  assert.equal(requirement.relations.examples, undefined);
});

test("ir: an unresolvable target keeps ERR_UNKNOWN_REF", async () => {
  const dir = await copyProject("unknown-target");
  await editExamples(dir, (examples) => {
    examples[0]!.relations = { requirement: "REQ-GHOST" };
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("ERR_UNKNOWN_REF"));
});

test("ir: cardinality one rejects an array", async () => {
  const dir = await copyProject("cardinality");
  await editExamples(dir, (examples) => {
    examples[0]!.relations = { requirement: ["REQ-IDEMPOTENT", "REQ-ORDER-ID"] };
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.relation.cardinality"));
});

test("ir: a missing required relation key is core.schema.entity before resolution", async () => {
  const dir = await copyProject("missing-relation");
  await editExamples(dir, (examples) => {
    delete examples[0]!.relations;
  });

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.schema.entity"));
  assert.equal(codes(result).includes("ERR_UNKNOWN_REF"), false);
});

test("ir: a duplicate id across kinds is ERR_DUPLICATE_ID", async () => {
  const dir = await copyProject("duplicate-cross-kind");

  await editEntitySchema(dir, "example.schema.json", (schema) => {
    (schema.$defs.base.properties.id as { pattern: string }).pattern = "^[A-Za-z0-9-]+$";
  });
  await editExamples(dir, (examples) => {
    examples[0]!.id = "REQ-IDEMPOTENT";
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
    relations: [{ name: "many", from: "a", to: "b", cardinality: "many", inverse: "back" }],
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

test("ir: an inverse declared cardinality one accepts a single source", () => {
  const diagnostics = new Diagnostics();
  const profile = {
    id: "p",
    version: "1.0.0",
    entityKinds: { a: { schema: "p:a" }, b: { schema: "p:b" } },
    schemas: {},
    documents: [],
    relations: [
      { name: "many", from: "a", to: "b", cardinality: "many", inverse: "back" },
      { name: "back", from: "b", to: "a", cardinality: "one", inverse: "many" },
    ],
  } as unknown as Profile;

  const source: Entity = { id: "A", kind: "a", fields: {}, relations: {} };
  const target: Entity = { id: "B", kind: "b", fields: {}, relations: {} };
  const byId = new Map([
    ["A", source],
    ["B", target],
  ]);
  // The repeated target resolves once, so the inverse still holds one source.
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

test("ir: an inverse declared cardinality one rejects a second source", () => {
  const diagnostics = new Diagnostics();
  const profile = {
    id: "p",
    version: "1.0.0",
    entityKinds: { a: { schema: "p:a" }, b: { schema: "p:b" } },
    schemas: {},
    documents: [],
    relations: [
      { name: "many", from: "a", to: "b", cardinality: "many", inverse: "back" },
      { name: "back", from: "b", to: "a", cardinality: "one", inverse: "many" },
    ],
  } as unknown as Profile;

  const first: Entity = { id: "A1", kind: "a", fields: {}, relations: {} };
  const second: Entity = { id: "A2", kind: "a", fields: {}, relations: {} };
  const target: Entity = { id: "B", kind: "b", fields: {}, relations: {} };
  const byId = new Map([
    ["A1", first],
    ["A2", second],
    ["B", target],
  ]);
  const raw = new Map([
    ["A1", { many: ["B"] }],
    ["A2", { many: ["B"] }],
  ]);
  const locations = new Map([
    ["A1", { file: "a.yml", pointer: "/a/0" }],
    ["A2", { file: "a.yml", pointer: "/a/1" }],
    ["B", { file: "b.yml", pointer: "/b/0" }],
  ]);

  const index = resolveRelations(
    [first, second, target],
    raw,
    locations,
    profile,
    byId,
    diagnostics,
  );
  assert.equal(index, null);
  const diagnostic = diagnostics
    .emissionOrder()
    .find((item) => item.code === "core.relation.cardinality");
  assert.ok(diagnostic !== undefined, diagnostics.report());
  assert.equal(diagnostic.pointer, "/a/1/relations/many");
  assert.ok(diagnostic.message.includes('"B"'), diagnostic.message);
});

test("ir: duplicate relation declarations are rejected", async () => {
  const dir = await copyProject("duplicate-declaration");
  await editProfile(dir, (profile) => {
    profile.relations.push({ name: "requirement", from: "example", to: "requirement" });
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
