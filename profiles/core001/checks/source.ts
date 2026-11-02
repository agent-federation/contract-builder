import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { ProvenanceVerification } from "../../../spec/lib/ir.js";
import type { Check, CheckContext } from "../context.js";
import { sectionInSlice } from "../slice.js";

/**
 * Maps the verification result the profile verifier already stored onto the existing
 * `ERR_SOURCE_*` diagnostics. The source check never calls the adapter again: one evidence
 * claim has exactly one verification result.
 */
function quoteFinding(
  verification: ProvenanceVerification | undefined,
  variant: "fragment" | "decision",
  entityId: string,
  file: string,
  pointer: string,
  sourceRef: string,
  legacyName: string,
): ValidatorFinding | null {
  if (verification?.status === "verified") return null;

  const { outcome } = verification?.record ?? { outcome: "not-checked" };
  const quotePointer = variant === "fragment" ? `${pointer}/quote` : `${pointer}/source_quote`;

  if (outcome === "not-found") {
    return {
      code: "ERR_SOURCE_QUOTE_NOT_FOUND",
      variant,
      entityId,
      location: { file, pointer: quotePointer },
      data: { id: entityId, legacyName },
    };
  }
  if (outcome === "unknown-locator") {
    return {
      code: "ERR_SOURCE_LOCATOR_UNKNOWN",
      variant,
      entityId,
      location: { file, pointer: `${pointer}/source_ref` },
      data: { ref: sourceRef, legacyName },
    };
  }
  if (outcome === "outside") {
    return {
      code: "ERR_SOURCE_LOCATOR_MISMATCH",
      variant,
      entityId,
      location: { file, pointer: quotePointer },
      data: { id: entityId, ref: sourceRef },
    };
  }
  if (outcome === "unsupported") {
    return {
      code: "ERR_SOURCE_LOCATOR_UNSUPPORTED",
      variant,
      entityId,
      location: { file, pointer: `${pointer}/source_ref` },
      data: { id: entityId, ref: sourceRef },
    };
  }

  // `unavailable`/`stale` with no mapped outcome is never a pass: the quote and locator
  // have not been verified for the current source bytes.
  return {
    code: "ERR_PROVENANCE_NOT_VERIFIED",
    variant,
    entityId,
    location: { file, pointer: quotePointer },
    data: { id: entityId, legacyName },
  };
}

export const check: Check = async (ctx: CheckContext) => {
  const findings: ValidatorFinding[] = [];
  const { view, legacyText, legacyName } = ctx;

  const expectedHeader = `${view.source.document} (Rev ${view.source.revision})`;
  if (!legacyText.slice(0, 500).includes(expectedHeader)) {
    findings.push({
      code: "ERR_SOURCE_REVISION_MISMATCH",
      location: { file: legacyName, pointer: "" },
      data: { expectedHeader },
    });
  }

  for (const [index, fragment] of view.fragments.entries()) {
    const pointer = `/fragments/${index}`;
    const finding = quoteFinding(
      ctx.model.byId.get(fragment.id)?.verification,
      "fragment",
      fragment.id,
      "sources.yml",
      pointer,
      fragment.source_ref,
      legacyName,
    );
    if (finding !== null) findings.push(finding);

    if (fragment.in_scope !== false && !sectionInSlice(fragment.source_ref, view.slice)) {
      findings.push({
        code: "ERR_OUT_OF_SLICE_CONTENT",
        variant: "fragment",
        entityId: fragment.id,
        location: { file: "sources.yml", pointer: `${pointer}/source_ref` },
        data: { id: fragment.id, ref: fragment.source_ref },
      });
    }
  }

  for (const [index, decision] of view.decisions.entries()) {
    const pointer = `/decisions/${index}`;
    const finding = quoteFinding(
      ctx.model.byId.get(decision.id)?.verification,
      "decision",
      decision.id,
      "decisions.yml",
      pointer,
      decision.source_ref,
      legacyName,
    );
    if (finding !== null) findings.push(finding);
  }

  return findings;
};
