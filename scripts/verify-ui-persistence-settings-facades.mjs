import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceUiPersistenceSettingsFacades } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/ui-persistence-settings-facades/game.bundle");
const targets = resolveArtifactTargets({ gate: "ui-persistence-settings-facades", owner: { kind: "aggregate", name: "ui-persistence-settings-facades" }, root });
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
  const web = await traceUiPersistenceSettingsFacades(bundle.world, bundle.systems, {
    bundlePath: fixture,
    localData: bundle.localData,
    manifest: bundle.manifest,
    ui: bundle.ui
  });
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_ui_persistence_settings_facades_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_ui_persistence_settings_facades_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native UI persistence settings facade trace failed",
      status: "failed",
    });
    process.exitCode = 1;
  } else {
    const nativeJson = JSON.parse(await readFile(nativeReportPath, "utf8"));
    const diff = compareReports(web, nativeJson);
    await writeJson(resolve(artifactRoot, "diff.json"), diff);
    await writeReport({
      artifacts: {
        diff: "tools/verify/artifacts/ui-persistence-settings-facades/diff.json",
        native: "tools/verify/artifacts/ui-persistence-settings-facades/native-report.json",
        report: "tools/verify/artifacts/ui-persistence-settings-facades/verification-report.json",
        web: "tools/verify/artifacts/ui-persistence-settings-facades/web-report.json"
      },
      commands: [
        { command: "validateBundle(ui-persistence-settings-facades)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_ui_persistence_settings_facades_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() }
      ],
      deferred: ["durable host storage paths", "cloud saves", "raw DOM/native widget handles"],
      ok: diff.ok,
      promoted: ["script UI facade", "script persistence facade", "script settings facade", "web/Bevy logical facade parity"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { ordering: "stable service order and sorted slot IDs" }
    });
    if (!diff.ok) {
      process.exitCode = 1;
    }
  }
}

export function compareReports(web, native) {
  const mismatches = [];
  const left = normalize(web.facadeReport);
  const right = normalize(native.facadeReport);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    mismatches.push({ key: "facadeReport", native: right, web: left });
  }
  return { mismatches, ok: mismatches.length === 0 };
}

function normalize(value) {
  return sortKeys(JSON.parse(JSON.stringify(value)));
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
    generatedBy: "scripts/verify-ui-persistence-settings-facades.mjs",
    prd: "docs/PRDs/done/other/portable-scripting-ui-persistence-settings-facades.md",
    schema: "threenative.ui-persistence-settings-facades-verification",
    ...report
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
