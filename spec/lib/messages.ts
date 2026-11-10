/**
 * Per-locale message catalogs keyed by diagnostic code.
 *
 * Every engine diagnostic message lives here, not in the module that emits it. The key is
 * `<code>#<variant>`: an entry keeps its diagnostic code visible, while a code that is
 * emitted from several contexts gets one variant per message, mirroring the profile catalog.
 * English is the default CLI locale; Russian reproduces the pre-localization wording.
 *
 * Profile-owned messages stay in the profile's `diagnostics` catalog with per-locale entries.
 */

import { type Locale } from "./locale.js";

/** One message rendered in every supported locale. */
export type LocalizedMessage = Readonly<Record<Locale, string>>;

/**
 * Runtime values substituted into a message's `{{name}}` placeholders. A value that is
 * itself localized (an Ajv error detail, a nested problem description, a thrown engine error)
 * is rendered in the output locale instead of being flattened to one language.
 */
export interface MessageParams {
  readonly [name: string]: unknown;
}

/** Resolves a dotted placeholder name (`{{entity.id}}`) against nested parameter scope. */
function lookup(params: MessageParams, name: string): unknown {
  let current: unknown = params;
  for (const part of name.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function isLocalizedMessage(value: unknown): value is LocalizedMessage {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.en === "string" && typeof record.ru === "string";
}

/** Interpolates `{{name}}` placeholders; returns null when a value is missing. */
export function interpolate(
  template: string,
  params: MessageParams,
  locale: Locale,
): string | null {
  let missing = false;
  const message = template.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_match, name: string) => {
    const value = lookup(params, name);
    if (value === undefined || value === null) {
      missing = true;
      return "";
    }
    return isLocalizedMessage(value) ? value[locale] : String(value);
  });
  return missing ? null : message;
}

type MessageTuple = readonly [code: string, variant: string, en: string, ru: string];

/** Position of each locale in a catalog tuple; a new locale must add an entry here. */
const MESSAGE_LOCALE_INDEX: Record<Locale, 2 | 3> = { en: 2, ru: 3 };

/**
 * The engine message catalog. One tuple per message: code, variant, English, Russian.
 * The code strings stay complete literals so the diagnostic registry freshness check can
 * discover every emitted code statically.
 */
export const ENGINE_MESSAGES = [
  [
    "ERR_DUPLICATE_ID",
    "duplicate-id",
    'ID "{{id}}" is already declared',
    'ID "{{id}}" уже объявлен',
  ],
  [
    "ERR_IO",
    "engine-version-failed",
    "Failed to determine the engine version: {{error}}",
    "Не удалось определить версию движка: {{error}}",
  ],
  [
    "ERR_IO",
    "file-read-failed",
    "Failed to read the file: {{error}}",
    "Не удалось прочитать файл: {{error}}",
  ],
  [
    "ERR_IO",
    "lockfile-read-failed",
    "Failed to read bun.lock: {{error}}",
    "Не удалось прочитать bun.lock: {{error}}",
  ],
  [
    "ERR_IO",
    "manifest-read-failed",
    "Failed to read the manifest: {{error}}",
    "Не удалось прочитать манифест: {{error}}",
  ],
  [
    "ERR_IO",
    "profile-lockfile-read-failed",
    "Failed to read bun.lock: {{error}}",
    "Не удалось прочитать bun.lock: {{error}}",
  ],
  [
    "ERR_IO",
    "running-engine-version-failed",
    "Failed to determine the running engine version: {{error}}",
    "Не удалось определить версию запущенного движка: {{error}}",
  ],
  [
    "ERR_IO",
    "source-read-failed",
    "Failed to read the source: {{error}}",
    "Не удалось прочитать источник: {{error}}",
  ],
  [
    "ERR_OUTPUT_STALE",
    "output-stale",
    "The generated document differs from the stored one. Run the build without --check.",
    "Сгенерированный документ отличается от сохранённого. Запустите сборку без --check.",
  ],
  ["ERR_PARSE", "parse-error", "Parse error: {{error}}", "Ошибка разбора: {{error}}"],
  [
    "ERR_PARSE",
    "top-level-object-required",
    "The file must contain a top-level object",
    "Файл должен содержать объект верхнего уровня",
  ],

  [
    "ERR_SCHEMA_DEFINITION",
    "schema-compile-failed",
    "Failed to compile the schema: {{error}}",
    "Схема не компилируется: {{error}}",
  ],
  [
    "ERR_SCHEMA_DEFINITION",
    "schema-id-required",
    "The schema must declare $id",
    "Схема должна объявлять $id",
  ],
  [
    "ERR_SCHEMA_DEFINITION",
    "schema-not-registered",
    'Schema "{{id}}" is not registered',
    'Схема "{{id}}" не зарегистрирована',
  ],
  [
    "ERR_SCHEMA_DEFINITION",
    "schema-parse-failed",
    "Failed to parse the schema: {{error}}",
    "Схема не разобрана: {{error}}",
  ],
  [
    "ERR_UNKNOWN_REF",
    "source-undeclared",
    "No document source is declared",
    "Не объявлен источник документа",
  ],
  [
    "ERR_UNKNOWN_REF",
    "target-kind-mismatch",
    'Target "{{targetId}}" has kind "{{kind}}", expected "{{to}}"',
    'Цель "{{targetId}}" имеет вид "{{kind}}", ожидается "{{to}}"',
  ],
  [
    "ERR_UNKNOWN_REF",
    "target-unknown",
    'Unknown relation target "{{targetId}}"',
    'Неизвестная цель связи "{{targetId}}"',
  ],
  [
    "ERR_UNKNOWN_REF",
    "unknown-source",
    'Unknown source "{{source}}"',
    'Неизвестный источник "{{source}}"',
  ],
  [
    "core.engine.root-unavailable",
    "import-remap-unavailable",
    "The runtime does not support engine import remapping; the build stopped to avoid executing modules from outside engineRoot",
    "Среда выполнения не поддерживает перенаправление импортов движка; сборка остановлена, чтобы не выполнить модули не из engineRoot",
  ],
  [
    "core.engine.version-mismatch",
    "engine-root-version-failed",
    'Failed to determine the engine version in "{{root}}": {{error}}',
    'Не удалось определить версию движка в "{{root}}": {{error}}',
  ],
  [
    "core.engine.version-mismatch",
    "engine-version-mismatch",
    'Engine root "{{root}}" declares version {{version}}, but the running engine is {{running}}: modules do not match the reported version',
    'Корень движка "{{root}}" объявляет версию {{version}}, но выполняется движок {{running}}: модули не соответствуют отчётной версии',
  ],
  [
    "core.extension.unpinned-dependency",
    "absolute-import",
    'Absolute import "{{specifier}}" is not allowed in extension code',
    'Абсолютный импорт "{{specifier}}" недопустим в коде расширения',
  ],
  [
    "core.extension.unpinned-dependency",
    "declared-file-escape",
    'Declared file "{{relative}}" escapes the extension directory',
    'Объявленный файл "{{relative}}" выходит за пределы каталога расширения',
  ],
  [
    "core.extension.unpinned-dependency",
    "declared-file-unreadable",
    'Failed to read declared file "{{relative}}": {{error}}',
    'Объявленный файл "{{relative}}" не прочитан: {{error}}',
  ],
  [
    "core.extension.unpinned-dependency",
    "declared-path-escape",
    'Declared path "{{value}}" must stay inside the extension directory',
    'Объявленный путь "{{value}}" должен оставаться внутри каталога расширения',
  ],
  [
    "core.extension.unpinned-dependency",
    "dependency-not-found",
    'Dependency "{{name}}" is not found in bun.lock',
    'Зависимость "{{name}}" не найдена в bun.lock',
  ],
  [
    "core.extension.unpinned-dependency",
    "dependency-unpinned",
    'Dependency "{{name}}@{{version}}" has no integrity in bun.lock',
    'У зависимости "{{name}}@{{version}}" отсутствует integrity в bun.lock',
  ],
  [
    "core.extension.unpinned-dependency",
    "dependency-version-mismatch",
    'Dependency "{{name}}" is declared as "{{version}}", but bun.lock contains {{found}}',
    'Версия зависимости "{{name}}" объявлена как "{{version}}", а bun.lock содержит {{found}}',
  ],
  [
    "core.extension.unpinned-dependency",
    "engine-module-missing",
    'Engine module "{{subpath}}" is not found in {{libRoot}}',
    'Модуль движка "{{subpath}}" не найден в {{libRoot}}',
  ],
  [
    "core.extension.unpinned-dependency",
    "extension-closure-missing",
    'Extension "{{kind}}:{{id}}" does not declare files and dependencies',
    'Расширение "{{kind}}:{{id}}" не объявляет files и dependencies',
  ],
  [
    "core.extension.unpinned-dependency",
    "extension-root-missing",
    'Extension "{{kind}}:{{id}}" declares files without a root directory',
    'Расширение "{{kind}}:{{id}}" объявляет files без корневого каталога',
  ],
  [
    "core.extension.unpinned-dependency",
    "import-ambiguous",
    'Import "{{specifier}}" is ambiguous: the spec/lib segment appears {{occurrences}} times',
    'Импорт "{{specifier}}" неоднозначен: последовательность spec/lib встречается {{occurrences}} раз',
  ],
  [
    "core.extension.unpinned-dependency",
    "import-dependency-undeclared",
    'Import "{{specifier}}" is not declared in the extension dependencies',
    'Импорт "{{specifier}}" не объявлен в dependencies расширения',
  ],
  [
    "core.extension.unpinned-dependency",
    "import-outside-files",
    'Import "{{specifier}}" escapes the extension files and is not an engine module',
    'Импорт "{{specifier}}" выходит за пределы files расширения и не является модулем движка',
  ],
  [
    "core.extension.unpinned-dependency",
    "import-scheme",
    'Import "{{specifier}}" uses a disallowed URL scheme: {{scheme}}:',
    'Импорт "{{specifier}}" использует недопустимую URL-схему: {{scheme}}:',
  ],
  [
    "core.extension.unpinned-dependency",
    "import-subpath-invalid",
    'Import "{{specifier}}" has an invalid subpath after spec/lib',
    'Импорт "{{specifier}}" содержит недопустимый подпуть после spec/lib',
  ],
  [
    "core.extension.unpinned-dependency",
    "profile-file-uncovered",
    'Profile file "{{entry}}" ({{origin}}) is not declared in profile.files: add it to files so the profile closure and import scan cover this file',
    'Файл профиля "{{entry}}" ({{origin}}) не объявлен в profile.files: добавьте его в files, чтобы замыкание профиля и скан импортов покрывали этот файл',
  ],
  [
    "core.extension.unpinned-dependency",
    "profile-files-missing",
    "The profile does not declare files, so its closure cannot be determined",
    "Профиль не объявляет files, поэтому его замыкание нельзя определить",
  ],
  [
    "core.extension.unpinned-dependency",
    "relative-import-undeclared",
    'Relative import "{{specifier}}" is not among the declared extension files',
    'Относительный импорт "{{specifier}}" не входит в объявленные files расширения',
  ],
  [
    "core.extension.unpinned-dependency",
    "transitive-ambiguous",
    'Transitive dependency "{{name}}" is ambiguous in bun.lock',
    'Транзитивная зависимость "{{name}}" из bun.lock неоднозначна',
  ],
  [
    "core.extension.unpinned-dependency",
    "transitive-missing",
    'Transitive dependency "{{name}}" is not found in bun.lock',
    'Транзитивная зависимость "{{name}}" не найдена в bun.lock',
  ],
  [
    "core.extract.pointer",
    "pointer-not-array",
    'Pointer "{{pointer}}" does not point to an array of objects',
    'Указатель "{{pointer}}" не ведёт к массиву объектов',
  ],
  [
    "core.identity.missing",
    "identity-missing",
    'Identifier "{{identityField}}" is missing or empty',
    'Идентификатор "{{identityField}}" отсутствует или пуст',
  ],
  ["core.manifest.invalid", "entities-required", "entities is required", "entities обязателен"],
  [
    "core.manifest.invalid",
    "entry-kind-pointer-required",
    "kind and pointer are required",
    "kind и pointer обязательны",
  ],
  [
    "core.manifest.invalid",
    "input-format-invalid",
    "format must be json or yaml",
    "format должен быть json или yaml",
  ],
  [
    "core.manifest.invalid",
    "input-not-object",
    "An input must be an object",
    "Вход должен быть объектом",
  ],
  [
    "core.manifest.invalid",
    "input-path-schema-required",
    "path and schema are required",
    "path и schema обязательны",
  ],
  [
    "core.manifest.invalid",
    "inputs-required",
    "inputs is required and must not be empty",
    "inputs обязателен и непуст",
  ],
  [
    "core.manifest.invalid",
    "label-not-string",
    "A label value must be a string",
    "Значение метки должно быть строкой",
  ],
  [
    "core.manifest.invalid",
    "labels-not-object",
    "The labels file must be an object",
    "Файл меток должен быть объектом",
  ],
  [
    "core.manifest.invalid",
    "labels-unreadable",
    "Failed to read labels: {{error}}",
    "Метки не прочитаны: {{error}}",
  ],
  [
    "core.manifest.invalid",
    "locale",
    'Unsupported locale "{{value}}"; supported locales: {{locales}}',
    'Неподдерживаемая локаль "{{value}}"; поддерживаемые локали: {{locales}}',
  ],
  [
    "core.manifest.invalid",
    "manifest-not-object",
    "Manifest must be an object",
    "Манифест должен быть объектом",
  ],
  [
    "core.manifest.invalid",
    "manifest-parse-failed",
    "Failed to parse the manifest: {{error}}",
    "Манифест не разобран: {{error}}",
  ],
  [
    "core.manifest.invalid",
    "manifest-version-required",
    "manifestVersion is required",
    "manifestVersion обязателен",
  ],
  [
    "core.manifest.invalid",
    "output-mode-missing",
    "No output is declared for mode {{mode}}",
    "Не объявлен выход для режима {{mode}}",
  ],
  [
    "core.manifest.invalid",
    "output-not-object",
    "output must be an object",
    "output должен быть объектом",
  ],
  [
    "core.manifest.invalid",
    "output-path-required",
    "The output path must be a non-empty string",
    "Путь вывода должен быть непустой строкой",
  ],
  [
    "core.manifest.invalid",
    "output-root-required",
    "output.root must be a non-empty string",
    "output.root должен быть непустой строкой",
  ],
  ["core.manifest.invalid", "outputs-required", "outputs is required", "outputs обязателен"],
  [
    "core.manifest.invalid",
    "profile-id-version-required",
    "profile.id and profile.version are required",
    "profile.id и profile.version обязательны",
  ],
  ["core.manifest.invalid", "profile-required", "profile is required", "profile обязателен"],
  [
    "core.manifest.invalid",
    "profile-source-local-required",
    "M1 requires a local profile.source",
    "M1 требует локальный profile.source",
  ],
  [
    "core.manifest.invalid",
    "project-id-required",
    "project.id is required",
    "project.id обязателен",
  ],
  [
    "core.manifest.invalid",
    "render-field-required",
    "{{key}} must be a non-empty string",
    "{{key}} должен быть непустой строкой",
  ],
  [
    "core.manifest.invalid",
    "render-not-array",
    "M1 supports exactly one render target: render must be an array",
    "M1 поддерживает ровно один render target: render должен быть массивом",
  ],
  [
    "core.manifest.invalid",
    "render-single-count",
    "M1 supports exactly one render target; declared {{count}}. Keep exactly one declaration in render[]",
    "M1 поддерживает ровно один render target; объявлено {{count}}. Оставьте ровно одно объявление в render[]",
  ],
  [
    "core.manifest.invalid",
    "render-target-absent",
    "M1 supports exactly one render target; declared 0",
    "M1 поддерживает ровно один render target; объявлено 0",
  ],
  [
    "core.manifest.invalid",
    "render-target-missing",
    "M1 supports exactly one render target; declared 0",
    "M1 поддерживает ровно один render target; объявлено 0",
  ],
  [
    "core.manifest.invalid",
    "render-template-required",
    "render.template is required",
    "render.template обязателен",
  ],
  [
    "core.manifest.invalid",
    "renderer-required",
    "render.renderer is required",
    "render.renderer обязателен",
  ],
  [
    "core.manifest.invalid",
    "source-count-zero",
    "M1 supports exactly one source: manifest.sources must contain exactly one entry; zero-source manifests are not supported by M1 (declared 0)",
    '"M1 supports exactly one source: manifest.sources must contain exactly one entry; " +\n        "zero-source manifests are not supported by M1 (declared 0)"',
  ],
  [
    "core.manifest.invalid",
    "source-fields-required",
    "id, path and adapter are required",
    "id, path и adapter обязательны",
  ],
  [
    "core.manifest.invalid",
    "source-identity-required",
    "identity.document and identity.revision are required in M1",
    "identity.document и identity.revision обязательны в M1",
  ],
  [
    "core.manifest.invalid",
    "source-not-object",
    "A source must be an object",
    "Источник должен быть объектом",
  ],
  [
    "core.manifest.invalid",
    "sources-not-array",
    "sources must be an array",
    "sources должен быть массивом",
  ],
  [
    "core.manifest.invalid",
    "sources-single-many",
    "M1 supports exactly one source: manifest.sources must contain exactly one entry; multi-source manifests are not supported by M1 (declared {{count}})",
    "M1 supports exactly one source: manifest.sources must contain exactly one entry; multi-source manifests are not supported by M1 (declared {{count}})",
  ],
  [
    "core.manifest.invalid",
    "sources-single-zero",
    "M1 supports exactly one source: manifest.sources must contain exactly one entry; zero-source manifests are not supported by M1 (declared 0)",
    "M1 supports exactly one source: manifest.sources must contain exactly one entry; zero-source manifests are not supported by M1 (declared 0)",
  ],
  [
    "core.manifest.invalid",
    "templates-unreadable",
    "Failed to read templates: {{error}}",
    "Шаблоны не прочитаны: {{error}}",
  ],
  [
    "core.manifest.missing",
    "manifest-missing",
    "Project manifest not found",
    "Манифест проекта не найден",
  ],
  [
    "core.path.outside-root",
    "catalog-path-escape",
    'Catalog "{{relative}}" escapes the profile directory',
    'Каталог "{{relative}}" выходит за пределы каталога профиля',
  ],
  [
    "core.path.outside-root",
    "engine-lib-unavailable",
    "The engine root's spec/lib directory is unavailable: {{error}}",
    "Каталог spec/lib корня движка недоступен: {{error}}",
  ],
  [
    "core.path.outside-root",
    "engine-module-escape",
    'Engine module "{{subpath}}" resolves outside {{libRoot}} after realpath',
    'Модуль движка "{{subpath}}" после realpath выходит за пределы {{libRoot}}',
  ],
  [
    "core.path.outside-root",
    "engine-root-absolute",
    'Engine root "{{candidate}}" must be an absolute path',
    'Корень движка "{{candidate}}" должен быть абсолютным путём',
  ],
  [
    "core.path.outside-root",
    "engine-root-layout",
    'Engine root "{{root}}" must contain spec/lib and package.json',
    'Корень движка "{{root}}" должен содержать spec/lib и package.json',
  ],
  [
    "core.path.outside-root",
    "engine-root-unavailable",
    'Engine root "{{candidate}}" is unavailable: {{error}}',
    'Корень движка "{{candidate}}" недоступен: {{error}}',
  ],
  [
    "core.path.outside-root",
    "import-outside-project",
    'Import "{{specifier}}" escapes the project root',
    'Импорт "{{specifier}}" выходит за пределы корня проекта',
  ],
  [
    "core.path.outside-root",
    "input-external-required",
    'Input "{{path}}" outside the project root requires external: true',
    'Вход "{{path}}" вне корня проекта требует external: true',
  ],
  [
    "core.path.outside-root",
    "module-path-escape",
    'Profile module "{{relative}}" escapes the profile directory',
    'Модуль профиля "{{relative}}" выходит за пределы каталога профиля',
  ],
  [
    "core.path.outside-root",
    "output-path-escape",
    'Output path "{{relative}}" escapes the output root',
    'Путь вывода "{{relative}}" выходит за пределы корня вывода',
  ],
  [
    "core.path.outside-root",
    "output-root-escape",
    "The output root is outside the project",
    "Корень вывода выходит за пределы проекта",
  ],
  [
    "core.path.outside-root",
    "profile-external-required",
    'Profile "{{source}}" outside the project root requires external: true',
    'Профиль "{{source}}" вне корня проекта требует external: true',
  ],
  [
    "core.path.outside-root",
    "profile-path-escape",
    'Path "{{declared}}" escapes the profile directory',
    'Путь "{{declared}}" выходит за пределы каталога профиля',
  ],
  [
    "core.path.outside-root",
    "schema-path-escape",
    'Schema "{{relative}}" escapes the profile directory',
    'Схема "{{relative}}" выходит за пределы каталога профиля',
  ],
  [
    "core.path.outside-root",
    "source-external-required",
    'Source "{{path}}" outside the project root requires external: true',
    'Источник "{{path}}" вне корня проекта требует external: true',
  ],
  [
    "core.profile.consent-required",
    "consent-required",
    "The profile declares executable modules ({{modules}}). Loading them requires the caller's explicit consent: allowExecutableProfile: true in runBuild or --allow-executable-profile in the CLI. Consent allows trusted code to run in the builder process and is not isolation.",
    "Профиль объявляет исполняемые модули ({{modules}}). Их загрузка требует явного согласия вызывающего: allowExecutableProfile: true в runBuild или --allow-executable-profile в CLI. Согласие разрешает выполнить доверенный код в процессе сборщика и не является изоляцией.",
  ],
  [
    "core.profile.invalid",
    "binding-input-unloaded",
    'Binding "{{key}}" references an input "{{input}}" that was not loaded',
    'Привязка "{{key}}" ссылается на незагруженный вход "{{input}}"',
  ],
  [
    "core.profile.invalid",
    "catalog-invalid",
    "The profile catalog must contain a codes array with code, severity and message fields",
    "Каталог профиля должен содержать массив codes с полями code, severity и message",
  ],
  [
    "core.profile.invalid",
    "catalog-missing",
    "The profile does not declare a catalog",
    "Профиль не объявляет каталог",
  ],
  [
    "core.profile.invalid",
    "catalog-unreadable",
    "Failed to read the profile catalog: {{error}}",
    "Каталог профиля не прочитан: {{error}}",
  ],
  [
    "core.profile.invalid",
    "dependencies-not-object",
    "dependencies must be an object",
    "dependencies должен быть объектом",
  ],
  [
    "core.profile.invalid",
    "dependency-version-required",
    "A dependency version must be a non-empty string",
    "Версия зависимости должна быть непустой строкой",
  ],
  [
    "core.profile.invalid",
    "diagnostics-required",
    "diagnostics must be a non-empty string",
    "diagnostics должен быть непустой строкой",
  ],
  [
    "core.profile.invalid",
    "document-key-input-required",
    "key and input are required",
    "key и input обязательны",
  ],
  [
    "core.profile.invalid",
    "document-unbound",
    'The profile does not bind the required document "{{key}}"',
    'Профиль не связывает обязательный документ "{{key}}"',
  ],
  ["core.profile.invalid", "documents-required", "documents is required", "documents обязателен"],
  [
    "core.profile.invalid",
    "entity-kinds-required",
    "entityKinds is required",
    "entityKinds обязателен",
  ],
  [
    "core.profile.invalid",
    "executable-profile",
    "M1 requires an executable profile: profile.view and profile.validator must be declared; data-only profiles are not supported by M1",
    "M1 requires an executable profile: profile.view and profile.validator must be declared; data-only profiles are not supported by M1",
  ],
  [
    "core.profile.invalid",
    "files-array-required",
    "files must be an array of non-empty strings",
    "files должен быть массивом непустых строк",
  ],
  [
    "core.profile.invalid",
    "inverse-required",
    "inverse must be a non-empty string",
    "inverse должен быть непустой строкой",
  ],
  [
    "core.profile.invalid",
    "inverse-target-mismatch",
    'Inverse relation "{{inverse}}" points to kind "{{to}}", expected "{{from}}"',
    'Обратная связь "{{inverse}}" ведёт на вид "{{to}}", ожидался "{{from}}"',
  ],
  [
    "core.profile.invalid",
    "inverse-unknown",
    'Inverse relation "{{inverse}}" is not declared for kind "{{to}}"',
    'Обратная связь "{{inverse}}" не объявлена для вида "{{to}}"',
  ],
  [
    "core.profile.invalid",
    "kind-schema-undeclared",
    'Kind schema "{{schemaId}}" is not declared in the profile',
    'Схема вида "{{schemaId}}" не объявлена в профиле',
  ],
  [
    "core.profile.invalid",
    "message-field-missing",
    'Message "{{code}}" references a field that exists in neither the finding data nor the entity',
    'Сообщение "{{code}}" ссылается на поле, которого нет ни в данных находки, ни в сущности',
  ],
  [
    "core.profile.invalid",
    "message-locale-missing",
    'The message for code "{{code}}" has no text for locale "{{locale}}"',
    'Сообщение кода "{{code}}" не имеет текста для локали "{{locale}}"',
  ],
  [
    "core.profile.invalid",
    "module-load-failed",
    "Failed to load the profile module: {{error}}",
    "Модуль профиля не загружен: {{error}}",
  ],
  [
    "core.profile.invalid",
    "profile-id-version-missing",
    "id and version are required",
    "id и version обязательны",
  ],
  [
    "core.profile.invalid",
    "profile-module-missing",
    "The profile does not declare {{key}}",
    "Профиль не объявляет {{key}}",
  ],
  [
    "core.profile.invalid",
    "profile-not-object",
    "profile.json must be an object",
    "profile.json должен быть объектом",
  ],
  [
    "core.profile.invalid",
    "profile-parse-failed",
    "Failed to parse profile.json: {{error}}",
    "profile.json не разобран: {{error}}",
  ],
  [
    "core.profile.invalid",
    "profile-read-failed",
    "Failed to read the profile: {{error}}",
    "Профиль не прочитан: {{error}}",
  ],
  [
    "core.profile.invalid",
    "profile-version-mismatch",
    'Profile "{{id}}@{{version}}" does not match the declared "{{declaredId}}@{{declaredVersion}}"',
    'Профиль "{{id}}@{{version}}" не совпадает с объявленным "{{declaredId}}@{{declaredVersion}}"',
  ],
  [
    "core.profile.invalid",
    "provenance-fields-required",
    "kind, source, ref and quote are required",
    "kind, source, ref и quote обязательны",
  ],
  [
    "core.profile.invalid",
    "provenance-not-array",
    "provenance must be an array",
    "provenance должен быть массивом",
  ],
  [
    "core.profile.invalid",
    "relation-cardinality-invalid",
    "cardinality must be one or many",
    "cardinality должен быть one или many",
  ],
  [
    "core.profile.invalid",
    "relation-duplicate",
    'Relation "{{name}}" is declared more than once for kind "{{from}}"',
    'Связь "{{name}}" для вида "{{from}}" объявлена повторно',
  ],
  [
    "core.profile.invalid",
    "relation-fields-required",
    "name, from and to are required",
    "name, from и to обязательны",
  ],
  [
    "core.profile.invalid",
    "relations-not-array",
    "relations must be an array",
    "relations должен быть массивом",
  ],
  [
    "core.profile.invalid",
    "schema-path-required",
    "The schema path must be a non-empty string",
    "Путь схемы должен быть непустой строкой",
  ],
  ["core.profile.invalid", "schema-required", "schema is required", "schema обязателен"],
  [
    "core.profile.invalid",
    "schema-undeclared",
    'Schema "{{schema}}" is not declared in the profile',
    'Схема "{{schema}}" не объявлена в профиле',
  ],
  ["core.profile.invalid", "schemas-required", "schemas is required", "schemas обязателен"],
  [
    "core.profile.invalid",
    "validator-export-missing",
    "The profile validator module does not export validate",
    "Модуль валидатора профиля не экспортирует validate",
  ],
  [
    "core.profile.invalid",
    "validator-required",
    "validator must be a non-empty string",
    "validator должен быть непустой строкой",
  ],
  [
    "core.profile.invalid",
    "view-export-missing",
    "The profile view module does not export buildView",
    "Модуль представления профиля не экспортирует buildView",
  ],
  [
    "core.profile.invalid",
    "view-required",
    "view must be a non-empty string",
    "view должен быть непустой строкой",
  ],
  [
    "core.profile.invalid",
    "wildcard-inverse",
    'Relation "{{name}}" with target kind "*" cannot declare an inverse "{{inverse}}": the target kind is undefined',
    'Связь "{{name}}" с видом цели "*" не может объявлять обратную связь "{{inverse}}": целевой вид не определён',
  ],
  [
    "core.profile.unknown-code",
    "unknown-code",
    'Code "{{code}}"{{variantSuffix}} is not declared in the profile catalog',
    'Код "{{code}}"{{variantSuffix}} не объявлен в каталоге профиля',
  ],
  [
    "core.profile.unknown-kind",
    "kind-unknown",
    'Kind "{{kind}}" is not declared in the profile',
    'Вид "{{kind}}" не объявлен в профиле',
  ],
  [
    "core.profile.unknown-relation",
    "from-kind-unknown",
    'Relation "{{name}}" references an unknown kind "{{from}}"',
    'Связь "{{name}}" ссылается на неизвестный вид "{{from}}"',
  ],
  [
    "core.profile.unknown-relation",
    "to-kind-unknown",
    'Relation "{{name}}" references an unknown kind "{{to}}"',
    'Связь "{{name}}" ссылается на неизвестный вид "{{to}}"',
  ],
  [
    "core.provenance.incomplete",
    "provenance-incomplete",
    'Provenance for "{{entityId}}" is incomplete: {{source}}, {{ref}} and {{quote}} are required',
    'Происхождение "{{entityId}}" неполно: нужны {{source}}, {{ref}} и {{quote}}',
  ],
  [
    "core.provenance.verification",
    "verification-binding-missing",
    'Verification record references "{{entityId}}", but the entity has no direct provenance binding',
    'Запись проверки ссылается на "{{entityId}}", но у сущности нет прямой привязки происхождения',
  ],
  [
    "core.provenance.verification",
    "verification-invalid",
    'Invalid verification record for "{{entityId}}": {{problem}}',
    'Некорректная запись проверки для "{{entityId}}": {{problem}}',
  ],
  [
    "core.provenance.verification",
    "verification-stale-digest",
    'Verification record for "{{entityId}}" is declared stale, but its digest matches the current source',
    'Запись проверки для "{{entityId}}" объявлена stale, но её digest совпадает с текущим источником',
  ],
  [
    "core.registry.missing",
    "adapter-not-registered",
    'Adapter "{{adapter}}" is not registered',
    'Адаптер "{{adapter}}" не зарегистрирован',
  ],
  [
    "core.registry.missing",
    "renderer-not-registered",
    'Renderer "{{id}}" is not registered',
    'Рендерер "{{id}}" не зарегистрирован',
  ],
  [
    "core.relation.cardinality",
    "inverse-multiple-references",
    'Inverse relation "{{inverse}}" accepts a single value, but several entities reference "{{targetId}}"',
    'Обратная связь "{{inverse}}" допускает одно значение, но на "{{targetId}}" ссылаются несколько сущностей',
  ],
  [
    "core.relation.cardinality",
    "single-value-array",
    'Relation "{{name}}" accepts a single value, got an array',
    'Связь "{{name}}" допускает одно значение, получен массив',
  ],
  [
    "core.relation.unknown",
    "relation-unknown",
    'Relation "{{name}}" is not declared for kind "{{kind}}"',
    'Связь "{{name}}" не объявлена для вида "{{kind}}"',
  ],
  [
    "core.render.failed",
    "render-failed",
    "The renderer failed: {{error}}",
    "Рендерер завершился с ошибкой: {{error}}",
  ],
  [
    "core.render.invalid",
    "artifact-count",
    "The renderer must return exactly one artifact in M1, got {{count}}",
    "Рендерер должен вернуть ровно один артефакт в M1, получено {{count}}",
  ],
  [
    "core.render.invalid",
    "artifact-path-mismatch",
    'The renderer returned path "{{path}}", expected "{{declared}}"',
    'Рендерер вернул путь "{{path}}", ожидается "{{declared}}"',
  ],
  [
    "core.schema.entity",
    "entity-not-object",
    "An entity must be an object",
    "Сущность должна быть объектом",
  ],
  [
    "core.schema.entity",
    "relation-value-type",
    'The value of relation "{{name}}" must be a string or an array of strings',
    'Значение связи "{{name}}" должно быть строкой или массивом строк',
  ],

  [
    "ERR_SCHEMA",
    "validation",
    "Schema validation failed: {{detail}}",
    "Схема не прошла проверку: {{detail}}",
  ],
  [
    "core.schema.entity",
    "validation",
    "Entity validation failed: {{detail}}",
    "Сущность не прошла проверку: {{detail}}",
  ],
  [
    "core.profile.invalid",
    "relation-inverse-missing",
    'Inverse relation "{{inverse}}" does not declare an inverse; expected "{{expected}}"',
    'Обратная связь "{{inverse}}" не объявляет обратной связи, ожидалось "{{expected}}"',
  ],
  [
    "core.profile.invalid",
    "relation-inverse-other",
    'Inverse relation "{{inverse}}" declares "{{actual}}" as its inverse; expected "{{expected}}"',
    'Обратная связь "{{inverse}}" объявляет обратной связью "{{actual}}", ожидалось "{{expected}}"',
  ],
] as const satisfies readonly MessageTuple[];

export type MessageKey =
  `${(typeof ENGINE_MESSAGES)[number][0]}#${(typeof ENGINE_MESSAGES)[number][1]}`;

/** Every engine catalog key names a diagnostic code and a message variant. */
export type DiagnosticMessageKey = MessageKey;

const MESSAGE_INDEX = new Map<string, MessageTuple>(
  ENGINE_MESSAGES.map((entry) => [`${entry[0]}#${entry[1]}`, entry]),
);

/** Every catalog key, for completeness tests. */
export const ENGINE_MESSAGE_KEYS: readonly MessageKey[] = ENGINE_MESSAGES.map(
  (entry) => `${entry[0]}#${entry[1]}` as MessageKey,
);

/** The diagnostic code a key belongs to. */
export function messageCode(key: MessageKey): string {
  const entry = MESSAGE_INDEX.get(key);
  if (entry === undefined) throw new Error(`unknown message key: ${key}`);
  return entry[0];
}

/** Renders one engine message in one locale. */
export function messageText(key: MessageKey, locale: Locale, params: MessageParams = {}): string {
  const entry = MESSAGE_INDEX.get(key);
  if (entry === undefined) throw new Error(`unknown message key: ${key}`);
  const template = entry[MESSAGE_LOCALE_INDEX[locale]];
  const text = interpolate(template, params, locale);
  if (text === null) throw new Error(`message ${key} references a missing parameter`);
  return text;
}

/** Renders one engine message in every supported locale. */
export function localizedMessage(key: MessageKey, params: MessageParams = {}): LocalizedMessage {
  return { en: messageText(key, "en", params), ru: messageText(key, "ru", params) };
}

/**
 * CLI strings that are not diagnostics (usage, framing, result lines). They are keyed the
 * same way but carry no diagnostic code.
 */
export const CLI_MESSAGES = {
  "cli.usage": [
    "Usage: tsx spec/build.ts [--mode draft|release] [--spec <dir>] [--engine-root <dir>] [--renderer-module <path>] [--check] [--no-write] [--strict] [--json] [--allow-executable-profile] [--locale en|ru]",
    "Использование: tsx spec/build.ts [--mode draft|release] [--spec <dir>] [--engine-root <dir>] [--renderer-module <path>] [--check] [--no-write] [--strict] [--json] [--allow-executable-profile] [--locale en|ru]",
  ],
  "cli.locale-requires-value": [
    "--locale requires a value (en or ru)",
    "--locale требует значение (en или ru)",
  ],
  "cli.invalid-locale": [
    "Invalid locale: {{value}}. Supported locales: {{locales}}.",
    "Недопустимая локаль: {{value}}. Поддерживаемые локали: {{locales}}.",
  ],
  "cli.invalid-mode": ["Invalid mode: {{value}}", "Недопустимый режим: {{value}}"],
  "cli.empty-value": ["(empty)", "(пусто)"],
  "engine.version-missing": [
    "package.json does not declare a version",
    "package.json не содержит version",
  ],
  "engine.lockfile-no-packages": [
    "bun.lock does not declare packages",
    "bun.lock не содержит packages",
  ],
  "cli.spec-requires-path": ["--spec requires a directory path", "--spec требует путь к каталогу"],
  "cli.engine-root-requires-path": [
    "--engine-root requires an engine directory path",
    "--engine-root требует путь к каталогу движка",
  ],
  "cli.renderer-module-requires-path": [
    "--renderer-module requires a module path",
    "--renderer-module требует путь к модулю",
  ],
  "cli.unknown-argument": ["Unknown argument: {{argument}}", "Неизвестный аргумент: {{argument}}"],
  "cli.renderer-load-failed": [
    "Failed to load the profile renderer: {{error}}",
    "Не удалось загрузить рендерер профиля: {{error}}",
  ],
  "cli.renderer-not-exported": [
    'Renderer module "{{path}}" does not export a renderer',
    'Модуль рендерера "{{path}}" не экспортирует renderer',
  ],
  "cli.build-header": [
    "Build: mode={{mode}} · spec={{spec}}",
    "Сборка: mode={{mode}} · spec={{spec}}",
  ],
  "cli.result.errors": [
    "Result: build stopped. The artifact was not written.",
    "Результат: сборка остановлена. Артефакт не записан.",
  ],
  "cli.result.review": [
    "Result: release is blocked. The artifact was not written.",
    "Результат: выпуск release заблокирован. Артефакт не записан.",
  ],
  "cli.result.warnings": [
    "Result: the build is blocked by --strict (there are WARNING diagnostics).",
    "Результат: сборка заблокирована режимом --strict (есть WARNING).",
  ],
  "cli.result.stale": [
    "Result: the saved artifact is stale.",
    "Результат: сохранённый артефакт устарел.",
  ],
  "cli.result.written": ["Result: wrote {{path}}", "Результат: записан {{path}}"],
  "cli.result.ok": [
    "Result: ok (the artifact was not written)",
    "Результат: ok (артефакт не записан)",
  ],
} as const;

export type CliMessageKey = keyof typeof CLI_MESSAGES;

/** Position of each locale in a CLI string tuple; a new locale must add an entry here. */
const CLI_LOCALE_INDEX: Record<Locale, 0 | 1> = { en: 0, ru: 1 };

/** Renders one CLI string in one locale. */
export function cliText(key: CliMessageKey, locale: Locale, params: MessageParams = {}): string {
  const template = CLI_MESSAGES[key][CLI_LOCALE_INDEX[locale]];
  const text = interpolate(template, params, locale);
  if (text === null) throw new Error(`CLI message ${key} references a missing parameter`);
  return text;
}

/** Renders one CLI string in every supported locale. */
export function cliLocalized(key: CliMessageKey, params: MessageParams = {}): LocalizedMessage {
  return { en: cliText(key, "en", params), ru: cliText(key, "ru", params) };
}

/** An error whose text is resolved from the CLI catalog, so the CLI can localize it. */
export class LocalizedError extends Error {
  constructor(
    readonly key: CliMessageKey,
    readonly params: MessageParams = {},
  ) {
    super(cliText(key, "en", params));
    this.name = "LocalizedError";
  }
}

/** An error carrying a message already localized in every locale. */
export class LocalizedTextError extends Error {
  constructor(readonly messages: LocalizedMessage) {
    super(messages.en);
    this.name = "LocalizedTextError";
  }
}

/** Extracts a locale-neutral detail from a caught error. */
export function localizedDetail(error: unknown): LocalizedMessage {
  if (error instanceof LocalizedTextError) return error.messages;
  const text = error instanceof Error ? error.message : String(error);
  return { en: text, ru: text };
}
