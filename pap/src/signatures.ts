/**
 * Optional DSSE/Ed25519 adapter (RFC §11.2).
 *
 * Envelopes are discovered by convention under `signatures/`, are package data,
 * and never grant authority: cryptographic validity and policy authorization
 * are reported separately.
 */

import { opendir } from "node:fs/promises";
import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { compareBytes, utf8 } from "./digest.js";
import { decodeSignatureEnvelope } from "./decode.js";
import type { EnvelopeSignature } from "./decode.js";
import { JsonParseError, parseJsonStrict } from "./json.js";
import { readPackageFile, resolvePackageDirectory } from "./paths.js";
import type { DirectoryOpener, PackageRoot } from "./paths.js";
import type { TrustPolicy } from "./policy.js";
import type { Diagnostic, Limits, SignatureEntry } from "./types.js";

const ENVELOPE_NAME = /^[A-Za-z0-9._-]+\.dsse\.json$/;
const PAYLOAD_TYPE = "application/vnd.pap.manifest.v0.1+json";

export interface SignatureEvaluation {
  validity: "VALID" | "INVALID" | "NOT_EVALUATED" | "NOT_APPLICABLE";
  entries: SignatureEntry[];
  signerIdentity: "TRUSTED" | "UNTRUSTED" | "UNKNOWN" | "NOT_EVALUATED" | "NOT_APPLICABLE";
  policyDecision: "ACCEPTED" | "REJECTED" | "STALE" | "NOT_EVALUATED";
  envelopeLimitHit: boolean;
  /** A path-safety or structural discovery failure: a package-scope failure. */
  discoveryFailure: boolean;
  /**
   * An ordinary I/O/enumeration failure while listing `signatures/`. It affects
   * only the undeclared-file scan (RFC §4.3.3), never `integrity.package`, and
   * the caller reports the single canonical scan-incomplete condition.
   */
  scanIncomplete: boolean;
  /**
   * True when the envelope-count limit stopped discovery before the verifier
   * read any envelope. The signature scope is then NOT_EVALUATED rather than
   * legitimately absent; callers must not infer this from `entries.length`.
   */
  readNone: boolean;
  diagnostics: Diagnostic[];
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
  /** Filesystem seam used by tests to inject deterministic enumeration failures. */
  openDirectory?: DirectoryOpener;
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
    validity: "NOT_APPLICABLE",
    entries,
    signerIdentity: "NOT_APPLICABLE",
    policyDecision: "NOT_EVALUATED",
    envelopeLimitHit: false,
    discoveryFailure: false,
    scanIncomplete: false,
    readNone: false,
    diagnostics,
  });
  if (options.mode === "disabled") {
    return empty();
  }

  const discovered = await discoverEnvelopes(
    options.root,
    options.limits,
    options.openDirectory ?? opendir,
  );
  // RFC §4.3.3: an ordinary enumeration failure of `signatures/` is the
  // scan-incomplete condition (the caller emits its one canonical diagnostic),
  // not a package I/O failure. Path-safety and structural failures stay
  // package-scope errors.
  if (discovered.error !== null && !discovered.scanIncomplete) {
    diagnostics.push({
      code: discovered.errorCode ?? "pap.package.io",
      severity: "error",
      scope: "signatures",
      message: discovered.error,
    });
  }
  if (discovered.limitHit) {
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
      scanIncomplete: false,
      readNone: true,
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
          message: `signature envelope exceeds the configured byte limit: ${relative}`,
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

  // RFC §9.9 fixes the report order as `path` then `keyId`. Discovery already
  // sorts envelope paths, but one envelope may carry several signatures in
  // producer order, so sort the assembled entries once. An entry with a
  // missing or empty `keyId` has no key to compare and sorts last at its path;
  // entries that tie completely keep their producer order (stable sort).
  entries.sort(compareSignatureEntries);

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
    discoveryFailure: discovered.error !== null && !discovered.scanIncomplete,
    scanIncomplete: discovered.scanIncomplete,
    readNone: false,
    diagnostics,
  };
}

/**
 * RFC §9.9 order for `dimensions.signature.signatures[]`: `path` then `keyId`,
 * both in UTF-8 byte order. A missing or empty `keyId` has no key to compare
 * and sorts after every named key at the same path.
 */
function compareSignatureEntries(a: SignatureEntry, b: SignatureEntry): number {
  const byPath = compareBytes(utf8(a.path), utf8(b.path));
  if (byPath !== 0) return byPath;
  if (a.keyId === undefined || a.keyId === "") {
    return b.keyId === undefined || b.keyId === "" ? 0 : 1;
  }
  if (b.keyId === undefined || b.keyId === "") return -1;
  return compareBytes(utf8(a.keyId), utf8(b.keyId));
}

interface EnvelopeDiscovery {
  names: string[];
  /** The declared §11.2 envelope-count limit stopped discovery. */
  limitHit: boolean;
  error: string | null;
  errorCode?: "pap.package.symlink" | "pap.package.path-escape";
  /** An ordinary I/O/enumeration failure, mapped to scan-incomplete. */
  scanIncomplete: boolean;
}

async function discoverEnvelopes(
  root: PackageRoot,
  limits: Limits,
  openDirectory: DirectoryOpener,
): Promise<EnvelopeDiscovery> {
  const resolved = await resolvePackageDirectory(root, "signatures");
  if (!resolved.ok) {
    if (resolved.failure === "missing") {
      return { names: [], limitHit: false, error: null, scanIncomplete: false };
    }
    return {
      names: [],
      limitHit: false,
      error: resolved.message,
      // A path-safety failure or a non-directory `signatures/` entry stays a
      // package failure; an ordinary stat/resolve I/O failure is scan-incomplete.
      scanIncomplete: resolved.failure === "io",
      ...(resolved.failure === "symlink"
        ? { errorCode: "pap.package.symlink" as const }
        : resolved.failure === "path-escape"
          ? { errorCode: "pap.package.path-escape" as const }
          : {}),
    };
  }
  const names: string[] = [];
  let directoryHandle;
  try {
    directoryHandle = await openDirectory(resolved.absolute);
  } catch {
    return {
      names,
      limitHit: false,
      error: "cannot read the signatures directory",
      scanIncomplete: true,
    };
  }
  try {
    let entries = 0;
    const maxEntries = Math.max(1_024, limits.payloadFiles * 2);
    for await (const entry of directoryHandle) {
      entries += 1;
      if (entries > maxEntries) {
        // RFC §4.3.3: this is a private robustness budget, not a §4.3.4 limit.
        // Stop discovery and let the caller report the canonical
        // scan-incomplete condition; only the declared envelope-count limit
        // below is `pap.package.limit-exceeded`.
        return { names: [], limitHit: false, error: null, scanIncomplete: true };
      }
      if (entry.isFile() && ENVELOPE_NAME.test(entry.name)) {
        names.push(`signatures/${entry.name}`);
        if (names.length > limits.signatureEnvelopes) {
          // Enforced before discovery returns, so an over-limit `names` array
          // can never reach `evaluateSignatures` without `limitHit`.
          return { names: [], limitHit: true, error: null, scanIncomplete: false };
        }
      }
    }
  } catch {
    return {
      names,
      limitHit: false,
      error: "cannot enumerate the signatures directory",
      scanIncomplete: true,
    };
  }
  names.sort();
  return { names, limitHit: false, error: null, scanIncomplete: false };
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
  const decoded = decodeSignatureEnvelope(value);
  if (!decoded.ok) return invalid(decoded.message);
  return {
    ok: true,
    payloadType: decoded.payloadType,
    payload: decoded.payload,
    signatures: decoded.signatures,
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

function verifyEd25519(
  publicKeyBase64Url: string,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  if (signature.length !== 64) return false;
  const s = littleEndianBigInt(signature.subarray(32, 64));
  const L = 7237005577332262213973186563042994240857116359379907606001950938285454250989n;
  if (s >= L) return false;
  try {
    const raw = Buffer.from(
      publicKeyBase64Url.replace(/-/g, "+").replace(/_/g, "/") + "=",
      "base64",
    );
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
    if (signer.allowedPackageIds !== undefined && !signer.allowedPackageIds.includes(packageId)) {
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
