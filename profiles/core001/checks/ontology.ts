import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { Check, CheckContext } from "../context.js";
import { collapse } from "../text.js";

export const check: Check = (ctx: CheckContext) => {
  const findings: ValidatorFinding[] = [];
  const fragmentById = new Map(ctx.view.fragments.map((fragment) => [fragment.id, fragment]));

  // The ontology is rendered against the source the build loaded; if their declared
  // revisions diverge, the artifact claims a revision the source header never confirmed.
  const ontologyRevision = ctx.view.document.revision;
  const sourceRevision = ctx.view.source.revision;
  if (ontologyRevision !== sourceRevision) {
    findings.push({
      code: "ERR_SOURCE_REVISION_MISMATCH",
      variant: "ontology",
      location: { file: "ontology.yml", pointer: "/document/revision" },
      data: {
        ontologyRevision,
        sourceRevision,
        sourceId: ctx.view.source.id,
      },
    });
  }

  for (const [index, term] of ctx.view.terms.entries()) {
    const pointer = `/terms/${index}`;
    const fragment = fragmentById.get(term.fragment);
    // A missing fragment is a core reference error, reported before the hook runs.
    if (fragment === undefined) continue;

    if (term.source_ref !== fragment.source_ref) {
      findings.push({
        code: "ERR_SOURCE_REF_MISMATCH",
        variant: "term",
        entityId: term.id,
        location: { file: "ontology.yml", pointer: `${pointer}/source_ref` },
        data: { sourceRef: term.source_ref, fragmentRef: fragment.source_ref },
      });
    }

    if (!collapse(fragment.quote).includes(collapse(term.definition))) {
      findings.push({
        code: "ERR_QUOTE_NOT_IN_FRAGMENT",
        variant: "term",
        entityId: term.id,
        location: { file: "ontology.yml", pointer: `${pointer}/definition` },
        data: { id: term.id, fragment: term.fragment },
      });
    }
  }

  return findings;
};
