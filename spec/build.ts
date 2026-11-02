import path from "node:path";
import { runBuild, type BuildResult } from "./lib/build.js";
import { Diagnostics, SEVERITY_LABEL, type Severity } from "./lib/diagnostics.js";
import { loadManifest } from "./lib/manifest.js";
import type { BuildMode, Renderer } from "./lib/render.js";

interface CliOptions {
  mode: BuildMode;
  specDir: string;
  check: boolean;
  write: boolean;
  strict: boolean;
  json: boolean;
  allowExecutableProfile: boolean;
}

const USAGE =
  "Использование: tsx spec/build.ts [--mode draft|release] [--spec <dir>] [--check] [--no-write] [--strict] [--json] [--allow-executable-profile]";

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    mode: "draft",
    specDir: path.resolve("spec"),
    check: false,
    write: true,
    strict: false,
    json: false,
    allowExecutableProfile: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--mode": {
        const value = argv[i + 1];
        if (value !== "draft" && value !== "release") {
          throw new Error(`Недопустимый режим: ${value ?? "(пусто)"}`);
        }
        options.mode = value;
        i += 1;
        break;
      }
      case "--spec": {
        const value = argv[i + 1];
        if (value === undefined) throw new Error("--spec требует путь к каталогу");
        options.specDir = path.resolve(value);
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
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        throw new Error(`Неизвестный аргумент: ${arg}`);
    }
  }

  return options;
}

function printHuman(result: BuildResult, specDir: string): void {
  const counts: Record<Severity, number> = { error: 0, review: 0, warning: 0 };
  for (const diagnostic of result.diagnostics) counts[diagnostic.severity] += 1;

  const lines = [
    `Сборка: mode=${result.mode} · spec=${path.relative(process.cwd(), specDir) || "."}`,
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
    lines.push("", "Результат: сборка остановлена. Артефакт не записан.");
  } else if (result.blockedBy === "review") {
    lines.push("", "Результат: выпуск release заблокирован. Артефакт не записан.");
  } else if (result.blockedBy === "warnings") {
    lines.push("", "Результат: сборка заблокирована режимом --strict (есть WARNING).");
  } else if (result.blockedBy === "stale-output") {
    lines.push("", "Результат: сохранённый артефакт устарел.");
  } else if (result.written) {
    lines.push("", `Результат: записан ${path.relative(process.cwd(), result.outputPath)}`);
  } else {
    lines.push("", "Результат: ok (артефакт не записан)");
  }

  console.log(lines.join("\n"));
}

const CORE001_PROFILE_ID = "core001";
const CORE001_RENDERER_ID = "core001-markdown";

/**
 * The built-in CORE-001 renderer is an executable profile-owned module. The CLI, as the
 * consumer that wires it, imports it only when (a) the caller passed the same explicit
 * consent flag that `runBuild` requires and (b) the selected project actually declares the
 * CORE-001 profile and this renderer. A flag alone is consent, not a request to execute an
 * unrelated profile's code.
 */
async function loadProfileRenderers(
  allow: boolean,
  specDir: string,
): Promise<Record<string, Renderer>> {
  if (!allow) return {};

  // Read and validate the manifest/profile declaration before importing profile code. This
  // is declarative data only; no executable module is loaded by `loadManifest`.
  const project = await loadManifest(specDir, new Diagnostics());
  if (project === null) return {};
  if (project.profile.id !== CORE001_PROFILE_ID) return {};
  if (project.manifest.render[0]?.renderer !== CORE001_RENDERER_ID) return {};

  const { renderer } = await import("../profiles/core001/renderer.js");
  return { [renderer.id]: renderer };
}

async function main(): Promise<void> {
  let cli: CliOptions;
  try {
    cli = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  let renderers: Record<string, Renderer>;
  try {
    renderers = await loadProfileRenderers(cli.allowExecutableProfile, cli.specDir);
  } catch (error) {
    console.error(
      `Не удалось загрузить рендерер профиля: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  const result = await runBuild({
    ...cli,
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
    printHuman(result, cli.specDir);
  }

  process.exitCode = result.exitCode;
}

void main();
