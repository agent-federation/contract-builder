import type { ValidatorFinding } from "../../spec/lib/hook.js";
import type { ProjectModel } from "../../spec/lib/ir.js";
import type { LocatorResult } from "../../spec/lib/source.js";
import type { AnalyzedSpec } from "./view.js";

export interface CheckContext {
  model: ProjectModel;
  view: AnalyzedSpec;
  legacyText: string;
  legacyName: string;
  verifyQuote(sourceId: string, ref: string, quote: string): Promise<LocatorResult>;
}

export type Check = (ctx: CheckContext) => ValidatorFinding[] | Promise<ValidatorFinding[]>;
