import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { LoadedSpec } from "./load.js";
import type { Diagnostics } from "./diagnostics.js";
import { resolveContained } from "./manifest.js";

/**
 * Validates every declared input document as a whole against the schema id named in the
 * manifest. Entity-kind schemas are declared in the profile but are not enforced until PR 3.
 */
export async function validateDocuments(
  loaded: LoadedSpec,
  diags: Diagnostics,
): Promise<boolean> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const compiled = new Map<string, ValidateFunction>();
  let ok = true;

  for (const input of loaded.project.manifest.inputs) {
    const document = loaded.documents[input.path];
    if (document === undefined) continue; // optional input that is absent

    const schemaRelative = loaded.project.profile.schemas[input.schema];
    if (schemaRelative === undefined) {
      diags.error(
        "core.profile.invalid",
        "profile.json",
        "/schemas",
        `Схема "${input.schema}" не объявлена в профиле`,
      );
      ok = false;
      continue;
    }

    const located = await resolveContained(loaded.project.profileDir, schemaRelative);
    if (!located.inside) {
      diags.error(
        "core.path.outside-root",
        "profile.json",
        `/schemas/${input.schema}`,
        `Схема "${schemaRelative}" выходит за пределы каталога профиля`,
      );
      ok = false;
      continue;
    }

    let validate = compiled.get(located.abs);
    if (validate === undefined) {
      try {
        validate = ajv.compile(JSON.parse(await readFile(located.abs, "utf8")));
      } catch (error) {
        diags.error(
          "ERR_SCHEMA_DEFINITION",
          schemaRelative,
          "",
          `Схема не компилируется: ${error instanceof Error ? error.message : String(error)}`,
        );
        ok = false;
        continue;
      }
      compiled.set(located.abs, validate);
    }

    if (!validate(document)) {
      ok = false;
      for (const err of validate.errors ?? []) {
        diags.error("ERR_SCHEMA", input.path, err.instancePath || "", describe(err));
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
