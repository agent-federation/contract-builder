import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { Entity, ProjectModel } from "../../../spec/lib/ir.js";

/**
 * D15: every source statement used by a normative claim needs a stored, checked provenance
 * record. A missing, failed or unavailable result is an error; a binding alone is not evidence.
 */
export function provenanceVerificationFindings(model: ProjectModel): ValidatorFinding[] {
  const findings: ValidatorFinding[] = [];

  for (const statement of model.byKind.get("source_statement") ?? []) {
    const verification = statement.verification;
    if (verification === undefined) {
      findings.push(finding("core000.source.verification-missing", statement, "claims.yml"));
      continue;
    }
    if (verification.status === "failed" || verification.status === "stale") {
      findings.push({
        ...finding("core000.source.verification-failed", statement, "claims.yml"),
        data: { outcome: verification.record.outcome },
      });
      continue;
    }
    if (verification.status === "unavailable") {
      const unchecked =
        verification.record.verifier === null && verification.record.outcome === "not-checked";
      findings.push(
        finding(
          unchecked
            ? "core000.source.verification-missing"
            : "core000.source.verification-unavailable",
          statement,
          "claims.yml",
        ),
      );
    }
  }

  // Presence, not truth: an external/human-authority claim without a record is visible and
  // blocks release, but the absence is not an error in the self-description.
  for (const claim of model.byKind.get("claim") ?? []) {
    if (text(claim.fields.lifecycle) !== "active") continue;
    const authority = text(claim.fields.authority);
    if (authority !== "external" && authority !== "human") continue;
    if (hasValidIndependentVerification(model, claim)) continue;
    const status = isObject(claim.fields.status) ? claim.fields.status : {};
    if (text(status.verification) === "independently_verified") continue;
    findings.push({
      code: "core000.independent-verification.missing",
      entityId: claim.id,
      location: { file: "claims.yml", pointer: "" },
    });
  }

  return findings;
}

export function hasValidIndependentVerification(model: ProjectModel, claim: Entity): boolean {
  for (const id of claim.relations.verifiedBy ?? []) {
    const record = model.byId.get(id);
    if (record === undefined || record.kind !== "independent_verification") continue;
    const fields = record.fields;
    if (text(fields.independence) !== "independent") continue;
    if (fields.performed !== true) continue;
    if (text(fields.result) !== "confirmed") continue;
    const locator = text(fields.record_locator);
    if (locator.length === 0 || locator.startsWith("contracts/core000/")) continue;
    const claimResults = Array.isArray(fields.claim_results) ? fields.claim_results : [];
    if (
      claimResults.some(
        (entry) =>
          isObject(entry) &&
          text(entry.claim) === claim.id &&
          text(entry.result) === "confirmed",
      )
    ) {
      return true;
    }
  }
  return false;
}

function finding(code: string, statement: Entity, file: string): ValidatorFinding {
  return { code, entityId: statement.id, location: { file, pointer: "" } };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
