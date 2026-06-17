import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateBundle } from "../packages/ir/dist/index.js";
import { verifyV9RenderingLightsVisual } from "../packages/cli/dist/verify/renderingQuality.js";
import { reportWebConformance } from "../packages/runtime-web-three/dist/conformance.js";
import { loadBundle } from "../packages/runtime-web-three/dist/loadBundle.js";
import { mapWorld } from "../packages/runtime-web-three/dist/mapWorld.js";

const repoRoot = resolve(import.meta.dirname, "..");
const fixture = "v9-skybox-environment";
const bundlePath = resolve(repoRoot, "packages/ir/fixtures/conformance", fixture, "game.bundle");
const artifactsRoot = resolve(repoRoot, "artifacts/v9/rendering-lights");

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
    denseContentBudget: "artifacts/v9/rendering-lights/dense-content-budget.json",
    lightsShadows: "artifacts/v9/rendering-lights/lights-shadows/verification-report.json",
    postProcessing: "artifacts/v9/rendering-lights/post-processing/verification-report.json",
    skyboxEnvironment: "artifacts/v9/rendering-lights/skybox-environment/verification-report.json",
    visualReport: "artifacts/v9/rendering-lights/skybox-environment/v9-rendering-lights-visual-report.json",
    visualScreenshots: {
      bevy: "artifacts/v9/rendering-lights/skybox-environment/bevy.png",
      contactSheet: "artifacts/v9/rendering-lights/skybox-environment/contact-sheet.png",
      diff: "artifacts/v9/rendering-lights/skybox-environment/diff.png",
      web: "artifacts/v9/rendering-lights/skybox-environment/web.png",
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
