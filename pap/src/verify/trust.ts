/**
 * Signature-envelope, trust-policy and human-review evaluation.
 */

import type { ClaimState } from "../checks.js";
import { jcsBytes } from "../json.js";
import type { Manifest } from "../manifest.js";
import type { DirectoryOpener, DirectoryResolver, PackageRoot } from "../paths.js";
import type { LoadedPolicy, TrustPolicy } from "../policy.js";
import { evaluateSignatures } from "../signatures.js";
import type { SignatureEvaluation } from "../signatures.js";
import { parseRfc3339 } from "../time.js";
import type { Instant } from "../time.js";
import type { JsonValue, Limits, VerificationReport } from "../types.js";
import { CHECKER } from "../version.js";
import type { Diag } from "./options.js";

export interface SignatureTrustEvaluation {
  signature: SignatureEvaluation;
  trust: VerificationReport["dimensions"]["trust"];
  humanReview: VerificationReport["dimensions"]["humanReview"];
  /** True when signature-envelope discovery failed at package level. */
  integrityFailure: boolean;
}

export async function evaluateSignatureTrust(options: {
  root: PackageRoot;
  manifestValue: JsonValue;
  manifest: Manifest | null;
  structuralFailure: boolean;
  loadedPolicy: LoadedPolicy | undefined;
  packageIdentity: string;
  limits: Limits;
  evaluatedAt: Instant;
  reviews: ClaimState | undefined;
  diag: Diag;
  openDirectory?: DirectoryOpener;
  resolveDirectory?: DirectoryResolver;
}): Promise<SignatureTrustEvaluation> {
  const {
    root,
    manifestValue,
    manifest,
    structuralFailure,
    loadedPolicy,
    packageIdentity,
    limits,
    evaluatedAt,
    reviews,
    diag,
  } = options;
  // Signature and trust dimensions.
  let signatureEvaluation: SignatureEvaluation;
  if (
    manifest !== null &&
    !structuralFailure &&
    loadedPolicy?.policy.signature.mode !== "disabled"
  ) {
    const mode = loadedPolicy?.policy.signature.mode ?? "optional";
    signatureEvaluation = await evaluateSignatures({
      root,
      canonicalManifest: jcsBytes(manifestValue),
      policy: loadedPolicy?.policy,
      policyFresh: loadedPolicy?.state !== "STALE",
      packageId: manifest.package.id,
      packageIdentity,
      mode,
      limits,
      ...(options.openDirectory === undefined ? {} : { openDirectory: options.openDirectory }),
      ...(options.resolveDirectory === undefined
        ? {}
        : { resolveDirectory: options.resolveDirectory }),
    });
  } else {
    signatureEvaluation = {
      validity: "NOT_APPLICABLE",
      entries: [],
      signerIdentity: "NOT_APPLICABLE",
      policyDecision: "NOT_EVALUATED",
      envelopeLimitHit: false,
      discoveryFailure: false,
      scanIncomplete: false,
      readNone: false,
      diagnostics: [],
    };
  }
  for (const diagnostic of signatureEvaluation.diagnostics) {
    diag(diagnostic.code, diagnostic.severity, diagnostic.scope, diagnostic.message);
  }
  let integrityFailure = false;
  if (signatureEvaluation.discoveryFailure) {
    integrityFailure = true;
  }
  if (
    loadedPolicy !== undefined &&
    !signatureEvaluation.discoveryFailure &&
    !signatureEvaluation.scanIncomplete &&
    signatureEvaluation.entries.length === 0 &&
    !signatureEvaluation.envelopeLimitHit
  ) {
    if (loadedPolicy.policy.signature.mode === "optional") {
      diag("pap.signature.absent", "info", "signatures", "no signature envelope is present");
    } else if (loadedPolicy.policy.signature.mode === "required") {
      diag(
        "pap.signature.absent",
        "warning",
        "signatures",
        "a signature is required but no envelope is present",
      );
    }
  }
  if (
    loadedPolicy?.policy.signature.mode === "required" &&
    signatureEvaluation.entries.length > 0 &&
    !signatureEvaluation.scanIncomplete &&
    signatureEvaluation.validity !== "INVALID" &&
    signatureEvaluation.policyDecision === "NOT_EVALUATED" &&
    !signatureEvaluation.envelopeLimitHit
  ) {
    diag(
      "pap.signature.absent",
      "warning",
      "signatures",
      "the required signature quorum is not met",
    );
  }
  if (signatureEvaluation.envelopeLimitHit) {
    // `evaluateSignatures` already emitted the limit diagnostic.
  }

  const trust = evaluateTrust({
    policy: loadedPolicy?.policy,
    state: loadedPolicy?.state ?? "ABSENT",
    signature: signatureEvaluation,
    manifest,
    checker: CHECKER,
    diag,
  });

  const humanReview = evaluateHumanReview({
    policy: loadedPolicy?.policy,
    evaluatedAt,
    packageIdentity,
    manifest,
    reviews,
    diag,
  });

  return { signature: signatureEvaluation, trust, humanReview, integrityFailure };
}

export function evaluateTrust(options: {
  policy: TrustPolicy | undefined;
  state: "FRESH" | "STALE" | "ABSENT";
  signature: SignatureEvaluation;
  manifest: Manifest | null;
  checker: { id: string; version: string; implementationDigest: string };
  diag: Diag;
}): VerificationReport["dimensions"]["trust"] {
  const { policy } = options;
  if (policy === undefined) {
    return {
      signerIdentity: options.signature.entries.length === 0 ? "NOT_APPLICABLE" : "NOT_EVALUATED",
      policyDecision: "NOT_EVALUATED",
      checkerRecognition: "NOT_EVALUATED",
      profileRecognition: "NOT_EVALUATED",
    };
  }
  let checkerRecognition: VerificationReport["dimensions"]["trust"]["checkerRecognition"];
  if (policy.checkers.length === 0) {
    checkerRecognition = "NOT_APPLICABLE";
  } else {
    const sameIdVersion = policy.checkers.filter(
      (pin) => pin.id === options.checker.id && pin.version === options.checker.version,
    );
    if (sameIdVersion.length === 0) {
      checkerRecognition = "UNSUPPORTED";
      options.diag(
        "pap.trust.checker-unknown",
        "warning",
        "checker",
        "checker identity is not pinned by the policy",
      );
    } else if (
      sameIdVersion.some((pin) => pin.implementationDigest === options.checker.implementationDigest)
    ) {
      checkerRecognition = "PASS";
    } else {
      checkerRecognition = "UNTRUSTED";
      options.diag(
        "pap.trust.checker-untrusted",
        "warning",
        "checker",
        "checker implementation digest does not match the policy pin",
      );
    }
  }

  let profileRecognition: VerificationReport["dimensions"]["trust"]["profileRecognition"];
  const profile = options.manifest?.profile;
  if (profile === undefined || policy.profiles.length === 0) {
    profileRecognition = "NOT_APPLICABLE";
  } else {
    const pin = policy.profiles.find(
      (candidate) => candidate.id === profile.id && candidate.version === profile.version,
    );
    if (pin === undefined) {
      profileRecognition = "UNSUPPORTED";
      options.diag(
        "pap.trust.profile-unknown",
        "warning",
        "profile",
        "profile identity is not pinned by the policy",
      );
    } else if (pin.closureDigest !== undefined) {
      if (profile.closureDigest === undefined) {
        profileRecognition = "UNSUPPORTED";
        options.diag(
          "pap.trust.profile-unknown",
          "warning",
          "profile",
          "policy pins a closure digest the package does not declare",
        );
      } else if (pin.closureDigest !== profile.closureDigest) {
        profileRecognition = "UNTRUSTED";
        options.diag(
          "pap.trust.profile-untrusted",
          "warning",
          "profile",
          "profile closure digest does not match the policy pin",
        );
      } else {
        profileRecognition = "PASS";
      }
    } else {
      profileRecognition = "PASS";
    }
  }

  // RFC §4.3.4: the envelope-count limit reads no envelope, so the signature
  // scope is NOT_EVALUATED rather than absent. A per-envelope limit must not
  // hide the aggregate of the envelopes that were evaluated.
  const signerIdentity = options.signature.readNone
    ? "NOT_EVALUATED"
    : options.signature.entries.length === 0
      ? "NOT_APPLICABLE"
      : options.signature.signerIdentity;
  const policyDecision = options.state === "STALE" ? "STALE" : options.signature.policyDecision;
  if (policyDecision === "REJECTED" && options.signature.entries.length > 0) {
    // Per-entry diagnostics explain the rejection; this aggregate code is only
    // needed when nothing more specific exists.
  }
  return {
    signerIdentity,
    policyDecision,
    checkerRecognition,
    profileRecognition,
  };
}

function evaluateHumanReview(options: {
  policy: TrustPolicy | undefined;
  evaluatedAt: Instant;
  packageIdentity: string;
  manifest: Manifest | null;
  reviews: ClaimState | undefined;
  diag: Diag;
}): VerificationReport["dimensions"]["humanReview"] {
  if (options.policy === undefined || !options.policy.humanReview.required) {
    return { status: "NOT_APPLICABLE" };
  }
  const claim = options.reviews;
  if (claim === undefined || claim.status !== "ok" || claim.parsed === undefined) {
    options.diag(
      "pap.review.missing",
      "warning",
      "reviews",
      "required human-review evidence is absent or unusable",
    );
    return { status: "INCOMPLETE" };
  }
  const reviews = claim.parsed;
  if (reviews.kind !== "reviews") {
    options.diag(
      "pap.review.missing",
      "warning",
      "reviews",
      "required human-review evidence is unusable",
    );
    return { status: "INCOMPLETE" };
  }
  const artifactIds = new Set(options.manifest?.artifacts.map((artifact) => artifact.id) ?? []);
  let anyInScope = false;
  let anyValid = false;
  let anyUnrecognized = false;
  let anyBindingInvalid = false;
  let anyStale = false;
  let anyRejected = false;
  for (const approval of reviews.approvals) {
    let inScope = false;
    if (approval.scope?.packageIdentity !== undefined) {
      inScope = approval.scope.packageIdentity === options.packageIdentity;
    } else if (approval.scope?.artifacts !== undefined) {
      const declared = [...artifactIds].sort();
      const reviewed = [...approval.scope.artifacts].sort();
      inScope =
        declared.length === reviewed.length &&
        declared.every((id, index) => id === reviewed[index]);
    }
    if (!inScope) {
      anyBindingInvalid = true;
      continue;
    }
    anyInScope = true;
    if (approval.decision === "rejected") {
      anyRejected = true;
      continue;
    }
    const decidedAt = parseTime(approval.decidedAt);
    if (decidedAt === null) {
      anyStale = true;
      continue;
    }
    const age = options.evaluatedAt - decidedAt;
    const maxAge = BigInt(options.policy.humanReview.maxAgeSeconds) * 1_000_000_000n;
    const futureSkew = 300n * 1_000_000_000n;
    if (age < -futureSkew || age > maxAge) {
      anyStale = true;
      continue;
    }
    const recognized = options.policy.signers.some(
      (signer) =>
        signer.identity === approval.reviewer.identity && signer.allowedRoles.includes("reviewer"),
    );
    if (!recognized) {
      anyUnrecognized = true;
      continue;
    }
    anyValid = true;
  }

  if (anyValid && !anyRejected) {
    options.diag(
      "pap.review.unbound",
      "info",
      "reviews",
      "approval is an unverified producer claim, not authenticated approval",
    );
    return { status: "PASS", basis: "unbound-claim" };
  }
  if (anyRejected) {
    options.diag(
      "pap.trust.review-required",
      "warning",
      "reviews",
      "an in-scope review decision is rejected",
    );
    return { status: "INCOMPLETE" };
  }
  if (!anyInScope || anyBindingInvalid) {
    options.diag(
      "pap.review.binding-invalid",
      "warning",
      "reviews",
      "review evidence does not bind this package",
    );
    return { status: "INCOMPLETE" };
  }
  if (anyStale) {
    options.diag(
      "pap.review.stale",
      "warning",
      "reviews",
      "review evidence is stale or has an unusable timestamp",
    );
    return { status: "INCOMPLETE" };
  }
  if (anyUnrecognized) {
    options.diag(
      "pap.review.unknown-reviewer",
      "warning",
      "reviews",
      "reviewer identity is not recognized by the policy",
    );
    return { status: "UNKNOWN" };
  }
  options.diag("pap.review.missing", "warning", "reviews", "no usable approval evidence");
  return { status: "INCOMPLETE" };
}

function parseTime(value: string): Instant | null {
  return parseRfc3339(value);
}
