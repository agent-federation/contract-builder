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
import { sectionInSlice } from "../profiles/core001/slice.js";
import { collapse, normalizeText } from "../profiles/core001/text.js";
import type { Slice } from "../profiles/core001/view.js";
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
  const findings = await source(context(modelWith([missing]), "not-found"));
  assert.deepEqual(codes(findings), ["ERR_SOURCE_QUOTE_NOT_FOUND"]);
});

test("checks/source: reports an outside locator from the adapter", async () => {
  const findings = await source(context(modelWith([fragment()]), "outside"));
  assert.deepEqual(codes(findings), ["ERR_SOURCE_LOCATOR_MISMATCH"]);
});

test("checks/source: refuses to pass an unverified record", async () => {
  const ctx = context(modelWith([fragment()]));
  delete ctx.model.byId.get("F1")!.verification;

  const findings = await source(ctx);
  assert.deepEqual(codes(findings), ["ERR_PROVENANCE_NOT_VERIFIED"]);
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

test("checks/ontology: rejects an ontology revision that differs from the source revision", async () => {
  const model = modelWith([fragment()]);
  const documents = structuredClone(model.documents);
  const ontologyDocument = documents.ontology as { document: { revision: string } };
  ontologyDocument.document.revision = "2";

  const findings = await ontology(context({ ...model, documents }));
  assert.deepEqual(codes(findings), ["ERR_SOURCE_REVISION_MISMATCH"]);
  assert.equal(findings[0]?.variant, "ontology");
  assert.deepEqual(findings[0]?.data, {
    ontologyRevision: "2",
    sourceRevision: "1",
    sourceId: "SRC",
  });
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
  const withDependency = entity("P1", "provision", PROVISION_FIELDS, {
    ...PROVISION_RELATIONS,
    dependsOn: ["D1"],
    mentions: ["D1"],
  });

  const findings = await dependencies(context(modelWith([fragment(), decision, withDependency])));
  assert.deepEqual(codes(findings), ["REVIEW_OPEN_NORMATIVE_DEPENDENCY", "WARN_OUTSIDE_SLICE_REF"]);
});

test("checks/review: tolerates a provision without review", async () => {
  const { review: _review, ...fields } = PROVISION_FIELDS;
  const withoutReview = entity(
    "P1",
    "provision",
    { ...fields, normalized_statement: "different" },
    { ...PROVISION_RELATIONS },
  );

  const findings = await review(context(modelWith([fragment(), withoutReview])));
  assert.deepEqual(codes(findings), ["REVIEW_NORMALIZATION_PENDING"]);
});

test("checks/provision: tolerates a missing modality_marker", async () => {
  const { modality_marker: _marker, ...fields } = PROVISION_FIELDS;
  const withoutMarker = entity("P1", "provision", fields, { ...PROVISION_RELATIONS });

  const findings = await provision(context(modelWith([fragment(), withoutMarker])));
  assert.ok(codes(findings).includes("ERR_MODALITY_MARKER"));
});

test("checks/provision: tolerates missing clauses", async () => {
  const { precondition: _precondition, exception: _exception, ...fields } = PROVISION_FIELDS;
  const withoutClauses = entity("P1", "provision", fields, { ...PROVISION_RELATIONS });

  const findings = await provision(context(modelWith([fragment(), withoutClauses])));
  assert.deepEqual(findings, []);
});

test("checks/provision: tolerates missing array fields", async () => {
  const {
    explications: _explications,
    unresolved_conditions: _unresolved,
    outside_slice_refs: _outside,
    ...fields
  } = PROVISION_FIELDS;
  const withoutArrays = entity(
    "P1",
    "provision",
    { ...fields, normalized_statement: "different" },
    { ...PROVISION_RELATIONS },
  );

  const findings = await provision(context(modelWith([fragment(), withoutArrays])));
  assert.ok(codes(findings).includes("ERR_UNEXPLAINED_PARAPHRASE"));
});

test("slice: tolerates missing include and exclude arrays", () => {
  const slice = { includes: undefined, excludes: undefined } as unknown as Slice;
  assert.equal(sectionInSlice("SRC#1", slice), false);
});

test("text: helpers tolerate missing values", () => {
  assert.equal(collapse(undefined), "");
  assert.equal(normalizeText(undefined), "");
});

test("slice: tolerates an undefined slice", () => {
  assert.equal(sectionInSlice("SRC#1", undefined), false);
});

test("checks: tolerate missing optional fields", async () => {
  const without = entity(
    "P1",
    "provision",
    { ...PROVISION_FIELDS, source_quote: undefined, classification_basis: undefined },
    { ...PROVISION_RELATIONS },
  );
  const model = modelWith([fragment(), without]);

  assert.ok(Array.isArray(await terms(context(model))));
  assert.ok(Array.isArray(await provision(context(model))));
  assert.ok(Array.isArray(await review(context(model))));
});

test("checks/source: treats unsupported verification as a failure", async () => {
  const findings = await source(context(modelWith([fragment()]), "unsupported"));
  assert.deepEqual(codes(findings), ["ERR_SOURCE_LOCATOR_UNSUPPORTED"]);
});

// Negative tests for the eight CORE-001 codes that the real spec never triggers (issue #146).
// Each asserts the exact code set, so a dropped or inverted check fails the test.

test("checks/source: reports an unknown locator from the adapter", async () => {
  const findings = await source(context(modelWith([fragment()]), "unknown-locator"));
  assert.deepEqual(codes(findings), ["ERR_SOURCE_LOCATOR_UNKNOWN"]);
});

test("checks/source: rejects a source revision that does not match the loaded document", async () => {
  const ctx = context(modelWith([fragment()]));
  const findings = await source({ ...ctx, legacyText: "DOC (Rev 2)\nMUST do" });
  assert.deepEqual(codes(findings), ["ERR_SOURCE_REVISION_MISMATCH"]);
});

test("checks/source: reports a fragment outside the declared slice", async () => {
  const outside = entity("F1", "fragment", {
    source: "SRC",
    source_ref: "SRC#2",
    quote: "MUST do",
    in_scope: true,
  });

  const findings = await source(context(modelWith([outside])));
  assert.deepEqual(codes(findings), ["ERR_OUT_OF_SLICE_CONTENT"]);
});

test("checks/ontology: reports a term whose source_ref differs from its fragment", async () => {
  const term = entity(
    "T1",
    "term",
    { name: "t", definition: "MUST do", source_ref: "SRC#2" },
    { fragment: ["F1"] },
  );

  const findings = await ontology(context(modelWith([fragment(), term])));
  assert.deepEqual(codes(findings), ["ERR_SOURCE_REF_MISMATCH"]);
});

test("checks/provision: rejects a claim quote outside its source quote", async () => {
  const bad = provisionEntity({ claim_quote: "MUST определить другой момент" });
  const findings = await provision(context(modelWith([fragment(), bad])));
  assert.deepEqual(codes(findings), ["ERR_CLAIM_NOT_IN_SOURCE"]);
});

test("checks/provision: rejects a classification basis absent from the claim", async () => {
  const bad = provisionEntity({
    classification_basis: { kind: "explicit", quote: "OTHER", text: "t" },
  });
  const findings = await provision(context(modelWith([fragment(), bad])));
  assert.deepEqual(codes(findings), ["ERR_CLASSIFICATION_BASIS"]);
});

test("checks/provision: rejects a clause quote absent from the source quote", async () => {
  const bad = provisionEntity({
    precondition: {
      quote: "ABSENT",
      text: "t",
      source_modality: "DECLARATIVE",
      modality_marker: null,
      condition_kind: "necessary",
    },
  });
  const findings = await provision(context(modelWith([fragment(), bad])));
  assert.deepEqual(codes(findings), ["ERR_CLAUSE_NOT_IN_SOURCE"]);
});

test("checks/provision: rejects an explication absent from the normalized statement", async () => {
  const bad = provisionEntity({
    normalized_statement: "MUST do in another way",
    explications: [{ kind: "modal_explication", text: "ABSENT", rationale: "r" }],
  });
  const findings = await provision(context(modelWith([fragment(), bad])));
  assert.deepEqual(codes(findings), ["ERR_EXPLICATION_NOT_IN_STATEMENT"]);
});
