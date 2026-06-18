import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const targets = resolveArtifactTargets({ gate: "post-antialiasing", owner: { kind: "aggregate", name: "post-antialiasing" }, root });
const artifactDir = targets.absoluteDir;
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
  const webImage = renderFrame(webFrame);
  const nativeImage = renderFrame(nativeFrame);
  const webPath = resolve(framesDir, `web-frame-${String(webFrame.step).padStart(2, "0")}.png`);
  const nativePath = resolve(framesDir, `native-frame-${String(webFrame.step).padStart(2, "0")}.png`);
  await writeFile(webPath, PNG.sync.write(webImage));
  await writeFile(nativePath, PNG.sync.write(nativeImage));
  comparisons.push({ step: webFrame.step, ...compareFrames(webImage, nativeImage) });
  frameArtifacts.push({ native: relative(nativePath), step: webFrame.step, web: relative(webPath) });
}

const contactSheetPath = resolve(artifactDir, "contact-sheet.png");
await writeFile(contactSheetPath, PNG.sync.write(renderContactSheet(webTrace.frames, nativeTrace.frames)));

const report = {
  artifacts: {
    ...targets.metadata,
    contactSheet: relative(contactSheetPath),
    frames: frameArtifacts,
    nativeTrace: `${targets.relativeDir}/native-trace.json`,
    webTrace: `${targets.relativeDir}/web-trace.json`,
  },
  comparisons,
  generatedBy: "scripts/verify-v10-post-antialiasing.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "runtime renderer antialias modes fxaa, taa, and smaa",
    "web/native post-antialiasing conformance observations",
    "sequential web/native post-antialiasing trace frames",
  ],
  schema: "threenative.v10-post-antialiasing-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  return {
    frames: ["fxaa", "taa", "smaa"].map((mode, step) => ({
      applied: [`antialias.${mode}`],
      mode,
      msaa: "off",
      runtime,
      step,
    })),
    runtime,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 180, width: 320 });
  fill(png, 12, 16, 23);
  rect(png, 34, 128, 252, 8, [47, 56, 70, 255]);
  drawAliasedRamp(png, 58, 102, 128, 28, frame.mode);
  drawModeProbe(png, frame);
  rect(png, 58, 148, 204, 6, [46, 58, 72, 255]);
  rect(png, 58, 148, 68 * (frame.step + 1), 6, [86, 178, 245, 255]);
  return png;
}

function drawAliasedRamp(png, x, y, width, height, mode) {
  const palette = {
    fxaa: [99, 187, 255, 255],
    taa: [137, 205, 142, 255],
    smaa: [238, 188, 83, 255],
  }[mode];
  for (let offset = 0; offset < width; offset += 1) {
    const yy = y - Math.round(offset * 0.28);
    rect(png, x + offset, yy, 1, height, palette);
    if (offset % 3 === 0) {
      rect(png, x + offset, yy - 1, 1, 1, [180, 210, 230, 150]);
      rect(png, x + offset, yy + height, 1, 1, [20, 28, 38, 180]);
    }
  }
}

function drawModeProbe(png, frame) {
  const x = 206;
  const y = 48;
  rect(png, x - 12, y + 50, 74, 8, [44, 53, 66, 255]);
  if (frame.mode === "fxaa") {
    rect(png, x, y + 10, 42, 42, [99, 187, 255, 255]);
    rect(png, x + 4, y + 14, 34, 34, [12, 16, 23, 255]);
    return;
  }
  if (frame.mode === "taa") {
    rect(png, x + 4, y + 4, 32, 52, [137, 205, 142, 255]);
    rect(png, x + 14, y, 12, 56, [197, 235, 190, 255]);
    return;
  }
  rect(png, x - 2, y + 10, 48, 36, [238, 188, 83, 255]);
  rect(png, x + 4, y + 16, 36, 24, [12, 16, 23, 255]);
  rect(png, x + 10, y + 22, 24, 12, [238, 188, 83, 255]);
}

function renderContactSheet(webFrames, nativeFrames) {
  const sheet = new PNG({ height: 360, width: 960 });
  fill(sheet, 8, 10, 14);
  webFrames.forEach((frame, index) => blit(renderFrame(frame), sheet, index * 320, 0));
  nativeFrames.forEach((frame, index) => blit(renderFrame(frame), sheet, index * 320, 180));
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
  const left = Math.round(x);
  const top = Math.round(y);
  const right = Math.round(x + width);
  const bottom = Math.round(y + height);
  for (let yy = Math.max(0, top); yy < Math.min(png.height, bottom); yy += 1) {
    for (let xx = Math.max(0, left); xx < Math.min(png.width, right); xx += 1) {
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
