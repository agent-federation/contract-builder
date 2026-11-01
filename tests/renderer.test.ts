import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { normalizeArtifact, type Renderer } from "../spec/lib/render.js";
import { renderer } from "../profiles/core001/renderer.js";
import {
  copyProjectWithProfile,
  entity,
  fragment,
  modelWith,
  PROVISION_FIELDS,
  PROVISION_RELATIONS,
} from "./support.js";

const base = (dir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir: dir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  ...overrides,
});

async function setRenderer(dir: string, id: string): Promise<void> {
  const file = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as {
    render: Array<{ renderer?: string }>;
  };
  manifest.render[0]!.renderer = id;
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

test("renderer: an unknown renderer id is core.registry.missing", async () => {
  const dir = await copyProjectWithProfile("unknown-renderer");
  await setRenderer(dir, "unknown");

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.code === "core.registry.missing"));
});

test("renderer: an invocation failure is core.render.failed", async () => {
  const dir = await copyProjectWithProfile("failing-renderer");
  await setRenderer(dir, "boom");

  const boom: Renderer = {
    id: "boom",
    version: "0.0.0",
    async render() {
      throw new Error("renderer exploded");
    },
  };

  const result = await runBuild(base(dir, { renderers: { boom } }));
  assert.equal(result.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.code === "core.render.failed"));
});

test("renderer: a minimal renderer runs through the same boundary", async () => {
  const dir = await copyProjectWithProfile("minimal-renderer");
  await setRenderer(dir, "minimal");

  const minimal: Renderer = {
    id: "minimal",
    version: "1.0.0",
    async render() {
      return "minimal output\n";
    },
  };

  const result = await runBuild(base(dir, { renderers: { minimal } }));
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.markdown, "minimal output\n");
});

test("renderer: normalization keeps LF and exactly one trailing newline", () => {
  assert.equal(normalizeArtifact("a\r\nb\r\n"), "a\nb\n");
  assert.equal(normalizeArtifact("a\nb\n\n\n"), "a\nb\n");
  assert.equal(normalizeArtifact("a\nb"), "a\nb\n");
});

test("renderer: a renderer module without a string id is rejected", async () => {
  const dir = await copyProjectWithProfile("bad-renderer-id");
  await writeFile(
    path.join(dir, "profile", "renderer.ts"),
    'export const renderer = { render: async () => "x" };\n',
    "utf8",
  );

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.code === "core.profile.invalid"));
});

test("renderer: tolerates a provision without clauses", async () => {
  const { precondition: _precondition, exception: _exception, ...fields } = PROVISION_FIELDS;
  const provision = entity("P1", "provision", fields, { ...PROVISION_RELATIONS });

  const output = await renderer.render(modelWith([fragment(), provision]), {
    mode: "draft",
    templates: { entry: "x", files: { x: "ok" } },
    diagnostics: [],
  });

  // The renderer shapes content; the core adds the trailing newline.
  assert.equal(output, "ok");
});
