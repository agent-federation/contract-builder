/**
 * `pap verify` orchestration: load a directory package, compute identities,
 * evaluate the three checks and the optional local trust policy, and assemble
 * the Appendix C report.
 */

import { domainHash } from "./digest.js";
import { jcsBytes } from "./json.js";
import { JsonParseError, parseJsonStrict } from "./json.js";
import { validateManifest } from "./manifest.js";
import type { CheckSpec, Manifest, ManifestDefect } from "./manifest.js";
import {
  hashPackageFile,
  hashPackageRange,
  pathKey,
  readPackageFile,
  resolvePackageRoot,
  validateDeclaredPath,
  walkPackageFiles,
} from "./paths.js";
import type { PackageRoot } from "./paths.js";
import { loadPolicy, PolicyInvalid, DIMENSION_ORDER } from "./policy.js";
import type { LoadedPolicy, TrustPolicy } from "./policy.js";
import { parseClaimFile } from "./claims.js";
import { hashInput, normalizedInputSetDigestStream } from "./input.js";
import type { ClaimIssue, ParsedClaim } from "./claims.js";
import {
  checkSpecImpl,
  isImplementedCheck,
  WITNESS_BUDGET_BYTES,
} from "./checks.js";
import type {
  ArtifactState,
  CheckInput,
  ClaimState,
  InputState,
  SourceState,
} from "./checks.js";
import { evaluateSignatures } from "./signatures.js";
import type { SignatureEvaluation } from "./signatures.js";
import {
  computeCoverage,
  computeRequiredDimensions,
  computeVerdict,
  sortDiagnostics,
  sortLimitations,
  statusForDimension,
  verificationRecordIdentity,
} from "./report.js";
import { formatRfc3339, parseRfc3339, systemClock } from "./time.js";
import type { Instant } from "./time.js";
import { CHECKER, checkerIdentity } from "./version.js";
import {
  DEFAULT_LIMITS,
  REPORT_VERSION,
  SUPPORTED_PAP_VERSIONS,
  VERIFIER_ID,
  VERIFIER_VERSION,
} from "./types.js";
import type {
  CheckOutcome,
  CheckRecord,
  ClaimKind,
  Diagnostic,
  DimensionName,
  Limits,
  Limitation,
  SignatureEntry,
  VerificationReport,
  Verdict,
} from "./types.js";

export class UsageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UsageError";
    this.code = code;
  }
}

export class IoFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string, readonly exitCode: 74 | 70 = 74) {
    super(message);
    this.name = "IoFailure";
    this.code = code;
  }
}

export interface VerifyOptions {
  packagePath: string;
  policyPath?: string;
  now?: Instant;
}

export interface VerifyResult {
  report: VerificationReport;
  exitCode: number;
}

export function exitCodeForVerdict(verdict: Verdict): number {
  switch (verdict) {
    case "PASS":
      return 0;
    case "FAIL":
      return 1;
    case "INCOMPLETE":
    case "NOT_EVALUATED":
      return 2;
    case "UNTRUSTED":
      return 3;
    case "UNSUPPORTED":
      return 4;
  }
}

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
    loadedPolicy === undefined ? DEFAULT_LIMITS : { ...DEFAULT_LIMITS, ...loadedPolicy.effectiveLimits };

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
      diag(loadedPolicy.staleReason, "warning", "policy", "trust policy is outside its validity window");
    }
  } else {
    diag("pap.trust.policy-absent", "info", "policy", "no trust policy supplied");
  }

  const manifestRead = await readPackageFile(root, "assurance-package.json", limits, limits.manifestBytes);
  if (!manifestRead.ok || manifestRead.bytes === undefined) {
    const failure = manifestRead.failure ?? "io";
    const code = failure === "limit" ? "pap.package.limit-exceeded" : "pap.package.io";
    diag(code, "error", "assurance-package.json", manifestRead.message ?? "cannot read the manifest");
    const report = failedManifestReport(root, evaluatedAt, loadedPolicy, diagnostics, limits, options.policyPath);
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
    diag(code, "error", "assurance-package.json", error instanceof Error ? error.message : "manifest is not valid JSON");
    const report = failedManifestReport(root, evaluatedAt, loadedPolicy, diagnostics, limits, options.policyPath);
    return { report, exitCode: 1 };
  }

  const packageIdentity = domainHash("pap.package.v1", jcsBytes(manifestValue));
  const validation = validateManifest(manifestValue, limits);
  const manifest = validation.manifest;
  const structuralFailure =
    manifest === null ||
    validation.defects.some((defect) => defect.structural) ||
    !validation.payloadsUsable;
  const artifactPathFailure = validation.defects.some((defect) => defect.artifactLevel);

  for (const defect of validation.defects) {
    diag(defect.code, "error", defect.scope, defect.message);
  }
  if (validation.compat === "minor-newer") {
    diag("pap.compat.minor-newer", "warning", "papVersion", `unsupported newer minor ${validation.papVersion}`);
  } else if (validation.compat === "version-unsupported") {
    diag(
      "pap.compat.version-unsupported",
      "warning",
      "papVersion",
      `unsupported papVersion ${validation.papVersion}`,
    );
  }
  for (const feature of validation.unsupportedFeatures) {
    diag("pap.feature.unsupported", "warning", "requiredFeatures", `required feature ${feature} is not supported`);
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
    diag("pap.extension.ignored", "info", "extensions", `non-critical extension ${extension} was ignored`);
  }

  const declaredSpecs: CheckSpec[] = manifest?.checkSpecs ?? validation.checkSpecs;
  const policyChecks = loadedPolicy?.policy.requiredChecks ?? [];

  const payloads = await loadPayloads(root, limits, manifest, structuralFailure, artifactPathFailure, diagnostics, diag);
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
  if (structuralFailure || artifactPathFailure || nestedManifestFailure) {
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
    diag("pap.package.limit-exceeded", "error", "package", "a resource limit stopped payload evaluation");
  }

  let integrityArtifacts: VerificationReport["dimensions"]["integrity"]["artifacts"] = "PASS";
  if (manifest === null || structuralFailure) {
    integrityArtifacts = "NOT_EVALUATED";
  } else if (
    artifactPathFailure ||
    payloads.artifacts.some((artifact) => artifact.status === "missing" || artifact.status === "mismatch")
  ) {
    integrityArtifacts = "FAIL";
  } else if (payloads.artifacts.some((artifact) => artifact.status === "unread")) {
    integrityArtifacts = "NOT_EVALUATED";
  }

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
    });
  } else {
    signatureEvaluation = {
      validity: "NOT_APPLICABLE",
      entries: [],
      signerIdentity: "NOT_APPLICABLE",
      policyDecision: "NOT_EVALUATED",
      envelopeLimitHit: false,
      discoveryFailure: false,
      diagnostics: [],
    };
  }
  for (const diagnostic of signatureEvaluation.diagnostics) {
    diag(diagnostic.code, diagnostic.severity, diagnostic.scope, diagnostic.message);
  }
  if (signatureEvaluation.discoveryFailure) {
    integrityPackage = "FAIL";
  }
  if (
    loadedPolicy !== undefined &&
    signatureEvaluation.entries.length === 0 &&
    !signatureEvaluation.envelopeLimitHit
  ) {
    if (loadedPolicy.policy.signature.mode === "optional") {
      diag("pap.signature.absent", "info", "signatures", "no signature envelope is present");
    } else if (loadedPolicy.policy.signature.mode === "required") {
      diag("pap.signature.absent", "warning", "signatures", "a signature is required but no envelope is present");
    }
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
    reviews: payloads.claimMap.reviews,
    diag,
  });

  const dimensions: VerificationReport["dimensions"] = {
    integrity: { package: integrityPackage, artifacts: integrityArtifacts },
    sources: { integrity: sourcesIntegrity, availability: sourcesAvailability },
    signature: {
      validity: signatureEvaluation.validity,
      ...(signatureEvaluation.entries.length === 0 ? {} : { signatures: signatureEvaluation.entries }),
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

  const requiredDimensions = computeRequiredDimensions(requiredChecks, loadedPolicy?.policy.requiredDimensions ?? []);
  const signatureMode = loadedPolicy?.policy.signature.mode ?? "optional";
  const emptyRequiredSet = requiredChecks.length === 0 && requiredDimensions.length === 0;
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
      ...(options.policyPath === undefined ? {} : { path: options.policyPath }),
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

  const limitStopped = payloads.limitHit || signatureEvaluation.envelopeLimitHit;
  report.coverage = computeCoverage(report, requiredChecks, requiredDimensions, limitStopped, scanIncomplete);
  report.verdict = computeVerdict(report, {
    requiredChecks,
    requiredDimensions,
    signatureMode,
    humanReviewRequired: loadedPolicy?.policy.humanReview.required === true,
    policyState: report.policy.state,
    limitStopped,
    unsupportedVersion: validation.compat !== null,
    unsupportedFeature:
      validation.unsupportedFeatures.length > 0 || validation.unsupportedCriticalExtensions.length > 0,
    emptyRequiredSet,
  });

  report.limitations = buildLimitations(diagnostics);
  report.diagnostics = sortDiagnostics(diagnostics);
  report.identities.verificationRecordIdentity = verificationRecordIdentity(report);

  return { report, exitCode: exitCodeForVerdict(report.verdict) };
}

export interface Payloads {
  artifacts: ArtifactState[];
  sources: SourceState[];
  inputs: InputState[];
  claims: ClaimState[];
  claimMap: Partial<Record<ClaimKind, ClaimState>>;
  normalizedInputDigest: string | null;
  sourceSpans: Map<string, string>;
  sourceSpanBudgetHit: boolean;
  limitHit: boolean;
  limitedClasses: Set<"artifacts" | "sources" | "inputs">;
}

export async function loadPayloads(
  root: PackageRoot,
  limits: Limits,
  manifest: Manifest | null,
  structuralFailure: boolean,
  _artifactPathFailure: boolean,
  diagnostics: Diagnostic[],
  diag: (code: string, severity: Diagnostic["severity"], scope: string, message: string) => void,
): Promise<Payloads> {
  const result: Payloads = {
    artifacts: [],
    sources: [],
    inputs: [],
    claims: [],
    claimMap: {},
    normalizedInputDigest: null,
    sourceSpans: new Map(),
    sourceSpanBudgetHit: false,
    limitHit: false,
    limitedClasses: new Set(),
  };
  if (manifest === null || structuralFailure) {
    return result;
  }

  let stopped = false;
  let totalBytes = 0;
  const hashPayload = async (
    relative: string,
    kind: "artifacts" | "sources" | "inputs",
    domain: string,
  ): Promise<
    | { ok: true; digest: string; size: number }
    | { ok: false; failure: "limit" | "missing" | "symlink" | "non-regular" | "path-escape" | "io"; message: string }
  > => {
    if (stopped) {
      result.limitedClasses.add(kind);
      return { ok: false, failure: "limit", message: "payload evaluation stopped by an earlier limit" };
    }
    const remaining = Math.max(0, limits.totalPayloadBytes - totalBytes);
    const cap = Math.min(limits.fileBytes, remaining);
    if (cap <= 0) {
      stopped = true;
      result.limitHit = true;
      result.limitedClasses.add(kind);
      return { ok: false, failure: "limit", message: "total payload byte limit exceeded" };
    }
    const outcome = await hashPackageFile(root, relative, domain, limits, cap);
    if (outcome.ok && outcome.digest !== undefined && outcome.size !== undefined) {
      totalBytes += outcome.size;
      if (totalBytes > limits.totalPayloadBytes) {
        stopped = true;
        result.limitHit = true;
        result.limitedClasses.add(kind);
        return { ok: false, failure: "limit", message: "total payload byte limit exceeded" };
      }
      return { ok: true, digest: outcome.digest, size: outcome.size };
    }
    if (outcome.failure === "limit") {
      stopped = true;
      result.limitHit = true;
      result.limitedClasses.add(kind);
    }
    return {
      ok: false,
      failure: outcome.failure ?? "io",
      message: outcome.message ?? "payload is not readable",
    };
  };
  const hashInputPayload = async (
    input: Manifest["inputs"][number],
  ): Promise<
    | { ok: true; digest: string; normalizedSize: number; mode: "lf" | "raw" }
    | { ok: false; failure: "limit" | "missing" | "symlink" | "non-regular" | "path-escape" | "io"; message: string }
  > => {
    if (stopped) {
      result.limitedClasses.add("inputs");
      return { ok: false, failure: "limit", message: "payload evaluation stopped by an earlier limit" };
    }
    const remaining = Math.max(0, limits.totalPayloadBytes - totalBytes);
    const cap = Math.min(limits.fileBytes, remaining);
    if (cap <= 0) {
      stopped = true;
      result.limitHit = true;
      result.limitedClasses.add("inputs");
      return { ok: false, failure: "limit", message: "total payload byte limit exceeded" };
    }
    const outcome = await hashInput(root, input.path, input.normalization, limits, cap);
    if (outcome.ok) {
      totalBytes += outcome.rawSize;
      if (totalBytes > limits.totalPayloadBytes) {
        stopped = true;
        result.limitHit = true;
        result.limitedClasses.add("inputs");
        return { ok: false, failure: "limit", message: "total payload byte limit exceeded" };
      }
      return { ok: true, digest: outcome.digest, normalizedSize: outcome.normalizedSize, mode: outcome.mode };
    }
    if (outcome.failure === "limit") {
      stopped = true;
      result.limitHit = true;
      result.limitedClasses.add("inputs");
    }
    return {
      ok: false,
      failure: outcome.failure ?? "io",
      message: outcome.message ?? "payload is not readable",
    };
  };
  // Claim files are JSON documents bounded by the JSON limits, not by the
  // artifact/source/input byte budget. They remain readable when a payload
  // limit stopped the mechanical-check scope.
  const readClaim = (relative: string) =>
    readPackageFile(root, relative, limits, limits.jsonStringBytes);

  const failState = (
    failure: "limit" | "missing" | "symlink" | "non-regular" | "path-escape" | "io",
    scope: string,
    message: string,
  ): void => {
    const code =
      failure === "missing"
        ? "pap.package.declared-file-missing"
        : failure === "symlink"
          ? "pap.package.symlink"
          : failure === "non-regular"
            ? "pap.package.non-regular"
            : failure === "path-escape"
              ? "pap.package.path-escape"
              : failure === "limit"
                ? "pap.package.limit-exceeded"
                : "pap.package.io";
    diag(code, "error", scope, message);
  };

  const usablePath = (declared: string, root: string): boolean => {
    const validation = validateDeclaredPath(declared, limits);
    return validation.ok && declared.startsWith(root);
  };

  const classCountExceeded = (count: number): boolean => {
    if (count <= limits.payloadFiles) return false;
    result.limitHit = true;
    diag("pap.package.limit-exceeded", "error", "package", "declared payload class exceeds the count limit");
    return true;
  };
  const artifactsBlocked = classCountExceeded(manifest.artifacts.length);
  if (artifactsBlocked) result.limitedClasses.add("artifacts");
  const sourcesBlocked = classCountExceeded(manifest.sources.filter((source) => source.path !== undefined).length);
  if (sourcesBlocked) result.limitedClasses.add("sources");
  const inputsBlocked = classCountExceeded(manifest.inputs.length);
  if (inputsBlocked) result.limitedClasses.add("inputs");

  const duplicateArtifactPaths = duplicateDeclaredPaths(manifest);
  for (const artifact of manifest.artifacts) {
    if (artifactsBlocked) {
      result.artifacts.push({ artifact, computed: null, byteCount: null, status: "unread", message: "payload count limit exceeded" });
      continue;
    }
    if (duplicateArtifactPaths.has(pathKey(artifact.path))) {
      result.artifacts.push({ artifact, computed: null, byteCount: null, status: "missing", message: `artifact path is duplicated: ${artifact.path}` });
      continue;
    }
    if (!usablePath(artifact.path, "artifacts/")) {
      result.artifacts.push({ artifact, computed: null, byteCount: null, status: "missing", message: `artifact path is invalid: ${artifact.path}` });
      continue;
    }
    const outcome = await hashPayload(artifact.path, "artifacts", "pap.artifact.v1");
    if (!outcome.ok) {
      failState(outcome.failure, artifact.id, outcome.message);
      result.artifacts.push({
        artifact,
        computed: null,
        byteCount: null,
        status: outcome.failure === "limit" ? "unread" : "missing",
        message: outcome.message,
      });
      continue;
    }
    if (outcome.digest !== artifact.digest || outcome.size !== artifact.bytes) {
      const message = `artifact ${artifact.id} declares ${artifact.digest}/${artifact.bytes} bytes but computed ${outcome.digest}/${outcome.size}`;
      diag("pap.integrity.artifact-mismatch", "error", artifact.id, message);
      result.artifacts.push({ artifact, computed: outcome.digest, byteCount: outcome.size, status: "mismatch", message });
    } else {
      result.artifacts.push({ artifact, computed: outcome.digest, byteCount: outcome.size, status: "ok" });
    }
  }

  for (const source of manifest.sources) {
    if (sourcesBlocked && source.path !== undefined) {
      result.sources.push({ source, computed: null, size: null, status: "unread", message: "payload count limit exceeded" });
      continue;
    }
    if (source.path === undefined) {
      result.sources.push({ source, computed: null, size: null, status: "referenced" });
      continue;
    }
    if (!usablePath(source.path, "sources/")) {
      result.sources.push({ source, computed: null, size: null, status: "missing", message: `source path is invalid: ${source.path}` });
      continue;
    }
    const outcome = await hashPayload(source.path, "sources", "pap.source.raw.v1");
    if (!outcome.ok) {
      failState(outcome.failure, source.id, outcome.message);
      result.sources.push({
        source,
        computed: null,
        size: null,
        status: outcome.failure === "limit" ? "unread" : "missing",
        message: outcome.message,
      });
      continue;
    }
    if (outcome.digest !== source.digest) {
      const message = `source ${source.id} does not match its declared raw digest`;
      diag("pap.integrity.source-mismatch", "error", source.id, message);
      result.sources.push({ source, computed: outcome.digest, size: outcome.size, status: "mismatch", message });
    } else {
      result.sources.push({ source, computed: outcome.digest, size: outcome.size, status: "ok" });
    }
  }

  const inputEntries: { path: string; mode: "lf" | "raw"; normalizedSize: number }[] = [];
  let inputSetComplete = true;
  for (const input of manifest.inputs) {
    if (inputsBlocked) {
      result.inputs.push({ input, computed: null, normalizedSize: null, mode: null, status: "unread", message: "payload count limit exceeded" });
      inputSetComplete = false;
      continue;
    }
    if (!usablePath(input.path, "inputs/")) {
      result.inputs.push({ input, computed: null, normalizedSize: null, mode: null, status: "missing", message: `input path is invalid: ${input.path}` });
      inputSetComplete = false;
      continue;
    }
    const outcome = await hashInputPayload(input);
    if (!outcome.ok) {
      failState(outcome.failure, input.id, outcome.message);
      result.inputs.push({
        input,
        computed: null,
        normalizedSize: null,
        mode: null,
        status: outcome.failure === "limit" ? "unread" : "missing",
        message: outcome.message,
      });
      inputSetComplete = false;
      continue;
    }
    if (outcome.digest !== input.digest) {
      const message = `input ${input.id} does not match its declared digest`;
      diag("pap.integrity.input-mismatch", "error", input.id, message);
      result.inputs.push({ input, computed: outcome.digest, normalizedSize: outcome.normalizedSize, mode: outcome.mode, status: "mismatch", message });
    } else {
      result.inputs.push({ input, computed: outcome.digest, normalizedSize: outcome.normalizedSize, mode: outcome.mode, status: "ok" });
    }
    inputEntries.push({ path: input.path, mode: outcome.mode, normalizedSize: outcome.normalizedSize });
  }
  if (manifest.inputs.length > 0 && inputSetComplete) {
    const setDigest = await normalizedInputSetDigestStream(root, inputEntries, limits);
    if (setDigest === null) {
      result.limitHit = true;
      diag("pap.package.limit-exceeded", "error", "inputs", "normalized input set could not be read within limits");
    } else {
      result.normalizedInputDigest = setDigest;
    }
  }

  const declaredSourceIds = new Set(manifest.sources.map((source) => source.id));
  for (const kind of ["provenance", "relations", "producerReport", "reviews"] as const) {
    const ref = manifest.claims[kind];
    if (ref === undefined) continue;
    if (!usablePath(ref.path, "claims/")) {
      const state: ClaimState = {
        kind,
        declaredDigest: ref.digest,
        computedDigest: null,
        status: "missing",
        message: `claim path is invalid: ${ref.path}`,
      };
      result.claims.push(state);
      result.claimMap[kind] = state;
      continue;
    }
    const outcome = await readClaim(ref.path);
    if (!outcome.ok || outcome.bytes === undefined) {
      const failure = outcome.failure ?? "io";
      failState(failure, kind, outcome.message ?? "claim is not readable");
      const state: ClaimState = {
        kind,
        declaredDigest: ref.digest,
        computedDigest: null,
        status: failure === "limit" ? "unread" : "missing",
        message: outcome.message,
      };
      result.claims.push(state);
      result.claimMap[kind] = state;
      continue;
    }
    const claimBytes = outcome.bytes;
    const computed = domainHash("pap.claims.v1", claimBytes);
    const state: ClaimState = {
      kind,
      declaredDigest: ref.digest,
      computedDigest: computed,
      bytes: claimBytes,
      status: computed === ref.digest ? "ok" : "mismatch",
    };
    if (computed !== ref.digest) {
      diag("pap.integrity.claim-mismatch", "error", kind, `claim ${kind} does not match its declared digest`);
      state.message = "claim digest mismatch";
      result.claims.push(state);
      result.claimMap[kind] = state;
      continue;
    }
    const parsed = parseClaimFile(kind, claimBytes, limits, declaredSourceIds);
    if (!parsed.ok) {
      if (parsed.failure === "limit") {
        result.limitHit = true;
        state.status = "unread";
        state.message = parsed.message;
        diag("pap.package.limit-exceeded", "error", kind, parsed.message);
      } else if (parsed.failure === "unsupported-version") {
        state.unsupportedVersion = true;
        state.message = parsed.message;
        diag("pap.claim.unsupported-version", "warning", kind, parsed.message);
      } else {
        state.invalid = true;
        state.message = parsed.message;
        diag("pap.package.claim-invalid", "error", kind, parsed.message);
        if (kind === "producerReport" && parsed.message.includes("mimics a verifier check record")) {
          diag("pap.claims.spoofed-result", "error", kind, "producer report contains verifier-only fields");
        }
      }
    } else {
      state.parsed = parsed.claim;
      state.issues = parsed.issues;
    }
    result.claims.push(state);
    result.claimMap[kind] = state;
  }

  // Compute only the quoted source ranges; source bytes are not retained.
  const provenance = result.claimMap.provenance?.parsed;
  if (provenance !== undefined && provenance.kind === "provenance") {
    const sourceById = new Map(result.sources.map((entry) => [entry.source.id, entry]));
    const seenRanges = new Set<string>();
    for (const binding of provenance.bindings) {
      const source = sourceById.get(binding.sourceId);
      if (
        source === undefined ||
        source.source.path === undefined ||
        source.size === null ||
        source.computed === null
      ) {
        continue;
      }
      const { start, end } = binding.locator;
      if (start > end || end > source.size) continue;
      const key = `${binding.sourceId}\u0000${start}\u0000${end}`;
      if (seenRanges.has(key)) continue;
      seenRanges.add(key);
      const length = end - start;
      if (totalBytes + length > limits.totalPayloadBytes) {
        result.limitHit = true;
        result.sourceSpanBudgetHit = true;
        diag(
          "pap.package.limit-exceeded",
          "error",
          binding.id,
          "source-span reads exceed the total payload byte budget",
        );
        break;
      }
      const span = await hashPackageRange(
        root,
        source.source.path,
        start,
        end,
        "pap.quote.v1",
        limits,
      );
      if (span.ok && span.digest !== undefined) {
        totalBytes += length;
        result.sourceSpans.set(key, span.digest);
      } else if (span.failure === "limit") {
        result.limitHit = true;
        result.sourceSpanBudgetHit = true;
        diag("pap.package.limit-exceeded", "error", binding.id, span.message ?? "quote range exceeds a limit");
      } else if (span.message !== undefined) {
        diag("pap.package.io", "error", binding.id, span.message);
      }
    }
  }

  return result;
}

interface CheckEvaluation {
  results: { checkId: string; outcome: CheckOutcome; required?: boolean }[];
  records: CheckRecord[];
}

function requiredCheckIds(
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

function evaluateChecks(options: {
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
  diag: (code: string, severity: Diagnostic["severity"], scope: string, message: string) => void;
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
    options.requiredChecks.some((checkId) =>
      checkTouchesLimited(checkId, options.limitedClasses),
    );

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
      options.diag("pap.check.unsupported", "warning", entry.id, "check specification is not implemented");
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
      options.diag("pap.check.not-evaluated", "warning", entry.id, "a required check was not evaluated");
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

function evaluateTrust(options: {
  policy: TrustPolicy | undefined;
  state: "FRESH" | "STALE" | "ABSENT";
  signature: SignatureEvaluation;
  manifest: Manifest | null;
  checker: { id: string; version: string; implementationDigest: string };
  diag: (code: string, severity: Diagnostic["severity"], scope: string, message: string) => void;
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
      options.diag("pap.trust.checker-unknown", "warning", "checker", "checker identity is not pinned by the policy");
    } else if (sameIdVersion.some((pin) => pin.implementationDigest === options.checker.implementationDigest)) {
      checkerRecognition = "PASS";
    } else {
      checkerRecognition = "UNTRUSTED";
      options.diag("pap.trust.checker-untrusted", "warning", "checker", "checker implementation digest does not match the policy pin");
    }
  }

  let profileRecognition: VerificationReport["dimensions"]["trust"]["profileRecognition"];
  const profile = options.manifest?.profile;
  if (profile === undefined || policy.profiles.length === 0) {
    profileRecognition = "NOT_APPLICABLE";
  } else {
    const pin = policy.profiles.find((candidate) => candidate.id === profile.id && candidate.version === profile.version);
    if (pin === undefined) {
      profileRecognition = "UNSUPPORTED";
      options.diag("pap.trust.profile-unknown", "warning", "profile", "profile identity is not pinned by the policy");
    } else if (pin.closureDigest !== undefined) {
      if (profile.closureDigest === undefined) {
        profileRecognition = "UNSUPPORTED";
        options.diag("pap.trust.profile-unknown", "warning", "profile", "policy pins a closure digest the package does not declare");
      } else if (pin.closureDigest !== profile.closureDigest) {
        profileRecognition = "UNTRUSTED";
        options.diag("pap.trust.profile-untrusted", "warning", "profile", "profile closure digest does not match the policy pin");
      } else {
        profileRecognition = "PASS";
      }
    } else {
      profileRecognition = "PASS";
    }
  }

  const signerIdentity =
    options.signature.envelopeLimitHit
      ? "NOT_EVALUATED"
      : options.signature.entries.length === 0
        ? "NOT_APPLICABLE"
        : options.signature.signerIdentity;
  const policyDecision =
    options.state === "STALE" ? "STALE" : options.signature.policyDecision;
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
  diag: (code: string, severity: Diagnostic["severity"], scope: string, message: string) => void;
}): VerificationReport["dimensions"]["humanReview"] {
  if (options.policy === undefined || !options.policy.humanReview.required) {
    return { status: "NOT_APPLICABLE" };
  }
  const claim = options.reviews;
  if (claim === undefined || claim.status !== "ok" || claim.parsed === undefined) {
    options.diag("pap.review.missing", "warning", "reviews", "required human-review evidence is absent or unusable");
    return { status: "INCOMPLETE" };
  }
  const reviews = claim.parsed;
  if (reviews.kind !== "reviews") {
    options.diag("pap.review.missing", "warning", "reviews", "required human-review evidence is unusable");
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
    options.diag("pap.review.unbound", "info", "reviews", "approval is an unverified producer claim, not authenticated approval");
    return { status: "PASS", basis: "unbound-claim" };
  }
  if (anyRejected) {
    options.diag("pap.trust.review-required", "warning", "reviews", "an in-scope review decision is rejected");
    return { status: "INCOMPLETE" };
  }
  if (!anyInScope || anyBindingInvalid) {
    options.diag("pap.review.binding-invalid", "warning", "reviews", "review evidence does not bind this package");
    return { status: "INCOMPLETE" };
  }
  if (anyStale) {
    options.diag("pap.review.stale", "warning", "reviews", "review evidence is stale or has an unusable timestamp");
    return { status: "INCOMPLETE" };
  }
  if (anyUnrecognized) {
    options.diag("pap.review.unknown-reviewer", "warning", "reviews", "reviewer identity is not recognized by the policy");
    return { status: "UNKNOWN" };
  }
  options.diag("pap.review.missing", "warning", "reviews", "no usable approval evidence");
  return { status: "INCOMPLETE" };
}

function parseTime(value: string): Instant | null {
  return parseRfc3339(value);
}

function evaluateProducerClaims(
  claim: ClaimState | undefined,
  results: { checkId: string; outcome: CheckOutcome }[],
  diag: (code: string, severity: Diagnostic["severity"], scope: string, message: string) => void,
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

async function reportUndeclaredFiles(
  root: PackageRoot,
  manifest: Manifest,
  limits: Limits,
  diag: (code: string, severity: Diagnostic["severity"], scope: string, message: string) => void,
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
  const walk = await walkPackageFiles(root, limits);
  // RFC §4.3.3/R-PAP-2 and R-PAP-3: an enumeration failure or a private
  // entry/depth budget stop leaves the absence of undeclared files
  // unestablished. It is a scan-incomplete warning, never a package I/O
  // failure and never a §4.3.4 limit violation.
  if (walk.limitHit) {
    diag(
      "pap.package.undeclared-scan-incomplete",
      "warning",
      "package",
      "the undeclared-file scan stopped at the verifier entry or depth budget",
    );
  }
  if (walk.error !== null) {
    diag(
      "pap.package.undeclared-scan-incomplete",
      "warning",
      "package",
      `${walk.error}; the absence of undeclared files was not established`,
    );
  }
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
    diag("pap.package.undeclared-file", "warning", file, "undeclared file is present and was not read");
  }
  return { incomplete: walk.limitHit || walk.error !== null, nestedManifest };
}

function duplicateDeclaredPaths(manifest: Manifest): Set<string> {
  const seen = new Map<string, number>();
  const declared = [
    ...manifest.artifacts.map((entry) => entry.path),
    ...manifest.inputs.map((entry) => entry.path),
    ...manifest.sources.flatMap((entry) => (entry.path === undefined ? [] : [entry.path])),
    ...Object.values(manifest.claims).flatMap((entry) => (entry === undefined ? [] : [entry.path])),
  ];
  for (const path of declared) {
    const key = pathKey(path);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of seen) {
    if (count > 1) duplicates.add(key);
  }
  return duplicates;
}

function failedManifestReport(
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

export { statusForDimension, DIMENSION_ORDER };
export type { CheckRecord, Limits, Limitation, SignatureEntry, VerificationReport };
