import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { AnalyzedProvision, Clause, NormativeEffect, Provision, SourceModality } from "../view.js";
import type { Check, CheckContext } from "../context.js";
import { collapse, normalizeText } from "../text.js";

/**
 * Auxiliary consistency matrix. It is NOT a derivation of normative meaning: it only rejects
 * combinations that would strengthen or weaken the declared source modality.
 */
const ALLOWED_EFFECTS: Record<SourceModality, NormativeEffect[]> = {
  MUST: ["obligation"],
  MUST_NOT: ["prohibition"],
  SHOULD: ["obligation", "prohibition"],
  SHOULD_NOT: ["prohibition", "obligation"],
  MAY: ["permission", "descriptive"],
  DECLARATIVE: ["negative_entailment", "semantic_constraint", "scope_statement", "descriptive"],
  DECLARATIVE_NEGATION: [
    "negative_entailment",
    "semantic_constraint",
    "scope_statement",
    "descriptive",
  ],
};

export const check: Check = (ctx: CheckContext) => {
  const findings: ValidatorFinding[] = [];
  const fragmentById = new Map(ctx.view.fragments.map((fragment) => [fragment.id, fragment]));

  for (const [index, provision] of ctx.view.provisions.entries()) {
    const pointer = `/provisions/${index}`;
    const fragment = fragmentById.get(provision.fragment);
    // A missing fragment is a core reference error, reported before the hook runs.
    if (fragment === undefined) continue;

    if (fragment.in_scope === false) {
      findings.push({
        code: "ERR_OUT_OF_SLICE_CONTENT",
        variant: "provision",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/fragment` },
        data: { id: provision.id, fragment: provision.fragment },
      });
    }

    if (provision.source_ref !== fragment.source_ref) {
      findings.push({
        code: "ERR_SOURCE_REF_MISMATCH",
        variant: "provision",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/source_ref` },
        data: { sourceRef: provision.source_ref, fragmentRef: fragment.source_ref },
      });
    }

    const sourceFlat = collapse(provision.source_quote);
    const claimFlat = collapse(provision.claim_quote);
    const fragmentFlat = collapse(fragment.quote);

    if (!fragmentFlat.includes(sourceFlat)) {
      findings.push({
        code: "ERR_QUOTE_NOT_IN_FRAGMENT",
        variant: "provision",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/source_quote` },
        data: { id: provision.id, fragment: provision.fragment },
      });
    }
    if (!sourceFlat.includes(claimFlat)) {
      findings.push({
        code: "ERR_CLAIM_NOT_IN_SOURCE",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/claim_quote` },
        data: { id: provision.id },
      });
    }

    findings.push(
      ...clauseFindings(provision.precondition, sourceFlat, provision.id, pointer, "precondition"),
    );
    findings.push(
      ...clauseFindings(provision.exception, sourceFlat, provision.id, pointer, "exception"),
    );

    findings.push(...markerFindings(provision, claimFlat, pointer));

    const allowed = ALLOWED_EFFECTS[provision.source_modality];
    if (!allowed.includes(provision.normative_effect)) {
      findings.push({
        code: "ERR_MODALITY_UPGRADE",
        variant: "provision",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/normative_effect` },
        data: {
          modality: provision.source_modality,
          effect: provision.normative_effect,
          allowed: allowed.join(", "),
        },
      });
    }

    if (!claimFlat.includes(collapse(provision.classification_basis.quote))) {
      findings.push({
        code: "ERR_CLASSIFICATION_BASIS",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/classification_basis/quote` },
        data: { quote: provision.classification_basis.quote },
      });
    }

    findings.push(...explicationFindings(provision, pointer));

    if (!provision.binding && provision.normative_relevance) {
      findings.push({
        code: "WARN_NON_BINDING_PROVISION",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/normative_effect` },
        data: { id: provision.id, effect: provision.normative_effect },
      });
    }

    if (provision.unresolved_conditions.length > 0) {
      findings.push({
        code: "WARN_UNRESOLVED_CONDITION",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/unresolved_conditions` },
        data: {
          id: provision.id,
          conditions: provision.unresolved_conditions.map((condition) => condition.text).join("; "),
        },
      });
    }

    for (const [position, ref] of provision.outside_slice_refs.entries()) {
      if (ref.in_scope !== false) {
        findings.push({
          code: "ERR_OUT_OF_SLICE_CONTENT",
          variant: "outside-ref",
          entityId: provision.id,
          location: {
            file: "semantics.json",
            pointer: `${pointer}/outside_slice_refs/${position}`,
          },
          data: { target: ref.target },
        });
      }
      findings.push({
        code: "WARN_OUTSIDE_SLICE_REF",
        variant: "outside-ref",
        entityId: provision.id,
        location: {
          file: "semantics.json",
          pointer: `${pointer}/outside_slice_refs/${position}`,
        },
        data: { target: ref.target },
      });
    }
  }

  return findings;
};

function markerFindings(
  provision: Provision,
  claimFlat: string,
  pointer: string,
): ValidatorFinding[] {
  if (provision.source_modality === "DECLARATIVE") return [];

  if (provision.modality_marker === null || provision.modality_marker.trim() === "") {
    return [
      {
        code: "ERR_MODALITY_MARKER",
        variant: "provision-empty",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/modality_marker` },
        data: { modality: provision.source_modality },
      },
    ];
  }

  if (!claimFlat.includes(collapse(provision.modality_marker))) {
    return [
      {
        code: "ERR_MODALITY_MARKER",
        variant: "provision-missing",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/modality_marker` },
        data: { marker: provision.modality_marker, id: provision.id },
      },
    ];
  }

  return [];
}

function clauseFindings(
  clause: Clause | null,
  sourceFlat: string,
  provisionId: string,
  pointer: string,
  field: "precondition" | "exception",
): ValidatorFinding[] {
  if (clause === null) return [];

  const findings: ValidatorFinding[] = [];
  if (!sourceFlat.includes(collapse(clause.quote))) {
    findings.push({
      code: "ERR_CLAUSE_NOT_IN_SOURCE",
      entityId: provisionId,
      location: { file: "semantics.json", pointer: `${pointer}/${field}/quote` },
      data: { field, id: provisionId },
    });
  }

  if (clause.source_modality !== "DECLARATIVE") {
    if (clause.modality_marker === null || clause.modality_marker.trim() === "") {
      findings.push({
        code: "ERR_MODALITY_MARKER",
        variant: "clause-empty",
        entityId: provisionId,
        location: { file: "semantics.json", pointer: `${pointer}/${field}/modality_marker` },
        data: { modality: clause.source_modality, field, id: provisionId },
      });
    } else if (!collapse(clause.quote).includes(collapse(clause.modality_marker))) {
      findings.push({
        code: "ERR_MODALITY_MARKER",
        variant: "clause-missing",
        entityId: provisionId,
        location: { file: "semantics.json", pointer: `${pointer}/${field}/modality_marker` },
        data: { marker: clause.modality_marker, field, id: provisionId },
      });
    }
  }

  return findings;
}

function explicationFindings(provision: AnalyzedProvision, pointer: string): ValidatorFinding[] {
  if (provision.normalization_status === "verbatim") return [];

  const findings: ValidatorFinding[] = [];
  if (provision.explications.length === 0) {
    findings.push({
      code: "ERR_UNEXPLAINED_PARAPHRASE",
      entityId: provision.id,
      location: { file: "semantics.json", pointer: `${pointer}/explications` },
      data: { id: provision.id },
    });
  }

  const normalizedFlat = normalizeText(provision.normalized_statement);
  for (const [position, explication] of provision.explications.entries()) {
    if (!normalizedFlat.includes(normalizeText(explication.text))) {
      findings.push({
        code: "ERR_EXPLICATION_NOT_IN_STATEMENT",
        entityId: provision.id,
        location: { file: "semantics.json", pointer: `${pointer}/explications/${position}/text` },
        data: { text: explication.text },
      });
    }
  }

  return findings;
}
