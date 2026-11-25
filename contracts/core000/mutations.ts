import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Deterministic, named one-field mutations for the S1/S2.3 negative cases. */
export const MUTATION_NAMES = [
  "claim",
  "unresolved-subject",
  "implemented-without-evidence",
  "quote-outside",
  "decision-missing",
  "unsupported-guarantee",
  "status-class-conflict",
  "interface-owner-mismatch",
  "evidence-locator",
  "evidence-orphan",
  "surface-claim-missing",
] as const;

export type MutationName = (typeof MUTATION_NAMES)[number];

/** The focused S2.3 mutations are the only ones that edit `structure.yml`. */
const MUTATION_FILE: Record<MutationName, "claims.yml" | "structure.yml"> = {
  claim: "claims.yml",
  "unresolved-subject": "claims.yml",
  "implemented-without-evidence": "claims.yml",
  "quote-outside": "claims.yml",
  "decision-missing": "claims.yml",
  "unsupported-guarantee": "claims.yml",
  "status-class-conflict": "claims.yml",
  "interface-owner-mismatch": "structure.yml",
  "evidence-locator": "claims.yml",
  "evidence-orphan": "claims.yml",
  "surface-claim-missing": "claims.yml",
};

const MANIFEST_CLAIM_STATEMENT =
  '    statement: "M1 supports exactly one manifest.render declaration; zero or multiple declarations are rejected with core.manifest.invalid before rendering or writing."';

const MANIFEST_CLAIM_SUBJECT = "      subject: [IF-MANIFEST]";

const MANIFEST_EVIDENCE = "      evidencedBy: [EV-MANIFEST-CODE, EV-MANIFEST-TEST]\n";

const MANIFEST_DECISION = "      decidedBy: [DEC-PR-56]\n";

const MANIFEST_QUOTE =
  '    source_quote: "`render` keeps its array shape for forward compatibility, but **M1 supports exactly one render declaration**. Zero declarations and more than one are rejected with `core.manifest.invalid` during manifest validation, before any input is rendered or any artifact is written; multi-target rendering is deferred."';

const PROVENANCE_QUOTE =
  '    source_quote: "A `ProvenanceBinding` says where evidence is claimed to come from. It does not say that the claim was checked. The core attaches a `not-checked` verification record when it binds, so an unverified binding is explicit rather than implicit."';

/**
 * Applies exactly one named mutation to a fresh temporary project copy. Each mutation edits one
 * field; the repository is never a target.
 */
export async function applyMutation(projectDir: string, name: MutationName): Promise<void> {
  const file = path.join(projectDir, MUTATION_FILE[name]);
  const text = await readFile(file, "utf8");
  const next = mutate(text, name);
  await writeFile(file, next, "utf8");
}

function mutate(text: string, name: MutationName): string {
  switch (name) {
    case "claim":
      return replaceOnce(
        text,
        MANIFEST_CLAIM_STATEMENT,
        `${MANIFEST_CLAIM_STATEMENT.slice(0, -1)} (S1 identity probe)."`,
      );
    case "unresolved-subject":
      return replaceOnce(text, MANIFEST_CLAIM_SUBJECT, "      subject: [IF-MISSING]");
    case "implemented-without-evidence":
      return removeOnce(text, MANIFEST_EVIDENCE);
    case "quote-outside":
      return replaceOnce(text, MANIFEST_QUOTE, PROVENANCE_QUOTE);
    case "decision-missing":
      return removeOnce(text, MANIFEST_DECISION);
    case "unsupported-guarantee":
      return removeLineInClaim(text, "C000-CT-011", "    conditions: ");
    case "status-class-conflict":
      return replaceLineInClaim(text, "C000-CT-001", "    class: ", "    class: non_goal");
    case "interface-owner-mismatch":
      return replaceLineInStructure(text, "IF-ADAPTER", "  owner: ", "  owner: COMP-CORE");
    case "evidence-locator":
      return replaceLineInRecord(
        text,
        "  - id: EV-CODE-SPEC-LIB-SCHEMA-TS\n",
        "\n  - id: ",
        "    locator: ",
        '    locator: " "',
      );
    case "evidence-orphan":
      return removeLineInRecord(
        text,
        "  - id: C000-CT-006\n",
        "\n  - id: ",
        "        - EV-CODE-SPEC-LIB-ADAPTERS-MARKDOWN-TS",
      );
    case "surface-claim-missing":
      return replaceLineInRecord(
        text,
        "  - id: C000-CT-006\n",
        "\n  - id: ",
        "        - IF-ADAPTER",
        "        - IF-CLI",
      );
  }
}

function replaceOnce(text: string, search: string, replacement: string): string {
  const first = text.indexOf(search);
  if (first < 0) throw new Error(`Mutation anchor not found: ${search.slice(0, 60)}`);
  if (text.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Mutation anchor is not unique: ${search.slice(0, 60)}`);
  }
  return text.slice(0, first) + replacement + text.slice(first + search.length);
}

function removeOnce(text: string, search: string): string {
  return replaceOnce(text, search, "");
}

function replaceLineInClaim(
  text: string,
  claimId: string,
  prefix: string,
  replacement: string,
): string {
  return replaceLineInRecord(text, `  - id: ${claimId}\n`, "\n  - id: ", prefix, replacement);
}

function removeLineInClaim(text: string, claimId: string, prefix: string): string {
  return removeLineInRecord(text, `  - id: ${claimId}\n`, "\n  - id: ", prefix);
}

function replaceLineInStructure(
  text: string,
  interfaceId: string,
  prefix: string,
  replacement: string,
): string {
  return replaceLineInRecord(text, `- id: ${interfaceId}\n`, "\n- id: ", prefix, replacement);
}

/**
 * Replaces exactly one line in a YAML record block. The marker must be unique; the prefix must
 * match exactly one line inside that record. This keeps each named mutation one field.
 */
function replaceLineInRecord(
  text: string,
  marker: string,
  nextMarker: string,
  prefix: string,
  replacement: string,
): string {
  const { start, end } = recordBlock(text, marker, nextMarker);
  const block = text.slice(start, end);
  const lines = block.split("\n");
  const matches = lines.flatMap((line, index) => (line.startsWith(prefix) ? [index] : []));
  if (matches.length !== 1) {
    throw new Error(
      `Mutation line is not unique: ${prefix.trim()} (${matches.length} matches in ${marker.trim()})`,
    );
  }
  lines[matches[0]!] = replacement;
  return text.slice(0, start) + lines.join("\n") + text.slice(end);
}

/** Removes exactly one line from a YAML record block; used for one-field omissions. */
function removeLineInRecord(
  text: string,
  marker: string,
  nextMarker: string,
  prefix: string,
): string {
  const { start, end } = recordBlock(text, marker, nextMarker);
  const block = text.slice(start, end);
  const lines = block.split("\n");
  const matches = lines.flatMap((line, index) => (line.startsWith(prefix) ? [index] : []));
  if (matches.length !== 1) {
    throw new Error(
      `Mutation line is not unique: ${prefix.trim()} (${matches.length} matches in ${marker.trim()})`,
    );
  }
  lines.splice(matches[0]!, 1);
  return text.slice(0, start) + lines.join("\n") + text.slice(end);
}

function recordBlock(
  text: string,
  marker: string,
  nextMarker: string,
): { start: number; end: number } {
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Mutation anchor not found: ${marker.trim()}`);
  if (text.indexOf(marker, start + marker.length) >= 0) {
    throw new Error(`Mutation anchor is not unique: ${marker.trim()}`);
  }
  const next = text.indexOf(nextMarker, start + marker.length);
  return { start, end: next < 0 ? text.length : next };
}
