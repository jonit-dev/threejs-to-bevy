import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

import { prescriptiveFixForCode } from "@threenative/authoring";
import type { ICompilerDiagnostic } from "../diagnostics.js";
import { extractResourceAccess } from "./resourceAccess.js";
import { SUPPORTED_SCRIPT_HELPER_IMPORTS, type ISystemScriptSource, type SupportedScriptHelperImport } from "./bundle.js";

const supportedScriptHelperBindings: Record<SupportedScriptHelperImport, ReadonlySet<string>> = {
  "@threenative/checkpoint-race-kit": new Set(["CheckpointRaceKit"]),
  "@threenative/collector-kit": new Set(["CollectorKit"]),
  "@threenative/lane-runner-kit": new Set(["LaneRunnerKit"]),
  "@threenative/racing-kit": new Set(["CheckpointRace", "Track2D"]),
  "@threenative/script-stdlib": new Set([
    "AngleEx",
    "ArrayEx",
    "BasisEx",
    "Bounds2",
    "Bounds3",
    "CameraMath",
    "CameraRig",
    "CharacterRig",
    "CheckpointRaceEx",
    "ColorEx",
    "ControllerEx",
    "Ease",
    "InputEx",
    "KinematicMoverEx",
    "MotionEx",
    "Mathf",
    "NumberEx",
    "Quat",
    "RandomEx",
    "RespawnEx",
    "SpawnEx",
    "TextEx",
    "TimerEx",
    "TransformMath",
    "Vector2",
    "Vector3",
    "TriggerEx",
    "Vec2",
    "Vec3",
  ]),
};

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
      const resourceAccess = extractResourceAccess(resolved.source, {
        exportName: script.sourceRef.export,
        file: script.sourceRef.module,
        systemName: system.name,
      });
      diagnostics.push(...resourceAccess.diagnostics);
      return {
        ...system,
        resourceReads: mergeStringLists(system.resourceReads, resourceAccess.resourceReads),
        resourceWrites: mergeStringLists(system.resourceWrites, resourceAccess.resourceWrites),
        script: {
          ...script,
          ...(resolved.helperImports === undefined || resolved.helperImports.length === 0 ? {} : { helperImports: resolved.helperImports }),
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

function mergeStringLists(left: ReadonlyArray<string> | undefined, right: ReadonlyArray<string>): string[] | undefined {
  const merged = [...new Set([...(left ?? []), ...right])].sort();
  return merged.length === 0 ? left === undefined ? undefined : [] : merged;
}

function resolveScriptModule(
  system: ISystemScriptSource & { script: NonNullable<ISystemScriptSource["script"]> },
  projectPath: string,
): { diagnostics: ICompilerDiagnostic[]; hash?: string; helperImports?: NonNullable<ISystemScriptSource["script"]>["helperImports"]; source?: string } {
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
  const helperImports = resolveHelperImports(system.name, sourceRef.module, sourceRef.export, sourceFile);
  diagnostics.push(...helperImports.diagnostics);
  diagnostics.push(...diagnoseMutableModuleState(system.name, sourceRef.module, sourceRef.export, sourceFile));
  diagnostics.push(...diagnoseModuleLocalReferences(system.name, sourceRef.module, sourceRef.export, sourceFile));
  const exported = extractNamedExport(sourceFile, sourceRef.export);
  diagnostics.push(...diagnoseUntypedScriptContext(system.name, sourceRef.module, sourceRef.export, sourceFile));
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
    helperImports: helperImports.imports,
    hash,
    source: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? undefined : exported,
  };
}

function isInsideProject(projectPath: string, filePath: string): boolean {
  const rel = relative(resolve(projectPath), filePath);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);
}

function resolveHelperImports(
  systemName: string,
  module: string,
  exportName: string,
  sourceFile: ts.SourceFile,
): {
  diagnostics: ICompilerDiagnostic[];
  imports: NonNullable<ISystemScriptSource["script"]>["helperImports"];
} {
  const diagnostics: ICompilerDiagnostic[] = [];
  const imports: Array<{
    imported: string[];
    module: SupportedScriptHelperImport;
  }> = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause?.isTypeOnly === true) {
        continue;
      }
      const specifier = readLiteralSpecifier(statement.moduleSpecifier);
      if (isSupportedScriptHelperImport(specifier)) {
        const imported = runtimeImportedBindingNames(statement);
        diagnostics.push(...diagnoseUnsupportedHelperImportBindings(systemName, module, exportName, specifier, statement, imported));
        if (imported.length > 0) {
          imports.push({
            imported,
            module: specifier,
          });
        }
        continue;
      }
      diagnostics.push(unsupportedHelperImportDiagnostic(systemName, module, exportName, specifier));
      continue;
    }
    if (ts.isImportEqualsDeclaration(statement) || (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined)) {
      const specifier = ts.isExportDeclaration(statement) ? readLiteralSpecifier(statement.moduleSpecifier) : undefined;
      diagnostics.push(unsupportedHelperImportDiagnostic(systemName, module, exportName, specifier));
    }
  }
  return { diagnostics, imports: mergeHelperImports(imports) };
}

function unsupportedHelperImportDiagnostic(systemName: string, module: string, exportName: string, specifier: string | undefined): ICompilerDiagnostic {
  return {
    code: "TN_SCRIPT_UNSUPPORTED_IMPORT",
    file: module,
    fix: prescriptiveFixForCode("TN_SCRIPT_UNSUPPORTED_IMPORT"),
    message: `System '${systemName}' script module imports unsupported helper '${specifier ?? "<unknown>"}'.`,
    path: `systems/${systemName}/script/sourceRef/module`,
    severity: "error",
    suggestion: `Import portable named helpers from ${SUPPORTED_SCRIPT_HELPER_IMPORTS.map((item) => `'${item}'`).join(", ")} or inline deterministic local helpers.`,
    target: exportName,
  };
}

function readLiteralSpecifier(moduleSpecifier: ts.Expression | undefined): string | undefined {
  if (moduleSpecifier !== undefined && ts.isStringLiteralLike(moduleSpecifier)) {
    return moduleSpecifier.text;
  }
  return undefined;
}

function isSupportedScriptHelperImport(specifier: string | undefined): specifier is SupportedScriptHelperImport {
  return (SUPPORTED_SCRIPT_HELPER_IMPORTS as readonly string[]).includes(specifier ?? "");
}

function runtimeImportedBindingNames(statement: ts.ImportDeclaration): string[] {
  const clause = statement.importClause;
  if (clause === undefined || clause.isTypeOnly) {
    return [];
  }
  return [
    ...(clause.name === undefined ? [] : [clause.name.text]),
    ...(clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)
      ? clause.namedBindings.elements.flatMap((element) => element.isTypeOnly ? [] : [element.name.text])
      : []),
  ].sort();
}

function diagnoseUnsupportedHelperImportBindings(
  systemName: string,
  module: string,
  exportName: string,
  helperModule: SupportedScriptHelperImport,
  statement: ts.ImportDeclaration,
  imported: ReadonlyArray<string>,
): ICompilerDiagnostic[] {
  const clause = statement.importClause;
  const supportedBindings = supportedScriptHelperBindings[helperModule];
  if (clause === undefined || clause.isTypeOnly) {
    return [];
  }
  const hasUnsupportedShape =
    clause.name !== undefined ||
    (clause.namedBindings !== undefined && !ts.isNamedImports(clause.namedBindings)) ||
    imported.some((name) => !supportedBindings.has(name)) ||
    (clause.namedBindings !== undefined &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.some((element) => !element.isTypeOnly && element.propertyName !== undefined));
  return hasUnsupportedShape ? [unsupportedHelperImportDiagnostic(systemName, module, exportName, helperModule)] : [];
}

function mergeHelperImports(
  imports: NonNullable<ISystemScriptSource["script"]>["helperImports"],
): NonNullable<ISystemScriptSource["script"]>["helperImports"] {
  const byModule = new Map<SupportedScriptHelperImport, Set<string>>();
  for (const helperImport of imports ?? []) {
    byModule.set(helperImport.module, new Set([...(byModule.get(helperImport.module) ?? []), ...helperImport.imported]));
  }
  return [...byModule.entries()].map(([module, imported]) => ({ imported: [...imported].sort(), module })).sort((left, right) => left.module.localeCompare(right.module));
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

function diagnoseModuleLocalReferences(systemName: string, module: string, exportName: string, sourceFile: ts.SourceFile): ICompilerDiagnostic[] {
  const exportedNode = findNamedExportNode(sourceFile, exportName);
  if (exportedNode === undefined) {
    return [];
  }
  const moduleLocalNames = moduleLocalValueNames(sourceFile, exportName);
  if (moduleLocalNames.size === 0) {
    return [];
  }
  const references = referencedNames(exportedNode, moduleLocalNames);
  return [...references].sort().map((name) => ({
    code: "TN_SCRIPT_MODULE_LOCAL_REFERENCE_UNSUPPORTED",
    file: module,
    fix: prescriptiveFixForCode("TN_SCRIPT_MODULE_LOCAL_REFERENCE_UNSUPPORTED"),
    message: `System '${systemName}' script export '${exportName}' references module-local value '${name}', which is not emitted into scripts.bundle.js.`,
    path: `systems/${systemName}/script/sourceRef/moduleLocals/${name}`,
    severity: "error" as const,
    suggestion: "Inline deterministic helpers and constants inside the exported system function, or use supported portable helper imports.",
    target: exportName,
  }));
}

function diagnoseUntypedScriptContext(systemName: string, module: string, exportName: string, sourceFile: ts.SourceFile): ICompilerDiagnostic[] {
  const exportedNode = findNamedExportNode(sourceFile, exportName);
  const parameter = firstParameter(exportedNode);
  if (parameter?.type === undefined || !isUntypedContextAnnotation(parameter.type, sourceFile)) {
    return [];
  }
  return [
    {
      code: "TN_SCRIPT_UNTYPED_CONTEXT",
      file: module,
      fix: {
        docs: "docs/contracts/scripting-api.md",
        instruction: "Import the portable ScriptContext type from @threenative/script-stdlib and annotate the system context parameter.",
        snippet: `import type { ScriptContext } from "@threenative/script-stdlib";\nexport function ${exportName}(context: ScriptContext): void {\n  // ...\n}`,
      },
      message: `System '${systemName}' script parameter uses an untyped context.`,
      path: `systems/${systemName}/script/sourceRef/context`,
      severity: "info",
      suggestion: "Use ScriptContext to get portable input, time, entity, resource, and query helpers while keeping the emitted script runtime-neutral.",
      target: exportName,
    },
  ];
}

function firstParameter(node: ts.Node | undefined): ts.ParameterDeclaration | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    return node.parameters[0];
  }
  return undefined;
}

function isUntypedContextAnnotation(type: ts.TypeNode, sourceFile: ts.SourceFile): boolean {
  if (type.kind === ts.SyntaxKind.AnyKeyword) {
    return true;
  }
  if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) {
    return false;
  }
  return typeAliasesToAny(sourceFile).has(type.typeName.text);
}

function typeAliasesToAny(sourceFile: ts.SourceFile): Set<string> {
  const aliases = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.type.kind === ts.SyntaxKind.AnyKeyword) {
      aliases.add(statement.name.text);
    }
  }
  return aliases;
}

function moduleLocalValueNames(sourceFile: ts.SourceFile, exportName: string): Set<string> {
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && statement.name.text !== exportName) {
      names.add(statement.name.text);
      continue;
    }
    if (ts.isClassDeclaration(statement) && statement.name !== undefined && statement.name.text !== exportName) {
      names.add(statement.name.text);
      continue;
    }
    if (ts.isEnumDeclaration(statement) && statement.name.text !== exportName) {
      names.add(statement.name.text);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text !== exportName) {
          names.add(declaration.name.text);
        }
      }
    }
  }
  return names;
}

function referencedNames(root: ts.Node, candidates: ReadonlySet<string>): Set<string> {
  const references = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && candidates.has(node.text) && !isDeclarationName(node)) {
      references.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return references;
}

function isDeclarationName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isClassDeclaration(parent) || ts.isClassExpression(parent) || ts.isEnumDeclaration(parent)) &&
    parent.name === node
  ) || (ts.isVariableDeclaration(parent) && parent.name === node) || (ts.isParameter(parent) && parent.name === node);
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

function findNamedExportNode(sourceFile: ts.SourceFile, exportName: string): ts.Node | undefined {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === exportName) {
      return statement;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName && declaration.initializer !== undefined) {
          return declaration.initializer;
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
