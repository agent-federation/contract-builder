/**
 * CORE-001 view types.
 *
 * These shapes are profile data, not part of the generic IR. `semantic.ts` and `render.ts`
 * import them with `import type` until PR 4/5 move those modules into the profile.
 */

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
