import {
  addAnimationClip,
  addAnimationGraphState,
  addAsset,
  authoringDiagnostic,
  readAuthoringJsonDocument,
  validateAuthoringProject,
  writeAuthoringJsonDocument,
  type IAuthoringDiagnostic,
  type IAuthoringDocument,
  type IAuthoringOperationResult,
} from "@threenative/authoring";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { inspectAsset } from "../commands/asset.js";
import { ExternalToolError, ExternalToolManager, type IExternalToolStatus } from "../externalTools/manager.js";

interface IProcessResult {
  exitCode: number | null;
  peakMemoryBytes?: number;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

interface IInspectionReport {
  animationClips?: Array<{ name: string }>;
  code: string;
  counts: { animations?: number; materials: number; meshes: number; triangles?: number };
  dependencies?: Array<{ embedded?: boolean; exists: boolean; kind: string }>;
  diagnostics: Array<{ code: string; message: string; severity: string }>;
  file: { byteSize?: number; path: string };
  namedNodes?: string[];
}

export interface IBlenderGeneratorDependencies {
  inspect(path: string): Promise<IInspectionReport>;
  now(): Date;
  runnerPath: string;
  runProcess(executable: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs: number }): Promise<IProcessResult>;
  toolStatus(): Promise<IExternalToolStatus>;
  uniqueId(): string;
}

export interface IBlenderGeneratorRunResult {
  diagnostics: IAuthoringDiagnostic[];
  execution?: { argv: string[]; cwd: string; executable: string; exitCode: number; peakMemoryBytes?: number; timedOut: false; timeoutMs: number };
  filesWritten: string[];
  generatorId: string;
  inputHash?: string;
  inspection?: IInspectionReport;
  lastRun?: Record<string, unknown>;
  ok: boolean;
  outputHash?: string;
  projectPath: string;
  runner?: Record<string, unknown>;
}

interface IBlenderGeneratorDocumentData {
  id: string;
  inputHash?: string;
  lastRun?: Record<string, unknown>;
  outputHash?: string;
  outputs: string[];
  overwritePolicy?: string;
  provider: "blender";
  providerVersion: string;
  recipe: string;
  schema: string;
  version: string;
}

interface IBlenderRecipeAnimation {
  id: string;
  loop?: boolean;
}

interface IBlenderRecipe {
  animations?: IBlenderRecipeAnimation[];
  budgets: Record<string, unknown>;
  id: string;
  operations?: Array<{
    kind: "split-by-axis";
    negative: string;
    node: string;
    positive: string;
  }>;
  source?: string;
}

const maximumLogBytes = 128 * 1024;
const generationTimeoutMs = 120_000;

export async function runBlenderGenerator(
  options: { generatorId: string; projectPath: string },
  dependencyOverrides: Partial<IBlenderGeneratorDependencies> = {},
): Promise<IBlenderGeneratorRunResult> {
  const manager = new ExternalToolManager();
  const dependencies: IBlenderGeneratorDependencies = {
    inspect: inspectAsset as (path: string) => Promise<IInspectionReport>,
    now: () => new Date(),
    runnerPath: fileURLToPath(new URL("./runner.py", import.meta.url)),
    runProcess: manager.dependencies.runProcess,
    toolStatus: () => manager.status("blender"),
    uniqueId: () => `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ...dependencyOverrides,
  };
  const projectPath = resolve(options.projectPath);
  const generatorFile = `content/generators/${options.generatorId}.generator.json`;
  const generatorRead = await readAuthoringJsonDocument(projectPath, generatorFile);
  if (generatorRead.document === undefined || generatorRead.diagnostics.length > 0) {
    return failure(options, generatorRead.diagnostics);
  }
  const validation = await validateAuthoringProject({ projectPath });
  const candidateRecipe = typeof generatorRead.document.data === "object" && generatorRead.document.data !== null && !Array.isArray(generatorRead.document.data)
    ? (generatorRead.document.data as Record<string, unknown>).recipe
    : undefined;
  const generatorDiagnostics = validation.diagnostics.filter((row) => row.file === generatorFile || (typeof candidateRecipe === "string" && row.file === candidateRecipe));
  if (generatorDiagnostics.length > 0) {
    return failure(options, generatorDiagnostics);
  }
  const generator = generatorRead.document.data as IBlenderGeneratorDocumentData;
  if (generator.provider !== "blender" || generator.id !== options.generatorId || generator.outputs.length !== 1) {
    return failure(options, [diagnostic(generatorFile, "TN_BLENDER_GENERATOR_INVALID", "Blender generator provenance must declare provider 'blender', a matching id, and exactly one output.")]);
  }

  let status: IExternalToolStatus;
  try {
    status = await dependencies.toolStatus();
  } catch (error) {
    return failure(options, [externalToolDiagnostic(error, generatorFile)]);
  }
  if (!status.ready) {
    return failure(options, [missingBlenderDiagnostic(generatorFile, "Blender is not installed or configured.")]);
  }
  if (status.version !== generator.providerVersion) {
    return failure(options, [diagnostic(generatorFile, "TN_BLENDER_VERSION_MISMATCH", `Generator requires Blender ${generator.providerVersion}, but ${status.version} is selected.`, "Record the recipe against the selected pinned provider version.")]);
  }

  const recipeAbsolute = resolve(projectPath, generator.recipe);
  let recipeBytes: Buffer;
  let recipe: IBlenderRecipe;
  let runnerBytes: Buffer;
  try {
    [recipeBytes, runnerBytes] = await Promise.all([readFile(recipeAbsolute), readFile(dependencies.runnerPath)]);
    recipe = JSON.parse(recipeBytes.toString("utf8")) as IBlenderRecipe;
  } catch (error) {
    return failure(options, [diagnostic(generator.recipe, "TN_BLENDER_INPUT_READ_FAILED", `Could not read Blender recipe or owned runner: ${errorMessage(error)}`)]);
  }
  let sourceAbsolute: string | undefined;
  let sourceBytes: Buffer | undefined;
  if (recipe.source !== undefined) {
    try {
      const projectRealPath = await realpath(projectPath);
      sourceAbsolute = await realpath(resolve(projectPath, recipe.source));
      const sourceRelative = relative(projectRealPath, sourceAbsolute);
      if (sourceRelative.startsWith("..") || resolve(projectRealPath, sourceRelative) !== sourceAbsolute) throw new Error("source resolves outside the project");
      sourceBytes = await readFile(sourceAbsolute);
    } catch (error) {
      return failure(options, [diagnostic(generator.recipe, "TN_BLENDER_SOURCE_READ_FAILED", `Could not read contained Blender source '${recipe.source}': ${errorMessage(error)}`, "Restore the project-local GLB below assets/ and rerun authoring validation.")]);
    }
    let sourceInspection: IInspectionReport;
    try {
      sourceInspection = await dependencies.inspect(sourceAbsolute);
    } catch (error) {
      return failure(options, [diagnostic(recipe.source, "TN_BLENDER_SOURCE_INSPECTION_FAILED", `Could not inspect Blender source GLB: ${errorMessage(error)}`)]);
    }
    const sourceDiagnostics = inspectSourceDiagnostics(recipe, sourceInspection);
    if (sourceDiagnostics.length > 0) return failure(options, sourceDiagnostics);
  }
  const outputRelative = generator.outputs[0]!;
  const outputAbsolute = resolve(projectPath, outputRelative);
  const destinationSnapshot = await snapshot(outputAbsolute);
  const generatorSnapshot = await snapshot(resolve(projectPath, generatorFile));
  const assetFile = resolve(projectPath, "content/assets", `${generator.id}.assets.json`);
  const assetSnapshot = await snapshot(assetFile);
  const runnerHash = sha256(runnerBytes);
  const sourceHash = sourceBytes === undefined ? "" : sha256(sourceBytes);
  const inputHash = sha256(Buffer.from(`${canonicalJson(recipe)}\0${sourceHash}\0${runnerHash}\0${status.version}`, "utf8"));
  if (generator.outputHash === undefined && generator.overwritePolicy !== "replace" && destinationSnapshot !== undefined) {
    return failure(options, [diagnostic(generatorFile, "TN_GENERATOR_OUTPUT_CONFLICT", `Generator '${generator.id}' does not own the existing output '${outputRelative}'.`, "Move the manual asset or record overwritePolicy 'replace' after review.")], inputHash);
  }
  if (generator.outputHash !== undefined && generator.overwritePolicy !== "replace" && destinationSnapshot !== undefined && sha256(destinationSnapshot) !== generator.outputHash) {
    return failure(options, [diagnostic(generatorFile, "TN_GENERATOR_OUTPUT_CONFLICT", `Generator '${generator.id}' output changed since the last accepted Blender run.`, "Review the manual edits or record overwritePolicy 'replace' before regenerating.")], inputHash);
  }
  const runId = dependencies.uniqueId();
  const stagingPath = `${outputAbsolute}.staging-${runId}.glb`;
  const backupPath = `${outputAbsolute}.backup-${runId}`;
  const workDirectory = await mkdtemp(resolve(tmpdir(), "tn-blender-generator-"));
  const resultPath = resolve(workDirectory, "result.json");
  const jobPath = resolve(workDirectory, "job.json");
  const startedAt = dependencies.now().toISOString();
  let promoted = false;
  try {
    await mkdir(dirname(stagingPath), { recursive: true });
    await writeFile(jobPath, `${JSON.stringify({ outputPath: stagingPath, recipePath: recipeAbsolute, resultPath, ...(sourceAbsolute === undefined ? {} : { sourcePath: sourceAbsolute }) }, null, 2)}\n`, "utf8");
    const args = ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python", dependencies.runnerPath, "--", "--job", jobPath] as const;
    let processResult: IProcessResult;
    try {
      processResult = await dependencies.runProcess(status.executablePath, args, { cwd: workDirectory, env: minimalBlenderEnvironment(), timeoutMs: generationTimeoutMs });
    } catch (error) {
      return failure(options, [diagnostic(generatorFile, "TN_BLENDER_PROCESS_FAILED", `Could not start Blender: ${errorMessage(error)}`)], inputHash);
    }
    if (processResult.timedOut) {
      return failure(options, [diagnostic(generatorFile, "TN_BLENDER_GENERATION_TIMEOUT", `Blender generation exceeded ${generationTimeoutMs} ms and was terminated.`)], inputHash);
    }
    if (processResult.exitCode !== 0) {
      return failure(options, [diagnostic(generatorFile, "TN_BLENDER_GENERATION_FAILED", `Blender exited with code ${String(processResult.exitCode)}: ${boundedLog(processResult.stderr || processResult.stdout)}`)], inputHash);
    }
    let runnerResult: Record<string, unknown>;
    try {
      runnerResult = JSON.parse(await readFile(resultPath, "utf8")) as Record<string, unknown>;
    } catch (error) {
      return failure(options, [diagnostic(generatorFile, "TN_BLENDER_RESULT_INVALID", `Blender did not emit a valid owned-runner result: ${errorMessage(error)}`)], inputHash);
    }
    if (runnerResult.ok !== true) {
      return failure(options, [diagnostic(generatorFile, "TN_BLENDER_RESULT_INVALID", "Blender owned runner reported a failed generation.")], inputHash);
    }
    const stagedInspection = await dependencies.inspect(stagingPath);
    const budgetDiagnostics = await inspectBudgetDiagnostics(generator.recipe, recipe, stagedInspection, stagingPath);
    const inspection = { ...stagedInspection, file: { ...stagedInspection.file, path: outputRelative } };
    if (stagedInspection.code !== "TN_ASSET_INSPECT_OK" || budgetDiagnostics.length > 0) {
      return failure(options, [...stagedInspection.diagnostics.filter((row) => row.severity === "error").map((row) => diagnostic(generator.outputs[0]!, row.code, row.message)), ...budgetDiagnostics], inputHash, inspection);
    }

    if (destinationSnapshot !== undefined) await rename(outputAbsolute, backupPath);
    await rename(stagingPath, outputAbsolute);
    promoted = true;
    requireOperation(await addAsset({ assetId: generator.id, path: outputRelative, projectPath, source: `generator:${generator.id}`, type: "model" }));
    const animations = [...(recipe.animations ?? [])].sort((left, right) => left.id.localeCompare(right.id));
    for (const animation of animations) {
      requireOperation(await addAnimationClip({ assetId: generator.id, clipId: animation.id, loop: animation.loop, projectPath, sourceClip: animation.id }));
    }
    for (const [index, animation] of animations.entries()) {
      requireOperation(await addAnimationGraphState({ assetId: generator.id, clipId: animation.id, initial: index === 0, projectPath, stateId: animation.id }));
    }
    const outputHash = sha256(await readFile(outputAbsolute));
    const completedAt = dependencies.now().toISOString();
    const lastRun = {
      completedAt,
      diagnostics: [],
      filesWritten: [outputRelative, relative(projectPath, assetFile).split("\\").join("/"), generatorFile].sort(),
      inputHash,
      inspection,
      ok: true,
      outputHash,
      provider: "blender",
      providerVersion: status.version,
      runnerHash,
      startedAt,
    };
    await writeGeneratorRunProvenance(generatorRead.document, { inputHash, lastRun, outputHash });
    await rm(backupPath, { force: true });
    return {
      diagnostics: [], filesWritten: lastRun.filesWritten, generatorId: generator.id, inputHash, inspection,
      execution: { argv: [...args], cwd: workDirectory, executable: status.executablePath, exitCode: processResult.exitCode, ...(processResult.peakMemoryBytes === undefined ? {} : { peakMemoryBytes: processResult.peakMemoryBytes }), timedOut: false, timeoutMs: generationTimeoutMs },
      lastRun, ok: true, outputHash, projectPath, runner: runnerResult,
    };
  } catch (error) {
    try {
      await restore(outputAbsolute, destinationSnapshot);
      await restore(assetFile, assetSnapshot);
      await restore(resolve(projectPath, generatorFile), generatorSnapshot);
    } catch (rollbackError) {
      return failure(options, [diagnostic(generatorFile, "TN_BLENDER_ROLLBACK_FAILED", `Generation failed and project state could not be restored: ${errorMessage(rollbackError)}`)], inputHash);
    }
    return failure(options, [diagnostic(generatorFile, "TN_BLENDER_REGISTRATION_FAILED", `Generated GLB could not be registered; prior output and source documents were restored: ${errorMessage(error)}`)], inputHash);
  } finally {
    await rm(stagingPath, { force: true });
    await rm(backupPath, { force: true });
    await rm(workDirectory, { force: true, recursive: true });
    if (!promoted) await restore(outputAbsolute, destinationSnapshot).catch(() => undefined);
  }
}

async function inspectBudgetDiagnostics(file: string, recipe: IBlenderRecipe, inspection: IInspectionReport, path: string): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  const byteSize = inspection.file.byteSize ?? (await stat(path)).size;
  const limits = recipe.budgets;
  const checks: Array<[string, number, unknown]> = [
    ["maxOutputBytes", byteSize, limits.maxOutputBytes],
    ["maxPolygons", inspection.counts.triangles ?? Number.POSITIVE_INFINITY, limits.maxPolygons],
    ["maxMaterials", inspection.counts.materials, limits.maxMaterials],
  ];
  for (const [name, actual, requested] of checks) {
    if (typeof requested === "number" && actual > requested) {
      diagnostics.push(diagnostic(file, "TN_BLENDER_OUTPUT_BUDGET_EXCEEDED", `Generated GLB ${name} value ${actual} exceeds requested limit ${requested}.`));
    }
  }
  const expectedAnimations = recipe.animations?.length ?? 0;
  if ((inspection.counts.animations ?? 0) < expectedAnimations) {
    diagnostics.push(diagnostic(file, "TN_BLENDER_ANIMATION_EXPORT_MISSING", `Generated GLB contains ${inspection.counts.animations ?? 0} animation clips, but the recipe declares ${expectedAnimations}.`));
  }
  const emittedAnimationNames = new Set((inspection.animationClips ?? []).map((clip) => clip.name));
  for (const animation of recipe.animations ?? []) {
    if (!emittedAnimationNames.has(animation.id)) diagnostics.push(diagnostic(file, "TN_BLENDER_ANIMATION_EXPORT_MISSING", `Generated GLB does not contain declared animation clip '${animation.id}'.`));
  }
  return diagnostics;
}

function requireOperation(result: IAuthoringOperationResult): void {
  if (!result.ok) throw new Error(result.diagnostics.map((row) => `${row.code}: ${row.message}`).join("; "));
}

async function writeGeneratorRunProvenance(document: IAuthoringDocument, updates: { inputHash: string; lastRun: Record<string, unknown>; outputHash: string }): Promise<void> {
  if (typeof document.data !== "object" || document.data === null || Array.isArray(document.data)) throw new Error("generator provenance document is malformed");
  Object.assign(document.data, updates);
  await writeAuthoringJsonDocument(document);
}

function failure(options: { generatorId: string; projectPath: string }, diagnostics: IAuthoringDiagnostic[], inputHash?: string, inspection?: IInspectionReport): IBlenderGeneratorRunResult {
  return { diagnostics, filesWritten: [], generatorId: options.generatorId, inputHash, inspection, ok: false, projectPath: resolve(options.projectPath) };
}

function inspectSourceDiagnostics(recipe: IBlenderRecipe, inspection: IInspectionReport): IAuthoringDiagnostic[] {
  if (inspection.code !== "TN_ASSET_INSPECT_OK") {
    const errors = inspection.diagnostics.filter((row) => row.severity === "error").map((row) => diagnostic(recipe.source ?? "", row.code, row.message));
    return errors.length > 0 ? errors : [diagnostic(recipe.source ?? "", "TN_BLENDER_SOURCE_INSPECTION_FAILED", "Source GLB inspection did not complete successfully.")];
  }
  const diagnostics: IAuthoringDiagnostic[] = [];
  if ((inspection.dependencies ?? []).some((dependency) => dependency.embedded !== true || dependency.exists !== true)) {
    diagnostics.push(diagnostic(recipe.source ?? "", "TN_BLENDER_SOURCE_DEPENDENCY_UNSUPPORTED", "Source-backed Blender recipes require a self-contained GLB with embedded buffers and images.", "Embed every GLB dependency before recording the Blender recipe."));
  }
  const nodeCounts = new Map<string, number>();
  for (const name of inspection.namedNodes ?? []) nodeCounts.set(name, (nodeCounts.get(name) ?? 0) + 1);
  for (const operation of recipe.operations ?? []) {
    if (operation.kind !== "split-by-axis") continue;
    const matches = nodeCounts.get(operation.node) ?? 0;
    if (matches !== 1) {
      diagnostics.push(diagnostic(recipe.source ?? "", "TN_BLENDER_SOURCE_OPERATION_NODE_UNRESOLVED", `Source split target '${operation.node}' resolved to ${matches} source nodes; exactly one is required.`, "Use an exact unique mesh node name reported by 'tn asset inspect <source.glb> --json'."));
      continue;
    }
    for (const output of [operation.negative, operation.positive]) {
      if ((nodeCounts.get(output) ?? 0) > 0) {
        diagnostics.push(diagnostic(recipe.source ?? "", "TN_BLENDER_SOURCE_OPERATION_OUTPUT_COLLISION", `Source split output '${output}' collides with an existing or prior output node.`, "Choose unique output ids for each separated source surface."));
      }
    }
    nodeCounts.delete(operation.node);
    nodeCounts.set(operation.negative, 1);
    nodeCounts.set(operation.positive, 1);
  }
  const clipNames = new Set((inspection.animationClips ?? []).map((clip) => clip.name));
  for (const clip of recipe.animations ?? []) {
    if (clipNames.has(clip.id)) diagnostics.push(diagnostic(recipe.source ?? "", "TN_BLENDER_SOURCE_ANIMATION_COLLISION", `Animation clip '${clip.id}' already exists in the source GLB.`, "Rename the new recipe clip so retained source clips remain unambiguous."));
    const tracks = (clip as IBlenderRecipeAnimation & { tracks?: Array<{ node?: string }> }).tracks ?? [];
    for (const track of tracks) {
      if (typeof track.node !== "string") continue;
      const matches = nodeCounts.get(track.node) ?? 0;
      if (matches !== 1) diagnostics.push(diagnostic(recipe.source ?? "", "TN_BLENDER_SOURCE_NODE_UNRESOLVED", `Animation target '${track.node}' resolved to ${matches} source nodes; exactly one is required.`, "Use an exact unique node name reported by 'tn asset inspect <source.glb> --json'."));
    }
  }
  return diagnostics;
}

function diagnostic(file: string, code: string, message: string, suggestion?: string): IAuthoringDiagnostic {
  return authoringDiagnostic({ code, file, message, ...(suggestion === undefined ? {} : { suggestion }) });
}

function externalToolDiagnostic(error: unknown, file: string): IAuthoringDiagnostic {
  if (error instanceof ExternalToolError) return error.code === "TN_EXTERNAL_TOOL_MISSING" ? missingBlenderDiagnostic(file, error.message) : diagnostic(file, error.code, error.message);
  return missingBlenderDiagnostic(file, `Could not resolve Blender: ${errorMessage(error)}`);
}

function missingBlenderDiagnostic(file: string, message: string): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_EXTERNAL_TOOL_MISSING",
    file,
    fix: {
      instruction: "Install the pinned optional Blender tool explicitly, or configure an approved executable override.",
      snippet: "tn tool install blender --accept-download --json",
    },
    message,
    suggestion: "Run 'tn tool install blender --accept-download --json' or set THREENATIVE_BLENDER_PATH.",
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function sha256(value: Uint8Array): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function minimalBlenderEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of ["HOME", "LANG", "LC_ALL", "PATH", "SystemRoot", "TEMP", "TMP", "TMPDIR", "WINDIR"] as const) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return environment;
}
function boundedLog(value: string): string { return value.length <= maximumLogBytes ? value : value.slice(-maximumLogBytes); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
async function snapshot(path: string): Promise<Uint8Array | undefined> { try { return await readFile(path); } catch { return undefined; } }
async function restore(path: string, value: Uint8Array | undefined): Promise<void> { if (value === undefined) await rm(path, { force: true }); else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value); } }
