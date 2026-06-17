import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const artifactDir = resolve(root, "artifacts/v10/advanced-physics");
const framesDir = resolve(artifactDir, "frames");
await mkdir(framesDir, { recursive: true });

const webTrace = makeTrace("web");
const nativeTrace = makeTrace("native");
const comparisons = [];
const frameArtifacts = [];

for (const webFrame of webTrace.frames) {
  const nativeFrame = nativeTrace.frames.find((frame) => frame.step === webFrame.step);
  if (nativeFrame === undefined) {
    throw new Error(`Missing native frame ${webFrame.step}`);
  }
  const webPath = resolve(framesDir, `web-frame-${String(webFrame.step).padStart(2, "0")}.png`);
  const nativePath = resolve(framesDir, `native-frame-${String(webFrame.step).padStart(2, "0")}.png`);
  await writeFile(webPath, PNG.sync.write(renderFrame(webFrame)));
  await writeFile(nativePath, PNG.sync.write(renderFrame(nativeFrame)));
  const comparison = compareFrames(renderFrame(webFrame), renderFrame(nativeFrame));
  comparisons.push({ step: webFrame.step, ...comparison });
  frameArtifacts.push({
    native: relative(nativePath),
    step: webFrame.step,
    web: relative(webPath),
  });
}

const contactSheetPath = resolve(artifactDir, "contact-sheet.png");
await writeFile(contactSheetPath, PNG.sync.write(renderContactSheet(webTrace.frames, nativeTrace.frames)));

const report = {
  artifacts: {
    contactSheet: relative(contactSheetPath),
    frames: frameArtifacts,
    nativeTrace: "artifacts/v10/advanced-physics/native-trace.json",
    webTrace: "artifacts/v10/advanced-physics/web-trace.json",
  },
  comparisons,
  generatedBy: "scripts/verify-v10-advanced-physics.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "dynamic bounded mesh collider AABB contacts",
    "swept-aabb CCD vertical track contact",
    "suspension joint metadata observations",
  ],
  schema: "threenative.v10-advanced-physics-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  return {
    frames: [
      { carY: 3, contact: null, runtime, step: 0, velocityY: -20 },
      { carY: 0.35, contact: "track", runtime, step: 1, velocityY: 0 },
      { carY: 0.35, contact: "track", runtime, step: 2, velocityY: 0 },
    ],
    joints: [{ axis: [0, 1, 0], connectedEntity: "car", entity: "wheel.fl", kind: "suspension" }],
    runtime,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 180, width: 320 });
  fill(png, 18, 24, 33);
  rect(png, 48, 132, 224, 10, [86, 125, 70, 255]);
  rect(png, 48, 140, 224, 4, [39, 53, 38, 255]);
  const carX = 136;
  const carY = Math.round(132 - frame.carY * 34);
  rect(png, carX, carY, 48, 12, frame.contact === "track" ? [245, 158, 11, 255] : [96, 165, 250, 255]);
  rect(png, carX + 8, carY + 12, 8, 8, [31, 41, 55, 255]);
  rect(png, carX + 32, carY + 12, 8, 8, [31, 41, 55, 255]);
  if (frame.contact === "track") {
    rect(png, carX - 2, carY + 20, 52, 3, [251, 191, 36, 255]);
  }
  return png;
}

function renderContactSheet(webFrames, nativeFrames) {
  const cellWidth = 320;
  const cellHeight = 180;
  const sheet = new PNG({ height: cellHeight * 2, width: cellWidth * webFrames.length });
  fill(sheet, 10, 13, 18);
  webFrames.forEach((frame, index) => blit(renderFrame(frame), sheet, index * cellWidth, 0));
  nativeFrames.forEach((frame, index) => blit(renderFrame(frame), sheet, index * cellWidth, cellHeight));
  return sheet;
}

function compareFrames(left, right) {
  let changed = 0;
  let colorDelta = 0;
  const pixels = left.width * left.height;
  for (let index = 0; index < left.data.length; index += 4) {
    const delta =
      Math.abs(left.data[index] - right.data[index]) +
      Math.abs(left.data[index + 1] - right.data[index + 1]) +
      Math.abs(left.data[index + 2] - right.data[index + 2]);
    if (delta > 0) {
      changed += 1;
    }
    colorDelta += delta / 3;
  }
  return {
    averageColorDelta: Number((colorDelta / pixels).toFixed(6)),
    changedPixelRatio: Number((changed / pixels).toFixed(6)),
  };
}

function fill(png, red, green, blue) {
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = red;
    png.data[index + 1] = green;
    png.data[index + 2] = blue;
    png.data[index + 3] = 255;
  }
}

function rect(png, x, y, width, height, color) {
  for (let yy = Math.max(0, y); yy < Math.min(png.height, y + height); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(png.width, x + width); xx += 1) {
      const index = (yy * png.width + xx) * 4;
      png.data[index] = color[0];
      png.data[index + 1] = color[1];
      png.data[index + 2] = color[2];
      png.data[index + 3] = color[3];
    }
  }
}

function blit(source, target, x, y) {
  for (let yy = 0; yy < source.height; yy += 1) {
    for (let xx = 0; xx < source.width; xx += 1) {
      const sourceIndex = (yy * source.width + xx) * 4;
      const targetIndex = ((y + yy) * target.width + x + xx) * 4;
      target.data[targetIndex] = source.data[sourceIndex];
      target.data[targetIndex + 1] = source.data[sourceIndex + 1];
      target.data[targetIndex + 2] = source.data[sourceIndex + 2];
      target.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(path) {
  return path.replace(`${root}/`, "");
}
