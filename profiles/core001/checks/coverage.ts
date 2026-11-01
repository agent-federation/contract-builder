import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { Check, CheckContext } from "../context.js";

export const check: Check = (ctx: CheckContext) => {
  const findings: ValidatorFinding[] = [];

  for (const [index, provision] of ctx.view.provisions.entries()) {
    if (provision.cases.length === 0) {
      findings.push({
        code: "ERR_MISSING_VECTOR",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `/provisions/${index}/id` },
        data: { id: provision.id },
      });
    } else if (provision.violated_cases === 0) {
      findings.push({
        code: "WARN_NO_VIOLATED_VECTOR",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `/provisions/${index}/id` },
        data: { id: provision.id },
      });
    }
  }

  return findings;
};
