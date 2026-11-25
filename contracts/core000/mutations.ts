import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Deterministic, named one-field mutations for the S1 negative and S2.3 focused cases. */
export const MUTATION_NAMES = [
  "claim",
  "unresolved-subject",
  "implemented-without-evidence",
  "quote-outside",
  "decision-missing",
  // S2.3 focused cases (#136): each isolates exactly one additional policy finding.
  "guarantee-conditions",
  "interface-owner",
  "evidence-locator",
  "evidence-orphan",
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

/** The `conditions:` line of the C000-CT-011 guarantee claim (unique full text). */
const CT011_CONDITIONS_LINE =
  '    conditions: "Given a project whose canonical manifest declares its inputs, sources and its `locale`, and whose profile, source-adapter and renderer closures are loaded from the declared paths, `inputDigest` covers the canonical manifest (including its declared `locale`), declared input bytes, source bytes, and those closures; the clock, environment, mtimes and absolute paths are excluded, and the CLI/runtime locale is not an input."';

/** The `owner:` line of IF-BUILD-IDENTITY (unique via its description text). */
const IF_BUILD_IDENTITY_OWNER_BLOCK = `  description: 'BuildResult.identity: projectId, engineVersion, manifestVersion, inputDigest and the extensions list.'
  owner: COMP-CORE`;

/** The `locator:` line of the EV-CODE-SPEC-LIB-IDENTITY-TS evidence record. */
const EVIDENCE_LOCATOR_LINE = `    locator: "spec/lib/identity.ts"`;

/** C000-IM-009's evidencedBy head line inside its relation block. */
const IM009_EVIDENCEDBY_HEAD =
  "      evidencedBy:\n        - EV-CODE-SPEC-LIB-IDENTITY-TS-604-SPEC-LIB-IDENTITY-TS-753\n        - EV-TEST-TESTS-IDENTITY-TEST-TS-555";

/**
 * Applies exactly one named mutation to a fresh temporary project copy. Each mutation edits one
 * field; the repository is never a target.
 */
export async function applyMutation(projectDir: string, name: MutationName): Promise<void> {
  // The interface-owner case mutates `structure.yml`; every other case is a claims.yml edit.
  const file = path.join(projectDir, name === "interface-owner" ? "structure.yml" : "claims.yml");
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
    case "guarantee-conditions":
      // Empty `conditions` on an active guarantee: exactly one
      // `core000.claim.unsupported-guarantee` for C000-CT-011.
      // Whitespace-only survives the schema (minLength counts raw bytes) and trims to empty.
      return replaceOnce(text, CT011_CONDITIONS_LINE, '    conditions: "  "');
    case "interface-owner":
      // An owner that exists but does not provide the interface: exactly one
      // `core000.model.interface-owner-mismatch` for IF-BUILD-IDENTITY.
      return replaceOnce(
        text,
        IF_BUILD_IDENTITY_OWNER_BLOCK,
        `  description: 'BuildResult.identity: projectId, engineVersion, manifestVersion, inputDigest and the extensions list.'
  owner: COMP-CLI`,
      );
    case "evidence-locator":
      // Whitespace-only locator after trimming: exactly one `core000.evidence.locator`
      // for EV-CODE-SPEC-LIB-IDENTITY-TS (an empty value would be schema-rejected).
      return replaceOnce(text, EVIDENCE_LOCATOR_LINE, '    locator: "   "');
    case "evidence-orphan":
      // Re-point one of C000-IM-009's two evidence references at the sibling record: the claim
      // stays evidenced, and the re-pointed id becomes an orphan (warning). The id is
      // referenced by exactly this one claim, so the orphan is isolated (#136).
      return replaceOnce(
        text,
        IM009_EVIDENCEDBY_HEAD,
        "      evidencedBy:\n        - EV-TEST-TESTS-IDENTITY-TEST-TS-555\n        - EV-TEST-TESTS-IDENTITY-TEST-TS-555",
      );
  }
}

/**
 * Replaces `search` with `replacement` exactly once, but only inside the entity block that
 * starts with `blockStart` and ends at the next sibling entity. Used when the edited field is
 * not unique across the file on its own (for example `lifecycle: active`).
 */
function replaceOnceInBlock(
  text: string,
  blockStart: string,
  search: string,
  replacement: string,
): string {
  const start = text.indexOf(blockStart);
  if (start < 0) throw new Error(`Mutation block not found: ${blockStart.trim()}`);
  const nextEntity = text.indexOf("\n  - id: ", start + blockStart.length);
  const end = nextEntity < 0 ? text.length : nextEntity + 1;
  const block = text.slice(start, end);
  const first = block.indexOf(search);
  if (first < 0) throw new Error(`Mutation anchor not found in block: ${search}`);
  if (block.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Mutation anchor is not unique in block: ${search}`);
  }
  return (
    text.slice(0, start) +
    block.slice(0, first) +
    replacement +
    block.slice(first + search.length) +
    text.slice(end)
  );
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
