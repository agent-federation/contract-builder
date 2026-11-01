import type { ValidatorFinding } from "../../../spec/lib/hook.js";
import type { Check, CheckContext } from "../context.js";

const LATIN_TOKEN = /\b[A-Z][A-Za-z0-9]{2,}\b/g;
const IGNORED_TOKENS = new Set(["UIA", "MUST", "SHOULD", "MAY", "REQUIRED"]);

export const check: Check = (ctx: CheckContext) => {
  const findings: ValidatorFinding[] = [];
  const termNames = new Set(ctx.view.terms.map((term) => term.name));

  for (const [index, provision] of ctx.view.provisions.entries()) {
    const matches = provision.source_quote?.match(LATIN_TOKEN) ?? [];
    const unknown = [...new Set(matches)].filter(
      (token) => !IGNORED_TOKENS.has(token) && !termNames.has(token),
    );
    if (unknown.length === 0) continue;

    findings.push({
      code: "WARN_UNDEFINED_TERM_IN_QUOTE",
      entityId: provision.id,
      location: { file: "semantics.json", pointer: `/provisions/${index}/source_quote` },
      data: { id: provision.id, terms: unknown.join(", ") },
    });
  }

  return findings;
};
