/**
 * Deterministic build identity: the authoritative `inputDigest` plus the extension
 * closures it covers.
 *
 * The digest is not a proof of correctness, security, hermeticity or trustworthiness. It is
 * a deterministic fingerprint of the declared inputs and of the declared extension closures.
 * Extensions are trusted in-process code; the import scan below is a guard, not a sandbox.
 * It cannot see computed specifiers, `createRequire`, `process.binding`, or runtime access
 * to external state.
 *
 * See `docs/architecture/build-identity.md` for the byte format and the input boundary.
 *
 * This module is a facade: the implementation lives in `spec/lib/identity/` and the public
 * names below are re-exported unchanged so existing consumers keep working.
 */

export type {
  BuildIdentity,
  DependencyRecord,
  ExtensionKind,
  Lockfile,
  ResolvedExtensionClosure,
} from "./identity/types.js";
export type { EngineRoot } from "./identity/engine-root.js";
export type {
  EngineImportMapping,
  EngineSpecifierClassification,
} from "./identity/engine-imports.js";
export type { IdentityInput } from "./identity/build-identity.js";
export {
  canonicalManifestJson,
  computeClosureDigest,
  frameRecord,
  normalizeDeclaredPath,
  normalizeTextBytes,
} from "./identity/digest.js";
export {
  defaultEngineRoot,
  loadEngineRoot,
  parseLockfile,
  readEngineVersion,
  readLockfile,
  verifyEngineVersion,
} from "./identity/engine-root.js";
export {
  classifyEngineSpecifier,
  createEngineImportMapping,
  installEngineImportPlugin,
  withEngineImportMapping,
} from "./identity/engine-imports.js";
export {
  resolveDependencyClosure,
  resolveExtensionClosure,
  resolveProfileClosure,
  validateProfileClosure,
} from "./identity/closure.js";
export { computeBuildIdentity } from "./identity/build-identity.js";
export { importSpecifiers } from "./identity/import-specifiers.js";
