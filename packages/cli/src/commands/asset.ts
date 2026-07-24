import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";

import { addAsset, dispatchAuthoringOperation, recordBlenderGenerator, resolveGeneratorOverwritePolicy, type IAuthoringOperationResult } from "@threenative/authoring";
import { extractGltfAssetMetadata } from "@threenative/compiler";
import type { IGltfSceneAssetIr } from "@threenative/ir";

import { importPolyHavenAsset, listPolyHavenCategories, polyHavenStatus, searchPolyHaven, type IPolyHavenDependencies, type PolyHavenAssetType } from "../assetProviders/polyHaven.js";
import { assetProviderRegistry, findAssetProvider, renderAssetProviderHelp } from "../assetProviders/registry.js";
import { fetchSketchfabPreview, importSketchfabModel, searchSketchfab, sketchfabStatus, type ISketchfabDependencies } from "../assetProviders/sketchfab.js";
import { assetSourceRelevanceScore, exportAssetSourcesJsonl, getAssetSource, searchAssetSources, suggestAssetSources, type IAssetSourceRecord, type IAssetSourceSearchOptions } from "../assetSourceCatalog/catalog.js";
import { assetGenerationProviderRegistry, BLENDER_ASSET_GENERATION_PROVIDER, findAssetGenerationProvider, renderAssetGenerationProviderHelp } from "../assetGenerationProviders/registry.js";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { hyper3dStatus, importHyper3dJob, pollHyper3dJob, submitHyper3dJob, type IHyper3dDependencies } from "../modelProviders/hyper3d.js";
import { assetCreationStrategy, findModelProvider, modelProviderRegistry } from "../modelProviders/registry.js";
import { formatVec, formatVec2, rotateXZ } from "./asset/vectorPresentation.js";
import { assetImportCommand } from "./assetImport.js";
import { assetRepairCommand } from "./assetRepair.js";
import { generatorCommand, type IGeneratorCommandOptions } from "./sourceGeneratorCommand.js";

export interface IAssetCommandOptions extends IGeneratorCommandOptions {
  authoringDispatch?: typeof dispatchAuthoringOperation;
  hyper3dDependencies?: IHyper3dDependencies;
  polyHavenDependencies?: IPolyHavenDependencies;
  sketchfabDependencies?: ISketchfabDependencies;
}

export const ASSET_GENERATE_BLENDER_DESCRIPTOR = {
  assetIdPattern: BLENDER_ASSET_GENERATION_PROVIDER.assetIdPattern,
  usage: BLENDER_ASSET_GENERATION_PROVIDER.usage,
  mcp: BLENDER_ASSET_GENERATION_PROVIDER.mcp,
} as const;

export const ASSET_INSPECT_MCP_DESCRIPTOR = {
  argv: { arguments: [{ name: "assetPath", positional: true, resolveProjectPath: true }], prefix: ["asset", "inspect"] },
  description: "Inspect one project-local GLB/glTF through the same CLI parser and structured report.",
  inputSchema: { additionalProperties: false, properties: { assetPath: { pattern: "^(?:assets|content)/[^\\\\]+\\.(?:glb|gltf)$", type: "string" } }, required: ["assetPath"], type: "object" },
  name: "asset.inspect",
} as const;

const assetGenerateBlenderIdPattern = new RegExp(BLENDER_ASSET_GENERATION_PROVIDER.assetIdPattern, "u");

type Severity = "info" | "warning" | "error";

type Vec3 = [number, number, number];
type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
type ConnectorDirection = "east" | "north" | "south" | "west";
type XzBounds = { min: [number, number]; max: [number, number] };
type ConnectorPort = { direction: ConnectorDirection; interval: [number, number]; line: number };

interface GltfAsset {
  accessors?: Array<{ bufferView?: number; byteOffset?: number; componentType?: number; count?: number; min?: number[]; max?: number[]; type?: string }>;
  animations?: Array<{ channels?: unknown[]; name?: string; samplers?: unknown[] }>;
  asset?: { version?: string; generator?: string };
  bufferViews?: Array<{ buffer?: number; byteLength?: number; byteOffset?: number; byteStride?: number }>;
  buffers?: Array<{ uri?: string; byteLength?: number }>;
  images?: Array<{ uri?: string; bufferView?: number; mimeType?: string; name?: string }>;
  materials?: Array<{
    name?: string;
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      baseColorTexture?: { index?: number };
      metallicFactor?: number;
      metallicRoughnessTexture?: { index?: number };
      roughnessFactor?: number;
    };
  }>;
  meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number>; indices?: number; material?: number; mode?: number }> }>;
  nodes?: Array<{
    children?: number[];
    matrix?: number[];
    mesh?: number;
    name?: string;
    rotation?: number[];
    scale?: number[];
    translation?: number[];
  }>;
  scenes?: Array<{ nodes?: number[]; name?: string }>;
  scene?: number;
  textures?: unknown[];
}

interface AssetDiagnostic {
  code: string;
  fix?: { instruction: string; snippet: string };
  message: string;
  path?: string;
  severity: Severity;
}

interface DependencyReport {
  exists?: boolean;
  kind: "image" | "buffer";
  path?: string;
  uri?: string;
  embedded: boolean;
  missing?: boolean;
}

interface BoundsReport {
  center: Vec3;
  max: Vec3;
  min: Vec3;
  size: Vec3;
  source: "accessor-min-max";
}

interface ScaleCalibration {
  camera: {
    recommendedDistance: number;
    fovDegrees: number;
    near: number;
    far: number;
  };
  collider: {
    radiusForXZ: number;
    height: number;
  };
  fitScales: {
    targetHeight2m?: number;
    targetLength4m?: number;
    targetWidth1m?: number;
  };
  gameplay: {
    laneWidthMeters: number;
    widthToLaneRatio?: number;
    verdict: "ok" | "too-small" | "too-large" | "unknown";
  };
}

interface ModularPlacementReport {
  connectors?: {
    cardinalYaw: Array<{
      edges: ConnectorDirection[];
      yawDegrees: number;
      yawRadians: number;
    }>;
    local: ConnectorDirection[];
    roadBounds: {
      cardinalYaw: Array<{
        bounds: XzBounds;
        yawDegrees: number;
        yawRadians: number;
      }>;
      local: XzBounds;
    };
    roadPorts: {
      cardinalYaw: Array<{
        ports: ConnectorPort[];
        yawDegrees: number;
        yawRadians: number;
      }>;
      local: ConnectorPort[];
    };
    source: "material:road";
  };
  footprint: {
    axes: ["x", "z"];
    center: [number, number];
    max: [number, number];
    min: [number, number];
    size: [number, number];
  };
  originCorrection: Vec3;
  placement: {
    cardinalYaw: Array<{
      entityPositionForFootprintCenterAtOrigin: Vec3;
      yawDegrees: number;
      yawRadians: number;
    }>;
  };
  pivotOffsetFromFootprintCenter: [number, number];
  snap: {
    gridSize: [number, number];
    halfExtents: [number, number];
    suggestedCellSize: number;
  };
  y: {
    center: number;
    max: number;
    min: number;
    size: number;
  };
}

interface InspectReport {
  animationClips?: Array<{ channels: number; name: string; samplers: number }>;
  bounds?: BoundsReport;
  calibration?: ScaleCalibration;
  code: "TN_ASSET_INSPECT_OK" | "TN_ASSET_INSPECT_FAILED";
  counts?: {
    accessors: number;
    animations: number;
    buffers: number;
    images: number;
    materials: number;
    meshes: number;
    nodes: number;
    scenes: number;
    textures: number;
    triangles: number;
  };
  dependencies?: DependencyReport[];
  diagnostics: AssetDiagnostic[];
  file: {
    byteSize?: number;
    path: string;
    type: "glb" | "gltf" | "unknown";
  };
  gltf?: IGltfSceneAssetIr;
  message: string;
  materials?: Array<{
    baseColor: [number, number, number, number];
    baseColorTexture: boolean;
    metallic: number;
    metallicRoughnessTexture: boolean;
    name?: string;
    roughness: number;
  }>;
  modular?: ModularPlacementReport;
  namedNodes?: string[];
}

interface AssetCatalogReport {
  assets: InspectReport[];
  code: "TN_ASSET_CATALOG_OK" | "TN_ASSET_CATALOG_FAILED";
  diagnostics: AssetDiagnostic[];
  directory: {
    path: string;
    recursive: boolean;
  };
  message: string;
  summary: {
    errors: number;
    inspected: number;
    warnings: number;
  };
}

const identity: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export async function assetCommand(argv: readonly string[], options: IAssetCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const positionals = normalizedArgv.filter((arg, index) => !arg.startsWith("-") && !assetFlagsWithValues.has(normalizedArgv[index - 1] ?? ""));
  const [subcommand] = positionals;

  if (subcommand === "generate") {
    const assetId = positionals[1];
    const provider = readFlag(normalizedArgv, "--provider");
    const recipeInput = readFlag(normalizedArgv, "--recipe");
    if (normalizedArgv.includes("--help") || normalizedArgv.includes("-h")) {
      const payload = { code: "TN_ASSET_GENERATE_HELP", message: "Local asset-generation providers and their current availability.", providers: assetGenerationProviderRegistry };
      return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${renderAssetGenerationProviderHelp()}\n` };
    }
    const providerDescriptor = provider === undefined ? undefined : findAssetGenerationProvider(provider);
    if (provider !== undefined && providerDescriptor === undefined) {
      return diagnosticResult({
        code: "TN_ASSET_GENERATE_PROVIDER_UNKNOWN",
        message: `Unknown local asset-generation provider '${provider}'. Available providers: ${assetGenerationProviderRegistry.map((candidate) => candidate.id).join(", ")}.`,
      }, { exitCode: 2, json, stderr: !json });
    }
    if (assetId === undefined || providerDescriptor === undefined || recipeInput === undefined) {
      return diagnosticResult({
        code: "TN_ASSET_GENERATE_ARGS_MISSING",
        message: `Usage: ${renderAssetGenerationProviderHelp().replaceAll("\n              ", " or ")}.`,
      }, { exitCode: 2, json, stderr: !json });
    }
    if (!assetGenerateBlenderIdPattern.test(assetId)) {
      return diagnosticResult({
        code: "TN_ASSET_GENERATE_ASSET_ID_INVALID",
        message: `Asset generator id '${assetId}' must match ${BLENDER_ASSET_GENERATION_PROVIDER.assetIdPattern}.`,
      }, { exitCode: 2, json, stderr: !json });
    }
    let inlineRecipe: Record<string, unknown> | undefined;
    if (recipeInput.trimStart().startsWith("{")) {
      if (providerDescriptor.id === "img2threejs") {
        return diagnosticResult({ code: "TN_IMG2THREEJS_RECIPE_PATH_REQUIRED", message: "img2threejs generation requires a reviewed project-local recipe path; inline JSON is not accepted." }, { exitCode: 2, json, stderr: !json });
      }
      try {
        const parsed = JSON.parse(recipeInput) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("recipe JSON must be an object");
        inlineRecipe = parsed as Record<string, unknown>;
      } catch (error) {
        return diagnosticResult({ code: "TN_ASSET_GENERATE_RECIPE_JSON_INVALID", message: `Invalid inline Blender recipe JSON: ${error instanceof Error ? error.message : String(error)}` }, { exitCode: 2, json, stderr: !json });
      }
    }
    const projectPath = resolveProjectPath(normalizedArgv, options.cwd);
    const output = readFlag(normalizedArgv, "--out") ?? `assets/generated/${assetId}.glb`;
    const overwritePolicyResolution = await resolveGeneratorOverwritePolicy(
      projectPath,
      assetId,
      readFlag(normalizedArgv, "--overwrite-policy"),
    );
    const overwritePolicy = overwritePolicyResolution.policy;
    const assetConflict = await findAssetRegistrationConflict(projectPath, assetId, output);
    if (assetConflict !== undefined) {
      return diagnosticResult({
        code: "TN_ASSET_GENERATE_MANUAL_ASSET_CONFLICT",
        message: `Asset '${assetId}' is already declared in '${assetConflict}'. Local generation cannot take ownership of an existing declaration.`,
      }, { exitCode: 1, json, stderr: !json });
    }
    const provenancePath = resolve(projectPath, "content/generators", `${assetId}.generator.json`);
    if (providerDescriptor.id === "img2threejs") {
      const provenanceSnapshot = await snapshotAssetGenerateFile(provenancePath);
      let recorded: Awaited<ReturnType<typeof dispatchAuthoringOperation>>;
      try {
        recorded = await (options.authoringDispatch ?? dispatchAuthoringOperation)({
          args: { generatorId: assetId, output, overwritePolicy, recipePath: recipeInput },
          name: providerDescriptor.provenanceOperation,
          projectPath,
        });
      } catch {
        await restoreAssetGenerateFile(provenancePath, provenanceSnapshot).catch(() => undefined);
        return diagnosticResult({ code: "TN_ASSET_GENERATE_RECORD_FAILED", message: `img2threejs generator '${assetId}' could not be recorded; prior generator source was restored.` }, { exitCode: 1, json, stderr: !json });
      }
      if (!recorded.ok) {
        await restoreAssetGenerateFile(provenancePath, provenanceSnapshot);
        return renderAuthoringResult("asset", recorded, json, `Asset generator '${assetId}' recorded.`);
      }
      const recordedProvenance = await snapshotAssetGenerateFile(provenancePath);
      const run = await generatorCommand(["run", assetId, "--project", projectPath, ...(json ? ["--json"] : [])], options);
      if (run.exitCode !== 0) {
        await restoreAssetGenerateFileIfUnchanged(provenancePath, recordedProvenance, provenanceSnapshot);
      }
      return renderAssetGenerateRunResult(run, recorded.filesWritten, json);
    }
    const recipePath = inlineRecipe === undefined ? undefined : resolve(projectPath, "content/generators", `${assetId}.recipe.json`);
    const [provenanceSnapshot, recipeSnapshot] = await Promise.all([snapshotAssetGenerateFile(provenancePath), recipePath === undefined ? undefined : snapshotAssetGenerateFile(recipePath)]);
    let recorded: Awaited<ReturnType<typeof recordBlenderGenerator>>;
    try {
      recorded = await recordBlenderGenerator({
        generatorId: assetId,
        output,
        overwritePolicy,
        projectPath,
        providerVersion: BLENDER_ASSET_GENERATION_PROVIDER.providerVersion,
        ...(inlineRecipe === undefined ? { recipePath: recipeInput } : { recipe: inlineRecipe }),
      });
    } catch {
      await Promise.all([restoreAssetGenerateFile(provenancePath, provenanceSnapshot), recipePath === undefined ? Promise.resolve() : restoreAssetGenerateFile(recipePath, recipeSnapshot)]).catch(() => undefined);
      return diagnosticResult({ code: "TN_ASSET_GENERATE_RECORD_FAILED", message: `Asset generator '${assetId}' could not be recorded; prior generator source was restored.` }, { exitCode: 1, json, stderr: !json });
    }
    if (!recorded.ok) {
      await Promise.all([restoreAssetGenerateFile(provenancePath, provenanceSnapshot), recipePath === undefined ? Promise.resolve() : restoreAssetGenerateFile(recipePath, recipeSnapshot)]);
      return renderAuthoringResult("asset", recorded, json, `Asset generator '${assetId}' recorded.`);
    }
    const run = await generatorCommand(["run", assetId, "--project", projectPath, ...(json ? ["--json"] : [])], options);
    if (run.exitCode !== 0) {
      try {
        await Promise.all([restoreAssetGenerateFile(provenancePath, provenanceSnapshot), recipePath === undefined ? Promise.resolve() : restoreAssetGenerateFile(recipePath, recipeSnapshot)]);
      } catch {
        return diagnosticResult({
          code: "TN_ASSET_GENERATE_ROLLBACK_FAILED",
          message: `Asset generator '${assetId}' failed and its record step could not be fully restored. Inspect content/generators before retrying.`,
        }, { exitCode: 1, json, stderr: !json });
      }
    }
    return renderAssetGenerateRunResult(run, run.exitCode === 0 ? recorded.filesWritten : [], json);
  }

  if (subcommand === "source") {
    return assetSourceCommand(normalizedArgv.slice(1), json);
  }

  if (subcommand === "provider") {
    return assetProviderCommand(normalizedArgv.slice(1), json, options);
  }

  if (subcommand === "model-provider") {
    return assetModelProviderCommand(normalizedArgv.slice(1), json, options);
  }

  if (subcommand === "strategy") {
    const payload = { code: "TN_ASSET_CREATION_STRATEGY_OK", guidance: assetCreationStrategy, message: "Asset creation strategy loaded from the owning model-provider registry." };
    return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${assetCreationStrategy.map((row, index) => `${index + 1}. ${row}`).join("\n")}\n` };
  }

  if (subcommand === "import") {
    return assetImportCommand(normalizedArgv);
  }

  if (subcommand === "repair") {
    return assetRepairCommand(normalizedArgv);
  }

  if (subcommand === "add") {
    const assetId = positionals[1];
    const type = readFlag(normalizedArgv, "--type");
    const path = readFlag(normalizedArgv, "--path");
    const width = readNumberFlag(normalizedArgv, "--width");
    const height = readNumberFlag(normalizedArgv, "--height");
    const sampleCount = readNumberFlag(normalizedArgv, "--sample-count");
    if (width.diagnostic !== undefined || height.diagnostic !== undefined || sampleCount.diagnostic !== undefined) {
      return diagnosticResult(
        {
          code: "TN_ASSET_ADD_NUMERIC_FLAG_INVALID",
          message: width.diagnostic ?? height.diagnostic ?? sampleCount.diagnostic ?? "Asset numeric flags must be finite numbers.",
        },
        { exitCode: 2, json, stderr: !json },
      );
    }
    const missingPath = type !== "render-target" && path === undefined;
    const missingRenderTargetSize = type === "render-target" && (width.value === undefined || height.value === undefined);
    if (assetId === undefined || type === undefined || missingPath || missingRenderTargetSize) {
      return diagnosticResult(
        {
          code: "TN_ASSET_ADD_ARGS_MISSING",
          message: "Usage: tn asset add <asset-id> --type <audio|buffer|model|texture|render-target> --path <source-path> [--project <path>] [--json] or tn asset add <asset-id> --type render-target --width <n> --height <n> [--usage color|depth] [--format rgba8|rgba16f|depth24plus] [--sample-count <n>] [--project <path>] [--json].",
        },
        { exitCode: 2, json, stderr: !json },
      );
    }
    const projectPath = resolveProjectPath(normalizedArgv);
    return renderAuthoringResult(
      "asset",
      await addAsset({
        assetId,
        format: readFlag(normalizedArgv, "--format"),
        height: height.value,
        ...(path === undefined ? {} : { path }),
        projectPath,
        sampleCount: sampleCount.value,
        type,
        usage: readFlag(normalizedArgv, "--usage"),
        width: width.value,
      }),
      json,
      `Asset '${assetId}' added.`,
    );
  }

  if (subcommand !== "inspect") {
    return diagnosticResult(
      {
        code: "TN_ASSET_COMMAND_UNKNOWN",
        message: subcommand === undefined ? "Missing asset subcommand. Usage: tn asset inspect <path> [--json], tn asset add <asset-id> --type <type> --path <source-path> [--json], or tn asset source search [--json]." : `Unknown asset subcommand '${subcommand}'. Usage: tn asset inspect <path> [--json], tn asset add <asset-id> --type <type> --path <source-path> [--json], or tn asset source search [--json].`,
        subcommand,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const assetPathArg = positionals[1];
  if (assetPathArg === undefined) {
    return diagnosticResult(
      {
        code: "TN_ASSET_PATH_MISSING",
        message: "Missing asset path. Usage: tn asset inspect <path> [--json].",
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const cwd = process.env.INIT_CWD ?? process.cwd();
  const assetPath = isAbsolute(assetPathArg) ? assetPathArg : resolve(cwd, assetPathArg);
  const recursive = normalizedArgv.includes("--recursive");
  let pathStat;
  try {
    pathStat = await stat(assetPath);
  } catch {
    const report = await inspectAsset(assetPath);
    return {
      exitCode: 1,
      stdout: json ? `${JSON.stringify(report, null, 2)}\n` : renderInspectReport(report),
    };
  }

  if (pathStat.isDirectory()) {
    const report = await inspectAssetCatalog(assetPath, { recursive });
    const hasErrors = report.diagnostics.some((diagnostic) => diagnostic.severity === "error");
    return {
      exitCode: hasErrors ? 1 : 0,
      stdout: json ? `${JSON.stringify(report, null, 2)}\n` : renderCatalogReport(report),
    };
  }

  const report = await inspectAsset(assetPath);
  const hasErrors = report.diagnostics.some((diagnostic) => diagnostic.severity === "error");

  return {
    exitCode: hasErrors ? 1 : 0,
    stdout: json ? `${JSON.stringify(report, null, 2)}\n` : renderInspectReport(report),
  };
}

async function findAssetRegistrationConflict(projectPath: string, assetId: string, output: string): Promise<string | undefined> {
  const assetRoot = resolve(projectPath, "content/assets");
  const defaultDocument = resolve(assetRoot, `${assetId}.assets.json`);
  for (const path of await findAssetDeclarationFiles(assetRoot)) {
    try {
      const document = JSON.parse(await readFile(path, "utf8")) as { assets?: Array<{ id?: unknown; path?: unknown; source?: unknown }> };
      const asset = Array.isArray(document.assets) ? document.assets.find((candidate) => candidate.id === assetId) : undefined;
      if (asset !== undefined && (path !== defaultDocument || asset.source !== `generator:${assetId}` || asset.path !== output)) {
        return path.slice(projectPath.length + 1).split("\\").join("/");
      }
    } catch {
      // Authoring validation owns malformed-document diagnostics; unreadable rows cannot establish ownership.
    }
  }
  return undefined;
}

async function findAssetDeclarationFiles(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return []; }
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findAssetDeclarationFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".assets.json")) files.push(path);
  }
  return files;
}

async function snapshotAssetGenerateFile(path: string): Promise<Uint8Array | undefined> {
  try { return await readFile(path); } catch { return undefined; }
}

function renderAssetGenerateRunResult(run: ICommandResult, recordedFiles: string[], json: boolean): ICommandResult {
  if (!json || run.stdout.trim() === "") return run;
  const payload = JSON.parse(run.stdout) as Record<string, unknown>;
  return {
    ...run,
    stdout: `${JSON.stringify({
      ...payload,
      code: run.exitCode === 0 ? "TN_ASSET_GENERATE_OK" : payload.code,
      command: "asset generate",
      recordedFiles: run.exitCode === 0 ? recordedFiles : [],
    }, null, 2)}\n`,
  };
}

async function restoreAssetGenerateFile(path: string, snapshot: Uint8Array | undefined): Promise<void> {
  if (snapshot === undefined) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, snapshot);
}

async function restoreAssetGenerateFileIfUnchanged(path: string, expected: Uint8Array | undefined, snapshot: Uint8Array | undefined): Promise<boolean> {
  const current = await snapshotAssetGenerateFile(path);
  const unchanged = current === undefined || expected === undefined
    ? current === expected
    : Buffer.from(current).equals(Buffer.from(expected));
  if (!unchanged) return false;
  await restoreAssetGenerateFile(path, snapshot);
  return true;
}

async function assetSourceCommand(argv: readonly string[], json: boolean): Promise<ICommandResult> {
  const positionals = argv.filter((arg, index) => !arg.startsWith("-") && !assetFlagsWithValues.has(argv[index - 1] ?? ""));
  const action = positionals[0];
  try {
    if (action === "search") {
      const full = argv.includes("--full");
      const searchOptions: IAssetSourceSearchOptions = {
        directOnly: argv.includes("--direct-only"),
        fileRole: readFlag(argv, "--file-role"),
        format: readFlag(argv, "--format"),
        gameCategory: readFlag(argv, "--game-category"),
        includeBlocked: argv.includes("--include-blocked"),
        license: readFlag(argv, "--license"),
        limit: readLimitFlag(argv) ?? (full ? 20 : 10),
        query: readFlag(argv, "--query"),
        tag: readFlag(argv, "--tag"),
      };
      const records = await searchAssetSources(searchOptions);
      const fallbackRecords = records.length === 0 && searchOptions.directOnly === true && searchOptions.gameCategory !== undefined
        ? (await searchAssetSources({ ...searchOptions, directOnly: false, format: undefined, limit: 5 })).filter((record) => !record.isDirectDownload)
        : [];
      const payload = {
        code: records.length === 0 ? "TN_ASSET_SOURCE_NO_MATCH" : "TN_ASSET_SOURCE_SEARCH_OK",
        fallbackRecords: full ? fallbackRecords : compactAssetSourceRecords(fallbackRecords, searchOptions.query),
        message: records.length === 0
          ? fallbackRecords.length > 0
            ? "No direct asset source records matched. Review fallback pack or typed source records."
            : "No matching asset source records found. Try without --direct-only or consult docs/workflows/open-source-3d-asset-kits.md."
          : "Asset source search completed.",
        records: full ? records : compactAssetSourceRecords(records, searchOptions.query),
      };
      return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderAssetSourceSearch(records.length > 0 ? records : fallbackRecords, payload.message) };
    }

    if (action === "get") {
      const id = positionals[1];
      if (id === undefined) {
        return diagnosticResult({ code: "TN_ASSET_SOURCE_ID_MISSING", message: "Usage: tn asset source get <asset-source-id> [--json]." }, { exitCode: 2, json, stderr: !json });
      }
      const record = await getAssetSource(id);
      if (record === undefined) {
        return diagnosticResult({ code: "TN_ASSET_SOURCE_NOT_FOUND", message: `Asset source record '${id}' was not found.`, id }, { exitCode: 1, json, stderr: !json });
      }
      const payload = { code: "TN_ASSET_SOURCE_GET_OK", message: "Asset source record loaded.", record };
      return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderAssetSourceRecord(record) };
    }

    if (action === "suggest") {
      const goal = readFlag(argv, "--goal");
      if (goal === undefined) {
        return diagnosticResult({ code: "TN_ASSET_SOURCE_GOAL_MISSING", message: "Usage: tn asset source suggest --goal <text> [--json]." }, { exitCode: 2, json, stderr: !json });
      }
      const records = await suggestAssetSources(goal, { limit: readLimitFlag(argv) });
      const payload = {
        code: records.length === 0 ? "TN_ASSET_SOURCE_NO_SUGGESTION" : "TN_ASSET_SOURCE_SUGGEST_OK",
        goal,
        message: records.length === 0 ? "No asset source suggestions matched the goal. Try a concrete category or tag." : "Asset source suggestions completed.",
        records,
      };
      return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderAssetSourceSearch(records, payload.message) };
    }

    if (action === "export") {
      const format = readFlag(argv, "--format") ?? "jsonl";
      const out = readFlag(argv, "--out");
      if (format !== "jsonl" || out === undefined) {
        return diagnosticResult({ code: "TN_ASSET_SOURCE_EXPORT_ARGS_INVALID", message: "Usage: tn asset source export --format jsonl --out <path> [--json]." }, { exitCode: 2, json, stderr: !json });
      }
      const result = await exportAssetSourcesJsonl(isAbsolute(out) ? out : resolve(process.env.INIT_CWD ?? process.cwd(), out));
      const payload = { code: "TN_ASSET_SOURCE_EXPORT_OK", message: "Asset source catalog exported.", ...result };
      return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `Exported ${result.count} asset source records to ${result.outPath}\n` };
    }
  } catch (error) {
    return diagnosticResult(
      {
        code: "TN_ASSET_SOURCE_CATALOG_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  return diagnosticResult(
    {
      code: "TN_ASSET_SOURCE_COMMAND_UNKNOWN",
      message: "Usage: tn asset source search [--game-category <category>] [--file-role <role>] [--format glb] [--direct-only] [--json], tn asset source get <id> [--json], tn asset source suggest --goal <text> [--json], or tn asset source export --format jsonl --out <path> [--json].",
      action,
    },
    { exitCode: 2, json, stderr: !json },
  );
}

async function assetProviderCommand(argv: readonly string[], json: boolean, options: IAssetCommandOptions): Promise<ICommandResult> {
  const positionals = argv.filter((arg, index) => !arg.startsWith("-") && !assetFlagsWithValues.has(argv[index - 1] ?? ""));
  const action = positionals[0];
  const providerId = positionals[1];
  if (action === "help" || action === undefined) {
    const payload = { code: "TN_ASSET_PROVIDER_HELP", message: "Asset provider commands are registry-owned.", providers: assetProviderRegistry };
    return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${renderAssetProviderHelp()}\n` };
  }
  if (findAssetProvider(providerId ?? "") === undefined) {
    return diagnosticResult({ code: "TN_ASSET_PROVIDER_UNKNOWN", message: `Unknown asset provider '${providerId ?? ""}'.\n${renderAssetProviderHelp()}` }, { exitCode: 2, json, stderr: !json });
  }
  try {
    const live = argv.includes("--live");
    if (providerId === "sketchfab") {
      if (action === "status") return providerResult("TN_SKETCHFAB_STATUS_OK", await sketchfabStatus(live, options.sketchfabDependencies), json, "Sketchfab");
      if (action === "search") return providerResult("TN_SKETCHFAB_SEARCH_OK", await searchSketchfab({ cursor: readFlag(argv, "--cursor"), limit: readLimitFlag(argv), query: readFlag(argv, "--query") }, options.sketchfabDependencies), json, "Sketchfab");
      if (action === "preview") {
        const modelUid = positionals[2];
        if (modelUid === undefined) throw new Error(findAssetProvider("sketchfab")?.features.find((feature) => feature.operation === "preview")?.usage ?? "Sketchfab preview arguments are incomplete.");
        const preview = await fetchSketchfabPreview(modelUid, options.sketchfabDependencies);
        return providerResult("TN_SKETCHFAB_PREVIEW_OK", { image: { dataBase64: Buffer.from(preview.bytes).toString("base64"), mimeType: preview.mimeType, sha256: preview.sha256 }, uid: preview.uid }, json, "Sketchfab");
      }
      if (action === "import") {
        const modelUid = positionals[2]; const acceptedLicense = readFlag(argv, "--accept-license"); const targetSize = readFinitePositiveFlag(argv, "--target-size"); const assetId = readFlag(argv, "--id");
        if (modelUid === undefined || acceptedLicense === undefined || targetSize === undefined || assetId === undefined) throw new Error(findAssetProvider("sketchfab")?.features.find((feature) => feature.operation === "import")?.usage ?? "Sketchfab import arguments are incomplete.");
        return providerResult("TN_SKETCHFAB_IMPORT_OK", await importSketchfabModel({ acceptedLicense, assetId, maxBytes: readPositiveIntegerFlag(argv, "--max-bytes"), modelUid, projectPath: resolveProjectPath(argv, options.cwd), targetSize }, options.sketchfabDependencies), json, "Sketchfab");
      }
    }
    if (action === "status") return providerResult("TN_POLY_HAVEN_STATUS_OK", await polyHavenStatus(live, options.polyHavenDependencies), json);
    if (action === "categories") {
      const type = readFlag(argv, "--type") ?? "all";
      return providerResult("TN_POLY_HAVEN_CATEGORIES_OK", await listPolyHavenCategories({ live, limit: readLimitFlag(argv), type: type as PolyHavenAssetType }, options.polyHavenDependencies), json);
    }
    if (action === "search") {
      const type = readFlag(argv, "--type") ?? "all";
      return providerResult("TN_POLY_HAVEN_SEARCH_OK", await searchPolyHaven({ live, limit: readLimitFlag(argv), page: readPositiveIntegerFlag(argv, "--page"), query: readFlag(argv, "--query"), type: type as PolyHavenAssetType }, options.polyHavenDependencies), json);
    }
    if (action === "import") {
      const providerAssetId = positionals[2]; const type = readFlag(argv, "--type"); const resolution = readFlag(argv, "--resolution"); const format = readFlag(argv, "--format"); const assetId = readFlag(argv, "--id");
      if (providerAssetId === undefined || (type !== "models" && type !== "textures" && type !== "hdris") || resolution === undefined || format === undefined || assetId === undefined) throw new Error(findAssetProvider("poly-haven")?.features.find((feature) => feature.operation === "import")?.usage ?? "Poly Haven import arguments are incomplete.");
      return providerResult("TN_POLY_HAVEN_IMPORT_OK", await importPolyHavenAsset({ assetId, format, maxBytes: readPositiveIntegerFlag(argv, "--max-bytes"), projectPath: resolveProjectPath(argv, options.cwd), providerAssetId, resolution, type }, options.polyHavenDependencies), json);
    }
  } catch (error) {
    return diagnosticResult({ code: providerId === "sketchfab" ? "TN_SKETCHFAB_FAILED" : "TN_POLY_HAVEN_FAILED", message: error instanceof Error ? error.message : String(error) }, { exitCode: 1, json, stderr: !json });
  }
  return diagnosticResult({ code: "TN_ASSET_PROVIDER_COMMAND_UNKNOWN", message: renderAssetProviderHelp() }, { exitCode: 2, json, stderr: !json });
}

async function assetModelProviderCommand(argv: readonly string[], json: boolean, options: IAssetCommandOptions): Promise<ICommandResult> {
  const positionals = argv.filter((arg, index) => !arg.startsWith("-") && !assetFlagsWithValues.has(argv[index - 1] ?? ""));
  const action = positionals[0];
  const providerId = positionals[1];
  if (action === "help" || action === undefined) {
    return providerResult("TN_MODEL_PROVIDER_HELP", { providers: modelProviderRegistry }, json, "Model");
  }
  const provider = findModelProvider(providerId ?? "");
  if (provider === undefined) return diagnosticResult({ code: "TN_MODEL_PROVIDER_UNKNOWN", message: `Unknown model provider '${providerId ?? ""}'.` }, { exitCode: 2, json, stderr: !json });
  if (provider.status === "unsupported") {
    return providerResult("TN_MODEL_PROVIDER_UNSUPPORTED", { followUp: provider.followUp, provider: provider.id, reason: provider.unsupportedReason, state: "unsupported" }, json, provider.displayName);
  }
  try {
    if (action === "status") return providerResult("TN_MODEL_PROVIDER_STATUS_OK", await hyper3dStatus(argv.includes("--live"), options.hyper3dDependencies), json, provider.displayName);
    if (action === "generate") {
      const jobId = readFlag(argv, "--id");
      if (jobId === undefined) throw new Error(provider.features.find((feature) => feature.operation === "generate")?.usage ?? "Hyper3D generate arguments are incomplete.");
      const bboxText = readFlag(argv, "--bbox");
      const bbox = bboxText === undefined ? undefined : bboxText.split(",").map(Number);
      return providerResult("TN_MODEL_PROVIDER_JOB_SUBMITTED", await submitHyper3dJob({
        acceptCost: argv.includes("--accept-cost"),
        acceptTerms: argv.includes("--accept-provider-terms"),
        bbox,
        confirmInputRights: argv.includes("--confirm-input-rights"),
        image: readFlag(argv, "--image"),
        jobId,
        projectPath: resolveProjectPath(argv, options.cwd),
        prompt: readFlag(argv, "--prompt"),
      }, options.hyper3dDependencies), json, provider.displayName);
    }
    if (action === "poll") {
      const jobId = positionals[2];
      if (jobId === undefined) throw new Error(provider.features.find((feature) => feature.operation === "poll")?.usage ?? "Hyper3D poll arguments are incomplete.");
      return providerResult("TN_MODEL_PROVIDER_JOB_POLLED", await pollHyper3dJob({ jobId, projectPath: resolveProjectPath(argv, options.cwd) }, options.hyper3dDependencies), json, provider.displayName);
    }
    if (action === "import") {
      const jobId = positionals[2]; const assetId = readFlag(argv, "--id");
      if (jobId === undefined || assetId === undefined) throw new Error(provider.features.find((feature) => feature.operation === "import")?.usage ?? "Hyper3D import arguments are incomplete.");
      const targetSizeText = readFlag(argv, "--target-size");
      const targetSize = targetSizeText === undefined ? undefined : Number(targetSizeText);
      return providerResult("TN_MODEL_PROVIDER_IMPORT_OK", await importHyper3dJob({ assetId, jobId, projectPath: resolveProjectPath(argv, options.cwd), targetSize }, options.hyper3dDependencies), json, provider.displayName);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = /^(TN_[A-Z0-9_]+):/u.exec(message)?.[1] ?? "TN_MODEL_PROVIDER_FAILED";
    return diagnosticResult({ code, message }, { exitCode: 1, json, stderr: !json });
  }
  return diagnosticResult({ code: "TN_MODEL_PROVIDER_COMMAND_UNKNOWN", message: `Model provider '${provider.id}' does not support '${action ?? ""}'.` }, { exitCode: 2, json, stderr: !json });
}

function providerResult(code: string, result: Record<string, unknown>, json: boolean, provider = "Poly Haven"): ICommandResult {
  const payload = { code, message: `${provider} provider operation completed.`, ...result };
  return { exitCode: 0, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${JSON.stringify(payload, null, 2)}\n` };
}

function compactAssetSourceRecords(records: readonly IAssetSourceRecord[], query: string | undefined): Array<Record<string, unknown>> {
  return records.map((record) => ({
    direct: record.isDirectDownload,
    format: record.format,
    id: record.id,
    license: record.licenseId,
    name: record.directName || record.name,
    note: record.importNotes || record.notes,
    score: query === undefined ? 0 : Number(assetSourceRelevanceScore(record, query).toFixed(3)),
  }));
}

function readLimitFlag(argv: readonly string[]): number | undefined {
  const limit = readFlag(argv, "--limit");
  if (limit === undefined) {
    return undefined;
  }
  const parsed = Number(limit);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readPositiveIntegerFlag(argv: readonly string[], flag: string): number | undefined {
  const value = readFlag(argv, flag); if (value === undefined) return undefined;
  const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readFinitePositiveFlag(argv: readonly string[], flag: string): number | undefined {
  const value = readFlag(argv, flag); if (value === undefined) return undefined;
  const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function renderAssetSourceSearch(records: IAssetSourceRecord[], emptyMessage: string): string {
  if (records.length === 0) {
    return `${emptyMessage}\n`;
  }
  const rows = records.map((record) => {
    const direct = record.isDirectDownload ? "direct" : "pack";
    const url = record.downloadUrl ?? record.sourceUrl;
    return `${record.id}  ${direct.padEnd(6)}  ${record.gameCategory.padEnd(18)}  ${record.format.padEnd(7)}  ${record.licenseId.padEnd(10)}  ${url}`;
  });
  return `Asset source records\n\n${rows.join("\n")}\n`;
}

function renderAssetSourceRecord(record: IAssetSourceRecord): string {
  return [
    `${record.id}: ${record.directName}`,
    `category: ${record.gameCategory}`,
    `format: ${record.format}`,
    `license: ${record.licenseId} (${record.licensePosture})`,
    `download: ${record.downloadUrl ?? "not direct"}`,
    `source: ${record.sourceUrl}`,
    `provenance: ${record.provenanceUrl}`,
    `origin: ${record.origin.originName} (${record.origin.reviewStatus})`,
    `next: ${record.recommendedNextCommand}`,
    "",
  ].join("\n");
}

function renderAuthoringResult(group: string, result: IAuthoringOperationResult, json: boolean, successMessage: string): ICommandResult {
  const payload = {
    code: result.ok ? `TN_${group.toUpperCase()}_OK` : `TN_${group.toUpperCase()}_FAILED`,
    message: result.ok ? successMessage : `${group} operation failed.`,
    ...result,
  };
  if (json) {
    return { exitCode: result.ok ? 0 : 1, stdout: `${JSON.stringify(payload, null, 2)}\n` };
  }
  if (result.ok) {
    return { exitCode: 0, stdout: `${successMessage}\n` };
  }
  const diagnostics = result.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return { exitCode: 1, stderr: `${payload.message}\n${diagnostics}\n`, stdout: "" };
}

function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const project = readFlag(argv, "--project") ?? ".";
  return isAbsolute(project) ? project : resolve(cwd, project);
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function readNumberFlag(argv: readonly string[], flag: string): { diagnostic?: string; value?: number } {
  const value = readFlag(argv, flag);
  if (value === undefined) {
    return {};
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { diagnostic: `Asset ${flag} must be a finite number.` };
  }
  return { value: parsed };
}

const assetFlagsWithValues = new Set(["--accept-license", "--bbox", "--cursor", "--file-role", "--format", "--game-category", "--goal", "--height", "--id", "--image", "--license", "--limit", "--max-bytes", "--out", "--overwrite-policy", "--page", "--path", "--project", "--prompt", "--provider", "--query", "--recipe", "--resolution", "--sample-count", "--tag", "--target-size", "--type", "--usage", "--width"]);

export async function inspectAsset(assetPath: string): Promise<InspectReport> {
  const extension = extname(assetPath).toLowerCase();
  const type = extension === ".glb" ? "glb" : extension === ".gltf" ? "gltf" : "unknown";
  const diagnostics: AssetDiagnostic[] = [];
  let byteSize: number | undefined;

  try {
    byteSize = (await stat(assetPath)).size;
  } catch {
    return {
      code: "TN_ASSET_INSPECT_FAILED",
      diagnostics: [{ code: "TN_ASSET_FILE_MISSING", message: "Asset file was not found.", path: assetPath, severity: "error" }],
      file: { path: assetPath, type },
      message: "Asset inspection failed.",
    };
  }

  if (type === "unknown") {
    return {
      code: "TN_ASSET_INSPECT_FAILED",
      diagnostics: [{ code: "TN_ASSET_TYPE_UNSUPPORTED", message: "Only .glb and .gltf assets can be inspected.", path: assetPath, severity: "error" }],
      file: { byteSize, path: assetPath, type },
      message: "Asset inspection failed.",
    };
  }

  let binaryChunk: Buffer | undefined;
  let gltf: GltfAsset;
  try {
    if (type === "glb") {
      const parsed = parseGlb(await readFile(assetPath));
      gltf = parsed.gltf;
      binaryChunk = parsed.binaryChunk;
    } else {
      gltf = JSON.parse(await readFile(assetPath, "utf8")) as GltfAsset;
    }
  } catch (error) {
    diagnostics.push({
      code: "TN_ASSET_PARSE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      path: assetPath,
      severity: "error",
    });
    return { code: "TN_ASSET_INSPECT_FAILED", diagnostics, file: { byteSize, path: assetPath, type }, message: "Asset inspection failed." };
  }

  const dependencies = await inspectDependencies(assetPath, gltf, type);
  for (const dependency of dependencies) {
    if (dependency.missing === true) {
      diagnostics.push({
        code: dependency.kind === "image" ? "TN_ASSET_IMAGE_MISSING" : "TN_ASSET_BUFFER_MISSING",
        message: `External ${dependency.kind} dependency is missing: ${dependency.uri ?? dependency.path}.`,
        path: dependency.path,
        severity: "error",
      });
    }
  }

  const bounds = computeBounds(gltf, diagnostics);
  const calibration = bounds === undefined ? undefined : computeCalibration(bounds, diagnostics);
  const modular = bounds === undefined ? undefined : computeModularPlacement(bounds, diagnostics, computeRoadConnectors(gltf, binaryChunk, bounds));
  const gltfMetadata = extractGltfAssetMetadata(assetIdForInspect(assetPath), gltf as Parameters<typeof extractGltfAssetMetadata>[1]);
  diagnostics.push(...gltfMetadataDiagnostics(gltfMetadata));

  const report: InspectReport = {
    animationClips: (gltf.animations ?? []).map((animation, index) => ({
      channels: animation.channels?.length ?? 0,
      name: animation.name ?? `animation-${index}`,
      samplers: animation.samplers?.length ?? 0,
    })),
    bounds,
    calibration,
    code: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "TN_ASSET_INSPECT_FAILED" : "TN_ASSET_INSPECT_OK",
    counts: {
      accessors: gltf.accessors?.length ?? 0,
      animations: gltf.animations?.length ?? 0,
      buffers: gltf.buffers?.length ?? 0,
      images: gltf.images?.length ?? 0,
      materials: gltf.materials?.length ?? 0,
      meshes: gltf.meshes?.length ?? 0,
      nodes: gltf.nodes?.length ?? 0,
      scenes: gltf.scenes?.length ?? 0,
      textures: gltf.textures?.length ?? 0,
      triangles: countTriangles(gltf),
    },
    dependencies,
    diagnostics,
    file: { byteSize, path: assetPath, type },
    gltf: gltfMetadata,
    message: "Asset inspection completed.",
    materials: (gltf.materials ?? []).map((material) => ({
      baseColor: normalizedColorFactor(material.pbrMetallicRoughness?.baseColorFactor),
      baseColorTexture: material.pbrMetallicRoughness?.baseColorTexture?.index !== undefined,
      metallic: material.pbrMetallicRoughness?.metallicFactor ?? 1,
      metallicRoughnessTexture: material.pbrMetallicRoughness?.metallicRoughnessTexture?.index !== undefined,
      ...(material.name === undefined ? {} : { name: material.name }),
      roughness: material.pbrMetallicRoughness?.roughnessFactor ?? 1,
    })),
    modular,
    namedNodes: (gltf.nodes ?? []).map((node) => node.name).filter((name): name is string => typeof name === "string").sort(),
  };

  return report;
}

function normalizedColorFactor(value: number[] | undefined): [number, number, number, number] {
  return [value?.[0] ?? 1, value?.[1] ?? 1, value?.[2] ?? 1, value?.[3] ?? 1];
}

function countTriangles(gltf: GltfAsset): number {
  let triangles = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const mode = primitive.mode ?? 4;
      const count = primitive.indices === undefined
        ? gltf.accessors?.[primitive.attributes?.POSITION ?? -1]?.count ?? 0
        : gltf.accessors?.[primitive.indices]?.count ?? 0;
      if (mode === 4) triangles += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
    }
  }
  return triangles;
}

function assetIdForInspect(assetPath: string): string {
  return `asset:${basename(assetPath, extname(assetPath))}`;
}

function gltfMetadataDiagnostics(metadata: IGltfSceneAssetIr): AssetDiagnostic[] {
  const diagnostics: AssetDiagnostic[] = [];
  for (const material of metadata.materials) {
    for (const extension of material.extensions) {
      if (extension.status !== "unsupported") {
        continue;
      }
      diagnostics.push({
        code: extension.properties.includes("processor") ? "TN_ASSET_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED" : "TN_ASSET_GLTF_EXTENSION_UNSUPPORTED",
        fix: { instruction: "Strip unsupported material extensions while preserving promoted extensions.", snippet: "tn asset repair <path> --strip-extensions" },
        message: `glTF material extension '${extension.extension}' on ${material.material} is not portable; preserve it as inspection metadata or author supported ThreeNative material data.`,
        path: extension.path,
        severity: "warning",
      });
    }
  }
  return diagnostics;
}

async function inspectAssetCatalog(directoryPath: string, options: { recursive: boolean }): Promise<AssetCatalogReport> {
  const assetPaths = await findInspectableAssets(directoryPath, options.recursive);
  const assets = [];
  for (const assetPath of assetPaths) {
    assets.push(await inspectAsset(assetPath));
  }

  const diagnostics = assets.flatMap((asset) => asset.diagnostics.map((diagnostic) => ({ ...diagnostic, path: diagnostic.path ?? asset.file.path })));
  if (assets.length === 0) {
    diagnostics.push({
      code: "TN_ASSET_CATALOG_EMPTY",
      message: "No .glb or .gltf assets were found in the inspected directory.",
      path: directoryPath,
      severity: "error",
    });
  }
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length;
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;

  return {
    assets,
    code: errors === 0 ? "TN_ASSET_CATALOG_OK" : "TN_ASSET_CATALOG_FAILED",
    diagnostics,
    directory: { path: directoryPath, recursive: options.recursive },
    message: errors === 0 ? "Asset catalog inspection completed." : "Asset catalog inspection failed.",
    summary: {
      errors,
      inspected: assets.length,
      warnings,
    },
  };
}

async function findInspectableAssets(directoryPath: string, recursive: boolean): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        paths.push(...await findInspectableAssets(entryPath, recursive));
      }
      continue;
    }
    const extension = extname(entry.name).toLowerCase();
    if (extension === ".glb" || extension === ".gltf") {
      paths.push(entryPath);
    }
  }
  return paths.sort((a, b) => a.localeCompare(b));
}

function parseGlb(buffer: Buffer): { binaryChunk?: Buffer; gltf: GltfAsset } {
  if (buffer.length < 20) {
    throw new Error("GLB file is too small to contain a JSON chunk.");
  }
  if (buffer.readUInt32LE(0) !== 0x46546c67) {
    throw new Error("Invalid GLB magic header.");
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version ${version}; expected version 2.`);
  }
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength > buffer.length) {
    throw new Error("GLB declared length exceeds file size.");
  }
  let offset = 12;
  let binaryChunk: Buffer | undefined;
  let gltf: GltfAsset | undefined;
  while (offset + 8 <= declaredLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > buffer.length) {
      throw new Error("GLB chunk exceeds file size.");
    }
    if (chunkType === 0x4e4f534a) {
      gltf = JSON.parse(buffer.subarray(chunkStart, chunkEnd).toString("utf8").trim()) as GltfAsset;
    } else if (chunkType === 0x004e4942) {
      binaryChunk = buffer.subarray(chunkStart, chunkEnd);
    }
    offset = chunkEnd + ((4 - (chunkLength % 4)) % 4);
  }
  if (gltf === undefined) {
    throw new Error("GLB JSON chunk was not found.");
  }
  return { binaryChunk, gltf };
}

async function inspectDependencies(assetPath: string, gltf: GltfAsset, type: "glb" | "gltf"): Promise<DependencyReport[]> {
  const base = dirname(assetPath);
  const reports: DependencyReport[] = [];
  for (const image of gltf.images ?? []) {
    if (image.uri === undefined) {
      reports.push({ embedded: true, kind: "image", uri: image.name, exists: true });
      continue;
    }
    reports.push(await inspectUri(base, image.uri, "image"));
  }
  for (const buffer of gltf.buffers ?? []) {
    if (buffer.uri === undefined) {
      reports.push({ embedded: true, kind: "buffer", exists: true });
      continue;
    }
    // A GLB BIN chunk is embedded; a .gltf buffer URI is external unless it is a data URI.
    reports.push(await inspectUri(base, buffer.uri, "buffer", type === "glb"));
  }
  return reports;
}

async function inspectUri(base: string, uri: string, kind: "image" | "buffer", glbEmbedded = false): Promise<DependencyReport> {
  if (glbEmbedded && uri.length === 0) {
    return { embedded: true, exists: true, kind, uri };
  }
  if (/^data:/i.test(uri)) {
    return { embedded: true, exists: true, kind, uri };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
    return { embedded: false, kind, uri };
  }
  const path = resolve(base, decodeURIComponent(uri));
  const exists = await fileExists(path);
  return { embedded: false, exists, kind, missing: !exists, path, uri };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function computeBounds(gltf: GltfAsset, diagnostics: AssetDiagnostic[]): BoundsReport | undefined {
  const nodes = gltf.nodes ?? [];
  const scenes = gltf.scenes ?? [];
  const rootNodeIndices = scenes[gltf.scene ?? 0]?.nodes ?? nodes.map((_, index) => index);
  let min: Vec3 | undefined;
  let max: Vec3 | undefined;

  const visit = (nodeIndex: number, parent: Mat4, stack: Set<number>): void => {
    const node = nodes[nodeIndex];
    if (node === undefined || stack.has(nodeIndex)) {
      return;
    }
    const currentStack = new Set(stack).add(nodeIndex);
    const transform = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes?.[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        const accessorIndex = primitive.attributes?.POSITION;
        const accessor = accessorIndex === undefined ? undefined : gltf.accessors?.[accessorIndex];
        if (accessor?.min?.length === 3 && accessor.max?.length === 3) {
          const transformed = transformBounds(accessor.min as Vec3, accessor.max as Vec3, transform);
          min = min === undefined ? transformed.min : vecMin(min, transformed.min);
          max = max === undefined ? transformed.max : vecMax(max, transformed.max);
        } else {
          diagnostics.push({
            code: "TN_ASSET_BOUNDS_MISSING",
            message: `Mesh ${node.mesh} has a POSITION accessor without min/max bounds; geometry was not decoded.`,
            severity: "warning",
          });
        }
      }
    }
    for (const child of node.children ?? []) {
      visit(child, transform, currentStack);
    }
  };

  for (const root of rootNodeIndices) {
    visit(root, identity, new Set());
  }

  if (min === undefined || max === undefined) {
    diagnostics.push({ code: "TN_ASSET_BOUNDS_UNAVAILABLE", message: "No mesh POSITION accessor min/max bounds were found.", severity: "warning" });
    return undefined;
  }

  const size = subtract(max, min);
  const center = scale(add(min, max), 0.5);
  const diagonal = length(size);
  if (diagonal < 0.001) {
    diagnostics.push({ code: "TN_ASSET_SCALE_NEAR_ZERO", message: "Model bounds are near zero and may be invisible at normal camera distances.", severity: "warning" });
  }
  const largest = Math.max(...size);
  if (largest > 1000) {
    diagnostics.push({ code: "TN_ASSET_SCALE_HUGE", message: "Model bounds are very large for meter-scale gameplay; apply calibration scale before placing it in a scene.", severity: "warning" });
  }
  if (Math.max(Math.abs(center[0]), Math.abs(center[1]), Math.abs(center[2])) > Math.max(largest * 2, 10)) {
    diagnostics.push({ code: "TN_ASSET_PIVOT_FAR", message: "Model origin/pivot is far from computed bounds and can make camera framing or collisions confusing.", severity: "warning" });
  }
  return { center, max, min, size, source: "accessor-min-max" };
}

function computeCalibration(bounds: BoundsReport, diagnostics: AssetDiagnostic[]): ScaleCalibration {
  const [width, height, depth] = bounds.size;
  const largest = Math.max(width, height, depth);
  const lengthAxis = Math.max(width, depth);
  const distance = round(largest <= 0 ? 5 : Math.max(1, largest * 1.8));
  const widthToLaneRatio = width > 0 ? round(width / 3.5) : undefined;
  let verdict: ScaleCalibration["gameplay"]["verdict"] = "unknown";
  if (widthToLaneRatio !== undefined) {
    verdict = widthToLaneRatio < 0.05 ? "too-small" : widthToLaneRatio > 1.5 ? "too-large" : "ok";
  }
  if (verdict === "too-small") {
    diagnostics.push({ code: "TN_ASSET_GAMEPLAY_TOO_SMALL", message: "Model width is tiny relative to a 3.5m gameplay lane; consider applying the target scale in the calibration report.", severity: "warning" });
  } else if (verdict === "too-large") {
    diagnostics.push({ code: "TN_ASSET_GAMEPLAY_TOO_LARGE", message: "Model width is larger than expected for a 3.5m gameplay lane; consider down-scaling or widening authored gameplay units.", severity: "warning" });
  }

  return {
    camera: { fovDegrees: 50, far: round(Math.max(100, distance * 4)), near: 0.01, recommendedDistance: distance },
    collider: { height: round(height), radiusForXZ: round(Math.max(width, depth) / 2) },
    fitScales: {
      targetHeight2m: height > 0 ? round(2 / height) : undefined,
      targetLength4m: lengthAxis > 0 ? round(4 / lengthAxis) : undefined,
      targetWidth1m: width > 0 ? round(1 / width) : undefined,
    },
    gameplay: { laneWidthMeters: 3.5, verdict, widthToLaneRatio },
  };
}

function computeModularPlacement(bounds: BoundsReport, diagnostics: AssetDiagnostic[], road?: { bounds: XzBounds; connectors: ConnectorDirection[]; ports: ConnectorPort[] }): ModularPlacementReport {
  const footprintMin: [number, number] = [bounds.min[0], bounds.min[2]];
  const footprintMax: [number, number] = [bounds.max[0], bounds.max[2]];
  const footprintSize: [number, number] = [round(footprintMax[0] - footprintMin[0]), round(footprintMax[1] - footprintMin[1])];
  const footprintCenter: [number, number] = [round((footprintMin[0] + footprintMax[0]) / 2), round((footprintMin[1] + footprintMax[1]) / 2)];
  const pivotOffset: [number, number] = [footprintCenter[0], footprintCenter[1]];
  const suggestedCellSize = round(Math.max(footprintSize[0], footprintSize[1]));
  const largestOffset = Math.max(Math.abs(pivotOffset[0]), Math.abs(pivotOffset[1]));
  const largestSize = Math.max(footprintSize[0], footprintSize[1]);
  if (largestOffset > Math.max(0.001, largestSize * 0.1)) {
    diagnostics.push({
      code: "TN_ASSET_MODULAR_PIVOT_OFFSET",
      message: `Model footprint center is offset from the entity origin by [${pivotOffset.map((value) => round(value)).join(", ")}] on X/Z; center-based grid placement needs an origin correction.`,
      severity: "warning",
    });
  }
  return {
    ...(road === undefined ? {} : {
      connectors: {
        cardinalYaw: [0, 90, 180, 270].map((yawDegrees) => {
          const yawRadiansExact = yawDegrees * Math.PI / 180;
          return {
            edges: road.connectors.map((connector) => rotateConnector(connector, yawDegrees)).sort(),
            yawDegrees,
            yawRadians: round(yawRadiansExact),
          };
        }),
        local: road.connectors,
        roadBounds: {
          cardinalYaw: [0, 90, 180, 270].map((yawDegrees) => {
            const yawRadiansExact = yawDegrees * Math.PI / 180;
            return {
              bounds: rotateXzBounds(road.bounds, yawRadiansExact),
              yawDegrees,
              yawRadians: round(yawRadiansExact),
            };
          }),
          local: road.bounds,
        },
        roadPorts: {
          cardinalYaw: [0, 90, 180, 270].map((yawDegrees) => {
            const yawRadiansExact = yawDegrees * Math.PI / 180;
            return {
              ports: road.ports.map((port) => rotateConnectorPort(port, yawDegrees, yawRadiansExact)).sort((a, b) => a.direction.localeCompare(b.direction)),
              yawDegrees,
              yawRadians: round(yawRadiansExact),
            };
          }),
          local: road.ports,
        },
        source: "material:road" as const,
      },
    }),
    footprint: {
      axes: ["x", "z"],
      center: footprintCenter,
      max: footprintMax,
      min: footprintMin,
      size: footprintSize,
    },
    originCorrection: [round(-footprintCenter[0]), round(-bounds.center[1]), round(-footprintCenter[1])],
    placement: {
      cardinalYaw: [0, 90, 180, 270].map((yawDegrees) => {
        const yawRadiansExact = yawDegrees * Math.PI / 180;
        const yawRadians = round(yawRadiansExact);
        const rotatedCenter = rotateXZ(footprintCenter, yawRadiansExact);
        return {
          entityPositionForFootprintCenterAtOrigin: [round(-rotatedCenter[0]), round(-bounds.center[1]), round(-rotatedCenter[1])],
          yawDegrees,
          yawRadians,
        };
      }),
    },
    pivotOffsetFromFootprintCenter: pivotOffset,
    snap: {
      gridSize: footprintSize,
      halfExtents: [round(footprintSize[0] / 2), round(footprintSize[1] / 2)],
      suggestedCellSize,
    },
    y: {
      center: bounds.center[1],
      max: bounds.max[1],
      min: bounds.min[1],
      size: bounds.size[1],
    },
  };
}

function computeRoadConnectors(gltf: GltfAsset, binaryChunk: Buffer | undefined, bounds: BoundsReport): { bounds: XzBounds; connectors: ConnectorDirection[]; ports: ConnectorPort[] } | undefined {
  if (binaryChunk === undefined) {
    return undefined;
  }
  const roadGeometry = computeMaterialGeometry(gltf, binaryChunk, "road");
  if (roadGeometry === undefined) {
    return undefined;
  }
  const roadBounds = roadGeometry.bounds;
  const footprintMin: [number, number] = [bounds.min[0], bounds.min[2]];
  const footprintMax: [number, number] = [bounds.max[0], bounds.max[2]];
  const footprintSize: [number, number] = [footprintMax[0] - footprintMin[0], footprintMax[1] - footprintMin[1]];
  const tolerance = Math.max(0.001, Math.max(footprintSize[0], footprintSize[1]) * 0.03);
  const connectors: ConnectorDirection[] = [];
  const ports: ConnectorPort[] = [];
  if (Math.abs(roadBounds.max[2] - footprintMax[1]) <= tolerance) {
    connectors.push("north");
    ports.push(connectorPortFromPoints("north", roadGeometry.points, roadBounds.max[2], tolerance, roadBounds));
  }
  if (Math.abs(roadBounds.min[2] - footprintMin[1]) <= tolerance) {
    connectors.push("south");
    ports.push(connectorPortFromPoints("south", roadGeometry.points, roadBounds.min[2], tolerance, roadBounds));
  }
  if (Math.abs(roadBounds.max[0] - footprintMax[0]) <= tolerance) {
    connectors.push("east");
    ports.push(connectorPortFromPoints("east", roadGeometry.points, roadBounds.max[0], tolerance, roadBounds));
  }
  if (Math.abs(roadBounds.min[0] - footprintMin[0]) <= tolerance) {
    connectors.push("west");
    ports.push(connectorPortFromPoints("west", roadGeometry.points, roadBounds.min[0], tolerance, roadBounds));
  }
  return connectors.length === 0
    ? undefined
    : {
      bounds: {
        min: [round(roadBounds.min[0]), round(roadBounds.min[2])],
        max: [round(roadBounds.max[0]), round(roadBounds.max[2])],
      },
      connectors: connectors.sort(),
      ports: ports.sort((a, b) => a.direction.localeCompare(b.direction)),
    };
}

function connectorPortFromPoints(direction: ConnectorDirection, points: Vec3[], line: number, tolerance: number, bounds: { min: Vec3; max: Vec3 }): ConnectorPort {
  const edgePoints = points.filter((point) => {
    if (direction === "east" || direction === "west") {
      return Math.abs(point[0] - line) <= tolerance;
    }
    return Math.abs(point[2] - line) <= tolerance;
  });
  const values = edgePoints.map((point) => direction === "east" || direction === "west" ? point[2] : point[0]);
  if (values.length === 0) {
    return direction === "east" || direction === "west"
      ? { direction, interval: [round(bounds.min[2]), round(bounds.max[2])], line: round(line) }
      : { direction, interval: [round(bounds.min[0]), round(bounds.max[0])], line: round(line) };
  }
  return {
    direction,
    interval: [round(Math.min(...values)), round(Math.max(...values))],
    line: round(line),
  };
}

function rotateXzBounds(bounds: XzBounds, yawRadians: number): XzBounds {
  const corners = [
    [bounds.min[0], bounds.min[1]],
    [bounds.min[0], bounds.max[1]],
    [bounds.max[0], bounds.min[1]],
    [bounds.max[0], bounds.max[1]],
  ] as Array<[number, number]>;
  const rotated = corners.map((corner) => rotateXZ(corner, yawRadians));
  return {
    min: [round(Math.min(...rotated.map((point) => point[0]))), round(Math.min(...rotated.map((point) => point[1])))],
    max: [round(Math.max(...rotated.map((point) => point[0]))), round(Math.max(...rotated.map((point) => point[1])))],
  };
}

function rotateConnectorPort(port: ConnectorPort, yawDegrees: number, yawRadians: number): ConnectorPort {
  const direction = rotateConnector(port.direction, yawDegrees);
  const a = port.direction === "east" || port.direction === "west" ? [port.line, port.interval[0]] : [port.interval[0], port.line];
  const b = port.direction === "east" || port.direction === "west" ? [port.line, port.interval[1]] : [port.interval[1], port.line];
  const rotatedA = rotateXZ(a as [number, number], yawRadians);
  const rotatedB = rotateXZ(b as [number, number], yawRadians);
  if (direction === "east" || direction === "west") {
    return {
      direction,
      interval: [round(Math.min(rotatedA[1], rotatedB[1])), round(Math.max(rotatedA[1], rotatedB[1]))],
      line: round(rotatedA[0]),
    };
  }
  return {
    direction,
    interval: [round(Math.min(rotatedA[0], rotatedB[0])), round(Math.max(rotatedA[0], rotatedB[0]))],
    line: round(rotatedA[1]),
  };
}

function computeMaterialGeometry(gltf: GltfAsset, binaryChunk: Buffer, materialName: string): { bounds: { min: Vec3; max: Vec3 }; points: Vec3[] } | undefined {
  const nodes = gltf.nodes ?? [];
  const scenes = gltf.scenes ?? [];
  const rootNodeIndices = scenes[gltf.scene ?? 0]?.nodes ?? nodes.map((_, index) => index);
  let min: Vec3 | undefined;
  let max: Vec3 | undefined;
  const points: Vec3[] = [];

  const visit = (nodeIndex: number, parent: Mat4, stack: Set<number>): void => {
    const node = nodes[nodeIndex];
    if (node === undefined || stack.has(nodeIndex)) {
      return;
    }
    const currentStack = new Set(stack).add(nodeIndex);
    const transform = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes?.[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        const primitiveMaterialName = primitive.material === undefined ? undefined : gltf.materials?.[primitive.material]?.name;
        if (primitiveMaterialName !== materialName || primitive.attributes?.POSITION === undefined) {
          continue;
        }
        const positions = readAccessor(gltf, binaryChunk, primitive.attributes.POSITION) as Vec3[] | undefined;
        if (positions === undefined) {
          continue;
        }
        const indices = primitive.indices === undefined ? positions.map((_, index) => index) : readAccessor(gltf, binaryChunk, primitive.indices) as number[] | undefined;
        if (indices === undefined) {
          continue;
        }
        for (const index of indices) {
          const position = positions[index];
          if (position === undefined) {
            continue;
          }
          const transformed = transformPoint(position, transform);
          points.push(transformed);
          min = min === undefined ? transformed : vecMin(min, transformed);
          max = max === undefined ? transformed : vecMax(max, transformed);
        }
      }
    }
    for (const child of node.children ?? []) {
      visit(child, transform, currentStack);
    }
  };

  for (const root of rootNodeIndices) {
    visit(root, identity, new Set());
  }
  return min === undefined || max === undefined ? undefined : { bounds: { min, max }, points };
}

function readAccessor(gltf: GltfAsset, binaryChunk: Buffer, accessorIndex: number): Array<number | Vec3> | undefined {
  const accessor = gltf.accessors?.[accessorIndex];
  const bufferView = accessor?.bufferView === undefined ? undefined : gltf.bufferViews?.[accessor.bufferView];
  if (accessor === undefined || bufferView === undefined || (bufferView.buffer ?? 0) !== 0) {
    return undefined;
  }
  const component = accessorComponent(accessor.componentType);
  const itemSize = accessorTypeSize(accessor.type);
  if (component === undefined || itemSize === undefined) {
    return undefined;
  }
  const stride = bufferView.byteStride ?? component.byteSize * itemSize;
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values: Array<number | Vec3> = [];
  for (let index = 0; index < (accessor.count ?? 0); index += 1) {
    const item: number[] = [];
    for (let componentIndex = 0; componentIndex < itemSize; componentIndex += 1) {
      item.push(component.read(binaryChunk, start + index * stride + componentIndex * component.byteSize));
    }
    values.push(itemSize === 1 ? item[0] ?? 0 : [item[0] ?? 0, item[1] ?? 0, item[2] ?? 0]);
  }
  return values;
}

function accessorTypeSize(type: string | undefined): number | undefined {
  if (type === "SCALAR") return 1;
  if (type === "VEC2") return 2;
  if (type === "VEC3") return 3;
  if (type === "VEC4") return 4;
  return undefined;
}

function accessorComponent(componentType: number | undefined): { byteSize: number; read: (buffer: Buffer, offset: number) => number } | undefined {
  if (componentType === 5126) return { byteSize: 4, read: (buffer, offset) => buffer.readFloatLE(offset) };
  if (componentType === 5125) return { byteSize: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) };
  if (componentType === 5123) return { byteSize: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) };
  if (componentType === 5121) return { byteSize: 1, read: (buffer, offset) => buffer.readUInt8(offset) };
  if (componentType === 5122) return { byteSize: 2, read: (buffer, offset) => buffer.readInt16LE(offset) };
  if (componentType === 5120) return { byteSize: 1, read: (buffer, offset) => buffer.readInt8(offset) };
  return undefined;
}

function rotateConnector(connector: ConnectorDirection, yawDegrees: number): ConnectorDirection {
  const order: ConnectorDirection[] = ["north", "east", "south", "west"];
  const index = order.indexOf(connector);
  return order[(index + yawDegrees / 90) % order.length] ?? connector;
}

function nodeMatrix(node: NonNullable<GltfAsset["nodes"]>[number]): Mat4 {
  if (node.matrix?.length === 16) {
    return node.matrix as Mat4;
  }
  const translation: Vec3 = node.translation?.length === 3 ? [node.translation[0] ?? 0, node.translation[1] ?? 0, node.translation[2] ?? 0] : [0, 0, 0];
  const rotation: [number, number, number, number] = node.rotation?.length === 4 ? [node.rotation[0] ?? 0, node.rotation[1] ?? 0, node.rotation[2] ?? 0, node.rotation[3] ?? 1] : [0, 0, 0, 1];
  const nodeScale: Vec3 = node.scale?.length === 3 ? [node.scale[0] ?? 1, node.scale[1] ?? 1, node.scale[2] ?? 1] : [1, 1, 1];
  return composeTrs(translation, rotation, nodeScale);
}

function composeTrs(t: Vec3, q: [number, number, number, number], s: Vec3): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const sx = s[0];
  const sy = s[1];
  const sz = s[2];
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0) as Mat4;
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const a0 = a[row] ?? 0;
      const a1 = a[4 + row] ?? 0;
      const a2 = a[8 + row] ?? 0;
      const a3 = a[12 + row] ?? 0;
      const b0 = b[col * 4] ?? 0;
      const b1 = b[col * 4 + 1] ?? 0;
      const b2 = b[col * 4 + 2] ?? 0;
      const b3 = b[col * 4 + 3] ?? 0;
      out[col * 4 + row] = a0 * b0 + a1 * b1 + a2 * b2 + a3 * b3;
    }
  }
  return out;
}

function transformPoint(point: Vec3, matrix: Mat4): Vec3 {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function transformBounds(min: Vec3, max: Vec3, matrix: Mat4): { min: Vec3; max: Vec3 } {
  const corners: Vec3[] = [
    [min[0], min[1], min[2]], [max[0], min[1], min[2]], [min[0], max[1], min[2]], [min[0], min[1], max[2]],
    [max[0], max[1], min[2]], [max[0], min[1], max[2]], [min[0], max[1], max[2]], [max[0], max[1], max[2]],
  ];
  const transformed = corners.map((corner) => transformPoint(corner, matrix));
  return {
    min: transformed.reduce((current, point) => vecMin(current, point)),
    max: transformed.reduce((current, point) => vecMax(current, point)),
  };
}

function vecMin(a: Vec3, b: Vec3): Vec3 { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])]; }
function vecMax(a: Vec3, b: Vec3): Vec3 { return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]; }
function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function subtract(a: Vec3, b: Vec3): Vec3 { return [round(a[0] - b[0]), round(a[1] - b[1]), round(a[2] - b[2])]; }
function scale(a: Vec3, scalar: number): Vec3 { return [round(a[0] * scalar), round(a[1] * scalar), round(a[2] * scalar)]; }
function length(a: Vec3): number { return Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2); }
function round(value: number): number { return Number(value.toFixed(6)); }

function renderInspectReport(report: InspectReport): string {
  const bounds = report.bounds === undefined ? "Bounds: unavailable" : `Bounds: min ${formatVec(report.bounds.min)}, max ${formatVec(report.bounds.max)}, size ${formatVec(report.bounds.size)}, center ${formatVec(report.bounds.center)}`;
  const counts = report.counts === undefined ? "" : `Scenes: ${report.counts.scenes}, nodes: ${report.counts.nodes}, meshes: ${report.counts.meshes}, materials: ${report.counts.materials}, images: ${report.counts.images}`;
  const dependencies = report.dependencies?.length === 0 || report.dependencies === undefined
    ? "Dependencies: none"
    : `Dependencies:\n${report.dependencies.map((dependency) => `  - [${dependency.missing === true ? "missing" : dependency.embedded ? "embedded" : "ok"}] ${dependency.kind}: ${dependency.uri ?? dependency.path ?? "embedded"}`).join("\n")}`;
  const calibration = report.calibration === undefined ? "Calibration: unavailable" : `Calibration: camera distance ${report.calibration.camera.recommendedDistance}m, targetHeight2m scale ${report.calibration.fitScales.targetHeight2m ?? "n/a"}, targetLength4m scale ${report.calibration.fitScales.targetLength4m ?? "n/a"}, lane verdict ${report.calibration.gameplay.verdict}`;
  const modular = report.modular === undefined ? "Modular: unavailable" : `Modular: footprint X/Z size ${formatVec2(report.modular.footprint.size)}, center ${formatVec2(report.modular.footprint.center)}, origin correction ${formatVec(report.modular.originCorrection)}, yaw0 ${formatVec(report.modular.placement.cardinalYaw[0]?.entityPositionForFootprintCenterAtOrigin ?? report.modular.originCorrection)}, yaw90 ${formatVec(report.modular.placement.cardinalYaw[1]?.entityPositionForFootprintCenterAtOrigin ?? report.modular.originCorrection)}, suggested cell ${report.modular.snap.suggestedCellSize}`;
  const gltf = report.gltf === undefined ? "glTF metadata: unavailable" : `glTF metadata: materials ${report.gltf.materials.length}, morph targets ${report.gltf.morphTargets.length}, custom attributes ${report.gltf.customAttributes.length}`;
  const diagnostics = report.diagnostics.length === 0 ? "Diagnostics: none" : `Diagnostics:\n${report.diagnostics.map((diagnostic) => `  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`).join("\n")}`;
  return `${report.message}\nFile: ${report.file.path} (${report.file.type}, ${report.file.byteSize ?? "unknown"} bytes)\n${counts}\n${bounds}\n${calibration}\n${modular}\n${gltf}\n${dependencies}\n${diagnostics}\n`;
}

function renderCatalogReport(report: AssetCatalogReport): string {
  const rows = report.assets.map((asset) => {
    const modular = asset.modular === undefined
      ? "modular unavailable"
      : `size ${formatVec2(asset.modular.footprint.size)}, center ${formatVec2(asset.modular.footprint.center)}, correction ${formatVec(asset.modular.originCorrection)}, yaw0 ${formatVec(asset.modular.placement.cardinalYaw[0]?.entityPositionForFootprintCenterAtOrigin ?? asset.modular.originCorrection)}, yaw90 ${formatVec(asset.modular.placement.cardinalYaw[1]?.entityPositionForFootprintCenterAtOrigin ?? asset.modular.originCorrection)}, cell ${asset.modular.snap.suggestedCellSize}`;
    const diagnostics = asset.diagnostics.length === 0 ? "ok" : asset.diagnostics.map((diagnostic) => diagnostic.code).join(", ");
    return `  - ${asset.file.path}: ${modular}; ${diagnostics}`;
  }).join("\n");
  const diagnostics = report.diagnostics.length === 0 ? "Diagnostics: none" : `Diagnostics:\n${report.diagnostics.map((diagnostic) => `  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`).join("\n")}`;
  return `${report.message}\nDirectory: ${report.directory.path} (${report.directory.recursive ? "recursive" : "shallow"})\nInspected: ${report.summary.inspected}, warnings: ${report.summary.warnings}, errors: ${report.summary.errors}\nAssets:\n${rows.length === 0 ? "  none" : rows}\n${diagnostics}\n`;
}
