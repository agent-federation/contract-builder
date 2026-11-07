import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  INDEPENDENT_PINS,
  REQUIRED_CHECKS,
  VERIFIER_ORDER,
  type AssembleOptions,
  type Verdict,
  type VerifierExecution,
  type VerifierName,
} from "../independent.js";

export const PACKAGE_DIR = "/tmp/c6-test/package";
export const POLICY_PATH = "/tmp/c6-test/policy/core000-trust-policy.json";
export const NOW = readFileSync(
  new URL("../pinned-now.txt", import.meta.url),
  "utf8",
).trim();
export const IDENTITY = `sha256:${"a".repeat(64)}`;
export const POLICY_ID = "policy-core000-unsigned-2026-11";
export const POLICY_DIGEST = `sha256:${"b".repeat(64)}`;
export const COMMIT = "c".repeat(40);
export const REFERENCE_DIGEST = `sha256:${"9".repeat(64)}`;

export const MANIFEST = `${JSON.stringify(
  {
    papVersion: "0.1",
    build: {
      engineVersion: "0.1.0",
      manifestVersion: "0.1",
      inputDigest: `sha256:${"d".repeat(64)}`,
      normalizedInputDigest: `sha256:${"e".repeat(64)}`,
      extensions: [{ id: "core000", kind: "profile", version: "0.1.0" }],
    },
    artifacts: [
      {
        id: "artifact:core000-draft",
        path: "artifacts/CORE-000.draft.md",
        digest: `sha256:${"f".repeat(64)}`,
      },
    ],
    sources: [
      {
        id: "SRC-ENGINE-CONTRACT",
        path: "sources/engine-public-contract.md",
        digest: `sha256:${"1".repeat(64)}`,
        acquisition: { method: "git", revision: COMMIT },
      },
    ],
  },
  null,
  2,
)}\n`;

export const MANIFEST_DIGEST = createHash("sha256").update(MANIFEST).digest("hex");

export interface ReportOverrides {
  readonly identity: string;
  readonly verdict: Verdict;
  readonly id: string;
  readonly version: string;
  readonly implementationDigest: string;
  readonly evaluatedAt: string;
  readonly packagePath: string;
  readonly policyPath: string;
  readonly policyDigest: string;
  readonly checkOutcome: string;
}

export function reportFor(
  name: VerifierName,
  overrides: Partial<ReportOverrides> = {},
): Record<string, unknown> {
  const independent = INDEPENDENT_PINS.find((pin) => pin.name === name);
  const id = overrides.id ?? independent?.id ?? "pap.verifier.reference";
  const version = overrides.version ?? independent?.version ?? "0.1.0";
  const implementationDigest =
    overrides.implementationDigest ??
    independent?.implementationDigest ??
    REFERENCE_DIGEST;
  const verdict =
    overrides.verdict ?? (name === "reference" ? "PASS" : "UNSUPPORTED");
  const checkOutcome =
    overrides.checkOutcome ?? (name === "reference" ? "PASS" : "UNSUPPORTED");
  const checks = Object.fromEntries(
    REQUIRED_CHECKS.map((checkId) => [checkId, checkOutcome]),
  );
  return {
    reportVersion: "0.1",
    verifier: {
      id,
      version,
      implementationDigest,
      checkerIdentities: [`sha256:${"7".repeat(64)}`],
    },
    verdict,
    evaluatedAt: overrides.evaluatedAt ?? NOW,
    identities: {
      packageIdentity: overrides.identity ?? IDENTITY,
      artifacts: [],
      sources: [],
      checkerIdentity: `sha256:${"7".repeat(64)}`,
    },
    package: {
      identity: overrides.identity ?? IDENTITY,
      papVersion: "0.1",
      path: overrides.packagePath ?? PACKAGE_DIR,
    },
    policy: {
      id: POLICY_ID,
      digest: overrides.policyDigest ?? POLICY_DIGEST,
      path: overrides.policyPath ?? POLICY_PATH,
      state: "FRESH",
    },
    dimensions: {
      integrity: { package: "PASS", artifacts: "PASS" },
      sources: { availability: "PASS", integrity: "PASS" },
      trust: { policyDecision: "NOT_EVALUATED" },
      checks: {
        results: REQUIRED_CHECKS.map((checkId) => ({
          checkId,
          outcome: checks[checkId],
          required: true,
        })),
      },
    },
    checks:
      name === "reference"
        ? REQUIRED_CHECKS.map((checkId) => ({
            checkId,
            outcome: checks[checkId],
          }))
        : [],
  };
}

export function executionFor(
  name: VerifierName,
  report: unknown,
  exitCode: number,
): VerifierExecution {
  return {
    name,
    exitCode,
    stdout: JSON.stringify(report),
    stderr: "",
  };
}

export function defaultExecutions(): VerifierExecution[] {
  return VERIFIER_ORDER.map((name) =>
    executionFor(
      name,
      reportFor(name),
      name === "reference" ? 0 : 4,
    ),
  );
}

/** Executions whose reports name the supplied package/policy paths. */
export function executionsForPaths(
  packageDir: string,
  policyPath: string,
): VerifierExecution[] {
  return VERIFIER_ORDER.map((name) =>
    executionFor(
      name,
      reportFor(name, { packagePath: packageDir, policyPath }),
      name === "reference" ? 0 : 4,
    ),
  );
}

export function optionsWith(
  executions: readonly VerifierExecution[],
): AssembleOptions {
  return {
    now: NOW,
    packageDir: PACKAGE_DIR,
    policyPath: POLICY_PATH,
    manifestText: MANIFEST,
    packageFileDigests: {
      "assurance-package.json": MANIFEST_DIGEST,
      "artifacts/CORE-000.draft.md": `sha256:${"f".repeat(64)}`,
    },
    packageFileTypes: {
      "assurance-package.json": "file",
      "artifacts/CORE-000.draft.md": "file",
    },
    executions,
  };
}

export function replaceExecution(
  executions: readonly VerifierExecution[],
  replaced: VerifierExecution,
): VerifierExecution[] {
  return executions.map((entry) =>
    entry.name === replaced.name ? replaced : entry,
  );
}
