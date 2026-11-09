/**
 * Required-check selection and evaluation of the v0.1 mechanical checks.
 */

import { checkSpecImpl, isImplementedCheck, WITNESS_BUDGET_BYTES } from "../checks.js";
import type { CheckInput } from "../checks.js";
import type { CheckSpec, Manifest } from "../manifest.js";
import type { CheckOutcome, CheckRecord, Diagnostic, Limits } from "../types.js";
import { CHECKER } from "../version.js";
import type { Diag, Payloads } from "./options.js";

export interface CheckEvaluation {
  results: { checkId: string; outcome: CheckOutcome; required?: boolean }[];
  records: CheckRecord[];
}

export function requiredCheckIds(
  declared: CheckSpec[],
  policyChecks: string[],
  manifestParsed: boolean,
): string[] {
  if (!manifestParsed) return policyChecks;
  const declaredIds = new Set(declared.map((spec) => spec.id));
  const policySet = new Set(policyChecks);
  const required: string[] = [];
  for (const spec of declared) {
    if ((spec.required || policySet.has(spec.id)) && !required.includes(spec.id)) {
      required.push(spec.id);
    }
  }
  const extra = policyChecks.filter((id) => !declaredIds.has(id)).sort();
  return [...required, ...extra];
}

export function evaluateChecks(options: {
  manifest: Manifest | null;
  declaredSpecs: CheckSpec[];
  policyChecks: string[];
  requiredChecks: string[];
  packageIdentity: string;
  payloads: Payloads;
  structuralFailure: boolean;
  unsupportedVersion: boolean;
  limitHit: boolean;
  limitedClasses: Set<"artifacts" | "sources" | "inputs">;
  limits: Limits;
  diagnostics: Diagnostic[];
  diag: Diag;
}): CheckEvaluation {
  const results: CheckEvaluation["results"] = [];
  const records: CheckRecord[] = [];
  if (options.manifest === null) {
    return { results, records };
  }
  const checkInput: CheckInput = {
    packageIdentity: options.packageIdentity,
    manifest: options.manifest,
    artifacts: options.payloads.artifacts,
    sources: options.payloads.sources,
    inputs: options.payloads.inputs,
    claims: options.payloads.claims,
    normalizedInputDigest: options.payloads.normalizedInputDigest,
    sourceSpans: options.payloads.sourceSpans,
    sourceSpanBudgetHit: options.payloads.sourceSpanBudgetHit,
    checker: CHECKER,
    limits: { provenanceBindings: options.limits.provenanceBindings },
    witnessBudget: WITNESS_BUDGET_BYTES,
  };

  const required = new Set(options.requiredChecks);
  const declaredIds = new Set<string>();
  const ordered: { id: string; required: boolean; declared: boolean }[] = [];
  for (const spec of options.declaredSpecs) {
    declaredIds.add(spec.id);
    ordered.push({ id: spec.id, required: required.has(spec.id) || spec.required, declared: true });
  }
  for (const checkId of options.policyChecks.slice().sort()) {
    if (!declaredIds.has(checkId)) {
      ordered.push({ id: checkId, required: true, declared: false });
    }
  }

  const limitBlocksRequired =
    options.limitHit &&
    options.requiredChecks.some((checkId) => checkTouchesLimited(checkId, options.limitedClasses));

  for (const entry of ordered) {
    const isRequired = required.has(entry.id);
    if (options.structuralFailure || options.unsupportedVersion || limitBlocksRequired) {
      const record = emptyCheckRecord(entry.id, options.packageIdentity, "NOT_EVALUATED", {
        code: "pap.check.not-evaluated",
        severity: "warning",
        message: options.unsupportedVersion
          ? "check not run because the package version is unsupported"
          : "check not run because the manifest is invalid",
      });
      records.push(record);
      results.push({ checkId: entry.id, outcome: "NOT_EVALUATED", required: isRequired });
      options.diag(
        "pap.check.not-evaluated",
        "warning",
        entry.id,
        options.limitHit && limitBlocksRequired
          ? "check was not evaluated because a required payload class hit a resource limit"
          : "check was not evaluated",
      );
      continue;
    }
    if (!isImplementedCheck(entry.id)) {
      results.push({ checkId: entry.id, outcome: "UNSUPPORTED", required: isRequired });
      options.diag(
        "pap.check.unsupported",
        "warning",
        entry.id,
        "check specification is not implemented",
      );
      continue;
    }
    const record = checkSpecImpl(entry.id, checkInput) as CheckRecord;
    records.push(record);
    results.push({ checkId: entry.id, outcome: record.outcome, required: isRequired });
    for (const diagnostic of record.diagnostics) {
      options.diag(diagnostic.code, diagnostic.severity, entry.id, diagnostic.message);
    }
    if (isRequired && record.outcome === "FAIL") {
      options.diag("pap.check.failed", "error", entry.id, "a required check failed");
    }
    if (isRequired && record.outcome === "NOT_EVALUATED") {
      options.diag(
        "pap.check.not-evaluated",
        "warning",
        entry.id,
        "a required check was not evaluated",
      );
    }
    if (isRequired && record.outcome === "UNSUPPORTED") {
      options.diag("pap.check.unsupported", "warning", entry.id, "a required check is unsupported");
    }
  }
  return { results, records };
}

function checkTouchesLimited(
  checkId: string,
  limited: Set<"artifacts" | "sources" | "inputs">,
): boolean {
  if (checkId === "pap.check.digest-integrity/1") return limited.size > 0;
  if (checkId === "pap.check.source-quote/1") return limited.has("sources");
  return false;
}

function emptyCheckRecord(
  checkId: string,
  packageIdentity: string,
  outcome: CheckOutcome,
  diagnostic: { code: string; severity: "error" | "warning" | "info"; message: string },
): CheckRecord {
  return {
    checkId,
    checkVersion: checkId.slice(checkId.lastIndexOf("/") + 1),
    subjectDigests: { package: packageIdentity },
    scope: {},
    checker: CHECKER,
    outcome,
    witnesses: [],
    diagnostics: [diagnostic],
  };
}
