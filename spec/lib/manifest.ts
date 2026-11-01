import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { Diagnostics } from "./diagnostics.js";
import { isMissingFile, isNonEmptyString, isObject, messageOf } from "./guards.js";

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
  sources?: ManifestSource[];
  render: ManifestRender[];
  output?: { root?: string };
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
      diags.error("core.manifest.missing", "contract-builder.json", "", "Манифест проекта не найден");
    } else {
      diags.error(
        "ERR_IO",
        "contract-builder.json",
        "",
        `Не удалось прочитать манифест: ${messageOf(error)}`,
      );
    }
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    diags.error(
      "core.manifest.invalid",
      "contract-builder.json",
      "",
      `Манифест не разобран: ${messageOf(error)}`,
    );
    return null;
  }

  const manifest = validateManifest(raw, diags);
  if (manifest === null) return null;

  const profileLocated = await resolveContained(root, manifest.profile.source);
  if (!profileLocated.inside && manifest.profile.external !== true) {
    diags.error(
      "core.path.outside-root",
      "contract-builder.json",
      "/profile/source",
      `Профиль "${manifest.profile.source}" вне корня проекта требует external: true`,
    );
    return null;
  }
  const profileDir = await realpath(profileLocated.abs).catch(() => profileLocated.abs);

  const profile = await loadProfile(profileDir, diags);
  if (profile === null) return null;

  if (profile.id !== manifest.profile.id || profile.version !== manifest.profile.version) {
    diags.error(
      "core.profile.invalid",
      "contract-builder.json",
      "/profile",
      `Профиль "${profile.id}@${profile.version}" не совпадает с объявленным "${manifest.profile.id}@${manifest.profile.version}"`,
    );
    return null;
  }

  let failed = false;
  for (const [index, input] of manifest.inputs.entries()) {
    const located = await resolveContained(root, input.path);
    if (!located.inside && input.external !== true) {
      diags.error(
        "core.path.outside-root",
        "contract-builder.json",
        `/inputs/${index}/path`,
        `Вход "${input.path}" вне корня проекта требует external: true`,
      );
      failed = true;
    }
  }
  for (const [index, source] of (manifest.sources ?? []).entries()) {
    const located = await resolveContained(root, source.path);
    if (!located.inside && source.external !== true) {
      diags.error(
        "core.path.outside-root",
        "contract-builder.json",
        `/sources/${index}/path`,
        `Источник "${source.path}" вне корня проекта требует external: true`,
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
    diags.error(
      "core.profile.invalid",
      "profile.json",
      "",
      `Профиль не прочитан: ${messageOf(error)}`,
    );
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    diags.error(
      "core.profile.invalid",
      "profile.json",
      "",
      `profile.json не разобран: ${messageOf(error)}`,
    );
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
  const fail = (pointer: string, message: string): null => {
    diags.error("core.manifest.invalid", "contract-builder.json", pointer, message);
    return null;
  };

  if (!isObject(value)) return fail("", "Манифест должен быть объектом");
  if (!isNonEmptyString(value.manifestVersion)) {
    return fail("/manifestVersion", "manifestVersion обязателен");
  }

  const project = value.project;
  if (!isObject(project) || !isNonEmptyString(project.id)) {
    return fail("/project", "project.id обязателен");
  }

  const profile = value.profile;
  if (!isObject(profile)) return fail("/profile", "profile обязателен");
  if (!isNonEmptyString(profile.id) || !isNonEmptyString(profile.version)) {
    return fail("/profile", "profile.id и profile.version обязательны");
  }
  if (!isNonEmptyString(profile.source)) {
    return fail("/profile/source", "M1 требует локальный profile.source");
  }

  const inputs = validateInputs(value.inputs, fail);
  if (inputs === null) return null;

  const sources = validateSources(value.sources, fail);
  if (sources === null) return null;

  const render = validateRender(value.render, fail);
  if (render === null) return null;

  let output: { root?: string } | undefined;
  if (value.output !== undefined) {
    if (!isObject(value.output)) return fail("/output", "output должен быть объектом");
    if (value.output.root !== undefined && !isNonEmptyString(value.output.root)) {
      return fail("/output/root", "output.root должен быть непустой строкой");
    }
    output = isNonEmptyString(value.output.root) ? { root: value.output.root } : {};
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
    ...(sources !== undefined ? { sources } : {}),
    render,
    ...(output !== undefined ? { output } : {}),
  };
}

function validateInputs(
  value: unknown,
  fail: (pointer: string, message: string) => null,
): ManifestInput[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return fail("/inputs", "inputs обязателен и непуст");
  }

  const inputs: ManifestInput[] = [];
  for (const [index, item] of value.entries()) {
    if (!isObject(item)) return fail(`/inputs/${index}`, "Вход должен быть объектом");
    if (!isNonEmptyString(item.path) || !isNonEmptyString(item.schema)) {
      return fail(`/inputs/${index}`, "path и schema обязательны");
    }
    if (item.format !== "json" && item.format !== "yaml") {
      return fail(`/inputs/${index}/format`, "format должен быть json или yaml");
    }
    if (!Array.isArray(item.entities)) {
      return fail(`/inputs/${index}/entities`, "entities обязателен");
    }

    const entities: ManifestEntityDecl[] = [];
    for (const [entityIndex, entity] of item.entities.entries()) {
      if (!isObject(entity) || !isNonEmptyString(entity.kind) || !isNonEmptyString(entity.pointer)) {
        return fail(`/inputs/${index}/entities/${entityIndex}`, "kind и pointer обязательны");
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

function validateSources(
  value: unknown,
  fail: (pointer: string, message: string) => null,
): ManifestSource[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return fail("/sources", "sources должен быть массивом");

  const sources: ManifestSource[] = [];
  for (const [index, item] of value.entries()) {
    if (!isObject(item)) return fail(`/sources/${index}`, "Источник должен быть объектом");
    if (!isNonEmptyString(item.id) || !isNonEmptyString(item.path) || !isNonEmptyString(item.adapter)) {
      return fail(`/sources/${index}`, "id, path и adapter обязательны");
    }

    const identity = item.identity;
    if (
      !isObject(identity) ||
      !isNonEmptyString(identity.document) ||
      !isNonEmptyString(identity.revision)
    ) {
      return fail(
        `/sources/${index}/identity`,
        "identity.document и identity.revision обязательны в M1",
      );
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

function validateRender(
  value: unknown,
  fail: (pointer: string, message: string) => null,
): ManifestRender[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return fail("/render", "render обязателен и непуст");
  }

  const render: ManifestRender[] = [];
  for (const [index, item] of value.entries()) {
    if (!isObject(item) || !isObject(item.outputs)) {
      return fail(`/render/${index}`, "outputs обязателен");
    }

    const outputs: Record<string, string> = {};
    for (const [mode, target] of Object.entries(item.outputs)) {
      if (!isNonEmptyString(target)) {
        return fail(`/render/${index}/outputs/${mode}`, "Путь вывода должен быть непустой строкой");
      }
      outputs[mode] = target;
    }

    // An omitted optional field is fine; a present but invalid one is not.
    for (const key of ["renderer", "template", "labels"] as const) {
      if (item[key] !== undefined && !isNonEmptyString(item[key])) {
        return fail(`/render/${index}/${key}`, `${key} должен быть непустой строкой`);
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
  const fail = (pointer: string, message: string): null => {
    diags.error("core.profile.invalid", "profile.json", pointer, message);
    return null;
  };

  if (!isObject(value)) return fail("", "profile.json должен быть объектом");
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.version)) {
    return fail("", "id и version обязательны");
  }

  if (!isObject(value.entityKinds)) return fail("/entityKinds", "entityKinds обязателен");
  const entityKinds: Record<string, ProfileEntityKind> = {};
  for (const [kind, decl] of Object.entries(value.entityKinds)) {
    if (!isObject(decl) || !isNonEmptyString(decl.schema)) {
      return fail(`/entityKinds/${kind}`, "schema обязателен");
    }
    entityKinds[kind] = {
      schema: decl.schema,
      ...(isNonEmptyString(decl.identity) ? { identity: decl.identity } : {}),
    };
  }

  if (!isObject(value.schemas)) return fail("/schemas", "schemas обязателен");
  const schemas: Record<string, string> = {};
  for (const [id, relative] of Object.entries(value.schemas)) {
    if (!isNonEmptyString(relative)) {
      return fail(`/schemas/${id}`, "Путь схемы должен быть непустой строкой");
    }
    schemas[id] = relative;
  }

  if (!Array.isArray(value.documents)) return fail("/documents", "documents обязателен");
  const documents: ProfileDocumentBinding[] = [];
  for (const [index, item] of value.documents.entries()) {
    if (!isObject(item) || !isNonEmptyString(item.key) || !isNonEmptyString(item.input)) {
      return fail(`/documents/${index}`, "key и input обязательны");
    }
    documents.push({ key: item.key, input: item.input });
  }

  let files: string[] | undefined;
  if (value.files !== undefined) {
    if (!Array.isArray(value.files) || !value.files.every(isNonEmptyString)) {
      return fail("/files", "files должен быть массивом непустых строк");
    }
    files = value.files;
  }

  let dependencies: Record<string, string> | undefined;
  if (value.dependencies !== undefined) {
    if (!isObject(value.dependencies)) {
      return fail("/dependencies", "dependencies должен быть объектом");
    }
    dependencies = {};
    for (const [name, version] of Object.entries(value.dependencies)) {
      if (!isNonEmptyString(version)) {
        return fail(`/dependencies/${name}`, "Версия зависимости должна быть непустой строкой");
      }
      dependencies[name] = version;
    }
  }

  let relations: RelationDecl[] | undefined;
  if (value.relations !== undefined) {
    if (!Array.isArray(value.relations)) return fail("/relations", "relations должен быть массивом");
    relations = [];
    for (const [index, item] of value.relations.entries()) {
      if (
        !isObject(item) ||
        !isNonEmptyString(item.name) ||
        !isNonEmptyString(item.from) ||
        !isNonEmptyString(item.to)
      ) {
        return fail(`/relations/${index}`, "name, from и to обязательны");
      }
      if (item.cardinality !== undefined && item.cardinality !== "one" && item.cardinality !== "many") {
        return fail(`/relations/${index}/cardinality`, "cardinality должен быть one или many");
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
        return fail(
          `/relations/${index}`,
          `Связь "${decl.name}" для вида "${decl.from}" объявлена повторно`,
        );
      }
      seen.add(key);
    }
  }

  let view: string | undefined;
  if (value.view !== undefined) {
    if (!isNonEmptyString(value.view)) return fail("/view", "view должен быть непустой строкой");
    view = value.view;
  }

  let validator: string | undefined;
  if (value.validator !== undefined) {
    if (!isNonEmptyString(value.validator)) {
      return fail("/validator", "validator должен быть непустой строкой");
    }
    validator = value.validator;
  }

  let diagnostics: string | undefined;
  if (value.diagnostics !== undefined) {
    if (!isNonEmptyString(value.diagnostics)) {
      return fail("/diagnostics", "diagnostics должен быть непустой строкой");
    }
    diagnostics = value.diagnostics;
  }

  let provenance: ProvenanceMapping[] | undefined;
  if (value.provenance !== undefined) {
    if (!Array.isArray(value.provenance)) {
      return fail("/provenance", "provenance должен быть массивом");
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
        return fail(`/provenance/${index}`, "kind, source, ref и quote обязательны");
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

