import { test } from "node:test";
import assert from "node:assert/strict";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import { resolveFindings, type DiagnosticCatalog } from "../spec/lib/hook.js";
import { ORDER } from "../profiles/core001/validator.js";
import { entity, modelWith, copyProjectWithProfile } from "./support.js";
import { runBuild } from "../spec/lib/build.js";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const catalog: DiagnosticCatalog = {
  codes: [
    { code: "X", severity: "warning", message: "id={{id}} name={{name}}" },
    { code: "Y", variant: "v", severity: "review", message: "y={{value}}" },
  ],
};

test("hook: resolves severity and message from the catalog", () => {
  const diagnostics = new Diagnostics();
  const model = modelWith([entity("E1", "thing", { name: "entity" })]);

  const ok = resolveFindings(
    [{ code: "X", entityId: "E1", location: { file: "f.yml", pointer: "/e/0" } }],
    model,
    catalog,
    diagnostics,
  );

  assert.equal(ok, true);
  assert.deepEqual(diagnostics.sorted(), [
    {
      severity: "warning",
      code: "X",
      file: "f.yml",
      pointer: "/e/0",
      message: "id=E1 name=entity",
    },
  ]);
});

test("hook: finding data takes precedence over entity fields", () => {
  const diagnostics = new Diagnostics();
  const model = modelWith([entity("E1", "thing", { name: "entity" })]);

  resolveFindings(
    [
      {
        code: "X",
        entityId: "E1",
        location: { file: "f.yml", pointer: "" },
        data: { name: "data" },
      },
    ],
    model,
    catalog,
    diagnostics,
  );

  assert.equal(diagnostics.sorted()[0]?.message, "id=E1 name=data");
});

test("hook: a variant selects its catalog entry", () => {
  const diagnostics = new Diagnostics();
  const model = modelWith([]);

  resolveFindings(
    [{ code: "Y", variant: "v", location: { file: "f.yml", pointer: "" }, data: { value: 7 } }],
    model,
    catalog,
    diagnostics,
  );

  assert.deepEqual(diagnostics.sorted(), [
    { severity: "review", code: "Y", file: "f.yml", pointer: "", message: "y=7" },
  ]);
});

test("hook: an undeclared code fails with core.profile.unknown-code", () => {
  const diagnostics = new Diagnostics();
  const model = modelWith([]);

  const ok = resolveFindings(
    [{ code: "MISSING", location: { file: "f.yml", pointer: "" } }],
    model,
    catalog,
    diagnostics,
  );

  assert.equal(ok, false);
  assert.ok(diagnostics.sorted().some((item) => item.code === "core.profile.unknown-code"));
});

test("hook: the aggregator order is explicit", () => {
  assert.deepEqual([...ORDER], [
    "source",
    "ontology",
    "provision",
    "cases",
    "review",
    "coverage",
    "terms",
    "dependencies",
  ]);
});

test("hook: an unknown finding code fails the build", async () => {
  const dir = await copyProjectWithProfile("unknown-code");
  await writeFile(
    path.join(dir, "profile", "validator.ts"),
    'export async function validate() {\n  return [{ code: "UNKNOWN", location: { file: "x", pointer: "" } }];\n}\n',
    "utf8",
  );

  const result = await runBuild({
    specDir: dir,
    mode: "draft",
    write: false,
    check: false,
    strict: false,
  });

  assert.equal(result.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.code === "core.profile.unknown-code"));
});
