import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { ProjectModel } from "../../../spec/lib/ir.js";

/**
 * Public-surface and interface-owner policy for the CORE-000 model. These checks read only the
 * normalized model; they perform no I/O and use no clock or environment state.
 */
export function modelStructureFindings(model: ProjectModel): ValidatorFinding[] {
  const findings: ValidatorFinding[] = [];
  const covered = coveredSurfaceIds(model);

  for (const iface of model.byKind.get("interface") ?? []) {
    const owner = text(iface.fields.owner);
    const component = model.byId.get(owner);
    const provides = component?.relations.provides ?? [];
    if (component === undefined || component.kind !== "component" || !provides.includes(iface.id)) {
      findings.push({
        code: "core000.model.interface-owner-mismatch",
        entityId: iface.id,
        location: { file: "structure.yml", pointer: "" },
        data: { owner },
      });
    }
  }

  for (const component of model.byKind.get("component") ?? []) {
    if (component.fields.public !== true) continue;
    if (covered.has(component.id)) continue;
    findings.push({
      code: "core000.surface.claim-missing",
      entityId: component.id,
      location: { file: "structure.yml", pointer: "" },
    });
  }

  for (const iface of model.byKind.get("interface") ?? []) {
    if (covered.has(iface.id)) continue;
    findings.push({
      code: "core000.surface.claim-missing",
      entityId: iface.id,
      location: { file: "structure.yml", pointer: "" },
    });
  }

  return findings;
}

function coveredSurfaceIds(model: ProjectModel): Set<string> {
  const covered = new Set<string>();
  for (const claim of model.byKind.get("claim") ?? []) {
    if (text(claim.fields.lifecycle) !== "active") continue;
    for (const subjectId of claim.relations.subject ?? []) covered.add(subjectId);
  }
  return covered;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
