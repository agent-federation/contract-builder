import path from "node:path";
import { loadProfileRenderers } from "./cli-renderers.js";
import { runBuild, type BuildResult } from "./lib/build.js";
import { Diagnostics, SEVERITY_LABEL, type Severity } from "./lib/diagnostics.js";
import { messageOf } from "./lib/guards.js";
import { loadEngineRoot, verifyEngineVersion } from "./lib/identity.js";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from "./lib/locale.js";
import { LocalizedError, cliText } from "./lib/messages.js";
import type { BuildMode, Renderer } from "./lib/render.js";

interface CliOptions {
  mode: BuildMode;
  specDir: string;
  check: boolean;
  write: boolean;
  strict: boolean;
  json: boolean;
  allowExecutableProfile: boolean;
  locale: Locale;
  engineRoot?: string;
  rendererModule?: string;
}

/**
 * The locale requested on the command line, resolved before argument validation so even a
 * parse error is reported in the language the caller asked for. An unsupported or missing
 * value falls back to the default; `parseArgs` still rejects it.
 */
function requestedLocale(argv: string[]): Locale {
  const index = argv.indexOf("--locale");
  if (index === -1) return DEFAULT_LOCALE;
  const value = argv[index + 1];
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: "draft",
    specDir: path.resolve("spec"),
    check: false,
    write: true,
    strict: false,
    json: false,
    allowExecutableProfile: false,
    locale: requestedLocale(argv),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--mode": {
        const value = argv[i + 1];
        if (value !== "draft" && value !== "release") {
          throw new LocalizedError("cli.invalid-mode", {
            value: value ?? cliText("cli.empty-value", options.locale),
          });
        }
        options.mode = value;
        i += 1;
        break;
      }
      case "--spec": {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new LocalizedError("cli.spec-requires-path");
        }
        options.specDir = path.resolve(value);
        i += 1;
        break;
      }
      case "--engine-root": {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new LocalizedError("cli.engine-root-requires-path");
        }
        options.engineRoot = path.resolve(value);
        i += 1;
        break;
      }
      case "--renderer-module": {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new LocalizedError("cli.renderer-module-requires-path");
        }
        options.rendererModule = path.resolve(value);
        i += 1;
        break;
      }
      case "--locale": {
        const value = argv[i + 1];
        if (value === undefined) {
          throw new LocalizedError("cli.locale-requires-value");
        }
        if (!isLocale(value)) {
          throw new LocalizedError("cli.invalid-locale", {
            value,
            locales: SUPPORTED_LOCALES.join(", "),
          });
        }
        options.locale = value;
        i += 1;
        break;
      }
      case "--check":
        options.check = true;
        break;
      case "--no-write":
        options.write = false;
        break;
      case "--strict":
        options.strict = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--allow-executable-profile":
        options.allowExecutableProfile = true;
        break;
      case "--help":
      case "-h":
        console.log(cliText("cli.usage", options.locale));
        process.exit(0);
        break;
      default:
        throw new LocalizedError("cli.unknown-argument", { argument: arg });
    }
  }

  return options;
}

function printHuman(result: BuildResult, specDir: string, locale: Locale): void {
  const counts: Record<Severity, number> = { error: 0, review: 0, warning: 0 };
  for (const diagnostic of result.diagnostics) counts[diagnostic.severity] += 1;

  const lines = [
    cliText("cli.build-header", locale, {
      mode: result.mode,
      spec: path.relative(process.cwd(), specDir) || ".",
    }),
    `DIAG: ${(["error", "review", "warning"] as Severity[])
      .map((severity) => `${SEVERITY_LABEL[severity]}=${counts[severity]}`)
      .join(" · ")}`,
  ];

  const body = result.diagnostics
    .map(
      (d) =>
        `${SEVERITY_LABEL[d.severity]} ${d.code} ${d.file}${d.pointer ? `#${d.pointer}` : ""}\n  ${d.message}`,
    )
    .join("\n");

  if (body) {
    lines.push("", body);
  }

  if (result.blockedBy === "errors") {
    lines.push("", cliText("cli.result.errors", locale));
  } else if (result.blockedBy === "review") {
    lines.push("", cliText("cli.result.review", locale));
  } else if (result.blockedBy === "warnings") {
    lines.push("", cliText("cli.result.warnings", locale));
  } else if (result.blockedBy === "stale-output") {
    lines.push("", cliText("cli.result.stale", locale));
  } else if (result.written) {
    lines.push(
      "",
      cliText("cli.result.written", locale, {
        path: path.relative(process.cwd(), result.outputPath),
      }),
    );
  } else {
    lines.push("", cliText("cli.result.ok", locale));
  }

  console.log(lines.join("\n"));
}

async function main(): Promise<void> {
  const locale = requestedLocale(process.argv.slice(2));
  let cli: CliOptions;
  try {
    cli = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(localizedErrorText(error, locale));
    console.error(cliText("cli.usage", locale));
    process.exitCode = 1;
    return;
  }

  // Resolve the engine root once, before the preflight: the renderer preflight and the build
  // must validate the profile closure against the same root, including the same lockfile.
  const engineDiagnostics = new Diagnostics();
  const engine = await loadEngineRoot(cli.engineRoot, engineDiagnostics);
  if (engine === null || !(await verifyEngineVersion(engine, engineDiagnostics))) {
    console.error(engineDiagnostics.report(locale));
    process.exitCode = 1;
    return;
  }

  let renderers: Record<string, Renderer>;
  try {
    renderers = await loadProfileRenderers(cli.allowExecutableProfile, cli.specDir, {
      engineRoot: engine.root,
      rendererModule: cli.rendererModule,
    });
  } catch (error) {
    console.error(
      cliText("cli.renderer-load-failed", locale, { error: localizedErrorText(error, locale) }),
    );
    process.exitCode = 1;
    return;
  }

  const result = await runBuild({
    ...cli,
    engineRoot: engine.root,
    renderers,
  });

  if (cli.json) {
    console.log(
      JSON.stringify(
        {
          mode: result.mode,
          exitCode: result.exitCode,
          blockedBy: result.blockedBy,
          written: result.written,
          output: path.relative(cli.specDir, result.outputPath),
          identity: result.identity,
          diagnostics: result.diagnostics,
        },
        null,
        2,
      ),
    );
  } else {
    printHuman(result, cli.specDir, cli.locale);
  }

  process.exitCode = result.exitCode;
}

/** Renders an error thrown by the CLI; catalog-backed errors are localized. */
function localizedErrorText(error: unknown, locale: Locale): string {
  if (error instanceof LocalizedError) return cliText(error.key, locale, error.params);
  return messageOf(error);
}

void main();
