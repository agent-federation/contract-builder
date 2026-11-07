/**
 * Unit tests for the CI assertion helper (`pipeline/ci.ts`).
 *
 * The pipeline job always exercised the CLI end-to-end; these tests pin the
 * helper's own failure modes so a change cannot silently weaken determinism,
 * the tamper probe or the decision assertion.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertDecision,
  checkDeterminism,
  tamperReport,
} from "../ci.js";

type JsonObject = Record<string, any>;

const PACKAGE = "sha256:0123456789abcdef";

function cleanReport(overrides: JsonObject = {}): JsonObject {
  return {
    verdict: "PASS",
    coverage: { full: true },
    diagnostics: [],
    limitations: [],
    identities: { packageIdentity: PACKAGE },
    package: { identity: PACKAGE, path: "/tmp/pipeline/pack-a" },
    ...overrides,
  };
}

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pipeline-ci-"));
}

async function writeJson(root: string, name: string, value: unknown): Promise<string> {
  const file = path.join(root, `${name}.json`);
  await writeFile(file, `${JSON.stringify(value)}\n`, "utf8");
  return file;
}

test("determinism accepts two reports that differ only in package.path", async () => {
  const root = await tempRoot();
  try {
    const first = cleanReport();
    const second = cleanReport({
      package: { identity: PACKAGE, path: "/tmp/pipeline/pack-b" },
    });
    const a = await writeJson(root, "report-a", first);
    const b = await writeJson(root, "report-b", second);
    await checkDeterminism([a, b]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("determinism rejects a packageIdentity mismatch", async () => {
  const root = await tempRoot();
  try {
    const other = "sha256:fedcba9876543210";
    const a = await writeJson(root, "report-a", cleanReport());
    const b = await writeJson(
      root,
      "report-b",
      cleanReport({
        identities: { packageIdentity: other },
        package: { identity: other, path: "/tmp/pipeline/pack-b" },
      }),
    );
    await assert.rejects(
      checkDeterminism([a, b]),
      /packageIdentity differs between pack runs/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("determinism rejects a report that is not a clean PASS", async () => {
  const root = await tempRoot();
  try {
    const a = await writeJson(root, "report-a", cleanReport());
    const notPass = await writeJson(
      root,
      "report-not-pass",
      cleanReport({ verdict: "INCOMPLETE" }),
    );
    await assert.rejects(
      checkDeterminism([a, notPass]),
      /verdict is "INCOMPLETE", expected PASS/,
    );

    const noCoverage = await writeJson(
      root,
      "report-no-coverage",
      cleanReport({ coverage: { full: false } }),
    );
    await assert.rejects(
      checkDeterminism([a, noCoverage]),
      /coverage\.full is false/,
    );

    const diagnostic = await writeJson(
      root,
      "report-diagnostic",
      cleanReport({ diagnostics: [{ code: "pap.package.io" }] }),
    );
    await assert.rejects(
      checkDeterminism([a, diagnostic]),
      /diagnostics is not empty/,
    );

    const mismatch = await writeJson(
      root,
      "report-identity-mismatch",
      cleanReport({ package: { identity: "sha256:other", path: "/tmp/pipeline/pack-b" } }),
    );
    await assert.rejects(
      checkDeterminism([a, mismatch]),
      /does not match identities\.packageIdentity/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tamper writes FAIL and refuses a non-PASS baseline", async () => {
  const root = await tempRoot();
  try {
    const source = await writeJson(root, "report", cleanReport());
    const target = path.join(root, "tampered.json");
    await tamperReport([source, target]);
    const tampered = JSON.parse(await readFile(target, "utf8")) as JsonObject;
    assert.equal(tampered.verdict, "FAIL");
    assert.equal(tampered.identities.packageIdentity, PACKAGE);

    const incomplete = await writeJson(
      root,
      "report-incomplete",
      cleanReport({ verdict: "INCOMPLETE" }),
    );
    await assert.rejects(
      tamperReport([incomplete, path.join(root, "never.json")]),
      /tamper baseline verdict is "INCOMPLETE", expected PASS/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("assert-decision requires the decision and its reasons to agree", async () => {
  const root = await tempRoot();
  try {
    const accepted = await writeJson(root, "accepted", {
      decision: "ACCEPTED",
      verdict: "PASS",
      packageIdentity: PACKAGE,
      reasons: [],
    });
    await assertDecision([accepted, "ACCEPTED"]);

    const acceptedWithReasons = await writeJson(root, "accepted-with-reasons", {
      decision: "ACCEPTED",
      verdict: "PASS",
      packageIdentity: PACKAGE,
      reasons: ["unexpected"],
    });
    await assert.rejects(
      assertDecision([acceptedWithReasons, "ACCEPTED"]),
      /ACCEPTED decision has reasons/,
    );

    const acceptedWithFailVerdict = await writeJson(root, "accepted-fail", {
      decision: "ACCEPTED",
      verdict: "FAIL",
      packageIdentity: PACKAGE,
      reasons: [],
    });
    await assert.rejects(
      assertDecision([acceptedWithFailVerdict, "ACCEPTED"]),
      /ACCEPTED decision verdict is "FAIL", expected PASS/,
    );

    const acceptedWithoutIdentity = await writeJson(root, "accepted-no-identity", {
      decision: "ACCEPTED",
      verdict: "PASS",
      packageIdentity: "",
      reasons: [],
    });
    await assert.rejects(
      assertDecision([acceptedWithoutIdentity, "ACCEPTED"]),
      /ACCEPTED decision has no packageIdentity/,
    );

    const rejected = await writeJson(root, "rejected", {
      decision: "NOT_ACCEPTED",
      verdict: "FAIL",
      reasons: ["verifier verdict is FAIL, expected PASS"],
    });
    await assertDecision([rejected, "NOT_ACCEPTED"]);

    const rejectedWithoutReasons = await writeJson(root, "rejected-no-reasons", {
      decision: "NOT_ACCEPTED",
      verdict: "FAIL",
      reasons: [],
    });
    await assert.rejects(
      assertDecision([rejectedWithoutReasons, "NOT_ACCEPTED"]),
      /NOT_ACCEPTED decision has no reasons/,
    );

    const mismatch = await writeJson(root, "mismatch", {
      decision: "ACCEPTED",
      verdict: "PASS",
      packageIdentity: PACKAGE,
      reasons: [],
    });
    await assert.rejects(
      assertDecision([mismatch, "NOT_ACCEPTED"]),
      /decision is "ACCEPTED", expected NOT_ACCEPTED/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CI helpers reject malformed invocations and unreadable files", async () => {
  await assert.rejects(
    checkDeterminism(["only-one-report"]),
    /determinism requires exactly <report-a> <report-b>/,
  );
  await assert.rejects(
    tamperReport(["only-source"]),
    /tamper requires exactly <report> <out>/,
  );
  await assert.rejects(
    assertDecision(["/tmp/decision.json", "MAYBE"]),
    /unknown decision "MAYBE"/,
  );
  await assert.rejects(
    checkDeterminism(["/tmp/does-not-exist-a.json", "/tmp/does-not-exist-b.json"]),
    /cannot read \/tmp\/does-not-exist-a\.json/,
  );
});
