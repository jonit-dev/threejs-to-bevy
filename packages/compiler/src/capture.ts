import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

import { CompilerError } from "./errors.js";
import { type IProjectConfig } from "./config.js";

export interface ICapturedScene {
  root: unknown;
  summary: {
    rootType: "Scene" | "World";
  };
}

const unsupportedNodeImports = ["fs", "path", "net", "http", "https"];

export async function captureEntry(config: IProjectConfig): Promise<ICapturedScene> {
  const entryPath = resolve(config.projectPath, config.entry);
  const source = await readFile(entryPath, "utf8");

  await assertPortableImports(entryPath, source, config.projectPath);

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: entryPath,
  });

  const tempDir = fileURLToPath(new URL("../.tn/", import.meta.url));
  const tempFile = resolve(tempDir, `capture-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`);
  await mkdir(tempDir, { recursive: true });
  await writeFile(tempFile, transpiled.outputText);

  const module = (await import(`${pathToFileURL(tempFile).href}?v=${Date.now()}`)) as { default?: unknown };
  const root = module.default;

  if (!isSceneRoot(root) && !isWorldRoot(root)) {
    throw new CompilerError("TN_COMPILER_UNSUPPORTED_ROOT", "Entry default export must be a supported SDK Scene or World root.");
  }

  return {
    root,
    summary: {
      rootType: isWorldRoot(root) ? "World" : "Scene",
    },
  };
}

async function assertPortableImports(filePath: string, source: string, projectPath: string, visited = new Set<string>()): Promise<void> {
  if (visited.has(filePath)) {
    return;
  }
  visited.add(filePath);
  const specifiers = readImportSpecifiers(source, filePath);
  if (specifiers.some(isUnsupportedImport)) {
    throw new CompilerError("TN_COMPILER_UNSUPPORTED_IMPORT", "Entries must import supported SDK APIs, not runtime adapter or platform APIs.", {
      code: "TN_COMPILER_UNSUPPORTED_IMPORT",
      file: filePath,
      message: "Entries must import supported SDK APIs, not runtime adapter or platform APIs.",
      path: relativePath(projectPath, filePath),
      severity: "error",
      suggestion: "Move gameplay behavior into portable SDK systems and avoid runtime, DOM, filesystem, or network imports.",
    });
  }

  for (const specifier of specifiers.filter((item) => item.startsWith("."))) {
    const importedPath = await resolveRelativeImport(filePath, specifier);
    if (importedPath === undefined) {
      continue;
    }
    await assertPortableImports(importedPath, await readFile(importedPath, "utf8"), projectPath, visited);
  }
}

function readImportSpecifiers(source: string, filePath: string): string[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
      const specifier = readLiteralSpecifier(node.moduleSpecifier);
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
      return;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = readLiteralSpecifier(node.arguments[0]);
      if (specifier !== undefined) {
        specifiers.push(specifier);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function readLiteralSpecifier(node: ts.Node | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function isUnsupportedImport(specifier: string): boolean {
  return (
    specifier === "three" ||
    specifier.startsWith("three/") ||
    specifier === "@react-three/fiber" ||
    specifier.startsWith("@react-three/fiber/") ||
    specifier.startsWith("@threenative/runtime-") ||
    specifier.startsWith("node:") ||
    unsupportedNodeImports.some((name) => specifier === name || specifier.startsWith(`${name}/`))
  );
}

async function resolveRelativeImport(filePath: string, specifier: string): Promise<string | undefined> {
  const basePath = resolve(dirname(filePath), specifier);
  const candidates =
    extname(basePath) === ""
      ? [`${basePath}.ts`, `${basePath}.tsx`, `${basePath}.js`, resolve(basePath, "index.ts")]
      : nodeNextSourceCandidates(basePath);
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function nodeNextSourceCandidates(path: string): string[] {
  if (path.endsWith(".js")) {
    const withoutExtension = path.slice(0, -3);
    return [path, `${withoutExtension}.ts`, `${withoutExtension}.tsx`];
  }
  return [path];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function relativePath(projectPath: string, filePath: string): string {
  return filePath.startsWith(projectPath) ? filePath.slice(projectPath.length + 1) : filePath;
}

export function isSceneRoot(value: unknown): boolean {
  return typeof value === "object" && value !== null && value.constructor.name === "Scene";
}

export function isWorldRoot(value: unknown): boolean {
  return typeof value === "object" && value !== null && value.constructor.name === "World";
}
