import type {
  ProfileValidator,
  ValidatorFinding,
  ValidatorContext,
} from "../../spec/lib/hook.js";
import type { Check, CheckContext } from "./context.js";
import type { AnalyzedSpec } from "./view.js";
import { check as cases } from "./checks/cases.js";
import { check as coverage } from "./checks/coverage.js";
import { check as dependencies } from "./checks/dependencies.js";
import { check as ontology } from "./checks/ontology.js";
import { check as provision } from "./checks/provision.js";
import { check as review } from "./checks/review.js";
import { check as source } from "./checks/source.js";
import { verifyProvenance } from "./checks/verification.js";
import { check as terms } from "./checks/terms.js";

export { verifyProvenance };

/** Fixed module order. Within a module, findings follow input order. */
export const ORDER = [
  "source",
  "ontology",
  "provision",
  "cases",
  "review",
  "coverage",
  "terms",
  "dependencies",
] as const;

const CHECKS: Array<{ name: (typeof ORDER)[number]; run: Check }> = [
  { name: "source", run: source },
  { name: "ontology", run: ontology },
  { name: "provision", run: provision },
  { name: "cases", run: cases },
  { name: "review", run: review },
  { name: "coverage", run: coverage },
  { name: "terms", run: terms },
  { name: "dependencies", run: dependencies },
];

export const validate: ProfileValidator["validate"] = async (
  model,
  ctx: ValidatorContext,
): Promise<ValidatorFinding[]> => {
  const context: CheckContext = {
    model,
    view: ctx.view as AnalyzedSpec,
    legacyText: ctx.legacyText,
    legacyName: ctx.legacyName,
    verifyQuote: ctx.verifyQuote,
  };

  const findings: ValidatorFinding[] = [];
  for (const check of CHECKS) {
    findings.push(...(await check.run(context)));
  }
  return findings;
};
