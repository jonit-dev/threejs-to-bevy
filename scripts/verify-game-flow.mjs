import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceGameFlow } from "../packages/runtime-web-three/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = process.argv[2] ?? resolve(root, "packages/ir/fixtures/conformance/game-flow/game.bundle");
const artifactRoot = process.argv[3] ?? resolve(root, "packages/ir/artifacts/conformance/game-flow");
const webReportPath = resolve(artifactRoot, "web-game-flow.json");
const nativeReportPath = resolve(artifactRoot, "native-game-flow.json");
const diffPath = resolve(artifactRoot, "game-flow-diff.json");
const reportPath = resolve(artifactRoot, "verification-report.json");

await mkdir(artifactRoot, { recursive: true });

const validation = await validateBundle(fixture);
if (!validation.ok) {
  await writeReport({ diagnostics: validation.diagnostics, ok: false, reason: "fixture validation failed", status: "failed" });
  process.exitCode = 1;
} else {
  const bundle = await loadBundle(fixture);
  const web = {
    fixture: bundle.manifest.name,
    runtime: "web-three",
    trace: traceGameFlow(bundle.gameFlow, { eventsByTick: { 1: ["start"] }, fixedDelta: 0.5, resources: { coins: 0 }, ticks: 5 }),
  };
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_game_flow_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_game_flow_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native GameFlow trace failed",
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
        { command: "validateBundle(game-flow)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_game_flow_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
      ],
      ok: diff.ok,
      promoted: ["declarative GameFlow state timeline", "entry and transition actions", "web/Bevy GameFlow parity"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { ordering: "single flow sampled in fixed tick order" },
    });
    if (!diff.ok) {
      process.exitCode = 1;
    }
  }
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
    generatedBy: "scripts/verify-game-flow.mjs",
    prd: "docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-008-declarative-gameplay-flow-spawners-sequencer.md",
    schema: "threenative.game-flow-verification",
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
