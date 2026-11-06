/**
 * Appendix B trust policy loading.
 *
 * The policy is the operator's explicit local input. It is never discovered in
 * the package, and an invalid policy fails closed: exit 64, no package report.
 * The strict typed decoder lives in `decode.ts`.
 */

import { readFile, stat } from "node:fs/promises";
import { domainHash } from "./digest.js";
import { decodeTrustPolicy, isObject, PolicyInvalid } from "./decode.js";
import { JsonParseError, jcsBytes, parseJsonStrict } from "./json.js";
import { parseRfc3339 } from "./time.js";
import type { Instant } from "./time.js";
import { DEFAULT_LIMITS } from "./types.js";
import type { DimensionName, LimitName, Limits } from "./types.js";

export { DIMENSION_ORDER, PolicyInvalid } from "./decode.js";

export interface PolicyKey {
  keyId: string;
  algorithm: "ed25519";
  publicKey: string;
}

export interface PolicySigner {
  keyIds: string[];
  identity: string;
  allowedRoles: ("producer" | "reviewer")[];
  allowedPackageIds?: string[];
  allowedPackageIdentities?: string[];
}

export interface TrustPolicy {
  trustPolicyVersion: "0.1";
  id: string;
  issuedAt: string;
  expiresAt: string;
  signature: { mode: "disabled" | "optional" | "required"; minimumValidSigners: number };
  keys: PolicyKey[];
  signers: PolicySigner[];
  checkers: { id: string; version: string; implementationDigest: string }[];
  profiles: { id: string; version: string; closureDigest?: string }[];
  requiredChecks: string[];
  requiredDimensions: DimensionName[];
  humanReview: { required: boolean; maxAgeSeconds: number };
  limits?: Partial<Record<LimitName, number>>;
}

export interface LoadedPolicy {
  policy: TrustPolicy;
  digest: string;
  effectiveLimits: Partial<Record<LimitName, number>>;
  loweredLimits: Partial<Record<LimitName, number>>;
  state: "FRESH" | "STALE";
  staleReason: "pap.trust.policy-stale" | "pap.trust.policy-not-yet-valid" | null;
}

export async function loadPolicy(
  file: string,
  evaluatedAt: Instant,
  defaults: Limits = DEFAULT_LIMITS,
): Promise<LoadedPolicy> {
  let bytes: Uint8Array;
  try {
    const info = await stat(file);
    if (!info.isFile()) {
      throw new PolicyInvalid("trust policy path is not a regular file");
    }
    if (info.size > defaults.manifestBytes) {
      throw new PolicyInvalid("trust policy exceeds the byte limit");
    }
    bytes = new Uint8Array(await readFile(file));
  } catch (error) {
    if (error instanceof PolicyInvalid) throw error;
    throw new PolicyInvalid(`cannot read trust policy: ${(error as Error).message}`);
  }

  let value;
  try {
    value = parseJsonStrict(bytes, {
      nesting: defaults.jsonNesting,
      stringBytes: defaults.jsonStringBytes,
    });
  } catch (error) {
    throw new PolicyInvalid(error instanceof JsonParseError ? error.message : "trust policy is not valid JSON");
  }
  if (!isObject(value)) {
    throw new PolicyInvalid("trust policy must be a JSON object");
  }
  const policy = decodeTrustPolicy(value, defaults);
  const digest = domainHash("pap.trust-policy.v1", jcsBytes(value));
  const issuedAt = parseRfc3339(policy.issuedAt) as Instant;
  const expiresAt = parseRfc3339(policy.expiresAt) as Instant;
  if (evaluatedAt < issuedAt) {
    return {
      policy,
      digest,
      effectiveLimits: loweredFrom(policy, defaults),
      loweredLimits: loweredFrom(policy, defaults),
      state: "STALE",
      staleReason: "pap.trust.policy-not-yet-valid",
    };
  }
  if (evaluatedAt > expiresAt) {
    return {
      policy,
      digest,
      effectiveLimits: loweredFrom(policy, defaults),
      loweredLimits: loweredFrom(policy, defaults),
      state: "STALE",
      staleReason: "pap.trust.policy-stale",
    };
  }
  return {
    policy,
    digest,
    effectiveLimits: loweredFrom(policy, defaults),
    loweredLimits: loweredFrom(policy, defaults),
    state: "FRESH",
    staleReason: null,
  };
}

function loweredFrom(policy: TrustPolicy, defaults: Limits): Partial<Record<LimitName, number>> {
  const lowered: Partial<Record<LimitName, number>> = {};
  if (policy.limits === undefined) return lowered;
  for (const [name, value] of Object.entries(policy.limits) as [LimitName, number][]) {
    if (value < defaults[name]) {
      lowered[name] = value;
    }
  }
  return lowered;
}
