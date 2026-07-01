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
import {
  validateCalibrationManifest,
  VISUAL_CALIBRATION_FIXTURES,
} from "./visual-calibration/manifest.mjs";

const expectedImplementedFixtures = [
  ["v10-color", "color", ["swatch-white", "swatch-black", "swatch-mid-gray", "background-opaque", "background-alpha", "frame-edge-top", "frame-edge-left"]],
  ["v10-materials", "materials", ["unlit-card", "pbr-base", "metal-rough", "emissive", "alpha-mask", "texture-slot", "uv-transform", "vertex-color"]],
  ["v10-lighting", "lighting", ["ambient-card", "directional-card", "point-card", "spot-card", "shadow-receiver", "probe-reflection"]],
  ["v10-atmosphere", "atmosphere", ["fog-near", "fog-mid", "fog-far", "sky-horizon", "skybox-anchor"]],
  ["v10-post", "post", ["bloom-highlight", "msaa-edge", "dof-report-only", "taa-report-only"]],
  ["v10-geometry", "geometry", ["primitive-grid", "generated-mesh", "gltf-instance", "uv-marker"]],
  ["v10-dense", "dense", ["instance-grid", "hlod-fade", "visibility-range"]],
  ["v10-scene", "scene", ["sky-band", "hero-subject", "ground-shadow", "ui-overlay", "full-frame"]],
];

const expectedThresholdBaselines = {
  "v10-atmosphere": { averageBrightnessDelta: 0.4, changedPixelRatio: 1, luminanceDelta: 0.4 },
  "v10-color": { averageBrightnessDelta: 0.03, changedPixelRatio: 0.03, maxChannelDelta: 0.05 },
  "v10-dense": { averageBrightnessDelta: 0.03, changedPixelRatio: 0.3, maxChannelDelta: 0.5 },
  "v10-geometry": { averageBrightnessDelta: 0.28, changedPixelRatio: 0.92, maxChannelDelta: 1, p95ChannelDelta: 0.4 },
  "v10-lighting": { averageBrightnessDelta: 0.12, changedPixelRatio: 0.92, maxChannelDelta: 0.18 },
  "v10-materials": { averageBrightnessDelta: 0.32, changedPixelRatio: 0.16, maxChannelDelta: 0.55 },
  "v10-post": { averageBrightnessDelta: 0.03, changedPixelRatio: 0.02, maxChannelDelta: 0.7 },
  "v10-scene": { averageBrightnessDelta: 0.08, changedPixelRatio: 1, maxChannelDelta: 0.75 },
};

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

test("v10 calibration manifest keeps every PRD fixture implemented with screenshot artifacts", () => {
  const validation = validateCalibrationManifest(VISUAL_CALIBRATION_FIXTURES);

  assert.equal(validation.ok, true);
  assert.deepEqual(
    VISUAL_CALIBRATION_FIXTURES.map((fixture) => [
      fixture.id,
      fixture.factorGroup,
      fixture.regions.map((region) => region.id),
    ]),
    expectedImplementedFixtures,
  );
  for (const fixture of VISUAL_CALIBRATION_FIXTURES) {
    assert.equal(fixture.implemented, true, `${fixture.id} should be implemented, not planned`);
    assert.equal(fixture.promoted, true, `${fixture.id} should be part of the promoted gate`);
    assert.deepEqual(fixture.requiredArtifacts, ["web.png", "bevy.png", "diff.png", "contact-sheet.png"]);
    assert.equal(fixture.camera.id, "camera.calibration");
    assert.equal(fixture.camera.projection, "orthographic");
  }
});

test("v10 calibration threshold baselines are explicit", () => {
  for (const fixture of VISUAL_CALIBRATION_FIXTURES) {
    assert.deepEqual(
      Object.fromEntries(
        Object.keys(expectedThresholdBaselines[fixture.id]).map((key) => [key, fixture.thresholds[key]]),
      ),
      expectedThresholdBaselines[fixture.id],
      `${fixture.id} threshold baseline changed`,
    );
  }
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
          example: "fixtures/sample-color",
          bundleName: "sample-color.bundle",
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
      example: "fixtures/sample-post",
      bundleName: "sample-post.bundle",
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

test("should require focused reports from canonical fixture artifact paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v10-visual-calibration-canonical-"));
  try {
    const report = await verifyV10VisualCalibration({
      repoRoot: root,
      args: { groups: ["color"], includePlanned: false, json: false, list: false, manifestOnly: false },
      fixtures: [
        {
          id: "v10-color",
          factorGroup: "color",
          example: "fixtures/sample-color",
          bundleName: "sample-color.bundle",
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

    const missing = report.diagnostics.filter((diagnostic) => diagnostic.code === "TN_VERIFY_VISUAL_CALIBRATION_ARTIFACT_MISSING");
    assert.ok(missing.length > 0);
    assert.ok(
      missing.every((diagnostic) =>
        diagnostic.artifactPath.includes("examples/sample-color/artifacts/visual-calibration/"),
      ),
    );
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
      example: "fixtures/sample-color",
      bundleName: "sample-color.bundle",
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
    assert.match(drift.artifactPath, /contact-sheet\.png$/);
    assert.match(drift.artifactPaths.web, /web\.png$/);
    assert.match(drift.artifactPaths.bevy, /bevy\.png$/);
    assert.match(drift.artifactPaths.diff, /diff\.png$/);
    assert.match(drift.artifactPaths.contactSheet, /contact-sheet\.png$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
