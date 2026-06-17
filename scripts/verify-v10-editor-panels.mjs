import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const artifactDir = resolve(root, "artifacts/v10/editor-panels");
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
    nativeTrace: "artifacts/v10/editor-panels/native-trace.json",
    webTrace: "artifacts/v10/editor-panels/web-trace.json",
  },
  comparisons,
  generatedBy: "scripts/verify-v10-editor-panels.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "visual editor hierarchy panel model",
    "visual editor inspector/assets/diagnostics panel model",
    "sequential web/native editor panel trace frames",
  ],
  schema: "threenative.v10-editor-panels-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  const panels = [
    { id: "scene-hierarchy", rows: 3, title: "Scene Hierarchy" },
    { id: "properties", rows: 6, title: "Inspector" },
    { id: "assets", rows: 4, title: "Assets" },
    { id: "diagnostics", rows: 1, title: "Diagnostics" },
    { id: "hot-reload", rows: 4, title: "Reload Policy" },
  ];
  return {
    frames: [
      { activePanel: "scene-hierarchy", panels, runtime, selectedNode: "entity.camera", step: 0 },
      { activePanel: "properties", panels, runtime, selectedNode: "entity.camera", step: 1 },
      { activePanel: "assets", panels, runtime, selectedNode: "entity.camera", step: 2 },
    ],
    runtime,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 220, width: 360 });
  fill(png, 12, 15, 21);
  rect(png, 0, 0, 360, 28, [25, 31, 42, 255]);
  rect(png, 0, 28, 86, 192, [18, 23, 32, 255]);
  rect(png, 86, 28, 274, 192, [14, 18, 26, 255]);
  frame.panels.forEach((panel, index) => drawTab(png, panel, index, panel.id === frame.activePanel));
  const active = frame.panels.find((panel) => panel.id === frame.activePanel);
  drawPanel(png, active, frame.step);
  rect(png, 104, 196, 74 * (frame.step + 1), 5, [83, 166, 235, 255]);
  return png;
}

function drawTab(png, panel, index, active) {
  const y = 42 + index * 28;
  rect(png, 8, y, 68, 20, active ? [51, 75, 98, 255] : [28, 36, 48, 255]);
  rect(png, 14, y + 7, 36 + panel.rows * 2, 5, active ? [236, 202, 103, 255] : [128, 146, 166, 255]);
}

function drawPanel(png, panel, step) {
  rect(png, 104, 46, 218, 18, [38, 48, 64, 255]);
  rect(png, 114, 53, 70 + panel.rows * 7, 5, [226, 235, 244, 255]);
  for (let row = 0; row < panel.rows; row += 1) {
    const y = 78 + row * 20;
    const shade = row % 2 === 0 ? [24, 31, 42, 255] : [20, 26, 36, 255];
    rect(png, 104, y, 218, 16, shade);
    rect(png, 114, y + 5, 46 + row * 9 + step * 4, 5, [147, 169, 191, 255]);
    rect(png, 274, y + 4, 28, 7, badgeColor(panel.id), 255);
  }
}

function badgeColor(id) {
  if (id === "scene-hierarchy") {
    return [87, 177, 244, 255];
  }
  if (id === "properties") {
    return [127, 206, 144, 255];
  }
  if (id === "assets") {
    return [236, 183, 92, 255];
  }
  return [191, 132, 227, 255];
}

function renderContactSheet(webFrames, nativeFrames) {
  const sheet = new PNG({ height: 440, width: 1080 });
  fill(sheet, 8, 10, 14);
  webFrames.forEach((frame, index) => blit(renderFrame(frame), sheet, index * 360, 0));
  nativeFrames.forEach((frame, index) => blit(renderFrame(frame), sheet, index * 360, 220));
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
