/**
 * Appendix D claim files: strict parsing and cross-field invariants.
 *
 * Claims are untrusted producer data. A claim that violates its schema makes
 * package integrity FAIL; an unknown `papClaimsVersion` is UNSUPPORTED instead.
 * Duplicate relation/binding identifiers are check-level failures, not schema
 * failures (RFC D.1, D.2).
 */

import { isDigest } from "./digest.js";
import { parseJsonStrict, JsonParseError } from "./json.js";
import { parseRfc3339 } from "./time.js";
import type { JsonObject, JsonValue, Limits } from "./types.js";
import { isObject } from "./manifest.js";

export interface ProvenanceBinding {
  id: string;
  entityId: string;
  sourceId: string;
  locator: { kind: "byte-range"; start: number; end: number };
  quote: { normalization: "none"; digest: string };
}

export interface ProvenanceClaim {
  kind: "provenance";
  bindings: ProvenanceBinding[];
}

export interface RelationsClaim {
  kind: "relations";
  entities: { id: string; kind: string }[];
  relations: { name: string; from: string; to: string; inverse?: string }[];
  edges: { relation: string; from: string; to: string }[];
}

export interface ProducerReportClaim {
  kind: "producerReport";
  producer: { name: string; version: string };
  claims: {
    checkId: string;
    checkVersion: string;
    claimedOutcome: "PASS" | "FAIL" | "UNSUPPORTED" | "NOT_EVALUATED";
    checkedAt?: string;
    checker?: { id: string; version: string; implementationDigest: string };
  }[];
}

export interface ReviewsClaim {
  kind: "reviews";
  approvals: {
    id: string;
    reviewer: { identity: string; keyId?: string };
    decision: "approved" | "rejected";
    decidedAt: string;
    scope?: { packageId?: string; artifacts?: string[]; packageIdentity?: string };
    evidence?: { path?: string; digest?: string };
  }[];
}

export type ParsedClaim =
  | ProvenanceClaim
  | RelationsClaim
  | ProducerReportClaim
  | ReviewsClaim;

export interface ClaimIssue {
  code: string;
  message: string;
}

export type ClaimParseResult =
  | { ok: true; claim: ParsedClaim; issues: ClaimIssue[] }
  | {
      ok: false;
      failure: "invalid" | "unsupported-version" | "limit";
      message: string;
    };

const CHECK_ID = /^pap\.check\.[a-z0-9-]+\/[0-9]+$/;
const VERSION = /^(0|[1-9][0-9]*)$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/;

export function parseClaimFile(
  kind: "provenance" | "relations" | "producerReport" | "reviews",
  bytes: Uint8Array,
  limits: Limits,
  declaredSourceIds: Set<string>,
): ClaimParseResult {
  let value: JsonValue;
  try {
    value = parseJsonStrict(bytes, {
      nesting: limits.jsonNesting,
      stringBytes: limits.jsonStringBytes,
    });
  } catch (error) {
    if (error instanceof JsonParseError && error.failure === "limit") {
      return { ok: false, failure: "limit", message: error.message };
    }
    return {
      ok: false,
      failure: "invalid",
      message: error instanceof Error ? error.message : "claim file is not valid JSON",
    };
  }
  if (!isObject(value)) {
    return { ok: false, failure: "invalid", message: "claim file must be a JSON object" };
  }
  const version = value.papClaimsVersion;
  if (version === undefined) {
    return { ok: false, failure: "invalid", message: "claim file is missing papClaimsVersion" };
  }
  if (version !== "0.1") {
    return {
      ok: false,
      failure: "unsupported-version",
      message: "claim file declares an unsupported papClaimsVersion",
    };
  }
  switch (kind) {
    case "provenance":
      return parseProvenance(value, limits, declaredSourceIds);
    case "relations":
      return parseRelations(value, limits);
    case "producerReport":
      return parseProducerReport(value);
    case "reviews":
      return parseReviews(value);
  }
}

function fail(message: string): ClaimParseResult {
  return { ok: false, failure: "invalid", message };
}

function allowedOnly(
  value: JsonObject,
  allowed: string[],
  scope: string,
): string | null {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      return `unknown field ${scope}.${key}`;
    }
  }
  return null;
}

function parseProvenance(
  value: JsonObject,
  limits: Limits,
  declaredSourceIds: Set<string>,
): ClaimParseResult {
  const unknown = allowedOnly(value, ["papClaimsVersion", "bindings"], "provenance");
  if (unknown !== null) return fail(unknown);
  if (!Array.isArray(value.bindings)) return fail("provenance.bindings must be an array");
  if (value.bindings.length > limits.provenanceBindings) {
    return { ok: false, failure: "limit", message: "provenance binding limit exceeded" };
  }
  const bindings: ProvenanceBinding[] = [];
  const issues: ClaimIssue[] = [];
  const seenIds = new Set<string>();
  const seenTuples = new Set<string>();
  for (let index = 0; index < value.bindings.length; index += 1) {
    const raw = value.bindings[index];
    const scope = `provenance.bindings[${index}]`;
    if (!isObject(raw)) return fail(`${scope} must be an object`);
    const bad = allowedOnly(raw, ["id", "entityId", "sourceId", "locator", "quote"], scope);
    if (bad !== null) return fail(bad);
    if (
      typeof raw.id !== "string" ||
      raw.id.length === 0 ||
      raw.id.length > 256 ||
      typeof raw.entityId !== "string" ||
      raw.entityId.length === 0 ||
      raw.entityId.length > 256 ||
      typeof raw.sourceId !== "string" ||
      raw.sourceId.length === 0 ||
      raw.sourceId.length > 256 ||
      !isObject(raw.locator) ||
      !isObject(raw.quote)
    ) {
      return fail(`${scope} is not a valid provenance binding`);
    }
    const locator = raw.locator;
    const quote = raw.quote;
    if (allowedOnly(locator, ["kind", "start", "end"], `${scope}.locator`) !== null) {
      return fail(`${scope}.locator has unknown fields`);
    }
    if (allowedOnly(quote, ["normalization", "digest"], `${scope}.quote`) !== null) {
      return fail(`${scope}.quote has unknown fields`);
    }
    if (
      locator.kind !== "byte-range" ||
      typeof locator.start !== "number" ||
      !Number.isSafeInteger(locator.start) ||
      locator.start < 0 ||
      typeof locator.end !== "number" ||
      !Number.isSafeInteger(locator.end) ||
      locator.end < 0 ||
      quote.normalization !== "none" ||
      !isDigest(quote.digest)
    ) {
      return fail(`${scope} has an invalid locator or quote`);
    }
    if (!declaredSourceIds.has(raw.sourceId)) {
      return fail(`${scope}.sourceId names a source the manifest does not declare`);
    }
    if (seenIds.has(raw.id)) {
      issues.push({ code: "pap.claim.binding-duplicate", message: `duplicate binding id ${raw.id}` });
    }
    seenIds.add(raw.id);
    const tuple = `${raw.entityId}\u0000${raw.sourceId}\u0000${locator.start}\u0000${locator.end}`;
    if (seenTuples.has(tuple)) {
      issues.push({
        code: "pap.claim.binding-duplicate",
        message: `duplicate binding tuple for ${raw.entityId}`,
      });
    }
    seenTuples.add(tuple);
    bindings.push({
      id: raw.id,
      entityId: raw.entityId,
      sourceId: raw.sourceId,
      locator: { kind: "byte-range", start: locator.start, end: locator.end },
      quote: { normalization: "none", digest: quote.digest },
    });
  }
  return { ok: true, claim: { kind: "provenance", bindings }, issues };
}

function parseRelations(value: JsonObject, limits: Limits): ClaimParseResult {
  const unknown = allowedOnly(value, ["papClaimsVersion", "entities", "relations", "edges"], "relations");
  if (unknown !== null) return fail(unknown);
  if (!Array.isArray(value.entities) || !Array.isArray(value.relations) || !Array.isArray(value.edges)) {
    return fail("relations claim must carry entities, relations and edges arrays");
  }
  if (value.entities.length > limits.relationEntities) {
    return { ok: false, failure: "limit", message: "relation entity limit exceeded" };
  }
  if (value.edges.length > limits.relationEdges) {
    return { ok: false, failure: "limit", message: "relation edge limit exceeded" };
  }
  const entities: RelationsClaim["entities"] = [];
  const relations: RelationsClaim["relations"] = [];
  const edges: RelationsClaim["edges"] = [];
  for (let index = 0; index < value.entities.length; index += 1) {
    const raw = value.entities[index];
    const scope = `relations.entities[${index}]`;
    if (!isObject(raw)) return fail(`${scope} must be an object`);
    if (allowedOnly(raw, ["id", "kind"], scope) !== null) return fail(`${scope} has unknown fields`);
    if (
      typeof raw.id !== "string" ||
      raw.id.length === 0 ||
      raw.id.length > 256 ||
      typeof raw.kind !== "string" ||
      raw.kind.length === 0 ||
      raw.kind.length > 128
    ) {
      return fail(`${scope} is invalid`);
    }
    entities.push({ id: raw.id, kind: raw.kind });
  }
  for (let index = 0; index < value.relations.length; index += 1) {
    const raw = value.relations[index];
    const scope = `relations.relations[${index}]`;
    if (!isObject(raw)) return fail(`${scope} must be an object`);
    if (allowedOnly(raw, ["name", "from", "to", "inverse"], scope) !== null) {
      return fail(`${scope} has unknown fields`);
    }
    if (
      typeof raw.name !== "string" ||
      raw.name.length === 0 ||
      raw.name.length > 128 ||
      typeof raw.from !== "string" ||
      raw.from.length === 0 ||
      raw.from.length > 128 ||
      typeof raw.to !== "string" ||
      raw.to.length === 0 ||
      raw.to.length > 128 ||
      (raw.inverse !== undefined &&
        (typeof raw.inverse !== "string" || raw.inverse.length === 0 || raw.inverse.length > 128))
    ) {
      return fail(`${scope} is invalid`);
    }
    relations.push({
      name: raw.name,
      from: raw.from,
      to: raw.to,
      ...(typeof raw.inverse === "string" ? { inverse: raw.inverse } : {}),
    });
  }
  for (let index = 0; index < value.edges.length; index += 1) {
    const raw = value.edges[index];
    const scope = `relations.edges[${index}]`;
    if (!isObject(raw)) return fail(`${scope} must be an object`);
    if (allowedOnly(raw, ["relation", "from", "to"], scope) !== null) return fail(`${scope} has unknown fields`);
    if (
      typeof raw.relation !== "string" ||
      raw.relation.length === 0 ||
      raw.relation.length > 128 ||
      typeof raw.from !== "string" ||
      raw.from.length === 0 ||
      raw.from.length > 256 ||
      typeof raw.to !== "string" ||
      raw.to.length === 0 ||
      raw.to.length > 256
    ) {
      return fail(`${scope} is invalid`);
    }
    edges.push({ relation: raw.relation, from: raw.from, to: raw.to });
  }
  return { ok: true, claim: { kind: "relations", entities, relations, edges }, issues: [] };
}

function parseProducerReport(value: JsonObject): ClaimParseResult {
  const unknown = allowedOnly(value, ["papClaimsVersion", "producer", "claims"], "producerReport");
  if (unknown !== null) return fail(unknown);
  if (!isObject(value.producer) || !Array.isArray(value.claims)) {
    return fail("producer report must carry producer and claims");
  }
  const producer = value.producer;
  if (allowedOnly(producer, ["name", "version"], "producer") !== null) {
    return fail("producer has unknown fields");
  }
  if (
    typeof producer.name !== "string" ||
    producer.name.length === 0 ||
    producer.name.length > 256 ||
    typeof producer.version !== "string" ||
    producer.version.length === 0 ||
    producer.version.length > 128
  ) {
    return fail("producer report producer is invalid");
  }
  const claims: ProducerReportClaim["claims"] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.claims.length; index += 1) {
    const raw = value.claims[index];
    const scope = `producerReport.claims[${index}]`;
    if (!isObject(raw)) return fail(`${scope} must be an object`);
    const bad = allowedOnly(raw, ["checkId", "checkVersion", "claimedOutcome", "checkedAt", "checker", "outcome", "witnesses"], scope);
    if (bad !== null) {
      if (raw.outcome !== undefined || raw.witnesses !== undefined) {
        return { ok: false, failure: "invalid", message: `${scope} mimics a verifier check record` };
      }
      return fail(bad);
    }
    if (
      typeof raw.checkId !== "string" ||
      !CHECK_ID.test(raw.checkId) ||
      typeof raw.checkVersion !== "string" ||
      !VERSION.test(raw.checkVersion) ||
      !["PASS", "FAIL", "UNSUPPORTED", "NOT_EVALUATED"].includes(String(raw.claimedOutcome))
    ) {
      return fail(`${scope} is invalid`);
    }
    if (raw.checkVersion !== raw.checkId.slice(raw.checkId.lastIndexOf("/") + 1)) {
      return fail(`${scope}.checkVersion does not match the checkId suffix`);
    }
    if (seen.has(raw.checkId)) {
      return fail(`${scope}.checkId is duplicated`);
    }
    seen.add(raw.checkId);
    if (raw.checkedAt !== undefined) {
      if (typeof raw.checkedAt !== "string" || parseRfc3339(raw.checkedAt) === null) {
        return fail(`${scope}.checkedAt is not RFC 3339`);
      }
    }
    if (raw.checker !== undefined) {
      if (!isObject(raw.checker)) return fail(`${scope}.checker must be an object`);
      if (allowedOnly(raw.checker, ["id", "version", "implementationDigest"], `${scope}.checker`) !== null) {
        return fail(`${scope}.checker has unknown fields`);
      }
      if (
        typeof raw.checker.id !== "string" ||
        raw.checker.id.length === 0 ||
        raw.checker.id.length > 256 ||
        typeof raw.checker.version !== "string" ||
        raw.checker.version.length === 0 ||
        raw.checker.version.length > 128 ||
        !isDigest(raw.checker.implementationDigest)
      ) {
        return fail(`${scope}.checker is invalid`);
      }
    }
    claims.push({
      checkId: raw.checkId,
      checkVersion: raw.checkVersion,
      claimedOutcome: raw.claimedOutcome as ProducerReportClaim["claims"][number]["claimedOutcome"],
      ...(typeof raw.checkedAt === "string" ? { checkedAt: raw.checkedAt } : {}),
      ...(isObject(raw.checker)
        ? {
            checker: {
              id: String(raw.checker.id),
              version: String(raw.checker.version),
              implementationDigest: String(raw.checker.implementationDigest),
            },
          }
        : {}),
    });
  }
  return { ok: true, claim: { kind: "producerReport", producer: { name: producer.name, version: producer.version }, claims }, issues: [] };
}

function parseReviews(value: JsonObject): ClaimParseResult {
  const unknown = allowedOnly(value, ["papClaimsVersion", "approvals"], "reviews");
  if (unknown !== null) return fail(unknown);
  if (!Array.isArray(value.approvals)) return fail("reviews.approvals must be an array");
  const approvals: ReviewsClaim["approvals"] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.approvals.length; index += 1) {
    const raw = value.approvals[index];
    const scope = `reviews.approvals[${index}]`;
    if (!isObject(raw)) return fail(`${scope} must be an object`);
    if (allowedOnly(raw, ["id", "reviewer", "decision", "decidedAt", "scope", "evidence"], scope) !== null) {
      return fail(`${scope} has unknown fields`);
    }
    if (seen.has(String(raw.id))) return fail(`${scope}.id is duplicated`);
    if (
      typeof raw.id !== "string" ||
      raw.id.length === 0 ||
      raw.id.length > 256 ||
      !isObject(raw.reviewer) ||
      !["approved", "rejected"].includes(String(raw.decision)) ||
      typeof raw.decidedAt !== "string" ||
      parseRfc3339(raw.decidedAt) === null
    ) {
      return fail(`${scope} is invalid`);
    }
    seen.add(raw.id);
    const reviewer = raw.reviewer;
    if (allowedOnly(reviewer, ["identity", "keyId"], `${scope}.reviewer`) !== null) {
      return fail(`${scope}.reviewer has unknown fields`);
    }
    if (
      typeof reviewer.identity !== "string" ||
      !IDENTITY.test(reviewer.identity) ||
      (reviewer.keyId !== undefined &&
        (typeof reviewer.keyId !== "string" || reviewer.keyId.length === 0 || reviewer.keyId.length > 256))
    ) {
      return fail(`${scope}.reviewer is invalid`);
    }
    let reviewScope: ReviewsClaim["approvals"][number]["scope"];
    if (raw.scope !== undefined) {
      if (!isObject(raw.scope)) return fail(`${scope}.scope must be an object`);
      if (allowedOnly(raw.scope, ["packageId", "artifacts", "packageIdentity"], `${scope}.scope`) !== null) {
        return fail(`${scope}.scope has unknown fields`);
      }
      const packageId = raw.scope.packageId;
      const artifacts = raw.scope.artifacts;
      const packageIdentity = raw.scope.packageIdentity;
      if (
        (packageId !== undefined && (typeof packageId !== "string" || packageId.length === 0 || packageId.length > 512)) ||
        (artifacts !== undefined &&
          (!Array.isArray(artifacts) ||
            artifacts.some((item) => typeof item !== "string" || item.length === 0 || item.length > 256))) ||
        (packageIdentity !== undefined && !isDigest(packageIdentity))
      ) {
        return fail(`${scope}.scope is invalid`);
      }
      reviewScope = {};
      if (typeof packageId === "string") reviewScope.packageId = packageId;
      if (Array.isArray(artifacts)) reviewScope.artifacts = artifacts as string[];
      if (typeof packageIdentity === "string") reviewScope.packageIdentity = packageIdentity;
    }
    let evidence: ReviewsClaim["approvals"][number]["evidence"];
    if (raw.evidence !== undefined) {
      if (!isObject(raw.evidence)) return fail(`${scope}.evidence must be an object`);
      if (allowedOnly(raw.evidence, ["path", "digest"], `${scope}.evidence`) !== null) {
        return fail(`${scope}.evidence has unknown fields`);
      }
      if (
        (raw.evidence.path !== undefined &&
          (typeof raw.evidence.path !== "string" || raw.evidence.path.length > 255)) ||
        (raw.evidence.digest !== undefined && !isDigest(raw.evidence.digest))
      ) {
        return fail(`${scope}.evidence is invalid`);
      }
      evidence = {};
      if (typeof raw.evidence.path === "string") evidence.path = raw.evidence.path;
      if (typeof raw.evidence.digest === "string") evidence.digest = raw.evidence.digest;
    }
    approvals.push({
      id: raw.id,
      reviewer: {
        identity: reviewer.identity,
        ...(typeof reviewer.keyId === "string" ? { keyId: reviewer.keyId } : {}),
      },
      decision: raw.decision as "approved" | "rejected",
      decidedAt: raw.decidedAt,
      ...(reviewScope === undefined ? {} : { scope: reviewScope }),
      ...(evidence === undefined ? {} : { evidence }),
    });
  }
  return { ok: true, claim: { kind: "reviews", approvals }, issues: [] };
}
