/**
 * Public verifier result/option types, the payload state shape and the
 * verdict-to-exit-code mapping.
 */

import type { ArtifactState, ClaimState, InputState, SourceState } from "../checks.js";
import type { Instant } from "../time.js";
import type { ClaimKind, Diagnostic, Verdict, VerificationReport } from "../types.js";

/** Diagnostic sink shared by the verifier phases. */
export type Diag = (
  code: string,
  severity: Diagnostic["severity"],
  scope: string,
  message: string,
) => void;

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
