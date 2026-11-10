import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ErrorObject, ValidateFunction } from "ajv";
import type { Diagnostics } from "./diagnostics.js";
import type { LocalizedMessage } from "./messages.js";
import { isNonEmptyString, isObject, messageOf } from "./guards.js";
import type { LoadedSpec } from "./load.js";
import { resolveContained, type ResolvedProject } from "./manifest.js";

export interface SchemaSet {
  get(id: string): ValidateFunction | undefined;
}

/**
 * Loads every schema the profile declares — document schemas and per-kind entity schemas —
 * into one AJV instance, so document schemas can `$ref` entity schemas by `$id`.
 */
export async function loadSchemas(
  project: ResolvedProject,
  diags: Diagnostics,
): Promise<SchemaSet | null> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const ids = new Map<string, string>();

  for (const [schemaId, relative] of Object.entries(project.profile.schemas)) {
    const located = await resolveContained(project.profileDir, relative);
    if (!located.inside) {
      diags.error(
        "core.path.outside-root#schema-path-escape",
        "profile.json",
        `/schemas/${schemaId}`,
        { relative: relative },
      );
      return null;
    }

    let schema: unknown;
    try {
      schema = JSON.parse(await readFile(located.abs, "utf8"));
    } catch (error) {
      diags.error("ERR_SCHEMA_DEFINITION#schema-parse-failed", relative, "", {
        error: messageOf(error),
      });
      return null;
    }

    if (!isObject(schema) || !isNonEmptyString(schema.$id)) {
      diags.error("ERR_SCHEMA_DEFINITION#schema-id-required", relative, "");
      return null;
    }

    try {
      ajv.addSchema(schema as AnySchema);
    } catch (error) {
      diags.error("ERR_SCHEMA_DEFINITION#schema-compile-failed", relative, "", {
        error: messageOf(error),
      });
      return null;
    }

    ids.set(schemaId, schema.$id);
  }

  const validators = new Map<string, ValidateFunction>();
  for (const [schemaId, id] of ids) {
    const validate = ajv.getSchema(id);
    if (validate === undefined) {
      diags.error(
        "ERR_SCHEMA_DEFINITION#schema-not-registered",
        "profile.json",
        `/schemas/${schemaId}`,
        { id: id },
      );
      return null;
    }
    validators.set(schemaId, validate);
  }

  return { get: (id) => validators.get(id) };
}

/**
 * Validates every declared input document as a whole. Entity contents are validated
 * separately during extraction, so a document failure stops before extraction starts.
 */
export async function validateDocuments(
  loaded: LoadedSpec,
  schemas: SchemaSet,
  diags: Diagnostics,
): Promise<boolean> {
  let ok = true;

  for (const input of loaded.project.manifest.inputs) {
    const document = loaded.documents[input.path];
    if (document === undefined) continue; // optional input that is absent

    const validate = schemas.get(input.schema);
    if (validate === undefined) {
      diags.error("core.profile.invalid#schema-undeclared", "profile.json", "/schemas", {
        schema: input.schema,
      });
      ok = false;
      continue;
    }

    if (!validate(document)) {
      ok = false;
      for (const err of validate.errors ?? []) {
        diags.error("ERR_SCHEMA#validation", input.path, err.instancePath || "", {
          detail: describe(err),
        });
      }
    }
  }

  return ok;
}

/** Validates one extracted entity against its kind schema; failures are `core.schema.entity`. */
export function validateEntityValue(
  schemas: SchemaSet,
  schemaId: string,
  value: unknown,
  location: { file: string; pointer: string },
  diags: Diagnostics,
): boolean {
  const validate = schemas.get(schemaId);
  if (validate === undefined) {
    diags.error("core.profile.invalid#kind-schema-undeclared", "profile.json", "/schemas", {
      schemaId,
    });
    return false;
  }

  if (validate(value)) return true;

  for (const err of validate.errors ?? []) {
    diags.error(
      "core.schema.entity#validation",
      location.file,
      `${location.pointer}${err.instancePath}`,
      { detail: describe(err) },
    );
  }
  return false;
}

/** One Ajv error as a localized detail; nested inside an `ERR_SCHEMA` diagnostic. */
function describe(err: ErrorObject): LocalizedMessage {
  const params = err.params as Record<string, unknown>;
  switch (err.keyword) {
    case "required":
      return {
        en: `Missing required field "${String(params.missingProperty)}"`,
        ru: `Отсутствует обязательное поле "${String(params.missingProperty)}"`,
      };
    case "additionalProperties":
      return {
        en: `Unknown field "${String(params.additionalProperty)}"`,
        ru: `Неизвестное поле "${String(params.additionalProperty)}"`,
      };
    case "enum":
      return {
        en: `Invalid value; expected one of: ${JSON.stringify(params.allowedValues)}`,
        ru: `Недопустимое значение; ожидается одно из: ${JSON.stringify(params.allowedValues)}`,
      };
    case "pattern":
      return {
        en: `Value does not match the pattern ${String(params.pattern)}`,
        ru: `Значение не соответствует шаблону ${String(params.pattern)}`,
      };
    case "type":
      return {
        en: `Expected type ${String(params.type)}`,
        ru: `Ожидается тип ${String(params.type)}`,
      };
    case "minItems":
      return { en: "The array must not be empty", ru: "Массив не должен быть пустым" };
    case "minLength":
      return { en: "The string must not be empty", ru: "Строка не должна быть пустой" };
    default: {
      const text = err.message ?? "Schema violation";
      return { en: text, ru: err.message ?? "Нарушение схемы" };
    }
  }
}
