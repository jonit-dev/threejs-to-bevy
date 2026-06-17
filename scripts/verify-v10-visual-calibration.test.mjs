import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  evaluateCalibrationDiagnostics,
  parseVisualCalibrationArgs,
  verifyV10VisualCalibration,
} from "./verify-v10-visual-calibration.mjs";
import { validateCalibrationManifest } from "./visual-calibration/manifest.mjs";

test("should reject calibration factors without regions or thresholds", () => {
  const validation = validateCalibrationManifest([
    {
      id: "broken-fixture",
      factorGroup: "color",
      example: "examples/broken",
      bundleName: "broken.bundle",
      promoted: true,
      capture: { width: 1280, height: 720 },
      camera: { id: "camera.calibration" },
      requiredArtifacts: ["web.png", "bevy.png"],
      regions: [],
      thresholds: {},
      failureHints: {},
    },
  ]);

  assert.equal(validation.ok, false);
  assert.ok(
    validation.diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_VISUAL_CALIBRATION_MANIFEST_INVALID"),
  );
  assert.ok(validation.diagnostics.some((diagnostic) => diagnostic.message.includes("sample region")));
  assert.ok(validation.diagnostics.some((diagnostic) => diagnostic.message.includes("numeric thresholds")));
});

test("should fail when required screenshots are missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v10-visual-calibration-missing-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyV10VisualCalibration({
      artifactDir,
      repoRoot: root,
      args: { groups: ["color"], includePlanned: false, json: false, list: false, manifestOnly: false },
      fixtures: [
        {
          id: "v10-color",
          factorGroup: "color",
          example: "examples/v10-visual-calibration-color",
          bundleName: "v10-visual-calibration-color.bundle",
          promoted: true,
          implemented: true,
          capture: { width: 1280, height: 720 },
          camera: { id: "camera.calibration" },
          requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
          regions: [{ id: "swatch-white", factor: "color", region: { x: 0.05, y: 0.05, width: 0.08, height: 0.1 } }],
          thresholds: { changedPixelRatio: 0.02 },
          failureHints: { color: "check color management" },
        },
      ],
      skipBuildCli: true,
      captureArtifacts: false,
      run: async ({ name }) => ({ durationMs: 1, exitCode: 0, name, stderr: "", stdout: "" }),
    });

    assert.equal(report.ok, false);
    assert.equal(report.status, "fail");
    const missing = report.diagnostics.filter((diagnostic) => diagnostic.code === "TN_VERIFY_VISUAL_CALIBRATION_ARTIFACT_MISSING");
    assert.ok(missing.length >= 2);
    assert.ok(missing.some((diagnostic) => diagnostic.runtime === "web" && diagnostic.fixtureId === "v10-color"));
    assert.ok(missing.some((diagnostic) => diagnostic.runtime === "bevy" && diagnostic.fixtureId === "v10-color"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should separate promoted and report-only calibration factors", () => {
  const fixtures = [
    {
      id: "v10-post",
      factorGroup: "post",
      example: "examples/v10-visual-calibration-post",
      bundleName: "v10-visual-calibration-post.bundle",
      promoted: true,
      capture: { width: 1280, height: 720 },
      camera: { id: "camera.calibration" },
      requiredArtifacts: ["web.png", "bevy.png"],
      regions: [
        { id: "bloom-highlight", factor: "post", region: { x: 0.4, y: 0.4, width: 0.1, height: 0.1 } },
        { id: "dof-report-only", factor: "post-advanced", region: { x: 0.7, y: 0.7, width: 0.1, height: 0.1 } },
      ],
      thresholds: { changedPixelRatio: 0.08 },
      failureHints: {},
    },
  ];

  const evaluation = evaluateCalibrationDiagnostics(
    [
      {
        code: "TN_VERIFY_VISUAL_CALIBRATION_REGION_DRIFT",
        fixtureId: "v10-post",
        regionFactor: "post-advanced",
        regionId: "dof-report-only",
        severity: "warning",
      },
      {
        code: "TN_VERIFY_VISUAL_CALIBRATION_REGION_DRIFT",
        fixtureId: "v10-post",
        regionFactor: "post",
        regionId: "bloom-highlight",
        severity: "error",
      },
    ],
    fixtures,
  );

  assert.equal(evaluation.ok, false);
  assert.equal(evaluation.reportOnlyDrift.length, 1);
  assert.equal(evaluation.reportOnlyDrift[0].regionFactor, "post-advanced");
});

test("verify v10 visual calibration writes manifest report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v10-visual-calibration-manifest-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyV10VisualCalibration({
      artifactDir,
      repoRoot: root,
      args: { groups: [], json: false, list: false, manifestOnly: true },
    });
    const manifestReport = JSON.parse(await readFile(join(artifactDir, "manifest-report.json"), "utf8"));

    assert.equal(report.ok, true);
    assert.equal(report.status, "pass");
    assert.equal(manifestReport.ok, true);
    assert.ok(manifestReport.fixtureCount >= 8);
    assert.ok(Array.isArray(report.promoted));
    assert.ok(Array.isArray(report.reportOnly));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("parseVisualCalibrationArgs reads --group and --list", () => {
  assert.deepEqual(parseVisualCalibrationArgs(["--group", "color,materials", "--json"]), {
    analyzeOnly: false,
    groups: ["color", "materials"],
    includePlanned: false,
    json: true,
    list: false,
    manifestOnly: false,
  });
  assert.deepEqual(parseVisualCalibrationArgs(["--group=lighting", "--list"]), {
    analyzeOnly: false,
    groups: ["lighting"],
    includePlanned: false,
    json: false,
    list: true,
    manifestOnly: false,
  });
});

test("should fail color calibration when unlit swatch delta exceeds threshold", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v10-visual-calibration-color-drift-"));
  const artifactDir = join(root, "artifacts", "color", "v10-color");
  try {
    const fixture = {
      id: "v10-color",
      factorGroup: "color",
      example: "examples/v10-visual-calibration-color",
      bundleName: "v10-visual-calibration-color.bundle",
      promoted: true,
      implemented: true,
      capture: { width: 1280, height: 720 },
      camera: { id: "camera.calibration" },
      requiredArtifacts: ["web.png", "bevy.png", "diff.png", "contact-sheet.png"],
      regions: [{ id: "swatch-white", factor: "color", region: { x: 0.05, y: 0.05, width: 0.08, height: 0.1 } }],
      thresholds: { changedPixelRatio: 0.001, maxChannelDelta: 0.001 },
      failureHints: { color: "check color management" },
    };
    const report = await verifyV10VisualCalibration({
      artifactDir: join(root, "artifacts"),
      repoRoot: root,
      args: { groups: ["color"], includePlanned: false, json: false, list: false, manifestOnly: false },
      fixtures: [fixture],
      skipBuildCli: true,
      captureArtifacts: false,
      run: async ({ name }) => ({ durationMs: 1, exitCode: 0, name, stderr: "", stdout: "" }),
      accessFile: async (path) => {
        if (path.endsWith("web.png") || path.endsWith("bevy.png") || path.endsWith("diff.png") || path.endsWith("contact-sheet.png")) {
          return;
        }
        throw new Error(`missing ${path}`);
      },
      fixtureAnalyzer: async () => ({
        diagnostics: [
          {
            code: "TN_VERIFY_VISUAL_CALIBRATION_REGION_DRIFT",
            fixtureId: "v10-color",
            message: "Region 'swatch-white' (color) exceeded maxChannelDelta: observed 0.1200 > threshold 0.001.",
            metric: "maxChannelDelta",
            observed: 0.12,
            regionFactor: "color",
            regionId: "swatch-white",
            severity: "error",
            threshold: 0.001,
          },
        ],
        metrics: { regions: [] },
        status: "fail",
      }),
      screenshotCapturer: async ({ artifactDir: outputDir }) => {
        await writeFile(join(outputDir, "web.png"), "web");
        await writeFile(join(outputDir, "bevy.png"), "bevy");
        await writeFile(join(outputDir, "diff.png"), "diff");
        await writeFile(join(outputDir, "contact-sheet.png"), "sheet");
      },
    });

    assert.equal(report.ok, false);
    const drift = report.diagnostics.find((diagnostic) => diagnostic.code === "TN_VERIFY_VISUAL_CALIBRATION_REGION_DRIFT");
    assert.ok(drift);
    assert.equal(drift.regionId, "swatch-white");
    assert.equal(drift.metric, "maxChannelDelta");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
