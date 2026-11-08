/**
 * Pure PAP verdict-model state (ODR-PAP-006; RFC §7.4–§7.5).
 *
 * This module owns the dimension status model, its positive/decided/error
 * classification, the I1 required-dimension derivation and the I3/I4 verdict
 * fold. It performs no I/O, reads no filesystem and no clock: the caller
 * normalizes a report's dimension statuses and the policy-derived requirements
 * into `DimensionStates` and `VerdictContext`.
 */

import type { CheckOutcome, DimensionName, Verdict } from "./types.js";

/**
 * Canonical dimension order (RFC §7.4). It lives here because the verdict model
 * owns the reported requirement order; `policy.ts` re-exports it so the
 * published export surface is unchanged.
 */
export const DIMENSION_ORDER: DimensionName[] = [
  "integrity",
  "integrity.package",
  "integrity.artifacts",
  "sources",
  "sources.integrity",
  "sources.availability",
  "signature",
  "signature.validity",
  "trust",
  "trust.signerIdentity",
  "trust.policyDecision",
  "trust.checkerRecognition",
  "trust.profileRecognition",
  "checks",
  "humanReview",
];

const IMPLIED: Record<string, DimensionName[]> = {
  "pap.check.digest-integrity/1": ["integrity", "checks"],
  "pap.check.source-quote/1": ["sources", "checks"],
  "pap.check.relation-consistency/1": ["checks"],
};

export type IntegrityState = "PASS" | "FAIL" | "NOT_EVALUATED";
export type SourceIntegrityState = "PASS" | "FAIL" | "UNAVAILABLE" | "NOT_EVALUATED";
export type SourceAvailabilityState = "PASS" | "UNAVAILABLE" | "NOT_APPLICABLE";
export type SignatureValidityState = "VALID" | "INVALID" | "NOT_EVALUATED" | "NOT_APPLICABLE";
export type SignerIdentityState =
  | "TRUSTED"
  | "UNTRUSTED"
  | "UNKNOWN"
  | "NOT_EVALUATED"
  | "NOT_APPLICABLE";
export type PolicyDecisionState = "ACCEPTED" | "REJECTED" | "STALE" | "NOT_EVALUATED";
export type RecognitionState =
  | "PASS"
  | "UNSUPPORTED"
  | "UNTRUSTED"
  | "NOT_EVALUATED"
  | "NOT_APPLICABLE";
export type HumanReviewState = "PASS" | "INCOMPLETE" | "UNKNOWN" | "NOT_APPLICABLE";

export interface CheckResultState {
  checkId: string;
  outcome: CheckOutcome;
  required?: boolean;
}

/**
 * The verdict fold's inputs: the reported dimension statuses, with no report
 * metadata, paths, diagnostics or policy object attached.
 */
export interface DimensionStates {
  integrity: { package: IntegrityState; artifacts: IntegrityState };
  sources: { integrity: SourceIntegrityState; availability: SourceAvailabilityState };
  signature: { validity: SignatureValidityState };
  trust: {
    signerIdentity: SignerIdentityState;
    policyDecision: PolicyDecisionState;
    checkerRecognition: RecognitionState;
    profileRecognition: RecognitionState;
  };
  checks: { results: CheckResultState[] };
  humanReview: { status: HumanReviewState };
}

export type DimensionStatus =
  | IntegrityState
  | SourceIntegrityState
  | SourceAvailabilityState
  | SignatureValidityState
  | SignerIdentityState
  | PolicyDecisionState
  | RecognitionState
  | HumanReviewState
  | "PASS";

/** The policy fields that derive required dimensions (I1/erratum E2). */
export interface PolicyRequirementInput {
  signature: { mode: "disabled" | "optional" | "required" };
  humanReview: { required: boolean };
  requiredDimensions: DimensionName[];
}

/**
 * The caller-normalized verdict context. Every verdict input is explicit;
 * `computeVerdict` never reads the report, the filesystem or a clock.
 */
export interface VerdictContext {
  requiredChecks: string[];
  requiredDimensions: DimensionName[];
  /**
   * Policy fields the caller used to derive `requiredDimensions` and
   * `coverageFull`. They are carried for traceability; the fold reads the
   * derived requirement set, never these fields as hidden requirements.
   */
  signatureMode: "disabled" | "optional" | "required";
  humanReviewRequired: boolean;
  policyState: "FRESH" | "STALE" | "ABSENT";
  limitStopped: boolean;
  unsupportedVersion: boolean;
  unsupportedFeature: boolean;
  emptyRequiredSet: boolean;
  /** I4 evaluation completeness, computed by the caller from the same states. */
  coverageFull: boolean;
}

export function impliedDimensions(checkId: string): DimensionName[] {
  return IMPLIED[checkId] ?? ["checks"];
}

function ordered(dimensions: Iterable<DimensionName>): DimensionName[] {
  const required = new Set<DimensionName>(dimensions);
  return DIMENSION_ORDER.filter((dimension) => required.has(dimension));
}

/**
 * Today's reported required set: policy additions plus the dimensions implied
 * by the required checks. Kept for the S1 pure refactor; S3 switches callers to
 * `deriveRequiredDimensions`.
 */
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
  return ordered(required);
}

/**
 * I1/erratum E2: requirements are derived from the policy and the required
 * checks; `requiredDimensions` can only add to them. The result is de-duplicated
 * and in canonical dimension order.
 */
export function deriveRequiredDimensions(
  policy: PolicyRequirementInput | null,
  requiredChecks: string[],
): DimensionName[] {
  const declared = policy?.requiredDimensions ?? [];
  const derived: DimensionName[] = [...declared];
  if (policy?.signature.mode === "required") {
    derived.push("signature", "trust");
  }
  if (policy?.humanReview.required === true) {
    derived.push("humanReview");
  }
  return computeRequiredDimensions(requiredChecks, derived);
}

export function statusForDimension(
  states: DimensionStates,
  dimension: DimensionName,
): DimensionStatus {
  switch (dimension) {
    case "integrity":
      return states.integrity.package;
    case "integrity.package":
      return states.integrity.package;
    case "integrity.artifacts":
      return states.integrity.artifacts;
    case "sources":
      return states.sources.integrity;
    case "sources.integrity":
      return states.sources.integrity;
    case "sources.availability":
      return states.sources.availability;
    case "signature":
      return states.signature.validity;
    case "signature.validity":
      return states.signature.validity;
    case "trust":
      return states.trust.signerIdentity;
    case "trust.signerIdentity":
      return states.trust.signerIdentity;
    case "trust.policyDecision":
      return states.trust.policyDecision;
    case "trust.checkerRecognition":
      return states.trust.checkerRecognition;
    case "trust.profileRecognition":
      return states.trust.profileRecognition;
    case "checks":
      return states.checks.results.every(
        (result) => !result.required || result.outcome === "PASS" || result.outcome === "FAIL",
      )
        ? "PASS"
        : "NOT_EVALUATED";
    case "humanReview":
      return states.humanReview.status;
  }
}

function isDecidedIntegrity(status: IntegrityState): boolean {
  return status === "PASS" || status === "FAIL";
}
function isDecidedSource(status: SourceIntegrityState): boolean {
  return status === "PASS" || status === "FAIL";
}
function isDecidedAvailability(status: SourceAvailabilityState): boolean {
  return status === "PASS" || status === "NOT_APPLICABLE";
}
function isDecidedSignature(status: SignatureValidityState): boolean {
  return status === "VALID" || status === "INVALID" || status === "NOT_APPLICABLE";
}
function isDecidedSigner(status: SignerIdentityState): boolean {
  return status === "TRUSTED" || status === "UNTRUSTED" || status === "NOT_APPLICABLE";
}
function isDecidedPolicyDecision(status: PolicyDecisionState): boolean {
  return status === "ACCEPTED" || status === "REJECTED" || status === "STALE";
}
function isDecidedRecognition(status: RecognitionState): boolean {
  return status === "PASS" || status === "UNTRUSTED" || status === "NOT_APPLICABLE";
}

/**
 * RFC §7.5 "decided": the dimension was evaluated, even when the result is
 * negative. `STALE` is decided; limits and unreadable inputs are not.
 */
export function isDimensionDecided(dimension: DimensionName, states: DimensionStates): boolean {
  switch (dimension) {
    case "integrity":
      return (
        isDecidedIntegrity(states.integrity.package) &&
        isDecidedIntegrity(states.integrity.artifacts)
      );
    case "integrity.package":
      return isDecidedIntegrity(states.integrity.package);
    case "integrity.artifacts":
      return isDecidedIntegrity(states.integrity.artifacts);
    case "sources":
      return (
        isDecidedSource(states.sources.integrity) &&
        isDecidedAvailability(states.sources.availability)
      );
    case "sources.integrity":
      return isDecidedSource(states.sources.integrity);
    case "sources.availability":
      return isDecidedAvailability(states.sources.availability);
    case "signature":
    case "signature.validity":
      return isDecidedSignature(states.signature.validity);
    case "trust":
      return (
        isDecidedSigner(states.trust.signerIdentity) &&
        isDecidedPolicyDecision(states.trust.policyDecision) &&
        isDecidedRecognition(states.trust.checkerRecognition) &&
        isDecidedRecognition(states.trust.profileRecognition)
      );
    case "trust.signerIdentity":
      return isDecidedSigner(states.trust.signerIdentity);
    case "trust.policyDecision":
      return isDecidedPolicyDecision(states.trust.policyDecision);
    case "trust.checkerRecognition":
      return isDecidedRecognition(states.trust.checkerRecognition);
    case "trust.profileRecognition":
      return isDecidedRecognition(states.trust.profileRecognition);
    case "checks":
      return states.checks.results
        .filter((result) => result.required !== false)
        .every((result) => result.outcome === "PASS" || result.outcome === "FAIL");
    case "humanReview":
      return states.humanReview.status === "PASS" || states.humanReview.status === "NOT_APPLICABLE";
  }
}

function isPositiveIntegrity(status: IntegrityState): boolean {
  return status === "PASS";
}
function isPositiveSource(status: SourceIntegrityState): boolean {
  return status === "PASS";
}
function isPositiveAvailability(status: SourceAvailabilityState): boolean {
  return status === "PASS" || status === "NOT_APPLICABLE";
}
function isPositiveSignature(status: SignatureValidityState): boolean {
  return status === "VALID" || status === "NOT_APPLICABLE";
}
function isPositiveSigner(status: SignerIdentityState): boolean {
  return status === "TRUSTED" || status === "NOT_APPLICABLE";
}
function isPositivePolicyDecision(status: PolicyDecisionState): boolean {
  return status === "ACCEPTED";
}
function isPositiveRecognition(status: RecognitionState): boolean {
  return status === "PASS" || status === "NOT_APPLICABLE";
}

/**
 * I3 "applicable positive state": `PASS`, `VALID`, `TRUSTED`, `ACCEPTED`, or
 * `NOT_APPLICABLE` where the dimension allows it.
 */
export function isDimensionPositive(dimension: DimensionName, states: DimensionStates): boolean {
  switch (dimension) {
    case "integrity":
      return (
        isPositiveIntegrity(states.integrity.package) &&
        isPositiveIntegrity(states.integrity.artifacts)
      );
    case "integrity.package":
      return isPositiveIntegrity(states.integrity.package);
    case "integrity.artifacts":
      return isPositiveIntegrity(states.integrity.artifacts);
    case "sources":
      return (
        isPositiveSource(states.sources.integrity) &&
        isPositiveAvailability(states.sources.availability)
      );
    case "sources.integrity":
      return isPositiveSource(states.sources.integrity);
    case "sources.availability":
      return isPositiveAvailability(states.sources.availability);
    case "signature":
    case "signature.validity":
      return isPositiveSignature(states.signature.validity);
    case "trust":
      return (
        isPositiveSigner(states.trust.signerIdentity) &&
        isPositivePolicyDecision(states.trust.policyDecision) &&
        isPositiveRecognition(states.trust.checkerRecognition) &&
        isPositiveRecognition(states.trust.profileRecognition)
      );
    case "trust.signerIdentity":
      return isPositiveSigner(states.trust.signerIdentity);
    case "trust.policyDecision":
      return isPositivePolicyDecision(states.trust.policyDecision);
    case "trust.checkerRecognition":
      return isPositiveRecognition(states.trust.checkerRecognition);
    case "trust.profileRecognition":
      return isPositiveRecognition(states.trust.profileRecognition);
    case "checks":
      return states.checks.results
        .filter((result) => result.required !== false)
        .every((result) => result.outcome === "PASS");
    case "humanReview":
      return states.humanReview.status === "PASS" || states.humanReview.status === "NOT_APPLICABLE";
  }
}

function isErrorIntegrity(status: IntegrityState): boolean {
  return status === "FAIL";
}
function isErrorSource(status: SourceIntegrityState): boolean {
  return status === "FAIL";
}
function isErrorSignature(status: SignatureValidityState): boolean {
  return status === "INVALID";
}
function isErrorSigner(status: SignerIdentityState): boolean {
  return status === "UNTRUSTED";
}
function isErrorPolicyDecision(status: PolicyDecisionState): boolean {
  return status === "REJECTED";
}
function isErrorRecognition(status: RecognitionState): boolean {
  return status === "UNTRUSTED";
}

/**
 * A decided dimension whose evaluation produced a negative result. Error states
 * take part in the FAIL/UNTRUSTED/UNSUPPORTED precedence; `STALE` is decided but
 * not an error.
 */
export function isDimensionError(dimension: DimensionName, states: DimensionStates): boolean {
  switch (dimension) {
    case "integrity":
      return (
        isErrorIntegrity(states.integrity.package) || isErrorIntegrity(states.integrity.artifacts)
      );
    case "integrity.package":
      return isErrorIntegrity(states.integrity.package);
    case "integrity.artifacts":
      return isErrorIntegrity(states.integrity.artifacts);
    case "sources":
      return isErrorSource(states.sources.integrity);
    case "sources.integrity":
      return isErrorSource(states.sources.integrity);
    case "sources.availability":
      return false;
    case "signature":
    case "signature.validity":
      return isErrorSignature(states.signature.validity);
    case "trust":
      return (
        isErrorSigner(states.trust.signerIdentity) ||
        isErrorPolicyDecision(states.trust.policyDecision) ||
        isErrorRecognition(states.trust.checkerRecognition) ||
        isErrorRecognition(states.trust.profileRecognition)
      );
    case "trust.signerIdentity":
      return isErrorSigner(states.trust.signerIdentity);
    case "trust.policyDecision":
      return isErrorPolicyDecision(states.trust.policyDecision);
    case "trust.checkerRecognition":
      return isErrorRecognition(states.trust.checkerRecognition);
    case "trust.profileRecognition":
      return isErrorRecognition(states.trust.profileRecognition);
    case "checks":
      return states.checks.results
        .filter((result) => result.required !== false)
        .some((result) => result.outcome === "FAIL");
    case "humanReview":
      return false;
  }
}

export type DimensionClass = "positive" | "decided" | "error" | "undecided";

export function classifyDimension(
  dimension: DimensionName,
  states: DimensionStates,
): DimensionClass {
  if (!isDimensionDecided(dimension, states)) return "undecided";
  if (isDimensionPositive(dimension, states)) return "positive";
  if (isDimensionError(dimension, states)) return "error";
  return "decided";
}

export function resolveRequiredCheckOutcomes(
  states: DimensionStates,
  requiredChecks: string[],
): CheckOutcome[] {
  const results = new Map(
    states.checks.results.map((result) => [result.checkId, result.outcome] as const),
  );
  return requiredChecks.map((checkId) => results.get(checkId) ?? "NOT_EVALUATED");
}

/**
 * I3/I4: the derived requirement set is empty. Kept in one place so the fold,
 * coverage and the report adapter cannot drift on what "no requirement" means.
 */
export function isEmptyRequiredSet(
  requiredChecks: string[],
  requiredDimensions: DimensionName[],
): boolean {
  return requiredChecks.length === 0 && requiredDimensions.length === 0;
}

/** I4: coverage is evaluation completeness, not a verdict alias. */
export function isCoverageFull(
  states: DimensionStates,
  requiredChecks: string[],
  requiredDimensions: DimensionName[],
  limitStopped: boolean,
  scanIncomplete: boolean = false,
): boolean {
  const outcomes = resolveRequiredCheckOutcomes(states, requiredChecks);
  const emptyRequiredSet = isEmptyRequiredSet(requiredChecks, requiredDimensions);
  return (
    !limitStopped &&
    !scanIncomplete &&
    !emptyRequiredSet &&
    !outcomes.includes("UNSUPPORTED") &&
    !outcomes.includes("NOT_EVALUATED") &&
    requiredDimensions.every((dimension) => isDimensionDecided(dimension, states))
  );
}

const VERDICT_RANK: Record<Verdict, number> = {
  FAIL: 5,
  UNTRUSTED: 4,
  UNSUPPORTED: 3,
  INCOMPLETE: 2,
  NOT_EVALUATED: 1,
  PASS: 0,
};

function nonPositiveVerdict(dimension: DimensionName, states: DimensionStates): Verdict {
  if (!isDimensionDecided(dimension, states)) return "INCOMPLETE";
  const status = statusForDimension(states, dimension);
  if (status === "FAIL" || status === "INVALID") return "FAIL";
  if (status === "UNTRUSTED" || status === "REJECTED") return "UNTRUSTED";
  if (status === "UNSUPPORTED") return "UNSUPPORTED";
  return "INCOMPLETE";
}

/**
 * I3: a pure fold over the required dimension states and the normalized
 * `VerdictContext`. Precedence is FAIL → UNTRUSTED → UNSUPPORTED → INCOMPLETE →
 * NOT_EVALUATED → PASS. An empty required set is INCOMPLETE, never
 * NOT_EVALUATED; `NOT_EVALUATED` is the degenerate report where no required
 * check could be evaluated at all.
 *
 * S3 wiring: the caller derives `requiredDimensions` from the policy and the
 * required checks (I1/erratum E2) and computes `coverageFull` from the same
 * requirement set (I4). The fold therefore reads no policy field as a hidden
 * requirement: `signatureMode` and `humanReviewRequired` stay in the context
 * for traceability, but `signature.mode: required` reaches the fold as
 * `signature` + `trust` in `requiredDimensions`, and an unmet quorum reaches it
 * as an undecided `trust` dimension (the targeted #154 special case is gone).
 */
export function computeVerdict(states: DimensionStates, context: VerdictContext): Verdict {
  const requiredOutcomes = resolveRequiredCheckOutcomes(states, context.requiredChecks);
  const recognitionRequired = context.requiredDimensions.some(
    (dimension) =>
      dimension === "trust" ||
      dimension === "trust.checkerRecognition" ||
      dimension === "trust.profileRecognition",
  );
  const signatureRequired =
    context.requiredDimensions.includes("signature") ||
    context.requiredDimensions.includes("signature.validity");

  // 1. FAIL — an evaluated negative result: a failed required check, an
  // integrity/source failure (those dimensions cannot be skipped), or a
  // required signature that evaluated to INVALID.
  if (
    requiredOutcomes.includes("FAIL") ||
    states.integrity.package === "FAIL" ||
    states.integrity.artifacts === "FAIL" ||
    states.sources.integrity === "FAIL" ||
    (signatureRequired && states.signature.validity === "INVALID")
  ) {
    return "FAIL";
  }

  // 2. UNTRUSTED — an evaluated-and-rejected trust input. An explicit rejection
  // is affirmative evidence even when the operator did not list `trust`; a
  // recognition only counts when the policy requires recognition.
  if (
    states.trust.signerIdentity === "UNTRUSTED" ||
    states.trust.policyDecision === "REJECTED" ||
    (recognitionRequired &&
      (states.trust.checkerRecognition === "UNTRUSTED" ||
        states.trust.profileRecognition === "UNTRUSTED"))
  ) {
    return "UNTRUSTED";
  }

  // 3. UNSUPPORTED
  if (
    requiredOutcomes.includes("UNSUPPORTED") ||
    context.unsupportedVersion ||
    context.unsupportedFeature ||
    (recognitionRequired &&
      (states.trust.checkerRecognition === "UNSUPPORTED" ||
        states.trust.profileRecognition === "UNSUPPORTED"))
  ) {
    return "UNSUPPORTED";
  }

  // 4. INCOMPLETE — the evaluation was incomplete. `coverageFull` is the I4
  // completeness result over the same derived requirement set, so it already
  // covers limit stops, the empty required set, non-evaluated/unsupported
  // required checks and undecided required dimensions; re-testing those here
  // would duplicate the coverage rule. A stale policy never supports PASS,
  // whether or not the policy requires `trust` (RFC §7.4).
  if (context.policyState === "STALE" || !context.coverageFull) {
    return "INCOMPLETE";
  }

  // 5. NOT_EVALUATED — degenerate report where no required check was evaluated.
  if (requiredOutcomes.length === 0) {
    return "NOT_EVALUATED";
  }

  // 6. PASS requires every required dimension to be in its applicable positive
  // state; any other decided-but-negative state maps to its precedence class.
  // This guard is the fold's only PASS gate: S3 re-derived it for the derived
  // required set (a decided-but-non-positive status such as `STALE` reaches
  // here), and it also protects a caller-built context from a vacuous PASS.
  let verdict: Verdict = "PASS";
  for (const dimension of context.requiredDimensions) {
    if (isDimensionPositive(dimension, states)) continue;
    const candidate = nonPositiveVerdict(dimension, states);
    if (VERDICT_RANK[candidate] > VERDICT_RANK[verdict]) {
      verdict = candidate;
    }
  }
  return verdict;
}
