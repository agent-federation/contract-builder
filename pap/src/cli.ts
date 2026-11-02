#!/usr/bin/env bun
/**
 * `pap` — the standalone PAP v0.1 verifier CLI.
 *
 * Commands: verify, inspect, explain. The report is authoritative; the exit
 * code is a gate mapping the aggregate verdict (§9.7).
 */

import { jcs } from "./json.js";
import { verifyPackage, UsageError, IoFailure } from "./verify.js";
import { inspectPackage } from "./inspect.js";
import { explainPackage } from "./explain.js";
import { renderExplanationText, renderInspectionText, renderVerifyText } from "./text.js";
import { parseRfc3339 } from "./time.js";
import { CHECKER } from "./version.js";
import { VERIFIER_VERSION } from "./types.js";
import type { JsonValue } from "./types.js";

const SYNOPSIS = `usage:
  pap verify PACKAGE [--trust-policy FILE] [--format text|json] [--now RFC3339]
  pap inspect PACKAGE [--format text|json]
  pap explain PACKAGE --check CHECK_ID [--format text|json]
  pap --version
  pap --help`;

const EXIT_TABLE = `exit codes:
  0  verdict PASS
  1  verdict FAIL
  2  verdict INCOMPLETE or NOT_EVALUATED
  3  verdict UNTRUSTED
  4  verdict UNSUPPORTED
  64 usage error
  70 internal verifier failure
  74 I/O failure`;

interface Command {
  name: "verify" | "inspect" | "explain";
  packagePath: string;
  format: "text" | "json";
  trustPolicy?: string;
  now?: bigint;
  checkId?: string;
}

class CliUsage extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CliUsage";
    this.code = code;
  }
}

export async function runCli(argv: string[]): Promise<number> {
  if (argv.length === 0) {
    process.stderr.write(`${SYNOPSIS}\n`);
    return 64;
  }
  if (argv[0] === "--version" && argv.length === 1) {
    process.stdout.write(versionText());
    return 0;
  }
  if (argv[0] === "--help" && argv.length === 1) {
    process.stdout.write(`${SYNOPSIS}\n\n${EXIT_TABLE}\n`);
    return 0;
  }
  if (argv[0] === "--version" || argv[0] === "--help") {
    process.stderr.write(`pap: pap.cli.usage: unexpected arguments after ${argv[0]}\n`);
    return 64;
  }

  const name = argv[0];
  if (name !== "verify" && name !== "inspect" && name !== "explain") {
    process.stderr.write(`pap: pap.cli.usage: unknown command ${name}\n${SYNOPSIS}\n`);
    return 64;
  }
  const rest = argv.slice(1);
  if (rest.includes("--help")) {
    process.stdout.write(`${commandSynopsis(name)}\n`);
    return 0;
  }

  try {
    const command = parseCommand(name, rest);
    if (command.name === "verify") {
      const result = await verifyPackage({
        packagePath: command.packagePath,
        policyPath: command.trustPolicy,
        now: command.now,
      });
      if (command.format === "json") {
        writeStdout(`${jcs(result.report as unknown as JsonValue)}\n`);
      } else {
        writeStdout(renderVerifyText(result.report));
      }
      return result.exitCode;
    }
    if (command.name === "inspect") {
      const result = await inspectPackage(command.packagePath);
      if (command.format === "json") {
        writeStdout(`${jcs(result.document as unknown as JsonValue)}\n`);
      } else {
        writeStdout(renderInspectionText(result.document));
      }
      return result.exitCode;
    }
    const result = await explainPackage(command.packagePath, command.checkId as string);
    if (command.format === "json") {
      writeStdout(`${jcs(result.document as unknown as JsonValue)}\n`);
    } else {
      writeStdout(renderExplanationText(result.document, command.checkId));
    }
    return result.exitCode;
  } catch (error) {
    return reportError(error);
  }
}

function parseCommand(name: "verify" | "inspect" | "explain", argv: string[]): Command {
  const positionals: string[] = [];
  let format: "text" | "json" = "text";
  let formatSeen = false;
  let trustPolicy: string | undefined;
  let now: bigint | undefined;
  let checkId: string | undefined;
  let endOfOptions = false;

  const setOnce = (existing: string | bigint | undefined, label: string): void => {
    if (existing !== undefined) {
      throw new CliUsage("pap.cli.usage", `option ${label} may be given only once`);
    }
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;
    if (!endOfOptions && argument === "--") {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && argument.startsWith("--")) {
      const equal = argument.indexOf("=");
      const flag = equal === -1 ? argument : argument.slice(0, equal);
      let value = equal === -1 ? undefined : argument.slice(equal + 1);
      if (flag === "--format") {
        if (formatSeen) {
          throw new CliUsage("pap.cli.usage", "option --format may be given only once");
        }
        formatSeen = true;
        if (value === undefined) {
          index += 1;
          value = argv[index];
        }
        if (value !== "text" && value !== "json") {
          throw new CliUsage("pap.cli.usage", "--format accepts exactly text or json");
        }
        format = value;
        continue;
      }
      if (flag === "--trust-policy") {
        if (name !== "verify") {
          throw new CliUsage("pap.cli.usage", "--trust-policy is accepted only by verify");
        }
        setOnce(trustPolicy, "--trust-policy");
        if (value === undefined) {
          index += 1;
          value = argv[index];
        }
        if (value === undefined || value === "") {
          throw new CliUsage("pap.cli.usage", "--trust-policy requires a value");
        }
        trustPolicy = value;
        continue;
      }
      if (flag === "--now") {
        if (name !== "verify") {
          throw new CliUsage("pap.cli.usage", "--now is accepted only by verify");
        }
        setOnce(now, "--now");
        if (value === undefined) {
          index += 1;
          value = argv[index];
        }
        if (value === undefined || value === "") {
          throw new CliUsage("pap.cli.usage", "--now requires a value");
        }
        const parsed = parseRfc3339(value);
        if (parsed === null) {
          throw new CliUsage("pap.cli.usage", "--now is not an RFC 3339 instant");
        }
        now = parsed;
        continue;
      }
      if (flag === "--check") {
        if (name !== "explain") {
          throw new CliUsage("pap.cli.usage", "--check is accepted only by explain");
        }
        setOnce(checkId, "--check");
        if (value === undefined) {
          index += 1;
          value = argv[index];
        }
        if (value === undefined || !/^pap\.check\.[a-z0-9-]+\/[0-9]+$/.test(value)) {
          throw new CliUsage("pap.cli.usage", "--check requires a check id");
        }
        checkId = value;
        continue;
      }
      throw new CliUsage("pap.cli.usage", `unknown option ${flag}`);
    }
    positionals.push(argument);
  }

  if (positionals.length === 0) {
    throw new CliUsage("pap.cli.usage", "PACKAGE is required");
  }
  if (positionals.length > 1) {
    throw new CliUsage("pap.cli.usage", "exactly one PACKAGE positional is accepted");
  }
  if (name === "explain" && checkId === undefined) {
    throw new CliUsage("pap.cli.usage", "explain requires exactly one --check");
  }
  return {
    name,
    packagePath: positionals[0] as string,
    format,
    ...(trustPolicy === undefined ? {} : { trustPolicy }),
    ...(now === undefined ? {} : { now }),
    ...(checkId === undefined ? {} : { checkId }),
  };
}

function reportError(error: unknown): number {
  if (error instanceof CliUsage) {
    process.stderr.write(`pap: ${error.code}: ${error.message}\n`);
    return 64;
  }
  if (error instanceof UsageError) {
    process.stderr.write(`pap: ${error.code}: ${error.message}\n`);
    return 64;
  }
  if (error instanceof IoFailure) {
    process.stderr.write(`pap: ${error.code}: ${error.message}\n`);
    return error.exitCode;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`pap: pap.internal.error: ${message}\n`);
  return 70;
}

function writeStdout(text: string): void {
  try {
    process.stdout.write(text);
  } catch (error) {
    throw new IoFailure("pap.io.error", `cannot write stdout: ${(error as Error).message}`);
  }
}

function versionText(): string {
  return [
    `pap ${VERIFIER_VERSION}`,
    "papVersion support: 0.1",
    "reportVersion support: 0.1",
    `implementationDigest: ${CHECKER.implementationDigest}`,
    "",
  ].join("\n");
}

function commandSynopsis(name: "verify" | "inspect" | "explain"): string {
  switch (name) {
    case "verify":
      return "usage: pap verify PACKAGE [--trust-policy FILE] [--format text|json] [--now RFC3339]";
    case "inspect":
      return "usage: pap inspect PACKAGE [--format text|json]";
    case "explain":
      return "usage: pap explain PACKAGE --check CHECK_ID [--format text|json]";
  }
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}
