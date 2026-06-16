import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { analyzeColorParitySwatches, verifyColorParityVisual } from "./colorParityVisual.js";
import { compareFramesDetailed, cropFrame, parseHexColor } from "./imageAnalysis.js";

test("should pass matching color parity screenshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v8-color-parity-"));
  try {
    await makeBundle(root);
    const report = await verifyColorParityVisual({
      artifactDir: root,
      bundlePath: root,
      screenshotCapturer: mockCapturer(makeSwatchFrame()),
    });

    assert.equal(report.status, "pass");
    assert.equal(report.swatches.every((swatch) => swatch.ok), true);
    assert.match(report.artifacts.diffPath, /diff\.png$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when a swatch color drifts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v8-color-parity-drift-"));
  try {
    await makeBundle(root);
    const report = await verifyColorParityVisual({
      artifactDir: root,
      bundlePath: root,
      screenshotCapturer: mockCapturer(makeSwatchFrame({ red: [64, 64, 210] })),
    });

    assert.equal(report.status, "fail");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_V8_COLOR_PARITY_SWATCH_DRIFT"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should quantify detailed frame deltas", () => {
  const first = solidFrame([100, 100, 100]);
  const second = solidFrame([110, 110, 110]);
  const result = compareFramesDetailed(first, second);

  assert.equal(result.changedPixelRatio, 1);
  assert.ok(result.p95ChannelDelta > 0.03);
  assert.ok(result.maxChannelDelta > 0.03);
  assert.ok(result.signedAverageBrightnessDelta > 0);
});

test("should compare authored swatch regions against expected colors", () => {
  const frame = makeSwatchFrame();
  const swatches = analyzeColorParitySwatches(frame, frame);

  assert.equal(swatches.length, 9);
  assert.equal(swatches.every((swatch) => swatch.ok), true);
  const red = swatches.find((swatch) => swatch.id === "red");
  assert.ok(red !== undefined);
  assert.ok(red.webDistanceToExpected < 0.04);
  assert.deepEqual(red.expectedColor, parseHexColor("#e6194b"));
});

async function makeBundle(root: string): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "color-parity",
    requiredCapabilities: { rendering: ["material.extended"] },
    entry: { world: "world.ir.json" },
    files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
  });
  await writeJson(root, "world.ir.json", {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "camera.color",
        components: {
          Camera: { far: 20, kind: "orthographic", near: 0.1, size: 4.5 },
          Transform: { position: [0, 0, 5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
      },
    ],
    resources: { ActiveCamera: { entity: "camera.color" } },
  });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: {} });
}

function mockCapturer(frame: ReturnType<typeof makeSwatchFrame>) {
  return async ({ artifactDir }: { artifactDir: string }) => {
    await mkdir(artifactDir, { recursive: true });
    const webScreenshotPath = join(artifactDir, "web.png");
    const bevyScreenshotPath = join(artifactDir, "bevy.png");
    await writePng(webScreenshotPath, frame);
    await writePng(bevyScreenshotPath, frame);
    return { bevyScreenshotPath, webScreenshotPath };
  };
}

function makeSwatchFrame(overrides: Partial<Record<string, [number, number, number]>> = {}) {
  const width = 1280;
  const height = 720;
  const data = new Uint8ClampedArray(width * height * 4);
  fillBackground(data, width, height, [17, 19, 24]);
  const colors: Record<string, [number, number, number]> = {
    red: overrides.red ?? [230, 25, 75],
    green: overrides.green ?? [60, 180, 75],
    blue: overrides.blue ?? [67, 99, 216],
    yellow: overrides.yellow ?? [255, 225, 25],
    cyan: overrides.cyan ?? [66, 212, 244],
    magenta: overrides.magenta ?? [240, 50, 230],
    white: overrides.white ?? [255, 255, 255],
    gray: overrides.gray ?? [128, 128, 128],
    orange: overrides.orange ?? [245, 130, 49],
  };
  const regions = [
    ["red", 0.18, 0.1],
    ["green", 0.43, 0.1],
    ["blue", 0.68, 0.1],
    ["yellow", 0.18, 0.37],
    ["cyan", 0.43, 0.37],
    ["magenta", 0.68, 0.37],
    ["white", 0.18, 0.64],
    ["gray", 0.43, 0.64],
    ["orange", 0.68, 0.64],
  ] as const;
  for (const [name, regionX, regionY] of regions) {
    fillRegion(data, width, height, {
      height: Math.floor(height * 0.13),
      width: Math.floor(width * 0.13),
      x: Math.max(0, Math.floor(width * (regionX - 0.04))),
      y: Math.max(0, Math.floor(height * (regionY - 0.025))),
    }, colors[name] ?? [0, 0, 0]);
  }
  return { data, height, width };
}

function solidFrame(rgb: [number, number, number]) {
  const data = new Uint8ClampedArray(4 * 10 * 10);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgb[0];
    data[index + 1] = rgb[1];
    data[index + 2] = rgb[2];
    data[index + 3] = 255;
  }
  return { data, height: 10, width: 10 };
}

function fillBackground(data: Uint8ClampedArray, width: number, height: number, rgb: [number, number, number]): void {
  fillRegion(data, width, height, { height, width, x: 0, y: 0 }, rgb);
}

function fillRegion(
  data: Uint8ClampedArray,
  frameWidth: number,
  frameHeight: number,
  region: { height: number; width: number; x: number; y: number },
  rgb: [number, number, number],
): void {
  for (let row = region.y; row < Math.min(frameHeight, region.y + region.height); row += 1) {
    for (let column = region.x; column < Math.min(frameWidth, region.x + region.width); column += 1) {
      const index = (row * frameWidth + column) * 4;
      data[index] = rgb[0];
      data[index + 1] = rgb[1];
      data[index + 2] = rgb[2];
      data[index + 3] = 255;
    }
  }
}

async function writePng(path: string, frame: { data: ArrayLike<number>; height: number; width: number }): Promise<void> {
  const png = new PNG({ height: frame.height, width: frame.width });
  png.data.set(frame.data);
  await writeFile(path, PNG.sync.write(png));
}

async function writeJson(dir: string, name: string, value: unknown): Promise<void> {
  await writeFile(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}
