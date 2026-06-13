import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { compareImagesCommand } from "./compareImages.js";

test("should compare screenshots and report subtle brightness deltas", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-compare-images-"));
  try {
    await writePng(join(root, "dark.png"), 100);
    await writePng(join(root, "light.png"), 110);

    const result = await compareImagesCommand(["dark.png", "light.png", "--json"], root);
    const payload = JSON.parse(result.stdout) as {
      averageBrightnessDelta: number;
      averageColorDelta: { blue: number; green: number; red: number };
      changedPixelRatio: number;
      code: string;
    };

    assert.equal(result.exitCode, 0);
    assert.equal(payload.code, "TN_COMPARE_IMAGES_OK");
    assert.equal(payload.changedPixelRatio, 1);
    assert.ok(payload.averageBrightnessDelta > 0.03);
    assert.deepEqual(payload.averageColorDelta, {
      blue: payload.averageBrightnessDelta,
      green: payload.averageBrightnessDelta,
      red: payload.averageBrightnessDelta,
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writePng(path: string, value: number): Promise<void> {
  const png = new PNG({ height: 4, width: 4 });
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = value;
    png.data[index + 1] = value;
    png.data[index + 2] = value;
    png.data[index + 3] = 255;
  }

  await writeFile(path, PNG.sync.write(png));
}
