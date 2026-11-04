import type { Entity, ProjectModel } from "../../spec/lib/ir.js";

/** Evidence kinds accepted by the canonical CORE-000 evidence field. */
export const EVIDENCE_KINDS = [
  "code",
  "test",
  "ci",
  "source",
  "review",
  "analysis",
  "build",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

const EVIDENCE_KIND_SET: ReadonlySet<string> = new Set(EVIDENCE_KINDS);

export type EvidenceKindResult =
  | { readonly ok: true; readonly kind: EvidenceKind }
  | {
      readonly ok: false;
      readonly reason:
        | "not-evidence"
        | "document-unavailable"
        | "missing"
        | "duplicate"
        | "malformed";
    };

/**
 * The generic core reserves `kind` for the entity type and strips it from `Entity.fields`, so
 * the profile reads the validated evidence `kind` from the original document it owns. This is a
 * bounded S1 accessor, not a general guarantee that profile code may treat raw documents as the
 * normalized IR. Any absent, duplicated, malformed or inconsistent entry fails closed.
 */
export function evidenceKind(model: ProjectModel, id: string): EvidenceKindResult {
  const entity = model.byId.get(id);
  if (entity === undefined || entity.kind !== "evidence") {
    return { ok: false, reason: "not-evidence" };
  }

  const claims = model.documents["claims"];
  if (!isObject(claims) || !Array.isArray(claims.evidence)) {
    return { ok: false, reason: "document-unavailable" };
  }

  const matches = claims.evidence.filter((entry) => isObject(entry) && entry.id === id);
  if (matches.length === 0) return { ok: false, reason: "missing" };
  if (matches.length > 1) return { ok: false, reason: "duplicate" };

  const kind = matches[0]!.kind;
  if (typeof kind !== "string" || !EVIDENCE_KIND_SET.has(kind)) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, kind: kind as EvidenceKind };
}

function evidenceKindLabel(model: ProjectModel, id: string): string {
  const result = evidenceKind(model, id);
  return result.ok ? result.kind : "unresolved";
}

const DEPENDENCY_KINDS: ReadonlySet<string> = new Set([
  "runtime",
  "toolchain",
  "pipeline",
  "decision",
  "product",
]);

const CONFORMANCE_CASE_KINDS: ReadonlySet<string> = new Set(["positive", "negative"]);

export type DependencyKind = "runtime" | "toolchain" | "pipeline" | "decision" | "product";
export type ConformanceCaseKind = "positive" | "negative";

export type DependencyKindResult =
  | { readonly ok: true; readonly kind: DependencyKind }
  | {
      readonly ok: false;
      readonly reason:
        | "not-dependency"
        | "document-unavailable"
        | "missing"
        | "duplicate"
        | "malformed";
    };

export type ConformanceCaseKindResult =
  | { readonly ok: true; readonly kind: ConformanceCaseKind }
  | {
      readonly ok: false;
      readonly reason:
        | "not-conformance-case"
        | "document-unavailable"
        | "missing"
        | "duplicate"
        | "malformed";
    };

/**
 * Q5 bounded accessors. The generic IR reserves `kind`, so the domain kind is read from the
 * validated project document the profile owns. Missing, duplicated or malformed entries fail
 * closed; neither accessor falls back to `Entity.kind` or a default.
 */
export function dependencyKind(model: ProjectModel, id: string): DependencyKindResult {
  const result = domainKind(model, id, "dependency", "structure", "dependencies", DEPENDENCY_KINDS);
  if (!result.ok) {
    return {
      ok: false,
      reason:
        result.reason === "document-unavailable"
          ? "document-unavailable"
          : result.reason === "missing"
            ? "missing"
            : result.reason === "duplicate"
              ? "duplicate"
              : result.reason === "malformed"
                ? "malformed"
                : "not-dependency",
    };
  }
  return { ok: true, kind: result.kind as DependencyKind };
}

export function conformanceCaseKind(model: ProjectModel, id: string): ConformanceCaseKindResult {
  const result = domainKind(
    model,
    id,
    "conformance_case",
    "claims",
    "conformanceCases",
    CONFORMANCE_CASE_KINDS,
  );
  if (!result.ok) {
    return {
      ok: false,
      reason:
        result.reason === "document-unavailable"
          ? "document-unavailable"
          : result.reason === "missing"
            ? "missing"
            : result.reason === "duplicate"
              ? "duplicate"
              : result.reason === "malformed"
                ? "malformed"
                : "not-conformance-case",
    };
  }
  return { ok: true, kind: result.kind as ConformanceCaseKind };
}

type DomainKindFailure =
  | "not-entity"
  | "document-unavailable"
  | "missing"
  | "duplicate"
  | "malformed";

function domainKind(
  model: ProjectModel,
  id: string,
  expectedKind: string,
  documentKey: string,
  listKey: string,
  allowed: ReadonlySet<string>,
): { ok: true; kind: string } | { ok: false; reason: DomainKindFailure } {
  const entity = model.byId.get(id);
  if (entity === undefined) return { ok: false, reason: "missing" };
  if (entity.kind !== expectedKind) return { ok: false, reason: "not-entity" };
  const document = model.documents[documentKey];
  if (!isObject(document) || !Array.isArray(document[listKey])) {
    return { ok: false, reason: "document-unavailable" };
  }
  const matches = document[listKey].filter(
    (entry): entry is Record<string, unknown> => isObject(entry) && entry.id === id,
  );
  if (matches.length === 0) return { ok: false, reason: "missing" };
  if (matches.length > 1) return { ok: false, reason: "duplicate" };
  const kind = matches[0]?.kind;
  if (typeof kind !== "string" || !allowed.has(kind)) {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, kind };
}

export interface ComponentView {
  readonly id: string;
  readonly name: string;
  readonly responsibility: string;
  readonly boundary: string;
  readonly public: boolean;
  readonly interfaces: readonly string[];
}

export interface InterfaceView {
  readonly id: string;
  readonly name: string;
  readonly surface: string;
  readonly stability: string;
  readonly description: string;
  readonly owner: string;
}

export interface TrustBoundaryView {
  readonly id: string;
  readonly name: string;
  readonly inside: string;
  readonly outside: string;
  readonly enforcement: string;
  readonly statement: string;
  readonly policyStatus: string;
  readonly policyRef: string;
}

export interface PhaseView {
  readonly id: string;
  readonly name: string;
  readonly guarantee: string;
  readonly notGuaranteed: string;
  readonly prerequisites: readonly string[];
}

export interface TransitionView {
  readonly id: string;
  readonly name: string;
  readonly condition: string;
  readonly description: string;
}

export interface ExtensionPointView {
  readonly id: string;
  readonly name: string;
  readonly mechanism: string;
  readonly trust: string;
  readonly status: string;
  readonly loadedBy: readonly string[];
  readonly exposes: readonly string[];
}

export interface DependencyView {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
  readonly version: string;
  readonly consequence: string;
}

export interface DiagnosticCatalogView {
  readonly id: string;
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
  readonly status: string;
  readonly raisedIn: readonly string[];
}

export interface ConformanceCaseView {
  readonly id: string;
  readonly kind: string;
  readonly input: string;
  readonly expected: string;
  readonly status: string;
  readonly covers: readonly string[];
}

export interface ClaimStatusView {
  readonly decision: string;
  readonly implementation: string;
  readonly tests: string;
  readonly verification: string;
}

export interface SubjectView {
  readonly id: string;
  readonly kind: string;
}

export interface EvidenceLinkView {
  readonly id: string;
  readonly kind: string;
  readonly locator: string;
  readonly revision: string;
}

export interface DecisionLinkView {
  readonly id: string;
  readonly status: string;
  readonly title: string;
}

export interface CitationView {
  readonly id: string;
  readonly sourceRef: string;
}

export interface ClaimView {
  readonly id: string;
  readonly className: string;
  readonly statement: string;
  readonly status: ClaimStatusView;
  readonly authority: string;
  readonly lifecycle: string;
  readonly verificationMethod: string;
  readonly scope: string;
  readonly subjects: readonly SubjectView[];
  readonly evidence: readonly EvidenceLinkView[];
  readonly decisions: readonly DecisionLinkView[];
  readonly citations: readonly CitationView[];
}

export interface SourceStatementView {
  readonly id: string;
  readonly source: string;
  readonly ref: string;
  readonly quote: string;
  readonly status: string;
  readonly outcome: string;
  readonly method: string;
  readonly verifier: string;
  readonly sourceVersion: string;
  readonly sourceDigest: string;
}

export interface EvidenceView {
  readonly id: string;
  readonly kind: string;
  readonly locator: string;
  readonly revision: string;
  readonly description: string;
}

export interface DecisionView {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly owner: string;
  readonly source: string;
  readonly consequence: string;
}

export interface DiagnosticView {
  readonly code: string;
  readonly severity: string;
  readonly file: string;
  readonly pointer: string;
  readonly message: string;
}

export interface Core000View {
  readonly title: string;
  readonly components: readonly ComponentView[];
  readonly interfaces: readonly InterfaceView[];
  readonly trustBoundaries: readonly TrustBoundaryView[];
  readonly claims: readonly ClaimView[];
  readonly sourceStatements: readonly SourceStatementView[];
  readonly evidence: readonly EvidenceView[];
  readonly decisions: readonly DecisionView[];
  readonly phases: readonly PhaseView[];
  readonly transitions: readonly TransitionView[];
  readonly transitionNote: string;
  readonly extensionPoints: readonly ExtensionPointView[];
  readonly dependencies: readonly DependencyView[];
  readonly diagnosticCatalog: readonly DiagnosticCatalogView[];
  readonly conformanceCases: readonly ConformanceCaseView[];
  readonly independentVerificationCount: number;
  readonly independentVerificationNote: string;
  readonly diagnostics: readonly DiagnosticView[];
  readonly counts: Readonly<Record<string, number>>;
}

/** Profile-owned projection of the generic model; the core never interprets these fields. */
export function buildView(model: ProjectModel): Core000View {
  const components = (model.byKind.get("component") ?? []).map(componentView);
  const interfaces = (model.byKind.get("interface") ?? []).map(interfaceView);
  const trustBoundaries = (model.byKind.get("trust_boundary") ?? []).map(trustBoundaryView);
  const claims = (model.byKind.get("claim") ?? []).map((entity) => claimView(model, entity));
  const sourceStatements = (model.byKind.get("source_statement") ?? []).map(sourceStatementView);
  const evidence = (model.byKind.get("evidence") ?? []).map((entity) => evidenceView(model, entity));
  const decisions = (model.byKind.get("decision") ?? []).map(decisionView);
  const phases = (model.byKind.get("phase") ?? []).map(phaseView);
  const transitions = (model.byKind.get("transition") ?? []).map(transitionView);
  const extensionPoints = (model.byKind.get("extension_point") ?? []).map(extensionPointView);
  const dependencies = (model.byKind.get("dependency") ?? []).map((entity) =>
    dependencyView(model, entity),
  );
  const diagnosticCatalog = (model.byKind.get("diagnostic") ?? []).map(diagnosticCatalogView);
  const conformanceCases = (model.byKind.get("conformance_case") ?? []).map((entity) =>
    conformanceCaseView(model, entity),
  );
  const independentVerificationCount = (model.byKind.get("independent_verification") ?? []).length;

  return {
    title: model.manifest.project.title ?? model.manifest.project.id,
    components,
    interfaces,
    trustBoundaries,
    claims,
    sourceStatements,
    evidence,
    decisions,
    phases,
    transitions,
    transitionNote:
      "Zero transition instances are encoded. No accepted source defines a permitted-move graph; the M1 phase sequence remains authoritative in the execution plan.",
    extensionPoints,
    dependencies,
    diagnosticCatalog,
    conformanceCases,
    independentVerificationCount,
    independentVerificationNote:
      independentVerificationCount === 0
        ? "No independent verification record exists. The engine cannot establish independent verification."
        : `${independentVerificationCount} independent verification record(s) are declared; the engine can check their shape, not their truth.`,
    diagnostics: [],
    counts: {
      components: components.length,
      interfaces: interfaces.length,
      trustBoundaries: trustBoundaries.length,
      claims: claims.length,
      sourceStatements: sourceStatements.length,
      evidence: evidence.length,
      decisions: decisions.length,
      phases: phases.length,
      transitions: transitions.length,
      extensionPoints: extensionPoints.length,
      dependencies: dependencies.length,
      diagnostics: diagnosticCatalog.length,
      conformanceCases: conformanceCases.length,
      independentVerifications: independentVerificationCount,
    },
  };
}

function componentView(entity: Entity): ComponentView {
  return {
    id: entity.id,
    name: text(entity.fields.name),
    responsibility: text(entity.fields.responsibility),
    boundary: text(entity.fields.boundary),
    public: entity.fields.public === true,
    interfaces: entity.relations.provides ?? [],
  };
}

function interfaceView(entity: Entity): InterfaceView {
  return {
    id: entity.id,
    name: text(entity.fields.name),
    surface: text(entity.fields.surface),
    stability: text(entity.fields.stability),
    description: text(entity.fields.description),
    owner: text(entity.fields.owner),
  };
}

function trustBoundaryView(entity: Entity): TrustBoundaryView {
  return {
    id: entity.id,
    name: text(entity.fields.name),
    inside: text(entity.fields.inside),
    outside: text(entity.fields.outside),
    enforcement: text(entity.fields.enforcement),
    statement: text(entity.fields.statement),
    policyStatus: text(entity.fields.policy_status),
    policyRef: text(entity.fields.policy_ref),
  };
}

function phaseView(entity: Entity): PhaseView {
  return {
    id: entity.id,
    name: text(entity.fields.name),
    guarantee: text(entity.fields.guarantee),
    notGuaranteed: text(entity.fields.not_guaranteed),
    prerequisites: entity.relations.hasPrerequisite ?? [],
  };
}

function transitionView(entity: Entity): TransitionView {
  return {
    id: entity.id,
    name: text(entity.fields.name),
    condition: text(entity.fields.condition),
    description: text(entity.fields.description),
  };
}

function extensionPointView(entity: Entity): ExtensionPointView {
  return {
    id: entity.id,
    name: text(entity.fields.name),
    mechanism: text(entity.fields.mechanism),
    trust: text(entity.fields.trust),
    status: text(entity.fields.status),
    loadedBy: entity.relations.loadedBy ?? [],
    exposes: entity.relations.exposes ?? [],
  };
}

function dependencyView(model: ProjectModel, entity: Entity): DependencyView {
  const kind = dependencyKind(model, entity.id);
  return {
    id: entity.id,
    name: text(entity.fields.name),
    kind: kind.ok ? kind.kind : "unresolved",
    status: text(entity.fields.status),
    version: text(entity.fields.version),
    consequence: text(entity.fields.consequence),
  };
}

function diagnosticCatalogView(entity: Entity): DiagnosticCatalogView {
  return {
    id: entity.id,
    code: text(entity.fields.code),
    severity: text(entity.fields.severity),
    phase: text(entity.fields.phase),
    message: text(entity.fields.message),
    status: text(entity.fields.status),
    raisedIn: entity.relations.raisedIn ?? [],
  };
}

function conformanceCaseView(model: ProjectModel, entity: Entity): ConformanceCaseView {
  const kind = conformanceCaseKind(model, entity.id);
  return {
    id: entity.id,
    kind: kind.ok ? kind.kind : "unresolved",
    input: text(entity.fields.input),
    expected: text(entity.fields.expected),
    status: text(entity.fields.status),
    covers: entity.relations.covers ?? [],
  };
}

function claimView(model: ProjectModel, entity: Entity): ClaimView {
  const status = isObject(entity.fields.status) ? entity.fields.status : {};
  const subjects = (entity.relations.subject ?? []).map((id) => ({
    id,
    kind: model.byId.get(id)?.kind ?? "unknown",
  }));
  const evidence = (entity.relations.evidencedBy ?? []).flatMap((id) => {
    const target = model.byId.get(id);
    return target === undefined ? [] : [evidenceLinkView(model, target)];
  });
  const decisions = (entity.relations.decidedBy ?? []).flatMap((id) => {
    const target = model.byId.get(id);
    return target === undefined ? [] : [decisionLinkView(target)];
  });
  const citations = (entity.relations.cites ?? []).flatMap((id) => {
    const target = model.byId.get(id);
    return target === undefined ? [] : [{ id, sourceRef: text(target.fields.source_ref) }];
  });

  return {
    id: entity.id,
    className: text(entity.fields.class),
    statement: text(entity.fields.statement),
    status: {
      decision: text(status.decision),
      implementation: text(status.implementation),
      tests: text(status.tests),
      verification: text(status.verification),
    },
    authority: text(entity.fields.authority),
    lifecycle: text(entity.fields.lifecycle),
    verificationMethod: text(entity.fields.verification_method),
    scope: text(entity.fields.scope),
    subjects,
    evidence,
    decisions,
    citations,
  };
}

function evidenceLinkView(model: ProjectModel, entity: Entity): EvidenceLinkView {
  return {
    id: entity.id,
    kind: evidenceKindLabel(model, entity.id),
    locator: text(entity.fields.locator),
    revision: text(entity.fields.revision),
  };
}

function decisionLinkView(entity: Entity): DecisionLinkView {
  return {
    id: entity.id,
    status: text(entity.fields.status),
    title: text(entity.fields.title),
  };
}

function sourceStatementView(entity: Entity): SourceStatementView {
  const verification = entity.verification;
  return {
    id: entity.id,
    source: text(entity.fields.source),
    ref: text(entity.fields.source_ref),
    quote: text(entity.fields.source_quote),
    status: verification?.status ?? "missing",
    outcome: verification?.record.outcome ?? "not-checked",
    method: verification?.record.method ?? "none",
    verifier: verification?.record.verifier ?? "none",
    sourceVersion: verification?.record.sourceVersion ?? "none",
    sourceDigest: verification?.record.sourceDigest ?? "none",
  };
}

function evidenceView(model: ProjectModel, entity: Entity): EvidenceView {
  return {
    id: entity.id,
    kind: evidenceKindLabel(model, entity.id),
    locator: text(entity.fields.locator),
    revision: text(entity.fields.revision),
    description: text(entity.fields.description),
  };
}

function decisionView(entity: Entity): DecisionView {
  return {
    id: entity.id,
    title: text(entity.fields.title),
    status: text(entity.fields.status),
    owner: text(entity.fields.owner),
    source: text(entity.fields.source),
    consequence: text(entity.fields.consequence),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
