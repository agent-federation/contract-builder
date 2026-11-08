/**
 * Shared value types of the deterministic build identity.
 *
 * See `docs/architecture/build-identity.md` for the byte format and the input boundary.
 */

export type ExtensionKind = "profile" | "adapter" | "renderer";

export interface BuildIdentity {
  projectId: string;
  engineVersion: string;
  manifestVersion: string;
  inputDigest: string;
  extensions: Array<{ kind: ExtensionKind; id: string; version: string }>;
}

export interface DependencyRecord {
  name: string;
  version: string;
  integrity: string;
}

export interface LockfilePackage extends DependencyRecord {
  dependencies: Record<string, string>;
}

export interface Lockfile {
  packages: LockfilePackage[];
}

export interface ResolvedExtensionClosure {
  kind: ExtensionKind;
  id: string;
  version: string;
  closureDigest: string;
  files: Array<{ path: string; bytes: Uint8Array }>;
  dependencies: DependencyRecord[];
}
