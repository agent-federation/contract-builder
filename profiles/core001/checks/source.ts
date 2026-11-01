import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { Check, CheckContext } from "../context.js";
import { sectionInSlice } from "../slice.js";
import { collapse } from "../text.js";

export const check: Check = async (ctx: CheckContext) => {
  const findings: ValidatorFinding[] = [];
  const { view, legacyText, legacyName } = ctx;
  const legacyFlat = collapse(legacyText);

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

    if (!legacyFlat.includes(collapse(fragment.quote))) {
      findings.push({
        code: "ERR_SOURCE_QUOTE_NOT_FOUND",
        variant: "fragment",
        entityId: fragment.id,
        location: { file: "sources.yml", pointer: `${pointer}/quote` },
        data: { id: fragment.id, legacyName },
      });
    } else {
      const location = await ctx.verifyQuote(
        fragment.source,
        fragment.source_ref,
        fragment.quote,
      );
      if (location === "unknown-locator") {
        findings.push({
          code: "ERR_SOURCE_LOCATOR_UNKNOWN",
          variant: "fragment",
          entityId: fragment.id,
          location: { file: "sources.yml", pointer: `${pointer}/source_ref` },
          data: { ref: fragment.source_ref, legacyName },
        });
      } else if (location === "outside") {
        findings.push({
          code: "ERR_SOURCE_LOCATOR_MISMATCH",
          variant: "fragment",
          entityId: fragment.id,
          location: { file: "sources.yml", pointer: `${pointer}/quote` },
          data: { id: fragment.id, ref: fragment.source_ref },
        });
      }
    }

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

    if (!legacyFlat.includes(collapse(decision.source_quote))) {
      findings.push({
        code: "ERR_SOURCE_QUOTE_NOT_FOUND",
        variant: "decision",
        entityId: decision.id,
        location: { file: "decisions.yml", pointer: `${pointer}/source_quote` },
        data: { id: decision.id, legacyName },
      });
    } else {
      const location = await ctx.verifyQuote(
        decision.source,
        decision.source_ref,
        decision.source_quote,
      );
      if (location === "unknown-locator") {
        findings.push({
          code: "ERR_SOURCE_LOCATOR_UNKNOWN",
          variant: "decision",
          entityId: decision.id,
          location: { file: "decisions.yml", pointer: `${pointer}/source_ref` },
          data: { ref: decision.source_ref, legacyName },
        });
      } else if (location === "outside") {
        findings.push({
          code: "ERR_SOURCE_LOCATOR_MISMATCH",
          variant: "decision",
          entityId: decision.id,
          location: { file: "decisions.yml", pointer: `${pointer}/source_quote` },
          data: { id: decision.id, ref: decision.source_ref },
        });
      }
    }
  }

  return findings;
};
