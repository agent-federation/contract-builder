import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assembleBatch,
  makeInputsReadOnly,
  makeInputsWritable,
  snapshotInputs,
  verifyInputsUnchanged,
} from "../independent.js";
import { MANIFEST, NOW, executionsForPaths } from "./support.js";

interface Fixture {
  readonly root: string;
  readonly packageDir: string;
  readonly policyPath: string;
  readonly artifactPath: string;
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), "c6-input-"));
  const packageDir = path.join(root, "package");
  const policyDir = path.join(root, "policy");
  await mkdir(packageDir);
  await mkdir(policyDir);
  const artifactPath = path.join(packageDir, "artifact.bin");
  await writeFile(path.join(packageDir, "assurance-package.json"), "{}\n");
  await writeFile(artifactPath, "original");
  const policyPath = path.join(policyDir, "core000-trust-policy.json");
  await writeFile(policyPath, "{}\n");
  return { root, packageDir, policyPath, artifactPath };
}

/** A stand-in "verifier process": it deliberately chmods and mutates inputs. */
function runMutator(script: string): void {
  const result = spawnSync("sh", ["-c", script], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("a verifier process that mutates package bytes is detected", async () => {
  const { root, packageDir, policyPath, artifactPath } = await fixture();
  try {
    const snapshot = await snapshotInputs(packageDir, policyPath);
    await makeInputsReadOnly(packageDir, policyPath);

    if (process.platform !== "win32" && process.getuid?.() !== 0) {
      await assert.rejects(
        writeFile(artifactPath, "not allowed"),
        (error: NodeJS.ErrnoException) =>
          error.code === "EACCES" || error.code === "EPERM",
      );
    }

    runMutator(
      `chmod u+w "${packageDir}" "${artifactPath}" && printf 'mutated' >> "${artifactPath}"`,
    );
    const changes = await verifyInputsUnchanged(
      snapshot,
      packageDir,
      policyPath,
      "fake-verifier",
    );
    assert.ok(
      changes.some((change) =>
        change.includes("package file was modified"),
      ),
      changes.join("\n"),
    );

    const outcome = assembleBatch({
      now: NOW,
      packageDir,
      policyPath,
      manifestText: MANIFEST,
      packageFileDigests: snapshot.packageFiles,
      executions: executionsForPaths(packageDir, policyPath),
      inputIntegrity: { readOnlyDuringRuns: true, mutations: changes },
    });
    assert.equal(outcome.batch.ok, false);
    assert.ok(
      outcome.batch.problems.some((problem) =>
        problem.includes("package file was modified"),
      ),
      outcome.batch.problems.join("\n"),
    );
  } finally {
    await makeInputsWritable(packageDir, policyPath);
    await rm(root, { recursive: true, force: true });
  }
});

test("a verifier process that mutates the run-local policy is detected", async () => {
  const { root, packageDir, policyPath } = await fixture();
  try {
    const snapshot = await snapshotInputs(packageDir, policyPath);
    await makeInputsReadOnly(packageDir, policyPath);
    runMutator(
      `chmod u+w "${path.dirname(policyPath)}" "${policyPath}" && printf 'x' >> "${policyPath}"`,
    );
    const changes = await verifyInputsUnchanged(
      snapshot,
      packageDir,
      policyPath,
      "fake-verifier",
    );
    assert.ok(
      changes.some((change) =>
        change.includes("run-local trust policy was modified"),
      ),
      changes.join("\n"),
    );
  } finally {
    await makeInputsWritable(packageDir, policyPath);
    await rm(root, { recursive: true, force: true });
  }
});

test("a verifier process that removes or adds a package file is detected", async () => {
  const { root, packageDir, policyPath, artifactPath } = await fixture();
  try {
    const snapshot = await snapshotInputs(packageDir, policyPath);
    await makeInputsReadOnly(packageDir, policyPath);
    runMutator(
      `chmod u+w "${packageDir}" && rm "${artifactPath}" && printf 'new' > "${path.join(packageDir, "unexpected.bin")}"`,
    );
    const changes = await verifyInputsUnchanged(
      snapshot,
      packageDir,
      policyPath,
      "fake-verifier",
    );
    assert.ok(
      changes.some((change) => change.includes("package file was removed")),
      changes.join("\n"),
    );
    assert.ok(
      changes.some((change) => change.includes("package file was added")),
      changes.join("\n"),
    );
  } finally {
    await makeInputsWritable(packageDir, policyPath);
    await rm(root, { recursive: true, force: true });
  }
});
