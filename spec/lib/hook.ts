import type { Diagnostics } from "./diagnostics.js";
import type { ProjectModel } from "./ir.js";
import type { ProvenanceVerificationClaim } from "./provenance.js";
import type { LocatorResult, SourceDocument } from "./source.js";

export interface ValidatorFinding {
  code: string;
  variant?: string;
  entityId?: string;
  location?: { file: string; pointer?: string };
  data?: Record<string, unknown>;
}

export interface ValidatorContext {
  /** Profile-owned view of the model, built by the profile's `view` module. */
  view: unknown;
  sources: readonly SourceDocument[];
  legacyText: string;
  legacyName: string;
  verifyQuote(sourceId: string, ref: string, quote: string): Promise<LocatorResult>;
}

/**
 * Inputs for the optional profile provenance verifier. The verifier resolves the quote
 * through the source adapter and reports what it did; the core validates the claim and
 * stores it as `Entity.verification`.
 */
export interface VerificationContext {
  sources: readonly SourceDocument[];
  legacyText: string;
  legacyName: string;
  verifyQuote(sourceId: string, ref: string, quote: string): Promise<LocatorResult>;
  /** "sha256:<hex>" of the currently loaded source bytes, or null when absent. */
  sourceDigest(sourceId: string): string | null;
  /** Manifest-declared source version, or null when unavailable. */
  sourceVersion(sourceId: string): string | null;
}

export interface ProfileValidator {
  validate(model: ProjectModel, ctx: ValidatorContext): Promise<ValidatorFinding[]>;
  /**
   * Optional profile-specific verification. It must not claim a status without an outcome,
   * method and the source digest the outcome covers. A profile that omits it leaves every
   * binding `unavailable`/`not-checked`.
   */
  verifyProvenance?(
    model: ProjectModel,
    ctx: VerificationContext,
  ): Promise<ProvenanceVerificationClaim[]>;
}

export interface ProfileViewModule<T = unknown> {
  requires?: string[];
  buildView(model: ProjectModel): T;
}

export interface DiagnosticCatalogEntry {
  code: string;
  variant?: string;
  severity: "error" | "warning" | "review";
  message: string;
  remediation?: string;
}

export interface DiagnosticCatalog {
  codes: DiagnosticCatalogEntry[];
}

/**
 * Resolves profile findings through the profile catalog: severity and message come from the
 * catalog, `{{name}}` from the finding's `data` first and the entity's fields second.
 */
export function resolveFindings(
  findings: readonly ValidatorFinding[],
  model: ProjectModel,
  catalog: DiagnosticCatalog,
  diags: Diagnostics,
): boolean {
  let ok = true;

  for (const finding of findings) {
    const entry = findEntry(catalog, finding);
    if (entry === undefined) {
      diags.error(
        "core.profile.unknown-code",
        "profile.json",
        "/diagnostics",
        `Код "${finding.code}"${finding.variant !== undefined ? ` (${finding.variant})` : ""} не объявлен в каталоге профиля`,
      );
      ok = false;
      continue;
    }

    const entity = finding.entityId !== undefined ? model.byId.get(finding.entityId) : undefined;
    const scope: Record<string, unknown> = {
      ...(entity !== undefined ? { id: entity.id, kind: entity.kind, ...entity.fields } : {}),
      ...(finding.data ?? {}),
    };

    const message = interpolate(entry.message, scope);
    if (message === null) {
      diags.error(
        "core.profile.invalid",
        "profile.json",
        "/diagnostics",
        `Сообщение "${entry.code}" ссылается на поле, которого нет ни в данных находки, ни в сущности`,
      );
      ok = false;
      continue;
    }

    const location = finding.location ?? { file: "profile.json", pointer: "" };
    const pointer = location.pointer ?? "";
    if (entry.severity === "error") {
      diags.error(entry.code, location.file, pointer, message);
    } else if (entry.severity === "warning") {
      diags.warning(entry.code, location.file, pointer, message);
    } else {
      diags.review(entry.code, location.file, pointer, message);
    }
  }

  return ok;
}

function findEntry(
  catalog: DiagnosticCatalog,
  finding: ValidatorFinding,
): DiagnosticCatalogEntry | undefined {
  return (
    catalog.codes.find(
      (entry) => entry.code === finding.code && entry.variant === finding.variant,
    ) ?? catalog.codes.find((entry) => entry.code === finding.code && entry.variant === undefined)
  );
}

function interpolate(template: string, scope: Record<string, unknown>): string | null {
  let missing = false;
  const message = template.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    const value = key
      .split(".")
      .reduce<unknown>(
        (current, part) =>
          typeof current === "object" && current !== null
            ? (current as Record<string, unknown>)[part]
            : undefined,
        scope,
      );
    if (value === undefined || value === null) {
      missing = true;
      return "";
    }
    return String(value);
  });
  return missing ? null : message;
}
