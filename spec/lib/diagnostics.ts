import { DEFAULT_LOCALE, type Locale } from "./locale.js";
import {
  localizedMessage,
  messageCode,
  type DiagnosticMessageKey,
  type LocalizedMessage,
  type MessageParams,
} from "./messages.js";

export type Severity = "error" | "warning" | "review";

export interface Diagnostic {
  severity: Severity;
  code: string;
  file: string;
  pointer: string;
  message: string;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  error: 0,
  review: 1,
  warning: 2,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: "ERROR",
  review: "REVIEW_REQUIRED",
  warning: "WARNING",
};

interface StoredDiagnostic {
  severity: Severity;
  code: string;
  file: string;
  pointer: string;
  messages: LocalizedMessage;
}

/**
 * Diagnostics are collected, never thrown. Ordering is fixed so that two runs
 * over the same input produce byte-identical reports.
 *
 * A diagnostic stores its text in every supported locale, not the locale selected for one
 * output. The CLI resolves the catalog in its own locale; the renderer resolves the same
 * snapshot in the project's artifact locale, so a Russian artifact and English CLI output
 * come from one build.
 */
export class Diagnostics {
  private readonly items: StoredDiagnostic[] = [];

  error(key: DiagnosticMessageKey, file: string, pointer: string, params?: MessageParams): void {
    this.push("error", key, file, pointer, params);
  }

  warning(key: DiagnosticMessageKey, file: string, pointer: string, params?: MessageParams): void {
    this.push("warning", key, file, pointer, params);
  }

  review(key: DiagnosticMessageKey, file: string, pointer: string, params?: MessageParams): void {
    this.push("review", key, file, pointer, params);
  }

  /**
   * Adds a diagnostic whose text is already localized (profile catalog findings). The engine
   * resolves those through the profile catalog, not the engine catalog.
   */
  add(
    severity: Severity,
    code: string,
    file: string,
    pointer: string,
    messages: LocalizedMessage,
  ): void {
    this.items.push({ severity, code, file, pointer, messages });
  }

  get errors(): number {
    return this.count("error");
  }

  get reviews(): number {
    return this.count("review");
  }

  get warnings(): number {
    return this.count("warning");
  }

  count(severity: Severity): number {
    return this.items.filter((d) => d.severity === severity).length;
  }

  sorted(locale: Locale = DEFAULT_LOCALE): Diagnostic[] {
    return this.resolve(locale).sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return (
        compare(a.file, b.file) ||
        compare(a.pointer, b.pointer) ||
        compare(a.code, b.code) ||
        compare(a.message, b.message)
      );
    });
  }

  /**
   * Diagnostics in the order the checks emitted them, before the rendering sort.
   * Returns copies, so a caller cannot reorder or mutate the collector's state.
   */
  emissionOrder(locale: Locale = DEFAULT_LOCALE): Diagnostic[] {
    return this.resolve(locale);
  }

  /** Stable, human-readable report. No timings, no paths outside the spec. */
  report(locale: Locale = DEFAULT_LOCALE): string {
    const lines: string[] = [];
    for (const d of this.sorted(locale)) {
      lines.push(`${SEVERITY_LABEL[d.severity]} ${d.code} ${d.file}${d.pointer}`);
      lines.push(`  ${d.message}`);
    }
    return lines.join("\n");
  }

  private push(
    severity: Severity,
    key: DiagnosticMessageKey,
    file: string,
    pointer: string,
    params?: MessageParams,
  ): void {
    this.items.push({
      severity,
      code: messageCode(key),
      file,
      pointer,
      messages: localizedMessage(key, params),
    });
  }

  private resolve(locale: Locale): Diagnostic[] {
    return this.items.map((item) => ({
      severity: item.severity,
      code: item.code,
      file: item.file,
      pointer: item.pointer,
      message: item.messages[locale] ?? item.messages[DEFAULT_LOCALE] ?? "",
    }));
  }
}

export function compare(a: string, b: string): number {
  // Codepoint comparison: locale-independent, therefore deterministic.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function jsonPointer(parts: Array<string | number>): string {
  return parts.map((p) => `/${String(p).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}
