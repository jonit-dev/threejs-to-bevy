import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { verifyV3LightingColor } from "./v3LightingColor.js";

test("v3LightingColor should report signed color and brightness drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-lighting-color-"));
  try {
    const screenshotDir = join(root, "screenshots");
    await mkdir(screenshotDir, { recursive: true });
    const threejsPath = join(screenshotDir, "bookmark.threejs.png");
    const bevyGltfPath = join(screenshotDir, "bookmark.bevy-gltf.png");
    await writePng(threejsPath, { blue: 100, green: 100, red: 100 });
    await writePng(bevyGltfPath, { blue: 80, green: 140, red: 130 });
    await writeFile(
      join(root, "v3-scene-report.json"),
      `${JSON.stringify({
        captures: [{ bookmarkId: "bookmark.start", bevyGltfPath, threejsPath }],
      })}\n`,
    );

    const report = await verifyV3LightingColor({ artifactDir: root });
    const written = JSON.parse(await readFile(join(root, "v3-lighting-color-report.json"), "utf8"));

    assert.equal(report.status, "pass");
    assert.equal(report.samples[0]?.bookmarkId, "bookmark.start");
    assert.equal(report.samples[0]?.interpretation.colorBias, "bevy-warmer");
    assert.ok((report.samples[0]?.metrics.signedAverageColorDelta.red ?? 0) > 0);
    assert.ok((report.samples[0]?.metrics.signedAverageColorDelta.green ?? 0) > 0);
    assert.ok((report.samples[0]?.metrics.signedAverageColorDelta.blue ?? 0) < 0);
    assert.equal(report.thresholds.mode, "report-only");
    assert.equal(written.summary.maxBrightnessDelta, report.summary.maxBrightnessDelta);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("v3LightingColor should fail when scene captures are missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-lighting-color-missing-"));
  try {
    await writeFile(join(root, "v3-scene-report.json"), "{\"captures\":[]}\n");

    const report = await verifyV3LightingColor({ artifactDir: root });

    assert.equal(report.status, "fail");
    assert.equal(report.diagnostics[0]?.code, "TN_V3_LIGHTING_COLOR_CAPTURES_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writePng(path: string, color: { blue: number; green: number; red: number }): Promise<void> {
  const png = new PNG({ height: 4, width: 4 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = color.red;
    png.data[index + 1] = color.green;
    png.data[index + 2] = color.blue;
    png.data[index + 3] = 255;
  }
  await writeFile(path, PNG.sync.write(png));
}
