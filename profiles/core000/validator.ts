import type {
  ProfileValidator,
  ValidatorContext,
  ValidatorFinding,
  VerificationContext,
} from "../../spec/lib/hook.js";
import type { ProjectModel } from "../../spec/lib/ir.js";
import type { ProvenanceVerificationClaim } from "../../spec/lib/provenance.js";
import { claimEvidenceFindings } from "./checks/claim-evidence.js";
import { provenanceVerificationFindings } from "./checks/provenance-verification.js";
import { trustPolicyFindings } from "./checks/trust-policy.js";

/** CORE-000 policy checks run over the generic model; they perform no I/O and read no clock. */
export const validate = async (
  model: ProjectModel,
  _ctx: ValidatorContext,
): Promise<ValidatorFinding[]> => {
  return [
    ...claimEvidenceFindings(model),
    ...trustPolicyFindings(model),
    ...provenanceVerificationFindings(model),
  ];
};

/**
 * Resolves each source-statement binding once through the source adapter. The core validates
 * and stores the resulting claim; `validate` must read that stored record rather than calling
 * the adapter again.
 */
export const verifyProvenance = async (
  model: ProjectModel,
  ctx: VerificationContext,
): Promise<ProvenanceVerificationClaim[]> => {
  const claims: ProvenanceVerificationClaim[] = [];

  for (const statement of model.byKind.get("source_statement") ?? []) {
    const source = text(statement.fields.source);
    const ref = text(statement.fields.source_ref);
    const quote = text(statement.fields.source_quote);
    if (source.length === 0 || ref.length === 0 || quote.length === 0) continue;

    const outcome = await ctx.verifyQuote(source, ref, quote);
    const status =
      outcome === "found" ? "verified" : outcome === "outside" ? "failed" : "unavailable";

    claims.push({
      entityId: statement.id,
      status,
      verifier: "core000/verifyProvenance",
      method: "markdown:locator",
      checkedAt: null,
      sourceVersion: ctx.sourceVersion(source),
      sourceDigest: ctx.sourceDigest(source),
      outcome,
    });
  }

  return claims;
};

export const validator: ProfileValidator = { validate, verifyProvenance };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
