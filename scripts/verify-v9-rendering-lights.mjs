import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateBundle } from "../packages/ir/dist/index.js";
import { verifyV9RenderingLightsVisual } from "../packages/cli/dist/verify/renderingQuality.js";
import { reportWebConformance } from "../packages/runtime-web-three/dist/conformance.js";
import { loadBundle } from "../packages/runtime-web-three/dist/loadBundle.js";
import { mapWorld } from "../packages/runtime-web-three/dist/mapWorld.js";
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
