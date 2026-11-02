import type { Entity, ProjectModel } from "../../spec/lib/ir.js";

export interface RequirementView {
  readonly id: string;
  readonly title: string;
  readonly level: string;
  readonly statement: string;
  readonly exampleIds: readonly string[];
}

export interface ExampleView {
  readonly id: string;
  readonly title: string;
  readonly given: string;
  readonly expect: string;
  readonly requirement: string | null;
}

export interface ExampleProjectView {
  readonly title: string;
  readonly requirements: readonly RequirementView[];
  readonly examples: readonly ExampleView[];
}

/** A profile-owned projection of the generic model; the core never interprets these fields. */
export function buildView(model: ProjectModel): ExampleProjectView {
  const title = model.manifest.project.title ?? model.manifest.project.id;

  return {
    title,
    requirements: (model.byKind.get("requirement") ?? []).map(requirementView),
    examples: (model.byKind.get("example") ?? []).map(exampleView),
  };
}

function requirementView(entity: Entity): RequirementView {
  return {
    id: entity.id,
    title: text(entity.fields.title),
    level: text(entity.fields.level),
    statement: text(entity.fields.statement),
    exampleIds: entity.relations.examples ?? [],
  };
}

function exampleView(entity: Entity): ExampleView {
  return {
    id: entity.id,
    title: text(entity.fields.title),
    given: text(entity.fields.given),
    expect: text(entity.fields.expect),
    requirement: entity.relations.requirement?.[0] ?? null,
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
