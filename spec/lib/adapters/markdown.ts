/**
 * Markdown source adapter: section/table/item locators plus the `SourceAdapter` boundary.
 *
 * A `source_ref` is `<SOURCE_ID>#<section>[/<block>]`, for example:
 *   SRC-EXAMPLE#10.2
 *   SRC-EXAMPLE#10/table/asserted_at
 *   SRC-EXAMPLE#15/5
 *
 * A locator is verified against the legacy document: the quoted text must
 * occur inside the declared block, not merely somewhere in the file. This is
 * still a section-level locator (headings are matched by their numeric label),
 * not a content hash or a line range.
 */

import { readFile } from "node:fs/promises";
import type { SourceAdapter, SourceDocument } from "../source.js";

export type BlockLocator =
  | { kind: "section" }
  | { kind: "table"; column: string }
  | { kind: "item"; index: number };

export interface SourceLocator {
  section: string;
  block: BlockLocator;
}

export type LocatorOutcome = "found" | "outside" | "unknown-locator";

export function parseLocator(ref: string): SourceLocator | null {
  const hash = ref.indexOf("#");
  if (hash < 0) return null;

  const tail = ref.slice(hash + 1);
  if (tail.length === 0) return null;

  const parts = tail.split("/");
  const section = parts[0] ?? "";
  if (!/^\d+(?:\.\d+)*$/.test(section)) return null;

  if (parts.length === 1) {
    return { section, block: { kind: "section" } };
  }

  if (parts.length === 3 && parts[1] === "table" && parts[2] !== undefined && parts[2].length > 0) {
    return { section, block: { kind: "table", column: parts[2] } };
  }

  if (parts.length === 2 && parts[1] !== undefined && /^\d+$/.test(parts[1])) {
    return { section, block: { kind: "item", index: Number(parts[1]) } };
  }

  return null;
}

/** True when the quote is located inside the block declared by `ref`. */
export function locateQuote(legacy: string, ref: string, quote: string): LocatorOutcome {
  const locator = parseLocator(ref);
  if (locator === null) return "unknown-locator";

  const lines = legacy.split("\n");
  const span = sectionSpan(lines, locator.section);
  if (span === null) return "unknown-locator";

  const body = lines.slice(span.start, span.end);
  const block = selectBlock(body, locator.block);
  if (block.length === 0) return "outside";

  const needle = collapse(quote);
  return collapse(block.join("\n")).includes(needle) ? "found" : "outside";
}

interface Heading {
  level: number;
  label: string;
  line: number;
}

function headings(lines: string[]): Heading[] {
  const result: Heading[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(#{1,6})\s+(\d+(?:\.\d+)*)\.?\s/.exec(lines[i] ?? "");
    if (match === null) continue;
    result.push({ level: match[1]!.length, label: match[2]!, line: i });
  }
  return result;
}

/** Line range of a section: from its heading to the next heading of the same or higher level. */
function sectionSpan(lines: string[], label: string): { start: number; end: number } | null {
  const all = headings(lines);
  const index = all.findIndex((heading) => heading.label === label);
  if (index < 0) return null;

  const current = all[index]!;
  let end = lines.length;
  for (let i = index + 1; i < all.length; i += 1) {
    if (all[i]!.level <= current.level) {
      end = all[i]!.line;
      break;
    }
  }
  return { start: current.line, end };
}

function selectBlock(lines: string[], locator: BlockLocator): string[] {
  switch (locator.kind) {
    case "section":
      return lines;
    case "table":
      return lines.filter((line) => {
        const match = /^\s*\|([^|]*)\|/.exec(line);
        return match !== null && match[1]!.trim() === locator.column;
      });
    case "item": {
      const items = lines.filter((line) => /^\s*\d+\.\s/.test(line));
      const item = items[locator.index - 1];
      return item === undefined ? [] : [item];
    }
  }
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Markdown adapter. `load` reads the bytes; `verifyQuote` keeps the section-level locator
 * behaviour of the MVP and its three outcomes. `unsupported` is never returned in M1.
 */
const decoder = new TextDecoder();

export const markdownAdapter: SourceAdapter = {
  id: "markdown",
  version: "0.1.0",
  async load(path, descriptor): Promise<SourceDocument> {
    const bytes = new Uint8Array(await readFile(path));
    return {
      id: descriptor.id,
      bytes,
      adapter: descriptor.adapter,
      ...(descriptor.identity !== undefined ? { identity: descriptor.identity } : {}),
    };
  },
  async verifyQuote(source, ref, quote) {
    return locateQuote(decoder.decode(source.bytes), ref, quote);
  },
};
