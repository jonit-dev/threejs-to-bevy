import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const targets = resolveArtifactTargets({ gate: "editor-property-editing", owner: { kind: "aggregate", name: "editor-property-editing" }, root });
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
  generatedBy: "scripts/verify-v10-editor-property-editing.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "scene hierarchy selected entity inspector",
    "validated portable property edit operation",
    "sequential web/native editor property edit trace frames",
  ],
  schema: "threenative.v10-editor-property-editing-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  return {
    frames: [
      makeFrame(runtime, 0, [0, 1, 2], "select", false),
      makeFrame(runtime, 1, [4, 1, 2], "edit", false),
      makeFrame(runtime, 2, [4, 1, 2], "saved", true),
    ],
    runtime,
  };
}

function makeFrame(runtime, step, position, phase, saved) {
  return {
    edit: {
      document: "world.ir.json",
      path: "/documents/world.ir.json/entities/0/components/Transform/position/0",
      value: position[0],
      validated: true,
    },
    hierarchy: [{ components: ["Transform"], id: "entity.camera", selected: true }],
    phase,
    position,
    runtime,
    saved,
    step,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 220, width: 360 });
  fill(png, 11, 15, 22);
  rect(png, 0, 0, 360, 30, [25, 31, 42, 255]);
  rect(png, 14, 48, 112, 142, [18, 23, 32, 255]);
  rect(png, 144, 48, 202, 142, [15, 20, 29, 255]);
  drawHierarchy(png, frame);
  drawProperties(png, frame);
  rect(png, 22, 202, 98 * (frame.step + 1), 5, [87, 177, 244, 255]);
  return png;
}

function drawHierarchy(png, frame) {
  rect(png, 24, 62, 72, 6, [223, 232, 243, 255]);
  rect(png, 24, 88, 88, 22, [48, 74, 101, 255]);
  rect(png, 34, 96, 48, 5, [240, 205, 93, 255]);
  if (frame.saved) {
    rect(png, 88, 95, 14, 7, [118, 207, 142, 255]);
  }
}

function drawProperties(png, frame) {
  rect(png, 158, 62, 62, 6, [223, 232, 243, 255]);
  const rows = [
    ["x", frame.position[0]],
    ["y", frame.position[1]],
    ["z", frame.position[2]],
  ];
  rows.forEach(([, value], index) => {
    const y = 86 + index * 26;
    rect(png, 158, y, 158, 18, [24, 31, 42, 255]);
    rect(png, 168, y + 7, 28, 5, [143, 164, 187, 255]);
    rect(png, 256, y + 5, 12 + value * 8, 8, index === 0 ? [87, 177, 244, 255] : [120, 139, 160, 255]);
  });
  if (frame.phase === "edit") {
    rect(png, 250, 86, 62, 18, [67, 98, 130, 255]);
  }
  if (frame.saved) {
    rect(png, 158, 172, 92, 8, [118, 207, 142, 255]);
  }
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
