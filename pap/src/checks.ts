/**
 * The three v0.1 mechanical checks (RFC §8.4–§8.6).
 *
 * Every check is a pure function of packaged bytes and produces a check record
 * with independently recomputable witnesses. Producer claims are never inputs.
 */

import {
  base64Encode,
  domainHash,
  inputFileDigest,
  normalizedInputSetDigest,
} from "./digest.js";
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
  bytes?: Uint8Array;
  status: "ok" | "mismatch" | "referenced" | "unread" | "missing";
  message?: string;
}

export interface InputState {
  input: ManifestInput;
  computed: string | null;
  bytes?: Uint8Array;
  normalized?: Uint8Array;
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

export interface CheckInput {
  packageIdentity: string;
  manifest: Manifest;
  artifacts: ArtifactState[];
  sources: SourceState[];
  inputs: InputState[];
  claims: ClaimState[];
  normalizedInputDigest: string | null;
  checker: { id: string; version: string; implementationDigest: string };
  limits: { provenanceBindings: number };
}

function claimState(input: CheckInput, kind: ClaimKind): ClaimState | undefined {
  return input.claims.find((claim) => claim.kind === kind);
}

function claimSubjectDigest(claim: ClaimState): string {
  return claim.computedDigest ?? claim.declaredDigest;
}

function checkDiagnostic(code: string, severity: CheckDiagnostic["severity"], message: string): CheckDiagnostic {
  return { code, severity, message };
}

/** `pap.check.digest-integrity/1` */
export function checkDigestIntegrity(input: CheckInput): CheckRecord {
  const diagnostics: CheckDiagnostic[] = [];
  const witnesses: Witness[] = [];
  let mismatch = false;
  let unread = false;

  const note = (state: "mismatch" | "missing" | "unread", code: string, message: string): void => {
    diagnostics.push(checkDiagnostic(code, "error", message));
    if (state === "missing" || state === "unread") {
      unread = true;
    } else {
      mismatch = true;
    }
  };

  for (const state of input.artifacts) {
    witnesses.push({
      type: "recomputed-digest",
      subject: { kind: "artifact", id: state.artifact.id },
      algorithm: "sha256",
      declared: state.artifact.digest,
      computed: state.computed,
    });
    if (state.status === "ok") continue;
    if (state.status === "mismatch") {
      note("mismatch", "pap.integrity.artifact-mismatch", state.message ?? `artifact ${state.artifact.id} does not match its declaration`);
    } else {
      note(state.status, "pap.package.declared-file-missing", state.message ?? `artifact ${state.artifact.id} is not readable`);
    }
  }

  for (const state of input.sources) {
    witnesses.push({
      type: "recomputed-digest",
      subject: { kind: "source", id: state.source.id },
      algorithm: "sha256",
      declared: state.source.digest,
      computed: state.computed,
    });
    if (state.status === "ok") continue;
    if (state.status === "mismatch") {
      note("mismatch", "pap.integrity.source-mismatch", state.message ?? `source ${state.source.id} does not match its declaration`);
    } else if (state.status === "referenced") {
      diagnostics.push(checkDiagnostic("pap.source.unavailable", "warning", `source ${state.source.id} has no embedded snapshot`));
      unread = true;
    } else {
      note(state.status, "pap.package.declared-file-missing", state.message ?? `source ${state.source.id} is not readable`);
    }
  }

  for (const state of input.inputs) {
    witnesses.push({
      type: "recomputed-digest",
      subject: { kind: "input", id: state.input.id },
      algorithm: "sha256",
      declared: state.input.digest,
      computed: state.computed,
    });
    if (state.status === "ok") continue;
    if (state.status === "mismatch") {
      note("mismatch", "pap.integrity.input-mismatch", state.message ?? `input ${state.input.id} does not match its declaration`);
    } else {
      note(state.status, "pap.package.declared-file-missing", state.message ?? `input ${state.input.id} is not readable`);
    }
  }

  for (const claim of input.claims) {
    witnesses.push({
      type: "recomputed-digest",
      subject: { kind: "claim", id: claim.kind },
      algorithm: "sha256",
      declared: claim.declaredDigest,
      computed: claim.computedDigest,
    });
    if (claim.status === "ok") continue;
    if (claim.status === "mismatch") {
      note("mismatch", "pap.integrity.claim-mismatch", claim.message ?? `claim ${claim.kind} does not match its declaration`);
    } else {
      note(claim.status, "pap.package.declared-file-missing", claim.message ?? `claim ${claim.kind} is not readable`);
    }
  }

  const outcome: CheckOutcome = mismatch ? "FAIL" : unread ? "NOT_EVALUATED" : "PASS";

  return {
    checkId: "pap.check.digest-integrity/1",
    checkVersion: "1",
    subjectDigests: {
      package: input.packageIdentity,
      artifacts: input.artifacts.map((state) => ({ id: state.artifact.id, digest: state.computed ?? state.artifact.digest })),
      sources: input.sources.map((state) => ({ id: state.source.id, digest: state.computed ?? state.source.digest })),
      inputs: input.inputs.map((state) => ({ id: state.input.id, digest: state.computed ?? state.input.digest })),
      claims: input.claims.map((claim) => ({ kind: claim.kind, digest: claimSubjectDigest(claim) })),
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

  if (claim === undefined) {
    diagnostics.push(checkDiagnostic("pap.check.not-evaluated", "warning", "claims/provenance.json is absent"));
    return quoteRecord(input, undefined, [], diagnostics, "NOT_EVALUATED", sourcesUsed, 0, 0, 0);
  }
  if (claim.status === "mismatch" || claim.status === "missing" || claim.status === "unread" || claim.parsed === undefined) {
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
    const source = input.sources.find((state) => state.source.id === binding.sourceId);
    sourcesUsed.add(binding.sourceId);
    if (source === undefined) {
      // The claim parser rejects undeclared source ids; keep this defensive.
      diagnostics.push(checkDiagnostic("pap.check.not-evaluated", "warning", `source ${binding.sourceId} is not declared`));
      unavailable += 1;
      continue;
    }
    if (source.bytes === undefined || source.computed === null) {
      diagnostics.push(checkDiagnostic("pap.source.unavailable", "warning", `source ${source.source.id} has no embedded snapshot`));
      unavailable += 1;
      continue;
    }
    const { start, end } = binding.locator;
    if (start > end || end > source.bytes.length) {
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
    const extracted = source.bytes.subarray(start, end);
    const extractedDigest = domainHash("pap.quote.v1", extracted);
    witnesses.push({
      type: "source-span",
      sourceId: source.source.id,
      sourceDigest: source.computed,
      range: { start, end },
      quoteDigest: binding.quote.digest,
      extractedDigest,
      quoteBase64: base64Encode(extracted),
    });
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
    if (evaluated === 0) {
      diagnostics.push(checkDiagnostic("pap.check.not-evaluated", "warning", "no provenance binding could be evaluated"));
      outcome = "NOT_EVALUATED";
    } else if (unavailable > 0) {
      diagnostics.push(checkDiagnostic("pap.check.partial", "warning", "some provenance bindings could not be evaluated"));
      outcome = "NOT_EVALUATED";
    } else {
      outcome = "PASS";
    }
  }
  return quoteRecord(input, claim, witnesses, diagnostics, outcome, sourcesUsed, provenance.bindings.length, evaluated, unavailable);
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
      ...(claim === undefined ? { claims: [] } : { claims: [{ kind: "provenance", digest: claimSubjectDigest(claim) }] }),
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
  const entities = new Map<string, { id: string; kind: string }>();
  for (const entity of relations.entities) {
    if (entities.has(entity.id)) {
      violations.push({
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
      violations.push({
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
      violations.push({
        code: "pap.claim.relation-unknown",
        subject,
        detail: `edge names undeclared relation ${edge.relation}`,
      });
      continue;
    }
    const from = entities.get(edge.from);
    const to = entities.get(edge.to);
    if (from === undefined || to === undefined) {
      violations.push({
        code: "pap.claim.edge-unknown-entity",
        subject,
        detail: `edge endpoint is not a declared entity`,
      });
      continue;
    }
    if (from.kind !== relation.from || to.kind !== relation.to) {
      violations.push({
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
      violations.push({
        code: "pap.claim.inverse-missing",
        subject: relation.name,
        detail: `inverse relation ${relation.inverse} is not declared`,
      });
      continue;
    }
    if (inverse.inverse !== relation.name) {
      violations.push({
        code: "pap.claim.inverse-not-reciprocal",
        subject: relation.name,
        detail: `inverse ${inverse.name} does not point back to ${relation.name}`,
      });
    }
    if (inverse.from !== relation.to || inverse.to !== relation.from) {
      violations.push({
        code: "pap.claim.inverse-kind-mismatch",
        subject: relation.name,
        detail: `inverse ${inverse.name} does not reverse the relation kinds`,
      });
    }
  }
  for (const edge of relations.edges) {
    const relation = relationMap.get(edge.relation);
    if (relation?.inverse === undefined) continue;
    const inverse = relationMap.get(relation.inverse);
    if (inverse === undefined) continue;
    const reciprocal = relations.edges.some(
      (candidate) =>
        candidate.relation === relation.inverse &&
        candidate.from === edge.to &&
        candidate.to === edge.from,
    );
    if (!reciprocal) {
      violations.push({
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
  const empty = relations.entities.length === 0 && relations.edges.length === 0 && relations.relations.length === 0;
  const outcome: CheckOutcome =
    violations.length > 0 ? "FAIL" : empty ? "NOT_EVALUATED" : "PASS";
  if (empty) {
    diagnostics.push(checkDiagnostic("pap.check.not-evaluated", "warning", "relations claim declares an empty graph"));
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
      ...(claim === undefined ? { claims: [] } : { claims: [{ kind: "relations", digest: claimSubjectDigest(claim) }] }),
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
