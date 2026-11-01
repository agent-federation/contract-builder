export function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}
