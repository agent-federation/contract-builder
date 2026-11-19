import { test } from "node:test";
import assert from "node:assert/strict";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import type { Entity, ProjectModel, ProvenanceVerification } from "../spec/lib/ir.js";
import type { Manifest, Profile } from "../spec/lib/manifest.js";
import {
  applyVerificationClaims,
  bindProvenance,
  sourceDigest,
  type ProvenanceVerificationClaim,
} from "../spec/lib/provenance.js";
import { entity, modelWith } from "./support.js";

const PROFILE = {
  id: "p",
  version: "1",
  entityKinds: {},
  schemas: {},
  documents: [],
  provenance: [{ kind: "fragment", source: "source", ref: "source_ref", quote: "quote" }],
} as unknown as Profile;

const MANIFEST = {
  manifestVersion: "0.1",
  project: { id: "t" },
  profile: { id: "p", version: "1", source: "." },
  inputs: [],
  sources: [
    {
      id: "SRC",
      path: "legacy.md",
      adapter: "markdown",
      identity: { document: "DOC", revision: "1" },
    },
  ],
  render: [{ outputs: {} }],
} as unknown as Manifest;

/** Synthetic provenance-bound entity: kind and fields are the test's own, not CORE-001's. */
function boundEntity(): Entity {
  return entity("F1", "fragment", {
    source: "SRC",
    source_ref: "SRC#1",
    quote: "MUST do",
  });
}

/** Binds one entity the way the core does, before any profile verifier runs. */
function bound(entityToBind: Entity = boundEntity()): { model: ProjectModel; digest: string } {
  const diagnostics = new Diagnostics();
  const entities = [entityToBind];
  const ok = bindProvenance(
    entities,
    new Map([[entityToBind.id, { file: "sources.yml", pointer: "/fragments/0" }]]),
    PROFILE,
    MANIFEST,
    diagnostics,
  );
  assert.ok(ok, diagnostics.report());
  const model = modelWith(entities);
  return { model, digest: sourceDigest(model.sources[0]!.bytes) };
}

function claim(overrides: Partial<ProvenanceVerificationClaim> = {}): ProvenanceVerificationClaim {
  return {
    entityId: "F1",
    status: "verified",
    verifier: "test/verifier",
    method: "test:verifyQuote",
    checkedAt: null,
    sourceVersion: "DOC (Rev 1)",
    sourceDigest: sourceDigest(new TextEncoder().encode("DOC (Rev 1)\nMUST do")),
    outcome: "found",
    ...overrides,
  };
}

function apply(overrides: Partial<ProvenanceVerificationClaim>): {
  model: ProjectModel;
  diagnostics: Diagnostics;
  ok: boolean;
} {
  const { model } = bound();
  const diagnostics = new Diagnostics();
  const ok = applyVerificationClaims(model, model.sources, [claim(overrides)], diagnostics);
  return { model, diagnostics, ok };
}

function status(model: ProjectModel): ProvenanceVerification | undefined {
  return model.byId.get("F1")?.verification;
}

test("provenance: binding alone is unavailable/not-checked and never verified", () => {
  const { model } = bound();
  const verification = status(model);

  assert.equal(verification?.status, "unavailable");
  assert.deepEqual(verification?.record, {
    entity: "F1",
    source: "SRC",
    ref: "SRC#1",
    verifier: null,
    method: "none",
    checkedAt: null,
    sourceVersion: "DOC (Rev 1)",
    sourceDigest: null,
    outcome: "not-checked",
  });
});

test("provenance: verified, failed and unavailable claims are stored distinctly", () => {
  const verified = apply({ status: "verified", outcome: "found" });
  assert.equal(verified.ok, true, verified.diagnostics.report());
  assert.equal(status(verified.model)?.status, "verified");
  assert.equal(status(verified.model)?.record.outcome, "found");

  const failed = apply({ status: "failed", outcome: "outside" });
  assert.equal(failed.ok, true, failed.diagnostics.report());
  assert.equal(status(failed.model)?.status, "failed");

  const unavailable = apply({ status: "unavailable", outcome: "unsupported" });
  assert.equal(unavailable.ok, true, unavailable.diagnostics.report());
  assert.equal(status(unavailable.model)?.status, "unavailable");
});

test("provenance: a stale record names the digest it covered", () => {
  const { model } = bound();
  const diagnostics = new Diagnostics();
  const stale = claim({
    status: "stale",
    sourceDigest: `sha256:${"a".repeat(64)}`,
    outcome: "found",
  });

  assert.equal(applyVerificationClaims(model, model.sources, [stale], diagnostics), true);
  assert.equal(status(model)?.status, "stale");
  assert.equal(status(model)?.record.sourceDigest, stale.sourceDigest);
});

test("provenance: a result for different bytes is stored as stale, not verified", () => {
  const { model } = bound();
  const diagnostics = new Diagnostics();
  const otherDigest = `sha256:${"b".repeat(64)}`;

  assert.equal(
    applyVerificationClaims(
      model,
      model.sources,
      [claim({ status: "verified", sourceDigest: otherDigest })],
      diagnostics,
    ),
    true,
  );
  assert.equal(status(model)?.status, "stale");
});

test("provenance: a claim without a source digest cannot be verified", () => {
  const { model, diagnostics, ok } = apply({ status: "verified", sourceDigest: null });

  assert.equal(ok, true, diagnostics.report());
  assert.equal(status(model)?.status, "unavailable");
});

test("provenance: a checked status cannot claim that no verifier ran", () => {
  const contradictions: Array<Partial<ProvenanceVerificationClaim>> = [
    { verifier: null },
    { method: "none" },
    { outcome: "not-checked" },
  ];

  for (const overrides of contradictions) {
    const { model, diagnostics, ok } = apply({ status: "verified", ...overrides });
    assert.equal(ok, false, JSON.stringify(overrides));
    assert.ok(
      diagnostics.sorted().some((item) => item.code === "core.provenance.verification"),
      JSON.stringify(overrides),
    );
    assert.equal(
      status(model)?.status,
      "unavailable",
      `contradictory verified claim must not be stored: ${JSON.stringify(overrides)}`,
    );
  }

  const failed = apply({ status: "failed", verifier: null });
  assert.equal(failed.ok, false);
  assert.equal(status(failed.model)?.status, "unavailable");
});

test("provenance: a stale claim whose digest matches the current source is rejected", () => {
  const { model, diagnostics, ok } = apply({ status: "stale", sourceDigest: claim().sourceDigest });

  assert.equal(ok, false);
  assert.ok(diagnostics.sorted().some((item) => item.code === "core.provenance.verification"));
  assert.equal(status(model)?.status, "unavailable");
});

test("provenance: an unknown entity or a malformed record is a core error", () => {
  const { model } = bound();

  const unknown = new Diagnostics();
  assert.equal(
    applyVerificationClaims(model, model.sources, [claim({ entityId: "MISSING" })], unknown),
    false,
  );
  assert.equal(unknown.sorted()[0]?.code, "core.provenance.verification");

  const malformed = new Diagnostics();
  assert.equal(
    applyVerificationClaims(model, model.sources, [claim({ method: "" })], malformed),
    false,
  );
  assert.equal(malformed.sorted()[0]?.code, "core.provenance.verification");
});
