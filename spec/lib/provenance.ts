import { createHash } from "node:crypto";
import type { Diagnostics } from "./diagnostics.js";
import type { LocalizedMessage } from "./messages.js";
import { isNonEmptyString, isObject } from "./guards.js";
import type {
  Entity,
  EntityLocation,
  ProjectModel,
  ProvenanceBinding,
  ProvenanceVerification,
  ProvenanceVerificationStatus,
} from "./ir.js";
import type { Manifest, ManifestSource, Profile } from "./manifest.js";
import type { SourceDocument } from "./source.js";

/**
 * A claim produced by a profile verifier. The core resolves the entity binding from
 * `entityId`, checks the record shape, and compares `sourceDigest` with the bytes that
 * are actually loaded before storing the result on the entity.
 */
export interface ProvenanceVerificationClaim {
  entityId: string;
  status: ProvenanceVerificationStatus;
  verifier: string | null;
  method: string;
  checkedAt: string | null;
  sourceVersion: string | null;
  sourceDigest: string | null;
  outcome: string;
}

const STATUSES: readonly ProvenanceVerificationStatus[] = [
  "verified",
  "failed",
  "unavailable",
  "stale",
];

/** SHA-256 of the source bytes a verification result describes. */
export function sourceDigest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** A manifest-declared source version, or null when the project does not declare one. */
export function sourceVersionOf(source: ManifestSource | undefined): string | null {
  const document = source?.identity?.document;
  const revision = source?.identity?.revision;
  if (isNonEmptyString(document) && isNonEmptyString(revision)) {
    return `${document} (Rev ${revision})`;
  }
  if (isNonEmptyString(revision)) return revision;
  return null;
}

/**
 * The record attached by binding alone. It states explicitly that no verifier ran, so a
 * consumer can never read a structurally valid binding as verified evidence.
 */
export function notCheckedVerification(
  entityId: string,
  source: string,
  ref: string,
  sourceVersion: string | null,
): ProvenanceVerification {
  return {
    status: "unavailable",
    record: {
      entity: entityId,
      source,
      ref,
      verifier: null,
      method: "none",
      checkedAt: null,
      sourceVersion,
      sourceDigest: null,
      outcome: "not-checked",
    },
  };
}

/**
 * Binds direct provenance for the kinds the profile maps. The selectors are read from
 * `Entity.fields` and stay there: mappings are projections, not moves. Provenance that is
 * mediated by another entity has no mapping and is not bound here.
 *
 * Binding is structural only. It attaches a `not-checked` verification record; it never
 * performs or implies quote verification.
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

  const sources = new Map((manifest.sources ?? []).map((source) => [source.id, source]));
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
          "core.provenance.incomplete#provenance-incomplete",
          location.file,
          location.pointer,
          { entityId: entity.id, source: mapping.source, ref: mapping.ref, quote: mapping.quote },
        );
        ok = false;
        continue;
      }

      const declared = sources.get(source);
      if (declared === undefined) {
        diags.error(
          "ERR_UNKNOWN_REF#unknown-source",
          location.file,
          `${location.pointer}/${mapping.source}`,
          { source: source },
        );
        ok = false;
        continue;
      }

      entity.provenance = { source, ref, quote };
      entity.verification = notCheckedVerification(
        entity.id,
        source,
        ref,
        sourceVersionOf(declared),
      );
    }
  }

  return ok;
}

/**
 * Stores profile verification claims on the model. A `verified` or `failed` claim is only
 * trustworthy for the bytes it names: without a digest it becomes `unavailable`, and with a
 * different digest than the currently loaded source it becomes `stale`. The core never
 * invents a verifier, method, time or outcome.
 */
export function applyVerificationClaims(
  model: ProjectModel,
  sources: readonly SourceDocument[],
  claims: readonly ProvenanceVerificationClaim[],
  diags: Diagnostics,
): boolean {
  const digests = new Map(sources.map((source) => [source.id, sourceDigest(source.bytes)]));
  let ok = true;

  for (const claim of claims) {
    const entity = model.byId.get(claim.entityId);
    const binding = entity?.provenance;

    if (entity === undefined || binding === undefined) {
      diags.error("core.provenance.verification#verification-binding-missing", "profile.json", "", {
        entityId: claim.entityId,
      });
      ok = false;
      continue;
    }

    const problem = invalidClaim(claim);
    if (problem !== null) {
      diags.error("core.provenance.verification#verification-invalid", "profile.json", "", {
        entityId: claim.entityId,
        problem,
      });
      ok = false;
      continue;
    }

    const currentDigest = digests.get(binding.source) ?? null;
    const status = settleStatus(claim, currentDigest);
    if (status === null) {
      diags.error("core.provenance.verification#verification-stale-digest", "profile.json", "", {
        entityId: claim.entityId,
      });
      ok = false;
      continue;
    }

    entity.verification = {
      status,
      record: {
        entity: entity.id,
        source: binding.source,
        ref: binding.ref,
        verifier: claim.verifier,
        method: claim.method,
        checkedAt: claim.checkedAt,
        sourceVersion: claim.sourceVersion,
        sourceDigest: claim.sourceDigest,
        outcome: claim.outcome,
      },
    };
  }

  return ok;
}

/** Returns a localized problem with the claim, or null when its shape is valid. */
function invalidClaim(claim: ProvenanceVerificationClaim): LocalizedMessage | null {
  const detail = (en: string, ru: string): LocalizedMessage => ({ en, ru });
  if (!STATUSES.includes(claim.status)) {
    return detail(`unknown status "${claim.status}"`, `неизвестный статус "${claim.status}"`);
  }
  if (!isNonEmptyString(claim.method)) {
    return detail("method must be a non-empty string", "method должен быть непустой строкой");
  }
  if (!isNonEmptyString(claim.outcome)) {
    return detail("outcome must be a non-empty string", "outcome должен быть непустой строкой");
  }
  if (claim.verifier !== null && !isNonEmptyString(claim.verifier)) {
    return detail("verifier must be a string or null", "verifier должен быть строкой или null");
  }
  if (claim.checkedAt !== null && !isNonEmptyString(claim.checkedAt)) {
    return detail("checkedAt must be a string or null", "checkedAt должен быть строкой или null");
  }
  if (claim.sourceVersion !== null && !isNonEmptyString(claim.sourceVersion)) {
    return detail(
      "sourceVersion must be a string or null",
      "sourceVersion должен быть строкой или null",
    );
  }
  if (claim.sourceDigest !== null && !/^sha256:[0-9a-f]{64}$/.test(claim.sourceDigest)) {
    return detail(
      'sourceDigest must be "sha256:<64 hex>" or null',
      'sourceDigest должен быть "sha256:<64 hex>" или null',
    );
  }
  if (claim.status === "stale" && claim.sourceDigest === null) {
    return detail("stale requires sourceDigest", "stale требует sourceDigest");
  }

  // A checked status is evidence that a verifier ran and produced an outcome. A record that
  // says "no verifier" and "not checked" cannot also claim verified/failed/stale.
  const checked =
    claim.status === "verified" || claim.status === "failed" || claim.status === "stale";
  if (checked) {
    if (!isNonEmptyString(claim.verifier)) {
      return detail(
        `${claim.status} requires a non-empty verifier`,
        `${claim.status} требует непустой verifier`,
      );
    }
    if (claim.method === "none") {
      return detail(
        `${claim.status} requires a method other than "none"`,
        `${claim.status} требует method, отличный от "none"`,
      );
    }
    if (claim.outcome === "not-checked") {
      return detail(
        `${claim.status} requires an outcome other than "not-checked"`,
        `${claim.status} требует outcome, отличный от "not-checked"`,
      );
    }
  }
  return null;
}

/**
 * Resolves the status a claim may carry for the current source bytes. Returns null when the
 * claim contradicts itself (a stale claim whose digest matches the current source).
 */
function settleStatus(
  claim: ProvenanceVerificationClaim,
  currentDigest: string | null,
): ProvenanceVerificationStatus | null {
  if (claim.status === "unavailable") return "unavailable";

  if (claim.sourceDigest === null) {
    // No evidence about which bytes the outcome covers: it cannot be verified evidence.
    return claim.status === "stale" ? null : "unavailable";
  }

  if (currentDigest === null) return "unavailable";
  if (claim.sourceDigest !== currentDigest) return "stale";

  return claim.status === "stale" ? null : claim.status;
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
