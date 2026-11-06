/**
 * CORE-000 -> PAP v0.1 package mapping and the RFC §5 digest helpers.
 *
 * This module is producer-side: it turns the bytes of a CORE-000 draft build
 * into the PAP package layout and manifest. It deliberately implements the PAP
 * domains and framing from the RFC (Appendix E is the test oracle) instead of
 * reusing the engine's build-identity helpers, which use different domains and
 * envelope rules. `pap/` must never import this module.
 */

import { createHash } from "node:crypto";

const encoder = new TextEncoder();

/** PAP v0.1 is SHA-256 only; every digest is `sha256:` plus lowercase hex. */
export type Digest = string;

export interface ExtensionIdentity {
  readonly kind: "profile" | "adapter" | "renderer" | "checker";
  readonly id: string;
  readonly version: string;
}

/** The producer claim taken from the engine's `BuildIdentity`. */
export interface BuildClaim {
  readonly engineVersion: string;
  readonly manifestVersion: string;
  /** The engine's build digest. A producer claim; the verifier never recomputes it. */
  readonly inputDigest: Digest;
  readonly extensions: readonly ExtensionIdentity[];
}

export interface AcquisitionClaim {
  readonly method: string;
  readonly uri?: string;
  readonly revision?: string;
}

export interface ArtifactPayload {
  readonly id: string;
  /** Package-relative path under `artifacts/`. */
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface InputPayload {
  readonly id: string;
  /** Package-relative path under `inputs/`. */
  readonly path: string;
  readonly mediaType: string;
  /** Raw build-input bytes; mapping applies the RFC §5.6 LF rule. */
  readonly bytes: Uint8Array;
}

export interface SourcePayload {
  readonly id: string;
  /** Package-relative path under `sources/`. */
  readonly path: string;
  readonly mediaType: string;
  /** Raw source bytes; never normalized. */
  readonly bytes: Uint8Array;
  readonly acquisition?: AcquisitionClaim;
}

/** Stable labels, not identities: PAP computes `packageIdentity` from the manifest. */
export interface PackageDeclaration {
  readonly id: string;
  readonly title: string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly subject: { readonly projectId: string; readonly revision?: string };
  readonly profile: { readonly id: string; readonly version: string };
}

export interface MappingInput {
  readonly artifact: ArtifactPayload;
  readonly inputs: readonly InputPayload[];
  readonly source: SourcePayload;
  readonly build: BuildClaim;
  readonly declaration: PackageDeclaration;
}

export interface ManifestArtifact {
  readonly id: string;
  readonly path: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly digest: Digest;
}

export interface ManifestInput {
  readonly id: string;
  readonly path: string;
  readonly mediaType: string;
  readonly digest: Digest;
  readonly normalization: "lf";
}

export interface ManifestSource {
  readonly id: string;
  readonly path: string;
  readonly mediaType: string;
  readonly digest: Digest;
  readonly acquisition?: AcquisitionClaim;
}

export interface CheckSpec {
  readonly id: string;
  readonly version: string;
  readonly required: boolean;
}

/** The three PAP checks required for CORE-000 (design note §3). */
export const CORE000_CHECK_SPECS: readonly CheckSpec[] = [
  { id: "pap.check.digest-integrity/1", version: "1", required: true },
  { id: "pap.check.source-quote/1", version: "1", required: true },
  { id: "pap.check.relation-consistency/1", version: "1", required: true },
] as const;

export interface PackageManifest {
  readonly papVersion: "0.1";
  readonly package: {
    readonly id: string;
    readonly title: string;
    readonly producer: { readonly name: string; readonly version: string };
  };
  readonly subject: { readonly projectId: string; readonly revision?: string };
  readonly build: {
    readonly engineVersion: string;
    readonly manifestVersion: string;
    readonly inputDigest: Digest;
    readonly normalizedInputDigest: Digest;
    readonly extensions: readonly ExtensionIdentity[];
  };
  readonly artifacts: readonly ManifestArtifact[];
  readonly inputs: readonly ManifestInput[];
  readonly sources: readonly ManifestSource[];
  readonly profile: { readonly id: string; readonly version: string };
  readonly checkSpecs: readonly CheckSpec[];
  /** C1 packages no claims; the field is absent, not an empty object. */
  readonly claims?: never;
}

export interface PackageFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface PackagePlan {
  readonly manifest: PackageManifest;
  /** Every package file, including `assurance-package.json`, sorted by path. */
  readonly files: readonly PackageFile[];
  readonly normalizedInputDigest: Digest;
}

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

/** H(domain, octets) = SHA-256(ASCII(domain) || 0x00 || octets). */
export function domainHash(domain: string, bytes: Uint8Array): string {
  const hash = createHash("sha256");
  hash.update(utf8(domain));
  hash.update(new Uint8Array([0]));
  hash.update(bytes);
  return `sha256:${hash.digest("hex")}`;
}

function u32be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error("framing length outside u32");
  }
  const out = new Uint8Array(4);
  out[0] = (value >>> 24) & 0xff;
  out[1] = (value >>> 16) & 0xff;
  out[2] = (value >>> 8) & 0xff;
  out[3] = value & 0xff;
  return out;
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * record := u32be tagLength, tag, u32be partCount, partCount × (u32be len, part)
 *
 * This is the PAP §5.2 framing, repeated from the RFC rather than imported from
 * the engine or the verifier.
 */
export function frameRecord(
  tag: string,
  parts: readonly (string | Uint8Array)[],
): Uint8Array {
  const tagBytes = utf8(tag);
  const chunks: Uint8Array[] = [u32be(tagBytes.length), tagBytes, u32be(parts.length)];
  for (const part of parts) {
    const bytes = typeof part === "string" ? utf8(part) : part;
    chunks.push(u32be(bytes.length), bytes);
  }
  return concatBytes(chunks);
}

export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const left = a[index] as number;
    const right = b[index] as number;
    if (left !== right) return left - right;
  }
  return a.length - b.length;
}

export function artifactDigest(bytes: Uint8Array): Digest {
  return domainHash("pap.artifact.v1", bytes);
}

export function rawSourceDigest(bytes: Uint8Array): Digest {
  return domainHash("pap.source.raw.v1", bytes);
}

/**
 * LF normalization for declared build inputs (RFC §5.6): NUL or invalid UTF-8
 * falls back to the raw bytes; otherwise CRLF and lone CR become LF.
 */
export function normalizeLf(bytes: Uint8Array): Uint8Array {
  if (bytes.includes(0)) return bytes;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return bytes;
  }
  return utf8(text.replace(/\r\n?/g, "\n"));
}

export function inputFileDigest(path: string, normalizedBytes: Uint8Array): Digest {
  return domainHash("pap.input.file.v1", frameRecord("input", [path, normalizedBytes]));
}

export function normalizedInputSetDigest(
  entries: readonly { readonly path: string; readonly bytes: Uint8Array }[],
): Digest {
  const sorted = [...entries].sort((a, b) => compareBytes(utf8(a.path), utf8(b.path)));
  return domainHash(
    "pap.input.set.v1",
    concatBytes(sorted.map((entry) => frameRecord("input", [entry.path, entry.bytes]))),
  );
}

function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * RFC 8785 JCS over the I-JSON subset used by a PAP manifest: sorted object
 * members, no whitespace, integer numbers only, no undefined values.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isSafeInteger(value)) {
        throw new Error(`JCS only admits safe integers, got ${String(value)}`);
      }
      return String(value);
    case "boolean":
      return value ? "true" : "false";
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
      }
      const object = value as Record<string, unknown>;
      const keys = Object.keys(object).sort(compareUtf16);
      const members = keys.map((key) => {
        const member = object[key];
        if (member === undefined) {
          throw new Error(`JCS cannot serialize undefined member ${JSON.stringify(key)}`);
        }
        return `${JSON.stringify(key)}:${canonicalJson(member)}`;
      });
      return `{${members.join(",")}}`;
    }
    default:
      throw new Error(`JCS cannot serialize ${typeof value}`);
  }
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return utf8(canonicalJson(value));
}

function requirePrefix(path: string, prefix: string, field: string): void {
  if (!path.startsWith(prefix)) {
    throw new Error(`${field} must start with ${prefix}: ${path}`);
  }
}

function requireUnique(paths: readonly string[]): void {
  const seen = new Set<string>();
  for (const path of paths) {
    const key = path.toLowerCase();
    if (seen.has(key)) throw new Error(`duplicate package path: ${path}`);
    seen.add(key);
  }
}

/**
 * Map one CORE-000 build's bytes into the C1 package: artifact, three inputs,
 * one source, the build claim and the three required checks. No claims are
 * produced in C1.
 */
export function mapCore000Package(input: MappingInput): PackagePlan {
  const artifactPath = input.artifact.path;
  requirePrefix(artifactPath, "artifacts/", "artifact path");

  const normalizedInputs = [...input.inputs]
    .map((payload) => {
      requirePrefix(payload.path, "inputs/", "input path");
      const normalized = normalizeLf(payload.bytes);
      return {
        payload,
        normalized,
        digest: inputFileDigest(payload.path, normalized),
      };
    })
    .sort((a, b) => compareBytes(utf8(a.payload.path), utf8(b.payload.path)));

  const source = input.source;
  requirePrefix(source.path, "sources/", "source path");

  requireUnique([
    artifactPath,
    ...normalizedInputs.map((entry) => entry.payload.path),
    source.path,
  ]);

  const normalizedInputDigest = normalizedInputSetDigest(
    normalizedInputs.map((entry) => ({
      path: entry.payload.path,
      bytes: entry.normalized,
    })),
  );

  const manifest: PackageManifest = {
    papVersion: "0.1",
    package: {
      id: input.declaration.id,
      title: input.declaration.title,
      producer: {
        name: input.declaration.producer.name,
        version: input.declaration.producer.version,
      },
    },
    subject: {
      projectId: input.declaration.subject.projectId,
      ...(input.declaration.subject.revision === undefined
        ? {}
        : { revision: input.declaration.subject.revision }),
    },
    build: {
      engineVersion: input.build.engineVersion,
      manifestVersion: input.build.manifestVersion,
      inputDigest: input.build.inputDigest,
      normalizedInputDigest,
      extensions: [...input.build.extensions].sort((a, b) => {
        const kind = compareUtf16(a.kind, b.kind);
        if (kind !== 0) return kind;
        const id = compareUtf16(a.id, b.id);
        return id !== 0 ? id : compareUtf16(a.version, b.version);
      }),
    },
    artifacts: [
      {
        id: input.artifact.id,
        path: artifactPath,
        mediaType: input.artifact.mediaType,
        bytes: input.artifact.bytes.length,
        digest: artifactDigest(input.artifact.bytes),
      },
    ],
    inputs: normalizedInputs.map((entry) => ({
      id: entry.payload.id,
      path: entry.payload.path,
      mediaType: entry.payload.mediaType,
      digest: entry.digest,
      normalization: "lf" as const,
    })),
    sources: [
      {
        id: source.id,
        path: source.path,
        mediaType: source.mediaType,
        digest: rawSourceDigest(source.bytes),
        ...(source.acquisition === undefined ? {} : { acquisition: source.acquisition }),
      },
    ],
    profile: {
      id: input.declaration.profile.id,
      version: input.declaration.profile.version,
    },
    checkSpecs: CORE000_CHECK_SPECS.map((spec) => ({ ...spec })),
  };

  const manifestBytes = concatBytes([canonicalJsonBytes(manifest), utf8("\n")]);
  const files: PackageFile[] = [
    { path: "assurance-package.json", bytes: manifestBytes },
    { path: artifactPath, bytes: input.artifact.bytes },
    ...normalizedInputs.map((entry) => ({
      path: entry.payload.path,
      bytes: entry.normalized,
    })),
    { path: source.path, bytes: source.bytes },
  ].sort((a, b) => compareBytes(utf8(a.path), utf8(b.path)));

  return { manifest, files, normalizedInputDigest };
}
