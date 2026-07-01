import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { validateAuthoringProject, authoringDiagnostic, type IAuthoringDiagnostic } from "@threenative/authoring";

import { validateProjectRoot } from "./projectApi.js";

export interface IEditorScriptSourceSummary {
  exports: string[];
  path: string;
}

export interface IEditorScriptSourceApiResult {
  body?: string;
  changed?: boolean;
  diagnostics: IAuthoringDiagnostic[];
  ok: boolean;
  path?: string;
  projectRevision?: string;
  scripts?: IEditorScriptSourceSummary[];
}

export async function listEditorScriptSources(options: { projectPath: string; rootPath?: string }): Promise<IEditorScriptSourceApiResult> {
  const guard = validateScriptApiRoot(options.projectPath, options.rootPath);
  if (guard !== undefined) {
    return scriptResult([guard]);
  }
  const root = resolve(options.projectPath, "src", "scripts");
  const scripts = await listScriptFiles(options.projectPath, root);
  return scriptResult([], { scripts });
}

export async function readEditorScriptSource(options: { path: string; projectPath: string; rootPath?: string }): Promise<IEditorScriptSourceApiResult> {
  const guard = validateScriptApiRoot(options.projectPath, options.rootPath) ?? validateScriptPath(options.projectPath, options.path);
  if (guard !== undefined) {
    return scriptResult([guard], { path: options.path });
  }
  const path = normalizeScriptPath(options.projectPath, options.path);
  return scriptResult([], { body: await readFile(resolve(options.projectPath, path), "utf8"), path });
}

export async function writeEditorScriptSource(options: { body: string; path: string; projectPath: string; rootPath?: string }): Promise<IEditorScriptSourceApiResult> {
  const guard = validateScriptApiRoot(options.projectPath, options.rootPath) ?? validateScriptPath(options.projectPath, options.path);
  if (guard !== undefined) {
    return scriptResult([guard], { path: options.path });
  }
  const path = normalizeScriptPath(options.projectPath, options.path);
  await mkdir(dirname(resolve(options.projectPath, path)), { recursive: true });
  await writeFile(resolve(options.projectPath, path), options.body.endsWith("\n") ? options.body : `${options.body}\n`);
  const validation = await validateAuthoringProject({ projectPath: options.projectPath });
  return scriptResult(validation.diagnostics, {
    body: options.body.endsWith("\n") ? options.body : `${options.body}\n`,
    changed: true,
    path,
    projectRevision: `script:${path}:${Date.now().toString(36)}`,
  });
}

export async function scaffoldEditorScriptSource(options: { exportName: string; path: string; projectPath: string; rootPath?: string }): Promise<IEditorScriptSourceApiResult> {
  const guard = validateScriptApiRoot(options.projectPath, options.rootPath)
    ?? validateScriptPath(options.projectPath, options.path)
    ?? validateExportName(options.exportName);
  if (guard !== undefined) {
    return scriptResult([guard], { path: options.path });
  }
  const path = normalizeScriptPath(options.projectPath, options.path);
  const absolute = resolve(options.projectPath, path);
  let body: string;
  try {
    body = await readFile(absolute, "utf8");
    if (!new RegExp(`\\bexport\\s+function\\s+${escapeRegExp(options.exportName)}\\b`).test(body)) {
      body = `${body.trimEnd()}\n\nexport function ${options.exportName}(ctx: unknown): void {\n  void ctx;\n}\n`;
    }
  } catch {
    body = `export function ${options.exportName}(ctx: unknown): void {\n  void ctx;\n}\n`;
  }
  return writeEditorScriptSource({ body, path, projectPath: options.projectPath, rootPath: options.rootPath });
}

function validateScriptApiRoot(projectPath: string, rootPath: string | undefined): IAuthoringDiagnostic | undefined {
  return validateProjectRoot(projectPath, rootPath);
}

function validateScriptPath(projectPath: string, requestedPath: string): IAuthoringDiagnostic | undefined {
  const normalized = normalizeScriptPath(projectPath, requestedPath);
  if (!normalized.startsWith("src/scripts/") || !normalized.endsWith(".ts") || normalized.endsWith(".d.ts")) {
    return scriptDiagnostic("TN_EDITOR_SCRIPT_SOURCE_PATH_UNSUPPORTED", requestedPath, "Script source paths must be project-local src/scripts/**/*.ts files.");
  }
  if (normalized.includes("/dist/") || normalized === "dist/scripts.bundle.js" || normalized.endsWith("/scripts.bundle.js")) {
    return scriptDiagnostic("TN_EDITOR_SCRIPT_GENERATED_SOURCE_REJECTED", requestedPath, "Generated script bundles are not editable source.");
  }
  const absolute = resolve(projectPath, requestedPath);
  const projectRelative = relative(resolve(projectPath), absolute).split("\\").join("/");
  if (projectRelative.startsWith("../") || projectRelative === ".." || projectRelative.startsWith("/")) {
    return scriptDiagnostic("TN_EDITOR_SCRIPT_SOURCE_TRAVERSAL", requestedPath, "Script source paths must stay inside the project.");
  }
  return undefined;
}

function validateExportName(exportName: string): IAuthoringDiagnostic | undefined {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportName)
    ? undefined
    : scriptDiagnostic("TN_EDITOR_SCRIPT_EXPORT_INVALID", exportName, "Script exports must be valid TypeScript identifiers.");
}

function normalizeScriptPath(projectPath: string, requestedPath: string): string {
  return relative(resolve(projectPath), resolve(projectPath, requestedPath)).split("\\").join("/");
}

async function listScriptFiles(projectPath: string, dir: string): Promise<IEditorScriptSourceSummary[]> {
  try {
    const entries = await readdir(dir);
    const results = await Promise.all(entries.map(async (entry) => {
      const absolute = resolve(dir, entry);
      const info = await stat(absolute);
      if (info.isDirectory()) {
        return listScriptFiles(projectPath, absolute);
      }
      const path = relative(resolve(projectPath), absolute).split("\\").join("/");
      if (validateScriptPath(projectPath, path) !== undefined) {
        return [];
      }
      const body = await readFile(absolute, "utf8");
      return [{ exports: exportedFunctions(body), path }];
    }));
    return results.flat().sort((left, right) => left.path.localeCompare(right.path));
  } catch {
    return [];
  }
}

function exportedFunctions(body: string): string[] {
  return [...body.matchAll(/\bexport\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/g)].map((match) => match[1] ?? "").filter(Boolean).sort();
}

function scriptResult(diagnostics: IAuthoringDiagnostic[], result: Partial<IEditorScriptSourceApiResult> = {}): IEditorScriptSourceApiResult {
  return {
    diagnostics,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    ...result,
  };
}

function scriptDiagnostic(code: string, value: unknown, message: string): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code,
    message,
    path: "/path",
    severity: "error",
    suggestion: "Use editor script code mode only for project-local TypeScript behavior modules.",
    value,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
