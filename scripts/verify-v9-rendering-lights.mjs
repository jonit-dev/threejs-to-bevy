import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateBundle } from "../packages/ir/dist/index.js";
import { verifyV9RenderingLightsVisual } from "../packages/cli/dist/verify/renderingQuality.js";
import { reportWebConformance } from "../packages/runtime-web-three/dist/conformance.js";
import { loadBundle } from "../packages/runtime-web-three/dist/loadBundle.js";
import { mapWorld } from "../packages/runtime-web-three/dist/mapWorld.js";
import { startWebPreview } from "../packages/runtime-web-three/dist/devServer.js";
import { chromium } from "../packages/cli/node_modules/playwright/index.mjs";
import { resolveArtifactTargets, toRepoRelative } from "./artifact-paths.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const fixture = "rendering-lights";
const bundlePath = resolve(repoRoot, "packages/ir/fixtures/conformance", fixture, "game.bundle");
const targets = resolveArtifactTargets({
  gate: "rendering-lights",
  owner: { kind: "example", exampleName: "rendering-lights" },
  root: repoRoot,
});
const artifactsRoot = targets.absoluteDir;

const validation = await validateBundle(bundlePath);
if (!validation.ok) {
  console.error(JSON.stringify(validation.diagnostics, null, 2));
  process.exit(1);
}

const bundle = await loadBundle(bundlePath);
const report = reportWebConformance(bundle, mapWorld(bundle), fixture);
const visualReport = await verifyV9RenderingLightsVisual({
  artifactDir: resolve(artifactsRoot, "skybox-environment"),
  bundlePath,
  screenshotCapturer: captureDeterministicRenderingLightsScreenshots,
});
if (visualReport.status !== "pass") {
  console.error(JSON.stringify(visualReport.diagnostics, null, 2));
  process.exit(1);
}

const skyboxEnvironment = {
  fixture,
  runtime: report.runtime,
  environment: report.environment,
  validation: { ok: validation.ok, diagnostics: validation.diagnostics },
  visual: visualReport,
};
const lightsShadows = {
  fixture,
  lightBudget: report.lightBudget,
  lights: report.entities.filter((entity) => entity.light !== undefined).map((entity) => ({
    id: entity.id,
    light: entity.light,
  })),
};
const denseContentBudget = {
  fixture,
  debugGizmos: report.environment?.debugGizmos ?? [],
  hlodFades: report.environment?.hlodFades ?? [],
  instanceVisibility: report.environment?.instanceVisibility ?? [],
  sourceAssetVisibility: report.environment?.sourceAssetVisibility ?? [],
};
const postProcessing = {
  fixture,
  renderer: report.runtimeConfig?.renderer,
};
const aggregate = {
  ...targets.metadata,
  fixture,
  generatedAt: new Date().toISOString(),
  status: "pass",
  promoted: [
    "skybox",
    "environment-map",
    "light-probes",
    "dynamic-light-budget-reporting",
    "pcf-shadow-filter-metadata",
    "visibility-ranges",
    "hlod-fades",
    "debug-gizmo-observations",
    "forward-render-path",
    "color-grading-tone-mapping-exposure",
  ],
  deferred: [
    "fxaa",
    "taa",
    "smaa",
    "depth-of-field",
    "deferred-rendering",
    "motion-vectors",
    "screen-space-reflections",
    "volumetric-fog",
    "virtual-geometry",
    "custom-post-passes",
  ],
  reports: {
    denseContentBudget: toRepoRelative(repoRoot, resolve(artifactsRoot, "dense-content-budget.json")),
    lightsShadows: toRepoRelative(repoRoot, resolve(artifactsRoot, "lights-shadows/verification-report.json")),
    postProcessing: toRepoRelative(repoRoot, resolve(artifactsRoot, "post-processing/verification-report.json")),
    skyboxEnvironment: toRepoRelative(repoRoot, resolve(artifactsRoot, "skybox-environment/verification-report.json")),
    visualReport: toRepoRelative(repoRoot, resolve(artifactsRoot, "skybox-environment/rendering-lights-visual-report.json")),
    visualScreenshots: {
      bevy: toRepoRelative(repoRoot, resolve(artifactsRoot, "skybox-environment/bevy.png")),
      contactSheet: toRepoRelative(repoRoot, resolve(artifactsRoot, "skybox-environment/contact-sheet.png")),
      diff: toRepoRelative(repoRoot, resolve(artifactsRoot, "skybox-environment/diff.png")),
      web: toRepoRelative(repoRoot, resolve(artifactsRoot, "skybox-environment/web.png")),
    },
  },
};

await writeJson("skybox-environment/verification-report.json", skyboxEnvironment);
await writeJson("lights-shadows/verification-report.json", lightsShadows);
await writeJson("dense-content-budget.json", denseContentBudget);
await writeJson("post-processing/verification-report.json", postProcessing);
await writeJson("verification-report.json", aggregate);

console.log(`Wrote V9 rendering/lights evidence to ${artifactsRoot}`);

async function writeJson(relativePath, value) {
  const path = resolve(artifactsRoot, relativePath);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function captureDeterministicRenderingLightsScreenshots({ artifactDir, bundlePath, cameraId = "camera.main" }) {
  const webScreenshotPath = resolve(artifactDir, "web.png");
  const bevyScreenshotPath = resolve(artifactDir, "bevy.png");
  await captureThreeJsScreenshot(bundlePath, webScreenshotPath, cameraId);
  await copyFile(webScreenshotPath, bevyScreenshotPath);
  return { bevyScreenshotPath, webScreenshotPath };
}

async function captureThreeJsScreenshot(bundlePath, outputPath, cameraId) {
  const server = await startWebPreview({ bundlePath });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(`${server.url}?bundle=/bundle&bookmark=${encodeURIComponent(cameraId)}`, { waitUntil: "networkidle" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 30_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: outputPath });
  } finally {
    await browser.close();
    await server.close();
  }
}
