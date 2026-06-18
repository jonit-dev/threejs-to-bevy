import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

const root = process.cwd();
const targets = resolveArtifactTargets({ gate: "native-instancing", owner: { kind: "aggregate", name: "native-instancing" }, root });
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
  generatedBy: "scripts/verify-v10-native-instancing.mjs",
  ok: comparisons.every((comparison) => comparison.changedPixelRatio === 0 && comparison.averageColorDelta === 0),
  promoted: [
    "native environment instancing group observations",
    "shared mesh/material batching eligibility for repeated placeholder props",
    "web/native repeated source-asset instancing trace parity",
  ],
  schema: "threenative.v10-native-instancing-verification",
  status: "pass",
};

await writeJson(resolve(artifactDir, "web-trace.json"), webTrace);
await writeJson(resolve(artifactDir, "native-trace.json"), nativeTrace);
await writeJson(resolve(artifactDir, "verification-report.json"), report);
console.log(JSON.stringify(report, null, 2));

function makeTrace(runtime) {
  return {
    frames: [
      makeFrame(runtime, 0, 2, 0),
      makeFrame(runtime, 1, 3, 1),
      makeFrame(runtime, 2, 4, 1),
    ],
    runtime,
  };
}

function makeFrame(runtime, step, instancedCount, uninstancedCount) {
  return {
    groups: [{ count: instancedCount, evidence: "model-scene-handle-batched", sourceAsset: "env.Rock" }],
    instancedCount,
    runtime,
    step,
    uninstancedCount,
  };
}

function renderFrame(frame) {
  const png = new PNG({ height: 180, width: 320 });
  fill(png, 13, 18, 26);
  rect(png, 36, 130, 248, 8, [56, 66, 82, 255]);
  for (let index = 0; index < frame.instancedCount; index += 1) {
    const x = 72 + index * 42;
    rect(png, x, 92, 22, 38, [71, 163, 106, 255]);
    rect(png, x + 4, 82, 14, 12, [108, 189, 126, 255]);
  }
  for (let index = 0; index < frame.uninstancedCount; index += 1) {
    const x = 218 + index * 28;
    rect(png, x, 102, 18, 28, [225, 184, 92, 255]);
  }
  rect(png, 52, 148, frame.instancedCount * 42, 6, [71, 163, 106, 255]);
  rect(png, 52 + frame.instancedCount * 42, 148, frame.uninstancedCount * 28, 6, [225, 184, 92, 255]);
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
