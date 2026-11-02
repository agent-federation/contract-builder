import type {
  ProfileValidator,
  ValidatorFinding,
} from "../../spec/lib/hook.js";
import type { ExampleProjectView } from "./view.js";

/**
 * A profile-owned policy check: every requirement must be covered by at least one example.
 * The core supplies the catalog resolution and the model; the rule itself lives here.
 */
export const validate: ProfileValidator["validate"] = async (_model, ctx) => {
  const view = ctx.view as ExampleProjectView;
  const findings: ValidatorFinding[] = [];

  for (const requirement of view.requirements) {
    if (requirement.exampleIds.length > 0) continue;
    findings.push({
      code: "example.coverage.missing-example",
      entityId: requirement.id,
      location: { file: "requirements.yml", pointer: "" },
      data: { id: requirement.id },
    });
  }

  return findings;
};
