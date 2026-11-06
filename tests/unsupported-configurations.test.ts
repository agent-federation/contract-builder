import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { copyProjectWithProfile, TEST_RENDERERS } from "./support.js";

/**
 * ODR-ENG-001 B3/B4 (E2): M1 requires an executable profile and exactly one source.
 * Unsupported configurations must fail with an explicit diagnostic, not degrade partially.
 */

const root = fileURLToPath(new URL("..", import.meta.url));
const specDir = path.join(root, "spec");

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

const codes = (result: Awaited<ReturnType<typeof runBuild>>): string[] =>
  result.diagnostics.map((diagnostic) => diagnostic.code);

const summary = (result: Awaited<ReturnType<typeof runBuild>>): string =>
  result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n");

interface MutableProfile {
  view?: string;
  validator?: string;
}

interface MutableManifest {
  sources?: Array<Record<string, unknown>>;
}

async function editProfile(
  dir: string,
  mutate: (profile: MutableProfile) => void,
): Promise<void> {
  const file = path.join(dir, "profile", "profile.json");
  const profile = JSON.parse(await readFile(file, "utf8")) as MutableProfile;
  mutate(profile);
  await writeFile(file, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
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

function executableProfileDiagnostic(result: Awaited<ReturnType<typeof runBuild>>) {
  const diagnostics = result.diagnostics.filter((item) => item.code === "core.profile.invalid");
  assert.equal(
    diagnostics.length,
    1,
    `expected exactly one core.profile.invalid, got:\n${summary(result)}`,
  );
  return diagnostics[0]!;
}

test("E2: a profile without view is rejected before consent", async () => {
  const dir = await copyProjectWithProfile("e2-no-view");
  await editProfile(dir, (profile) => {
    delete profile.view;
  });

  const result = await runBuild(base(dir, { allowExecutableProfile: false }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.equal(result.written, false);
  assert.equal(result.markdown, null);
  assert.equal(result.identity, null);
  assert.deepEqual(codes(result), ["core.profile.invalid"], summary(result));

  const diagnostic = executableProfileDiagnostic(result);
  assert.equal(diagnostic.file, "profile.json");
  assert.equal(diagnostic.pointer, "/view");
  assert.match(diagnostic.message, /M1 requires an executable profile/);
  assert.match(diagnostic.message, /profile\.view/);
  assert.match(diagnostic.message, /data-only profiles are not supported by M1/);
});

test("E2: a profile without validator is rejected before consent", async () => {
  const dir = await copyProjectWithProfile("e2-no-validator");
  await editProfile(dir, (profile) => {
    delete profile.validator;
  });

  const result = await runBuild(base(dir, { allowExecutableProfile: false }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.deepEqual(codes(result), ["core.profile.invalid"], summary(result));

  const diagnostic = executableProfileDiagnostic(result);
  assert.equal(diagnostic.pointer, "/validator");
  assert.match(diagnostic.message, /M1 requires an executable profile/);
  assert.match(diagnostic.message, /profile\.validator/);
});

test("E2: a data-only profile without view and validator is rejected before consent", async () => {
  const dir = await copyProjectWithProfile("e2-data-only");
  await editProfile(dir, (profile) => {
    delete profile.view;
    delete profile.validator;
  });

  const result = await runBuild(base(dir, { allowExecutableProfile: false }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.deepEqual(codes(result), ["core.profile.invalid"], summary(result));
  assert.equal(codes(result).includes("core.profile.consent-required"), false);

  const diagnostic = executableProfileDiagnostic(result);
  assert.equal(diagnostic.pointer, "");
  assert.match(diagnostic.message, /M1 requires an executable profile/);
  assert.match(diagnostic.message, /profile\.view/);
  assert.match(diagnostic.message, /profile\.validator/);
});

test("E2: a multi-source manifest is rejected before the model, identity or renderer", async () => {
  const dir = await copyProjectWithProfile("e2-multi-source");
  await editManifest(dir, (manifest) => {
    manifest.sources!.push({
      id: "SRC-SECOND",
      path: "second-source.md",
      adapter: "markdown",
      identity: { document: "SECOND", revision: "1" },
    });
  });

  const result = await runBuild(base(dir, { write: true }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.equal(result.written, false);
  assert.equal(result.markdown, null);
  assert.equal(result.identity, null);
  // A late rejection would fail reading the missing second source with ERR_IO; the only
  // diagnostic proves the manifest was rejected during validation, before the model phase.
  assert.deepEqual(codes(result), ["core.manifest.invalid"], summary(result));

  const diagnostic = result.diagnostics[0]!;
  assert.equal(diagnostic.file, "contract-builder.json");
  assert.equal(diagnostic.pointer, "/sources");
  assert.match(diagnostic.message, /M1 supports exactly one source/);
  assert.match(diagnostic.message, /multi-source manifests are not supported by M1/);
  assert.equal(existsSync(path.join(dir, "output", "CORE-001.draft.md")), false);
});

test("E2: missing or empty sources keeps the existing source-not-declared error", async () => {
  for (const variant of ["missing", "empty"] as const) {
    const dir = await copyProjectWithProfile(`e2-${variant}-sources`);
    await editManifest(dir, (manifest) => {
      if (variant === "missing") delete manifest.sources;
      else manifest.sources = [];
    });

    const result = await runBuild(base(dir));
    assert.equal(result.exitCode, 1, variant);
    assert.equal(result.blockedBy, "errors", variant);
    assert.ok(codes(result).includes("ERR_UNKNOWN_REF"), `${variant}: ${summary(result)}`);
    assert.equal(codes(result).includes("core.manifest.invalid"), false, variant);
  }
});

test("E2: an existing one-source project builds to the committed artifact", async () => {
  const result = await runBuild(base(specDir));
  assert.equal(result.exitCode, 0, summary(result));
  assert.equal(result.blockedBy, null);
  assert.ok(result.markdown !== null);
  assert.ok(result.identity !== null);
  assert.equal(result.diagnostics.filter((item) => item.severity === "error").length, 0);

  const committed = await readFile(path.join(specDir, "output", "CORE-001.draft.md"), "utf8");
  assert.equal(result.markdown, committed);
});
