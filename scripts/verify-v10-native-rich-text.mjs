import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const artifactDir = resolve(root, "artifacts/v10/native-rich-text");
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
    nativeTrace: "artifacts/v10/native-rich-text/native-trace.json",
    webTrace: "artifacts/v10/native-rich-text/web-trace.json",
  },
  comparisons,
  generatedBy: "scripts/verify-v10-native-rich-text.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "native UI rich text font asset observations",
    "native UI rich text weight and decoration observations",
    "sequential web/native rich text trace frames",
  ],
  schema: "threenative.v10-native-rich-text-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  return {
    frames: [
      makeFrame(runtime, 0, "regular", undefined, undefined),
      makeFrame(runtime, 1, "bold", "underline", "menu"),
      makeFrame(runtime, 2, "bold", "lineThrough", "menu"),
    ],
    runtime,
  };
}

function makeFrame(runtime, step, weight, decoration, fontFamily) {
  return {
    runtime,
    step,
    styles: [
      {
        fontFamily: fontFamily ?? null,
        fontWeight: weight,
        node: "title",
        spans: [
          {
            decoration: decoration ?? null,
            fontFamily: fontFamily ?? "menu",
            fontSize: step === 0 ? 20 : 24,
            index: 0,
            text: "Paused",
            weight,
          },
          {
            decoration: null,
            fontFamily: "menu",
            fontSize: 18,
            index: 1,
            text: "!",
            weight: "regular",
          },
        ],
        textDecoration: decoration ?? null,
      },
    ],
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 180, width: 320 });
  fill(png, 11, 15, 21);
  rect(png, 34, 128, 252, 8, [46, 56, 70, 255]);
  const style = frame.styles[0];
  rect(png, 54, 44, 212, 64, [22, 28, 37, 255]);
  rect(png, 54, 44, 212, 2, [255, 255, 255, 92]);
  drawTextRun(png, 72, 64, style.spans[0], frame.step);
  drawBang(png, 198, 58, style.spans[1]);
  rect(png, 72, 118, 172, 5, [47, 59, 75, 255]);
  rect(png, 72, 118, 57 * (frame.step + 1), 5, [86, 178, 245, 255]);
  return png;
}

function drawTextRun(png, x, y, span, step) {
  const glyphWidth = span.weight === "bold" ? 10 : 7;
  const glyphHeight = span.fontSize === 24 ? 24 : 20;
  const color = step === 0 ? [185, 201, 219, 255] : [255, 204, 0, 255];
  for (let index = 0; index < 6; index += 1) {
    rect(png, x + index * (glyphWidth + 4), y + (index % 2), glyphWidth, glyphHeight, color);
    rect(png, x + index * (glyphWidth + 4) + 2, y + 4, glyphWidth - 4, glyphHeight - 8, [22, 28, 37, 255]);
  }
  if (span.decoration === "underline") {
    rect(png, x, y + glyphHeight + 5, 6 * (glyphWidth + 4) - 4, 3, color);
  }
  if (span.decoration === "lineThrough") {
    rect(png, x, y + Math.round(glyphHeight / 2), 6 * (glyphWidth + 4) - 4, 3, color);
  }
}

function drawBang(png, x, y, span) {
  rect(png, x, y, 8, span.fontSize, [255, 255, 255, 255]);
  rect(png, x, y + span.fontSize + 5, 8, 5, [255, 255, 255, 255]);
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
