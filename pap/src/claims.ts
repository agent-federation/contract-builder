/**
 * Appendix D claim file types.
 *
 * Claims are untrusted producer data. The strict decoder lives in `decode.ts`;
 * a claim that violates its schema makes package integrity FAIL, while an
 * unknown `papClaimsVersion` is UNSUPPORTED instead. Duplicate relation/binding
 * identifiers are check-level failures, not schema failures (RFC D.1, D.2).
 */

import { decodeClaimFile } from "./decode.js";
import type { Limits } from "./types.js";

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

export function parseClaimFile(
  kind: "provenance" | "relations" | "producerReport" | "reviews",
  bytes: Uint8Array,
  limits: Limits,
  declaredSourceIds: Set<string>,
): ClaimParseResult {
  return decodeClaimFile(kind, bytes, limits, declaredSourceIds);
}
