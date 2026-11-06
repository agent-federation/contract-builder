import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assembleBatch,
  parseVerifierReport,
} from "../independent.js";
import { renderEvidenceMarkdown } from "../evidence.js";
import {
  COMMIT,
  IDENTITY,
  MANIFEST_DIGEST,
  NOW,
  POLICY_ID,
  defaultExecutions,
  executionFor,
  optionsWith,
  replaceExecution,
  reportFor,
} from "./support.js";

test("a valid batch agrees on packageIdentity and records UNSUPPORTED as executed", () => {
  const { batch, problems } = assembleBatch(optionsWith(defaultExecutions()));
  assert.deepEqual(problems, []);
  assert.equal(batch.ok, true);
  assert.equal(batch.contractBuilderCommit, COMMIT);
  assert.equal(batch.pinnedNow, NOW);
  assert.equal(batch.package.identity, IDENTITY);
  assert.equal(batch.package.manifestSha256, MANIFEST_DIGEST);
  assert.equal(batch.comparison.samePackageIdentity, true);
  assert.equal(batch.comparison.referenceVerdict, "PASS");
  assert.deepEqual(batch.comparison.independentVerdicts, {
    rust: "UNSUPPORTED",
    go: "UNSUPPORTED",
    python: "UNSUPPORTED",
  });
  assert.equal(batch.comparison.integrityAndSourcesAgreement, true);
  assert.equal(batch.verifiers.length, 4);
  for (const entry of batch.verifiers) {
    assert.equal(entry.status, "EXECUTED");
    assert.match(entry.reportSha256 ?? "", /^[0-9a-f]{64}$/);
    assert.equal(entry.evaluatedAt, NOW);
  }
  assert.equal(batch.trustPolicy.id, POLICY_ID);
  assert.equal(batch.trustPolicy.sha256, "b".repeat(64));
});

test("INCOMPLETE is recorded, not converted to PASS", () => {
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor("rust", reportFor("rust", { verdict: "INCOMPLETE" }), 2),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.deepEqual(problems, []);
  assert.equal(batch.ok, true);
  assert.equal(batch.comparison.independentVerdicts.rust, "INCOMPLETE");
  assert.notEqual(batch.comparison.independentVerdicts.rust, "PASS");
});

test("a packageIdentity disagreement is a problem", () => {
  const other = `sha256:${"2".repeat(64)}`;
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor("go", reportFor("go", { identity: other }), 4),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.equal(batch.comparison.samePackageIdentity, false);
  assert.ok(
    problems.some((problem) => problem.includes("packageIdentity disagreement")),
    problems.join("\n"),
  );
});

test("a pinned implementationDigest mismatch is a problem", () => {
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor(
      "rust",
      reportFor("rust", { implementationDigest: `sha256:${"0".repeat(64)}` }),
      4,
    ),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.ok(
    problems.some((problem) =>
      problem.includes("implementationDigest") && problem.includes("pin"),
    ),
    problems.join("\n"),
  );
});

test("a missing report is recorded as NOT_PERFORMED and fails the batch", () => {
  const executions = defaultExecutions().filter(
    (execution) => execution.name !== "python",
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  const python = batch.verifiers.find((entry) => entry.verifier === "python");
  assert.equal(python?.status, "NOT_PERFORMED");
  assert.ok(
    problems.some((problem) => problem.includes("python: not performed")),
    problems.join("\n"),
  );
});

test("an unparseable report is recorded as NOT_PERFORMED and fails the batch", () => {
  const executions = replaceExecution(
    defaultExecutions(),
    {
      name: "python",
      exitCode: 4,
      stdout: "{not json",
      stderr: "",
    },
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  const python = batch.verifiers.find((entry) => entry.verifier === "python");
  assert.equal(python?.status, "NOT_PERFORMED");
  assert.ok(
    problems.some((problem) => problem.includes("report parse failure")),
    problems.join("\n"),
  );
});

test("an exit code that contradicts the report verdict is a problem", () => {
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor("rust", reportFor("rust"), 1),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.ok(
    problems.some((problem) => problem.includes("does not match report verdict")),
    problems.join("\n"),
  );
});

test("the reference report must be PASS", () => {
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor("reference", reportFor("reference", { verdict: "FAIL" }), 1),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.ok(
    problems.some((problem) => problem.includes("expected PASS")),
    problems.join("\n"),
  );
});

test("recorded input mutations fail the batch", () => {
  const mutations = [
    "rust: package file was modified: artifacts/CORE-000.draft.md",
  ];
  const { batch } = assembleBatch({
    ...optionsWith(defaultExecutions()),
    extraProblems: ["cannot make package/policy inputs read-only: EPERM"],
    inputIntegrity: { readOnlyDuringRuns: false, mutations },
  });
  assert.equal(batch.ok, false);
  assert.deepEqual(batch.inputIntegrity.mutations, mutations);
  assert.equal(batch.inputIntegrity.readOnlyDuringRuns, false);
  assert.ok(
    batch.problems.some((problem) =>
      problem.includes("package file was modified"),
    ),
    batch.problems.join("\n"),
  );
  assert.ok(
    batch.problems.some((problem) => problem.includes("read-only")),
    batch.problems.join("\n"),
  );
});

test("a report without package.papVersion is a problem", () => {
  const broken = reportFor("go") as {
    package: Record<string, unknown>;
  } & Record<string, unknown>;
  delete broken.package.papVersion;
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor("go", broken, 4),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.ok(
    problems.some((problem) => problem.includes("package.papVersion is missing")),
    problems.join("\n"),
  );
});

test("all four runs must use the same pinned --now", () => {
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor(
      "go",
      reportFor("go", { evaluatedAt: "2026-11-07T00:00:00Z" }),
      4,
    ),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.ok(
    problems.some((problem) => problem.includes("pinned --now")),
    problems.join("\n"),
  );
});

test("all four reports must carry the same absolute package and policy paths", () => {
  const otherPath = "/tmp/c6-other/package";
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor("rust", reportFor("rust", { packagePath: otherPath }), 4),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.ok(
    problems.some((problem) => problem.includes("not the run package path")),
    problems.join("\n"),
  );
});

test("report hashes are taken from the exact verifier stdout", () => {
  const executions = defaultExecutions();
  const { batch } = assembleBatch(optionsWith(executions));
  for (const entry of batch.verifiers) {
    const execution = executions.find(
      (candidate) => candidate.name === entry.verifier,
    );
    assert.ok(execution);
    const expected = createHash("sha256")
      .update(execution.stdout)
      .digest("hex");
    assert.equal(entry.reportSha256, expected);
  }
});

test("parseVerifierReport rejects empty and invalid output", () => {
  assert.throws(() => parseVerifierReport("", "rust"), /wrote no report/);
  assert.throws(() => parseVerifierReport("{not json", "rust"), /not valid JSON/);
});

test("the evidence record is deterministic and states the trust boundary", () => {
  const { batch } = assembleBatch(optionsWith(defaultExecutions()));
  const markdown = renderEvidenceMarkdown(batch);
  assert.equal(renderEvidenceMarkdown(batch), markdown);
  assert.match(markdown, new RegExp(COMMIT));
  assert.match(markdown, new RegExp(IDENTITY));
  assert.match(markdown, new RegExp(MANIFEST_DIGEST));
  assert.match(markdown, /e5da9ac404547579d184d2f47d33c1e1ac866495/);
  assert.match(markdown, /0539d883aed7a07fe19a3e83187c6a172daf1e4a7637231de6c64339a0f33b68/);
  assert.match(markdown, /0b31dac728fbfdfab4f2948ccede3b5957b17fc9/);
  assert.match(markdown, /Phase 2b/);
  assert.match(markdown, /UNSUPPORTED/);
  assert.match(markdown, /path-dependent/);
  assert.match(markdown, /not a required status/);
  for (const entry of batch.verifiers) {
    assert.match(markdown, new RegExp(entry.reportSha256 ?? "missing-hash"));
  }
});
