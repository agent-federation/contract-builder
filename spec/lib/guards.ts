export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isMissingFile(error: unknown): boolean {
  return isObject(error) && error.code === "ENOENT";
}
