/**
 * Appendix A manifest types.
 *
 * The strict decoder that produces these values lives in `decode.ts`, the
 * single boundary for untrusted package input. JSON Schema cannot express the
 * path-grammar precedence, duplicate-path rule, id uniqueness or the checkSpecs
 * version suffix, so validation is explicit there. Unknown core fields are
 * always rejected (PAP D5).
 */

import type { JsonObject, LimitName } from "./types.js";

export interface ManifestArtifact {
  id: string;
  path: string;
  mediaType: string;
  bytes: number;
  digest: string;
}

export interface ManifestInput {
  id: string;
  path: string;
  mediaType: string;
  digest: string;
  normalization: "lf" | "none";
}

export interface ManifestSource {
  id: string;
  path?: string;
  mediaType: string;
  digest: string;
  acquiredAt?: string;
  acquisition?: { method: string; uri?: string; revision?: string };
}

export interface ClaimRef {
  path: string;
  digest: string;
}

export interface CheckSpec {
  id: string;
  version: string;
  required: boolean;
}

export interface Manifest {
  papVersion: string;
  package: {
    id: string;
    title?: string;
    createdAt?: string;
    producer?: { name: string; version: string };
  };
  subject?: { projectId: string; revision?: string };
  build?: {
    engineVersion?: string;
    manifestVersion?: string;
    inputDigest?: string;
    normalizedInputDigest?: string;
    extensions?: { kind: string; id: string; version: string }[];
  };
  artifacts: ManifestArtifact[];
  inputs: ManifestInput[];
  sources: ManifestSource[];
  claims: Partial<Record<"provenance" | "relations" | "producerReport" | "reviews", ClaimRef>>;
  profile?: { id: string; version: string; closureDigest?: string };
  checkSpecs: CheckSpec[];
  extensions: Record<string, { version: string; critical: boolean; data?: JsonObject }>;
  requiredFeatures: string[];
}

export interface ManifestDefect {
  code:
    | "pap.package.schema"
    | "pap.package.unknown-field"
    | "pap.package.path-invalid"
    | "pap.package.path-duplicate"
    | "pap.package.duplicate-id"
    | "pap.package.manifest-self-reference";
  scope: string;
  message: string;
  /** Structural defects make declared payloads unusable. */
  structural: boolean;
  /** Path-level defects fail the affected artifact declarations. */
  artifactLevel?: boolean;
}

export interface ManifestValidation {
  /** Typed manifest when the top-level shape is readable; otherwise null. */
  manifest: Manifest | null;
  defects: ManifestDefect[];
  /** False when declarations cannot be trusted; payloads are not read. */
  payloadsUsable: boolean;
  papVersion: string | null;
  compat: "minor-newer" | "version-unsupported" | null;
  unsupportedFeatures: string[];
  unsupportedCriticalExtensions: string[];
  ignoredExtensions: string[];
  loweredLimits: Partial<Record<LimitName, number>>;
  /** Salvaged declared check specs even when the manifest is otherwise invalid. */
  checkSpecs: CheckSpec[];
}
