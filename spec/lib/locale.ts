/**
 * Output locales the engine can render human-readable text in.
 *
 * English is the default for every CLI and build output. A project may declare a
 * different locale for its own artifact (see `Manifest.locale`); the CLI locale only
 * affects human text, never artifact bytes or the build identity.
 */
export const SUPPORTED_LOCALES = ["en", "ru"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Locale used when neither the CLI nor the project declares one. */
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
