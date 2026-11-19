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
import { gateConclusion } from "../profiles/core000/renderer.js";
import { copyEngineProject, ENGINE_RENDERERS } from "./support.js";

const base = (dir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir: dir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: ENGINE_RENDERERS,
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
  const dir = await copyEngineProject("unknown-renderer");
  await setRenderer(dir, "unknown");

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.code === "core.registry.missing"));
});

test("renderer: an invocation failure is core.render.failed", async () => {
  const dir = await copyEngineProject("failing-renderer");
  await setRenderer(dir, "boom");

  const boom: Renderer = {
    id: "boom",
    version: "0.0.0",
    closure: { files: [], dependencies: {} },
    async render() {
      throw new Error("renderer exploded");
    },
  };

  const result = await runBuild(base(dir, { renderers: { ...ENGINE_RENDERERS, boom } }));
  assert.equal(result.exitCode, 1);
  assert.ok(result.diagnostics.some((item) => item.code === "core.render.failed"));
});

test("renderer: a minimal renderer runs through the same boundary", async () => {
  const dir = await copyEngineProject("minimal-renderer");
  await setRenderer(dir, "minimal");

  const minimal: Renderer = {
    id: "minimal",
    version: "1.0.0",
    closure: { files: [], dependencies: {} },
    async render(model) {
      return [artifactFrom(model.manifest.render[0]!.outputs.draft!, "minimal output\n")];
    },
  };

  const result = await runBuild(base(dir, { renderers: { ...ENGINE_RENDERERS, minimal } }));
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));
  assert.equal(result.markdown, "minimal output\n");
});

test("renderer: the engine passes the computed build identity in RenderOptions", async () => {
  const dir = await copyEngineProject("identity-options");
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

  const result = await runBuild(base(dir, { renderers: { ...ENGINE_RENDERERS, capture } }));
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));
  assert.ok(received !== undefined);
  assert.deepEqual(received.identity, result.identity);
  assert.match(received.identity.inputDigest, /^sha256:[0-9a-f]{64}$/);
});

test("renderer: an injected renderer overrides the profile renderer by id", async () => {
  const dir = await copyEngineProject("override-renderer");
  const override: Renderer = {
    id: "example-markdown",
    version: "0.0.0",
    closure: { files: [], dependencies: {} },
    async render(model) {
      return [artifactFrom(model.manifest.render[0]!.outputs.draft!, "override\n")];
    },
  };

  const result = await runBuild(
    base(dir, { renderers: { ...ENGINE_RENDERERS, "example-markdown": override } }),
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

test("renderer: a non-string labels declaration is rejected", async () => {
  const dir = await copyEngineProject("bad-labels");
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

test("core000 renderer: a warnings-only build does not claim strict-mode permission", () => {
  assert.equal(
    gateConclusion({ errors: 0, reviews: 0, warnings: 0 }),
    "`release` permitted — no `ERROR`, `REVIEW_REQUIRED` or `WARNING` diagnostics.",
  );

  const warnings = gateConclusion({ errors: 0, reviews: 0, warnings: 2 });
  assert.match(warnings, /`release` gate/);
  assert.match(warnings, /`WARNING` diagnostics block only under `--strict`/);
  assert.doesNotMatch(
    warnings,
    /permitted — no/,
    "warnings are blocking under --strict, so the line must not claim permission",
  );

  assert.match(
    gateConclusion({ errors: 1, reviews: 0, warnings: 0 }),
    /`release` blocked — 1 `ERROR` diagnostics\./,
  );
  assert.match(
    gateConclusion({ errors: 0, reviews: 2, warnings: 1 }),
    /`release` blocked — 2 `REVIEW_REQUIRED` diagnostics\./,
  );
});
