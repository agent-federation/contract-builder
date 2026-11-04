import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { ProjectModel } from "../../../spec/lib/ir.js";

/** Every declared conformance case must cover at least one claim. */
export function conformanceFindings(model: ProjectModel): ValidatorFinding[] {
  const findings: ValidatorFinding[] = [];

  for (const conformanceCase of model.byKind.get("conformance_case") ?? []) {
    if ((conformanceCase.relations.covers ?? []).length > 0) continue;
    findings.push({
      code: "core000.conformance.case-uncovered",
      entityId: conformanceCase.id,
      location: { file: "claims.yml", pointer: "" },
    });
  }

  return findings;
}
