/**
 * Lexical `import`/`export ... from` specifier scanner used by the extension closure.
 *
 * It is a guard, not a parser: computed specifiers are invisible to it.
 */

interface ImportToken {
  kind: "identifier" | "string" | "literal" | "punct";
  value: string;
  lineStart: boolean;
  braceDepth: number;
  templateExpression: boolean;
}

const STATEMENT_KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "class",
  "interface",
  "type",
  "enum",
  "declare",
  "import",
  "export",
  "return",
  "if",
  "for",
  "while",
  "switch",
  "try",
  "throw",
  "do",
  "else",
  "new",
  "await",
  "yield",
]);

const REGEX_PREFIX_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "do",
  "else",
  "yield",
  "await",
  "throw",
]);

const REGEX_PREFIX_PUNCTUATION = new Set([
  "(",
  "[",
  "{",
  ",",
  ";",
  ":",
  "=",
  "!",
  "?",
  "&",
  "|",
  "+",
  "-",
  "*",
  "%",
  "^",
  "~",
  "<",
  ">",
  "/",
]);

/**
 * Extracts static `import`/`export ... from` specifiers and literal `import("...")`
 * specifiers with a small lexical scanner. Comments, strings, template literals and regex
 * literals are skipped, so text such as `"import "` inside another string cannot be mistaken
 * for a statement. This is a guard, not a parser: computed specifiers are not seen, and the
 * regex-versus-division split uses a previous-token heuristic (a regex statement directly
 * after `)` is treated as division).
 */
export function importSpecifiers(text: string): string[] {
  const tokens = tokenize(text);
  const found: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.kind !== "identifier") continue;
    if (token.value !== "import" && token.value !== "export") continue;
    if (isPunct(tokens[index - 1], ".")) continue;

    let next = index + 1;
    if (token.value === "import") {
      if (isPunct(tokens[next], "(")) {
        const specifier = tokens[next + 1];
        if (specifier?.kind === "string") {
          found.push(specifier.value);
          let depth = 1;
          let close = next + 1;
          while (close < tokens.length && depth > 0) {
            if (isPunct(tokens[close], "(")) depth += 1;
            else if (isPunct(tokens[close], ")")) depth -= 1;
            close += 1;
          }
          index = close - 1;
        }
        continue;
      }
      if (isPunct(tokens[next], ".")) continue; // import.meta
    }

    // Only dynamic imports are meaningful inside a template interpolation; there is no
    // statement position for a static import there.
    if (token.templateExpression) continue;

    // A static import/export is a top-level statement. This avoids treating an object key
    // or a function-local identifier as a statement.
    if (token.braceDepth !== 0) continue;
    const previous = tokens[index - 1];
    if (index > 0 && !token.lineStart && !isPunct(previous, ";") && !isPunct(previous, "}")) {
      continue;
    }

    let typeOnly = false;
    if (isIdentifier(tokens[next], "type")) {
      typeOnly = true;
      next += 1;
    }

    const sideEffect = tokens[next];
    if (token.value === "import" && sideEffect?.kind === "string") {
      if (!typeOnly) found.push(sideEffect.value);
      index = next;
      continue;
    }

    let fromIndex = -1;
    let braces = 0;
    for (let cursor = next; cursor < tokens.length; cursor += 1) {
      const current = tokens[cursor];
      if (current === undefined) break;
      if (current.kind === "punct") {
        if (current.value === "{") braces += 1;
        else if (current.value === "}") braces = Math.max(0, braces - 1);
        else if (current.value === ";" && braces === 0) break;
      }
      if (isIdentifier(current, "from") && braces === 0) {
        fromIndex = cursor;
        break;
      }
      if (
        braces === 0 &&
        cursor > next &&
        current.kind === "identifier" &&
        STATEMENT_KEYWORDS.has(current.value)
      ) {
        break;
      }
    }

    if (fromIndex < 0) continue;
    const specifier = tokens[fromIndex + 1];
    if (specifier?.kind === "string" && !typeOnly) found.push(specifier.value);
    index = fromIndex + 1;
  }

  return [...new Set(found)];
}

function tokenize(source: string): ImportToken[] {
  const tokens: ImportToken[] = [];
  let index = 0;
  let braceDepth = 0;
  let atLineStart = true;

  const push = (kind: ImportToken["kind"], value: string, depth: number = braceDepth): void => {
    tokens.push({
      kind,
      value,
      lineStart: atLineStart,
      braceDepth: depth,
      templateExpression: false,
    });
    atLineStart = false;
  };

  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      if (char === "\n") atLineStart = true;
      index += 1;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      const end = skipBlockComment(source, index);
      if (source.slice(index, end).includes("\n")) atLineStart = true;
      index = end;
      continue;
    }
    if (char === '"' || char === "'") {
      const parsed = readString(source, index, char);
      push("string", parsed.value);
      index = parsed.next;
      continue;
    }
    if (char === "`") {
      const template = scanTemplate(source, index);
      for (const expression of template.expressions) {
        for (const token of tokenize(source.slice(expression.start, expression.end))) {
          tokens.push({
            ...token,
            lineStart: false,
            braceDepth: 0,
            templateExpression: true,
          });
        }
      }
      push("literal", "");
      index = template.next;
      continue;
    }
    if (char === "/" && regexAllowed(tokens)) {
      const next = skipRegex(source, index);
      if (next !== null) {
        push("literal", "");
        index = next;
        continue;
      }
    }
    if (char === "{") {
      push("punct", char);
      braceDepth += 1;
      index += 1;
      continue;
    }
    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      push("punct", char);
      index += 1;
      continue;
    }
    if (isIdentifierStart(char)) {
      let end = index + 1;
      while (end < source.length && isIdentifierPart(source[end]!)) end += 1;
      push("identifier", source.slice(index, end));
      index = end;
      continue;
    }
    push("punct", char);
    index += 1;
  }

  return tokens;
}

function readString(source: string, start: number, quote: string): { value: string; next: number } {
  let index = start + 1;
  let value = "";
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") {
      const escaped = source[index + 1];
      if (escaped === undefined) return { value, next: index + 1 };
      value += decodeEscape(escaped);
      index += 2;
      continue;
    }
    if (char === quote) return { value, next: index + 1 };
    value += char;
    index += 1;
  }
  return { value, next: index };
}

function decodeEscape(char: string): string {
  switch (char) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    case "b":
      return "\b";
    case "f":
      return "\f";
    case "v":
      return "\v";
    case "0":
      return "\0";
    default:
      return char;
  }
}

function skipLineComment(source: string, start: number): number {
  let index = start + 2;
  while (index < source.length && source[index] !== "\n") index += 1;
  return index;
}

function skipBlockComment(source: string, start: number): number {
  let index = start + 2;
  while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
    index += 1;
  }
  return Math.min(source.length, index + 2);
}

interface TemplateScan {
  next: number;
  expressions: Array<{ start: number; end: number }>;
}

function scanTemplate(source: string, start: number): TemplateScan {
  let index = start + 1;
  const expressions: TemplateScan["expressions"] = [];
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") return { next: index + 1, expressions };
    if (char === "$" && source[index + 1] === "{") {
      const expressionStart = index + 2;
      const expressionEnd = skipTemplateExpression(source, expressionStart);
      expressions.push({
        start: expressionStart,
        end: Math.max(expressionStart, expressionEnd - 1),
      });
      index = expressionEnd;
      continue;
    }
    index += 1;
  }
  return { next: index, expressions };
}

/** Skips a `${...}` expression inside a template literal, tracking nested braces and strings. */
function skipTemplateExpression(source: string, start: number): number {
  let index = start;
  let depth = 1;
  while (index < source.length) {
    const char = source[index]!;
    if (char === '"' || char === "'") {
      index = readString(source, index, char).next;
      continue;
    }
    if (char === "`") {
      index = scanTemplate(source, index).next;
      continue;
    }
    if (char === "/" && source[index + 1] === "/") {
      index = skipLineComment(source, index);
      continue;
    }
    if (char === "/" && source[index + 1] === "*") {
      index = skipBlockComment(source, index);
      continue;
    }
    if (char === "/" && regexAllowedAt(source, index)) {
      const next = skipRegex(source, index);
      if (next !== null) {
        index = next;
        continue;
      }
    }
    if (char === "{") {
      depth += 1;
      index += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      index += 1;
      if (depth === 0) return index;
      continue;
    }
    index += 1;
  }
  return index;
}

function skipRegex(source: string, start: number): number | null {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const char = source[index]!;
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "\n") return null;
    if (char === "[") inCharacterClass = true;
    else if (char === "]") inCharacterClass = false;
    else if (char === "/" && !inCharacterClass) {
      index += 1;
      while (index < source.length && /[A-Za-z]/.test(source[index]!)) index += 1;
      return index;
    }
    index += 1;
  }
  return null;
}

function regexAllowedAt(source: string, index: number): boolean {
  let previous = index - 1;
  while (previous >= 0 && /\s/.test(source[previous]!)) previous -= 1;
  if (previous < 0) return true;
  return /[=(:,![{;?&|+\-*%^~<>]/.test(source[previous]!);
}

function regexAllowed(tokens: readonly ImportToken[]): boolean {
  const previous = tokens[tokens.length - 1];
  if (previous === undefined) return true;
  if (previous.kind === "identifier") return REGEX_PREFIX_KEYWORDS.has(previous.value);
  if (previous.kind === "punct") return REGEX_PREFIX_PUNCTUATION.has(previous.value);
  return false;
}

function isIdentifier(token: ImportToken | undefined, value: string): boolean {
  return token?.kind === "identifier" && token.value === value;
}

function isPunct(token: ImportToken | undefined, value: string): boolean {
  return token?.kind === "punct" && token.value === value;
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_$]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}
