import type { Diagnostics } from "./diagnostics.js";
import { isNonEmptyString } from "./guards.js";
import type { Entity, EntityLocation, RelationIndex } from "./ir.js";
import type { Profile } from "./manifest.js";

/**
 * Validates every `RelationDecl` endpoint, then resolves keys inside each entity's reserved
 * `relations` object. Declaration errors stop resolution; an undeclared key or a bad target
 * is reported against the entity.
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

  for (const entity of entities) {
    const raw = rawRelations.get(entity.id);
    if (raw === undefined) continue;
    const location = locations.get(entity.id) ?? { file: "", pointer: "" };

    for (const [name, value] of Object.entries(raw)) {
      const decl = declarations.find((item) => item.name === name && item.from === entity.kind);
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

      entity.relations[name] = resolved;
      addToIndex(index, name, entity.kind, resolved);

      if (decl.inverse !== undefined) {
        for (const targetId of resolved) {
          const target = byId.get(targetId);
          if (target === undefined) continue;
          const list = target.relations[decl.inverse] ?? [];
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
