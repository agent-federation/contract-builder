import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import {
  artifactFrom,
  normalizeArtifact,
  type RenderOptions,
  type Renderer,
} from "../spec/lib/render.js";
import { renderer } from "../profiles/core001/renderer.js";
import {
  copyProjectWithProfile,
  entity,
  fragment,
  modelWith,
  PROVISION_FIELDS,
  PROVISION_RELATIONS,
  TEST_IDENTITY,
  TEST_RENDERERS,
} from "./support.js";

const base = (dir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir: dir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: TEST_RENDERERS,
  allowExecutableProfile: true,
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
    closure: { files: [], dependencies: {} },
    async render() {
      throw new Error("renderer exploded");
    },
  };

  const result = await runBuild(base(dir, { renderers: { ...TEST_RENDERERS, boom } }));
  assert.equal(result.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.code === "core.render.failed"));
});

test("renderer: a minimal renderer runs through the same boundary", async () => {
  const dir = await copyProjectWithProfile("minimal-renderer");
  await setRenderer(dir, "minimal");

  const minimal: Renderer = {
    id: "minimal",
    version: "1.0.0",
    closure: { files: [], dependencies: {} },
    async render(model) {
      return [artifactFrom(model.manifest.render[0]!.outputs.draft!, "minimal output\n")];
    },
  };

  const result = await runBuild(base(dir, { renderers: { ...TEST_RENDERERS, minimal } }));
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.markdown, "minimal output\n");
});

test("renderer: the engine passes the computed build identity in RenderOptions", async () => {
  const dir = await copyProjectWithProfile("identity-options");
  await setRenderer(dir, "capture");
  let received: RenderOptions | undefined;

  const capture: Renderer = {
    id: "capture",
    version: "1.0.0",
    closure: { files: [], dependencies: {} },
    async render(model, options) {
      received = options;
      return [artifactFrom(model.manifest.render[0]!.outputs.draft!, "capture\n")];
    },
  };

  const result = await runBuild(base(dir, { renderers: { ...TEST_RENDERERS, capture } }));
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));
  assert.ok(received !== undefined);
  assert.deepEqual(received.identity, result.identity);
  assert.match(received.identity.inputDigest, /^sha256:[0-9a-f]{64}$/);
});

test("renderer: an injected renderer overrides the profile renderer by id", async () => {
  const dir = await copyProjectWithProfile("override-renderer");
  const override: Renderer = {
    id: "core001-markdown",
    version: "0.0.0",
    closure: { files: [], dependencies: {} },
    async render(model) {
      return [artifactFrom(model.manifest.render[0]!.outputs.draft!, "override\n")];
    },
  };

  const result = await runBuild(
    base(dir, { renderers: { ...TEST_RENDERERS, "core001-markdown": override } }),
  );
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.markdown, "override\n");
});

test("renderer: normalization keeps LF and exactly one trailing newline", () => {
  const decode = (text: string): string =>
    new TextDecoder().decode(normalizeArtifact(new TextEncoder().encode(text)));

  assert.equal(decode("a\r\nb\r\n"), "a\nb\n");
  assert.equal(decode("a\nb\n\n\n"), "a\nb\n");
  assert.equal(decode("a\nb"), "a\nb\n");
});

test("renderer: tolerates a provision without clauses", async () => {
  const { precondition: _precondition, exception: _exception, ...fields } = PROVISION_FIELDS;
  const provision = entity("P1", "provision", fields, { ...PROVISION_RELATIONS });

  const artifacts = await renderer.render(modelWith([fragment(), provision]), {
    mode: "draft",
    templates: { entry: "x", files: { x: "ok" } },
    diagnostics: [],
    identity: TEST_IDENTITY,
  });

  // The renderer shapes content; the core adds the trailing newline.
  assert.equal(new TextDecoder().decode(artifacts[0]!.bytes), "ok");
});

test("renderer: a non-string labels declaration is rejected", async () => {
  const dir = await copyProjectWithProfile("bad-labels");
  const file = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(file, "utf8")) as {
    render: Array<{ labels?: unknown }>;
  };
  manifest.render[0]!.labels = 42;
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.code === "core.manifest.invalid"));
});
