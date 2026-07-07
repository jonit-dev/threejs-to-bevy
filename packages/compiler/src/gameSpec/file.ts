import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { formatAuthoringDocument } from "@threenative/authoring";
import type { ITypedGameSpec } from "@threenative/sdk";
import ts from "typescript";

import { CompilerError } from "../errors.js";
import { compileTypedGameSpec } from "./compile.js";

export interface ICompileTypedGameSpecFileOptions {
  entry?: string;
  projectPath: string;
}

export interface ICompileTypedGameSpecFileResult {
  documents: Array<{ kind: string; path: string }>;
  entry: string;
}

export async function compileTypedGameSpecFile(options: ICompileTypedGameSpecFileOptions): Promise<ICompileTypedGameSpecFileResult> {
  const entry = options.entry ?? "src/game.spec.ts";
  const entryPath = resolve(options.projectPath, entry);
  const spec = await loadTypedGameSpec(entryPath, options.projectPath);
  const documents = compileTypedGameSpec(spec, { projectPath: options.projectPath, sourcePath: normalizePath(relative(options.projectPath, entryPath)) });

  for (const document of documents) {
    await mkdir(dirname(document.file), { recursive: true });
    await writeFile(document.file, formatAuthoringDocument(document.data), "utf8");
  }

  return {
    documents: documents.map((document) => ({ kind: document.kind, path: document.projectRelativePath })),
    entry: normalizePath(relative(options.projectPath, entryPath)),
  };
}

async function loadTypedGameSpec(entryPath: string, projectPath: string): Promise<ITypedGameSpec> {
  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const tempRoot = await mkdtemp(resolve(packageRoot, `.tn-typed-spec-${Date.now()}-`));
  try {
    const sources = await collectRelativeImportGraph(entryPath, projectPath);
    for (const [sourcePath, source] of sources) {
      const outputPath = outputPathForSource(sourcePath, projectPath, tempRoot);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, transpileSource(source, sourcePath, projectPath, tempRoot), "utf8");
    }
    const tempFile = outputPathForSource(entryPath, projectPath, tempRoot);
    const module = await import(`${pathToFileURL(tempFile).href}?v=${Date.now()}`) as { default?: unknown };
    if (!isTypedGameSpec(module.default)) {
      throw new CompilerError("TN_TYPED_SPEC_INVALID_EXPORT", "Typed game spec entry must default export defineTypedGameSpec(...).");
    }
    return module.default;
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
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
    for (const specifier of readModuleSpecifiers(source, filePath).filter((item) => item.value.startsWith("."))) {
      const importedPath = await resolveRelativeImport(filePath, specifier.value);
      if (importedPath !== undefined && isInsideProject(projectPath, importedPath)) {
        await visit(importedPath);
      }
    }
  };
  await visit(entryPath);
  return sources;
}

function transpileSource(source: string, sourcePath: string, projectPath: string, tempRoot: string): string {
  const rewrittenSource = rewriteRelativeModuleSpecifiers(source, sourcePath, projectPath, tempRoot);
  return ts.transpileModule(rewrittenSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
    fileName: sourcePath,
  }).outputText;
}

async function resolveRelativeImport(fromFile: string, specifier: string): Promise<string | undefined> {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, resolve(base, "index.ts")];
  for (const candidate of candidates) {
    try {
      await readFile(candidate, "utf8");
      return candidate;
    } catch {
      // Try the next TypeScript/JavaScript resolution candidate.
    }
  }
  return undefined;
}

function outputPathForSource(sourcePath: string, projectPath: string, tempRoot: string): string {
  const relativeSource = relative(projectPath, sourcePath);
  const withoutExtension = relativeSource.replace(/\.[^.]+$/, "");
  return resolve(tempRoot, `${withoutExtension}.js`);
}

interface IModuleSpecifier {
  end: number;
  start: number;
  value: string;
}

function readModuleSpecifiers(source: string, sourcePath: string): IModuleSpecifier[] {
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifiers: IModuleSpecifier[] = [];

  for (const statement of sourceFile.statements) {
    if ((ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier !== undefined
      && ts.isStringLiteral(statement.moduleSpecifier)) {
      specifiers.push({
        end: statement.moduleSpecifier.end,
        start: statement.moduleSpecifier.getStart(sourceFile),
        value: statement.moduleSpecifier.text,
      });
    }
  }

  return specifiers;
}

function rewriteRelativeModuleSpecifiers(source: string, sourcePath: string, projectPath: string, tempRoot: string): string {
  const replacements = readModuleSpecifiers(source, sourcePath)
    .filter((specifier) => specifier.value.startsWith("."))
    .map((specifier) => {
      const importedPath = resolveRelativeImportSync(sourcePath, specifier.value);
      if (importedPath === undefined || !isInsideProject(projectPath, importedPath)) {
        return undefined;
      }
      const importOutputPath = outputPathForSource(importedPath, projectPath, tempRoot);
      const sourceOutputPath = outputPathForSource(sourcePath, projectPath, tempRoot);
      return {
        end: specifier.end,
        start: specifier.start,
        value: JSON.stringify(toRelativeModuleSpecifier(dirname(sourceOutputPath), importOutputPath)),
      };
    })
    .filter((replacement): replacement is { end: number; start: number; value: string } => replacement !== undefined)
    .sort((left, right) => right.start - left.start);

  let rewritten = source;
  for (const replacement of replacements) {
    rewritten = `${rewritten.slice(0, replacement.start)}${replacement.value}${rewritten.slice(replacement.end)}`;
  }
  return rewritten;
}

function resolveRelativeImportSync(fromFile: string, specifier: string): string | undefined {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, resolve(base, "index.ts")];
  for (const candidate of candidates) {
    if (ts.sys.fileExists(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function toRelativeModuleSpecifier(fromDir: string, toFile: string): string {
  const path = normalizePath(relative(fromDir, toFile));
  return path.startsWith(".") ? path : `./${path}`;
}

function isInsideProject(projectPath: string, filePath: string): boolean {
  const relativeSource = relative(projectPath, filePath);
  return relativeSource === "" || (!relativeSource.startsWith("..") && !isAbsolute(relativeSource));
}

function isTypedGameSpec(value: unknown): value is ITypedGameSpec {
  return typeof value === "object"
    && value !== null
    && Array.isArray((value as { scenes?: unknown }).scenes);
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
