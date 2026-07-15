import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { authoringDiagnostic, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";
import { normalizeRelativePath } from "./documents.js";
import {
  advanceGeneratorOutputHash,
  generatedOutputOwnershipDiagnostic,
  resolveGeneratorProvenance,
  type IGeneratorOwnerAuthorization,
  type IGeneratorOutputOwner,
} from "./generatorProvenance.js";
import {
  dispatchAuthoringOperation,
  getAuthoringOperationDescriptor,
  type AuthoringOperationName,
} from "./operationRegistry.js";
import { validateAuthoringProject, type IAuthoringOperationResult } from "./operations.js";
import {
  publishAuthoringTransaction,
  type AuthoringTransactionHash,
} from "./transactionJournal.js";

export const AUTHORING_BATCH_SCHEMA = "threenative.authoring-batch";
export const AUTHORING_BATCH_VERSION = "0.1.0";
export const AUTHORING_DOCUMENT_GROWTH_WARNING_BYTES = 10 * 1024 * 1024;

export interface IAuthoringBatchOperation<TName extends string = AuthoringOperationName> {
  args?: Record<string, unknown>;
  name: TName;
}

export interface IAuthoringBatchDocument {
  actor?: string;
  id: string;
  intent?: string;
  operations: IAuthoringBatchOperation[];
  preconditions?: { planHash?: string };
  schema: typeof AUTHORING_BATCH_SCHEMA;
  version: typeof AUTHORING_BATCH_VERSION;
}

export interface IAuthoringBatchOperationTrace {
  args: Record<string, unknown>;
  index: number;
  name: string;
  predictedTargets: string[];
  result: IAuthoringOperationResult;
}

export interface IAuthoringBatchFilePlan {
  baseHash: string | null;
  bytesAfter: number;
  bytesBefore: number;
  change: "created" | "deleted" | "modified";
  nextHash: string | null;
  owner: "source" | `generator:${string}`;
  path: string;
  structuralDiff: {
    added: number;
    changed: number;
    removed: number;
    samplePaths: string[];
    truncated: boolean;
  };
}

export interface IAuthoringBatchDocumentMetric {
  addressableItemsAfter: number;
  addressableItemsBefore: number;
  bytesAfter: number;
  bytesBefore: number;
  path: string;
}

export interface IAuthoringBatchPlanResult {
  changed: boolean;
  diagnostics: IAuthoringDiagnostic[];
  files: IAuthoringBatchFilePlan[];
  filesCreated: string[];
  filesDeleted: string[];
  filesModified: string[];
  inputBytes: number;
  copiedBytes: number;
  documents: IAuthoringBatchDocumentMetric[];
  filesRead: string[];
  filesStaged: string[];
  ok: boolean;
  operationResults: IAuthoringBatchOperationTrace[];
  operations: Array<{ args: Record<string, unknown>; index: number; name: string }>;
  outputBytes: number;
  planHash: string;
  projectPath: string;
  stagedBytes: number;
  timingsMs: { plan: number; publish?: number; validate: number };
  stoppedAt?: number;
  touchedPaths: string[];
  transactionId: string;
}

export interface IAuthoringBatchApplyResult extends IAuthoringBatchPlanResult {
  committed: boolean;
  filesWritten: string[];
  recovered: boolean;
}

export interface IPlanAuthoringBatchOptions {
  batch: IAuthoringBatchDocument;
  owner?: IGeneratorOwnerAuthorization;
  projectPath: string;
  stopOnError?: boolean;
}

export interface IApplyAuthoringBatchOptions extends IPlanAuthoringBatchOptions {}

interface IStagedPlan extends IAuthoringBatchPlanResult {
  basePreconditions: Array<{ baseHash: string | null; path: string }>;
  nextBytes: Map<string, Buffer | null>;
}

export async function planAuthoringBatch(options: IPlanAuthoringBatchOptions): Promise<IAuthoringBatchPlanResult> {
  const plan = await createStagedPlan(options);
  if (plan.ok) await persistPlanPreconditions(plan);
  return publicPlan(plan);
}

export async function applyAuthoringBatch(options: IApplyAuthoringBatchOptions): Promise<IAuthoringBatchApplyResult> {
  const plan = await createStagedPlan(options);
  const requestedPlanHash = options.batch.preconditions?.planHash;
  if (requestedPlanHash !== undefined && requestedPlanHash !== plan.planHash) {
    const conflicts = await cachedPlanConflicts(plan.projectPath, requestedPlanHash);
    plan.diagnostics.push(...(conflicts.length > 0 ? conflicts : [authoringDiagnostic({
        code: "TN_AUTHORING_BATCH_PLAN_HASH_MISMATCH",
        message: "The supplied authoring batch plan hash does not match the current plan.",
        path: "/preconditions/planHash",
        suggestion: "Run authoring batch plan again, review the result, and apply its plan hash.",
        value: { actual: plan.planHash, expected: requestedPlanHash },
      })]));
    plan.diagnostics = sortAuthoringDiagnostics(plan.diagnostics);
    plan.ok = false;
  }
  if (!plan.ok) return { ...publicPlan(plan), committed: false, filesWritten: [], recovered: false };

  const publishStarted = performance.now();
  const publication = await publishAuthoringTransaction({
    files: plan.files.map((file) => ({
      baseHash: file.baseHash as AuthoringTransactionHash | null,
      bytes: plan.nextBytes.get(file.path) ?? null,
      path: file.path,
    })),
    projectPath: plan.projectPath,
    transactionId: plan.transactionId,
  });
  return {
    ...publicPlan(plan),
    committed: publication.committed,
    diagnostics: sortAuthoringDiagnostics([...plan.diagnostics, ...publication.diagnostics]),
    filesWritten: publication.filesWritten,
    ok: publication.ok,
    recovered: publication.recovered,
    timingsMs: { ...plan.timingsMs, publish: elapsedMs(publishStarted) },
  };
}

async function createStagedPlan(options: IPlanAuthoringBatchOptions): Promise<IStagedPlan> {
  const planStarted = performance.now();
  const projectPath = resolve(options.projectPath);
  const transactionId = `authoring-${randomUUID()}`;
  const batchDiagnostics = validateBatch(options.batch);
  if (batchDiagnostics.length > 0) return emptyPlan(projectPath, transactionId, [], batchDiagnostics);
  const normalizedOperations = options.batch.operations.map((operation, index) => ({
    args: cloneObject(operation.args ?? {}), index, name: operation.name,
  }));

  const stageRoot = await mkdtemp(join(tmpdir(), "tn-authoring-batch-"));
  try {
    const generatorProvenance = await resolveGeneratorProvenance(projectPath);
    const resolutionReads = new Set<string>(generatorProvenance.filesRead);
    const predictedByOperation = new Map<number, string[]>();
    for (const operation of normalizedOperations) {
      const descriptor = getAuthoringOperationDescriptor(operation.name);
      if (descriptor === undefined) continue;
      try {
        predictedByOperation.set(operation.index, (await descriptor.targetResolver({ args: operation.args, projectPath, recordRead: (path) => resolutionReads.add(normalizeBatchPath(path)) })).map(normalizeBatchPath));
      } catch {
        // The operation loop below reports the stable target diagnostic.
      }
    }
    const predictedSourceFiles = [...new Set([...predictedByOperation.values()].flat())].sort();
    const provenanceFiles = [...new Set(predictedSourceFiles.flatMap((path) => {
      const owner = generatorProvenance.ownersByOutput.get(path);
      return owner === undefined ? [] : [owner.provenancePath];
    }))];
    const targetedGeneratorIds = new Set(predictedSourceFiles.flatMap((path) => {
      const owner = generatorProvenance.ownersByOutput.get(path);
      return owner === undefined ? [] : [owner.generatorId];
    }));
    const generatorOutputDependencies = [...generatorProvenance.ownersByOutput.values()]
      .filter((owner) => targetedGeneratorIds.has(owner.generatorId))
      .map((owner) => owner.output);
    const scriptDependencies = await referencedScriptDependencies(projectPath, predictedSourceFiles);
    const stagedPaths = [...new Set([...predictedSourceFiles, ...provenanceFiles, ...generatorOutputDependencies, ...scriptDependencies])].sort();
    const sourceFiles = await existingFiles(projectPath, stagedPaths);
    const before = await readSnapshot(projectPath, sourceFiles);
    for (const file of sourceFiles) {
      const destination = resolve(stageRoot, file);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(resolve(projectPath, file), destination);
    }

    const diagnostics: IAuthoringDiagnostic[] = [...generatorProvenance.diagnostics];
    const operationResults: IAuthoringBatchOperationTrace[] = [];
    let stageSnapshot = await readSnapshot(stageRoot, await existingFiles(stageRoot, stagedPaths));
    let stoppedAt: number | undefined;
    for (const operation of normalizedOperations) {
      const descriptor = getAuthoringOperationDescriptor(operation.name);
      let predictedTargets: string[];
      try {
        predictedTargets = predictedByOperation.get(operation.index) ?? (descriptor === undefined
          ? []
          : (await descriptor.targetResolver({ args: operation.args, projectPath: stageRoot })).map(normalizeBatchPath));
      } catch (error) {
        const result: IAuthoringOperationResult = {
          changed: false,
          diagnostics: [authoringDiagnostic({
            code: "TN_AUTHORING_BATCH_TARGET_INVALID",
            message: `Authoring operation '${operation.name}' resolved an unsafe or invalid target.`,
            path: `/operations/${operation.index}`,
            suggestion: "Use a project-local durable source path and retry the batch plan.",
            value: error instanceof Error ? error.message : String(error),
          })],
          filesWritten: [],
          ok: false,
          projectPath,
        };
        operationResults.push({ ...operation, predictedTargets: [], result });
        diagnostics.push(...result.diagnostics);
        if (options.stopOnError ?? true) { stoppedAt = operation.index; break; }
        continue;
      }
      if (descriptor?.mutationPolicy === "source-mutation" && predictedTargets.length === 0) {
        const result: IAuthoringOperationResult = {
          changed: false,
          diagnostics: [authoringDiagnostic({
            code: "TN_AUTHORING_BATCH_UNDECLARED_WRITE",
            message: `Authoring operation '${operation.name}' does not declare a durable source target.`,
            path: `/operations/${operation.index}`,
            suggestion: "Fix the operation descriptor target resolver before using this operation in a batch.",
            value: { predicted: [] },
          })],
          filesWritten: [],
          ok: false,
          projectPath,
        };
        operationResults.push({ ...operation, predictedTargets, result });
        diagnostics.push(...result.diagnostics);
        if (options.stopOnError ?? true) { stoppedAt = operation.index; break; }
        continue;
      }
      const result = await dispatchAuthoringOperation({ args: operation.args, name: operation.name, projectPath: stageRoot });
      const nextSnapshot = await readSnapshot(stageRoot, await existingFiles(stageRoot, stagedPaths));
      const observed = changedPaths(stageSnapshot, nextSnapshot);
      const undeclared = observed.filter((path) => !predictedTargets.includes(path));
      if (undeclared.length > 0) {
        result.ok = false;
        result.diagnostics.push(...undeclared.map((path) => authoringDiagnostic({
          code: "TN_AUTHORING_BATCH_UNDECLARED_WRITE",
          file: path,
          message: `Authoring operation '${operation.name}' wrote outside its descriptor-declared targets.`,
          path: `/operations/${operation.index}`,
          suggestion: "Fix the operation descriptor target resolver before using this operation in a batch.",
          value: { observed: path, predicted: predictedTargets },
        })));
      }
      operationResults.push({ ...operation, predictedTargets, result: { ...result, projectPath } });
      diagnostics.push(...result.diagnostics);
      stageSnapshot = nextSnapshot;
      if (!result.ok && (options.stopOnError ?? true)) { stoppedAt = operation.index; break; }
    }

    if (stoppedAt === undefined) {
      const observedPaths = changedPaths(before, stageSnapshot);
      const changedOwners = new Map<string, IGeneratorOutputOwner>();
      for (const path of observedPaths) {
        const owner = generatorProvenance.ownersByOutput.get(path);
        if (owner === undefined) continue;
        const ownershipDiagnostic = generatedOutputOwnershipDiagnostic(owner, options.owner);
        if (ownershipDiagnostic !== undefined) diagnostics.push(ownershipDiagnostic);
        else changedOwners.set(owner.generatorId, owner);
      }
      if (diagnostics.every((diagnostic) => diagnostic.severity !== "error")) {
        for (const owner of changedOwners.values()) {
          try {
            await advanceGeneratorOutputHash(stageRoot, owner);
          } catch (error) {
            diagnostics.push(authoringDiagnostic({
              code: "TN_AUTHORING_GENERATOR_PROVENANCE_ADVANCE_FAILED",
              file: owner.provenancePath,
              message: `Could not advance provenance for generator '${owner.generatorId}'.`,
              suggestion: `Repair '${owner.provenancePath}' and rerun '${owner.command}'.`,
              value: error instanceof Error ? error.message : String(error),
            }));
          }
        }
        stageSnapshot = await readSnapshot(stageRoot, await existingFiles(stageRoot, stagedPaths));
      }
    }

    const validationStarted = performance.now();
    if (stoppedAt === undefined && diagnostics.every((diagnostic) => diagnostic.severity !== "error")) {
      const validation = await validateAuthoringProject({ projectPath: stageRoot });
      diagnostics.push(...validation.diagnostics);
    }
    const validationMs = elapsedMs(validationStarted);

    const after = stageSnapshot;
    const files = buildFilePlans(before, after, generatorProvenance.ownersByOutput);
    const documents = buildDocumentMetrics(before, after, files.map((file) => file.path));
    diagnostics.push(...documents.filter((document) => document.bytesAfter >= AUTHORING_DOCUMENT_GROWTH_WARNING_BYTES).map((document) => authoringDiagnostic({
      code: "TN_AUTHORING_DOCUMENT_GROWTH_WARNING",
      file: document.path,
      message: `Authoring document '${document.path}' is ${document.bytesAfter} bytes, above the reviewed ${AUTHORING_DOCUMENT_GROWTH_WARNING_BYTES}-byte growth threshold.`,
      severity: "warning",
      suggestion: "Prefer prefabs, PlacementSets, sibling UI/system/resource documents, or a separate scene; keep durable JSON pretty-printed.",
      value: { addressableItems: document.addressableItemsAfter, bytes: document.bytesAfter, thresholdBytes: AUTHORING_DOCUMENT_GROWTH_WARNING_BYTES },
    })));
    const touchedPaths = files.map((file) => file.path);
    const predictedPaths = [...new Set(operationResults.flatMap((operation) => operation.predictedTargets))].sort();
    const preconditionPaths = [...new Set([...predictedPaths, ...files.map((file) => file.path)])].sort();
    const basePreconditions = preconditionPaths.map((path) => ({
      baseHash: before.has(path) ? hashBytes(before.get(path)!) : null,
      path,
    }));
    const planHash = hashJson({
      batchId: options.batch.id,
      files: preconditionPaths.map((path) => ({
        baseHash: before.has(path) ? hashBytes(before.get(path)!) : null,
        nextHash: after.has(path) ? hashBytes(after.get(path)!) : null,
        owner: generatorProvenance.ownersByOutput.has(path)
          ? `generator:${generatorProvenance.ownersByOutput.get(path)!.generatorId}`
          : "source",
        path,
      })),
      owner: options.owner,
      operations: normalizedOperations.map(({ args, name }) => ({ args, name })),
      schema: options.batch.schema,
      version: options.batch.version,
    });
    const nextBytes = new Map<string, Buffer | null>(files.map((file) => [file.path, after.get(file.path) ?? null]));
    return {
      changed: files.length > 0,
      basePreconditions,
      copiedBytes: sourceFiles.reduce((total, path) => total + (before.get(path)?.byteLength ?? 0), 0),
      diagnostics: sortAuthoringDiagnostics(diagnostics),
      documents,
      files,
      filesCreated: pathsForChange(files, "created"),
      filesDeleted: pathsForChange(files, "deleted"),
      filesModified: pathsForChange(files, "modified"),
      filesRead: [...new Set([...resolutionReads, ...sourceFiles])].sort(),
      filesStaged: sourceFiles,
      inputBytes: files.reduce((total, file) => total + file.bytesBefore, 0),
      nextBytes,
      ok: stoppedAt === undefined && diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      operationResults,
      operations: normalizedOperations,
      outputBytes: files.reduce((total, file) => total + file.bytesAfter, 0),
      planHash,
      projectPath,
      stagedBytes: files.reduce((total, file) => total + file.bytesAfter, 0),
      timingsMs: { plan: elapsedMs(planStarted), validate: validationMs },
      ...(stoppedAt === undefined ? {} : { stoppedAt }),
      touchedPaths: [...new Set([...predictedPaths, ...touchedPaths])].sort(),
      transactionId,
    };
  } finally {
    await rm(stageRoot, { force: true, recursive: true });
  }
}

function validateBatch(batch: unknown): IAuthoringDiagnostic[] {
  if (batch === null || typeof batch !== "object" || Array.isArray(batch)) {
    return [authoringDiagnostic({ code: "TN_AUTHORING_BATCH_INVALID", message: "The authoring batch must be a JSON object.", path: "/", suggestion: "Provide a versioned authoring batch JSON document." })];
  }
  const candidate = batch as Partial<IAuthoringBatchDocument>;
  if (candidate.schema !== AUTHORING_BATCH_SCHEMA || candidate.version !== AUTHORING_BATCH_VERSION) {
    return [authoringDiagnostic({
      code: "TN_AUTHORING_BATCH_SCHEMA_UNSUPPORTED",
      message: `Expected ${AUTHORING_BATCH_SCHEMA} version ${AUTHORING_BATCH_VERSION}.`,
      path: candidate.schema !== AUTHORING_BATCH_SCHEMA ? "/schema" : "/version",
      suggestion: "Migrate the batch document to the supported schema and version.",
    })];
  }
  if (typeof candidate.id !== "string" || candidate.id.trim() === "" || !Array.isArray(candidate.operations) || candidate.operations.length === 0) {
    return [authoringDiagnostic({
      code: "TN_AUTHORING_BATCH_INVALID",
      message: "An authoring batch needs a non-empty id and at least one operation.",
      path: typeof candidate.id !== "string" || candidate.id.trim() === "" ? "/id" : "/operations",
      suggestion: "Provide a stable batch id and one or more registered operations.",
    })];
  }
  const invalidIndex = candidate.operations.findIndex((operation) => operation === null || typeof operation !== "object" || typeof operation.name !== "string" || (operation.args !== undefined && (operation.args === null || typeof operation.args !== "object" || Array.isArray(operation.args))));
  if (invalidIndex >= 0) {
    return [authoringDiagnostic({ code: "TN_AUTHORING_BATCH_INVALID", message: "Every authoring batch operation needs a string name and optional JSON-object args.", path: `/operations/${invalidIndex}`, suggestion: "Use a registered operation name and a structured args object." })];
  }
  return [];
}

function emptyPlan(
  projectPath: string,
  transactionId: string,
  operations: Array<{ args: Record<string, unknown>; index: number; name: string }>,
  diagnostics: IAuthoringDiagnostic[],
): IStagedPlan {
  return { basePreconditions: [], changed: false, copiedBytes: 0, diagnostics, documents: [], files: [], filesCreated: [], filesDeleted: [], filesModified: [], filesRead: [], filesStaged: [], inputBytes: 0, nextBytes: new Map(), ok: false, operationResults: [], operations, outputBytes: 0, planHash: hashJson({ operations }), projectPath, stagedBytes: 0, timingsMs: { plan: 0, validate: 0 }, touchedPaths: [], transactionId };
}

function publicPlan(plan: IStagedPlan): IAuthoringBatchPlanResult {
  const { basePreconditions: _basePreconditions, nextBytes: _nextBytes, ...result } = plan;
  return result;
}

async function readSnapshot(root: string, files: readonly string[]): Promise<Map<string, Buffer>> {
  return new Map(await Promise.all(files.map(async (file) => [normalizeBatchPath(file), await readFile(resolve(root, file))] as const)));
}

async function existingFiles(projectPath: string, paths: readonly string[]): Promise<string[]> {
  const existing = await Promise.all(paths.map(async (path) => {
    try {
      return (await stat(resolve(projectPath, path))).isFile() ? path : undefined;
    } catch {
      return undefined;
    }
  }));
  return existing.filter((path): path is string => path !== undefined);
}

async function referencedScriptDependencies(projectPath: string, paths: readonly string[]): Promise<string[]> {
  const dependencies = new Set<string>();
  for (const path of await existingFiles(projectPath, paths)) {
    if (!path.endsWith(".json")) continue;
    try {
      const visit = (value: unknown): void => {
        if (typeof value === "string" && value.startsWith("src/scripts/") && value.endsWith(".ts")) {
          dependencies.add(normalizeBatchPath(value));
        } else if (Array.isArray(value)) {
          value.forEach(visit);
        } else if (value !== null && typeof value === "object") {
          Object.values(value as Record<string, unknown>).forEach(visit);
        }
      };
      visit(JSON.parse(await readFile(resolve(projectPath, path), "utf8")) as unknown);
    } catch {
      // Operation dispatch reports malformed target documents with source paths.
    }
  }
  return [...dependencies].sort();
}

function changedPaths(before: ReadonlyMap<string, Buffer>, after: ReadonlyMap<string, Buffer>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => !buffersEqual(before.get(path), after.get(path)))
    .sort();
}

function buildFilePlans(
  before: ReadonlyMap<string, Buffer>,
  after: ReadonlyMap<string, Buffer>,
  ownersByOutput: ReadonlyMap<string, IGeneratorOutputOwner>,
): IAuthoringBatchFilePlan[] {
  return changedPaths(before, after).map((path) => {
    const previous = before.get(path);
    const next = after.get(path);
    return {
      baseHash: previous === undefined ? null : hashBytes(previous),
      bytesAfter: next?.byteLength ?? 0,
      bytesBefore: previous?.byteLength ?? 0,
      change: previous === undefined ? "created" : next === undefined ? "deleted" : "modified",
      nextHash: next === undefined ? null : hashBytes(next),
      owner: ownersByOutput.has(path) ? `generator:${ownersByOutput.get(path)!.generatorId}` : "source",
      path,
      structuralDiff: structuralDiff(previous, next),
    };
  });
}

function buildDocumentMetrics(
  before: ReadonlyMap<string, Buffer>,
  after: ReadonlyMap<string, Buffer>,
  paths: readonly string[],
): IAuthoringBatchDocumentMetric[] {
  return paths.map((path) => ({
    addressableItemsAfter: addressableItemCount(after.get(path)),
    addressableItemsBefore: addressableItemCount(before.get(path)),
    bytesAfter: after.get(path)?.byteLength ?? 0,
    bytesBefore: before.get(path)?.byteLength ?? 0,
    path,
  }));
}

function addressableItemCount(bytes: Buffer | undefined): number {
  if (bytes === undefined) return 0;
  try {
    const visit = (value: unknown): number => Array.isArray(value)
      ? value.length + value.reduce((total, item) => total + visit(item), 0)
      : value !== null && typeof value === "object"
        ? Object.values(value as Record<string, unknown>).reduce<number>((total, item) => total + 1 + visit(item), 0)
        : 0;
    return visit(JSON.parse(bytes.toString("utf8")) as unknown);
  } catch {
    return 0;
  }
}

function structuralDiff(before: Buffer | undefined, after: Buffer | undefined): IAuthoringBatchFilePlan["structuralDiff"] {
  const beforePaths = jsonLeafPaths(before);
  const afterPaths = jsonLeafPaths(after);
  const allPaths = [...new Set([...beforePaths.keys(), ...afterPaths.keys()])].sort();
  const added = allPaths.filter((path) => !beforePaths.has(path));
  const removed = allPaths.filter((path) => !afterPaths.has(path));
  const changed = allPaths.filter((path) => beforePaths.has(path) && afterPaths.has(path) && beforePaths.get(path) !== afterPaths.get(path));
  const samplePaths = [...added, ...removed, ...changed].sort().slice(0, 20);
  return { added: added.length, changed: changed.length, removed: removed.length, samplePaths, truncated: added.length + removed.length + changed.length > samplePaths.length };
}

function jsonLeafPaths(bytes: Buffer | undefined): Map<string, string> {
  if (bytes === undefined) return new Map();
  try {
    const leaves = new Map<string, string>();
    const visit = (value: unknown, path: string): void => {
      if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${path}/${index}`));
      else if (value !== null && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, item]) => visit(item, `${path}/${key}`));
      else leaves.set(path || "/", stableJson(value));
    };
    visit(JSON.parse(bytes.toString("utf8")) as unknown, "");
    return leaves;
  } catch {
    return new Map([["/", hashBytes(bytes)]]);
  }
}

function elapsedMs(started: number): number {
  return Math.round((performance.now() - started) * 1000) / 1000;
}

function buffersEqual(left: Buffer | undefined, right: Buffer | undefined): boolean {
  return left === undefined ? right === undefined : right !== undefined && left.equals(right);
}

function hashBytes(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hashJson(value: unknown): string {
  return hashBytes(Buffer.from(stableJson(value), "utf8"));
}

async function persistPlanPreconditions(plan: IStagedPlan): Promise<void> {
  const path = planCachePath(plan.projectPath, plan.planHash);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${stableJson({
    files: plan.basePreconditions,
    planHash: plan.planHash,
    schema: "threenative.authoring-plan-preconditions",
    version: AUTHORING_BATCH_VERSION,
  })}\n`, "utf8");
}

async function cachedPlanConflicts(projectPath: string, planHash: string): Promise<IAuthoringDiagnostic[]> {
  if (!/^sha256:[a-f0-9]{64}$/.test(planHash)) return [];
  let cache: { files?: Array<{ baseHash?: unknown; path?: unknown }>; planHash?: unknown; schema?: unknown; version?: unknown };
  try {
    cache = JSON.parse(await readFile(planCachePath(projectPath, planHash), "utf8")) as typeof cache;
  } catch {
    return [];
  }
  if (cache.schema !== "threenative.authoring-plan-preconditions" || cache.version !== AUTHORING_BATCH_VERSION || cache.planHash !== planHash || !Array.isArray(cache.files)) return [];
  const diagnostics: IAuthoringDiagnostic[] = [];
  for (const file of cache.files) {
    if (typeof file.path !== "string" || !(file.baseHash === null || typeof file.baseHash === "string")) continue;
    let actualHash: string | null;
    try {
      actualHash = hashBytes(await readFile(resolve(projectPath, normalizeBatchPath(file.path))));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      actualHash = null;
    }
    if (actualHash === file.baseHash) continue;
    diagnostics.push(authoringDiagnostic({
      code: "TN_AUTHORING_BATCH_CONFLICT",
      file: file.path,
      message: `Authoring source '${file.path}' changed after the batch was planned.`,
      suggestion: "Run authoring batch plan again, review the new result, and apply its plan hash.",
      value: { actualHash, expectedHash: file.baseHash, path: file.path },
    }));
  }
  return sortAuthoringDiagnostics(diagnostics);
}

function planCachePath(projectPath: string, planHash: string): string {
  return resolve(projectPath, ".tn/authoring-plans", `${planHash.replace(/^sha256:/, "")}.json`);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizeBatchPath(path: string): string {
  const normalized = normalizeRelativePath(path);
  if (normalized === "" || normalized === ".." || normalized.startsWith("../") || normalized.startsWith("/")) {
    throw new Error(`Unsafe authoring batch path '${path}'.`);
  }
  return normalized;
}

function cloneObject(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function pathsForChange(files: readonly IAuthoringBatchFilePlan[], change: IAuthoringBatchFilePlan["change"]): string[] {
  return files.filter((file) => file.change === change).map((file) => file.path);
}
