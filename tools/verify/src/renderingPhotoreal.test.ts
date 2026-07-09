import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { analyzeCaptureTransformTraces, aoSweepDarkeningIsMonotonic, comparePhotorealRegion, motionTrailAsymmetryIsVisible, runPhotorealRenderingGate, type PhotorealRenderingMetrics } from "./renderingPhotoreal.js";

function motionTrace(runtime: "bevy" | "web", overrides: { runtimeFrame?: number; zeroVelocity?: boolean } = {}): unknown {
  const samples = [118, 119, 120].map((frame) => {
    const previousX = Math.sin(((frame - 1) / 60) * Math.PI) * 1.35;
    const x = Math.sin((frame / 60) * Math.PI) * 1.35;
    const delta = overrides.zeroVelocity && frame === 120 ? 0 : x - previousX;
    return {
      elapsedSeconds: frame / 60,
      frame,
      previousWorldPosition: [x - delta, 1.22, -1.92],
      sourcePosition: [x, 1.22, -1.92],
      worldDelta: [delta, 0, 0],
      worldDeltaMagnitude: Math.abs(delta),
      worldPosition: [x, 1.22, -1.92],
    };
  });
  if (overrides.zeroVelocity) {
    samples[2]!.previousWorldPosition = [...samples[2]!.worldPosition];
  }
  return {
    captureRequest: { assetsReady: true, issuedHostFrame: 120, requestedFrame: 120, runtimeFrame: overrides.runtimeFrame ?? 120 },
    entityId: "motion.marker",
    fixedDeltaSeconds: 1 / 60,
    historySource: "capture-harness-prior-rendered-sample",
    runtime,
    samples,
    schema: "threenative.capture-transform-trace",
    version: "0.1.0",
  };
}

const motionTraceOptions = { entityId: "motion.marker", fixtureId: "photoreal-motion-blur-moving-test", path: "trace.json", requestedFrame: 120 };

test("should accept aligned web and Bevy capture transform traces", () => {
  assert.deepEqual(analyzeCaptureTransformTraces(motionTrace("web"), motionTrace("bevy"), motionTraceOptions), []);
});

test("should reject zero capture velocity and a shifted native phase", () => {
  const zeroDiagnostics = analyzeCaptureTransformTraces(motionTrace("web", { zeroVelocity: true }), motionTrace("bevy", { zeroVelocity: true }), motionTraceOptions);
  assert.equal(zeroDiagnostics.some((diagnostic) => diagnostic.code === "TN_RENDERING_PHOTOREAL_MOTION_CAPTURE_VELOCITY_ZERO"), true);

  const phaseDiagnostics = analyzeCaptureTransformTraces(motionTrace("web"), motionTrace("bevy", { runtimeFrame: 121 }), motionTraceOptions);
  assert.equal(phaseDiagnostics.some((diagnostic) => diagnostic.code === "TN_RENDERING_PHOTOREAL_MOTION_CAPTURE_PHASE_MISMATCH"), true);
});

test("should reject matching regions when the requested effect has no local variation", () => {
  const frame = {
    data: Uint8Array.from([
      20, 20, 20, 255,
      20, 20, 20, 255,
      20, 20, 20, 255,
      20, 20, 20, 255,
    ]),
    height: 2,
    width: 2,
  };
  const metric = comparePhotorealRegion("effect", frame, frame, {
    id: "effect-region",
    region: { height: 1, width: 1, x: 0, y: 0 },
    threshold: { maxAverageChannelDelta: 0.01, minRuntimeLuminanceStdDev: 0.01 },
  });

  assert.equal(metric.parityOk, true);
  assert.equal(metric.effectOk, false);
  assert.equal(metric.ok, false);
  assert.equal(metric.webAverageLuminance, 0.078431);
  assert.equal(metric.bevyAverageLuminance, 0.078431);
});

test("should reject a locally varied effect region that remains too dark", () => {
  const frame = {
    data: Uint8Array.from([
      0, 0, 0, 255,
      2, 2, 2, 255,
      0, 0, 0, 255,
      2, 2, 2, 255,
    ]),
    height: 2,
    width: 2,
  };
  const metric = comparePhotorealRegion("effect", frame, frame, {
    id: "effect-region",
    region: { height: 1, width: 1, x: 0, y: 0 },
    threshold: { maxAverageChannelDelta: 0.01, minRuntimeAverageLuminance: 0.01, minRuntimeLuminanceStdDev: 0.001 },
  });

  assert.equal(metric.parityOk, true);
  assert.equal(metric.effectOk, false);
  assert.equal(metric.ok, false);
});

test("should require stronger AO sweep samples to darken the contact corner", () => {
  assert.equal(aoSweepDarkeningIsMonotonic(0.4, 0.38), true);
  assert.equal(aoSweepDarkeningIsMonotonic(0.4, 0.4009), true);
  assert.equal(aoSweepDarkeningIsMonotonic(0.4, 0.402), false);
});

test("should require a visible exterior motion trail", () => {
  assert.equal(motionTrailAsymmetryIsVisible(0.1387, 0.1091), true);
  assert.equal(motionTrailAsymmetryIsVisible(0.1568, 0.1139), true);
  assert.equal(motionTrailAsymmetryIsVisible(0.1058, 0.107), false);
  assert.equal(motionTrailAsymmetryIsVisible(0.1722, 0.1722), false);
});

const passingMetrics: PhotorealRenderingMetrics = {
  fixtures: [
    {
      bevy: {
        averageLuminance: 0.35,
        luminanceStdDev: 0.12,
        nonblankArea: 0.75,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-lighting-units-probe.bevy.png",
      },
      fixtureId: "photoreal-lighting-units-probe",
      web: {
        averageLuminance: 0.36,
        luminanceStdDev: 0.13,
        nonblankArea: 0.76,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-lighting-units-probe.web.png",
      },
    },
    {
      bevy: {
        averageLuminance: 0.43,
        luminanceStdDev: 0.17,
        nonblankArea: 0.84,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-ao-sweep-low.bevy.png",
      },
      fixtureId: "photoreal-ao-sweep-low",
      web: {
        averageLuminance: 0.45,
        luminanceStdDev: 0.16,
        nonblankArea: 0.85,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-ao-sweep-low.web.png",
      },
    },
    {
      bevy: {
        averageLuminance: 0.39,
        luminanceStdDev: 0.2,
        nonblankArea: 0.83,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-ao-sweep-high.bevy.png",
      },
      fixtureId: "photoreal-ao-sweep-high",
      web: {
        averageLuminance: 0.4,
        luminanceStdDev: 0.19,
        nonblankArea: 0.84,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-ao-sweep-high.web.png",
      },
    },
    {
      bevy: {
        averageLuminance: 0.42,
        luminanceStdDev: 0.18,
        nonblankArea: 0.84,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-ao-corner-test.bevy.png",
      },
      fixtureId: "photoreal-ao-corner-test",
      web: {
        averageLuminance: 0.46,
        luminanceStdDev: 0.16,
        nonblankArea: 0.86,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-ao-corner-test.web.png",
      },
    },
    {
      bevy: {
        averageLuminance: 0.38,
        luminanceStdDev: 0.2,
        nonblankArea: 0.78,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-bloom-emissive-test.bevy.png",
      },
      fixtureId: "photoreal-bloom-emissive-test",
      web: {
        averageLuminance: 0.41,
        luminanceStdDev: 0.19,
        nonblankArea: 0.81,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-bloom-emissive-test.web.png",
      },
    },
    {
      bevy: {
        averageLuminance: 0.4,
        luminanceStdDev: 0.17,
        nonblankArea: 0.8,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-dof-depth-test.bevy.png",
      },
      fixtureId: "photoreal-dof-depth-test",
      web: {
        averageLuminance: 0.39,
        luminanceStdDev: 0.18,
        nonblankArea: 0.82,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-dof-depth-test.web.png",
      },
    },
    {
      bevy: {
        averageLuminance: 0.36,
        luminanceStdDev: 0.16,
        nonblankArea: 0.79,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-motion-blur-moving-test.bevy.png",
      },
      fixtureId: "photoreal-motion-blur-moving-test",
      web: {
        averageLuminance: 0.35,
        luminanceStdDev: 0.17,
        nonblankArea: 0.8,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-motion-blur-moving-test.web.png",
      },
    },
    {
      bevy: {
        averageLuminance: 0.34,
        luminanceStdDev: 0.14,
        nonblankArea: 0.78,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-reflective-wet-floor.bevy.png",
      },
      fixtureId: "photoreal-reflective-wet-floor",
      web: {
        averageLuminance: 0.33,
        luminanceStdDev: 0.15,
        nonblankArea: 0.79,
        screenshotPath: "tools/verify/artifacts/rendering-photoreal/screenshots/photoreal-reflective-wet-floor.web.png",
      },
    },
  ],
};

test("should pass photoreal screenshot metrics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rendering-photoreal-"));
  try {
    const metricsPath = join(root, "metrics.json");
    await writeFile(metricsPath, `${JSON.stringify(passingMetrics, null, 2)}\n`, "utf8");

    const result = await runPhotorealRenderingGate({ metricsPath, root });
    const report = JSON.parse(await readFile(join(root, result.artifacts.reportPath), "utf8")) as {
      evidenceMode: string;
      fixtures: Array<{ id: string }>;
      ok: boolean;
      schema: string;
      thresholds: { regionAverageChannelDeltaMaximums: Array<{ fixtureId: string; id: string }> };
    };
    const contactSheet = await readFile(join(root, result.artifacts.contactSheetPath), "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.evidenceMode, "screenshot-metrics");
    assert.deepEqual(result.diagnostics, []);
    assert.equal(report.ok, true);
    assert.equal(report.schema, "threenative.verify.rendering-photoreal");
    assert.deepEqual(report.fixtures.map((fixture) => fixture.id), ["photoreal-lighting-units-probe", "photoreal-ao-corner-test", "photoreal-ao-sweep-low", "photoreal-ao-sweep-high", "photoreal-bloom-emissive-test", "photoreal-dof-depth-test", "photoreal-motion-blur-moving-test", "photoreal-reflective-wet-floor"]);
    assert.equal(report.evidenceMode, "screenshot-metrics");
    assert.match(contactSheet, /Photoreal Rendering Proof/);
    assert.match(contactSheet, /photoreal-bloom-emissive-test/);
    assert.match(contactSheet, /photoreal-dof-depth-test/);
    assert.match(contactSheet, /photoreal-motion-blur-moving-test/);
    assert.match(contactSheet, /photoreal-reflective-wet-floor/);
    assert.deepEqual(
      report.thresholds.regionAverageChannelDeltaMaximums
        .filter((region) => ["photoreal-bloom-emissive-test", "photoreal-dof-depth-test", "photoreal-motion-blur-moving-test", "photoreal-reflective-wet-floor"].includes(region.fixtureId))
        .map((region) => region.id)
        .filter((id) => ["pedestal-top", "wall-gradient-midpoint", "near-sphere-highlight", "motion-trail", "trailing-exterior", "leading-exterior", "back-wall", "cyan-bar-floor-reflection", "cube-front-face", "bare-floor"].includes(id)),
      ["pedestal-top", "wall-gradient-midpoint", "near-sphere-highlight", "motion-trail", "trailing-exterior", "leading-exterior", "back-wall", "cyan-bar-floor-reflection", "cube-front-face", "bare-floor"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should remove legacy AO diagnostic screenshots before writing gate artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rendering-photoreal-cleanup-"));
  try {
    const metricsPath = join(root, "metrics.json");
    const screenshotsDir = join(root, "tools/verify/artifacts/rendering-photoreal/screenshots");
    const stalePath = join(screenshotsDir, "ao-sweep-disabled.web.png");
    await mkdir(screenshotsDir, { recursive: true });
    await writeFile(stalePath, "stale", "utf8");
    await writeFile(metricsPath, `${JSON.stringify(passingMetrics, null, 2)}\n`, "utf8");

    await runPhotorealRenderingGate({ metricsPath, root });

    await assert.rejects(stat(stalePath), { code: "ENOENT" });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail photoreal gate when a runtime screenshot is a flat background", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rendering-photoreal-flat-"));
  try {
    const metricsPath = join(root, "metrics.json");
    const metrics: PhotorealRenderingMetrics = {
      fixtures: passingMetrics.fixtures.map((fixture) => fixture.fixtureId === "photoreal-ao-corner-test"
        ? { ...fixture, web: { ...fixture.web, luminanceStdDev: 0 } }
        : fixture),
    };
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");

    const result = await runPhotorealRenderingGate({ metricsPath, root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_RENDERING_PHOTOREAL_SCREENSHOT_FLAT"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail photoreal gate when a runtime screenshot is blank", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-rendering-photoreal-blank-"));
  try {
    const metricsPath = join(root, "metrics.json");
    const metrics: PhotorealRenderingMetrics = {
      fixtures: passingMetrics.fixtures.map((fixture) => fixture.fixtureId === "photoreal-bloom-emissive-test"
        ? { ...fixture, bevy: { ...fixture.bevy, luminanceStdDev: 0, nonblankArea: 0.01 } }
        : fixture),
    };
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");

    const result = await runPhotorealRenderingGate({ metricsPath, root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_RENDERING_PHOTOREAL_SCREENSHOT_BLANK"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
