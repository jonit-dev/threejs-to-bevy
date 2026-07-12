import ts from "typescript";

import type { ICompilerDiagnostic } from "../diagnostics.js";
import type { IScriptModuleGraph, IScriptModuleGraphNode } from "./moduleGraph.js";

export interface ILocalModuleBundleResult {
  code: string;
  diagnostics: ICompilerDiagnostic[];
  entries: Map<string, string>;
}

/**
 * Wraps the closed TypeScript graph in deterministic module scopes. The
 * runtime still receives one ESM bundle; these IIFEs are compiler output, not
 * a runtime module loader or filesystem capability.
 */
export function bundleLocalScriptModules(
  graphs: ReadonlyArray<{ entryExport: string; exportName: string; graph: IScriptModuleGraph }>,
  helperModules: ReadonlySet<string> = new Set(),
): ILocalModuleBundleResult {
  const modules = collectModules(graphs);
  const order = topologicalModuleOrder(modules);
  const diagnostics: ICompilerDiagnostic[] = [];
  const entries = new Map<string, string>();
  const declarations: string[] = [];
  const moduleNames = new Map<string, string>();

  order.forEach((path, index) => moduleNames.set(path, `__tn_local_module_${index}`));
  for (const graphEntry of graphs) {
    const moduleName = moduleNames.get(graphEntry.graph.entry);
    if (moduleName === undefined) {
      continue;
    }
    entries.set(graphEntry.exportName, `${moduleName}[${JSON.stringify(graphEntry.entryExport)}]`);
  }

  for (const path of order) {
    const module = modules.get(path);
    const moduleName = moduleNames.get(path);
    if (module === undefined || moduleName === undefined) {
      continue;
    }
    const generated = generateModule(module, moduleNames, modules, helperModules);
    diagnostics.push(...generated.diagnostics);
    declarations.push(`const ${moduleName} = (() => {\n${indent(generated.code)}\n  return Object.freeze(__tn_exports);\n})();`);
  }

  return { code: declarations.join("\n"), diagnostics, entries };
}

function collectModules(graphs: ReadonlyArray<{ graph: IScriptModuleGraph }>): Map<string, IScriptModuleGraphNode> {
  const modules = new Map<string, IScriptModuleGraphNode>();
  for (const graphEntry of graphs) {
    for (const module of graphEntry.graph.modules) {
      const existing = modules.get(module.path);
      if (existing === undefined || existing.hash === module.hash) {
        modules.set(module.path, module);
      }
    }
  }
  return modules;
}

function topologicalModuleOrder(modules: ReadonlyMap<string, IScriptModuleGraphNode>): string[] {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, Set<string>>();
  for (const module of modules.values()) {
    indegree.set(module.path, module.dependencies.length);
    for (const dependency of module.dependencies) {
      const values = dependents.get(dependency) ?? new Set<string>();
      values.add(module.path);
      dependents.set(dependency, values);
    }
  }
  const ready = [...indegree.entries()].filter(([, count]) => count === 0).map(([path]) => path).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const path = ready.shift();
    if (path === undefined) {
      break;
    }
    order.push(path);
    for (const dependent of [...(dependents.get(path) ?? [])].sort()) {
      const count = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, count);
      if (count === 0) {
        const index = ready.findIndex((candidate) => candidate > dependent);
        ready.splice(index === -1 ? ready.length : index, 0, dependent);
      }
    }
  }
  return order.length === modules.size ? order : [...modules.keys()].sort();
}

function generateModule(
  module: IScriptModuleGraphNode,
  moduleNames: ReadonlyMap<string, string>,
  modules: ReadonlyMap<string, IScriptModuleGraphNode>,
  helperModules: ReadonlySet<string>,
): { code: string; diagnostics: ICompilerDiagnostic[]; exports: Record<string, string> } {
  const sourceFile = ts.createSourceFile(module.path, module.source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const diagnostics: ICompilerDiagnostic[] = [];
  const prelude: string[] = [];
  const body: string[] = [];
  const exported = new Map<string, string>();
  const starDependencies: string[] = [];
  const localBindings = moduleBindingNames(sourceFile);
  const explicitExportNames = moduleExplicitExportNames(sourceFile);
  const starExportNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = literalSpecifier(statement.moduleSpecifier);
      const clause = statement.importClause;
      if (specifier === undefined || clause === undefined || clause.isTypeOnly === true) {
        if (specifier !== undefined && clause === undefined && isLocalSpecifier(specifier)) {
          diagnostics.push(sideEffectImportDiagnostic(module.path, specifier));
        }
        continue;
      }
      const dependency = isLocalSpecifier(specifier) ? resolveDependencyPath(module, specifier, modules) : undefined;
      if (isLocalSpecifier(specifier) && dependency === undefined) {
        diagnostics.push(missingBundledDependencyDiagnostic(module.path, specifier));
        continue;
      }
      if (dependency === undefined) {
        if (helperModules.has(specifier) && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if (!element.isTypeOnly) {
              const importedName = element.propertyName?.text ?? element.name.text;
              prelude.push(`const ${element.name.text} = ${importedName};`);
            }
          }
        }
        continue;
      }
      const dependencyName = moduleNames.get(dependency);
      if (dependencyName === undefined) {
        diagnostics.push(missingBundledDependencyDiagnostic(module.path, specifier));
        continue;
      }
      if (clause.name !== undefined) {
        if (!graphExportNames(modules.get(dependency), modules).has("default")) {
          diagnostics.push(missingExportDiagnostic(module.path, specifier, "default"));
        }
        prelude.push(`const ${clause.name.text} = ${dependencyName}["default"];`);
      }
      if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
        prelude.push(`const ${clause.namedBindings.name.text} = ${dependencyName};`);
      } else if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (element.isTypeOnly) {
            continue;
          }
          const importedName = element.propertyName?.text ?? element.name.text;
          if (!graphExportNames(modules.get(dependency), modules).has(importedName)) {
            diagnostics.push(missingExportDiagnostic(module.path, specifier, importedName));
          }
          prelude.push(`const ${element.name.text} = ${dependencyName}[${JSON.stringify(importedName)}];`);
        }
      }
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) {
        continue;
      }
      const specifier = statement.moduleSpecifier === undefined ? undefined : literalSpecifier(statement.moduleSpecifier);
      const dependency = specifier === undefined || !isLocalSpecifier(specifier) ? undefined : resolveDependencyPath(module, specifier, modules);
      if (specifier !== undefined && dependency === undefined) {
        diagnostics.push(missingBundledDependencyDiagnostic(module.path, specifier));
        continue;
      }
      if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.isTypeOnly) {
            continue;
          }
          const localName = element.propertyName?.text ?? element.name.text;
          if (dependency === undefined) {
            if (!localBindings.has(localName)) {
              diagnostics.push(missingExportDiagnostic(module.path, "<local>", localName));
            }
            exported.set(element.name.text, localName);
          } else {
            if (!graphExportNames(modules.get(dependency), modules).has(localName)) {
              diagnostics.push(missingExportDiagnostic(module.path, specifier ?? "<local>", localName));
            }
            exported.set(element.name.text, `${moduleNames.get(dependency)}[${JSON.stringify(localName)}]`);
          }
        }
      } else if (statement.exportClause !== undefined && ts.isNamespaceExport(statement.exportClause) && dependency !== undefined) {
        exported.set(statement.exportClause.name.text, moduleNames.get(dependency) ?? "");
      } else if (dependency !== undefined) {
        for (const name of graphExportNames(modules.get(dependency), modules)) {
          if (name === "default") {
            continue;
          }
          if (explicitExportNames.has(name)) {
            continue;
          }
          if (starExportNames.has(name)) {
            diagnostics.push(ambiguousExportDiagnostic(module.path, specifier ?? "<local>", name));
            continue;
          }
          starExportNames.add(name);
        }
        starDependencies.push(moduleNames.get(dependency) ?? "");
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      const expression = statement.expression.getText(sourceFile);
      body.push(`const __tn_default = ${expression};`);
      exported.set("default", "__tn_default");
      continue;
    }

    const modifiers = nodeModifiers(statement);
    const isExported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
    const stripped = stripExportModifiers(statement, sourceFile);
    body.push(stripped);
    if (!isExported) {
      continue;
    }
    for (const name of declarationNames(statement)) {
      exported.set(isDefault ? "default" : name, name);
    }
    if (isDefault && declarationNames(statement).length === 0) {
      body[body.length - 1] = `const __tn_default = ${stripped};`;
      exported.set("default", "__tn_default");
    }
  }

  const exportObject: Record<string, string> = {};
  for (const [name, expression] of exported) {
    exportObject[name] = expression;
  }
  for (const dependency of starDependencies) {
    if (dependency.length > 0) {
      body.push(`for (const __tn_star_name of Object.keys(${dependency})) { if (__tn_star_name !== "default" && !Object.prototype.hasOwnProperty.call(__tn_exports, __tn_star_name)) __tn_exports[__tn_star_name] = ${dependency}[__tn_star_name]; }`);
    }
  }
  const code = ts.transpileModule([...prelude, "const __tn_exports = {};", ...body, ...Object.entries(exportObject).map(([name, expression]) => `__tn_exports[${JSON.stringify(name)}] = ${expression};`)].join("\n"), {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: module.path,
  }).outputText.trim();
  return { code, diagnostics, exports: exportObject };
}

function declarationNames(statement: ts.Statement): string[] {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name !== undefined) {
    return [statement.name.text];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) => ts.isIdentifier(declaration.name) ? [declaration.name.text] : []);
  }
  return [];
}

function moduleBindingNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    for (const name of declarationNames(statement)) {
      names.add(name);
    }
    if (ts.isExportAssignment(statement)) {
      names.add("default");
    }
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.name !== undefined) {
        names.add(clause.name.text);
      }
      if (clause?.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
        names.add(clause.namedBindings.name.text);
      }
      if (clause?.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (!element.isTypeOnly) {
            names.add(element.name.text);
          }
        }
      }
    }
  }
  return names;
}

function moduleExplicitExportNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    const modifiers = nodeModifiers(statement);
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      const declared = declarationNames(statement);
      for (const name of declared) {
        names.add(modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : name);
      }
      if (declared.length === 0 && modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
        names.add("default");
      }
    }
    if (ts.isExportAssignment(statement)) {
      names.add("default");
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly) {
            names.add(element.name.text);
          }
        }
      } else if (ts.isNamespaceExport(statement.exportClause)) {
        names.add(statement.exportClause.name.text);
      }
    }
  }
  return names;
}

function moduleExportNames(
  sourceFile: ts.SourceFile | undefined,
  module: IScriptModuleGraphNode | undefined,
  modules: ReadonlyMap<string, IScriptModuleGraphNode>,
  visiting = new Set<string>(),
): Set<string> {
  const names = new Set<string>();
  if (sourceFile === undefined) {
    return names;
  }
  for (const statement of sourceFile.statements) {
    const modifiers = nodeModifiers(statement);
    if (modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      const declared = declarationNames(statement);
      for (const name of declared) {
        names.add(modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword) ? "default" : name);
      }
      if (declared.length === 0 && modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) {
        names.add("default");
      }
    }
    if (ts.isExportAssignment(statement)) {
      names.add("default");
    }
    if (ts.isExportDeclaration(statement) && statement.isTypeOnly === false) {
      if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (!element.isTypeOnly) {
            names.add(element.name.text);
          }
        }
      } else if (statement.exportClause !== undefined && ts.isNamespaceExport(statement.exportClause)) {
        names.add(statement.exportClause.name.text);
      } else if (module !== undefined && statement.moduleSpecifier !== undefined) {
        const specifier = literalSpecifier(statement.moduleSpecifier);
        const dependency = specifier === undefined ? undefined : resolveDependencyPath(module, specifier, modules);
        for (const name of graphExportNames(modules.get(dependency ?? ""), modules, visiting)) {
          if (name !== "default") {
            names.add(name);
          }
        }
      }
    }
  }
  return names;
}

function graphExportNames(
  module: IScriptModuleGraphNode | undefined,
  modules: ReadonlyMap<string, IScriptModuleGraphNode>,
  visiting = new Set<string>(),
): Set<string> {
  if (module === undefined || visiting.has(module.path)) {
    return new Set<string>();
  }
  const nextVisiting = new Set(visiting);
  nextVisiting.add(module.path);
  return moduleExportNames(
    ts.createSourceFile(module.path, module.source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS),
    module,
    modules,
    nextVisiting,
  );
}

export function scriptModuleGraphExportNames(graph: IScriptModuleGraph): Set<string> {
  const modules = new Map(graph.modules.map((module) => [module.path, module] as const));
  return graphExportNames(modules.get(graph.entry), modules);
}

function stripExportModifiers(statement: ts.Statement, sourceFile: ts.SourceFile): string {
  const statementStart = statement.getStart(sourceFile);
  const text = statement.getText(sourceFile);
  const ranges = nodeModifiers(statement).filter((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword).map((modifier) => ({
    end: modifier.getEnd() - statementStart,
    start: modifier.getStart(sourceFile) - statementStart,
  }));
  return ranges.sort((left, right) => right.start - left.start).reduce((current, range) => `${current.slice(0, range.start)}${current.slice(range.end)}`, text).trim();
}

function nodeModifiers(statement: ts.Statement): readonly ts.Modifier[] {
  return ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
}

function resolveDependencyPath(module: IScriptModuleGraphNode, specifier: string, modules: ReadonlyMap<string, IScriptModuleGraphNode>): string | undefined {
  const recorded = module.dependencyPaths?.[specifier];
  if (recorded !== undefined && modules.has(recorded)) {
    return recorded;
  }
  const importer = module.path;
  const mappedSpecifier = specifier.endsWith(".js") ? `${specifier.slice(0, -3)}.ts` : specifier;
  const base = normalizePath(joinPath(dirnamePath(importer), mappedSpecifier));
  const candidates = mappedSpecifier.endsWith(".ts") ? [base] : [`${base}.ts`, `${base}/index.ts`];
  return candidates.find((candidate) => modules.has(candidate));
}

function dirnamePath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function joinPath(left: string, right: string): string {
  return `${left}/${right}`.replace(/\/+/g, "/");
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../");
}

function literalSpecifier(node: ts.Expression): string | undefined {
  return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function indent(source: string): string {
  return source.split("\n").map((line) => `  ${line}`).join("\n");
}

function sideEffectImportDiagnostic(file: string, specifier: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_SIDE_EFFECT_IMPORT_UNSUPPORTED",
    file,
    message: `Script module '${file}' uses side-effect import '${specifier}', which is not allowed in the portable graph.`,
    path: `scriptModules/${file}`,
    severity: "error",
    suggestion: "Export a pure declaration from the module and import that named value instead.",
    target: specifier,
  };
}

function missingBundledDependencyDiagnostic(file: string, specifier: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_BUNDLE_EDGE_INVALID",
    file,
    message: `Script module '${file}' could not bind local import '${specifier}' in the generated module scope.`,
    path: `scriptModules/${file}`,
    severity: "error",
    suggestion: "Use a static named, default, or namespace import from a resolvable .ts module.",
    target: specifier,
  };
}

function missingExportDiagnostic(file: string, specifier: string, name: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_EXPORT_MISSING",
    file,
    message: `Script module '${file}' imports or re-exports missing binding '${name}' from '${specifier}'.`,
    path: `scriptModules/${file}`,
    severity: "error",
    suggestion: "Export the named binding from the dependency or update the import/re-export to a declared name.",
    target: name,
  };
}

function ambiguousExportDiagnostic(file: string, specifier: string, name: string): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_MODULE_EXPORT_AMBIGUOUS",
    file,
    message: `Script module '${file}' re-exports '${name}' from '${specifier}', but another export already owns that name.`,
    path: `scriptModules/${file}`,
    severity: "error",
    suggestion: "Use an explicit named re-export with a unique alias instead of ambiguous star re-exports.",
    target: name,
  };
}
