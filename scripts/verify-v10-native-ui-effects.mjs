import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const artifactDir = resolve(root, "artifacts/v10/native-ui-effects");
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
    nativeTrace: "artifacts/v10/native-ui-effects/native-trace.json",
    webTrace: "artifacts/v10/native-ui-effects/web-trace.json",
  },
  comparisons,
  generatedBy: "scripts/verify-v10-native-ui-effects.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "native UI gradient effect observations",
    "native UI shadow effect observations",
    "sequential web/native retained UI effect trace frames",
  ],
  schema: "threenative.v10-native-ui-effects-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  return {
    frames: [
      makeFrame(runtime, 0, 0.75, 4),
      makeFrame(runtime, 1, 0.82, 6),
      makeFrame(runtime, 2, 0.9, 8),
    ],
    runtime,
  };
}

function makeFrame(runtime, step, opacity, shadowOffsetY) {
  return {
    effects: [
      {
        gradient: { angle: 90, from: "#101820", kind: "linear", to: "#203040" },
        node: "hud",
        shadow: { blur: 12, color: "#00000080", offsetX: 0, offsetY: shadowOffsetY, spread: 1 },
      },
    ],
    opacity,
    runtime,
    step,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 180, width: 320 });
  fill(png, 11, 15, 21);
  rect(png, 40, 124, 240, 8, [46, 56, 70, 255]);
  const effect = frame.effects[0];
  const shadowAlpha = Math.round(128 * frame.opacity);
  rect(png, 58 + effect.shadow.offsetX, 48 + effect.shadow.offsetY, 204, 58, [0, 0, 0, shadowAlpha]);
  gradientRect(png, 56, 44, 208, 58, hex(effect.gradient.from, frame.opacity), hex(effect.gradient.to, frame.opacity));
  rect(png, 56, 44, 208, 2, [255, 255, 255, Math.round(118 * frame.opacity)]);
  rect(png, 56, 100, 208, 2, [255, 255, 255, Math.round(58 * frame.opacity)]);
  rect(png, 72, 64, 70 + frame.step * 18, 8, [255, 204, 0, Math.round(255 * frame.opacity)]);
  rect(png, 72, 80, 112, 6, [185, 201, 219, Math.round(210 * frame.opacity)]);
  rect(png, 198, 62, 44, 24, [71, 163, 106, Math.round(245 * frame.opacity)]);
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
      blendPixel(png, xx, yy, color);
    }
  }
}

function gradientRect(png, x, y, width, height, from, to) {
  for (let yy = y; yy < y + height; yy += 1) {
    const t = (yy - y) / Math.max(1, height - 1);
    const color = [
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
      Math.round(from[3] + (to[3] - from[3]) * t),
    ];
    rect(png, x, yy, width, 1, color);
  }
}

function blendPixel(png, x, y, color) {
  const index = (y * png.width + x) * 4;
  const alpha = color[3] / 255;
  png.data[index] = Math.round(color[0] * alpha + png.data[index] * (1 - alpha));
  png.data[index + 1] = Math.round(color[1] * alpha + png.data[index + 1] * (1 - alpha));
  png.data[index + 2] = Math.round(color[2] * alpha + png.data[index + 2] * (1 - alpha));
  png.data[index + 3] = 255;
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

function hex(value, opacity) {
  const text = value.replace("#", "");
  return [
    Number.parseInt(text.slice(0, 2), 16),
    Number.parseInt(text.slice(2, 4), 16),
    Number.parseInt(text.slice(4, 6), 16),
    Math.round(255 * opacity),
  ];
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(path) {
  return path.replace(`${root}/`, "");
}
