import { test } from "node:test";
import assert from "node:assert/strict";
import { check as cases } from "../profiles/core001/checks/cases.js";
import { check as coverage } from "../profiles/core001/checks/coverage.js";
import { check as dependencies } from "../profiles/core001/checks/dependencies.js";
import { check as ontology } from "../profiles/core001/checks/ontology.js";
import { check as provision } from "../profiles/core001/checks/provision.js";
import { check as review } from "../profiles/core001/checks/review.js";
import { check as source } from "../profiles/core001/checks/source.js";
import { check as terms } from "../profiles/core001/checks/terms.js";
import {
  context,
  entity,
  fragment,
  modelWith,
  PROVISION_FIELDS,
  PROVISION_RELATIONS,
} from "./support.js";

const codes = (findings: Array<{ code: string }>): string[] => findings.map((f) => f.code);

function provisionEntity(overrides: Record<string, unknown> = {}) {
  return entity(
    "P1",
    "provision",
    { ...PROVISION_FIELDS, ...overrides },
    { ...PROVISION_RELATIONS },
  );
}

test("checks/source: accepts a located quote and reports a missing one", async () => {
  const ok = await source(context(modelWith([fragment()])));
  assert.deepEqual(ok, []);

  const missing = entity("F1", "fragment", {
    source: "SRC",
    source_ref: "SRC#1",
    quote: "absent",
  });
  const findings = await source(context(modelWith([missing])));
  assert.deepEqual(codes(findings), ["ERR_SOURCE_QUOTE_NOT_FOUND"]);
});

test("checks/source: reports an outside locator from the adapter", async () => {
  const findings = await source(context(modelWith([fragment()]), async () => "outside"));
  assert.deepEqual(codes(findings), ["ERR_SOURCE_LOCATOR_MISMATCH"]);
});

test("checks/ontology: accepts a verbatim definition and rejects a paraphrase", async () => {
  const term = entity(
    "T1",
    "term",
    { name: "t", definition: "MUST do", source_ref: "SRC#1" },
    { fragment: ["F1"] },
  );
  const ok = await ontology(context(modelWith([fragment(), term])));
  assert.deepEqual(ok, []);

  const paraphrased = entity(
    "T1",
    "term",
    { name: "t", definition: "other", source_ref: "SRC#1" },
    { fragment: ["F1"] },
  );
  const findings = await ontology(context(modelWith([fragment(), paraphrased])));
  assert.deepEqual(codes(findings), ["ERR_QUOTE_NOT_IN_FRAGMENT"]);
});

test("checks/provision: accepts a consistent provision and rejects a modality upgrade", async () => {
  const ok = await provision(context(modelWith([fragment(), provisionEntity()])));
  assert.deepEqual(ok, []);

  const upgraded = provisionEntity({ normative_effect: "permission" });
  const findings = await provision(context(modelWith([fragment(), upgraded])));
  assert.ok(codes(findings).includes("ERR_MODALITY_UPGRADE"));
});

test("checks/provision: reports a marker missing from the claim", async () => {
  const bad = provisionEntity({ modality_marker: "SHOULD" });
  const findings = await provision(context(modelWith([fragment(), bad])));
  assert.deepEqual(codes(findings), ["ERR_MODALITY_MARKER"]);
});

test("checks/cases: rejects violated from an underdetermined source", async () => {
  const testCase = entity(
    "C1",
    "case",
    {
      scenario: { given: ["g"], action: "a" },
      expected_outcome: "violated",
      source_determination: "underdetermined",
      expectation_basis: "obligation",
      rationale: "r",
      review: { status: "unreviewed", reviewed_by: null },
    },
    { provision: ["P1"], rationaleFragment: ["F1"] },
  );

  const findings = await cases(context(modelWith([fragment(), provisionEntity(), testCase])));
  assert.deepEqual(codes(findings), ["ERR_CASE_VIOLATED_UNDETERMINED"]);
});

test("checks/review: reports an unconfirmed paraphrase", async () => {
  const paraphrased = provisionEntity({ normalized_statement: "different" });
  const findings = await review(context(modelWith([fragment(), paraphrased])));
  assert.deepEqual(codes(findings), ["REVIEW_NORMALIZATION_PENDING"]);
});

test("checks/coverage: reports a provision without vectors", async () => {
  const findings = await coverage(context(modelWith([fragment(), provisionEntity()])));
  assert.deepEqual(codes(findings), ["ERR_MISSING_VECTOR"]);
});

test("checks/terms: reports an undefined capitalised term", async () => {
  const withToken = provisionEntity({
    source_quote: "MUST do Credential",
    claim_quote: "MUST do Credential",
    normalized_statement: "MUST do Credential",
    modality_marker: "MUST",
    classification_basis: { kind: "explicit", quote: "MUST", text: "t" },
  });
  const findings = await terms(context(modelWith([fragment(), withToken])));
  assert.deepEqual(codes(findings), ["WARN_UNDEFINED_TERM_IN_QUOTE"]);
});

test("checks/dependencies: reports an open normative dependency and a mention", async () => {
  const decision = entity("D1", "decision", {
    question: "q",
    status: "open",
    scope: "normative",
    resolution: null,
    source: "SRC",
    source_ref: "SRC#1",
    source_quote: "MUST do",
    in_scope: false,
  });
  const withDependency = entity(
    "P1",
    "provision",
    PROVISION_FIELDS,
    { ...PROVISION_RELATIONS, dependsOn: ["D1"], mentions: ["D1"] },
  );

  const findings = await dependencies(context(modelWith([fragment(), decision, withDependency])));
  assert.deepEqual(codes(findings), [
    "REVIEW_OPEN_NORMATIVE_DEPENDENCY",
    "WARN_OUTSIDE_SLICE_REF",
  ]);
});
