import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

import type { ICompilerDiagnostic } from "../diagnostics.js";
import type { ISystemScriptSource } from "./bundle.js";

export interface IResolveSystemScriptSourcesResult<T extends ISystemScriptSource> {
  diagnostics: ICompilerDiagnostic[];
  systems: T[];
}

export function resolveSystemScriptSources<T extends ISystemScriptSource>(
  systems: ReadonlyArray<T>,
  projectPath: string | undefined,
): IResolveSystemScriptSourcesResult<T> {
  const diagnostics: ICompilerDiagnostic[] = [];
  return {
    diagnostics,
    systems: systems.map((system) => {
      const script = system.script;
      if (script?.sourceRef === undefined || script.source !== undefined) {
        return system;
      }
      if (projectPath === undefined) {
        diagnostics.push({
          code: "TN_SCRIPT_PROJECT_PATH_REQUIRED",
          file: script.sourceRef.module,
          message: `System '${system.name}' script source requires a project path for module resolution.`,
          path: `systems/${system.name}/script/sourceRef`,
          severity: "error",
          suggestion: "Build the project through the compiler project pipeline so script modules resolve relative to the project root.",
          target: script.sourceRef.export,
        });
        return system;
      }
      const resolved = resolveScriptModule({ ...system, script }, projectPath);
      diagnostics.push(...resolved.diagnostics);
      if (resolved.source === undefined || resolved.hash === undefined) {
        return system;
      }
      return {
        ...system,
        script: {
          ...script,
          source: resolved.source,
          sourceRef: {
            ...script.sourceRef,
            hash: resolved.hash,
          },
        },
      } as T;
    }),
  };
}

function resolveScriptModule(system: ISystemScriptSource & { script: NonNullable<ISystemScriptSource["script"]> }, projectPath: string): { diagnostics: ICompilerDiagnostic[]; hash?: string; source?: string } {
  const sourceRef = system.script.sourceRef;
  if (sourceRef === undefined) {
    return { diagnostics: [] };
  }
  const modulePath = resolve(projectPath, sourceRef.module);
  if (!isInsideProject(projectPath, modulePath)) {
    return {
      diagnostics: [
        {
          code: "TN_SCRIPT_MODULE_OUTSIDE_PROJECT",
          file: sourceRef.module,
          message: `System '${system.name}' script module must stay inside the project root.`,
          path: `systems/${system.name}/script/sourceRef/module`,
          severity: "error",
          suggestion: "Use a project-relative script module path without parent traversal.",
          target: sourceRef.export,
        },
      ],
    };
  }

  let moduleSource: string;
  try {
    moduleSource = readFileSync(modulePath, "utf8");
  } catch {
    return {
      diagnostics: [
        {
          code: "TN_SCRIPT_MODULE_NOT_FOUND",
          file: sourceRef.module,
          message: `System '${system.name}' script module '${sourceRef.module}' could not be read.`,
          path: `systems/${system.name}/script/sourceRef/module`,
          severity: "error",
          suggestion: "Create the referenced script module or update the system script module path.",
          target: sourceRef.export,
        },
      ],
    };
  }

  const hash = `sha256-${createHash("sha256").update(moduleSource).digest("hex")}`;
  const diagnostics: ICompilerDiagnostic[] = [];
  if (sourceRef.hash !== undefined && sourceRef.hash !== hash) {
    diagnostics.push({
      code: "TN_SCRIPT_SOURCE_HASH_MISMATCH",
      file: sourceRef.module,
      message: `System '${system.name}' script module hash does not match '${sourceRef.hash}'.`,
      path: `systems/${system.name}/script/sourceRef/hash`,
      severity: "error",
      suggestion: `Refresh the source hash to '${hash}' after intentional script edits.`,
      target: sourceRef.export,
    });
  }

  const sourceFile = ts.createSourceFile(sourceRef.module, moduleSource, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  diagnostics.push(...diagnoseHelperImports(system.name, sourceRef.module, sourceRef.export, sourceFile));
  diagnostics.push(...diagnoseMutableModuleState(system.name, sourceRef.module, sourceRef.export, sourceFile));
  const exported = extractNamedExport(sourceFile, sourceRef.export);
  if (exported === undefined) {
    diagnostics.push({
      code: "TN_SCRIPT_EXPORT_NOT_FOUND",
      file: sourceRef.module,
      message: `System '${system.name}' script module does not export '${sourceRef.export}'.`,
      path: `systems/${system.name}/script/sourceRef/export`,
      severity: "error",
      suggestion: "Export the referenced portable system function or update the system script export name.",
      target: sourceRef.export,
    });
  }

  return {
    diagnostics,
    hash,
    source: diagnostics.length === 0 ? exported : undefined,
  };
}

function isInsideProject(projectPath: string, filePath: string): boolean {
  const rel = relative(resolve(projectPath), filePath);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

function diagnoseHelperImports(systemName: string, module: string, exportName: string, sourceFile: ts.SourceFile): ICompilerDiagnostic[] {
  const diagnostics: ICompilerDiagnostic[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement) || (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined)) {
      diagnostics.push({
        code: "TN_SCRIPT_HELPER_IMPORT_UNSUPPORTED",
        file: module,
        message: `System '${systemName}' script module uses helper imports that are not bundled yet.`,
        path: `systems/${systemName}/script/sourceRef/module`,
        severity: "error",
        suggestion: "Inline portable helpers into the script module until script helper bundling is supported.",
        target: exportName,
      });
    }
  }
  return diagnostics;
}

function diagnoseMutableModuleState(systemName: string, module: string, exportName: string, sourceFile: ts.SourceFile): ICompilerDiagnostic[] {
  return sourceFile.statements.flatMap((statement): ICompilerDiagnostic[] => {
    if (!ts.isVariableStatement(statement) || hasExportModifier(statement)) {
      return [];
    }
    const flags = ts.getCombinedNodeFlags(statement.declarationList);
    if ((flags & ts.NodeFlags.Let) === 0 && (flags & ts.NodeFlags.Const) !== 0) {
      return [];
    }
    return [
      {
        code: "TN_SCRIPT_MODULE_STATE_UNSUPPORTED",
        file: module,
        message: `System '${systemName}' script module declares mutable module state.`,
        path: `systems/${systemName}/script/sourceRef/moduleState`,
        severity: "error",
        suggestion: "Store gameplay state in declared resources or components instead of script module variables.",
        target: exportName,
      },
    ];
  });
}

function extractNamedExport(sourceFile: ts.SourceFile, exportName: string): string | undefined {
  const exportedNames = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (hasExportModifier(statement) && declarationName(statement) !== undefined) {
      exportedNames.add(declarationName(statement) ?? "");
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        exportedNames.add(element.name.text);
      }
    }
  }
  if (!exportedNames.has(exportName)) {
    return undefined;
  }

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === exportName) {
      return transpilePortableSource(stripLeadingExport(statement.getText(sourceFile)));
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName && declaration.initializer !== undefined) {
          return transpilePortableSource(declaration.initializer.getText(sourceFile));
        }
      }
    }
  }
  return undefined;
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function declarationName(node: ts.Node): string | undefined {
  if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name !== undefined) {
    return node.name.text;
  }
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations.flatMap((declaration) => (ts.isIdentifier(declaration.name) ? [declaration.name.text] : []))[0];
  }
  return undefined;
}

function stripLeadingExport(source: string): string {
  return source.replace(/^export\s+/, "");
}

function transpilePortableSource(source: string): string {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText.trim().replace(/;$/, "");
}
