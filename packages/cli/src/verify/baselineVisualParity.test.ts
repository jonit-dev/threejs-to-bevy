import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import {
  BASELINE_VISUAL_CHECKPOINTS,
  verifyBaselineVisualCheckpoint,
  verifyBaselineVisualParity,
} from "./baselineVisualParity.js";
import { type IPixelFrame } from "./imageAnalysis.js";

const v1Checkpoint = BASELINE_VISUAL_CHECKPOINTS[0]!;

test("baseline visual checkpoints include canonical guard scenes", () => {
  const ids = BASELINE_VISUAL_CHECKPOINTS.map((checkpoint) => checkpoint.id);
  assert.deepEqual(ids, ["structured-stylized-nature"]);
  assert.ok(BASELINE_VISUAL_CHECKPOINTS.every((checkpoint) => checkpoint.projectRelativePath === "examples/stylized-nature-component"));
});

test("parity smoke checkpoint targets the single-scene hook fixture", async () => {
  const { PARITY_SMOKE_CHECKPOINT } = await import("./baselineVisualParity.js");
  assert.equal(PARITY_SMOKE_CHECKPOINT.id, "structured-stylized-nature-smoke");
  assert.equal(PARITY_SMOKE_CHECKPOINT.projectRelativePath, "examples/stylized-nature-component");
});

test("should pass when web and bevy screenshots match", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-baseline-visual-"));
  try {
    const frame = solidFrame([120, 140, 160]);
    const report = await verifyBaselineVisualParity({
      artifactDir: root,
      checkpoints: [v1Checkpoint],
      repoRoot: root,
      screenshotCapturer: async ({ artifactDir }) => mockCapture(artifactDir, frame, frame),
    });

    assert.equal(report.status, "pass");
    assert.equal(report.checkpoints[0]?.status, "pass");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when bevy screenshot drifts from web", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-baseline-visual-drift-"));
  try {
    const report = await verifyBaselineVisualCheckpoint({
      artifactDir: root,
      bundlePath: root,
      checkpoint: v1Checkpoint,
      screenshotCapturer: async ({ artifactDir }) =>
        mockCapture(artifactDir, solidFrame([90, 100, 110]), solidFrame([240, 240, 240])),
    });

    assert.equal(report.status, "fail");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BASELINE_VISUAL_FRAME_DRIFT"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail near-black web screenshots as blank evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-baseline-visual-dark-web-"));
  try {
    const report = await verifyBaselineVisualCheckpoint({
      artifactDir: root,
      bundlePath: root,
      checkpoint: v1Checkpoint,
      screenshotCapturer: async ({ artifactDir }) =>
        mockCapture(artifactDir, solidFrame([20, 20, 20]), solidFrame([120, 140, 160])),
    });

    assert.equal(report.status, "fail");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BASELINE_VISUAL_WEB_BLANK"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when bevy is darker than web", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-baseline-visual-underexposure-"));
  try {
    const report = await verifyBaselineVisualCheckpoint({
      artifactDir: root,
      bundlePath: root,
      checkpoint: v1Checkpoint,
      screenshotCapturer: async ({ artifactDir }) =>
        mockCapture(artifactDir, solidFrame([180, 180, 180]), solidFrame([40, 40, 40])),
    });

    assert.equal(report.status, "fail");
    assert.ok(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_BASELINE_VISUAL_UNDEREXPOSURE"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function solidFrame(rgb: [number, number, number], width = 1280, height = 720): IPixelFrame {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = rgb[0];
    data[index + 1] = rgb[1];
    data[index + 2] = rgb[2];
    data[index + 3] = 255;
  }
  return { data, height, width };
}

async function mockCapture(
  artifactDir: string,
  web: IPixelFrame,
  bevy: IPixelFrame,
): Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(artifactDir, { recursive: true });
  const webScreenshotPath = join(artifactDir, "web.png");
  const bevyScreenshotPath = join(artifactDir, "bevy.png");
  await writeFile(webScreenshotPath, PNG.sync.write(toPng(web)));
  await writeFile(bevyScreenshotPath, PNG.sync.write(toPng(bevy)));
  return { bevyScreenshotPath, webScreenshotPath };
}

function toPng(frame: IPixelFrame): PNG {
  const png = new PNG({ height: frame.height, width: frame.width });
  png.data.set(frame.data);
  return png;
}
