import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { Check, CheckContext } from "../context.js";

export const check: Check = (ctx: CheckContext) => {
  const findings: ValidatorFinding[] = [];

  for (const [index, provision] of ctx.view.provisions.entries()) {
    const pointer = `/provisions/${index}`;

    const provisionReview = provision.review;
    if (provision.normalization_status !== "verbatim" && provisionReview?.status !== "confirmed") {
      findings.push({
        code: "REVIEW_NORMALIZATION_PENDING",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/normalized_statement` },
        data: { id: provision.id },
      });
    }

    if (
      provision.classification_basis?.kind === "editorial_inference" &&
      provisionReview?.status !== "confirmed"
    ) {
      findings.push({
        code: "REVIEW_EFFECT_CLASSIFICATION",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/classification_basis` },
        data: { effect: provision.normative_effect },
      });
    }

    if (
      provisionReview?.status === "confirmed" &&
      (provisionReview.reviewed_by === null || provisionReview.reviewed_by === undefined)
    ) {
      findings.push({
        code: "WARN_REVIEW_WITHOUT_REVIEWER",
        variant: "provision",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/review/reviewed_by` },
        data: { id: provision.id },
      });
    }
  }

  for (const [index, testCase] of ctx.view.cases.entries()) {
    const caseReview = testCase.review;
    if (
      caseReview?.status === "confirmed" &&
      (caseReview.reviewed_by === null || caseReview.reviewed_by === undefined)
    ) {
      findings.push({
        code: "WARN_REVIEW_WITHOUT_REVIEWER",
        variant: "case",
        entityId: testCase.id,
        location: { file: "conformance/cases.yml", pointer: `/cases/${index}/review/reviewed_by` },
        data: { id: testCase.id },
      });
    }
  }

  return findings;
};
