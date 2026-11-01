import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { Check, CheckContext } from "../context.js";
import { collapse } from "../text.js";

export const check: Check = (ctx: CheckContext) => {
  const findings: ValidatorFinding[] = [];
  const fragmentById = new Map(ctx.view.fragments.map((fragment) => [fragment.id, fragment]));
  const provisionById = new Map(
    ctx.view.provisions.map((provision) => [provision.id, provision]),
  );

  for (const [index, testCase] of ctx.view.cases.entries()) {
    const pointer = `/cases/${index}`;
    const provision = provisionById.get(testCase.provision);
    const fragment = fragmentById.get(testCase.rationale_fragment);
    // Missing references are core errors, reported before the hook runs.
    if (provision === undefined || fragment === undefined) continue;

    if (!collapse(provision.source_quote).includes(collapse(fragment.quote))) {
      findings.push({
        code: "WARN_TRACE_INCOMPLETE",
        entityId: testCase.id,
        location: { file: "conformance/cases.yml", pointer: `${pointer}/rationale_fragment` },
        data: { id: testCase.id, provision: provision.id },
      });
    }

    // No violation may rest on a permission, an absent basis, or an underdetermined reading.
    if (testCase.expected_outcome === "violated") {
      if (
        testCase.source_determination !== "determined" &&
        testCase.source_determination !== "inferred"
      ) {
        findings.push({
          code: "ERR_CASE_VIOLATED_UNDETERMINED",
          entityId: testCase.id,
          location: { file: "conformance/cases.yml", pointer: `${pointer}/expected_outcome` },
          data: { id: testCase.id, determination: testCase.source_determination },
        });
      }

      if (
        testCase.expectation_basis === "permission" ||
        testCase.expectation_basis === "absent" ||
        testCase.expectation_basis === "scope_statement"
      ) {
        findings.push({
          code: "ERR_MODALITY_UPGRADE",
          variant: "case",
          entityId: testCase.id,
          location: { file: "conformance/cases.yml", pointer: `${pointer}/expected_outcome` },
          data: { id: testCase.id, basis: testCase.expectation_basis },
        });
      }
    }

    if (testCase.source_determination === "inferred" && testCase.review?.status !== "confirmed") {
      findings.push({
        code: "REVIEW_CASE_INTERPRETATION",
        entityId: testCase.id,
        location: { file: "conformance/cases.yml", pointer: `${pointer}/source_determination` },
        data: { id: testCase.id },
      });
    }
  }

  return findings;
};
