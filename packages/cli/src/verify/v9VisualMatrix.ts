import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readPngFrame } from "./compareImages.js";
import {
  analyzeNonblank,
  analyzeRegionNonblank,
  compareFrames,
  cropFrame,
  defaultNonblankThreshold,
  type INormalizedRegion,
  type IPixelFrame,
} from "./imageAnalysis.js";
import { captureRenderingQualityScreenshots } from "./renderingQuality.js";
import { verifySkeletalAnimationVisual } from "./skeletalAnimationVisual.js";

export interface IV9VisualMatrixScene {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
  id: string;
  mode: "motion-smoke" | "region-parity" | "smoke-only";
  regions?: INormalizedRegion[];
}

export interface IV9VisualMatrixSceneReport {
  artifacts: {
    bevyScreenshotPath?: string;
    contactSheetPath: string;
    diffPath?: string;
    reportPath: string;
    webScreenshotPath?: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  id: string;
  mode: IV9VisualMatrixScene["mode"];
  status: "fail" | "pass";
}

export interface IV9VisualMatrixReport {
  diagnostics: IV9VisualMatrixSceneReport["diagnostics"];
  scenes: IV9VisualMatrixSceneReport[];
  status: "fail" | "pass";
}

export type V9VisualScreenshotCapturer = (options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}) => Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }>;

export function analyzeV9VisualBlankness(
  web: IPixelFrame,
  bevy: IPixelFrame,
  paths: { bevyPath: string; webPath: string },
): IV9VisualMatrixSceneReport["diagnostics"] {
  const diagnostics: IV9VisualMatrixSceneReport["diagnostics"] = [];
  if (!analyzeNonblank(web).ok) {
    diagnostics.push({
      code: "TN_V9_VISUAL_BLANK",
      message: `Web screenshot is blank or near-blank: ${paths.webPath}`,
      severity: "error",
    });
  }
  if (!analyzeNonblank(bevy).ok) {
    diagnostics.push({
      code: "TN_V9_VISUAL_BLANK",
      message: `Bevy screenshot is blank or near-blank: ${paths.bevyPath}`,
      severity: "error",
    });
  }
  return diagnostics;
}

export function analyzeV9VisualRegions(
  web: IPixelFrame,
  bevy: IPixelFrame,
  regions: INormalizedRegion[],
): IV9VisualMatrixSceneReport["diagnostics"] {
  const diagnostics: IV9VisualMatrixSceneReport["diagnostics"] = [];
  for (const [index, region] of regions.entries()) {
    const absolute = {
      height: Math.max(1, Math.floor(web.height * region.height)),
      width: Math.max(1, Math.floor(web.width * region.width)),
      x: Math.floor(web.width * region.x),
      y: Math.floor(web.height * region.y),
    };
    const webRegion = analyzeRegionNonblank(web, absolute, defaultNonblankThreshold);
    const bevyRegion = analyzeRegionNonblank(bevy, absolute, defaultNonblankThreshold);
    if (!webRegion.ok || !bevyRegion.ok) {
      diagnostics.push({
        code: "TN_V9_VISUAL_REGION_MISSING",
        message: `Required visual region ${index} is blank in one or both screenshots.`,
        severity: "error",
      });
    }
  }
  return diagnostics;
}

export async function verifyV9VisualMatrixScene(
  scene: IV9VisualMatrixScene,
  options: {
    screenshotCapturer?: V9VisualScreenshotCapturer;
    skeletalVerifier?: typeof verifySkeletalAnimationVisual;
  } = {},
): Promise<IV9VisualMatrixSceneReport> {
  await mkdir(scene.artifactDir, { recursive: true });
  const reportPath = resolve(scene.artifactDir, "scene-report.json");
  if (scene.mode === "motion-smoke") {
    const verifier = options.skeletalVerifier ?? verifySkeletalAnimationVisual;
    const report = await verifier({
      artifactDir: scene.artifactDir,
      bundlePath: scene.bundlePath,
    });
    return {
      artifacts: {
        contactSheetPath: report.artifacts.contactSheetPath,
        reportPath,
      },
      diagnostics: report.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        code: diagnostic.code.includes("BLANK") || diagnostic.code.includes("FROZEN") ? "TN_V9_VISUAL_BLANK" : diagnostic.code,
      })),
      id: scene.id,
      mode: scene.mode,
      status: report.status,
    };
  }

  const capture = await (options.screenshotCapturer ?? captureRenderingQualityScreenshots)({
    artifactDir: scene.artifactDir,
    bundlePath: scene.bundlePath,
    cameraId: scene.cameraId,
  });
  const web = await readPngFrame(capture.webScreenshotPath);
  const bevy = await readPngFrame(capture.bevyScreenshotPath);
  const diagnostics = [
    ...analyzeV9VisualBlankness(web, bevy, {
      bevyPath: capture.bevyScreenshotPath,
      webPath: capture.webScreenshotPath,
    }),
  ];
  if (scene.mode === "region-parity" && scene.regions !== undefined) {
    diagnostics.push(...analyzeV9VisualRegions(web, bevy, scene.regions));
  }

  const contactSheetPath = resolve(scene.artifactDir, "contact-sheet.png");
  const diffPath = resolve(scene.artifactDir, "diff.png");
  await writeContactSheet(contactSheetPath, capture.webScreenshotPath, capture.bevyScreenshotPath);
  await writeDiff(diffPath, web, bevy);
  const sceneReport: IV9VisualMatrixSceneReport = {
    artifacts: {
      bevyScreenshotPath: capture.bevyScreenshotPath,
      contactSheetPath,
      diffPath,
      reportPath,
      webScreenshotPath: capture.webScreenshotPath,
    },
    diagnostics,
    id: scene.id,
    mode: scene.mode,
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
  await writeFile(reportPath, `${JSON.stringify(sceneReport, null, 2)}\n`);
  return sceneReport;
}

export async function verifyV9VisualMatrix(
  scenes: IV9VisualMatrixScene[],
  options: {
    screenshotCapturer?: V9VisualScreenshotCapturer;
    skeletalVerifier?: typeof verifySkeletalAnimationVisual;
  } = {},
): Promise<IV9VisualMatrixReport> {
  const sceneReports = [];
  const diagnostics: IV9VisualMatrixReport["diagnostics"] = [];
  for (const scene of scenes) {
    const report = await verifyV9VisualMatrixScene(scene, options);
    sceneReports.push(report);
    diagnostics.push(...report.diagnostics);
  }
  return {
    diagnostics,
    scenes: sceneReports,
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
}

async function writeContactSheet(path: string, webPath: string, bevyPath: string): Promise<void> {
  const { readFile } = await import("node:fs/promises");
  const { PNG } = await import("pngjs");
  const web = PNG.sync.read(await readFile(webPath));
  const bevy = PNG.sync.read(await readFile(bevyPath));
  const sheet = new PNG({ height: Math.max(web.height, bevy.height), width: web.width + bevy.width });
  for (let index = 0; index < sheet.data.length; index += 4) {
    sheet.data[index] = 0;
    sheet.data[index + 1] = 0;
    sheet.data[index + 2] = 0;
    sheet.data[index + 3] = 255;
  }
  copyInto(web, sheet, 0, 0);
  copyInto(bevy, sheet, web.width, 0);
  await writeFile(path, PNG.sync.write(sheet));
}

async function writeDiff(path: string, web: IPixelFrame, bevy: IPixelFrame): Promise<void> {
  const { PNG } = await import("pngjs");
  const width = Math.min(web.width, bevy.width);
  const height = Math.min(web.height, bevy.height);
  const diff = new PNG({ height, width });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * web.width + x) * 4;
      const to = (y * width + x) * 4;
      diff.data[to] = Math.abs((web.data[from] ?? 0) - (bevy.data[from] ?? 0));
      diff.data[to + 1] = Math.abs((web.data[from + 1] ?? 0) - (bevy.data[from + 1] ?? 0));
      diff.data[to + 2] = Math.abs((web.data[from + 2] ?? 0) - (bevy.data[from + 2] ?? 0));
      diff.data[to + 3] = 255;
    }
  }
  await writeFile(path, PNG.sync.write(diff));
}

function copyInto(source: { data: Buffer; height: number; width: number }, target: { data: Buffer; height: number; width: number }, dx: number, dy: number): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const from = (y * source.width + x) * 4;
      const to = ((y + dy) * target.width + x + dx) * 4;
      target.data[to] = source.data[from] ?? 0;
      target.data[to + 1] = source.data[from + 1] ?? 0;
      target.data[to + 2] = source.data[from + 2] ?? 0;
      target.data[to + 3] = source.data[from + 3] ?? 255;
    }
  }
}

export function absoluteRegion(frame: IPixelFrame, region: INormalizedRegion): { height: number; width: number; x: number; y: number } {
  return {
    height: Math.max(1, Math.floor(frame.height * region.height)),
    width: Math.max(1, Math.floor(frame.width * region.width)),
    x: Math.floor(frame.width * region.x),
    y: Math.floor(frame.height * region.y),
  };
}

export { cropFrame };
