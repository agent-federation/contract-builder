import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { ProjectModel } from "../../../spec/lib/ir.js";

const CONSENT_BOUNDARY = "TB-PROFILE-EXEC";

/**
 * Phrases that would describe the merged consent policy as pending, absent, fail-open or a
 * sandbox. The check is deliberately conservative: a true statement that says the engine does
 * not sandbox the hook is not a contradiction.
 */
const FORBIDDEN_CONSENT_PHRASES = [
  "consent is pending",
  "consent is absent",
  "consent is optional",
  "consent is not required",
  "no consent is required",
  "without consent",
  "fail-open",
  "fail open",
  "is sandboxed",
  "provides a sandbox",
  "provides sandbox isolation",
  "process isolation",
];

/** CORE-000 trust-boundary policy: the settled consent facts must not be contradicted. */
export function trustPolicyFindings(model: ProjectModel): ValidatorFinding[] {
  const findings: ValidatorFinding[] = [];
  const claims = model.byKind.get("claim") ?? [];

  for (const claim of claims) {
    if (text(claim.fields.lifecycle) !== "active") continue;
    const subjects = claim.relations.subject ?? [];
    if (!subjects.includes(CONSENT_BOUNDARY)) continue;

    const statement = text(claim.fields.statement).toLowerCase();
    if (FORBIDDEN_CONSENT_PHRASES.some((phrase) => statement.includes(phrase))) {
      findings.push({
        code: "core000.claim.policy-mismatch",
        entityId: claim.id,
        location: { file: "claims.yml", pointer: "" },
      });
    }
  }

  for (const boundary of model.byKind.get("trust_boundary") ?? []) {
    const policyStatus = text(boundary.fields.policy_status);
    const enforcement = text(boundary.fields.enforcement);
    if (policyStatus === "settled" && enforcement === "explicit_consent") continue;
    findings.push({
      code: "core000.trust.consent-facts",
      entityId: boundary.id,
      location: { file: "structure.yml", pointer: "" },
    });
  }

  return findings;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
