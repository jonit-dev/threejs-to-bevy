import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceRuntimePrefabsHierarchy } from "../packages/runtime-web-three/dist/index.js";
import { resolveArtifactTargets } from "./artifact-paths.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = resolve(root, "packages/ir/fixtures/conformance/runtime-prefabs-hierarchy/game.bundle");
const targets = resolveArtifactTargets({ gate: "runtime-prefabs-hierarchy", owner: { kind: "aggregate", name: "runtime-prefabs-hierarchy" }, root });
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
  const web = await traceRuntimePrefabsHierarchy(bundle.world, bundle.systems, bundle.prefabs, {
    bundlePath: fixture,
    manifest: bundle.manifest
  });
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_runtime_prefabs_hierarchy_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_runtime_prefabs_hierarchy_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native runtime prefabs hierarchy trace failed",
      status: "failed",
    });
    process.exitCode = 1;
  } else {
    const nativeJson = JSON.parse(await readFile(nativeReportPath, "utf8"));
    const diff = compareReports(web, nativeJson);
    await writeJson(resolve(artifactRoot, "diff.json"), diff);
    await writeReport({
      artifacts: {
        diff: "tools/verify/artifacts/runtime-prefabs-hierarchy/diff.json",
        native: "tools/verify/artifacts/runtime-prefabs-hierarchy/native-report.json",
        report: "tools/verify/artifacts/runtime-prefabs-hierarchy/verification-report.json",
        web: "tools/verify/artifacts/runtime-prefabs-hierarchy/web-report.json"
      },
      commands: [
        { command: "validateBundle(runtime-prefabs-hierarchy)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_runtime_prefabs_hierarchy_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() }
      ],
      deferred: ["runtime-generated IDs without caller prefix", "backend renderer handles", "cross-scene ownership policies"],
      ok: diff.ok,
      promoted: ["runtime prefab instantiation", "script hierarchy parent commands", "web/Bevy hierarchy parity"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { ordering: "stable entity ids sorted lexicographically" }
    });
    if (!diff.ok) {
      process.exitCode = 1;
    }
  }
}

export function compareReports(web, native) {
  const mismatches = [];
  const left = normalize(web.entities);
  const right = normalize(native.entities);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    mismatches.push({ key: "entities", native: right, web: left });
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
    generatedBy: "scripts/verify-runtime-prefabs-hierarchy.mjs",
    prd: "docs/PRDs/done/other/portable-scripting-runtime-prefabs-hierarchy.md",
    schema: "threenative.runtime-prefabs-hierarchy-verification",
    ...report
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
