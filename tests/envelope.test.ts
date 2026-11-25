import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { renderer as core000Renderer } from "../profiles/core000/renderer.js";
import { renderer as exampleRenderer } from "../profiles/example/renderer.js";
import type { Renderer } from "../spec/lib/render.js";
import { copyEngineProject, removeTrackedTempDirs } from "./support.js";
after(removeTrackedTempDirs);

/**
 * ODR-ART-001 envelope conformance: every generated contract artifact exposes the mandatory
 * presentation elements (document identity, generated/source-of-truth notice, build mode and
 * scope/exclusions, profile/renderer/build identity, diagnostic/gating summary) while keeping
 * its profile-specific body. These are artifact tests, not a shared template.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const core000Dir = path.join(root, "contracts", "core000");
const core000DraftPath = path.join(core000Dir, "output", "CORE-000.draft.md");

const base = (specDir: string, renderer: Renderer): BuildOptions => ({
  specDir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: { [renderer.id]: renderer },
  allowExecutableProfile: true,
  engineRoot: root,
});

async function buildCore000(): Promise<Awaited<ReturnType<typeof runBuild>>> {
  return runBuild(base(core000Dir, core000Renderer));
}

async function buildExample(): Promise<Awaited<ReturnType<typeof runBuild>>> {
  const dir = await copyEngineProject("envelope-example");
  return runBuild(base(dir, exampleRenderer));
}

function rendered(result: Awaited<ReturnType<typeof runBuild>>): string {
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));
  assert.ok(result.identity !== null, "build produced no identity");
  assert.ok(result.markdown !== null, "build produced no markdown");
  return result.markdown;
}

test("envelope: CORE-000 renders every mandatory element from the computed identity", async () => {
  const result = await buildCore000();
  const markdown = rendered(result);
  const identity = result.identity!;

  // The committed artifact is the fresh build, so the committed envelope is the tested one.
  assert.equal(markdown, await readFile(core000DraftPath, "utf8"));

  // 1. Document/project identity + revision, and the visible title.
  assert.match(markdown, /^# Contract Builder Engine public self-contract\n/);
  assert.match(markdown, /\| Project \| `core-000-self-contract` — /);
  assert.match(markdown, /\| Project revision \| `0\.1\.0` \|/);

  // 2. Generated/source-of-truth notice.
  assert.match(markdown, /Generated build artifact\./);
  assert.match(markdown, /The source of truth is the declared `contracts\/core000\/` inputs/);
  assert.match(markdown, /Do not edit it by hand; change the inputs and rebuild\./);

  // 3. Build mode + declared project scope/exclusions.
  assert.match(markdown, /\| Mode \| `draft` \|/);
  assert.match(markdown, /\| Scope \| Project `core-000-self-contract` — /);
  assert.match(markdown, /\| Exclusions \| No CORE-001 slice or /);

  // 4. Profile/renderer identity + the engine-computed build identity.
  assert.match(markdown, /\| Profile \| `core000` `0\.1\.0` \|/);
  assert.match(markdown, /\| Renderer \| `core000-markdown` `0\.1\.0` \|/);
  assert.ok(markdown.includes(`| Engine version | \`${identity.engineVersion}\` |`));
  assert.ok(markdown.includes(`| Manifest version | \`${identity.manifestVersion}\` |`));
  assert.ok(markdown.includes(`| inputDigest | \`${identity.inputDigest}\` |`));

  // 5. Emitted severity counts (not the catalog size) and a summary gate conclusion.
  assert.match(markdown, /ERROR=0 · REVIEW_REQUIRED=62 · WARNING=6/);
  assert.match(markdown, /`release` blocked — 62 `REVIEW_REQUIRED` diagnostics\./);
  assert.match(markdown, /diagnostic catalog=25/);

  // The full diagnostic list remains in the body.
  assert.match(markdown, /## Build diagnostics/);
});

test("envelope: the artifacts keep their profile-specific bodies", async () => {
  const core000 = rendered(await buildCore000());
  const example = rendered(await buildExample());

  // Each profile's body sections stay out of the other artifact.
  assert.equal(core000.includes("- REQ-"), false, "the example requirement list leaks");
  assert.ok(example.includes("## Requirements"), "the example body lost its own section");
  assert.equal(example.includes("## Components"), false);
  assert.equal(example.includes("## Diagnostic catalog"), false);
  assert.equal(example.includes("## Build diagnostics"), false);
});
