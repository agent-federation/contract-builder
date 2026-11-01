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

/**
 * Diagnostics are collected, never thrown. Ordering is fixed so that two runs
 * over the same input produce byte-identical reports.
 */
export class Diagnostics {
  private readonly items: Diagnostic[] = [];

  error(code: string, file: string, pointer: string, message: string): void {
    this.items.push({ severity: "error", code, file, pointer, message });
  }

  warning(code: string, file: string, pointer: string, message: string): void {
    this.items.push({ severity: "warning", code, file, pointer, message });
  }

  review(code: string, file: string, pointer: string, message: string): void {
    this.items.push({ severity: "review", code, file, pointer, message });
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

  sorted(): Diagnostic[] {
    return [...this.items].sort((a, b) => {
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
  emissionOrder(): Diagnostic[] {
    return this.items.map((item) => ({ ...item }));
  }

  /** Stable, human-readable report. No timings, no paths outside the spec. */
  report(): string {
    const lines: string[] = [];
    for (const d of this.sorted()) {
      lines.push(`${SEVERITY_LABEL[d.severity]} ${d.code} ${d.file}${d.pointer}`);
      lines.push(`  ${d.message}`);
    }
    return lines.join("\n");
  }
}

export function compare(a: string, b: string): number {
  // Codepoint comparison: locale-independent, therefore deterministic.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function jsonPointer(parts: Array<string | number>): string {
  return parts.map((p) => `/${String(p).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}
