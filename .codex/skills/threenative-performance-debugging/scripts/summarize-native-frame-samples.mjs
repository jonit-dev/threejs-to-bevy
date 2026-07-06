#!/usr/bin/env node

import { readFileSync } from "node:fs";

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error("Usage: summarize-native-frame-samples.mjs <native-frame-samples.json>");
  process.exit(2);
}

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function frameMsOf(sample) {
  const direct = asNumber(sample.frameMs);
  if (direct !== undefined) return direct;

  const fps = asNumber(sample.fps);
  if (fps && fps > 0) return 1000 / fps;

  return undefined;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return undefined;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(label, samples) {
  const frameMs = samples.map(frameMsOf).filter((value) => value !== undefined).sort((a, b) => a - b);
  if (frameMs.length === 0) {
    return { label, samples: samples.length, measured: 0 };
  }

  const total = frameMs.reduce((sum, value) => sum + value, 0);
  const avgMs = total / frameMs.length;
  const avgFps = avgMs > 0 ? 1000 / avgMs : undefined;

  return {
    label,
    samples: samples.length,
    measured: frameMs.length,
    avgMs,
    avgFps,
    minMs: frameMs[0],
    p50Ms: percentile(frameMs, 0.5),
    p95Ms: percentile(frameMs, 0.95),
    maxMs: frameMs[frameMs.length - 1],
  };
}

function format(value, digits = 2) {
  return value === undefined ? "-" : value.toFixed(digits);
}

const data = JSON.parse(readFileSync(inputPath, "utf8"));
const samples = Array.isArray(data)
  ? data
  : data.samples ?? data.frames ?? data.frameSamples ?? [];

if (!Array.isArray(samples)) {
  console.error("Could not find a frame sample array in the input JSON.");
  process.exit(1);
}

const windows = [
  ["all", samples],
  ["dropFirst", samples.slice(1)],
  ["startupOnly", samples.filter((sample) => (asNumber(sample.tick) ?? 0) <= 10)],
  ["afterTick10", samples.filter((sample) => (asNumber(sample.tick) ?? -Infinity) > 10)],
  ["afterTick20", samples.filter((sample) => (asNumber(sample.tick) ?? -Infinity) > 20)],
];

console.log(`file: ${inputPath}`);
console.log(`budgetMs: ${format(asNumber(data.budgetMs))}`);
console.log("window,samples,measured,avgMs,avgFps,minMs,p50Ms,p95Ms,maxMs");

for (const summary of windows.map(([label, windowSamples]) => summarize(label, windowSamples))) {
  console.log([
    summary.label,
    summary.samples,
    summary.measured,
    format(summary.avgMs),
    format(summary.avgFps),
    format(summary.minMs),
    format(summary.p50Ms),
    format(summary.p95Ms),
    format(summary.maxMs),
  ].join(","));
}
