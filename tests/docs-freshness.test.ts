/**
 * Documentation freshness check (Issue #149).
 *
 * The implementation-status matrix is a hand-written snapshot. The one number that must never
 * drift silently is the CORE-000 claim count: it is stated in
 * `docs/architecture/implementation-status.md` and declared by `contracts/core000/claims.yml`.
 * This test fails when the two disagree, so a register change cannot land without updating the
 * snapshot sentence in the same pull request.
 *
 * Deliberately cheap and deterministic: two file reads and one YAML parse, no build, no network.
 * The as-of-commit age check and the documented-diagnostic-code check from #149 are left out on
 * purpose — both need policy thresholds (a commit window, a code namespace) that the repository
 * has not agreed on yet; a link checker is the follow-up named in the issue.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));

/** The one sentence this test owns. Keep it in sync with implementation-status.md. */
const CLAIM_COUNT_SENTENCE =
  /`contracts\/core000\/claims\.yml`\s+declares\s+\*\*(\d+) claims?\*\*/g;

interface ClaimsRegister {
  claims?: unknown;
}

test("documentation freshness: CORE-000 claim count matches claims.yml", async () => {
  const statusText = await readFile(
    path.join(root, "docs", "architecture", "implementation-status.md"),
    "utf8",
  );
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
