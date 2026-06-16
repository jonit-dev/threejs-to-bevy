import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { verifyV8LightsShadows } from "./v8LightsShadows.js";

test("v8LightsShadows should report shadow policy and shadow-sensitive capture drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v8-lights-shadows-"));
  try {
    const screenshotDir = join(root, "screenshots");
    await mkdir(screenshotDir, { recursive: true });
    const threejsPath = join(screenshotDir, "bookmark.threejs.png");
    const bevyGltfPath = join(screenshotDir, "bookmark.bevy-gltf.png");
    const contactSheetPath = join(screenshotDir, "threejs-bevy-side-by-side.png");
    await writePng(threejsPath, [
      { blue: 210, green: 210, red: 210 },
      { blue: 210, green: 210, red: 210 },
      { blue: 210, green: 210, red: 210 },
      { blue: 210, green: 210, red: 210 },
    ]);
    await writePng(bevyGltfPath, [
      { blue: 40, green: 40, red: 40 },
      { blue: 40, green: 40, red: 40 },
      { blue: 210, green: 210, red: 210 },
      { blue: 210, green: 210, red: 210 },
    ]);
    await writeFile(
      join(root, "v3-scene-report.json"),
      `${JSON.stringify({
        artifacts: { sideBySideContactSheetPath: contactSheetPath },
        captures: [{ bookmarkId: "bookmark.shadow", bevyGltfPath, threejsPath }],
      })}\n`,
    );

    const report = await verifyV8LightsShadows({
      artifactDir: root,
      bundleLoader: async () => ({
        environmentScene: {
          atmosphere: {
            shadows: {
              bias: -0.0005,
              cascadeCount: 1,
              enabled: true,
              mapSize: 1024,
              maxDistance: 45,
              normalBias: 0.02,
              receiverPolicy: "terrain-and-path",
            },
          },
        },
        world: {
          entities: [
            { components: { Light: { kind: "directional", shadowBias: -0.0005, shadowNormalBias: 0.02 } }, id: "light.sun" },
            { components: { Light: { kind: "point" } }, id: "light.point" },
            { components: { MeshRenderer: { castShadow: true, receiveShadow: true } }, id: "mesh.receiver" },
          ],
        },
      }),
      bundlePath: join(root, "bundle"),
      sceneReportPath: join(root, "v3-scene-report.json"),
    });
    const written = JSON.parse(await readFile(join(root, "v8-lights-shadows-report.json"), "utf8"));

    assert.equal(report.status, "pass");
    assert.equal(report.v8Scope.visualParity, "not-asserted");
    assert.equal(report.thresholds.mode, "report-only");
    assert.equal(report.shadowPolicy?.mapSize, 1024);
    assert.equal(report.lightTrace.counts.directional, 1);
    assert.equal(report.lightTrace.counts.point, 1);
    assert.equal(report.lightTrace.counts.shadowCasters, 1);
    assert.equal(report.lightTrace.pointLightShadowParity, "not-proven");
    assert.equal(report.samples[0]?.shadowTrace.interpretation, "bevy-darker-shadow-regions");
    assert.equal(report.artifacts.contactSheetPath, contactSheetPath);
    assert.equal(written.summary.sampleCount, 1);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("v8LightsShadows should fail when shadow policy and captures are missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v8-lights-shadows-missing-"));
  try {
    await writeFile(join(root, "v3-scene-report.json"), "{\"captures\":[]}\n");

    const report = await verifyV8LightsShadows({
      artifactDir: root,
      bundleLoader: async () => ({ world: { entities: [] } }),
      bundlePath: join(root, "bundle"),
      sceneReportPath: join(root, "v3-scene-report.json"),
    });

    assert.equal(report.status, "fail");
    assert.deepEqual(
      report.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_V8_LIGHTS_SHADOWS_POLICY_MISSING", "TN_V8_LIGHTS_SHADOWS_CAPTURES_MISSING"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writePng(path: string, colors: Array<{ blue: number; green: number; red: number }>): Promise<void> {
  const png = new PNG({ height: 2, width: 2 });
  for (let pixel = 0; pixel < colors.length; pixel += 1) {
    const index = pixel * 4;
    const color = colors[pixel] ?? { blue: 0, green: 0, red: 0 };
    png.data[index] = color.red;
    png.data[index + 1] = color.green;
    png.data[index + 2] = color.blue;
    png.data[index + 3] = 255;
  }
  await writeFile(path, PNG.sync.write(png));
}
