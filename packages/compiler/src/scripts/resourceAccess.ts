import ts from "typescript";

import type { ICompilerDiagnostic } from "../diagnostics.js";

export interface IResourceAccessExtraction {
  diagnostics: ICompilerDiagnostic[];
  resourceReads: string[];
  resourceWrites: string[];
}

export interface IResourceAccessExtractionOptions {
  exportName?: string;
  file?: string;
  systemName: string;
}

type ResourceAccessKind = "read" | "write";

const resourceHelperKinds = new Map<string, ResourceAccessKind>([
  ["get", "read"],
  ["set", "write"],
  ["patch", "write"],
  ["state", "write"],
]);

export function extractResourceAccess(source: string, options: IResourceAccessExtractionOptions): IResourceAccessExtraction {
  const sourceFile = ts.createSourceFile(options.file ?? `${options.systemName}.ts`, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const resourceReads = new Set<string>();
  const resourceWrites = new Set<string>();
  const diagnostics: ICompilerDiagnostic[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const helper = resourceHelper(node.expression);
      if (helper !== undefined) {
        const resourceId = literalResourceId(node.arguments[0]);
        if (resourceId === undefined) {
          diagnostics.push(dynamicResourceDiagnostic(options, helper));
        } else if (resourceHelperKinds.get(helper) === "read") {
          resourceReads.add(resourceId);
        } else {
          resourceWrites.add(resourceId);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return {
    diagnostics: dedupeDiagnostics(diagnostics),
    resourceReads: [...resourceReads].sort(),
    resourceWrites: [...resourceWrites].sort(),
  };
}

function resourceHelper(expression: ts.Expression): string | undefined {
  if (!ts.isPropertyAccessExpression(expression)) {
    return undefined;
  }
  const helper = expression.name.text;
  if (!resourceHelperKinds.has(helper)) {
    return undefined;
  }
  if (helper === "state") {
    return isContextObject(expression.expression) ? helper : undefined;
  }
  if (!ts.isPropertyAccessExpression(expression.expression) || expression.expression.name.text !== "resources") {
    return undefined;
  }
  return helper;
}

function isContextObject(expression: ts.Expression): boolean {
  return ts.isIdentifier(expression) && (expression.text === "ctx" || expression.text === "context");
}

function literalResourceId(expression: ts.Expression | undefined): string | undefined {
  if (expression === undefined) {
    return undefined;
  }
  if (ts.isStringLiteralLike(expression)) {
    return expression.text;
  }
  if (ts.isIdentifier(expression) && /^[A-Z][A-Za-z0-9_]*$/.test(expression.text)) {
    return expression.text;
  }
  return undefined;
}

function dynamicResourceDiagnostic(options: IResourceAccessExtractionOptions, helper: string): ICompilerDiagnostic {
  const field = resourceHelperKinds.get(helper) === "read" ? "resourceReads" : "resourceWrites";
  return {
    code: "TN_SCRIPT_DYNAMIC_RESOURCE_ID_UNSUPPORTED",
    file: options.file,
    fix: {
      docs: "docs/contracts/scripting-api.md",
      instruction: `Use a literal resource id with context.resources.${helper}(...) and declare or derive it in ${field}.`,
      snippet: `context.resources.${helper}("GameState", /* ... */)`,
    },
    message: `System '${options.systemName}' uses a dynamic resource id in context.resources.${helper}(...).`,
    path: `systems/${options.systemName}/${field}`,
    severity: "error",
    suggestion: `Use a string literal resource id so ThreeNative can derive ${field} deterministically.`,
    target: options.exportName,
  };
}

function dedupeDiagnostics(diagnostics: readonly ICompilerDiagnostic[]): ICompilerDiagnostic[] {
  return [
    ...new Map(diagnostics.map((diagnostic) => [`${diagnostic.code}:${diagnostic.path}:${diagnostic.message}`, diagnostic])).values(),
  ];
}
