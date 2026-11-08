/**
 * The three v0.1 mechanical checks (RFC §8.4–§8.6).
 *
 * Every check is a pure function of packaged bytes and produces a check record
 * with independently recomputable witnesses. Producer claims are never inputs.
 */

import type {
  CheckDiagnostic,
  CheckOutcome,
  CheckRecord,
  ClaimKind,
  RelationViolation,
  Witness,
} from "./types.js";
import type { Manifest, ManifestArtifact, ManifestInput, ManifestSource } from "./manifest.js";
import type {
  ParsedClaim,
  ProducerReportClaim,
  ProvenanceClaim,
  RelationsClaim,
  ReviewsClaim,
  ClaimIssue,
} from "./claims.js";

export interface ArtifactState {
  artifact: ManifestArtifact;
  computed: string | null;
  byteCount: number | null;
  status: "ok" | "missing" | "mismatch" | "unread";
  message?: string;
}

export interface SourceState {
  source: ManifestSource;
  computed: string | null;
  /** Raw source byte length, or null when no snapshot is packaged. */
  size: number | null;
  status: "ok" | "mismatch" | "referenced" | "unread" | "missing";
  message?: string;
}

export interface InputState {
  input: ManifestInput;
  computed: string | null;
  /** Normalized byte length, used for the streamed set digest. */
  normalizedSize: number | null;
  /** Effective normalization after the binary/UTF-8 fallback. */
  mode: "lf" | "raw" | null;
  status: "ok" | "mismatch" | "unread" | "missing";
  message?: string;
}

export interface ClaimState {
  kind: ClaimKind;
  declaredDigest: string;
  computedDigest: string | null;
  bytes?: Uint8Array;
  status: "ok" | "mismatch" | "unread" | "missing";
  parsed?: ParsedClaim;
  issues?: ClaimIssue[];
  unsupportedVersion?: boolean;
  invalid?: boolean;
  message?: string;
}

export const WITNESS_BUDGET_BYTES = 16 * 1024 * 1024;

export interface CheckInput {
  packageIdentity: string;
  manifest: Manifest;
  artifacts: ArtifactState[];
  sources: SourceState[];
  inputs: InputState[];
  claims: ClaimState[];
  normalizedInputDigest: string | null;
  /** `${sourceId}\u0000${start}\u0000${end}` -> extracted quote digest. */
  sourceSpans: Map<string, string>;
  /** True when range reads exceeded the remaining totalPayloadBytes budget. */
  sourceSpanBudgetHit: boolean;
  checker: { id: string; version: string; implementationDigest: string };
  limits: { provenanceBindings: number };
  /** Aggregate serialized witness budget for one check record. */
  witnessBudget: number;
}

function claimState(input: CheckInput, kind: ClaimKind): ClaimState | undefined {
  return input.claims.find((claim) => claim.kind === kind);
}

function claimSubjectDigest(claim: ClaimState): string {
  return claim.computedDigest ?? claim.declaredDigest;
}

function checkDiagnostic(
  code: string,
  severity: CheckDiagnostic["severity"],
  message: string,
): CheckDiagnostic {
  return { code, severity, message };
}

/** `pap.check.digest-integrity/1` */
export function checkDigestIntegrity(input: CheckInput): CheckRecord {
  const diagnostics: CheckDiagnostic[] = [];
  const witnesses: Witness[] = [];
  let mismatch = false;
  let unread = false;
  let witnessBytes = 0;
  let budgetExceeded = false;
  const pushWitness = (witness: Witness): void => {
    if (budgetExceeded) return;
    const size = JSON.stringify(witness).length;
    if (witnessBytes + size > input.witnessBudget) {
      budgetExceeded = true;
      diagnostics.push(
        checkDiagnostic(
          "pap.package.limit-exceeded",
          "error",
          "check witness output budget exceeded",
        ),
      );
      return;
    }
    witnessBytes += size;
    witnesses.push(witness);
  };

  const note = (state: "mismatch" | "missing" | "unread", code: string, message: string): void => {
    diagnostics.push(checkDiagnostic(code, "error", message));
    if (state === "missing" || state === "unread") {
      unread = true;
    } else {
      mismatch = true;
    }
  };

  for (const state of input.artifacts) {
    pushWitness({
      type: "recomputed-digest",
      subject: { kind: "artifact", id: state.artifact.id },
      algorithm: "sha256",
      declared: state.artifact.digest,
      computed: state.computed,
    });
    if (state.status === "ok") continue;
    if (state.status === "mismatch") {
      note(
        "mismatch",
        "pap.integrity.artifact-mismatch",
        state.message ?? `artifact ${state.artifact.id} does not match its declaration`,
      );
    } else {
      note(
        state.status,
        "pap.package.declared-file-missing",
        state.message ?? `artifact ${state.artifact.id} is not readable`,
      );
    }
  }

  for (const state of input.sources) {
    pushWitness({
      type: "recomputed-digest",
      subject: { kind: "source", id: state.source.id },
      algorithm: "sha256",
      declared: state.source.digest,
      computed: state.computed,
    });
    if (state.status === "ok") continue;
    if (state.status === "mismatch") {
      note(
        "mismatch",
        "pap.integrity.source-mismatch",
        state.message ?? `source ${state.source.id} does not match its declaration`,
      );
    } else if (state.status === "referenced") {
      diagnostics.push(
        checkDiagnostic(
          "pap.source.unavailable",
          "warning",
          `source ${state.source.id} has no embedded snapshot`,
        ),
      );
      unread = true;
    } else {
      note(
        state.status,
        "pap.package.declared-file-missing",
        state.message ?? `source ${state.source.id} is not readable`,
      );
    }
  }

  for (const state of input.inputs) {
    pushWitness({
      type: "recomputed-digest",
      subject: { kind: "input", id: state.input.id },
      algorithm: "sha256",
      declared: state.input.digest,
      computed: state.computed,
    });
    if (state.status === "ok") continue;
    if (state.status === "mismatch") {
      note(
        "mismatch",
        "pap.integrity.input-mismatch",
        state.message ?? `input ${state.input.id} does not match its declaration`,
      );
    } else {
      note(
        state.status,
        "pap.package.declared-file-missing",
        state.message ?? `input ${state.input.id} is not readable`,
      );
    }
  }

  for (const claim of input.claims) {
    pushWitness({
      type: "recomputed-digest",
      subject: { kind: "claim", id: claim.kind },
      algorithm: "sha256",
      declared: claim.declaredDigest,
      computed: claim.computedDigest,
    });
    if (claim.status === "ok") continue;
    if (claim.status === "mismatch") {
      note(
        "mismatch",
        "pap.integrity.claim-mismatch",
        claim.message ?? `claim ${claim.kind} does not match its declaration`,
      );
    } else {
      note(
        claim.status,
        "pap.package.declared-file-missing",
        claim.message ?? `claim ${claim.kind} is not readable`,
      );
    }
  }

  const outcome: CheckOutcome = mismatch
    ? "FAIL"
    : unread || budgetExceeded
      ? "NOT_EVALUATED"
      : "PASS";

  return {
    checkId: "pap.check.digest-integrity/1",
    checkVersion: "1",
    subjectDigests: {
      package: input.packageIdentity,
      artifacts: input.artifacts.map((state) => ({
        id: state.artifact.id,
        digest: state.computed ?? state.artifact.digest,
      })),
      sources: input.sources.map((state) => ({
        id: state.source.id,
        digest: state.computed ?? state.source.digest,
      })),
      inputs: input.inputs.map((state) => ({
        id: state.input.id,
        digest: state.computed ?? state.input.digest,
      })),
      claims: input.claims.map((claim) => ({
        kind: claim.kind,
        digest: claimSubjectDigest(claim),
      })),
    },
    scope: {
      artifacts: input.artifacts.map((state) => state.artifact.id),
      sources: input.sources.map((state) => state.source.id),
    },
    checker: input.checker,
    outcome,
    witnesses,
    diagnostics,
  };
}

/** `pap.check.source-quote/1` */
export function checkSourceQuote(input: CheckInput): CheckRecord {
  const claim = claimState(input, "provenance");
  const diagnostics: CheckDiagnostic[] = [];
  const witnesses: Witness[] = [];
  const sourcesUsed = new Set<string>();
  let outcome: CheckOutcome = "PASS";
  let witnessBytes = 0;
  let budgetExceeded = false;
  const sourceById = new Map(input.sources.map((state) => [state.source.id, state]));
  if (input.sourceSpanBudgetHit) {
    budgetExceeded = true;
    diagnostics.push(
      checkDiagnostic("pap.package.limit-exceeded", "error", "source-span read budget exceeded"),
    );
  }

  if (claim === undefined) {
    diagnostics.push(
      checkDiagnostic("pap.check.not-evaluated", "warning", "claims/provenance.json is absent"),
    );
    return quoteRecord(input, undefined, [], diagnostics, "NOT_EVALUATED", sourcesUsed, 0, 0, 0);
  }
  if (
    claim.status === "mismatch" ||
    claim.status === "missing" ||
    claim.status === "unread" ||
    claim.parsed === undefined
  ) {
    diagnostics.push(
      checkDiagnostic(
        claim.unsupportedVersion ? "pap.claim.unsupported-version" : "pap.check.not-evaluated",
        "warning",
        claim.message ?? "provenance claim is not available",
      ),
    );
    return quoteRecord(input, claim, [], diagnostics, "NOT_EVALUATED", sourcesUsed, 0, 0, 0);
  }
  const provenance = claim.parsed as ProvenanceClaim;
  for (const issue of claim.issues ?? []) {
    diagnostics.push(checkDiagnostic(issue.code, "error", issue.message));
    outcome = "FAIL";
  }
  let evaluated = 0;
  let unavailable = 0;

  for (const binding of provenance.bindings) {
    const source = sourceById.get(binding.sourceId);
    sourcesUsed.add(binding.sourceId);
    if (source === undefined) {
      // The claim parser rejects undeclared source ids; keep this defensive.
      diagnostics.push(
        checkDiagnostic(
          "pap.check.not-evaluated",
          "warning",
          `source ${binding.sourceId} is not declared`,
        ),
      );
      unavailable += 1;
      continue;
    }
    if (source.computed === null || source.size === null) {
      diagnostics.push(
        checkDiagnostic(
          "pap.source.unavailable",
          "warning",
          `source ${source.source.id} has no embedded snapshot`,
        ),
      );
      unavailable += 1;
      continue;
    }
    const { start, end } = binding.locator;
    if (start > end || end > source.size) {
      diagnostics.push(
        checkDiagnostic(
          "pap.check.span-out-of-range",
          "error",
          `binding ${binding.id} range [${start}, ${end}) is outside source ${source.source.id}`,
        ),
      );
      outcome = "FAIL";
      continue;
    }
    const extractedDigest = input.sourceSpans.get(`${binding.sourceId}\u0000${start}\u0000${end}`);
    if (extractedDigest === undefined) {
      diagnostics.push(
        checkDiagnostic(
          "pap.check.not-evaluated",
          "warning",
          `binding ${binding.id} span could not be read`,
        ),
      );
      unavailable += 1;
      continue;
    }
    const witness: Witness = {
      type: "source-span",
      sourceId: source.source.id,
      sourceDigest: source.computed,
      range: { start, end },
      quoteDigest: binding.quote.digest,
      extractedDigest,
    };
    const witnessSize = JSON.stringify(witness).length;
    if (witnessBytes + witnessSize > input.witnessBudget) {
      budgetExceeded = true;
      diagnostics.push(
        checkDiagnostic(
          "pap.package.limit-exceeded",
          "error",
          "source-span witness output budget exceeded",
        ),
      );
      break;
    }
    witnessBytes += witnessSize;
    witnesses.push(witness);
    evaluated += 1;
    if (extractedDigest !== binding.quote.digest) {
      diagnostics.push(
        checkDiagnostic(
          "pap.check.quote-mismatch",
          "error",
          `binding ${binding.id} quote digest does not match the extracted span`,
        ),
      );
      outcome = "FAIL";
    }
  }

  if (outcome !== "FAIL") {
    if (budgetExceeded) {
      outcome = "NOT_EVALUATED";
    } else if (evaluated === 0) {
      diagnostics.push(
        checkDiagnostic(
          "pap.check.not-evaluated",
          "warning",
          "no provenance binding could be evaluated",
        ),
      );
      outcome = "NOT_EVALUATED";
    } else if (unavailable > 0) {
      diagnostics.push(
        checkDiagnostic(
          "pap.check.partial",
          "warning",
          "some provenance bindings could not be evaluated",
        ),
      );
      outcome = "NOT_EVALUATED";
    } else {
      outcome = "PASS";
    }
  }
  return quoteRecord(
    input,
    claim,
    witnesses,
    diagnostics,
    outcome,
    sourcesUsed,
    provenance.bindings.length,
    evaluated,
    unavailable,
  );
}

function quoteRecord(
  input: CheckInput,
  claim: ClaimState | undefined,
  witnesses: Witness[],
  diagnostics: CheckDiagnostic[],
  outcome: CheckOutcome,
  sourcesUsed: Set<string>,
  bindings: number,
  evaluated: number,
  unavailable: number,
): CheckRecord {
  const sources = [...sourcesUsed]
    .map((id) => input.sources.find((state) => state.source.id === id))
    .filter((state): state is SourceState => state !== undefined)
    .map((state) => ({ id: state.source.id, digest: state.computed ?? state.source.digest }));
  return {
    checkId: "pap.check.source-quote/1",
    checkVersion: "1",
    subjectDigests: {
      package: input.packageIdentity,
      sources,
      ...(claim === undefined
        ? { claims: [] }
        : { claims: [{ kind: "provenance", digest: claimSubjectDigest(claim) }] }),
    },
    scope: {
      sources: [...sourcesUsed],
      bindings,
      evaluated,
      unavailable,
    },
    checker: input.checker,
    outcome,
    witnesses,
    diagnostics,
  };
}

/** `pap.check.relation-consistency/1` */
export function checkRelationConsistency(input: CheckInput): CheckRecord {
  const claim = claimState(input, "relations");
  if (claim === undefined) {
    return relationRecord(input, undefined, [], "NOT_EVALUATED", 0, 0, [
      checkDiagnostic("pap.check.not-evaluated", "warning", "claims/relations.json is absent"),
    ]);
  }
  if (claim.status !== "ok" || claim.parsed === undefined) {
    return relationRecord(input, claim, [], "NOT_EVALUATED", 0, 0, [
      checkDiagnostic(
        claim.unsupportedVersion ? "pap.claim.unsupported-version" : "pap.check.not-evaluated",
        "warning",
        claim.message ?? "relations claim is not available",
      ),
    ]);
  }
  const relations = claim.parsed as RelationsClaim;
  const violations: RelationViolation[] = [];
  let violationBytes = 0;
  let budgetExceeded = false;
  const addViolation = (violation: RelationViolation): void => {
    if (budgetExceeded) return;
    const size = JSON.stringify(violation).length;
    if (violationBytes + size > input.witnessBudget) {
      budgetExceeded = true;
      return;
    }
    violationBytes += size;
    violations.push(violation);
  };
  const entities = new Map<string, { id: string; kind: string }>();
  for (const entity of relations.entities) {
    if (entities.has(entity.id)) {
      addViolation({
        code: "pap.claim.duplicate-entity",
        subject: entity.id,
        detail: `entity ${entity.id} is declared more than once`,
      });
    } else {
      entities.set(entity.id, entity);
    }
  }
  const relationMap = new Map<string, RelationsClaim["relations"][number]>();
  for (const relation of relations.relations) {
    if (relationMap.has(relation.name)) {
      addViolation({
        code: "pap.claim.relation-duplicate",
        subject: relation.name,
        detail: `relation ${relation.name} is declared more than once`,
      });
    } else {
      relationMap.set(relation.name, relation);
    }
  }
  for (const edge of relations.edges) {
    const subject = `${edge.relation}:${edge.from}->${edge.to}`;
    const relation = relationMap.get(edge.relation);
    if (relation === undefined) {
      addViolation({
        code: "pap.claim.relation-unknown",
        subject,
        detail: `edge names undeclared relation ${edge.relation}`,
      });
      continue;
    }
    const from = entities.get(edge.from);
    const to = entities.get(edge.to);
    if (from === undefined || to === undefined) {
      addViolation({
        code: "pap.claim.edge-unknown-entity",
        subject,
        detail: `edge endpoint is not a declared entity`,
      });
      continue;
    }
    if (from.kind !== relation.from || to.kind !== relation.to) {
      addViolation({
        code: "pap.claim.relation-kind-mismatch",
        subject,
        detail: `edge entity kinds do not match relation ${edge.relation}`,
      });
    }
  }
  for (const relation of relations.relations) {
    if (relation.inverse === undefined) continue;
    const inverse = relationMap.get(relation.inverse);
    if (inverse === undefined) {
      addViolation({
        code: "pap.claim.inverse-missing",
        subject: relation.name,
        detail: `inverse relation ${relation.inverse} is not declared`,
      });
      continue;
    }
    if (inverse.inverse !== relation.name) {
      addViolation({
        code: "pap.claim.inverse-not-reciprocal",
        subject: relation.name,
        detail: `inverse ${inverse.name} does not point back to ${relation.name}`,
      });
    }
    if (inverse.from !== relation.to || inverse.to !== relation.from) {
      addViolation({
        code: "pap.claim.inverse-kind-mismatch",
        subject: relation.name,
        detail: `inverse ${inverse.name} does not reverse the relation kinds`,
      });
    }
  }
  const edgeKeys = new Set(
    relations.edges.map((edge) => `${edge.relation}\u0000${edge.from}\u0000${edge.to}`),
  );
  for (const edge of relations.edges) {
    const relation = relationMap.get(edge.relation);
    if (relation?.inverse === undefined) continue;
    const inverse = relationMap.get(relation.inverse);
    if (inverse === undefined) continue;
    const reciprocal = edgeKeys.has(`${relation.inverse}\u0000${edge.to}\u0000${edge.from}`);
    if (!reciprocal) {
      addViolation({
        code: "pap.claim.inverse-missing",
        subject: `${edge.relation}:${edge.from}->${edge.to}`,
        detail: `reciprocal edge ${relation.inverse}:${edge.to}->${edge.from} is missing`,
      });
    }
  }
  violations.sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1;
    return a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0;
  });
  const diagnostics = violations.map((violation) =>
    checkDiagnostic(violation.code, "error", violation.detail),
  );
  if (budgetExceeded) {
    diagnostics.push(
      checkDiagnostic(
        "pap.package.limit-exceeded",
        "error",
        "relation witness output budget exceeded",
      ),
    );
  }
  const empty =
    relations.entities.length === 0 &&
    relations.edges.length === 0 &&
    relations.relations.length === 0;
  const outcome: CheckOutcome = budgetExceeded
    ? "NOT_EVALUATED"
    : violations.length > 0
      ? "FAIL"
      : empty
        ? "NOT_EVALUATED"
        : "PASS";
  if (empty && !budgetExceeded) {
    diagnostics.push(
      checkDiagnostic(
        "pap.check.not-evaluated",
        "warning",
        "relations claim declares an empty graph",
      ),
    );
  }
  return relationRecord(
    input,
    claim,
    violations,
    outcome,
    relations.entities.length,
    relations.edges.length,
    diagnostics,
  );
}

function relationRecord(
  input: CheckInput,
  claim: ClaimState | undefined,
  violations: RelationViolation[],
  outcome: CheckOutcome,
  entities: number,
  edges: number,
  diagnostics: CheckDiagnostic[],
): CheckRecord {
  return {
    checkId: "pap.check.relation-consistency/1",
    checkVersion: "1",
    subjectDigests: {
      package: input.packageIdentity,
      ...(claim === undefined
        ? { claims: [] }
        : { claims: [{ kind: "relations", digest: claimSubjectDigest(claim) }] }),
    },
    scope: { entities, edges },
    checker: input.checker,
    outcome,
    witnesses: [{ type: "relation-violation-list", violations }],
    diagnostics,
  };
}

export function checkSpecImpl(id: string, input: CheckInput): CheckRecord | null {
  switch (id) {
    case "pap.check.digest-integrity/1":
      return checkDigestIntegrity(input);
    case "pap.check.source-quote/1":
      return checkSourceQuote(input);
    case "pap.check.relation-consistency/1":
      return checkRelationConsistency(input);
    default:
      return null;
  }
}

export function isImplementedCheck(id: string): boolean {
  return (
    id === "pap.check.digest-integrity/1" ||
    id === "pap.check.source-quote/1" ||
    id === "pap.check.relation-consistency/1"
  );
}

export type { ProducerReportClaim, ReviewsClaim, RelationsClaim, ProvenanceClaim };
