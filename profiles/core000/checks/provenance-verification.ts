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

  for (const record of model.byKind.get("independent_verification") ?? []) {
    const fields = record.fields;
    const coveredClaims = (record.relations.verifies ?? []).flatMap((id) => {
      const claim = model.byId.get(id);
      return claim !== undefined && claim.kind === "claim" ? [claim] : [];
    });
    const claimResults = Array.isArray(fields.claim_results) ? fields.claim_results : [];
    const resultsByClaim = new Set(
      claimResults
        .filter((entry): entry is Record<string, unknown> => isObject(entry))
        .map((entry) => text(entry.claim)),
    );
    const complete =
      nonEmpty(fields.method) &&
      nonEmpty(fields.verifier) &&
      nonEmpty(fields.independence) &&
      nonEmpty(fields.independence_basis) &&
      typeof fields.performed === "boolean" &&
      nonEmpty(fields.result) &&
      nonEmpty(fields.scope) &&
      nonEmpty(fields.revision) &&
      claimResults.length > 0 &&
      nonEmpty(fields.limitations) &&
      (fields.method !== "command_run" && fields.method !== "external_harness"
        ? true
        : Array.isArray(fields.commands) && fields.commands.length > 0) &&
      (fields.performed !== true || nonEmpty(fields.date)) &&
      coveredClaims.every((claim) => resultsByClaim.has(claim.id));
    if (!complete) {
      findings.push(finding("core000.independent-verification.incomplete", record, "claims.yml"));
    }

    const verifier = text(fields.verifier).trim();
    if (
      verifier.length > 0 &&
      coveredClaims.some((claim) => text(claim.fields.author).trim() === verifier)
    ) {
      findings.push(finding("core000.independent-verification.self", record, "claims.yml"));
    }

    if (fields.performed === true && text(fields.result) !== "not_run") {
      if (!isExternalRecordLocator(fields.record_locator)) {
        findings.push(
          finding("core000.independent-verification.record-missing", record, "claims.yml"),
        );
      }
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
    if (!isExternalRecordLocator(fields.record_locator)) continue;
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

function isExternalRecordLocator(value: unknown): boolean {
  let locator = text(value).trim().replace(/\\/g, "/");
  if (locator.length === 0) return false;
  locator = locator.replace(/^(?:\.\/)+/, "").replace(/\/{2,}/g, "/");
  return !locator.startsWith("contracts/core000/");
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
