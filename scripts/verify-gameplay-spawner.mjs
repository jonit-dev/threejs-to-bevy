import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, stepSpawners } from "../packages/runtime-web-three/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = process.argv[2] ?? resolve(root, "packages/ir/fixtures/conformance/gameplay-spawner/game.bundle");
const artifactRoot = process.argv[3] ?? resolve(root, "packages/ir/artifacts/conformance/gameplay-spawner");
const webReportPath = resolve(artifactRoot, "web-spawner.json");
const nativeReportPath = resolve(artifactRoot, "native-spawner.json");
const diffPath = resolve(artifactRoot, "spawner-diff.json");
const reportPath = resolve(artifactRoot, "verification-report.json");

await mkdir(artifactRoot, { recursive: true });

const validation = await validateBundle(fixture);
if (!validation.ok) {
  await writeReport({ diagnostics: validation.diagnostics, ok: false, reason: "fixture validation failed", status: "failed" });
  process.exitCode = 1;
} else {
  const bundle = await loadBundle(fixture);
  const web = traceWebSpawner(bundle);
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_spawner_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_spawner_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native spawner trace failed",
      status: "failed",
    });
    process.exitCode = 1;
  } else {
    const nativeJson = JSON.parse(await readFile(nativeReportPath, "utf8"));
    const diff = compareReports(web, nativeJson);
    await writeJson(diffPath, diff);
    await writeReport({
      artifacts: {
        diff: relative(diffPath),
        native: relative(nativeReportPath),
        report: relative(reportPath),
        web: relative(webReportPath),
      },
      commands: [
        { command: "validateBundle(gameplay-spawner)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_spawner_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
      ],
      ok: diff.ok,
      promoted: ["declarative Spawner component", "deterministic seeded spawn trace", "web/Bevy spawner parity"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { ordering: "stable generated spawn ids and fixed tick samples" },
    });
    if (!diff.ok) {
      process.exitCode = 1;
    }
  }
}

function traceWebSpawner(bundle) {
  const trace = [];
  for (let tick = 0; tick < 4; tick += 1) {
    trace.push(...stepSpawners(bundle.world, { fixedDelta: 0.5, prefabs: bundle.prefabs, tick }));
  }
  return {
    fixture: bundle.manifest.name,
    runtime: "web-three",
    trace: trace.map((observation) => ({
      entity: observation.entity,
      prefab: observation.prefab,
      root: observation.root,
      spawned: observation.spawned,
      tick: observation.tick,
    })),
  };
}

export function compareReports(web, native) {
  const mismatches = [];
  const left = normalize(web.trace);
  const right = normalize(native.trace);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    mismatches.push({ key: "trace", native: right, web: left });
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
  await writeJson(reportPath, {
    generatedBy: "scripts/verify-gameplay-spawner.mjs",
    prd: "docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-008-declarative-gameplay-flow-spawners-sequencer.md",
    schema: "threenative.gameplay-spawner-verification",
    ...report,
  });
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(path) {
  return path.replace(`${root}/`, "");
}
