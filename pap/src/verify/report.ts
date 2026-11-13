/**
 * Appendix C report assembly, limitations, undeclared-file reporting and the
 * failed-manifest report.
 */

import { isImplementedCheck } from "../checks.js";
import type { ClaimState } from "../checks.js";
import type { Manifest, ManifestValidation } from "../manifest.js";
import { pathKey, walkPackageFiles } from "../paths.js";
import type { DirectoryOpener, PackageRoot } from "../paths.js";
import type { LoadedPolicy } from "../policy.js";
import {
  computeCoverage,
  computeVerdict,
  deriveRequiredDimensions,
  isEmptyRequiredSet,
  sortDiagnostics,
  sortLimitations,
  verificationRecordIdentity,
} from "../report.js";
import type { VerdictContext } from "../report.js";
import type { SignatureEvaluation } from "../signatures.js";
import { formatRfc3339 } from "../time.js";
import type { Instant } from "../time.js";
import type { CheckOutcome, Diagnostic, Limits, Limitation, VerificationReport } from "../types.js";
import { REPORT_VERSION, VERIFIER_ID, VERIFIER_VERSION } from "../types.js";
import { CHECKER, checkerIdentity } from "../version.js";
import type { CheckEvaluation } from "./checks.js";
import { exitCodeForVerdict } from "./options.js";
import type { Diag, Payloads, VerifyResult } from "./options.js";

export interface ReportAssembly {
  root: PackageRoot;
  evaluatedAt: Instant;
  packageIdentity: string;
  manifest: Manifest | null;
  validation: ManifestValidation;
  loadedPolicy: LoadedPolicy | undefined;
  policyPath: string | undefined;
  payloads: Payloads;
  checkEvaluation: CheckEvaluation;
  signatureEvaluation: SignatureEvaluation;
  trust: VerificationReport["dimensions"]["trust"];
  humanReview: VerificationReport["dimensions"]["humanReview"];
  integrityPackage: VerificationReport["dimensions"]["integrity"]["package"];
  integrityArtifacts: VerificationReport["dimensions"]["integrity"]["artifacts"];
  sourcesIntegrity: VerificationReport["dimensions"]["sources"]["integrity"];
  sourcesAvailability: VerificationReport["dimensions"]["sources"]["availability"];
  requiredChecks: string[];
  scanIncomplete: boolean;
  diagnostics: Diagnostic[];
  diag: Diag;
}

/**
 * Assemble the Appendix C report once every dimension has been evaluated, then
 * derive coverage and the verdict over the same requirement set and freeze the
 * verification-record identity.
 */
export function assembleReport(options: ReportAssembly): VerifyResult {
  const {
    root,
    evaluatedAt,
    packageIdentity,
    manifest,
    validation,
    loadedPolicy,
    policyPath,
    payloads,
    checkEvaluation,
    signatureEvaluation,
    trust,
    humanReview,
    integrityPackage,
    integrityArtifacts,
    sourcesIntegrity,
    sourcesAvailability,
    requiredChecks,
    scanIncomplete,
    diagnostics,
    diag,
  } = options;

  const dimensions: VerificationReport["dimensions"] = {
    integrity: { package: integrityPackage, artifacts: integrityArtifacts },
    sources: { integrity: sourcesIntegrity, availability: sourcesAvailability },
    signature: {
      validity: signatureEvaluation.validity,
      ...(signatureEvaluation.entries.length === 0
        ? {}
        : { signatures: signatureEvaluation.entries }),
    },
    trust,
    checks: { results: checkEvaluation.results },
    humanReview,
    semanticTruth: "NOT_EVALUATED",
    legalEnforceability: "NOT_EVALUATED",
  };

  const producerClaims = evaluateProducerClaims(
    payloads.claimMap.producerReport,
    checkEvaluation.results,
    diag,
  );

  // I1/erratum E2: requirements are derived from the policy and the required
  // checks. The operator's `requiredDimensions` can only add to the derived set,
  // so an omitted `signature`/`trust`/`humanReview` no longer under-evaluates
  // the package.
  const requiredDimensions = deriveRequiredDimensions(loadedPolicy?.policy ?? null, requiredChecks);
  const signatureMode = loadedPolicy?.policy.signature.mode ?? "optional";
  const humanReviewRequired = loadedPolicy?.policy.humanReview.required === true;
  const emptyRequiredSet = isEmptyRequiredSet(requiredChecks, requiredDimensions);
  if (emptyRequiredSet) {
    diag(
      "pap.package.empty-check-specs",
      "warning",
      "checkSpecs",
      "the package has no required check and the policy adds none",
    );
  }

  const report: VerificationReport = {
    reportVersion: REPORT_VERSION,
    verifier: {
      id: VERIFIER_ID,
      version: VERIFIER_VERSION,
      implementationDigest: CHECKER.implementationDigest,
      checkerIdentities: [checkerIdentity()],
    },
    package: {
      identity: packageIdentity,
      papVersion: validation.papVersion,
      path: root.supplied,
    },
    policy: {
      id: loadedPolicy?.policy.id ?? null,
      digest: loadedPolicy?.digest ?? null,
      state: loadedPolicy?.state ?? "ABSENT",
      ...(policyPath === undefined ? {} : { path: policyPath }),
    },
    evaluatedAt: formatRfc3339(evaluatedAt),
    ...(Object.keys(loadedPolicy?.loweredLimits ?? {}).length > 0
      ? { effectiveLimits: loadedPolicy?.loweredLimits }
      : {}),
    identities: {
      packageIdentity,
      artifacts: payloads.artifacts.map((state) => ({
        id: state.artifact.id,
        declared: state.artifact.digest,
        computed: state.computed,
      })),
      sources: payloads.sources.map((state) => ({
        id: state.source.id,
        declared: state.source.digest,
        computed: state.computed,
      })),
      normalizedInputDigest: payloads.normalizedInputDigest,
      extensionClosureDigest: manifest?.profile?.closureDigest ?? null,
      checkerIdentity: checkerIdentity(),
      verificationRecordIdentity: "",
    },
    dimensions,
    checks: checkEvaluation.records,
    ...(producerClaims === undefined ? {} : { producerClaims }),
    coverage: {
      requiredChecks: [],
      checksEvaluated: 0,
      checksPassed: 0,
      checksFailed: 0,
      checksUnsupported: 0,
      checksNotEvaluated: 0,
      requiredDimensions,
      dimensionsEvaluated: 0,
      full: false,
    },
    limitations: [],
    verdict: "INCOMPLETE",
    diagnostics: [],
  };

  // S3: normalize every verdict input once, then hand the pure fold a single
  // `VerdictContext`. `coverageFull` is the I4 evaluation-completeness result
  // over the same derived requirement set, so the verdict and the coverage
  // counters cannot disagree about what was required.
  const limitStopped = payloads.limitHit || signatureEvaluation.envelopeLimitHit;
  report.coverage = computeCoverage(
    report,
    requiredChecks,
    requiredDimensions,
    limitStopped,
    scanIncomplete,
  );
  const verdictContext: VerdictContext = {
    requiredChecks,
    requiredDimensions,
    signatureMode,
    humanReviewRequired,
    policyState: report.policy.state,
    limitStopped,
    unsupportedVersion: validation.compat !== null,
    unsupportedFeature:
      validation.unsupportedFeatures.length > 0 ||
      validation.unsupportedCriticalExtensions.length > 0,
    emptyRequiredSet,
    coverageFull: report.coverage.full,
  };
  report.verdict = computeVerdict(report, verdictContext);

  report.limitations = buildLimitations(diagnostics);
  report.diagnostics = sortDiagnostics(diagnostics);
  report.identities.verificationRecordIdentity = verificationRecordIdentity(report);

  return { report, exitCode: exitCodeForVerdict(report.verdict) };
}

function evaluateProducerClaims(
  claim: ClaimState | undefined,
  results: { checkId: string; outcome: CheckOutcome }[],
  diag: Diag,
): VerificationReport["producerClaims"] | undefined {
  if (claim === undefined || claim.status !== "ok" || claim.parsed === undefined) {
    return undefined;
  }
  if (claim.parsed.kind !== "producerReport") return undefined;
  const byCheck = new Map(results.map((result) => [result.checkId, result.outcome]));
  const comparison = claim.parsed.claims
    .map((producerClaim) => {
      const independent = byCheck.get(producerClaim.checkId);
      const implemented = isImplementedCheck(producerClaim.checkId);
      let relation: "AGREES" | "DISAGREES" | "UNVERIFIABLE" | "NOT_COMPARABLE";
      if (!implemented) {
        relation = "NOT_COMPARABLE";
      } else if (independent === undefined || independent === "NOT_EVALUATED") {
        relation = "UNVERIFIABLE";
      } else {
        relation = independent === producerClaim.claimedOutcome ? "AGREES" : "DISAGREES";
      }
      if (relation === "DISAGREES") {
        diag(
          "pap.claims.producer-mismatch",
          "warning",
          producerClaim.checkId,
          "producer claim disagrees with the independent check outcome",
        );
      }
      return {
        checkId: producerClaim.checkId,
        claimed: producerClaim.claimedOutcome,
        independentOutcome: independent ?? null,
        relation,
      };
    })
    .sort((a, b) => (a.checkId < b.checkId ? -1 : a.checkId > b.checkId ? 1 : 0));
  return { present: true, trusted: false, comparison };
}

function buildLimitations(diagnostics: Diagnostic[]): Limitation[] {
  const infoKept = new Set([
    "pap.trust.policy-absent",
    "pap.extension.ignored",
    "pap.review.unbound",
    "pap.limit.lowered",
    "pap.signature.absent",
  ]);
  const limitations: Limitation[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "info" || infoKept.has(diagnostic.code)) {
      limitations.push({ code: diagnostic.code, detail: diagnostic.message });
    }
  }
  return sortLimitations(limitations);
}

interface UndeclaredScan {
  incomplete: boolean;
  nestedManifest: boolean;
}

/** RFC §4.3.3: the one canonical package-scope scan-incomplete condition. */
const SCAN_INCOMPLETE_CODE = "pap.package.undeclared-scan-incomplete";

/**
 * Emit the single canonical scan-incomplete diagnostic/limitation. The
 * undeclared-file walker and signature discovery both enumerate the package
 * tree, so the caller combines their results and reports this once.
 */
export function reportScanIncomplete(diag: Diag): void {
  diag(
    SCAN_INCOMPLETE_CODE,
    "warning",
    "package",
    "the undeclared-file scan is incomplete; the absence of undeclared files was not established",
  );
}

export async function reportUndeclaredFiles(
  root: PackageRoot,
  manifest: Manifest,
  limits: Limits,
  diag: Diag,
  openDirectory?: DirectoryOpener,
): Promise<UndeclaredScan> {
  const declared = new Set<string>();
  const add = (relative: string): void => {
    declared.add(pathKey(relative));
  };
  for (const artifact of manifest.artifacts) add(artifact.path);
  for (const input of manifest.inputs) add(input.path);
  for (const source of manifest.sources) {
    if (source.path !== undefined) add(source.path);
  }
  for (const ref of Object.values(manifest.claims)) {
    if (ref !== undefined) add(ref.path);
  }
  const walk = await walkPackageFiles(root, limits, openDirectory);
  // RFC §4.3.3/R-PAP-2 and R-PAP-3: an enumeration failure or a private
  // entry/depth budget stop leaves the absence of undeclared files
  // unestablished. The caller combines this with signature discovery and emits
  // the canonical scan-incomplete diagnostic exactly once; it is never a
  // package I/O failure and never a §4.3.4 limit violation.
  let nestedManifest = false;
  for (const file of walk.files) {
    if (pathKey(file) === pathKey("assurance-package.json")) continue;
    if (file.split("/").at(-1)?.toLowerCase() === "assurance-package.json") {
      nestedManifest = true;
      diag(
        "pap.package.manifest-self-reference",
        "error",
        file,
        "a nested package manifest is prohibited",
      );
      continue;
    }
    if (declared.has(pathKey(file))) continue;
    if (/^signatures\/[A-Za-z0-9._-]+\.dsse\.json$/.test(file)) continue;
    diag(
      "pap.package.undeclared-file",
      "warning",
      file,
      "undeclared file is present and was not read",
    );
  }
  return { incomplete: walk.limitHit || walk.error !== null, nestedManifest };
}

export function failedManifestReport(
  root: PackageRoot,
  evaluatedAt: Instant,
  policy: LoadedPolicy | undefined,
  diagnostics: Diagnostic[],
  _limits: Limits,
  policyPath: string | undefined,
): VerificationReport {
  const report: VerificationReport = {
    reportVersion: REPORT_VERSION,
    verifier: {
      id: VERIFIER_ID,
      version: VERIFIER_VERSION,
      implementationDigest: CHECKER.implementationDigest,
      checkerIdentities: [checkerIdentity()],
    },
    package: { identity: null, papVersion: null, path: root.supplied },
    policy: {
      id: policy?.policy.id ?? null,
      digest: policy?.digest ?? null,
      state: policy?.state ?? "ABSENT",
      ...(policyPath === undefined ? {} : { path: policyPath }),
    },
    evaluatedAt: formatRfc3339(evaluatedAt),
    ...(policy !== undefined && Object.keys(policy.loweredLimits).length > 0
      ? { effectiveLimits: policy.loweredLimits }
      : {}),
    identities: {
      packageIdentity: null,
      artifacts: [],
      sources: [],
      normalizedInputDigest: null,
      extensionClosureDigest: null,
      checkerIdentity: checkerIdentity(),
      verificationRecordIdentity: "",
    },
    dimensions: {
      integrity: { package: "FAIL", artifacts: "NOT_EVALUATED" },
      sources: { integrity: "NOT_EVALUATED", availability: "NOT_APPLICABLE" },
      signature: { validity: "NOT_APPLICABLE" },
      trust: {
        signerIdentity: "NOT_APPLICABLE",
        policyDecision: "NOT_EVALUATED",
        checkerRecognition: "NOT_EVALUATED",
        profileRecognition: "NOT_EVALUATED",
      },
      checks: { results: [] },
      humanReview: { status: "NOT_APPLICABLE" },
      semanticTruth: "NOT_EVALUATED",
      legalEnforceability: "NOT_EVALUATED",
    },
    checks: [],
    coverage: {
      requiredChecks: [],
      checksEvaluated: 0,
      checksPassed: 0,
      checksFailed: 0,
      checksUnsupported: 0,
      checksNotEvaluated: 0,
      requiredDimensions: [],
      dimensionsEvaluated: 0,
      full: false,
    },
    limitations: [],
    verdict: "FAIL",
    diagnostics: [],
  };
  report.limitations = buildLimitations(diagnostics);
  report.diagnostics = sortDiagnostics(diagnostics);
  report.identities.verificationRecordIdentity = verificationRecordIdentity(report);
  return report;
}
