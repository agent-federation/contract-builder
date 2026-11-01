import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { Check, CheckContext } from "../context.js";

export const check: Check = (ctx: CheckContext) => {
  const findings: ValidatorFinding[] = [];

  for (const [index, provision] of ctx.view.provisions.entries()) {
    const pointer = `/provisions/${index}`;

    const openDependencies = provision.resolved_dependencies.filter(
      (decision) => decision.status === "open",
    );
    for (const decision of openDependencies) {
      if (provision.normative_relevance && decision.scope === "normative") {
        findings.push({
          code: "REVIEW_OPEN_NORMATIVE_DEPENDENCY",
          entityId: provision.id,
          location: { file: "semantics.json", pointer: `${pointer}/decision_dependencies` },
          data: { id: provision.id, decisionId: decision.id },
        });
      } else if (provision.normative_relevance) {
        findings.push({
          code: "WARN_OPEN_EDITORIAL_DEPENDENCY",
          entityId: provision.id,
          location: { file: "semantics.json", pointer: `${pointer}/decision_dependencies` },
          data: { id: provision.id, decisionId: decision.id },
        });
      }
    }

    for (const [position, decision] of provision.resolved_mentions.entries()) {
      if (decision.in_scope === false) {
        findings.push({
          code: "WARN_OUTSIDE_SLICE_REF",
          variant: "mention",
          entityId: provision.id,
          location: {
            file: "semantics.json",
            pointer: `${pointer}/decision_mentions/${position}`,
          },
          data: { id: decision.id },
        });
      }
    }
  }

  return findings;
};
