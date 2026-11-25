/**
 * #135 acceptance: "no verifier import or producer code execution from the
 * verifier side". `gate.test.ts` pins the mirror direction (the gate never
 * imports `pap/src`); here the verifier's own import graph is closed:
 *
 * - `pap/`, `pap/bin` and `pap/src` are real directories, and `pap/src` holds
 *   regular TypeScript modules and nothing else: no symlink, no file of
 *   another type (one that Bun would still load and `tsc` would not check);
 * - `pap/bin/pap` is a regular file, and it and each of those modules name
 *   only `node:` built-ins and relative specifiers that resolve inside
 *   `pap/src`.
 *
 * Specifiers are read from the TypeScript syntax tree, not matched as text, so
 * a comment or a string can neither hide nor fake an import, and every module
 * must parse. A loader whose specifier is not a literal — a computed
 * `import()`, or `require` used as a value — is an offender even when it would
 * resolve inside `pap/src`.
 *
 * This pins the loads a syntax tree can see. Code a module loads at runtime
 * through a built-in is invisible to it: a loader obtained from
 * `createRequire` (`node:module`), `node:child_process`, `node:vm`, a worker
 * or `process.dlopen` can load or run a path this scan never shows. F40 proves
 * the narrower fact that the verifier executes none of the producer and
 * runtime sentinel programs planted on `PATH`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const papRoot = fileURLToPath(new URL("../../pap", import.meta.url));
const srcRoot = path.join(papRoot, "src");
const entryPoint = path.join(papRoot, "bin", "pap");
const COMPUTED = "<computed>";

/** Every TypeScript module under `dir`; anything else found there is recorded as an offender. */
async function listModules(dir: string, offenders: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    const label = path.relative(papRoot, file);
    if (entry.isDirectory()) {
      files.push(...(await listModules(file, offenders)));
    } else if (entry.isSymbolicLink() || !entry.isFile()) {
      offenders.push(`${label} is a symlink or not a regular file`);
    } else if (!entry.name.endsWith(".ts")) {
      offenders.push(`${label} is not a TypeScript module`);
    } else {
      files.push(file);
    }
  }
  return files.sort();
}

/** `import(…)`, `require(…)`, `import.meta.require(…)`, `module.require(…)`, `x["require"](…)`. */
function isLoaderCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (callee.kind === ts.SyntaxKind.ImportKeyword) {
    return true;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text === "require";
  }
  if (ts.isElementAccessExpression(callee)) {
    const index = callee.argumentExpression;
    return (
      (ts.isStringLiteral(index) || ts.isNoSubstitutionTemplateLiteral(index)) &&
      index.text === "require"
    );
  }
  return ts.isIdentifier(callee) && callee.text === "require";
}

/**
 * The module specifiers a module names: `import`/`export … from`,
 * `import x = require()`, `typeof import()`, and the loader calls of
 * `isLoaderCall`.
 */
function specifiersOf(file: string, source: string): string[] {
  const literal = (expression: ts.Expression | undefined): string =>
    expression !== undefined &&
    (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
      ? expression.text
      : COMPUTED;
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier !== undefined) found.push(literal(node.moduleSpecifier));
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      found.push(literal(node.moduleReference.expression));
    } else if (ts.isImportTypeNode(node)) {
      found.push(literal(ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined));
    } else if (ts.isCallExpression(node) && isLoaderCall(node)) {
      found.push(literal(node.arguments[0]));
      // The callee itself is not a load; a loader call nested in the arguments is.
      for (const argument of node.arguments) visit(argument);
      return;
    } else if (ts.isIdentifier(node) && node.text === "require") {
      found.push(COMPUTED);
    }
    ts.forEachChild(node, visit);
  };
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
  // Not in the public typings, but present on every parsed source file. A
  // parse error can swallow the import that follows it, so it must fail here.
  const { parseDiagnostics } = parsed as unknown as {
    parseDiagnostics: ts.DiagnosticWithLocation[];
  };
  assert.equal(
    parseDiagnostics.length,
    0,
    parseDiagnostics
      .map((diagnostic) => {
        const position = parsed.getLineAndCharacterOfPosition(diagnostic.start);
        return `${diagnostic.messageText} at ${path.relative(papRoot, file)}:${position.line + 1}:${position.character + 1}`;
      })
      .join("; "),
  );
  visit(parsed);
  return found;
}

function isInside(parent: string, candidate: string): boolean {
  const relativePath = path.relative(parent, candidate);
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

test("the verifier entry point and modules import only node built-ins and pap/src", async () => {
  for (const dir of [papRoot, path.join(papRoot, "bin"), srcRoot]) {
    // `lstat` never reports a symlink as a directory.
    assert.ok(
      (await lstat(dir)).isDirectory(),
      `${path.relative(path.dirname(papRoot), dir)} is a real directory, not a symlink`,
    );
  }
  assert.ok((await lstat(entryPoint)).isFile(), "pap/bin/pap is a regular file, not a symlink");

  const offenders: string[] = [];
  const files = [entryPoint, ...(await listModules(srcRoot, offenders))];
  assert.ok(files.includes(path.join(srcRoot, "cli.ts")), "the scan reaches the CLI module");

  for (const file of files) {
    for (const specifier of specifiersOf(file, await readFile(file, "utf8"))) {
      if (specifier.startsWith("node:")) continue;
      const target =
        specifier !== COMPUTED && specifier.startsWith(".")
          ? path.resolve(path.dirname(file), specifier)
          : null;
      if (target === null || !isInside(srcRoot, target)) {
        offenders.push(`${path.relative(papRoot, file)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
