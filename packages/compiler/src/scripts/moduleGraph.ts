import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

import type { ICompilerDiagnostic } from "../diagnostics.js";

export interface IScriptModuleGraphNode {
  dependencies: string[];
  hash: string;
  path: string;
  source: string;
}

export interface IScriptModuleGraph {
  entry: string;
  hash: string;
  modules: IScriptModuleGraphNode[];
  order: string[];
}

export interface IResolveScriptModuleGraphOptions {
  allowedBareImports?: readonly string[];
  entryModule: string;
  projectPath: string;
}

export interface IResolveScriptModuleGraphResult {
  diagnostics: ICompilerDiagnostic[];
  entry?: IScriptModuleGraphNode;
  graph?: IScriptModuleGraph;
}

interface ILoadedScriptModule {
  absolutePath: string;
  dependencies: Set<string>;
  path: string;
  source: string;
  sourceFile: ts.SourceFile;
}

interface IGraphContext {
  allowedBareImports: ReadonlySet<string>;
  diagnostics: ICompilerDiagnostic[];
  modules: Map<string, ILoadedScriptModule>;
  projectPath: string;
  scriptsRoot: string;
  scriptsRootRealPath: string;
}

interface IResolvedModulePath {
  absolutePath: string;
  path: string;
}

interface IModuleSpecifier {
  isSideEffect: boolean;
  isTypeOnly: boolean;
  specifier?: string;
}

const SCRIPT_MODULE_ROOT = "src/scripts";

/**
 * Resolves a static project-local script graph without executing or bundling it.
 * Runtime helper packages may be supplied as an explicit external allowlist.
 */
export function resolveScriptModuleGraph(options: IResolveScriptModuleGraphOptions): IResolveScriptModuleGraphResult {
  const projectPath = resolve(options.projectPath);
  const scriptsRoot = resolve(projectPath, SCRIPT_MODULE_ROOT);
  const scriptsRootRealPath = realPathOrFallback(scriptsRoot);
  const context: IGraphContext = {
    allowedBareImports: new Set(options.allowedBareImports ?? []),
    diagnostics: [],
    modules: new Map(),
    projectPath,
    scriptsRoot,
    scriptsRootRealPath,
  };

  const entry = resolveEntryModule(context, options.entryModule);
  if (entry === undefined) {
    return { diagnostics: context.diagnostics };
  }

  visitModule(context, entry);
  const entryNode = context.modules.get(entry.path);
  if (entryNode === undefined) {
    return { diagnostics: context.diagnostics };
  }

  const order = topologicalOrder(context);
  const graphDiagnostics = [...context.diagnostics];
  if (order === undefined) {
    return { diagnostics: graphDiagnostics, entry: toGraphNode(entryNode) };
  }

  const modules = order.flatMap((path) => {
    const module = context.modules.get(path);
    return module === undefined ? [] : [toGraphNode(module)];
  });
  const graph: IScriptModuleGraph = {
    entry: entry.path,
    hash: hashNormalizedValue(
      JSON.stringify(
        modules.map((module) => ({
          dependencies: module.dependencies,
          hash: module.hash,
          path: module.path,
        })),
      ),
    ),
    modules,
    order,
  };

  return {
    diagnostics: graphDiagnostics,
    entry: toGraphNode(entryNode),
    ...(graphDiagnostics.some((diagnostic) => diagnostic.severity === "error") ? {} : { graph }),
  };
}

function resolveEntryModule(context: IGraphContext, entryModule: string): IResolvedModulePath | undefined {
  const requestedPath = resolve(context.projectPath, entryModule);
  if (!isInsideScripts(context, requestedPath)) {
    context.diagnostics.push(pathEscapeDiagnostic(entryModule, entryModule, SCRIPT_MODULE_ROOT));
    return undefined;
  }
  return resolveModulePath(context, entryModule, entryModule, requestedPath);
}

function visitModule(context: IGraphContext, resolved: IResolvedModulePath): void {
  if (context.modules.has(resolved.path)) {
    return;
  }

  const source = readFileSync(resolved.absolutePath, "utf8");
  const normalizedSource = normalizeSource(source);
  const sourceFile = ts.createSourceFile(resolved.path, normalizedSource, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const module: ILoadedScriptModule = {
    absolutePath: resolved.absolutePath,
    dependencies: new Set(),
    path: resolved.path,
    source: normalizedSource,
    sourceFile,
  };
  context.modules.set(resolved.path, module);
  context.diagnostics.push(...diagnoseModulePurity(resolved.path, sourceFile));

  const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  for (const diagnostic of parseDiagnostics) {
    context.diagnostics.push(parseDiagnostic(resolved.path, sourceFile, diagnostic));
  }

  for (const specifier of staticModuleSpecifiers(sourceFile)) {
    if (specifier.isTypeOnly) {
      continue;
    }
    const imported = specifier.specifier;
    if (imported === undefined) {
      context.diagnostics.push(unsupportedSpecifierDiagnostic(resolved.path, "<unknown>"));
      continue;
    }
    if (!isLocalSpecifier(imported)) {
      if (specifier.isSideEffect) {
        context.diagnostics.push(sideEffectImportDiagnostic(resolved.path, imported));
      }
      if (!context.allowedBareImports.has(imported)) {
        context.diagnostics.push(bareImportDiagnostic(resolved.path, imported));
      }
      continue;
    }

    const dependency = resolveModulePath(context, resolved.path, imported, resolve(dirname(resolved.absolutePath), imported));
    if (dependency === undefined) {
      continue;
    }
    if (specifier.isSideEffect) {
      context.diagnostics.push(sideEffectImportDiagnostic(resolved.path, imported));
    }
    module.dependencies.add(dependency.path);
    visitModule(context, dependency);
  }

  for (const dynamicImport of dynamicImportNodes(sourceFile)) {
    const specifier = dynamicImport.arguments[0];
    const imported = specifier !== undefined && ts.isStringLiteralLike(specifier) ? specifier.text : "<dynamic>";
    context.diagnostics.push(dynamicImportDiagnostic(resolved.path, imported));
  }
}

function resolveModulePath(
  context: IGraphContext,
  importerPath: string,
  specifier: string,
  requestedPath: string,
): IResolvedModulePath | undefined {
  if (!isInsideScripts(context, requestedPath)) {
    context.diagnostics.push(pathEscapeDiagnostic(importerPath, specifier, SCRIPT_MODULE_ROOT));
    return undefined;
  }

  const extension = requestedPath.endsWith(".ts") ? ".ts" : "";
  if (extension === "" && hasExplicitUnsupportedExtension(specifier)) {
    context.diagnostics.push(unsupportedSpecifierDiagnostic(importerPath, specifier));
    return undefined;
  }

  // Explicit .ts wins; extensionless imports then try sibling .ts before index.ts.
  const candidates = extension === ".ts" ? [requestedPath] : [
    `${requestedPath}.ts`,
    join(requestedPath, "index.ts"),
  ];
  for (const candidate of candidates) {
    const resolvedCandidate = existingScriptFile(context, candidate);
    if (resolvedCandidate !== undefined) {
      return resolvedCandidate;
    }
  }

  context.diagnostics.push(missingModuleDiagnostic(importerPath, specifier, SCRIPT_MODULE_ROOT));
  return undefined;
}

function existingScriptFile(context: IGraphContext, candidate: string): IResolvedModulePath | undefined {
  if (!isInsideScripts(context, candidate)) {
    return undefined;
  }
  try {
    if (!statSync(candidate).isFile()) {
      return undefined;
    }
    const absolutePath = realpathSync(candidate);
    if (!isInsideRealScripts(context, absolutePath)) {
      return undefined;
    }
    return { absolutePath, path: projectRelativePath(context.projectPath, absolutePath) };
  } catch {
    return undefined;
  }
}

function topologicalOrder(context: IGraphContext): string[] | undefined {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, Set<string>>();
  for (const module of context.modules.values()) {
    indegree.set(module.path, module.dependencies.size);
    for (const dependency of module.dependencies) {
      const consumers = dependents.get(dependency) ?? new Set<string>();
      consumers.add(module.path);
      dependents.set(dependency, consumers);
    }
  }

  const ready = [...indegree.entries()].filter(([, count]) => count === 0).map(([path]) => path).sort(comparePaths);
  const order: string[] = [];
  while (ready.length > 0) {
    const path = ready.shift();
    if (path === undefined) {
      break;
    }
    order.push(path);
    for (const dependent of [...(dependents.get(path) ?? [])].sort(comparePaths)) {
      const count = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, count);
      if (count === 0) {
        insertSorted(ready, dependent);
      }
    }
  }

  if (order.length === indegree.size) {
    return order;
  }

  const cycle = findCycle(context);
  if (cycle !== undefined) {
    context.diagnostics.push(cycleDiagnostic(cycle));
  }
  return undefined;
}

function findCycle(context: IGraphContext): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (path: string): string[] | undefined => {
    if (visiting.has(path)) {
      const cycleStart = stack.indexOf(path);
      return cycleStart === -1 ? [path, path] : [...stack.slice(cycleStart), path];
    }
    if (visited.has(path)) {
      return undefined;
    }
    visiting.add(path);
    stack.push(path);
    const module = context.modules.get(path);
    for (const dependency of [...(module?.dependencies ?? [])].sort(comparePaths)) {
      const cycle = visit(dependency);
      if (cycle !== undefined) {
        return cycle;
      }
    }
    stack.pop();
    visiting.delete(path);
    visited.add(path);
    return undefined;
  };

  for (const path of [...context.modules.keys()].sort(comparePaths)) {
    const cycle = visit(path);
    if (cycle !== undefined) {
      return cycle;
    }
  }
  return undefined;
}

function staticModuleSpecifiers(sourceFile: ts.SourceFile): IModuleSpecifier[] {
  const specifiers: IModuleSpecifier[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      specifiers.push({
        isSideEffect: statement.importClause === undefined,
        isTypeOnly: isTypeOnlyImport(statement),
        specifier: literalSpecifier(statement.moduleSpecifier),
      });
      continue;
    }
    if (ts.isImportEqualsDeclaration(statement)) {
      specifiers.push({
        isSideEffect: false,
        isTypeOnly: statement.isTypeOnly,
        specifier: ts.isExternalModuleReference(statement.moduleReference)
          ? literalSpecifier(statement.moduleReference.expression)
          : undefined,
      });
      continue;
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) {
      specifiers.push({
        isSideEffect: false,
        isTypeOnly: isTypeOnlyExport(statement),
        specifier: literalSpecifier(statement.moduleSpecifier),
      });
    }
  }
  return specifiers;
}

function diagnoseModulePurity(file: string, sourceFile: ts.SourceFile): ICompilerDiagnostic[] {
  const diagnostics: ICompilerDiagnostic[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      const flags = ts.getCombinedNodeFlags(statement.declarationList);
      if ((flags & ts.NodeFlags.Let) !== 0 || (flags & ts.NodeFlags.Const) === 0) {
        diagnostics.push(moduleStateDiagnostic(file));
      }
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer !== undefined && hasEvaluationSideEffect(declaration.initializer)) {
          diagnostics.push(sideEffectExpressionDiagnostic(file));
        }
      }
    }
    if (!ts.isExpressionStatement(statement)) {
      continue;
    }
    if (hasEvaluationSideEffect(statement.expression)) {
      diagnostics.push(sideEffectExpressionDiagnostic(file));
    }
  }
  return diagnostics;
}

function hasEvaluationSideEffect(node: ts.Node): boolean {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node)) {
    return false;
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "defineBehavior") {
    return node.arguments.some((argument) => hasEvaluationSideEffect(argument));
  }
  if (
    ts.isCallExpression(node)
    || ts.isNewExpression(node)
    || ts.isAwaitExpression(node)
    || ts.isPostfixUnaryExpression(node)
    || ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
    || ts.isDeleteExpression(node)
    || ts.isYieldExpression(node)
    || ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)
  ) {
    return true;
  }
  let effectful = false;
  ts.forEachChild(node, (child) => {
    if (!effectful && hasEvaluationSideEffect(child)) {
      effectful = true;
    }
  });
  return effectful;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function dynamicImportNodes(sourceFile: ts.SourceFile): ts.CallExpression[] {
  const imports: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      imports.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

function isTypeOnlyImport(statement: ts.ImportDeclaration): boolean {
  const clause = statement.importClause;
  if (clause?.isTypeOnly === true) {
    return true;
  }
  if (clause === undefined) {
    return false;
  }
  if (clause.name !== undefined) {
    return false;
  }
  if (clause.namedBindings === undefined || ts.isNamespaceImport(clause.namedBindings)) {
    return false;
  }
  return clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function isTypeOnlyExport(statement: ts.ExportDeclaration): boolean {
  if (statement.isTypeOnly === true) {
    return true;
  }
  if (statement.exportClause === undefined || ts.isNamespaceExport(statement.exportClause)) {
    return false;
  }
  return statement.exportClause.elements.length > 0 && statement.exportClause.elements.every((element) => element.isTypeOnly);
}

function literalSpecifier(node: ts.Expression): string | undefined {
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../") || isAbsolute(specifier);
}

function hasExplicitUnsupportedExtension(specifier: string): boolean {
  const lastSegment = specifier.slice(specifier.lastIndexOf("/") + 1);
  return lastSegment.includes(".");
}

function isInsideScripts(context: IGraphContext, filePath: string): boolean {
  const path = relative(context.scriptsRoot, filePath);
  return path !== "" && path !== "." && !path.startsWith("..") && !path.startsWith(sep);
}

function isInsideRealScripts(context: IGraphContext, filePath: string): boolean {
  const path = relative(context.scriptsRootRealPath, filePath);
  return path !== "" && path !== "." && !path.startsWith("..") && !path.startsWith(sep);
}

function projectRelativePath(projectPath: string, filePath: string): string {
  return relative(projectPath, filePath).split(sep).join("/");
}

function realPathOrFallback(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function normalizeSource(source: string): string {
  return source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function hashNormalizedValue(value: string): string {
  return `sha256-${createHash("sha256").update(value).digest("hex")}`;
}

function toGraphNode(module: ILoadedScriptModule): IScriptModuleGraphNode {
  return {
    dependencies: [...module.dependencies].sort(comparePaths),
    hash: hashNormalizedValue(module.source),
    path: module.path,
    source: module.source,
  };
}

function insertSorted(values: string[], value: string): void {
  const index = values.findIndex((current) => comparePaths(current, value) > 0);
  values.splice(index === -1 ? values.length : index, 0, value);
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pathEscapeDiagnostic(importer: string, specifier: string, root: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_PATH_ESCAPE",
    file: importer,
    fix: {
      instruction: `Keep the import inside '${root}' and use a relative TypeScript module path such as './shared.ts' or './shared'.`,
    },
    message: `Script module '${importer}' imports '${specifier}' outside the bounded '${root}' root.`,
    path: `scriptModules/${importer}`,
    severity: "error",
    suggestion: `Move the target under '${root}' or update the import to a local .ts module.`,
    target: specifier,
  };
}

function missingModuleDiagnostic(importer: string, specifier: string, root: string): ICompilerDiagnostic {
  const expected = specifier.endsWith(".ts") ? `'${specifier}'` : `'${specifier}.ts' or '${specifier}/index.ts'`;
  return {
    code: "TN_SCRIPT_MODULE_NOT_FOUND",
    file: importer,
    fix: {
      instruction: `Create ${expected} under '${root}', or update the import path.`,
    },
    message: `Script module '${importer}' imports missing module '${specifier}' under '${root}'.`,
    path: `scriptModules/${importer}`,
    severity: "error",
    suggestion: `Add a .ts file using the supported extensionless or index.ts resolution under '${root}'.`,
    target: specifier,
  };
}

function unsupportedSpecifierDiagnostic(importer: string, specifier: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_SPECIFIER_UNSUPPORTED",
    file: importer,
    fix: {
      instruction: "Use a relative .ts import, an extensionless relative import, or an approved runtime helper package.",
    },
    message: `Script module '${importer}' uses unsupported module specifier '${specifier}'.`,
    path: `scriptModules/${importer}`,
    severity: "error",
    suggestion: "Portable project-local modules support .ts, extensionless, and index.ts resolution only.",
    target: specifier,
  };
}

function bareImportDiagnostic(importer: string, specifier: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_BARE_IMPORT_UNSUPPORTED",
    file: importer,
    fix: {
      instruction: "Replace the bare import with a relative module under src/scripts or an approved portable helper package.",
    },
    message: `Script module '${importer}' imports bare package '${specifier}', which is not in the portable helper allowlist.`,
    path: `scriptModules/${importer}`,
    severity: "error",
    suggestion: "Keep project-local imports relative and use only the compiler-approved helper packages for external runtime code.",
    target: specifier,
  };
}

function dynamicImportDiagnostic(importer: string, specifier: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_DYNAMIC_IMPORT_UNSUPPORTED",
    file: importer,
    fix: {
      instruction: "Replace dynamic import() with a static top-level import from a bounded .ts module.",
    },
    message: `Script module '${importer}' uses dynamic import('${specifier}'), which cannot be resolved into the portable module graph.`,
    path: `scriptModules/${importer}`,
    severity: "error",
    suggestion: "Declare all project-local module dependencies statically so web and native receive the same graph.",
    target: specifier === "<dynamic>" ? undefined : specifier,
  };
}

function sideEffectImportDiagnostic(file: string, specifier: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_SIDE_EFFECT_IMPORT_UNSUPPORTED",
    file,
    fix: {
      instruction: "Replace the side-effect import with a named import from a pure declaration module.",
    },
    message: `Script module '${file}' uses side-effect import '${specifier}', which cannot be proven portable.`,
    path: `scriptModules/${file}`,
    severity: "error",
    suggestion: "Export a pure function or constant from the dependency and import that binding explicitly.",
    target: specifier,
  };
}

function moduleStateDiagnostic(file: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_STATE_UNSUPPORTED",
    file,
    fix: {
      instruction: "Move mutable state into a declared component or resource and keep module declarations pure.",
    },
    message: `Script module '${file}' declares mutable top-level module state.`,
    path: `scriptModules/${file}`,
    severity: "error",
    suggestion: "Use declared resources or components for state that must persist across runtime ticks.",
  };
}

function sideEffectExpressionDiagnostic(file: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_SIDE_EFFECT_UNSUPPORTED",
    file,
    fix: {
      instruction: "Move top-level work into an exported function and call it from a system tick.",
    },
    message: `Script module '${file}' contains a top-level side-effect expression.`,
    path: `scriptModules/${file}`,
    severity: "error",
    suggestion: "Keep module evaluation limited to pure declarations so web and native initialization stay identical.",
  };
}

function cycleDiagnostic(cycle: readonly string[]): ICompilerDiagnostic {
  const chain = cycle.join(" -> ");
  return {
    code: "TN_SCRIPT_MODULE_CYCLE",
    file: cycle[0],
    fix: {
      instruction: "Break the cycle by moving shared pure declarations into a dependency that does not import back into this module chain.",
    },
    message: `Script module dependency cycle: ${chain}.`,
    path: `scriptModules/${cycle[0] ?? "<unknown>"}`,
    severity: "error",
    suggestion: "Portable script modules must form an acyclic static graph.",
    target: chain,
  };
}

function parseDiagnostic(file: string, sourceFile: ts.SourceFile, diagnostic: ts.Diagnostic): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_PARSE_ERROR",
    file,
    fix: {
      instruction: "Fix the TypeScript syntax error in the referenced script module before building.",
    },
    message: `Script module '${file}' could not be parsed: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}.`,
    path: `scriptModules/${file}`,
    severity: "error",
    target: diagnostic.start === undefined ? undefined : String(sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line + 1),
  };
}
