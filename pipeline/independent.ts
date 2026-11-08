/**
 * `bun run pipeline:independent --out <dir>` — C6 independent-verification batch.
 *
 * The batch is the #135/#216 evidence run: the reference verifier plus the three
 * blind-lab Phase 2a implementations, each run offline against the same CORE-000
 * package bytes, the same absolute trust-policy path and one pinned `--now`.
 *
 * The three independent implementations are built from public, pinned commit
 * archives (never copied from the blind-lab handoff reports). Every archive is
 * verified against its SHA-256 before extraction, including a cached archive,
 * and each report must self-identify with its pinned `implementationDigest`.
 *
 * A successful run means the verifier executed and produced a retained report;
 * it does not mean the report verdict is PASS. `UNSUPPORTED`/`INCOMPLETE` are
 * recorded as such and never converted to a pass. A missing report, an
 * unparseable report, an identity mismatch or a `packageIdentity` disagreement
 * is a problem and makes the command exit 1; the batch is still written so the
 * failure itself is retained.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderEvidenceMarkdown } from "./evidence.js";
import { assertOutsideRepository, packCore000, REPO_ROOT } from "./pack.js";

/** Single source of the pinned evaluation time, inside the policy window. */
export const PINNED_NOW_PATH = path.join(REPO_ROOT, "pipeline", "pinned-now.txt");

export async function readPinnedNow(): Promise<string> {
  const value = (await readFile(PINNED_NOW_PATH, "utf8")).trim();
  if (value.length === 0) {
    throw new Error(`${PINNED_NOW_PATH} is empty`);
  }
  return value;
}

/** The independent implementations are the blind-lab Gate 3 Phase 2a set. */
export const BLIND_LAB_PROVENANCE = {
  repository: "agent-federation/blind-lab",
  commit: "e5da9ac404547579d184d2f47d33c1e1ac866495",
  pullRequest: 42,
  handoff: "audit/c6-independent-2026-11-07",
} as const;

export const REQUIRED_CHECKS = [
  "pap.check.digest-integrity/1",
  "pap.check.source-quote/1",
  "pap.check.relation-consistency/1",
] as const;

export type VerifierName = "reference" | "rust" | "go" | "python";
export const VERIFIER_ORDER: readonly VerifierName[] = ["reference", "rust", "go", "python"];

export type Verdict =
  | "PASS"
  | "FAIL"
  | "INCOMPLETE"
  | "NOT_EVALUATED"
  | "UNTRUSTED"
  | "UNSUPPORTED";

const EXIT_CODE_BY_VERDICT: Record<Verdict, number> = {
  PASS: 0,
  FAIL: 1,
  INCOMPLETE: 2,
  NOT_EVALUATED: 2,
  UNTRUSTED: 3,
  UNSUPPORTED: 4,
};

/** PAP CLI exit codes that mean "the verifier executed and wrote a report". */
const EXECUTED_EXIT_CODES = new Set([0, 1, 2, 3, 4]);

export interface IndependentPin {
  readonly name: "rust" | "go" | "python";
  readonly id: string;
  readonly version: string;
  readonly implementationDigest: string;
  readonly repository: string;
  readonly tag: string;
  readonly commit: string;
  readonly tarball: string;
  readonly tarballSha256: string;
  readonly build: string;
}

/**
 * Pins verified against the blind-lab C6 handoff (audit/c6-independent-2026-11-07)
 * and re-checked by this script on every run. The commit SHA plus the archive
 * SHA-256 plus the expected self-reported implementationDigest are the pin.
 */
export const INDEPENDENT_PINS: readonly IndependentPin[] = [
  {
    name: "rust",
    id: "pap.verifier.rust",
    version: "0.1.0",
    implementationDigest: "sha256:e5d6ab21a1ea94d17e0ed60f1873ca622db03b2fac70ebda0f172f24c4c1454d",
    repository: "agent-federation/contract-builder-independent-rs-v2",
    tag: "pap-rs-p2a-003-result",
    commit: "0b31dac728fbfdfab4f2948ccede3b5957b17fc9",
    tarball:
      "https://github.com/agent-federation/contract-builder-independent-rs-v2/archive/0b31dac728fbfdfab4f2948ccede3b5957b17fc9.tar.gz",
    tarballSha256: "0539d883aed7a07fe19a3e83187c6a172daf1e4a7637231de6c64339a0f33b68",
    build: "cargo build --release --offline",
  },
  {
    name: "go",
    id: "pap.verifier.go",
    version: "0.1.0",
    implementationDigest: "sha256:f386a6f8712bdb290be2b272d93bc70bfb589d6c4289bfbd9044b2b118c7dc14",
    repository: "agent-federation/contract-builder-independent-go-v2",
    tag: "pap-go-p2a-003-result",
    commit: "8d49d694ce9e3b081959f5325bc6a9972f7708de",
    tarball:
      "https://github.com/agent-federation/contract-builder-independent-go-v2/archive/8d49d694ce9e3b081959f5325bc6a9972f7708de.tar.gz",
    tarballSha256: "ccafd542b66024b6f64137ebd9af34d3d4a3965dd034f668f7c85a9b163cedbb",
    build: "go build -o pap .",
  },
  {
    name: "python",
    id: "pap.verifier.python",
    version: "0.1.0",
    implementationDigest: "sha256:367c40ff74b93d34b927485035000cbeb465f8e4ebcde8cd85c61743efd41393",
    repository: "agent-federation/contract-builder-independent-py-v2",
    tag: "pap-py-p2a-003-result",
    commit: "58f368cd9b46d88e20e6cd26f9169c65a807fc4b",
    tarball:
      "https://github.com/agent-federation/contract-builder-independent-py-v2/archive/58f368cd9b46d88e20e6cd26f9169c65a807fc4b.tar.gz",
    tarballSha256: "ad1d3326aec39edc255d1fbdd71e39a116454d9a6fd56302d9a7abb756522140",
    build: "none (Python standard library; run from the extracted tree)",
  },
];

const REFERENCE = {
  name: "reference" as const,
  id: "pap.verifier.reference",
  repository: "agent-federation/contract-builder",
  command: "bun run pap -- verify <package> --trust-policy <policy> --format json --now <pinned>",
};

type JsonObject = Record<string, unknown>;

export interface VerifierExecution {
  readonly name: VerifierName;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Set when the process could not be started or its report could not be read. */
  readonly error?: string;
}

export interface InputIntegrity {
  readonly readOnlyDuringRuns: boolean;
  readonly mutations: readonly string[];
}

export interface AssembleOptions {
  readonly now: string;
  readonly packageDir: string;
  readonly policyPath: string;
  readonly manifestText: string;
  readonly packageFileDigests: Readonly<Record<string, string>>;
  /** lstat types recorded by `snapshotInputs`; verified again after every run. */
  readonly packageFileTypes?: Readonly<Record<string, string>>;
  readonly executions: readonly VerifierExecution[];
  /** Run-level diagnostics, such as a failure to make the inputs read-only. */
  readonly extraProblems?: readonly string[];
  /** Input-protection result; mutations are also appended to the batch problems. */
  readonly inputIntegrity?: InputIntegrity;
}

export interface VerifierEntry {
  readonly verifier: VerifierName;
  readonly status: "EXECUTED" | "NOT_PERFORMED";
  readonly reason?: string;
  readonly id: string | null;
  readonly version: string | null;
  readonly implementationDigest: string | null;
  readonly checkerIdentities: readonly string[] | null;
  readonly verdict: Verdict | null;
  readonly evaluatedAt: string | null;
  readonly exitCode: number | null;
  readonly source: {
    readonly kind: "in-repo" | "pinned-source-tarball";
    readonly repository: string;
    readonly commit: string | null;
    readonly tag: string | null;
    readonly tarball: string | null;
    readonly tarballSha256: string | null;
    readonly build: string | null;
    readonly command: string;
  };
  readonly checks: Readonly<Record<string, string>>;
  readonly dimensions: Readonly<Record<string, string | null>>;
  readonly report: string;
  readonly reportSha256: string | null;
}

export interface Comparison {
  readonly samePackageIdentity: boolean;
  readonly referenceVerdict: Verdict | null;
  readonly independentVerdicts: Readonly<Record<"rust" | "go" | "python", Verdict | null>>;
  readonly integrityAndSourcesAgreement: boolean;
  /** False when two reports actually evaluated the same required check differently. */
  readonly checkAgreement: boolean;
  readonly differences: readonly string[];
  readonly limitations: readonly string[];
}

export interface C6Batch {
  readonly schema: "c6-independent-batch/1";
  readonly provenance: typeof BLIND_LAB_PROVENANCE;
  readonly contractBuilderCommit: string;
  readonly pinnedNow: string;
  readonly trustPolicy: {
    readonly id: string;
    readonly path: string;
    readonly sha256: string;
  };
  readonly package: {
    readonly identity: string;
    readonly manifestSha256: string;
    readonly papVersion: string;
    readonly build: JsonObject;
    readonly artifacts: readonly JsonObject[];
    readonly sources: readonly unknown[];
    readonly files: Readonly<Record<string, string>>;
    /** lstat type per packaged file, so a symlink swap is visible in the audit record. */
    readonly fileTypes: Readonly<Record<string, string>>;
  };
  readonly inputIntegrity: InputIntegrity;
  readonly requiredChecks: readonly string[];
  readonly verifiers: readonly VerifierEntry[];
  readonly comparison: Comparison;
  readonly problems: readonly string[];
  readonly ok: boolean;
}

export interface BatchOutcome {
  readonly batch: C6Batch;
  readonly problems: readonly string[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`${label} is not a JSON object`);
  return value;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string");
}

function nested(value: unknown, ...keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (!isObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isVerdict(value: unknown): value is Verdict {
  return (
    typeof value === "string" && Object.prototype.hasOwnProperty.call(EXIT_CODE_BY_VERDICT, value)
  );
}

/** Parse one verifier report; a non-object or invalid JSON is a parse failure. */
export function parseVerifierReport(text: string, label: string): JsonObject {
  if (text.trim().length === 0) {
    throw new Error(`${label}: the verifier wrote no report to stdout`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label}: report is not valid JSON: ${messageOf(error)}`);
  }
  return asObject(value, `${label}: report`);
}

function checksFrom(report: JsonObject): Record<string, string> {
  const checks: Record<string, string> = {};
  const listed = report.checks;
  if (Array.isArray(listed)) {
    for (const item of listed) {
      const checkId = textOf(nested(item, "checkId"));
      const outcome = textOf(nested(item, "outcome"));
      if (checkId !== null && outcome !== null) checks[checkId] = outcome;
    }
  }
  const results = nested(report, "dimensions", "checks", "results");
  if (Array.isArray(results)) {
    for (const item of results) {
      const checkId = textOf(nested(item, "checkId"));
      const outcome = textOf(nested(item, "outcome"));
      if (checkId !== null && outcome !== null && checks[checkId] === undefined) {
        checks[checkId] = outcome;
      }
    }
  }
  for (const required of REQUIRED_CHECKS) {
    if (checks[required] === undefined) checks[required] = "ABSENT";
  }
  return checks;
}

function dimensionsFrom(report: JsonObject): Record<string, string | null> {
  const dimensions = isObject(report.dimensions) ? report.dimensions : {};
  return {
    "integrity.package": textOf(nested(dimensions, "integrity", "package")),
    "integrity.artifacts": textOf(nested(dimensions, "integrity", "artifacts")),
    "sources.availability": textOf(nested(dimensions, "sources", "availability")),
    "sources.integrity": textOf(nested(dimensions, "sources", "integrity")),
    "trust.policyDecision": textOf(nested(dimensions, "trust", "policyDecision")),
    verdict: textOf(report.verdict),
  };
}

function sourceFor(name: VerifierName, commit: string | null): VerifierEntry["source"] {
  if (name === "reference") {
    return {
      kind: "in-repo",
      repository: REFERENCE.repository,
      commit,
      tag: null,
      tarball: null,
      tarballSha256: null,
      build: null,
      command: REFERENCE.command,
    };
  }
  const pin = INDEPENDENT_PINS.find((candidate) => candidate.name === name);
  if (pin === undefined) throw new Error(`no pin for ${name}`);
  return {
    kind: "pinned-source-tarball",
    repository: pin.repository,
    commit: pin.commit,
    tag: pin.tag,
    tarball: pin.tarball,
    tarballSha256: pin.tarballSha256,
    build: pin.build,
    command:
      name === "python"
        ? "PYTHONPATH=. python3 -m pap_verifier verify <package> --trust-policy <policy> --format json --now <pinned>"
        : `./pap verify <package> --trust-policy <policy> --format json --now <pinned>`,
  };
}

function notPerformed(name: VerifierName, reason: string, commit: string | null): VerifierEntry {
  return {
    verifier: name,
    status: "NOT_PERFORMED",
    reason,
    id: null,
    version: null,
    implementationDigest: null,
    checkerIdentities: null,
    verdict: null,
    evaluatedAt: null,
    exitCode: null,
    source: sourceFor(name, commit),
    checks: {},
    dimensions: {},
    report: `reports/${name}.json`,
    reportSha256: null,
  };
}

interface Described {
  readonly entry: VerifierEntry;
  readonly problems: readonly string[];
}

function describeExecuted(
  execution: VerifierExecution,
  report: JsonObject,
  options: AssembleOptions,
  manifest: JsonObject,
  commit: string | null,
): Described {
  const name = execution.name;
  const problems: string[] = [];
  const verifier = asObject(report.verifier, `${name}.verifier`);
  const identities = asObject(report.identities, `${name}.identities`);
  const pkg = asObject(report.package, `${name}.package`);
  const policy = asObject(report.policy, `${name}.policy`);

  const verdict = textOf(report.verdict);
  if (!isVerdict(verdict)) {
    throw new Error(`${name}: report verdict is missing or unknown`);
  }
  const exitCode = execution.exitCode;
  if (exitCode === null || !EXECUTED_EXIT_CODES.has(exitCode)) {
    throw new Error(
      `${name}: exit code ${String(exitCode)} is not a PAP verifier verdict exit (0-4)`,
    );
  }
  if (EXIT_CODE_BY_VERDICT[verdict] !== exitCode) {
    problems.push(
      `${name}: exit code ${exitCode} does not match report verdict ${verdict} (expected ${EXIT_CODE_BY_VERDICT[verdict]})`,
    );
  }

  const id = textOf(verifier.id);
  const version = textOf(verifier.version);
  const implementationDigest = textOf(verifier.implementationDigest);
  const checkerIdentities = stringArray(verifier.checkerIdentities);

  if (name === "reference") {
    if (id !== REFERENCE.id) {
      problems.push(
        `${name}: verifier id ${JSON.stringify(id)} does not match ${JSON.stringify(REFERENCE.id)}`,
      );
    }
    if (version === null) problems.push(`${name}: verifier version is missing`);
    if (implementationDigest === null) {
      problems.push(`${name}: verifier implementationDigest is missing`);
    }
  } else {
    const pin = INDEPENDENT_PINS.find((candidate) => candidate.name === name);
    if (pin === undefined) throw new Error(`no pin for ${name}`);
    if (id !== pin.id) {
      problems.push(
        `${name}: verifier id ${JSON.stringify(id)} does not match the pin ${JSON.stringify(pin.id)}`,
      );
    }
    if (version !== pin.version) {
      problems.push(
        `${name}: verifier version ${JSON.stringify(version)} does not match the pin ${JSON.stringify(pin.version)}`,
      );
    }
    if (implementationDigest !== pin.implementationDigest) {
      problems.push(
        `${name}: implementationDigest ${JSON.stringify(implementationDigest)} does not match the pin ${JSON.stringify(pin.implementationDigest)}`,
      );
    }
  }

  const packageIdentity = textOf(identities.packageIdentity);
  if (packageIdentity === null || packageIdentity.length === 0) {
    throw new Error(`${name}: identities.packageIdentity is missing`);
  }
  if (textOf(pkg.identity) !== packageIdentity) {
    problems.push(
      `${name}: package.identity ${JSON.stringify(textOf(pkg.identity))} does not match identities.packageIdentity ${JSON.stringify(packageIdentity)}`,
    );
  }

  const reportedPackagePath = textOf(pkg.path);
  if (reportedPackagePath === null) {
    problems.push(`${name}: package.path is missing from the report`);
  } else if (path.resolve(reportedPackagePath) !== options.packageDir) {
    problems.push(
      `${name}: report package.path ${JSON.stringify(reportedPackagePath)} is not the run package path ${JSON.stringify(options.packageDir)}`,
    );
  }

  const reportedPolicyPath = textOf(policy.path);
  if (reportedPolicyPath === null) {
    problems.push(`${name}: policy.path is missing from the report`);
  } else if (path.resolve(reportedPolicyPath) !== options.policyPath) {
    problems.push(
      `${name}: report policy.path ${JSON.stringify(reportedPolicyPath)} is not the run policy path ${JSON.stringify(options.policyPath)}`,
    );
  }

  const policyId = textOf(policy.id);
  const policyDigest = textOf(policy.digest);
  if (policyId === null || policyId.length === 0) {
    problems.push(`${name}: policy.id is missing from the report`);
  }
  if (policyDigest === null || policyDigest.length === 0) {
    problems.push(`${name}: policy.digest is missing from the report`);
  }
  if (textOf(policy.state) !== "FRESH") {
    problems.push(
      `${name}: policy.state is ${JSON.stringify(textOf(policy.state))}, expected FRESH`,
    );
  }

  const evaluatedAt = textOf(report.evaluatedAt);
  if (evaluatedAt !== options.now) {
    problems.push(
      `${name}: evaluatedAt ${JSON.stringify(evaluatedAt)} is not the pinned --now ${JSON.stringify(options.now)}`,
    );
  }

  const papVersion = textOf(pkg.papVersion);
  if (papVersion === null || papVersion.length === 0) {
    problems.push(`${name}: package.papVersion is missing from the report`);
  }
  const manifestPapVersion = textOf(manifest.papVersion);
  if (papVersion !== null && manifestPapVersion !== null && papVersion !== manifestPapVersion) {
    problems.push(
      `${name}: report papVersion ${JSON.stringify(papVersion)} does not match the package manifest ${JSON.stringify(manifestPapVersion)}`,
    );
  }

  return {
    entry: {
      verifier: name,
      status: "EXECUTED",
      id,
      version,
      implementationDigest,
      checkerIdentities,
      verdict,
      evaluatedAt,
      exitCode,
      source: sourceFor(name, commit),
      checks: checksFrom(report),
      dimensions: dimensionsFrom(report),
      report: `reports/${name}.json`,
      reportSha256: sha256Hex(execution.stdout),
    },
    problems,
  };
}

/**
 * A required check FAIL must dominate the report verdict, and PASS must mean
 * every required check PASS. `UNSUPPORTED`/`NOT_EVALUATED`/`ABSENT` are not
 * contradictions on their own; only a positive evaluated outcome is compared.
 */
function checkOutcomeContradictions(entry: VerifierEntry): string[] {
  if (entry.status !== "EXECUTED" || entry.verdict === null) return [];
  const outcomes = REQUIRED_CHECKS.map((checkId) => ({
    checkId,
    outcome: entry.checks[checkId] ?? "ABSENT",
  }));
  const problems: string[] = [];
  if (entry.verdict === "PASS") {
    for (const { checkId, outcome } of outcomes) {
      if (outcome !== "PASS") {
        problems.push(
          `${entry.verifier}: verdict PASS contradicts required check ${checkId} outcome ${outcome}; PASS requires every required check to PASS`,
        );
      }
    }
  }
  if (entry.verdict !== "FAIL") {
    for (const { checkId, outcome } of outcomes) {
      if (outcome === "FAIL") {
        problems.push(
          `${entry.verifier}: verdict ${entry.verdict} contradicts required check ${checkId} outcome FAIL; a FAILed required check requires verdict FAIL`,
        );
      }
    }
  }
  return problems;
}

/**
 * A genuine disagreement on a check outcome that two reports both evaluated
 * (PASS/FAIL) is a batch problem. UNSUPPORTED, NOT_EVALUATED and ABSENT are not
 * disagreements by themselves.
 */
function checkDisagreements(entries: readonly VerifierEntry[]): string[] {
  const problems: string[] = [];
  for (const checkId of REQUIRED_CHECKS) {
    const evaluated = entries
      .filter((entry) => entry.status === "EXECUTED")
      .map((entry) => ({
        name: entry.verifier,
        outcome: entry.checks[checkId] ?? "ABSENT",
      }))
      .filter(({ outcome }) => outcome === "PASS" || outcome === "FAIL");
    if (new Set(evaluated.map(({ outcome }) => outcome)).size > 1) {
      problems.push(
        `check-level disagreement on ${checkId}: ${evaluated
          .map(({ name, outcome }) => `${name} ${outcome}`)
          .join(", ")}`,
      );
    }
  }
  return problems;
}

/**
 * Pure batch assembly: turn four executions plus the packed package into the
 * committed evidence record. It never throws for a bad report; it records a
 * `NOT_PERFORMED` entry or a problem and sets `ok` false, so the caller can
 * retain the failure evidence before exiting non-zero.
 */
export function assembleBatch(options: AssembleOptions): BatchOutcome {
  const problems: string[] = [
    ...(options.extraProblems ?? []),
    ...(options.inputIntegrity?.mutations ?? []),
  ];
  const packageDir = path.resolve(options.packageDir);
  const policyPath = path.resolve(options.policyPath);
  const normalized: AssembleOptions = {
    ...options,
    packageDir,
    policyPath,
  };
  const packageFileTypes: Readonly<Record<string, string>> = options.packageFileTypes ?? {};
  if (options.packageFileTypes === undefined) {
    problems.push("package file types were not recorded");
  }
  for (const [file, type] of Object.entries(packageFileTypes)) {
    if (type !== "file") {
      problems.push(`package file is not a regular file: ${file} (${type})`);
    }
  }

  let manifest: JsonObject = {};
  try {
    manifest = asObject(JSON.parse(options.manifestText), "assurance-package.json");
  } catch (error) {
    problems.push(`package manifest cannot be read: ${messageOf(error)}`);
  }

  if (textOf(manifest.papVersion) === null) {
    problems.push("package manifest papVersion is missing");
  }

  const revisions = new Set<string>();
  if (Array.isArray(manifest.sources)) {
    for (const source of manifest.sources) {
      const revision = textOf(nested(source, "acquisition", "revision"));
      if (revision !== null) revisions.add(revision);
    }
  }
  let commit = "";
  if (revisions.size === 0) {
    problems.push(
      "package manifest has no sources[].acquisition.revision; package identity cannot be bound to a commit",
    );
  } else if (revisions.size > 1) {
    problems.push(
      `package manifest sources disagree on acquisition.revision: ${[...revisions].sort().join(", ")}`,
    );
  } else {
    commit = [...revisions][0] ?? "";
    if (!/^[0-9a-f]{7,64}$/.test(commit)) {
      problems.push(`package manifest revision is not a git object id: ${JSON.stringify(commit)}`);
    }
  }

  const byName = new Map<VerifierName, VerifierExecution>();
  for (const execution of options.executions) byName.set(execution.name, execution);

  const entries: VerifierEntry[] = [];
  const reports = new Map<VerifierName, JsonObject>();

  for (const name of VERIFIER_ORDER) {
    const execution = byName.get(name);
    if (execution === undefined) {
      entries.push(
        notPerformed(name, "report missing: the verifier produced no execution", commit || null),
      );
      continue;
    }
    if (execution.error !== undefined) {
      entries.push(notPerformed(name, `report missing: ${execution.error}`, commit || null));
      continue;
    }
    if (execution.exitCode === null) {
      entries.push(
        notPerformed(name, "report missing: the verifier produced no exit code", commit || null),
      );
      continue;
    }
    if (!EXECUTED_EXIT_CODES.has(execution.exitCode)) {
      entries.push(
        notPerformed(
          name,
          `unexpected exit code ${execution.exitCode}; the PAP verdict exits are 0-4`,
          commit || null,
        ),
      );
      continue;
    }
    let report: JsonObject;
    try {
      report = parseVerifierReport(execution.stdout, name);
    } catch (error) {
      entries.push(notPerformed(name, `report parse failure: ${messageOf(error)}`, commit || null));
      continue;
    }
    reports.set(name, report);
    let described: Described;
    try {
      described = describeExecuted(execution, report, normalized, manifest, commit || null);
    } catch (error) {
      entries.push(notPerformed(name, `report shape failure: ${messageOf(error)}`, commit || null));
      continue;
    }
    entries.push(described.entry);
    problems.push(...described.problems);
  }

  const executed = entries.filter((entry) => entry.status === "EXECUTED");
  for (const entry of entries) {
    if (entry.status === "NOT_PERFORMED") {
      problems.push(`${entry.verifier}: not performed: ${entry.reason ?? "unknown reason"}`);
    }
  }

  const identities = new Set(
    executed
      .map((entry) => {
        const report = reports.get(entry.verifier);
        return textOf(nested(report, "identities", "packageIdentity"));
      })
      .filter((identity): identity is string => identity !== null),
  );
  if (executed.length !== VERIFIER_ORDER.length) {
    problems.push(
      `expected ${VERIFIER_ORDER.length} executed verifier reports, got ${executed.length}`,
    );
  }
  if (identities.size > 1) {
    problems.push(`packageIdentity disagreement: ${[...identities].sort().join(", ")}`);
  }
  const samePackageIdentity = executed.length === VERIFIER_ORDER.length && identities.size === 1;

  const policyIds = new Set(
    executed
      .map((entry) => textOf(nested(reports.get(entry.verifier), "policy", "id")))
      .filter((value): value is string => value !== null),
  );
  const policyDigests = new Set(
    executed
      .map((entry) => textOf(nested(reports.get(entry.verifier), "policy", "digest")))
      .filter((value): value is string => value !== null),
  );
  if (policyIds.size > 1) {
    problems.push(`trust policy id disagreement: ${[...policyIds].sort().join(", ")}`);
  }
  if (policyDigests.size > 1) {
    problems.push(`trust policy digest disagreement: ${[...policyDigests].sort().join(", ")}`);
  }

  const reference = entries.find((entry) => entry.verifier === "reference");
  if (reference === undefined) {
    problems.push("reference: no entry was assembled");
  } else if (reference.status === "EXECUTED" && reference.verdict !== "PASS") {
    problems.push(`reference: verdict is ${JSON.stringify(reference.verdict)}, expected PASS`);
  }

  const identity =
    [...identities][0] ??
    executed
      .map((entry) => textOf(nested(reports.get(entry.verifier), "package", "identity")))
      .find((value): value is string => typeof value === "string" && value.length > 0) ??
    "";

  const policy = executed
    .map((entry) => reports.get(entry.verifier))
    .find((report) => report !== undefined);
  const policyId = textOf(nested(policy, "policy", "id")) ?? "";
  const policyDigest = textOf(nested(policy, "policy", "digest")) ?? "";
  const trustPolicySha256 = policyDigest.startsWith("sha256:")
    ? policyDigest.slice("sha256:".length)
    : policyDigest;

  const integrityAndSourcesAgreement =
    executed.length === VERIFIER_ORDER.length &&
    executed.every(
      (entry) =>
        entry.dimensions["integrity.package"] === "PASS" &&
        entry.dimensions["integrity.artifacts"] === "PASS" &&
        entry.dimensions["sources.availability"] === "PASS" &&
        entry.dimensions["sources.integrity"] === "PASS",
    );

  const independentVerdicts: Record<"rust" | "go" | "python", Verdict | null> = {
    rust: entries.find((entry) => entry.verifier === "rust")?.verdict ?? null,
    go: entries.find((entry) => entry.verifier === "go")?.verdict ?? null,
    python: entries.find((entry) => entry.verifier === "python")?.verdict ?? null,
  };

  // C6 expects Phase 2a outcomes only: FAIL/UNTRUSTED/NOT_EVALUATED on the
  // independent side are evidence of a broken or ambiguous run, not a pass.
  const expectedIndependentVerdicts = new Set<Verdict>(["PASS", "UNSUPPORTED", "INCOMPLETE"]);
  for (const name of ["rust", "go", "python"] as const) {
    const entry = entries.find((candidate) => candidate.verifier === name);
    if (entry?.status !== "EXECUTED") continue;
    if (entry.verdict === null || !expectedIndependentVerdicts.has(entry.verdict)) {
      problems.push(
        `${name}: independent verdict ${JSON.stringify(entry.verdict)} is outside the expected Phase 2a set (PASS, UNSUPPORTED, INCOMPLETE)`,
      );
    }
  }
  if (!integrityAndSourcesAgreement) {
    problems.push(
      "independent runs do not agree with the reference on package/artifact integrity or source availability",
    );
  }

  const checkContradictions = entries.flatMap(checkOutcomeContradictions);
  problems.push(...checkContradictions);
  const checkDisagreementProblems = checkDisagreements(entries);
  problems.push(...checkDisagreementProblems);
  const checkAgreement = checkDisagreementProblems.length === 0;

  const independentEntries = entries.filter((entry) => entry.verifier !== "reference");
  const executedIndependent = independentEntries.filter((entry) => entry.status === "EXECUTED");
  const independentVerdictsText = independentEntries
    .map(
      (entry) =>
        `${entry.verifier} ${entry.status === "EXECUTED" ? (entry.verdict ?? "UNKNOWN") : "NOT_PERFORMED"}`,
    )
    .join(", ");
  const anyIndependentCheckEvaluated = executedIndependent.some((entry) =>
    REQUIRED_CHECKS.some((checkId) => ["PASS", "FAIL"].includes(entry.checks[checkId] ?? "ABSENT")),
  );
  const phase2aOnly =
    executedIndependent.length > 0 &&
    executedIndependent.every((entry) =>
      REQUIRED_CHECKS.every((checkId) =>
        ["UNSUPPORTED", "ABSENT", "NOT_EVALUATED"].includes(entry.checks[checkId] ?? "ABSENT"),
      ),
    );
  const differences = [
    `The reference verifier reports ${reference?.verdict ?? "NOT_PERFORMED"} on the three required checks.`,
    `The independent verdicts are ${independentVerdictsText}. A non-PASS independent verdict is recorded as-is and is never converted to PASS.`,
  ];
  const limitations = [
    integrityAndSourcesAgreement
      ? "The independent runs agree with the reference on packageIdentity and on package/artifact/source integrity and source availability."
      : "The independent runs do not all agree with the reference on packageIdentity or on package/artifact/source integrity and source availability; this batch is not valid evidence of agreement.",
    "The package is commit-bound: packageIdentity includes sources[].acquisition.revision, the packing checkout's git HEAD. Re-running from another commit, including the CI merge commit, produces a different identity.",
    "Verifier reports carry absolute package and policy paths, so the report SHA-256 values are path-dependent. The hashes in this batch are for the recorded run paths; CI regenerates them for its own checkout.",
    "All three independent implementations were produced in blind-lab by one owner/harness (two model families). This supports implementation independence, not team independence (the Gate 3 caveat).",
    phase2aOnly
      ? "The independent implementations are PAP v0.1 Phase 2a only; the required checks are not evaluated there and are Phase 2b scope, out of scope for C6."
      : anyIndependentCheckEvaluated
        ? "At least one independent implementation evaluated one or more required checks; the check matrix records the actual outcomes."
        : "No independent implementation executed its required checks in this batch.",
    anyIndependentCheckEvaluated
      ? "No CORE-000 claim is promoted to independently_verified; at least one independent check was evaluated, and the matrix records the outcome."
      : "No CORE-000 claim is promoted to independently_verified; H3 is executed-not-evaluated for the Phase 2b checks.",
  ];

  const build = isObject(manifest.build) ? manifest.build : {};
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts.filter(isObject) : [];
  const sources = Array.isArray(manifest.sources) ? manifest.sources : [];

  const batch: C6Batch = {
    schema: "c6-independent-batch/1",
    provenance: BLIND_LAB_PROVENANCE,
    contractBuilderCommit: commit,
    pinnedNow: options.now,
    trustPolicy: {
      id: policyId,
      path: policyPath,
      sha256: trustPolicySha256,
    },
    package: {
      identity,
      manifestSha256: sha256Hex(options.manifestText),
      papVersion: textOf(manifest.papVersion) ?? "",
      build,
      artifacts,
      sources,
      files: options.packageFileDigests,
      fileTypes: packageFileTypes,
    },
    inputIntegrity: options.inputIntegrity ?? { readOnlyDuringRuns: false, mutations: [] },
    requiredChecks: REQUIRED_CHECKS,
    verifiers: entries,
    comparison: {
      samePackageIdentity,
      referenceVerdict: reference?.verdict ?? null,
      independentVerdicts,
      integrityAndSourcesAgreement,
      checkAgreement,
      differences,
      limitations,
    },
    problems,
    ok: problems.length === 0,
  };
  return { batch, problems };
}

// ---------------------------------------------------------------------------
// CLI: fetch, build, run, assemble, write.
// ---------------------------------------------------------------------------

interface CommandOutcome {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: string;
}

function runCommand(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly timeoutMs?: number;
  },
): Promise<CommandOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let spawnError: string | undefined;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      resolve({
        code,
        stdout,
        stderr,
        ...(spawnError === undefined ? {} : { error: spawnError }),
      });
    };
    try {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: options.timeoutMs ?? 15 * 60 * 1000,
      });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        spawnError = error.message;
        finish(null);
      });
      child.on("close", (code) => {
        finish(code);
      });
    } catch (error) {
      resolve({
        code: null,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function tail(text: string, limit = 4000): string {
  return text.length <= limit ? text : text.slice(text.length - limit);
}

async function readBytes(file: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(file));
}

async function sha256File(file: string): Promise<string> {
  return sha256Hex(await readBytes(file));
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function fetchArchive(pin: IndependentPin, tarballDir: string): Promise<string> {
  const destination = path.join(tarballDir, `${pin.name}.tar.gz`);
  if (await exists(destination)) {
    const actual = await sha256File(destination);
    if (actual === pin.tarballSha256) return destination;
    process.stderr.write(`c6: cached ${pin.name} archive does not match the pin; re-downloading\n`);
    await rm(destination, { force: true });
  }

  process.stderr.write(`c6: downloading ${pin.name} ${pin.commit}\n`);
  const response = await fetch(pin.tarball, {
    headers: { "user-agent": "contract-builder-c6-independent" },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(
      `cannot download ${pin.tarball}: HTTP ${response.status} ${response.statusText}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const temp = `${destination}.tmp`;
  await writeFile(temp, bytes);
  const actual = sha256Hex(bytes);
  if (actual !== pin.tarballSha256) {
    await rm(temp, { force: true });
    throw new Error(
      `sha256 mismatch for ${pin.tarball}: expected ${pin.tarballSha256}, got ${actual}; re-pin and update the expected hash`,
    );
  }
  await rename(temp, destination);
  return destination;
}

async function listTar(archive: string, flag: string): Promise<string[]> {
  const outcome = await runCommand("tar", [flag, archive], {
    cwd: path.dirname(archive),
    env: { LC_ALL: "C" },
  });
  if (outcome.code !== 0) {
    throw new Error(
      `cannot list ${archive}: ${outcome.error ?? `tar exited ${String(outcome.code)}`}\n${tail(outcome.stderr)}`,
    );
  }
  return outcome.stdout.split("\n").filter((line) => line.length > 0);
}

/**
 * A pinned archive is extracted with `--strip-components=1`. Reject absolute
 * paths and parent-directory entries before extraction, and reject entry types
 * other than regular files, directories and symlinks. Symbolic links are allowed
 * because the pinned test corpus carries deliberate fixtures, but an absolute
 * link target is rejected here and every link is containment-checked after
 * extraction. Hard links are not needed by the pinned archives and fail closed.
 */
async function assertArchiveSafe(archive: string): Promise<void> {
  for (const name of await listTar(archive, "-tzf")) {
    if (name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(name)) {
      throw new Error(`archive contains an absolute path: ${name}`);
    }
    if (name.split(/[\\/]/).includes("..")) {
      throw new Error(`archive contains a parent-directory entry: ${name}`);
    }
  }
  for (const line of await listTar(archive, "-tvzf")) {
    const type = line.charAt(0);
    if (line.includes(" link to ")) {
      throw new Error(
        `archive contains a hard link, only regular files, directories and contained symlinks are allowed: ${line.slice(0, 200)}`,
      );
    }
    if (type !== "-" && type !== "d" && type !== "l") {
      const kind = type === "h" ? "a hard link" : `entry type ${JSON.stringify(type)}`;
      throw new Error(
        `archive contains ${kind}, only regular files, directories and contained symlinks are allowed: ${line.slice(0, 200)}`,
      );
    }
    if (type === "l") {
      const target = line.split(" -> ").pop();
      if (target !== undefined && (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target))) {
        throw new Error(`archive symbolic link has an absolute target: ${line.slice(0, 200)}`);
      }
    }
  }
}

/** Re-check the extracted tree: contained symlinks, regular files/directories only. */
async function assertExtractedTree(destination: string): Promise<void> {
  const root = await realpath(destination);
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const relative = prefix.length === 0 ? name : `${prefix}/${name}`;
      const full = path.join(directory, name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) {
        const target = await readlink(full);
        if (target.startsWith("/") || /^[A-Za-z]:[\\/]/.test(target)) {
          throw new Error(
            `archive extraction created a symbolic link with an absolute target: ${relative} -> ${target}`,
          );
        }
        const resolved = path.resolve(directory, target);
        const within = path.relative(root, resolved);
        if (within.startsWith("..") || path.isAbsolute(within)) {
          throw new Error(
            `archive extraction created a symbolic link that escapes its destination: ${relative} -> ${target}`,
          );
        }
        continue;
      }
      if (info.isDirectory()) {
        await walk(full, relative);
        continue;
      }
      if (!info.isFile()) {
        throw new Error(`archive extraction created a non-regular file: ${relative}`);
      }
      const resolved = await realpath(full);
      if (resolved !== path.join(root, relative)) {
        throw new Error(`archive extraction escaped its destination: ${relative}`);
      }
    }
  };
  await walk(root, "");
}

/** Exported for the hostile-archive tests; the builder is its only production caller. */
export async function extractArchive(archive: string, destination: string): Promise<void> {
  await assertArchiveSafe(archive);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const outcome = await runCommand(
    "tar",
    ["xzf", archive, "-C", destination, "--strip-components=1"],
    { cwd: destination },
  );
  if (outcome.code !== 0) {
    throw new Error(
      `cannot extract ${archive}: ${outcome.error ?? `tar exited ${String(outcome.code)}`}\n${tail(outcome.stderr)}`,
    );
  }
  await assertExtractedTree(destination);
}

interface PreparedVerifier {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

interface RunContext {
  readonly outDir: string;
  readonly packageDir: string;
  readonly policyPath: string;
  readonly now: string;
}

async function prepareIndependent(
  pin: IndependentPin,
  context: RunContext,
): Promise<PreparedVerifier> {
  const tarballDir = path.join(context.outDir, "tarballs");
  const buildRoot = path.join(context.outDir, "build");
  const cacheRoot = path.join(context.outDir, "cache");
  const tempRoot = path.join(context.outDir, "tmp");
  await mkdir(tarballDir, { recursive: true });
  await mkdir(buildRoot, { recursive: true });
  await mkdir(cacheRoot, { recursive: true });
  await mkdir(tempRoot, { recursive: true });

  const archive = await fetchArchive(pin, tarballDir);
  const sourceDir = path.join(buildRoot, pin.name);
  await extractArchive(archive, sourceDir);

  if (pin.name === "rust") {
    const cargoHome = path.join(cacheRoot, "cargo-home");
    const targetDir = path.join(buildRoot, "rs-target");
    await mkdir(cargoHome, { recursive: true });
    const outcome = await runCommand("cargo", ["build", "--release", "--offline"], {
      cwd: sourceDir,
      env: {
        CARGO_HOME: cargoHome,
        CARGO_TARGET_DIR: targetDir,
        TMPDIR: tempRoot,
      },
    });
    if (outcome.code !== 0) {
      throw new Error(
        `cargo build failed (${outcome.error ?? `exit ${String(outcome.code)}`})\n${tail(outcome.stderr)}`,
      );
    }
    return {
      command: path.join(targetDir, "release", "pap"),
      args: [],
      cwd: sourceDir,
      env: { TMPDIR: tempRoot },
    };
  }

  if (pin.name === "go") {
    const gocache = path.join(cacheRoot, "gocache");
    await mkdir(gocache, { recursive: true });
    const binary = path.join(buildRoot, "pap-go");
    // Hermetic: no toolchain switching and no module/toolchain download. The
    // pinned go.mod requires a Go >= 1.24.13; the CI runner has one.
    const outcome = await runCommand("go", ["build", "-o", binary, "."], {
      cwd: sourceDir,
      env: {
        GOCACHE: gocache,
        GOTOOLCHAIN: "local",
        GOPROXY: "off",
        TMPDIR: tempRoot,
      },
    });
    if (outcome.code !== 0) {
      throw new Error(
        `go build failed (${outcome.error ?? `exit ${String(outcome.code)}`})\n${tail(outcome.stderr)}`,
      );
    }
    return {
      command: binary,
      args: [],
      cwd: sourceDir,
      env: { TMPDIR: tempRoot },
    };
  }

  // Python: standard library only; run from the extracted tree.
  return {
    command: "python3",
    args: ["-m", "pap_verifier"],
    cwd: sourceDir,
    env: { PYTHONPATH: ".", TMPDIR: tempRoot },
  };
}

function verifierInvocation(
  prepared: PreparedVerifier,
  context: RunContext,
): {
  command: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
} {
  return {
    command: prepared.command,
    args: [
      ...prepared.args,
      "verify",
      context.packageDir,
      "--trust-policy",
      context.policyPath,
      "--format",
      "json",
      "--now",
      context.now,
    ],
    cwd: prepared.cwd,
    env: prepared.env,
  };
}

interface ReferenceInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

function referenceInvocation(context: RunContext): ReferenceInvocation {
  return {
    command: process.execPath,
    args: [
      path.join(REPO_ROOT, "pap", "src", "cli.ts"),
      "verify",
      context.packageDir,
      "--trust-policy",
      context.policyPath,
      "--format",
      "json",
      "--now",
      context.now,
    ],
    cwd: REPO_ROOT,
    env: {},
  };
}

interface PackageEntries {
  readonly files: Record<string, string>;
  readonly types: Record<string, string>;
}

async function listPackageEntries(packageDir: string, prefix = ""): Promise<PackageEntries> {
  const files: Record<string, string> = {};
  const types: Record<string, string> = {};
  const entries = await readdir(path.join(packageDir, prefix), {
    withFileTypes: true,
  });
  for (const entry of entries) {
    const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    const full = path.join(packageDir, relative);
    const info = await lstat(full);
    if (info.isDirectory()) {
      const nested = await listPackageEntries(packageDir, relative);
      Object.assign(files, nested.files);
      Object.assign(types, nested.types);
      continue;
    }
    types[relative] = info.isFile() ? "file" : info.isSymbolicLink() ? "symlink" : "other";
    if (info.isFile()) {
      files[relative] = await sha256File(full);
    }
  }
  const sorted = (record: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { files: sorted(files), types: sorted(types) };
}

export interface InputSnapshot {
  readonly packageFiles: Readonly<Record<string, string>>;
  /** lstat type per packaged path; a symlink swap keeps the same bytes but is not a file. */
  readonly packageFileTypes: Readonly<Record<string, string>>;
  readonly policySha256: string;
}

/** Hash the package tree and the run-local policy copy before any verifier runs. */
export async function snapshotInputs(
  packageDir: string,
  policyPath: string,
): Promise<InputSnapshot> {
  const packageEntries = await listPackageEntries(packageDir);
  return {
    packageFiles: packageEntries.files,
    packageFileTypes: packageEntries.types,
    policySha256: await sha256File(policyPath),
  };
}

async function setTreeMode(target: string, readOnly: boolean): Promise<void> {
  const info = await stat(target);
  if (info.isDirectory()) {
    for (const entry of await readdir(target)) {
      await setTreeMode(path.join(target, entry), readOnly);
    }
    await chmod(target, readOnly ? 0o555 : 0o755);
    return;
  }
  if (info.isFile()) {
    await chmod(target, readOnly ? 0o444 : 0o644);
  }
}

/**
 * Make the packaged bytes and the run-local policy copy read-only. This is a
 * defence-in-depth measure: the owner can still chmod them back, which is why
 * `verifyInputsUnchanged` re-checks the hashes after every verifier.
 */
export async function makeInputsReadOnly(packageDir: string, policyPath: string): Promise<void> {
  await setTreeMode(packageDir, true);
  await chmod(policyPath, 0o444);
  await chmod(path.dirname(policyPath), 0o555);
}

/** Restore owner write permissions so the output directory can be cleaned up. */
export async function makeInputsWritable(packageDir: string, policyPath: string): Promise<void> {
  await chmod(path.dirname(policyPath), 0o755);
  await chmod(policyPath, 0o644);
  await setTreeMode(packageDir, false);
}

/**
 * Compare the package tree and policy copy with the pre-run snapshot. Anything
 * added, removed or changed is a mutation; the caller fails the batch closed and
 * skips the remaining verifiers.
 */
export async function verifyInputsUnchanged(
  snapshot: InputSnapshot,
  packageDir: string,
  policyPath: string,
  label: string,
): Promise<string[]> {
  let current: InputSnapshot;
  try {
    current = await snapshotInputs(packageDir, policyPath);
  } catch (error) {
    return [
      `${label}: cannot re-read package/policy inputs after the verifier: ${messageOf(error)}`,
    ];
  }
  const problems: string[] = [];
  for (const [file, type] of Object.entries(snapshot.packageFileTypes)) {
    const observedType = current.packageFileTypes[file];
    if (observedType === undefined) {
      problems.push(`${label}: package file was removed: ${file}`);
    } else if (observedType !== type) {
      problems.push(`${label}: package file type changed: ${file} (${type} -> ${observedType})`);
    } else if (type !== "file") {
      problems.push(`${label}: package file is not a regular file: ${file} (${type})`);
    }
  }
  for (const [file, digest] of Object.entries(snapshot.packageFiles)) {
    const observed = current.packageFiles[file];
    if (observed !== undefined && observed !== digest) {
      problems.push(`${label}: package file was modified: ${file}`);
    }
  }
  for (const file of Object.keys(current.packageFileTypes)) {
    if (snapshot.packageFileTypes[file] === undefined) {
      problems.push(`${label}: package file was added: ${file}`);
    }
  }
  if (current.policySha256 !== snapshot.policySha256) {
    problems.push(`${label}: the run-local trust policy was modified`);
  }
  return problems;
}

interface CliOptions {
  readonly outDir: string;
  readonly now: string | null;
  readonly evidence: string | null;
  readonly help: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let outDir: string | undefined;
  let now: string | null = null;
  let evidence: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return { outDir: "", now, evidence, help: true };
    }
    const takeValue = (name: string): string => {
      const value = argv[index + 1];
      if (value === undefined || value.length === 0) {
        throw new Error(`${name} requires a value`);
      }
      index += 1;
      return value;
    };
    if (arg === "--out") {
      outDir = takeValue("--out");
      continue;
    }
    if (arg !== undefined && arg.startsWith("--out=")) {
      outDir = arg.slice("--out=".length);
      if (outDir.length === 0) throw new Error("--out requires a directory");
      continue;
    }
    if (arg === "--now") {
      now = takeValue("--now");
      continue;
    }
    if (arg === "--evidence") {
      evidence = takeValue("--evidence");
      continue;
    }
    throw new Error(`unknown argument: ${String(arg)}`);
  }
  if (outDir === undefined) throw new Error("--out is required");
  return { outDir, now, evidence, help: false };
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`c6: ${messageOf(error)}`);
    process.exitCode = 1;
    return;
  }
  if (options.help) {
    console.log(
      "Usage: bun run pipeline:independent --out <dir> [--now <rfc3339>] [--evidence <file>] (--now defaults to pipeline/pinned-now.txt)",
    );
    return;
  }

  const now = options.now ?? (await readPinnedNow());
  const outDir = path.resolve(options.outDir);
  assertOutsideRepository(outDir);
  const packageDir = path.join(outDir, "package");
  const policySource = path.join(REPO_ROOT, "pipeline", "policy", "core000-trust-policy.json");
  const policyDir = path.join(outDir, "policy");
  const policyPath = path.join(policyDir, "core000-trust-policy.json");
  const reportsDir = path.join(outDir, "reports");
  await mkdir(reportsDir, { recursive: true });
  await mkdir(path.join(outDir, "tmp"), { recursive: true });
  await mkdir(policyDir, { recursive: true });
  await copyFile(policySource, policyPath);

  process.stderr.write(`c6: packing CORE-000 once into ${packageDir}\n`);
  await rm(packageDir, { recursive: true, force: true });
  await packCore000({ outDir: packageDir });

  const manifestText = new TextDecoder("utf-8").decode(
    await readBytes(path.join(packageDir, "assurance-package.json")),
  );
  const snapshot = await snapshotInputs(packageDir, policyPath);
  const context: RunContext = {
    outDir,
    packageDir,
    policyPath,
    now,
  };

  const extraProblems: string[] = [];
  const mutationProblems: string[] = [];
  let inputsReadOnly = false;
  try {
    await makeInputsReadOnly(packageDir, policyPath);
    inputsReadOnly = true;
  } catch (error) {
    extraProblems.push(`cannot make package/policy inputs read-only: ${messageOf(error)}`);
  }

  const executions: VerifierExecution[] = [];
  let mutated = false;

  const recordVerifier = async (
    name: VerifierName,
    invocation: {
      readonly command: string;
      readonly args: readonly string[];
      readonly cwd: string;
      readonly env: Readonly<Record<string, string>>;
    },
  ): Promise<void> => {
    const outcome = await runCommand(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
    });
    executions.push({
      name,
      exitCode: outcome.code,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      ...(outcome.error === undefined ? {} : { error: outcome.error }),
    });
    const changes = await verifyInputsUnchanged(snapshot, packageDir, policyPath, name);
    if (changes.length > 0) {
      mutated = true;
      mutationProblems.push(...changes);
    }
  };

  try {
    process.stderr.write("c6: running the reference verifier\n");
    await recordVerifier("reference", referenceInvocation(context));
    for (const pin of INDEPENDENT_PINS) {
      if (mutated) {
        executions.push({
          name: pin.name,
          exitCode: null,
          stdout: "",
          stderr: "",
          error: "skipped after an earlier verifier modified package or policy inputs",
        });
        continue;
      }
      process.stderr.write(`c6: preparing the ${pin.name} verifier\n`);
      let prepared: PreparedVerifier;
      try {
        prepared = await prepareIndependent(pin, context);
      } catch (error) {
        executions.push({
          name: pin.name,
          exitCode: null,
          stdout: "",
          stderr: "",
          error: `cannot build the pinned ${pin.name} verifier: ${messageOf(error)}`,
        });
        continue;
      }
      process.stderr.write(`c6: running the ${pin.name} verifier\n`);
      await recordVerifier(pin.name, verifierInvocation(prepared, context));
    }
  } finally {
    try {
      await makeInputsWritable(packageDir, policyPath);
    } catch (error) {
      extraProblems.push(
        `cannot restore write permissions on package/policy inputs: ${messageOf(error)}`,
      );
    }
  }

  if (mutated) {
    console.error("c6: package or policy inputs changed during verifier execution; failing closed");
    for (const problem of mutationProblems) console.error(`  - ${problem}`);
  }

  for (const execution of executions) {
    if (execution.stdout.length === 0) continue;
    await writeFile(path.join(reportsDir, `${execution.name}.json`), execution.stdout);
  }

  const outcome = assembleBatch({
    now,
    packageDir,
    policyPath,
    manifestText,
    packageFileDigests: snapshot.packageFiles,
    packageFileTypes: snapshot.packageFileTypes,
    executions,
    extraProblems,
    inputIntegrity: {
      readOnlyDuringRuns: inputsReadOnly,
      mutations: mutationProblems,
    },
  });
  await writeFile(path.join(outDir, "batch.json"), `${JSON.stringify(outcome.batch, null, 2)}\n`);

  if (outcome.problems.length > 0) {
    console.error("c6: batch is NOT valid:");
    for (const problem of outcome.problems) console.error(`  - ${problem}`);
  } else {
    console.log(
      `c6: batch ok: ${outcome.batch.package.identity} at ${outcome.batch.contractBuilderCommit}`,
    );
    for (const entry of outcome.batch.verifiers) {
      console.log(
        `  ${entry.verifier.padEnd(9)} ${String(entry.verdict).padEnd(12)} exit ${String(entry.exitCode).padEnd(2)} ${entry.reportSha256 ?? "-"}`,
      );
    }
  }

  if (options.evidence !== null) {
    if (!outcome.batch.ok) {
      console.error(`c6: refusing to write ${options.evidence} from an invalid batch`);
    } else {
      const evidencePath = path.resolve(options.evidence);
      await writeFile(evidencePath, renderEvidenceMarkdown(outcome.batch));
      console.log(`c6: wrote evidence record ${evidencePath}`);
    }
  }

  process.exitCode = outcome.batch.ok ? 0 : 1;
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(`c6: ${messageOf(error)}`);
    process.exitCode = 1;
  });
}
