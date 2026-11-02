import { fileURLToPath } from "node:url";
import type { Entity, ProjectModel } from "../../spec/lib/ir.js";
import {
  artifactFrom,
  type RenderOptions,
  type Renderer,
} from "../../spec/lib/render.js";

const PLACEHOLDER = /\{\{([a-z_]+)\}\}/g;

/**
 * Deliberately trivial renderer: it replaces three template placeholders and performs no
 * I/O, so the artifact is a pure function of the model and the preloaded template.
 */
export const renderer: Renderer = {
  id: "example-markdown",
  version: "0.1.0",
  closure: {
    root: fileURLToPath(new URL(".", import.meta.url)),
    files: ["renderer.ts", "templates/example.md.j2"],
    dependencies: {},
  },
  async render(model: ProjectModel, options: RenderOptions) {
    const template = options.templates.files[options.templates.entry];
    if (template === undefined) {
      throw new Error(`Template "${options.templates.entry}" is not loaded`);
    }

    const values: Record<string, string> = {
      title: model.manifest.project.title ?? model.manifest.project.id,
      requirements: list(model.byKind.get("requirement") ?? [], requirementLine),
      examples: list(model.byKind.get("example") ?? [], exampleLine),
    };

    const text = template.replace(PLACEHOLDER, (_match, key: string) => values[key] ?? "");
    const output = model.manifest.render[0]?.outputs[options.mode] ?? "";
    return [artifactFrom(output, text)];
  },
};

function list(entities: readonly Entity[], render: (entity: Entity) => string): string {
  return entities.length === 0 ? "_None._" : entities.map(render).join("\n");
}

function requirementLine(entity: Entity): string {
  return `- ${entity.id} (${text(entity.fields.level)}) — ${text(entity.fields.title)}: ${text(entity.fields.statement)}`;
}

function exampleLine(entity: Entity): string {
  const requirement = entity.relations.requirement?.[0] ?? "none";
  return `- ${entity.id} → ${requirement}: ${text(entity.fields.given)} ⇒ ${text(entity.fields.expect)}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
