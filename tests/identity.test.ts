import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalManifestJson,
  computeClosureDigest,
  frameRecord,
  importSpecifiers,
  normalizeTextBytes,
  parseLockfile,
  readLockfile,
  resolveDependencyClosure,
  resolveExtensionClosure,
  resolveProfileClosure,
  type BuildIdentity,
  type Lockfile,
} from "../spec/lib/identity.js";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { loadProject } from "../spec/lib/load.js";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import { markdownAdapter } from "../spec/lib/adapters/markdown.js";
import { renderer as core001Renderer } from "../profiles/core001/renderer.js";
import type { Manifest } from "../spec/lib/manifest.js";
import type { Renderer } from "../spec/lib/render.js";
import type { SourceAdapter } from "../spec/lib/source.js";
import { TEST_RENDERERS, copyProjectWithProfile } from "./support.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const specDir = path.join(root, "spec");
const legacyPath = path.join(root, "CORE-001.legacy.md");

const base = (dir: string, overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir: dir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: TEST_RENDERERS,
  ...overrides,
});

const codes = (result: Awaited<ReturnType<typeof runBuild>>): string[] =>
  result.diagnostics.map((item) => item.code);

const concat = (...chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

/** A self-contained project: copied profile with rewritten core imports and a local source. */
async function copyLocalProject(name: string): Promise<string> {
  const dir = await copyProjectWithProfile(name);
  await cp(legacyPath, path.join(dir, "legacy.md"));

  const manifestPath = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    sources: Array<{ path: string; external?: boolean }>;
  };
  manifest.sources[0]!.path = "legacy.md";
  delete manifest.sources[0]!.external;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return dir;
}

async function identityOf(dir: string, overrides: Partial<BuildOptions> = {}): Promise<BuildIdentity> {
  const result = await runBuild(base(dir, overrides));
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));
  assert.ok(result.identity !== null, "build produced no identity");
  return result.identity;
}

async function profileDigest(dir: string): Promise<string> {
  const diagnostics = new Diagnostics();
  const loaded = await loadProject(dir, diagnostics);
  assert.ok(loaded !== null, diagnostics.report());
  const closure = await resolveProfileClosure(loaded.project, await readLockfile(), diagnostics);
  assert.ok(closure !== null, diagnostics.report());
  return closure.closureDigest;
}

test("identity: fields and engine version follow the accepted contract", async () => {
  const identity = await identityOf(specDir);
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")) as {
    version: string;
  };

  assert.equal(identity.projectId, "uia-core-001");
  assert.equal(identity.engineVersion, pkg.version);
  assert.equal(identity.manifestVersion, "0.1");
  assert.match(identity.inputDigest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(identity.extensions, [
    { kind: "profile", id: "core001", version: "0.1.0" },
    { kind: "adapter", id: "markdown", version: "0.1.0" },
    { kind: "renderer", id: "core001-markdown", version: "0.1.0" },
  ]);
});

test("identity: repeated builds produce the same digest", async () => {
  const first = await identityOf(specDir);
  const second = await identityOf(specDir);
  assert.equal(first.inputDigest, second.inputDigest);
});

test("identity: a one-byte change in every declared input changes the digest", async () => {
  const dir = await copyLocalProject("identity-inputs");
  const before = (await identityOf(dir)).inputDigest;
  const inputs = [
    "sources.yml",
    "ontology.yml",
    "semantics.json",
    "decisions.yml",
    path.join("conformance", "cases.yml"),
  ];

  for (const relative of inputs) {
    const file = path.join(dir, relative);
    const original = await readFile(file);
    await writeFile(file, concat(original, new TextEncoder().encode(" ")));
    const after = (await identityOf(dir)).inputDigest;
    assert.notEqual(after, before, `digest did not move for ${relative}`);
    await writeFile(file, original);
  }
});

test("identity: a one-byte change in the source document changes the digest", async () => {
  const dir = await copyLocalProject("identity-source");
  const before = (await identityOf(dir)).inputDigest;
  const file = path.join(dir, "legacy.md");
  const original = await readFile(file);
  await writeFile(file, concat(original, new TextEncoder().encode(" ")));
  const after = (await identityOf(dir)).inputDigest;
  assert.notEqual(after, before);
});

test("identity: a profile file change moves profileDigest and inputDigest", async () => {
  const dir = await copyLocalProject("identity-profile");
  const beforeProfile = await profileDigest(dir);
  const beforeBuild = (await identityOf(dir)).inputDigest;

  const file = path.join(dir, "profile", "view.ts");
  const original = await readFile(file, "utf8");
  await writeFile(file, `${original} `, "utf8");

  const afterProfile = await profileDigest(dir);
  const afterBuild = (await identityOf(dir)).inputDigest;
  assert.notEqual(afterProfile, beforeProfile);
  assert.notEqual(afterBuild, beforeBuild);
});

test("identity: a declared source-adapter file change moves its closure and the digest", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "identity-adapter-"));
  const file = path.join(dir, "markdown.ts");
  await writeFile(
    file,
    await readFile(path.join(root, "spec", "lib", "adapters", "markdown.ts"), "utf8"),
    "utf8",
  );

  const adapter: SourceAdapter = {
    ...markdownAdapter,
    closure: { root: dir, files: ["markdown.ts"], dependencies: {} },
  };
  const lockfile = await readLockfile();
  const diagnostics = new Diagnostics();
  const beforeClosure = await resolveExtensionClosure(
    "adapter",
    adapter.id,
    adapter.version,
    adapter.closure,
    lockfile,
    diagnostics,
  );
  assert.ok(beforeClosure !== null, diagnostics.report());
  const beforeBuild = (await identityOf(specDir, { adapters: { markdown: adapter } })).inputDigest;

  await writeFile(
    file,
    `${await readFile(file, "utf8")}\n// identity sentinel\n`,
    "utf8",
  );
  const afterClosure = await resolveExtensionClosure(
    "adapter",
    adapter.id,
    adapter.version,
    adapter.closure,
    lockfile,
    diagnostics,
  );
  assert.ok(afterClosure !== null);
  const afterBuild = (await identityOf(specDir, { adapters: { markdown: adapter } })).inputDigest;

  assert.notEqual(afterClosure.closureDigest, beforeClosure.closureDigest);
  assert.notEqual(afterBuild, beforeBuild);
});

test("identity: a declared renderer file change moves its closure and the digest", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "identity-renderer-"));
  const file = path.join(dir, "renderer.ts");
  await writeFile(file, "// identity sentinel one\n", "utf8");

  const renderer: Renderer = {
    ...core001Renderer,
    closure: { root: dir, files: ["renderer.ts"], dependencies: {} },
  };
  const renderers = { [core001Renderer.id]: renderer };
  const lockfile = await readLockfile();
  const diagnostics = new Diagnostics();
  const beforeClosure = await resolveExtensionClosure(
    "renderer",
    renderer.id,
    renderer.version,
    renderer.closure,
    lockfile,
    diagnostics,
  );
  assert.ok(beforeClosure !== null, diagnostics.report());
  const beforeBuild = (await identityOf(specDir, { renderers })).inputDigest;

  await writeFile(file, "// identity sentinel two\n", "utf8");
  const afterClosure = await resolveExtensionClosure(
    "renderer",
    renderer.id,
    renderer.version,
    renderer.closure,
    lockfile,
    diagnostics,
  );
  assert.ok(afterClosure !== null);
  const afterBuild = (await identityOf(specDir, { renderers })).inputDigest;

  assert.notEqual(afterClosure.closureDigest, beforeClosure.closureDigest);
  assert.notEqual(afterBuild, beforeBuild);
});

test("identity: a pinned dependency or integrity change moves the closure digest", async () => {
  const lock: Lockfile = parseLockfile(`{
    "packages": {
      "pkg": ["pkg@1.0.0", "", { "dependencies": { "dep": "^2.0.0" } }, "sha512-aaa=="],
      "dep": ["dep@2.1.0", "", {}, "sha512-bbb=="],
    },
  }`);
  const diagnostics = new Diagnostics();
  const closure = resolveDependencyClosure({ pkg: "1.0.0" }, lock, diagnostics, "test");
  assert.ok(closure !== null, diagnostics.report());
  assert.deepEqual(closure.map((item) => `${item.name}@${item.version}`), ["dep@2.1.0", "pkg@1.0.0"]);

  const before = computeClosureDigest([], closure);
  const changedIntegrity = parseLockfile(`{
    "packages": {
      "pkg": ["pkg@1.0.0", "", { "dependencies": { "dep": "^2.0.0" } }, "sha512-ccc=="],
      "dep": ["dep@2.1.0", "", {}, "sha512-bbb=="],
    },
  }`);
  const changedClosure = resolveDependencyClosure(
    { pkg: "1.0.0" },
    changedIntegrity,
    new Diagnostics(),
    "test",
  );
  assert.ok(changedClosure !== null);
  assert.notEqual(computeClosureDigest([], changedClosure), before);
});

test("identity: the real lockfile pins the declared renderer dependency", async () => {
  const lock = await readLockfile();
  const nunjucks = lock.packages.find((item) => item.name === "nunjucks");
  assert.ok(nunjucks);
  assert.equal(nunjucks.version, "3.2.4");
  assert.ok(nunjucks.integrity.length > 0);
});

test("identity: temp roots, mtimes, locale and unrelated environment do not move the digest", async () => {
  const first = await copyLocalProject("identity-root-a");
  const second = await copyLocalProject("identity-root-b");
  const firstDigest = (await identityOf(first)).inputDigest;
  const secondDigest = (await identityOf(second)).inputDigest;
  assert.equal(secondDigest, firstDigest);

  await utimes(path.join(first, "sources.yml"), new Date(), new Date());
  const previousLocale = process.env.LANG;
  process.env.LANG = "tr_TR.UTF-8";
  process.env.DSH_IDENTITY_SENTINEL = "sentinel";
  try {
    const touched = (await identityOf(first)).inputDigest;
    assert.equal(touched, firstDigest);
  } finally {
    delete process.env.DSH_IDENTITY_SENTINEL;
    if (previousLocale === undefined) delete process.env.LANG;
    else process.env.LANG = previousLocale;
  }
});

test("identity: manifest array order participates in the digest", async () => {
  const dir = await copyLocalProject("identity-order");
  const before = (await identityOf(dir)).inputDigest;

  const manifestPath = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    inputs: unknown[];
  };
  const [first, second] = manifest.inputs;
  manifest.inputs[0] = second;
  manifest.inputs[1] = first;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const after = (await identityOf(dir)).inputDigest;
  assert.notEqual(after, before);
});

test("identity: canonical manifest sorts keys but preserves array order", () => {
  const one = {
    manifestVersion: "0.1",
    project: { id: "p", title: "t" },
    profile: { id: "x", version: "1", source: ".." },
    inputs: [{ path: "a", format: "json", schema: "s", entities: [] }],
    render: [],
  } satisfies Manifest;
  const reordered = {
    render: [],
    inputs: [{ entities: [], schema: "s", format: "json", path: "a" }],
    profile: { source: "..", version: "1", id: "x" },
    project: { title: "t", id: "p" },
    manifestVersion: "0.1",
  } satisfies Manifest;

  assert.equal(canonicalManifestJson(one), canonicalManifestJson(reordered));

  const reversed = {
    ...one,
    inputs: [
      { path: "a", format: "json" as const, schema: "s", entities: [] },
      { path: "b", format: "json" as const, schema: "s", entities: [] },
    ],
  } satisfies Manifest;
  const reversedAgain = {
    ...reversed,
    inputs: [...reversed.inputs].reverse(),
  } satisfies Manifest;
  assert.notEqual(canonicalManifestJson(reversed), canonicalManifestJson(reversedAgain));

  const withExternal = {
    ...one,
    sources: [{ id: "s", path: "../doc.md", adapter: "markdown", external: true }],
  } satisfies Manifest;
  const withoutExternal = {
    ...one,
    sources: [{ id: "s", path: "../doc.md", adapter: "markdown" }],
  } satisfies Manifest;
  assert.notEqual(canonicalManifestJson(withExternal), canonicalManifestJson(withoutExternal));
});

test("identity: import scanning survives single-quoted and template literals", () => {
  const source = [
    "const single = 'not a comment //';",
    "const template = `template // not a comment ${single}`;",
    '// import "commented-out";',
    'import "real-package";',
  ].join("\n");
  assert.deepEqual(importSpecifiers(source), ["real-package"]);
});

test("identity: import scanning does not match inside unrelated strings", () => {
  const source = [
    'const first = "import ";',
    'const second = "nunjucks";',
    "const third = 'export ';",
    'const fourth = "left-pad";',
    'import "real-package";',
  ].join("\n");
  assert.deepEqual(importSpecifiers(source), ["real-package"]);
});

test("identity: import scanning ignores comments and regex literals", () => {
  const source = [
    '// import "line-comment";',
    '/* import "block-comment"; */',
    "const url = /https?:\\/\\//;",
    "const block = /abc/*def/;",
    'import "real-package";',
  ].join("\n");
  assert.deepEqual(importSpecifiers(source), ["real-package"]);
});

test("identity: import scanning extracts static, export-from and literal dynamic imports", () => {
  const source = [
    'import value from "static-package";',
    'export * from "exported-package";',
    'const lazy = () => import("dynamic-package");',
    'import type { Type } from "types-only";',
    'object.import("method-package");',
    'const name = "computed-package";',
    "import(name);",
  ].join("\n");
  assert.deepEqual(importSpecifiers(source), [
    "static-package",
    "exported-package",
    "dynamic-package",
  ]);
});

test("identity: import scanning ignores object keys and supports semicolon-less imports", () => {
  const source = [
    "const object = {",
    "  import: 1,",
    '  from: "not-an-import",',
    "};",
    'import first from "first-package"',
    'import second from "second-package"',
  ].join("\n");
  assert.deepEqual(importSpecifiers(source), ["first-package", "second-package"]);
});

test("identity: literal dynamic import with options is still detected", () => {
  const source = 'const lazy = () => import("dynamic-package", { with: { type: "json" } });';
  assert.deepEqual(importSpecifiers(source), ["dynamic-package"]);
});

test("identity: a relative import outside the extension root is unpinned", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "identity-outside-"));
  const extension = path.join(base, "extension");
  await mkdir(extension);
  await writeFile(path.join(base, "outside.ts"), "export const value = 1;\n", "utf8");
  await writeFile(
    path.join(extension, "entry.ts"),
    'import { value } from "../outside.ts";\n',
    "utf8",
  );

  const diagnostics = new Diagnostics();
  const closure = await resolveExtensionClosure(
    "renderer",
    "outside-import",
    "1.0.0",
    { root: extension, files: ["entry.ts"], dependencies: {} },
    await readLockfile(),
    diagnostics,
  );

  assert.equal(closure, null);
  assert.ok(diagnostics.sorted().some((item) => item.code === "core.extension.unpinned-dependency"));
});

test("identity: an import of an engine module outside the extension root is allowed", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "identity-engine-"));
  const extension = path.join(base, "extension");
  await mkdir(extension);
  const engineModule = path.join(root, "spec", "lib", "manifest.ts");
  await writeFile(
    path.join(extension, "entry.ts"),
    `import { resolveContained } from ${JSON.stringify(engineModule)};\n`,
    "utf8",
  );

  const diagnostics = new Diagnostics();
  const closure = await resolveExtensionClosure(
    "renderer",
    "engine-import",
    "1.0.0",
    { root: extension, files: ["entry.ts"], dependencies: {} },
    await readLockfile(),
    diagnostics,
  );

  assert.ok(closure !== null, diagnostics.report());
});

test("identity: literal dynamic imports inside template interpolations are detected", () => {
  const source = [
    'const value = `${await import("template-package")}`;',
    'const nested = `a ${1 + `${await import("nested-package")}`} b`;',
    'const ignored = `plain text import("ignored-package")`;',
  ].join("\n");
  assert.deepEqual(importSpecifiers(source), ["template-package", "nested-package"]);
});

test("identity: template expressions with regex braces are scanned", () => {
  const source =
    'const value = `${/}/.test("x") ? import("yes-package") : import("no-package")}`;';
  assert.deepEqual(importSpecifiers(source), ["yes-package", "no-package"]);
});

test("identity: a template-interpolation import in a profile is unpinned", async () => {
  const dir = await copyLocalProject("identity-template-import");
  const file = path.join(dir, "profile", "checks", "cases.ts");
  const injection = 'const templateImport = () => `${await import("left-pad")}`;';
  await writeFile(file, `${await readFile(file, "utf8")}\n${injection}\n`, "utf8");

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.extension.unpinned-dependency"));
});

test("identity: record framing resists ambiguous concatenation", () => {
  const withinParts = frameRecord("tag", ["ab", "c"]);
  const shiftedParts = frameRecord("tag", ["a", "bc"]);
  assert.equal(Buffer.from(withinParts).equals(Buffer.from(shiftedParts)), false);

  const firstRecords = concat(
    frameRecord("x", ["ab"]),
    frameRecord("y", ["c"]),
  );
  const shiftedRecords = concat(
    frameRecord("x", ["a"]),
    frameRecord("y", ["bc"]),
  );
  assert.equal(Buffer.from(firstRecords).equals(Buffer.from(shiftedRecords)), false);
});

test("identity: LF normalization is explicit and one-byte changes still move", () => {
  const encoder = new TextEncoder();
  assert.deepEqual(
    [...normalizeTextBytes(encoder.encode("a\r\nb\rc\n"))],
    [...encoder.encode("a\nb\nc\n")],
  );
  assert.notDeepEqual(
    [...normalizeTextBytes(encoder.encode("a\nb\n"))],
    [...normalizeTextBytes(encoder.encode("a\nc\n"))],
  );
});

test("identity: binary bytes are hashed raw, including CR and NUL", () => {
  const withCr = new Uint8Array([0, 0x0d]);
  const withLf = new Uint8Array([0, 0x0a]);
  assert.deepEqual([...normalizeTextBytes(withCr)], [...withCr]);
  assert.deepEqual([...normalizeTextBytes(withLf)], [...withLf]);
  assert.notDeepEqual([...normalizeTextBytes(withCr)], [...normalizeTextBytes(withLf)]);
});

test("identity: closure digests sort files and dependencies", () => {
  const encoder = new TextEncoder();
  const files = [
    { path: "b.ts", bytes: encoder.encode("b\n") },
    { path: "a.ts", bytes: encoder.encode("a\n") },
  ];
  const deps = [
    { name: "b", version: "1.0.0", integrity: "sha512-b" },
    { name: "a", version: "1.0.0", integrity: "sha512-a" },
  ];
  assert.equal(
    computeClosureDigest(files, deps),
    computeClosureDigest([...files].reverse(), [...deps].reverse()),
  );
});

test("identity: undeclared literal static import is core.extension.unpinned-dependency", async () => {
  const dir = await copyLocalProject("identity-unpinned-static");
  const file = path.join(dir, "profile", "checks", "cases.ts");
  await writeFile(file, `${await readFile(file, "utf8")}\nimport "left-pad";\n`, "utf8");

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.extension.unpinned-dependency"));
  assert.equal(result.identity, null);
});

test("identity: undeclared literal dynamic import is core.extension.unpinned-dependency", async () => {
  const dir = await copyLocalProject("identity-unpinned-dynamic");
  const file = path.join(dir, "profile", "view.ts");
  await writeFile(
    file,
    `${await readFile(file, "utf8")}\nconst lazy = () => import("left-pad");\n`,
    "utf8",
  );

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.extension.unpinned-dependency"));
});

test("identity: a declared version that does not match bun.lock fails the build", async () => {
  const dir = await copyLocalProject("identity-mismatch");
  const file = path.join(dir, "profile", "profile.json");
  const profile = JSON.parse(await readFile(file, "utf8")) as {
    dependencies: Record<string, string>;
  };
  profile.dependencies.nunjucks = "9.9.9";
  await writeFile(file, `${JSON.stringify(profile, null, 2)}\n`, "utf8");

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.extension.unpinned-dependency"));
});

test("identity: a missing declared closure file fails the build", async () => {
  const dir = await copyLocalProject("identity-missing-file");
  const { rm } = await import("node:fs/promises");
  await rm(path.join(dir, "profile", "renderer.ts"));

  const result = await runBuild(base(dir));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("core.extension.unpinned-dependency"));
});

test("identity: identity is not rendered into the artifact", async () => {
  const result = await runBuild(base(specDir));
  assert.ok(result.identity !== null);
  assert.ok(result.markdown !== null);
  assert.equal(result.markdown.includes(result.identity.inputDigest), false);
  assert.equal(result.markdown.includes("inputDigest"), false);
});
