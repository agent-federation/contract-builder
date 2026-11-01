import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import type { Diagnostic, Severity } from "./diagnostics.js";
import { SEVERITY_LABEL } from "./diagnostics.js";
import type {
  AnalyzedProvision,
  AnalyzedSpec,
  Case,
  Clause,
  Decision,
  Explication,
} from "../../profiles/core001/view.js";

const templateDir = fileURLToPath(new URL("../templates/", import.meta.url));

export type BuildMode = "draft" | "release";

const MODE_LABEL: Record<BuildMode, string> = {
  draft: "draft",
  release: "release",
};

const NORMALIZATION_LABEL = {
  verbatim: "дословно",
  paraphrase_reviewed: "пересказ, подтверждён",
  paraphrase_pending: "пересказ, не подтверждён",
} as const;

const EFFECT_LABEL = {
  obligation: "обязанность",
  prohibition: "запрет",
  permission: "разрешение",
  negative_entailment: "отрицание вывода",
  semantic_constraint: "семантическое ограничение",
  scope_statement: "утверждение об области",
  descriptive: "описание",
} as const;

const OUTCOME_LABEL = {
  satisfied: "satisfied — не противоречит",
  violated: "violated — противоречит",
} as const;

const DETERMINATION_LABEL = {
  determined: "определён источником",
  inferred: "выведен логически",
  underdetermined: "недоопределён источником",
  not_asserted_by_source: "источник молчит",
} as const;

const BASIS_LABEL = {
  obligation: "обязанность",
  prohibition: "запрет",
  permission: "разрешение",
  permission_with_necessary_condition: "разрешение с необходимым условием",
  negative_entailment: "отрицание вывода",
  semantic_constraint: "семантическое ограничение",
  scope_statement: "утверждение об области",
  absent: "основания нет",
} as const;

const EXPLICATION_LABEL = {
  modal_explication: "модальная экспликация",
  contrapositive: "контрапозиция",
  typographic_normalization: "типографическая нормализация",
  scope_explication: "экспликация области",
  model_to_implementation: "перенос модели в реализацию",
} as const;

const DECISION_STATUS_LABEL: Record<Decision["status"], string> = {
  open: "открыто",
  resolved: "решено",
  rejected: "отклонено",
};

const SCOPE_LABEL: Record<Decision["scope"], string> = {
  normative: "нормативное",
  editorial: "редакционное",
};

const REVIEW_STATUS_LABEL = {
  unreviewed: "не подтверждено",
  confirmed: "подтверждено",
} as const;

const CLASSIFICATION_KIND_LABEL = {
  explicit: "дословное основание",
  editorial_inference: "редакторский вывод",
} as const;

export function renderMarkdown(
  spec: AnalyzedSpec,
  mode: BuildMode,
  diagnostics: Diagnostic[],
  legacyName: string,
): string {
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templateDir), {
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

  const view = buildView(spec, mode, diagnostics, legacyName);
  return finalize(env.render("core001.md.j2", view));
}

function buildView(
  spec: AnalyzedSpec,
  mode: BuildMode,
  diagnostics: Diagnostic[],
  legacyName: string,
) {
  const localDiagnostics = diagnostics.map((d) => ({
    code: d.code,
    severity: d.severity,
    severityLabel: SEVERITY_LABEL[d.severity],
    file: d.file,
    pointer: d.pointer,
    message: d.message,
  }));

  const counts = {
    ...spec.counts,
    errors: countSeverity(diagnostics, "error"),
    reviews: countSeverity(diagnostics, "review"),
    warnings: countSeverity(diagnostics, "warning"),
  };

  return {
    mode,
    modeLabel: MODE_LABEL[mode],
    isDraft: mode === "draft",
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
    terms: spec.terms.map((t) => ({
      id: t.id,
      name: t.name,
      definition: t.definition,
      sourceRef: t.source_ref,
      fragmentId: t.fragment,
    })),
    provisions: spec.provisions.map((p) => provisionView(p)),
    decisions: spec.decisions.map((d) => decisionView(d)),
    trace: spec.provisions.map((p) => ({
      fragmentId: p.fragment,
      sourceRef: p.source_ref,
      provisionId: p.id,
      decisions: p.resolved_dependencies.length > 0
        ? p.resolved_dependencies.map((d) => d.id).join(", ")
        : "—",
      cases: p.cases.map((c) => c.id).join(", "),
    })),
    diagnostics: localDiagnostics,
    diagnosticsGroups: (["error", "review", "warning"] as Severity[]).map((severity) => ({
      severity,
      label: SEVERITY_LABEL[severity],
      items: localDiagnostics.filter((d) => d.severity === severity),
    })),
  };
}

function provisionView(p: AnalyzedProvision) {
  return {
    id: p.id,
    title: p.title,
    sourceRef: p.source_ref,
    fragmentId: p.fragment,
    sourceQuote: p.source_quote,
    claimQuote: p.claim_quote,
    normalizedStatement: p.normalized_statement,
    verbatim: p.normalization_status === "verbatim",
    normalizationLabel: NORMALIZATION_LABEL[p.normalization_status],
    normalizationStatus: p.normalization_status,
    explications: p.explications.map((e) => explicationView(e)),
    sourceModality: p.source_modality,
    modalityMarker: p.modality_marker,
    normativeEffect: p.normative_effect,
    effectLabel: EFFECT_LABEL[p.normative_effect],
    classificationKind: p.classification_basis.kind,
    classificationKindLabel: CLASSIFICATION_KIND_LABEL[p.classification_basis.kind],
    classificationQuote: p.classification_basis.quote,
    classificationText: p.classification_basis.text,
    binding: p.binding,
    bindingLabel: p.binding ? "да" : "нет",
    applicability: p.applicability,
    applicabilityLabel: p.applicability === "determined" ? "определена" : "зависит от решения",
    reviewStatus: p.review.status,
    reviewStatusLabel: REVIEW_STATUS_LABEL[p.review.status],
    reviewedBy: p.review.reviewed_by,
    terms: p.resolved_terms.map((t) => ({ id: t.id, name: t.name })),
    precondition: p.precondition === null ? null : clauseView(p.precondition),
    exception: p.exception === null ? null : clauseView(p.exception),
    dependencies: p.resolved_dependencies.map((d) => decisionView(d)),
    mentions: p.resolved_mentions.map((d) => decisionView(d)),
    unresolvedConditions: p.unresolved_conditions,
    outsideSliceRefs: p.outside_slice_refs,
    cases: p.cases.map((c) => caseView(c)),
    caseCount: p.cases.length,
    violatedCount: p.violated_cases,
  };
}

function clauseView(clause: Clause) {
  return {
    quote: clause.quote,
    text: clause.text,
    sourceModality: clause.source_modality,
    modalityMarker: clause.modality_marker,
    conditionKind: clause.condition_kind,
    conditionKindLabel:
      clause.condition_kind === "necessary"
        ? "необходимое условие"
        : clause.condition_kind === "temporal"
          ? "временное условие"
          : null,
  };
}

function explicationView(e: Explication) {
  return {
    kind: e.kind,
    kindLabel: EXPLICATION_LABEL[e.kind],
    text: e.text,
    rationale: e.rationale,
  };
}

function caseView(c: Case) {
  return {
    id: c.id,
    given: c.scenario.given.join("; "),
    action: c.scenario.action,
    outcome: c.expected_outcome,
    outcomeLabel: OUTCOME_LABEL[c.expected_outcome],
    determination: c.source_determination,
    determinationLabel: DETERMINATION_LABEL[c.source_determination],
    basis: c.expectation_basis,
    basisLabel: BASIS_LABEL[c.expectation_basis],
    rationale: c.rationale,
    rationaleFragment: c.rationale_fragment,
    reviewStatus: c.review.status,
  };
}

function decisionView(d: Decision) {
  return {
    id: d.id,
    question: d.question,
    status: d.status,
    statusLabel: DECISION_STATUS_LABEL[d.status],
    scope: d.scope,
    scopeLabel: SCOPE_LABEL[d.scope],
    resolution: d.resolution,
    sourceRef: d.source_ref,
    inScope: d.in_scope,
    inScopeLabel: d.in_scope ? "в срезе" : "вне среза",
  };
}

function countSeverity(diagnostics: Diagnostic[], severity: Severity): number {
  return diagnostics.filter((d) => d.severity === severity).length;
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
