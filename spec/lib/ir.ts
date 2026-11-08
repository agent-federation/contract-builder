import type { Diagnostics } from "./diagnostics.js";
import { isNonEmptyString, isObject, messageOf } from "./guards.js";
import type { LoadedSpec } from "./load.js";
import { resolveContained, type Manifest, type Profile } from "./manifest.js";
import { DEFAULT_ADAPTERS } from "./adapters/index.js";
import type { SourceAdapter, SourceDocument } from "./source.js";
import { bindProvenance } from "./provenance.js";
import { resolveRelations } from "./relations.js";
import { validateEntityValue, type SchemaSet } from "./schema.js";

export interface ProvenanceBinding {
  source: string;
  ref: string;
  quote: string;
}

/**
 * Outcome of checking a binding against the source. `unavailable` covers "not checked"
 * and "the verifier cannot check this"; `stale` covers a result recorded against a
 * different source digest than the bytes now loaded.
 */
export type ProvenanceVerificationStatus = "verified" | "failed" | "unavailable" | "stale";

/**
 * Evidence for one verification outcome. A binding alone never produces this shape:
 * the core writes a `not-checked` record when it binds, and only a profile verifier
 * can replace it with a checked outcome.
 */
export interface VerificationRecord {
  entity: string;
  source: string;
  ref: string;
  /** Null when no verifier ran; never inferred by the core. */
  verifier: string | null;
  /** "none" for a not-checked record, otherwise the profile's method name. */
  method: string;
  /** Null because a deterministic build has no trusted clock (see DEC-TRUSTED-TIME). */
  checkedAt: string | null;
  /** Source version the outcome applies to, for example "DOC (Rev 1)". */
  sourceVersion: string | null;
  /** SHA-256 of the source bytes the outcome covers, as "sha256:<hex>". */
  sourceDigest: string | null;
  /** Method-specific result, for example found, outside or not-checked. */
  outcome: string;
}

export interface ProvenanceVerification {
  status: ProvenanceVerificationStatus;
  record: VerificationRecord;
}

export interface Entity {
  id: string;
  kind: string;
  type?: string;
  fields: Record<string, unknown>;
  provenance?: ProvenanceBinding;
  verification?: ProvenanceVerification;
  relations: Record<string, string[]>;
}

/** name -> from kind -> resolved target ids */
export type RelationIndex = Map<string, Map<string, Set<string>>>;

export interface EntityLocation {
  file: string;
  pointer: string;
}

export interface ProjectModel {
  manifest: Manifest;
  profile: Profile;
  sources: SourceDocument[];
  entities: Entity[];
  /** Non-entity documents keyed by the profile's document binding key. */
  documents: Readonly<Record<string, unknown>>;
  byId: ReadonlyMap<string, Entity>;
  byKind: ReadonlyMap<string, Entity[]>;
  relations: Readonly<RelationIndex>;
}

const RESERVED = new Set(["id", "kind", "type", "provenance", "verification", "relations"]);

/**
 * Extracts every declared entity, enforces identity uniqueness, then resolves relations and
 * binds provenance. `review` is permitted by the entity schemas but stays in `fields` (D16).
 */
export async function buildProjectModel(
  loaded: LoadedSpec,
  schemas: SchemaSet,
  diags: Diagnostics,
  adapters: Record<string, SourceAdapter> = DEFAULT_ADAPTERS,
): Promise<ProjectModel | null> {
  const entities: Entity[] = [];
  const byId = new Map<string, Entity>();
  const rawRelations = new Map<string, Record<string, unknown>>();
  const locations = new Map<string, EntityLocation>();
  let failed = false;

  for (const input of loaded.project.manifest.inputs) {
    const document = loaded.documents[input.path];
    if (document === undefined) continue; // optional input that is absent

    for (const decl of input.entities) {
      const list = resolvePointer(document, decl.pointer);
      if (!Array.isArray(list)) {
        diags.error(
          "core.extract.pointer",
          input.path,
          decl.pointer,
          `Указатель "${decl.pointer}" не ведёт к массиву объектов`,
        );
        failed = true;
        continue;
      }

      const kindDecl = loaded.project.profile.entityKinds[decl.kind];
      if (kindDecl === undefined) {
        diags.error(
          "core.profile.unknown-kind",
          input.path,
          decl.pointer,
          `Вид "${decl.kind}" не объявлен в профиле`,
        );
        failed = true;
        continue;
      }

      for (const [index, raw] of list.entries()) {
        const pointer = `${decl.pointer}/${index}`;
        if (!isObject(raw)) {
          diags.error("core.schema.entity", input.path, pointer, "Сущность должна быть объектом");
          failed = true;
          continue;
        }

        if (
          !validateEntityValue(schemas, kindDecl.schema, raw, { file: input.path, pointer }, diags)
        ) {
          failed = true;
          continue;
        }

        const identityField = kindDecl.identity ?? "id";
        const id = raw[identityField];
        if (!isNonEmptyString(id)) {
          diags.error(
            "core.identity.missing",
            input.path,
            `${pointer}/${identityField}`,
            `Идентификатор "${identityField}" отсутствует или пуст`,
          );
          failed = true;
          continue;
        }
        if (byId.has(id)) {
          diags.error(
            "ERR_DUPLICATE_ID",
            input.path,
            `${pointer}/${identityField}`,
            `ID "${id}" уже объявлен`,
          );
          failed = true;
          continue;
        }

        const fields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(raw)) {
          if (!RESERVED.has(key)) fields[key] = value;
        }

        const entity: Entity = {
          id,
          kind: decl.kind,
          fields,
          relations: {},
          ...(isNonEmptyString(raw.type) ? { type: raw.type } : {}),
        };
        if (isObject(raw.relations)) rawRelations.set(id, raw.relations);

        entities.push(entity);
        byId.set(id, entity);
        locations.set(id, { file: input.path, pointer });
      }
    }
  }

  if (failed) return null;

  const byKind = new Map<string, Entity[]>();
  for (const entity of entities) {
    const list = byKind.get(entity.kind) ?? [];
    list.push(entity);
    byKind.set(entity.kind, list);
  }

  const sources = await loadSources(loaded.project, diags, adapters);
  if (sources === null) return null;

  const relations = resolveRelations(
    entities,
    rawRelations,
    locations,
    loaded.project.profile,
    byId,
    diags,
  );
  if (relations === null) return null;

  if (
    !bindProvenance(entities, locations, loaded.project.profile, loaded.project.manifest, diags)
  ) {
    return null;
  }

  return {
    manifest: loaded.project.manifest,
    profile: loaded.project.profile,
    sources,
    entities,
    documents: loaded.byKey,
    byId,
    byKind,
    relations,
  };
}

async function loadSources(
  project: LoadedSpec["project"],
  diags: Diagnostics,
  adapters: Record<string, SourceAdapter>,
): Promise<SourceDocument[] | null> {
  const sources: SourceDocument[] = [];
  for (const [index, decl] of (project.manifest.sources ?? []).entries()) {
    const adapter = adapters[decl.adapter];
    if (adapter === undefined) {
      diags.error(
        "core.registry.missing",
        "contract-builder.json",
        `/sources/${index}/adapter`,
        `Адаптер "${decl.adapter}" не зарегистрирован`,
      );
      return null;
    }

    const located = await resolveContained(project.root, decl.path);
    try {
      sources.push(
        await adapter.load(located.abs, {
          id: decl.id,
          adapter: decl.adapter,
          ...(decl.identity !== undefined ? { identity: decl.identity } : {}),
        }),
      );
    } catch (error) {
      diags.error("ERR_IO", decl.path, "", `Не удалось прочитать источник: ${messageOf(error)}`);
      return null;
    }
  }
  return sources;
}

/** RFC 6901 JSON Pointer resolution; `~1` is `/` and `~0` is `~`. */
export function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === "") return document;
  if (!pointer.startsWith("/")) return undefined;

  let current: unknown = document;
  for (const token of pointer.slice(1).split("/")) {
    // RFC 6901: "~" is only valid before "0" or "1".
    if (/~(?![01])/.test(token)) return undefined;
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      // RFC 6901: an array index is "0" or a non-zero digit followed by digits.
      if (!/^(0|[1-9][0-9]*)$/.test(key)) return undefined;
      current = current[Number(key)];
    } else if (isObject(current)) {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}
