import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";
import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, tracePersistenceReload } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/persistence-reload/game.bundle");
const targets = resolveArtifactTargets({ gate: "persistence-reload", owner: { kind: "aggregate", name: "persistence-reload" }, root });
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
  const web = tracePersistenceReload(bundle.localData, bundle.world);
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_persistence_reload_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_persistence_reload_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native persistence/reload trace failed",
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
        contactSheet: "tools/verify/artifacts/persistence-reload/contact-sheet.png",
        diff: "tools/verify/artifacts/persistence-reload/diff.json",
        native: "tools/verify/artifacts/persistence-reload/native-report.json",
        report: "tools/verify/artifacts/persistence-reload/verification-report.json",
        web: "tools/verify/artifacts/persistence-reload/web-report.json",
      },
      commands: [
        { command: "validateBundle(persistence-reload)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_persistence_reload_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
      ],
      deferred: ["cloud save", "account-bound storage", "arbitrary portable filesystem APIs", "worker/timer/platform script APIs"],
      ok: diff.ok,
      promoted: ["durable native save/settings report", "autosave checkpoint restore", "migration diagnostics", "state-preserving reload policy", "live retained-state mutation proof"],
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
  for (const key of ["boundaries", "diagnostics", "persistence", "reload"]) {
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
  fill(sheet, [12, 17, 23, 255]);
  drawFrame(sheet, 0, web);
  drawFrame(sheet, height, native);
  await writeFile(resolve(artifactRoot, "contact-sheet.png"), PNG.sync.write(sheet));
}

function drawFrame(png, yOffset, report) {
  const level = Number(report.persistence.restore.resourceValue ?? 0);
  rect(png, 32, yOffset + 132 - level * 12, 36, level * 12, [34, 197, 94, 255]);
  rect(png, 92, yOffset + 48, report.persistence.autosave.length * 48, 22, [59, 130, 246, 255]);
  rect(png, 92, yOffset + 92, report.reload.retained.length * 28, 18, [251, 191, 36, 255]);
  rect(png, 244, yOffset + 48, report.diagnostics.length * 24 || 8, 54, [248, 113, 113, 255]);
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
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortKeys(item)]));
  }
  return value;
}

async function writeReport(report) {
  await writeJson(targets.reportPath, {
    generatedBy: "scripts/verify-persistence-reload.mjs",
    prd: "docs/PRDs/other/post-v10-persistence-hot-reload.md",
    schema: "threenative.persistence-reload-verification",
    ...report,
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
