/**
 * Appendix A manifest validation and cross-field invariants.
 *
 * JSON Schema cannot express the path-grammar precedence, duplicate-path rule,
 * id uniqueness or the checkSpecs version suffix, so validation is explicit.
 * Unknown core fields are always rejected (PAP D5).
 */

import { isDigest } from "./digest.js";
import { parseRfc3339 } from "./time.js";
import { pathKey, validateDeclaredPath } from "./paths.js";
import type { JsonObject, JsonValue, LimitName, Limits } from "./types.js";

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

const CHECK_ID = /^pap\.check\.[a-z0-9-]+\/[0-9]+$/;
const VERSION = /^(0|[1-9][0-9]*)$/;
const PAP_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const EXTENSION_KEY = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const FEATURE = /^pap\.[a-z0-9.-]+$/;

export function validateManifest(value: JsonValue, limits: Limits): ManifestValidation {
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
              typeof entry.kind !== "string" ||
              !["profile", "adapter", "renderer", "checker"].includes(entry.kind) ||
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
          (raw.normalization !== "lf" && raw.normalization !== "none")
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
        if (!["provenance", "relations", "producerReport", "reviews"].includes(key)) {
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
        claims[key as keyof Manifest["claims"]] = { path: raw.path, digest: raw.digest };
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
      if (raw.required !== undefined && typeof raw.required !== "boolean") {
        schema(`${scope}.required`, "check required must be a boolean");
        continue;
      }
      checkSpecs.push({ id: raw.id, version: raw.version, required: raw.required !== false });
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
        if (raw.critical) {
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

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
