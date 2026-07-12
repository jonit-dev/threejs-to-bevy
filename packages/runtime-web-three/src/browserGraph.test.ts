import assert from "node:assert/strict";
import { builtinModules } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");

test("browser entry graph contains no Node builtin module specifiers", () => {
  const entry = resolve(packageRoot, "src/browser/main.ts");
  const visited = new Set<string>();
  const forbidden: string[] = [];
  visit(entry);
  assert.deepEqual(forbidden, [], `Node builtins must not be reachable from the browser entry: ${forbidden.join(", ")}`);

  function visit(file: string): void {
    const resolved = resolveSource(file);
    if (resolved === undefined || visited.has(resolved)) return;
    visited.add(resolved);
    const source = readFileSync(resolved, "utf8");
    const sourceFile = ts.createSourceFile(resolved, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        if (statement.importClause?.isTypeOnly === true) continue;
        const specifier = literal(statement.moduleSpecifier);
        if (specifier !== undefined) inspectSpecifier(specifier, resolved);
      } else if (ts.isExportDeclaration(statement) && statement.isTypeOnly !== true) {
        const specifier = literal(statement.moduleSpecifier);
        if (specifier !== undefined) inspectSpecifier(specifier, resolved);
      }
    }
    sourceFile.forEachChild((node) => {
      if (!ts.isCallExpression(node) || node.arguments.length !== 1) return;
      const argument = node.arguments[0];
      if (argument === undefined || !ts.isStringLiteralLike(argument)) return;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) inspectSpecifier(argument.text, resolved);
    });
  }

  function inspectSpecifier(specifier: string, importer: string): void {
    const bare = specifier.startsWith("node:") ? specifier.slice("node:".length) : specifier;
    if (specifier.startsWith("node:") || builtinModules.includes(bare)) {
      forbidden.push(`${importer}: ${specifier}`);
      return;
    }
    const resolved = resolveSource(resolveImport(importer, specifier));
    if (resolved !== undefined) visit(resolved);
  }
});

function resolveImport(importer: string, specifier: string): string {
  if (specifier.startsWith("@threenative/ir")) {
    const subpath = specifier.slice("@threenative/ir".length).replace(/^\//u, "");
    return resolve(repositoryRoot, "packages/ir/src", subpath === "" ? "index.ts" : `${subpath}.ts`);
  }
  return specifier.startsWith(".") ? resolve(dirname(importer), specifier) : "";
}

function resolveSource(candidate: string): string | undefined {
  if (candidate === "") return undefined;
  const candidates = [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.js`, `${candidate}.mjs`, resolve(candidate, "index.ts")];
  return candidates.find((file) => existsSync(file) && [".ts", ".tsx", ".js", ".mjs"].includes(extname(file)));
}

function literal(value: ts.Node | undefined): string | undefined {
  return value !== undefined && ts.isStringLiteralLike(value) ? value.text : undefined;
}
