import type { Diagnostics } from "./diagnostics.js";
import { isNonEmptyString } from "./guards.js";
import type { Entity, EntityLocation, RelationIndex } from "./ir.js";
import type { Profile, RelationDecl } from "./manifest.js";

/**
 * Validates every `RelationDecl` endpoint, then resolves keys inside each entity's reserved
 * `relations` object. Declaration errors stop resolution; an undeclared key or a bad target
 * is reported against the entity. A declared inverse is appended to its target in input order
 * and obeys its own declared cardinality.
 */
export function resolveRelations(
  entities: Entity[],
  rawRelations: ReadonlyMap<string, Record<string, unknown>>,
  locations: ReadonlyMap<string, EntityLocation>,
  profile: Profile,
  byId: ReadonlyMap<string, Entity>,
  diags: Diagnostics,
): RelationIndex | null {
  const declarations = profile.relations ?? [];
  const index: RelationIndex = new Map();
  let failed = false;

  for (const [position, decl] of declarations.entries()) {
    if (!isDeclaredKind(profile, decl.from)) {
      diags.error(
        "core.profile.unknown-relation",
        "profile.json",
        `/relations/${position}/from`,
        `Связь "${decl.name}" ссылается на неизвестный вид "${decl.from}"`,
      );
      failed = true;
    }
    if (decl.to !== "*" && !isDeclaredKind(profile, decl.to)) {
      diags.error(
        "core.profile.unknown-relation",
        "profile.json",
        `/relations/${position}/to`,
        `Связь "${decl.name}" ссылается на неизвестный вид "${decl.to}"`,
      );
      failed = true;
    }
  }

  // A declaration that cannot be resolved would otherwise match nothing and silently accept
  // data, so resolution does not start.
  if (failed) return null;

  // Profile validation rejects a duplicate `(from, name)` declaration, so indexing by that
  // pair removes the first-match ambiguity a linear search would keep.
  const declarationsByFrom = new Map<string, Map<string, RelationDecl>>();
  for (const decl of declarations) {
    let byName = declarationsByFrom.get(decl.from);
    if (byName === undefined) {
      byName = new Map();
      declarationsByFrom.set(decl.from, byName);
    }
    if (!byName.has(decl.name)) byName.set(decl.name, decl);
  }

  const declaration = (from: string, name: string): RelationDecl | undefined =>
    declarationsByFrom.get(from)?.get(name);

  for (const entity of entities) {
    const raw = rawRelations.get(entity.id);
    if (raw === undefined) continue;
    const location = locations.get(entity.id) ?? { file: "", pointer: "" };

    for (const [name, value] of Object.entries(raw)) {
      const decl = declaration(entity.kind, name);
      if (decl === undefined) {
        diags.error(
          "core.relation.unknown",
          location.file,
          `${location.pointer}/relations/${name}`,
          `Связь "${name}" не объявлена для вида "${entity.kind}"`,
        );
        failed = true;
        continue;
      }

      if (decl.cardinality === "one" && Array.isArray(value)) {
        diags.error(
          "core.relation.cardinality",
          location.file,
          `${location.pointer}/relations/${name}`,
          `Связь "${name}" допускает одно значение, получен массив`,
        );
        failed = true;
        continue;
      }

      const targets = normalizeTargets(value);
      if (targets === null) {
        diags.error(
          "core.schema.entity",
          location.file,
          `${location.pointer}/relations/${name}`,
          `Значение связи "${name}" должно быть строкой или массивом строк`,
        );
        failed = true;
        continue;
      }

      const resolved: string[] = [];
      for (const [position, targetId] of targets.entries()) {
        const target = byId.get(targetId);
        if (target === undefined) {
          diags.error(
            "ERR_UNKNOWN_REF",
            location.file,
            `${location.pointer}/relations/${name}/${position}`,
            `Неизвестная цель связи "${targetId}"`,
          );
          failed = true;
          continue;
        }
        if (decl.to !== "*" && target.kind !== decl.to) {
          diags.error(
            "ERR_UNKNOWN_REF",
            location.file,
            `${location.pointer}/relations/${name}/${position}`,
            `Цель "${targetId}" имеет вид "${target.kind}", ожидается "${decl.to}"`,
          );
          failed = true;
          continue;
        }
        resolved.push(targetId);
      }

      // Relation targets are set semantics: a repeated id resolves once, preserving order.
      const unique = [...new Set(resolved)];
      entity.relations[name] = unique;
      addToIndex(index, name, entity.kind, unique);

      if (decl.inverse !== undefined) {
        const inverse = declaration(decl.to, decl.inverse);
        for (const targetId of unique) {
          const target = byId.get(targetId);
          if (target === undefined) continue;
          const list = target.relations[decl.inverse] ?? [];
          if (list.includes(entity.id)) continue;
          // The inverse is synthesized from the forward edges, so its declared cardinality
          // constrains the number of sources one target may receive. Both directions are
          // declared by profile validation, but a resolver called directly may not be.
          if (inverse?.cardinality === "one" && list.length > 0) {
            diags.error(
              "core.relation.cardinality",
              location.file,
              `${location.pointer}/relations/${name}`,
              `Обратная связь "${decl.inverse}" допускает одно значение, но на "${targetId}" ссылаются несколько сущностей`,
            );
            failed = true;
            continue;
          }
          list.push(entity.id);
          target.relations[decl.inverse] = list;
          addToIndex(index, decl.inverse, target.kind, [entity.id]);
        }
      }
    }
  }

  return failed ? null : index;
}

function isDeclaredKind(profile: Profile, kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(profile.entityKinds, kind);
}

function normalizeTargets(value: unknown): string[] | null {
  if (isNonEmptyString(value)) return [value];
  if (Array.isArray(value) && value.every(isNonEmptyString)) return value;
  return null;
}

function addToIndex(
  index: RelationIndex,
  name: string,
  from: string,
  targets: readonly string[],
): void {
  let byFrom = index.get(name);
  if (byFrom === undefined) {
    byFrom = new Map();
    index.set(name, byFrom);
  }
  let set = byFrom.get(from);
  if (set === undefined) {
    set = new Set();
    byFrom.set(from, set);
  }
  for (const target of targets) set.add(target);
}
