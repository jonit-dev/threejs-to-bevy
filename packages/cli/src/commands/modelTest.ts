import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { captureScreenshot } from "./visualProof.js";
import { inspectAsset } from "./asset.js";

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

interface ModelTestScreenshotUnavailable {
  code: "TN_MODEL_TEST_SCREENSHOT_UNAVAILABLE";
  message: string;
  nextCommand: string;
  status: "unavailable";
}

type ModelTestScreenshot = (Awaited<ReturnType<typeof captureScreenshot>> & { status: "captured" }) | ModelTestScreenshotUnavailable;

export async function modelTestCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const verify = normalizedArgv.includes("--verify");
  const screenshot = normalizedArgv.includes("--screenshot");
  const assetArg = normalizedArgv.find((arg) => !arg.startsWith("-"));
  const outArg = flagValue(normalizedArgv, "--out") ?? flagValue(normalizedArgv, "--project") ?? "artifacts/model-test";
  const screenshotUrl = flagValue(normalizedArgv, "--url");
  const screenshotOutArg = flagValue(normalizedArgv, "--screenshot-out");

  if (assetArg === undefined) {
    return diagnosticResult(
      { code: "TN_MODEL_TEST_USAGE", message: "Usage: tn model-test <asset-path> [--out <dir>] [--verify] [--screenshot] [--url <preview-url>] [--json]" },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const assetPath = resolvePath(cwd, assetArg);
  const outDir = resolvePath(cwd, outArg);
  const screenshotOutPath = screenshotOutArg === undefined ? join(outDir, "artifacts", "model-test.png") : resolvePath(cwd, screenshotOutArg);

  try {
    const report = await createModelTestProject({ assetPath, outDir, screenshot, screenshotOutPath, screenshotUrl, verify });
    return {
      exitCode: report.verified?.ok === false ? 1 : 0,
      stdout: json
        ? `${JSON.stringify({ code: report.verified?.ok === false ? "TN_MODEL_TEST_VERIFY_FAILED" : "TN_MODEL_TEST_OK", ...report }, null, 2)}\n`
        : renderModelTestReport(report),
    };
  } catch (error) {
    return diagnosticResult(
      { code: "TN_MODEL_TEST_FAILED", message: error instanceof Error ? error.message : String(error) },
      { exitCode: 1, json, stderr: !json },
    );
  }
}

export async function createModelTestProject(options: {
  assetPath: string;
  outDir: string;
  screenshot?: boolean;
  screenshotOutPath?: string;
  screenshotUrl?: string;
  verify?: boolean;
}): Promise<{
  analysis: ModelTestAnalysis;
  asset: string;
  bounds?: unknown;
  calibration?: unknown;
  files: ModelTestFile[];
  outDir: string;
  screenshot?: ModelTestScreenshot;
  verified?: { bundlePath?: string; diagnostics?: unknown[]; ok: boolean };
}> {
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
  await writeFile(sourcePath, renderSceneDocument({ assetFileName, inspection }));
  await writeFile(
    configPath,
    `${JSON.stringify({ schema: "threenative.project", version: "0.1.0", entry: "content/scenes/model-test.scene.json", outDir: "dist/model-test.bundle" }, null, 2)}\n`,
  );
  await writeFile(packagePath, `${JSON.stringify({
    name: "threenative-model-test",
    private: true,
    type: "module",
    scripts: {
      build: "tn build --project .",
      validate: "tn validate --project .",
      verify: "tn verify --project . --frames 2 --json",
    },
    dependencies: {
      "@threenative/sdk": "file:/home/joao/projects/threejs-to-bevy/packages/sdk",
    },
    devDependencies: {
      "@threenative/cli": "file:/home/joao/projects/threejs-to-bevy/packages/cli",
    },
  }, null, 2)}\n`);
  await writeFile(readmePath, renderReadme(options.assetPath, inspection));
  files.push({ path: sourcePath, role: "source" }, { path: configPath, role: "config" }, { path: packagePath, role: "package" }, { path: readmePath, role: "docs" });
  const analysis = modelTestAnalysis(inspection);

  let verified: { bundlePath?: string; diagnostics?: unknown[]; ok: boolean } | undefined;
  if (options.verify === true) {
    const config = await loadProjectConfig(options.outDir);
    const build = await buildProject(options.outDir);
    const bundlePath = resolve(options.outDir, config.outDir);
    const validation = await validateBundle(build.bundlePath);
    verified = { bundlePath, diagnostics: validation.diagnostics, ok: validation.ok };
  }

  let screenshot: ModelTestScreenshot | undefined;
  if (options.screenshot === true) {
    if (options.screenshotUrl === undefined) {
      screenshot = {
        code: "TN_MODEL_TEST_SCREENSHOT_UNAVAILABLE",
        message: "Screenshot capture was requested, but no --url was provided for a running model-test preview.",
        nextCommand: "Run the generated project with pnpm run dev:web, then rerun tn model-test <asset> --screenshot --url <preview-url> --json.",
        status: "unavailable",
      };
    } else {
      const captured = await captureScreenshot({ outPath: options.screenshotOutPath ?? join(options.outDir, "artifacts", "model-test.png"), url: options.screenshotUrl });
      screenshot = { ...captured, status: "captured" };
    }
  }

  return {
    analysis,
    asset: options.assetPath,
    bounds: inspection.bounds,
    calibration: inspection.calibration,
    files,
    outDir: options.outDir,
    screenshot,
    verified,
  };
}

function renderSceneDocument(options: { assetFileName: string; inspection: Awaited<ReturnType<typeof inspectAsset>> }): string {
  const bounds = options.inspection.bounds;
  const calibration = options.inspection.calibration;
  const size = bounds?.size ?? [1, 1, 1];
  const center = bounds?.center ?? [0, 0, 0];
  const largest = Math.max(0.001, ...size.map((value) => Math.abs(value)));
  const floorSize = round(Math.max(4, largest * 2));
  const targetScale = calibration?.fitScales?.targetHeight2m ?? calibration?.fitScales?.targetLength4m ?? 1;
  const scale = round(targetScale);
  const cameraDistance = round(Math.max(calibration?.camera.recommendedDistance ?? largest * 2.5, 3));
  const cameraHeight = round(Math.max(size[1] * scale * 0.6, 1.4));
  const minY = bounds === undefined ? 0 : bounds.min[1];
  const yOffset = round(-minY);

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
          scale: [scale, scale, scale],
        },
      },
      {
        id: "model.bounds.reference",
        prefab: "prefab.bounds-marker",
        transform: {
          position: [0, round((size[1] * scale) / 2), 0],
          scale: [
            round(Math.max(size[0] * scale, 0.05)),
            round(Math.max(size[1] * scale, 0.05)),
            round(Math.max(size[2] * scale, 0.05)),
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
        primitive: "box",
        color: "#ffffff",
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

function renderModelTestReport(report: Awaited<ReturnType<typeof createModelTestProject>>): string {
  const verified = report.verified === undefined ? "Verification: not requested" : `Verification: ${report.verified.ok ? "passed" : "failed"}${report.verified.bundlePath === undefined ? "" : ` (${report.verified.bundlePath})`}`;
  const screenshot = report.screenshot === undefined
    ? "Screenshot: not requested"
    : report.screenshot.status === "captured"
      ? `Screenshot: captured (${report.screenshot.outPath})`
      : `Screenshot: unavailable (${report.screenshot.message})`;
  return `Model test project generated.\nOutput: ${report.outDir}\nAsset: ${report.asset}\nScale verdict: ${report.analysis.scaleVerdict}\nScale presets: ${report.analysis.scalePresets.map((preset) => `${preset.name}=${preset.scale}`).join(", ")}\nFiles:\n${report.files.map((file) => `  - ${file.role}: ${file.path}`).join("\n")}\n${verified}\n${screenshot}\n${report.analysis.isolationCaveat}\n`;
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

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
