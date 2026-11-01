import type { Diagnostics } from "./diagnostics.js";
import { isObject } from "./guards.js";
import { DEFAULT_ADAPTERS } from "./adapters/index.js";
import { parseLocator } from "./adapters/markdown.js";
import type { LocatorResult, SourceAdapter } from "./source.js";
import type { Entity, ProjectModel } from "./ir.js";
import type {
  AnalyzedProvision,
  AnalyzedSpec,
  Case,
  Decision,
  Fragment,
  NormativeEffect,
  OntologyDoc,
  Provision,
  RawSpec,
  SourceDecl,
  SourceModality,
  SourcesDoc,
  Term,
} from "../../profiles/core001/view.js";

const BINDING_EFFECTS = new Set<NormativeEffect>([
  "obligation",
  "prohibition",
  "negative_entailment",
  "semantic_constraint",
]);

/**
 * Auxiliary consistency matrix. It is NOT a derivation of normative meaning:
 * it only rejects combinations that would strengthen or weaken the declared
 * source modality. A human still owns `normative_effect`.
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

const LATIN_TOKEN = /\b[A-Z][A-Za-z0-9]{2,}\b/g;
const IGNORED_TOKENS = new Set(["UIA", "MUST", "SHOULD", "MAY", "REQUIRED"]);

const FILE = {
  sources: "sources.yml",
  ontology: "ontology.yml",
  semantics: "semantics.json",
  decisions: "decisions.yml",
  cases: "conformance/cases.yml",
};

export async function analyze(
  model: ProjectModel,
  legacyName: string,
  diags: Diagnostics,
  adapters: Record<string, SourceAdapter> = DEFAULT_ADAPTERS,
): Promise<AnalyzedSpec | null> {
  if (!isObject(model.documents.sources) || !isObject(model.documents.ontology)) {
    diags.error(
      "core.profile.invalid",
      "profile.json",
      "/documents",
      "Профиль CORE-001 должен связывать документы sources и ontology",
    );
    return null;
  }

  const sourceDocument = model.sources[0];
  if (sourceDocument === undefined) {
    diags.error(
      "ERR_UNKNOWN_REF",
      "contract-builder.json",
      "/sources",
      "Не объявлен источник документа",
    );
    return null;
  }
  const adapter = adapters[sourceDocument.adapter];
  if (adapter === undefined) {
    diags.error(
      "core.registry.missing",
      "contract-builder.json",
      "/sources/0/adapter",
      `Адаптер "${sourceDocument.adapter}" не зарегистрирован`,
    );
    return null;
  }

  const raw = projectView(model);
  const legacy = new TextDecoder().decode(sourceDocument.bytes);
  const legacyFlat = collapse(legacy);

  // Quote verification goes through the source adapter; the containment pre-check below
  // decides whether a quote is verified at all, as before.
  const verified = new Map<string, LocatorResult>();
  for (const fragment of raw.sources.fragments) {
    if (legacyFlat.includes(collapse(fragment.quote))) {
      verified.set(
        fragment.id,
        await adapter.verifyQuote(sourceDocument, fragment.source_ref, fragment.quote),
      );
    }
  }
  for (const decision of raw.decisions.decisions) {
    if (legacyFlat.includes(collapse(decision.source_quote))) {
      verified.set(
        decision.id,
        await adapter.verifyQuote(sourceDocument, decision.source_ref, decision.source_quote),
      );
    }
  }
  const termById = new Map(raw.ontology.terms.map((t) => [t.id, t]));
  const fragmentById = new Map(raw.sources.fragments.map((f) => [f.id, f]));
  const decisionById = new Map(raw.decisions.decisions.map((d) => [d.id, d]));
  const provisionById = new Map(raw.semantics.provisions.map((p) => [p.id, p]));
  const termNames = new Set(raw.ontology.terms.map((t) => t.name));

  const seenIds = new Map<string, string>();
  const registerId = (id: string, file: string, pointer: string): void => {
    const previous = seenIds.get(id);
    if (previous !== undefined) {
      diags.error("ERR_DUPLICATE_ID", file, pointer, `ID "${id}" уже объявлен: ${previous}`);
      return;
    }
    seenIds.set(id, `${file}${pointer}`);
  };

  // --- source document integrity -------------------------------------------
  const source = raw.sources.sources[0];
  if (source === undefined) {
    diags.error("ERR_UNKNOWN_REF", FILE.sources, "/sources", "Не объявлен ни один источник");
  } else {
    const expectedHeader = `${source.document} (Rev ${source.revision})`;
    if (!legacy.slice(0, 500).includes(expectedHeader)) {
      diags.error(
        "ERR_SOURCE_REVISION_MISMATCH",
        legacyName,
        "",
        `Первые строки источника не содержат "${expectedHeader}". Источник изменился или объявлена неверная ревизия.`,
      );
    }
  }

  // --- fragments ------------------------------------------------------------
  raw.sources.fragments.forEach((fragment, index) => {
    const pointer = `/fragments/${index}`;
    registerId(fragment.id, FILE.sources, `${pointer}/id`);

    if (!raw.sources.sources.some((s) => s.id === fragment.source)) {
      diags.error("ERR_UNKNOWN_REF", FILE.sources, `${pointer}/source`, `Неизвестный источник "${fragment.source}"`);
    }

    if (!legacyFlat.includes(collapse(fragment.quote))) {
      diags.error(
        "ERR_SOURCE_QUOTE_NOT_FOUND",
        FILE.sources,
        `${pointer}/quote`,
        `Цитата фрагмента "${fragment.id}" не найдена в ${legacyName}. Источник и машинное представление разошлись.`,
      );
    } else {
      const location = verified.get(fragment.id)!;
      if (location === "unknown-locator") {
        diags.error(
          "ERR_SOURCE_LOCATOR_UNKNOWN",
          FILE.sources,
          `${pointer}/source_ref`,
          `source_ref "${fragment.source_ref}" не разобран или раздел не найден в ${legacyName}. Ожидается "<SOURCE>#<section>[/table/<column>|/<item>]".`,
        );
      } else if (location === "outside") {
        diags.error(
          "ERR_SOURCE_LOCATOR_MISMATCH",
          FILE.sources,
          `${pointer}/quote`,
          `Цитата фрагмента "${fragment.id}" найдена в документе, но не внутри объявленного места "${fragment.source_ref}".`,
        );
      }
    }

    if (fragment.in_scope !== false && !sectionInSlice(fragment.source_ref, raw.sources.slice)) {
      diags.error(
        "ERR_OUT_OF_SLICE_CONTENT",
        FILE.sources,
        `${pointer}/source_ref`,
        `Фрагмент "${fragment.id}" расположен вне объявленного среза (${fragment.source_ref}). Содержание вне среза не импортируется.`,
      );
    }
  });

  // --- terms ----------------------------------------------------------------
  const terms: Term[] = [];
  raw.ontology.terms.forEach((term, index) => {
    const pointer = `/terms/${index}`;
    registerId(term.id, FILE.ontology, `${pointer}/id`);
    terms.push(term);

    const fragment = fragmentById.get(term.fragment);
    if (fragment === undefined) {
      diags.error("ERR_UNKNOWN_REF", FILE.ontology, `${pointer}/fragment`, `Неизвестный фрагмент "${term.fragment}"`);
      return;
    }
    if (term.source_ref !== fragment.source_ref) {
      diags.error(
        "ERR_SOURCE_REF_MISMATCH",
        FILE.ontology,
        `${pointer}/source_ref`,
        `source_ref термина "${term.source_ref}" не совпадает с source_ref фрагмента "${fragment.source_ref}"`,
      );
    }
    if (!collapse(fragment.quote).includes(collapse(term.definition))) {
      diags.error(
        "ERR_QUOTE_NOT_IN_FRAGMENT",
        FILE.ontology,
        `${pointer}/definition`,
        `Определение термина "${term.id}" не является дословной частью фрагмента "${term.fragment}". Пересказ в определении запрещён.`,
      );
    }
  });

  // --- decisions ------------------------------------------------------------
  raw.decisions.decisions.forEach((decision, index) => {
    const pointer = `/decisions/${index}`;
    registerId(decision.id, FILE.decisions, `${pointer}/id`);

    if (!raw.sources.sources.some((s) => s.id === decision.source)) {
      diags.error("ERR_UNKNOWN_REF", FILE.decisions, `${pointer}/source`, `Неизвестный источник "${decision.source}"`);
    }
    if (!legacyFlat.includes(collapse(decision.source_quote))) {
      diags.error(
        "ERR_SOURCE_QUOTE_NOT_FOUND",
        FILE.decisions,
        `${pointer}/source_quote`,
        `Цитата решения "${decision.id}" не найдена в ${legacyName}.`,
      );
    } else {
      const location = verified.get(decision.id)!;
      if (location === "unknown-locator") {
        diags.error(
          "ERR_SOURCE_LOCATOR_UNKNOWN",
          FILE.decisions,
          `${pointer}/source_ref`,
          `source_ref "${decision.source_ref}" не разобран или раздел не найден в ${legacyName}.`,
        );
      } else if (location === "outside") {
        diags.error(
          "ERR_SOURCE_LOCATOR_MISMATCH",
          FILE.decisions,
          `${pointer}/source_quote`,
          `Цитата решения "${decision.id}" найдена в документе, но не внутри объявленного места "${decision.source_ref}".`,
        );
      }
    }
  });

  // --- provisions -----------------------------------------------------------
  const provisions: AnalyzedProvision[] = [];

  raw.semantics.provisions.forEach((provision, index) => {
    const pointer = `/provisions/${index}`;
    registerId(provision.id, FILE.semantics, `${pointer}/id`);

    const fragment = fragmentById.get(provision.fragment);
    if (fragment === undefined) {
      diags.error("ERR_UNKNOWN_REF", FILE.semantics, `${pointer}/fragment`, `Неизвестный фрагмент "${provision.fragment}"`);
      return;
    }
    if (fragment.in_scope === false) {
      diags.error(
        "ERR_OUT_OF_SLICE_CONTENT",
        FILE.semantics,
        `${pointer}/fragment`,
        `Положение "${provision.id}" опирается на фрагмент вне среза "${provision.fragment}".`,
      );
    }
    if (provision.source_ref !== fragment.source_ref) {
      diags.error(
        "ERR_SOURCE_REF_MISMATCH",
        FILE.semantics,
        `${pointer}/source_ref`,
        `source_ref положения "${provision.source_ref}" не совпадает с source_ref фрагмента "${fragment.source_ref}"`,
      );
    }

    const sourceFlat = collapse(provision.source_quote);
    const claimFlat = collapse(provision.claim_quote);
    const fragmentFlat = collapse(fragment.quote);

    if (!fragmentFlat.includes(sourceFlat)) {
      diags.error(
        "ERR_QUOTE_NOT_IN_FRAGMENT",
        FILE.semantics,
        `${pointer}/source_quote`,
        `source_quote положения "${provision.id}" не является частью фрагмента "${provision.fragment}".`,
      );
    }
    if (!sourceFlat.includes(claimFlat)) {
      diags.error(
        "ERR_CLAIM_NOT_IN_SOURCE",
        FILE.semantics,
        `${pointer}/claim_quote`,
        `claim_quote положения "${provision.id}" не является частью source_quote.`,
      );
    }

    checkClause(provision.precondition, sourceFlat, provision.id, pointer, "precondition", diags);
    checkClause(provision.exception, sourceFlat, provision.id, pointer, "exception", diags);

    // Modality marker: the builder never infers modality, it only verifies
    // that the declared lexical marker is actually present in the claim.
    if (provision.source_modality !== "DECLARATIVE") {
      if (provision.modality_marker === null || provision.modality_marker.trim() === "") {
        diags.error(
          "ERR_MODALITY_MARKER",
          FILE.semantics,
          `${pointer}/modality_marker`,
          `Для source_modality=${provision.source_modality} требуется лексический маркер из claim_quote.`,
        );
      } else if (!claimFlat.includes(collapse(provision.modality_marker))) {
        diags.error(
          "ERR_MODALITY_MARKER",
          FILE.semantics,
          `${pointer}/modality_marker`,
          `Маркер "${provision.modality_marker}" отсутствует в claim_quote положения "${provision.id}".`,
        );
      }
    }

    const allowed = ALLOWED_EFFECTS[provision.source_modality];
    if (!allowed.includes(provision.normative_effect)) {
      diags.error(
        "ERR_MODALITY_UPGRADE",
        FILE.semantics,
        `${pointer}/normative_effect`,
        `source_modality=${provision.source_modality} не подтверждает normative_effect=${provision.normative_effect}. Допустимо: ${allowed.join(", ")}.`,
      );
    }

    if (!claimFlat.includes(collapse(provision.classification_basis.quote))) {
      diags.error(
        "ERR_CLASSIFICATION_BASIS",
        FILE.semantics,
        `${pointer}/classification_basis/quote`,
        `Основание классификации должно ссылаться на текст внутри claim_quote. Цитата "${provision.classification_basis.quote}" там не найдена.`,
      );
    }

    const normalizedFlat = normalizeText(provision.normalized_statement);
    const sourceExact = normalizeText(provision.source_quote);
    const verbatim = normalizedFlat === sourceExact;

    if (!verbatim) {
      if (provision.explications.length === 0) {
        diags.error(
          "ERR_UNEXPLAINED_PARAPHRASE",
          FILE.semantics,
          `${pointer}/explications`,
          `normalized_statement положения "${provision.id}" отличается от source_quote, но explications пуст. Пересказ обязан быть объяснён.`,
        );
      }
      for (const [i, explication] of provision.explications.entries()) {
        if (!normalizedFlat.includes(normalizeText(explication.text))) {
          diags.error(
            "ERR_EXPLICATION_NOT_IN_STATEMENT",
            FILE.semantics,
            `${pointer}/explications/${i}/text`,
            `Экспликация "${explication.text}" не найдена в normalized_statement.`,
          );
        }
      }
    }

    resolveTerms(provision, termById, pointer, diags);

    const resolvedDependencies: Decision[] = [];
    for (const [i, id] of provision.decision_dependencies.entries()) {
      const decision = decisionById.get(id);
      if (decision === undefined) {
        diags.error("ERR_UNKNOWN_REF", FILE.semantics, `${pointer}/decision_dependencies/${i}`, `Неизвестное решение "${id}"`);
        continue;
      }
      resolvedDependencies.push(decision);
    }
    const resolvedMentions: Decision[] = [];
    for (const [i, id] of provision.decision_mentions.entries()) {
      const decision = decisionById.get(id);
      if (decision === undefined) {
        diags.error("ERR_UNKNOWN_REF", FILE.semantics, `${pointer}/decision_mentions/${i}`, `Неизвестное решение "${id}"`);
        continue;
      }
      resolvedMentions.push(decision);
      if (decision.in_scope === false) {
        diags.warning(
          "WARN_OUTSIDE_SLICE_REF",
          FILE.semantics,
          `${pointer}/decision_mentions/${i}`,
          `Решение "${id}" объявлено вне среза. Содержание не импортируется; отображается только ссылка.`,
        );
      }
    }

    const relevance = provision.normative_effect !== "descriptive";
    const binding = BINDING_EFFECTS.has(provision.normative_effect);
    const openDependencies = resolvedDependencies.filter((d) => d.status === "open");
    const applicability = openDependencies.length > 0 ? "decision_dependent" : "determined";

    for (const decision of openDependencies) {
      if (relevance && decision.scope === "normative") {
        diags.review(
          "REVIEW_OPEN_NORMATIVE_DEPENDENCY",
          FILE.semantics,
          `${pointer}/decision_dependencies`,
          `Положение "${provision.id}" зависит от открытого нормативного решения "${decision.id}". В draft публикуется с маркером; выпуск release запрещён до решения.`,
        );
      } else if (relevance) {
        diags.warning(
          "WARN_OPEN_EDITORIAL_DEPENDENCY",
          FILE.semantics,
          `${pointer}/decision_dependencies`,
          `Положение "${provision.id}" зависит от открытого редакционного решения "${decision.id}". Нормативная семантика не затронута.`,
        );
      }
    }

    if (!binding && relevance) {
      diags.warning(
        "WARN_NON_BINDING_PROVISION",
        FILE.semantics,
        `${pointer}/normative_effect`,
        `Положение "${provision.id}" имеет норм. эффект "${provision.normative_effect}" и не является связывающим требованием. Отображается как таковое.`,
      );
    }

    if (provision.unresolved_conditions.length > 0) {
      diags.warning(
        "WARN_UNRESOLVED_CONDITION",
        FILE.semantics,
        `${pointer}/unresolved_conditions`,
        `Условие положения "${provision.id}" не определено в срезе: ${provision.unresolved_conditions.map((c) => c.text).join("; ")}.`,
      );
    }

    for (const [i, ref] of provision.outside_slice_refs.entries()) {
      if (ref.in_scope !== false) {
        diags.error("ERR_OUT_OF_SLICE_CONTENT", FILE.semantics, `${pointer}/outside_slice_refs/${i}`, `Ссылка "${ref.target}" должна быть помечена in_scope: false`);
      }
      diags.warning(
        "WARN_OUTSIDE_SLICE_REF",
        FILE.semantics,
        `${pointer}/outside_slice_refs/${i}`,
        `Ссылка "${ref.target}" ведёт за пределы среза; содержание не импортировано.`,
      );
    }

    const normalizationStatus = verbatim
      ? "verbatim"
      : provision.review.status === "confirmed"
        ? "paraphrase_reviewed"
        : "paraphrase_pending";

    if (!verbatim && provision.review.status !== "confirmed") {
      diags.review(
        "REVIEW_NORMALIZATION_PENDING",
        FILE.semantics,
        `${pointer}/normalized_statement`,
        `Нормализация положения "${provision.id}" отличается от источника и не подтверждена человеком.`,
      );
    }

    if (provision.classification_basis.kind === "editorial_inference" && provision.review.status !== "confirmed") {
      diags.review(
        "REVIEW_EFFECT_CLASSIFICATION",
        FILE.semantics,
        `${pointer}/classification_basis`,
        `Нормативный эффект "${provision.normative_effect}" выведен редакторски, а не дословно. Требуется подтверждение.`,
      );
    }

    if (provision.review.status === "confirmed" && provision.review.reviewed_by === null) {
      diags.warning(
        "WARN_REVIEW_WITHOUT_REVIEWER",
        FILE.semantics,
        `${pointer}/review/reviewed_by`,
        `Положение "${provision.id}" помечено подтверждённым, но ревьюер не указан.`,
      );
    }

    warnUndefinedTerms(provision, termNames, pointer, diags);

    provisions.push({
      ...provision,
      normalization_status: normalizationStatus,
      applicability,
      binding,
      normative_relevance: relevance,
      cases: [],
      violated_cases: 0,
      resolved_terms: provision.terms
        .map((id) => termById.get(id))
        .filter((t): t is Term => t !== undefined),
      resolved_dependencies: resolvedDependencies,
      resolved_mentions: resolvedMentions,
      fragment_resolved: fragment,
    });
  });

  const analyzedById = new Map(provisions.map((p) => [p.id, p]));
  const cases: Case[] = [];

  // --- conformance vectors --------------------------------------------------
  raw.cases.cases.forEach((testCase, index) => {
    const pointer = `/cases/${index}`;
    registerId(testCase.id, FILE.cases, `${pointer}/id`);
    cases.push(testCase);

    const provision = provisionById.get(testCase.provision);
    const analyzed = analyzedById.get(testCase.provision);
    if (provision === undefined || analyzed === undefined) {
      diags.error("ERR_UNKNOWN_REF", FILE.cases, `${pointer}/provision`, `Неизвестное положение "${testCase.provision}"`);
      return;
    }

    const rationaleFragment = fragmentById.get(testCase.rationale_fragment);
    if (rationaleFragment === undefined) {
      diags.error("ERR_UNKNOWN_REF", FILE.cases, `${pointer}/rationale_fragment`, `Неизвестный фрагмент "${testCase.rationale_fragment}"`);
    } else if (!collapse(provision.source_quote).includes(collapse(rationaleFragment.quote))) {
      diags.warning(
        "WARN_TRACE_INCOMPLETE",
        FILE.cases,
        `${pointer}/rationale_fragment`,
        `Обоснование кейса "${testCase.id}" ссылается на фрагмент, не входящий в source_quote положения "${provision.id}".`,
      );
    }

    // No violation may rest on a permission, an absent basis, or an
    // underdetermined reading of the source.
    if (testCase.expected_outcome === "violated") {
      if (testCase.source_determination !== "determined" && testCase.source_determination !== "inferred") {
        diags.error(
          "ERR_CASE_VIOLATED_UNDETERMINED",
          FILE.cases,
          `${pointer}/expected_outcome`,
          `Кейс "${testCase.id}" ожидает violated при source_determination=${testCase.source_determination}. Нарушение нельзя выводить из неопределённого или отсутствующего в источнике исхода.`,
        );
      }
      if (
        testCase.expectation_basis === "permission" ||
        testCase.expectation_basis === "absent" ||
        testCase.expectation_basis === "scope_statement"
      ) {
        diags.error(
          "ERR_MODALITY_UPGRADE",
          FILE.cases,
          `${pointer}/expected_outcome`,
          `Кейс "${testCase.id}" ожидает violated, опираясь на ${testCase.expectation_basis}. Это превращает разрешение или утверждение об области в обязанность.`,
        );
      }
    }

    if (testCase.source_determination === "inferred" && testCase.review.status !== "confirmed") {
      diags.review(
        "REVIEW_CASE_INTERPRETATION",
        FILE.cases,
        `${pointer}/source_determination`,
        `Исход кейса "${testCase.id}" получен логическим выводом, а не дословно. Требуется нормативное подтверждение.`,
      );
    }

    if (testCase.review.status === "confirmed" && testCase.review.reviewed_by === null) {
      diags.warning(
        "WARN_REVIEW_WITHOUT_REVIEWER",
        FILE.cases,
        `${pointer}/review/reviewed_by`,
        `Кейс "${testCase.id}" помечен подтверждённым, но ревьюер не указан.`,
      );
    }
  });

  const caseById = new Map(cases.map((testCase) => [testCase.id, testCase]));
  for (const provision of provisions) {
    const vectorIds = model.byId.get(provision.id)?.relations.vectors ?? [];
    provision.cases = vectorIds
      .map((id) => caseById.get(id))
      .filter((testCase): testCase is Case => testCase !== undefined);
    provision.violated_cases = provision.cases.filter(
      (testCase) => testCase.expected_outcome === "violated",
    ).length;
  }

  for (const provision of provisions) {
    const pointer = `/provisions/${raw.semantics.provisions.findIndex((p) => p.id === provision.id)}`;
    if (provision.cases.length === 0) {
      diags.error(
        "ERR_MISSING_VECTOR",
        FILE.semantics,
        `${pointer}/id`,
        `У положения "${provision.id}" нет ни одного вектора соответствия.`,
      );
    } else if (provision.violated_cases === 0) {
      diags.warning(
        "WARN_NO_VIOLATED_VECTOR",
        FILE.semantics,
        `${pointer}/id`,
        `У положения "${provision.id}" нет violated-вектора. Это допустимо: источник может не устанавливать нарушения.`,
      );
    }
  }

  return {
    document: raw.ontology.document,
    source:
      source ?? {
        id: "SRC-UNKNOWN",
        path: legacyName,
        document: raw.ontology.document.id,
        revision: raw.ontology.document.revision,
      },
    slice: raw.sources.slice,
    fragments: raw.sources.fragments,
    terms,
    provisions,
    decisions: raw.decisions.decisions,
    cases,
    counts: {
      terms: terms.length,
      provisions: provisions.length,
      binding: provisions.filter((p) => p.binding).length,
      cases: cases.length,
      reviewed: provisions.filter((p) => p.review.status === "confirmed").length,
      openDecisions: raw.decisions.decisions.filter((d) => d.status === "open").length,
    },
  };
}

function checkClause(
  clause: Provision["precondition"],
  sourceFlat: string,
  provisionId: string,
  pointer: string,
  field: "precondition" | "exception",
  diags: Diagnostics,
): void {
  if (clause === null) return;
  if (!sourceFlat.includes(collapse(clause.quote))) {
    diags.error(
      "ERR_CLAUSE_NOT_IN_SOURCE",
      FILE.semantics,
      `${pointer}/${field}/quote`,
      `Цитата ${field} положения "${provisionId}" не найдена в source_quote.`,
    );
  }
  if (clause.source_modality !== "DECLARATIVE") {
    if (clause.modality_marker === null || clause.modality_marker.trim() === "") {
      diags.error(
        "ERR_MODALITY_MARKER",
        FILE.semantics,
        `${pointer}/${field}/modality_marker`,
        `Для source_modality=${clause.source_modality} в ${field} положения "${provisionId}" требуется непустой лексический маркер из цитаты.`,
      );
    } else if (!collapse(clause.quote).includes(collapse(clause.modality_marker))) {
      diags.error(
        "ERR_MODALITY_MARKER",
        FILE.semantics,
        `${pointer}/${field}/modality_marker`,
        `Маркер "${clause.modality_marker}" отсутствует в цитате ${field} положения "${provisionId}".`,
      );
    }
  }
}

function resolveTerms(
  provision: Provision,
  termById: Map<string, Term>,
  pointer: string,
  diags: Diagnostics,
): void {
  provision.terms.forEach((id, index) => {
    if (!termById.has(id)) {
      diags.error("ERR_UNKNOWN_REF", FILE.semantics, `${pointer}/terms/${index}`, `Неизвестный термин "${id}"`);
    }
  });
}

function warnUndefinedTerms(
  provision: Provision,
  termNames: Set<string>,
  pointer: string,
  diags: Diagnostics,
): void {
  const matches = provision.source_quote.match(LATIN_TOKEN) ?? [];
  const unknown = [...new Set(matches)].filter(
    (token) => !IGNORED_TOKENS.has(token) && !termNames.has(token),
  );
  if (unknown.length > 0) {
    diags.warning(
      "WARN_UNDEFINED_TERM_IN_QUOTE",
      FILE.semantics,
      `${pointer}/source_quote`,
      `В цитате положения "${provision.id}" упоминаются термины вне среза: ${unknown.join(", ")}. Они не определены в ontology.yml и не моделируются.`,
    );
  }
}

function sectionInSlice(ref: string, slice: { includes: string[]; excludes: string[] }): boolean {
  // Slice containment is a profile check that needs the locator's section, not quote
  // verification. Verification itself goes through the source adapter.
  const locator = parseLocator(ref);
  // A malformed locator is reported separately; do not duplicate it as a slice error.
  if (locator === null) return true;
  const section = locator.section;
  if (slice.excludes.some((prefix) => segmentMatches(section, prefix))) return false;
  return slice.includes.some((prefix) => segmentMatches(section, prefix));
}

function segmentMatches(section: string, prefix: string): boolean {
  const bare = prefix.replace(/^#/, "");
  if (section === bare) return true;
  if (!section.startsWith(bare)) return false;
  const next = section.charAt(bare.length);
  return next === "." || next === "/" || next === "-";
}

export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

/**
 * Builds the CORE-001 view from the generic model. This is the only place that knows how
 * profile entities map onto the view; PR 4 moves it into the profile.
 */
function projectView(model: ProjectModel): RawSpec {
  const sources = model.documents.sources as SourcesDoc;
  const ontology = model.documents.ontology as OntologyDoc;

  return {
    sources: {
      sources: legacySources(model),
      slice: sources.slice,
      fragments: byKind(model, "fragment").map(toFragment),
    },
    ontology: {
      document: ontology.document,
      terms: byKind(model, "term").map(toTerm),
    },
    semantics: { provisions: byKind(model, "provision").map(toProvision) },
    decisions: { decisions: byKind(model, "decision").map(toDecision) },
    cases: { cases: byKind(model, "case").map(toCase) },
  };
}

function byKind(model: ProjectModel, kind: string): Entity[] {
  return model.byKind.get(kind) ?? [];
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
