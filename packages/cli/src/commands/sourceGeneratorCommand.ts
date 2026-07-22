import {
  applyAuthoringBatch,
  AUTHORING_BATCH_SCHEMA,
  AUTHORING_BATCH_VERSION,
  authoringDiagnostic,
  normalizeRelativePath,
  readAuthoringJsonDocument,
  recordBlenderGenerator,
  recordGeneratorProvenance,
  writeAuthoringJsonDocument,
  type AuthoringOperationName,
  type IAuthoringDiagnostic,
  type IAuthoringDocument,
} from "@threenative/authoring";
import {
  AuthoringClientProject,
  AuthoringClientTransaction,
  type IAuthoringClientCommitOptions,
  type IAuthoringClientTransactionResult,
} from "@threenative/authoring-client";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

import { type ICommandResult } from "../diagnostics.js";
import { findAssetGenerationProvider, type IAssetGenerationProviderRunResult } from "../assetGenerationProviders/registry.js";
import type { IBlenderGeneratorDependencies } from "../blender/runBlenderGenerator.js";
import type { IRunImg2ThreejsGeneratorDependencies, IRunImg2ThreejsGeneratorResult } from "../img2threejs/runImg2ThreejsGenerator.js";
import {
  normalizeArgv,
  readCsvFlag,
  readFlag,
  readPositional,
  renderAuthoringResult,
  renderUsage,
  resolveProjectPath,
  type ISourceCommandOptions,
} from "./sourceCommandUtils.js";

export interface IGeneratorCommandOptions extends ISourceCommandOptions {
  blenderDependencies?: Partial<IBlenderGeneratorDependencies>;
  img2ThreejsDependencies?: IRunImg2ThreejsGeneratorDependencies;
  img2ThreejsRunner?: (projectPath: string, generatorId: string, dependencies?: IRunImg2ThreejsGeneratorDependencies) => Promise<IRunImg2ThreejsGeneratorResult>;
}

export async function generatorCommand(argv: readonly string[], options: IGeneratorCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = normalizeArgv(argv);
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
  const generatorId = readPositional(normalizedArgv, 1);

  if (subcommand === "record") {
    const modulePath = readFlag(normalizedArgv, "--module");
    const exportName = readFlag(normalizedArgv, "--export");
    const outputs = readCsvFlag(normalizedArgv, "--outputs");
    if (generatorId === undefined || modulePath === undefined || exportName === undefined || outputs === undefined || outputs.length === 0) {
      return renderUsage(json, "TN_GENERATOR_RECORD_ARGS_MISSING", generatorRecordUsage());
    }
    return renderAuthoringResult(
      "generator",
      await recordGeneratorProvenance({
        exportName,
        generatorId,
        inputHash: readFlag(normalizedArgv, "--input-hash"),
        modulePath,
        outputHash: readFlag(normalizedArgv, "--output-hash"),
        outputs,
        overwritePolicy: readFlag(normalizedArgv, "--overwrite-policy"),
        projectPath,
      }),
      json,
      `Generator provenance '${generatorId}' recorded.`,
    );
  }

  if (subcommand === "record-blender") {
    const recipeInput = readFlag(normalizedArgv, "--recipe");
    if (generatorId === undefined || recipeInput === undefined) return renderUsage(json, "TN_GENERATOR_RECORD_BLENDER_ARGS_MISSING", generatorRecordBlenderUsage());
    let recipe: Record<string, unknown> | undefined;
    if (recipeInput.trimStart().startsWith("{")) {
      try {
        const parsed = JSON.parse(recipeInput) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("recipe JSON must be an object");
        recipe = parsed as Record<string, unknown>;
      } catch (error) {
        return renderUsage(json, "TN_GENERATOR_RECORD_BLENDER_RECIPE_INVALID", `Invalid inline recipe: ${error instanceof Error ? error.message : String(error)}\n${generatorRecordBlenderUsage()}`);
      }
    }
    return renderAuthoringResult("generator", await recordBlenderGenerator({
      generatorId,
      output: readFlag(normalizedArgv, "--out") ?? `assets/generated/${generatorId}.glb`,
      overwritePolicy: readFlag(normalizedArgv, "--overwrite-policy") ?? "manual",
      projectPath,
      providerVersion: "4.5.11",
      ...(recipe === undefined ? { recipePath: recipeInput } : { recipe }),
    }), json, `Blender generator '${generatorId}' recorded.`);
  }

  if (subcommand === "run") {
    if (generatorId === undefined) {
      return renderUsage(json, "TN_GENERATOR_RUN_ARGS_MISSING", generatorRunUsage());
    }
    return runGenerator({ blenderDependencies: options.blenderDependencies, generatorId, img2ThreejsDependencies: options.img2ThreejsDependencies, img2ThreejsRunner: options.img2ThreejsRunner, json, projectPath });
  }

  return renderUsage(json, "TN_GENERATOR_COMMAND_UNKNOWN", generatorUsage());
}

interface IGeneratorDocumentData {
  export: string;
  id: string;
  inputHash?: string;
  lastRun?: Record<string, unknown>;
  module: string;
  outputHash?: string;
  outputs: string[];
  overwritePolicy?: string;
  schema: string;
  version: string;
  provider?: "typescript";
}

interface IRunGeneratorOptions {
  blenderDependencies?: Partial<IBlenderGeneratorDependencies>;
  generatorId: string;
  img2ThreejsDependencies?: IRunImg2ThreejsGeneratorDependencies;
  img2ThreejsRunner?: (projectPath: string, generatorId: string, dependencies?: IRunImg2ThreejsGeneratorDependencies) => Promise<IRunImg2ThreejsGeneratorResult>;
  json: boolean;
  projectPath: string;
}

interface IGeneratorRunPayload {
  diagnostics: IAuthoringDiagnostic[];
  filesWritten?: string[];
  generatorId: string;
  inputHash?: string;
  lastRun?: Record<string, unknown>;
  ok: boolean;
  operationResults?: IAuthoringClientTransactionResult["operationResults"];
  operations?: IAuthoringClientTransactionResult["operations"];
  outputHash?: string;
  projectPath: string;
}

async function runGenerator(options: IRunGeneratorOptions): Promise<ICommandResult> {
  const startedAt = new Date().toISOString();
  const generatorFile = `content/generators/${options.generatorId}.generator.json`;
  const readResult = await readAuthoringJsonDocument(options.projectPath, generatorFile);
  if (readResult.document === undefined || readResult.diagnostics.length > 0) {
    return renderGeneratorRunResult(options.json, {
      diagnostics: readResult.diagnostics,
      generatorId: options.generatorId,
      ok: false,
      projectPath: options.projectPath,
    });
  }

  const generator = readResult.document.data as Partial<IGeneratorDocumentData>;
  const provider = typeof (generator as { provider?: unknown }).provider === "string" ? findAssetGenerationProvider((generator as { provider: string }).provider) : undefined;
  if (provider !== undefined) {
    const providerResult = await provider.runGenerator({
      blenderDependencies: options.blenderDependencies,
      generatorId: options.generatorId,
      img2ThreejsDependencies: options.img2ThreejsDependencies,
      img2ThreejsRunner: options.img2ThreejsRunner,
      projectPath: options.projectPath,
    });
    return renderLocalGeneratorRunResult(options.json, providerResult);
  }
  const generatorDiagnostics = validateGeneratorRunDocument(generator, generatorFile);
  if (generatorDiagnostics.length > 0) {
    return renderGeneratorRunResult(options.json, {
      diagnostics: generatorDiagnostics,
      generatorId: options.generatorId,
      ok: false,
      projectPath: options.projectPath,
    });
  }

  const generatorData = generator as IGeneratorDocumentData;
  const modulePathResult = resolveGeneratorModulePath(options.projectPath, generatorData.module);
  if (modulePathResult.diagnostic !== undefined) {
    return renderGeneratorRunResult(options.json, {
      diagnostics: [modulePathResult.diagnostic],
      generatorId: options.generatorId,
      ok: false,
      projectPath: options.projectPath,
    });
  }

  const conflictDiagnostics = await validateGeneratorOutputConflicts(options.projectPath, generatorData);
  if (conflictDiagnostics.length > 0) {
    return renderGeneratorRunResult(options.json, {
      diagnostics: conflictDiagnostics,
      generatorId: options.generatorId,
      ok: false,
      projectPath: options.projectPath,
    });
  }

  const inputHash = await hashFile(modulePathResult.absolutePath);
  const tempDir = await mkdtemp(join(tmpdir(), "tn-generator-run-"));
  try {
    const moduleUrl = await compileGeneratorModule(modulePathResult.absolutePath, tempDir, generatorData.id);
    const moduleExports = await import(moduleUrl);
    const generatorExport = moduleExports[generatorData.export] as unknown;
    if (typeof generatorExport !== "function") {
      return renderGeneratorRunResult(options.json, {
        diagnostics: [
          authoringDiagnostic({
            code: "TN_GENERATOR_EXPORT_INVALID",
            file: generatorData.module,
            message: `Generator module '${generatorData.module}' must export function '${generatorData.export}'.`,
            path: "/export",
            suggestion: "Export a function that receives { project } and returns an authoring-client commit result.",
          }),
        ],
        generatorId: options.generatorId,
        inputHash,
        ok: false,
        projectPath: options.projectPath,
      });
    }

    const result = await generatorExport({
      generatorId: options.generatorId,
      project: openGeneratorProject(options.projectPath, options.generatorId),
      projectPath: options.projectPath,
    });
    if (!isAuthoringClientTransactionResult(result)) {
      return renderGeneratorRunResult(options.json, {
        diagnostics: [
          authoringDiagnostic({
            code: "TN_GENERATOR_RESULT_INVALID",
            file: generatorData.module,
            message: `Generator '${options.generatorId}' must return an authoring-client commit result.`,
            suggestion: "Return await project.transaction().operation(...).commit() or a scene builder commit result.",
          }),
        ],
        generatorId: options.generatorId,
        inputHash,
        ok: false,
        projectPath: options.projectPath,
      });
    }

    const outputDiagnostics = await validateGeneratorOutputsExist(options.projectPath, generatorData.outputs);
    const outputHash = await hashOutputFiles(options.projectPath, generatorData.outputs);
    const completedAt = new Date().toISOString();
    const diagnostics = [...result.diagnostics, ...outputDiagnostics];
    const ok = result.ok && outputDiagnostics.length === 0;
    const generatedFilesWritten = result.filesWritten.filter((file) => generatorData.outputs.includes(file));
    const lastRun = {
      completedAt,
      diagnostics,
      filesWritten: generatedFilesWritten,
      inputHash,
      ok,
      operations: result.operations,
      outputHash,
      startedAt,
    };
    await writeGeneratorRunProvenance(readResult.document, { inputHash, lastRun, outputHash });
    return renderGeneratorRunResult(options.json, {
      diagnostics,
      filesWritten: generatedFilesWritten,
      generatorId: options.generatorId,
      inputHash,
      lastRun,
      ok,
      operationResults: result.operationResults,
      operations: result.operations,
      outputHash,
      projectPath: options.projectPath,
    });
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

class GeneratorAuthoringClientProject extends AuthoringClientProject {
  constructor(projectPath: string, private readonly generatorId: string) {
    super(projectPath);
  }

  override transaction(): AuthoringClientTransaction {
    return new GeneratorAuthoringClientTransaction(this.projectPath, this.generatorId);
  }
}

class GeneratorAuthoringClientTransaction extends AuthoringClientTransaction {
  constructor(projectPath: string, private readonly generatorId: string) {
    super(projectPath);
  }

  override async commit(options: IAuthoringClientCommitOptions = {}): Promise<IAuthoringClientTransactionResult> {
    const batchResult = await applyAuthoringBatch({
      batch: {
        id: "authoring-client-generator-transaction",
        operations: this.operations.map(({ args, name }) => ({ args, name: name as AuthoringOperationName })),
        schema: AUTHORING_BATCH_SCHEMA,
        version: AUTHORING_BATCH_VERSION,
      },
      owner: { generatorId: this.generatorId, kind: "generator" },
      projectPath: this.projectPath,
      stopOnError: options.stopOnError,
    });
    return {
      changed: batchResult.changed,
      committed: batchResult.committed,
      diagnostics: batchResult.diagnostics,
      filesCreated: batchResult.filesCreated,
      filesDeleted: batchResult.filesDeleted,
      filesModified: batchResult.filesModified,
      filesWritten: batchResult.filesWritten,
      ok: batchResult.ok,
      operationResults: batchResult.operationResults.map((entry) => ({
        result: entry.result,
        trace: this.operations[entry.index]!,
      })),
      operations: this.operations.map((operation) => ({ ...operation, args: structuredClone(operation.args) })),
      planHash: batchResult.planHash,
      projectPath: this.projectPath,
      recovered: batchResult.recovered,
      ...(batchResult.stoppedAt === undefined ? {} : { stoppedAt: batchResult.stoppedAt }),
      transactionId: batchResult.transactionId,
    };
  }
}

function openGeneratorProject(projectPath: string, generatorId: string): GeneratorAuthoringClientProject {
  return new GeneratorAuthoringClientProject(projectPath, generatorId);
}

function renderLocalGeneratorRunResult(json: boolean, payload: IAssetGenerationProviderRunResult): ICommandResult {
  const generatedGlb = payload.filesWritten.find((file) => file.endsWith(".glb")) ?? "<generated.glb>";
  const result = {
    ...payload,
    code: payload.ok ? "TN_GENERATOR_RUN_OK" : "TN_GENERATOR_RUN_FAILED",
    command: "generator run",
    message: payload.ok ? `Generator '${payload.generatorId}' ran.` : `Generator '${payload.generatorId}' failed.`,
    nextCommands: payload.ok ? [`tn asset inspect ${generatedGlb} --json`, `tn model-test ${generatedGlb} --angles 0,90,180,270 --json`, "tn build"] : undefined,
  };
  if (json) return { exitCode: payload.ok ? 0 : 1, stdout: `${JSON.stringify(result, null, 2)}\n` };
  if (payload.ok) return { exitCode: 0, stdout: `${result.message}\n` };
  return { exitCode: 1, stderr: `${result.message}\n${payload.diagnostics.map((row) => `${row.code} ${row.file ?? ""}: ${row.message}`).join("\n")}\n`, stdout: "" };
}

function renderGeneratorRunResult(json: boolean, payload: IGeneratorRunPayload): ICommandResult {
  const result = {
    code: payload.ok ? "TN_GENERATOR_RUN_OK" : "TN_GENERATOR_RUN_FAILED",
    message: payload.ok ? `Generator '${payload.generatorId}' ran.` : `Generator '${payload.generatorId}' failed.`,
    ...payload,
  };
  if (json) {
    return { exitCode: payload.ok ? 0 : 1, stdout: `${JSON.stringify(result, null, 2)}\n` };
  }
  if (payload.ok) {
    return { exitCode: 0, stdout: `${result.message}\n` };
  }
  const diagnostics = payload.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return { exitCode: 1, stderr: `${result.message}\n${diagnostics}\n`, stdout: "" };
}

function generatorRecordUsage(): string {
  return "Usage: tn generator record <generator-id> --module <path> --export <name> --outputs <path,path> [--overwrite-policy skip|replace|manual] [--input-hash <hash>] [--output-hash <hash>] [--project <path>] [--json]";
}

function generatorRunUsage(): string {
  return "Usage: tn generator run <generator-id> [--project <path>] [--json]";
}

function generatorRecordBlenderUsage(): string {
  return "Usage: tn generator record-blender <generator-id> --recipe <path-or-json> [--out <assets/generated/id.glb>] [--overwrite-policy manual|replace|skip] [--project <path>] [--json]";
}

function generatorUsage(): string {
  return `${generatorRecordUsage()}\n       ${generatorRecordBlenderUsage()}\n       ${generatorRunUsage()}`;
}

function validateGeneratorRunDocument(data: Partial<IGeneratorDocumentData>, file: string): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (typeof data.id !== "string" || data.id.length === 0) {
    diagnostics.push(authoringDiagnostic({ code: "TN_GENERATOR_ID_INVALID", file, message: "Generator provenance id must be a non-empty string.", path: "/id" }));
  }
  if (typeof data.module !== "string" || data.module.length === 0) {
    diagnostics.push(authoringDiagnostic({ code: "TN_GENERATOR_MODULE_INVALID", file, message: "Generator module must be a non-empty source path.", path: "/module" }));
  }
  if (typeof data.export !== "string" || data.export.length === 0) {
    diagnostics.push(authoringDiagnostic({ code: "TN_GENERATOR_EXPORT_INVALID", file, message: "Generator export must be a non-empty string.", path: "/export" }));
  }
  if (!Array.isArray(data.outputs) || data.outputs.some((output) => typeof output !== "string" || output.length === 0)) {
    diagnostics.push(authoringDiagnostic({ code: "TN_GENERATOR_OUTPUTS_INVALID", file, message: "Generator outputs must be a list of non-empty project-relative paths.", path: "/outputs" }));
  }
  return diagnostics;
}

function resolveGeneratorModulePath(projectPath: string, modulePath: string): { absolutePath: string; diagnostic?: undefined } | { absolutePath?: undefined; diagnostic: IAuthoringDiagnostic } {
  const absolutePath = resolve(projectPath, modulePath);
  const projectRelativePath = normalizeRelativePath(relative(projectPath, absolutePath));
  if (projectRelativePath === "" || projectRelativePath.startsWith("../") || projectRelativePath === ".." || !projectRelativePath.startsWith("src/generators/")) {
    return {
      diagnostic: authoringDiagnostic({
        code: "TN_GENERATOR_MODULE_PATH_INVALID",
        file: modulePath,
        message: "Generator modules must be project-local files under src/generators/.",
        path: "/module",
        suggestion: "Use a module path such as src/generators/arena.ts.",
      }),
    };
  }
  if (!projectRelativePath.endsWith(".ts") && !projectRelativePath.endsWith(".js") && !projectRelativePath.endsWith(".mjs")) {
    return {
      diagnostic: authoringDiagnostic({
        code: "TN_GENERATOR_MODULE_EXTENSION_INVALID",
        file: projectRelativePath,
        message: "Generator modules must be TypeScript or JavaScript modules.",
        path: "/module",
      }),
    };
  }
  return { absolutePath };
}

async function validateGeneratorOutputConflicts(projectPath: string, generator: IGeneratorDocumentData): Promise<IAuthoringDiagnostic[]> {
  if (generator.outputHash === undefined || generator.overwritePolicy === "replace") {
    return [];
  }
  const currentHash = await hashOutputFiles(projectPath, generator.outputs);
  if (currentHash === generator.outputHash) {
    return [];
  }
  return [
    authoringDiagnostic({
      code: "TN_GENERATOR_OUTPUT_CONFLICT",
      file: `content/generators/${generator.id}.generator.json`,
      message: `Generator '${generator.id}' outputs changed since the last recorded run.`,
      path: "/outputHash",
      suggestion: "Review the manual edits, then re-record or rerun with overwritePolicy 'replace' when replacement is intended.",
      value: { currentHash, recordedHash: generator.outputHash },
    }),
  ];
}

async function validateGeneratorOutputsExist(projectPath: string, outputs: readonly string[]): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  for (const output of outputs) {
    try {
      await access(resolve(projectPath, output));
    } catch {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_GENERATOR_OUTPUT_MISSING",
          file: output,
          message: `Generator declared output '${output}' was not written.`,
          suggestion: "Ensure the generator commits authoring operations that create every declared output.",
        }),
      );
    }
  }
  return diagnostics;
}

async function compileGeneratorModule(sourceFile: string, tempDir: string, generatorId: string): Promise<string> {
  if (sourceFile.endsWith(".js") || sourceFile.endsWith(".mjs")) {
    return `${pathToFileURL(sourceFile).href}?tn=${Date.now()}`;
  }
  const source = await readFile(sourceFile, "utf8");
  const compiled = transpileModule(source, {
    compilerOptions: {
      module: ModuleKind.ES2022,
      target: ScriptTarget.ES2023,
    },
    fileName: sourceFile,
  });
  const outFile = join(tempDir, `${generatorId.replaceAll(/[^a-zA-Z0-9_.-]/g, "_")}.mjs`);
  await writeFile(outFile, compiled.outputText, "utf8");
  return `${pathToFileURL(outFile).href}?tn=${Date.now()}`;
}

async function writeGeneratorRunProvenance(document: IAuthoringDocument, updates: { inputHash: string; lastRun: Record<string, unknown>; outputHash: string }): Promise<void> {
  if (typeof document.data !== "object" || document.data === null || Array.isArray(document.data)) {
    return;
  }
  Object.assign(document.data, updates);
  await writeAuthoringJsonDocument(document);
}

async function hashFile(file: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(file)).digest("hex")}`;
}

async function hashOutputFiles(projectPath: string, outputs: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const output of [...outputs].sort()) {
    const absoluteOutput = resolve(projectPath, output);
    const projectRelativePath = normalizeRelativePath(relative(projectPath, absoluteOutput));
    hash.update(projectRelativePath);
    hash.update("\0");
    try {
      hash.update(await readFile(absoluteOutput));
    } catch {
      hash.update("<missing>");
    }
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function isAuthoringClientTransactionResult(value: unknown): value is IAuthoringClientTransactionResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<IAuthoringClientTransactionResult>;
  return typeof candidate.ok === "boolean" && Array.isArray(candidate.diagnostics) && Array.isArray(candidate.filesWritten) && Array.isArray(candidate.operations) && Array.isArray(candidate.operationResults);
}
