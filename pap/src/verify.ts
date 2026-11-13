/**
 * `pap verify` orchestration: load a directory package, compute identities,
 * evaluate the three checks and the optional local trust policy, and assemble
 * the Appendix C report.
 *
 * The phases live in `pap/src/verify/`; this module keeps the `verifyPackage`
 * orchestration and re-exports the public names so consumers keep importing
 * from `../src/verify.js`.
 */

import { decodeManifest } from "./decode.js";
import { domainHash } from "./digest.js";
import { JsonParseError, jcsBytes, parseJsonStrict } from "./json.js";
import type { CheckSpec } from "./manifest.js";
import { readPackageFile, resolvePackageRoot } from "./paths.js";
import { loadPolicy, PolicyInvalid } from "./policy.js";
import type { LoadedPolicy } from "./policy.js";
import { systemClock } from "./time.js";
import type { Diagnostic, Limits, VerificationReport } from "./types.js";
import { DEFAULT_LIMITS } from "./types.js";
import { evaluateChecks, requiredCheckIds } from "./verify/checks.js";
import { IoFailure, UsageError } from "./verify/errors.js";
import { loadPayloads } from "./verify/loading.js";
import { exitCodeForVerdict } from "./verify/options.js";
import type { Payloads, VerifyOptions, VerifyResult } from "./verify/options.js";
import { assembleReport, failedManifestReport, reportUndeclaredFiles } from "./verify/report.js";
import { evaluateSignatureTrust } from "./verify/trust.js";

export async function verifyPackage(options: VerifyOptions): Promise<VerifyResult> {
  const evaluatedAt = options.now ?? systemClock();
  const rootResult = await resolvePackageRoot(options.packagePath);
  if (!rootResult.ok) {
    if (rootResult.failure === "not-found") {
      throw new IoFailure("pap.package.not-found", rootResult.message);
    }
    if (rootResult.failure === "not-directory") {
      throw new UsageError("pap.cli.usage", rootResult.message);
    }
    throw new IoFailure("pap.package.io", rootResult.message);
  }
  const root = rootResult.root;

  let loadedPolicy: LoadedPolicy | undefined;
  if (options.policyPath !== undefined) {
    try {
      loadedPolicy = await loadPolicy(options.policyPath, evaluatedAt);
    } catch (error) {
      if (error instanceof PolicyInvalid) {
        throw new UsageError("pap.trust.policy-invalid", error.message);
      }
      throw error;
    }
  }
  const limits: Limits =
    loadedPolicy === undefined
      ? DEFAULT_LIMITS
      : { ...DEFAULT_LIMITS, ...loadedPolicy.effectiveLimits };

  const diagnostics: Diagnostic[] = [];
  const diag = (
    code: string,
    severity: Diagnostic["severity"],
    scope: string,
    message: string,
  ): void => {
    diagnostics.push({ code, severity, scope, message });
  };
  if (loadedPolicy !== undefined) {
    const lowered = Object.keys(loadedPolicy.loweredLimits) as (keyof Limits)[];
    if (lowered.length > 0) {
      diag(
        "pap.limit.lowered",
        "info",
        "limits",
        `operator lowered limits: ${lowered.map((name) => `${name}=${loadedPolicy?.effectiveLimits[name]}`).join(", ")}`,
      );
    }
    if (loadedPolicy.staleReason !== null) {
      diag(
        loadedPolicy.staleReason,
        "warning",
        "policy",
        "trust policy is outside its validity window",
      );
    }
  } else {
    diag("pap.trust.policy-absent", "info", "policy", "no trust policy supplied");
  }

  const manifestRead = await readPackageFile(
    root,
    "assurance-package.json",
    limits,
    limits.manifestBytes,
  );
  if (!manifestRead.ok || manifestRead.bytes === undefined) {
    const failure = manifestRead.failure ?? "io";
    const code = failure === "limit" ? "pap.package.limit-exceeded" : "pap.package.io";
    diag(
      code,
      "error",
      "assurance-package.json",
      manifestRead.message ?? "cannot read the manifest",
    );
    const report = failedManifestReport(
      root,
      evaluatedAt,
      loadedPolicy,
      diagnostics,
      limits,
      options.policyPath,
    );
    return { report, exitCode: 1 };
  }

  let manifestValue;
  try {
    manifestValue = parseJsonStrict(manifestRead.bytes, {
      nesting: limits.jsonNesting,
      stringBytes: limits.jsonStringBytes,
    });
  } catch (error) {
    let code = "pap.package.manifest-json";
    if (error instanceof JsonParseError) {
      if (error.failure === "duplicate-key") code = "pap.package.duplicate-key";
      if (error.failure === "limit") code = "pap.package.limit-exceeded";
    }
    diag(
      code,
      "error",
      "assurance-package.json",
      error instanceof Error ? error.message : "manifest is not valid JSON",
    );
    const report = failedManifestReport(
      root,
      evaluatedAt,
      loadedPolicy,
      diagnostics,
      limits,
      options.policyPath,
    );
    return { report, exitCode: 1 };
  }

  const packageIdentity = domainHash("pap.package.v1", jcsBytes(manifestValue));
  const validation = decodeManifest(manifestValue, limits);
  const manifest = validation.manifest;
  const structuralFailure =
    manifest === null ||
    validation.defects.some((defect) => defect.structural) ||
    !validation.payloadsUsable;
  const artifactPathFailure = validation.defects.some((defect) => defect.artifactLevel);
  // RFC §4.3.1 / Appendix J.1: a duplicate or grammar-invalid declared path is
  // an integrity failure regardless of which payload class it belongs to; the
  // artifact-level flag only decides the artifacts dimension.
  const declaredPathFailure = validation.defects.some(
    (defect) =>
      defect.code === "pap.package.path-duplicate" || defect.code === "pap.package.path-invalid",
  );

  for (const defect of validation.defects) {
    diag(defect.code, "error", defect.scope, defect.message);
  }
  if (validation.compat === "minor-newer") {
    diag(
      "pap.compat.minor-newer",
      "warning",
      "papVersion",
      `unsupported newer minor ${validation.papVersion}`,
    );
  } else if (validation.compat === "version-unsupported") {
    diag(
      "pap.compat.version-unsupported",
      "warning",
      "papVersion",
      `unsupported papVersion ${validation.papVersion}`,
    );
  }
  for (const feature of validation.unsupportedFeatures) {
    diag(
      "pap.feature.unsupported",
      "warning",
      "requiredFeatures",
      `required feature ${feature} is not supported`,
    );
  }
  for (const extension of validation.unsupportedCriticalExtensions) {
    diag(
      "pap.extension.critical-unsupported",
      "warning",
      "extensions",
      `critical extension ${extension} is not supported`,
    );
  }
  for (const extension of validation.ignoredExtensions) {
    diag(
      "pap.extension.ignored",
      "info",
      "extensions",
      `non-critical extension ${extension} was ignored`,
    );
  }

  const declaredSpecs: CheckSpec[] = manifest?.checkSpecs ?? validation.checkSpecs;
  const policyChecks = loadedPolicy?.policy.requiredChecks ?? [];

  const payloads = await loadPayloads(root, limits, manifest, structuralFailure, diagnostics, diag);
  let scanIncomplete = false;
  let nestedManifestFailure = false;
  if (manifest !== null && !structuralFailure) {
    const scan = await reportUndeclaredFiles(root, manifest, limits, diag);
    scanIncomplete = scan.incomplete;
    nestedManifestFailure = scan.nestedManifest;
  }
  if (
    manifest?.build?.normalizedInputDigest !== undefined &&
    payloads.normalizedInputDigest !== null &&
    manifest.build.normalizedInputDigest !== payloads.normalizedInputDigest
  ) {
    diag(
      "pap.integrity.input-mismatch",
      "error",
      "build.normalizedInputDigest",
      "build.normalizedInputDigest does not match the computed normalized input digest",
    );
  }
  const requiredChecks = requiredCheckIds(declaredSpecs, policyChecks, manifest !== null);

  const checkEvaluation = evaluateChecks({
    manifest,
    declaredSpecs,
    policyChecks,
    requiredChecks,
    packageIdentity,
    payloads,
    structuralFailure,
    unsupportedVersion: validation.compat !== null,
    limitHit: payloads.limitHit,
    limitedClasses: payloads.limitedClasses,
    limits,
    diagnostics,
    diag,
  });

  const sourcesIntegrity: VerificationReport["dimensions"]["sources"]["integrity"] =
    manifest === null || structuralFailure
      ? "NOT_EVALUATED"
      : payloads.sources.length === 0
        ? "NOT_EVALUATED"
        : payloads.sources.some((source) => source.status === "mismatch")
          ? "FAIL"
          : payloads.sources.some((source) => source.status === "referenced")
            ? "UNAVAILABLE"
            : payloads.sources.some((source) => source.status !== "ok")
              ? "NOT_EVALUATED"
              : "PASS";

  const sourceCheckRequired = requiredChecks.includes("pap.check.source-quote/1");
  const sourcesAvailability: VerificationReport["dimensions"]["sources"]["availability"] =
    !sourceCheckRequired
      ? "NOT_APPLICABLE"
      : payloads.sources.length === 0 ||
          payloads.sources.some(
            (source) =>
              source.status === "referenced" ||
              source.status === "unread" ||
              source.status === "missing",
          )
        ? "UNAVAILABLE"
        : "PASS";

  let integrityPackage: VerificationReport["dimensions"]["integrity"]["package"] = "PASS";
  if (structuralFailure || artifactPathFailure || declaredPathFailure || nestedManifestFailure) {
    integrityPackage = "FAIL";
  } else if (
    payloads.artifacts.some((artifact) => artifact.status === "missing") ||
    payloads.sources.some((source) => source.status === "missing") ||
    payloads.inputs.some((input) => input.status === "missing") ||
    payloads.claims.some((claim) => claim.status === "missing")
  ) {
    integrityPackage = "FAIL";
  } else if (
    payloads.inputs.some((input) => input.status === "mismatch") ||
    payloads.claims.some((claim) => claim.status === "mismatch") ||
    payloads.claims.some((claim) => claim.invalid === true) ||
    (manifest?.build?.normalizedInputDigest !== undefined &&
      payloads.normalizedInputDigest !== null &&
      manifest.build.normalizedInputDigest !== payloads.normalizedInputDigest)
  ) {
    integrityPackage = "FAIL";
  } else if (!payloads.limitHit && payloads.inputs.some((input) => input.status === "unread")) {
    integrityPackage = "NOT_EVALUATED";
  }

  if (payloads.limitHit) {
    diag(
      "pap.package.limit-exceeded",
      "error",
      "package",
      "a resource limit stopped payload evaluation",
    );
  }

  let integrityArtifacts: VerificationReport["dimensions"]["integrity"]["artifacts"] = "PASS";
  if (manifest === null || structuralFailure) {
    integrityArtifacts = "NOT_EVALUATED";
  } else if (
    artifactPathFailure ||
    payloads.artifacts.some(
      (artifact) => artifact.status === "missing" || artifact.status === "mismatch",
    )
  ) {
    integrityArtifacts = "FAIL";
  } else if (payloads.artifacts.some((artifact) => artifact.status === "unread")) {
    integrityArtifacts = "NOT_EVALUATED";
  }

  const trustPhase = await evaluateSignatureTrust({
    root,
    manifestValue,
    manifest,
    structuralFailure,
    loadedPolicy,
    packageIdentity,
    limits,
    evaluatedAt,
    reviews: payloads.claimMap.reviews,
    diag,
  });
  if (trustPhase.integrityFailure) {
    integrityPackage = "FAIL";
  }

  return assembleReport({
    root,
    evaluatedAt,
    packageIdentity,
    manifest,
    validation,
    loadedPolicy,
    policyPath: options.policyPath,
    payloads,
    checkEvaluation,
    signatureEvaluation: trustPhase.signature,
    trust: trustPhase.trust,
    humanReview: trustPhase.humanReview,
    integrityPackage,
    integrityArtifacts,
    sourcesIntegrity,
    sourcesAvailability,
    requiredChecks,
    scanIncomplete,
    diagnostics,
    diag,
  });
}

export { evaluateTrust } from "./verify/trust.js";
export { IoFailure, UsageError, loadPayloads };
export { exitCodeForVerdict };
export type { Payloads, VerifyOptions, VerifyResult };
export { statusForDimension } from "./report.js";
export { DIMENSION_ORDER } from "./policy.js";
export type { CheckRecord, Limitation, SignatureEntry } from "./types.js";
export type { Limits, VerificationReport };
