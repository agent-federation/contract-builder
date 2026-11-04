import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { runBuild, type BuildResult } from "../spec/lib/build.js";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import { loadProject } from "../spec/lib/load.js";
import { loadSchemas, validateDocuments } from "../spec/lib/schema.js";
import { trustPolicyFindings } from "../profiles/core000/checks/trust-policy.js";
import { buildProjectModel, type ProjectModel } from "../spec/lib/ir.js";
import {
  prepareWorkspace,
  runHarness,
  REPO_ROOT,
  type Workspace,
} from "../contracts/core000/run.js";
import { EVIDENCE_KINDS, evidenceKind } from "../profiles/core000/view.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const projectDir = path.join(root, "contracts", "core000");
const claimsPath = path.join(projectDir, "claims.yml");

const codes = (result: BuildResult): string[] => result.diagnostics.map((item) => item.code);

function containsAbsolutePath(value: unknown): boolean {
  if (typeof value === "string") {
    return path.isAbsolute(value) || value.includes(REPO_ROOT) || value.includes(tmpdir());
  }
  if (Array.isArray(value)) return value.some(containsAbsolutePath);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).some(containsAbsolutePath);
  }
  return false;
}

const failure = (result: BuildResult): string =>
  result.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n");

async function buildModel(specDir: string): Promise<ProjectModel> {
  const diagnostics = new Diagnostics();
  const loaded = await loadProject(specDir, diagnostics);
  assert.ok(loaded !== null, diagnostics.report());
  const schemas = await loadSchemas(loaded.project, diagnostics);
  assert.ok(schemas !== null, diagnostics.report());
  assert.ok(await validateDocuments(loaded, schemas, diagnostics), diagnostics.report());
  const model = await buildProjectModel(loaded, schemas, diagnostics);
  assert.ok(model !== null, diagnostics.report());
  return model;
}

interface ClaimsDocument {
  evidence: Array<Record<string, unknown> & { id?: unknown; kind?: unknown }>;
}

function withClaims(model: ProjectModel, claims: unknown): ProjectModel {
  return { ...model, documents: { ...model.documents, claims } };
}

async function externalHumanClaimCount(): Promise<number> {
  const document = parseYaml(await readFile(claimsPath, "utf8")) as {
    claims: Array<{ lifecycle?: string; authority?: string }>;
  };
  return document.claims.filter(
    (claim) =>
      claim.lifecycle === "active" &&
      (claim.authority === "external" || claim.authority === "human"),
  ).length;
}

async function prepareN14Workspace(): Promise<{ workspace: Workspace; profileDir: string }> {
  const workspace = await prepareWorkspace();
  const profileDir = path.join(workspace.root, "profiles", "core000");

  for (const [file, marker] of [
    ["view.ts", "view.marker"],
    ["validator.ts", "validator.marker"],
  ] as const) {
    const target = path.join(profileDir, file);
    const text = await readFile(target, "utf8");
    await writeFile(
      target,
      [
        'import { writeFileSync } from "node:fs";',
        `writeFileSync(new URL("./${marker}", import.meta.url), "evaluated", "utf8");`,
        text,
      ].join("\n"),
      "utf8",
    );
  }

  return { workspace, profileDir };
}

test("S1-POS-01: the positive draft builds through runBuild with only the missing-review finding", async () => {
  const run = await runHarness({ run: "S1-POS-01" });
  const result = run.result;

  assert.equal(result.exitCode, 0, failure(result));
  assert.equal(result.blockedBy, null);
  assert.equal(result.written, false);
  assert.ok(result.identity !== null, "identity must be non-null");
  assert.ok(result.markdown !== null, "markdown must be non-null");
  assert.deepEqual([...new Set(codes(result))], ["core000.independent-verification.missing"]);
  assert.equal(result.diagnostics.length, await externalHumanClaimCount());
  assert.equal(result.diagnostics.every((diagnostic) => diagnostic.severity === "review"), true);
});

test("S1-POS-02: two separate processes produce the same identity, artifact hash and diagnostic order", () => {
  const command = ["contracts/core000/run.ts", "--mode", "draft", "--write", "false"];
  const first = spawnSync(process.execPath, [...command, "--run", "S1-POS-02a"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
  const second = spawnSync(process.execPath, [...command, "--run", "S1-POS-02b"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);

  const firstRun = JSON.parse(first.stdout) as {
    identity: { inputDigest: string } | null;
    artifactSha256: string | null;
    diagnostics: Array<{ code: string }>;
  };
  const secondRun = JSON.parse(second.stdout) as typeof firstRun;

  assert.equal(firstRun.identity?.inputDigest, secondRun.identity?.inputDigest);
  assert.equal(firstRun.artifactSha256, secondRun.artifactSha256);
  assert.deepEqual(
    firstRun.diagnostics.map((diagnostic) => diagnostic.code),
    secondRun.diagnostics.map((diagnostic) => diagnostic.code),
  );
});

test("S1-POS-03: release is blocked by the missing-review finding and writes no artifact", async () => {
  const run = await runHarness({ mode: "release", write: false, run: "S1-POS-03" });

  assert.equal(run.result.exitCode, 1);
  assert.equal(run.result.blockedBy, "review");
  assert.equal(run.result.written, false);
  assert.equal(run.evidence.artifactSha256, null);
  assert.equal(run.evidence.result.H1_self_build, "SELF_BUILD_BLOCKED");
});

test("S1-POS-04: a written draft in a temp copy passes the check run", async () => {
  const workspace = await prepareWorkspace();
  try {
    const written = await runHarness({
      specDir: workspace.projectDir,
      workspaceRoot: workspace.root,
      write: true,
      run: "S1-POS-04a",
    });
    assert.equal(written.result.exitCode, 0, failure(written.result));
    assert.equal(written.result.written, true);
    assert.equal(written.evidence.workspace.writeCheck, "only_declared_outputs");
    await access(path.join(workspace.projectDir, "output", "CORE-000.draft.md"));

    const checked = await runHarness({
      specDir: workspace.projectDir,
      workspaceRoot: workspace.root,
      check: true,
      write: false,
      run: "S1-POS-04b",
    });
    assert.equal(checked.result.exitCode, 0, failure(checked.result));
    assert.equal(codes(checked.result).includes("ERR_OUTPUT_STALE"), false);
    assert.equal(checked.result.markdown, written.result.markdown);
    assert.equal(checked.evidence.workspace.writeCheck, "only_declared_outputs");
  } finally {
    await workspace.cleanup();
  }
});

test("S1-POS-05: the claim mutation changes inputDigest and the artifact hash", async () => {
  const baseline = await runHarness({ run: "S1-POS-05-baseline" });
  const mutated = await runHarness({ mutation: "claim", run: "S1-POS-05" });

  assert.equal(baseline.result.exitCode, 0, failure(baseline.result));
  assert.equal(mutated.result.exitCode, 0, failure(mutated.result));
  assert.notEqual(
    baseline.result.identity?.inputDigest,
    mutated.result.identity?.inputDigest,
  );
  assert.notEqual(baseline.evidence.artifactSha256, mutated.evidence.artifactSha256);
  assert.ok(mutated.result.markdown?.includes("S1 identity probe"));
});

test("S1 temp workspace holds real profile/source copies with no symlink into the checkout", async () => {
  const workspace = await prepareWorkspace();
  try {
    const profiles = path.join(workspace.root, "profiles");
    const docs = path.join(workspace.root, "docs");
    assert.equal((await lstat(profiles)).isSymbolicLink(), false);
    assert.equal((await lstat(docs)).isSymbolicLink(), false);

    const profileDir = path.join(profiles, "core000");
    await access(path.join(profileDir, "profile.json"));
    await access(path.join(profileDir, "view.ts"));
    const sourcePath = path.join(docs, "architecture", "engine-public-contract.md");
    assert.equal(
      await readFile(sourcePath, "utf8"),
      await readFile(
        path.join(REPO_ROOT, "docs", "architecture", "engine-public-contract.md"),
        "utf8",
      ),
    );

    const view = await readFile(path.join(profileDir, "view.ts"), "utf8");
    const engineLib = path.join(REPO_ROOT, "spec", "lib").split(path.sep).join("/");
    assert.equal(view.includes(engineLib), true);
    assert.equal(view.includes("../../spec/lib/"), false);
  } finally {
    await workspace.cleanup();
  }
});

test("S1 workspace assertion detects an undeclared write outside the project copy", async () => {
  const workspace = await prepareWorkspace();
  try {
    const viewPath = path.join(workspace.root, "profiles", "core000", "view.ts");
    const view = await readFile(viewPath, "utf8");
    await writeFile(
      viewPath,
      [
        'import { writeFileSync } from "node:fs";',
        'writeFileSync(new URL("./view-write-marker.txt", import.meta.url), "written", "utf8");',
        view,
      ].join("\n"),
      "utf8",
    );

    const run = await runHarness({
      specDir: workspace.projectDir,
      workspaceRoot: workspace.root,
      run: "S1-workspace-write",
    });
    assert.equal(run.result.exitCode, 0, failure(run.result));
    assert.equal(run.evidence.workspace.writeCheck, "unexpected_writes");
    assert.equal(run.evidence.result.H1_self_build, "SELF_BUILD_FAILED");
    await access(path.join(workspace.root, "profiles", "core000", "view-write-marker.txt"));
  } finally {
    await workspace.cleanup();
  }
});

test("S1 the harness refuses artifact and evidence writes inside the repository", async () => {
  await assert.rejects(
    runHarness({ specDir: projectDir, write: true }),
    /repository|temporary copy/,
  );
  await assert.rejects(access(path.join(projectDir, "output", "CORE-000.draft.md")));

  const evidencePath = path.join(projectDir, "transient-evidence.json");
  await assert.rejects(runHarness({ evidencePath }), /repository|temporary copy/);
  await assert.rejects(access(evidencePath));
});

test("S1 mutations are refused on the repository project and never modify it", async () => {
  const before = await readFile(claimsPath);
  await assert.rejects(
    runHarness({ specDir: projectDir, mutation: "claim" }),
    /temporary copy/,
  );
  assert.deepEqual(await readFile(claimsPath), before);
});

const NEGATIVE_CASES = [
  ["N2", "unresolved-subject", "ERR_UNKNOWN_REF"],
  ["N3", "implemented-without-evidence", "core000.claim.implemented-without-evidence"],
  ["N8", "quote-outside", "core000.source.verification-failed"],
  ["N11", "decision-missing", "core000.claim.decision-required"],
] as const;

for (const [id, mutation, expectedCode] of NEGATIVE_CASES) {
  test(`S1 ${id}: one mutation produces ${expectedCode}, blockedBy errors, and no artifact`, async () => {
    const workspace = await prepareWorkspace();
    try {
      const run = await runHarness({
        specDir: workspace.projectDir,
        workspaceRoot: workspace.root,
        write: true,
        mutation,
        run: id,
      });

      assert.equal(run.result.exitCode, 1, failure(run.result));
      assert.equal(run.result.blockedBy, "errors");
      assert.equal(run.result.written, false);
      assert.ok(codes(run.result).includes(expectedCode), failure(run.result));
      assert.equal(run.evidence.artifactSha256, null);
      assert.equal(run.evidence.workspace.writeCheck, "only_declared_outputs");
      assert.equal(run.evidence.result.H1_self_build, "SELF_BUILD_BLOCKED");
      await assert.rejects(access(path.join(workspace.projectDir, "output", "CORE-000.draft.md")));
    } finally {
      await workspace.cleanup();
    }
  });
}

test("S1 N14: the CLI without consent fails closed before any profile module is evaluated", async () => {
  const { workspace, profileDir } = await prepareN14Workspace();
  try {
    const cli = spawnSync(
      process.execPath,
      ["spec/build.ts", "--spec", workspace.projectDir, "--no-write", "--json"],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 120_000 },
    );
    assert.equal(cli.status, 1, cli.stderr);
    const payload = JSON.parse(cli.stdout) as {
      exitCode: number;
      blockedBy: string | null;
      written: boolean;
      identity: unknown;
      diagnostics: Array<{ code: string }>;
    };
    assert.equal(payload.exitCode, 1);
    assert.equal(payload.blockedBy, "errors");
    assert.equal(payload.written, false);
    assert.equal(payload.identity, null);
    assert.ok(payload.diagnostics.some((item) => item.code === "core.profile.consent-required"));

    // The CLI JSON omits `markdown`; the same consent gate through runBuild exposes it directly.
    const direct = await runBuild({
      specDir: workspace.projectDir,
      mode: "draft",
      write: false,
      check: false,
      strict: false,
    });
    assert.equal(direct.exitCode, 1);
    assert.equal(direct.blockedBy, "errors");
    assert.equal(direct.identity, null);
    assert.equal(direct.markdown, null);
    assert.ok(codes(direct).includes("core.profile.consent-required"));

    await assert.rejects(access(path.join(profileDir, "view.marker")));
    await assert.rejects(access(path.join(profileDir, "validator.marker")));
  } finally {
    await workspace.cleanup();
  }
});

test("S1 evidence: the transient record matches the approved shape and leaks no absolute path", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "core000-evidence-"));
  try {
    const evidencePath = path.join(directory, "result.json");
    await runHarness({ evidencePath, run: "S1-EVIDENCE" });
    const raw = await readFile(evidencePath, "utf8");
    const evidence = JSON.parse(raw) as Record<string, unknown>;

    for (const key of [
      "schema",
      "run",
      "hypothesis",
      "commit",
      "project",
      "mode",
      "allowExecutableProfile",
      "environment",
      "command",
      "exitCode",
      "blockedBy",
      "written",
      "output",
      "identity",
      "artifactSha256",
      "diagnostics",
      "expected",
      "sourceRepositoryClean",
      "workspace",
      "result",
      "classification",
      "limitations",
    ]) {
      assert.ok(key in evidence, `missing evidence field: ${key}`);
    }

    assert.equal(evidence.schema, "core000-run-evidence/0.1");
    assert.equal(evidence.project, "contracts/core000");
    assert.equal(evidence.allowExecutableProfile, true);
    assert.equal(evidence.exitCode, 0);
    assert.equal(evidence.blockedBy, null);
    assert.equal(evidence.written, false);
    assert.equal(evidence.output, "output/CORE-000.draft.md");
    assert.match(String(evidence.artifactSha256), /^sha256:[0-9a-f]{64}$/);
    assert.equal(typeof evidence.sourceRepositoryClean, "boolean");

    const result = evidence.result as Record<string, unknown>;
    assert.equal(result.H1_self_build, "SELF_BUILD_COMPLETED");
    assert.equal(result.H2_reproducibility, "NOT_TESTED");
    assert.equal(result.H3_independent_verification, "NOT_PERFORMED");

    const workspace = evidence.workspace as Record<string, unknown>;
    assert.equal(workspace.writeCheck, "only_declared_outputs");
    assert.equal(workspace.cleanup, "completed");

    assert.equal(containsAbsolutePath(evidence), false, "evidence must not contain an absolute path");
    assert.equal(/\/home\/|\/Users\//.test(raw), false);

    const blockedPath = path.join(directory, "blocked.json");
    await runHarness({
      mutation: "implemented-without-evidence",
      evidencePath: blockedPath,
      run: "N3-EVIDENCE",
    });
    const blocked = JSON.parse(await readFile(blockedPath, "utf8")) as {
      artifactSha256: string | null;
      result: { H1_self_build: string };
    };
    assert.equal(blocked.result.H1_self_build, "SELF_BUILD_BLOCKED");
    assert.equal(blocked.artifactSha256, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("S1 evidence kind: the profile-local accessor covers every permitted kind and fails closed", async () => {
  const workspace = await prepareWorkspace();
  try {
    const model = await buildModel(workspace.projectDir);
    const claims = model.documents["claims"] as ClaimsDocument;
    assert.ok(Array.isArray(claims.evidence));

    const ids = [
      "EV-TRUST-CODE",
      "EV-TRUST-TEST",
      "EV-CONSENT-CODE",
      "EV-CONSENT-TEST",
      "EV-MANIFEST-CODE",
      "EV-MANIFEST-TEST",
      "EV-PROVENANCE-CODE",
    ];
    const allKinds = claims.evidence.map((entry, index) => ({
      ...entry,
      kind: EVIDENCE_KINDS[index] ?? entry.kind,
    }));
    const modelWithKinds = withClaims(model, { ...claims, evidence: allKinds });

    for (const [index, kind] of EVIDENCE_KINDS.entries()) {
      assert.deepEqual(evidenceKind(modelWithKinds, ids[index]!), { ok: true, kind });
    }

    assert.deepEqual(
      evidenceKind(
        withClaims(model, {
          ...claims,
          evidence: allKinds.filter((entry) => entry.id !== "EV-TRUST-CODE"),
        }),
        "EV-TRUST-CODE",
      ),
      { ok: false, reason: "missing" },
    );

    assert.deepEqual(
      evidenceKind(
        withClaims(model, { ...claims, evidence: [...allKinds, { ...allKinds[0]! }] }),
        "EV-TRUST-CODE",
      ),
      { ok: false, reason: "duplicate" },
    );

    assert.deepEqual(
      evidenceKind(
        withClaims(model, {
          ...claims,
          evidence: [{ ...allKinds[0]!, kind: "bogus" }, ...allKinds.slice(1)],
        }),
        "EV-TRUST-CODE",
      ),
      { ok: false, reason: "malformed" },
    );

    assert.deepEqual(evidenceKind(model, "C000-TR-001"), {
      ok: false,
      reason: "not-evidence",
    });
    assert.deepEqual(
      evidenceKind(
        { ...model, documents: { ...model.documents, claims: {} } },
        "EV-TRUST-CODE",
      ),
      { ok: false, reason: "document-unavailable" },
    );
  } finally {
    await workspace.cleanup();
  }
});

interface ProfileDeclaration {
  entityKinds: Record<string, unknown>;
  schemas: Record<string, string>;
  relations: Array<{
    name: string;
    from: string;
    to: string;
    cardinality?: string;
    inverse?: string;
  }>;
  files: string[];
}

const profilePath = path.join(root, "profiles", "core000", "profile.json");

async function readProfileDeclaration(): Promise<ProfileDeclaration> {
  return JSON.parse(await readFile(profilePath, "utf8")) as ProfileDeclaration;
}

async function profileDirectoryFiles(): Promise<string[]> {
  const profileDir = path.join(root, "profiles", "core000");
  const entries = await readdir(profileDir, { recursive: true });
  const files: string[] = [];
  for (const entry of entries) {
    const parts = entry.split(path.sep);
    // Ignore OS metadata such as .DS_Store; it is not part of the declared profile closure.
    if (parts.some((part) => part.startsWith("."))) continue;
    const full = path.join(profileDir, entry);
    if ((await lstat(full)).isFile()) files.push(parts.join("/"));
  }
  return files.sort();
}

test("S2.1 Slice 1 profile declaration surface", async () => {
  const profile = await readProfileDeclaration();

  assert.deepEqual(
    Object.keys(profile.entityKinds).sort(),
    [
      "claim",
      "component",
      "conformance_case",
      "decision",
      "dependency",
      "diagnostic",
      "evidence",
      "extension_point",
      "independent_verification",
      "interface",
      "phase",
      "source_statement",
      "transition",
      "trust_boundary",
    ].sort(),
  );
  assert.equal(Object.keys(profile.schemas).length, 16);
  assert.equal(profile.relations.length, 29);
  assert.equal(profile.files.length, 25);

  const byKey = new Map(
    profile.relations.map((relation) => [`${relation.from}.${relation.name}`, relation]),
  );
  for (const relation of profile.relations) {
    if (relation.inverse === undefined) continue;
    const inverse = byKey.get(`${relation.to}.${relation.inverse}`);
    assert.ok(inverse, `missing inverse ${relation.inverse} for ${relation.name}`);
    assert.equal(inverse.from, relation.to);
    assert.equal(inverse.to, relation.from);
    assert.equal(inverse.inverse, relation.name);
  }

  assert.equal(
    profile.relations.find((relation) => relation.name === "subject")?.inverse,
    undefined,
  );
  for (const name of ["startsAt", "endsAt", "raisedIn", "hasPrerequisite"]) {
    assert.equal(profile.relations.find((relation) => relation.name === name)?.inverse, undefined);
  }

  assert.deepEqual(
    profile.relations
      .filter((relation) => relation.cardinality === "one")
      .map((relation) => relation.name)
      .sort(),
    ["endsAt", "loadedBy", "raisedIn", "startsAt"],
  );
  assert.deepEqual(
    profile.relations.filter((relation) => relation.to === "*").map((relation) => relation.name),
    ["subject"],
  );
  assert.deepEqual(
    profile.relations.find((relation) => relation.name === "hasPrerequisite"),
    { name: "hasPrerequisite", from: "phase", to: "phase", cardinality: "many" },
  );

  assert.deepEqual(await profileDirectoryFiles(), [...profile.files].sort());
});

test("S2.1 Slice 1 schemas load and validate each new kind", async () => {
  const profile = await readProfileDeclaration();
  const diagnostics = new Diagnostics();
  const loaded = await loadProject(projectDir, diagnostics);
  assert.ok(loaded !== null, diagnostics.report());
  const schemas = await loadSchemas(loaded.project, diagnostics);
  assert.ok(schemas !== null, diagnostics.report());

  const ids = new Set<string>();
  for (const relative of Object.values(profile.schemas)) {
    const schema = JSON.parse(
      await readFile(path.join(root, "profiles", "core000", relative), "utf8"),
    ) as { $id?: unknown };
    assert.equal(typeof schema.$id, "string", `${relative} must declare $id`);
    ids.add(schema.$id as string);
  }
  assert.equal(ids.size, 16);

  const examples: Record<string, { valid: Record<string, unknown>; missing: string }> = {
    "core000:phase": {
      valid: { id: "PH-T", name: "t", guarantee: "g", not_guaranteed: "n" },
      missing: "guarantee",
    },
    "core000:transition": {
      valid: { id: "TR-T", condition: "c", description: "d" },
      missing: "condition",
    },
    "core000:dependency": {
      valid: { id: "bun", name: "Bun", kind: "runtime", status: "declared" },
      missing: "status",
    },
    "core000:extension-point": {
      valid: {
        id: "EXT-T",
        name: "x",
        mechanism: "dynamic_import",
        trust: "trusted_in_process",
        status: "implemented",
      },
      missing: "trust",
    },
    "core000:diagnostic": {
      valid: {
        id: "core000.test",
        code: "core000.test",
        severity: "error",
        phase: "PH-LOAD",
        message: "m",
        status: "declared",
      },
      missing: "phase",
    },
    "core000:conformance-case": {
      valid: { id: "CC-T", kind: "positive", input: "i", expected: "e", status: "planned" },
      missing: "expected",
    },
  };

  for (const [schemaId, example] of Object.entries(examples)) {
    const validate = schemas.get(schemaId);
    assert.ok(validate, `missing schema ${schemaId}`);
    assert.equal(validate(example.valid), true, JSON.stringify(validate.errors));
    const invalid = { ...example.valid };
    delete invalid[example.missing];
    assert.equal(validate(invalid), false, `${schemaId} must reject a missing ${example.missing}`);
  }
});

test("S2.1 Slice 1 project still builds with the S1 data", async () => {
  const model = await buildModel(projectDir);

  assert.equal(Object.keys(model.profile.entityKinds).length, 14);
  assert.equal(model.profile.relations?.length, 29);
  assert.equal(model.profile.files?.length, 25);
  for (const kind of [
    "phase",
    "transition",
    "dependency",
    "extension_point",
    "diagnostic",
    "conformance_case",
  ]) {
    assert.equal((model.byKind.get(kind) ?? []).length, 0, `${kind} must have no S1 data`);
  }
});

test("S2.1 trust consent facts apply only to the executable-profile boundary", async () => {
  const model = await buildModel(projectDir);

  const withBoundaries = (
    boundaries: Array<{ id: string; policy_status: string; enforcement: string }>,
  ) =>
    ({
      ...model,
      byKind: new Map(model.byKind)
        .set("claim", [])
        .set(
          "trust_boundary",
          boundaries.map((boundary) => ({
            id: boundary.id,
            kind: "trust_boundary",
            fields: {
              policy_status: boundary.policy_status,
              enforcement: boundary.enforcement,
            },
            relations: {},
          })),
        ),
    }) as ProjectModel;

  const invalidProfile = withBoundaries([
    { id: "TB-PROFILE-EXEC", policy_status: "settled", enforcement: "none" },
  ]);
  assert.deepEqual(
    trustPolicyFindings(invalidProfile).map((finding) => ({
      code: finding.code,
      entityId: finding.entityId,
    })),
    [{ code: "core000.trust.consent-facts", entityId: "TB-PROFILE-EXEC" }],
  );

  const unrelatedBoundary = withBoundaries([
    { id: "TB-PROFILE-EXEC", policy_status: "settled", enforcement: "explicit_consent" },
    { id: "TB-CONSUMER-EXTENSION", policy_status: "settled", enforcement: "none" },
  ]);
  assert.deepEqual(trustPolicyFindings(unrelatedBoundary), []);
});
