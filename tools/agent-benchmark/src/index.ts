#!/usr/bin/env node

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { aggregateRunReports } from "./aggregate.js";
import { captureCandidate } from "./capture.js";
import { readSession } from "./schemas.js";
import { type BenchmarkCondition, type IBenchmarkRunReport } from "./types.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const command = argv[0];
  if (command === "score") {
    return scoreCommand(argv.slice(1));
  }
  if (command === "aggregate") {
    return aggregateCommand(argv.slice(1));
  }
  process.stderr.write("Usage: tn-agent-benchmark score --candidate <dir> --condition <vanilla|threenative> [--session <path>] [--out <path>] [--json]\n       tn-agent-benchmark aggregate --runs <dir-or-file> [--out <path>] [--json]\n");
  return 1;
}

async function scoreCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const candidateArg = readFlag(argv, "--candidate");
  const condition = readFlag(argv, "--condition") as BenchmarkCondition | undefined;
  const outArg = readFlag(argv, "--out");
  const url = readFlag(argv, "--url");
  const sessionArg = readFlag(argv, "--session");
  if (candidateArg === undefined || (condition !== "vanilla" && condition !== "threenative")) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: score --candidate <dir> --condition <vanilla|threenative> [--session <path>] [--out <path>] [--url <url>] [--json]" }, json, 1);
  }
  const candidate = resolve(candidateArg);
  const outPath = resolve(outArg ?? join(candidate, "artifacts/agent-benchmark/run-report.json"));
  const outDir = resolve(outPath, "..");
  await mkdir(outDir, { recursive: true });
  const sessionResult = await readSession(sessionArg === undefined ? join(candidate, "session.json") : resolve(sessionArg));
  const session = sessionResult.session ?? {
    condition,
    humanRubric: { playability: 0, visual: 0, notes: "Missing or invalid session.json." },
    iterationCount: 0,
    promptId: "unknown",
    runId: "unknown",
    schema: "threenative.agent-benchmark-session" as const,
    stopReason: "failed-setup" as const,
    tokenCount: 0,
    version: 1 as const,
  };
  const capture = await captureCandidate({ candidate, outDir, url });
  const diagnostics = [...sessionResult.diagnostics, ...capture.diagnostics];
  if (session.condition !== condition) {
    diagnostics.push({
      code: "TN_BENCH_SESSION_CONDITION_MISMATCH",
      message: `session.json condition '${session.condition}' does not match CLI condition '${condition}'.`,
      severity: "error",
    });
  }
  const report: IBenchmarkRunReport = {
    artifacts: relativeArtifacts(capture.artifacts, outDir),
    candidate,
    condition,
    diagnostics,
    generatedAt: new Date().toISOString(),
    metrics: capture.metrics,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    promptId: session.promptId,
    runId: session.runId,
    schema: "threenative.agent-benchmark-run",
    session,
    version: 1,
  };
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return writeResult({ code: report.ok ? "TN_BENCH_SCORE_OK" : "TN_BENCH_SCORE_FAILED", outPath, report }, json, report.ok ? 0 : 0);
}

async function aggregateCommand(argv: readonly string[]): Promise<number> {
  const json = argv.includes("--json");
  const runsArg = readFlag(argv, "--runs");
  const outArg = readFlag(argv, "--out");
  if (runsArg === undefined) {
    return writeResult({ code: "TN_BENCH_USAGE", message: "Usage: aggregate --runs <dir-or-file> [--out <path>] [--json]" }, json, 1);
  }
  const runPaths = await resolveRunReportPaths(resolve(runsArg));
  const report = await aggregateRunReports(runPaths);
  const outPath = resolve(outArg ?? "tools/verify/artifacts/agent-benchmark/benchmark-report.json");
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return writeResult({ code: report.verdict.status === "insufficient-data" ? "TN_BENCH_AGGREGATE_INSUFFICIENT_DATA" : "TN_BENCH_AGGREGATE_OK", outPath, report }, json, 0);
}

async function resolveRunReportPaths(path: string): Promise<string[]> {
  if (path.endsWith(".json")) {
    return [path];
  }
  const entries = await readdir(path, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name === "run-report.json")
    .map((entry) => resolve(path, entry.parentPath, entry.name));
}

function relativeArtifacts(artifacts: { afterScreenshot?: string; beforeScreenshot?: string }, outDir: string): { afterScreenshot?: string; beforeScreenshot?: string } {
  return {
    afterScreenshot: artifacts.afterScreenshot === undefined ? undefined : relativePath(outDir, artifacts.afterScreenshot),
    beforeScreenshot: artifacts.beforeScreenshot === undefined ? undefined : relativePath(outDir, artifacts.beforeScreenshot),
  };
}

function relativePath(from: string, to: string): string {
  return to.startsWith(from) ? to.slice(from.length + 1) : to;
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index < 0 ? undefined : argv[index + 1];
}

function writeResult(payload: unknown, json: boolean, exitCode: number): number {
  const output = json ? `${JSON.stringify(payload, null, 2)}\n` : `${JSON.stringify(payload)}\n`;
  if (exitCode === 0) {
    process.stdout.write(output);
  } else {
    process.stderr.write(output);
  }
  return exitCode;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  process.exitCode = await main();
}
