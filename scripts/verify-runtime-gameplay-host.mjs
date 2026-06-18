import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceRuntimeGameplayHost } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/runtime-gameplay-host/game.bundle");
const targets = resolveArtifactTargets({ gate: "runtime-gameplay-host", owner: { kind: "aggregate", name: "runtime-gameplay-host" }, root });
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
  const web = traceRuntimeGameplayHost(bundle.world, bundle.systems);
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_runtime_gameplay_host_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_runtime_gameplay_host_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native runtime gameplay host trace failed",
      status: "failed",
    });
    process.exitCode = 1;
  } else {
    const nativeJson = JSON.parse(await readFile(nativeReportPath, "utf8"));
    const diff = compareReports(web, nativeJson);
    await writeJson(resolve(artifactRoot, "diff.json"), diff);
    await writeReport({
      artifacts: {
        diff: "tools/verify/artifacts/runtime-gameplay-host/diff.json",
        native: "tools/verify/artifacts/runtime-gameplay-host/native-report.json",
        report: "tools/verify/artifacts/runtime-gameplay-host/verification-report.json",
        web: "tools/verify/artifacts/runtime-gameplay-host/web-report.json",
      },
      commands: [
        { command: "validateBundle(runtime-gameplay-host)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_runtime_gameplay_host_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
      ],
      deferred: ["dynamic runtime plugin loading", "raw Bevy/renderer handles in portable APIs", "arbitrary workers", "unbounded promises"],
      ok: diff.ok,
      promoted: ["live rendered-entity reconciliation", "event windows", "state handoff", "command-time/removal hooks", "system-local evidence", "stoppable observer propagation", "bounded timer/channel semantics"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { ordering: "stable ids and sorted diagnostics" },
    });
    if (!diff.ok) {
      process.exitCode = 1;
    }
  }
}

export function compareReports(web, native) {
  const mismatches = [];
  for (const key of ["async", "boundaries", "diagnostics", "eventWindows", "hooks", "lifecycle", "observers", "reconciliation"]) {
    const left = normalize(web[key]);
    const right = normalize(native[key]);
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      mismatches.push({ key, native: right, web: left });
    }
  }
  return { mismatches, ok: mismatches.length === 0 };
}

function normalize(value) {
  return sortKeys(JSON.parse(JSON.stringify(value)));
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
    generatedBy: "scripts/verify-runtime-gameplay-host.mjs",
    prd: "docs/PRDs/other/post-v10-runtime-gameplay-host.md",
    schema: "threenative.runtime-gameplay-host-verification",
    ...report,
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
