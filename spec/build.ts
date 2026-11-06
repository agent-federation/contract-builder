import path from "node:path";
import { loadProfileRenderers } from "./cli-renderers.js";
import { runBuild, type BuildResult } from "./lib/build.js";
import { SEVERITY_LABEL, type Severity } from "./lib/diagnostics.js";
import type { BuildMode, Renderer } from "./lib/render.js";

interface CliOptions {
  mode: BuildMode;
  specDir: string;
  check: boolean;
  write: boolean;
  strict: boolean;
  json: boolean;
  allowExecutableProfile: boolean;
  engineRoot?: string;
}

const USAGE =
  "Использование: tsx spec/build.ts [--mode draft|release] [--spec <dir>] [--engine-root <dir>] [--check] [--no-write] [--strict] [--json] [--allow-executable-profile]";

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
      case "--engine-root": {
        const value = argv[i + 1];
        if (value === undefined) throw new Error("--engine-root требует путь к каталогу движка");
        options.engineRoot = path.resolve(value);
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
