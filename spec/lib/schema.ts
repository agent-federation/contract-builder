import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { SpecFiles } from "./load.js";
import type { Diagnostics } from "./diagnostics.js";

interface SchemaEntry {
  key: keyof SpecFiles;
  file: string;
  display: string;
}

const SCHEMAS: SchemaEntry[] = [
  { key: "sources", file: "sources.schema.json", display: "sources.yml" },
  { key: "ontology", file: "ontology.schema.json", display: "ontology.yml" },
  { key: "semantics", file: "semantics.schema.json", display: "semantics.json" },
  { key: "decisions", file: "decisions.schema.json", display: "decisions.yml" },
  { key: "cases", file: "cases.schema.json", display: "conformance/cases.yml" },
];

const schemaDir = fileURLToPath(new URL("../schemas/", import.meta.url));

export async function validateSchemas(files: SpecFiles, diags: Diagnostics): Promise<boolean> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  let ok = true;

  for (const entry of SCHEMAS) {
    let validate: ValidateFunction;
    try {
      const text = await readFile(path.join(schemaDir, entry.file), "utf8");
      validate = ajv.compile(JSON.parse(text));
    } catch (error) {
      diags.error(
        "ERR_SCHEMA_DEFINITION",
        entry.file,
        "",
        `Схема не компилируется: ${error instanceof Error ? error.message : String(error)}`,
      );
      ok = false;
      continue;
    }

    if (!validate(files[entry.key])) {
      ok = false;
      for (const err of validate.errors ?? []) {
        diags.error(
          "ERR_SCHEMA",
          entry.display,
          err.instancePath || "",
          describe(err),
        );
      }
    }
  }

  return ok;
}

function describe(err: ErrorObject): string {
  const params = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case "required":
      return `Отсутствует обязательное поле "${String(params.missingProperty)}"`;
    case "additionalProperties":
      return `Неизвестное поле "${String(params.additionalProperty)}"`;
    case "enum":
      return `Недопустимое значение; ожидается одно из: ${JSON.stringify(params.allowedValues)}`;
    case "pattern":
      return `Значение не соответствует шаблону ${String(params.pattern)}`;
    case "type":
      return `Ожидается тип ${String(params.type)}`;
    case "minItems":
      return "Массив не должен быть пустым";
    case "minLength":
      return "Строка не должна быть пустой";
    default:
      return err.message ?? "Нарушение схемы";
  }
}
