import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { domainHash } from "../src/digest.js";
import { jcs } from "../src/json.js";
import { fixtures, runPap } from "./support.js";

/**
 * S1 characterization: freeze the pre-refactor verdict, dimension and coverage
 * model form for every report-producing corpus case. S1 is a pure refactor, so
 * these digests must not change; an intended change belongs to S3 and must
 * update this baseline in the same pull request.
 */
const baselineFile = new URL("./verdict-baseline.json", import.meta.url);
const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as {
  fixtureSetVersion: string;
  baseCase: string;
  cases: Record<string, string>;
};

const suite = JSON.parse(readFileSync(path.join(fixtures, "cases.json"), "utf8")) as {
  fixtureSetVersion: string;
  baseCase: string;
  cases: {
    caseId: string;
    command: string[];
    noReport?: boolean;
    document?: "inspection" | "explanation";
  }[];
};

function modelForm(document: any): unknown {
  const dimensions = document.dimensions;
  return {
    verdict: document.verdict,
    dimensions: {
      integrity: dimensions.integrity,
      sources: dimensions.sources,
      signature: { validity: dimensions.signature.validity },
      trust: {
        signerIdentity: dimensions.trust.signerIdentity,
        policyDecision: dimensions.trust.policyDecision,
        checkerRecognition: dimensions.trust.checkerRecognition,
        profileRecognition: dimensions.trust.profileRecognition,
      },
      checks: { results: dimensions.checks.results },
      humanReview: { status: dimensions.humanReview.status },
    },
    coverage: document.coverage,
  };
}

function digestOf(document: unknown): string {
  return domainHash(
    "pap.verdict-characterization.v1",
    new TextEncoder().encode(jcs(modelForm(document) as never)),
  );
}

test("S1 characterization: the corpus keeps identical verdict, dimensions and coverage", {
  timeout: 120_000,
}, () => {
  assert.equal(baseline.fixtureSetVersion, suite.fixtureSetVersion);
  assert.equal(baseline.baseCase, suite.baseCase);
  const reportCases = suite.cases.filter((entry) => !entry.noReport && !entry.document);
  assert.deepEqual(
    reportCases.map((entry) => entry.caseId).sort(),
    Object.keys(baseline.cases).sort(),
    "the baseline must cover exactly the report-producing corpus cases",
  );

  for (const entry of reportCases) {
    const result = runPap(entry.command, path.join(fixtures, entry.caseId));
    assert.equal(result.stderr, "", `${entry.caseId}: ${result.stderr}`);
    const document = JSON.parse(result.stdout);
    assert.equal(
      digestOf(modelForm(document)),
      baseline.cases[entry.caseId],
      `${entry.caseId}: verdict, dimensions or coverage changed\n${JSON.stringify(modelForm(document), null, 2)}`,
    );
  }
});
