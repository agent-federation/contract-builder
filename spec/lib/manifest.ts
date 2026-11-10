import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { Diagnostics } from "./diagnostics.js";
import { isMissingFile, isNonEmptyString, isObject, messageOf } from "./guards.js";
import { SUPPORTED_LOCALES, isLocale, type Locale } from "./locale.js";
import type { DiagnosticMessageKey, MessageParams } from "./messages.js";

/** The `fail` callback every manifest/profile validator shares: pointer + catalog key. */
type Fail = (pointer: string, key: DiagnosticMessageKey, params?: MessageParams) => null;

export type InputFormat = "json" | "yaml";

export interface ManifestEntityDecl {
  kind: string;
  pointer: string;
}

export interface ManifestInput {
  path: string;
  format: InputFormat;
  schema: string;
  entities: ManifestEntityDecl[];
  external?: boolean;
  optional?: boolean;
}

export interface ManifestSource {
  id: string;
  path: string;
  adapter: string;
  external?: boolean;
  identity?: { document?: string; revision?: string };
}

export interface ManifestRender {
  renderer?: string;
  template?: string;
  labels?: string;
  outputs: Record<string, string>;
}

export interface Manifest {
  manifestVersion: string;
  project: { id: string; title?: string; revision?: string };
  profile: { id: string; version: string; source: string; external?: boolean };
  inputs: ManifestInput[];
  /** M1 supports exactly one source; zero, absent or multiple entries are rejected by `validateSources`. */
  sources?: ManifestSource[];
  /** M1 supports exactly one render declaration; zero or many are rejected by the loader. */
  render: ManifestRender[];
  output?: { root?: string };
  /**
   * Locale of the rendered artifact. English when absent. The CLI locale is independent:
   * diagnostics print in the CLI locale, while an artifact embeds the diagnostics resolved
   * in this project locale.
   */
  locale?: Locale;
}

export interface ProfileEntityKind {
  schema: string;
  identity?: string;
}

export interface ProfileDocumentBinding {
  key: string;
  input: string;
}

export interface RelationDecl {
  name: string;
  from: string;
  to: string;
  cardinality?: "one" | "many";
  inverse?: string;
}

export interface ProvenanceMapping {
  kind: string;
  source: string;
  ref: string;
  quote: string;
}

export interface Profile {
  id: string;
  version: string;
  entityKinds: Record<string, ProfileEntityKind>;
  schemas: Record<string, string>;
  documents: ProfileDocumentBinding[];
  relations?: RelationDecl[];
  provenance?: ProvenanceMapping[];
  /**
   * M1 requires an executable profile: both `view` and `validator` must be declared.
   * `validateProfile` rejects a data-only profile, so a loaded profile has both.
   */
  view?: string;
  validator?: string;
  diagnostics?: string;
  files?: string[];
  dependencies?: Record<string, string>;
}

export interface ResolvedProject {
  /** Canonical project root: the directory containing the manifest. */
  root: string;
  manifestPath: string;
  manifest: Manifest;
  /** Canonical profile directory. */
  profileDir: string;
  profile: Profile;
}

/**
 * Reads `contract-builder.json`, resolves the profile and checks every declared path
 * against the project root. Nothing here reads project inputs; `loadProject` does.
 */
export async function loadManifest(
  specDir: string,
  diags: Diagnostics,
): Promise<ResolvedProject | null> {
  const root = await realpath(specDir).catch(() => path.resolve(specDir));
  const manifestPath = path.join(root, "contract-builder.json");

  let text: string;
  try {
    text = await readFile(manifestPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      diags.error("core.manifest.missing#manifest-missing", "contract-builder.json", "");
    } else {
      diags.error("ERR_IO#manifest-read-failed", "contract-builder.json", "", {
        error: messageOf(error),
      });
    }
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    diags.error("core.manifest.invalid#manifest-parse-failed", "contract-builder.json", "", {
      error: messageOf(error),
    });
    return null;
  }

  const manifest = validateManifest(raw, diags);
  if (manifest === null) return null;

  const profileLocated = await resolveContained(root, manifest.profile.source);
  if (!profileLocated.inside && manifest.profile.external !== true) {
    diags.error(
      "core.path.outside-root#profile-external-required",
      "contract-builder.json",
      "/profile/source",
      { source: manifest.profile.source },
    );
    return null;
  }
  const profileDir = await realpath(profileLocated.abs).catch(() => profileLocated.abs);

  const profile = await loadProfile(profileDir, diags);
  if (profile === null) return null;

  if (profile.id !== manifest.profile.id || profile.version !== manifest.profile.version) {
    diags.error(
      "core.profile.invalid#profile-version-mismatch",
      "contract-builder.json",
      "/profile",
      {
        id: profile.id,
        version: profile.version,
        declaredId: manifest.profile.id,
        declaredVersion: manifest.profile.version,
      },
    );
    return null;
  }

  let failed = false;
  for (const [index, input] of manifest.inputs.entries()) {
    const located = await resolveContained(root, input.path);
    if (!located.inside && input.external !== true) {
      diags.error(
        "core.path.outside-root#input-external-required",
        "contract-builder.json",
        `/inputs/${index}/path`,
        { path: input.path },
      );
      failed = true;
    }
  }
  for (const [index, source] of (manifest.sources ?? []).entries()) {
    const located = await resolveContained(root, source.path);
    if (!located.inside && source.external !== true) {
      diags.error(
        "core.path.outside-root#source-external-required",
        "contract-builder.json",
        `/sources/${index}/path`,
        { path: source.path },
      );
      failed = true;
    }
  }

  if (failed) return null;

  return { root, manifestPath, manifest, profileDir, profile };
}

async function loadProfile(profileDir: string, diags: Diagnostics): Promise<Profile | null> {
  const profilePath = path.join(profileDir, "profile.json");
  let text: string;
  try {
    text = await readFile(profilePath, "utf8");
  } catch (error) {
    diags.error("core.profile.invalid#profile-read-failed", "profile.json", "", {
      error: messageOf(error),
    });
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    diags.error("core.profile.invalid#profile-parse-failed", "profile.json", "", {
      error: messageOf(error),
    });
    return null;
  }

  return validateProfile(raw, diags);
}

/**
 * Resolves `relative` against `root` and reports whether the result stays inside it.
 * Symlinks are resolved for the nearest existing ancestor, so a link that escapes the
 * root is reported as outside even when the target does not exist yet.
 */
export async function resolveContained(
  root: string,
  relative: string,
): Promise<{ abs: string; inside: boolean }> {
  const abs = path.resolve(root, relative);
  const real = await realpathNearest(abs);
  // `path.relative` is used instead of a prefix check: a prefix check fails when the
  // root is "/" and misclassifies siblings such as "/tmp/a" and "/tmp/ab".
  const fromRoot = path.relative(root, real);
  const inside =
    fromRoot === "" ||
    (!path.isAbsolute(fromRoot) && fromRoot !== ".." && !fromRoot.startsWith(`..${path.sep}`));
  return { abs, inside };
}

async function realpathNearest(target: string): Promise<string> {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      const real = await realpath(current);
      return missing.length === 0 ? real : path.join(real, ...[...missing].reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return target;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}

function validateManifest(value: unknown, diags: Diagnostics): Manifest | null {
  const fail: Fail = (pointer, key, params) => {
    diags.error(key, "contract-builder.json", pointer, params);
    return null;
  };

  if (!isObject(value)) return fail("", "core.manifest.invalid#manifest-not-object");
  if (!isNonEmptyString(value.manifestVersion)) {
    return fail("/manifestVersion", "core.manifest.invalid#manifest-version-required");
  }

  const project = value.project;
  if (!isObject(project) || !isNonEmptyString(project.id)) {
    return fail("/project", "core.manifest.invalid#project-id-required");
  }

  const profile = value.profile;
  if (!isObject(profile)) return fail("/profile", "core.manifest.invalid#profile-required");
  if (!isNonEmptyString(profile.id) || !isNonEmptyString(profile.version)) {
    return fail("/profile", "core.manifest.invalid#profile-id-version-required");
  }
  if (!isNonEmptyString(profile.source)) {
    return fail("/profile/source", "core.manifest.invalid#profile-source-local-required");
  }

  const inputs = validateInputs(value.inputs, fail);
  if (inputs === null) return null;

  const sources = validateSources(value.sources, fail);
  if (sources === null) return null;

  const render = validateRender(value.render, fail);
  if (render === null) return null;

  let output: { root?: string } | undefined;
  if (value.output !== undefined) {
    if (!isObject(value.output)) return fail("/output", "core.manifest.invalid#output-not-object");
    if (value.output.root !== undefined && !isNonEmptyString(value.output.root)) {
      return fail("/output/root", "core.manifest.invalid#output-root-required");
    }
    output = isNonEmptyString(value.output.root) ? { root: value.output.root } : {};
  }

  let locale: Locale | undefined;
  if (value.locale !== undefined) {
    if (!isLocale(value.locale)) {
      return fail("/locale", "core.manifest.invalid#locale", {
        value: String(value.locale),
        locales: SUPPORTED_LOCALES.join(", "),
      });
    }
    locale = value.locale;
  }

  return {
    manifestVersion: value.manifestVersion,
    project: {
      id: project.id,
      ...(isNonEmptyString(project.title) ? { title: project.title } : {}),
      ...(isNonEmptyString(project.revision) ? { revision: project.revision } : {}),
    },
    profile: {
      id: profile.id,
      version: profile.version,
      source: profile.source,
      ...(profile.external === true ? { external: true } : {}),
    },
    inputs,
    sources,
    render,
    ...(output !== undefined ? { output } : {}),
    ...(locale !== undefined ? { locale } : {}),
  };
}

function validateInputs(value: unknown, fail: Fail): ManifestInput[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return fail("/inputs", "core.manifest.invalid#inputs-required");
  }

  const inputs: ManifestInput[] = [];
  for (const [index, item] of value.entries()) {
    if (!isObject(item)) return fail(`/inputs/${index}`, "core.manifest.invalid#input-not-object");
    if (!isNonEmptyString(item.path) || !isNonEmptyString(item.schema)) {
      return fail(`/inputs/${index}`, "core.manifest.invalid#input-path-schema-required");
    }
    if (item.format !== "json" && item.format !== "yaml") {
      return fail(`/inputs/${index}/format`, "core.manifest.invalid#input-format-invalid");
    }
    if (!Array.isArray(item.entities)) {
      return fail(`/inputs/${index}/entities`, "core.manifest.invalid#entities-required");
    }

    const entities: ManifestEntityDecl[] = [];
    for (const [entityIndex, entity] of item.entities.entries()) {
      if (
        !isObject(entity) ||
        !isNonEmptyString(entity.kind) ||
        !isNonEmptyString(entity.pointer)
      ) {
        return fail(
          `/inputs/${index}/entities/${entityIndex}`,
          "core.manifest.invalid#entry-kind-pointer-required",
        );
      }
      entities.push({ kind: entity.kind, pointer: entity.pointer });
    }

    inputs.push({
      path: item.path,
      format: item.format,
      schema: item.schema,
      entities,
      ...(item.external === true ? { external: true } : {}),
      ...(item.optional === true ? { optional: true } : {}),
    });
  }

  return inputs;
}

function validateSources(value: unknown, fail: Fail): ManifestSource[] | null {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return fail("/sources", "core.manifest.invalid#sources-single-zero");
  }
  if (!Array.isArray(value)) return fail("/sources", "core.manifest.invalid#sources-not-array");

  // M1 supports exactly one source (ODR-ENG-001 B4). Reject zero, absent and multiple
  // sources here, during manifest validation, so neither the model, the identity nor the
  // renderer sees a manifest without exactly one source. Historically an absent or empty
  // array passed this check and failed later on the build path with ERR_UNKNOWN_REF; that
  // legacy behaviour is not the policy for this structural violation.
  if (value.length > 1) {
    return fail("/sources", "core.manifest.invalid#sources-single-many", {
      count: value.length,
    });
  }

  const sources: ManifestSource[] = [];
  for (const [index, item] of value.entries()) {
    if (!isObject(item))
      return fail(`/sources/${index}`, "core.manifest.invalid#source-not-object");
    if (
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.path) ||
      !isNonEmptyString(item.adapter)
    ) {
      return fail(`/sources/${index}`, "core.manifest.invalid#source-fields-required");
    }

    const identity = item.identity;
    if (
      !isObject(identity) ||
      !isNonEmptyString(identity.document) ||
      !isNonEmptyString(identity.revision)
    ) {
      return fail(`/sources/${index}/identity`, "core.manifest.invalid#source-identity-required");
    }

    sources.push({
      id: item.id,
      path: item.path,
      adapter: item.adapter,
      identity: { document: identity.document, revision: identity.revision },
      ...(item.external === true ? { external: true } : {}),
    });
  }

  return sources;
}

function validateRender(value: unknown, fail: Fail): ManifestRender[] | null {
  if (!Array.isArray(value)) {
    return fail("/render", "core.manifest.invalid#render-not-array");
  }
  if (value.length !== 1) {
    return fail("/render", "core.manifest.invalid#render-single-count", {
      count: value.length,
    });
  }

  const render: ManifestRender[] = [];
  for (const [index, item] of value.entries()) {
    if (!isObject(item) || !isObject(item.outputs)) {
      return fail(`/render/${index}`, "core.manifest.invalid#outputs-required");
    }

    const outputs: Record<string, string> = {};
    for (const [mode, target] of Object.entries(item.outputs)) {
      if (!isNonEmptyString(target)) {
        return fail(
          `/render/${index}/outputs/${mode}`,
          "core.manifest.invalid#output-path-required",
        );
      }
      outputs[mode] = target;
    }

    // An omitted optional field is fine; a present but invalid one is not.
    for (const key of ["renderer", "template", "labels"] as const) {
      if (item[key] !== undefined && !isNonEmptyString(item[key])) {
        return fail(`/render/${index}/${key}`, "core.manifest.invalid#render-field-required", {
          key,
        });
      }
    }

    render.push({
      outputs,
      ...(isNonEmptyString(item.renderer) ? { renderer: item.renderer } : {}),
      ...(isNonEmptyString(item.template) ? { template: item.template } : {}),
      ...(isNonEmptyString(item.labels) ? { labels: item.labels } : {}),
    });
  }

  return render;
}

function validateProfile(value: unknown, diags: Diagnostics): Profile | null {
  const fail: Fail = (pointer, key, params) => {
    diags.error(key, "profile.json", pointer, params);
    return null;
  };

  if (!isObject(value)) return fail("", "core.profile.invalid#profile-not-object");
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.version)) {
    return fail("", "core.profile.invalid#profile-id-version-missing");
  }

  if (!isObject(value.entityKinds))
    return fail("/entityKinds", "core.profile.invalid#entity-kinds-required");
  const entityKinds: Record<string, ProfileEntityKind> = {};
  for (const [kind, decl] of Object.entries(value.entityKinds)) {
    if (!isObject(decl) || !isNonEmptyString(decl.schema)) {
      return fail(`/entityKinds/${kind}`, "core.profile.invalid#schema-required");
    }
    entityKinds[kind] = {
      schema: decl.schema,
      ...(isNonEmptyString(decl.identity) ? { identity: decl.identity } : {}),
    };
  }

  if (!isObject(value.schemas)) return fail("/schemas", "core.profile.invalid#schemas-required");
  const schemas: Record<string, string> = {};
  for (const [id, relative] of Object.entries(value.schemas)) {
    if (!isNonEmptyString(relative)) {
      return fail(`/schemas/${id}`, "core.profile.invalid#schema-path-required");
    }
    schemas[id] = relative;
  }

  if (!Array.isArray(value.documents))
    return fail("/documents", "core.profile.invalid#documents-required");
  const documents: ProfileDocumentBinding[] = [];
  for (const [index, item] of value.documents.entries()) {
    if (!isObject(item) || !isNonEmptyString(item.key) || !isNonEmptyString(item.input)) {
      return fail(`/documents/${index}`, "core.profile.invalid#document-key-input-required");
    }
    documents.push({ key: item.key, input: item.input });
  }

  let files: string[] | undefined;
  if (value.files !== undefined) {
    if (!Array.isArray(value.files) || !value.files.every(isNonEmptyString)) {
      return fail("/files", "core.profile.invalid#files-array-required");
    }
    files = value.files;
  }

  let dependencies: Record<string, string> | undefined;
  if (value.dependencies !== undefined) {
    if (!isObject(value.dependencies)) {
      return fail("/dependencies", "core.profile.invalid#dependencies-not-object");
    }
    dependencies = {};
    for (const [name, version] of Object.entries(value.dependencies)) {
      if (!isNonEmptyString(version)) {
        return fail(`/dependencies/${name}`, "core.profile.invalid#dependency-version-required");
      }
      dependencies[name] = version;
    }
  }

  let relations: RelationDecl[] | undefined;
  if (value.relations !== undefined) {
    if (!Array.isArray(value.relations))
      return fail("/relations", "core.profile.invalid#relations-not-array");
    relations = [];
    for (const [index, item] of value.relations.entries()) {
      if (
        !isObject(item) ||
        !isNonEmptyString(item.name) ||
        !isNonEmptyString(item.from) ||
        !isNonEmptyString(item.to)
      ) {
        return fail(`/relations/${index}`, "core.profile.invalid#relation-fields-required");
      }
      if (
        item.cardinality !== undefined &&
        item.cardinality !== "one" &&
        item.cardinality !== "many"
      ) {
        return fail(
          `/relations/${index}/cardinality`,
          "core.profile.invalid#relation-cardinality-invalid",
        );
      }
      // A declared inverse is part of the contract, so a value that is not a name is an error
      // rather than an implicit "no inverse": normalizing it away would let a malformed
      // declaration pass as if it had never been declared.
      if (item.inverse !== undefined && !isNonEmptyString(item.inverse)) {
        return fail(`/relations/${index}/inverse`, "core.profile.invalid#inverse-required");
      }
      relations.push({
        name: item.name,
        from: item.from,
        to: item.to,
        ...(item.cardinality === "one" || item.cardinality === "many"
          ? { cardinality: item.cardinality }
          : {}),
        ...(isNonEmptyString(item.inverse) ? { inverse: item.inverse } : {}),
      });
    }
  }

  if (relations !== undefined) {
    const seen = new Set<string>();
    for (const [index, decl] of relations.entries()) {
      const key = `${decl.from}\u0000${decl.name}`;
      if (seen.has(key)) {
        return fail(`/relations/${index}`, "core.profile.invalid#relation-duplicate", {
          name: decl.name,
          from: decl.from,
        });
      }
      seen.add(key);
    }

    // An inverse declaration is the other half of the same edge set, so the pair must form a
    // bidirectional contract: the inverse is declared from the forward target kind, points
    // back at the forward relation and reverses its endpoints. Cardinality is a property of
    // the values in one direction, not of the declaration pair; the resolver enforces it when
    // it synthesizes the inverse values.
    const declared = new Map(
      relations.map((decl) => [`${decl.from}\u0000${decl.name}`, decl] as const),
    );
    for (const [index, decl] of relations.entries()) {
      if (decl.inverse === undefined) continue;
      if (decl.to === "*") {
        return fail(`/relations/${index}/inverse`, "core.profile.invalid#wildcard-inverse", {
          name: decl.name,
          inverse: decl.inverse,
        });
      }
      const inverse = declared.get(`${decl.to}\u0000${decl.inverse}`);
      if (inverse === undefined) {
        return fail(`/relations/${index}/inverse`, "core.profile.invalid#inverse-unknown", {
          inverse: decl.inverse,
          to: decl.to,
        });
      }
      if (inverse.inverse !== decl.name) {
        return inverse.inverse === undefined
          ? fail(`/relations/${index}/inverse`, "core.profile.invalid#relation-inverse-missing", {
              inverse: decl.inverse,
              expected: decl.name,
            })
          : fail(`/relations/${index}/inverse`, "core.profile.invalid#relation-inverse-other", {
              inverse: decl.inverse,
              actual: inverse.inverse,
              expected: decl.name,
            });
      }
      if (inverse.to !== decl.from) {
        return fail(`/relations/${index}/inverse`, "core.profile.invalid#inverse-target-mismatch", {
          inverse: decl.inverse,
          to: inverse.to,
          from: decl.from,
        });
      }
    }
  }

  let view: string | undefined;
  if (value.view !== undefined) {
    if (!isNonEmptyString(value.view)) return fail("/view", "core.profile.invalid#view-required");
    view = value.view;
  }

  let validator: string | undefined;
  if (value.validator !== undefined) {
    if (!isNonEmptyString(value.validator)) {
      return fail("/validator", "core.profile.invalid#validator-required");
    }
    validator = value.validator;
  }

  // M1 requires an executable profile (ODR-ENG-001 B3). A data-only profile cannot be
  // executed by this engine, so reject it here, before the consent gate, the closure check
  // and any profile module import, with a diagnostic that names the requirement instead of
  // the later generic "profile does not declare view" from the module loader.
  if (view === undefined || validator === undefined) {
    const pointer = view === undefined ? (validator === undefined ? "" : "/view") : "/validator";
    return fail(pointer, "core.profile.invalid#executable-profile");
  }

  let diagnostics: string | undefined;
  if (value.diagnostics !== undefined) {
    if (!isNonEmptyString(value.diagnostics)) {
      return fail("/diagnostics", "core.profile.invalid#diagnostics-required");
    }
    diagnostics = value.diagnostics;
  }

  let provenance: ProvenanceMapping[] | undefined;
  if (value.provenance !== undefined) {
    if (!Array.isArray(value.provenance)) {
      return fail("/provenance", "core.profile.invalid#provenance-not-array");
    }
    provenance = [];
    for (const [index, item] of value.provenance.entries()) {
      if (
        !isObject(item) ||
        !isNonEmptyString(item.kind) ||
        !isNonEmptyString(item.source) ||
        !isNonEmptyString(item.ref) ||
        !isNonEmptyString(item.quote)
      ) {
        return fail(`/provenance/${index}`, "core.profile.invalid#provenance-fields-required");
      }
      provenance.push({
        kind: item.kind,
        source: item.source,
        ref: item.ref,
        quote: item.quote,
      });
    }
  }

  return {
    id: value.id,
    version: value.version,
    entityKinds,
    schemas,
    documents,
    ...(relations !== undefined ? { relations } : {}),
    ...(provenance !== undefined ? { provenance } : {}),
    ...(view !== undefined ? { view } : {}),
    ...(validator !== undefined ? { validator } : {}),
    ...(diagnostics !== undefined ? { diagnostics } : {}),
    ...(files !== undefined ? { files } : {}),
    ...(dependencies !== undefined ? { dependencies } : {}),
  };
}
