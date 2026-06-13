import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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

const unsupportedImportPattern = /from\s+["'](?:three|@react-three\/fiber)["']/;

export async function captureEntry(config: IProjectConfig): Promise<ICapturedScene> {
  const entryPath = resolve(config.projectPath, config.entry);
  const source = await readFile(entryPath, "utf8");

  if (unsupportedImportPattern.test(source)) {
    throw new CompilerError("TN_COMPILER_UNSUPPORTED_IMPORT", "V1 entries must import supported SDK APIs, not Three.js runtimes.");
  }

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

export function isSceneRoot(value: unknown): boolean {
  return typeof value === "object" && value !== null && value.constructor.name === "Scene";
}

export function isWorldRoot(value: unknown): boolean {
  return typeof value === "object" && value !== null && value.constructor.name === "World";
}
