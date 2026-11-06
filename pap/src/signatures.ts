/**
 * Optional DSSE/Ed25519 adapter (RFC §11.2).
 *
 * Envelopes are discovered by convention under `signatures/`, are package data,
 * and never grant authority: cryptographic validity and policy authorization
 * are reported separately.
 */

import { opendir } from "node:fs/promises";
import path from "node:path";
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { canonicalBase64Decode, utf8 } from "./digest.js";
import { JsonParseError, parseJsonStrict } from "./json.js";
import { isObject } from "./manifest.js";
import { readPackageFile } from "./paths.js";
import type { PackageRoot } from "./paths.js";
import type { TrustPolicy } from "./policy.js";
import type { Diagnostic, Limits, SignatureEntry } from "./types.js";

const ENVELOPE_NAME = /^[A-Za-z0-9._-]+\.dsse\.json$/;
const PAYLOAD_TYPE = "application/vnd.pap.manifest.v0.1+json";

export interface SignatureEvaluation {
  validity: "VALID" | "INVALID" | "NOT_EVALUATED" | "NOT_APPLICABLE";
  entries: SignatureEntry[];
  signerIdentity:
    | "TRUSTED"
    | "UNTRUSTED"
    | "UNKNOWN"
    | "NOT_EVALUATED"
    | "NOT_APPLICABLE";
  policyDecision: "ACCEPTED" | "REJECTED" | "STALE" | "NOT_EVALUATED";
  envelopeLimitHit: boolean;
  discoveryFailure: boolean;
  diagnostics: Diagnostic[];
}

interface EnvelopeSignature {
  keyId: string;
  sig: Uint8Array;
}

interface ParsedEnvelope {
  signatures: EnvelopeSignature[];
}

export async function evaluateSignatures(options: {
  root: PackageRoot;
  canonicalManifest: Uint8Array;
  policy: TrustPolicy | undefined;
  policyFresh: boolean;
  packageId: string;
  packageIdentity: string;
  mode: "disabled" | "optional" | "required";
  limits: Limits;
}): Promise<SignatureEvaluation> {
  const diagnostics: Diagnostic[] = [];
  const entries: SignatureEntry[] = [];
  const authorizationStates = new Map<string, "TRUSTED" | "UNTRUSTED" | "UNKNOWN">();
  const validSignerIndexes = new Set<number>();
  const signerIndexByKeyId = new Map<string, number>();
  if (options.policy !== undefined) {
    options.policy.signers.forEach((signer, index) => {
      for (const keyId of signer.keyIds) signerIndexByKeyId.set(keyId, index);
    });
  }
  const empty = (): SignatureEvaluation => ({
    validity: options.mode === "disabled" ? "NOT_APPLICABLE" : "NOT_APPLICABLE",
    entries,
    signerIdentity: "NOT_APPLICABLE",
    policyDecision: "NOT_EVALUATED",
    envelopeLimitHit: false,
    discoveryFailure: false,
    diagnostics,
  });
  if (options.mode === "disabled") {
    return empty();
  }

  const discovered = await discoverEnvelopes(options.root, options.limits);
  if (discovered.error !== null) {
    diagnostics.push({
      code: "pap.package.io",
      severity: "error",
      scope: "signatures",
      message: discovered.error,
    });
  }
  if (discovered.limitHit || discovered.names.length > options.limits.signatureEnvelopes) {
    diagnostics.push({
      code: "pap.package.limit-exceeded",
      severity: "error",
      scope: "signatures",
      message: "signature envelope count exceeds the configured limit",
    });
    return {
      validity: "NOT_EVALUATED",
      entries,
      signerIdentity: "NOT_EVALUATED",
      policyDecision: "NOT_EVALUATED",
      envelopeLimitHit: true,
      discoveryFailure: false,
      diagnostics,
    };
  }

  let envelopeLimitHit = false;
  for (const relative of discovered.names) {
    const read = await readPackageFile(
      options.root,
      relative,
      options.limits,
      Math.min(options.limits.jsonStringBytes, options.limits.fileBytes),
    );
    if (!read.ok || read.bytes === undefined) {
      // RFC §4.3.4 / errata E1: a byte or JSON limit is the verifier's safety
      // boundary, not a producer defect. Only a structural read failure keeps
      // the envelope-invalid/INVALID path.
      if (read.failure === "limit") {
        envelopeLimitHit = true;
        entries.push({
          path: relative,
          validity: "NOT_EVALUATED",
          signerIdentity: "NOT_EVALUATED",
          policyDecision: "NOT_EVALUATED",
        });
        diagnostics.push({
          code: "pap.package.limit-exceeded",
          severity: "error",
          scope: relative,
          message: read.message ?? "signature envelope exceeds a configured resource limit",
        });
        continue;
      }
      entries.push({
        path: relative,
        validity: "INVALID",
        signerIdentity: "NOT_EVALUATED",
        policyDecision: "REJECTED",
      });
      diagnostics.push({
        code: "pap.signature.envelope-invalid",
        severity: "error",
        scope: relative,
        message: read.message ?? "envelope is not readable",
      });
      continue;
    }
    const parsed = parseEnvelope(relative, read.bytes, options.limits);
    if (!parsed.ok) {
      if (parsed.limit) envelopeLimitHit = true;
      entries.push({
        path: relative,
        validity: parsed.validity,
        signerIdentity: parsed.signerIdentity,
        policyDecision: parsed.policyDecision,
      });
      diagnostics.push({
        code: parsed.code,
        severity: parsed.code === "pap.signature.unsupported-format" ? "warning" : "error",
        scope: relative,
        message: parsed.message,
      });
      continue;
    }
    if (parsed.payloadType !== PAYLOAD_TYPE) {
      entries.push({
        path: relative,
        validity: "NOT_EVALUATED",
        signerIdentity: "NOT_EVALUATED",
        policyDecision: "NOT_EVALUATED",
      });
      diagnostics.push({
        code: "pap.signature.unsupported-format",
        severity: "warning",
        scope: relative,
        message: `unsupported payloadType ${parsed.payloadType}`,
      });
      continue;
    }
    if (!sameBytes(parsed.payload, options.canonicalManifest)) {
      entries.push({
        path: relative,
        validity: "INVALID",
        signerIdentity: "NOT_EVALUATED",
        policyDecision: "REJECTED",
      });
      diagnostics.push({
        code: "pap.signature.payload-mismatch",
        severity: "error",
        scope: relative,
        message: "envelope payload is not the canonical manifest",
      });
      continue;
    }

    const pae = paeBytes(PAYLOAD_TYPE, parsed.payload);
    for (const signature of parsed.signatures) {
      const keyId = signature.keyId;
      const entry: SignatureEntry = {
        path: relative,
        ...(keyId === "" ? {} : { keyId }),
        algorithm: "ed25519",
        validity: "NOT_EVALUATED",
        signerIdentity: "NOT_EVALUATED",
        policyDecision: "NOT_EVALUATED",
      };
      if (keyId === "") {
        diagnostics.push({
          code: "pap.signature.keyid-missing",
          severity: "warning",
          scope: relative,
          message: "signature entry has no usable keyId",
        });
        entry.signerIdentity = "UNKNOWN";
        entry.policyDecision = "REJECTED";
        entries.push(entry);
        continue;
      }
      if (options.policy === undefined) {
        diagnostics.push({
          code: "pap.trust.policy-absent",
          severity: "info",
          scope: relative,
          message: "no trust policy was supplied; signatures cannot be evaluated",
        });
        entries.push(entry);
        continue;
      }
      const key = options.policy.keys.find((candidate) => candidate.keyId === keyId);
      if (key === undefined) {
        diagnostics.push({
          code: "pap.trust.signer-unknown",
          severity: "warning",
          scope: relative,
          message: `keyId ${keyId} is not in the trust policy`,
        });
        authorizationStates.set(keyId, "UNKNOWN");
        entry.signerIdentity = "UNKNOWN";
        entry.policyDecision = "REJECTED";
        entries.push(entry);
        continue;
      }
      const cryptographic = verifyEd25519(key.publicKey, pae, signature.sig);
      entry.validity = cryptographic ? "VALID" : "INVALID";
      const authorization = authorizeSigner(
        options.policy,
        keyId,
        options.packageId,
        options.packageIdentity,
        "producer",
      );
      authorizationStates.set(keyId, authorization.state);
      if (!cryptographic) {
        diagnostics.push({
          code: "pap.signature.invalid",
          severity: "error",
          scope: relative,
          message: `signature by ${keyId} does not verify`,
        });
        entry.signerIdentity = "NOT_EVALUATED";
        entry.policyDecision = "REJECTED";
      } else if (authorization.state === "UNTRUSTED") {
        diagnostics.push({
          code: authorization.code,
          severity: "warning",
          scope: relative,
          message: `key ${keyId} is not authorized for this package and role`,
        });
        entry.signerIdentity = "UNTRUSTED";
        entry.policyDecision = "REJECTED";
      } else if (authorization.state === "UNKNOWN") {
        diagnostics.push({
          code: "pap.trust.signer-unknown",
          severity: "warning",
          scope: relative,
          message: `key ${keyId} is not mapped by any signer entry`,
        });
        entry.signerIdentity = "UNKNOWN";
        entry.policyDecision = "REJECTED";
      } else {
        entry.signerIdentity = "TRUSTED";
        entry.policyDecision = "ACCEPTED";
        if (cryptographic) {
          const signerIndex = signerIndexByKeyId.get(keyId);
          if (signerIndex !== undefined) validSignerIndexes.add(signerIndex);
        }
      }
      entries.push(entry);
    }
  }

  const byKey = new Map<string, number>();
  for (const entry of entries) {
    if (entry.keyId === undefined) continue;
    byKey.set(entry.keyId, (byKey.get(entry.keyId) ?? 0) + 1);
  }
  for (const [keyId, count] of byKey) {
    if (count > 1) {
      diagnostics.push({
        code: "pap.signature.duplicate-signer",
        severity: "warning",
        scope: "signatures",
        message: `keyId ${keyId} appears in more than one signature`,
      });
    }
  }

  // RFC §4.3.4 / errata E1 with §11.5 aggregation: a resource limit stops only
  // the affected envelope, so the aggregate dimensions come from the entries
  // that were evaluated. The `envelopeLimitHit` flag still caps the verdict at
  // INCOMPLETE through the report's `limitStopped` context; it must not mask
  // another envelope's evaluated INVALID/REJECTED/VALID outcome. The count-limit
  // path above is the only override: there the verifier read no envelope at all
  // and returns NOT_EVALUATED directly.
  const validity = aggregateValidity(entries, options.mode);
  const signerIdentity = aggregateSignerIdentity(entries, options.policy, authorizationStates);
  const policyDecision =
    options.policy === undefined
      ? "NOT_EVALUATED"
      : aggregatePolicyDecision(
          entries,
          options.policy,
          options.mode,
          options.policyFresh,
          validSignerIndexes,
        );

  return {
    validity,
    entries,
    signerIdentity:
      options.policy === undefined && entries.length > 0 ? "NOT_EVALUATED" : signerIdentity,
    policyDecision,
    envelopeLimitHit,
    discoveryFailure: discovered.error !== null,
    diagnostics,
  };
}

interface EnvelopeDiscovery {
  names: string[];
  limitHit: boolean;
  error: string | null;
}

async function discoverEnvelopes(root: PackageRoot, limits: Limits): Promise<EnvelopeDiscovery> {
  const directory = path.join(root.real, "signatures");
  const names: string[] = [];
  let directoryHandle;
  try {
    directoryHandle = await opendir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { names, limitHit: false, error: null };
    }
    return { names, limitHit: false, error: "cannot read the signatures directory" };
  }
  try {
    let entries = 0;
    const maxEntries = Math.max(1_024, limits.payloadFiles * 2);
    for await (const entry of directoryHandle) {
      entries += 1;
      if (entries > maxEntries) {
        return { names: [], limitHit: true, error: null };
      }
      if (entry.isFile() && ENVELOPE_NAME.test(entry.name)) {
        names.push(`signatures/${entry.name}`);
        if (names.length > limits.signatureEnvelopes) {
          return { names: [], limitHit: true, error: null };
        }
      }
    }
  } catch {
    return { names, limitHit: false, error: "cannot enumerate the signatures directory" };
  }
  names.sort();
  return { names, limitHit: false, error: null };
}

type Parsed =
  | {
      ok: true;
      payloadType: string;
      payload: Uint8Array;
      signatures: EnvelopeSignature[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      validity: "INVALID" | "NOT_EVALUATED";
      signerIdentity: SignatureEntry["signerIdentity"];
      policyDecision: SignatureEntry["policyDecision"];
      limit: boolean;
    };

function parseEnvelope(relative: string, bytes: Uint8Array, limits: Limits): Parsed {
  let value;
  try {
    value = parseJsonStrict(bytes, {
      nesting: limits.jsonNesting,
      stringBytes: limits.jsonStringBytes,
    });
  } catch (error) {
    if (error instanceof JsonParseError && error.failure === "limit") {
      return limited(error.message);
    }
    return invalid(error instanceof JsonParseError ? error.message : "envelope is not valid JSON");
  }
  if (!isObject(value)) return invalid("envelope must be a JSON object");
  for (const key of Object.keys(value)) {
    if (!["payloadType", "payload", "signatures"].includes(key)) {
      return invalid(`unknown envelope field ${key}`);
    }
  }
  if (
    typeof value.payloadType !== "string" ||
    typeof value.payload !== "string" ||
    !Array.isArray(value.signatures) ||
    value.signatures.length === 0
  ) {
    return invalid("envelope is missing payloadType, payload or signatures");
  }
  const payload = canonicalBase64Decode(value.payload);
  if (payload === null) return invalid("envelope payload is not canonical base64");
  const signatures: EnvelopeSignature[] = [];
  for (let index = 0; index < value.signatures.length; index += 1) {
    const raw = value.signatures[index];
    if (!isObject(raw)) return invalid(`signatures[${index}] must be an object`);
    for (const key of Object.keys(raw)) {
      if (!["keyid", "sig"].includes(key)) {
        return invalid(`unknown signature field ${key}`);
      }
    }
    if (typeof raw.keyid !== "string" || typeof raw.sig !== "string") {
      return invalid(`signatures[${index}] must carry keyid and sig`);
    }
    const sig = canonicalBase64Decode(raw.sig);
    if (sig === null || sig.length !== 64) {
      return invalid(`signatures[${index}].sig must be 64 canonical base64 bytes`);
    }
    signatures.push({ keyId: raw.keyid, sig });
  }
  return {
    ok: true,
    payloadType: value.payloadType,
    payload,
    signatures,
  };
}

function invalid(message: string): Parsed {
  return {
    ok: false,
    code: "pap.signature.envelope-invalid",
    message,
    validity: "INVALID",
    signerIdentity: "NOT_EVALUATED",
    policyDecision: "REJECTED",
    limit: false,
  };
}

function limited(message: string): Parsed {
  return {
    ok: false,
    code: "pap.package.limit-exceeded",
    message,
    validity: "NOT_EVALUATED",
    signerIdentity: "NOT_EVALUATED",
    policyDecision: "NOT_EVALUATED",
    limit: true,
  };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

export function paeBytes(payloadType: string, payload: Uint8Array): Uint8Array {
  const prefix = utf8(`DSSEv1 ${payloadType.length} ${payloadType} ${payload.length} `);
  const out = new Uint8Array(prefix.length + payload.length);
  out.set(prefix, 0);
  out.set(payload, prefix.length);
  return out;
}

function verifyEd25519(publicKeyBase64Url: string, message: Uint8Array, signature: Uint8Array): boolean {
  if (signature.length !== 64) return false;
  const s = littleEndianBigInt(signature.subarray(32, 64));
  const L = 7237005577332262213973186563042994240857116359379907606001950938285454250989n;
  if (s >= L) return false;
  try {
    const raw = Buffer.from(publicKeyBase64Url.replace(/-/g, "+").replace(/_/g, "/") + "=", "base64");
    if (raw.length !== 32) return false;
    const prefix = Buffer.from("302a300506032b6570032100", "hex");
    const key = createPublicKey({ key: Buffer.concat([prefix, raw]), format: "der", type: "spki" });
    return cryptoVerify(null, message, key, signature);
  } catch {
    return false;
  }
}

function littleEndianBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index] as number);
  }
  return value;
}

function authorizeSigner(
  policy: TrustPolicy,
  keyId: string,
  packageId: string,
  packageIdentity: string,
  role: "producer" | "reviewer",
): { state: "TRUSTED" | "UNTRUSTED" | "UNKNOWN"; code: string } {
  const mapped = policy.signers.filter((signer) => signer.keyIds.includes(keyId));
  if (mapped.length === 0) {
    return { state: "UNKNOWN", code: "pap.trust.signer-unknown" };
  }
  let sawPackageBindingFailure = false;
  for (const signer of mapped) {
    if (!signer.allowedRoles.includes(role)) continue;
    if (
      signer.allowedPackageIds !== undefined &&
      !signer.allowedPackageIds.includes(packageId)
    ) {
      sawPackageBindingFailure = true;
      continue;
    }
    if (
      signer.allowedPackageIdentities !== undefined &&
      !signer.allowedPackageIdentities.includes(packageIdentity)
    ) {
      sawPackageBindingFailure = true;
      continue;
    }
    return { state: "TRUSTED", code: "" };
  }
  if (sawPackageBindingFailure) {
    return { state: "UNTRUSTED", code: "pap.trust.package-not-allowed" };
  }
  return { state: "UNTRUSTED", code: "pap.trust.signer-untrusted" };
}

function aggregateValidity(
  entries: SignatureEntry[],
  mode: "disabled" | "optional" | "required",
): SignatureEvaluation["validity"] {
  if (mode === "disabled") return "NOT_APPLICABLE";
  if (entries.length === 0) return mode === "required" ? "NOT_EVALUATED" : "NOT_APPLICABLE";
  if (mode === "required") {
    if (entries.some((entry) => entry.validity === "INVALID")) return "INVALID";
    if (entries.some((entry) => entry.validity === "VALID")) return "VALID";
    return "NOT_EVALUATED";
  }
  if (entries.some((entry) => entry.validity === "VALID")) return "VALID";
  return "NOT_EVALUATED";
}

function aggregateSignerIdentity(
  entries: SignatureEntry[],
  policy: TrustPolicy | undefined,
  authorizationStates: Map<string, "TRUSTED" | "UNTRUSTED" | "UNKNOWN">,
): SignatureEvaluation["signerIdentity"] {
  if (entries.length === 0) return "NOT_APPLICABLE";
  if (policy === undefined) return "NOT_EVALUATED";
  const states = [...authorizationStates.values()];
  if (states.includes("UNTRUSTED")) return "UNTRUSTED";
  if (states.includes("UNKNOWN")) return "UNKNOWN";
  if (states.length > 0 && states.every((state) => state === "TRUSTED")) {
    // A failed signature does not remove the key's authorization: the
    // per-entry status is NOT_EVALUATED, but the signer is still recognized.
    return "TRUSTED";
  }
  return "NOT_EVALUATED";
}

function aggregatePolicyDecision(
  entries: SignatureEntry[],
  policy: TrustPolicy | undefined,
  mode: "disabled" | "optional" | "required",
  policyFresh: boolean,
  validSignerIndexes: Set<number>,
): SignatureEvaluation["policyDecision"] {
  if (policy === undefined) return "NOT_EVALUATED";
  if (!policyFresh) return "STALE";
  if (entries.length === 0) return "NOT_EVALUATED";
  if (entries.some((entry) => entry.policyDecision === "REJECTED")) return "REJECTED";
  if (mode === "required") {
    if (validSignerIndexes.size < policy.signature.minimumValidSigners) return "NOT_EVALUATED";
    return "ACCEPTED";
  }
  if (validSignerIndexes.size > 0) return "ACCEPTED";
  return "NOT_EVALUATED";
}
