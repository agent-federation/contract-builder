/**
 * Deterministic documentation link check for the pull-request gate.
 *
 * Checks relative links and anchors in the first-class Markdown documentation:
 * `docs/**` plus the root `README*.md`, `CONTRIBUTING.md`, `AGENTS.md` and
 * `CODE_OF_CONDUCT.md`. External URLs (`http:`, `https:`, `mailto:` and any
 * other URI scheme) are deliberately skipped: a pull request must never depend
 * on a third-party host being reachable. External link checking is a separate,
 * non-blocking scheduled job or out of scope.
 *
 * What is checked:
 *   - the target path exists, resolves inside the repository and is spelled with
 *     the on-disk case;
 *   - a `#fragment` on a Markdown target names a GitHub heading anchor (the
 *     GitHub slugger rules, including duplicate-heading suffixes) or an explicit
 *     `<a name="...">`/`<a id="...">` anchor;
 *   - a `#L12` / `#L12-L15` anchor is in range for its target file.
 *
 * Links inside fenced code blocks, inline code spans and HTML comments are
 * ignored, because they are examples rather than navigation.
 *
 * Usage: `bun scripts/check-docs-links.ts [--root <repository-root>]`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

type Issue = {
  file: string;
  line: number;
  message: string;
};

type ReferenceDefinition = {
  target: string;
  index: number;
};

const EXTERNAL_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const LINE_ANCHOR = /^L(\d+)(?:-L(\d+))?$/;
const INLINE_LINK = /!?\[([^\]]*)\]\(([^)]*)\)/g;
const REFERENCE_DEFINITION = /^[ \t]{0,3}\[([^\]]+)\]:[ \t]*(\S+)/gm;
const FULL_REFERENCE_USE = /\[([^\]]+)\]\[([^\]]*)\]/g;
const SHORTCUT_REFERENCE_USE = /\[([^\]]+)\](?!\()/g;
const HEADING = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/;
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;

const ROOT_DOCUMENTS = ["CONTRIBUTING.md", "AGENTS.md", "CODE_OF_CONDUCT.md"];

function fail(issues: Issue[]): never {
  const sorted = [...issues].sort((a, b) => {
    if (a.file === b.file) {
      return a.line - b.line;
    }
    return a.file < b.file ? -1 : 1;
  });
  for (const issue of sorted) {
    console.error(`${issue.file}:${issue.line}: ${issue.message}`);
  }
  console.error(`\n${sorted.length} broken documentation link${sorted.length === 1 ? "" : "s"}.`);
  process.exit(1);
}

/** Replace code and comments with whitespace while preserving line numbers. */
function maskCodeAndComments(markdown: string): string {
  let fenceMarker: string | null = null;
  const lines = markdown.split("\n").map((line) => {
    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1] ?? "";
      if (fenceMarker === null) {
        fenceMarker = marker[0] ?? null;
        return "";
      }
      if (marker[0] === fenceMarker) {
        fenceMarker = null;
      }
      return "";
    }
    if (fenceMarker !== null) {
      return "";
    }
    return line;
  });

  // Inline code spans never contain a checked link; drop them.
  const withoutInlineCode = lines.join("\n").replace(/`+[^`\n]*`+/g, "");
  // Preserve comment line breaks so line numbers stay accurate.
  return withoutInlineCode.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, " "));
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** GitHub's anchor slug for a heading's visible text. */
function slugify(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

function headingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const seen = new Map<string, number>();

  for (const line of maskCodeAndComments(markdown).split("\n")) {
    const heading = line.match(HEADING);
    if (!heading) {
      continue;
    }
    const text = (heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "");
    const base = slugify(text);
    if (base === "") {
      continue;
    }
    const occurrence = seen.get(base) ?? 0;
    const slug = occurrence === 0 ? base : `${base}-${occurrence}`;
    seen.set(base, occurrence + 1);
    anchors.add(slug);
  }

  // GitHub honours explicit HTML anchors as targets.
  for (const match of markdown.matchAll(/<a\s+[^>]*?\b(?:name|id)\s*=\s*["']([^"']+)["']/gi)) {
    const name = match[1];
    if (name !== undefined) {
      anchors.add(name);
      anchors.add(name.toLowerCase());
    }
  }

  return anchors;
}

function linesInFile(path: string): number {
  const text = readFileSync(path, "utf8");
  if (text === "") {
    return 0;
  }
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length;
}

function isInside(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))
  );
}

function collectMarkdownFiles(root: string): string[] {
  const files = new Set<string>();

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.add(path);
      }
    }
  };

  const docs = join(root, "docs");
  if (existsSync(docs) && statSync(docs).isDirectory()) {
    walk(docs);
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && /^README.*\.md$/i.test(entry.name)) {
      files.add(join(root, entry.name));
    }
  }
  for (const name of ROOT_DOCUMENTS) {
    const path = join(root, name);
    if (existsSync(path)) {
      files.add(path);
    }
  }

  return [...files].sort();
}

function checkLink(
  root: string,
  sourceFile: string,
  rawTarget: string,
  line: number,
  issues: Issue[],
  anchorCache: Map<string, Set<string>>,
): boolean {
  const target = rawTarget.trim();
  if (target === "" || target.startsWith("//") || EXTERNAL_SCHEME.test(target)) {
    return true;
  }

  const hashIndex = target.indexOf("#");
  let pathPart = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : decode(target.slice(hashIndex + 1));

  const queryIndex = pathPart.indexOf("?");
  if (queryIndex !== -1) {
    pathPart = pathPart.slice(0, queryIndex);
  }
  pathPart = decode(pathPart);

  let targetPath: string;
  if (pathPart === "") {
    targetPath = sourceFile;
  } else if (pathPart.startsWith("/")) {
    // GitHub treats a leading slash as repository-root relative for blob links.
    targetPath = resolve(root, pathPart.slice(1));
  } else {
    targetPath = resolve(dirname(sourceFile), pathPart);
  }

  const displaySource = relative(root, sourceFile) || sourceFile;
  const displayTarget = relative(root, targetPath) || targetPath;

  if (!isInside(root, targetPath)) {
    issues.push({
      file: displaySource,
      line,
      message: `link target '${target}' escapes the repository`,
    });
    return false;
  }

  if (!existsSync(targetPath)) {
    issues.push({
      file: displaySource,
      line,
      message: `relative link target '${displayTarget}' does not exist`,
    });
    return false;
  }

  const isDirectory = statSync(targetPath).isDirectory();
  if (fragment === "" || fragment === "top") {
    return true;
  }

  const lineAnchor = fragment.match(LINE_ANCHOR);
  if (lineAnchor) {
    const start = Number(lineAnchor[1]);
    const end = lineAnchor[2] === undefined ? start : Number(lineAnchor[2]);
    const total = isDirectory ? 0 : linesInFile(targetPath);
    if (start < 1 || end < start || end > total) {
      issues.push({
        file: displaySource,
        line,
        message: `line anchor '#${fragment}' is out of range for '${displayTarget}' (${total} lines)`,
      });
      return false;
    }
    return true;
  }

  if (isDirectory) {
    issues.push({
      file: displaySource,
      line,
      message: `fragment '#${fragment}' cannot address the directory '${displayTarget}'`,
    });
    return false;
  }

  if (!targetPath.toLowerCase().endsWith(".md")) {
    issues.push({
      file: displaySource,
      line,
      message: `fragment '#${fragment}' on '${displayTarget}' is not a heading or line anchor`,
    });
    return false;
  }

  let anchors = anchorCache.get(targetPath);
  if (!anchors) {
    anchors = headingAnchors(readFileSync(targetPath, "utf8"));
    anchorCache.set(targetPath, anchors);
  }
  if (!anchors.has(fragment)) {
    issues.push({
      file: displaySource,
      line,
      message: `anchor '#${fragment}' not found in '${displayTarget}'`,
    });
    return false;
  }
  return true;
}

function main(): void {
  const args = process.argv.slice(2);
  let root = process.cwd();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") {
      const value = args[i + 1];
      if (value === undefined) {
        console.error("usage: bun scripts/check-docs-links.ts [--root <repository-root>]");
        process.exit(2);
      }
      root = resolve(value);
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log("usage: bun scripts/check-docs-links.ts [--root <repository-root>]");
      return;
    } else {
      console.error(`unknown argument: ${arg}`);
      console.error("usage: bun scripts/check-docs-links.ts [--root <repository-root>]");
      process.exit(2);
    }
  }

  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`repository root not found: ${root}`);
    process.exit(2);
  }

  const files = collectMarkdownFiles(root);
  const issues: Issue[] = [];
  const anchorCache = new Map<string, Set<string>>();
  let linkCount = 0;
  let anchorCount = 0;

  for (const file of files) {
    const markdown = readFileSync(file, "utf8");
    const masked = maskCodeAndComments(markdown);

    const check = (rawTarget: string, index: number): void => {
      const line = lineOf(masked, index);
      linkCount += 1;
      if (rawTarget.includes("#")) {
        anchorCount += 1;
      }
      checkLink(root, file, rawTarget, line, issues, anchorCache);
    };

    for (const match of masked.matchAll(INLINE_LINK)) {
      const destination = match[2] ?? "";
      const raw = destination.trim();
      const target = raw.startsWith("<")
        ? raw.slice(1, raw.indexOf(">") === -1 ? undefined : raw.indexOf(">"))
        : raw.split(/\s+/)[0];
      if (target !== undefined) {
        check(target, match.index ?? 0);
      }
    }

    const references = new Map<string, ReferenceDefinition>();
    const definitionLines = new Set<number>();
    for (const match of masked.matchAll(REFERENCE_DEFINITION)) {
      const label = (match[1] ?? "").trim().toLowerCase();
      const target = match[2] ?? "";
      if (label !== "" && target !== "") {
        references.set(label, { target, index: match.index ?? 0 });
        definitionLines.add(lineOf(masked, match.index ?? 0));
        check(target, match.index ?? 0);
      }
    }

    for (const match of masked.matchAll(FULL_REFERENCE_USE)) {
      const label = ((match[2] ?? "").trim() || (match[1] ?? "").trim()).toLowerCase();
      const reference = references.get(label);
      if (reference) {
        check(reference.target, match.index ?? 0);
      }
    }

    for (const match of masked.matchAll(SHORTCUT_REFERENCE_USE)) {
      const index = match.index ?? 0;
      const label = (match[1] ?? "").trim().toLowerCase();
      if (!references.has(label) || definitionLines.has(lineOf(masked, index))) {
        continue;
      }
      // The second half of `[text][label]` is already checked above.
      if (masked[index - 1] === "]") {
        continue;
      }
      check(references.get(label)?.target ?? "", index);
    }
  }

  if (issues.length > 0) {
    fail(issues);
  }

  console.log(
    `docs links: ${files.length} Markdown files, ${linkCount} links (${anchorCount} with anchors), no broken links.`,
  );
}

main();
