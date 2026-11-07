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

// Cc (C0, DEL and C1) and Cf (format characters, including bidi marks) are
// escaped so package-controlled text cannot start a line or move the cursor.
const CONTROL = /[\p{Cc}\p{Cf}]/gu;
const SHORT = new Map<string, string>([
  ["\t", "\\t"],
  ["\n", "\\n"],
  ["\r", "\\r"],
]);

// BMP controls keep the fixed-width `\uXXXX` form. A code point above the BMP
// needs more than four hex digits, so it is emitted in the self-delimiting
// `\u{...}` form instead of a variable-width `\ue0001` that cannot be parsed
// back without knowing the original value.
function safe(value: string): string {
  return value.replace(CONTROL, (char) => {
    const short = SHORT.get(char);
    if (short !== undefined) return short;
    const codePoint = char.codePointAt(0) as number;
    return codePoint <= 0xffff
      ? `\\u${codePoint.toString(16).padStart(4, "0")}`
      : `\\u{${codePoint.toString(16)}}`;
  });
}

export function renderVerifyText(report: VerificationReport): string {
  const lines: string[] = [];
  lines.push(`VERDICT: ${report.verdict}`);
  if (report.verdict !== "PASS") {
    lines.push(`NOT A PASS — ${verdictReason(report)}`);
  }
  lines.push(
    `package: ${safe(report.package.identity ?? "null")} (papVersion ${safe(report.package.papVersion ?? "unknown")})`,
  );
  lines.push(
    `verifier: pap ${report.verifier.version}  policy: ${safe(report.policy.id ?? "none")} digest: ${safe(report.policy.digest ?? "none")} state: ${report.policy.state}  evaluatedAt: ${report.evaluatedAt}`,
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
    lines.push(`  ${safe(result.checkId)} ${result.outcome}`);
  }
  const coverage = report.coverage;
  lines.push(
    `coverage: checksEvaluated ${coverage.checksEvaluated}, checksPassed ${coverage.checksPassed}, checksFailed ${coverage.checksFailed}, checksUnsupported ${coverage.checksUnsupported}, checksNotEvaluated ${coverage.checksNotEvaluated}, dimensionsEvaluated ${coverage.dimensionsEvaluated}, full: ${coverage.full}`,
  );
  lines.push(`requiredChecks: ${coverage.requiredChecks.map((checkId) => safe(checkId)).join(", ") || "none"}`);
  lines.push(`requiredDimensions: ${coverage.requiredDimensions.join(", ") || "none"}`);
  lines.push("limitations");
  if (report.limitations.length === 0) {
    lines.push("  none");
  } else {
    for (const limitation of report.limitations) {
      lines.push(`  ${safe(limitation.code)} — ${safe(limitation.detail)}`);
    }
  }
  if (report.producerClaims !== undefined) {
    lines.push("PRODUCER CLAIMS (UNTRUSTED — NOT VERIFICATION RESULTS)");
    for (const comparison of report.producerClaims.comparison ?? []) {
      lines.push(
        `  ${safe(comparison.checkId)} claimed ${safe(comparison.claimed ?? "null")} independent ${comparison.independentOutcome ?? "null"} ${comparison.relation}`,
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
    `package: ${safe(document.package.identity ?? "null")} (papVersion ${safe(document.package.papVersion ?? "unknown")})`,
  );
  lines.push("declared");
  if (document.declared.length === 0) {
    lines.push("  none");
  } else {
    for (const entry of document.declared) {
      const id = entry.id === undefined ? "" : ` ${safe(entry.id)}`;
      lines.push(
        `  ${entry.kind}${id} ${safe(entry.path)} declared ${safe(entry.declared ?? "none")} computed ${safe(entry.computed ?? "null")}`,
      );
    }
  }
  lines.push("identities");
  lines.push(`  packageIdentity ${safe(document.identities.packageIdentity ?? "null")}`);
  lines.push(`  normalizedInputDigest ${safe(document.identities.normalizedInputDigest ?? "null")}`);
  lines.push(`  extensionClosureDigest ${safe(document.identities.extensionClosureDigest ?? "null")}`);
  lines.push(`  checkerIdentity ${safe(document.identities.checkerIdentity)}`);
  lines.push("limitations");
  if (document.limitations.length === 0) {
    lines.push("  none");
  } else {
    for (const limitation of document.limitations) {
      lines.push(`  ${safe(limitation.code)} — ${safe(limitation.detail)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function renderExplanationText(document: ExplanationDocument, requestedCheckId?: string): string {
  const record = document.checkRecord;
  const lines: string[] = [];
  lines.push("NOT A PACKAGE VERDICT");
  lines.push(`CHECK: ${safe(record?.checkId ?? requestedCheckId ?? "unknown")}`);
  lines.push(`OUTCOME: ${record?.outcome ?? "UNSUPPORTED"}`);
  if (record !== null) {
    lines.push("subjectDigests");
    for (const [kind, value] of Object.entries(record.subjectDigests)) {
      if (Array.isArray(value)) {
        lines.push(`  ${kind} ${safe(JSON.stringify(value))}`);
      } else if (typeof value === "string") {
        lines.push(`  ${kind} ${safe(value)}`);
      }
    }
    lines.push(`scope: ${safe(JSON.stringify(record.scope))}`);
    lines.push(
      `checker: ${safe(record.checker.id)} ${safe(record.checker.version)} ${safe(record.checker.implementationDigest)}`,
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
      lines.push(`  ${safe(limitation.code)} — ${safe(limitation.detail)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
