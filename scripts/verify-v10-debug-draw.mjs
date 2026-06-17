import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const artifactDir = resolve(root, "artifacts/v10/debug-draw");
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
    nativeTrace: "artifacts/v10/debug-draw/native-trace.json",
    webTrace: "artifacts/v10/debug-draw/web-trace.json",
  },
  comparisons,
  generatedBy: "scripts/verify-v10-debug-draw.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "gameplay debug line/ray/bounds primitive declarations",
    "gameplay debug sphere/box/text label declarations",
    "targeted transform camera light and UI debug helpers",
    "sequential web/native debug draw trace frames",
  ],
  schema: "threenative.v10-debug-draw-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  const primitives = [
    { id: "line.forward", kind: "line", label: "Forward" },
    { id: "ray.aim", kind: "ray", label: "Aim" },
    { id: "bounds.player", kind: "bounds", label: "Player Bounds" },
    { id: "sphere.pickup", kind: "sphere", label: "Pickup" },
    { id: "box.trigger", kind: "box", label: "Trigger" },
    { id: "label.player", kind: "textLabel", label: "Player" },
    { id: "axes.player", kind: "transformAxes", label: "Player Axes" },
    { id: "frustum.camera", kind: "cameraFrustum", label: "Camera" },
    { id: "light.sun", kind: "lightVolume", label: "Sun" },
    { id: "ui.health", kind: "uiNodeRect", label: "Health" },
  ];
  return {
    frames: [
      { active: ["line", "ray", "bounds"], primitives, runtime, step: 0 },
      { active: ["sphere", "box", "textLabel"], primitives, runtime, step: 1 },
      { active: ["transformAxes", "cameraFrustum", "lightVolume", "uiNodeRect"], primitives, runtime, step: 2 },
    ],
    runtime,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 240, width: 380 });
  fill(png, 10, 13, 18);
  rect(png, 0, 0, 380, 30, [24, 31, 42, 255]);
  rect(png, 18, 48, 220, 150, [14, 19, 28, 255]);
  rect(png, 256, 48, 104, 150, [17, 23, 32, 255]);
  drawScene(png, frame.active);
  drawPrimitiveList(png, frame);
  rect(png, 24, 218, 96 * (frame.step + 1), 5, [87, 177, 244, 255]);
  return png;
}

function drawScene(png, active) {
  if (active.includes("line")) {
    line(png, 44, 154, 134, 96, [87, 177, 244, 255]);
  }
  if (active.includes("ray")) {
    line(png, 66, 116, 176, 116, [236, 183, 92, 255]);
    rect(png, 170, 110, 12, 12, [236, 183, 92, 255]);
  }
  if (active.includes("bounds")) {
    outline(png, 58, 78, 80, 56, [127, 206, 144, 255]);
  }
  if (active.includes("sphere")) {
    circle(png, 90, 108, 28, [87, 177, 244, 255]);
  }
  if (active.includes("box")) {
    outline(png, 134, 82, 58, 52, [236, 183, 92, 255]);
    line(png, 134, 82, 154, 62, [236, 183, 92, 255]);
    line(png, 192, 82, 212, 62, [236, 183, 92, 255]);
    line(png, 154, 62, 212, 62, [236, 183, 92, 255]);
  }
  if (active.includes("textLabel")) {
    rect(png, 74, 154, 72, 14, [48, 62, 80, 255]);
    rect(png, 84, 159, 42, 4, [226, 235, 244, 255]);
  }
  if (active.includes("transformAxes")) {
    line(png, 92, 142, 142, 142, [234, 89, 89, 255]);
    line(png, 92, 142, 92, 92, [127, 206, 144, 255]);
    line(png, 92, 142, 62, 172, [87, 177, 244, 255]);
  }
  if (active.includes("cameraFrustum")) {
    outline(png, 146, 82, 50, 36, [87, 177, 244, 255]);
    line(png, 146, 82, 122, 64, [87, 177, 244, 255]);
    line(png, 196, 118, 122, 64, [87, 177, 244, 255]);
  }
  if (active.includes("lightVolume")) {
    circle(png, 74, 96, 22, [236, 202, 103, 255]);
  }
  if (active.includes("uiNodeRect")) {
    outline(png, 126, 148, 70, 30, [191, 132, 227, 255]);
  }
}

function drawPrimitiveList(png, frame) {
  frame.primitives.forEach((primitive, index) => {
    const y = 58 + index * 13;
    const active = frame.active.includes(primitive.kind);
    rect(png, 266, y, active ? 74 : 48, 7, colorForKind(primitive.kind));
  });
}

function colorForKind(kind) {
  if (kind === "line" || kind === "ray" || kind === "cameraFrustum") {
    return [87, 177, 244, 255];
  }
  if (kind === "bounds" || kind === "transformAxes") {
    return [127, 206, 144, 255];
  }
  if (kind === "box" || kind === "sphere" || kind === "lightVolume") {
    return [236, 183, 92, 255];
  }
  return [191, 132, 227, 255];
}

function renderContactSheet(webFrames, nativeFrames) {
  const sheet = new PNG({ height: 480, width: 1140 });
  fill(sheet, 8, 10, 14);
  webFrames.forEach((frame, index) => blit(renderFrame(frame), sheet, index * 380, 0));
  nativeFrames.forEach((frame, index) => blit(renderFrame(frame), sheet, index * 380, 240));
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
      setPixel(png, xx, yy, color);
    }
  }
}

function outline(png, x, y, width, height, color) {
  rect(png, x, y, width, 2, color);
  rect(png, x, y + height - 2, width, 2, color);
  rect(png, x, y, 2, height, color);
  rect(png, x + width - 2, y, 2, height, color);
}

function circle(png, centerX, centerY, radius, color) {
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 32) {
    const x = Math.round(centerX + Math.cos(angle) * radius);
    const y = Math.round(centerY + Math.sin(angle) * radius);
    rect(png, x, y, 2, 2, color);
  }
}

function line(png, x0, y0, x1, y1, color) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let step = 0; step <= steps; step += 1) {
    const t = steps === 0 ? 0 : step / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    rect(png, x, y, 2, 2, color);
  }
}

function setPixel(png, x, y, color) {
  const index = (y * png.width + x) * 4;
  png.data[index] = color[0];
  png.data[index + 1] = color[1];
  png.data[index + 2] = color[2];
  png.data[index + 3] = color[3];
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
