import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assembleBatch,
  INDEPENDENT_PINS,
  PINNED_NOW,
  parseVerifierReport,
  REQUIRED_CHECKS,
  VERIFIER_ORDER,
  type AssembleOptions,
  type Verdict,
  type VerifierExecution,
  type VerifierName,
} from "../independent.js";
import { renderEvidenceMarkdown } from "../evidence.js";

const PACKAGE_DIR = "/tmp/c6-test/package";
const POLICY_PATH = "/tmp/c6-test/policy/core000-trust-policy.json";
const NOW = PINNED_NOW;
const IDENTITY = `sha256:${"a".repeat(64)}`;
const POLICY_ID = "policy-core000-unsigned-2026-11";
const POLICY_DIGEST = `sha256:${"b".repeat(64)}`;
const COMMIT = "c".repeat(40);
const REFERENCE_DIGEST = `sha256:${"9".repeat(64)}`;

const MANIFEST = `${JSON.stringify(
  {
    papVersion: "0.1",
    build: {
      engineVersion: "0.1.0",
      manifestVersion: "0.1",
      inputDigest: `sha256:${"d".repeat(64)}`,
      normalizedInputDigest: `sha256:${"e".repeat(64)}`,
      extensions: [{ id: "core000", kind: "profile", version: "0.1.0" }],
    },
    artifacts: [
      {
        id: "artifact:core000-draft",
        path: "artifacts/CORE-000.draft.md",
        digest: `sha256:${"f".repeat(64)}`,
      },
    ],
    sources: [
      {
        id: "SRC-ENGINE-CONTRACT",
        path: "sources/engine-public-contract.md",
        digest: `sha256:${"1".repeat(64)}`,
        acquisition: { method: "git", revision: COMMIT },
      },
    ],
  },
  null,
  2,
)}\n`;

const MANIFEST_DIGEST = createHash("sha256").update(MANIFEST).digest("hex");

interface ReportOverrides {
  readonly identity: string;
  readonly verdict: Verdict;
  readonly id: string;
  readonly version: string;
  readonly implementationDigest: string;
  readonly evaluatedAt: string;
  readonly packagePath: string;
  readonly policyPath: string;
  readonly policyDigest: string;
  readonly checkOutcome: string;
}

function reportFor(
  name: VerifierName,
  overrides: Partial<ReportOverrides> = {},
): Record<string, unknown> {
  const independent = INDEPENDENT_PINS.find((pin) => pin.name === name);
  const id = overrides.id ?? independent?.id ?? "pap.verifier.reference";
  const version = overrides.version ?? independent?.version ?? "0.1.0";
  const implementationDigest =
    overrides.implementationDigest ??
    independent?.implementationDigest ??
    REFERENCE_DIGEST;
  const verdict =
    overrides.verdict ?? (name === "reference" ? "PASS" : "UNSUPPORTED");
  const checkOutcome =
    overrides.checkOutcome ?? (name === "reference" ? "PASS" : "UNSUPPORTED");
  const checks = Object.fromEntries(
    REQUIRED_CHECKS.map((checkId) => [checkId, checkOutcome]),
  );
  return {
    reportVersion: "0.1",
    verifier: {
      id,
      version,
      implementationDigest,
      checkerIdentities: [`sha256:${"7".repeat(64)}`],
    },
    verdict,
    evaluatedAt: overrides.evaluatedAt ?? NOW,
    identities: {
      packageIdentity: overrides.identity ?? IDENTITY,
      artifacts: [],
      sources: [],
      checkerIdentity: `sha256:${"7".repeat(64)}`,
    },
    package: {
      identity: overrides.identity ?? IDENTITY,
      papVersion: "0.1",
      path: overrides.packagePath ?? PACKAGE_DIR,
    },
    policy: {
      id: POLICY_ID,
      digest: overrides.policyDigest ?? POLICY_DIGEST,
      path: overrides.policyPath ?? POLICY_PATH,
      state: "FRESH",
    },
    dimensions: {
      integrity: { package: "PASS", artifacts: "PASS" },
      sources: { availability: "PASS", integrity: "PASS" },
      trust: { policyDecision: "NOT_EVALUATED" },
      checks: {
        results: REQUIRED_CHECKS.map((checkId) => ({
          checkId,
          outcome: checks[checkId],
          required: true,
        })),
      },
    },
    checks:
      name === "reference"
        ? REQUIRED_CHECKS.map((checkId) => ({
            checkId,
            outcome: checks[checkId],
          }))
        : [],
  };
}

function executionFor(
  name: VerifierName,
  report: unknown,
  exitCode: number,
): VerifierExecution {
  return {
    name,
    exitCode,
    stdout: JSON.stringify(report),
    stderr: "",
  };
}

function defaultExecutions(): VerifierExecution[] {
  return VERIFIER_ORDER.map((name) =>
    executionFor(
      name,
      reportFor(name),
      name === "reference" ? 0 : 4,
    ),
  );
}

function optionsWith(
  executions: readonly VerifierExecution[],
): AssembleOptions {
  return {
    now: NOW,
    packageDir: PACKAGE_DIR,
    policyPath: POLICY_PATH,
    manifestText: MANIFEST,
    packageFileDigests: {
      "assurance-package.json": MANIFEST_DIGEST,
      "artifacts/CORE-000.draft.md": `sha256:${"f".repeat(64)}`,
    },
    executions,
  };
}

function replaceExecution(
  executions: readonly VerifierExecution[],
  replaced: VerifierExecution,
): VerifierExecution[] {
  return executions.map((entry) =>
    entry.name === replaced.name ? replaced : entry,
  );
}

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
