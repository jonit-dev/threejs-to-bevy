import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runPhotorealRenderingGate, type PhotorealRenderingMetrics } from "./renderingPhotoreal.js";

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
    };
    const contactSheet = await readFile(join(root, result.artifacts.contactSheetPath), "utf8");

    assert.equal(result.ok, true);
    assert.equal(result.evidenceMode, "screenshot-metrics");
    assert.deepEqual(result.diagnostics, []);
    assert.equal(report.ok, true);
    assert.equal(report.schema, "threenative.verify.rendering-photoreal");
    assert.deepEqual(report.fixtures.map((fixture) => fixture.id), ["photoreal-lighting-units-probe", "photoreal-ao-corner-test", "photoreal-bloom-emissive-test", "photoreal-dof-depth-test", "photoreal-motion-blur-moving-test", "photoreal-reflective-wet-floor"]);
    assert.equal(report.evidenceMode, "screenshot-metrics");
    assert.match(contactSheet, /Photoreal Rendering Proof/);
    assert.match(contactSheet, /photoreal-bloom-emissive-test/);
    assert.match(contactSheet, /photoreal-dof-depth-test/);
    assert.match(contactSheet, /photoreal-motion-blur-moving-test/);
    assert.match(contactSheet, /photoreal-reflective-wet-floor/);
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
