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
