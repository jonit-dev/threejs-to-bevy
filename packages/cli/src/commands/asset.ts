import { access, readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";

import { addAsset, type IAuthoringOperationResult } from "@threenative/authoring";

import { exportAssetSourcesJsonl, getAssetSource, searchAssetSources, suggestAssetSources, type IAssetSourceRecord, type IAssetSourceSearchOptions } from "../assetSourceCatalog/catalog.js";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

type Severity = "info" | "warning" | "error";

type Vec3 = [number, number, number];
type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
type ConnectorDirection = "east" | "north" | "south" | "west";
type XzBounds = { min: [number, number]; max: [number, number] };
type ConnectorPort = { direction: ConnectorDirection; interval: [number, number]; line: number };

interface GltfAsset {
  accessors?: Array<{ bufferView?: number; byteOffset?: number; componentType?: number; count?: number; min?: number[]; max?: number[]; type?: string }>;
  asset?: { version?: string; generator?: string };
  bufferViews?: Array<{ buffer?: number; byteLength?: number; byteOffset?: number; byteStride?: number }>;
  buffers?: Array<{ uri?: string; byteLength?: number }>;
  images?: Array<{ uri?: string; bufferView?: number; mimeType?: string; name?: string }>;
  materials?: Array<{ name?: string }>;
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
  bounds?: BoundsReport;
  calibration?: ScaleCalibration;
  code: "TN_ASSET_INSPECT_OK" | "TN_ASSET_INSPECT_FAILED";
  counts?: {
    accessors: number;
    buffers: number;
    images: number;
    materials: number;
    meshes: number;
    nodes: number;
    scenes: number;
    textures: number;
  };
  dependencies?: DependencyReport[];
  diagnostics: AssetDiagnostic[];
  file: {
    byteSize?: number;
    path: string;
    type: "glb" | "gltf" | "unknown";
  };
  message: string;
  modular?: ModularPlacementReport;
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

export async function assetCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const positionals = normalizedArgv.filter((arg, index) => !arg.startsWith("-") && !assetFlagsWithValues.has(normalizedArgv[index - 1] ?? ""));
  const [subcommand] = positionals;

  if (subcommand === "source") {
    return assetSourceCommand(normalizedArgv.slice(1), json);
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
          message: "Usage: tn asset add <asset-id> --type <model|texture|audio|mesh|render-target> --path <source-path> [--project <path>] [--json] or tn asset add <asset-id> --type render-target --width <n> --height <n> [--usage color|depth] [--format rgba8|rgba16f|depth24plus] [--sample-count <n>] [--project <path>] [--json].",
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

async function assetSourceCommand(argv: readonly string[], json: boolean): Promise<ICommandResult> {
  const positionals = argv.filter((arg, index) => !arg.startsWith("-") && !assetFlagsWithValues.has(argv[index - 1] ?? ""));
  const action = positionals[0];
  try {
    if (action === "search") {
      const searchOptions: IAssetSourceSearchOptions = {
        directOnly: argv.includes("--direct-only"),
        fileRole: readFlag(argv, "--file-role"),
        format: readFlag(argv, "--format"),
        gameCategory: readFlag(argv, "--game-category"),
        includeBlocked: argv.includes("--include-blocked"),
        license: readFlag(argv, "--license"),
        limit: readLimitFlag(argv),
        query: readFlag(argv, "--query"),
        tag: readFlag(argv, "--tag"),
      };
      const records = await searchAssetSources(searchOptions);
      const fallbackRecords = records.length === 0 && searchOptions.directOnly === true && searchOptions.gameCategory !== undefined
        ? (await searchAssetSources({ ...searchOptions, directOnly: false, format: undefined, limit: 5 })).filter((record) => !record.isDirectDownload)
        : [];
      const payload = {
        code: records.length === 0 ? "TN_ASSET_SOURCE_NO_MATCH" : "TN_ASSET_SOURCE_SEARCH_OK",
        fallbackRecords,
        message: records.length === 0
          ? fallbackRecords.length > 0
            ? "No direct asset source records matched. Review fallback pack or typed source records."
            : "No matching asset source records found. Try without --direct-only or consult docs/workflows/open-source-3d-asset-kits.md."
          : "Asset source search completed.",
        records,
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

function readLimitFlag(argv: readonly string[]): number | undefined {
  const limit = readFlag(argv, "--limit");
  if (limit === undefined) {
    return undefined;
  }
  const parsed = Number(limit);
  return Number.isFinite(parsed) ? parsed : undefined;
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

const assetFlagsWithValues = new Set(["--file-role", "--format", "--game-category", "--goal", "--height", "--license", "--limit", "--out", "--path", "--project", "--sample-count", "--tag", "--type", "--usage", "--width"]);

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

  const report: InspectReport = {
    bounds,
    calibration,
    code: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "TN_ASSET_INSPECT_FAILED" : "TN_ASSET_INSPECT_OK",
    counts: {
      accessors: gltf.accessors?.length ?? 0,
      buffers: gltf.buffers?.length ?? 0,
      images: gltf.images?.length ?? 0,
      materials: gltf.materials?.length ?? 0,
      meshes: gltf.meshes?.length ?? 0,
      nodes: gltf.nodes?.length ?? 0,
      scenes: gltf.scenes?.length ?? 0,
      textures: gltf.textures?.length ?? 0,
    },
    dependencies,
    diagnostics,
    file: { byteSize, path: assetPath, type },
    message: "Asset inspection completed.",
    modular,
  };

  return report;
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

function rotateXZ(point: [number, number], yawRadians: number): [number, number] {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return [round(cos * point[0] + sin * point[1]), round(-sin * point[0] + cos * point[1])];
}

function renderInspectReport(report: InspectReport): string {
  const bounds = report.bounds === undefined ? "Bounds: unavailable" : `Bounds: min ${formatVec(report.bounds.min)}, max ${formatVec(report.bounds.max)}, size ${formatVec(report.bounds.size)}, center ${formatVec(report.bounds.center)}`;
  const counts = report.counts === undefined ? "" : `Scenes: ${report.counts.scenes}, nodes: ${report.counts.nodes}, meshes: ${report.counts.meshes}, materials: ${report.counts.materials}, images: ${report.counts.images}`;
  const dependencies = report.dependencies?.length === 0 || report.dependencies === undefined
    ? "Dependencies: none"
    : `Dependencies:\n${report.dependencies.map((dependency) => `  - [${dependency.missing === true ? "missing" : dependency.embedded ? "embedded" : "ok"}] ${dependency.kind}: ${dependency.uri ?? dependency.path ?? "embedded"}`).join("\n")}`;
  const calibration = report.calibration === undefined ? "Calibration: unavailable" : `Calibration: camera distance ${report.calibration.camera.recommendedDistance}m, targetHeight2m scale ${report.calibration.fitScales.targetHeight2m ?? "n/a"}, targetLength4m scale ${report.calibration.fitScales.targetLength4m ?? "n/a"}, lane verdict ${report.calibration.gameplay.verdict}`;
  const modular = report.modular === undefined ? "Modular: unavailable" : `Modular: footprint X/Z size ${formatVec2(report.modular.footprint.size)}, center ${formatVec2(report.modular.footprint.center)}, origin correction ${formatVec(report.modular.originCorrection)}, yaw0 ${formatVec(report.modular.placement.cardinalYaw[0]?.entityPositionForFootprintCenterAtOrigin ?? report.modular.originCorrection)}, yaw90 ${formatVec(report.modular.placement.cardinalYaw[1]?.entityPositionForFootprintCenterAtOrigin ?? report.modular.originCorrection)}, suggested cell ${report.modular.snap.suggestedCellSize}`;
  const diagnostics = report.diagnostics.length === 0 ? "Diagnostics: none" : `Diagnostics:\n${report.diagnostics.map((diagnostic) => `  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`).join("\n")}`;
  return `${report.message}\nFile: ${report.file.path} (${report.file.type}, ${report.file.byteSize ?? "unknown"} bytes)\n${counts}\n${bounds}\n${calibration}\n${modular}\n${dependencies}\n${diagnostics}\n`;
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

function formatVec(vec: Vec3): string {
  return `[${vec.map((value) => round(value)).join(", ")}]`;
}

function formatVec2(vec: [number, number]): string {
  return `[${vec.map((value) => round(value)).join(", ")}]`;
}
