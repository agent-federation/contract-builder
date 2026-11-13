/**
 * Package payload intake: read the declared artifacts, sources, inputs and
 * claims within the effective limits and record their integrity state.
 */

import { parseClaimFile } from "../claims.js";
import type { ClaimState } from "../checks.js";
import { domainHash } from "../digest.js";
import { hashPlannedInputs, planInput } from "../input.js";
import type { InputHash, PlannedInput, StreamFailure } from "../input.js";
import type { Manifest } from "../manifest.js";
import {
  hashPackageFile,
  hashPackageRange,
  pathKey,
  readPackageFile,
  validateDeclaredPath,
} from "../paths.js";
import type { PackageRoot } from "../paths.js";
import type { Diagnostic, Limits } from "../types.js";
import type { Diag, Payloads } from "./options.js";

type InputPlanState =
  | { kind: "blocked" }
  | { kind: "invalid" }
  | { kind: "stopped" }
  | { kind: "cap-limit" }
  | { kind: "failure"; failure: StreamFailure["failure"]; message: string }
  | { kind: "planned" };

export async function loadPayloads(
  root: PackageRoot,
  limits: Limits,
  manifest: Manifest | null,
  structuralFailure: boolean,
  diagnostics: Diagnostic[],
  diag: Diag,
): Promise<Payloads> {
  const result: Payloads = {
    artifacts: [],
    sources: [],
    inputs: [],
    claims: [],
    claimMap: {},
    normalizedInputDigest: null,
    sourceSpans: new Map(),
    sourceSpanBudgetHit: false,
    limitHit: false,
    limitedClasses: new Set(),
  };
  if (manifest === null || structuralFailure) {
    return result;
  }

  let stopped = false;
  let totalBytes = 0;
  const hashPayload = async (
    relative: string,
    kind: "artifacts" | "sources" | "inputs",
    domain: string,
  ): Promise<
    | { ok: true; digest: string; size: number }
    | {
        ok: false;
        failure: "limit" | "missing" | "symlink" | "non-regular" | "path-escape" | "io";
        message: string;
      }
  > => {
    if (stopped) {
      result.limitedClasses.add(kind);
      return {
        ok: false,
        failure: "limit",
        message: "payload evaluation stopped by an earlier limit",
      };
    }
    const remaining = Math.max(0, limits.totalPayloadBytes - totalBytes);
    const cap = Math.min(limits.fileBytes, remaining);
    if (cap <= 0) {
      stopped = true;
      result.limitHit = true;
      result.limitedClasses.add(kind);
      return { ok: false, failure: "limit", message: "total payload byte limit exceeded" };
    }
    const outcome = await hashPackageFile(root, relative, domain, limits, cap);
    if (outcome.ok && outcome.digest !== undefined && outcome.size !== undefined) {
      totalBytes += outcome.size;
      if (totalBytes > limits.totalPayloadBytes) {
        stopped = true;
        result.limitHit = true;
        result.limitedClasses.add(kind);
        return { ok: false, failure: "limit", message: "total payload byte limit exceeded" };
      }
      return { ok: true, digest: outcome.digest, size: outcome.size };
    }
    if (outcome.failure === "limit") {
      stopped = true;
      result.limitHit = true;
      result.limitedClasses.add(kind);
    }
    return {
      ok: false,
      failure: outcome.failure ?? "io",
      message: outcome.message ?? "payload is not readable",
    };
  };
  // Claim files are JSON documents bounded by the JSON limits, not by the
  // artifact/source/input byte budget. They remain readable when a payload
  // limit stopped the mechanical-check scope.
  const readClaim = (relative: string) =>
    readPackageFile(root, relative, limits, limits.jsonStringBytes);

  const failState = (
    failure: "limit" | "missing" | "symlink" | "non-regular" | "path-escape" | "io",
    scope: string,
    message: string,
  ): void => {
    const code =
      failure === "missing"
        ? "pap.package.declared-file-missing"
        : failure === "symlink"
          ? "pap.package.symlink"
          : failure === "non-regular"
            ? "pap.package.non-regular"
            : failure === "path-escape"
              ? "pap.package.path-escape"
              : failure === "limit"
                ? "pap.package.limit-exceeded"
                : "pap.package.io";
    diag(code, "error", scope, message);
  };

  const usablePath = (declared: string, root: string): boolean => {
    const validation = validateDeclaredPath(declared, limits);
    return validation.ok && declared.startsWith(root);
  };

  const classCountExceeded = (count: number): boolean => {
    if (count <= limits.payloadFiles) return false;
    result.limitHit = true;
    diag(
      "pap.package.limit-exceeded",
      "error",
      "package",
      "declared payload class exceeds the count limit",
    );
    return true;
  };
  const artifactsBlocked = classCountExceeded(manifest.artifacts.length);
  if (artifactsBlocked) result.limitedClasses.add("artifacts");
  const sourcesBlocked = classCountExceeded(
    manifest.sources.filter((source) => source.path !== undefined).length,
  );
  if (sourcesBlocked) result.limitedClasses.add("sources");
  const inputsBlocked = classCountExceeded(manifest.inputs.length);
  if (inputsBlocked) result.limitedClasses.add("inputs");

  const duplicateArtifactPaths = duplicateDeclaredPaths(manifest);
  for (const artifact of manifest.artifacts) {
    if (artifactsBlocked) {
      result.artifacts.push({
        artifact,
        computed: null,
        byteCount: null,
        status: "unread",
        message: "payload count limit exceeded",
      });
      continue;
    }
    if (duplicateArtifactPaths.has(pathKey(artifact.path))) {
      result.artifacts.push({
        artifact,
        computed: null,
        byteCount: null,
        status: "missing",
        message: `artifact path is duplicated: ${artifact.path}`,
      });
      continue;
    }
    if (!usablePath(artifact.path, "artifacts/")) {
      result.artifacts.push({
        artifact,
        computed: null,
        byteCount: null,
        status: "missing",
        message: `artifact path is invalid: ${artifact.path}`,
      });
      continue;
    }
    const outcome = await hashPayload(artifact.path, "artifacts", "pap.artifact.v1");
    if (!outcome.ok) {
      failState(outcome.failure, artifact.id, outcome.message);
      result.artifacts.push({
        artifact,
        computed: null,
        byteCount: null,
        status: outcome.failure === "limit" ? "unread" : "missing",
        message: outcome.message,
      });
      continue;
    }
    if (outcome.digest !== artifact.digest || outcome.size !== artifact.bytes) {
      const message = `artifact ${artifact.id} declares ${artifact.digest}/${artifact.bytes} bytes but computed ${outcome.digest}/${outcome.size}`;
      diag("pap.integrity.artifact-mismatch", "error", artifact.id, message);
      result.artifacts.push({
        artifact,
        computed: outcome.digest,
        byteCount: outcome.size,
        status: "mismatch",
        message,
      });
    } else {
      result.artifacts.push({
        artifact,
        computed: outcome.digest,
        byteCount: outcome.size,
        status: "ok",
      });
    }
  }

  for (const source of manifest.sources) {
    if (sourcesBlocked && source.path !== undefined) {
      result.sources.push({
        source,
        computed: null,
        size: null,
        status: "unread",
        message: "payload count limit exceeded",
      });
      continue;
    }
    if (source.path === undefined) {
      result.sources.push({ source, computed: null, size: null, status: "referenced" });
      continue;
    }
    if (!usablePath(source.path, "sources/")) {
      result.sources.push({
        source,
        computed: null,
        size: null,
        status: "missing",
        message: `source path is invalid: ${source.path}`,
      });
      continue;
    }
    const outcome = await hashPayload(source.path, "sources", "pap.source.raw.v1");
    if (!outcome.ok) {
      failState(outcome.failure, source.id, outcome.message);
      result.sources.push({
        source,
        computed: null,
        size: null,
        status: outcome.failure === "limit" ? "unread" : "missing",
        message: outcome.message,
      });
      continue;
    }
    if (outcome.digest !== source.digest) {
      const message = `source ${source.id} does not match its declared raw digest`;
      diag("pap.integrity.source-mismatch", "error", source.id, message);
      result.sources.push({
        source,
        computed: outcome.digest,
        size: outcome.size,
        status: "mismatch",
        message,
      });
    } else {
      result.sources.push({ source, computed: outcome.digest, size: outcome.size, status: "ok" });
    }
  }

  // ODR-PAP-008 phase 1: resolve and stat inputs in manifest order, charging
  // the total-byte budget without reading any content.
  const inputStates: InputPlanState[] = [];
  const plannedInputs: PlannedInput[] = [];
  for (let index = 0; index < manifest.inputs.length; index += 1) {
    const input = manifest.inputs[index] as Manifest["inputs"][number];
    if (inputsBlocked) {
      inputStates.push({ kind: "blocked" });
      continue;
    }
    if (!usablePath(input.path, "inputs/")) {
      inputStates.push({ kind: "invalid" });
      continue;
    }
    if (stopped) {
      result.limitedClasses.add("inputs");
      inputStates.push({ kind: "stopped" });
      continue;
    }
    const remaining = Math.max(0, limits.totalPayloadBytes - totalBytes);
    const cap = Math.min(limits.fileBytes, remaining);
    if (cap <= 0) {
      stopped = true;
      result.limitHit = true;
      result.limitedClasses.add("inputs");
      inputStates.push({ kind: "cap-limit" });
      continue;
    }
    const plan = await planInput(root, input.path, cap);
    if (!plan.ok) {
      if (plan.failure === "limit") {
        stopped = true;
        result.limitHit = true;
        result.limitedClasses.add("inputs");
      }
      inputStates.push({ kind: "failure", failure: plan.failure, message: plan.message });
      continue;
    }
    totalBytes += plan.resolved.size;
    plannedInputs.push({
      index,
      relative: input.path,
      resolved: plan.resolved,
      normalization: input.normalization,
      cap,
    });
    inputStates.push({ kind: "planned" });
  }

  // ODR-PAP-008 phase 2: every planned input is opened once, in ascending path
  // order, and its content pass feeds both the per-file and set hashers.
  const plannedResults = await hashPlannedInputs(plannedInputs);
  const outcomeByIndex = new Map<number, InputHash | StreamFailure>();
  for (const entry of plannedResults.outcomes) outcomeByIndex.set(entry.index, entry.outcome);
  for (const plan of plannedInputs) {
    const outcome = outcomeByIndex.get(plan.index);
    if (outcome !== undefined && outcome.ok) {
      totalBytes += outcome.rawSize - plan.resolved.size;
    } else {
      totalBytes -= plan.resolved.size;
    }
  }

  let inputSetComplete = true;
  for (let index = 0; index < manifest.inputs.length; index += 1) {
    const input = manifest.inputs[index] as Manifest["inputs"][number];
    const state = inputStates[index] as InputPlanState;
    if (state.kind === "blocked") {
      result.inputs.push({
        input,
        computed: null,
        normalizedSize: null,
        mode: null,
        status: "unread",
        message: "payload count limit exceeded",
      });
      inputSetComplete = false;
      continue;
    }
    if (state.kind === "invalid") {
      result.inputs.push({
        input,
        computed: null,
        normalizedSize: null,
        mode: null,
        status: "missing",
        message: `input path is invalid: ${input.path}`,
      });
      inputSetComplete = false;
      continue;
    }
    if (state.kind === "stopped") {
      const message = "payload evaluation stopped by an earlier limit";
      failState("limit", input.id, message);
      result.inputs.push({
        input,
        computed: null,
        normalizedSize: null,
        mode: null,
        status: "unread",
        message,
      });
      inputSetComplete = false;
      continue;
    }
    if (state.kind === "cap-limit") {
      const message = "total payload byte limit exceeded";
      failState("limit", input.id, message);
      result.inputs.push({
        input,
        computed: null,
        normalizedSize: null,
        mode: null,
        status: "unread",
        message,
      });
      inputSetComplete = false;
      continue;
    }
    if (state.kind === "failure") {
      failState(state.failure, input.id, state.message);
      result.inputs.push({
        input,
        computed: null,
        normalizedSize: null,
        mode: null,
        status: state.failure === "limit" ? "unread" : "missing",
        message: state.message,
      });
      inputSetComplete = false;
      continue;
    }
    const outcome = outcomeByIndex.get(index);
    if (outcome === undefined || !outcome.ok) {
      const failure = outcome?.failure ?? "io";
      const message = outcome?.message ?? "payload is not readable";
      if (failure === "limit") {
        result.limitHit = true;
        result.limitedClasses.add("inputs");
      }
      failState(failure, input.id, message);
      result.inputs.push({
        input,
        computed: null,
        normalizedSize: null,
        mode: null,
        status: failure === "limit" ? "unread" : "missing",
        message,
      });
      inputSetComplete = false;
      continue;
    }
    if (outcome.digest !== input.digest) {
      const message = `input ${input.id} does not match its declared digest`;
      diag("pap.integrity.input-mismatch", "error", input.id, message);
      result.inputs.push({
        input,
        computed: outcome.digest,
        normalizedSize: outcome.normalizedSize,
        mode: outcome.mode,
        status: "mismatch",
        message,
      });
    } else {
      result.inputs.push({
        input,
        computed: outcome.digest,
        normalizedSize: outcome.normalizedSize,
        mode: outcome.mode,
        status: "ok",
      });
    }
  }
  if (manifest.inputs.length > 0 && inputSetComplete) {
    if (plannedResults.setDigest === null) {
      result.limitHit = true;
      diag(
        "pap.package.limit-exceeded",
        "error",
        "inputs",
        "normalized input set could not be read within limits",
      );
    } else {
      result.normalizedInputDigest = plannedResults.setDigest;
    }
  }

  const declaredSourceIds = new Set(manifest.sources.map((source) => source.id));
  for (const kind of ["provenance", "relations", "producerReport", "reviews"] as const) {
    const ref = manifest.claims[kind];
    if (ref === undefined) continue;
    if (!usablePath(ref.path, "claims/")) {
      const state: ClaimState = {
        kind,
        declaredDigest: ref.digest,
        computedDigest: null,
        status: "missing",
        message: `claim path is invalid: ${ref.path}`,
      };
      result.claims.push(state);
      result.claimMap[kind] = state;
      continue;
    }
    const outcome = await readClaim(ref.path);
    if (!outcome.ok || outcome.bytes === undefined) {
      const failure = outcome.failure ?? "io";
      failState(failure, kind, outcome.message ?? "claim is not readable");
      const state: ClaimState = {
        kind,
        declaredDigest: ref.digest,
        computedDigest: null,
        status: failure === "limit" ? "unread" : "missing",
        message: outcome.message,
      };
      result.claims.push(state);
      result.claimMap[kind] = state;
      continue;
    }
    const claimBytes = outcome.bytes;
    const computed = domainHash("pap.claims.v1", claimBytes);
    const state: ClaimState = {
      kind,
      declaredDigest: ref.digest,
      computedDigest: computed,
      bytes: claimBytes,
      status: computed === ref.digest ? "ok" : "mismatch",
    };
    if (computed !== ref.digest) {
      diag(
        "pap.integrity.claim-mismatch",
        "error",
        kind,
        `claim ${kind} does not match its declared digest`,
      );
      state.message = "claim digest mismatch";
      result.claims.push(state);
      result.claimMap[kind] = state;
      continue;
    }
    const parsed = parseClaimFile(kind, claimBytes, limits, declaredSourceIds);
    if (!parsed.ok) {
      if (parsed.failure === "limit") {
        result.limitHit = true;
        state.status = "unread";
        state.message = parsed.message;
        diag("pap.package.limit-exceeded", "error", kind, parsed.message);
      } else if (parsed.failure === "unsupported-version") {
        state.unsupportedVersion = true;
        state.message = parsed.message;
        diag("pap.claim.unsupported-version", "warning", kind, parsed.message);
      } else {
        state.invalid = true;
        state.message = parsed.message;
        diag("pap.package.claim-invalid", "error", kind, parsed.message);
        if (
          kind === "producerReport" &&
          parsed.message.includes("mimics a verifier check record")
        ) {
          diag(
            "pap.claims.spoofed-result",
            "error",
            kind,
            "producer report contains verifier-only fields",
          );
        }
      }
    } else {
      state.parsed = parsed.claim;
      state.issues = parsed.issues;
    }
    result.claims.push(state);
    result.claimMap[kind] = state;
  }

  // Compute only the quoted source ranges; source bytes are not retained.
  const provenance = result.claimMap.provenance?.parsed;
  if (provenance !== undefined && provenance.kind === "provenance") {
    const sourceById = new Map(result.sources.map((entry) => [entry.source.id, entry]));
    const seenRanges = new Set<string>();
    for (const binding of provenance.bindings) {
      const source = sourceById.get(binding.sourceId);
      if (
        source === undefined ||
        source.source.path === undefined ||
        source.size === null ||
        source.computed === null
      ) {
        continue;
      }
      const { start, end } = binding.locator;
      if (start > end || end > source.size) continue;
      const key = `${binding.sourceId}\u0000${start}\u0000${end}`;
      if (seenRanges.has(key)) continue;
      seenRanges.add(key);
      const length = end - start;
      if (totalBytes + length > limits.totalPayloadBytes) {
        result.limitHit = true;
        result.sourceSpanBudgetHit = true;
        diag(
          "pap.package.limit-exceeded",
          "error",
          binding.id,
          "source-span reads exceed the total payload byte budget",
        );
        break;
      }
      const span = await hashPackageRange(
        root,
        source.source.path,
        start,
        end,
        "pap.quote.v1",
        limits,
      );
      if (span.ok && span.digest !== undefined) {
        totalBytes += length;
        result.sourceSpans.set(key, span.digest);
      } else if (span.failure === "limit") {
        result.limitHit = true;
        result.sourceSpanBudgetHit = true;
        diag(
          "pap.package.limit-exceeded",
          "error",
          binding.id,
          span.message ?? "quote range exceeds a limit",
        );
      } else if (span.message !== undefined) {
        diag("pap.package.io", "error", binding.id, span.message);
      }
    }
  }

  return result;
}

function duplicateDeclaredPaths(manifest: Manifest): Set<string> {
  const seen = new Map<string, number>();
  const declared = [
    ...manifest.artifacts.map((entry) => entry.path),
    ...manifest.inputs.map((entry) => entry.path),
    ...manifest.sources.flatMap((entry) => (entry.path === undefined ? [] : [entry.path])),
    ...Object.values(manifest.claims).flatMap((entry) => (entry === undefined ? [] : [entry.path])),
  ];
  for (const path of declared) {
    const key = pathKey(path);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of seen) {
    if (count > 1) duplicates.add(key);
  }
  return duplicates;
}
