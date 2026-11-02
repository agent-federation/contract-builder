import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSpecImpl } from "../src/checks.js";
import type { CheckInput, ClaimState } from "../src/checks.js";
import type { Manifest } from "../src/manifest.js";

const ZERO = `sha256:${"0".repeat(64)}`;
const checker = { id: "pap.verifier.reference", version: "0.1.0", implementationDigest: ZERO };

function manifest(): Manifest {
  return {
    papVersion: "0.1",
    package: { id: "pkg" },
    artifacts: [],
    inputs: [],
    sources: [
      {
        id: "S",
        path: "sources/s.md",
        mediaType: "text/plain",
        digest: ZERO,
      },
    ],
    claims: {},
    checkSpecs: [],
    extensions: {},
    requiredFeatures: [],
  };
}

function checkInput(budget: number, claim: ClaimState): CheckInput {
  return {
    packageIdentity: ZERO,
    manifest: manifest(),
    artifacts: [],
    sources: [
      {
        source: manifest().sources[0] as Manifest["sources"][number],
        computed: ZERO,
        size: 10,
        status: "ok",
      },
    ],
    inputs: [],
    claims: [claim],
    normalizedInputDigest: null,
    sourceSpans: new Map([["S\u00000\u00001", ZERO]]),
    sourceSpanBudgetHit: false,
    checker,
    limits: { provenanceBindings: 1_000 },
    witnessBudget: budget,
  };
}

test("a tiny witness budget cannot produce a PASS", () => {
  const claim: ClaimState = {
    kind: "provenance",
    declaredDigest: ZERO,
    computedDigest: ZERO,
    status: "ok",
    parsed: {
      kind: "provenance",
      bindings: [
        {
          id: "b",
          entityId: "e",
          sourceId: "S",
          locator: { kind: "byte-range", start: 0, end: 1 },
          quote: { normalization: "none", digest: ZERO },
        },
      ],
    },
    issues: [],
  };
  const record = checkSpecImpl("pap.check.source-quote/1", checkInput(1, claim));
  assert.ok(record);
  assert.equal(record.outcome, "NOT_EVALUATED");
  assert.ok(record.diagnostics.some((diagnostic) => diagnostic.code === "pap.package.limit-exceeded"));
});

test("a tiny relation witness budget cannot produce a PASS", () => {
  const claim: ClaimState = {
    kind: "relations",
    declaredDigest: ZERO,
    computedDigest: ZERO,
    status: "ok",
    parsed: {
      kind: "relations",
      entities: [{ id: "E", kind: "k" }, { id: "E", kind: "k" }],
      relations: [],
      edges: [],
    },
    issues: [],
  };
  const record = checkSpecImpl("pap.check.relation-consistency/1", checkInput(1, claim));
  assert.ok(record);
  assert.equal(record.outcome, "NOT_EVALUATED");
  assert.ok(record.diagnostics.some((diagnostic) => diagnostic.code === "pap.package.limit-exceeded"));
});
