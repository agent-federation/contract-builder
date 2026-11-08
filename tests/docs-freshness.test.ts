/**
 * Documentation freshness checks (Issue #149, extended by D4 / Issue #249).
 *
 * Three hand-maintained documentation facts are checked here:
 *
 * 1. The implementation-status matrix records the CORE-000 claim count declared by
 *    `contracts/core000/claims.yml` (Issue #149).
 * 2. The same matrix records a SHA-256 snapshot of the whole
 *    `docs/architecture/engine-public-contract.md`; when the contract changes, the hash must be
 *    updated in the same pull request (the #159 obligation).
 * 3. Every `core.*` / `pap.*` diagnostic code emitted from production TypeScript appears in the
 *    canonical `docs/architecture/diagnostic-code-registry.md` (or in its exact-match,
 *    documented allowlist of non-diagnostic namespaced identifiers).
 *
 * Deliberately cheap and deterministic: file reads, one YAML parse and a lexical scan of source
 * text. No build, no network.
 *
 * The `validate*` / `*Findings` helpers take text so the mutation tests below can prove that a
 * deliberate contract edit or a new undocumented emitted code fails the check and that updating
 * the documentation makes it pass again.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { parse as parseYaml } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));

const CONTRACT_PATH = "docs/architecture/engine-public-contract.md";
const STATUS_PATH = "docs/architecture/implementation-status.md";
const REGISTRY_PATH = "docs/architecture/diagnostic-code-registry.md";

/** The one claim-count sentence this test owns. Keep it in sync with implementation-status.md. */
const CLAIM_COUNT_SENTENCE =
  /`contracts\/core000\/claims\.yml`\s+declares\s+\*\*(\d+) claims?\*\*/g;

/** The one engine-contract snapshot sentence. Keep it in sync with implementation-status.md. */
const CONTRACT_SNAPSHOT_SENTENCE =
  /`docs\/architecture\/engine-public-contract\.md`\s+has SHA-256\s+`([0-9a-f]{64})`/g;

/**
 * Production source roots that may emit a namespaced diagnostic code: the engine, the profiles,
 * the independent verifier, the pipeline and the CORE-000 harness. Tests and fixtures are
 * excluded on purpose; a test-only code does not need a product registry row.
 */
const SOURCE_ROOTS = ["spec", "profiles", "pap/src", "pipeline", "contracts"] as const;

const TEST_PATH_SEGMENT = /^(?:tests?|fixtures?)$/;
const TEST_FILE_SUFFIX = /\.test\.ts$/;

/** A namespaced identifier this check cares about: at least three lower-case segments. */
const NAMESPACED_CODE = /^(?:core|pap)\.[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

const DIAGNOSTIC_SECTIONS = [
  "Core engine diagnostic codes",
  "PAP verifier diagnostic codes",
] as const;
const ALLOWLIST_SECTION = "Non-diagnostic allowlist";

interface ClaimsRegister {
  claims?: unknown;
}

export interface DiagnosticRegistry {
  codes: Set<string>;
  allowlist: Set<string>;
  allowlistReasons: Map<string, string>;
  findings: string[];
}

export function lfNormalized(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** SHA-256 of the LF-normalized UTF-8 bytes. Deterministic across checkout line endings. */
export function contractHash(text: string): string {
  return createHash("sha256").update(lfNormalized(text), "utf8").digest("hex");
}

export function snapshotFindings(contractText: string, statusText: string): string[] {
  const expected = contractHash(contractText);
  const matches = [...statusText.matchAll(CONTRACT_SNAPSHOT_SENTENCE)];
  if (matches.length !== 1) {
    return [
      "implementation-status.md must contain exactly one engine-contract snapshot sentence " +
        `(\`${CONTRACT_PATH}\` has SHA-256 \`<64 hex characters>\`)`,
    ];
  }
  const recorded = matches[0]?.[1];
  if (recorded !== expected) {
    return [
      "the engine-contract snapshot hash in implementation-status.md is stale: " +
        `recorded ${recorded ?? "<missing>"}, computed ${expected}; ` +
        "update it in the same pull request as the contract change",
    ];
  }
  return [];
}

/**
 * Parse the canonical registry. Diagnostic rows are the first backticked cell of a table row in
 * the core/PAP sections; allowlist rows use the same shape in their own section. The parser also
 * records structural findings (missing sections, non-exact or unexplained allowlist entries).
 */
export function parseDiagnosticRegistry(text: string): DiagnosticRegistry {
  const sections = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const name = heading[1];
      if (name !== undefined) {
        current = name;
        sections.set(name, []);
      }
      continue;
    }
    if (current !== null) {
      sections.get(current)?.push(line);
    }
  }

  const codes = new Set<string>();
  const findings: string[] = [];
  for (const name of DIAGNOSTIC_SECTIONS) {
    const lines = sections.get(name);
    if (lines === undefined) {
      findings.push(`registry is missing the "${name}" section`);
      continue;
    }
    for (const line of lines) {
      const match = /^\|\s*`([^`]+)`\s*\|/.exec(line);
      if (match === null) {
        continue;
      }
      const code = match[1] ?? "";
      if (!NAMESPACED_CODE.test(code)) {
        findings.push(`registry row "${code}" in "${name}" is not a namespaced code`);
        continue;
      }
      const expectedPrefix = name === "Core engine diagnostic codes" ? "core." : "pap.";
      if (!code.startsWith(expectedPrefix)) {
        findings.push(`registry row ${code} is in the "${name}" section`);
        continue;
      }
      if (codes.has(code)) {
        findings.push(`registry lists ${code} more than once`);
        continue;
      }
      codes.add(code);
    }
  }

  const allowlist = new Set<string>();
  const allowlistReasons = new Map<string, string>();
  const allowlistLines = sections.get(ALLOWLIST_SECTION);
  if (allowlistLines === undefined) {
    findings.push(`registry is missing the "${ALLOWLIST_SECTION}" section`);
  } else {
    for (const line of allowlistLines) {
      const match = /^\|\s*`([^`]+)`\s*\|(.*)\|\s*$/.exec(line);
      if (match === null) {
        continue;
      }
      const identifier = match[1] ?? "";
      const reason = (match[2] ?? "").replace(/\|/g, " ").replace(/\s+/g, " ").trim();
      if (!NAMESPACED_CODE.test(identifier)) {
        findings.push(`allowlist entry "${identifier}" is not a namespaced identifier`);
        continue;
      }
      if (reason === "" || reason === "—" || reason === "-") {
        findings.push(`allowlist entry ${identifier} has no documented reason`);
        continue;
      }
      if (allowlist.has(identifier)) {
        findings.push(`allowlist lists ${identifier} more than once`);
        continue;
      }
      allowlist.add(identifier);
      allowlistReasons.set(identifier, reason);
    }
  }

  return { codes, allowlist, allowlistReasons, findings };
}

/** Extract namespace-shaped string literals from TypeScript source text. */
export function namespacedStringLiterals(text: string): string[] {
  const source = ts.createSourceFile(
    "docs-freshness-probe.ts",
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TS,
  );
  const values: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (NAMESPACED_CODE.test(node.text)) {
        values.push(node.text);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values;
}

export interface ScannedCodes {
  /** code -> sorted repository-relative files that contain it as a string literal */
  files: Map<string, Set<string>>;
}

export async function scanSourceCodes(
  projectRoot: string,
  sourceRoots: readonly string[] = SOURCE_ROOTS,
): Promise<ScannedCodes> {
  const files = new Map<string, Set<string>>();
  for (const sourceRoot of sourceRoots) {
    for (const file of await walkTypeScriptFiles(projectRoot, sourceRoot)) {
      const text = await readFile(file, "utf8");
      const relative = path.relative(projectRoot, file).split(path.sep).join("/");
      for (const code of namespacedStringLiterals(text)) {
        let locations = files.get(code);
        if (locations === undefined) {
          locations = new Set<string>();
          files.set(code, locations);
        }
        locations.add(relative);
      }
    }
  }
  return { files };
}

async function walkTypeScriptFiles(projectRoot: string, relativeRoot: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (TEST_PATH_SEGMENT.test(entry.name)) {
          continue;
        }
        await visit(absolute);
        continue;
      }
      if (!entry.name.endsWith(".ts") || TEST_FILE_SUFFIX.test(entry.name)) {
        continue;
      }
      out.push(absolute);
    }
  };
  await visit(path.join(projectRoot, relativeRoot));
  return out.sort();
}

/**
 * Findings for emitted codes that are neither documented as diagnostics nor explicitly
 * allowlisted. One finding per code, naming the files that emit it.
 */
export function diagnosticCoverageFindings(
  scanned: ScannedCodes,
  registry: DiagnosticRegistry,
): string[] {
  const findings: string[] = [];
  for (const [code, locations] of [...scanned.files.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (registry.codes.has(code) || registry.allowlist.has(code)) {
      continue;
    }
    findings.push(
      `${[...locations].sort().join(", ")} emits ${code}, but ${REGISTRY_PATH} does not ` +
        "document it and its allowlist does not name it",
    );
  }
  return findings;
}

/**
 * The allowlist must stay narrow and honest: every entry must be an identifier production code
 * actually uses, must have a reason, and must not also be documented as a diagnostic (which
 * would let a real diagnostic escape the registry).
 */
export function allowlistFindings(scanned: ScannedCodes, registry: DiagnosticRegistry): string[] {
  const findings: string[] = [];
  for (const identifier of [...registry.allowlist].sort()) {
    if (registry.codes.has(identifier)) {
      findings.push(`${identifier} is allowlisted and also documented as a diagnostic code`);
    }
    if (!scanned.files.has(identifier)) {
      findings.push(`allowlist entry ${identifier} is not used by any scanned production source`);
    }
    if (registry.allowlistReasons.get(identifier) === undefined) {
      findings.push(`allowlist entry ${identifier} has no documented reason`);
    }
  }
  return findings;
}

async function readProjectFile(relative: string): Promise<string> {
  return readFile(path.join(root, relative), "utf8");
}

test("documentation freshness: CORE-000 claim count matches claims.yml", async () => {
  const statusText = await readProjectFile(STATUS_PATH);
  const matches = [...statusText.matchAll(CLAIM_COUNT_SENTENCE)];
  assert.equal(
    matches.length,
    1,
    "implementation-status.md must contain exactly one CORE-000 register freshness sentence",
  );
  const match = matches[0];
  assert.ok(match, "freshness sentence must be present");
  const documentedCount = Number(match[1]);
  assert.ok(
    Number.isInteger(documentedCount) && documentedCount > 0,
    "the freshness sentence must state a positive integer claim count",
  );

  const register = parseYaml(
    await readFile(path.join(root, "contracts", "core000", "claims.yml"), "utf8"),
  ) as ClaimsRegister | null;
  assert.ok(
    register && typeof register === "object",
    "claims.yml must parse to a valid YAML object",
  );
  assert.ok(Array.isArray(register.claims), "claims.yml must declare a claims array");

  assert.equal(
    documentedCount,
    register.claims.length,
    "the claim count in docs/architecture/implementation-status.md must equal the number of " +
      "claims in contracts/core000/claims.yml; update the snapshot sentence in the same change",
  );
});

test("documentation freshness: engine-contract snapshot hash matches the contract", async () => {
  const findings = snapshotFindings(
    await readProjectFile(CONTRACT_PATH),
    await readProjectFile(STATUS_PATH),
  );
  assert.deepEqual(findings, [], findings.join("\n"));
});

test("documentation freshness: every emitted diagnostic code is documented", async () => {
  const registry = parseDiagnosticRegistry(await readProjectFile(REGISTRY_PATH));
  assert.deepEqual(registry.findings, [], registry.findings.join("\n"));

  const scanned = await scanSourceCodes(root);
  const findings = diagnosticCoverageFindings(scanned, registry);
  assert.deepEqual(findings, [], findings.join("\n"));
});

test("documentation freshness: the non-diagnostic allowlist is exact and narrow", async () => {
  const registry = parseDiagnosticRegistry(await readProjectFile(REGISTRY_PATH));
  const scanned = await scanSourceCodes(root);
  const findings = allowlistFindings(scanned, registry);
  assert.deepEqual(findings, [], findings.join("\n"));
});

test("docs freshness mutation: a changed contract fails until the snapshot hash is updated", async () => {
  const contractText = await readProjectFile(CONTRACT_PATH);
  const statusText = await readProjectFile(STATUS_PATH);
  assert.deepEqual(snapshotFindings(contractText, statusText), []);

  // Deliberately change the contract bytes without touching the recorded snapshot.
  const changedContract = `${contractText}\n<!-- deliberate docs-freshness mutation -->\n`;
  const stale = snapshotFindings(changedContract, statusText);
  assert.equal(stale.length, 1, "a changed contract must fail the snapshot check");
  assert.match(stale[0] ?? "", /snapshot hash .* is stale/);

  // Fixing the documentation in the same change makes the check pass again.
  const recorded = [...statusText.matchAll(CONTRACT_SNAPSHOT_SENTENCE)][0]?.[1];
  assert.ok(recorded, "the real status matrix must record a snapshot hash");
  const updatedStatus = statusText.replace(recorded, contractHash(changedContract));
  assert.deepEqual(snapshotFindings(changedContract, updatedStatus), []);
});

test("docs freshness mutation: a new emitted code fails until the registry documents it", async () => {
  const registryText = await readProjectFile(REGISTRY_PATH);
  const documented = `const code = "core.docs-freshness.documented";\n`;
  const scanned = {
    files: new Map([
      ["core.docs-freshness.documented", new Set(["spec/lib/example.ts"])],
      ["core.docs-freshness.undocumented", new Set(["spec/lib/example.ts"])],
    ]),
  };

  const realRegistry = parseDiagnosticRegistry(registryText);
  const fails = diagnosticCoverageFindings(scanned, realRegistry);
  assert.equal(fails.length, 2, "both synthetic codes start undocumented");

  // Adding only the first code to the real registry leaves exactly the second one failing.
  const withOneRow = registryText.replace(
    "\n## PAP verifier diagnostic codes",
    "\n| `core.docs-freshness.documented` | Engine | deliberate mutation row |\n\n" +
      "## PAP verifier diagnostic codes",
  );
  const partiallyFixed = parseDiagnosticRegistry(withOneRow);
  const stillFailing = diagnosticCoverageFindings(scanned, partiallyFixed);
  assert.equal(stillFailing.length, 1);
  assert.match(stillFailing[0] ?? "", /core\.docs-freshness\.undocumented/);

  // Documenting both emitted codes makes the check pass.
  const bothRows = withOneRow.replace(
    "\n## PAP verifier diagnostic codes",
    "\n| `core.docs-freshness.undocumented` | Engine | deliberate mutation row |\n\n" +
      "## PAP verifier diagnostic codes",
  );
  assert.deepEqual(diagnosticCoverageFindings(scanned, parseDiagnosticRegistry(bothRows)), []);

  // Sanity: the synthetic source scan sees the literals, and ignores comments and lookalikes.
  assert.deepEqual(namespacedStringLiterals(documented).sort(), ["core.docs-freshness.documented"]);
  assert.deepEqual(namespacedStringLiterals(`// "core.docs-freshness.comment"\n`), []);
  assert.deepEqual(namespacedStringLiterals(`const x = "core." + suffix;`), []);
});

test("docs freshness mutation: the file scan sees a new emitted code and skips tests", async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "docs-freshness-"));
  try {
    const lib = path.join(scratch, "spec", "lib");
    await mkdir(lib, { recursive: true });
    await writeFile(
      path.join(lib, "probe.ts"),
      'const code = "core.docs-freshness.from-file";\n',
      "utf8",
    );
    await writeFile(
      path.join(lib, "probe.test.ts"),
      'const testOnly = "core.docs-freshness.test-only";\n',
      "utf8",
    );

    const scanned = await scanSourceCodes(scratch, ["spec"]);
    assert.deepEqual([...scanned.files.keys()], ["core.docs-freshness.from-file"]);
    assert.deepEqual(
      [...(scanned.files.get("core.docs-freshness.from-file") ?? [])],
      ["spec/lib/probe.ts"],
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
