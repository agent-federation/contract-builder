/**
 * `pap inspect` — describe declared and readable payloads without producing a
 * verification result (RFC §9.4).
 */

import { domainHash } from "./digest.js";
import { jcsBytes } from "./json.js";
import { JsonParseError, parseJsonStrict } from "./json.js";
import { decodeManifest } from "./decode.js";
import type { Manifest } from "./manifest.js";
import { readPackageFile, resolvePackageRoot, walkPackageFiles } from "./paths.js";
import { SCAN_INCOMPLETE_CODE, SCAN_INCOMPLETE_MESSAGE } from "./report.js";
import { loadPayloads } from "./verify.js";
import type { Payloads } from "./verify.js";
import { IoFailure, UsageError } from "./verify.js";
import { CHECKER, checkerIdentity } from "./version.js";
import { DEFAULT_LIMITS, REPORT_VERSION, VERIFIER_ID, VERIFIER_VERSION } from "./types.js";
import type { Diagnostic, Limitation } from "./types.js";

export interface InspectionDocument {
  inspectionVersion: "0.1";
  verifier: {
    id: string;
    version: string;
    implementationDigest: string;
    checkerIdentities: string[];
  };
  package: { identity: string | null; papVersion: string | null; path: string };
  declared: {
    kind: "artifact" | "input" | "source" | "claim" | "signature";
    id?: string;
    path: string;
    declared: string | null;
    computed: string | null;
    bytes?: number;
  }[];
  identities: {
    packageIdentity: string | null;
    artifacts: { id: string; declared: string; computed: string | null }[];
    sources: { id: string; declared: string; computed: string | null }[];
    normalizedInputDigest: string | null;
    extensionClosureDigest: string | null;
    checkerIdentity: string;
  };
  inspection: "COMPLETE" | "PARTIAL" | "INVALID" | "UNSUPPORTED";
  limitations: Limitation[];
}

export interface InspectResult {
  document: InspectionDocument;
  exitCode: number;
}

export async function inspectPackage(packagePath: string): Promise<InspectResult> {
  const rootResult = await resolvePackageRoot(packagePath);
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
  const limits = DEFAULT_LIMITS;
  const diagnostics: Diagnostic[] = [];
  const diag = (
    code: string,
    severity: Diagnostic["severity"],
    scope: string,
    message: string,
  ): void => {
    diagnostics.push({ code, severity, scope, message });
  };

  const document = (
    overrides: Partial<InspectionDocument> & {
      inspection: InspectionDocument["inspection"];
    },
  ): InspectionDocument => ({
    inspectionVersion: "0.1",
    verifier: {
      id: VERIFIER_ID,
      version: VERIFIER_VERSION,
      implementationDigest: CHECKER.implementationDigest,
      checkerIdentities: [checkerIdentity()],
    },
    package: { identity: null, papVersion: null, path: root.supplied },
    declared: [],
    identities: {
      packageIdentity: null,
      artifacts: [],
      sources: [],
      normalizedInputDigest: null,
      extensionClosureDigest: null,
      checkerIdentity: checkerIdentity(),
    },
    limitations: buildLimitations(diagnostics),
    ...overrides,
    inspection: overrides.inspection,
  });

  const manifestRead = await readPackageFile(
    root,
    "assurance-package.json",
    limits,
    limits.manifestBytes,
  );
  if (!manifestRead.ok || manifestRead.bytes === undefined) {
    diag(
      manifestRead.failure === "limit" ? "pap.package.limit-exceeded" : "pap.package.io",
      "error",
      "assurance-package.json",
      manifestRead.message ?? "cannot read the manifest",
    );
    return { document: document({ inspection: "INVALID" }), exitCode: 1 };
  }
  let manifestValue;
  try {
    manifestValue = parseJsonStrict(manifestRead.bytes, {
      nesting: limits.jsonNesting,
      stringBytes: limits.jsonStringBytes,
    });
  } catch (error) {
    diag(
      error instanceof JsonParseError && error.failure === "limit"
        ? "pap.package.limit-exceeded"
        : error instanceof JsonParseError && error.failure === "duplicate-key"
          ? "pap.package.duplicate-key"
          : "pap.package.manifest-json",
      "error",
      "assurance-package.json",
      error instanceof Error ? error.message : "manifest is not valid JSON",
    );
    return { document: document({ inspection: "INVALID" }), exitCode: 1 };
  }
  const packageIdentity = domainHash("pap.package.v1", jcsBytes(manifestValue));
  const validation = decodeManifest(manifestValue, limits);
  for (const defect of validation.defects) {
    diag(defect.code, "error", defect.scope, defect.message);
  }
  if (validation.compat === "minor-newer") {
    diag("pap.compat.minor-newer", "warning", "papVersion", "unsupported newer minor");
  } else if (validation.compat === "version-unsupported") {
    diag("pap.compat.version-unsupported", "warning", "papVersion", "unsupported papVersion");
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

  const manifest = validation.manifest;
  const structural = manifest === null || validation.defects.some((defect) => defect.structural);
  const pathInvalid = validation.defects.some(
    (defect) =>
      defect.code === "pap.package.path-invalid" ||
      defect.code === "pap.package.path-duplicate" ||
      defect.code === "pap.package.manifest-self-reference",
  );
  if (manifest === null || structural || pathInvalid) {
    return {
      document: document({
        inspection: "INVALID",
        package: {
          identity: packageIdentity,
          papVersion: validation.papVersion,
          path: root.supplied,
        },
        ...(manifest === null ? {} : { declared: declaredFromManifest(manifest) }),
      }),
      exitCode: 1,
    };
  }
  if (
    validation.compat !== null ||
    validation.unsupportedFeatures.length > 0 ||
    validation.unsupportedCriticalExtensions.length > 0
  ) {
    return {
      document: document({
        inspection: "UNSUPPORTED",
        package: {
          identity: packageIdentity,
          papVersion: validation.papVersion,
          path: root.supplied,
        },
        declared: declaredFromManifest(manifest),
        identities: {
          packageIdentity,
          artifacts: manifest.artifacts.map((artifact) => ({
            id: artifact.id,
            declared: artifact.digest,
            computed: null,
          })),
          sources: manifest.sources.map((source) => ({
            id: source.id,
            declared: source.digest,
            computed: null,
          })),
          normalizedInputDigest: null,
          extensionClosureDigest: manifest.profile?.closureDigest ?? null,
          checkerIdentity: checkerIdentity(),
        },
      }),
      exitCode: 4,
    };
  }

  const payloads = await loadPayloads(root, limits, manifest, false, diagnostics, diag);
  const scan = await reportUndeclared(root, manifest, limits, diag);
  const declared: InspectionDocument["declared"] = [];
  for (const state of payloads.artifacts) {
    declared.push({
      kind: "artifact",
      id: state.artifact.id,
      path: state.artifact.path,
      declared: state.artifact.digest,
      computed: state.computed,
      ...(state.byteCount === null ? {} : { bytes: state.byteCount }),
    });
  }
  for (const state of payloads.inputs) {
    declared.push({
      kind: "input",
      id: state.input.id,
      path: state.input.path,
      declared: state.input.digest,
      computed: state.computed,
    });
  }
  for (const state of payloads.sources) {
    declared.push({
      kind: "source",
      id: state.source.id,
      path: state.source.path ?? "",
      declared: state.source.digest,
      computed: state.computed,
    });
  }
  for (const state of payloads.claims) {
    declared.push({
      kind: "claim",
      id: state.kind,
      path: manifest.claims[state.kind]?.path ?? state.kind,
      declared: state.declaredDigest,
      computed: state.computedDigest,
    });
  }
  for (const file of scan.files) {
    if (/^signatures\/[A-Za-z0-9._-]+\.dsse\.json$/.test(file)) {
      declared.push({ kind: "signature", path: file, declared: null, computed: null });
    }
  }
  declared.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });

  const unreadable =
    payloads.limitHit ||
    scan.limitHit ||
    scan.error !== null ||
    payloads.artifacts.some((state) => state.status === "unread" || state.status === "missing") ||
    payloads.sources.some((state) => state.status === "unread" || state.status === "missing") ||
    payloads.inputs.some((state) => state.status === "unread" || state.status === "missing") ||
    payloads.claims.some((state) => state.status === "unread" || state.status === "missing");
  const inspection = scan.nestedManifest ? "INVALID" : unreadable ? "PARTIAL" : "COMPLETE";
  return {
    document: document({
      inspection,
      package: {
        identity: packageIdentity,
        papVersion: validation.papVersion,
        path: root.supplied,
      },
      declared,
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
        extensionClosureDigest: manifest.profile?.closureDigest ?? null,
        checkerIdentity: checkerIdentity(),
      },
    }),
    exitCode: inspection === "COMPLETE" ? 0 : inspection === "INVALID" ? 1 : 2,
  };
}

function declaredFromManifest(manifest: Manifest): InspectionDocument["declared"] {
  const declared: InspectionDocument["declared"] = [];
  for (const artifact of manifest.artifacts) {
    declared.push({
      kind: "artifact",
      id: artifact.id,
      path: artifact.path,
      declared: artifact.digest,
      computed: null,
    });
  }
  for (const input of manifest.inputs) {
    declared.push({
      kind: "input",
      id: input.id,
      path: input.path,
      declared: input.digest,
      computed: null,
    });
  }
  for (const source of manifest.sources) {
    declared.push({
      kind: "source",
      id: source.id,
      path: source.path ?? "",
      declared: source.digest,
      computed: null,
    });
  }
  for (const [kind, ref] of Object.entries(manifest.claims)) {
    if (ref !== undefined) {
      declared.push({
        kind: "claim",
        id: kind,
        path: ref.path,
        declared: ref.digest,
        computed: null,
      });
    }
  }
  declared.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  return declared;
}

interface InspectScan {
  files: string[];
  limitHit: boolean;
  error: string | null;
  nestedManifest: boolean;
}

async function reportUndeclared(
  root: Parameters<typeof walkPackageFiles>[0],
  manifest: Manifest,
  limits: Parameters<typeof walkPackageFiles>[1],
  diag: (code: string, severity: Diagnostic["severity"], scope: string, message: string) => void,
): Promise<InspectScan> {
  const declared = new Set<string>();
  for (const artifact of manifest.artifacts) declared.add(artifact.path.toLowerCase());
  for (const input of manifest.inputs) declared.add(input.path.toLowerCase());
  for (const source of manifest.sources) {
    if (source.path !== undefined) declared.add(source.path.toLowerCase());
  }
  for (const ref of Object.values(manifest.claims)) {
    if (ref !== undefined) declared.add(ref.path.toLowerCase());
  }
  const walk = await walkPackageFiles(root, limits);
  // R-PAP-2/R-PAP-3: inspect reports the same code and message as the
  // verifier, as a warning plus a limitation (not a verification report).
  if (walk.limitHit || walk.error !== null) {
    diag(SCAN_INCOMPLETE_CODE, "warning", "package", SCAN_INCOMPLETE_MESSAGE);
  }
  let nestedManifest = false;
  for (const file of walk.files) {
    if (file.toLowerCase() === "assurance-package.json") continue;
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
    if (declared.has(file.toLowerCase())) continue;
    if (/^signatures\/[A-Za-z0-9._-]+\.dsse\.json$/.test(file)) continue;
    diag(
      "pap.package.undeclared-file",
      "warning",
      file,
      "undeclared file is present and was not read",
    );
  }
  return { files: walk.files, limitHit: walk.limitHit, error: walk.error, nestedManifest };
}

function buildLimitations(diagnostics: Diagnostic[]): Limitation[] {
  const infoKept = new Set([
    "pap.trust.policy-absent",
    "pap.extension.ignored",
    "pap.review.unbound",
    "pap.limit.lowered",
    "pap.signature.absent",
  ]);
  const out: Limitation[] = [];
  const seen = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "info" || infoKept.has(diagnostic.code)) {
      const key = `${diagnostic.code}\u0000${diagnostic.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ code: diagnostic.code, detail: diagnostic.message });
    }
  }
  out.sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0;
  });
  return out;
}

export { REPORT_VERSION };
