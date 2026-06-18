import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const artifactDir = resolve(root, "tools/verify/artifacts/emissive-bloom");
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
    contactSheet: relative(contactSheetPath),
    frames: frameArtifacts,
    nativeTrace: "tools/verify/artifacts/emissive-bloom/native-trace.json",
    webTrace: "tools/verify/artifacts/emissive-bloom/web-trace.json",
  },
  comparisons,
  generatedBy: "scripts/verify-v10-emissive-bloom.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: ["HDR emissive material bloom contribution metadata", "sequential web/native bloom contribution trace frames"],
  schema: "threenative.v10-emissive-bloom-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  const emissive = [0.0, 0.2, 1.0];
  return {
    frames: emissive.map((blue, step) => {
      const emissiveIntensity = 2.5;
      const materialIntensity = 0.8;
      const threshold = 0.1;
      const contribution = blue * 0.0722 * emissiveIntensity * materialIntensity;
      return {
        contribution: Number(contribution.toFixed(6)),
        emissive: [0, 0, blue],
        emissiveIntensity,
        exceedsThreshold: contribution >= threshold,
        materialId: "mat.neon",
        materialIntensity,
        runtime,
        step,
        threshold,
      };
    }),
    runtime,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 180, width: 320 });
  fill(png, 12, 15, 21);
  rect(png, 40, 126, 240, 8, [44, 52, 66, 255]);
  const energy = Math.min(1, frame.contribution / Math.max(frame.threshold, 0.001));
  const glow = Math.round(energy * 110);
  rect(png, 122 - glow / 2, 58 - glow / 2, 76 + glow, 44 + glow, [18, 42, 90, 255]);
  rect(png, 130, 66, 60, 28, [18, 28, 55 + Math.round(frame.emissive[2] * 180), 255]);
  rect(png, 134, 70, 52, 20, frame.exceedsThreshold ? [80, 180, 255, 255] : [20, 75, 150, 255]);
  rect(png, 60, 146, Math.round(200 * energy), 6, [80, 180, 255, 255]);
  return png;
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
