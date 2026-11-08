import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assembleBatch,
  extractArchive,
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

test("an out-of-expected independent verdict fails the batch", () => {
  for (const [verdict, exitCode] of [
    ["FAIL", 1],
    ["UNTRUSTED", 3],
    ["NOT_EVALUATED", 2],
  ] as const) {
    const executions = replaceExecution(
      defaultExecutions(),
      executionFor("rust", reportFor("rust", { verdict }), exitCode),
    );
    const { batch, problems } = assembleBatch(optionsWith(executions));
    assert.equal(batch.ok, false);
    assert.ok(
      problems.some((problem) =>
        problem.includes("outside the expected Phase 2a set"),
      ),
      problems.join("\n"),
    );
  }
});

test("a verdict/check-outcome contradiction fails the batch", () => {
  const passWithUnsupportedCheck = replaceExecution(
    defaultExecutions(),
    executionFor(
      "rust",
      reportFor("rust", { verdict: "PASS", checkOutcome: "UNSUPPORTED" }),
      0,
    ),
  );
  const passResult = assembleBatch(optionsWith(passWithUnsupportedCheck));
  assert.equal(passResult.batch.ok, false);
  assert.ok(
    passResult.problems.some((problem) =>
      problem.includes("verdict PASS contradicts required check"),
    ),
    passResult.problems.join("\n"),
  );

  const unsupportedWithFailCheck = replaceExecution(
    defaultExecutions(),
    executionFor(
      "rust",
      reportFor("rust", { verdict: "UNSUPPORTED", checkOutcome: "FAIL" }),
      4,
    ),
  );
  const failResult = assembleBatch(optionsWith(unsupportedWithFailCheck));
  assert.equal(failResult.batch.ok, false);
  assert.ok(
    failResult.problems.some((problem) =>
      problem.includes("requires verdict FAIL"),
    ),
    failResult.problems.join("\n"),
  );
});

test("a check-level disagreement fails the batch", () => {
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor(
      "rust",
      reportFor("rust", { verdict: "UNSUPPORTED", checkOutcome: "FAIL" }),
      4,
    ),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.equal(batch.comparison.checkAgreement, false);
  assert.ok(
    problems.some((problem) =>
      problem.includes("check-level disagreement on pap.check.digest-integrity/1"),
    ),
    problems.join("\n"),
  );
});

test("UNSUPPORTED, NOT_EVALUATED and ABSENT are not check disagreements", () => {
  const executions = defaultExecutions().map((execution) => {
    if (execution.name === "rust") {
      return executionFor(
        "rust",
        reportFor("rust", { verdict: "PASS", checkOutcome: "PASS" }),
        0,
      );
    }
    if (execution.name === "go") {
      return executionFor(
        "go",
        reportFor("go", { verdict: "INCOMPLETE", checkOutcome: "NOT_EVALUATED" }),
        2,
      );
    }
    return execution;
  });
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.deepEqual(problems, []);
  assert.equal(batch.comparison.checkAgreement, true);
  assert.equal(batch.ok, true);
});

test("the batch records package input file types", () => {
  const { batch } = assembleBatch(optionsWith(defaultExecutions()));
  assert.deepEqual(batch.package.fileTypes, {
    "artifacts/CORE-000.draft.md": "file",
    "assurance-package.json": "file",
  });
});

test("a batch without recorded package file types fails closed", () => {
  const { packageFileTypes: _omitted, ...withoutTypes } = optionsWith(
    defaultExecutions(),
  );
  const { batch, problems } = assembleBatch(withoutTypes);
  assert.equal(batch.ok, false);
  assert.ok(
    problems.some((problem) => problem.includes("package file types were not recorded")),
    problems.join("\n"),
  );
});

test("evidence rendering refuses an invalid batch", () => {
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor(
      "rust",
      reportFor("rust", { verdict: "UNSUPPORTED", checkOutcome: "FAIL" }),
      4,
    ),
  );
  const { batch } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.throws(
    () => renderEvidenceMarkdown(batch),
    /refusing to render evidence from a batch that is not ok/,
  );
});

test("an independent dimension disagreement fails the batch", () => {
  const broken = reportFor("go") as {
    dimensions: { integrity: { artifacts: string } };
  } & Record<string, unknown>;
  broken.dimensions.integrity.artifacts = "FAIL";
  const executions = replaceExecution(
    defaultExecutions(),
    executionFor("go", broken, 4),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.equal(batch.ok, false);
  assert.equal(batch.comparison.integrityAndSourcesAgreement, false);
  assert.ok(
    problems.some((problem) => problem.includes("do not agree")),
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

test("the evidence prose follows an independent PASS verdict", () => {
  const executions = defaultExecutions().map((execution) =>
    execution.name === "reference"
      ? execution
      : executionFor(
          execution.name,
          reportFor(execution.name, {
            verdict: "PASS",
            checkOutcome: "PASS",
          }),
          0,
        ),
  );
  const { batch, problems } = assembleBatch(optionsWith(executions));
  assert.deepEqual(problems, []);
  assert.equal(batch.ok, true);
  const markdown = renderEvidenceMarkdown(batch);
  assert.match(markdown, /At least one independent implementation evaluated/);
  assert.doesNotMatch(markdown, /Phase 2a only/);
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
  assert.match(
    markdown,
    /The reference verifier reports `PASS` \(exit 0\)/,
  );
  assert.match(
    markdown,
    /The independent verdicts are rust: UNSUPPORTED, go: UNSUPPORTED, python: UNSUPPORTED/,
  );
  assert.match(markdown, /path-dependent/);
  assert.match(markdown, /not a required status/);
  for (const entry of batch.verifiers) {
    assert.match(markdown, new RegExp(entry.reportSha256 ?? "missing-hash"));
  }
});

function tar(args: readonly string[], cwd: string): void {
  const result = spawnSync("tar", [...args], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test(
  "archive extraction rejects an absolute symbolic-link target before writing",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "c6-archive-symlink-abs-"));
    try {
      const source = path.join(root, "source", "owner-repo-sha");
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, "real.txt"), "real\n");
      await symlink("/etc/passwd", path.join(source, "escape"));
      const archive = path.join(root, "evil.tar.gz");
      tar(["-czf", archive, "owner-repo-sha"], path.join(root, "source"));

      const destination = path.join(root, "extracted");
      await assert.rejects(
        extractArchive(archive, destination),
        /archive symbolic link has an absolute target/,
      );
      await assert.rejects(
        access(destination),
        "a rejected archive must not create the destination",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "archive extraction rejects a relative symbolic link that escapes the destination",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "c6-archive-symlink-rel-"));
    try {
      const source = path.join(root, "source", "owner-repo-sha");
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, "real.txt"), "real\n");
      await symlink("../../outside-target", path.join(source, "escape"));
      const archive = path.join(root, "evil.tar.gz");
      tar(["-czf", archive, "owner-repo-sha"], path.join(root, "source"));

      await assert.rejects(
        extractArchive(archive, path.join(root, "extracted")),
        /symbolic link that escapes its destination/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "archive extraction allows a contained symbolic link",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "c6-archive-symlink-ok-"));
    try {
      const source = path.join(root, "source", "owner-repo-sha");
      await mkdir(source, { recursive: true });
      await writeFile(path.join(source, "real.txt"), "real\n");
      await symlink("real.txt", path.join(source, "inside"));
      const archive = path.join(root, "regular.tar.gz");
      tar(["-czf", archive, "owner-repo-sha"], path.join(root, "source"));

      const destination = path.join(root, "extracted");
      await extractArchive(archive, destination);
      assert.equal(
        await readFile(path.join(destination, "inside"), "utf8"),
        "real\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "archive extraction rejects an absolute path before writing",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "c6-archive-absolute-"));
    try {
      const source = path.join(root, "source");
      await mkdir(source);
      const absolute = path.join(source, "absolute.txt");
      await writeFile(absolute, "absolute\n");
      const archive = path.join(root, "evil.tar.gz");
      tar(["-P", "-czf", archive, absolute], root);
      const listing = spawnSync("tar", ["-tzf", archive], { encoding: "utf8" });
      assert.equal(listing.status, 0, listing.stderr);
      assert.ok(
        listing.stdout.startsWith("/"),
        "the fixture must contain an absolute path",
      );

      const destination = path.join(root, "extracted");
      await assert.rejects(
        extractArchive(archive, destination),
        /archive contains an absolute path/,
      );
      await assert.rejects(access(destination));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "archive extraction accepts a regular top-level-directory archive",
  { skip: process.platform === "win32" },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "c6-archive-regular-"));
    try {
      const source = path.join(root, "source", "owner-repo-sha");
      await mkdir(path.join(source, "src"), { recursive: true });
      await writeFile(path.join(source, "src", "main.txt"), "main\n");
      const archive = path.join(root, "regular.tar.gz");
      tar(["-czf", archive, "owner-repo-sha"], path.join(root, "source"));

      const destination = path.join(root, "extracted");
      await extractArchive(archive, destination);
      assert.equal(
        await readFile(path.join(destination, "src", "main.txt"), "utf8"),
        "main\n",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
