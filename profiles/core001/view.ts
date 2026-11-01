/**
 * CORE-001 view types.
 *
 * These shapes are profile data, not part of the generic IR. `render.ts` imports them with
 * `import type` until PR 5 moves the renderer into the profile.
 */

import type { Entity, ProjectModel } from "../../spec/lib/ir.js";
import { normalizeText } from "./text.js";

export type SourceModality =
  | "MUST"
  | "MUST_NOT"
  | "SHOULD"
  | "SHOULD_NOT"
  | "MAY"
  | "DECLARATIVE"
  | "DECLARATIVE_NEGATION";

export type NormativeEffect =
  | "obligation"
  | "prohibition"
  | "permission"
  | "negative_entailment"
  | "semantic_constraint"
  | "scope_statement"
  | "descriptive";

export type ExpectedOutcome = "satisfied" | "violated";

export type SourceDetermination =
  | "determined"
  | "inferred"
  | "underdetermined"
  | "not_asserted_by_source";

export type ExpectationBasis =
  | "obligation"
  | "prohibition"
  | "permission"
  | "permission_with_necessary_condition"
  | "negative_entailment"
  | "semantic_constraint"
  | "scope_statement"
  | "absent";

export interface SourceDecl {
  id: string;
  path: string;
  document: string;
  revision: string;
}

export interface Slice {
  id: string;
  includes: string[];
  excludes: string[];
}

export interface Fragment {
  id: string;
  source: string;
  source_ref: string;
  quote: string;
  in_scope?: boolean;
}

export interface SourcesDoc {
  sources: SourceDecl[];
  slice: Slice;
  fragments: Fragment[];
}

export interface DocHeader {
  id: string;
  title: string;
  revision: string;
  source: string;
  slice: string;
  slice_title: string;
}

export interface Term {
  id: string;
  name: string;
  definition: string;
  fragment: string;
  source_ref: string;
}

export interface OntologyDoc {
  document: DocHeader;
  terms: Term[];
}

export interface Review {
  status: "unreviewed" | "confirmed";
  reviewed_by: string | null;
}

export interface Clause {
  quote: string;
  text: string;
  source_modality: SourceModality;
  modality_marker: string | null;
  condition_kind: "necessary" | "temporal" | null;
}

export interface Explication {
  kind:
    | "modal_explication"
    | "contrapositive"
    | "typographic_normalization"
    | "scope_explication"
    | "model_to_implementation";
  text: string;
  rationale: string;
}

export interface ClassificationBasis {
  kind: "explicit" | "editorial_inference";
  quote: string;
  text: string;
}

export interface UnresolvedCondition {
  text: string;
  reason: string;
}

export interface OutsideSliceRef {
  target: string;
  in_scope: false;
  note: string;
}

export interface Provision {
  id: string;
  title: string;
  fragment: string;
  source_ref: string;
  source_quote: string;
  claim_quote: string;
  normalized_statement: string;
  explications: Explication[];
  source_modality: SourceModality;
  modality_marker: string | null;
  normative_effect: NormativeEffect;
  classification_basis: ClassificationBasis;
  terms: string[];
  precondition: Clause | null;
  exception: Clause | null;
  decision_dependencies: string[];
  decision_mentions: string[];
  unresolved_conditions: UnresolvedCondition[];
  outside_slice_refs: OutsideSliceRef[];
  review: Review;
}

export interface SemanticsDoc {
  provisions: Provision[];
}

export interface Decision {
  id: string;
  question: string;
  status: "open" | "resolved" | "rejected";
  scope: "normative" | "editorial";
  resolution: string | null;
  source: string;
  source_ref: string;
  source_quote: string;
  in_scope: boolean;
}

export interface DecisionsDoc {
  decisions: Decision[];
}

export interface Case {
  id: string;
  provision: string;
  scenario: { given: string[]; action: string };
  expected_outcome: ExpectedOutcome;
  source_determination: SourceDetermination;
  expectation_basis: ExpectationBasis;
  rationale: string;
  rationale_fragment: string;
  review: Review;
}

export interface CasesDoc {
  cases: Case[];
}

export interface RawSpec {
  sources: SourcesDoc;
  ontology: OntologyDoc;
  semantics: SemanticsDoc;
  decisions: DecisionsDoc;
  cases: CasesDoc;
}

export type NormalizationStatus = "verbatim" | "paraphrase_reviewed" | "paraphrase_pending";
export type Applicability = "determined" | "decision_dependent";

export interface AnalyzedProvision extends Provision {
  normalization_status: NormalizationStatus;
  applicability: Applicability;
  binding: boolean;
  normative_relevance: boolean;
  cases: Case[];
  violated_cases: number;
  resolved_terms: Term[];
  resolved_dependencies: Decision[];
  resolved_mentions: Decision[];
  fragment_resolved: Fragment;
}

export interface AnalyzedSpec {
  document: DocHeader;
  source: SourceDecl;
  slice: Slice;
  fragments: Fragment[];
  terms: Term[];
  provisions: AnalyzedProvision[];
  decisions: Decision[];
  cases: Case[];
  counts: {
    terms: number;
    provisions: number;
    binding: number;
    cases: number;
    reviewed: number;
    openDecisions: number;
  };
}

/** Documents the view needs; the core checks them before calling `buildView`. */
export const requires = ["sources", "ontology"];

const BINDING_EFFECTS = new Set<NormativeEffect>([
  "obligation",
  "prohibition",
  "negative_entailment",
  "semantic_constraint",
]);

/** Projection of the generic model into the CORE-001 document view, including derived values. */
export function buildView(model: ProjectModel): AnalyzedSpec {
  const sourcesDocument = model.documents.sources as SourcesDoc;
  const ontologyDocument = model.documents.ontology as OntologyDoc;

  const fragments = byKind(model, "fragment").map(toFragment);
  const terms = byKind(model, "term").map(toTerm);
  const decisions = byKind(model, "decision").map(toDecision);
  const cases = byKind(model, "case").map(toCase);

  const termById = new Map(terms.map((term) => [term.id, term]));
  const fragmentById = new Map(fragments.map((fragment) => [fragment.id, fragment]));
  const decisionById = new Map(decisions.map((decision) => [decision.id, decision]));
  const caseById = new Map(cases.map((testCase) => [testCase.id, testCase]));

  const provisions: AnalyzedProvision[] = byKind(model, "provision").map((entity) => {
    const provision = toProvision(entity);
    const verbatim =
      normalizeText(provision.normalized_statement) === normalizeText(provision.source_quote);
    const normalizationStatus: NormalizationStatus = verbatim
      ? "verbatim"
      : provision.review?.status === "confirmed"
        ? "paraphrase_reviewed"
        : "paraphrase_pending";
    const resolvedDependencies = resolveDecisions(entity.relations.dependsOn, decisionById);
    const resolvedMentions = resolveDecisions(entity.relations.mentions, decisionById);
    const vectors = (entity.relations.vectors ?? [])
      .map((id) => caseById.get(id))
      .filter((testCase): testCase is Case => testCase !== undefined);

    return {
      ...provision,
      normalization_status: normalizationStatus,
      applicability: resolvedDependencies.some((decision) => decision.status === "open")
        ? "decision_dependent"
        : "determined",
      binding: BINDING_EFFECTS.has(provision.normative_effect),
      normative_relevance: provision.normative_effect !== "descriptive",
      cases: vectors,
      violated_cases: vectors.filter((testCase) => testCase.expected_outcome === "violated").length,
      resolved_terms: provision.terms
        .map((id) => termById.get(id))
        .filter((term): term is Term => term !== undefined),
      resolved_dependencies: resolvedDependencies,
      resolved_mentions: resolvedMentions,
      fragment_resolved: fragmentById.get(provision.fragment) ?? {
        id: provision.fragment,
        source: "",
        source_ref: "",
        quote: "",
      },
    };
  });

  return {
    document: ontologyDocument.document,
    source: legacySources(model)[0] ?? {
      id: "SRC-UNKNOWN",
      path: "",
      document: ontologyDocument.document.id,
      revision: ontologyDocument.document.revision,
    },
    slice: sourcesDocument.slice,
    fragments,
    terms,
    provisions,
    decisions,
    cases,
    counts: {
      terms: terms.length,
      provisions: provisions.length,
      binding: provisions.filter((provision) => provision.binding).length,
      cases: cases.length,
      reviewed: provisions.filter((provision) => provision.review?.status === "confirmed").length,
      openDecisions: decisions.filter((decision) => decision.status === "open").length,
    },
  };
}

function byKind(model: ProjectModel, kind: string): Entity[] {
  return model.byKind.get(kind) ?? [];
}

function resolveDecisions(
  ids: readonly string[] | undefined,
  byId: ReadonlyMap<string, Decision>,
): Decision[] {
  return (ids ?? [])
    .map((id) => byId.get(id))
    .filter((decision): decision is Decision => decision !== undefined);
}

function toFragment(entity: Entity): Fragment {
  return { ...(entity.fields as unknown as Omit<Fragment, "id">), id: entity.id };
}

function toTerm(entity: Entity): Term {
  const fields = entity.fields as unknown as Omit<Term, "id" | "fragment">;
  return { ...fields, id: entity.id, fragment: firstRelation(entity, "fragment") };
}

function toProvision(entity: Entity): Provision {
  const fields = entity.fields as unknown as Omit<
    Provision,
    "id" | "fragment" | "terms" | "decision_dependencies" | "decision_mentions"
  >;
  return {
    ...fields,
    id: entity.id,
    fragment: firstRelation(entity, "fragment"),
    terms: entity.relations.terms ?? [],
    decision_dependencies: entity.relations.dependsOn ?? [],
    decision_mentions: entity.relations.mentions ?? [],
    explications: fields.explications ?? [],
    unresolved_conditions: fields.unresolved_conditions ?? [],
    outside_slice_refs: fields.outside_slice_refs ?? [],
  };
}

function toDecision(entity: Entity): Decision {
  return { ...(entity.fields as unknown as Omit<Decision, "id">), id: entity.id };
}

function toCase(entity: Entity): Case {
  const fields = entity.fields as unknown as Omit<Case, "id" | "provision" | "rationale_fragment">;
  return {
    ...fields,
    id: entity.id,
    provision: firstRelation(entity, "provision"),
    rationale_fragment: firstRelation(entity, "rationaleFragment"),
  };
}

function firstRelation(entity: Entity, name: string): string {
  return entity.relations[name]?.[0] ?? "";
}

function legacySources(model: ProjectModel): SourceDecl[] {
  return (model.manifest.sources ?? []).map((source) => ({
    id: source.id,
    path: source.path,
    document: source.identity?.document ?? "",
    revision: source.identity?.revision ?? "",
  }));
}
