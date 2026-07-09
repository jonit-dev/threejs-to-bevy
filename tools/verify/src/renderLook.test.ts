import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { analyzeRenderLookMetrics, runRenderLookGate, type RenderLookMetricInput } from "./renderLook.js";

const passingMetrics: RenderLookMetricInput = {
  parity: { averageLuminance: 0.44, bevyNonblankArea: 0.81, bevyScreenshotPath: "tools/verify/artifacts/render-look/screenshots/parity-bevy.png", brightPixelContribution: 0.02, contrast: 0.2, edgeClarity: 0.48, nonblankArea: 0.82, profile: "parity", saturation: 0.28 },
  balanced: { averageLuminance: 0.62, bevyNonblankArea: 0.84, bevyScreenshotPath: "tools/verify/artifacts/render-look/screenshots/balanced-bevy.png", brightPixelContribution: 0.08, contrast: 0.34, edgeClarity: 0.54, nonblankArea: 0.86, profile: "balanced", saturation: 0.48 },
  cinematic: { averageLuminance: 0.64, bevyNonblankArea: 0.85, bevyScreenshotPath: "tools/verify/artifacts/render-look/screenshots/cinematic-bevy.png", brightPixelContribution: 0.1, contrast: 0.32, edgeClarity: 0.53, nonblankArea: 0.87, profile: "cinematic", saturation: 0.46 },
};

test("should fail when parity fixture uses balanced profile", () => {
  const diagnostics = analyzeRenderLookMetrics({
    ...passingMetrics,
    parity: { ...passingMetrics.parity, profile: "balanced" },
  });

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_VISUAL_PARITY_PROFILE_MISMATCH"), true);
});

test("should fail when balanced screenshot is visually flat", () => {
  const diagnostics = analyzeRenderLookMetrics({
    ...passingMetrics,
    parity: passingMetrics.parity,
    balanced: { ...passingMetrics.balanced, averageLuminance: 0.5, saturation: 0.31 },
  });

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_RENDER_LOOK_VISUALLY_FLAT"), true);
});

test("should fail when cinematic default look is visually flat", () => {
  const diagnostics = analyzeRenderLookMetrics({
    ...passingMetrics,
    cinematic: { ...passingMetrics.cinematic, averageLuminance: 0.5, saturation: 0.31 },
  });

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_DEFAULT_LOOK_VISUALLY_FLAT"), true);
});

test("should accept intentionally desaturated cinematic tone", () => {
  const diagnostics = analyzeRenderLookMetrics({
    ...passingMetrics,
    cinematic: { ...passingMetrics.cinematic, saturation: 0.19 },
  });

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_DEFAULT_LOOK_VISUALLY_FLAT"), false);
});

test("should fail when captured Bevy render look screenshot is blank", () => {
  const diagnostics = analyzeRenderLookMetrics({
    ...passingMetrics,
    parity: passingMetrics.parity,
    balanced: { ...passingMetrics.balanced, bevyNonblankArea: 0.01 },
  });

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_RENDER_LOOK_BEVY_SCREENSHOT_BLANK"), true);
});

test("should pass screenshot-derived metrics without evidence warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-render-look-screenshot-metrics-"));
  try {
    const metricsPath = join(root, "metrics.json");
    await writeFile(metricsPath, `${JSON.stringify(passingMetrics, null, 2)}\n`);

    const result = await runRenderLookGate({ metricsPath, root });
    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as {
      artifacts: { balancedBevyScreenshot: string; cinematicBevyScreenshot: string; contactSheet: string; parityBevyScreenshot: string };
      evidenceMode: string;
      ok: boolean;
      thresholds: { averageLuminanceDelta: number; cinematicAverageLuminanceDelta: number; cinematicSaturationDelta: number; saturationDelta: number };
    };
    const contactSheet = await readFile(result.contactSheetPath, "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.evidenceMode, "screenshot-metrics");
    assert.deepEqual(result.diagnostics, []);
    assert.equal(report.ok, true);
    assert.equal(report.artifacts.contactSheet, "tools/verify/artifacts/render-look/contact-sheet.svg");
    assert.equal(report.artifacts.parityBevyScreenshot, "tools/verify/artifacts/render-look/screenshots/parity-bevy.png");
    assert.equal(report.artifacts.balancedBevyScreenshot, "tools/verify/artifacts/render-look/screenshots/balanced-bevy.png");
    assert.equal(report.artifacts.cinematicBevyScreenshot, "tools/verify/artifacts/render-look/screenshots/cinematic-bevy.png");
    assert.equal(report.evidenceMode, "screenshot-metrics");
    assert.equal(report.thresholds.averageLuminanceDelta, 0.15);
    assert.equal(report.thresholds.cinematicAverageLuminanceDelta, 0.12);
    assert.equal(report.thresholds.cinematicSaturationDelta, 0.08);
    assert.equal(report.thresholds.saturationDelta, 0.08);
    assert.match(contactSheet, /Render Look Contact Sheet/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
