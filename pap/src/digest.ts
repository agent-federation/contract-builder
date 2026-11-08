/**
 * PAP v0.1 domain-separated SHA-256 identities and length-prefixed framing.
 *
 * H(domain, octets) = SHA-256(ASCII(domain) || 0x00 || octets)
 */

import { createHash } from "node:crypto";

export type FramingPart = string | Uint8Array;

const encoder = new TextEncoder();

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface DomainHasher {
  update(bytes: Uint8Array): void;
  digest(): string;
}

export function createDomainHasher(domain: string): DomainHasher {
  const hash = createHash("sha256");
  hash.update(encoder.encode(domain));
  hash.update(new Uint8Array([0]));
  return {
    update(bytes: Uint8Array): void {
      hash.update(bytes);
    },
    digest(): string {
      return `sha256:${hash.digest("hex")}`;
    },
  };
}

export function domainHash(domain: string, bytes: Uint8Array): string {
  const hasher = createDomainHasher(domain);
  hasher.update(bytes);
  return hasher.digest();
}

export function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
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

function partBytes(part: FramingPart): Uint8Array {
  return typeof part === "string" ? encoder.encode(part) : part;
}

/** record := u32be tagLength, tag, u32be partCount, partCount × (u32be len, part) */
export function frameRecord(tag: string, parts: FramingPart[]): Uint8Array {
  const tagBytes = encoder.encode(tag);
  const chunks: Uint8Array[] = [u32be(tagBytes.length), tagBytes, u32be(parts.length)];
  for (const part of parts) {
    const bytes = partBytes(part);
    chunks.push(u32be(bytes.length), bytes);
  }
  return concatBytes(chunks);
}

/**
 * Prefix of one framed record whose final part is streamed after the prefix.
 * `parts` are the parts before the streamed part; the streamed part's length is
 * supplied up front.
 */
export function framePrefix(tag: string, parts: string[], finalPartLength: number): Uint8Array {
  const tagBytes = encoder.encode(tag);
  const chunks: Uint8Array[] = [u32be(tagBytes.length), tagBytes, u32be(parts.length + 1)];
  for (const part of parts) {
    const bytes = encoder.encode(part);
    chunks.push(u32be(bytes.length), bytes);
  }
  chunks.push(u32be(finalPartLength));
  return concatBytes(chunks);
}

export function frameRecords(records: { tag: string; parts: FramingPart[] }[]): Uint8Array {
  return concatBytes(records.map((record) => frameRecord(record.tag, record.parts)));
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

/**
 * LF normalization used for declared build inputs (RFC §4.5.1, §5.6):
 * binary fallback when the bytes contain NUL or are not valid UTF-8; otherwise
 * CRLF and lone CR become LF.
 */
export function normalizeLf(bytes: Uint8Array): Uint8Array {
  if (bytes.includes(0)) {
    return bytes;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return bytes;
  }
  return encoder.encode(text.replace(/\r\n?/g, "\n"));
}

export function normalizeInput(bytes: Uint8Array, normalization: "lf" | "none"): Uint8Array {
  return normalization === "lf" ? normalizeLf(bytes) : bytes;
}

export function inputFileDigest(path: string, normalizedBytes: Uint8Array): string {
  return domainHash("pap.input.file.v1", frameRecord("input", [path, normalizedBytes]));
}

export function normalizedInputSetDigest(entries: { path: string; bytes: Uint8Array }[]): string {
  const sorted = [...entries].sort((a, b) => compareBytes(utf8(a.path), utf8(b.path)));
  const framed = frameRecords(
    sorted.map((entry) => ({ tag: "input", parts: [entry.path, entry.bytes] })),
  );
  return domainHash("pap.input.set.v1", framed);
}

export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] as number;
    const right = b[i] as number;
    if (left !== right) {
      return left - right;
    }
  }
  return a.length - b.length;
}

export function extensionClosureDigest(
  kind: "profile" | "extension" | "checker",
  id: string,
  version: string,
  files: { path: string; bytes: Uint8Array }[],
  dependencies: { name: string; version: string; integrity: string }[],
): string {
  const records: { tag: string; parts: FramingPart[] }[] = [
    { tag: "extension", parts: [kind, id, version] },
  ];
  const sortedFiles = [...files].sort((a, b) => compareBytes(utf8(a.path), utf8(b.path)));
  for (const file of sortedFiles) {
    records.push({ tag: "file", parts: [file.path, normalizeLf(file.bytes)] });
  }
  const sortedDeps = [...dependencies].sort((a, b) => {
    const byName = compareBytes(utf8(a.name), utf8(b.name));
    return byName !== 0 ? byName : compareBytes(utf8(a.version), utf8(b.version));
  });
  for (const dependency of sortedDeps) {
    records.push({
      tag: "dependency",
      parts: [dependency.name, dependency.version, dependency.integrity],
    });
  }
  return domainHash("pap.extension.closure.v1", frameRecords(records));
}

/**
 * Canonical standard base64 (RFC 4648 §4) with padding. Returns null for
 * non-canonical or malformed encodings (whitespace, missing/extra padding,
 * non-standard alphabet, non-zero trailing bits).
 */
export function canonicalBase64Decode(value: string): Uint8Array | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    return null;
  }
  return new Uint8Array(bytes);
}

export function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
