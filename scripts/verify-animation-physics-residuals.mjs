import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";
import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceAnimationPhysicsResiduals } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/animation-physics-residuals/game.bundle");
const targets = resolveArtifactTargets({ gate: "animation-physics-residuals", owner: { kind: "aggregate", name: "animation-physics-residuals" }, root });
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
  const web = traceAnimationPhysicsResiduals(bundle.assets, bundle.world, bundle.animations);
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_animation_physics_residuals_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_animation_physics_residuals_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native residual trace failed",
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
        contactSheet: "tools/verify/artifacts/animation-physics-residuals/contact-sheet.png",
        diff: "tools/verify/artifacts/animation-physics-residuals/diff.json",
        native: "tools/verify/artifacts/animation-physics-residuals/native-report.json",
        report: "tools/verify/artifacts/animation-physics-residuals/verification-report.json",
        web: "tools/verify/artifacts/animation-physics-residuals/web-report.json",
      },
      commands: [
        { command: "validateBundle(animation-physics-residuals)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_animation_physics_residuals_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
      ],
      deferred: ["IK", "retargeting", "vehicles", "soft bodies", "ragdolls", "public backend physics/nav handles"],
      ok: diff.ok,
      promoted: ["animation masks", "morph target animation", "UI/property transform animation", "sloped mesh grounding", "bounded dynamic navmesh rebake", "off-mesh links", "small crowd steering"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { numeric: 0.000001, ordering: "stable ids" },
    });
    if (!diff.ok) {
      process.exitCode = 1;
    }
  }
}

function compareReports(web, native) {
  const mismatches = [];
  for (const key of ["animation", "physics", "navigation"]) {
    const left = normalize(web[key]);
    const right = normalize(native[key]);
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      mismatches.push({ key, native: right, web: left });
    }
  }
  return { mismatches, ok: mismatches.length === 0 };
}

async function writeVisualEvidence(web, native) {
  const width = 320;
  const height = 180;
  const sheet = new PNG({ height: height * 2, width });
  fill(sheet, [14, 18, 24, 255]);
  drawResidualFrame(sheet, 0, web.animation.morphTargets[0]?.weight ?? 0, web.physics.characterGrounding[0]?.resolved ?? [0, 0, 0], web.navigation.crowd);
  drawResidualFrame(sheet, height, native.animation.morphTargets[0]?.weight ?? 0, native.physics.characterGrounding[0]?.resolved ?? [0, 0, 0], native.navigation.crowd);
  await writeFile(resolve(artifactRoot, "contact-sheet.png"), PNG.sync.write(sheet));
}

function drawResidualFrame(png, yOffset, morphWeight, resolved, crowd) {
  rect(png, 24, yOffset + 132, 192, 8, [68, 96, 72, 255]);
  const rampX = 120;
  for (let x = 0; x < 96; x += 1) {
    const y = Math.round(yOffset + 132 - x * 0.25);
    rect(png, rampX + x, y, 1, 6, [104, 132, 84, 255]);
  }
  rect(png, 48 + Math.round(resolved[0] * 36), yOffset + 132 - Math.round(resolved[1] * 36), 16, 28, [96, 165, 250, 255]);
  rect(png, 248, yOffset + 48, 36, Math.max(2, Math.round(morphWeight * 72)), [244, 114, 182, 255]);
  for (const [index, agent] of (crowd ?? []).entries()) {
    rect(png, 236 + Math.round(agent.position[0] * 32), yOffset + 132 + index * 10, 8, 8, [251, 191, 36, 255]);
  }
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
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "number" ? Math.round(item * 1_000_000) / 1_000_000 : item));
}

async function writeReport(report) {
  await writeJson(targets.reportPath, {
    generatedBy: "scripts/verify-animation-physics-residuals.mjs",
    prd: "docs/PRDs/done/other/post-v10-animation-physics-navigation-residuals.md",
    schema: "threenative.animation-physics-residuals-verification",
    ...report,
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
