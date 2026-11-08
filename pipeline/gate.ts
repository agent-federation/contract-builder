/**
 * `bun run gate:core000 --report <report.json> --policy <policy.json> --out <decision.json>`
 *
 * The CORE-000 acceptance gate. It consumes only the verifier's JSON report and
 * the operator's trust policy; it never imports `pap/src`, because the report is
 * the verifier's public boundary and an independent verifier that emits the same
 * Appendix C document must be accepted too.
 *
 * The JSON schemas are read from `pap/schemas/` as data and validated with Ajv.
 * That is a deliberate alternative to importing the verifier's typed decoder:
 * the gate checks the contract, not the reference implementation.
 *
 * `evaluatedAt` is copied from the report, never read from the clock. The
 * decision is JCS canonical JSON plus one LF, so a fixed report and policy
 * produce byte-identical output. `reportDigest` is the SHA-256 of the exact
 * report file bytes (verifiable with `sha256sum`); `policyDigest` is the PAP
 * Appendix B digest `H("pap.trust-policy.v1", JCS(policy))`, which is also the
 * value the verifier records in `report.policy.digest`.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import { canonicalJson, canonicalJsonBytes, domainHash, utf8 } from "./mapping.js";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The CORE-000 policy is the repository policy; CI may still pass an explicit path. */
export const DEFAULT_POLICY_PATH = path.join(
  REPO_ROOT,
  "pipeline",
  "policy",
  "core000-trust-policy.json",
);

const SCHEMA_DIR = path.join(REPO_ROOT, "pap", "schemas");
const REPORT_SCHEMA_ID = "urn:pap:0.1:verification-report";
const POLICY_SCHEMA_ID = "urn:pap:0.1:trust-policy";

export type GateDecision = "ACCEPTED" | "NOT_ACCEPTED";

export interface AcceptanceDecision {
  readonly packageIdentity: string | null;
  readonly policyId: string | null;
  readonly policyDigest: string | null;
  readonly reportDigest: string | null;
  readonly verdict: string | null;
  readonly decision: GateDecision;
  readonly reasons: readonly string[];
  readonly verifier: {
    readonly id: string | null;
    readonly version: string | null;
    readonly implementationDigest: string | null;
  };
  readonly evaluatedAt: string | null;
}

export interface GateOptions {
  readonly reportPath: string;
  /** Defaults to the checked-in CORE-000 policy. */
  readonly policyPath?: string;
}

export interface GateResult {
  readonly decision: AcceptanceDecision;
  readonly bytes: Uint8Array;
  /** 0 for ACCEPTED, 1 for NOT_ACCEPTED. */
  readonly exitCode: 0 | 1;
}

interface ValidateFunction {
  (value: unknown): boolean;
  errors?: readonly AjvError[] | null;
}

interface AjvError {
  readonly instancePath?: string;
  readonly message?: string;
}

interface AjvInstance {
  addSchema(schema: object): AjvInstance;
  getSchema(reference: string): ValidateFunction | undefined;
}

const Ajv2020 = Ajv2020Module as unknown as new (options: Record<string, unknown>) => AjvInstance;

interface SchemaValidators {
  readonly report: ValidateFunction;
  readonly policy: ValidateFunction;
}

let validatorsPromise: Promise<SchemaValidators> | null = null;

/** Compile the Appendix B/C schemas once per process; no verifier code is loaded. */
function loadValidators(): Promise<SchemaValidators> {
  validatorsPromise ??= (async () => {
    const ajv = new Ajv2020({
      strict: false,
      validateFormats: false,
      allErrors: true,
    });
    for (const name of ["check-record", "verification-report", "trust-policy"]) {
      const schema = JSON.parse(
        await readFile(path.join(SCHEMA_DIR, `${name}.schema.json`), "utf8"),
      ) as object;
      ajv.addSchema(schema);
    }
    const report = ajv.getSchema(REPORT_SCHEMA_ID);
    const policy = ajv.getSchema(POLICY_SCHEMA_ID);
    if (report === undefined || policy === undefined) {
      throw new Error("cannot compile the PAP report and trust-policy schemas");
    }
    return { report, policy };
  })();
  return validatorsPromise;
}

interface FileRead {
  readonly bytes: Uint8Array | null;
  readonly value: unknown;
  /** True when the file was read and parsed as JSON, even when the value is `null`. */
  readonly ok: boolean;
  readonly error: string | null;
}

async function readJsonFile(file: string, label: string): Promise<FileRead> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(file));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        bytes: null,
        value: null,
        ok: false,
        error: `${label} file is missing: ${file}`,
      };
    }
    return {
      bytes: null,
      value: null,
      ok: false,
      error: `cannot read ${label} file ${file}: ${messageOf(error)}`,
    };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    return {
      bytes,
      value: null,
      ok: false,
      error: `${label} is not valid UTF-8: ${messageOf(error)}`,
    };
  }
  try {
    const value = JSON.parse(text);
    // `JSON.parse` keeps the last duplicate member, so a forged report could
    // hide a FAIL behind a later PASS. Reject duplicates before trusting it.
    assertNoDuplicateMembers(text);
    return { bytes, value, ok: true, error: null };
  } catch (error) {
    let detail = `is not valid JSON: ${messageOf(error)}`;
    if (error instanceof DuplicateMemberError) {
      detail = `contains ${error.message}`;
    } else if (error instanceof JsonNestingError) {
      detail = error.message;
    }
    return { bytes, value: null, ok: false, error: `${label} ${detail}` };
  }
}

class DuplicateMemberError extends Error {
  constructor(readonly member: string) {
    super(`duplicate JSON object member ${JSON.stringify(member)}`);
    this.name = "DuplicateMemberError";
  }
}

class JsonNestingError extends Error {
  constructor(depth: number) {
    super(`JSON nesting exceeds the gate limit of ${depth} levels`);
    this.name = "JsonNestingError";
  }
}

/** Deeper than any PAP report the gate should accept; rejects a stack-defeating scan. */
const MAX_JSON_DEPTH = 512;

/**
 * Reject duplicate object member names in an already-parsed JSON document.
 * `JSON.parse` silently keeps the last value, which would let a forged report
 * shadow `"verdict": "FAIL"` with `"verdict": "PASS"`. Keys are compared after
 * decoding escapes, so `"\u0076erdict"` and `"verdict"` collide too.
 *
 * The scan is recursive with an explicit depth budget: `JSON.parse` is
 * iterative, so a deeply nested report must not turn a duplicate check into an
 * opaque "Maximum call stack size exceeded" JSON error.
 */
function assertNoDuplicateMembers(text: string): void {
  let index = 0;

  function skipWhitespace(): void {
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
        return;
      }
      index += 1;
    }
  }

  function expectLiteral(literal: string): void {
    if (text.slice(index, index + literal.length) !== literal) {
      throw new Error(`expected ${literal}`);
    }
    index += literal.length;
  }

  function skipString(): { readonly start: number; readonly end: number } {
    const start = index;
    if (text[index] !== '"') throw new Error("expected a JSON string");
    index += 1;
    while (index < text.length) {
      const char = text[index];
      if (char === '"') {
        index += 1;
        return { start, end: index };
      }
      if (char === "\\") {
        index += 2;
        continue;
      }
      index += 1;
    }
    throw new Error("unterminated JSON string");
  }

  function skipNumber(): void {
    while (index < text.length) {
      const code = text.charCodeAt(index);
      const partOfNumber =
        (code >= 0x30 && code <= 0x39) ||
        code === 0x2b || // +
        code === 0x2d || // -
        code === 0x2e || // .
        code === 0x45 || // E
        code === 0x65; // e
      if (!partOfNumber) return;
      index += 1;
    }
  }

  function skipObject(depth: number): void {
    index += 1; // {
    skipWhitespace();
    if (text[index] === "}") {
      index += 1;
      return;
    }
    const names = new Set<string>();
    while (true) {
      skipWhitespace();
      const raw = skipString();
      const name = JSON.parse(text.slice(raw.start, raw.end)) as string;
      if (names.has(name)) throw new DuplicateMemberError(name);
      names.add(name);
      skipWhitespace();
      if (text[index] !== ":") throw new Error("expected ':'");
      index += 1;
      skipValue(depth + 1);
      skipWhitespace();
      if (text[index] === ",") {
        index += 1;
        continue;
      }
      if (text[index] === "}") {
        index += 1;
        return;
      }
      throw new Error("expected ',' or '}'");
    }
  }

  function skipArray(depth: number): void {
    index += 1; // [
    skipWhitespace();
    if (text[index] === "]") {
      index += 1;
      return;
    }
    while (true) {
      skipValue(depth + 1);
      skipWhitespace();
      if (text[index] === ",") {
        index += 1;
        skipWhitespace();
        continue;
      }
      if (text[index] === "]") {
        index += 1;
        return;
      }
      throw new Error("expected ',' or ']'");
    }
  }

  function skipValue(depth: number): void {
    if (depth > MAX_JSON_DEPTH) throw new JsonNestingError(MAX_JSON_DEPTH);
    skipWhitespace();
    const char = text[index];
    if (char === "{") {
      skipObject(depth);
      return;
    }
    if (char === "[") {
      skipArray(depth);
      return;
    }
    if (char === '"') {
      skipString();
      return;
    }
    if (char === "t") {
      expectLiteral("true");
      return;
    }
    if (char === "f") {
      expectLiteral("false");
      return;
    }
    if (char === "n") {
      expectLiteral("null");
      return;
    }
    skipNumber();
  }

  skipWhitespace();
  skipValue(0);
  skipWhitespace();
  if (index !== text.length) throw new Error("trailing JSON content");
}

interface CheckResult {
  readonly checkId: string;
  readonly outcome: "PASS" | "FAIL" | "UNSUPPORTED" | "NOT_EVALUATED";
  readonly required?: boolean;
}

interface SignatureResult {
  readonly path: string;
  readonly validity: "VALID" | "INVALID" | "NOT_EVALUATED";
  readonly signerIdentity?: string;
  readonly policyDecision?: string;
}

interface ReportView {
  readonly reportVersion: string;
  readonly verifier: {
    readonly id: string;
    readonly version: string;
    readonly implementationDigest: string;
  };
  readonly package: {
    readonly identity: string | null;
    readonly papVersion?: string | null;
  };
  readonly policy: {
    readonly id?: string | null;
    readonly digest?: string | null;
    readonly state: "FRESH" | "STALE" | "ABSENT";
  };
  readonly evaluatedAt: string;
  readonly identities: {
    readonly packageIdentity: string | null;
  };
  readonly dimensions: {
    readonly integrity: {
      readonly package: "PASS" | "FAIL" | "NOT_EVALUATED";
      readonly artifacts: "PASS" | "FAIL" | "NOT_EVALUATED";
    };
    readonly sources: {
      readonly integrity: "PASS" | "FAIL" | "UNAVAILABLE" | "NOT_EVALUATED";
      readonly availability: "PASS" | "UNAVAILABLE" | "NOT_APPLICABLE";
    };
    readonly signature: {
      readonly validity: "VALID" | "INVALID" | "NOT_EVALUATED" | "NOT_APPLICABLE";
      readonly signatures?: readonly SignatureResult[];
    };
    readonly trust: {
      readonly signerIdentity: string;
      readonly policyDecision: string;
      readonly checkerRecognition: string;
      readonly profileRecognition: string;
    };
    readonly checks: { readonly results: readonly CheckResult[] };
    readonly humanReview: { readonly status: string };
  };
  readonly coverage: {
    readonly requiredChecks: readonly string[];
    readonly checksFailed: number;
    readonly checksUnsupported: number;
    readonly checksNotEvaluated: number;
    readonly requiredDimensions: readonly string[];
    readonly full: boolean;
  };
  readonly limitations: readonly { readonly code: string; readonly detail: string }[];
  readonly verdict: string;
  readonly diagnostics: readonly {
    readonly code: string;
    readonly severity: string;
    readonly scope: string;
    readonly message: string;
  }[];
}

interface PolicyView {
  readonly trustPolicyVersion: string;
  readonly id: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly signature: { readonly mode: "disabled" | "optional" | "required" };
  readonly keys: readonly unknown[];
  readonly signers: readonly unknown[];
  readonly checkers: readonly unknown[];
  readonly profiles: readonly unknown[];
  readonly requiredChecks: readonly string[];
  readonly requiredDimensions: readonly string[];
  readonly humanReview: {
    readonly required: boolean;
    readonly maxAgeSeconds: number;
  };
}

interface EvaluationInput {
  readonly reportRead: FileRead;
  readonly policyRead: FileRead;
  readonly validators: SchemaValidators | null;
  readonly schemaError: string | null;
}

/**
 * Evaluate one report/policy pair. Internal so the CLI remains the only public
 * surface that touches files; tests exercise the same path through it.
 */
function evaluate(input: EvaluationInput): AcceptanceDecision {
  const reasons = new Set<string>();
  const reportDigest =
    input.reportRead.bytes === null ? null : sha256Digest(input.reportRead.bytes);

  if (input.reportRead.error !== null) reasons.add(input.reportRead.error);
  if (input.policyRead.error !== null) reasons.add(input.policyRead.error);
  if (input.schemaError !== null) {
    reasons.add(`cannot load the PAP Appendix B/C schemas: ${input.schemaError}`);
  }

  let report: ReportView | null = null;
  if (input.reportRead.ok && input.validators !== null) {
    if (input.validators.report(input.reportRead.value)) {
      report = input.reportRead.value as ReportView;
      // The schema declares `format: date-time`; ajv-formats is not a dependency,
      // so the gate enforces the RFC 3339 instant itself.
      if (!isRfc3339(report.evaluatedAt)) {
        reasons.add(`report evaluatedAt is not an RFC 3339 instant: ${quote(report.evaluatedAt)}`);
      }
    } else {
      reasons.add(
        `report does not match the PAP v0.1 verification-report schema: ${formatSchemaErrors(
          input.validators.report.errors,
        )}`,
      );
    }
  }

  let policy: PolicyView | null = null;
  let policyDigest: string | null = null;
  if (input.policyRead.ok && input.validators !== null) {
    if (input.validators.policy(input.policyRead.value)) {
      const value = input.policyRead.value;
      try {
        policy = value as PolicyView;
        policyDigest = domainHash("pap.trust-policy.v1", canonicalJsonBytes(value));
        const issuedAt = parseInstant(policy.issuedAt);
        const expiresAt = parseInstant(policy.expiresAt);
        if (issuedAt === null || expiresAt === null) {
          reasons.add("trust policy issuedAt/expiresAt is not an RFC 3339 instant");
        } else if (issuedAt > expiresAt) {
          reasons.add(
            `trust policy issuedAt ${quote(policy.issuedAt)} is after expiresAt ${quote(policy.expiresAt)}`,
          );
        }
      } catch (error) {
        policy = null;
        policyDigest = null;
        reasons.add(`trust policy cannot be canonicalized: ${messageOf(error)}`);
      }
    } else {
      reasons.add(
        `trust policy does not match the PAP v0.1 Appendix B schema: ${formatSchemaErrors(
          input.validators.policy.errors,
        )}`,
      );
    }
  }

  if (report !== null) {
    if (policy !== null && policyDigest !== null) {
      evaluateReport(report, policy, policyDigest, reasons);
    } else if (input.policyRead.ok) {
      reasons.add("no valid trust policy was supplied");
    } else if (input.policyRead.error === null) {
      reasons.add("no trust policy was supplied");
    }
  }

  const sortedReasons = [...reasons].sort(compareStrings);
  const decision: GateDecision = sortedReasons.length === 0 ? "ACCEPTED" : "NOT_ACCEPTED";

  return {
    packageIdentity: report?.identities.packageIdentity ?? report?.package.identity ?? null,
    policyId: policy?.id ?? null,
    policyDigest,
    reportDigest,
    verdict: report?.verdict ?? null,
    decision,
    reasons: sortedReasons,
    verifier: {
      id: report?.verifier.id ?? null,
      version: report?.verifier.version ?? null,
      implementationDigest: report?.verifier.implementationDigest ?? null,
    },
    evaluatedAt: report?.evaluatedAt ?? null,
  };
}

function evaluateReport(
  report: ReportView,
  policy: PolicyView,
  policyDigest: string,
  reasons: Set<string>,
): void {
  if (report.verdict !== "PASS") {
    reasons.add(`verifier verdict is ${report.verdict}, expected PASS`);
  }
  if (report.coverage.full !== true) {
    reasons.add("coverage.full is false; the verifier did not evaluate every required check");
  }
  for (const [label, count] of [
    ["coverage.checksFailed", report.coverage.checksFailed],
    ["coverage.checksUnsupported", report.coverage.checksUnsupported],
    ["coverage.checksNotEvaluated", report.coverage.checksNotEvaluated],
  ] as const) {
    // Ajv's `integer` accepts `Infinity` (JSON `1e999`), so do not trust the
    // schema for the counters the gate compares against zero.
    if (!Number.isFinite(count)) {
      reasons.add(`${label} is not a finite number: ${String(count)}`);
    } else if (count > 0) {
      reasons.add(`${label} is ${count}, expected 0`);
    }
  }

  if (report.policy.state !== "FRESH") {
    reasons.add(`report policy state is ${report.policy.state}, expected FRESH`);
  }
  if (report.policy.id !== policy.id) {
    reasons.add(
      `policy id mismatch: report ${quote(report.policy.id)} != policy ${quote(policy.id)}`,
    );
  }
  if (report.policy.digest !== policyDigest) {
    reasons.add(
      `policy digest mismatch: report ${quote(report.policy.digest)} != policy ${policyDigest}`,
    );
  }

  // `report.policy.state` is a verifier label; re-derive freshness from the
  // copied report timestamp with PAP's inclusive interval semantics and no
  // clock access. A forged FRESH label must not accept an out-of-window report.
  const evaluatedAt = parseInstant(report.evaluatedAt);
  const issuedAt = parseInstant(policy.issuedAt);
  const expiresAt = parseInstant(policy.expiresAt);
  if (evaluatedAt !== null && issuedAt !== null && expiresAt !== null) {
    if (evaluatedAt < issuedAt) {
      reasons.add(
        `report evaluatedAt ${quote(report.evaluatedAt)} is before the trust policy issuedAt ${quote(policy.issuedAt)}`,
      );
    } else if (evaluatedAt > expiresAt) {
      reasons.add(
        `report evaluatedAt ${quote(report.evaluatedAt)} is after the trust policy expiresAt ${quote(policy.expiresAt)}`,
      );
    }
  }

  evaluateNegativeStates(report, reasons);
  evaluateCoverage(report, policy, reasons);

  for (const dimension of policy.requiredDimensions) {
    if (!isDimensionPositive(dimension, report.dimensions)) {
      reasons.add(
        `required dimension ${dimension} is not positive (${describeDimension(
          dimension,
          report.dimensions,
        )})`,
      );
    }
  }

  for (const checkId of policy.requiredChecks) {
    const result = report.dimensions.checks.results.find(
      (candidate) => candidate.checkId === checkId,
    );
    if (result === undefined) {
      reasons.add(`policy-required check ${checkId} is missing from the report`);
    } else if (result.outcome !== "PASS") {
      reasons.add(`policy-required check ${checkId} is ${result.outcome}, expected PASS`);
    }
  }

  evaluateTrustExpectations(report, policy, reasons);

  if (policy.humanReview.required) {
    if (report.dimensions.humanReview.status !== "PASS") {
      reasons.add(
        `policy requires human review but report humanReview.status is ${report.dimensions.humanReview.status}`,
      );
    }
  }
}

/** Reject any explicit negative state, even when a verdict was forged to PASS. */
function evaluateNegativeStates(report: ReportView, reasons: Set<string>): void {
  const { dimensions } = report;
  if (dimensions.integrity.package === "FAIL") {
    reasons.add("integrity.package is FAIL");
  }
  if (dimensions.integrity.artifacts === "FAIL") {
    reasons.add("integrity.artifacts is FAIL");
  }
  if (dimensions.sources.integrity === "FAIL") {
    reasons.add("sources.integrity is FAIL");
  }
  if (dimensions.sources.availability === "UNAVAILABLE") {
    reasons.add("sources.availability is UNAVAILABLE");
  }
  if (dimensions.signature.validity === "INVALID") {
    reasons.add("signature.validity is INVALID");
  }
  for (const signature of dimensions.signature.signatures ?? []) {
    if (signature.validity === "INVALID") {
      reasons.add(`signature ${signature.path} is INVALID`);
    }
    if (signature.signerIdentity === "UNTRUSTED") {
      reasons.add(`signature ${signature.path} signer is UNTRUSTED`);
    }
    if (signature.policyDecision === "REJECTED" || signature.policyDecision === "STALE") {
      reasons.add(`signature ${signature.path} policy decision is ${signature.policyDecision}`);
    }
  }
  if (
    dimensions.trust.signerIdentity === "UNTRUSTED" ||
    dimensions.trust.signerIdentity === "UNKNOWN"
  ) {
    reasons.add(`trust.signerIdentity is ${dimensions.trust.signerIdentity}`);
  }
  if (
    dimensions.trust.policyDecision === "REJECTED" ||
    dimensions.trust.policyDecision === "STALE"
  ) {
    reasons.add(`trust.policyDecision is ${dimensions.trust.policyDecision}`);
  }
  for (const [label, value] of [
    ["trust.checkerRecognition", dimensions.trust.checkerRecognition],
    ["trust.profileRecognition", dimensions.trust.profileRecognition],
  ] as const) {
    if (value === "UNSUPPORTED" || value === "UNTRUSTED") {
      reasons.add(`${label} is ${value}`);
    }
  }
  for (const result of dimensions.checks.results) {
    if (result.outcome === "FAIL" || result.outcome === "UNSUPPORTED") {
      reasons.add(`check ${result.checkId} is ${result.outcome}`);
    } else if (result.outcome === "NOT_EVALUATED" && result.required !== false) {
      reasons.add(`required check ${result.checkId} is NOT_EVALUATED`);
    }
  }
  const limitStopped = [...report.diagnostics, ...report.limitations].some(
    (entry) => entry.code === "pap.package.limit-exceeded",
  );
  if (limitStopped) {
    reasons.add("report records limit-stopped scope (pap.package.limit-exceeded)");
  }
}

/** The report's own coverage set must describe the policy the gate is enforcing. */
function evaluateCoverage(report: ReportView, policy: PolicyView, reasons: Set<string>): void {
  const coverageChecks = new Set(report.coverage.requiredChecks);
  for (const checkId of policy.requiredChecks) {
    if (!coverageChecks.has(checkId)) {
      reasons.add(`report coverage does not include policy-required check ${checkId}`);
    }
  }
  const coverageDimensions = new Set(report.coverage.requiredDimensions);
  const expectedDimensions = [
    ...policy.requiredDimensions,
    ...(policy.signature.mode === "required" ? ["signature", "trust"] : []),
    ...(policy.humanReview.required ? ["humanReview"] : []),
  ];
  for (const dimension of new Set(expectedDimensions)) {
    if (!coverageDimensions.has(dimension)) {
      reasons.add(`report coverage does not include policy-required dimension ${dimension}`);
    }
  }
}

function evaluateTrustExpectations(
  report: ReportView,
  policy: PolicyView,
  reasons: Set<string>,
): void {
  const { signature, trust } = report.dimensions;
  const mode = policy.signature.mode;
  if (mode === "disabled") {
    // Disabled means the policy requires no signature/trust evidence. A negative
    // state is already reported by evaluateNegativeStates; a NOT_APPLICABLE state
    // is the expected outcome and is accepted.
    return;
  }
  if (mode === "required") {
    if (signature.validity !== "VALID") {
      reasons.add(
        `policy requires a signature but report signature.validity is ${signature.validity}`,
      );
    }
    if (trust.signerIdentity !== "TRUSTED") {
      reasons.add(
        `policy requires a trusted signer but report trust.signerIdentity is ${trust.signerIdentity}`,
      );
    }
    if (trust.policyDecision !== "ACCEPTED") {
      reasons.add(
        `policy requires an accepted policy decision but report trust.policyDecision is ${trust.policyDecision}`,
      );
    }
    for (const [label, value] of [
      ["trust.checkerRecognition", trust.checkerRecognition],
      ["trust.profileRecognition", trust.profileRecognition],
    ] as const) {
      if (value !== "PASS" && value !== "NOT_APPLICABLE") {
        reasons.add(`policy requires recognized ${label}, but it is ${value}`);
      }
    }
    return;
  }
  // Optional: an unsigned package is fine, but any evaluated signature must be valid.
  if (signature.validity !== "VALID" && signature.validity !== "NOT_APPLICABLE") {
    reasons.add(
      `policy makes signatures optional but report signature.validity is ${signature.validity}`,
    );
  }
  if (trust.signerIdentity !== "TRUSTED" && trust.signerIdentity !== "NOT_APPLICABLE") {
    reasons.add(
      `policy makes trust optional but report trust.signerIdentity is ${trust.signerIdentity}`,
    );
  }
  if (trust.policyDecision !== "ACCEPTED" && trust.policyDecision !== "NOT_EVALUATED") {
    reasons.add(
      `policy makes trust optional but report trust.policyDecision is ${trust.policyDecision}`,
    );
  }
}

/** Mirror of the verifier's I3 "applicable positive state" rule (RFC §4.3.4). */
function isDimensionPositive(dimension: string, dimensions: ReportView["dimensions"]): boolean {
  switch (dimension) {
    case "integrity":
      return dimensions.integrity.package === "PASS" && dimensions.integrity.artifacts === "PASS";
    case "integrity.package":
      return dimensions.integrity.package === "PASS";
    case "integrity.artifacts":
      return dimensions.integrity.artifacts === "PASS";
    case "sources":
      return (
        dimensions.sources.integrity === "PASS" &&
        isPositiveAvailability(dimensions.sources.availability)
      );
    case "sources.integrity":
      return dimensions.sources.integrity === "PASS";
    case "sources.availability":
      return isPositiveAvailability(dimensions.sources.availability);
    case "signature":
    case "signature.validity":
      return isPositiveSignature(dimensions.signature.validity);
    case "trust":
      return (
        isPositiveSigner(dimensions.trust.signerIdentity) &&
        dimensions.trust.policyDecision === "ACCEPTED" &&
        isPositiveRecognition(dimensions.trust.checkerRecognition) &&
        isPositiveRecognition(dimensions.trust.profileRecognition)
      );
    case "trust.signerIdentity":
      return isPositiveSigner(dimensions.trust.signerIdentity);
    case "trust.policyDecision":
      return dimensions.trust.policyDecision === "ACCEPTED";
    case "trust.checkerRecognition":
      return isPositiveRecognition(dimensions.trust.checkerRecognition);
    case "trust.profileRecognition":
      return isPositiveRecognition(dimensions.trust.profileRecognition);
    case "checks":
      return dimensions.checks.results
        .filter((result) => result.required !== false)
        .every((result) => result.outcome === "PASS");
    case "humanReview":
      return (
        dimensions.humanReview.status === "PASS" ||
        dimensions.humanReview.status === "NOT_APPLICABLE"
      );
    default:
      return false;
  }
}

function isPositiveAvailability(value: string): boolean {
  return value === "PASS" || value === "NOT_APPLICABLE";
}

function isPositiveSignature(value: string): boolean {
  return value === "VALID" || value === "NOT_APPLICABLE";
}

function isPositiveSigner(value: string): boolean {
  return value === "TRUSTED" || value === "NOT_APPLICABLE";
}

function isPositiveRecognition(value: string): boolean {
  return value === "PASS" || value === "NOT_APPLICABLE";
}

function describeDimension(dimension: string, dimensions: ReportView["dimensions"]): string {
  switch (dimension) {
    case "integrity":
      return `integrity.package=${dimensions.integrity.package}, integrity.artifacts=${dimensions.integrity.artifacts}`;
    case "integrity.package":
      return `integrity.package=${dimensions.integrity.package}`;
    case "integrity.artifacts":
      return `integrity.artifacts=${dimensions.integrity.artifacts}`;
    case "sources":
      return `sources.integrity=${dimensions.sources.integrity}, sources.availability=${dimensions.sources.availability}`;
    case "sources.integrity":
      return `sources.integrity=${dimensions.sources.integrity}`;
    case "sources.availability":
      return `sources.availability=${dimensions.sources.availability}`;
    case "signature":
    case "signature.validity":
      return `signature.validity=${dimensions.signature.validity}`;
    case "trust":
      return `trust.signerIdentity=${dimensions.trust.signerIdentity}, trust.policyDecision=${dimensions.trust.policyDecision}, trust.checkerRecognition=${dimensions.trust.checkerRecognition}, trust.profileRecognition=${dimensions.trust.profileRecognition}`;
    case "trust.signerIdentity":
      return `trust.signerIdentity=${dimensions.trust.signerIdentity}`;
    case "trust.policyDecision":
      return `trust.policyDecision=${dimensions.trust.policyDecision}`;
    case "trust.checkerRecognition":
      return `trust.checkerRecognition=${dimensions.trust.checkerRecognition}`;
    case "trust.profileRecognition":
      return `trust.profileRecognition=${dimensions.trust.profileRecognition}`;
    case "checks":
      return dimensions.checks.results
        .map((result) => `${result.checkId}=${result.outcome}`)
        .join(", ");
    case "humanReview":
      return `humanReview.status=${dimensions.humanReview.status}`;
    default:
      return "unknown dimension";
  }
}

function formatSchemaErrors(errors: readonly AjvError[] | null | undefined): string {
  if (errors === null || errors === undefined || errors.length === 0) {
    return "unknown validation error";
  }
  return errors
    .slice(0, 8)
    .map(
      (error) =>
        `${error.instancePath === undefined || error.instancePath === "" ? "/" : error.instancePath} ${error.message ?? "is invalid"}`,
    )
    .join("; ");
}

function sha256Digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

const RFC3339_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/;

const NS_PER_SECOND = 1_000_000_000n;

/**
 * RFC 3339 instant at PAP's nanosecond precision. The gate deliberately
 * re-derives freshness from `report.evaluatedAt`; it must not trust the
 * report's `policy.state` label or consult the clock. The calendar check also
 * rejects impossible dates such as `2026-02-30`, which `Date.parse` would roll
 * over.
 */
function parseInstant(value: string): bigint | null {
  const match = RFC3339_INSTANT.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  const offsetSign = match[9];
  const offsetHour = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinute = match[11] === undefined ? 0 : Number(match[11]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (offsetHour > 23 || offsetMinute > 59) return null;

  let offsetSeconds = 0;
  if (offsetSign === "+" || offsetSign === "-") {
    offsetSeconds = (offsetHour * 60 + offsetMinute) * 60;
    if (offsetSign === "-") offsetSeconds = -offsetSeconds;
  }

  const days = daysFromCivil(year, month, day);
  const epochSeconds = days * 86_400n + BigInt(hour * 3600 + minute * 60 + second - offsetSeconds);
  const nanoseconds = fraction === "" ? 0n : BigInt(fraction.padEnd(9, "0"));
  return epochSeconds * NS_PER_SECOND + nanoseconds;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] as number;
}

/** Days since 1970-01-01 for a proleptic Gregorian date. */
function daysFromCivil(year: number, month: number, day: number): bigint {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return BigInt(era * 146097 + doe - 719468);
}

function isRfc3339(value: string): boolean {
  return parseInstant(value) !== null;
}

function quote(value: string | null | undefined): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Read and evaluate a report/policy pair. The caller decides how to deliver the
 * decision bytes and exit code; nothing here writes to the checkout.
 */
export async function gateCore000(options: GateOptions): Promise<GateResult> {
  const reportPath = path.resolve(options.reportPath);
  const policyPath = path.resolve(options.policyPath ?? DEFAULT_POLICY_PATH);
  const [reportRead, policyRead] = await Promise.all([
    readJsonFile(reportPath, "report"),
    readJsonFile(policyPath, "trust policy"),
  ]);

  let validators: SchemaValidators | null = null;
  let schemaError: string | null = null;
  try {
    validators = await loadValidators();
  } catch (error) {
    schemaError = messageOf(error);
  }

  const decision = evaluate({ reportRead, policyRead, validators, schemaError });
  return {
    decision,
    bytes: utf8(`${canonicalJson(decision)}\n`),
    exitCode: decision.decision === "ACCEPTED" ? 0 : 1,
  };
}

interface CliOptions {
  readonly reportPath: string;
  readonly policyPath: string;
  readonly outPath: string | null;
  readonly help: boolean;
}

const USAGE =
  "Usage: bun run gate:core000 --report <report.json> [--policy <policy.json>] [--out <decision.json>]";

function parseArgs(argv: readonly string[]): CliOptions {
  let reportPath: string | undefined;
  let policyPath: string | undefined;
  let outPath: string | undefined;
  const positionals: string[] = [];
  let endOfOptions = false;

  const valueFor = (flag: string, inline: string | undefined, index: number): [string, number] => {
    if (inline !== undefined) {
      if (inline.length === 0) throw new Error(`${flag} requires a value`);
      return [inline, index];
    }
    const next = argv[index + 1];
    if (next === undefined || next.length === 0) {
      throw new Error(`${flag} requires a value`);
    }
    return [next, index + 1];
  };
  const setOnce = (current: string | undefined, flag: string): void => {
    if (current !== undefined) throw new Error(`${flag} may be given only once`);
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (!endOfOptions && argument === "--") {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && argument.startsWith("--")) {
      const equal = argument.indexOf("=");
      const flag = equal === -1 ? argument : argument.slice(0, equal);
      const inline = equal === -1 ? undefined : argument.slice(equal + 1);
      if (flag === "--help") {
        return {
          reportPath: "",
          policyPath: DEFAULT_POLICY_PATH,
          outPath: null,
          help: true,
        };
      }
      if (flag === "--report") {
        setOnce(reportPath, "--report");
        const [value, consumed] = valueFor(flag, inline, index);
        reportPath = value;
        index = consumed;
        continue;
      }
      if (flag === "--policy") {
        setOnce(policyPath, "--policy");
        const [value, consumed] = valueFor(flag, inline, index);
        policyPath = value;
        index = consumed;
        continue;
      }
      if (flag === "--out") {
        setOnce(outPath, "--out");
        const [value, consumed] = valueFor(flag, inline, index);
        outPath = value;
        index = consumed;
        continue;
      }
      throw new Error(`unknown option ${flag}`);
    }
    positionals.push(argument);
  }

  if (reportPath !== undefined && positionals.length > 0) {
    throw new Error(`unexpected argument: ${positionals[0]}`);
  }
  if (positionals.length > 1) {
    throw new Error(`unexpected argument: ${positionals[1]}`);
  }
  if (reportPath === undefined) reportPath = positionals[0];
  if (reportPath === undefined) throw new Error("--report is required");
  return {
    reportPath,
    policyPath: policyPath ?? DEFAULT_POLICY_PATH,
    outPath: outPath ?? null,
    help: false,
  };
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`gate: ${messageOf(error)}`);
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }

  let result: GateResult;
  try {
    result = await gateCore000({
      reportPath: options.reportPath,
      policyPath: options.policyPath,
    });
  } catch (error) {
    console.error(`gate: ${messageOf(error)}`);
    process.exitCode = 2;
    return;
  }

  try {
    if (options.outPath === null || options.outPath === "-") {
      process.stdout.write(result.bytes);
    } else {
      await mkdir(path.dirname(options.outPath), { recursive: true });
      await writeFile(options.outPath, result.bytes);
    }
  } catch (error) {
    console.error(`gate: cannot write the decision: ${messageOf(error)}`);
    process.exitCode = 2;
    return;
  }
  process.exitCode = result.exitCode;
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main();
}
