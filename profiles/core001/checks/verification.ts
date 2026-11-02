import type { VerificationContext } from "../../../spec/lib/hook.js";
import type { ProjectModel } from "../../../spec/lib/ir.js";
import type { ProvenanceVerificationClaim } from "../../../spec/lib/provenance.js";
import { collapse } from "../text.js";

/** Identifies the profile verifier in every record it produces. */
export const VERIFIER = "core001/validator";

/**
 * CORE-001 provenance verification. The profile owns quote/locator policy, so this module
 * maps the source adapter's outcomes to verification statuses instead of moving locator
 * resolution into the core. A not-found quote is a failed check; an unsupported adapter is
 * unavailable, not verified.
 */
export async function verifyProvenance(
  model: ProjectModel,
  ctx: VerificationContext,
): Promise<ProvenanceVerificationClaim[]> {
  const sources = new Map(ctx.sources.map((source) => [source.id, source]));
  const text = new Map(
    ctx.sources.map((source) => [source.id, new TextDecoder().decode(source.bytes)]),
  );
  const claims: ProvenanceVerificationClaim[] = [];

  for (const entity of model.entities) {
    const binding = entity.provenance;
    if (binding === undefined) continue;

    const source = sources.get(binding.source);
    const base = {
      entityId: entity.id,
      verifier: VERIFIER,
      method: `source-adapter:${source?.adapter ?? "unknown"}/verifyQuote`,
      checkedAt: null,
      sourceVersion: ctx.sourceVersion(binding.source),
      sourceDigest: ctx.sourceDigest(binding.source),
    };

    const sourceText = text.get(binding.source);
    if (sourceText === undefined) {
      claims.push({ ...base, status: "unavailable", outcome: "source-unavailable" });
      continue;
    }

    if (!collapse(sourceText).includes(collapse(binding.quote))) {
      claims.push({ ...base, status: "failed", outcome: "not-found" });
      continue;
    }

    const outcome = await ctx.verifyQuote(binding.source, binding.ref, binding.quote);
    if (outcome === "found") {
      claims.push({ ...base, status: "verified", outcome: "found" });
    } else if (outcome === "unsupported") {
      claims.push({ ...base, status: "unavailable", outcome: "unsupported" });
    } else {
      claims.push({ ...base, status: "failed", outcome });
    }
  }

  return claims;
}
