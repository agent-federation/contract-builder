import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DIMENSION_ORDER } from "../src/state.js";
import { fixtures, root } from "./support.js";

/**
 * Meta-tests for the machine-readable conformance map (ODR-PAP-006 A6,
 * design note §2 I5/I6 and §6 S4).
 *
 * `requirements.json` is the contract between `pap/src` and the corpus: every
 * emitted diagnostic code and every RFC requirement R1-R12 must map to a case,
 * or to a focused unit test when a static package cannot reach the branch.
 * This file owns those meta-tests; `conformance.test.ts` owns the case runner
 * and the I5 dimension-correlation check over the reports it already emits.
 */

interface CaseExpect {
  verdict?: string;
  diagnosticCodes?: string[];
  limitationCodes?: string[];
}

interface CaseEntry {
  caseId: string;
  noReport?: boolean;
  stderrCodes?: string[];
  document?: "inspection" | "explanation";
  expect?: CaseExpect;
}

interface UnitOnlyEntry {
  unitTest?: { file: string; marker: string };
  reason: string;
}

interface RequirementsMap {
  fixtureSetVersion: string;
  codes: Record<string, string[]>;
  unitOnlyCodes: Record<string, UnitOnlyEntry>;
  requirements: Record<string, string[]>;
  requirementNotes?: Record<string, string>;
  verdictCause: Record<string, string | string[]>;
  verdictCauseExceptions: Record<string, string>;
}

const suite = JSON.parse(readFileSync(path.join(fixtures, "cases.json"), "utf8")) as {
  cases: CaseEntry[];
};
const requirements = JSON.parse(
  readFileSync(path.join(fixtures, "requirements.json"), "utf8"),
) as RequirementsMap;

const casesById = new Map(suite.cases.map((entry) => [entry.caseId, entry]));

const DIAGNOSTIC_TOKEN = /pap\.[a-z0-9./-]+/g;
const DIAGNOSTIC_CODE = /^pap\.[a-z0-9-]+\.[a-z0-9-]+$/;
const DOMAIN_OR_VERSION_SUFFIX = /\.v\d+(\.\d+)?$/;

// Comments are stripped so a code named only in prose cannot satisfy coverage.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function diagnosticCodesIn(source: string): string[] {
  const codes: string[] = [];
  for (const match of stripComments(source).matchAll(DIAGNOSTIC_TOKEN)) {
    const token = match[0];
    if (
      DIAGNOSTIC_CODE.test(token) &&
      !DOMAIN_OR_VERSION_SUFFIX.test(token) &&
      token !== "pap.verifier.reference"
    ) {
      codes.push(token);
    }
  }
  return codes;
}

function sourceFilesUnder(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFilesUnder(entryPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

function emittedDiagnosticCodes(): string[] {
  const codes = new Set<string>();
  for (const file of sourceFilesUnder(path.join(root, "src"))) {
    for (const code of diagnosticCodesIn(readFileSync(file, "utf8"))) {
      codes.add(code);
    }
  }
  return [...codes].sort();
}

function expectedCodes(entry: CaseEntry): Set<string> {
  return new Set([
    ...(entry.expect?.diagnosticCodes ?? []),
    ...(entry.expect?.limitationCodes ?? []),
    ...(entry.stderrCodes ?? []),
  ]);
}

function unitTestSource(file: string): string {
  return stripComments(readFileSync(path.join(root, "tests", file), "utf8"));
}

/**
 * Skip one quoted string or template literal starting at `start` (a quote or a
 * backtick) and return the index just past it. A template placeholder
 * (`${...}`) is skipped recursively, so a nested quote, backtick or bracket
 * inside it cannot terminate the literal early.
 */
function skipQuoted(source: string, start: number): number {
  const quote = source[start] as string;
  let index = start + 1;
  while (index < source.length) {
    const char = source[index] as string;
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === quote) return index + 1;
    if (quote === "`" && char === "$" && source[index + 1] === "{") {
      index = skipTemplatePlaceholder(source, index + 2);
      continue;
    }
    index += 1;
  }
  return index;
}

function skipTemplatePlaceholder(source: string, start: number): number {
  let depth = 1;
  let index = start;
  while (index < source.length) {
    const char = source[index] as string;
    if (char === '"' || char === "'" || char === "`") {
      index = skipQuoted(source, index);
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return index;
}

/**
 * Character spans of every `assert`/`assert.*(...)` call in the stripped
 * source. Parentheses inside strings and template literals are ignored so a
 * literal such as `"("` cannot unbalance the scan; template placeholders are
 * followed so nested literals cannot end a literal early.
 */
function assertionSpans(source: string): [number, number][] {
  const spans: [number, number][] = [];
  const isWordChar = (char: string | undefined): boolean =>
    char !== undefined && /[A-Za-z0-9_$]/.test(char);
  let index = 0;
  while (index < source.length) {
    const char = source[index] as string;
    if (char === '"' || char === "'" || char === "`") {
      index = skipQuoted(source, index);
      continue;
    }
    if (
      source.startsWith("assert", index) &&
      !isWordChar(source[index - 1]) &&
      !isWordChar(source[index + "assert".length])
    ) {
      let cursor = index + "assert".length;
      while (cursor < source.length && /\s/.test(source[cursor] as string)) cursor += 1;
      if (source[cursor] === ".") {
        cursor += 1;
        while (cursor < source.length && /[A-Za-z0-9_$]/.test(source[cursor] as string))
          cursor += 1;
      }
      while (cursor < source.length && /\s/.test(source[cursor] as string)) cursor += 1;
      if (source[cursor] === "(") {
        let depth = 0;
        let end = cursor;
        while (end < source.length) {
          const token = source[end] as string;
          if (token === '"' || token === "'" || token === "`") {
            end = skipQuoted(source, end);
            continue;
          }
          if (token === "(") {
            depth += 1;
          } else if (token === ")") {
            depth -= 1;
            if (depth === 0) break;
          }
          end += 1;
        }
        spans.push([cursor, end]);
        index = end;
        continue;
      }
    }
    index += 1;
  }
  return spans;
}

/** The code-shaped marker must occur inside an `assert` call, not merely in a
 * string literal that the test builds without asserting it. */
function assertionContains(source: string, marker: string): boolean {
  const spans = assertionSpans(source);
  for (
    let index = source.indexOf(marker);
    index !== -1;
    index = source.indexOf(marker, index + 1)
  ) {
    if (spans.some(([start, end]) => index > start && index < end)) return true;
  }
  return false;
}

test("assertionContains follows nested template placeholders", () => {
  // A nested backtick in a placeholder used to end the literal early and could
  // hide the closing parenthesis of the assert call (Gemini review, PR #231).
  const asserted = 'assert.equal(value, `prefix ${fn(`)`)} suffix "pap.example.asserted-code"`);';
  assert.equal(assertionContains(asserted, "pap.example.asserted-code"), true);
  assert.equal(
    assertionContains('const code = "pap.example.unasserted-code";', "pap.example.unasserted-code"),
    false,
  );
});

test("requirements.json covers every diagnostic code pap/src emits", () => {
  const emitted = emittedDiagnosticCodes();
  assert.ok(emitted.length > 0, "no diagnostic codes were extracted from pap/src");

  const mapped = new Set([
    ...Object.keys(requirements.codes),
    ...Object.keys(requirements.unitOnlyCodes),
  ]);
  const uncovered = emitted.filter((code) => !mapped.has(code));
  assert.deepEqual(
    uncovered,
    [],
    `diagnostic codes without a case or unit-only entry: ${uncovered.join(", ")}`,
  );

  const stale = [...mapped].filter((code) => !emitted.includes(code));
  assert.deepEqual(
    stale,
    [],
    `requirements.json names codes pap/src does not emit: ${stale.join(", ")}`,
  );
});

test("cases only expect diagnostic codes pap/src emits", () => {
  const emitted = new Set(emittedDiagnosticCodes());
  const unknown = new Set<string>();
  for (const entry of suite.cases) {
    for (const code of expectedCodes(entry)) {
      if (!emitted.has(code)) unknown.add(code);
    }
  }
  assert.deepEqual(
    [...unknown].sort(),
    [],
    `cases expect codes pap/src does not emit: ${[...unknown].sort().join(", ")}`,
  );
});

test("requirements.json codes map to real cases that assert them", () => {
  for (const [code, caseIds] of Object.entries(requirements.codes)) {
    assert.ok(caseIds.length > 0, `${code} has no case`);
    assert.deepEqual(
      [...caseIds].sort(),
      [...new Set(caseIds)].sort(),
      `${code} repeats a case id`,
    );
    for (const caseId of caseIds) {
      const entry = casesById.get(caseId);
      assert.ok(entry, `${code} names unknown case ${caseId}`);
      assert.ok(expectedCodes(entry).has(code), `${caseId} does not assert ${code}`);
    }
  }
});

test("unit-only codes name a focused unit test and no case", () => {
  const expectedByCase = new Set<string>();
  for (const entry of suite.cases) {
    for (const code of expectedCodes(entry)) expectedByCase.add(code);
  }

  for (const [code, exemption] of Object.entries(requirements.unitOnlyCodes)) {
    assert.ok(requirements.codes[code] === undefined, `${code} is both case-mapped and unit-only`);
    assert.ok(!expectedByCase.has(code), `${code} is expected by a case and must not be unit-only`);
    assert.ok(
      typeof exemption.reason === "string" && exemption.reason.length > 0,
      `${code} has no reason`,
    );
    if (exemption.unitTest !== undefined) {
      assert.ok(
        existsSync(path.join(root, "tests", exemption.unitTest.file)),
        `${code} names a missing unit test file`,
      );
      const source = unitTestSource(exemption.unitTest.file);
      assert.ok(
        assertionContains(source, exemption.unitTest.marker),
        `${code} exemption names ${exemption.unitTest.file}, which does not assert ${exemption.unitTest.marker}`,
      );
      assert.equal(
        source.includes(exemption.unitTest.marker),
        true,
        `${code} marker must still occur in ${exemption.unitTest.file}`,
      );
    }
  }
});

test("every RFC requirement R1-R12 maps to a case", () => {
  const requirementIds = Array.from({ length: 12 }, (_, index) => `R${index + 1}`);
  assert.deepEqual(
    Object.keys(requirements.requirements).sort(
      (left, right) => Number(left.slice(1)) - Number(right.slice(1)),
    ),
    requirementIds,
    "the requirements map must carry exactly R1-R12",
  );

  for (const requirement of requirementIds) {
    const caseIds = requirements.requirements[requirement];
    assert.ok(caseIds !== undefined, `${requirement} has no entry`);
    assert.ok(caseIds.length > 0, `${requirement} has no case`);
    for (const caseId of caseIds) {
      assert.ok(casesById.has(caseId), `${requirement} names unknown case ${caseId}`);
    }
  }

  for (const [requirement, note] of Object.entries(requirements.requirementNotes ?? {})) {
    assert.ok(
      requirements.requirements[requirement] !== undefined,
      `note for unknown ${requirement}`,
    );
    assert.ok(note.length > 0, `${requirement} note is empty`);
  }
});

test("verdictCause maps emitted codes to known dimensions", () => {
  const emitted = new Set(emittedDiagnosticCodes());
  const dimensions = new Set<string>(DIMENSION_ORDER);

  for (const [code, value] of Object.entries(requirements.verdictCause)) {
    assert.ok(emitted.has(code), `verdictCause names a code pap/src does not emit: ${code}`);
    const mapped = Array.isArray(value) ? value : [value];
    assert.ok(mapped.length > 0, `${code} has no dimension`);
    assert.deepEqual(
      [...mapped].sort(),
      [...new Set(mapped)].sort(),
      `${code} repeats a dimension`,
    );
    for (const dimension of mapped) {
      assert.ok(dimensions.has(dimension), `${code} names unknown dimension ${dimension}`);
    }
  }

  for (const [caseId, reason] of Object.entries(requirements.verdictCauseExceptions)) {
    const entry = casesById.get(caseId);
    assert.ok(entry, `verdictCauseExceptions names unknown case ${caseId}`);
    assert.equal(
      entry?.noReport ?? false,
      false,
      `${caseId} has no report and cannot be a verdict exception`,
    );
    assert.notEqual(
      entry?.expect?.verdict,
      "PASS",
      `${caseId} passes and cannot be a verdict exception`,
    );
    assert.ok(typeof reason === "string" && reason.length > 0, `${caseId} exception has no reason`);
  }
});

test("every non-PASS report case names a verdict cause (I5a)", () => {
  for (const entry of suite.cases) {
    if (entry.noReport) continue;
    if (entry.document !== undefined) continue;
    const verdict = entry.expect?.verdict;
    assert.ok(verdict, `${entry.caseId} has no report expectation`);

    const exception = requirements.verdictCauseExceptions[entry.caseId];
    if (verdict === "PASS") {
      assert.equal(
        exception,
        undefined,
        `${entry.caseId} passes and cannot be a verdict exception`,
      );
      continue;
    }

    const mapped = [...expectedCodes(entry)].filter(
      (code) => requirements.verdictCause[code] !== undefined,
    );
    assert.ok(
      mapped.length > 0,
      `${entry.caseId}: (a) no expected diagnostic or limitation code is in verdictCause`,
    );
  }
});
