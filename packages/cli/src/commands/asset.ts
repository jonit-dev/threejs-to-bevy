import { access, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

type Severity = "info" | "warning" | "error";

type Vec3 = [number, number, number];
type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

interface GltfAsset {
  accessors?: Array<{ min?: number[]; max?: number[]; type?: string }>;
  asset?: { version?: string; generator?: string };
  buffers?: Array<{ uri?: string; byteLength?: number }>;
  images?: Array<{ uri?: string; bufferView?: number; mimeType?: string; name?: string }>;
  materials?: unknown[];
  meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number> }> }>;
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
}

const identity: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export async function assetCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const [subcommand] = normalizedArgv.filter((arg) => !arg.startsWith("-"));

  if (subcommand !== "inspect") {
    return diagnosticResult(
      {
        code: "TN_ASSET_COMMAND_UNKNOWN",
        message: subcommand === undefined ? "Missing asset subcommand. Usage: tn asset inspect <path> [--json]." : `Unknown asset subcommand '${subcommand}'. Usage: tn asset inspect <path> [--json].`,
        subcommand,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const assetPathArg = normalizedArgv.filter((arg) => !arg.startsWith("-"))[1];
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
  const report = await inspectAsset(assetPath);
  const hasErrors = report.diagnostics.some((diagnostic) => diagnostic.severity === "error");

  return {
    exitCode: hasErrors ? 1 : 0,
    stdout: json ? `${JSON.stringify(report, null, 2)}\n` : renderInspectReport(report),
  };
}

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

  let gltf: GltfAsset;
  try {
    gltf = type === "glb" ? parseGlbJson(await readFile(assetPath)) : JSON.parse(await readFile(assetPath, "utf8")) as GltfAsset;
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
  };

  return report;
}

function parseGlbJson(buffer: Buffer): GltfAsset {
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
  while (offset + 8 <= declaredLength) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > buffer.length) {
      throw new Error("GLB chunk exceeds file size.");
    }
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(buffer.subarray(chunkStart, chunkEnd).toString("utf8").trim()) as GltfAsset;
    }
    offset = chunkEnd + ((4 - (chunkLength % 4)) % 4);
  }
  throw new Error("GLB JSON chunk was not found.");
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
  const diagnostics = report.diagnostics.length === 0 ? "Diagnostics: none" : `Diagnostics:\n${report.diagnostics.map((diagnostic) => `  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`).join("\n")}`;
  return `${report.message}\nFile: ${report.file.path} (${report.file.type}, ${report.file.byteSize ?? "unknown"} bytes)\n${counts}\n${bounds}\n${calibration}\n${dependencies}\n${diagnostics}\n`;
}

function formatVec(vec: Vec3): string {
  return `[${vec.map((value) => round(value)).join(", ")}]`;
}
