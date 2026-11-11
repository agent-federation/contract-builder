import { localizedDetail, messageText } from "./messages.js";
import type { Locale } from "./locale.js";

/**
 * Stable code a machine consumer sees when an unexpected error escapes the build pipeline.
 * It is not a `Diagnostic`: the CLI could not produce a build result, so it must not pretend
 * that it did (see `docs/reference/cli-json-error.md`).
 */
export const CLI_INTERNAL_ERROR = "core.cli.internal-error";

/**
 * The one JSON document the CLI writes instead of a `BuildResult` when it cannot build one.
 * It deliberately carries none of the build-result fields (`mode`, `blockedBy`, `diagnostics`,
 * `identity`, `output`, `written`), so a consumer cannot mistake it for a build result.
 */
export interface CliErrorDocument {
  kind: "error";
  exitCode: 1;
  error: {
    /** Stable machine identifier for the failure class. */
    code: string;
    /** Localized, human-readable text; never a stack trace. */
    message: string;
  };
}

export function cliErrorDocument(code: string, message: string): CliErrorDocument {
  return { kind: "error", exitCode: 1, error: { code, message } };
}

/** A localized one-line message for an error that escaped the build, without a stack trace. */
export function internalErrorMessage(locale: Locale, error: unknown): string {
  return messageText(`${CLI_INTERNAL_ERROR}#internal-error`, locale, {
    error: localizedDetail(error),
  });
}

export interface CliErrorOutput {
  /** The single JSON document for `--json`, or null in human mode. */
  stdout: string | null;
  /** The human message, or null in `--json` mode. */
  stderr: string | null;
}

/**
 * Formats a terminal CLI failure. With `--json` exactly one document goes to stdout and nothing
 * goes to stderr; human mode keeps the one-line message on stderr. Neither path prints a stack.
 */
export function renderCliError(code: string, message: string, json: boolean): CliErrorOutput {
  if (json) {
    return { stdout: JSON.stringify(cliErrorDocument(code, message), null, 2), stderr: null };
  }
  return { stdout: null, stderr: message };
}

/** Writes a terminal CLI failure and sets exit code 1; exactly one JSON document in `--json`. */
export function emitCliError(code: string, message: string, json: boolean): void {
  const output = renderCliError(code, message, json);
  if (output.stdout !== null) console.log(output.stdout);
  if (output.stderr !== null) console.error(output.stderr);
  process.exitCode = 1;
}
