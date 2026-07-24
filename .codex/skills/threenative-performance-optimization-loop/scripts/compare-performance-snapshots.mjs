#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const args = parseArgs(process.argv.slice(2));
const target = args.target ?? "both";
const targetFps = finitePositive(args["target-fps"] ?? "60", "--target-fps");
const minimumSamples = finitePositiveInteger(args["min-samples"] ?? "120", "--min-samples");
const budgetMs = 1000 / targetFps;
const jsonOutput = args.json === true;
const requested = target === "both" ? ["web", "native"] : [target];

if (!["both", "web", "native"].includes(target)) {
  fail("--target must be one of both, web, or native.");
}

const report = {
  schema: "threenative.performance-comparison",
  version: "0.1.0",
  target,
  targetFps,
  minimumSamples,
  p95BudgetMs: budgetMs,
  status: "pass",
  targets: {},
};

if (requested.includes("web")) {
  requirePair(args, "before-web-proof", "after-web-proof");
  const before = summarizeWebProof(args["before-web-proof"]);
  const after = summarizeWebProof(args["after-web-proof"]);
  requireSamples("Web baseline", before);
  requireSamples("Web follow-up", after);
  report.targets.web = comparison("web", before, after, budgetMs);
}

if (requested.includes("native")) {
  requirePair(args, "before-native-samples", "after-native-samples");
  const before = summarizeNativeSamples(args["before-native-samples"]);
  const after = summarizeNativeSamples(args["after-native-samples"]);
  requireSamples("Native baseline", before);
  requireSamples("Native follow-up", after);
  report.targets.native = comparison("native", before, after, budgetMs);
}

if (args["before-web-trace"] !== undefined || args["after-web-trace"] !== undefined) {
  requirePair(args, "before-web-trace", "after-web-trace");
  report.webTrace = compareTraces(args["before-web-trace"], args["after-web-trace"]);
}

report.status = Object.values(report.targets).every((value) => value.pass) ? "pass" : "fail";

if (typeof args.out === "string") {
  const outputPath = resolve(args.out);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printText(report);
}
process.exitCode = report.status === "pass" ? 0 : 1;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail(`Unexpected argument '${token}'.`);
    const name = token.slice(2);
    if (name === "json") {
      result.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail(`Missing value for '${token}'.`);
    result[name] = value;
    index += 1;
  }
  return result;
}

function requirePair(values, beforeName, afterName) {
  if (typeof values[beforeName] !== "string" || typeof values[afterName] !== "string") {
    fail(`--${beforeName} and --${afterName} are required for target '${target}'.`);
  }
}

function finitePositive(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) fail(`${name} must be a positive number.`);
  return parsed;
}

function finitePositiveInteger(value, name) {
  const parsed = finitePositive(value, name);
  if (!Number.isInteger(parsed)) fail(`${name} must be an integer.`);
  return parsed;
}

function requireSamples(label, summary) {
  if (summary.sampleCount < minimumSamples) {
    fail(`${label} has ${summary.sampleCount} measured samples; at least ${minimumSamples} are required.`);
  }
}

function readJson(path) {
  const buffer = readFileSync(path);
  const decoded = extname(path) === ".gz" ? gunzipSync(buffer) : buffer;
  return JSON.parse(decoded.toString("utf8"));
}

function summarizeWebProof(path) {
  const root = readJson(path);
  const proof = root.report ?? root;
  const metric = proof.metrics?.frameTimeMs;
  if (metric?.status !== "measured" || !isRecord(metric.value)) {
    fail(`Web proof '${path}' does not contain measured frameTimeMs.`);
  }
  const frame = metric.value;
  return {
    artifact: resolve(path),
    sampleCount: number(frame.sampleCount, "frameTimeMs.sampleCount", path),
    p50Ms: number(frame.p50, "frameTimeMs.p50", path),
    p95Ms: number(frame.p95, "frameTimeMs.p95", path),
    p99Ms: number(frame.p99, "frameTimeMs.p99", path),
    window: "performance-proof",
  };
}

function summarizeNativeSamples(path) {
  const root = readJson(path);
  const samples = Array.isArray(root)
    ? root
    : root.samples ?? root.frames ?? root.frameSamples ?? [];
  if (!Array.isArray(samples)) fail(`Native samples '${path}' do not contain a sample array.`);
  const measured = samples
    .map((sample) => ({ frameMs: frameMsOf(sample), tick: finite(sample?.tick) }))
    .filter((sample) => sample.frameMs !== undefined);
  if (measured.length === 0) fail(`Native samples '${path}' contain no frame timing values.`);

  const afterTick20 = measured.filter((sample) => sample.tick !== undefined && sample.tick > 20);
  const selected = afterTick20.length > 0 ? afterTick20 : measured.slice(1);
  if (selected.length === 0) fail(`Native samples '${path}' contain no steady-state samples.`);
  const values = selected.map((sample) => sample.frameMs).sort((a, b) => a - b);
  return {
    artifact: resolve(path),
    sampleCount: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    window: afterTick20.length > 0 ? "after-tick-20" : "drop-first-fallback",
  };
}

function comparison(name, before, after, limit) {
  return {
    before: withFps(before),
    after: withFps(after),
    delta: {
      p50Ms: after.p50Ms - before.p50Ms,
      p95Ms: after.p95Ms - before.p95Ms,
      p95Percent: percentChange(before.p95Ms, after.p95Ms),
      p99Ms: after.p99Ms - before.p99Ms,
    },
    pass: after.p95Ms <= limit,
    target: name,
  };
}

function withFps(summary) {
  return {
    ...summary,
    p50Fps: fps(summary.p50Ms),
    p95Fps: fps(summary.p95Ms),
    p99Fps: fps(summary.p99Ms),
  };
}

function compareTraces(beforePath, afterPath) {
  const before = summarizeTrace(beforePath);
  const after = summarizeTrace(afterPath);
  const keys = new Set([...before.functions.keys(), ...after.functions.keys()]);
  const functions = [...keys].map((key) => {
    const previous = before.functions.get(key) ?? { inclusiveMsPer10s: 0, selfMsPer10s: 0 };
    const current = after.functions.get(key) ?? { inclusiveMsPer10s: 0, selfMsPer10s: 0 };
    const [name, url] = key.split("\t");
    return {
      name: name || "(anonymous)",
      url,
      beforeSelfMsPer10s: previous.selfMsPer10s,
      afterSelfMsPer10s: current.selfMsPer10s,
      selfDeltaMsPer10s: current.selfMsPer10s - previous.selfMsPer10s,
      beforeInclusiveMsPer10s: previous.inclusiveMsPer10s,
      afterInclusiveMsPer10s: current.inclusiveMsPer10s,
      inclusiveDeltaMsPer10s: current.inclusiveMsPer10s - previous.inclusiveMsPer10s,
    };
  }).filter((entry) => entry.url.length > 0);
  return {
    before: { artifact: resolve(beforePath), profileSeconds: before.profileSeconds },
    after: { artifact: resolve(afterPath), profileSeconds: after.profileSeconds },
    largestSelfImprovements: functions.toSorted((left, right) => left.selfDeltaMsPer10s - right.selfDeltaMsPer10s).slice(0, 15),
    largestSelfRegressions: functions.toSorted((left, right) => right.selfDeltaMsPer10s - left.selfDeltaMsPer10s).slice(0, 15),
  };
}

function summarizeTrace(path) {
  const trace = readJson(path);
  if (!Array.isArray(trace.traceEvents)) fail(`Trace '${path}' has no traceEvents array.`);
  const groups = new Map();
  for (const event of trace.traceEvents) {
    const profile = event.name === "ProfileChunk" && event.args?.data?.cpuProfile;
    if (!profile) continue;
    const key = `${event.pid}:${event.tid}`;
    const group = groups.get(key) ?? { deltas: [], nodes: new Map(), samples: [] };
    for (const node of profile.nodes ?? []) group.nodes.set(node.id, node);
    group.samples.push(...(profile.samples ?? []));
    group.deltas.push(...(event.args.data.timeDeltas ?? []));
    groups.set(key, group);
  }
  if (groups.size === 0) fail(`Trace '${path}' has no CPU ProfileChunk events.`);

  const analyzed = [...groups.values()].map(analyzeProfileGroup);
  const group = analyzed.toSorted((left, right) => right.applicationUs - left.applicationUs)[0];
  if (group.totalUs <= 0) fail(`Trace '${path}' has an empty CPU profile.`);
  const functions = new Map();
  for (const key of new Set([...group.self.keys(), ...group.inclusive.keys()])) {
    functions.set(key, {
      selfMsPer10s: ((group.self.get(key) ?? 0) / group.totalUs) * 10_000,
      inclusiveMsPer10s: ((group.inclusive.get(key) ?? 0) / group.totalUs) * 10_000,
    });
  }
  return { functions, profileSeconds: group.totalUs / 1_000_000 };
}

function analyzeProfileGroup(group) {
  let totalUs = 0;
  let applicationUs = 0;
  const self = new Map();
  const inclusive = new Map();
  for (let index = 0; index < group.samples.length; index += 1) {
    const delta = finite(group.deltas[index]) ?? 0;
    const sampled = group.nodes.get(group.samples[index]);
    totalUs += delta;
    if (!sampled) continue;
    const sampledKey = nodeKey(sampled);
    self.set(sampledKey, (self.get(sampledKey) ?? 0) + delta);
    if (isApplicationUrl(sampled.callFrame?.url)) applicationUs += delta;
    const seen = new Set();
    let current = sampled;
    while (current) {
      const key = nodeKey(current);
      if (!seen.has(key)) {
        inclusive.set(key, (inclusive.get(key) ?? 0) + delta);
        seen.add(key);
      }
      current = group.nodes.get(current.parent);
    }
  }
  return { applicationUs, inclusive, self, totalUs };
}

function nodeKey(node) {
  return `${node.callFrame?.functionName ?? "?"}\t${normalizeUrl(node.callFrame?.url ?? "")}`;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    return url.pathname;
  } catch {
    return value.replace(/[?#].*$/, "");
  }
}

function isApplicationUrl(value) {
  return typeof value === "string" && (/127\.0\.0\.1|localhost/.test(value));
}

function frameMsOf(sample) {
  const direct = finite(sample?.frameMs);
  if (direct !== undefined) return direct;
  const sampleFps = finite(sample?.fps);
  return sampleFps !== undefined && sampleFps > 0 ? 1000 / sampleFps : undefined;
}

function percentile(sorted, fraction) {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function fps(frameMs) {
  return frameMs > 0 ? 1000 / frameMs : null;
}

function percentChange(before, after) {
  return before === 0 ? null : ((after - before) / before) * 100;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function number(value, field, path) {
  const result = finite(value);
  if (result === undefined) fail(`'${path}' has invalid ${field}.`);
  return result;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function printText(value) {
  console.log(`status: ${value.status}`);
  console.log(`target: ${value.target}`);
  console.log(`targetFps: ${value.targetFps}`);
  console.log(`minimumSamples: ${value.minimumSamples}`);
  console.log(`p95BudgetMs: ${value.p95BudgetMs.toFixed(3)}`);
  for (const [name, result] of Object.entries(value.targets)) {
    console.log(`${name}: ${result.pass ? "pass" : "fail"}`);
    console.log(`  before p95: ${result.before.p95Ms.toFixed(3)} ms (${result.before.p95Fps.toFixed(2)} FPS)`);
    console.log(`  after p95:  ${result.after.p95Ms.toFixed(3)} ms (${result.after.p95Fps.toFixed(2)} FPS)`);
    console.log(`  delta:      ${result.delta.p95Ms.toFixed(3)} ms (${result.delta.p95Percent.toFixed(2)}%)`);
  }
}

function fail(message) {
  console.error(`compare-performance-snapshots: ${message}`);
  process.exit(2);
}
