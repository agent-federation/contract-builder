/**
 * Assembly of the deterministic build identity from the declared inputs and closures.
 *
 * See `docs/architecture/build-identity.md` for the byte format and the input boundary.
 */

import { createHash } from "node:crypto";
import { compare, type Diagnostics } from "../diagnostics.js";
import { localizedDetail } from "../messages.js";
import type { LoadedSpec } from "../load.js";
import type { ResolvedProject } from "../manifest.js";
import type { Renderer } from "../render.js";
import type { SourceAdapter, SourceDocument } from "../source.js";
import { resolveExtensionClosure, resolveProfileClosure } from "./closure.js";
import {
  INPUT_ENVELOPE,
  canonicalManifestJson,
  frameRecord,
  normalizeDeclaredPath,
  normalizeTextBytes,
} from "./digest.js";
import { createEngineImportMapping } from "./engine-imports.js";
import { defaultEngineRoot, readEngineVersion, readLockfile } from "./engine-root.js";
import type { BuildIdentity, Lockfile, ResolvedExtensionClosure } from "./types.js";

export interface IdentityInput {
  project: ResolvedProject;
  loaded: LoadedSpec;
  sources: readonly SourceDocument[];
  adapters: Record<string, SourceAdapter>;
  renderer: Renderer;
  diagnostics: Diagnostics;
  /** Validated engine root the identity is computed against; defaults to the running engine. */
  engineRoot?: string;
}

/** Computes the complete build identity for a resolved project. */
export async function computeBuildIdentity(input: IdentityInput): Promise<BuildIdentity | null> {
  const { project, loaded, sources, adapters, renderer, diagnostics } = input;
  const engineRoot = input.engineRoot ?? defaultEngineRoot();

  let engineVersion: string;
  let lockfile: Lockfile;
  try {
    engineVersion = await readEngineVersion(engineRoot);
  } catch (error) {
    diagnostics.error("ERR_IO#engine-version-failed", "package.json", "/version", {
      error: localizedDetail(error),
    });
    return null;
  }
  try {
    lockfile = await readLockfile(engineRoot);
  } catch (error) {
    diagnostics.error("ERR_IO#lockfile-read-failed", "bun.lock", "", {
      error: localizedDetail(error),
    });
    return null;
  }

  const profileClosure = await resolveProfileClosure(
    project,
    lockfile,
    diagnostics,
    createEngineImportMapping(project, engineRoot),
  );
  if (profileClosure === null) return null;

  const adapterIds = [
    ...new Set((project.manifest.sources ?? []).map((source) => source.adapter)),
  ].sort(compare);
  const adapterClosures: ResolvedExtensionClosure[] = [];
  for (const adapterId of adapterIds) {
    const adapter = adapters[adapterId];
    if (adapter === undefined) return null;
    const closure = await resolveExtensionClosure(
      "adapter",
      adapter.id,
      adapter.version,
      adapter.closure,
      lockfile,
      diagnostics,
    );
    if (closure === null) return null;
    adapterClosures.push(closure);
  }

  const rendererClosure = await resolveExtensionClosure(
    "renderer",
    renderer.id,
    renderer.version,
    renderer.closure,
    lockfile,
    diagnostics,
  );
  if (rendererClosure === null) return null;

  const hash = createHash("sha256");
  hash.update(INPUT_ENVELOPE);
  hash.update(frameRecord("manifest", [canonicalManifestJson(project.manifest)]));

  for (const input of project.manifest.inputs) {
    const bytes = loaded.bytes[input.path];
    if (bytes === undefined) continue;
    hash.update(
      frameRecord("input", [normalizeDeclaredPath(input.path), normalizeTextBytes(bytes)]),
    );
  }

  for (const source of sources) {
    hash.update(
      frameRecord("source", [source.id, source.adapter, normalizeTextBytes(source.bytes)]),
    );
  }

  hash.update(
    frameRecord("profile", [
      profileClosure.id,
      profileClosure.version,
      profileClosure.closureDigest,
    ]),
  );

  for (const closure of adapterClosures.sort((a, b) => compare(a.id, b.id))) {
    hash.update(frameRecord("adapter", [closure.id, closure.version, closure.closureDigest]));
  }

  hash.update(
    frameRecord("renderer", [
      rendererClosure.id,
      rendererClosure.version,
      rendererClosure.closureDigest,
    ]),
  );

  const extensions: BuildIdentity["extensions"] = [
    { kind: "profile", id: profileClosure.id, version: profileClosure.version },
  ];
  for (const closure of adapterClosures) {
    extensions.push({ kind: "adapter", id: closure.id, version: closure.version });
  }
  extensions.push({
    kind: "renderer",
    id: rendererClosure.id,
    version: rendererClosure.version,
  });

  return {
    projectId: project.manifest.project.id,
    engineVersion,
    manifestVersion: project.manifest.manifestVersion,
    inputDigest: `sha256:${hash.digest("hex")}`,
    extensions,
  };
}
