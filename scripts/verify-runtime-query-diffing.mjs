import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceRuntimeQueryDiffing } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/runtime-query-diffing/game.bundle");
const targets = resolveArtifactTargets({ gate: "runtime-query-diffing", owner: { kind: "aggregate", name: "runtime-query-diffing" }, root });
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
  const web = await traceRuntimeQueryDiffing(bundle.world, bundle.systems, { bundlePath: fixture, manifest: bundle.manifest });
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_runtime_query_diffing_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_runtime_query_diffing_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native runtime query diffing trace failed",
      status: "failed",
    });
    process.exitCode = 1;
  } else {
    const nativeJson = JSON.parse(await readFile(nativeReportPath, "utf8"));
    const diff = compareReports(web, nativeJson);
    await writeJson(resolve(artifactRoot, "diff.json"), diff);
    await writeReport({
      artifacts: {
        diff: "tools/verify/artifacts/runtime-query-diffing/diff.json",
        native: "tools/verify/artifacts/runtime-query-diffing/native-report.json",
        report: "tools/verify/artifacts/runtime-query-diffing/verification-report.json",
        web: "tools/verify/artifacts/runtime-query-diffing/web-report.json"
      },
      commands: [
        { command: "validateBundle(runtime-query-diffing)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_runtime_query_diffing_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() }
      ],
      deferred: ["deep-path changed selectors", "wildcard changed selectors", "backend handle diffing"],
      ok: diff.ok,
      promoted: ["hidden runtime changed-query diffing", "deterministic changed filtering before order/offset/limit", "web/Bevy component snapshot parity"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { ordering: "stable ids and sorted changed component names" }
    });
    if (!diff.ok) {
      process.exitCode = 1;
    }
  }
}

export function compareReports(web, native) {
  const mismatches = [];
  const left = normalize(web.changedQuery);
  const right = normalize(native.changedQuery);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    mismatches.push({ key: "changedQuery", native: right, web: left });
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
    generatedBy: "scripts/verify-runtime-query-diffing.mjs",
    prd: "docs/PRDs/done/other/portable-scripting-runtime-query-diffing.md",
    schema: "threenative.runtime-query-diffing-verification",
    ...report
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
