import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuild } from "../spec/lib/build.js";
import { Diagnostics } from "../spec/lib/diagnostics.js";
import type { Entity, ProjectModel, ProvenanceVerification } from "../spec/lib/ir.js";
import type { Manifest, Profile } from "../spec/lib/manifest.js";
import {
  applyVerificationClaims,
  bindProvenance,
  sourceDigest,
  type ProvenanceVerificationClaim,
} from "../spec/lib/provenance.js";
import { markdownAdapter } from "../spec/lib/adapters/markdown.js";
import type { LocatorResult, SourceAdapter } from "../spec/lib/source.js";
import { verifyProvenance } from "../profiles/core001/checks/verification.js";
import { renderer } from "../profiles/core001/renderer.js";
import { fragment, modelWith, TEST_IDENTITY, TEST_RENDERERS } from "./support.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const specDir = path.join(root, "spec");

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

/** Binds one fragment the way the core does, before any profile verifier runs. */
function bound(entityToBind: Entity = fragment()): { model: ProjectModel; digest: string } {
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

function apply(
  overrides: Partial<ProvenanceVerificationClaim>,
): { model: ProjectModel; diagnostics: Diagnostics; ok: boolean } {
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

test("provenance: CORE-001 maps adapter outcomes to verified, failed and unavailable", async () => {
  const outcomes: Array<[LocatorResult, string, string]> = [
    ["found", "verified", "found"],
    ["outside", "failed", "outside"],
    ["unknown-locator", "failed", "unknown-locator"],
    ["unsupported", "unavailable", "unsupported"],
  ];

  for (const [outcome, expectedStatus, expectedOutcome] of outcomes) {
    const { model, digest } = bound();
    const claims = await verifyProvenance(model, {
      sources: model.sources,
      legacyText: "DOC (Rev 1)\nMUST do",
      legacyName: "legacy.md",
      verifyQuote: async () => outcome,
      sourceDigest: () => digest,
      sourceVersion: () => "DOC (Rev 1)",
    });

    assert.equal(claims.length, 1);
    assert.equal(claims[0]!.status, expectedStatus, outcome);
    assert.equal(claims[0]!.outcome, expectedOutcome);
    assert.equal(claims[0]!.verifier, "core001/validator");
    assert.equal(claims[0]!.checkedAt, null);
    assert.equal(claims[0]!.sourceDigest, digest);
  }
});

test("provenance: CORE-001 reports a quote absent from the source as failed", async () => {
  const absent = fragment();
  absent.fields.quote = "absent from the source";
  const { model, digest } = bound(absent);

  const claims = await verifyProvenance(model, {
    sources: model.sources,
    legacyText: "DOC (Rev 1)\nMUST do",
    legacyName: "legacy.md",
    verifyQuote: async () => {
      throw new Error("verifyQuote must not run for an absent quote");
    },
    sourceDigest: () => digest,
    sourceVersion: () => "DOC (Rev 1)",
  });

  assert.equal(claims[0]!.status, "failed");
  assert.equal(claims[0]!.outcome, "not-found");
});

async function render(model: ProjectModel): Promise<string> {
  const template = await readFile(
    path.join(root, "profiles/core001/templates/core001.md.j2"),
    "utf8",
  );
  const labels = JSON.parse(
    await readFile(path.join(root, "profiles/core001/labels.ru.json"), "utf8"),
  ) as Record<string, string>;
  const artifacts = await renderer.render(model, {
    mode: "draft",
    templates: { entry: "core001.md.j2", files: { "core001.md.j2": template } },
    labels,
    diagnostics: [],
    identity: TEST_IDENTITY,
  });
  return new TextDecoder().decode(artifacts[0]!.bytes);
}

function provenanceRow(text: string, id: string): string {
  const section = text
    .split("## Происхождение: привязка и проверка")[1]!
    .split("## Приложение A")[0]!;
  const row = section.split("\n").find((line) => line.startsWith(`| \`${id}\` |`));
  assert.ok(row !== undefined, `no provenance row for ${id}`);
  return row;
}

test("provenance: an unavailable binding is never rendered as verified", async () => {
  const { model } = bound();
  const row = provenanceRow(await render(model), "F1");

  assert.match(row, /\| unavailable \(not-checked\) \|/);
  assert.equal(row.includes("verified"), false);
});

test("provenance: failed and stale are rendered distinctly, never as verified", async () => {
  const failed = apply({ status: "failed", outcome: "outside" });
  const failedRow = provenanceRow(await render(failed.model), "F1");
  assert.match(failedRow, /\| failed \(outside\) \|/);
  assert.equal(failedRow.includes("verified"), false);

  const stale = apply({
    status: "stale",
    sourceDigest: `sha256:${"c".repeat(64)}`,
  });
  const staleRow = provenanceRow(await render(stale.model), "F1");
  assert.match(staleRow, /\| stale \(found\) \|/);
  assert.equal(staleRow.includes("verified"), false);
});

test("provenance: a full build calls verifyQuote exactly once per direct binding", async () => {
  const calls: Array<{ ref: string; quote: string }> = [];
  const spy: SourceAdapter = {
    ...markdownAdapter,
    async verifyQuote(source, ref, quote) {
      calls.push({ ref, quote });
      return markdownAdapter.verifyQuote(source, ref, quote);
    },
  };

  const result = await runBuild({
    specDir,
    mode: "draft",
    write: false,
    check: false,
    strict: false,
    renderers: TEST_RENDERERS,
    allowExecutableProfile: true,
    adapters: { markdown: spy },
  });
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));

  // CORE-001 has seven direct fragment bindings and one decision binding. If the source
  // checks re-verified the same quotes, the adapter would be called more than eight times.
  const decisionRef = "SRC-CORE001#15/5";
  assert.equal(calls.length, 8, "one adapter call per direct binding");
  assert.equal(calls.filter((call) => call.ref === decisionRef).length, 1, "one decision call");
  assert.equal(calls.filter((call) => call.ref !== decisionRef).length, 7, "seven fragment calls");
});

test("provenance: the draft artifact labels every direct binding and its evidence", async () => {
  const result = await runBuild({
    specDir,
    mode: "draft",
    write: false,
    check: false,
    strict: false,
    renderers: TEST_RENDERERS,
    allowExecutableProfile: true,
  });
  assert.equal(result.exitCode, 0, result.diagnostics.map((item) => item.message).join("\n"));

  const text = result.markdown!;
  const section = text
    .split("## Происхождение: привязка и проверка")[1]!
    .split("## Приложение A")[0]!;
  const rows = section
    .split("\n")
    .filter((line) => /^\| `(?:FRAG|DEC)-/.test(line));

  assert.equal(rows.length, 8, "every direct provenance binding needs a row");
  for (const row of rows) {
    assert.match(row, /\| verified \(found\) \|/);
    assert.match(row, /`sha256:[0-9a-f]{64}`/);
    assert.match(row, /`core001\/validator`/);
    assert.match(row, /\| — \|$/);
  }
  assert.equal(section.includes("`TERM-ASSERTED-AT`"), false);
  assert.equal(section.includes("`REQ-TEMPORAL-MOMENT-DEFINED`"), false);
});
