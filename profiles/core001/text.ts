export function collapse(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeText(value: string | undefined | null): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}
