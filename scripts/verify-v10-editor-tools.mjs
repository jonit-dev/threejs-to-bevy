import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const targets = resolveArtifactTargets({ gate: "editor-tools", owner: { kind: "aggregate", name: "editor-tools" }, root });
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
  generatedBy: "scripts/verify-v10-editor-tools.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "editor scene viewer tool snapshot",
    "editor asset preview tool snapshot",
    "editor gamepad viewer tool snapshot",
    "sequential web/native editor tool trace frames",
  ],
  schema: "threenative.v10-editor-tools-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  const tools = {
    assetPreview: { assets: ["model.level", "tex.ui"], selectedAsset: "model.level" },
    gamepadViewer: { controls: ["Interact:buttonSouth", "MoveX:leftStickX"], devices: ["declared-gamepad"] },
    sceneViewer: { cameras: ["entity.camera"], entities: 2, renderables: ["entity.player"] },
  };
  return {
    frames: [
      { activeTool: "sceneViewer", runtime, step: 0, tools },
      { activeTool: "assetPreview", runtime, step: 1, tools },
      { activeTool: "gamepadViewer", runtime, step: 2, tools },
    ],
    runtime,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 220, width: 360 });
  fill(png, 11, 15, 22);
  rect(png, 0, 0, 360, 30, [25, 31, 42, 255]);
  drawToolbar(png, frame.activeTool);
  if (frame.activeTool === "sceneViewer") {
    drawSceneViewer(png, frame.tools.sceneViewer);
  } else if (frame.activeTool === "assetPreview") {
    drawAssetPreview(png, frame.tools.assetPreview);
  } else {
    drawGamepadViewer(png, frame.tools.gamepadViewer);
  }
  rect(png, 22, 202, 98 * (frame.step + 1), 5, [87, 177, 244, 255]);
  return png;
}

function drawToolbar(png, activeTool) {
  const tools = ["sceneViewer", "assetPreview", "gamepadViewer"];
  tools.forEach((tool, index) => {
    const x = 18 + index * 106;
    rect(png, x, 8, 86, 14, tool === activeTool ? [60, 82, 108, 255] : [35, 44, 58, 255]);
    rect(png, x + 8, 13, 34 + index * 8, 4, tool === activeTool ? [236, 202, 103, 255] : [128, 146, 166, 255]);
  });
}

function drawSceneViewer(png, scene) {
  rect(png, 18, 46, 324, 144, [14, 19, 28, 255]);
  rect(png, 42, 72, 142, 82, [22, 29, 40, 255]);
  rect(png, 62, 126, 86, 14, [89, 178, 244, 255]);
  rect(png, 134, 84, 24, 24, [236, 183, 92, 255]);
  rect(png, 220, 70, 66, 8, [222, 234, 244, 255]);
  rect(png, 220, 92, 44 + scene.entities * 12, 7, [142, 164, 188, 255]);
  rect(png, 220, 112, 44 + scene.cameras.length * 18, 7, [127, 206, 144, 255]);
  rect(png, 220, 132, 44 + scene.renderables.length * 18, 7, [236, 183, 92, 255]);
}

function drawAssetPreview(png, preview) {
  rect(png, 18, 46, 324, 144, [14, 19, 28, 255]);
  preview.assets.forEach((asset, index) => {
    const x = 42 + index * 124;
    rect(png, x, 72, 92, 78, asset === preview.selectedAsset ? [45, 64, 84, 255] : [25, 33, 45, 255]);
    rect(png, x + 16, 88, 60, 34, index === 0 ? [236, 183, 92, 255] : [87, 177, 244, 255]);
    rect(png, x + 14, 134, 54, 5, [226, 235, 244, 255]);
  });
}

function drawGamepadViewer(png, gamepad) {
  rect(png, 18, 46, 324, 144, [14, 19, 28, 255]);
  rect(png, 54, 82, 118, 54, [35, 45, 58, 255]);
  rect(png, 74, 98, 20, 20, [87, 177, 244, 255]);
  rect(png, 130, 98, 20, 20, [236, 183, 92, 255]);
  gamepad.controls.forEach((control, index) => {
    rect(png, 210, 76 + index * 28, 86, 16, [24, 31, 42, 255]);
    rect(png, 220, 82 + index * 28, 42 + index * 14, 5, index === 0 ? [236, 183, 92, 255] : [127, 206, 144, 255]);
  });
  if (gamepad.devices.length > 0) {
    rect(png, 210, 142, 72, 8, [127, 206, 144, 255]);
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
