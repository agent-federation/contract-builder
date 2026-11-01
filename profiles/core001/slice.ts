import { parseLocator } from "../../spec/lib/adapters/markdown.js";
import type { Slice } from "./view.js";

/**
 * Slice containment needs the locator's section, not quote verification. Verification goes
 * through the source adapter; this stays a profile-side check.
 */
export function sectionInSlice(ref: string, slice: Slice): boolean {
  const locator = parseLocator(ref);
  // A malformed locator is reported separately; do not duplicate it as a slice error.
  if (locator === null) return true;
  const section = locator.section;
  if (slice.excludes?.some((prefix) => segmentMatches(section, prefix))) return false;
  return slice.includes?.some((prefix) => segmentMatches(section, prefix)) ?? false;
}

function segmentMatches(section: string, prefix: string): boolean {
  const bare = prefix.replace(/^#/, "");
  if (section === bare) return true;
  if (!section.startsWith(bare)) return false;
  const next = section.charAt(bare.length);
  return next === "." || next === "/" || next === "-";
}
