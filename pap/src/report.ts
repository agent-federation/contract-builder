/**
 * Dimension aggregation, verdict precedence, coverage and report identity
 * (RFC §5.9, §7.3–§7.5).
 */

import { domainHash } from "./digest.js";
import { jcsBytes } from "./json.js";
import { DIMENSION_ORDER } from "./policy.js";
import type {
  CheckOutcome,
  CheckRecord,
  Diagnostic,
  DimensionName,
  Limitation,
  VerificationReport,
  Verdict,
} from "./types.js";
import { ZERO_DIGEST } from "./types.js";

const IMPLIED: Record<string, DimensionName[]> = {
  "pap.check.digest-integrity/1": ["integrity", "checks"],
  "pap.check.source-quote/1": ["sources", "checks"],
  "pap.check.relation-consistency/1": ["checks"],
};

export function impliedDimensions(checkId: string): DimensionName[] {
  return IMPLIED[checkId] ?? ["checks"];
}

export function computeRequiredDimensions(
  requiredChecks: string[],
  policyDimensions: DimensionName[],
): DimensionName[] {
  const required = new Set<DimensionName>(policyDimensions);
  for (const checkId of requiredChecks) {
    for (const dimension of impliedDimensions(checkId)) {
      required.add(dimension);
    }
  }
  return DIMENSION_ORDER.filter((dimension) => required.has(dimension));
}

export function statusForDimension(
  report: VerificationReport,
  dimension: DimensionName,
): string {
  switch (dimension) {
    case "integrity":
      return report.dimensions.integrity.package;
    case "integrity.package":
      return report.dimensions.integrity.package;
    case "integrity.artifacts":
      return report.dimensions.integrity.artifacts;
    case "sources":
      return report.dimensions.sources.integrity;
    case "sources.integrity":
      return report.dimensions.sources.integrity;
    case "sources.availability":
      return report.dimensions.sources.availability;
    case "signature":
      return report.dimensions.signature.validity;
    case "signature.validity":
      return report.dimensions.signature.validity;
    case "trust":
      return report.dimensions.trust.signerIdentity;
    case "trust.signerIdentity":
      return report.dimensions.trust.signerIdentity;
    case "trust.policyDecision":
      return report.dimensions.trust.policyDecision;
    case "trust.checkerRecognition":
      return report.dimensions.trust.checkerRecognition;
    case "trust.profileRecognition":
      return report.dimensions.trust.profileRecognition;
    case "checks":
      return report.dimensions.checks.results.every(
        (result) => !result.required || result.outcome === "PASS" || result.outcome === "FAIL",
      )
        ? "PASS"
        : "NOT_EVALUATED";
    case "humanReview":
      return report.dimensions.humanReview.status;
  }
}

function decided(dimension: DimensionName, report: VerificationReport): boolean {
  switch (dimension) {
    case "integrity":
      return (
        isDecidedIntegrity(report.dimensions.integrity.package) &&
        isDecidedIntegrity(report.dimensions.integrity.artifacts)
      );
    case "integrity.package":
      return isDecidedIntegrity(report.dimensions.integrity.package);
    case "integrity.artifacts":
      return isDecidedIntegrity(report.dimensions.integrity.artifacts);
    case "sources":
      return (
        isDecidedSource(report.dimensions.sources.integrity) &&
        isDecidedAvailability(report.dimensions.sources.availability)
      );
    case "sources.integrity":
      return isDecidedSource(report.dimensions.sources.integrity);
    case "sources.availability":
      return isDecidedAvailability(report.dimensions.sources.availability);
    case "signature":
    case "signature.validity":
      return isDecidedSignature(report.dimensions.signature.validity);
    case "trust":
      return (
        isDecidedSigner(report.dimensions.trust.signerIdentity) &&
        isDecidedPolicyDecision(report.dimensions.trust.policyDecision) &&
        isDecidedRecognition(report.dimensions.trust.checkerRecognition) &&
        isDecidedRecognition(report.dimensions.trust.profileRecognition)
      );
    case "trust.signerIdentity":
      return isDecidedSigner(report.dimensions.trust.signerIdentity);
    case "trust.policyDecision":
      return isDecidedPolicyDecision(report.dimensions.trust.policyDecision);
    case "trust.checkerRecognition":
      return isDecidedRecognition(report.dimensions.trust.checkerRecognition);
    case "trust.profileRecognition":
      return isDecidedRecognition(report.dimensions.trust.profileRecognition);
    case "checks":
      return report.dimensions.checks.results
        .filter((result) => result.required !== false)
        .every((result) => result.outcome === "PASS" || result.outcome === "FAIL");
    case "humanReview":
      return (
        report.dimensions.humanReview.status === "PASS" ||
        report.dimensions.humanReview.status === "NOT_APPLICABLE"
      );
  }
}

function isDecidedIntegrity(status: string): boolean {
  return status === "PASS" || status === "FAIL";
}
function isDecidedSource(status: string): boolean {
  return status === "PASS" || status === "FAIL";
}
function isDecidedAvailability(status: string): boolean {
  return status === "PASS" || status === "NOT_APPLICABLE";
}
function isDecidedSignature(status: string): boolean {
  return status === "VALID" || status === "INVALID" || status === "NOT_APPLICABLE";
}
function isDecidedSigner(status: string): boolean {
  return status === "TRUSTED" || status === "UNTRUSTED" || status === "NOT_APPLICABLE";
}
function isDecidedPolicyDecision(status: string): boolean {
  return status === "ACCEPTED" || status === "REJECTED" || status === "STALE";
}
function isDecidedRecognition(status: string): boolean {
  return status === "PASS" || status === "UNTRUSTED" || status === "NOT_APPLICABLE";
}

export function computeCoverage(
  report: VerificationReport,
  requiredChecks: string[],
  requiredDimensions: DimensionName[],
  limitStopped: boolean,
): VerificationReport["coverage"] {
  const results = new Map(report.dimensions.checks.results.map((result) => [result.checkId, result.outcome]));
  const outcomes = requiredChecks.map((checkId) => results.get(checkId) ?? "NOT_EVALUATED");
  const counts = (outcome: CheckOutcome): number =>
    outcomes.filter((candidate) => candidate === outcome).length;
  const passed = counts("PASS");
  const failed = counts("FAIL");
  const unsupported = counts("UNSUPPORTED");
  const notEvaluated = counts("NOT_EVALUATED");
  const dimensionsEvaluated = requiredDimensions.filter((dimension) => decided(dimension, report)).length;
  const emptyRequiredSet = requiredChecks.length === 0 && requiredDimensions.length === 0;
  const full =
    !limitStopped &&
    !emptyRequiredSet &&
    unsupported === 0 &&
    notEvaluated === 0 &&
    dimensionsEvaluated === requiredDimensions.length;
  return {
    requiredChecks,
    checksEvaluated: passed + failed,
    checksPassed: passed,
    checksFailed: failed,
    checksUnsupported: unsupported,
    checksNotEvaluated: notEvaluated,
    requiredDimensions,
    dimensionsEvaluated,
    full,
  };
}

export function computeVerdict(
  report: VerificationReport,
  options: {
    requiredChecks: string[];
    requiredDimensions: DimensionName[];
    signatureMode: "disabled" | "optional" | "required";
    humanReviewRequired: boolean;
    policyState: "FRESH" | "STALE" | "ABSENT";
    limitStopped: boolean;
    unsupportedVersion: boolean;
    unsupportedFeature: boolean;
    emptyRequiredSet: boolean;
  },
): Verdict {
  const results = new Map(
    report.dimensions.checks.results.map((result) => [result.checkId, result.outcome]),
  );
  const requiredOutcomes = options.requiredChecks.map((checkId) => results.get(checkId) ?? "NOT_EVALUATED");

  // 1. FAIL
  if (
    requiredOutcomes.includes("FAIL") ||
    report.dimensions.integrity.package === "FAIL" ||
    report.dimensions.integrity.artifacts === "FAIL" ||
    report.dimensions.sources.integrity === "FAIL" ||
    (options.signatureMode === "required" && report.dimensions.signature.validity === "INVALID")
  ) {
    return "FAIL";
  }

  // 2. UNTRUSTED
  const trustRequired =
    options.requiredDimensions.includes("trust") ||
    options.requiredDimensions.includes("trust.signerIdentity") ||
    options.requiredDimensions.includes("trust.policyDecision") ||
    options.requiredDimensions.includes("trust.checkerRecognition") ||
    options.requiredDimensions.includes("trust.profileRecognition");
  const recognitionRequired =
    options.requiredDimensions.includes("trust") ||
    options.requiredDimensions.includes("trust.checkerRecognition") ||
    options.requiredDimensions.includes("trust.profileRecognition");
  if (
    report.dimensions.trust.signerIdentity === "UNTRUSTED" ||
    report.dimensions.trust.policyDecision === "REJECTED" ||
    (recognitionRequired &&
      (report.dimensions.trust.checkerRecognition === "UNTRUSTED" ||
        report.dimensions.trust.profileRecognition === "UNTRUSTED"))
  ) {
    return "UNTRUSTED";
  }

  // 3. UNSUPPORTED
  if (
    requiredOutcomes.includes("UNSUPPORTED") ||
    options.unsupportedVersion ||
    options.unsupportedFeature ||
    (recognitionRequired &&
      (report.dimensions.trust.checkerRecognition === "UNSUPPORTED" ||
        report.dimensions.trust.profileRecognition === "UNSUPPORTED"))
  ) {
    return "UNSUPPORTED";
  }

  // 4. INCOMPLETE
  const incompleteStatuses = new Set([
    "NOT_EVALUATED",
    "UNKNOWN",
    "UNAVAILABLE",
    "STALE",
    "INCOMPLETE",
  ]);
  if (
    options.policyState === "STALE" ||
    options.limitStopped ||
    options.emptyRequiredSet ||
    !report.coverage.full ||
    requiredOutcomes.some((outcome) => outcome === "NOT_EVALUATED") ||
    requiredOutcomes.some((outcome) => outcome === "UNSUPPORTED") ||
    requiredOutcomes.some((outcome) => outcome === "FAIL") ||
    (options.signatureMode === "required" &&
      report.dimensions.signature.validity === "NOT_EVALUATED") ||
    (options.humanReviewRequired && report.dimensions.humanReview.status !== "PASS") ||
    options.requiredDimensions.some((dimension) =>
      incompleteStatuses.has(statusForDimension(report, dimension)),
    )
  ) {
    return "INCOMPLETE";
  }

  // 5. NOT_EVALUATED — degenerate report.
  if (requiredOutcomes.length === 0) {
    return "NOT_EVALUATED";
  }

  // 6. PASS
  return "PASS";
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

export function countCheckRecords(records: CheckRecord[]): number {
  return records.length;
}
