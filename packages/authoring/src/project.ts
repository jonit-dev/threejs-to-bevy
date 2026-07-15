import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { classifyAuthoringDocumentPath, readAuthoringJsonDocument, type IAuthoringDocument, normalizeRelativePath } from "./documents.js";
import { sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";

export interface IAuthoringProject {
  projectPath: string;
  documents: IAuthoringDocument[];
  diagnostics: IAuthoringDiagnostic[];
}

export interface ILoadAuthoringProjectOptions {
  onRead?: (projectRelativePath: string) => void;
  projectPath: string;
}

export async function loadAuthoringProject(options: ILoadAuthoringProjectOptions): Promise<IAuthoringProject> {
  const projectPath = resolve(options.projectPath);
  const candidateFiles = await discoverAuthoringFiles(projectPath);
  const documents: IAuthoringDocument[] = [];
  const diagnostics: IAuthoringDiagnostic[] = [];

  for (const file of candidateFiles) {
    options.onRead?.(file);
    const result = await readAuthoringJsonDocument(projectPath, file);
    diagnostics.push(...result.diagnostics);
    if (result.document !== undefined) {
      documents.push(result.document);
    }
  }

  return {
    projectPath,
    documents: documents.sort((left, right) => left.projectRelativePath.localeCompare(right.projectRelativePath)),
    diagnostics: sortAuthoringDiagnostics(diagnostics),
  };
}

export async function discoverAuthoringFiles(projectPath: string): Promise<string[]> {
  const roots = ["threenative.authoring.json", "content", "src"];
  const discovered: string[] = [];

  for (const root of roots) {
    const absoluteRoot = resolve(projectPath, root);
    discovered.push(...(await discoverJsonFiles(projectPath, absoluteRoot)));
  }

  return [...new Set(discovered)].sort();
}

async function discoverJsonFiles(projectPath: string, absolutePath: string): Promise<string[]> {
  const relativePath = normalizeRelativePath(absolutePath.slice(projectPath.length + 1));
  if (relativePath === "threenative.authoring.json") {
    try {
      await readdir(absolutePath);
      return [];
    } catch (error) {
      if (isDirectoryReadError(error)) {
        return [relativePath];
      }
      return [];
    }
  }

  let entries;
  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const child = resolve(absolutePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverJsonFiles(projectPath, child)));
    } else if (entry.isFile()) {
      const projectRelativeChild = normalizeRelativePath(child.slice(projectPath.length + 1));
      if (classifyAuthoringDocumentPath(projectRelativeChild) !== "unknown") files.push(projectRelativeChild);
    }
  }
  return files;
}

function isDirectoryReadError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "ENOTDIR";
}
