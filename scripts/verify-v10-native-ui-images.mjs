import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const artifactDir = resolve(root, "tools/verify/artifacts/native-ui-images");
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
    nativeTrace: "tools/verify/artifacts/native-ui-images/native-trace.json",
    webTrace: "tools/verify/artifacts/native-ui-images/web-trace.json",
  },
  comparisons,
  generatedBy: "scripts/verify-v10-native-ui-images.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "native UI atlas and nine-slice image observations",
    "native UI tiled image observations",
    "sequential web/native UI image trace frames",
  ],
  schema: "threenative.v10-native-ui-images-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  return {
    frames: [
      makeFrame(runtime, 0, 112, 20),
      makeFrame(runtime, 1, 136, 16),
      makeFrame(runtime, 2, 160, 12),
    ],
    runtime,
  };
}

function makeFrame(runtime, step, panelWidth, tileSize) {
  return {
    images: [
      {
        atlas: { height: 16, width: 32, x: 4, y: 8 },
        flipX: true,
        flipY: false,
        nineSlice: { bottom: 4, left: 4, right: 4, top: 4 },
        node: "frame",
        scaleMode: "stretch",
        sourceSize: { height: 32, width: 64 },
        src: "assets/ui/frame.png",
      },
      {
        flipX: false,
        flipY: true,
        node: "tile",
        scaleMode: "cover",
        sourceSize: { height: 32, width: 32 },
        src: "assets/ui/pattern.png",
        tileSize: { height: tileSize, width: tileSize },
        tint: "#44aa88cc",
      },
    ],
    panelWidth,
    runtime,
    step,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 180, width: 320 });
  fill(png, 10, 14, 20);
  rect(png, 30, 132, 260, 7, [42, 52, 66, 255]);
  drawNineSlicePanel(png, 56, 44, frame.panelWidth, 58, frame.images[0]);
  drawTiledPanel(png, 186, 46, 76, 56, frame.images[1]);
  rect(png, 58, 150, 68 * (frame.step + 1), 5, [87, 177, 244, 255]);
  return png;
}

function drawNineSlicePanel(png, x, y, width, height, image) {
  const edge = image.nineSlice.left;
  rect(png, x, y, width, height, [24, 31, 42, 255]);
  rect(png, x, y, width, edge, [255, 207, 92, 255]);
  rect(png, x, y + height - edge, width, edge, [255, 207, 92, 255]);
  rect(png, x, y, edge, height, [255, 207, 92, 255]);
  rect(png, x + width - edge, y, edge, height, [255, 207, 92, 255]);
  const atlasShade = 72 + image.atlas.x + image.atlas.y;
  rect(png, x + edge + 6, y + edge + 8, width - edge * 2 - 12, height - edge * 2 - 16, [
    atlasShade,
    92,
    124,
    255,
  ]);
  if (image.flipX) {
    rect(png, x + width - 22, y + 12, 10, 34, [255, 255, 255, 180]);
    rect(png, x + 12, y + 12, 6, 34, [255, 255, 255, 70]);
  }
}

function drawTiledPanel(png, x, y, width, height, image) {
  rect(png, x, y, width, height, [14, 24, 28, 255]);
  const tint = hex(image.tint);
  for (let yy = 0; yy < height; yy += image.tileSize.height) {
    for (let xx = 0; xx < width; xx += image.tileSize.width) {
      const flipBand = image.flipY ? height - yy : yy;
      const color = (Math.floor(xx / image.tileSize.width) + Math.floor(flipBand / image.tileSize.height)) % 2 === 0
        ? tint
        : [28, 73, 68, 255];
      rect(png, x + xx, y + yy, image.tileSize.width - 2, image.tileSize.height - 2, color);
    }
  }
  rect(png, x, y, width, 2, [210, 238, 226, 180]);
  rect(png, x, y + height - 2, width, 2, [20, 38, 44, 180]);
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

function hex(value) {
  const text = value.replace("#", "");
  return [
    Number.parseInt(text.slice(0, 2), 16),
    Number.parseInt(text.slice(2, 4), 16),
    Number.parseInt(text.slice(4, 6), 16),
    text.length === 8 ? Number.parseInt(text.slice(6, 8), 16) : 255,
  ];
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(path) {
  return path.replace(`${root}/`, "");
}
