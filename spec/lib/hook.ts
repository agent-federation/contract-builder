import type { Diagnostics } from "./diagnostics.js";
import type { ProjectModel } from "./ir.js";
import { SUPPORTED_LOCALES, type Locale } from "./locale.js";
import { interpolate, type LocalizedMessage, type MessageParams } from "./messages.js";
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
  /**
   * A single message used for every locale. Kept for catalogs that predate per-locale
   * entries (the CORE-000 profile); it also acts as the fallback for a locale missing from
   * `messages`.
   */
  message?: string;
  /** Per-locale message templates; `{{name}}` is interpolated from the finding's data. */
  messages?: Partial<Record<Locale, string>>;
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
      diags.error("core.profile.unknown-code#unknown-code", "profile.json", "/diagnostics", {
        code: finding.code,
        variantSuffix: finding.variant !== undefined ? ` (${finding.variant})` : "",
      });
      ok = false;
      continue;
    }

    const entity = finding.entityId !== undefined ? model.byId.get(finding.entityId) : undefined;
    const scope: MessageParams = {
      ...(entity !== undefined ? { id: entity.id, kind: entity.kind, ...entity.fields } : {}),
      ...(finding.data ?? {}),
    };

    const message = localizedCatalogMessage(entry, scope);
    if (!message.ok) {
      diags.error(
        message.reason === "missing-locale"
          ? "core.profile.invalid#message-locale-missing"
          : "core.profile.invalid#message-field-missing",
        "profile.json",
        "/diagnostics",
        { code: entry.code, locale: message.locale ?? "" },
      );
      ok = false;
      continue;
    }

    const location = finding.location ?? { file: "profile.json", pointer: "" };
    const pointer = location.pointer ?? "";
    diags.add(entry.severity, entry.code, location.file, pointer, message.messages);
  }

  return ok;
}

type CatalogMessageResult =
  | { ok: true; messages: LocalizedMessage }
  | { ok: false; reason: "missing-locale" | "missing-field"; locale?: Locale };

/**
 * Renders a catalog entry in every supported locale. A locale without its own entry falls
 * back to the legacy single-locale `message`; a missing template or interpolation field is
 * an error rather than an empty string.
 */
function localizedCatalogMessage(
  entry: DiagnosticCatalogEntry,
  scope: MessageParams,
): CatalogMessageResult {
  const localized: Partial<Record<Locale, string>> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const template = entry.messages?.[locale] ?? entry.message;
    if (template === undefined) return { ok: false, reason: "missing-locale", locale };
    const text = interpolate(template, scope, locale);
    if (text === null) return { ok: false, reason: "missing-field", locale };
    localized[locale] = text;
  }
  return { ok: true, messages: localized as LocalizedMessage };
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
