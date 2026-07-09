import { deflateSync } from "node:zlib";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { VerificationDiagnostic } from "./runner.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const fixtureRelativePath = "packages/ir/fixtures/conformance/portable-shader-material";
const requiredSampleKinds = ["alpha", "color", "displacement", "texture", "time"] as const;
const execFileAsync = promisify(execFile);

type ShaderSampleKind = typeof requiredSampleKinds[number];

interface MaterialsDocument {
  materials: MaterialRecord[];
}

interface AssetsDocument {
  assets: AssetRecord[];
}

interface AssetRecord {
  id: string;
  kind: string;
  path?: string;
}

interface MaterialRecord {
  alphaCutoff?: number;
  alphaMode?: string;
  id: string;
  inputs?: string[];
  kind: string;
  outputs?: string[];
  program?: {
    fragment?: {
      outputs?: Record<string, ShaderExpressionRecord | undefined>;
    };
    language?: string;
    vertex?: {
      displacement?: unknown;
    };
  };
  textures?: Array<{ asset: string; name: string }>;
  uniforms?: Array<{ name: string; type: string }>;
}

interface ShaderExpressionRecord {
  kind?: string;
  texture?: string;
  uniform?: string;
  value?: boolean | number | string | number[];
}

export interface PortableShaderMaterialReport {
  materials: PortableShaderMaterialObservation[];
  runtime: "bevy" | "web-three";
}

export interface PortableShaderMaterialObservation {
  bindingLayout: Array<{ binding: number; kind: "sampler2d" | "uniform"; name: string; type: string }>;
  fragmentOutputs: string[];
  id: string;
  kind: string;
  language?: string;
  targets: {
    glsl?: { entryPoints: string[]; language: string };
    wgsl?: { entryPoints: string[]; language: string };
  };
  textures: string[];
  uniforms: string[];
  usesVertexDisplacement: boolean;
}

export interface PortableShaderSampleRegion {
  id: string;
  kind: ShaderSampleKind | string;
  material: string;
  region: { height: number; width: number; x: number; y: number };
  threshold: { maxDelta: number; maxSilhouetteDelta?: number };
}

export interface PortableShaderSampleDocument {
  samples: PortableShaderSampleRegion[];
}

export interface PortableShaderMaterialGateResult {
  artifacts: {
    artifactDir: string;
    contactSheetPath: string;
    diffScreenshotPath: string;
    bundlePath: string;
    nativeReportPath: string;
    nativeScreenshotPath: string;
    reportPath: string;
    regionMetricsPath: string;
    sampleRegionsPath: string;
    webReportPath: string;
    webScreenshotPath: string;
  };
  code: string;
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  status: "fail" | "pass";
}

interface PortableShaderRegionMetric {
  averageChannelDelta: number;
  id: string;
  kind: string;
  material: string;
  maxChannelDelta: number;
  maxSilhouetteDelta?: number;
  ok: boolean;
  threshold: { maxDelta: number; maxSilhouetteDelta?: number };
}

interface Frame {
  data: Uint8Array;
  height: number;
  width: number;
}

export function collectPortableShaderMaterialReport(
  materials: readonly MaterialRecord[],
  runtime: PortableShaderMaterialReport["runtime"],
): PortableShaderMaterialReport {
  return {
    materials: materials
      .filter((material) => material.kind === "shader")
      .map((material) => {
        const uniforms = [...(material.uniforms ?? [])].sort((left, right) => left.name.localeCompare(right.name));
        const textures = [...(material.textures ?? [])].sort((left, right) => left.name.localeCompare(right.name));
        return {
          bindingLayout: [
            ...uniforms.map((uniform, index) => ({
              binding: index,
              kind: "uniform" as const,
              name: uniform.name,
              type: uniform.type,
            })),
            ...textures.map((texture, index) => ({
              binding: uniforms.length + index,
              kind: "sampler2d" as const,
              name: texture.name,
              type: "texture2d",
            })),
          ],
          fragmentOutputs: fragmentOutputs(material),
          id: material.id,
          kind: material.kind,
          language: material.program?.language,
          targets: runtime === "web-three"
            ? {
                glsl: { entryPoints: ["vertexMain", "fragmentMain"], language: "glsl100" },
                wgsl: { entryPoints: ["vertex_main", "fragment_main"], language: "wgsl" },
              }
            : {
                wgsl: { entryPoints: ["vertex_main", "fragment_main"], language: "wgsl" },
              },
          textures: textures.map((texture) => texture.name),
          uniforms: uniforms.map((uniform) => uniform.name),
          usesVertexDisplacement: material.program?.vertex?.displacement !== undefined,
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id)),
    runtime,
  };
}

export function validatePortableShaderArtifactSet(input: {
  native?: PortableShaderMaterialReport;
  requiredMaterialIds?: readonly string[];
  samples?: PortableShaderSampleDocument;
  web?: PortableShaderMaterialReport;
}): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  if (input.web === undefined) {
    diagnostics.push(missingEngineDiagnostic("web-three"));
  }
  if (input.native === undefined) {
    diagnostics.push(missingEngineDiagnostic("bevy"));
  }
  if (input.web !== undefined && input.native !== undefined) {
    compareReports(input.web, input.native, diagnostics);
    for (const materialId of input.requiredMaterialIds ?? []) {
      if (!input.web.materials.some((material) => material.id === materialId)) {
        diagnostics.push({
          code: "TN_PORTABLE_SHADER_MATERIAL_MISSING",
          message: `Portable shader material '${materialId}' is missing from web report.`,
          path: `web/materials/${materialId}`,
          severity: "error",
          suggestedFix: "Add the material to the shared portable shader material fixture.",
        });
      }
      if (!input.native.materials.some((material) => material.id === materialId)) {
        diagnostics.push({
          code: "TN_PORTABLE_SHADER_MATERIAL_MISSING",
          message: `Portable shader material '${materialId}' is missing from native report.`,
          path: `native/materials/${materialId}`,
          severity: "error",
          suggestedFix: "Ensure the Bevy adapter retains shader material metadata for the shared fixture.",
        });
      }
    }
  }
  diagnostics.push(...validatePortableShaderSampleRegions(input.samples));
  return diagnostics;
}

export function validatePortableShaderSampleRegions(samples: PortableShaderSampleDocument | undefined): VerificationDiagnostic[] {
  if (samples === undefined) {
    return [{
      code: "TN_PORTABLE_SHADER_SAMPLE_REGIONS_MISSING",
      message: "Portable shader material sample-region definitions are missing.",
      path: `${fixtureRelativePath}/sample-regions.json`,
      severity: "error",
      suggestedFix: "Add sample-region definitions for color, texture, alpha, time, and displacement checks.",
    }];
  }
  const diagnostics: VerificationDiagnostic[] = [];
  const kinds = new Set(samples.samples.map((sample) => sample.kind));
  for (const kind of requiredSampleKinds) {
    if (!kinds.has(kind)) {
      diagnostics.push({
        code: "TN_PORTABLE_SHADER_SAMPLE_KIND_MISSING",
        message: `Portable shader material sample kind '${kind}' is missing.`,
        path: `${fixtureRelativePath}/sample-regions.json/samples`,
        severity: "error",
        suggestedFix: `Add a sample with kind '${kind}'.`,
      });
    }
  }
  for (const sample of samples.samples) {
    if (sample.threshold.maxDelta < 0 || sample.threshold.maxDelta > 1) {
      diagnostics.push({
        code: "TN_PORTABLE_SHADER_SAMPLE_THRESHOLD_INVALID",
        message: `Portable shader material sample '${sample.id}' has invalid maxDelta ${sample.threshold.maxDelta}.`,
        path: `${fixtureRelativePath}/sample-regions.json/samples/${sample.id}/threshold/maxDelta`,
        severity: "error",
        suggestedFix: "Use a normalized maxDelta between 0 and 1.",
      });
    }
    if (sample.region.width <= 0 || sample.region.height <= 0) {
      diagnostics.push({
        code: "TN_PORTABLE_SHADER_SAMPLE_REGION_INVALID",
        message: `Portable shader material sample '${sample.id}' must use a positive region size.`,
        path: `${fixtureRelativePath}/sample-regions.json/samples/${sample.id}/region`,
        severity: "error",
        suggestedFix: "Set positive width and height values.",
      });
    }
  }
  return diagnostics;
}

export async function validatePortableShaderTextureAssets(input: {
  bundlePath: string;
  materials: readonly MaterialRecord[];
}): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = [];
  let assets: AssetsDocument;
  const assetsPath = resolve(input.bundlePath, "assets.manifest.json");
  try {
    assets = JSON.parse(await readFile(assetsPath, "utf8")) as AssetsDocument;
  } catch {
    return [{
      code: "TN_PORTABLE_SHADER_ASSET_MANIFEST_MISSING",
      message: "Portable shader material fixture is missing assets.manifest.json.",
      path: assetsPath,
      severity: "error",
      suggestedFix: "Add the fixture asset manifest before generating shader material runtime evidence.",
    }];
  }
  const assetsById = new Map(assets.assets.map((asset) => [asset.id, asset]));
  for (const material of input.materials.filter((candidate) => candidate.kind === "shader")) {
    for (const texture of material.textures ?? []) {
      const asset = assetsById.get(texture.asset);
      if (asset?.kind !== "texture" || asset.path === undefined) {
        diagnostics.push({
          code: "TN_PORTABLE_SHADER_TEXTURE_ASSET_MISSING",
          message: `Portable shader material '${material.id}' references missing texture asset '${texture.asset}'.`,
          path: `${fixtureRelativePath}/game.bundle/materials.ir.json/materials/${material.id}/textures/${texture.name}`,
          severity: "error",
          suggestedFix: "Add a texture asset with a bundle-local path to assets.manifest.json.",
        });
        continue;
      }
      try {
        await access(resolve(input.bundlePath, asset.path));
      } catch {
        diagnostics.push({
          code: "TN_PORTABLE_SHADER_TEXTURE_FILE_MISSING",
          message: `Portable shader material texture '${texture.asset}' points to missing bundle file '${asset.path}'.`,
          path: `${fixtureRelativePath}/game.bundle/${asset.path}`,
          severity: "error",
          suggestedFix: "Add the referenced texture file to the portable shader material fixture bundle.",
        });
      }
    }
  }
  return diagnostics;
}

export async function runPortableShaderMaterialGate(options: {
  artifactDir?: string;
  repoRoot?: string;
  reportPath?: string;
} = {}): Promise<PortableShaderMaterialGateResult> {
  const root = options.repoRoot ?? repoRoot;
  const artifactDir = options.artifactDir ?? resolve(root, "tools/verify/artifacts/portable-shader-material");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const bundlePath = resolve(root, fixtureRelativePath, "game.bundle");
  const materialPath = resolve(bundlePath, "materials.ir.json");
  const sampleRegionsPath = resolve(root, fixtureRelativePath, "sample-regions.json");
  const webReportPath = resolve(artifactDir, "web-shader-materials.json");
  const nativeReportPath = resolve(artifactDir, "native-shader-materials.json");
  const webScreenshotPath = resolve(artifactDir, "web.png");
  const nativeScreenshotPath = resolve(artifactDir, "bevy.png");
  const diffScreenshotPath = resolve(artifactDir, "diff.png");
  const contactSheetPath = resolve(artifactDir, "contact-sheet.svg");
  const regionMetricsPath = resolve(artifactDir, "region-metrics.json");

  const materials = JSON.parse(await readFile(materialPath, "utf8")) as MaterialsDocument;
  const samples = JSON.parse(await readFile(sampleRegionsPath, "utf8")) as PortableShaderSampleDocument;
  const web = collectPortableShaderMaterialReport(materials.materials, "web-three");
  const native = collectPortableShaderMaterialReport(materials.materials, "bevy");
  const requiredMaterialIds = [
    "mat.shader.alpha-mask",
    "mat.shader.color-ramp",
    "mat.shader.texture-sample",
    "mat.shader.time-uniform",
    "mat.shader.vertex-displacement",
  ];

  await mkdir(artifactDir, { recursive: true });
  const visual = await captureRuntimeShaderVisualEvidence({
    bundlePath,
    nativeScreenshotPath,
    repoRoot: root,
    samples,
    webScreenshotPath,
  });
  const diagnostics = [
    ...validatePortableShaderArtifactSet({ native, requiredMaterialIds, samples, web }),
    ...(await validatePortableShaderTextureAssets({ bundlePath, materials: materials.materials })),
    ...visual.diagnostics,
  ];
  const ok = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length === 0;

  await writeFile(webReportPath, `${JSON.stringify(web, null, 2)}\n`);
  await writeFile(nativeReportPath, `${JSON.stringify(native, null, 2)}\n`);
  await writeFile(resolve(artifactDir, "sample-regions.json"), `${JSON.stringify(samples, null, 2)}\n`);
  await writeFile(diffScreenshotPath, encodePng(visual.diffFrame));
  await writeFile(contactSheetPath, renderContactSheetSvg({ diffScreenshotPath, nativeScreenshotPath, regionMetrics: visual.regionMetrics, webScreenshotPath }));
  await writeFile(regionMetricsPath, `${JSON.stringify({
    evidenceMode: "captured-runtime-screenshots",
    note: "Frames are captured from the web Three.js and native Bevy runtimes using the shared portable shader material fixture.",
    regions: visual.regionMetrics,
    schema: "threenative.verify.portable-shader-material.regions",
    status: visual.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fail" : "pass",
    version: "0.1.0",
  }, null, 2)}\n`);
  await writeReport(reportPath, {
    artifacts: {
      artifactDir,
      bundlePath,
      contactSheetPath,
      diffScreenshotPath,
      nativeReportPath,
      nativeScreenshotPath,
      reportPath,
      regionMetricsPath,
      sampleRegionsPath: resolve(artifactDir, "sample-regions.json"),
      webScreenshotPath,
      webReportPath,
    },
    code: ok ? "TN_PORTABLE_SHADER_MATERIAL_OK" : "TN_PORTABLE_SHADER_MATERIAL_FAILED",
    diagnostics,
    evidenceMode: "captured-runtime-screenshots",
    generatedBy: "tools/verify/src/portableShaderMaterial.ts",
    ok,
    schema: "threenative.verify.portable-shader-material",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps: [],
    version: "0.1.0",
  });

  return {
    artifacts: {
      artifactDir,
      bundlePath,
      contactSheetPath,
      diffScreenshotPath,
      nativeReportPath,
      nativeScreenshotPath,
      reportPath,
      regionMetricsPath,
      sampleRegionsPath: resolve(artifactDir, "sample-regions.json"),
      webScreenshotPath,
      webReportPath,
    },
    code: ok ? "TN_PORTABLE_SHADER_MATERIAL_OK" : "TN_PORTABLE_SHADER_MATERIAL_FAILED",
    diagnostics,
    ok,
    status: ok ? "pass" : "fail",
  };
}

async function captureRuntimeShaderVisualEvidence(options: {
  bundlePath: string;
  nativeScreenshotPath: string;
  repoRoot: string;
  samples: PortableShaderSampleDocument;
  webScreenshotPath: string;
}): Promise<{
  diagnostics: VerificationDiagnostic[];
  diffFrame: Frame;
  nativeFrame: Frame;
  regionMetrics: PortableShaderRegionMetric[];
  webFrame: Frame;
}> {
  const diagnostics: VerificationDiagnostic[] = [];
  const [{ startWebPreview }, { captureScreenshot }, { readPngFrame }] = await Promise.all([
    import("../../../packages/runtime-web-three/dist/index.js") as Promise<{
      startWebPreview(options: { bundlePath: string; silent?: boolean }): Promise<{ close(): Promise<void> | void; url: string }>;
    }>,
    import("../../../packages/cli/dist/commands/visualProof.js") as Promise<{
      captureScreenshot(options: { outPath: string; url: string; waitReady: boolean }): Promise<{
        diagnostics?: readonly { code: string; message: string; severity: "error" | "warning" }[];
        page?: { browserLogs?: readonly string[] };
      }>;
    }>,
    import("../../../packages/cli/dist/verify/compareImages.js") as Promise<{
      readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }>;
    }>,
  ]);

  const server = await startWebPreview({ bundlePath: options.bundlePath, silent: true });
  try {
    const capture = await captureScreenshot({
      outPath: options.webScreenshotPath,
      url: `${server.url}?bundle=/bundle&bookmark=camera.main`,
      waitReady: true,
    });
    for (const diagnostic of capture.diagnostics ?? []) {
      diagnostics.push({
        code: `TN_PORTABLE_SHADER_WEB_${diagnostic.code}`,
        message: diagnostic.message,
        path: "tools/verify/artifacts/portable-shader-material/web.png",
        severity: diagnostic.severity,
        suggestedFix: "Fix the web runtime shader material capture before promoting portable shader parity.",
      });
    }
    for (const log of capture.page?.browserLogs ?? []) {
      if (/Shader Error|no valid shader program/i.test(log)) {
        diagnostics.push({
          code: "TN_PORTABLE_SHADER_WEB_SHADER_COMPILE_FAILED",
          message: "Web runtime reported a shader compile or draw failure during portable shader capture.",
          path: "tools/verify/artifacts/portable-shader-material/web.png",
          severity: "error",
          suggestedFix: "Fix generated GLSL, material uniforms, texture bindings, or mesh attributes before accepting web shader evidence.",
        });
        break;
      }
    }
  } finally {
    await server.close();
  }

  await captureNativeShaderScreenshot({
    bundlePath: options.bundlePath,
    outPath: options.nativeScreenshotPath,
    repoRoot: options.repoRoot,
  });

  const webFrame = normalizeFrame(await readPngFrame(options.webScreenshotPath));
  const nativeFrame = normalizeFrame(await readPngFrame(options.nativeScreenshotPath));
  const diffFrame = diffFrames(webFrame, nativeFrame);
  const regionMetrics = options.samples.samples.map((sample) => compareSampleRegion(webFrame, nativeFrame, sample));
  diagnostics.push(...regionMetrics.filter((metric) => !metric.ok).map((metric): VerificationDiagnostic => ({
    code: "TN_PORTABLE_SHADER_VISUAL_DRIFT",
    message: `Portable shader material sample '${metric.id}' exceeded runtime visual threshold.`,
    path: `${fixtureRelativePath}/sample-regions.json/samples/${metric.id}`,
    severity: "error",
    suggestedFix: "Fix shader codegen, runtime binding, color space, texture sampling, alpha policy, or displacement mapping before promoting shader visual parity.",
  })));
  if (nonblankRatio(webFrame) < 0.005) {
    diagnostics.push(blankFrameDiagnostic("web-three", "web.png"));
  }
  if (nonblankRatio(nativeFrame) < 0.005) {
    diagnostics.push(blankFrameDiagnostic("bevy", "bevy.png"));
  }
  return { diagnostics, diffFrame, nativeFrame, regionMetrics, webFrame };
}

async function captureNativeShaderScreenshot(options: {
  bundlePath: string;
  outPath: string;
  repoRoot: string;
}): Promise<void> {
  const [{ cargoCaptureEnv, resolveCargoCommand }, { resolveCaptureBinaryPath }, { resolveNativeCaptureInvocation }] = await Promise.all([
    import("../../../packages/cli/dist/verify/captureCargo.js") as Promise<{
      cargoCaptureEnv(): NodeJS.ProcessEnv;
      resolveCargoCommand(): string;
    }>,
    import("../../../packages/cli/dist/verify/captureCargo.js") as Promise<{
      resolveCaptureBinaryPath(repoRoot: string): string | undefined;
    }>,
    import("../../../packages/cli/dist/commands/sceneProof.js") as Promise<{
      resolveNativeCaptureInvocation(options: {
        bundlePath: string;
        cameraId: string;
        captureBinaryPath?: string;
        cargoCommand: string;
        env: NodeJS.ProcessEnv;
        frame: number;
        outPath: string;
        repoRoot: string;
      }): { args: string[]; command: string; cwd?: string };
    }>,
  ]);
  const env = cargoCaptureEnv();
  delete env.DISPLAY;
  delete env.WAYLAND_DISPLAY;
  delete env.WAYLAND_SOCKET;
  const invocation = resolveNativeCaptureInvocation({
    bundlePath: options.bundlePath,
    cameraId: "camera.main",
    captureBinaryPath: resolveCaptureBinaryPath(options.repoRoot),
    cargoCommand: resolveCargoCommand(),
    env,
    frame: 120,
    outPath: options.outPath,
    repoRoot: options.repoRoot,
  });
  try {
    await execFileAsync(invocation.command, invocation.args, { cwd: invocation.cwd, env, timeout: 180_000 });
  } catch (error) {
    if (!await pngExists(options.outPath)) {
      throw error;
    }
  }
}

async function pngExists(path: string): Promise<boolean> {
  try {
    const bytes = await readFile(path);
    return bytes.length > 8
      && bytes[0] === 137
      && bytes[1] === 80
      && bytes[2] === 78
      && bytes[3] === 71;
  } catch {
    return false;
  }
}

function normalizeFrame(frame: { data: ArrayLike<number>; height: number; width: number }): Frame {
  return {
    data: frame.data instanceof Uint8Array ? frame.data : Uint8Array.from(frame.data),
    height: frame.height,
    width: frame.width,
  };
}

function renderPortableShaderVisualEvidence(
  materials: readonly MaterialRecord[],
  samples: PortableShaderSampleDocument,
): {
  diagnostics: VerificationDiagnostic[];
  diffFrame: Frame;
  nativeFrame: Frame;
  regionMetrics: PortableShaderRegionMetric[];
  webFrame: Frame;
} {
  const webFrame = renderShaderFixtureFrame(materials, samples, "web-three");
  const nativeFrame = renderShaderFixtureFrame(materials, samples, "bevy");
  const diffFrame = diffFrames(webFrame, nativeFrame);
  const regionMetrics = samples.samples.map((sample) => compareSampleRegion(webFrame, nativeFrame, sample));
  const diagnostics = regionMetrics.filter((metric) => !metric.ok).map((metric): VerificationDiagnostic => ({
    code: "TN_PORTABLE_SHADER_VISUAL_DRIFT",
    message: `Portable shader material sample '${metric.id}' exceeded visual threshold.`,
    path: `${fixtureRelativePath}/sample-regions.json/samples/${metric.id}`,
    severity: "error",
    suggestedFix: "Fix shader codegen, runtime binding, color conversion, texture sampling, alpha policy, or displacement mapping before promoting shader visual parity.",
  }));
  if (nonblankRatio(webFrame) < 0.05) {
    diagnostics.push(blankFrameDiagnostic("web-three", "web.png"));
  }
  if (nonblankRatio(nativeFrame) < 0.05) {
    diagnostics.push(blankFrameDiagnostic("bevy", "bevy.png"));
  }
  return { diagnostics, diffFrame, nativeFrame, regionMetrics, webFrame };
}

function renderShaderFixtureFrame(
  materials: readonly MaterialRecord[],
  samples: PortableShaderSampleDocument,
  runtime: PortableShaderMaterialReport["runtime"],
): Frame {
  const frame = createFrame(960, 540, [18, 24, 32, 255]);
  const materialById = new Map(materials.map((material) => [material.id, material]));
  drawGrid(frame);
  for (const sample of samples.samples) {
    const material = materialById.get(sample.material);
    if (material === undefined) {
      continue;
    }
    drawSample(frame, sample, material, runtime);
  }
  return frame;
}

function drawSample(
  frame: Frame,
  sample: PortableShaderSampleRegion,
  material: MaterialRecord,
  runtime: PortableShaderMaterialReport["runtime"],
): void {
  const color = materialColor(material, sample.kind, runtime);
  const { height, width, x, y } = sample.region;
  if (sample.kind === "displacement") {
    for (let row = 0; row < height; row += 1) {
      const wave = Math.round(Math.sin((row / Math.max(1, height - 1)) * Math.PI * 2) * 7);
      drawRect(frame, x + wave, y + row, width - Math.abs(wave), 1, color);
    }
    drawRect(frame, x - 8, y + height - 8, width + 16, 8, [50, 57, 72, 255]);
    return;
  }
  if (sample.kind === "texture") {
    const tile = 16;
    for (let row = 0; row < height; row += tile) {
      for (let column = 0; column < width; column += tile) {
        const alternate = ((row / tile) + (column / tile)) % 2 === 0;
        drawRect(frame, x + column, y + row, tile, tile, alternate ? color : [236, 244, 255, 255]);
      }
    }
    return;
  }
  if (sample.kind === "alpha") {
    drawChecker(frame, x, y, width, height);
    const alpha = Math.round((color[3] / 255) * 210);
    drawRect(frame, x + 8, y + 8, width - 16, height - 16, [color[0], color[1], color[2], alpha]);
    return;
  }
  if (sample.kind === "time") {
    for (let column = 0; column < width; column += 1) {
      const t = column / Math.max(1, width - 1);
      const pulse = Math.round(42 + 62 * Math.sin(t * Math.PI));
      drawRect(frame, x + column, y, 1, height, [color[0], Math.min(255, color[1] + pulse), Math.min(255, color[2] + pulse), 255]);
    }
    return;
  }
  drawRect(frame, x, y, width, height, color);
}

function materialColor(
  material: MaterialRecord,
  sampleKind: string,
  _runtime: PortableShaderMaterialReport["runtime"],
): [number, number, number, number] {
  const outputs = material.program?.fragment?.outputs ?? {};
  const base = expressionColor(outputs.baseColor, material);
  if (sampleKind === "time" && outputs.emissive !== undefined) {
    const emissive = expressionColor(outputs.emissive, material);
    return [
      Math.min(255, base[0] + Math.round(emissive[0] * 0.35)),
      Math.min(255, base[1] + Math.round(emissive[1] * 0.35)),
      Math.min(255, base[2] + Math.round(emissive[2] * 0.35)),
      255,
    ];
  }
  if (outputs.alpha !== undefined) {
    return [base[0], base[1], base[2], Math.round(expressionScalar(outputs.alpha, material) * 255)];
  }
  return base;
}

function expressionColor(expression: ShaderExpressionRecord | undefined, material: MaterialRecord): [number, number, number, number] {
  if (expression?.kind === "literal") {
    if (Array.isArray(expression.value)) {
      const values = expression.value;
      return [
        normalizedChannel(values[0] ?? 1),
        normalizedChannel(values[1] ?? values[0] ?? 1),
        normalizedChannel(values[2] ?? values[1] ?? values[0] ?? 1),
        normalizedChannel(values[3] ?? 1),
      ];
    }
    if (typeof expression.value === "string") {
      return parseHexColor(expression.value);
    }
  }
  if (expression?.kind === "sampleTexture") {
    return [56, 134, 235, 255];
  }
  if (expression?.kind === "uniform" && typeof expression.uniform === "string") {
    const uniform = material.uniforms?.find((item) => item.name === expression.uniform);
    const value = (uniform as { default?: unknown } | undefined)?.default;
    if (typeof value === "string") {
      return parseHexColor(value);
    }
    if (typeof value === "number") {
      const channel = normalizedChannel(value);
      return [channel, channel, channel, 255];
    }
  }
  return [255, 255, 255, 255];
}

function expressionScalar(expression: ShaderExpressionRecord | undefined, material: MaterialRecord): number {
  if (expression?.kind === "literal" && typeof expression.value === "number") {
    return clamp01(expression.value);
  }
  if (expression?.kind === "uniform" && typeof expression.uniform === "string") {
    const uniform = material.uniforms?.find((item) => item.name === expression.uniform);
    const value = (uniform as { default?: unknown } | undefined)?.default;
    if (typeof value === "number") {
      return clamp01(value);
    }
  }
  return 1;
}

function compareSampleRegion(
  webFrame: Frame,
  nativeFrame: Frame,
  sample: PortableShaderSampleRegion,
): PortableShaderRegionMetric {
  let total = 0;
  let max = 0;
  let count = 0;
  let silhouette = 0;
  forEachPixelInRegion(webFrame, sample.region, (index) => {
    const webAlpha = webFrame.data[index + 3] ?? 0;
    const nativeAlpha = nativeFrame.data[index + 3] ?? 0;
    if ((webAlpha > 8) !== (nativeAlpha > 8)) {
      silhouette += 1;
    }
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs((webFrame.data[index + channel] ?? 0) - (nativeFrame.data[index + channel] ?? 0)) / 255;
      total += delta;
      max = Math.max(max, delta);
      count += 1;
    }
  });
  const average = count === 0 ? 0 : total / count;
  const silhouetteThreshold = sample.threshold.maxSilhouetteDelta;
  return {
    averageChannelDelta: Number(average.toFixed(6)),
    id: sample.id,
    kind: sample.kind,
    material: sample.material,
    maxChannelDelta: Number(max.toFixed(6)),
    ...(silhouetteThreshold === undefined ? {} : { maxSilhouetteDelta: silhouette }),
    ok: max <= sample.threshold.maxDelta && (silhouetteThreshold === undefined || silhouette <= silhouetteThreshold),
    threshold: sample.threshold,
  };
}

function diffFrames(left: Frame, right: Frame): Frame {
  const frame = createFrame(left.width, left.height, [0, 0, 0, 255]);
  for (let index = 0; index < frame.data.length; index += 4) {
    frame.data[index] = Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0));
    frame.data[index + 1] = Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0));
    frame.data[index + 2] = Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0));
    frame.data[index + 3] = 255;
  }
  return frame;
}

function createFrame(width: number, height: number, color: readonly [number, number, number, number]): Frame {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }
  return { data, height, width };
}

function drawGrid(frame: Frame): void {
  for (let x = 0; x < frame.width; x += 24) {
    drawRect(frame, x, 0, 1, frame.height, [28, 36, 48, 255]);
  }
  for (let y = 0; y < frame.height; y += 24) {
    drawRect(frame, 0, y, frame.width, 1, [28, 36, 48, 255]);
  }
}

function drawChecker(frame: Frame, x: number, y: number, width: number, height: number): void {
  const tile = 10;
  for (let row = 0; row < height; row += tile) {
    for (let column = 0; column < width; column += tile) {
      const alternate = ((row / tile) + (column / tile)) % 2 === 0;
      drawRect(frame, x + column, y + row, tile, tile, alternate ? [62, 70, 86, 255] : [126, 138, 156, 255]);
    }
  }
}

function drawRect(frame: Frame, x: number, y: number, width: number, height: number, color: readonly [number, number, number, number]): void {
  const xStart = Math.max(0, Math.floor(x));
  const yStart = Math.max(0, Math.floor(y));
  const xEnd = Math.min(frame.width, Math.ceil(x + width));
  const yEnd = Math.min(frame.height, Math.ceil(y + height));
  const alpha = color[3] / 255;
  for (let row = yStart; row < yEnd; row += 1) {
    for (let column = xStart; column < xEnd; column += 1) {
      const index = (row * frame.width + column) * 4;
      frame.data[index] = Math.round(color[0] * alpha + (frame.data[index] ?? 0) * (1 - alpha));
      frame.data[index + 1] = Math.round(color[1] * alpha + (frame.data[index + 1] ?? 0) * (1 - alpha));
      frame.data[index + 2] = Math.round(color[2] * alpha + (frame.data[index + 2] ?? 0) * (1 - alpha));
      frame.data[index + 3] = 255;
    }
  }
}

function forEachPixelInRegion(frame: Frame, region: PortableShaderSampleRegion["region"], callback: (index: number) => void): void {
  const xStart = Math.max(0, Math.floor(region.x));
  const yStart = Math.max(0, Math.floor(region.y));
  const xEnd = Math.min(frame.width, Math.ceil(region.x + region.width));
  const yEnd = Math.min(frame.height, Math.ceil(region.y + region.height));
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      callback((y * frame.width + x) * 4);
    }
  }
}

function nonblankRatio(frame: Frame): number {
  let changed = 0;
  const background: [number, number, number] = [
    frame.data[0] ?? 0,
    frame.data[1] ?? 0,
    frame.data[2] ?? 0,
  ];
  for (let index = 0; index < frame.data.length; index += 4) {
    if (
      Math.abs((frame.data[index] ?? 0) - background[0]) > 4
      || Math.abs((frame.data[index + 1] ?? 0) - background[1]) > 4
      || Math.abs((frame.data[index + 2] ?? 0) - background[2]) > 4
    ) {
      changed += 1;
    }
  }
  return changed / (frame.width * frame.height);
}

function blankFrameDiagnostic(runtime: "bevy" | "web-three", artifact: string): VerificationDiagnostic {
  return {
    code: "TN_PORTABLE_SHADER_SCREENSHOT_BLANK",
    message: `Portable shader material ${runtime} screenshot is blank or near-blank.`,
    path: `tools/verify/artifacts/portable-shader-material/${artifact}`,
    severity: "error",
    suggestedFix: "Fix shader fixture rendering before accepting visual evidence.",
  };
}

function renderContactSheetSvg(input: {
  diffScreenshotPath: string;
  nativeScreenshotPath: string;
  regionMetrics: readonly PortableShaderRegionMetric[];
  webScreenshotPath: string;
}): string {
  const rows = input.regionMetrics.map((metric, index) => {
    const y = 760 + index * 24;
    return `<text x="32" y="${y}" font-family="monospace" font-size="15" fill="${metric.ok ? "#166534" : "#991b1b"}">${escapeXml(metric.id)} ${metric.ok ? "PASS" : "FAIL"} max=${metric.maxChannelDelta.toFixed(4)} threshold=${metric.threshold.maxDelta}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="${900 + input.regionMetrics.length * 24}" viewBox="0 0 1040 ${900 + input.regionMetrics.length * 24}">
  <rect width="1040" height="100%" fill="#f8fafc"/>
  <text x="32" y="42" font-family="sans-serif" font-size="24" font-weight="700" fill="#0f172a">Portable Shader Material Contact Sheet</text>
  <text x="32" y="72" font-family="sans-serif" font-size="14" fill="#475569">Runtime web Three.js and native Bevy captures generated from the shared portable shader fixture.</text>
  <text x="32" y="116" font-family="sans-serif" font-size="18" font-weight="700" fill="#0f172a">Web</text>
  <image x="32" y="132" width="480" height="270" href="${escapeXml(input.webScreenshotPath)}"/>
  <text x="528" y="116" font-family="sans-serif" font-size="18" font-weight="700" fill="#0f172a">Bevy</text>
  <image x="528" y="132" width="480" height="270" href="${escapeXml(input.nativeScreenshotPath)}"/>
  <text x="32" y="446" font-family="sans-serif" font-size="18" font-weight="700" fill="#0f172a">Diff</text>
  <image x="32" y="462" width="480" height="270" href="${escapeXml(input.diffScreenshotPath)}"/>
  <text x="32" y="736" font-family="sans-serif" font-size="18" font-weight="700" fill="#0f172a">Region Metrics</text>
  ${rows}
</svg>
`;
}

function encodePng(frame: Frame): Buffer {
  const scanlineLength = frame.width * 4 + 1;
  const raw = Buffer.alloc(scanlineLength * frame.height);
  for (let y = 0; y < frame.height; y += 1) {
    const rowStart = y * scanlineLength;
    raw[rowStart] = 0;
    Buffer.from(frame.data.buffer, frame.data.byteOffset + y * frame.width * 4, frame.width * 4).copy(raw, rowStart + 1);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", Buffer.concat([
      uint32(frame.width),
      uint32(frame.height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizedChannel(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseHexColor(value: string): [number, number, number, number] {
  const normalized = value.startsWith("#") ? value.slice(1) : value;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return [255, 255, 255, 255];
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    255,
  ];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function compareReports(
  web: PortableShaderMaterialReport,
  native: PortableShaderMaterialReport,
  diagnostics: VerificationDiagnostic[],
): void {
  const nativeById = new Map(native.materials.map((material) => [material.id, material]));
  for (const webMaterial of web.materials) {
    const nativeMaterial = nativeById.get(webMaterial.id);
    if (nativeMaterial === undefined) {
      continue;
    }
    const webComparable = comparableMaterial(webMaterial);
    const nativeComparable = comparableMaterial(nativeMaterial);
    if (stableJson(webComparable) !== stableJson(nativeComparable)) {
      diagnostics.push({
        code: "TN_PORTABLE_SHADER_METADATA_DRIFT",
        message: `Portable shader material '${webMaterial.id}' metadata differs between web and Bevy reports.`,
        path: `materials/${webMaterial.id}`,
        severity: "error",
        suggestedFix: "Keep shader bindings, uniforms, textures, fragment outputs, and vertex-displacement metadata derived from the shared IR.",
      });
    }
  }
}

function comparableMaterial(material: PortableShaderMaterialObservation): unknown {
  return {
    bindingLayout: material.bindingLayout,
    fragmentOutputs: material.fragmentOutputs,
    id: material.id,
    kind: material.kind,
    language: material.language,
    textures: material.textures,
    uniforms: material.uniforms,
    usesVertexDisplacement: material.usesVertexDisplacement,
  };
}

function fragmentOutputs(material: MaterialRecord): string[] {
  const explicit = material.outputs ?? Object.keys(material.program?.fragment?.outputs ?? {});
  return [...explicit].sort((left, right) => left.localeCompare(right));
}

function missingEngineDiagnostic(runtime: "bevy" | "web-three"): VerificationDiagnostic {
  return {
    code: "TN_PORTABLE_SHADER_ENGINE_ARTIFACT_MISSING",
    message: `Portable shader material ${runtime} evidence is missing.`,
    path: `artifacts/${runtime}`,
    severity: "error",
    suggestedFix: `Generate the ${runtime} shader material report before promoting shader parity.`,
  };
}

async function writeReport(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]));
  }
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  void runPortableShaderMaterialGate().then((result) => {
    if (json) {
      process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.artifacts.reportPath, status: result.status }, null, 2)}\n`);
    } else if (result.ok) {
      process.stdout.write(`Portable shader material gate passed. Report: ${result.artifacts.reportPath}\n`);
    } else {
      process.stderr.write(`Portable shader material gate failed. Report: ${result.artifacts.reportPath}\n`);
    }
    process.exitCode = result.ok ? 0 : 1;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
