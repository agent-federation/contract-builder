/**
 * Render the committed C6 evidence record from a valid independent batch.
 *
 * `bun run pipeline:evidence --batch <batch.json> --out <file>` regenerates the
 * Markdown without re-running the verifiers. The record is a summary: the raw
 * reports and the machine-readable batch stay as CI artifacts (90 days). The
 * report hashes are recorded here, never re-derived.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { C6Batch, VerifierEntry } from "./independent.js";

const REPOSITORY = "agent-federation/contract-builder";
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;

function dash(value: string | null | undefined): string {
  return value === null || value === undefined || value.length === 0 ? "—" : value;
}

function inlineCode(value: string | null | undefined): string {
  const text = dash(value);
  return text === "—" ? text : `\`${text}\``;
}

function tableCell(value: string | null | undefined): string {
  return dash(value).replaceAll("|", "\\|");
}

function verifierRow(entry: VerifierEntry): string {
  return `| ${entry.verifier} | ${tableCell(entry.id)} | ${tableCell(entry.version)} | ${inlineCode(entry.implementationDigest)} | ${tableCell(entry.verdict)} | ${entry.exitCode ?? "—"} | ${inlineCode(entry.reportSha256)} |`;
}

function dimensionRow(batch: C6Batch, label: string, key: string): string {
  const cells = batch.verifiers.map((entry) =>
    entry.status === "EXECUTED" ? tableCell(entry.dimensions[key]) : "NOT_PERFORMED",
  );
  return `| ${label} | ${cells.join(" | ")} |`;
}

function checkRow(batch: C6Batch, checkId: string): string {
  const cells = batch.verifiers.map((entry) =>
    entry.status === "EXECUTED" ? tableCell(entry.checks[checkId]) : "NOT_PERFORMED",
  );
  return `| \`${checkId}\` | ${cells.join(" | ")} |`;
}

function matrixRows(batch: C6Batch): string[] {
  const rows = [
    dimensionRow(batch, "`integrity.package`", "integrity.package"),
    dimensionRow(batch, "`integrity.artifacts`", "integrity.artifacts"),
    dimensionRow(batch, "`sources.availability`", "sources.availability"),
    dimensionRow(batch, "`sources.integrity`", "sources.integrity"),
    dimensionRow(batch, "`trust.policyDecision`", "trust.policyDecision"),
    dimensionRow(batch, "`verdict`", "verdict"),
  ];
  for (const check of batch.requiredChecks) rows.push(checkRow(batch, check));
  return rows;
}

function bulletList(items: readonly string[]): string {
  if (items.length === 0) return "- None recorded.";
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * The evidence record is intentionally explicit about what was not proven:
 * Phase 2a verifiers executed, but the three required checks are Phase 2b scope.
 */
export function renderEvidenceMarkdown(batch: C6Batch): string {
  if (batch.ok !== true) {
    throw new Error("refusing to render evidence from a batch that is not ok");
  }
  const commitUrl = `${REPOSITORY_URL}/commit/${batch.contractBuilderCommit}`;
  const provenanceUrl = `https://github.com/${batch.provenance.repository}/commit/${batch.provenance.commit}`;
  const provenancePull = `https://github.com/${batch.provenance.repository}/pull/${batch.provenance.pullRequest}`;
  const files = Object.entries(batch.package.files);
  const artifact = batch.package.artifacts[0];
  const artifactDigest = typeof artifact?.digest === "string" ? artifact.digest : undefined;
  const source = batch.package.sources[0];
  const sourceDigest =
    source !== null &&
    typeof source === "object" &&
    "digest" in source &&
    typeof (source as { digest?: unknown }).digest === "string"
      ? (source as { digest: string }).digest
      : undefined;
  const headers = batch.verifiers.map((entry) => entry.verifier).join(" | ");
  const independentEntries = batch.verifiers.filter((entry) => entry.verifier !== "reference");
  const executedIndependent = independentEntries.filter((entry) => entry.status === "EXECUTED");
  const independentVerdictsText = independentEntries
    .map(
      (entry) =>
        `${entry.verifier}: ${entry.status === "EXECUTED" ? (entry.verdict ?? "UNKNOWN") : "NOT_PERFORMED"}`,
    )
    .join(", ");
  const referenceEntry = batch.verifiers.find((entry) => entry.verifier === "reference");
  const referenceVerdict = batch.comparison.referenceVerdict ?? "NOT_PERFORMED";
  const anyIndependentCheckEvaluated = executedIndependent.some((entry) =>
    batch.requiredChecks.some((checkId) =>
      ["PASS", "FAIL"].includes(entry.checks[checkId] ?? "ABSENT"),
    ),
  );
  const phase2aOnly =
    executedIndependent.length > 0 &&
    executedIndependent.every((entry) =>
      batch.requiredChecks.every((checkId) =>
        ["UNSUPPORTED", "ABSENT", "NOT_EVALUATED"].includes(entry.checks[checkId] ?? "ABSENT"),
      ),
    );
  const checkScopeText = phase2aOnly
    ? "The three independent implementations are PAP v0.1 **Phase 2a** only (walker, manifest schema, JCS, digests, report and exit codes); the three required check implementations are **Phase 2b**, which is out of scope for this evidence record, so the independent check outcomes are not evaluated."
    : anyIndependentCheckEvaluated
      ? "At least one independent implementation evaluated one or more required checks; the matrix records the actual outcomes. A non-PASS independent verdict is recorded as-is and is never converted to PASS."
      : "No independent implementation executed its required checks in this batch.";

  return `# Pipeline evidence — C6 independent verification

**Status:** evidence record for C6 ([#216](${REPOSITORY_URL}/issues/216)), part of the
end-to-end SDLC pipeline stream C ([#170](${REPOSITORY_URL}/issues/170)). This is the
required comparison record, not a certification, a gate decision or a claim of semantic truth.

## 1. Run provenance

| Field | Value |
|---|---|
| Contract-builder run commit | [\`${batch.contractBuilderCommit}\`](${commitUrl}) |
| Pinned \`--now\` | \`${batch.pinnedNow}\` |
| Trust policy | \`${batch.trustPolicy.id}\` |
| Trust-policy path used by all four runs | Run-local copy of \`pipeline/policy/core000-trust-policy.json\` (identical bytes; the same absolute path for all four runs; retained in \`batch.json\`) |
| Trust-policy digest (verifier-reported) | \`${batch.trustPolicy.sha256}\` |
| Independent-verifier provenance | [\`${batch.provenance.repository}@${batch.provenance.commit}\`](${provenanceUrl}) ([PR #${batch.provenance.pullRequest}](${provenancePull})) |
| Provenance handoff | \`${batch.provenance.handoff}\` |
| Input protection | Package tree and run-local policy copy made read-only during verifier execution and re-hashed after every verifier; any mutation is a problem and fails the batch (\`inputIntegrity\` in \`batch.json\`). |
| Machine-readable batch | The CI job retains its own run's \`batch.json\` and reports as the \`pipeline-independent-evidence\` artifact (90 days). The values in this record are from the run commit above, not from that artifact. |

The three independent implementations are the blind-lab Gate 3 Phase 2a set. This run
builds them from their pinned public commit archives, verifies each archive's SHA-256
before extraction and asserts each report's self-reported \`implementationDigest\`. The
blind-lab handoff reports are provenance, not the source of truth.

## 2. Package under test

| Field | Value |
|---|---|
| \`packageIdentity\` | \`${dash(batch.package.identity)}\` |
| Manifest SHA-256 (\`assurance-package.json\`) | \`${batch.package.manifestSha256}\` |
| PAP version | \`${dash(batch.package.papVersion)}\` |
| Build \`engineVersion\` | \`${dash(String(batch.package.build.engineVersion ?? ""))}\` |
| Build \`manifestVersion\` | \`${dash(String(batch.package.build.manifestVersion ?? ""))}\` |
| Build \`inputDigest\` | \`${dash(String(batch.package.build.inputDigest ?? ""))}\` |
| Build \`normalizedInputDigest\` | \`${dash(String(batch.package.build.normalizedInputDigest ?? ""))}\` |
| Packaged artifact digest | \`${dash(artifactDigest)}\` |
| Packaged source digest | \`${dash(sourceDigest)}\` |
| Packaged files | ${files.length} (listed in the retained \`batch.json\`) |

**Commit binding.** \`packageIdentity\` is commit-bound: the manifest's
\`sources[].acquisition.revision\` is the packing checkout's git HEAD, so the identity
above is valid for \`${batch.contractBuilderCommit}\` only. A CI run packs its own
checkout (on a pull request, the merge commit) and therefore records a different
identity. The evidence pin is the run commit stated here, not a constant.

## 3. Verifier identities and verdicts

| Verifier | id | version | implementationDigest | verdict | exit | report SHA-256 |
|---|---|---|---|---|---|---|
${batch.verifiers.map(verifierRow).join("\n")}

### Pinned independent sources

| Verifier | Repository | Commit | Tag | Archive SHA-256 | Build |
|---|---|---|---|---|---|
${batch.verifiers
  .filter((entry) => entry.source.kind === "pinned-source-tarball")
  .map(
    (entry) =>
      `| ${entry.verifier} | \`${entry.source.repository}\` | \`${dash(entry.source.commit)}\` | \`${dash(entry.source.tag)}\` | \`${dash(entry.source.tarballSha256)}\` | \`${dash(entry.source.build)}\` |`,
  )
  .join("\n")}

Each archive is checked against the recorded SHA-256 before extraction, including a
cached archive; the self-reported \`implementationDigest\` above is a second pin.

An \`UNSUPPORTED\` verdict (exit 4) means the verifier executed and retained a report;
it does **not** mean PASS. A report's verdict is never rewritten or converted here.

## 4. Dimension and check matrix

| Dimension / required check | ${headers} |
|---|${batch.verifiers.map(() => "---").join("|")}|
${matrixRows(batch).join("\n")}

The reference verifier reports \`${referenceVerdict}\` (exit ${referenceEntry?.exitCode ?? "—"})
on the three required checks. The independent verdicts are ${independentVerdictsText}.
${checkScopeText} ${batch.comparison.integrityAndSourcesAgreement ? "Package/artifact/source integrity and source availability agree across the four runs." : "The integrity/source agreement check did not pass for this batch."}

## 5. Differences and limitations

${bulletList(batch.comparison.limitations)}

### Recorded differences

${bulletList(batch.comparison.differences)}

### Path-dependent hashes

Verifier reports include the absolute \`package.path\` and \`policy.path\`, so the report
SHA-256 values in section 3 depend on the run directory. They are hashes of the reports
produced by the run recorded in section 1. The raw reports are not committed because they
carry those absolute paths; this record pins their hashes instead. The CI job retains a
separate run's reports for 90 days; that run packs its own commit, so its identity and
report hashes differ from this record and from any other checkout.

### Report retention

The report hashes above are the permanent pin for the recorded run. The raw reports and
\`batch.json\` for a CI run are retained only as the 90-day \`pipeline-independent-evidence\`
artifact. Neither the committed hashes nor the artifact is portable to another checkout:
both the run commit and the absolute paths change.

## 6. Reproduce

\`\`\`bash
bun install --frozen-lockfile
bun run pipeline:independent --out "$RUNNER_TEMP/pipeline-independent"
\`\`\`

The script reads the pinned \`--now\` from \`pipeline/pinned-now.txt\`; the batch
records the resolved value. The \`pipeline-independent\` CI job runs this command on every pull request. It is a
separate, non-blocking job: it is not a required status and does not gate the reference
\`pipeline\` job. It uploads \`batch.json\`, the four reports and the package manifest for
90 days. A missing report, an unparseable report, a pinned-identity mismatch, a
\`packageIdentity\` disagreement, a genuine check-level disagreement, a
verdict/check-outcome contradiction, an unsafe pinned archive (absolute path,
escaping link or unsupported entry type) or an input mutation fails the job explicitly.
An invalid batch keeps its \`batch.json\` and reports for audit, but is never
rendered as evidence Markdown.

## 7. What this does and does not establish

- It establishes that the reference and the three independent Phase 2a verifiers
  executed against the same CORE-000 package bytes, with one pinned \`--now\` and one
  absolute trust-policy path, and that all four agree on \`packageIdentity\` and on
  package/artifact/source integrity and availability.
- \`UNSUPPORTED\` is a recorded, executed result. It is not PASS, and no CORE-000 claim
  is promoted to \`independently_verified\` by this record.
- The runner copies the policy into the run directory, makes the package tree and policy
  copy read-only, and re-hashes both after every verifier. A verifier that mutates packaged
  bytes or the policy makes the batch fail closed and stops the remaining runs; the mutation
  diagnostics are retained in \`batch.json\`.
- Phase 2b check implementations, cross-environment reproducibility (H2), signing,
  semantic truth and team independence are out of scope.
`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let batchPath: string | undefined;
  let outPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run pipeline:evidence --batch <batch.json> --out <evidence.md>");
      return;
    }
    const value = argv[index + 1];
    if (arg === "--batch" && value !== undefined) {
      batchPath = value;
      index += 1;
      continue;
    }
    if (arg === "--out" && value !== undefined) {
      outPath = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${String(arg)}`);
  }
  if (batchPath === undefined || outPath === undefined) {
    throw new Error("--batch and --out are required");
  }
  const batch = JSON.parse(await readFile(batchPath, "utf8")) as C6Batch;
  if (batch.ok !== true) {
    throw new Error("refusing to render evidence from a batch that is not ok");
  }
  await writeFile(path.resolve(outPath), renderEvidenceMarkdown(batch));
  console.log(`Wrote ${path.resolve(outPath)}`);
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(`pipeline-evidence: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
