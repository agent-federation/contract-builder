/**
 * CORE-000 -> PAP v0.1 claims (C2): provenance bindings and relation consistency.
 *
 * PAP provenance is a byte range into the raw packaged source, not the engine's
 * structural locator. This module therefore resolves each declared CORE-000 source
 * quote in the packaged source bytes itself: exact bytes first, then a
 * whitespace-normalized match that is mapped back to the exact raw span. A missing,
 * ambiguous or duplicate quote fails packaging; a binding is never invented or
 * skipped.
 *
 * Relations are produced from the CORE-000 documents through a fixed supported
 * relation map. The map mirrors the CORE-000 profile's declared relation kinds and
 * inverses; a relation that is not in the map fails packaging instead of producing
 * a partial graph. Inverse edges are emitted explicitly so PAP's
 * `pap.check.relation-consistency/1` sees a complete bidirectional graph.
 */

import { canonicalJson, domainHash, utf8, type Digest } from "./mapping.js";
import YAML from "yaml";

export const CLAIMS_VERSION = "0.1" as const;
export const PROVENANCE_CLAIM_PATH = "claims/provenance.json" as const;
export const RELATIONS_CLAIM_PATH = "claims/relations.json" as const;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export interface ProvenanceBinding {
  readonly id: string;
  readonly entityId: string;
  readonly sourceId: string;
  readonly locator: { readonly kind: "byte-range"; readonly start: number; readonly end: number };
  readonly quote: { readonly normalization: "none"; readonly digest: Digest };
}

export interface ProvenanceClaim {
  readonly papClaimsVersion: "0.1";
  readonly bindings: readonly ProvenanceBinding[];
}

export interface RelationEntity {
  readonly id: string;
  readonly kind: string;
}

export interface RelationDeclaration {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly inverse?: string;
}

export interface RelationEdge {
  readonly relation: string;
  readonly from: string;
  readonly to: string;
}

export interface RelationsClaim {
  readonly papClaimsVersion: "0.1";
  readonly entities: readonly RelationEntity[];
  readonly relations: readonly RelationDeclaration[];
  readonly edges: readonly RelationEdge[];
}

export interface ClaimFile<T> {
  readonly kind: "provenance" | "relations";
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly value: T;
}

export interface ClaimSource {
  readonly id: string;
  /** Raw packaged source bytes; never normalized. */
  readonly bytes: Uint8Array;
}

export interface Core000ClaimInput {
  /** Declared CORE-000 input bytes keyed by their project-relative manifest path. */
  readonly inputBytes: ReadonlyMap<string, Uint8Array>;
  readonly source: ClaimSource;
}

export interface Core000ClaimPlan {
  readonly provenance: ClaimFile<ProvenanceClaim>;
  readonly relations: ClaimFile<RelationsClaim>;
}

export interface SupportedRelation {
  readonly name: string;
  readonly from: string;
  /** "*" means any declared entity kind; such a relation is projected per target kind. */
  readonly to: string;
  readonly inverse?: string;
}

/**
 * Fixed CORE-000 relation map. This is deliberately not derived from the profile at
 * runtime: a profile relation this map does not know about must fail packaging rather
 * than silently disappear from the package claims.
 */
export const SUPPORTED_RELATIONS: ReadonlyMap<string, SupportedRelation> = new Map(
  [
    { name: "provides", from: "component", to: "interface", inverse: "providedBy" },
    { name: "providedBy", from: "interface", to: "component", inverse: "provides" },
    { name: "subject", from: "claim", to: "*" },
    { name: "cites", from: "claim", to: "source_statement", inverse: "citedBy" },
    { name: "citedBy", from: "source_statement", to: "claim", inverse: "cites" },
    { name: "evidencedBy", from: "claim", to: "evidence", inverse: "supports" },
    { name: "supports", from: "evidence", to: "claim", inverse: "evidencedBy" },
    { name: "decidedBy", from: "claim", to: "decision", inverse: "decides" },
    { name: "decides", from: "decision", to: "claim", inverse: "decidedBy" },
    {
      name: "verifies",
      from: "independent_verification",
      to: "claim",
      inverse: "verifiedBy",
    },
    {
      name: "verifiedBy",
      from: "claim",
      to: "independent_verification",
      inverse: "verifies",
    },
    { name: "requires", from: "component", to: "dependency", inverse: "requiredBy" },
    { name: "requiredBy", from: "dependency", to: "component", inverse: "requires" },
    { name: "startsAt", from: "transition", to: "phase" },
    { name: "endsAt", from: "transition", to: "phase" },
    { name: "dependsOn", from: "claim", to: "claim", inverse: "dependedOnBy" },
    { name: "dependedOnBy", from: "claim", to: "claim", inverse: "dependsOn" },
    { name: "covers", from: "conformance_case", to: "claim", inverse: "coveredBy" },
    { name: "coveredBy", from: "claim", to: "conformance_case", inverse: "covers" },
    {
      name: "concerns",
      from: "trust_boundary",
      to: "extension_point",
      inverse: "guardedBy",
    },
    {
      name: "guardedBy",
      from: "extension_point",
      to: "trust_boundary",
      inverse: "concerns",
    },
    { name: "exposes", from: "extension_point", to: "interface", inverse: "exposedBy" },
    { name: "exposedBy", from: "interface", to: "extension_point", inverse: "exposes" },
    { name: "loadedBy", from: "extension_point", to: "component", inverse: "loads" },
    { name: "loads", from: "component", to: "extension_point", inverse: "loadedBy" },
    { name: "supersedes", from: "claim", to: "claim", inverse: "supersededBy" },
    { name: "supersededBy", from: "claim", to: "claim", inverse: "supersedes" },
    { name: "raisedIn", from: "diagnostic", to: "phase" },
    { name: "hasPrerequisite", from: "phase", to: "phase" },
  ].map((relation) => [relation.name, relation as SupportedRelation] as const),
);

export interface ResolvedQuote {
  readonly start: number;
  readonly end: number;
  readonly digest: Digest;
}

export function quoteDigest(bytes: Uint8Array): Digest {
  return domainHash("pap.quote.v1", bytes);
}

export function claimDigest(bytes: Uint8Array): Digest {
  return domainHash("pap.claims.v1", bytes);
}

/**
 * Build both C2 claim files from the packaged inputs and the raw packaged source.
 * Every failure is a producer defect: the caller must abort packaging rather than
 * write a partial package.
 */
export function buildCore000Claims(input: Core000ClaimInput): Core000ClaimPlan {
  const manifest = readManifest(input.inputBytes);
  const entities = readEntities(manifest, input.inputBytes);
  const provenance = buildProvenanceClaim(entities, input.source, manifest);
  const relations = buildRelationsClaim(entities);
  return {
    provenance: claimFile("provenance", PROVENANCE_CLAIM_PATH, provenance),
    relations: claimFile("relations", RELATIONS_CLAIM_PATH, relations),
  };
}

interface RawRelationEntity {
  readonly id: string;
  readonly kind: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly relations: Readonly<Record<string, unknown>>;
}

interface ManifestInputDeclaration {
  readonly path: string;
  readonly format: string;
  readonly entities: readonly { readonly kind: string; readonly pointer: string }[];
}

interface Core000Manifest {
  readonly inputs: readonly ManifestInputDeclaration[];
  readonly sourceIds: ReadonlySet<string>;
}

interface NormalizedSource {
  readonly text: string;
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

function claimFile<T>(
  kind: "provenance" | "relations",
  path: string,
  value: T,
): ClaimFile<T> {
  return {
    kind,
    path,
    bytes: utf8(`${canonicalJson(value)}\n`),
    value,
  };
}

function readManifest(inputBytes: ReadonlyMap<string, Uint8Array>): Core000Manifest {
  const bytes = inputBytes.get("contract-builder.json");
  if (bytes === undefined) {
    throw new Error("claims: contract-builder.json is not a packaged input");
  }
  const manifest = parseJson(bytes, "contract-builder.json");
  if (!isObject(manifest)) {
    throw new Error("claims: contract-builder.json must be an object");
  }

  const inputs: ManifestInputDeclaration[] = [];
  if (!Array.isArray(manifest.inputs)) {
    throw new Error("claims: contract-builder.json declares no inputs array");
  }
  for (const [index, raw] of manifest.inputs.entries()) {
    if (!isObject(raw)) {
      throw new Error(`claims: inputs[${index}] must be an object`);
    }
    const path = requireString(raw.path, `inputs[${index}].path`);
    const format = requireString(raw.format, `inputs[${index}].format`);
    if (format !== "yaml" && format !== "json") {
      throw new Error(`claims: inputs[${index}].format "${format}" is not supported`);
    }
    const declarations = raw.entities;
    if (!Array.isArray(declarations)) {
      throw new Error(`claims: inputs[${index}].entities must be an array`);
    }
    const entities: { kind: string; pointer: string }[] = [];
    for (const [position, declaration] of declarations.entries()) {
      if (!isObject(declaration)) {
        throw new Error(`claims: inputs[${index}].entities[${position}] must be an object`);
      }
      entities.push({
        kind: requireString(declaration.kind, `inputs[${index}].entities[${position}].kind`),
        pointer: requireString(
          declaration.pointer,
          `inputs[${index}].entities[${position}].pointer`,
        ),
      });
    }
    inputs.push({ path, format, entities });
  }

  const sourceIds = new Set<string>();
  if (!Array.isArray(manifest.sources)) {
    throw new Error("claims: contract-builder.json declares no sources array");
  }
  for (const [index, raw] of manifest.sources.entries()) {
    if (!isObject(raw)) {
      throw new Error(`claims: sources[${index}] must be an object`);
    }
    sourceIds.add(requireString(raw.id, `sources[${index}].id`));
  }

  return { inputs, sourceIds };
}

function readEntities(
  manifest: Core000Manifest,
  inputBytes: ReadonlyMap<string, Uint8Array>,
): RawRelationEntity[] {
  const entities: RawRelationEntity[] = [];
  const byId = new Map<string, RawRelationEntity>();

  for (const input of manifest.inputs) {
    const bytes = inputBytes.get(input.path);
    if (bytes === undefined) {
      throw new Error(`claims: declared input "${input.path}" is not packaged`);
    }
    const document =
      input.format === "json"
        ? parseJson(bytes, input.path)
        : parseYaml(bytes, input.path);

    for (const declaration of input.entities) {
      const list = resolvePointer(document, declaration.pointer, input.path);
      if (!Array.isArray(list)) {
        throw new Error(
          `claims: ${input.path}${declaration.pointer} must be an array of ${declaration.kind} entities`,
        );
      }
      for (const [index, raw] of list.entries()) {
        if (!isObject(raw)) {
          throw new Error(
            `claims: ${input.path}${declaration.pointer}/${index} must be an object`,
          );
        }
        const id = requireString(raw.id, `${input.path}${declaration.pointer}/${index}/id`);
        if (byId.has(id)) {
          throw new Error(`claims: entity id "${id}" is declared more than once`);
        }
        const relations = raw.relations;
        if (relations !== undefined && !isObject(relations)) {
          throw new Error(`claims: entity "${id}" relations must be an object`);
        }
        const fields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(raw)) {
          if (key === "relations") continue;
          fields[key] = value;
        }
        const entity: RawRelationEntity = {
          id,
          kind: declaration.kind,
          fields,
          relations: (relations ?? {}) as Record<string, unknown>,
        };
        entities.push(entity);
        byId.set(id, entity);
      }
    }
  }

  return entities;
}

function buildProvenanceClaim(
  entities: readonly RawRelationEntity[],
  source: ClaimSource,
  manifest: Core000Manifest,
): ProvenanceClaim {
  if (!manifest.sourceIds.has(source.id)) {
    throw new Error(
      `claims: source "${source.id}" is not declared in contract-builder.json`,
    );
  }

  const statements = entities
    .filter((entity) => entity.kind === "source_statement")
    .sort((a, b) => compareStrings(a.id, b.id));
  const bindings: ProvenanceBinding[] = [];
  const seenBindings = new Set<string>();
  const seenTuples = new Set<string>();

  for (const statement of statements) {
    const sourceId = requireString(statement.fields.source, `${statement.id}.source`);
    const reference = requireString(statement.fields.source_ref, `${statement.id}.source_ref`);
    const quote = requireString(statement.fields.source_quote, `${statement.id}.source_quote`);
    if (sourceId !== source.id) {
      throw new Error(
        `claims: source statement ${statement.id} names source "${sourceId}" but the package carries "${source.id}"`,
      );
    }
    const resolved = resolveExactQuote(source.bytes, quote, `${statement.id} (${reference})`);
    const id = `binding:${statement.id}`;
    if (seenBindings.has(id)) {
      throw new Error(`claims: duplicate provenance binding id "${id}"`);
    }
    seenBindings.add(id);
    const tuple = `${statement.id}\u0000${sourceId}\u0000${resolved.start}\u0000${resolved.end}`;
    if (seenTuples.has(tuple)) {
      throw new Error(`claims: duplicate provenance binding tuple for ${statement.id}`);
    }
    seenTuples.add(tuple);
    bindings.push({
      id,
      entityId: statement.id,
      sourceId,
      locator: { kind: "byte-range", start: resolved.start, end: resolved.end },
      quote: { normalization: "none", digest: resolved.digest },
    });
  }

  return { papClaimsVersion: CLAIMS_VERSION, bindings };
}

function buildRelationsClaim(entities: readonly RawRelationEntity[]): RelationsClaim {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const declarations = new Map<string, RelationDeclaration>();
  const edges = new Map<string, RelationEdge>();

  const addDeclaration = (declaration: RelationDeclaration): void => {
    const previous = declarations.get(declaration.name);
    if (previous === undefined) {
      declarations.set(declaration.name, declaration);
      return;
    }
    if (
      previous.from !== declaration.from ||
      previous.to !== declaration.to ||
      previous.inverse !== declaration.inverse
    ) {
      throw new Error(
        `claims: relation "${declaration.name}" has conflicting declarations (${previous.from}->${previous.to} vs ${declaration.from}->${declaration.to})`,
      );
    }
  };
  const addEdge = (edge: RelationEdge): void => {
    edges.set(
      `${edge.relation}\u0000${edge.from}\u0000${edge.to}`,
      edge,
    );
  };

  for (const entity of entities) {
    for (const [name, rawTargets] of Object.entries(entity.relations)) {
      const relation = SUPPORTED_RELATIONS.get(name);
      if (relation === undefined) {
        throw new Error(
          `claims: unsupported relation kind "${name}" on entity ${entity.id}`,
        );
      }
      if (relation.from !== entity.kind) {
        throw new Error(
          `claims: relation "${name}" on ${entity.id} expects from kind "${relation.from}", got "${entity.kind}"`,
        );
      }
      const targets = readTargets(rawTargets, entity.id, name);
      const seen = new Set<string>();
      for (const targetId of targets) {
        if (seen.has(targetId)) continue;
        seen.add(targetId);
        const target = byId.get(targetId);
        if (target === undefined) {
          throw new Error(
            `claims: relation "${name}" on ${entity.id} targets undeclared entity "${targetId}"`,
          );
        }
        if (relation.to !== "*" && target.kind !== relation.to) {
          throw new Error(
            `claims: relation "${name}" on ${entity.id} targets ${targetId} of kind "${target.kind}", expected "${relation.to}"`,
          );
        }

        const papName = relation.to === "*" ? `${relation.name}:${target.kind}` : relation.name;
        addEdge({ relation: papName, from: entity.id, to: target.id });
        addDeclaration({
          name: papName,
          from: entity.kind,
          to: target.kind,
          ...(relation.inverse === undefined ? {} : { inverse: relation.inverse }),
        });

        if (relation.inverse === undefined) continue;
        const inverse = SUPPORTED_RELATIONS.get(relation.inverse);
        if (inverse === undefined || inverse.inverse !== relation.name) {
          throw new Error(
            `claims: supported relation map is not reciprocal for "${relation.name}"`,
          );
        }
        if (inverse.from !== target.kind || inverse.to !== entity.kind) {
          throw new Error(
            `claims: relation ${name} cannot invert ${target.kind}->${entity.kind} as "${inverse.name}"`,
          );
        }
        addEdge({ relation: inverse.name, from: target.id, to: entity.id });
        addDeclaration({
          name: inverse.name,
          from: target.kind,
          to: entity.kind,
          inverse: relation.name,
        });
      }
    }
  }

  return {
    papClaimsVersion: CLAIMS_VERSION,
    entities: [...entities]
      .map((entity) => ({ id: entity.id, kind: entity.kind }))
      .sort((a, b) => compareStrings(a.id, b.id)),
    relations: [...declarations.values()].sort((a, b) =>
      compareStrings(a.name, b.name),
    ),
    edges: [...edges.values()].sort((a, b) => {
      const relation = compareStrings(a.relation, b.relation);
      if (relation !== 0) return relation;
      const from = compareStrings(a.from, b.from);
      return from !== 0 ? from : compareStrings(a.to, b.to);
    }),
  };
}

function readTargets(
  value: unknown,
  entityId: string,
  name: string,
): readonly string[] {
  if (typeof value === "string" && value.length > 0) return [value];
  if (
    Array.isArray(value) &&
    value.every((target): target is string => typeof target === "string" && target.length > 0)
  ) {
    return value;
  }
  throw new Error(
    `claims: relation "${name}" on ${entityId} must be a non-empty string or an array of ids`,
  );
}

/**
 * Resolve a declared quote to the exact raw source span it names.
 *
 * Exact source bytes win. When the declaration is whitespace-collapsed (all CORE-000
 * statements are), a whitespace-normalized match is mapped back to the first and last
 * source byte of the matched text, so the digest always covers packaged source bytes.
 */
export function resolveExactQuote(
  sourceBytes: Uint8Array,
  quote: string,
  label = "quote",
): ResolvedQuote {
  if (quote.length === 0) {
    throw new Error(`claims: ${label} is empty`);
  }
  const quoteBytes = encoder.encode(quote);
  const exact = occurrenceOffsets(sourceBytes, quoteBytes);
  if (exact.length > 1) {
    throw new Error(
      `claims: ${label} is ambiguous in the source (${exact.length} exact matches)`,
    );
  }

  const normalizedQuote = normalizeWhitespace(quote);
  if (normalizedQuote.length === 0) {
    throw new Error(`claims: ${label} is missing from the source`);
  }
  const normalized = normalizeSource(sourceBytes);
  const matches: number[] = [];
  let position = normalized.text.indexOf(normalizedQuote);
  while (position !== -1) {
    matches.push(position);
    position = normalized.text.indexOf(normalizedQuote, position + 1);
  }
  if (matches.length > 1) {
    throw new Error(
      `claims: ${label} is ambiguous in the source (${matches.length} whitespace-normalized matches)`,
    );
  }

  if (matches.length === 1) {
    const index = matches[0] as number;
    const start = normalized.starts[index];
    const end = normalized.ends[index + normalizedQuote.length - 1];
    if (start === undefined || end === undefined) {
      throw new Error(`claims: could not map ${label} to source bytes`);
    }
    if (
      exact.length === 1 &&
      (start !== exact[0] || end !== (exact[0] as number) + quoteBytes.length)
    ) {
      throw new Error(
        `claims: ${label} is ambiguous in the source (exact and whitespace-normalized matches differ)`,
      );
    }
    return resolveRange(sourceBytes, start, end);
  }

  if (exact.length === 1) {
    const start = exact[0] as number;
    return resolveRange(sourceBytes, start, start + quoteBytes.length);
  }

  throw new Error(
    `claims: ${label} is missing from the source (no exact or whitespace-normalized match)`,
  );
}

function resolveRange(sourceBytes: Uint8Array, start: number, end: number): ResolvedQuote {
  if (start < 0 || end <= start || end > sourceBytes.length) {
    throw new Error(
      `claims: resolved source range [${start}, ${end}) is outside the ${sourceBytes.length} source bytes`,
    );
  }
  return {
    start,
    end,
    digest: quoteDigest(sourceBytes.subarray(start, end)),
  };
}

function normalizeSource(bytes: Uint8Array): NormalizedSource {
  const text = decoder.decode(bytes);
  const starts: number[] = [];
  const ends: number[] = [];
  let normalized = "";
  let offset = 0;
  let pendingWhitespace = false;

  for (const character of text) {
    const byteLength = utf8(character).length;
    if (/\s/u.test(character)) {
      pendingWhitespace = true;
    } else {
      if (pendingWhitespace && normalized.length > 0) {
        normalized += " ";
        starts.push(offset);
        ends.push(offset);
      }
      pendingWhitespace = false;
      normalized += character;
      starts.push(offset);
      ends.push(offset + byteLength);
    }
    offset += byteLength;
  }

  return { text: normalized, starts, ends };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function occurrenceOffsets(haystack: Uint8Array, needle: Uint8Array): number[] {
  if (needle.length === 0) return [];
  const offsets: number[] = [];
  const hay = Buffer.from(haystack);
  const pin = Buffer.from(needle);
  let position = hay.indexOf(pin);
  while (position !== -1) {
    offsets.push(position);
    position = hay.indexOf(pin, position + 1);
  }
  return offsets;
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(`claims: ${label} is not valid JSON: ${messageOf(error)}`);
  }
}

function parseYaml(bytes: Uint8Array, label: string): unknown {
  try {
    return YAML.parse(decoder.decode(bytes)) as unknown;
  } catch (error) {
    throw new Error(`claims: ${label} is not valid YAML: ${messageOf(error)}`);
  }
}

function resolvePointer(document: unknown, pointer: string, label: string): unknown {
  if (pointer === "") return document;
  if (!pointer.startsWith("/")) {
    throw new Error(`claims: ${label} pointer "${pointer}" must start with "/"`);
  }
  let current = document;
  for (const token of pointer.slice(1).split("/")) {
    const key = token.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (!isObject(current) || !(key in current)) {
      throw new Error(`claims: ${label} pointer "${pointer}" does not resolve`);
    }
    current = current[key];
  }
  return current;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`claims: ${label} must be a non-empty string`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
