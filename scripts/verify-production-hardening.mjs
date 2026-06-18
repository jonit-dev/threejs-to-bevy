import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";
import { packageCommand } from "../packages/cli/dist/commands/package.js";
import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceProductionHardening } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/production-hardening/game.bundle");
const targets = resolveArtifactTargets({ gate: "production-hardening", owner: { kind: "aggregate", name: "production-hardening" }, root });
const artifactRoot = targets.absoluteDir;
const webReportPath = resolve(artifactRoot, "web-report.json");
const nativeReportPath = resolve(artifactRoot, "native-report.json");
const packagePreflightPath = resolve(artifactRoot, "package-preflight.json");

await mkdir(artifactRoot, { recursive: true });

const validation = await validateBundle(fixture);
if (!validation.ok) {
  await writeReport({ diagnostics: validation.diagnostics, ok: false, reason: "fixture validation failed", status: "failed" });
  process.exitCode = 1;
} else {
  const bundle = await loadBundle(fixture);
  const web = traceProductionHardening(bundle.audio, bundle.targetProfile);
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_production_hardening_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });
  const preflight = await packageCommand(["--bundle", fixture, "--target", "mobile", "--preflight", "--json"], root);
  const packageReport = preflight.stdout.trim() === "" ? undefined : JSON.parse(preflight.stdout);
  if (packageReport !== undefined) {
    await writeJson(packagePreflightPath, packageReport);
  }

  if (native.status !== 0 || preflight.exitCode !== 0) {
    await writeReport({
      commands: [
        { command: "cargo run -p threenative_runtime --bin threenative_production_hardening_trace", status: native.status === 0 ? "pass" : "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
        { command: "tn package --preflight --target mobile", status: preflight.exitCode === 0 ? "pass" : "fail", stderr: preflight.stderr?.trim() ?? "", stdout: preflight.stdout.trim() },
      ],
      ok: false,
      reason: "production hardening trace or package preflight failed",
      status: "failed",
    });
    process.exitCode = 1;
  } else {
    const nativeJson = JSON.parse(await readFile(nativeReportPath, "utf8"));
    const diff = compareReports(web, nativeJson);
    await writeJson(resolve(artifactRoot, "diff.json"), diff);
    await writeVisualEvidence(web, nativeJson, packageReport);
    await writeReport({
      artifacts: {
        contactSheet: "tools/verify/artifacts/production-hardening/contact-sheet.png",
        diff: "tools/verify/artifacts/production-hardening/diff.json",
        native: "tools/verify/artifacts/production-hardening/native-report.json",
        packagePreflight: "tools/verify/artifacts/production-hardening/package-preflight.json",
        report: "tools/verify/artifacts/production-hardening/verification-report.json",
        web: "tools/verify/artifacts/production-hardening/web-report.json",
      },
      commands: [
        { command: "validateBundle(production-hardening)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_production_hardening_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
        { command: "tn package --preflight --target mobile", status: "pass" },
      ],
      deferred: ["raw native audio handles", "custom executable decoders", "streaming/network audio", "online services", "signed artifact generation without release credentials"],
      ok: diff.ok && packageReport?.credentials?.[0]?.code === "TN_PACKAGE_SIGNING_CREDENTIAL_REQUIRED",
      promoted: ["live mixer/effect-chain reports", "platform audio routing diagnostics", "UI audio service action", "live profiler host-state reports", "GPU timing unavailable state", "signed/mobile packaging preflight", "engine debug-render overlay report", "domain-specific repair hints"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { ordering: "stable ids" },
    });
    if (!diff.ok || packageReport?.credentials?.[0]?.code !== "TN_PACKAGE_SIGNING_CREDENTIAL_REQUIRED") {
      process.exitCode = 1;
    }
  }
}

export function compareReports(web, native) {
  const mismatches = [];
  for (const key of ["audio", "boundaries", "debug", "diagnostics", "profiler"]) {
    const left = normalize(web[key]);
    const right = normalize(native[key]);
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      mismatches.push({ key, native: right, web: left });
    }
  }
  return { mismatches, ok: mismatches.length === 0 };
}

async function writeVisualEvidence(web, native, packageReport) {
  const width = 360;
  const height = 180;
  const sheet = new PNG({ height: height * 2, width });
  fill(sheet, [13, 18, 25, 255]);
  drawFrame(sheet, 0, web, packageReport);
  drawFrame(sheet, height, native, packageReport);
  await writeFile(resolve(artifactRoot, "contact-sheet.png"), PNG.sync.write(sheet));
}

function drawFrame(png, yOffset, report, packageReport) {
  rect(png, 28, yOffset + 132 - report.audio.mixer.effects.length * 18, 42, report.audio.mixer.effects.length * 18, [34, 197, 94, 255]);
  rect(png, 96, yOffset + 48, report.debug.primitives.length * 42, 24, [59, 130, 246, 255]);
  rect(png, 96, yOffset + 94, report.diagnostics.length * 36, 20, [251, 191, 36, 255]);
  rect(png, 260, yOffset + 48, report.boundaries.length * 18, 58, [248, 113, 113, 255]);
  if (packageReport?.credentials?.[0]?.status === "missing") {
    rect(png, 260, yOffset + 124, 54, 20, [168, 85, 247, 255]);
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
  return sortKeys(JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "number" ? Math.round(item * 1_000_000) / 1_000_000 : item)));
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortKeys(item)]));
  }
  return value;
}

async function writeReport(report) {
  await writeJson(targets.reportPath, {
    generatedBy: "scripts/verify-production-hardening.mjs",
    prd: "docs/PRDs/done/other/post-v10-production-audio-diagnostics-packaging.md",
    schema: "threenative.production-hardening-verification",
    ...report,
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
