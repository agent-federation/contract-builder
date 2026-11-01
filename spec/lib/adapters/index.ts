import type { SourceAdapter } from "../source.js";
import { markdownAdapter } from "./markdown.js";

/** Built-in adapter registry. A consumer may replace it through `BuildOptions.adapters`. */
export const DEFAULT_ADAPTERS: Record<string, SourceAdapter> = {
  [markdownAdapter.id]: markdownAdapter,
};
