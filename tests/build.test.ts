import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { runBuild, type BuildOptions } from "../spec/lib/build.js";
import { TEST_RENDERERS } from "./support.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const specDir = path.join(root, "spec");
const fixture = (name: string) => path.join(root, "fixtures", name, "spec");

const base = (overrides: Partial<BuildOptions> = {}): BuildOptions => ({
  specDir,
  mode: "draft",
  write: false,
  check: false,
  strict: false,
  renderers: TEST_RENDERERS,
  allowExecutableProfile: true,
  ...overrides,
});

const codes = (result: Awaited<ReturnType<typeof runBuild>>): string[] =>
  result.diagnostics.map((d) => d.code);

test("draft: собирается без ERROR, все положения попадают в артефакт", async () => {
  const result = await runBuild(base());
  assert.equal(result.exitCode, 0, result.diagnostics.map((d) => d.message).join("\n"));
  assert.equal(result.blockedBy, null);
  assert.ok(result.markdown);

  for (const id of [
    "TERM-ASSERTED-AT",
    "TERM-SIGNED-AT",
    "REQ-TEMPORAL-MOMENT-DEFINED",
    "REQ-REVOCATION-NOT-AUTO-INVALID",
    "REQ-SIGNED-AT-TRUST-CONDITION",
    "INV-NO-GLOBAL-TRUSTED-TIME",
    "REQ-TIMESTAMPS-NOT-INTERCHANGEABLE",
  ]) {
    assert.ok(result.markdown.includes(id), `в артефакте нет ${id}`);
  }
});

test("draft: детерминирован побайтно", async () => {
  const first = await runBuild(base());
  const second = await runBuild(base());
  assert.equal(first.markdown, second.markdown);
});

test("сохранённый артефакт актуален (--check)", async () => {
  const result = await runBuild(base({ check: true }));
  assert.equal(result.exitCode, 0, "артефакт устарел: запустите npm run build");
});

test("release: блокируется неподтверждённой нормализацией и не пишет артефакт", async () => {
  const result = await runBuild(base({ mode: "release" }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "review");
  assert.equal(result.written, false);
  assert.ok(codes(result).includes("REVIEW_NORMALIZATION_PENDING"));
  assert.equal(existsSync(path.join(specDir, "output", "CORE-001.md")), false);
});

test("release: подтверждённое ревью снимает блокировку", async () => {
  const dir = await copySpec("confirmed-review");
  const semanticsPath = path.join(dir, "semantics.json");
  const semantics = JSON.parse(await readFile(semanticsPath, "utf8")) as {
    provisions: Array<{ review: { status: string; reviewed_by: string | null } }>;
  };
  for (const provision of semantics.provisions) {
    provision.review = { status: "confirmed", reviewed_by: "reviewer@example" };
  }
  await writeFile(semanticsPath, `${JSON.stringify(semantics, null, 2)}\n`, "utf8");

  const casesPath = path.join(dir, "conformance", "cases.yml");
  const cases = parseYaml(await readFile(casesPath, "utf8")) as {
    cases: Array<{ review: { status: string; reviewed_by: string | null } }>;
  };
  for (const testCase of cases.cases) {
    testCase.review = { status: "confirmed", reviewed_by: "reviewer@example" };
  }
  await writeFile(casesPath, stringifyYaml(cases), "utf8");

  const result = await runBuild(base({ specDir: dir, mode: "release" }));
  assert.equal(result.exitCode, 0, result.diagnostics.map((d) => d.message).join("\n"));
  assert.equal(result.written, false);
});

test("намеренно повреждённая модальность: violated из разрешения запрещён", async () => {
  const result = await runBuild(base({ specDir: fixture("broken-modality") }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "errors");
  assert.deepEqual(codes(result).filter((c) => c.startsWith("ERR_")), ["ERR_MODALITY_UPGRADE"]);
});

test("дрейф источника: legacy изменён под спецификацией", async () => {
  const dir = await copySpec("legacy-drift", (text) =>
    text.replace(
      "Эти временные метки не являются взаимозаменяемыми.",
      "Эти временные метки не являются эквивалентными.",
    ),
  );

  const result = await runBuild(base({ specDir: dir }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("ERR_SOURCE_QUOTE_NOT_FOUND"));
});

test("дрейф источника: цитата не найдена в legacy", async () => {
  const result = await runBuild(base({ specDir: fixture("broken-source-drift") }));
  assert.equal(result.exitCode, 1);
  assert.deepEqual(codes(result).filter((c) => c.startsWith("ERR_")), ["ERR_SOURCE_QUOTE_NOT_FOUND"]);
});

test("открытое решение: draft публикует с маркером, release блокирует", async () => {
  const draft = await runBuild(base({ specDir: fixture("open-decision") }));
  assert.equal(draft.exitCode, 0);
  assert.ok(codes(draft).includes("REVIEW_OPEN_NORMATIVE_DEPENDENCY"));
  assert.ok(draft.markdown?.includes("зависит от решения"));

  const release = await runBuild(base({ specDir: fixture("open-decision"), mode: "release" }));
  assert.equal(release.exitCode, 1);
  assert.equal(release.blockedBy, "review");
  assert.ok(codes(release).includes("REVIEW_OPEN_NORMATIVE_DEPENDENCY"));
});

test("strict: WARNING становится блокирующим", async () => {
  const result = await runBuild(base({ strict: true }));
  assert.equal(result.exitCode, 1);
  assert.equal(result.blockedBy, "warnings");
});

test("модальность Clause: MAY без маркера — ERR_MODALITY_MARKER", async () => {
  const dir = await copySpec("clause-marker");
  const semanticsPath = path.join(dir, "semantics.json");
  const semantics = JSON.parse(await readFile(semanticsPath, "utf8")) as {
    provisions: Array<{ exception: { source_modality: string; modality_marker: string | null } | null }>;
  };
  semantics.provisions[1]!.exception!.modality_marker = null;
  await writeFile(semanticsPath, `${JSON.stringify(semantics, null, 2)}\n`, "utf8");

  const result = await runBuild(base({ specDir: dir }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("ERR_MODALITY_MARKER"));
});

test("локатор: цитата вне объявленного раздела — ERR_SOURCE_LOCATOR_MISMATCH", async () => {
  const dir = await copySpec("locator-mismatch");
  const sourcesPath = path.join(dir, "sources.yml");
  const sources = parseYaml(await readFile(sourcesPath, "utf8")) as {
    fragments: Array<{ id: string; source_ref: string }>;
  };
  const fragment = sources.fragments.find((f) => f.id === "FRAG-10.1-P5-NO-GLOBAL-TIME");
  assert.ok(fragment);
  fragment.source_ref = "SRC-CORE001#10.2";
  await writeFile(sourcesPath, stringifyYaml(sources), "utf8");

  const semanticsPath = path.join(dir, "semantics.json");
  const semantics = JSON.parse(await readFile(semanticsPath, "utf8")) as {
    provisions: Array<{ id: string; source_ref: string }>;
  };
  const provision = semantics.provisions.find((p) => p.id === "INV-NO-GLOBAL-TRUSTED-TIME");
  assert.ok(provision);
  provision.source_ref = "SRC-CORE001#10.2";
  await writeFile(semanticsPath, `${JSON.stringify(semantics, null, 2)}\n`, "utf8");

  const result = await runBuild(base({ specDir: dir }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("ERR_SOURCE_LOCATOR_MISMATCH"));
  assert.equal(codes(result).includes("ERR_SOURCE_QUOTE_NOT_FOUND"), false);
});

test("структура: отсутствующее обязательное поле — ERR_SCHEMA", async () => {
  const dir = await copySpec("missing-field");
  const semanticsPath = path.join(dir, "semantics.json");
  const semantics = JSON.parse(await readFile(semanticsPath, "utf8")) as {
    provisions: Array<Record<string, unknown>>;
  };
  delete semantics.provisions[0]!.title;
  await writeFile(semanticsPath, `${JSON.stringify(semantics, null, 2)}\n`, "utf8");

  const result = await runBuild(base({ specDir: dir }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("ERR_SCHEMA"));
});

test("целостность: дубликат ID — ERR_DUPLICATE_ID", async () => {
  const dir = await copySpec("duplicate-id");
  const semanticsPath = path.join(dir, "semantics.json");
  const semantics = JSON.parse(await readFile(semanticsPath, "utf8")) as {
    provisions: Array<{ id: string }>;
  };
  semantics.provisions[1]!.id = semantics.provisions[0]!.id;
  await writeFile(semanticsPath, `${JSON.stringify(semantics, null, 2)}\n`, "utf8");

  const result = await runBuild(base({ specDir: dir }));
  assert.equal(result.exitCode, 1);
  assert.ok(codes(result).includes("ERR_DUPLICATE_ID"));
});

test("покрытие: у каждого положения есть вектор, violated не выводится из разрешения", async () => {
  const semantics = parseYaml(await readFile(path.join(specDir, "semantics.json"), "utf8")) as {
    provisions: Array<{ id: string }>;
  };
  const cases = parseYaml(
    await readFile(path.join(specDir, "conformance", "cases.yml"), "utf8"),
  ) as {
    cases: Array<{
      relations: { provision: string };
      expected_outcome: string;
      expectation_basis: string;
    }>;
  };

  for (const provision of semantics.provisions) {
    const related = cases.cases.filter((c) => c.relations.provision === provision.id);
    assert.ok(related.length >= 1, `у ${provision.id} нет векторов`);
  }

  for (const testCase of cases.cases) {
    if (testCase.expected_outcome === "violated") {
      assert.notEqual(testCase.expectation_basis, "permission");
      assert.notEqual(testCase.expectation_basis, "absent");
      assert.notEqual(testCase.expectation_basis, "scope_statement");
    }
  }
});

test("вывод не содержит абсолютных путей и временных меток сборки", async () => {
  const result = await runBuild(base());
  assert.ok(result.markdown);
  assert.equal(result.markdown.includes(root), false);
  assert.equal(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(result.markdown), false);
});

async function copySpec(
  name: string,
  mutateLegacy?: (text: string) => string,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `spec-${name}-`));
  for (const file of ["contract-builder.json", "sources.yml", "ontology.yml", "semantics.json", "decisions.yml"]) {
    await cp(path.join(specDir, file), path.join(dir, file));
  }
  await cp(path.join(specDir, "conformance"), path.join(dir, "conformance"), { recursive: true });
  const legacyText = await readFile(path.join(root, "CORE-001.legacy.md"), "utf8");
  await writeFile(
    path.join(dir, "legacy.md"),
    mutateLegacy === undefined ? legacyText : mutateLegacy(legacyText),
    "utf8",
  );

  const manifestPath = path.join(dir, "contract-builder.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    profile: { source: string };
    sources: Array<{ path: string; external?: boolean }>;
  };
  manifest.sources[0]!.path = "legacy.md";
  delete manifest.sources[0]!.external;
  manifest.profile.source = path.relative(dir, path.join(root, "profiles", "core001"));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return dir;
}
