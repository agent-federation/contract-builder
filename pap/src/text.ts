/**
 * Deterministic text renderers for verify, inspect and explain.
 *
 * The required lines and tokens are normative (RFC §9.6); layout beyond them is
 * implementation-defined. Text never prints a host path or a producer claim in
 * verifier formatting.
 */

import type { InspectionDocument } from "./inspect.js";
import type { ExplanationDocument } from "./explain.js";
import type { VerificationReport } from "./types.js";

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function safe(value: string): string {
  return value.replace(CONTROL, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function renderVerifyText(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push(`VERDICT: ${report.verdict}`);
  if (report.verdict !== "PASS") {
    lines.push(`NOT A PASS — ${verdictReason(report)}`);
  }
  lines.push(
    `package: ${report.package.identity ?? "null"} (papVersion ${report.package.papVersion ?? "unknown"})`,
  );
  lines.push(
    `verifier: pap ${report.verifier.version}  policy: ${report.policy.id ?? "none"} state: ${report.policy.state}  evaluatedAt: ${report.evaluatedAt}`,
  );
  if (report.effectiveLimits !== undefined) {
    lines.push(
      `effectiveLimits: ${Object.entries(report.effectiveLimits)
        .map(([name, value]) => `${name}=${value}`)
        .join(", ")}`,
    );
  }
  lines.push("dimensions");
  const dimensions: [string, string][] = [
    ["integrity.package", report.dimensions.integrity.package],
    ["integrity.artifacts", report.dimensions.integrity.artifacts],
    ["sources.integrity", report.dimensions.sources.integrity],
    ["sources.availability", report.dimensions.sources.availability],
    ["signature.validity", report.dimensions.signature.validity],
    ["trust.signerIdentity", report.dimensions.trust.signerIdentity],
    ["trust.policyDecision", report.dimensions.trust.policyDecision],
    ["trust.checkerRecognition", report.dimensions.trust.checkerRecognition],
    ["trust.profileRecognition", report.dimensions.trust.profileRecognition],
    ["humanReview.status", report.dimensions.humanReview.status],
    ["semanticTruth", report.dimensions.semanticTruth],
    ["legalEnforceability", report.dimensions.legalEnforceability],
  ];
  for (const [name, status] of dimensions) {
    lines.push(`  ${name} ${status}`);
  }
  lines.push("checks");
  for (const result of report.dimensions.checks.results) {
    lines.push(`  ${result.checkId} ${result.outcome}`);
  }
  const coverage = report.coverage;
  lines.push(
    `coverage: checksEvaluated ${coverage.checksEvaluated}, checksPassed ${coverage.checksPassed}, checksFailed ${coverage.checksFailed}, checksUnsupported ${coverage.checksUnsupported}, checksNotEvaluated ${coverage.checksNotEvaluated}, dimensionsEvaluated ${coverage.dimensionsEvaluated}, full: ${coverage.full}`,
  );
  lines.push(`requiredChecks: ${coverage.requiredChecks.join(", ") || "none"}`);
  lines.push(`requiredDimensions: ${coverage.requiredDimensions.join(", ") || "none"}`);
  lines.push("limitations");
  if (report.limitations.length === 0) {
    lines.push("  none");
  } else {
    for (const limitation of report.limitations) {
      lines.push(`  ${limitation.code} — ${safe(limitation.detail)}`);
    }
  }
  if (report.producerClaims !== undefined) {
    lines.push("PRODUCER CLAIMS (UNTRUSTED — NOT VERIFICATION RESULTS)");
    for (const comparison of report.producerClaims.comparison ?? []) {
      lines.push(
        `  ${comparison.checkId} claimed ${comparison.claimed ?? "null"} independent ${comparison.independentOutcome ?? "null"} ${comparison.relation}`,
      );
    }
  }
  if (report.dimensions.humanReview.status === "PASS") {
    lines.push(
      "humanReview.basis: unbound-claim — unverified producer claim, not authenticated approval",
    );
  }
  return `${lines.join("\n")}\n`;
}

function verdictReason(report: VerificationReport): string {
  switch (report.verdict) {
    case "FAIL":
      if (report.dimensions.integrity.package === "FAIL") {
        return "a required integrity assertion did not hold";
      }
      if (report.dimensions.integrity.artifacts === "FAIL") {
        return "a declared artifact does not match its declaration";
      }
      if (report.dimensions.sources.integrity === "FAIL") {
        return "a declared source does not match its declaration";
      }
      return "a required check failed";
    case "UNTRUSTED":
      return "the supplied trust policy rejected the signer set";
    case "UNSUPPORTED":
      return "a required check or declared feature is unsupported";
    case "INCOMPLETE":
      return "required checks or dimensions were not fully evaluated";
    default:
      return "the required set could not be evaluated";
  }
}

export function renderInspectionText(document: InspectionDocument): string {
  const lines: string[] = [];
  lines.push(`INSPECTION: ${document.inspection}`);
  lines.push("NOT A VERIFICATION");
  lines.push(
    `package: ${document.package.identity ?? "null"} (papVersion ${document.package.papVersion ?? "unknown"})`,
  );
  lines.push("declared");
  if (document.declared.length === 0) {
    lines.push("  none");
  } else {
    for (const entry of document.declared) {
      const id = entry.id === undefined ? "" : ` ${entry.id}`;
      lines.push(
        `  ${entry.kind}${id} ${safe(entry.path)} declared ${entry.declared ?? "none"} computed ${entry.computed ?? "null"}`,
      );
    }
  }
  lines.push("identities");
  lines.push(`  packageIdentity ${document.identities.packageIdentity ?? "null"}`);
  lines.push(`  normalizedInputDigest ${document.identities.normalizedInputDigest ?? "null"}`);
  lines.push(`  extensionClosureDigest ${document.identities.extensionClosureDigest ?? "null"}`);
  lines.push(`  checkerIdentity ${document.identities.checkerIdentity}`);
  lines.push("limitations");
  if (document.limitations.length === 0) {
    lines.push("  none");
  } else {
    for (const limitation of document.limitations) {
      lines.push(`  ${limitation.code} — ${safe(limitation.detail)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function renderExplanationText(document: ExplanationDocument, requestedCheckId?: string): string {
  const record = document.checkRecord;
  const lines: string[] = [];
  lines.push("NOT A PACKAGE VERDICT");
  lines.push(`CHECK: ${record?.checkId ?? requestedCheckId ?? "unknown"}`);
  lines.push(`OUTCOME: ${record?.outcome ?? "UNSUPPORTED"}`);
  if (record !== null) {
    lines.push("subjectDigests");
    for (const [kind, value] of Object.entries(record.subjectDigests)) {
      if (Array.isArray(value)) {
        lines.push(`  ${kind} ${JSON.stringify(value)}`);
      } else if (typeof value === "string") {
        lines.push(`  ${kind} ${value}`);
      }
    }
    lines.push(`scope: ${JSON.stringify(record.scope)}`);
    lines.push(
      `checker: ${record.checker.id} ${record.checker.version} ${record.checker.implementationDigest}`,
    );
    lines.push("witnesses");
    if (record.witnesses.length === 0) {
      lines.push("  none");
    } else {
      for (const witness of record.witnesses) {
        lines.push(`  ${witness.type} ${safe(JSON.stringify(witness))}`);
      }
    }
    lines.push("diagnostics");
    if (record.diagnostics.length === 0) {
      lines.push("  none");
    } else {
      for (const diagnostic of record.diagnostics) {
        lines.push(`  ${diagnostic.severity} ${diagnostic.code} — ${safe(diagnostic.message)}`);
      }
    }
  }
  lines.push("limitations");
  if (document.limitations.length === 0) {
    lines.push("  none");
  } else {
    for (const limitation of document.limitations) {
      lines.push(`  ${limitation.code} — ${safe(limitation.detail)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
