import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Deterministic, named one-field mutations for the S1 negative cases. */
export const MUTATION_NAMES = [
  "claim",
  "unresolved-subject",
  "implemented-without-evidence",
  "quote-outside",
  "decision-missing",
] as const;

export type MutationName = (typeof MUTATION_NAMES)[number];

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
  const file = path.join(projectDir, "claims.yml");
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
