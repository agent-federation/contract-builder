/**
 * The single strict decode boundary for untrusted PAP input (design note §2 I2).
 *
 * Every raw JSON value crosses exactly one typed decoder:
 * - `decodeTrustPolicy` throws `PolicyInvalid` (invalid operator policy, exit 64);
 * - `decodeManifest` returns a typed manifest plus defects (invalid package input, FAIL);
 * - `decodeClaimFile` returns a typed claim or a classified failure;
 * - `decodeSignatureEnvelope` returns the envelope payload and signatures, or a message.
 *
 * The decoders read values; they never coerce them. A non-string enum, a number
 * where a string is required, or a truthy object is invalid input, never a
 * candidate for `String()`, `||` or a comparison against an unvalidated value.
 */

import { canonicalBase64Decode, isDigest } from "./digest.js";
import { JsonParseError, parseJsonStrict } from "./json.js";
import { pathKey, validateDeclaredPath } from "./paths.js";
import { parseRfc3339 } from "./time.js";
import type { Instant } from "./time.js";
import { DEFAULT_LIMITS } from "./types.js";
import type { JsonObject, JsonValue, DimensionName, LimitName, Limits } from "./types.js";
import type {
  CheckSpec,
  Manifest,
  ManifestArtifact,
  ManifestDefect,
  ManifestInput,
  ManifestSource,
  ManifestValidation,
} from "./manifest.js";
import type { PolicyKey, PolicySigner, TrustPolicy } from "./policy.js";
import type {
  ClaimIssue,
  ClaimParseResult,
  ParsedClaim,
  ProducerReportClaim,
  ProvenanceBinding,
  ProvenanceClaim,
  RelationsClaim,
  ReviewsClaim,
} from "./claims.js";

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

const CHECK_ID = /^pap\.check\.[a-z0-9-]+\/[0-9]+$/;
const VERSION = /^(0|[1-9][0-9]*)$/;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const POLICY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const SIGNATURE_MODES = ["disabled", "optional", "required"] as const;
const KEY_ALGORITHMS = ["ed25519"] as const;
const SIGNER_ROLES = ["producer", "reviewer"] as const;
const NORMALIZATIONS = ["lf", "none"] as const;
const EXTENSION_KINDS = ["profile", "adapter", "renderer", "checker"] as const;
const CLAIM_KINDS = ["provenance", "relations", "producerReport", "reviews"] as const;
const CLAIM_OUTCOMES = ["PASS", "FAIL", "UNSUPPORTED", "NOT_EVALUATED"] as const;
const REVIEW_DECISIONS = ["approved", "rejected"] as const;
const LIMIT_NAMES = Object.keys(DEFAULT_LIMITS) as LimitName[];

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strict membership test: narrows `unknown` to one of the declared literals. */
export function isOneOf<const T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function isEnumArray<const T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T[] {
  return Array.isArray(value) && value.every((item) => isOneOf(item, allowed));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isBooleanValue(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isClaimKind(value: unknown): value is keyof Manifest["claims"] {
  return isOneOf(value, CLAIM_KINDS);
}


// ---------------------------------------------------------------------------
// Trust policy (Appendix B)

export function decodeTrustPolicy(value: JsonObject, defaults: Limits): TrustPolicy {
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
  if (!isOneOf(value.trustPolicyVersion, ["0.1"] as const)) {
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
  if (!isOneOf(value.signature.mode, SIGNATURE_MODES)) {
    throw new PolicyInvalid("signature.mode is invalid");
  }
  const mode = value.signature.mode;
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
      !isOneOf(raw.algorithm, KEY_ALGORITHMS) ||
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
    const signerKeyIds = raw.keyIds;
    const allowedRoles = raw.allowedRoles;
    if (
      !isStringArray(signerKeyIds) ||
      signerKeyIds.length === 0 ||
      signerKeyIds.length > 8 ||
      new Set(signerKeyIds).size !== signerKeyIds.length ||
      signerKeyIds.some((keyId) => !keyIds.has(keyId)) ||
      typeof raw.identity !== "string" ||
      !IDENTITY.test(raw.identity) ||
      !isEnumArray(allowedRoles, SIGNER_ROLES) ||
      allowedRoles.length === 0 ||
      allowedRoles.length > 2 ||
      new Set(allowedRoles).size !== allowedRoles.length
    ) {
      throw new PolicyInvalid(`signers[${index}] is invalid`);
    }
    let allowedPackageIds: string[] | undefined;
    if (raw.allowedPackageIds !== undefined) {
      if (
        !isStringArray(raw.allowedPackageIds) ||
        raw.allowedPackageIds.length === 0 ||
        raw.allowedPackageIds.some((id) => id.length === 0 || id.length > 512)
      ) {
        throw new PolicyInvalid(`signers[${index}].allowedPackageIds is invalid`);
      }
      allowedPackageIds = raw.allowedPackageIds;
    }
    let allowedPackageIdentities: string[] | undefined;
    if (raw.allowedPackageIdentities !== undefined) {
      if (
        !isStringArray(raw.allowedPackageIdentities) ||
        raw.allowedPackageIdentities.length === 0 ||
        raw.allowedPackageIdentities.some((id) => !isDigest(id))
      ) {
        throw new PolicyInvalid(`signers[${index}].allowedPackageIdentities is invalid`);
      }
      allowedPackageIdentities = raw.allowedPackageIdentities;
    }
    for (const keyId of signerKeyIds) {
      if (signerForKeyId.has(keyId)) {
        throw new PolicyInvalid(
          `keyId ${keyId} is enrolled in more than one signer entry`,
        );
      }
      signerForKeyId.set(keyId, index);
    }
    signers.push({
      keyIds: signerKeyIds,
      identity: raw.identity,
      allowedRoles,
      ...(allowedPackageIds === undefined ? {} : { allowedPackageIds }),
      ...(allowedPackageIdentities === undefined ? {} : { allowedPackageIdentities }),
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

  const requiredChecks = value.requiredChecks;
  if (
    !isStringArray(requiredChecks) ||
    requiredChecks.length === 0 ||
    requiredChecks.length > 32 ||
    new Set(requiredChecks).size !== requiredChecks.length ||
    requiredChecks.some((id) => !CHECK_ID.test(id))
  ) {
    throw new PolicyInvalid("requiredChecks is invalid");
  }
  const requiredDimensions = value.requiredDimensions;
  if (
    !isEnumArray(requiredDimensions, DIMENSION_ORDER) ||
    requiredDimensions.length === 0 ||
    requiredDimensions.length > 16 ||
    new Set(requiredDimensions).size !== requiredDimensions.length
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
    !isBooleanValue(value.humanReview.required) ||
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
      if (!isOneOf(name, LIMIT_NAMES)) {
        throw new PolicyInvalid(`unknown limit ${name}`);
      }
      const maximum = DEFAULT_LIMITS[name];
      if (
        typeof raw !== "number" ||
        !Number.isInteger(raw) ||
        raw < 1 ||
        raw > maximum
      ) {
        throw new PolicyInvalid(`limit ${name} must be an integer between 1 and ${maximum}`);
      }
      limits[name] = raw;
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
    requiredChecks,
    requiredDimensions,
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

// ---------------------------------------------------------------------------
// Package manifest (Appendix A)

const TOP_LEVEL = new Set([
  "papVersion",
  "package",
  "subject",
  "build",
  "artifacts",
  "inputs",
  "sources",
  "claims",
  "profile",
  "checkSpecs",
  "extensions",
  "requiredFeatures",
]);

const PAP_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const EXTENSION_KEY = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const FEATURE = /^pap\.[a-z0-9.-]+$/;

export function decodeManifest(value: JsonValue, limits: Limits): ManifestValidation {
  const defects: ManifestDefect[] = [];
  const unsupportedFeatures: string[] = [];
  const unsupportedCriticalExtensions: string[] = [];
  const ignoredExtensions: string[] = [];
  let structural = false;

  const schema = (scope: string, message: string): void => {
    defects.push({ code: "pap.package.schema", scope, message, structural: true });
    structural = true;
  };
  const unknown = (scope: string, message: string): void => {
    defects.push({ code: "pap.package.unknown-field", scope, message, structural: true });
    structural = true;
  };
  const pathInvalid = (scope: string, message: string, artifactLevel: boolean): void => {
    defects.push({ code: "pap.package.path-invalid", scope, message, structural: false, artifactLevel });
  };
  const duplicateId = (scope: string, message: string): void => {
    defects.push({ code: "pap.package.duplicate-id", scope, message, structural: true });
    structural = true;
  };

  if (!isObject(value)) {
    schema("$", "manifest must be a JSON object");
    return emptyValidation(defects, null, null);
  }

  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL.has(key)) {
      unknown(`$.${key}`, `unknown core field ${key}`);
    }
  }

  let papVersion: string | null = null;
  let compat: ManifestValidation["compat"] = null;
  const rawVersion = value.papVersion;
  if (typeof rawVersion !== "string" || !PAP_VERSION.test(rawVersion)) {
    schema("$.papVersion", "papVersion must be a canonical major.minor string");
  } else {
    papVersion = rawVersion;
    if (rawVersion === "0.1") {
      // supported
    } else if (rawVersion.startsWith("0.")) {
      compat = "minor-newer";
    } else {
      compat = "version-unsupported";
    }
  }

  const packageValue = value.package;
  let packageId: string | null = null;
  let pkg: Manifest["package"] | null = null;
  if (!isObject(packageValue)) {
    schema("$.package", "package must be an object");
  } else {
    for (const key of Object.keys(packageValue)) {
      if (!["id", "title", "createdAt", "producer"].includes(key)) {
        unknown(`$.package.${key}`, `unknown package field ${key}`);
      }
    }
    const id = packageValue.id;
    if (typeof id !== "string" || id.length === 0 || id.length > 512) {
      schema("$.package.id", "package.id must be a non-empty string of at most 512 characters");
    } else {
      packageId = id;
      pkg = { id };
      if (packageValue.title !== undefined) {
        if (typeof packageValue.title !== "string" || packageValue.title.length > 512) {
          schema("$.package.title", "package.title must be a string of at most 512 characters");
        } else {
          pkg.title = packageValue.title;
        }
      }
      if (packageValue.createdAt !== undefined) {
        if (typeof packageValue.createdAt !== "string" || parseRfc3339(packageValue.createdAt) === null) {
          schema("$.package.createdAt", "package.createdAt must be an RFC 3339 timestamp");
        } else {
          pkg.createdAt = packageValue.createdAt;
        }
      }
      if (packageValue.producer !== undefined) {
        const producer = packageValue.producer;
        if (!isObject(producer)) {
          schema("$.package.producer", "package.producer must be an object");
        } else {
          for (const key of Object.keys(producer)) {
            if (!["name", "version"].includes(key)) {
              unknown(`$.package.producer.${key}`, `unknown producer field ${key}`);
            }
          }
          if (
            typeof producer.name !== "string" ||
            producer.name.length === 0 ||
            producer.name.length > 256 ||
            typeof producer.version !== "string" ||
            producer.version.length === 0 ||
            producer.version.length > 128
          ) {
            schema("$.package.producer", "producer name/version must be non-empty bounded strings");
          } else {
            pkg.producer = { name: producer.name, version: producer.version };
          }
        }
      }
    }
  }

  let subject: Manifest["subject"];
  if (value.subject !== undefined) {
    const raw = value.subject;
    if (!isObject(raw)) {
      schema("$.subject", "subject must be an object");
    } else {
      for (const key of Object.keys(raw)) {
        if (!["projectId", "revision"].includes(key)) {
          unknown(`$.subject.${key}`, `unknown subject field ${key}`);
        }
      }
      if (typeof raw.projectId !== "string" || raw.projectId.length === 0 || raw.projectId.length > 512) {
        schema("$.subject.projectId", "subject.projectId must be a non-empty bounded string");
      } else {
        subject = { projectId: raw.projectId };
        if (raw.revision !== undefined) {
          if (typeof raw.revision !== "string" || raw.revision.length > 256) {
            schema("$.subject.revision", "subject.revision must be a bounded string");
          } else {
            subject.revision = raw.revision;
          }
        }
      }
    }
  }

  let build: Manifest["build"];
  if (value.build !== undefined) {
    const raw = value.build;
    if (!isObject(raw)) {
      schema("$.build", "build must be an object");
    } else {
      for (const key of Object.keys(raw)) {
        if (!["engineVersion", "manifestVersion", "inputDigest", "normalizedInputDigest", "extensions"].includes(key)) {
          unknown(`$.build.${key}`, `unknown build field ${key}`);
        }
      }
      build = {};
      for (const key of ["engineVersion", "manifestVersion"] as const) {
        const field = raw[key];
        if (field !== undefined) {
          const max = key === "engineVersion" ? 128 : 64;
          if (typeof field !== "string" || field.length === 0 || field.length > max) {
            schema(`$.build.${key}`, `${key} must be a non-empty bounded string`);
          } else {
            build[key] = field;
          }
        }
      }
      for (const key of ["inputDigest", "normalizedInputDigest"] as const) {
        const field = raw[key];
        if (field !== undefined) {
          if (!isDigest(field)) {
            schema(`$.build.${key}`, `${key} must be a sha256 digest`);
          } else {
            build[key] = field;
          }
        }
      }
      if (raw.extensions !== undefined) {
        if (!Array.isArray(raw.extensions)) {
          schema("$.build.extensions", "build.extensions must be an array");
        } else {
          const extensions: NonNullable<Manifest["build"]>["extensions"] = [];
          for (let index = 0; index < raw.extensions.length; index += 1) {
            const entry = raw.extensions[index];
            const scope = `$.build.extensions[${index}]`;
            if (!isObject(entry)) {
              schema(scope, "build extension entry must be an object");
              continue;
            }
            for (const key of Object.keys(entry)) {
              if (!["kind", "id", "version"].includes(key)) {
                unknown(`${scope}.${key}`, `unknown build extension field ${key}`);
              }
            }
            if (
              !isOneOf(entry.kind, EXTENSION_KINDS) ||
              typeof entry.id !== "string" ||
              entry.id.length === 0 ||
              entry.id.length > 256 ||
              typeof entry.version !== "string" ||
              entry.version.length === 0 ||
              entry.version.length > 128
            ) {
              schema(scope, "build extension must be a kind/id/version record");
              continue;
            }
            extensions.push({ kind: entry.kind, id: entry.id, version: entry.version });
          }
          build.extensions = extensions;
        }
      }
    }
  }

  const artifacts: ManifestArtifact[] = [];
  let artifactsUsable = true;
  if (!Array.isArray(value.artifacts)) {
    schema("$.artifacts", "artifacts must be a non-empty array");
    artifactsUsable = false;
  } else if (value.artifacts.length === 0) {
    schema("$.artifacts", "at least one artifact is required");
    artifactsUsable = false;
  } else {
    for (let index = 0; index < value.artifacts.length; index += 1) {
      const raw = value.artifacts[index];
      const scope = `$.artifacts[${index}]`;
      if (!isObject(raw)) {
        schema(scope, "artifact entry must be an object");
        artifactsUsable = false;
        continue;
      }
      for (const key of Object.keys(raw)) {
        if (!["id", "path", "mediaType", "bytes", "digest"].includes(key)) {
          unknown(`${scope}.${key}`, `unknown artifact field ${key}`);
          artifactsUsable = false;
        }
      }
      if (
        typeof raw.id !== "string" ||
        raw.id.length === 0 ||
        raw.id.length > 256 ||
        typeof raw.path !== "string" ||
        typeof raw.mediaType !== "string" ||
        raw.mediaType.length === 0 ||
        raw.mediaType.length > 256 ||
        typeof raw.bytes !== "number" ||
        !Number.isSafeInteger(raw.bytes) ||
        raw.bytes < 0 ||
        !isDigest(raw.digest)
      ) {
        schema(scope, "artifact must carry id/path/mediaType/bytes/digest with valid types");
        artifactsUsable = false;
        continue;
      }
      const pathCheck = validateDeclaredPath(raw.path, limits);
      if (!pathCheck.ok) {
        pathInvalid(`${scope}.path`, `artifact path violates the package path grammar: ${raw.path}`, true);
      } else if (!raw.path.startsWith("artifacts/")) {
        pathInvalid(`${scope}.path`, "artifact path must start with artifacts/", true);
      }
      artifacts.push({
        id: raw.id,
        path: raw.path,
        mediaType: raw.mediaType,
        bytes: raw.bytes,
        digest: raw.digest,
      });
    }
  }

  const inputs: ManifestInput[] = [];
  if (value.inputs !== undefined) {
    if (!Array.isArray(value.inputs)) {
      schema("$.inputs", "inputs must be an array");
      artifactsUsable = false;
    } else {
      for (let index = 0; index < value.inputs.length; index += 1) {
        const raw = value.inputs[index];
        const scope = `$.inputs[${index}]`;
        if (!isObject(raw)) {
          schema(scope, "input entry must be an object");
          continue;
        }
        for (const key of Object.keys(raw)) {
          if (!["id", "path", "mediaType", "digest", "normalization"].includes(key)) {
            unknown(`${scope}.${key}`, `unknown input field ${key}`);
          }
        }
        if (
          typeof raw.id !== "string" ||
          raw.id.length === 0 ||
          raw.id.length > 256 ||
          typeof raw.path !== "string" ||
          typeof raw.mediaType !== "string" ||
          raw.mediaType.length === 0 ||
          raw.mediaType.length > 256 ||
          !isDigest(raw.digest) ||
          !isOneOf(raw.normalization, NORMALIZATIONS)
        ) {
          schema(scope, "input must carry id/path/mediaType/digest/normalization");
          continue;
        }
        const pathCheck = validateDeclaredPath(raw.path, limits);
        if (!pathCheck.ok) {
          pathInvalid(`${scope}.path`, `input path violates the package path grammar: ${raw.path}`, false);
        } else if (!raw.path.startsWith("inputs/")) {
          pathInvalid(`${scope}.path`, "input path must start with inputs/", false);
        }
        inputs.push({
          id: raw.id,
          path: raw.path,
          mediaType: raw.mediaType,
          digest: raw.digest,
          normalization: raw.normalization,
        });
      }
    }
  }

  const sources: ManifestSource[] = [];
  if (value.sources !== undefined) {
    if (!Array.isArray(value.sources)) {
      schema("$.sources", "sources must be an array");
    } else {
      for (let index = 0; index < value.sources.length; index += 1) {
        const raw = value.sources[index];
        const scope = `$.sources[${index}]`;
        if (!isObject(raw)) {
          schema(scope, "source entry must be an object");
          continue;
        }
        for (const key of Object.keys(raw)) {
          if (!["id", "path", "mediaType", "digest", "acquiredAt", "acquisition"].includes(key)) {
            unknown(`${scope}.${key}`, `unknown source field ${key}`);
          }
        }
        if (
          typeof raw.id !== "string" ||
          raw.id.length === 0 ||
          raw.id.length > 256 ||
          typeof raw.mediaType !== "string" ||
          raw.mediaType.length === 0 ||
          raw.mediaType.length > 256 ||
          !isDigest(raw.digest)
        ) {
          schema(scope, "source must carry id/mediaType/digest");
          continue;
        }
        const source: ManifestSource = {
          id: raw.id,
          mediaType: raw.mediaType,
          digest: raw.digest,
        };
        if (raw.path !== undefined) {
          if (typeof raw.path !== "string") {
            schema(`${scope}.path`, "source path must be a string");
          } else {
            const pathCheck = validateDeclaredPath(raw.path, limits);
            if (!pathCheck.ok) {
              pathInvalid(`${scope}.path`, `source path violates the package path grammar: ${raw.path}`, false);
            } else if (!raw.path.startsWith("sources/")) {
              pathInvalid(`${scope}.path`, "source path must start with sources/", false);
            } else {
              source.path = raw.path;
            }
          }
        }
        if (raw.acquiredAt !== undefined) {
          if (typeof raw.acquiredAt !== "string" || parseRfc3339(raw.acquiredAt) === null) {
            schema(`${scope}.acquiredAt`, "source acquiredAt must be an RFC 3339 timestamp");
          } else {
            source.acquiredAt = raw.acquiredAt;
          }
        }
        if (raw.acquisition !== undefined) {
          const acquisition = raw.acquisition;
          if (!isObject(acquisition)) {
            schema(`${scope}.acquisition`, "source acquisition must be an object");
          } else {
            for (const key of Object.keys(acquisition)) {
              if (!["method", "uri", "revision"].includes(key)) {
                unknown(`${scope}.acquisition.${key}`, `unknown acquisition field ${key}`);
              }
            }
            if (
              typeof acquisition.method !== "string" ||
              acquisition.method.length === 0 ||
              acquisition.method.length > 128 ||
              (acquisition.uri !== undefined &&
                (typeof acquisition.uri !== "string" || acquisition.uri.length > 2048)) ||
              (acquisition.revision !== undefined &&
                (typeof acquisition.revision !== "string" || acquisition.revision.length > 512))
            ) {
              schema(`${scope}.acquisition`, "source acquisition must carry a valid method");
            } else {
              source.acquisition = { method: acquisition.method };
              if (typeof acquisition.uri === "string") source.acquisition.uri = acquisition.uri;
              if (typeof acquisition.revision === "string") source.acquisition.revision = acquisition.revision;
            }
          }
        }
        sources.push(source);
      }
    }
  }

  const claims: Manifest["claims"] = {};
  if (value.claims !== undefined) {
    if (!isObject(value.claims)) {
      schema("$.claims", "claims must be an object");
    } else {
      for (const key of Object.keys(value.claims)) {
        if (!isClaimKind(key)) {
          unknown(`$.claims.${key}`, `unknown claim kind ${key}`);
          continue;
        }
        const raw = value.claims[key];
        const scope = `$.claims.${key}`;
        if (!isObject(raw)) {
          schema(scope, "claim reference must be an object");
          continue;
        }
        for (const field of Object.keys(raw)) {
          if (!["path", "digest"].includes(field)) {
            unknown(`${scope}.${field}`, `unknown claim reference field ${field}`);
          }
        }
        if (typeof raw.path !== "string" || !isDigest(raw.digest)) {
          schema(scope, "claim reference must carry path and digest");
          continue;
        }
        const pathCheck = validateDeclaredPath(raw.path, limits);
        if (!pathCheck.ok) {
          pathInvalid(`${scope}.path`, `claim path violates the package path grammar: ${raw.path}`, false);
        } else if (!raw.path.startsWith("claims/")) {
          pathInvalid(`${scope}.path`, "claim path must start with claims/", false);
        }
        claims[key] = { path: raw.path, digest: raw.digest };
      }
    }
  }

  let profile: Manifest["profile"];
  if (value.profile !== undefined) {
    const raw = value.profile;
    if (!isObject(raw)) {
      schema("$.profile", "profile must be an object");
    } else {
      for (const key of Object.keys(raw)) {
        if (!["id", "version", "closureDigest"].includes(key)) {
          unknown(`$.profile.${key}`, `unknown profile field ${key}`);
        }
      }
      if (
        typeof raw.id !== "string" ||
        raw.id.length === 0 ||
        raw.id.length > 256 ||
        typeof raw.version !== "string" ||
        raw.version.length === 0 ||
        raw.version.length > 128
      ) {
        schema("$.profile", "profile must carry id and version");
      } else {
        profile = { id: raw.id, version: raw.version };
        if (raw.closureDigest !== undefined) {
          if (!isDigest(raw.closureDigest)) {
            schema("$.profile.closureDigest", "profile.closureDigest must be a sha256 digest");
          } else {
            profile.closureDigest = raw.closureDigest;
          }
        }
      }
    }
  }

  const checkSpecs: CheckSpec[] = [];
  if (!Array.isArray(value.checkSpecs)) {
    schema("$.checkSpecs", "checkSpecs must be a non-empty array");
  } else if (value.checkSpecs.length === 0) {
    schema("$.checkSpecs", "at least one check specification is required");
  } else {
    for (let index = 0; index < value.checkSpecs.length; index += 1) {
      const raw = value.checkSpecs[index];
      const scope = `$.checkSpecs[${index}]`;
      if (!isObject(raw)) {
        schema(scope, "check specification must be an object");
        continue;
      }
      for (const key of Object.keys(raw)) {
        if (!["id", "version", "required"].includes(key)) {
          unknown(`${scope}.${key}`, `unknown check specification field ${key}`);
        }
      }
      if (typeof raw.id !== "string" || !CHECK_ID.test(raw.id)) {
        schema(`${scope}.id`, "check id must match pap.check.<name>/<version>");
        continue;
      }
      if (typeof raw.version !== "string" || !VERSION.test(raw.version)) {
        schema(`${scope}.version`, "check version must be a canonical integer string");
        continue;
      }
      const suffix = raw.id.slice(raw.id.lastIndexOf("/") + 1);
      if (suffix !== raw.version) {
        schema(`${scope}.version`, "checkSpecs version must equal the id suffix");
        continue;
      }
      if (raw.required !== undefined && !isBooleanValue(raw.required)) {
        schema(`${scope}.required`, "check required must be a boolean");
        continue;
      }
      checkSpecs.push({
        id: raw.id,
        version: raw.version,
        required: raw.required === undefined ? true : raw.required,
      });
    }
  }

  const extensions: Manifest["extensions"] = {};
  if (value.extensions !== undefined) {
    if (!isObject(value.extensions)) {
      schema("$.extensions", "extensions must be an object");
    } else {
      for (const [key, raw] of Object.entries(value.extensions)) {
        const scope = `$.extensions.${key}`;
        if (!EXTENSION_KEY.test(key)) {
          schema(scope, "extension key must be a reverse-DNS name");
          continue;
        }
        if (!isObject(raw)) {
          schema(scope, "extension must be an object");
          continue;
        }
        for (const field of Object.keys(raw)) {
          if (!["version", "critical", "data"].includes(field)) {
            unknown(`${scope}.${field}`, `unknown extension field ${field}`);
          }
        }
        if (
          typeof raw.version !== "string" ||
          raw.version.length === 0 ||
          raw.version.length > 128 ||
          typeof raw.critical !== "boolean" ||
          (raw.data !== undefined && !isObject(raw.data))
        ) {
          schema(scope, "extension must carry version and critical");
          continue;
        }
        extensions[key] = { version: raw.version, critical: raw.critical };
        if (isObject(raw.data)) {
          extensions[key].data = raw.data;
        }
        if (raw.critical === true) {
          unsupportedCriticalExtensions.push(key);
        } else {
          ignoredExtensions.push(key);
        }
      }
    }
  }

  const requiredFeatures: string[] = [];
  if (value.requiredFeatures !== undefined) {
    if (!Array.isArray(value.requiredFeatures)) {
      schema("$.requiredFeatures", "requiredFeatures must be an array");
    } else {
      const seen = new Set<string>();
      for (let index = 0; index < value.requiredFeatures.length; index += 1) {
        const feature = value.requiredFeatures[index];
        if (typeof feature !== "string" || !FEATURE.test(feature)) {
          schema(`$.requiredFeatures[${index}]`, "required feature must match pap.<name>");
          continue;
        }
        if (seen.has(feature)) {
          schema(`$.requiredFeatures[${index}]`, "required feature must be unique");
          continue;
        }
        seen.add(feature);
        requiredFeatures.push(feature);
        unsupportedFeatures.push(feature);
      }
    }
  }

  // Cross-field invariants.
  const ids = new Map<string, string>();
  const addId = (kind: string, id: string, scope: string): void => {
    const key = `${kind}:${id}`;
    if (ids.has(key)) {
      duplicateId(scope, `duplicate ${kind} id ${id}`);
    } else {
      ids.set(key, scope);
    }
  };
  for (const artifact of artifacts) addId("artifact", artifact.id, "$.artifacts");
  for (const input of inputs) addId("input", input.id, "$.inputs");
  for (const source of sources) addId("source", source.id, "$.sources");
  const checkIds = new Set<string>();
  for (const spec of checkSpecs) {
    if (checkIds.has(spec.id)) {
      duplicateId("$.checkSpecs", `duplicate check id ${spec.id}`);
    }
    checkIds.add(spec.id);
  }

  const declaredPaths = new Map<string, { scope: string; artifactLevel: boolean }>();
  const addPath = (declared: string, scope: string, artifactLevel: boolean): void => {
    if (declared.split("/").at(-1)?.toLowerCase() === "assurance-package.json") {
      defects.push({
        code: "pap.package.manifest-self-reference",
        scope,
        message: "the manifest must not declare itself as a payload",
        structural: true,
      });
      structural = true;
      return;
    }
    const key = pathKey(declared);
    const previous = declaredPaths.get(key);
    if (previous !== undefined) {
      defects.push({
        code: "pap.package.path-duplicate",
        scope,
        message: `declared path duplicates ${previous.scope} modulo case: ${declared}`,
        structural: false,
        artifactLevel: artifactLevel || previous.artifactLevel,
      });
    } else {
      declaredPaths.set(key, { scope, artifactLevel });
    }
  };
  for (const artifact of artifacts) addPath(artifact.path, "$.artifacts", true);
  for (const input of inputs) addPath(input.path, "$.inputs", false);
  for (const source of sources) {
    if (source.path !== undefined) addPath(source.path, "$.sources", false);
  }
  for (const [kind, ref] of Object.entries(claims)) {
    if (ref !== undefined) addPath(ref.path, `$.claims.${kind}`, false);
  }

  const manifest: Manifest | null =
    pkg !== null && papVersion !== null && Array.isArray(value.artifacts) && Array.isArray(value.checkSpecs)
      ? {
          papVersion,
          package: pkg,
          ...(subject === undefined ? {} : { subject }),
          ...(build === undefined ? {} : { build }),
          artifacts,
          inputs,
          sources,
          claims,
          ...(profile === undefined ? {} : { profile }),
          checkSpecs,
          extensions,
          requiredFeatures,
        }
      : null;

  return {
    manifest,
    defects,
    payloadsUsable: !structural && artifactsUsable,
    papVersion,
    compat,
    unsupportedFeatures,
    unsupportedCriticalExtensions,
    ignoredExtensions,
    loweredLimits: {},
    checkSpecs,
  };
}

function emptyValidation(
  defects: ManifestDefect[],
  manifest: null,
  papVersion: null,
): ManifestValidation {
  return {
    manifest,
    defects,
    payloadsUsable: false,
    papVersion,
    compat: null,
    unsupportedFeatures: [],
    unsupportedCriticalExtensions: [],
    ignoredExtensions: [],
    loweredLimits: {},
    checkSpecs: [],
  };
}


// ---------------------------------------------------------------------------
// Claim files (Appendix D)

export function decodeClaimFile(
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
  if (typeof version !== "string") {
    return { ok: false, failure: "invalid", message: "claim file papClaimsVersion must be a string" };
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
      !isOneOf(locator.kind, ["byte-range"] as const) ||
      typeof locator.start !== "number" ||
      !Number.isSafeInteger(locator.start) ||
      locator.start < 0 ||
      typeof locator.end !== "number" ||
      !Number.isSafeInteger(locator.end) ||
      locator.end < 0 ||
      !isOneOf(quote.normalization, ["none"] as const) ||
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
    const bad = allowedOnly(raw, ["checkId", "checkVersion", "claimedOutcome", "checkedAt", "checker"], scope);
    if (bad !== null) {
      if (raw.outcome !== undefined || raw.witnesses !== undefined) {
        return { ok: false, failure: "invalid", message: `${scope} mimics a verifier check record` };
      }
      return fail(bad);
    }
    const checkId = raw.checkId;
    const checkVersion = raw.checkVersion;
    const claimedOutcome = raw.claimedOutcome;
    const checkedAt = raw.checkedAt;
    if (
      typeof checkId !== "string" ||
      !CHECK_ID.test(checkId) ||
      typeof checkVersion !== "string" ||
      !VERSION.test(checkVersion) ||
      !isOneOf(claimedOutcome, CLAIM_OUTCOMES)
    ) {
      return fail(`${scope} is invalid`);
    }
    if (checkVersion !== checkId.slice(checkId.lastIndexOf("/") + 1)) {
      return fail(`${scope}.checkVersion does not match the checkId suffix`);
    }
    if (seen.has(checkId)) {
      return fail(`${scope}.checkId is duplicated`);
    }
    seen.add(checkId);
    if (checkedAt !== undefined) {
      if (typeof checkedAt !== "string" || parseRfc3339(checkedAt) === null) {
        return fail(`${scope}.checkedAt is not RFC 3339`);
      }
    }
    let checker: ProducerReportClaim["claims"][number]["checker"];
    const rawChecker = raw.checker;
    if (rawChecker !== undefined) {
      if (!isObject(rawChecker)) return fail(`${scope}.checker must be an object`);
      if (allowedOnly(rawChecker, ["id", "version", "implementationDigest"], `${scope}.checker`) !== null) {
        return fail(`${scope}.checker has unknown fields`);
      }
      const checkerId = rawChecker.id;
      const checkerVersion = rawChecker.version;
      const implementationDigest = rawChecker.implementationDigest;
      if (
        typeof checkerId !== "string" ||
        checkerId.length === 0 ||
        checkerId.length > 256 ||
        typeof checkerVersion !== "string" ||
        checkerVersion.length === 0 ||
        checkerVersion.length > 128 ||
        !isDigest(implementationDigest)
      ) {
        return fail(`${scope}.checker is invalid`);
      }
      checker = {
        id: checkerId,
        version: checkerVersion,
        implementationDigest,
      };
    }
    claims.push({
      checkId,
      checkVersion,
      claimedOutcome,
      ...(checkedAt === undefined ? {} : { checkedAt }),
      ...(checker === undefined ? {} : { checker }),
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
    const approvalId = raw.id;
    const decision = raw.decision;
    const decidedAt = raw.decidedAt;
    const reviewer = raw.reviewer;
    if (
      typeof approvalId !== "string" ||
      approvalId.length === 0 ||
      approvalId.length > 256 ||
      !isObject(reviewer) ||
      !isOneOf(decision, REVIEW_DECISIONS) ||
      typeof decidedAt !== "string" ||
      parseRfc3339(decidedAt) === null
    ) {
      return fail(`${scope} is invalid`);
    }
    if (seen.has(approvalId)) return fail(`${scope}.id is duplicated`);
    seen.add(approvalId);
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
      reviewScope = {};
      if (packageId !== undefined) {
        if (typeof packageId !== "string" || packageId.length === 0 || packageId.length > 512) {
          return fail(`${scope}.scope is invalid`);
        }
        reviewScope.packageId = packageId;
      }
      if (artifacts !== undefined) {
        if (!isStringArray(artifacts) || artifacts.some((item) => item.length === 0 || item.length > 256)) {
          return fail(`${scope}.scope is invalid`);
        }
        reviewScope.artifacts = artifacts;
      }
      if (packageIdentity !== undefined) {
        if (!isDigest(packageIdentity)) return fail(`${scope}.scope is invalid`);
        reviewScope.packageIdentity = packageIdentity;
      }
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
      id: approvalId,
      reviewer: {
        identity: reviewer.identity,
        ...(typeof reviewer.keyId === "string" ? { keyId: reviewer.keyId } : {}),
      },
      decision,
      decidedAt,
      ...(reviewScope === undefined ? {} : { scope: reviewScope }),
      ...(evidence === undefined ? {} : { evidence }),
    });
  }
  return { ok: true, claim: { kind: "reviews", approvals }, issues: [] };
}

// ---------------------------------------------------------------------------
// Signature envelopes (RFC §11.2)

export interface EnvelopeSignature {
  keyId: string;
  sig: Uint8Array;
}

export type EnvelopeDecode =
  | {
      ok: true;
      payloadType: string;
      payload: Uint8Array;
      signatures: EnvelopeSignature[];
    }
  | { ok: false; message: string };

export function decodeSignatureEnvelope(value: JsonValue): EnvelopeDecode {
  if (!isObject(value)) {
    return { ok: false, message: "envelope must be a JSON object" };
  }
  for (const key of Object.keys(value)) {
    if (!["payloadType", "payload", "signatures"].includes(key)) {
      return { ok: false, message: `unknown envelope field ${key}` };
    }
  }
  if (
    typeof value.payloadType !== "string" ||
    typeof value.payload !== "string" ||
    !Array.isArray(value.signatures) ||
    value.signatures.length === 0
  ) {
    return { ok: false, message: "envelope is missing payloadType, payload or signatures" };
  }
  const payload = canonicalBase64Decode(value.payload);
  if (payload === null) return { ok: false, message: "envelope payload is not canonical base64" };
  const signatures: EnvelopeSignature[] = [];
  for (let index = 0; index < value.signatures.length; index += 1) {
    const raw = value.signatures[index];
    if (!isObject(raw)) {
      return { ok: false, message: `signatures[${index}] must be an object` };
    }
    for (const key of Object.keys(raw)) {
      if (!["keyid", "sig"].includes(key)) {
        return { ok: false, message: `unknown signature field ${key}` };
      }
    }
    if (typeof raw.keyid !== "string" || typeof raw.sig !== "string") {
      return { ok: false, message: `signatures[${index}] must carry keyid and sig` };
    }
    const sig = canonicalBase64Decode(raw.sig);
    if (sig === null || sig.length !== 64) {
      return { ok: false, message: `signatures[${index}].sig must be 64 canonical base64 bytes` };
    }
    signatures.push({ keyId: raw.keyid, sig });
  }
  return { ok: true, payloadType: value.payloadType, payload, signatures };
}
