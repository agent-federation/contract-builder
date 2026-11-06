import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DIMENSION_ORDER,
  classifyDimension,
  computeRequiredDimensions,
  computeVerdict,
  deriveRequiredDimensions,
  isCoverageFull,
  isDimensionDecided,
  isDimensionPositive,
  isDimensionError,
  resolveRequiredCheckOutcomes,
  statusForDimension,
} from "../src/state.js";
import type {
  DimensionStates,
  PolicyRequirementInput,
  VerdictContext,
} from "../src/state.js";
import type { CheckOutcome, DimensionName } from "../src/types.js";

const CHECK_IDS = [
  "pap.check.digest-integrity/1",
  "pap.check.source-quote/1",
  "pap.check.relation-consistency/1",
] as const;

function policy(overrides: Partial<PolicyRequirementInput> = {}): PolicyRequirementInput {
  return {
    signature: { mode: "optional" },
    humanReview: { required: false },
    requiredDimensions: [],
    ...overrides,
  };
}

test("deriveRequiredDimensions: required checks imply their dimensions", () => {
  assert.deepEqual(deriveRequiredDimensions(null, ["pap.check.digest-integrity/1"]), [
    "integrity",
    "checks",
  ]);
  assert.deepEqual(deriveRequiredDimensions(null, ["pap.check.source-quote/1"]), [
    "sources",
    "checks",
  ]);
  assert.deepEqual(deriveRequiredDimensions(null, ["pap.check.relation-consistency/1"]), ["checks"]);
  assert.deepEqual(deriveRequiredDimensions(null, ["pap.check.unknown/1"]), ["checks"]);
  assert.deepEqual(deriveRequiredDimensions(null, [...CHECK_IDS]), [
    "integrity",
    "sources",
    "checks",
  ]);
});

test("deriveRequiredDimensions: I1/E2 derivation is independent of requiredDimensions", () => {
  const signature = policy({ signature: { mode: "required" } });
  assert.deepEqual(deriveRequiredDimensions(signature, [...CHECK_IDS]), [
    "integrity",
    "sources",
    "signature",
    "trust",
    "checks",
  ]);

  const review = policy({ humanReview: { required: true } });
  assert.deepEqual(deriveRequiredDimensions(review, [...CHECK_IDS]), [
    "integrity",
    "sources",
    "checks",
    "humanReview",
  ]);

  const both = policy({
    signature: { mode: "required" },
    humanReview: { required: true },
    requiredDimensions: ["trust.checkerRecognition"],
  });
  assert.deepEqual(deriveRequiredDimensions(both, [...CHECK_IDS]), [
    "integrity",
    "sources",
    "signature",
    "trust",
    "trust.checkerRecognition",
    "checks",
    "humanReview",
  ]);
});

test("deriveRequiredDimensions: policy requiredDimensions only add", () => {
  const declared = policy({ requiredDimensions: ["trust.profileRecognition"] });
  const derived = deriveRequiredDimensions(declared, [...CHECK_IDS]);
  assert.ok(derived.includes("trust.profileRecognition"));
  assert.ok(derived.includes("integrity"));
  assert.ok(derived.includes("sources"));
  assert.ok(derived.includes("checks"));
  assert.deepEqual(
    [...new Set(derived)],
    derived,
    "the derived set must not repeat dimensions",
  );
  assert.deepEqual(
    deriveRequiredDimensions(declared, [...CHECK_IDS]),
    DIMENSION_ORDER.filter((dimension) => derived.includes(dimension)),
    "the derived set must be in canonical order",
  );
});

test("deriveRequiredDimensions: disabled/optional signature derives nothing extra", () => {
  for (const mode of ["disabled", "optional"] as const) {
    assert.deepEqual(deriveRequiredDimensions(policy({ signature: { mode } }), []), []);
  }
});

test("deriveRequiredDimensions: does not mutate the policy or its dimensions", () => {
  const dimensions: DimensionName[] = ["checks"];
  const input = policy({ signature: { mode: "required" }, requiredDimensions: dimensions });
  const derived = deriveRequiredDimensions(input, ["pap.check.digest-integrity/1"]);
  assert.deepEqual(dimensions, ["checks"]);
  assert.deepEqual(input.requiredDimensions, ["checks"]);
  assert.notEqual(derived, dimensions);
});

test("computeRequiredDimensions stays the additive compatibility helper", () => {
  assert.deepEqual(computeRequiredDimensions(["pap.check.source-quote/1"], ["humanReview"]), [
    "sources",
    "checks",
    "humanReview",
  ]);
});

const POSITIVE_STATES: DimensionStates = {
  integrity: { package: "PASS", artifacts: "PASS" },
  sources: { integrity: "PASS", availability: "PASS" },
  signature: { validity: "VALID" },
  trust: {
    signerIdentity: "TRUSTED",
    policyDecision: "ACCEPTED",
    checkerRecognition: "PASS",
    profileRecognition: "PASS",
  },
  checks: {
    results: CHECK_IDS.map((checkId) => ({ checkId, outcome: "PASS" as const, required: true })),
  },
  humanReview: { status: "PASS" },
};

function states(overrides: Partial<DimensionStates> = {}): DimensionStates {
  return {
    integrity: { ...POSITIVE_STATES.integrity },
    sources: { ...POSITIVE_STATES.sources },
    signature: { ...POSITIVE_STATES.signature },
    trust: { ...POSITIVE_STATES.trust },
    checks: { results: POSITIVE_STATES.checks.results.map((result) => ({ ...result })) },
    humanReview: { ...POSITIVE_STATES.humanReview },
    ...overrides,
  };
}

function context(
  value: DimensionStates,
  overrides: Partial<VerdictContext> = {},
): VerdictContext {
  const requiredChecks = overrides.requiredChecks ?? [...CHECK_IDS];
  const requiredDimensions = overrides.requiredDimensions ?? [
    "integrity",
    "sources",
    "checks",
  ];
  const limitStopped = overrides.limitStopped ?? false;
  return {
    requiredChecks,
    requiredDimensions,
    signatureMode: "optional",
    humanReviewRequired: false,
    policyState: "FRESH",
    limitStopped,
    unsupportedVersion: false,
    unsupportedFeature: false,
    emptyRequiredSet: requiredChecks.length === 0 && requiredDimensions.length === 0,
    coverageFull: isCoverageFull(
      value,
      requiredChecks,
      requiredDimensions,
      limitStopped,
    ),
    ...overrides,
  };
}

test("classification: STALE is decided but not positive and not an error", () => {
  const stale = states({
    trust: { ...POSITIVE_STATES.trust, policyDecision: "STALE" },
  });
  assert.equal(isDimensionDecided("trust.policyDecision", stale), true);
  assert.equal(isDimensionPositive("trust.policyDecision", stale), false);
  assert.equal(isDimensionError("trust.policyDecision", stale), false);
  assert.equal(classifyDimension("trust.policyDecision", stale), "decided");
  assert.equal(isDimensionDecided("trust", stale), true);
  assert.equal(isDimensionPositive("trust", stale), false);
  assert.equal(isCoverageFull(stale, [...CHECK_IDS], ["trust"], false), true);
});

test("classification: not-evaluated and unavailable dimensions are undecided", () => {
  const pending = states({
    sources: { integrity: "UNAVAILABLE", availability: "UNAVAILABLE" },
    trust: { ...POSITIVE_STATES.trust, policyDecision: "NOT_EVALUATED" },
  });
  assert.equal(classifyDimension("sources", pending), "undecided");
  assert.equal(classifyDimension("trust", pending), "undecided");
  assert.equal(isDimensionDecided("trust", pending), false);
});

test("classification: error states are decided and negative", () => {
  const failed = states({
    integrity: { package: "PASS", artifacts: "FAIL" },
    signature: { validity: "INVALID" },
    trust: { ...POSITIVE_STATES.trust, policyDecision: "REJECTED" },
  });
  assert.equal(classifyDimension("integrity", failed), "error");
  assert.equal(classifyDimension("signature", failed), "error");
  assert.equal(classifyDimension("trust.policyDecision", failed), "error");
  assert.equal(isDimensionDecided("signature", failed), true);
});

test("classification: an optional check failure does not decide the checks dimension", () => {
  const value = states({
    checks: {
      results: [
        { checkId: CHECK_IDS[0], outcome: "PASS", required: true },
        { checkId: CHECK_IDS[1], outcome: "FAIL", required: false },
      ],
    },
  });
  assert.equal(isDimensionPositive("checks", value), true);
  assert.equal(classifyDimension("checks", value), "positive");
});

test("statusForDimension exposes the aggregate and leaf statuses", () => {
  const stale = states({
    trust: { ...POSITIVE_STATES.trust, policyDecision: "STALE" },
  });
  assert.equal(statusForDimension(stale, "trust"), "TRUSTED");
  assert.equal(statusForDimension(stale, "trust.policyDecision"), "STALE");
  assert.equal(statusForDimension(stale, "integrity"), "PASS");
});

test("I3: an empty required set is INCOMPLETE, not NOT_EVALUATED", () => {
  const value = states();
  assert.equal(
    computeVerdict(value, {
      ...context(value, { requiredChecks: [], requiredDimensions: [] }),
      emptyRequiredSet: true,
    }),
    "INCOMPLETE",
  );
});

test("I3: a required FAIL wins over every other state", () => {
  const value = states({
    checks: {
      results: CHECK_IDS.map((checkId, index) => ({
        checkId,
        outcome: (index === 0 ? "FAIL" : "NOT_EVALUATED") as CheckOutcome,
        required: true,
      })),
    },
    trust: { ...POSITIVE_STATES.trust, signerIdentity: "UNTRUSTED" },
  });
  assert.equal(computeVerdict(value, context(value)), "FAIL");
});

test("I3: an unmet quorum is INCOMPLETE even when requiredDimensions omits trust", () => {
  const value = states({
    signature: { validity: "VALID" },
    trust: { ...POSITIVE_STATES.trust, policyDecision: "NOT_EVALUATED" },
  });
  const ctx = context(value, {
    requiredDimensions: ["integrity", "sources", "checks"],
    signatureMode: "required",
  });
  assert.equal(ctx.coverageFull, true);
  assert.equal(computeVerdict(value, ctx), "INCOMPLETE");
});

test("I4: a stale policy is decided and can yield INCOMPLETE with full coverage", () => {
  const value = states({
    trust: { ...POSITIVE_STATES.trust, policyDecision: "STALE" },
  });
  const ctx = context(value, {
    requiredDimensions: ["integrity", "sources", "checks", "signature", "trust"],
  });
  assert.equal(ctx.coverageFull, true);
  assert.equal(computeVerdict(value, ctx), "INCOMPLETE");
});

test("I3: a limit stop is INCOMPLETE when no failure precedes it", () => {
  const value = states();
  const ctx = context(value, { limitStopped: true });
  assert.equal(ctx.coverageFull, false);
  assert.equal(computeVerdict(value, ctx), "INCOMPLETE");
});

test("I3: UNSUPPORTED precedes INCOMPLETE", () => {
  const value = states({
    checks: {
      results: CHECK_IDS.map((checkId, index) => ({
        checkId,
        outcome: (index === 0 ? "UNSUPPORTED" : "PASS") as CheckOutcome,
        required: true,
      })),
    },
  });
  const ctx = context(value, { unsupportedVersion: true });
  assert.equal(computeVerdict(value, ctx), "UNSUPPORTED");
});

test("I3: PASS requires every required dimension in its positive state", () => {
  const value = states({ signature: { validity: "INVALID" } });
  const ctx = context(value, {
    requiredDimensions: ["integrity", "sources", "checks", "signature"],
  });
  assert.equal(ctx.coverageFull, true);
  assert.equal(computeVerdict(value, ctx), "FAIL");

  const stale = states({ trust: { ...POSITIVE_STATES.trust, policyDecision: "STALE" } });
  const staleCtx = context(stale, {
    requiredDimensions: ["integrity", "sources", "checks", "trust.policyDecision"],
  });
  assert.equal(computeVerdict(stale, staleCtx), "INCOMPLETE");
});

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

const INTEGRITY_STATES = ["PASS", "FAIL", "NOT_EVALUATED"] as const;
const SOURCE_INTEGRITY_STATES = ["PASS", "FAIL", "UNAVAILABLE", "NOT_EVALUATED"] as const;
const SOURCE_AVAILABILITY_STATES = ["PASS", "UNAVAILABLE", "NOT_APPLICABLE"] as const;
const SIGNATURE_STATES = ["VALID", "INVALID", "NOT_EVALUATED", "NOT_APPLICABLE"] as const;
const SIGNER_STATES = [
  "TRUSTED",
  "UNTRUSTED",
  "UNKNOWN",
  "NOT_EVALUATED",
  "NOT_APPLICABLE",
] as const;
const POLICY_DECISION_STATES = ["ACCEPTED", "REJECTED", "STALE", "NOT_EVALUATED"] as const;
const RECOGNITION_STATES = ["PASS", "UNSUPPORTED", "UNTRUSTED", "NOT_EVALUATED", "NOT_APPLICABLE"] as const;
const HUMAN_REVIEW_STATES = ["PASS", "INCOMPLETE", "UNKNOWN", "NOT_APPLICABLE"] as const;
const CHECK_OUTCOMES = ["PASS", "FAIL", "UNSUPPORTED", "NOT_EVALUATED"] as const;
const SIGNATURE_MODES = ["disabled", "optional", "required"] as const;
const POLICY_STATES = ["FRESH", "STALE", "ABSENT"] as const;

function randomStates(rng: () => number): DimensionStates {
  return {
    integrity: {
      package: pick(INTEGRITY_STATES, rng),
      artifacts: pick(INTEGRITY_STATES, rng),
    },
    sources: {
      integrity: pick(SOURCE_INTEGRITY_STATES, rng),
      availability: pick(SOURCE_AVAILABILITY_STATES, rng),
    },
    signature: { validity: pick(SIGNATURE_STATES, rng) },
    trust: {
      signerIdentity: pick(SIGNER_STATES, rng),
      policyDecision: pick(POLICY_DECISION_STATES, rng),
      checkerRecognition: pick(RECOGNITION_STATES, rng),
      profileRecognition: pick(RECOGNITION_STATES, rng),
    },
    checks: {
      results: CHECK_IDS.map((checkId) => ({
        checkId,
        outcome: pick(CHECK_OUTCOMES, rng),
        required: rng() < 0.85,
      })),
    },
    humanReview: { status: pick(HUMAN_REVIEW_STATES, rng) },
  };
}

function randomContext(value: DimensionStates, rng: () => number): VerdictContext {
  const requiredChecks = CHECK_IDS.filter(() => rng() < 0.7);
  const requiredDimensions = DIMENSION_ORDER.filter(() => rng() < 0.4);
  const limitStopped = rng() < 0.2;
  return {
    requiredChecks,
    requiredDimensions,
    signatureMode: pick(SIGNATURE_MODES, rng),
    humanReviewRequired: rng() < 0.3,
    policyState: pick(POLICY_STATES, rng),
    limitStopped,
    unsupportedVersion: rng() < 0.1,
    unsupportedFeature: rng() < 0.1,
    emptyRequiredSet: requiredChecks.length === 0 && requiredDimensions.length === 0,
    coverageFull: isCoverageFull(value, requiredChecks, requiredDimensions, limitStopped),
  };
}

test("property: required FAIL implies FAIL", () => {
  const rng = makeRng(0x5eed_0001);
  for (let index = 0; index < 400; index += 1) {
    const value = randomStates(rng);
    const ctx = randomContext(value, rng);
    if (resolveRequiredCheckOutcomes(value, ctx.requiredChecks).includes("FAIL")) {
      assert.equal(computeVerdict(value, ctx), "FAIL");
    }
  }
});

test("property: a required undecided dimension never yields PASS or NOT_EVALUATED", () => {
  const rng = makeRng(0x5eed_0002);
  for (let index = 0; index < 400; index += 1) {
    const value = randomStates(rng);
    const ctx = randomContext(value, rng);
    if (ctx.requiredDimensions.some((dimension) => !isDimensionDecided(dimension, value))) {
      const verdict = computeVerdict(value, ctx);
      assert.notEqual(verdict, "PASS", JSON.stringify({ value, ctx }));
      assert.notEqual(verdict, "NOT_EVALUATED", JSON.stringify({ value, ctx }));
    }
  }
});

test("property: PASS implies positive required dimensions, no limit and full coverage", () => {
  const rng = makeRng(0x5eed_0003);
  for (let index = 0; index < 400; index += 1) {
    const value = randomStates(rng);
    const ctx = randomContext(value, rng);
    if (computeVerdict(value, ctx) !== "PASS") continue;
    assert.equal(ctx.limitStopped, false);
    assert.equal(ctx.emptyRequiredSet, false);
    assert.notEqual(ctx.policyState, "STALE");
    assert.equal(ctx.coverageFull, true);
    for (const dimension of ctx.requiredDimensions) {
      assert.equal(
        isDimensionPositive(dimension, value),
        true,
        JSON.stringify({ dimension, value, ctx }),
      );
    }
  }
});
