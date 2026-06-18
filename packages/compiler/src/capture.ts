import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { captureScene, isR3fElement, R3fCaptureError } from "@threenative/r3f";
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
const unsupportedBrowserGlobals = ["document", "localStorage", "navigator", "window"];
const dynamicRequireSpecifier = "node:dynamic-require";

export async function captureEntry(config: IProjectConfig): Promise<ICapturedScene> {
  const entryPath = resolve(config.projectPath, config.entry);
  const source = await readFile(entryPath, "utf8");

  await assertPortableImports(entryPath, source, config.projectPath);

  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const tempRoot = await mkdtemp(resolve(packageRoot, captureTempPrefix(config.projectPath)));
  try {
    await writeTranspiledProjectGraph(entryPath, config.projectPath, tempRoot);
    const tempFile = outputPathForSource(entryPath, config.projectPath, tempRoot);

    const module = (await import(`${pathToFileURL(tempFile).href}?v=${Date.now()}`)) as { default?: unknown };
    const root = captureRoot(module.default, entryPath, config.projectPath);

    if (!isSceneRoot(root) && !isWorldRoot(root) && !isBundleRoot(root)) {
      throw new CompilerError("TN_COMPILER_UNSUPPORTED_ROOT", "Entry default export must be a supported SDK Scene or World root.");
    }

    return {
      root,
      summary: {
        rootType: isWorldRoot(root) || (isBundleRoot(root) && (isWorldRoot(root.world) || "scenes" in root)) ? "World" : "Scene",
      },
    };
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
}

function captureTempPrefix(projectPath: string): string {
  return `.tn-capture-${basename(projectPath).replace(/[^A-Za-z0-9._-]/g, "_")}-`;
}

async function writeTranspiledProjectGraph(entryPath: string, projectPath: string, tempRoot: string): Promise<void> {
  const sources = await collectRelativeImportGraph(entryPath, projectPath);
  for (const [sourcePath, source] of sources) {
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "@threenative/r3f",
        module: ts.ModuleKind.ES2022,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
      fileName: sourcePath,
    });
    const outputPath = outputPathForSource(sourcePath, projectPath, tempRoot);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transpiled.outputText);
  }
}

async function collectRelativeImportGraph(entryPath: string, projectPath: string): Promise<Map<string, string>> {
  const sources = new Map<string, string>();
  const visit = async (filePath: string): Promise<void> => {
    if (sources.has(filePath)) {
      return;
    }
    const source = await readFile(filePath, "utf8");
    sources.set(filePath, source);
    for (const specifier of readImportSpecifiers(source, filePath).filter((item) => item.startsWith("."))) {
      const importedPath = await resolveRelativeImport(filePath, specifier);
      if (importedPath !== undefined && isInsideProject(projectPath, importedPath)) {
        await visit(importedPath);
      }
    }
  };
  await visit(entryPath);
  return sources;
}

function outputPathForSource(sourcePath: string, projectPath: string, tempRoot: string): string {
  const relativeSource = relative(projectPath, sourcePath);
  const withoutExtension = relativeSource.replace(/\.[^.]+$/, "");
  return resolve(tempRoot, `${withoutExtension}.js`);
}

function isInsideProject(projectPath: string, filePath: string): boolean {
  const relativeSource = relative(projectPath, filePath);
  return relativeSource === "" || (!relativeSource.startsWith("..") && !isAbsolute(relativeSource));
}

function captureRoot(root: unknown, entryPath: string, projectPath: string): unknown {
  if (isR3fElement(root)) {
    return captureR3fRoot(root, entryPath, projectPath);
  }
  if (isBundleRoot(root) && isR3fElement(root.scene)) {
    return {
      ...root,
      scene: captureR3fRoot(root.scene, entryPath, projectPath),
    };
  }
  return root;
}

async function assertPortableImports(filePath: string, source: string, projectPath: string, visited = new Set<string>()): Promise<void> {
  if (visited.has(filePath)) {
    return;
  }
  visited.add(filePath);
  const specifiers = readImportSpecifiers(source, filePath);
  const unsupportedR3fImport = specifiers.find(isUnsupportedR3fImport);
  if (unsupportedR3fImport !== undefined) {
    throw new CompilerError("TN_COMPILER_R3F_UNSUPPORTED_JSX", `Unsupported portable JSX import '${unsupportedR3fImport}'.`, {
      code: "TN_COMPILER_R3F_UNSUPPORTED_JSX",
      file: filePath,
      message: `Unsupported portable JSX import '${unsupportedR3fImport}'.`,
      path: relativePath(projectPath, filePath),
      severity: "error",
      suggestion: "Use the constrained @threenative/r3f JSX components or direct SDK authoring APIs.",
    });
  }
  const browserGlobal = isR3fSource(filePath, specifiers) ? readBrowserGlobal(source, filePath) : undefined;
  if (browserGlobal !== undefined) {
    throw new CompilerError("TN_COMPILER_R3F_BROWSER_API", `Portable scene capture cannot reference browser global '${browserGlobal}'.`, {
      code: "TN_COMPILER_R3F_BROWSER_API",
      file: filePath,
      message: `Portable scene capture cannot reference browser global '${browserGlobal}'.`,
      path: relativePath(projectPath, filePath),
      severity: "error",
      suggestion: "Move browser-specific behavior into a runtime adapter boundary or replace it with portable SDK data.",
    });
  }
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
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true, sourceKind(filePath));
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
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
      const specifier = readLiteralSpecifier(node.arguments[0]);
      specifiers.push(specifier ?? dynamicRequireSpecifier);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

function readBrowserGlobal(source: string, filePath: string): string | undefined {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.ES2022, true, sourceKind(filePath));
  let found: string | undefined;

  function visit(node: ts.Node): void {
    if (found !== undefined) {
      return;
    }
    if (ts.isIdentifier(node) && unsupportedBrowserGlobals.includes(node.text) && !isPropertyName(node)) {
      found = node.text;
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function isPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isShorthandPropertyAssignment(parent) && parent.name === node)
  );
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

function isUnsupportedR3fImport(specifier: string): boolean {
  return (
    specifier === "@react-three/drei" ||
    specifier.startsWith("@react-three/drei/") ||
    specifier === "react" ||
    specifier.startsWith("react/")
  );
}

function isR3fSource(filePath: string, specifiers: readonly string[]): boolean {
  return filePath.endsWith(".tsx") || specifiers.some((specifier) => specifier === "@threenative/r3f" || specifier.startsWith("@threenative/r3f/"));
}

function sourceKind(filePath: string): ts.ScriptKind {
  return filePath.endsWith(".tsx") || filePath.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function captureR3fRoot(root: Parameters<typeof captureScene>[0], filePath: string, projectPath: string): unknown {
  try {
    return captureScene(root);
  } catch (error) {
    if (error instanceof R3fCaptureError) {
      throw new CompilerError(error.code, error.message, {
        code: error.code,
        file: filePath,
        message: error.message,
        path: relativePath(projectPath, filePath),
        severity: "error",
        suggestion: error.suggestion,
      });
    }
    throw error;
  }
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

function isBundleRoot(value: unknown): value is { initialScene?: unknown; scene?: unknown; scenes?: unknown; world?: unknown } {
  return typeof value === "object" && value !== null && ("scene" in value || "world" in value || "scenes" in value || "initialScene" in value);
}
