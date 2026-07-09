import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateBundle } from "../packages/ir/dist/validate.js";
import { loadBundle, traceSequences } from "../packages/runtime-web-three/dist/index.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = process.argv[2] ?? resolve(root, "packages/ir/fixtures/conformance/sequence/game.bundle");
const artifactRoot = process.argv[3] ?? resolve(root, "packages/ir/artifacts/conformance/sequence");
const webReportPath = resolve(artifactRoot, "web-sequence.json");
const nativeReportPath = resolve(artifactRoot, "native-sequence.json");
const diffPath = resolve(artifactRoot, "sequence-diff.json");
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
    trace: traceSequences(bundle.sequences, { fixedDelta: 0.5, playByTick: { 0: ["intro"] }, ticks: 4 }),
  };
  await writeJson(webReportPath, web);

  const native = spawnSync("cargo", ["run", "-p", "threenative_runtime", "--bin", "threenative_sequence_trace", "--", fixture, nativeReportPath], {
    cwd: resolve(root, "runtime-bevy"),
    encoding: "utf8",
    timeout: 120_000,
  });

  if (native.status !== 0) {
    await writeReport({
      commands: [{ command: "cargo run -p threenative_runtime --bin threenative_sequence_trace", status: "fail", stderr: native.stderr.trim(), stdout: native.stdout.trim() }],
      ok: false,
      reason: "native Sequence trace failed",
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
        { command: "validateBundle(sequence)", status: "pass" },
        { command: "cargo run -p threenative_runtime --bin threenative_sequence_trace", status: "pass", stderr: native.stderr.trim(), stdout: native.stdout.trim() },
      ],
      ok: diff.ok,
      promoted: ["declarative Sequence timeline", "camera/event/timeScale fixed-tick sampling", "web/Bevy Sequence parity"],
      status: diff.ok ? "passed" : "failed",
      tolerance: { numeric: "values rounded to 1e-6", ordering: "active sequences sampled by id in fixed tick order" },
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
    generatedBy: "scripts/verify-sequence.mjs",
    prd: "docs/PRDs/proof-first-engine-loop-2026-07-05/PRD-008-declarative-gameplay-flow-spawners-sequencer.md",
    schema: "threenative.sequence-verification",
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
