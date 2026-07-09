import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";
import { validateBundle } from "../packages/ir/dist/validate.js";
import { SHARED_RESIDUAL_CONTRACT_ROWS } from "../packages/ir/dist/bevyCatalogResiduals.js";
import { loadBundle, traceRenderingResiduals } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/rendering-residuals/game.bundle");
const targets = resolveArtifactTargets({ gate: "rendering-residuals", owner: { kind: "aggregate", name: "rendering-residuals" }, root });
const artifactRoot = targets.absoluteDir;
const webReportPath = resolve(artifactRoot, "web-report.json");
const nativeReportPath = resolve(artifactRoot, "native-report.json");

await mkdir(artifactRoot, { recursive: true });

const validation = await validateBundle(fixture);
if (!validation.ok) {
  await writeReport({ diagnostics: validation.diagnostics, ok: false, reason: "fixture validation failed", status: "failed" });
  process.exitCode = 1;
} else {
  const bundle = await loadBundle(fixture);
  const web = traceRenderingResiduals(bundle.assets, bundle.materials, bundle.world);
  await writeJson(webReportPath, web);
  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_rendering_residuals_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_rendering_residuals_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native rendering residuals trace failed",
      status: "failed",
    });
    process.exitCode = 1;
  } else {
    const nativeJson = JSON.parse(await readFile(nativeReportPath, "utf8"));
    const diff = compareReports(web, nativeJson);
    await writeJson(resolve(artifactRoot, "diff.json"), diff);
    await writeVisualEvidence(web, nativeJson);
    await writeReport({
      artifacts: {
        contactSheet: "tools/verify/artifacts/rendering-residuals/contact-sheet.png",
        diff: "tools/verify/artifacts/rendering-residuals/diff.json",
        native: "tools/verify/artifacts/rendering-residuals/native-report.json",
        report: "tools/verify/artifacts/rendering-residuals/verification-report.json",
        web: "tools/verify/artifacts/rendering-residuals/web-report.json",
      },
      commands: [
        { command: "validateBundle(rendering-residuals)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_rendering_residuals_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
      ],
      deferred: ["runtime vertex mutation", "custom shaders", "bindless resources", "CSG", "storage-buffer geometry", "custom asset loaders", "arbitrary file/network streaming"],
      ok: diff.ok,
      promoted: ["runtime LOD selection report", "chunked terrain streaming policy", "bounded instancing policy", "specular texture proof", "extended material preset proof", "manifest asset streaming diagnostics", "advanced renderer boundary diagnostics"],
      residualContract: SHARED_RESIDUAL_CONTRACT_ROWS.filter((row) => ["geometry", "materials", "rendering", "ui-window"].includes(row.area)),
      status: diff.ok ? "passed" : "failed",
      tolerance: { ordering: "stable ids" },
    });
    if (!diff.ok) {
      process.exitCode = 1;
    }
  }
}

export function compareReports(web, native) {
  const mismatches = [];
  for (const key of ["assets", "boundaries", "diagnostics", "geometry", "instancing", "materials"]) {
    const left = normalize(web[key]);
    const right = normalize(native[key]);
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      mismatches.push({ key, native: right, web: left });
    }
  }
  return { mismatches, ok: mismatches.length === 0 };
}

async function writeVisualEvidence(web, native) {
  const width = 360;
  const height = 180;
  const sheet = new PNG({ height: height * 2, width });
  fill(sheet, [10, 16, 22, 255]);
  drawFrame(sheet, 0, web);
  drawFrame(sheet, height, native);
  await writeFile(resolve(artifactRoot, "contact-sheet.png"), PNG.sync.write(sheet));
}

function drawFrame(png, yOffset, report) {
  rect(png, 28, yOffset + 132 - report.geometry.lod.length * 48, 48, report.geometry.lod.length * 48, [34, 197, 94, 255]);
  rect(png, 96, yOffset + 48, report.materials.specular.length * 52, 24, [59, 130, 246, 255]);
  rect(png, 96, yOffset + 94, report.assets.streaming.length * 44, 20, [251, 191, 36, 255]);
  rect(png, 260, yOffset + 48, report.boundaries.length * 12, 58, [248, 113, 113, 255]);
}

function fill(png, color) {
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = color[0];
    png.data[index + 1] = color[1];
    png.data[index + 2] = color[2];
    png.data[index + 3] = color[3];
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

function normalize(value) {
  return sortKeys(JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "number" ? Math.round(item * 1_000_000) / 1_000_000 : item)));
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortKeys(item)]));
  }
  return value;
}

async function writeReport(report) {
  await writeJson(targets.reportPath, {
    generatedBy: "scripts/verify-rendering-residuals.mjs",
    prd: "docs/PRDs/done/other/post-v10-rendering-materials-geometry-residuals.md",
    schema: "threenative.rendering-residuals-verification",
    ...report,
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
