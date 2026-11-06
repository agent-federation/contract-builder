/**
 * Report identity, coverage and the verdict adapter (RFC §5.9, §7.3–§7.5).
 *
 * The verdict model itself lives in `state.ts`; this module normalizes a report
 * and its options into `DimensionStates`/`VerdictContext` and delegates, and
 * keeps the report-level coverage and identity helpers.
 */

import { domainHash } from "./digest.js";
import { jcsBytes } from "./json.js";
import type { DimensionStatus, VerdictContext } from "./state.js";
import {
  computeVerdict as foldVerdict,
  isCoverageFull,
  isDimensionDecided,
  statusForDimension as stateStatusForDimension,
} from "./state.js";
import type {
  CheckOutcome,
  Diagnostic,
  DimensionName,
  Limitation,
  VerificationReport,
  Verdict,
} from "./types.js";
import { ZERO_DIGEST } from "./types.js";

export {
  computeRequiredDimensions,
  deriveRequiredDimensions,
  impliedDimensions,
} from "./state.js";
export type { VerdictContext } from "./state.js";

export function statusForDimension(
  report: VerificationReport,
  dimension: DimensionName,
): DimensionStatus {
  return stateStatusForDimension(report.dimensions, dimension);
}

export function computeCoverage(
  report: VerificationReport,
  requiredChecks: string[],
  requiredDimensions: DimensionName[],
  limitStopped: boolean,
  scanIncomplete: boolean = false,
): VerificationReport["coverage"] {
  const results = new Map(report.dimensions.checks.results.map((result) => [result.checkId, result.outcome]));
  const outcomes = requiredChecks.map((checkId) => results.get(checkId) ?? "NOT_EVALUATED");
  const counts = (outcome: CheckOutcome): number =>
    outcomes.filter((candidate) => candidate === outcome).length;
  const passed = counts("PASS");
  const failed = counts("FAIL");
  const unsupported = counts("UNSUPPORTED");
  const notEvaluated = counts("NOT_EVALUATED");
  const dimensionsEvaluated = requiredDimensions.filter((dimension) =>
    isDimensionDecided(dimension, report.dimensions),
  ).length;
  return {
    requiredChecks,
    checksEvaluated: passed + failed,
    checksPassed: passed,
    checksFailed: failed,
    checksUnsupported: unsupported,
    checksNotEvaluated: notEvaluated,
    requiredDimensions,
    dimensionsEvaluated,
    full: isCoverageFull(
      report.dimensions,
      requiredChecks,
      requiredDimensions,
      limitStopped,
      scanIncomplete,
    ),
  };
}

/**
 * S3 adapter: `verify.ts` normalizes the policy-derived requirement set, the I4
 * coverage result and the remaining verdict inputs into one `VerdictContext`;
 * the pure fold in `state.ts` receives it once and reads no report metadata.
 */
export function computeVerdict(report: VerificationReport, context: VerdictContext): Verdict {
  return foldVerdict(report.dimensions, context);
}

export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const rank = { error: 0, warning: 1, info: 2 } as const;
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}\u0000${diagnostic.severity}\u0000${diagnostic.scope}\u0000${diagnostic.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(diagnostic);
  }
  out.sort((a, b) => {
    if (a.severity !== b.severity) return rank[a.severity] - rank[b.severity];
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.scope !== b.scope) return a.scope < b.scope ? -1 : 1;
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
  });
  return out;
}

export function sortLimitations(limitations: Limitation[]): Limitation[] {
  const seen = new Set<string>();
  const out: Limitation[] = [];
  for (const limitation of limitations) {
    const key = `${limitation.code}\u0000${limitation.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(limitation);
  }
  out.sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0;
  });
  return out;
}

/**
 * `verificationRecordIdentity` over the report identity form: remove only the
 * §5.9 presentation fields, replace the identity with the zero placeholder and
 * hash the JCS bytes under `pap.report.v1`.
 */
export function verificationRecordIdentity(report: VerificationReport): string {
  const form = JSON.parse(JSON.stringify(report)) as VerificationReport;
  delete (form as { evaluatedAt?: string }).evaluatedAt;
  delete (form as { durationMs?: number }).durationMs;
  if (form.package !== undefined) delete form.package.path;
  if (form.policy !== undefined) delete form.policy.path;
  delete form.producerClaims;
  for (const diagnostic of form.diagnostics) {
    delete (diagnostic as { message?: string }).message;
  }
  for (const check of form.checks) {
    for (const diagnostic of check.diagnostics) {
      delete (diagnostic as { message?: string }).message;
    }
    for (const witness of check.witnesses) {
      if (witness.type === "source-span") delete witness.quoteBase64;
    }
  }
  form.identities.verificationRecordIdentity = ZERO_DIGEST;
  return domainHash("pap.report.v1", jcsBytes(form as never));
}
