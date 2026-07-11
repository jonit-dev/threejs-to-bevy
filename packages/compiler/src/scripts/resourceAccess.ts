import ts from "typescript";

import type { ICompilerDiagnostic } from "../diagnostics.js";

export interface IResourceAccessExtraction {
  diagnostics: ICompilerDiagnostic[];
  resourceSchemas: Record<string, { fields: Record<string, { kind: string }> }>;
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
  const resourceSchemas = new Map<string, { fields: Record<string, { kind: string }> }>();
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
          mergeResourceSchema(resourceSchemas, resourceId, inferResourceFields(node.arguments[1]));
        } else {
          resourceWrites.add(resourceId);
          mergeResourceSchema(resourceSchemas, resourceId, inferResourceFields(node.arguments[1]));
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return {
    diagnostics: dedupeDiagnostics(diagnostics),
    resourceSchemas: Object.fromEntries([...resourceSchemas.entries()].sort(([left], [right]) => left.localeCompare(right))),
    resourceReads: [...resourceReads].sort(),
    resourceWrites: [...resourceWrites].sort(),
  };
}

function mergeResourceSchema(
  schemas: Map<string, { fields: Record<string, { kind: string }> }>,
  resourceId: string,
  fields: Record<string, { kind: string }>,
): void {
  const schema = schemas.get(resourceId) ?? { fields: {} };
  for (const [fieldName, field] of Object.entries(fields)) {
    const previous = schema.fields[fieldName];
    schema.fields[fieldName] = previous === undefined || previous.kind === field.kind ? field : { kind: "json" };
  }
  schemas.set(resourceId, schema);
}

function inferResourceFields(expression: ts.Expression | undefined): Record<string, { kind: string }> {
  const object = unwrapExpression(expression);
  if (object === undefined || !ts.isObjectLiteralExpression(object)) {
    return {};
  }
  const fields: Record<string, { kind: string }> = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const fieldName = propertyName(property.name);
    if (fieldName === undefined) {
      continue;
    }
    fields[fieldName] = { kind: inferFieldKind(property.initializer) };
  }
  return fields;
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function inferFieldKind(expression: ts.Expression): string {
  const value = unwrapExpression(expression);
  if (value === undefined) {
    return "json";
  }
  if (value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword) {
    return "boolean";
  }
  if (ts.isNumericLiteral(value) || (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(value.operand))) {
    return "number";
  }
  if (ts.isStringLiteralLike(value) || ts.isNoSubstitutionTemplateLiteral(value) || ts.isTemplateExpression(value)) {
    return "string";
  }
  if (ts.isArrayLiteralExpression(value)) {
    const elements = value.elements.map((element) => inferFieldKind(element));
    if (elements.length === 2 && elements.every((kind) => kind === "number")) return "vec2";
    if (elements.length === 3 && elements.every((kind) => kind === "number")) return "vec3";
    if (elements.length === 4 && elements.every((kind) => kind === "number")) return "vec4";
  }
  return "json";
}

function unwrapExpression(expression: ts.Expression | undefined): ts.Expression | undefined {
  let current = expression;
  while (current !== undefined && (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current))) {
    current = current.expression;
  }
  return current;
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
