/**
 * `pap explain` — explain one declared check's inputs, procedure, outcome and
 * evidence without printing a package verdict (RFC §9.5).
 */

import { verifyPackage, UsageError } from "./verify.js";
import type { CheckRecord, Limitation } from "./types.js";

export interface ExplanationDocument {
  explanationVersion: "0.1";
  package: { identity: string | null; papVersion: string | null; path: string };
  checkRecord: CheckRecord | null;
  limitations: Limitation[];
}

export interface ExplainResult {
  document: ExplanationDocument;
  exitCode: number;
}

export async function explainPackage(
  packagePath: string,
  checkId: string,
): Promise<ExplainResult> {
  const result = await verifyPackage({ packagePath });
  const report = result.report;
  const dimension = report.dimensions.checks.results.find((entry) => entry.checkId === checkId);
  if (dimension === undefined) {
    throw new UsageError("pap.cli.unknown-check", `the package does not declare check ${checkId}`);
  }
  const record = report.checks.find((entry) => entry.checkId === checkId) ?? null;
  const exitCode =
    dimension.outcome === "PASS"
      ? 0
      : dimension.outcome === "FAIL"
        ? 1
        : dimension.outcome === "UNSUPPORTED"
          ? 4
          : 2;
  return {
    document: {
      explanationVersion: "0.1",
      package: {
        identity: report.package.identity,
        papVersion: report.package.papVersion,
        path: report.package.path ?? packagePath,
      },
      checkRecord: record,
      limitations: report.limitations.filter((limitation) =>
        limitation.code.startsWith("pap.check."),
      ),
    },
    exitCode,
  };
}
