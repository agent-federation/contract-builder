/**
 * Strict I-JSON parser and RFC 8785 JCS canonicalizer for PAP v0.1.
 *
 * The parser enforces the profile in RFC §5.3.1:
 *  - UTF-8 without BOM;
 *  - no duplicate object member names;
 *  - integer number tokens only, in the safe-integer range, no `-0`;
 *  - no lone surrogates in strings;
 *  - bounded nesting depth and UTF-8 string size.
 *
 * `JSON.parse` is deliberately not used for untrusted package documents because
 * it silently accepts duplicate keys and loses integer-token spelling.
 */

import type { JsonValue } from "./types.js";

export type JsonParseFailure = "syntax" | "duplicate-key" | "limit";

export class JsonParseError extends Error {
  readonly failure: JsonParseFailure;

  constructor(failure: JsonParseFailure, message: string) {
    super(message);
    this.name = "JsonParseError";
    this.failure = failure;
  }
}

export interface JsonParseLimits {
  nesting: number;
  stringBytes: number;
}

const MAX_SAFE = 9_007_199_254_740_991n;

/** Decode strict UTF-8. Returns null when the bytes are not valid UTF-8. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** True when the byte sequence starts with a UTF-8 BOM. */
export function hasBom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

export function parseJsonStrict(
  bytes: Uint8Array,
  limits: JsonParseLimits,
): JsonValue {
  if (hasBom(bytes)) {
    throw new JsonParseError("syntax", "JSON must not start with a UTF-8 BOM");
  }
  const text = decodeUtf8(bytes);
  if (text === null) {
    throw new JsonParseError("syntax", "document is not valid UTF-8");
  }
  return new Parser(text, limits).parse();
}

class Parser {
  private readonly text: string;
  private readonly limits: JsonParseLimits;
  private pos = 0;
  private readonly encoder = new TextEncoder();

  constructor(text: string, limits: JsonParseLimits) {
    this.text = text;
    this.limits = limits;
  }

  parse(): JsonValue {
    this.skipWhitespace();
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.pos !== this.text.length) {
      throw new JsonParseError("syntax", "trailing data after the JSON value");
    }
    return value;
  }

  private skipWhitespace(): void {
    while (this.pos < this.text.length) {
      const ch = this.text.charCodeAt(this.pos);
      if (ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d) {
        this.pos += 1;
      } else {
        break;
      }
    }
  }

  private parseValue(depth: number): JsonValue {
    const ch = this.text[this.pos];
    if (ch === undefined) {
      throw new JsonParseError("syntax", "unexpected end of JSON input");
    }
    switch (ch) {
      case "{":
        return this.parseObject(depth + 1);
      case "[":
        return this.parseArray(depth + 1);
      case '"':
        return this.parseString();
      case "t":
        return this.parseLiteral("true", true);
      case "f":
        return this.parseLiteral("false", false);
      case "n":
        return this.parseLiteral("null", null);
      default:
        if (ch === "-" || (ch >= "0" && ch <= "9")) {
          return this.parseNumber();
        }
        throw new JsonParseError("syntax", `unexpected character ${JSON.stringify(ch)}`);
    }
  }

  private enter(depth: number): void {
    if (depth > this.limits.nesting) {
      throw new JsonParseError("limit", "JSON nesting depth limit exceeded");
    }
  }

  private parseObject(depth: number): JsonValue {
    this.enter(depth);
    this.pos += 1; // {
    const result: { [key: string]: JsonValue } = {};
    const seen = new Set<string>();
    this.skipWhitespace();
    if (this.text[this.pos] === "}") {
      this.pos += 1;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.pos] !== '"') {
        throw new JsonParseError("syntax", "object member name must be a string");
      }
      const key = this.parseString();
      if (seen.has(key)) {
        throw new JsonParseError("duplicate-key", `duplicate object member ${JSON.stringify(key)}`);
      }
      seen.add(key);
      this.skipWhitespace();
      if (this.text[this.pos] !== ":") {
        throw new JsonParseError("syntax", "expected ':' after object member name");
      }
      this.pos += 1;
      this.skipWhitespace();
      // A member value is one level deeper than its enclosing object.
      result[key] = this.parseValue(depth);
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ",") {
        this.pos += 1;
        continue;
      }
      if (next === "}") {
        this.pos += 1;
        return result;
      }
      throw new JsonParseError("syntax", "expected ',' or '}' in object");
    }
  }

  private parseArray(depth: number): JsonValue[] {
    this.enter(depth);
    this.pos += 1; // [
    const result: JsonValue[] = [];
    this.skipWhitespace();
    if (this.text[this.pos] === "]") {
      this.pos += 1;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      result.push(this.parseValue(depth));
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ",") {
        this.pos += 1;
        continue;
      }
      if (next === "]") {
        this.pos += 1;
        return result;
      }
      throw new JsonParseError("syntax", "expected ',' or ']' in array");
    }
  }

  private parseString(): string {
    this.pos += 1; // opening quote
    let out = "";
    for (;;) {
      if (this.pos >= this.text.length) {
        throw new JsonParseError("syntax", "unterminated string");
      }
      const code = this.text.charCodeAt(this.pos);
      if (code === 0x22) {
        this.pos += 1;
        break;
      }
      if (code === 0x5c) {
        this.pos += 1;
        out += this.parseEscape();
        continue;
      }
      if (code < 0x20) {
        throw new JsonParseError("syntax", "unescaped control character in string");
      }
      if (isHighSurrogate(code)) {
        const next = this.text.charCodeAt(this.pos + 1);
        if (!isLowSurrogate(next)) {
          throw new JsonParseError("syntax", "lone surrogate in string");
        }
        out += this.text.slice(this.pos, this.pos + 2);
        this.pos += 2;
        continue;
      }
      if (isLowSurrogate(code)) {
        throw new JsonParseError("syntax", "lone surrogate in string");
      }
      out += this.text[this.pos];
      this.pos += 1;
    }
    if (this.encoder.encode(out).length > this.limits.stringBytes) {
      throw new JsonParseError("limit", "JSON string size limit exceeded");
    }
    return out;
  }

  private parseEscape(): string {
    const ch = this.text[this.pos];
    this.pos += 1;
    switch (ch) {
      case '"':
        return '"';
      case "\\":
        return "\\";
      case "/":
        return "/";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "u": {
        const hex = this.text.slice(this.pos, this.pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          throw new JsonParseError("syntax", "invalid \\u escape");
        }
        this.pos += 4;
        const code = Number.parseInt(hex, 16);
        if (isHighSurrogate(code)) {
          if (this.text[this.pos] !== "\\" || this.text[this.pos + 1] !== "u") {
            throw new JsonParseError("syntax", "lone surrogate escape");
          }
          const lowHex = this.text.slice(this.pos + 2, this.pos + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(lowHex)) {
            throw new JsonParseError("syntax", "invalid low surrogate escape");
          }
          const low = Number.parseInt(lowHex, 16);
          if (!isLowSurrogate(low)) {
            throw new JsonParseError("syntax", "lone surrogate escape");
          }
          this.pos += 6;
          return String.fromCharCode(code, low);
        }
        if (isLowSurrogate(code)) {
          throw new JsonParseError("syntax", "lone surrogate escape");
        }
        return String.fromCharCode(code);
      }
      default:
        throw new JsonParseError("syntax", "invalid escape sequence");
    }
  }

  private parseNumber(): number {
    const match = /^-?(?:0|[1-9][0-9]*)/.exec(this.text.slice(this.pos));
    if (match === null) {
      throw new JsonParseError("syntax", "invalid number");
    }
    const token = match[0];
    const after = this.text[this.pos + token.length];
    if (after !== undefined && /[0-9.eE+-]/.test(after)) {
      throw new JsonParseError("syntax", "number is not an integer literal");
    }
    if (token === "-0") {
      throw new JsonParseError("syntax", "-0 is not an accepted integer");
    }
    const value = BigInt(token);
    if (value > MAX_SAFE || value < -MAX_SAFE) {
      throw new JsonParseError("syntax", "integer outside the I-JSON safe range");
    }
    this.pos += token.length;
    return Number(value);
  }

  private parseLiteral<T extends true | false | null>(word: string, value: T): T {
    if (this.text.slice(this.pos, this.pos + word.length) !== word) {
      throw new JsonParseError("syntax", `invalid literal, expected ${word}`);
    }
    this.pos += word.length;
    return value;
  }
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * RFC 8785 JCS over the PAP I-JSON subset. Numbers are already restricted to
 * safe integers by the parser; constructed values are checked here as well.
 */
export function jcs(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new Error("JCS cannot encode a non-integer or unsafe number");
    }
    return String(value);
  }
  if (typeof value === "string") {
    return jcsString(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => jcs(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const members = keys.map((key) => `${jcsString(key)}:${jcs(value[key] as JsonValue)}`);
  return `{${members.join(",")}}`;
}

export function jcsBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(jcs(value));
}

function jcsString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (isHighSurrogate(code)) {
      const low = value.charCodeAt(i + 1);
      if (!isLowSurrogate(low)) {
        throw new Error("JCS cannot encode a lone surrogate");
      }
      out += value.slice(i, i + 2);
      i += 1;
      continue;
    }
    if (isLowSurrogate(code)) {
      throw new Error("JCS cannot encode a lone surrogate");
    }
    switch (code) {
      case 0x22:
        out += '\\"';
        break;
      case 0x5c:
        out += "\\\\";
        break;
      case 0x08:
        out += "\\b";
        break;
      case 0x09:
        out += "\\t";
        break;
      case 0x0a:
        out += "\\n";
        break;
      case 0x0c:
        out += "\\f";
        break;
      case 0x0d:
        out += "\\r";
        break;
      default:
        if (code < 0x20) {
          out += `\\u${code.toString(16).padStart(4, "0")}`;
        } else {
          out += value[i];
        }
    }
  }
  return `${out}"`;
}
