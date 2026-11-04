import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { ProjectModel } from "../../../spec/lib/ir.js";

/**
 * CORE-000 evidence policy: a locator/evidence reference must be non-empty after trimming and
 * every evidence record should be reachable from a claim. The locator grammar remains human
 * review (Q6 A′); this check only enforces the trimmed-non-empty guarantee.
 */
export function evidenceFindings(model: ProjectModel): ValidatorFinding[] {
  const findings: ValidatorFinding[] = [];
  const supported = supportedEvidenceIds(model);

  for (const evidence of model.byKind.get("evidence") ?? []) {
    const locator = text(evidence.fields.locator);
    const revision = text(evidence.fields.revision);
    if (locator.trim().length === 0 || revision.trim().length === 0) {
      findings.push({
        code: "core000.evidence.locator",
        entityId: evidence.id,
        location: { file: "claims.yml", pointer: "" },
      });
    }
    if (!supported.has(evidence.id)) {
      findings.push({
        code: "core000.evidence.orphan",
        entityId: evidence.id,
        location: { file: "claims.yml", pointer: "" },
      });
    }
  }

  return findings;
}

function supportedEvidenceIds(model: ProjectModel): Set<string> {
  const supported = new Set<string>();
  for (const claim of model.byKind.get("claim") ?? []) {
    for (const evidenceId of claim.relations.evidencedBy ?? []) supported.add(evidenceId);
  }
  return supported;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
