/**
 * Appendix B trust policy parsing and validation.
 *
 * The policy is the operator's explicit local input. It is never discovered in
 * the package, and an invalid policy fails closed: exit 64, no package report.
 */

import { readFile, stat } from "node:fs/promises";
import { canonicalBase64Decode, domainHash, isDigest } from "./digest.js";
import { JsonParseError, jcsBytes, parseJsonStrict } from "./json.js";
import { parseRfc3339 } from "./time.js";
import type { Instant } from "./time.js";
import { isObject } from "./manifest.js";
import { DEFAULT_LIMITS } from "./types.js";
import type { DimensionName, JsonObject, LimitName, Limits } from "./types.js";

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

export class PolicyInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyInvalid";
  }
}

export const DIMENSION_ORDER: DimensionName[] = [
  "integrity",
  "integrity.package",
  "integrity.artifacts",
  "sources",
  "sources.integrity",
  "sources.availability",
  "signature",
  "signature.validity",
  "trust",
  "trust.signerIdentity",
  "trust.policyDecision",
  "trust.checkerRecognition",
  "trust.profileRecognition",
  "checks",
  "humanReview",
];

export const EVALUABLE_DIMENSIONS = new Set<DimensionName>(DIMENSION_ORDER);

const CHECK_ID = /^pap\.check\.[a-z0-9-]+\/[0-9]+$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/;
const POLICY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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
  const policy = validatePolicy(value, defaults);
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

function validatePolicy(value: JsonObject, defaults: Limits): TrustPolicy {
  const allowedTop = [
    "trustPolicyVersion",
    "id",
    "issuedAt",
    "expiresAt",
    "signature",
    "keys",
    "signers",
    "checkers",
    "profiles",
    "requiredChecks",
    "requiredDimensions",
    "humanReview",
    "limits",
  ];
  for (const key of Object.keys(value)) {
    if (!allowedTop.includes(key)) {
      throw new PolicyInvalid(`unknown trust policy field ${key}`);
    }
  }
  for (const required of [
    "trustPolicyVersion",
    "id",
    "issuedAt",
    "expiresAt",
    "signature",
    "keys",
    "signers",
    "checkers",
    "profiles",
    "requiredChecks",
    "requiredDimensions",
    "humanReview",
  ]) {
    if (value[required] === undefined) {
      throw new PolicyInvalid(`trust policy is missing ${required}`);
    }
  }
  if (value.trustPolicyVersion !== "0.1") {
    throw new PolicyInvalid("trustPolicyVersion must be 0.1");
  }
  if (typeof value.id !== "string" || !POLICY_ID.test(value.id)) {
    throw new PolicyInvalid("trust policy id is invalid");
  }
  if (typeof value.issuedAt !== "string" || parseRfc3339(value.issuedAt) === null) {
    throw new PolicyInvalid("issuedAt is not RFC 3339");
  }
  if (typeof value.expiresAt !== "string" || parseRfc3339(value.expiresAt) === null) {
    throw new PolicyInvalid("expiresAt is not RFC 3339");
  }
  if ((parseRfc3339(value.issuedAt) as Instant) > (parseRfc3339(value.expiresAt) as Instant)) {
    throw new PolicyInvalid("issuedAt must not be after expiresAt");
  }

  if (!isObject(value.signature)) {
    throw new PolicyInvalid("signature must be an object");
  }
  for (const key of Object.keys(value.signature)) {
    if (!["mode", "minimumValidSigners"].includes(key)) {
      throw new PolicyInvalid(`unknown signature field ${key}`);
    }
  }
  if (
    typeof value.signature.mode !== "string" ||
    !["disabled", "optional", "required"].includes(value.signature.mode)
  ) {
    throw new PolicyInvalid("signature.mode is invalid");
  }
  const mode = value.signature.mode as "disabled" | "optional" | "required";
  const rawMinimum = value.signature.minimumValidSigners;
  const minimumValidSigners = rawMinimum === undefined ? 1 : rawMinimum;
  if (
    typeof minimumValidSigners !== "number" ||
    !Number.isInteger(minimumValidSigners) ||
    minimumValidSigners < 1 ||
    minimumValidSigners > 64
  ) {
    throw new PolicyInvalid("signature.minimumValidSigners is invalid");
  }

  if (!Array.isArray(value.keys)) {
    throw new PolicyInvalid("keys must be an array");
  }
  if (value.keys.length > 64) {
    throw new PolicyInvalid("keys exceeds the policy limit");
  }
  const keys: PolicyKey[] = [];
  const keyIds = new Set<string>();
  for (let index = 0; index < value.keys.length; index += 1) {
    const raw = value.keys[index];
    if (!isObject(raw)) throw new PolicyInvalid(`keys[${index}] must be an object`);
    for (const key of Object.keys(raw)) {
      if (!["keyId", "algorithm", "publicKey"].includes(key)) {
        throw new PolicyInvalid(`unknown key field ${key}`);
      }
    }
    if (
      typeof raw.keyId !== "string" ||
      !KEY_ID.test(raw.keyId) ||
      raw.algorithm !== "ed25519" ||
      typeof raw.publicKey !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(raw.publicKey)
    ) {
      throw new PolicyInvalid(`keys[${index}] is invalid`);
    }
    if (keyIds.has(raw.keyId)) {
      throw new PolicyInvalid(`duplicate keyId ${raw.keyId}`);
    }
    keyIds.add(raw.keyId);
    if (canonicalBase64UrlDecode(raw.publicKey) === null) {
      throw new PolicyInvalid(`keys[${index}].publicKey is not canonical base64url`);
    }
    keys.push({ keyId: raw.keyId, algorithm: "ed25519", publicKey: raw.publicKey });
  }

  if (!Array.isArray(value.signers)) {
    throw new PolicyInvalid("signers must be an array");
  }
  if (value.signers.length > 64) {
    throw new PolicyInvalid("signers exceeds the policy limit");
  }
  const signers: PolicySigner[] = [];
  const signerForKeyId = new Map<string, number>();
  for (let index = 0; index < value.signers.length; index += 1) {
    const raw = value.signers[index];
    if (!isObject(raw)) throw new PolicyInvalid(`signers[${index}] must be an object`);
    for (const key of Object.keys(raw)) {
      if (!["keyIds", "identity", "allowedRoles", "allowedPackageIds", "allowedPackageIdentities"].includes(key)) {
        throw new PolicyInvalid(`unknown signer field ${key}`);
      }
    }
    if (
      !Array.isArray(raw.keyIds) ||
      raw.keyIds.length === 0 ||
      raw.keyIds.length > 8 ||
      new Set(raw.keyIds).size !== raw.keyIds.length ||
      raw.keyIds.some((keyId) => typeof keyId !== "string" || !keyIds.has(keyId)) ||
      typeof raw.identity !== "string" ||
      !IDENTITY.test(raw.identity) ||
      !Array.isArray(raw.allowedRoles) ||
      raw.allowedRoles.length === 0 ||
      raw.allowedRoles.length > 2 ||
      new Set(raw.allowedRoles).size !== raw.allowedRoles.length ||
      raw.allowedRoles.some((role) => role !== "producer" && role !== "reviewer")
    ) {
      throw new PolicyInvalid(`signers[${index}] is invalid`);
    }
    if (
      raw.allowedPackageIds !== undefined &&
      (!Array.isArray(raw.allowedPackageIds) ||
        raw.allowedPackageIds.length === 0 ||
        raw.allowedPackageIds.some((id) => typeof id !== "string" || id.length === 0 || id.length > 512))
    ) {
      throw new PolicyInvalid(`signers[${index}].allowedPackageIds is invalid`);
    }
    if (
      raw.allowedPackageIdentities !== undefined &&
      (!Array.isArray(raw.allowedPackageIdentities) ||
        raw.allowedPackageIdentities.length === 0 ||
        raw.allowedPackageIdentities.some((id) => !isDigest(id)))
    ) {
      throw new PolicyInvalid(`signers[${index}].allowedPackageIdentities is invalid`);
    }
    for (const keyId of raw.keyIds as string[]) {
      if (signerForKeyId.has(keyId)) {
        throw new PolicyInvalid(
          `keyId ${keyId} is enrolled in more than one signer entry`,
        );
      }
      signerForKeyId.set(keyId, index);
    }
    signers.push({
      keyIds: raw.keyIds as string[],
      identity: raw.identity,
      allowedRoles: raw.allowedRoles as ("producer" | "reviewer")[],
      ...(Array.isArray(raw.allowedPackageIds)
        ? { allowedPackageIds: raw.allowedPackageIds as string[] }
        : {}),
      ...(Array.isArray(raw.allowedPackageIdentities)
        ? { allowedPackageIdentities: raw.allowedPackageIdentities as string[] }
        : {}),
    });
  }
  if (mode === "required" && keys.length === 0) {
    throw new PolicyInvalid("signature mode required needs at least one key");
  }
  if (mode === "required" && signers.length === 0) {
    throw new PolicyInvalid("signature mode required needs at least one signer");
  }
  // A signer entry is one identity even when it enrolls several keys. Rejecting
  // a quorum above the number of entries makes "several keys from one signer
  // satisfy a multi-signer quorum" unrepresentable, so aggregation never has to
  // count keys for the quorum.
  if (mode === "required" && minimumValidSigners > signers.length) {
    throw new PolicyInvalid("minimumValidSigners exceeds the configured signer count");
  }

  const checkers = readCheckers(value.checkers);
  const profiles = readProfiles(value.profiles);

  if (
    !Array.isArray(value.requiredChecks) ||
    value.requiredChecks.length === 0 ||
    value.requiredChecks.length > 32 ||
    new Set(value.requiredChecks).size !== value.requiredChecks.length ||
    value.requiredChecks.some((id) => typeof id !== "string" || !CHECK_ID.test(id))
  ) {
    throw new PolicyInvalid("requiredChecks is invalid");
  }
  if (
    !Array.isArray(value.requiredDimensions) ||
    value.requiredDimensions.length === 0 ||
    value.requiredDimensions.length > 16 ||
    new Set(value.requiredDimensions).size !== value.requiredDimensions.length ||
    value.requiredDimensions.some((dimension) => !EVALUABLE_DIMENSIONS.has(dimension as DimensionName))
  ) {
    throw new PolicyInvalid("requiredDimensions contains an unevaluable or duplicate dimension");
  }

  if (!isObject(value.humanReview)) {
    throw new PolicyInvalid("humanReview must be an object");
  }
  for (const key of Object.keys(value.humanReview)) {
    if (!["required", "maxAgeSeconds"].includes(key)) {
      throw new PolicyInvalid(`unknown humanReview field ${key}`);
    }
  }
  if (
    typeof value.humanReview.required !== "boolean" ||
    typeof value.humanReview.maxAgeSeconds !== "number" ||
    !Number.isInteger(value.humanReview.maxAgeSeconds) ||
    value.humanReview.maxAgeSeconds < 1 ||
    value.humanReview.maxAgeSeconds > 31_536_000
  ) {
    throw new PolicyInvalid("humanReview is invalid");
  }

  let limits: Partial<Record<LimitName, number>> | undefined;
  if (value.limits !== undefined) {
    if (!isObject(value.limits) || Object.keys(value.limits).length === 0) {
      throw new PolicyInvalid("limits must be a non-empty object");
    }
    limits = {};
    for (const [name, raw] of Object.entries(value.limits)) {
      if (!(name in DEFAULT_LIMITS)) {
        throw new PolicyInvalid(`unknown limit ${name}`);
      }
      const limitName = name as LimitName;
      const maximum = DEFAULT_LIMITS[limitName];
      if (
        typeof raw !== "number" ||
        !Number.isInteger(raw) ||
        raw < 1 ||
        raw > maximum
      ) {
        throw new PolicyInvalid(`limit ${name} must be an integer between 1 and ${maximum}`);
      }
      limits[limitName] = raw;
    }
  }

  return {
    trustPolicyVersion: "0.1",
    id: value.id,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
    signature: { mode, minimumValidSigners },
    keys,
    signers,
    checkers,
    profiles,
    requiredChecks: value.requiredChecks as string[],
    requiredDimensions: value.requiredDimensions as DimensionName[],
    humanReview: {
      required: value.humanReview.required,
      maxAgeSeconds: value.humanReview.maxAgeSeconds,
    },
    ...(limits === undefined ? {} : { limits }),
  };
}

function readCheckers(value: unknown): TrustPolicy["checkers"] {
  if (!Array.isArray(value) || value.length > 64) {
    throw new PolicyInvalid("checkers must be an array of at most 64 entries");
  }
  const out: TrustPolicy["checkers"] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!isObject(raw)) throw new PolicyInvalid(`checkers[${index}] must be an object`);
    for (const key of Object.keys(raw)) {
      if (!["id", "version", "implementationDigest"].includes(key)) {
        throw new PolicyInvalid(`unknown checker field ${key}`);
      }
    }
    if (
      typeof raw.id !== "string" ||
      raw.id.length === 0 ||
      raw.id.length > 128 ||
      typeof raw.version !== "string" ||
      raw.version.length === 0 ||
      raw.version.length > 128 ||
      !isDigest(raw.implementationDigest)
    ) {
      throw new PolicyInvalid(`checkers[${index}] is invalid`);
    }
    out.push({ id: raw.id, version: raw.version, implementationDigest: raw.implementationDigest });
  }
  return out;
}

function readProfiles(value: unknown): TrustPolicy["profiles"] {
  if (!Array.isArray(value) || value.length > 64) {
    throw new PolicyInvalid("profiles must be an array of at most 64 entries");
  }
  const out: TrustPolicy["profiles"] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!isObject(raw)) throw new PolicyInvalid(`profiles[${index}] must be an object`);
    for (const key of Object.keys(raw)) {
      if (!["id", "version", "closureDigest"].includes(key)) {
        throw new PolicyInvalid(`unknown profile field ${key}`);
      }
    }
    if (
      typeof raw.id !== "string" ||
      raw.id.length === 0 ||
      raw.id.length > 256 ||
      typeof raw.version !== "string" ||
      raw.version.length === 0 ||
      raw.version.length > 128 ||
      (raw.closureDigest !== undefined && !isDigest(raw.closureDigest))
    ) {
      throw new PolicyInvalid(`profiles[${index}] is invalid`);
    }
    out.push({
      id: raw.id,
      version: raw.version,
      ...(typeof raw.closureDigest === "string" ? { closureDigest: raw.closureDigest } : {}),
    });
  }
  return out;
}

function canonicalBase64UrlDecode(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=";
  const bytes = canonicalBase64Decode(base64);
  if (bytes === null || bytes.length !== 32) return null;
  return bytes;
}
