import nunjucks from "nunjucks";
import { fileURLToPath } from "node:url";
import { SEVERITY_LABEL, type Diagnostic, type Severity } from "../../spec/lib/diagnostics.js";
import type { ProjectModel } from "../../spec/lib/ir.js";
import { artifactFrom, type RenderOptions, type Renderer } from "../../spec/lib/render.js";
import { buildView } from "./view.js";

class MemoryLoader extends nunjucks.Loader {
  readonly async = false;

  constructor(private readonly files: Record<string, string>) {
    super();
  }

  getSource(name: string): nunjucks.LoaderSource {
    const src = this.files[name];
    // Nunjucks treats a null source as "not found"; the published types omit that case.
    if (src === undefined) return null as unknown as nunjucks.LoaderSource;
    return { src, path: name, noCache: true };
  }
}

export const renderer: Renderer = {
  id: "core000-markdown",
  version: "0.1.0",
  closure: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    files: ["renderer.ts", "view.ts", "templates/core000.md.j2"],
    dependencies: { nunjucks: "3.2.4" },
  },
  async render(model: ProjectModel, options: RenderOptions) {
    const base = buildView(model);
    const diagnostics = options.diagnostics.map(diagnosticView);
    const counts = {
      ...base.counts,
      errors: countSeverity(options.diagnostics, "error"),
      reviews: countSeverity(options.diagnostics, "review"),
      warnings: countSeverity(options.diagnostics, "warning"),
    };

    const env = new nunjucks.Environment(new MemoryLoader(options.templates.files), {
      autoescape: false,
      trimBlocks: false,
      lstripBlocks: false,
      throwOnUndefined: true,
    });

    const text = finalize(
      env.render(options.templates.entry, {
        ...base,
        mode: options.mode,
        modeLabel: options.mode,
        isDraft: options.mode === "draft",
        diagnostics,
        counts,
        project: {
          id: model.manifest.project.id,
          revision: model.manifest.project.revision ?? "not declared",
        },
        profile: { id: model.profile.id, version: model.profile.version },
        renderer: { id: renderer.id, version: renderer.version },
        identity: options.identity,
        gate: gateConclusion(counts),
      }),
    );
    const output = model.manifest.render[0]?.outputs[options.mode] ?? "";
    return [artifactFrom(output, text)];
  },
};

function diagnosticView(diagnostic: Diagnostic) {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    severityLabel: SEVERITY_LABEL[diagnostic.severity] ?? diagnostic.severity,
    file: diagnostic.file,
    pointer: diagnostic.pointer,
    message: diagnostic.message,
  };
}

function countSeverity(diagnostics: readonly Diagnostic[], severity: Severity): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;
}

/** Summary-level gate conclusion from the emitted diagnostics, never from the catalog. */
function gateConclusion(counts: { errors: number; reviews: number }): string {
  const reasons: string[] = [];
  if (counts.errors > 0) reasons.push(`${counts.errors} \`ERROR\``);
  if (counts.reviews > 0) reasons.push(`${counts.reviews} \`REVIEW_REQUIRED\``);
  if (reasons.length === 0) {
    return "`release` permitted — no `ERROR` or `REVIEW_REQUIRED` diagnostics.";
  }
  return `\`release\` blocked — ${reasons.join(" and ")} diagnostics.`;
}

function finalize(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/g, "\n");
}
