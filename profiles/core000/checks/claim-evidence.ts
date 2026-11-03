import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { Entity, ProjectModel } from "../../../spec/lib/ir.js";
import { evidenceKind } from "../view.js";
import { hasValidIndependentVerification } from "./provenance-verification.js";

const EVIDENCE_KINDS = new Set(["code", "test", "ci"]);

/** Claim/evidence/decision conflicts that the CORE-000 profile owns. */
export function claimEvidenceFindings(model: ProjectModel): ValidatorFinding[] {
  const findings: ValidatorFinding[] = [];

  for (const claim of model.byKind.get("claim") ?? []) {
    if (text(claim.fields.lifecycle) !== "active") continue;
    const status = isObject(claim.fields.status) ? claim.fields.status : {};
    const decision = text(status.decision);
    const implementation = text(status.implementation);
    const tests = text(status.tests);
    const verification = text(status.verification);

    if (implementation === "implemented" && !hasEvidenceOfKind(model, claim, EVIDENCE_KINDS)) {
      findings.push(finding("core000.claim.implemented-without-evidence", claim));
    }

    if (tests === "tested") {
      const hasTest = hasEvidenceOfKind(model, claim, new Set(["test", "ci"]));
      if (!hasTest || text(claim.fields.verification_method).trim().length === 0) {
        findings.push(finding("core000.claim.tested-without-test", claim));
      }
    }

    const decisionIds = claim.relations.decidedBy ?? [];
    const decisions = decisionIds.flatMap((id) => {
      const target = model.byId.get(id);
      return target === undefined ? [] : [target];
    });
    const decisionStatuses = decisions.map((entity) => text(entity.fields.status));
    const decisionOk =
      (decision === "accepted" &&
        decisions.length === 1 &&
        decisionStatuses[0] === "accepted") ||
      (decision === "deferred" &&
        decisions.length === 1 &&
        decisionStatuses[0] === "deferred") ||
      (decision === "proposed" &&
        (decisions.length === 0 ||
          (decisions.length === 1 &&
            (decisionStatuses[0] === "proposed" || decisionStatuses[0] === "unresolved")))) ||
      (decision === "none" &&
        (decisions.length === 0 ||
          (decisions.length === 1 && decisionStatuses[0] === "unresolved")));

    if (!decisionOk) {
      findings.push(finding("core000.claim.decision-required", claim));
    } else if (
      (decision === "proposed" || decision === "none") &&
      decisions.length === 1 &&
      decisionStatuses[0] === "unresolved"
    ) {
      findings.push({
        ...finding("core000.decision.unresolved", claim),
        data: { decisionId: decisions[0]!.id },
      });
    }

    const subjectIds = claim.relations.subject ?? [];
    if (subjectIds.length === 0) {
      findings.push(finding("core000.claim.missing-subject", claim));
    }
    for (const subjectId of subjectIds) {
      const subject = model.byId.get(subjectId);
      if (subject === undefined) continue;
      const expected = text(claim.fields.subject_kind);
      if (subject.kind !== expected) {
        findings.push({
          ...finding("core000.claim.subject-kind-mismatch", claim),
          data: { subjectId, subjectKind: subject.kind },
        });
      }
    }

    if (
      verification === "independently_verified" &&
      !hasValidIndependentVerification(model, claim)
    ) {
      findings.push(finding("core000.claim.verification-not-independent", claim));
    }
  }

  return findings;
}

function hasEvidenceOfKind(
  model: ProjectModel,
  claim: Entity,
  kinds: ReadonlySet<string>,
): boolean {
  return (claim.relations.evidencedBy ?? []).some((id) => {
    const result = evidenceKind(model, id);
    return result.ok && kinds.has(result.kind);
  });
}

function finding(code: string, claim: Entity): ValidatorFinding {
  return { code, entityId: claim.id, location: { file: "claims.yml", pointer: "" } };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
