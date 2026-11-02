import type { ExtensionClosureDeclaration } from "./extension.js";

export interface SourceDocument {
  id: string;
  bytes: Uint8Array;
  adapter: string;
  identity?: Record<string, unknown>;
}

/** Contract locator result. `unsupported` is not produced by the M1 markdown adapter. */
export type LocatorResult = "found" | "outside" | "unsupported" | "unknown-locator";

export interface SourceAdapter {
  id: string;
  version: string;
  /** Declared closure for build identity; required for a build that computes identity. */
  closure?: ExtensionClosureDeclaration;
  load(
    path: string,
    descriptor: { id: string; adapter: string; identity?: Record<string, unknown> },
  ): Promise<SourceDocument>;
  verifyQuote(source: SourceDocument, ref: string, quote: string): Promise<LocatorResult>;
}
