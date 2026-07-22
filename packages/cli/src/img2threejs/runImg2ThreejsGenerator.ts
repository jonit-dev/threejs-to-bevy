import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  addAsset,
  formatAuthoringDocument,
  hashAuthoringTransactionBytes,
  hasAuthoringErrors,
  loadAuthoringProject,
  publishAuthoringTransaction,
  type IAuthoringDiagnostic,
} from "@threenative/authoring";
import ts from "typescript";

import { img2ThreejsCompatibility, inspectImg2ThreejsGlbContract } from "./compatibility.js";
import { diagnosticError, exportImg2ThreejsPage, type IImg2ThreejsBrowserDependencies, type IImg2ThreejsBrowserResource } from "./exporterPage.js";
import { measureImg2ThreejsVisualParity, writeImg2ThreejsVisualProof, type IImg2ThreejsVisualMetrics } from "./visualParity.js";

type InspectAsset = typeof import("../commands/asset.js").inspectAsset;
type InspectResult = Awaited<ReturnType<InspectAsset>>;

interface IGltfValidatorReport {
  issues: {
    messages: Array<{ code?: string; message?: string; pointer?: string; severity?: number }>;
    numErrors: number;
    numHints: number;
    numInfos: number;
    numWarnings: number;
    truncated?: boolean;
  };
}

interface IImg2ThreejsRecipe {
  export: { embedTextures: true; includeRuntimeExtras: boolean; rootNode: string };
  validationReport: string;
}

interface IImg2ThreejsGeneratorProvenance {
  acceptedPasses: Array<{ evidence: Array<{ path: string; sha256: string }> }>;
  budgets: { maxMaterials: number; maxOutputBytes: number; maxTextures: number; maxTriangles: number; timeoutMs: number };
  export: string;
  id: string;
  inputHash: string;
  module: string;
  outputHash?: string;
  outputs: string[];
  overwritePolicy: "manual" | "replace" | "skip";
  provider: "img2threejs";
  recipe: string;
  sourceHashes: { factory: string; recipe: string; resources: Array<{ path: string; sha256: string }>; sculptSpec: string; sourceImage: string; validationReport: string };
  sculptSpec: string;
  sourceImage: string;
}

interface IGltfValidator {
  validateBytes(bytes: Uint8Array, options: { format: "glb"; maxIssues: number; uri: string; writeTimestamp: false }): Promise<IGltfValidatorReport>;
}

export interface IRunImg2ThreejsGeneratorDependencies {
  browser?: IImg2ThreejsBrowserDependencies;
  inspect?: InspectAsset;
  measureVisualParity?: typeof measureImg2ThreejsVisualParity;
  publish?: typeof publishAuthoringTransaction;
  validate?: IGltfValidator["validateBytes"];
}

export interface IRunImg2ThreejsGeneratorResult {
  code: string;
  diagnostics: IAuthoringDiagnostic[];
  filesWritten: string[];
  generatorId: string;
  inputHash?: string;
  inspection?: InspectResult;
  message: string;
  ok: boolean;
  outputHash?: string;
  projectPath: string;
  proofFiles?: string[];
  visualMetrics?: IImg2ThreejsVisualMetrics;
  validation?: IGltfValidatorReport;
}

export async function runImg2ThreejsGenerator(
  projectPathInput: string,
  generatorId: string,
  dependencies: IRunImg2ThreejsGeneratorDependencies = {},
): Promise<IRunImg2ThreejsGeneratorResult> {
  const projectPath = resolve(projectPathInput);
  const provenancePath = `content/generators/${generatorId}.generator.json`;
  const project = await loadAuthoringProject({ projectPath });
  const provenanceDocument = project.documents.find((document) => document.kind === "generator" && document.projectRelativePath === provenancePath);
  const provenanceData = provenanceDocument?.data;
  if (hasAuthoringErrors(project.diagnostics) || !isRecord(provenanceData) || provenanceData.provider !== "img2threejs" || provenanceData.id !== generatorId) {
    return failure(projectPath, generatorId, "TN_IMG2THREEJS_PROVENANCE_INVALID", `Reviewed img2threejs provenance '${provenancePath}' is missing or invalid.`, provenancePath, project.diagnostics);
  }
  const provenance = provenanceData as unknown as IImg2ThreejsGeneratorProvenance & Record<string, unknown>;
  if (provenance.outputs.length !== 1) return failure(projectPath, generatorId, "TN_IMG2THREEJS_PROVENANCE_INVALID", "img2threejs provenance must declare exactly one GLB output.", "/outputs");

  const outputPath = provenance.outputs[0]!;
  const assetPath = `content/assets/${generatorId}.assets.json`;
  const [outputTarget, assetTarget, provenanceTarget] = await Promise.all([
    captureTransactionTarget(projectPath, outputPath),
    captureTransactionTarget(projectPath, assetPath),
    captureTransactionTarget(projectPath, provenancePath),
  ]);
  if (provenance.overwritePolicy !== "replace" && outputTarget.bytes !== undefined) {
    const currentOutputHash = hashOutputs([[outputPath, outputTarget.bytes]]);
    if (provenance.outputHash === undefined || provenance.outputHash !== currentOutputHash) {
      return failure(
        projectPath,
        generatorId,
        "TN_GENERATOR_OUTPUT_CONFLICT",
        provenance.outputHash === undefined
          ? `Generator '${generatorId}' does not own the existing output '${outputPath}'.`
          : `Generator '${generatorId}' output changed since the last accepted img2threejs run.`,
        outputPath,
      );
    }
  }

  let reviewed: { factorySource: string; recipe: IImg2ThreejsRecipe; resources: IImg2ThreejsBrowserResource[] };
  let moduleJavaScript: string;
  try {
    reviewed = await loadReviewedInputs(projectPath, provenance);
    moduleJavaScript = compileFactory(reviewed.factorySource, provenance.module, provenance.export);
  } catch (error) {
    return failureFromError(projectPath, generatorId, error, provenance.module);
  }

  const temporary = await mkdtemp(join(tmpdir(), "tn-img2threejs-"));
  const stagedGlb = join(temporary, "output.glb");
  try {
    const browserResult = await exportImg2ThreejsPage({
      exportName: provenance.export,
      includeRuntimeExtras: reviewed.recipe.export.includeRuntimeExtras,
      maxOutputBytes: provenance.budgets.maxOutputBytes,
      moduleJavaScript,
      outputPath: stagedGlb,
      resources: reviewed.resources,
      rootName: reviewed.recipe.export.rootNode,
      timeoutMs: provenance.budgets.timeoutMs,
    }, dependencies.browser);
    const glbBytes = await readFile(stagedGlb);
    const glbContract = inspectImg2ThreejsGlbContract(glbBytes);

    const validator = dependencies.validate ?? loadValidator().validateBytes.bind(loadValidator());
    const validation = await validator(new Uint8Array(glbBytes), { format: "glb", maxIssues: 100, uri: outputPath, writeTimestamp: false });
    if (validation.issues.numErrors > 0) throw diagnosticError("TN_IMG2THREEJS_GLTF_INVALID", `Khronos validation reported ${validation.issues.numErrors} error(s).`);
    const inspect = dependencies.inspect ?? (await import("../commands/asset.js")).inspectAsset;
    const stagedInspection = await inspect(stagedGlb);
    if (stagedInspection.code !== "TN_ASSET_INSPECT_OK") throw diagnosticError("TN_IMG2THREEJS_GLTF_INVALID", "Generated GLB failed ThreeNative asset inspection.");
    const inspection = {
      ...stagedInspection,
      file: { ...stagedInspection.file, path: outputPath },
    };
    enforceBudget("triangles", inspection.counts?.triangles ?? 0, provenance.budgets.maxTriangles);
    enforceBudget("materials", inspection.counts?.materials ?? 0, provenance.budgets.maxMaterials);
    enforceBudget("textures", inspection.counts?.textures ?? 0, provenance.budgets.maxTextures);

    const outputHash = hashOutputs([[outputPath, glbBytes]]);
    const proofHash = sha256(glbBytes).slice("sha256:".length);
    const proofDirectory = resolve(projectPath, "artifacts", "img2threejs", generatorId, "reload-proof", proofHash);
    const visual = (dependencies.measureVisualParity ?? measureImg2ThreejsVisualParity)(browserResult.source, browserResult.reloaded);
    const absoluteProofFiles = await writeImg2ThreejsVisualProof(proofDirectory, browserResult.source, browserResult.reloaded, visual.diff, visual.metrics);
    const proofFiles = absoluteProofFiles.map((path) => relative(projectPath, path));
    if (!visual.metrics.passed) {
      const error = diagnosticError("TN_IMG2THREEJS_VISUAL_PARITY_FAILED", `Reload proof failed: IoU ${visual.metrics.silhouetteIou.toFixed(6)}, SSIM ${visual.metrics.ssim.toFixed(6)}, mean normalized RGB delta ${visual.metrics.meanNormalizedRgbDelta.toFixed(6)}. Evidence: ${proofFiles.join(", ")}.`);
      Object.assign(error, { proofFiles, visualMetrics: visual.metrics });
      throw error;
    }
    const nextProvenance = {
      ...provenance,
      lastRun: {
        browserNodes: browserResult.nodes,
        byteSize: browserResult.byteSize,
        gltfErrors: validation.issues.numErrors,
        gltfWarnings: validation.issues.numWarnings,
        allowedExtensions: [...img2ThreejsCompatibility.allowedExtensions],
        materials: inspection.counts?.materials ?? 0,
        observedExtensions: glbContract.extensions,
        proofFiles,
        textureHashes: reviewed.resources.map((resource) => ({ path: resource.path, sha256: sha256(resource.bytes) })),
        textures: inspection.counts?.textures ?? 0,
        triangles: inspection.counts?.triangles ?? 0,
        visualMetrics: visual.metrics,
      },
      outputHash,
    };
    const assetBytes = await createAssetDocumentBytes(projectPath, temporary, assetPath, generatorId, outputPath);
    const provenanceBytes = Buffer.from(formatAuthoringDocument(nextProvenance));
    const files = [
      transactionFile(outputPath, glbBytes, outputTarget.baseHash),
      transactionFile(assetPath, assetBytes, assetTarget.baseHash),
      transactionFile(provenancePath, provenanceBytes, provenanceTarget.baseHash),
    ];
    const publication = await (dependencies.publish ?? publishAuthoringTransaction)({ files, projectPath });
    if (!publication.ok) {
      return failure(projectPath, generatorId, "TN_IMG2THREEJS_PROMOTION_FAILED", "Generated GLB, asset registration, and provenance could not be committed atomically.", outputPath, publication.diagnostics);
    }
    return {
      code: "TN_IMG2THREEJS_RUN_OK",
      diagnostics: [],
      filesWritten: [outputPath, assetPath, provenancePath],
      generatorId,
      inputHash: provenance.inputHash,
      inspection,
      message: `Generated and registered '${outputPath}'.`,
      ok: true,
      outputHash,
      projectPath,
      proofFiles,
      validation,
      visualMetrics: visual.metrics,
    };
  } catch (error) {
    return failureFromError(projectPath, generatorId, error, outputPath);
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

function compileFactory(source: string, file: string, exportName: string): string {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TS);
  const diagnostics: string[] = [];
  let hasExport = false;
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== "three") diagnostics.push("Only the static 'three' import is allowed.");
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) diagnostics.push("Dynamic import is not allowed.");
    if ((ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === exportName) hasExport = true;
      if (ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === exportName)) hasExport = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!hasExport) diagnostics.push(`Named export '${exportName}' was not declared in the factory module.`);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2023 }, fileName: file, reportDiagnostics: true });
  diagnostics.push(...(compiled.diagnostics ?? []).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")));
  if (diagnostics.length > 0) throw diagnosticError("TN_IMG2THREEJS_FACTORY_EXPORT_INVALID", diagnostics.join(" "));
  return compiled.outputText;
}

async function loadReviewedInputs(projectPath: string, provenance: IImg2ThreejsGeneratorProvenance): Promise<{ factorySource: string; recipe: IImg2ThreejsRecipe; resources: IImg2ThreejsBrowserResource[] }> {
  const recipeBytes = await readVerifiedFile(projectPath, provenance.recipe, provenance.sourceHashes.recipe);
  const recipe = JSON.parse(recipeBytes.toString("utf8")) as IImg2ThreejsRecipe;
  if (recipe.export?.embedTextures !== true || typeof recipe.export.includeRuntimeExtras !== "boolean") throw diagnosticError("TN_IMG2THREEJS_RECIPE_INVALID", "Recipe export must embed textures and declare includeRuntimeExtras.");
  const inputs: Array<[string, string]> = [
    [provenance.sourceImage, provenance.sourceHashes.sourceImage],
    [provenance.sculptSpec, provenance.sourceHashes.sculptSpec],
    [recipe.validationReport, provenance.sourceHashes.validationReport],
  ];
  for (const pass of provenance.acceptedPasses) for (const evidence of pass.evidence) inputs.push([evidence.path, evidence.sha256]);
  for (const [path, expected] of inputs) await readVerifiedFile(projectPath, path, expected);
  const factoryBytes = await readVerifiedFile(projectPath, provenance.module, provenance.sourceHashes.factory);
  const resources: IImg2ThreejsBrowserResource[] = [];
  for (const resource of provenance.sourceHashes.resources) {
    const bytes = await readVerifiedFile(projectPath, resource.path, resource.sha256);
    if (bytes.byteLength > img2ThreejsCompatibility.maxResourceBytes) throw diagnosticError("TN_IMG2THREEJS_OUTPUT_BUDGET_EXCEEDED", `Texture '${resource.path}' is ${bytes.byteLength} bytes; limit is ${img2ThreejsCompatibility.maxResourceBytes}.`);
    resources.push({ bytes, mimeType: sniffImageMime(bytes, resource.path), path: normalizeVirtualPath(resource.path) });
  }
  return { factorySource: factoryBytes.toString("utf8"), recipe, resources };
}

async function readVerifiedFile(projectPath: string, path: string, expected: string): Promise<Buffer> {
  try {
    const [projectRealPath, inputRealPath] = await Promise.all([realpath(projectPath), realpath(resolve(projectPath, path))]);
    const contained = relative(projectRealPath, inputRealPath);
    if (contained === ".." || contained.startsWith(`..${sep}`) || resolve(projectRealPath, contained) !== inputRealPath) throw new Error("outside project");
    const bytes = await readFile(inputRealPath);
    if (sha256(bytes) !== expected) throw new Error("hash mismatch");
    return bytes;
  } catch {
    throw diagnosticError("TN_IMG2THREEJS_INPUT_STALE", `Recorded img2threejs input changed after review: ${path}. Re-record the reviewed workspace before running.`);
  }
}

function normalizeVirtualPath(path: string): string {
  if (path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === "" || part === "." || part === "..") || /[?#%]/u.test(path)) throw diagnosticError("TN_IMG2THREEJS_RESOURCE_OUTSIDE_PROJECT", `Texture resource path '${path}' cannot be served by the isolated exporter.`);
  return path;
}

function sniffImageMime(bytes: Uint8Array, path: string): IImg2ThreejsBrowserResource["mimeType"] {
  const png = bytes.byteLength >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.byteLength >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  if (png) return "image/png";
  if (jpeg) return "image/jpeg";
  if (webp) return "image/webp";
  throw diagnosticError("TN_IMG2THREEJS_TEXTURE_LOAD_FAILED", `Texture '${path}' is not a valid PNG, JPEG, or WebP resource.`);
}

async function createAssetDocumentBytes(projectPath: string, temporary: string, assetPath: string, assetId: string, outputPath: string): Promise<Buffer> {
  const temporaryAsset = resolve(temporary, assetPath);
  try {
    const existing = await readFile(resolve(projectPath, assetPath));
    await mkdir(dirname(temporaryAsset), { recursive: true });
    await writeFile(temporaryAsset, existing);
  } catch {
    // addAsset owns the new-document shape.
  }
  const result = await addAsset({ assetId, file: assetPath, path: outputPath, projectPath: temporary, source: `generator:${assetId}`, type: "model" });
  if (!result.ok) throw diagnosticError("TN_IMG2THREEJS_ASSET_REGISTRATION_FAILED", result.diagnostics.map((diagnostic) => diagnostic.message).join(" "));
  return readFile(temporaryAsset);
}

function transactionFile(path: string, bytes: Buffer, baseHash: ReturnType<typeof hashAuthoringTransactionBytes> | null): { baseHash: ReturnType<typeof hashAuthoringTransactionBytes> | null; bytes: Buffer; path: string } {
  return { baseHash, bytes, path };
}

async function captureTransactionTarget(projectPath: string, path: string): Promise<{ baseHash: ReturnType<typeof hashAuthoringTransactionBytes> | null; bytes?: Buffer }> {
  try {
    const bytes = await readFile(resolve(projectPath, path));
    return { baseHash: hashAuthoringTransactionBytes(bytes), bytes };
  } catch {
    return { baseHash: null };
  }
}

function enforceBudget(label: string, observed: number, limit: number): void {
  if (observed > limit) throw diagnosticError("TN_IMG2THREEJS_OUTPUT_BUDGET_EXCEEDED", `Generated GLB has ${observed} ${label}; limit is ${limit}.`);
}

function loadValidator(): IGltfValidator {
  return createRequire(import.meta.url)("gltf-validator") as IGltfValidator;
}

function hashOutputs(outputs: Array<[string, Uint8Array]>): string {
  const hash = createHash("sha256");
  for (const [path, bytes] of outputs.sort(([left], [right]) => left.localeCompare(right))) hash.update(path).update("\0").update(bytes).update("\0");
  return `sha256:${hash.digest("hex")}`;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function failureFromError(projectPath: string, generatorId: string, error: unknown, path: string): IRunImg2ThreejsGeneratorResult {
  const value = error as { code?: unknown; message?: unknown };
  const result = failure(projectPath, generatorId, typeof value?.code === "string" ? value.code : "TN_IMG2THREEJS_RUN_FAILED", typeof value?.message === "string" ? value.message : String(error), path);
  if (Array.isArray((error as { proofFiles?: unknown }).proofFiles)) result.proofFiles = (error as { proofFiles: string[] }).proofFiles;
  if (isRecord((error as { visualMetrics?: unknown }).visualMetrics)) result.visualMetrics = (error as { visualMetrics: IImg2ThreejsVisualMetrics }).visualMetrics;
  return result;
}

function failure(projectPath: string, generatorId: string, code: string, message: string, path: string, diagnostics: IAuthoringDiagnostic[] = []): IRunImg2ThreejsGeneratorResult {
  return {
    code,
    diagnostics: [...diagnostics, { code, file: path, message, path, severity: "error", fix: { instruction: "Repair the reviewed generator input and retry; prior accepted output remains unchanged." } }],
    filesWritten: [],
    generatorId,
    message,
    ok: false,
    projectPath,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
