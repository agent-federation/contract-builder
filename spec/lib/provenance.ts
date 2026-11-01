import type { Diagnostics } from "./diagnostics.js";
import { isNonEmptyString, isObject } from "./guards.js";
import type { Entity, EntityLocation } from "./ir.js";
import type { Manifest, Profile } from "./manifest.js";

/**
 * Binds direct provenance for the kinds the profile maps. The selectors are read from
 * `Entity.fields` and stay there: mappings are projections, not moves. Provenance that is
 * mediated by another entity has no mapping and is not bound here.
 */
export function bindProvenance(
  entities: Entity[],
  locations: ReadonlyMap<string, EntityLocation>,
  profile: Profile,
  manifest: Manifest,
  diags: Diagnostics,
): boolean {
  const mappings = profile.provenance ?? [];
  if (mappings.length === 0) return true;

  const declaredSources = new Set((manifest.sources ?? []).map((source) => source.id));
  let ok = true;

  for (const mapping of mappings) {
    for (const entity of entities) {
      if (entity.kind !== mapping.kind) continue;
      const location = locations.get(entity.id) ?? { file: "", pointer: "" };

      const source = readSelector(entity.fields, mapping.source);
      const ref = readSelector(entity.fields, mapping.ref);
      const quote = readSelector(entity.fields, mapping.quote);

      if (!isNonEmptyString(source) || !isNonEmptyString(ref) || !isNonEmptyString(quote)) {
        diags.error(
          "core.provenance.incomplete",
          location.file,
          location.pointer,
          `Происхождение "${entity.id}" неполно: нужны ${mapping.source}, ${mapping.ref} и ${mapping.quote}`,
        );
        ok = false;
        continue;
      }

      if (!declaredSources.has(source)) {
        diags.error(
          "ERR_UNKNOWN_REF",
          location.file,
          `${location.pointer}/${mapping.source}`,
          `Неизвестный источник "${source}"`,
        );
        ok = false;
        continue;
      }

      entity.provenance = { source, ref, quote };
    }
  }

  return ok;
}

function readSelector(fields: Record<string, unknown>, selector: string): unknown {
  if (!selector.includes(".")) return fields[selector];

  let current: unknown = fields;
  for (const part of selector.split(".")) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return current;
}
