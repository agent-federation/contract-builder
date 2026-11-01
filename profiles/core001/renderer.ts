import path from "node:path";
import nunjucks from "nunjucks";
import { SEVERITY_LABEL, type Diagnostic, type Severity } from "../../spec/lib/diagnostics.js";
import type { ProjectModel } from "../../spec/lib/ir.js";
import type { RenderOptions, Renderer } from "../../spec/lib/render.js";
import {
  buildView,
  type AnalyzedProvision,
  type AnalyzedSpec,
  type Case,
  type Clause,
  type Decision,
  type Explication,
} from "./view.js";

class MemoryLoader extends nunjucks.Loader {
  readonly async = false;

  constructor(private readonly files: Record<string, string>) {
    super();
  }

  getSource(name: string): nunjucks.LoaderSource {
    const src = this.files[name];
    // Nunjucks treats a null source as "not found"; the published types omit that case.
    if (src === undefined) return null as unknown as nunjucks.LoaderSource;
    return { src, path: name, noCache: true };
  }
}

const label = (options: RenderOptions, key: string): string => options.labels?.[key] ?? key;

export const renderer: Renderer = {
  id: "core001-markdown",
  version: "0.1.0",
  async render(model: ProjectModel, options: RenderOptions): Promise<string> {
    const spec = buildView(model);
    const legacyName = path.basename(model.manifest.sources?.[0]?.path ?? "source");

    const env = new nunjucks.Environment(new MemoryLoader(options.templates.files), {
      autoescape: false,
      trimBlocks: true,
      lstripBlocks: true,
      throwOnUndefined: true,
    });

    env.addFilter("blockquote", (value: unknown) =>
      String(value)
        .split("\n")
        .map((line) => (line.length > 0 ? `> ${line}` : ">"))
        .join("\n"),
    );

    const view = toTemplateView(spec, options, legacyName);
    return finalize(env.render(options.templates.entry, view));
  },
};

function toTemplateView(spec: AnalyzedSpec, options: RenderOptions, legacyName: string) {
  const localDiagnostics = options.diagnostics.map((diagnostic: Diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    severityLabel: SEVERITY_LABEL[diagnostic.severity],
    file: diagnostic.file,
    pointer: diagnostic.pointer,
    message: diagnostic.message,
  }));

  const counts = {
    ...spec.counts,
    errors: countSeverity(options.diagnostics, "error"),
    reviews: countSeverity(options.diagnostics, "review"),
    warnings: countSeverity(options.diagnostics, "warning"),
  };

  return {
    mode: options.mode,
    modeLabel: label(options, `mode.${options.mode}`),
    isDraft: options.mode === "draft",
    document: spec.document,
    source: {
      id: spec.source.id,
      path: legacyName,
      document: spec.source.document,
      revision: spec.source.revision,
    },
    slice: {
      id: spec.slice.id,
      includes: spec.slice.includes.join(", "),
      excludes: spec.slice.excludes.join(", "),
    },
    counts,
    terms: spec.terms.map((term) => ({
      id: term.id,
      name: term.name,
      definition: term.definition,
      sourceRef: term.source_ref,
      fragmentId: term.fragment,
    })),
    provisions: spec.provisions.map((provision) => provisionView(provision, options)),
    decisions: spec.decisions.map((decision) => decisionView(decision, options)),
    trace: spec.provisions.map((provision) => ({
      fragmentId: provision.fragment,
      sourceRef: provision.source_ref,
      provisionId: provision.id,
      decisions:
        provision.resolved_dependencies.length > 0
          ? provision.resolved_dependencies.map((decision) => decision.id).join(", ")
          : "—",
      cases: provision.cases.map((testCase) => testCase.id).join(", "),
    })),
    diagnostics: localDiagnostics,
    diagnosticsGroups: (["error", "review", "warning"] as Severity[]).map((severity) => ({
      severity,
      label: SEVERITY_LABEL[severity],
      items: localDiagnostics.filter((diagnostic) => diagnostic.severity === severity),
    })),
  };
}

function provisionView(provision: AnalyzedProvision, options: RenderOptions) {
  return {
    id: provision.id,
    title: provision.title,
    sourceRef: provision.source_ref,
    fragmentId: provision.fragment,
    sourceQuote: provision.source_quote,
    claimQuote: provision.claim_quote,
    normalizedStatement: provision.normalized_statement,
    verbatim: provision.normalization_status === "verbatim",
    normalizationLabel: label(options, `normalization.${provision.normalization_status}`),
    normalizationStatus: provision.normalization_status,
    explications: provision.explications.map((explication) => explicationView(explication, options)),
    sourceModality: provision.source_modality,
    modalityMarker: provision.modality_marker,
    normativeEffect: provision.normative_effect,
    effectLabel: label(options, `effect.${provision.normative_effect}`),
    classificationKind: provision.classification_basis.kind,
    classificationKindLabel: label(options, `classification.${provision.classification_basis.kind}`),
    classificationQuote: provision.classification_basis.quote,
    classificationText: provision.classification_basis.text,
    binding: provision.binding,
    bindingLabel: label(options, provision.binding ? "binding.yes" : "binding.no"),
    applicability: provision.applicability,
    applicabilityLabel: label(options, `applicability.${provision.applicability}`),
    reviewStatus: provision.review.status,
    reviewStatusLabel: label(options, `review.${provision.review.status}`),
    reviewedBy: provision.review.reviewed_by,
    terms: provision.resolved_terms.map((term) => ({ id: term.id, name: term.name })),
    precondition:
      provision.precondition === null ? null : clauseView(provision.precondition, options),
    exception: provision.exception === null ? null : clauseView(provision.exception, options),
    dependencies: provision.resolved_dependencies.map((decision) => decisionView(decision, options)),
    mentions: provision.resolved_mentions.map((decision) => decisionView(decision, options)),
    unresolvedConditions: provision.unresolved_conditions,
    outsideSliceRefs: provision.outside_slice_refs,
    cases: provision.cases.map((testCase) => caseView(testCase, options)),
    caseCount: provision.cases.length,
    violatedCount: provision.violated_cases,
  };
}

function clauseView(clause: Clause, options: RenderOptions) {
  return {
    quote: clause.quote,
    text: clause.text,
    sourceModality: clause.source_modality,
    modalityMarker: clause.modality_marker,
    conditionKind: clause.condition_kind,
    conditionKindLabel:
      clause.condition_kind === null ? null : label(options, `condition.${clause.condition_kind}`),
  };
}

function explicationView(explication: Explication, options: RenderOptions) {
  return {
    kind: explication.kind,
    kindLabel: label(options, `explication.${explication.kind}`),
    text: explication.text,
    rationale: explication.rationale,
  };
}

function caseView(testCase: Case, options: RenderOptions) {
  return {
    id: testCase.id,
    given: testCase.scenario.given.join("; "),
    action: testCase.scenario.action,
    outcome: testCase.expected_outcome,
    outcomeLabel: label(options, `outcome.${testCase.expected_outcome}`),
    determination: testCase.source_determination,
    determinationLabel: label(options, `determination.${testCase.source_determination}`),
    basis: testCase.expectation_basis,
    basisLabel: label(options, `basis.${testCase.expectation_basis}`),
    rationale: testCase.rationale,
    rationaleFragment: testCase.rationale_fragment,
    reviewStatus: testCase.review.status,
  };
}

function decisionView(decision: Decision, options: RenderOptions) {
  return {
    id: decision.id,
    question: decision.question,
    status: decision.status,
    statusLabel: label(options, `decisionStatus.${decision.status}`),
    scope: decision.scope,
    scopeLabel: label(options, `scope.${decision.scope}`),
    resolution: decision.resolution,
    sourceRef: decision.source_ref,
    inScope: decision.in_scope,
    inScopeLabel: label(options, decision.in_scope ? "inScope.yes" : "inScope.no"),
  };
}

function countSeverity(diagnostics: readonly Diagnostic[], severity: Severity): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;
}

function finalize(markdown: string): string {
  const normalized = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/g, "\n");
  return normalized;
}
