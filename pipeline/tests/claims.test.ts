import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  buildCore000Claims,
  claimDigest,
  PROVENANCE_CLAIM_PATH,
  RELATIONS_CLAIM_PATH,
  resolveExactQuote,
  SUPPORTED_RELATIONS,
  type Core000ClaimInput,
} from "../claims.js";
import { domainHash, normalizeLf, utf8 } from "../mapping.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const decoder = new TextDecoder("utf-8", { fatal: true });

async function readBytes(relative: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(root, relative)));
}

async function realInput(): Promise<Core000ClaimInput> {
  const inputBytes = new Map<string, Uint8Array>();
  for (const file of ["contract-builder.json", "structure.yml", "claims.yml"]) {
    inputBytes.set(file, normalizeLf(await readBytes(`contracts/core000/${file}`)));
  }
  return {
    inputBytes,
    source: {
      id: "SRC-ENGINE-CONTRACT",
      bytes: await readBytes("docs/architecture/engine-public-contract.md"),
    },
  };
}

interface SyntheticOptions {
  readonly manifest: unknown;
  readonly documents: Readonly<Record<string, unknown>>;
  readonly source: { readonly id: string; readonly text: string };
}

function synthetic(options: SyntheticOptions): Core000ClaimInput {
  const inputBytes = new Map<string, Uint8Array>();
  inputBytes.set("contract-builder.json", utf8(JSON.stringify(options.manifest)));
  for (const [name, document] of Object.entries(options.documents)) {
    inputBytes.set(name, utf8(YAML.stringify(document)));
  }
  return {
    inputBytes,
    source: { id: options.source.id, bytes: utf8(options.source.text) },
  };
}

function provenanceManifest(): unknown {
  return {
    inputs: [
      {
        path: "claims.yml",
        format: "yaml",
        entities: [{ kind: "source_statement", pointer: "/sourceStatements" }],
      },
    ],
    sources: [{ id: "SRC-X" }],
  };
}

function provenanceInput(
  quote: string,
  sourceText: string,
  overrides: { id?: string; source?: string } = {},
): Core000ClaimInput {
  return synthetic({
    manifest: provenanceManifest(),
    documents: {
      "claims.yml": {
        sourceStatements: [
          {
            id: overrides.id ?? "S1",
            source: overrides.source ?? "SRC-X",
            source_ref: "SRC-X#1",
            source_quote: quote,
          },
        ],
      },
    },
    source: { id: "SRC-X", text: sourceText },
  });
}

function relationsManifest(): unknown {
  return {
    inputs: [
      {
        path: "structure.yml",
        format: "yaml",
        entities: [
          { kind: "component", pointer: "/components" },
          { kind: "interface", pointer: "/interfaces" },
        ],
      },
      {
        path: "claims.yml",
        format: "yaml",
        entities: [
          { kind: "claim", pointer: "/claims" },
          { kind: "evidence", pointer: "/evidence" },
        ],
      },
    ],
    sources: [{ id: "SRC-X" }],
  };
}

function relationsInput(
  claims: readonly unknown[],
  evidence: readonly unknown[] = [],
  structure: Readonly<Record<string, readonly unknown[]>> = {},
): Core000ClaimInput {
  return synthetic({
    manifest: relationsManifest(),
    documents: {
      "structure.yml": { components: [], interfaces: [], ...structure },
      "claims.yml": { claims, evidence },
    },
    source: { id: "SRC-X", text: "source\n" },
  });
}

test("provenance: the real CORE-000 quotes resolve to exact raw source byte ranges", async () => {
  const input = await realInput();
  const plan = buildCore000Claims(input);

  assert.equal(plan.provenance.kind, "provenance");
  assert.equal(plan.provenance.path, PROVENANCE_CLAIM_PATH);
  assert.equal(plan.provenance.value.papClaimsVersion, "0.1");
  assert.equal(plan.provenance.value.bindings.length, 3);

  const expected = new Map([
    [
      "SRC-TR-001",
      {
        id: "binding:SRC-TR-001",
        entityId: "SRC-TR-001",
        sourceId: "SRC-ENGINE-CONTRACT",
        locator: { kind: "byte-range", start: 14957, end: 15140 },
        quote: {
          normalization: "none",
          digest: "sha256:90ee79643882758a5891418c9353e9dd9891cf7877a4407358f334f6051ba015",
        },
      },
    ],
    [
      "SRC-MANIFEST-001",
      {
        id: "binding:SRC-MANIFEST-001",
        entityId: "SRC-MANIFEST-001",
        sourceId: "SRC-ENGINE-CONTRACT",
        locator: { kind: "byte-range", start: 6321, end: 6629 },
        quote: {
          normalization: "none",
          digest: "sha256:352e7118930c09d22fcfd7f2e67b4cf27132a4a1779f16a1e74ca697e790bd0c",
        },
      },
    ],
    [
      "SRC-PROVENANCE-001",
      {
        id: "binding:SRC-PROVENANCE-001",
        entityId: "SRC-PROVENANCE-001",
        sourceId: "SRC-ENGINE-CONTRACT",
        locator: { kind: "byte-range", start: 23919, end: 24157 },
        quote: {
          normalization: "none",
          digest: "sha256:c45bbddfaf5a7d81d9591b1da778e55e6b3b716b0d7af97a501f70702aa7bad5",
        },
      },
    ],
  ]);

  for (const binding of plan.provenance.value.bindings) {
    assert.deepEqual(binding, expected.get(binding.entityId));
    const bytes = input.source.bytes.subarray(binding.locator.start, binding.locator.end);
    assert.equal(
      domainHash("pap.quote.v1", bytes),
      binding.quote.digest,
      `${binding.entityId} digest is recomputable from the packaged source`,
    );
  }

  assert.equal(
    domainHash("pap.quote.v1", input.source.bytes.subarray(14957, 15140)),
    "sha256:90ee79643882758a5891418c9353e9dd9891cf7877a4407358f334f6051ba015",
    "quote-digest vector",
  );
});

test("relations: the real CORE-000 graph is complete, deterministic and inverse-consistent", async () => {
  const input = await realInput();
  const first = buildCore000Claims(input);
  const second = buildCore000Claims(await realInput());

  assert.equal(first.relations.kind, "relations");
  assert.equal(first.relations.path, RELATIONS_CLAIM_PATH);
  assert.equal(first.relations.value.papClaimsVersion, "0.1");
  assert.deepEqual(first.relations.bytes, second.relations.bytes, "two builds are byte-identical");

  const claim = first.relations.value;
  assert.equal(claim.entities.length, 195);
  assert.equal(claim.relations.length, 25);
  assert.equal(claim.edges.length, 556);

  const entities = new Map(claim.entities.map((entity) => [entity.id, entity]));
  assert.equal(entities.size, claim.entities.length, "entity ids are unique");
  const declarations = new Map(claim.relations.map((relation) => [relation.name, relation]));
  assert.equal(declarations.size, claim.relations.length, "relation names are unique");
  assert.equal(
    claim.relations.some((relation) => relation.to === "*"),
    false,
    "polymorphic CORE-000 relations are projected to concrete PAP declarations",
  );
  assert.ok(declarations.has("subject:component"));
  assert.ok(declarations.has("subject:claim"));
  assert.ok(
    claim.edges.some(
      (edge) =>
        edge.relation === "cites" && edge.from === "C000-TR-001" && edge.to === "SRC-TR-001",
    ),
  );
  assert.ok(
    claim.edges.some(
      (edge) =>
        edge.relation === "citedBy" &&
        edge.from === "SRC-TR-001" &&
        edge.to === "C000-TR-001",
    ),
    "inverse edges are explicit",
  );

  const edgeKeys = new Set(claim.edges.map((edge) => `${edge.relation}\u0000${edge.from}\u0000${edge.to}`));
  for (const relation of claim.relations) {
    const baseName = relation.name.includes(":") ? relation.name.slice(0, relation.name.indexOf(":")) : relation.name;
    assert.ok(SUPPORTED_RELATIONS.has(baseName), `relation ${relation.name} is supported`);
    if (relation.inverse === undefined) continue;
    const inverse = declarations.get(relation.inverse);
    assert.ok(inverse, `${relation.name} inverse ${relation.inverse} is declared`);
    assert.equal(inverse.inverse, relation.name, `${relation.name} inverse is reciprocal`);
    assert.equal(inverse.from, relation.to, `${relation.name} inverse reverses kinds`);
    assert.equal(inverse.to, relation.from, `${relation.name} inverse reverses kinds`);
  }
  for (const edge of claim.edges) {
    const relation = declarations.get(edge.relation);
    assert.ok(relation, `edge relation ${edge.relation} is declared`);
    const from = entities.get(edge.from);
    const to = entities.get(edge.to);
    assert.ok(from, `edge from ${edge.from} is an entity`);
    assert.ok(to, `edge to ${edge.to} is an entity`);
    assert.equal(from.kind, relation.from, "edge from kind matches");
    assert.equal(to.kind, relation.to, "edge to kind matches");
    if (relation.inverse !== undefined) {
      assert.ok(
        edgeKeys.has(`${relation.inverse}\u0000${edge.to}\u0000${edge.from}`),
        `reciprocal edge exists for ${edge.relation}:${edge.from}->${edge.to}`,
      );
    }
  }
});

test("relations: the fixed supported map mirrors the CORE-000 profile declarations", async () => {
  const profile = JSON.parse(
    await readFile(path.join(root, "profiles/core000/profile.json"), "utf8"),
  ) as {
    relations: { name: string; from: string; to: string; inverse?: string }[];
  };

  assert.deepEqual(
    [...SUPPORTED_RELATIONS.keys()].sort(),
    profile.relations.map((relation) => relation.name).sort(),
  );
  for (const relation of profile.relations) {
    const supported = SUPPORTED_RELATIONS.get(relation.name);
    assert.ok(supported, `${relation.name} is in the fixed supported map`);
    assert.equal(supported.from, relation.from);
    assert.equal(supported.to, relation.to);
    assert.equal(supported.inverse, relation.inverse);
  }
});

test("claims: both files are canonical, deterministic and digest-addressable", async () => {
  const plan = buildCore000Claims(await realInput());
  for (const file of [plan.provenance, plan.relations]) {
    const text = decoder.decode(file.bytes);
    assert.equal(text.endsWith("\n"), true, `${file.path} ends with LF`);
    assert.deepEqual(JSON.parse(text), file.value, `${file.path} is canonical JSON`);
    assert.equal(claimDigest(file.bytes), domainHash("pap.claims.v1", file.bytes));
  }
  assert.equal(
    plan.provenance.value.bindings.length > 0 && plan.relations.value.edges.length > 0,
    true,
  );
});

test("quote resolution: exact matches win and normalized matches map back to raw bytes", () => {
  const exact = resolveExactQuote(utf8("intro unique quote outro"), "unique quote");
  assert.equal(decoder.decode(utf8("intro unique quote outro").subarray(exact.start, exact.end)), "unique quote");

  const wrapped = utf8("intro alpha\n  beta gamma\noutro");
  const normalized = resolveExactQuote(wrapped, "alpha beta gamma");
  assert.equal(decoder.decode(wrapped.subarray(normalized.start, normalized.end)), "alpha\n  beta gamma");
  assert.equal(normalized.digest, domainHash("pap.quote.v1", wrapped.subarray(normalized.start, normalized.end)));
});

test("quote resolution: surrogate pairs keep UTF-16 indices aligned with byte offsets", () => {
  const source = utf8("before 😀 alpha beta after\n");
  const resolved = resolveExactQuote(source, "alpha beta");
  assert.equal(decoder.decode(source.subarray(resolved.start, resolved.end)), "alpha beta");
  assert.equal(resolved.digest, domainHash("pap.quote.v1", utf8("alpha beta")));

  const wrapped = utf8("before 😀 alpha\n  😀 beta after\n");
  const normalized = resolveExactQuote(wrapped, "alpha 😀 beta");
  assert.equal(
    decoder.decode(wrapped.subarray(normalized.start, normalized.end)),
    "alpha\n  😀 beta",
  );
});

test("claims: JSON pointers can traverse array indices", () => {
  const input = synthetic({
    manifest: {
      inputs: [
        {
          path: "claims.yml",
          format: "yaml",
          entities: [{ kind: "claim", pointer: "/groups/0/claims" }],
        },
      ],
      sources: [{ id: "SRC-X" }],
    },
    documents: {
      "claims.yml": { groups: [{ claims: [{ id: "C1" }] }] },
    },
    source: { id: "SRC-X", text: "source\n" },
  });
  const plan = buildCore000Claims(input);
  assert.deepEqual(plan.relations.value.entities, [{ id: "C1", kind: "claim" }]);
});

test("provenance: missing, ambiguous, duplicate and mismatched declarations fail packaging", () => {
  assert.throws(
    () => buildCore000Claims(provenanceInput("absent quote", "alpha beta\n")),
    /missing from the source/,
  );
  assert.throws(
    () => buildCore000Claims(provenanceInput("alpha beta", "alpha beta\nalpha beta\n")),
    /ambiguous in the source/,
  );
  assert.throws(
    () => buildCore000Claims(provenanceInput("same", "same same\n")),
    /ambiguous in the source/,
  );
  assert.throws(
    () => buildCore000Claims(provenanceInput("alpha beta", "alpha beta\n", { source: "SRC-Y" })),
    /names source "SRC-Y"/,
  );
  assert.throws(
    () => buildCore000Claims(provenanceInput("", "alpha\n")),
    /must be a non-empty string/,
  );

  const duplicate = provenanceInput("alpha", "alpha\n");
  const document = YAML.parse(decoder.decode(duplicate.inputBytes.get("claims.yml") as Uint8Array)) as {
    sourceStatements: unknown[];
  };
  document.sourceStatements.push(document.sourceStatements[0]);
  const duplicated = new Map(duplicate.inputBytes);
  duplicated.set("claims.yml", utf8(YAML.stringify(document)));
  assert.throws(
    () => buildCore000Claims({ ...duplicate, inputBytes: duplicated }),
    /declared more than once/,
  );
});

test("provenance: the packaged source id must be declared", () => {
  const input = provenanceInput("alpha", "alpha\n");
  assert.throws(
    () => buildCore000Claims({ ...input, source: { id: "SRC-UNDECLARED", bytes: input.source.bytes } }),
    /not declared in contract-builder\.json/,
  );
});

test("relations: unknown relation kinds fail packaging instead of being skipped", () => {
  assert.throws(
    () =>
      buildCore000Claims(
        relationsInput([{ id: "C1", relations: { mystery: ["EV-1"] } }], [{ id: "EV-1" }]),
      ),
    /unsupported relation kind "mystery"/,
  );
});

test("relations: undeclared endpoints and kind mismatches fail packaging", () => {
  assert.throws(
    () =>
      buildCore000Claims(
        relationsInput([{ id: "C1", relations: { evidencedBy: ["EV-MISSING"] } }]),
      ),
    /targets undeclared entity "EV-MISSING"/,
  );
  assert.throws(
    () =>
      buildCore000Claims(
        relationsInput([{ id: "C1", relations: { cites: ["EV-1"] } }], [{ id: "EV-1" }]),
      ),
    /expected "source_statement"/,
  );
});

test("relations: inverse pairs are emitted in both directions with reciprocal declarations", () => {
  const plan = buildCore000Claims(
    relationsInput([], [], {
      components: [{ id: "COMP-1", relations: { provides: ["IF-1"] } }],
      interfaces: [{ id: "IF-1" }],
    }),
  );
  const claim = plan.relations.value;
  assert.deepEqual(claim.relations, [
    {
      name: "providedBy",
      from: "interface",
      to: "component",
      inverse: "provides",
    },
    { name: "provides", from: "component", to: "interface", inverse: "providedBy" },
  ]);
  assert.deepEqual(claim.edges, [
    { relation: "providedBy", from: "IF-1", to: "COMP-1" },
    { relation: "provides", from: "COMP-1", to: "IF-1" },
  ]);
});
