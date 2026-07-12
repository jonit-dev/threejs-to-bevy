import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { parse } from "dotenv";

export interface IProjectEnvironment {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly envFilePath?: string;
  readonly projectPath: string;
}

export class ProjectEnvironmentError extends Error {
  constructor(
    readonly code: "TN_PROJECT_ENV_FILE_INVALID" | "TN_PROJECT_ENV_FILE_OUTSIDE_PROJECT" | "TN_PROJECT_ENV_FILE_UNREADABLE",
    message: string,
    readonly envFilePath: string,
  ) {
    super(message);
    this.name = "ProjectEnvironmentError";
  }
}

export async function loadProjectEnvironment(options: {
  envFile?: string;
  processEnvironment?: Readonly<Record<string, string | undefined>>;
  projectPath: string;
}): Promise<IProjectEnvironment> {
  const projectPath = resolve(options.projectPath);
  const processEnvironment = options.processEnvironment ?? process.env;
  const projectEnvPath = resolve(projectPath, ".env");
  const explicitEnvPath = resolveEnvFile(projectPath, options.envFile);
  const projectValues = await readOptionalEnvironmentFile(projectEnvPath);
  const explicitValues = explicitEnvPath === undefined ? {} : await readRequiredEnvironmentFile(explicitEnvPath);
  const environment = { ...projectValues, ...explicitValues, ...definedEntries(processEnvironment) };
  const result = { projectPath, envFilePath: explicitEnvPath ?? (projectValues === undefined ? undefined : projectEnvPath) } as IProjectEnvironment;

  // Credentials remain accessible to local tooling, but cannot leak through routine serialization.
  Object.defineProperty(result, "environment", { enumerable: false, value: Object.freeze(environment) });
  return Object.freeze(result);
}

function resolveEnvFile(projectPath: string, envFile: string | undefined): string | undefined {
  if (envFile === undefined) return undefined;
  const envFilePath = resolve(projectPath, envFile);
  if (!isAbsolute(envFile)) {
    const projectRelativePath = relative(projectPath, envFilePath);
    if (projectRelativePath === ".." || projectRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(projectRelativePath)) {
      throw new ProjectEnvironmentError(
        "TN_PROJECT_ENV_FILE_OUTSIDE_PROJECT",
        "Relative --env-file paths must stay inside the selected project.",
        envFilePath,
      );
    }
  }
  return envFilePath;
}

async function readOptionalEnvironmentFile(path: string): Promise<Record<string, string> | undefined> {
  try {
    return await readEnvironmentFile(path);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw normalizeReadError(error, path);
  }
}

async function readRequiredEnvironmentFile(path: string): Promise<Record<string, string>> {
  try {
    return await readEnvironmentFile(path);
  } catch (error) {
    throw normalizeReadError(error, path);
  }
}

async function readEnvironmentFile(path: string): Promise<Record<string, string>> {
  const source = await readFile(path, "utf8");
  validateEnvironmentSyntax(source, path);
  return parse(source);
}

function validateEnvironmentSyntax(source: string, path: string): void {
  let quote: "'" | '"' | undefined;
  for (const line of source.split(/\r?\n/u)) {
    if (quote !== undefined) {
      if (line.includes(quote)) quote = undefined;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*(.*)$/u.exec(trimmed);
    if (match === null) {
      throw new ProjectEnvironmentError("TN_PROJECT_ENV_FILE_INVALID", "The selected environment file contains malformed dotenv syntax.", path);
    }
    const value = match[1]?.trim() ?? "";
    const first = value[0];
    if ((first === "'" || first === '"') && !value.slice(1).includes(first)) quote = first;
  }
  if (quote !== undefined) {
    throw new ProjectEnvironmentError("TN_PROJECT_ENV_FILE_INVALID", "The selected environment file contains an unterminated quoted value.", path);
  }
}

function normalizeReadError(error: unknown, path: string): ProjectEnvironmentError {
  if (error instanceof ProjectEnvironmentError) return error;
  return new ProjectEnvironmentError("TN_PROJECT_ENV_FILE_UNREADABLE", "The selected environment file could not be read.", path);
}

function definedEntries(environment: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
