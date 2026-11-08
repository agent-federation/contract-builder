/**
 * Shared PAP v0.1 verifier types.
 *
 * The verifier is self-contained: nothing in `pap/` imports the producer
 * (`spec/`, `profiles/`). A package is untrusted data, never code.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type Severity = "error" | "warning" | "info";

export type CheckOutcome = "PASS" | "FAIL" | "UNSUPPORTED" | "NOT_EVALUATED";

export type Verdict =
  | "PASS"
  | "FAIL"
  | "UNTRUSTED"
  | "UNSUPPORTED"
  | "INCOMPLETE"
  | "NOT_EVALUATED";

export type DimensionName =
  | "integrity"
  | "integrity.package"
  | "integrity.artifacts"
  | "sources"
  | "sources.integrity"
  | "sources.availability"
  | "signature"
  | "signature.validity"
  | "trust"
  | "trust.signerIdentity"
  | "trust.policyDecision"
  | "trust.checkerRecognition"
  | "trust.profileRecognition"
  | "checks"
  | "humanReview";

export interface Diagnostic {
  code: string;
  severity: Severity;
  scope: string;
  message: string;
}

export interface Limitation {
  code: string;
  detail: string;
}

export interface CheckDiagnostic {
  code: string;
  severity: Severity;
  message: string;
}

export type Witness = RecomputedDigestWitness | SourceSpanWitness | RelationViolationWitness;

export interface RecomputedDigestWitness {
  type: "recomputed-digest";
  subject: { kind: "artifact" | "source" | "input" | "claim"; id?: string };
  algorithm: "sha256";
  declared: string;
  computed: string | null;
}

export interface SourceSpanWitness {
  type: "source-span";
  sourceId: string;
  sourceDigest: string;
  range: { start: number; end: number };
  quoteDigest: string;
  extractedDigest: string;
  quoteBase64?: string;
}

export interface RelationViolation {
  code: string;
  subject: string;
  detail: string;
}

export interface RelationViolationWitness {
  type: "relation-violation-list";
  violations: RelationViolation[];
}

export interface CheckRecord {
  checkId: string;
  checkVersion: string;
  subjectDigests: {
    package: string;
    artifacts?: { id: string; digest: string }[];
    sources?: { id: string; digest: string }[];
    inputs?: { id: string; digest: string }[];
    claims?: { kind: ClaimKind; digest: string }[];
  };
  scope: {
    artifacts?: string[];
    sources?: string[];
    bindings?: number;
    entities?: number;
    edges?: number;
    evaluated?: number;
    unavailable?: number;
  };
  checker: { id: string; version: string; implementationDigest: string };
  outcome: CheckOutcome;
  witnesses: Witness[];
  diagnostics: CheckDiagnostic[];
}

export type ClaimKind = "provenance" | "relations" | "producerReport" | "reviews";

export interface PackageRef {
  id?: string;
}

export interface PolicySummary {
  id: string | null;
  digest: string | null;
  state: "FRESH" | "STALE" | "ABSENT";
}

export interface VerificationReport {
  reportVersion: "0.1";
  verifier: {
    id: string;
    version: string;
    implementationDigest: string;
    checkerIdentities: string[];
  };
  package: {
    identity: string | null;
    papVersion: string | null;
    path?: string | null;
  };
  policy: PolicySummary & { path?: string | null };
  evaluatedAt: string;
  durationMs?: number;
  effectiveLimits?: Partial<Record<LimitName, number>>;
  identities: {
    packageIdentity: string | null;
    artifacts: { id: string; declared: string; computed: string | null }[];
    sources: { id: string; declared: string; computed: string | null }[];
    normalizedInputDigest: string | null;
    extensionClosureDigest: string | null;
    checkerIdentity: string;
    verificationRecordIdentity: string;
  };
  dimensions: {
    integrity: {
      package: "PASS" | "FAIL" | "NOT_EVALUATED";
      artifacts: "PASS" | "FAIL" | "NOT_EVALUATED";
    };
    sources: {
      integrity: "PASS" | "FAIL" | "UNAVAILABLE" | "NOT_EVALUATED";
      availability: "PASS" | "UNAVAILABLE" | "NOT_APPLICABLE";
    };
    signature: {
      validity: "VALID" | "INVALID" | "NOT_EVALUATED" | "NOT_APPLICABLE";
      signatures?: SignatureEntry[];
    };
    trust: {
      signerIdentity: "TRUSTED" | "UNTRUSTED" | "UNKNOWN" | "NOT_EVALUATED" | "NOT_APPLICABLE";
      policyDecision: "ACCEPTED" | "REJECTED" | "STALE" | "NOT_EVALUATED";
      checkerRecognition: "PASS" | "UNSUPPORTED" | "UNTRUSTED" | "NOT_EVALUATED" | "NOT_APPLICABLE";
      profileRecognition: "PASS" | "UNSUPPORTED" | "UNTRUSTED" | "NOT_EVALUATED" | "NOT_APPLICABLE";
    };
    checks: {
      results: { checkId: string; outcome: CheckOutcome; required?: boolean }[];
    };
    humanReview: {
      status: "PASS" | "INCOMPLETE" | "UNKNOWN" | "NOT_APPLICABLE";
      basis?: "unbound-claim";
    };
    semanticTruth: "NOT_EVALUATED";
    legalEnforceability: "NOT_EVALUATED";
  };
  checks: CheckRecord[];
  producerClaims?: {
    present: boolean;
    trusted: false;
    comparison?: {
      checkId: string;
      claimed: string | null;
      independentOutcome: string | null;
      relation: "AGREES" | "DISAGREES" | "UNVERIFIABLE" | "NOT_COMPARABLE";
    }[];
  };
  coverage: {
    requiredChecks: string[];
    checksEvaluated: number;
    checksPassed: number;
    checksFailed: number;
    checksUnsupported: number;
    checksNotEvaluated: number;
    requiredDimensions: DimensionName[];
    dimensionsEvaluated: number;
    full: boolean;
  };
  limitations: Limitation[];
  verdict: Verdict;
  diagnostics: Diagnostic[];
}

export interface SignatureEntry {
  path: string;
  keyId?: string;
  algorithm?: "ed25519";
  validity: "VALID" | "INVALID" | "NOT_EVALUATED";
  signerIdentity: "TRUSTED" | "UNTRUSTED" | "UNKNOWN" | "NOT_EVALUATED" | "NOT_APPLICABLE";
  policyDecision: "ACCEPTED" | "REJECTED" | "STALE" | "NOT_EVALUATED";
}

export type LimitName =
  | "manifestBytes"
  | "payloadFiles"
  | "fileBytes"
  | "totalPayloadBytes"
  | "pathSegments"
  | "pathBytes"
  | "segmentBytes"
  | "jsonNesting"
  | "jsonStringBytes"
  | "claimsFiles"
  | "provenanceBindings"
  | "relationEntities"
  | "relationEdges"
  | "signatureEnvelopes";

export interface Limits {
  manifestBytes: number;
  payloadFiles: number;
  fileBytes: number;
  totalPayloadBytes: number;
  pathSegments: number;
  pathBytes: number;
  segmentBytes: number;
  jsonNesting: number;
  jsonStringBytes: number;
  claimsFiles: number;
  provenanceBindings: number;
  relationEntities: number;
  relationEdges: number;
  signatureEnvelopes: number;
}

export const DEFAULT_LIMITS: Limits = {
  manifestBytes: 1_048_576,
  payloadFiles: 4_096,
  fileBytes: 268_435_456,
  totalPayloadBytes: 1_073_741_824,
  pathSegments: 16,
  pathBytes: 255,
  segmentBytes: 255,
  jsonNesting: 64,
  jsonStringBytes: 16_777_216,
  claimsFiles: 16,
  provenanceBindings: 100_000,
  relationEntities: 100_000,
  relationEdges: 1_000_000,
  signatureEnvelopes: 32,
};

export const VERIFIER_ID = "pap.verifier.reference";
export const VERIFIER_VERSION = "0.1.0";
export const SUPPORTED_PAP_VERSIONS = ["0.1"] as const;
export const REPORT_VERSION = "0.1";
export const ZERO_DIGEST =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000";
