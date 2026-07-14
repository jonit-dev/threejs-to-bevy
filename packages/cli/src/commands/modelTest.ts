import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";

import { diagnosticResult, type ICommandResult, type IDiagnosticPayload } from "../diagnostics.js";
import { inspectAsset } from "./asset.js";
import { captureScreenshot } from "./visualProof.js";

const MAX_TURNTABLE_ANGLES = 36;
const modelTestUsage = "Usage: tn model-test <asset-path> [--view|--screenshot|--angles <degrees,...>] [--angle <degrees>] [--url <preview-url>] [--screenshot-out <file.png>] [--out <dir>] [--verify] [--json]";

export const MODEL_TEST_MCP_DESCRIPTOR = {
  argv: { arguments: [{ name: "assetPath", positional: true, resolveProjectPath: true }, { flag: "--angle", name: "angle" }], fixed: ["--screenshot"], prefix: ["model-test"], projectOutput: { flag: "--out", path: "artifacts/mcp-model-test" } },
  description: "Build and capture a bounded project-local GLB/glTF model test, returning PNG image content and the structured CLI report.",
  inputSchema: { additionalProperties: false, properties: { angle: { maximum: 360000, minimum: -360000, type: "number" }, assetPath: { pattern: "^(?:assets|content)/[^\\\\]+\\.(?:glb|gltf)$", type: "string" } }, required: ["assetPath"], type: "object" },
  name: "asset.model_test",
} as const;

interface ModelTestFile {
  path: string;
  role: string;
}

interface ScalePreset {
  name: "1x" | "fit-target" | "gameplay-recommended";
  scale: number;
}

interface ModelTestAnalysis {
  cameraFrustum: {
    far: number;
    fovDegrees: number;
    near: number;
    recommendedDistance: number;
  };
  isolationCaveat: string;
  projectedScreenOccupancy?: number;
  scalePresets: ScalePreset[];
  scaleVerdict: "too-small" | "ok" | "too-large" | "clipped" | "unknown";
}

type ScreenshotCaptureReport = Awaited<ReturnType<typeof captureScreenshot>>;
interface ModelTestPbrMaterialCheck {
  baseColor?: unknown;
  metallic?: number;
  name?: string;
  ok: boolean;
  roughness?: number;
  whitePrefabFallback: boolean;
}
export interface ModelTestMaterialObservation {
  baseColor?: unknown;
  baseColorTexture: boolean;
  metallic?: number;
  metallicRoughnessTexture: boolean;
  name?: string;
  roughness?: number;
}
export interface ModelTestMaterialEvidence {
  expected: ModelTestMaterialObservation[];
  observed: ModelTestMaterialObservation[];
  ok: boolean;
  verdict: "fallback-only" | "matches-authored" | "mismatch" | "not-observed" | "unmaterialized";
}
type ModelTestChecks = ScreenshotCaptureReport["checks"] & { pbrMaterial?: ModelTestPbrMaterialCheck };
type ModelTestScreenshot = Omit<ScreenshotCaptureReport, "checks"> & { checks: ModelTestChecks; status: "captured" };

export interface IModelTestCapture {
  angleDegrees: number;
  byteSize: number;
  checks: ModelTestChecks;
  diagnostics?: ScreenshotCaptureReport["diagnostics"];
  outPath: string;
}

export interface IModelTestTurntable {
  captures: IModelTestCapture[];
  manifestPath: string;
}

export interface IModelTestProjectReport {
  analysis: ModelTestAnalysis;
  asset: string;
  bounds?: unknown;
  calibration?: unknown;
  files: ModelTestFile[];
  materials: ModelTestMaterialEvidence;
  outDir: string;
  preview?: {
    bundlePath: string;
    url: string;
  };
  screenshot?: ModelTestScreenshot;
  sourcePath: string;
  turntable?: IModelTestTurntable;
  verified?: { bundlePath?: string; diagnostics?: unknown[]; ok: boolean };
}

export interface IModelTestCommandResult extends ICommandResult {
  server?: IWebPreviewServer;
}

interface ModelTestCommandOptions {
  angleDegrees: number;
  angles?: number[];
  assetArg: string;
  json: boolean;
  mode: "project" | "screenshot" | "turntable" | "view";
  outArg: string;
  screenshotOutArg?: string;
  screenshotUrl?: string;
  verify: boolean;
}

interface ModelTestProjectGenerationOptions {
  assetPath: string;
  outDir: string;
  yawDegrees: number;
}

interface ModelTestProjectState {
  assetFileName: string;
  inspection: Awaited<ReturnType<typeof inspectAsset>>;
  report: IModelTestProjectReport;
}

interface BuiltModelTestProject {
  bundlePath: string;
  diagnostics: unknown[];
}

class ModelTestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ModelTestError";
  }
}

export async function modelTestCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<IModelTestCommandResult> {
  const parsed = parseModelTestArgs(argv);
  if ("diagnostic" in parsed) {
    return diagnosticResult(parsed.diagnostic, { exitCode: 1, json: parsed.json, stderr: !parsed.json });
  }

  const options = parsed.options;
  const assetPath = resolvePath(cwd, options.assetArg);
  const outDir = resolvePath(cwd, options.outArg);
  const screenshotOutPath = options.screenshotOutArg === undefined
    ? join(outDir, "artifacts", "model-test.png")
    : resolvePath(cwd, options.screenshotOutArg);

  try {
    const execution = await createModelTestProject({
      angleDegrees: options.angleDegrees,
      angles: options.angles,
      assetPath,
      mode: options.mode,
      outDir,
      screenshotOutPath,
      screenshotUrl: options.screenshotUrl,
      verify: options.verify,
    });
    const { server, ...report } = execution;
    const code = modelTestReportCode(report);
    return {
      exitCode: code === "TN_MODEL_TEST_OK" ? 0 : 1,
      ...(server === undefined ? {} : { server }),
      stdout: options.json
        ? `${JSON.stringify({ code, ...report }, null, 2)}\n`
        : renderModelTestReport(report),
    };
  } catch (error) {
    const payload = error instanceof ModelTestError
      ? { code: error.code, message: error.message, ...error.details }
      : { code: "TN_MODEL_TEST_FAILED", message: error instanceof Error ? error.message : String(error) };
    return diagnosticResult(payload, { exitCode: 1, json: options.json, stderr: !options.json });
  }
}

export async function createModelTestProject(options: {
  angleDegrees?: number;
  angles?: readonly number[];
  assetPath: string;
  mode?: "project" | "screenshot" | "turntable" | "view";
  outDir: string;
  screenshot?: boolean;
  screenshotOutPath?: string;
  screenshotUrl?: string;
  verify?: boolean;
}): Promise<IModelTestProjectReport & { server?: IWebPreviewServer }> {
  const mode = options.mode ?? (options.angles === undefined ? (options.screenshot === true ? "screenshot" : "project") : "turntable");
  const state = await generateModelTestProject({
    assetPath: options.assetPath,
    outDir: options.outDir,
    yawDegrees: mode === "turntable" ? 0 : options.angleDegrees ?? 0,
  });
  const report = state.report;

  if (mode === "turntable") {
    const angles = options.angles ?? [];
    return captureTurntable(state, report, angles);
  }

  if (mode === "view") {
    const built = await buildModelTestProject(options.outDir, "TN_MODEL_TEST_PREVIEW_FAILED");
    report.verified = { bundlePath: built.bundlePath, diagnostics: built.diagnostics, ok: true };
    const server = await startModelTestPreview(built.bundlePath);
    report.preview = { bundlePath: built.bundlePath, url: server.url };
    return { ...report, server };
  }

  if (mode === "screenshot") {
    return captureSingleScreenshot({
      outDir: options.outDir,
      report,
      screenshotOutPath: options.screenshotOutPath ?? join(options.outDir, "artifacts", "model-test.png"),
      screenshotUrl: options.screenshotUrl,
      verifyMaterials: options.verify,
    });
  }

  if (options.verify === true) {
    return captureSingleScreenshot({
      outDir: options.outDir,
      report,
      screenshotOutPath: join(options.outDir, "artifacts", "model-test-verify.png"),
      verifyMaterials: true,
    });
  }
  return report;
}

async function generateModelTestProject(options: ModelTestProjectGenerationOptions): Promise<ModelTestProjectState> {
  const inspection = await inspectAsset(options.assetPath);
  if (inspection.code !== "TN_ASSET_INSPECT_OK") {
    const firstError = inspection.diagnostics.find((diagnostic) => diagnostic.severity === "error");
    throw new Error(firstError?.message ?? "Asset inspection failed.");
  }

  await mkdir(options.outDir, { recursive: true });
  const assetFileName = basename(options.assetPath);
  const assetOutPath = join(options.outDir, "assets", assetFileName);
  await mkdir(dirname(assetOutPath), { recursive: true });
  await copyFile(options.assetPath, assetOutPath);

  const files: ModelTestFile[] = [{ path: assetOutPath, role: "asset" }];
  for (const dependency of inspection.dependencies ?? []) {
    if (dependency.path === undefined || dependency.uri === undefined || dependency.embedded === true || dependency.missing === true) {
      continue;
    }
    const dependencyOutPath = join(options.outDir, "assets", decodeURIComponent(dependency.uri));
    await mkdir(dirname(dependencyOutPath), { recursive: true });
    await copyFile(dependency.path, dependencyOutPath);
    files.push({ path: dependencyOutPath, role: `${dependency.kind}-dependency` });
  }

  const sourcePath = join(options.outDir, "content", "scenes", "model-test.scene.json");
  const configPath = join(options.outDir, "threenative.config.json");
  const packagePath = join(options.outDir, "package.json");
  const readmePath = join(options.outDir, "README.md");
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, renderSceneDocument({ assetFileName, inspection, yawDegrees: options.yawDegrees }));
  await writeFile(
    configPath,
    `${JSON.stringify({ schema: "threenative.project", version: "0.1.0", entry: "content/scenes/model-test.scene.json", outDir: "dist/model-test.bundle" }, null, 2)}\n`,
  );
  await writeFile(packagePath, `${JSON.stringify(await modelTestPackageMetadata(assetFileName), null, 2)}\n`);
  await writeFile(readmePath, renderReadme(assetFileName, inspection));
  files.push({ path: sourcePath, role: "source" }, { path: configPath, role: "config" }, { path: packagePath, role: "package" }, { path: readmePath, role: "docs" });
  const analysis = modelTestAnalysis(inspection);

  return {
    assetFileName,
    inspection,
    report: {
      analysis,
      asset: options.assetPath,
      bounds: inspection.bounds,
      calibration: inspection.calibration,
      files,
      materials: materialEvidence(expectedMaterialObservations(inspection), []),
      outDir: options.outDir,
      sourcePath,
    },
  };
}

async function captureSingleScreenshot(options: {
  outDir: string;
  report: IModelTestProjectReport;
  screenshotOutPath: string;
  screenshotUrl?: string;
  verifyMaterials?: boolean;
}): Promise<IModelTestProjectReport> {
  let server: IWebPreviewServer | undefined;
  let url = options.screenshotUrl;
  try {
    if (url === undefined) {
      const built = await buildModelTestProject(options.outDir, "TN_MODEL_TEST_PREVIEW_FAILED");
      options.report.verified = { bundlePath: built.bundlePath, diagnostics: built.diagnostics, ok: true };
      server = await startModelTestPreview(built.bundlePath);
      url = server.url;
    }

    const captured = await captureScreenshot({ outPath: options.screenshotOutPath, url });
    options.report.screenshot = { ...captured, checks: modelTestChecks(captured), status: "captured" };
    options.report.materials = materialEvidence(options.report.materials.expected, observedMaterialObservations(captured));
    if (hasCaptureErrors(captured)) {
      throw new ModelTestError(
        "TN_MODEL_TEST_CAPTURE_FAILED",
        `Screenshot capture failed for '${options.report.asset}'.`,
        { outDir: options.outDir, screenshot: options.report.screenshot },
      );
    }
    if (options.verifyMaterials === true && !options.report.materials.ok) {
      throw new ModelTestError(
        "TN_MODEL_TEST_MATERIAL_VERIFY_FAILED",
        `Runtime material verification failed for '${options.report.asset}': ${options.report.materials.verdict}.`,
        { materials: options.report.materials, outDir: options.outDir, screenshot: options.report.screenshot },
      );
    }
    return options.report;
  } catch (error) {
    if (error instanceof ModelTestError) {
      if (error.details.screenshot === undefined && options.report.screenshot !== undefined) {
        throw new ModelTestError(error.code, error.message, { ...error.details, outDir: options.outDir, screenshot: options.report.screenshot });
      }
      throw error;
    }
    throw new ModelTestError(
      "TN_MODEL_TEST_CAPTURE_FAILED",
      `Screenshot capture failed for '${options.report.asset}': ${errorMessage(error)}.`,
      { outDir: options.outDir, screenshot: options.report.screenshot },
    );
  } finally {
    if (server !== undefined) {
      try {
        await server.close();
      } catch (error) {
        throw new ModelTestError(
          "TN_MODEL_TEST_PREVIEW_FAILED",
          `Could not close the generated model-test preview: ${errorMessage(error)}.`,
          { outDir: options.outDir, screenshot: options.report.screenshot },
        );
      }
    }
  }
}

async function captureTurntable(
  state: ModelTestProjectState,
  report: IModelTestProjectReport,
  angles: readonly number[],
): Promise<IModelTestProjectReport> {
  const captures: IModelTestCapture[] = [];
  const turntableDir = join(report.outDir, "artifacts", "turntable");
  let failure: ModelTestError | undefined;
  let restoreFailure: ModelTestError | undefined;

  try {
    for (const angleDegrees of angles) {
      try {
        await writeModelTestScene(state.report.sourcePath, state.assetFileName, state.inspection, angleDegrees);
      } catch (error) {
        failure = asModelTestError(error, "TN_MODEL_TEST_PREVIEW_FAILED", `Could not serialize model-test angle ${angleDegrees} degrees: ${errorMessage(error)}.`);
        break;
      }
      let built: BuiltModelTestProject;
      try {
        built = await buildModelTestProject(report.outDir, "TN_MODEL_TEST_PREVIEW_FAILED");
      } catch (error) {
        failure = asModelTestError(error, "TN_MODEL_TEST_PREVIEW_FAILED", `Could not build model-test angle ${angleDegrees} degrees: ${errorMessage(error)}.`);
        break;
      }

      let server: IWebPreviewServer | undefined;
      try {
        try {
          server = await startModelTestPreview(built.bundlePath);
        } catch (error) {
          throw new ModelTestError(
            "TN_MODEL_TEST_PREVIEW_FAILED",
            `Could not serve model-test angle ${angleDegrees} degrees: ${errorMessage(error)}.`,
            { angleDegrees, bundlePath: built.bundlePath },
          );
        }

        const outPath = join(turntableDir, `model-test-yaw-${formatAngleForFilename(angleDegrees)}.png`);
        try {
          const captured = await captureScreenshot({ outPath, url: server.url });
          const record = captureRecord(angleDegrees, captured);
          captures.push(record);
          report.materials = materialEvidence(report.materials.expected, observedMaterialObservations(captured));
          if (hasCaptureErrors(captured)) {
            failure = new ModelTestError(
              "TN_MODEL_TEST_CAPTURE_FAILED",
              `Screenshot capture failed for model-test angle ${angleDegrees} degrees.`,
              { angleDegrees, capture: record },
            );
            break;
          }
        } catch (error) {
          failure = new ModelTestError(
            "TN_MODEL_TEST_CAPTURE_FAILED",
            `Screenshot capture failed for model-test angle ${angleDegrees} degrees: ${errorMessage(error)}.`,
            { angleDegrees, captures },
          );
          break;
        }
      } catch (error) {
        failure = error instanceof ModelTestError
          ? error
          : new ModelTestError("TN_MODEL_TEST_PREVIEW_FAILED", errorMessage(error), { angleDegrees, captures });
        break;
      } finally {
        if (server !== undefined) {
          try {
            await server.close();
          } catch (error) {
            failure ??= new ModelTestError(
              "TN_MODEL_TEST_PREVIEW_FAILED",
              `Could not close the model-test preview after angle ${angleDegrees} degrees: ${errorMessage(error)}.`,
              { angleDegrees, captures },
            );
          }
        }
      }
      if (failure !== undefined) {
        break;
      }
    }
  } finally {
    try {
      await writeModelTestScene(state.report.sourcePath, state.assetFileName, state.inspection, 0);
      const restored = await buildModelTestProject(report.outDir, "TN_MODEL_TEST_RESTORE_FAILED");
      report.verified = { bundlePath: restored.bundlePath, diagnostics: restored.diagnostics, ok: true };
    } catch (error) {
      restoreFailure = asModelTestError(error, "TN_MODEL_TEST_RESTORE_FAILED", `Could not restore the model-test project to zero yaw: ${errorMessage(error)}.`);
    }
  }

  const turntable = { captures };
  if (restoreFailure !== undefined) {
    throw new ModelTestError(
      "TN_MODEL_TEST_RESTORE_FAILED",
      restoreFailure.message,
      { captures, previousFailure: failure?.code },
    );
  }
  if (failure !== undefined) {
    throw new ModelTestError(failure.code, failure.message, { ...failure.details, turntable });
  }

  const manifestPath = join(turntableDir, "manifest.json");
  try {
    await writeJsonAtomically(manifestPath, {
      angles: [...angles],
      asset: `assets/${state.assetFileName}`,
      capturedAt: new Date().toISOString(),
      captures: captures.map((capture) => ({
        ...capture,
        outPath: relative(report.outDir, capture.outPath).replaceAll("\\", "/"),
      })),
      generatedBundlePath: report.verified?.bundlePath === undefined
        ? undefined
        : relative(report.outDir, report.verified.bundlePath).replaceAll("\\", "/"),
      inputAssetPath: `assets/${state.assetFileName}`,
      normalizedAngles: [...angles],
      schema: "threenative.model-test-turntable",
      version: "0.1.0",
    });
  } catch (error) {
    throw new ModelTestError(
      "TN_MODEL_TEST_CAPTURE_FAILED",
      `Could not write the turntable manifest '${manifestPath}': ${errorMessage(error)}.`,
      { captures },
    );
  }
  report.turntable = { captures, manifestPath };
  return report;
}

async function buildModelTestProject(outDir: string, failureCode: string): Promise<BuiltModelTestProject> {
  try {
    const config = await loadProjectConfig(outDir);
    const build = await buildProject(outDir);
    const validation = await validateBundle(build.bundlePath);
    if (!validation.ok) {
      throw new Error(validation.diagnostics[0]?.message ?? "Bundle validation failed.");
    }
    return {
      bundlePath: resolve(outDir, config.outDir),
      diagnostics: validation.diagnostics,
    };
  } catch (error) {
    throw new ModelTestError(failureCode, `Could not build or validate the generated model-test bundle: ${errorMessage(error)}.`, { outDir });
  }
}

async function startModelTestPreview(bundlePath: string): Promise<IWebPreviewServer> {
  let server: IWebPreviewServer;
  try {
    server = await startWebPreview({ bundlePath, silent: true });
  } catch (error) {
    throw new ModelTestError("TN_MODEL_TEST_PREVIEW_FAILED", `Could not start the generated model-test preview: ${errorMessage(error)}.`, { bundlePath });
  }
  return managePreviewLifecycle(server);
}

function managePreviewLifecycle(server: IWebPreviewServer): IWebPreviewServer {
  let closed = false;
  const closeSignalHandler = (): void => {
    void managedServer.close().catch(() => undefined);
  };
  const managedServer: IWebPreviewServer = {
    ...server,
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      process.removeListener("SIGINT", closeSignalHandler);
      process.removeListener("SIGTERM", closeSignalHandler);
      await server.close();
    },
  };
  process.once("SIGINT", closeSignalHandler);
  process.once("SIGTERM", closeSignalHandler);
  return managedServer;
}

function parseModelTestArgs(argv: readonly string[]): { json: boolean; options: ModelTestCommandOptions } | { diagnostic: IDiagnosticPayload; json: boolean } {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const positionals: string[] = [];
  let view = false;
  let screenshot = false;
  let verify = false;
  let outArg: string | undefined;
  let projectArg: string | undefined;
  let screenshotOutArg: string | undefined;
  let screenshotUrl: string | undefined;
  let angleArg: string | undefined;
  let anglesArg: string | undefined;

  for (let index = 0; index < normalizedArgv.length; index += 1) {
    const argument = normalizedArgv[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === "--json") {
      continue;
    }
    if (argument === "--view") {
      view = true;
      continue;
    }
    if (argument === "--screenshot") {
      screenshot = true;
      continue;
    }
    if (argument === "--verify") {
      verify = true;
      continue;
    }
    if (["--out", "--project", "--screenshot-out", "--url", "--angle", "--angles"].includes(argument)) {
      const value = normalizedArgv[index + 1];
      if (value === undefined) {
        return { diagnostic: flagValueDiagnostic(argument), json };
      }
      index += 1;
      if (argument === "--out") outArg = value;
      if (argument === "--project") projectArg = value;
      if (argument === "--screenshot-out") screenshotOutArg = value;
      if (argument === "--url") screenshotUrl = value;
      if (argument === "--angle") angleArg = value;
      if (argument === "--angles") anglesArg = value;
      continue;
    }
    if (argument.startsWith("-")) {
      return { diagnostic: { code: "TN_MODEL_TEST_USAGE", message: `Unknown model-test option '${argument}'. ${modelTestUsage}` }, json };
    }
    positionals.push(argument);
  }

  if (positionals.length !== 1) {
    return { diagnostic: { code: "TN_MODEL_TEST_USAGE", message: modelTestUsage }, json };
  }
  if (outArg !== undefined && projectArg !== undefined) {
    return {
      diagnostic: {
        code: "TN_MODEL_TEST_MODE_CONFLICT",
        message: "Use only one of --out or --project for the generated model-test directory.",
      },
      json,
    };
  }
  if (view && (screenshot || anglesArg !== undefined || screenshotUrl !== undefined || screenshotOutArg !== undefined)) {
    return {
      diagnostic: {
        code: "TN_MODEL_TEST_MODE_CONFLICT",
        message: "--view cannot be combined with --screenshot, --angles, --url, or --screenshot-out.",
      },
      json,
    };
  }
  if (anglesArg !== undefined && (view || angleArg !== undefined || screenshotUrl !== undefined || screenshotOutArg !== undefined)) {
    return {
      diagnostic: {
        code: "TN_MODEL_TEST_MODE_CONFLICT",
        message: "--angles cannot be combined with --view, --angle, --url, or --screenshot-out.",
      },
      json,
    };
  }
  if (!view && !screenshot && anglesArg === undefined && (angleArg !== undefined || screenshotUrl !== undefined || screenshotOutArg !== undefined)) {
    return {
      diagnostic: {
        code: "TN_MODEL_TEST_MODE_CONFLICT",
        message: "--angle, --url, and --screenshot-out require --view or --screenshot; --url and --screenshot-out are single-capture options.",
      },
      json,
    };
  }
  if (screenshotUrl !== undefined && !screenshot && anglesArg === undefined) {
    return {
      diagnostic: {
        code: "TN_MODEL_TEST_MODE_CONFLICT",
        message: "--url is an external preview URL for a single --screenshot capture.",
      },
      json,
    };
  }

  const angleResult = angleArg === undefined ? { value: 0 } : parseSingleAngle(angleArg);
  if ("diagnostic" in angleResult) {
    return { diagnostic: angleResult.diagnostic, json };
  }
  const anglesResult = anglesArg === undefined ? undefined : parseAngleList(anglesArg);
  if (anglesResult !== undefined && "diagnostic" in anglesResult) {
    return { diagnostic: anglesResult.diagnostic, json };
  }

  const mode = anglesResult === undefined ? (view ? "view" : screenshot ? "screenshot" : "project") : "turntable";
  return {
    json,
    options: {
      angleDegrees: angleResult.value,
      ...(anglesResult === undefined ? {} : { angles: anglesResult.value }),
      assetArg: positionals[0]!,
      json,
      mode,
      outArg: outArg ?? projectArg ?? "artifacts/model-test",
      ...(screenshotOutArg === undefined ? {} : { screenshotOutArg }),
      ...(screenshotUrl === undefined ? {} : { screenshotUrl }),
      verify,
    },
  };
}

function flagValueDiagnostic(flag: string): IDiagnosticPayload {
  const code = flag === "--angle" ? "TN_MODEL_TEST_ANGLE_INVALID" : flag === "--angles" ? "TN_MODEL_TEST_ANGLES_INVALID" : "TN_MODEL_TEST_USAGE";
  return { code, message: `Missing value for ${flag}. ${modelTestUsage}` };
}

function parseSingleAngle(value: string): { value: number } | { diagnostic: IDiagnosticPayload } {
  if (value.trim() === "") {
    return { diagnostic: { code: "TN_MODEL_TEST_ANGLE_INVALID", message: "--angle must be a finite number of degrees." } };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { diagnostic: { code: "TN_MODEL_TEST_ANGLE_INVALID", message: `Invalid --angle '${value}'. Use a finite number of degrees.` } };
  }
  return { value: normalizeAngle(parsed) };
}

function parseAngleList(value: string): { value: number[] } | { diagnostic: IDiagnosticPayload } {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part === "")) {
    return { diagnostic: { code: "TN_MODEL_TEST_ANGLES_INVALID", message: "--angles must contain one or more comma-separated finite degree values." } };
  }
  const normalized: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    const parsed = Number(part);
    if (!Number.isFinite(parsed)) {
      return { diagnostic: { code: "TN_MODEL_TEST_ANGLES_INVALID", message: `Invalid turntable angle '${part}'. Every value must be finite.` } };
    }
    const angle = normalizeAngle(parsed);
    if (!seen.has(angle)) {
      seen.add(angle);
      normalized.push(angle);
    }
  }
  if (normalized.length === 0 || normalized.length > MAX_TURNTABLE_ANGLES) {
    return {
      diagnostic: {
        code: "TN_MODEL_TEST_ANGLES_INVALID",
        message: `--angles must contain between 1 and ${MAX_TURNTABLE_ANGLES} distinct normalized angles.`,
      },
    };
  }
  return { value: normalized };
}

function normalizeAngle(value: number): number {
  const normalized = ((value % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function modelTestReportCode(report: IModelTestProjectReport): "TN_MODEL_TEST_OK" | "TN_MODEL_TEST_CAPTURE_FAILED" {
  if (report.screenshot !== undefined && hasCaptureErrors(report.screenshot)) {
    return "TN_MODEL_TEST_CAPTURE_FAILED";
  }
  return "TN_MODEL_TEST_OK";
}

function hasCaptureErrors(report: { diagnostics?: ScreenshotCaptureReport["diagnostics"] }): boolean {
  return report.diagnostics?.some((diagnostic) => diagnostic.severity === "error") ?? false;
}

function captureRecord(angleDegrees: number, captured: ScreenshotCaptureReport): IModelTestCapture {
  return {
    angleDegrees,
    byteSize: captured.byteSize,
    checks: modelTestChecks(captured),
    ...(captured.diagnostics === undefined ? {} : { diagnostics: captured.diagnostics }),
    outPath: captured.outPath,
  };
}

function expectedMaterialObservations(inspection: Awaited<ReturnType<typeof inspectAsset>>): ModelTestMaterialObservation[] {
  return (inspection.materials ?? []).map((material) => ({
    baseColor: material.baseColor,
    baseColorTexture: material.baseColorTexture,
    metallic: material.metallic,
    metallicRoughnessTexture: material.metallicRoughnessTexture,
    ...(material.name === undefined ? {} : { name: material.name }),
    roughness: material.roughness,
  }));
}

function observedMaterialObservations(captured: ScreenshotCaptureReport): ModelTestMaterialObservation[] {
  const root = recordValue(captured.runtimeReady);
  const runtimeDiagnostics = recordValue(root?.runtimeDiagnostics);
  const scene = recordValue(runtimeDiagnostics?.scene);
  const entities = Array.isArray(scene?.renderedEntities) ? scene.renderedEntities : [];
  const model = entities.map(recordValue).find((entity) => entity?.id === "model.under-test.instance");
  const materials = Array.isArray(model?.materials)
    ? model.materials.map(recordValue).filter((material): material is Record<string, unknown> => material !== undefined)
    : [recordValue(model?.material)].filter((material): material is Record<string, unknown> => material !== undefined);
  return materials.map((material) => ({
    ...(material.baseColor === undefined ? {} : { baseColor: material.baseColor }),
    baseColorTexture: material.baseColorTextureLoaded === true,
    ...(typeof material.metallic === "number" ? { metallic: material.metallic } : {}),
    metallicRoughnessTexture: material.metallicRoughnessTextureLoaded === true,
    ...(typeof material.name === "string" ? { name: material.name } : {}),
    ...(typeof material.roughness === "number" ? { roughness: material.roughness } : {}),
  }));
}

export function materialEvidence(
  expected: ModelTestMaterialObservation[],
  observed: ModelTestMaterialObservation[],
): ModelTestMaterialEvidence {
  if (expected.length === 0) {
    return { expected, observed, ok: true, verdict: "unmaterialized" };
  }
  if (observed.length === 0) {
    return { expected, observed, ok: false, verdict: "not-observed" };
  }
  const expectsDistinctMaterial = expected.some((material) => material.baseColorTexture
    || material.metallicRoughnessTexture
    || (material.name !== undefined && material.name.trim() !== "")
    || (typeof material.metallic === "number" && material.metallic !== 0)
    || !isWhiteBaseColor(material.baseColor));
  const fallbackOnly = expectsDistinctMaterial && observed.every((material) => isWhiteBaseColor(material.baseColor)
    && material.baseColorTexture === false
    && (material.metallic ?? 0) === 0
    && (material.roughness ?? 1) === 1
    && (material.name === undefined || material.name.trim() === ""));
  if (fallbackOnly) {
    return { expected, observed, ok: false, verdict: "fallback-only" };
  }
  const unmatched = [...observed];
  const matches = [...expected]
    .sort((left, right) => materialSortKey(left).localeCompare(materialSortKey(right)))
    .every((material) => {
      const index = unmatched.findIndex((candidate) => materialObservationsAgree(material, candidate));
      if (index < 0) return false;
      unmatched.splice(index, 1);
      return true;
    });
  const exactMatch = matches && unmatched.length === 0;
  return { expected, observed, ok: exactMatch, verdict: exactMatch ? "matches-authored" : "mismatch" };
}

function materialObservationsAgree(expected: ModelTestMaterialObservation, observed: ModelTestMaterialObservation): boolean {
  return (expected.name === undefined || expected.name === observed.name)
    && numericArraysAgree(expected.baseColor, observed.baseColor, 0.02, 3)
    && numbersAgree(expected.metallic, observed.metallic, 0.02)
    && numbersAgree(expected.roughness, observed.roughness, 0.02)
    && expected.baseColorTexture === observed.baseColorTexture
    && expected.metallicRoughnessTexture === observed.metallicRoughnessTexture;
}

function numericArraysAgree(expected: unknown, observed: unknown, tolerance: number, length: number): boolean {
  if (!Array.isArray(expected) || !Array.isArray(observed) || expected.length < length || observed.length < length) return false;
  return expected.slice(0, length).every((value, index) => typeof value === "number"
    && typeof observed[index] === "number"
    && Math.abs(value - observed[index]) <= tolerance);
}

function numbersAgree(expected: number | undefined, observed: number | undefined, tolerance: number): boolean {
  return expected === undefined || (observed !== undefined && Math.abs(expected - observed) <= tolerance);
}

function materialSortKey(material: ModelTestMaterialObservation): string {
  return `${material.name ?? ""}:${JSON.stringify(material)}`;
}

function isWhiteBaseColor(value: unknown): boolean {
  return Array.isArray(value)
    && value.length >= 3
    && value.slice(0, 3).every((channel) => typeof channel === "number" && Math.abs(channel - 1) < 0.000001);
}

function modelTestChecks(captured: ScreenshotCaptureReport): ModelTestChecks {
  const root = recordValue(captured.runtimeReady);
  const runtimeDiagnostics = recordValue(root?.runtimeDiagnostics);
  const scene = recordValue(runtimeDiagnostics?.scene);
  const entities = Array.isArray(scene?.renderedEntities) ? scene.renderedEntities : [];
  const model = entities.map(recordValue).find((entity) => entity?.id === "model.under-test.instance");
  const material = recordValue(model?.material);
  if (material === undefined) return captured.checks;
  const baseColor = material.baseColor;
  const name = typeof material.name === "string" ? material.name : undefined;
  const metallic = typeof material.metallic === "number" ? material.metallic : undefined;
  const roughness = typeof material.roughness === "number" ? material.roughness : undefined;
  const whitePrefabFallback = name === undefined
    && Array.isArray(baseColor)
    && baseColor.length >= 3
    && baseColor.slice(0, 3).every((value) => typeof value === "number" && Math.abs(value - 1) < 0.000001);
  return {
    ...captured.checks,
    pbrMaterial: {
      ...(baseColor === undefined ? {} : { baseColor }),
      ...(metallic === undefined ? {} : { metallic }),
      ...(name === undefined ? {} : { name }),
      ok: baseColor !== undefined && metallic !== undefined && roughness !== undefined && !whitePrefabFallback,
      ...(roughness === undefined ? {} : { roughness }),
      whitePrefabFallback,
    },
  };
}

async function modelTestPackageMetadata(assetFileName: string): Promise<Record<string, unknown>> {
  const packagePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../package.json");
  const metadata = JSON.parse(await readFile(packagePath, "utf8")) as { version?: unknown };
  if (typeof metadata.version !== "string" || metadata.version.trim() === "") {
    throw new ModelTestError("TN_MODEL_TEST_PACKAGE_RESOLUTION_FAILED", `Could not resolve a CLI version from '${packagePath}'.`);
  }
  const compatibleVersion = metadata.version.includes("-") ? metadata.version : `^${metadata.version}`;
  return {
    dependencies: { "@threenative/sdk": compatibleVersion },
    devDependencies: { "@threenative/cli": compatibleVersion },
    name: "threenative-model-test",
    private: true,
    scripts: {
      build: "tn build --project .",
      validate: "tn validate --project .",
      verify: `tn model-test ${JSON.stringify(`assets/${assetFileName}`)} --out artifacts/model-test --verify --json`,
    },
    type: "module",
  };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asModelTestError(error: unknown, code: string, message: string): ModelTestError {
  if (error instanceof ModelTestError) {
    return error;
  }
  return new ModelTestError(code, message);
}

async function writeModelTestScene(
  sourcePath: string,
  assetFileName: string,
  inspection: Awaited<ReturnType<typeof inspectAsset>>,
  yawDegrees: number,
): Promise<void> {
  await writeFile(sourcePath, renderSceneDocument({ assetFileName, inspection, yawDegrees }));
}

async function writeJsonAtomically(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function renderSceneDocument(options: { assetFileName: string; inspection: Awaited<ReturnType<typeof inspectAsset>>; yawDegrees: number }): string {
  const bounds = options.inspection.bounds;
  const calibration = options.inspection.calibration;
  const size = bounds?.size ?? [1, 1, 1];
  const center = bounds?.center ?? [0, 0, 0];
  const largest = Math.max(0.001, ...size.map((value) => Math.abs(value)));
  const floorSize = round(Math.max(4, largest * 2));
  const targetScale = calibration?.fitScales?.targetHeight2m ?? calibration?.fitScales?.targetLength4m ?? 1;
  const scale = round(targetScale);
  const scaledBoundsRadius = Math.hypot(size[0] * scale, size[1] * scale, size[2] * scale) / 2;
  const verticalHalfFovRadians = (50 * Math.PI) / 360;
  const turntableFitDistance = scaledBoundsRadius * (1 + 1 / Math.tan(verticalHalfFovRadians)) * 1.05;
  const cameraDistance = round(Math.max(calibration?.camera.recommendedDistance ?? largest * 2.5, turntableFitDistance, 3));
  const cameraHeight = round(Math.max(size[1] * scale * 0.6, 1.4));
  const cameraTargetHeight = round((size[1] * scale) / 2);
  const minY = bounds === undefined ? 0 : bounds.min[1];
  const yOffset = round(-minY);
  const yawRadians = round((options.yawDegrees * Math.PI) / 180);
  const boundsMarkerDepth = round(Math.max(size[2] * scale * 0.04, 0.02));
  const yawFootprintRadius = Math.hypot(size[0] * scale, size[2] * scale) / 2;
  const boundsMarkerDepthOffset = round(yawFootprintRadius + boundsMarkerDepth / 2 + 0.12);
  const cameraPitch = round(-Math.atan2(cameraHeight - cameraTargetHeight, cameraDistance));

  const scene = {
    schema: "threenative.scene",
    version: "0.1.0",
    id: "model-test",
    kind: "level",
    entities: [
      {
        id: "scale.floor.1m-grid",
        prefab: "prefab.floor",
        transform: {
          position: [0, -0.02, 0],
          scale: [floorSize, 0.04, floorSize],
        },
      },
      {
        id: "model.under-test.instance",
        prefab: "prefab.model-under-test",
        transform: {
          position: [round(-center[0] * scale), round(yOffset * scale), round(-center[2] * scale)],
          rotation: [0, yawRadians, 0],
          scale: [scale, scale, scale],
        },
      },
      {
        id: "model.bounds.reference",
        prefab: "prefab.bounds-marker",
        transform: {
          // Keep the opaque bounds reference behind the imported model so it
          // frames the asset without hiding its authored materials.
          position: [0, round((size[1] * scale) / 2), -boundsMarkerDepthOffset],
          scale: [
            round(Math.max(size[0] * scale, 0.05)),
            round(Math.max(size[1] * scale, 0.05)),
            boundsMarkerDepth,
          ],
        },
      },
      {
        id: "scale.ruler.1m",
        prefab: "prefab.ruler",
        transform: {
          position: [0, 0.05, round(floorSize / 2 - 0.4)],
          scale: [1, 0.05, 0.05],
        },
      },
      {
        id: "camera.model-test",
        transform: {
          position: [0, cameraHeight, cameraDistance],
          rotation: [cameraPitch, 0, 0],
        },
        components: {
          camera: {
            mode: "perspective",
            fovY: 50,
            near: 0.01,
            far: round(Math.max(cameraDistance * 6, 50)),
          },
        },
      },
      {
        id: "light.ambient",
        components: {
          Light: {
            kind: "ambient",
            color: "#dbeafe",
            intensity: 0.75,
          },
        },
      },
      {
        id: "light.key",
        transform: {
          position: [3, 5, 4],
        },
        components: {
          Light: {
            kind: "directional",
            color: "#fff7ed",
            intensity: 2.2,
          },
        },
      },
    ],
    prefabs: [
      {
        id: "prefab.floor",
        primitive: "box",
        color: "#263445",
      },
      {
        id: "prefab.model-under-test",
        asset: `assets/${options.assetFileName}`,
      },
      {
        id: "prefab.bounds-marker",
        primitive: "box",
        color: "#38bdf8",
      },
      {
        id: "prefab.ruler",
        primitive: "box",
        color: "#f97316",
      },
    ],
    resources: [],
    systems: [],
    ui: {
      nodes: [],
    },
  };

  return `${JSON.stringify(scene, null, 2)}\n`;
}

function renderReadme(assetPath: string, inspection: Awaited<ReturnType<typeof inspectAsset>>): string {
  const analysis = modelTestAnalysis(inspection);
  return `# ThreeNative model test\n\nGenerated by \`tn model-test\` for:\n\n\`${assetPath}\`\n\n## What this scene contains\n\n- The inspected model copied into \`assets/\`.\n- A structured scene source at \`content/scenes/model-test.scene.json\`.\n- A 1 meter orange ruler and floor plane for scale checks.\n- A translucent bounds marker sized from glTF accessor min/max bounds.\n- Camera/light defaults from asset calibration hints.\n- Scale presets: ${analysis.scalePresets.map((preset) => `${preset.name}=${preset.scale}`).join(", ")}.\n- Camera frustum: ${analysis.cameraFrustum.fovDegrees}deg FOV, near ${analysis.cameraFrustum.near}, far ${analysis.cameraFrustum.far}, recommended distance ${analysis.cameraFrustum.recommendedDistance}m.\n\n## Inspection summary\n\n- Bounds: ${inspection.bounds === undefined ? "unavailable" : JSON.stringify(inspection.bounds.size)}\n- Calibration: ${inspection.calibration === undefined ? "unavailable" : JSON.stringify(inspection.calibration.fitScales)}\n- Scale verdict: ${analysis.scaleVerdict}\n- Projected screen occupancy: ${analysis.projectedScreenOccupancy ?? "unknown"}\n\n${analysis.isolationCaveat}\n\nRun \`pnpm run build\`, \`pnpm run validate\`, then \`pnpm run verify\` after installing workspace dependencies.\n`;
}

function renderModelTestReport(report: IModelTestProjectReport): string {
  const verified = report.verified === undefined ? "Verification: not requested" : `Verification: ${report.verified.ok ? "passed" : "failed"}${report.verified.bundlePath === undefined ? "" : ` (${report.verified.bundlePath})`}`;
  const preview = report.preview === undefined ? "Preview: not started" : `Preview: ${report.preview.url}`;
  const screenshot = report.screenshot === undefined
    ? "Screenshot: not requested"
    : `Screenshot: ${report.screenshot.outPath}`;
  const turntable = report.turntable === undefined
    ? "Turntable: not requested"
    : `Turntable manifest: ${report.turntable.manifestPath}\nTurntable captures:\n${report.turntable.captures.map((capture) => `  - ${capture.angleDegrees} degrees: ${capture.outPath} (${capture.byteSize} bytes)`).join("\n")}`;
  return `Model test project generated.\nOutput: ${report.outDir}\nAsset: ${report.asset}\nScale verdict: ${report.analysis.scaleVerdict}\nScale presets: ${report.analysis.scalePresets.map((preset) => `${preset.name}=${preset.scale}`).join(", ")}\nFiles:\n${report.files.map((file) => `  - ${file.role}: ${file.path}`).join("\n")}\n${verified}\n${preview}\n${screenshot}\n${turntable}\n${report.analysis.isolationCaveat}\n`;
}

function modelTestAnalysis(inspection: Awaited<ReturnType<typeof inspectAsset>>): ModelTestAnalysis {
  const bounds = inspection.bounds;
  const calibration = inspection.calibration;
  const fitTarget = calibration?.fitScales?.targetHeight2m ?? calibration?.fitScales?.targetLength4m ?? calibration?.fitScales?.targetWidth1m ?? 1;
  const gameplayRecommended = calibration?.fitScales?.targetLength4m ?? calibration?.fitScales?.targetHeight2m ?? fitTarget;
  const camera = calibration?.camera ?? { far: 100, fovDegrees: 50, near: 0.01, recommendedDistance: 5 };
  const projectedScreenOccupancy = bounds === undefined ? undefined : projectedOccupancy(bounds.size[1] * fitTarget, camera.recommendedDistance, camera.fovDegrees);
  const scaleVerdict = scaleVerdictFor({ calibrationVerdict: calibration?.gameplay.verdict, projectedScreenOccupancy });
  return {
    cameraFrustum: camera,
    isolationCaveat: "Isolated model render proof only separates loader, asset, bounds, and scale issues from full scene composition; it does not prove the model is framed correctly in the final game.",
    projectedScreenOccupancy,
    scalePresets: [
      { name: "1x", scale: 1 },
      { name: "fit-target", scale: round(fitTarget) },
      { name: "gameplay-recommended", scale: round(gameplayRecommended) },
    ],
    scaleVerdict,
  };
}

function projectedOccupancy(height: number, distance: number, fovDegrees: number): number {
  if (height <= 0 || distance <= 0 || fovDegrees <= 0) {
    return 0;
  }
  const viewHeight = 2 * distance * Math.tan((fovDegrees * Math.PI) / 360);
  return round(height / viewHeight);
}

function scaleVerdictFor(options: {
  calibrationVerdict?: "ok" | "too-small" | "too-large" | "unknown";
  projectedScreenOccupancy?: number;
}): ModelTestAnalysis["scaleVerdict"] {
  if (options.projectedScreenOccupancy === undefined) {
    return options.calibrationVerdict ?? "unknown";
  }
  if (options.projectedScreenOccupancy > 0.95) {
    return "clipped";
  }
  if (options.projectedScreenOccupancy < 0.05) {
    return "too-small";
  }
  if (options.projectedScreenOccupancy > 0.85) {
    return "too-large";
  }
  return options.calibrationVerdict ?? "ok";
}

function formatAngleForFilename(angleDegrees: number): string {
  const [integer, fraction] = String(angleDegrees).split(".");
  const safeInteger = (integer ?? "0").replace(/[^0-9]/g, "0").padStart(3, "0");
  const safeFraction = fraction === undefined ? "" : `_${fraction.replace(/[^0-9]/g, "0")}`;
  return `${safeInteger}${safeFraction}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
