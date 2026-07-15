import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import {
  applyAuthoringBatch,
  AUTHORING_BATCH_SCHEMA,
  AUTHORING_BATCH_VERSION,
  type IAuthoringBatchDocument,
} from "@threenative/authoring";

export const AUTHORING_BATCH_SCALE_SIZES = [64 * 1024, 1024 * 1024, 10 * 1024 * 1024, 50 * 1024 * 1024] as const;
export const AUTHORING_BATCH_SCALE_FILE_COUNTS = [1, 10, 100] as const;
export const AUTHORING_BATCH_SCALE_RELATIVE_BUDGET = 1.2;

export interface IAuthoringBatchScaleCase {
  copiedBytes: number;
  elapsedMs: number;
  fileCount: number;
  filesRead: number;
  filesStaged: number;
  filesWritten: number;
  fixtureHash: string;
  inputBytes: number;
  peakRssBytes: number;
  planHash: string;
  targetBytes: number;
}

export interface IAuthoringBatchScaleGateOptions {
  baselinePath?: string;
  fileCounts?: readonly number[];
  reportPath?: string;
  root?: string;
  samples?: number;
  sizes?: readonly number[];
}

export interface IAuthoringBatchScaleGateResult {
  cases: IAuthoringBatchScaleCase[];
  diagnostics: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  ok: boolean;
  reportPath: string;
}

export async function runAuthoringBatchScaleGate(options: IAuthoringBatchScaleGateOptions = {}): Promise<IAuthoringBatchScaleGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const reportPath = resolve(options.reportPath ?? join(root, "tools/verify/artifacts/authoring-batch-scale/verification-report.json"));
  const sizes = options.sizes ?? AUTHORING_BATCH_SCALE_SIZES;
  const fileCounts = options.fileCounts ?? AUTHORING_BATCH_SCALE_FILE_COUNTS;
  const samples = options.samples ?? 3;
  const cases: IAuthoringBatchScaleCase[] = [];
  const diagnostics: IAuthoringBatchScaleGateResult["diagnostics"] = [];

  for (const targetBytes of sizes) {
    for (const fileCount of fileCounts) {
      const measurements: IAuthoringBatchScaleCase[] = [];
      for (let sample = 0; sample < samples; sample += 1) measurements.push(await measureCase(targetBytes, fileCount));
      const measurement = medianCase(measurements);
      cases.push(measurement);
      if (measurement.filesRead !== fileCount || measurement.filesStaged !== fileCount || measurement.filesWritten !== fileCount) {
        diagnostics.push({
          code: "TN_VERIFY_AUTHORING_BATCH_SCALE_FILE_SCOPE",
          message: `${targetBytes}-byte/${fileCount}-file fixture read ${measurement.filesRead}, staged ${measurement.filesStaged}, and wrote ${measurement.filesWritten} files.`,
          severity: "error",
        });
      }
      if (measurement.copiedBytes !== measurement.inputBytes) {
        diagnostics.push({
          code: "TN_VERIFY_AUTHORING_BATCH_SCALE_COPY_SCOPE",
          message: `${targetBytes}-byte/${fileCount}-file fixture copied ${measurement.copiedBytes} bytes for ${measurement.inputBytes} touched input bytes.`,
          severity: "error",
        });
      }
    }
  }

  const baselinePath = resolve(options.baselinePath ?? join(root, "tools/verify/evidence/authoring-batch-scale-baseline.json"));
  const baseline = await readBaseline(baselinePath);
  for (const measurement of cases) {
    const expected = baseline.cases.find((entry) => entry.targetBytes === measurement.targetBytes && entry.fileCount === measurement.fileCount);
    if (expected === undefined) {
      diagnostics.push({ code: "TN_VERIFY_AUTHORING_BATCH_SCALE_BASELINE_MISSING", message: `No reviewed baseline exists for ${measurement.targetBytes} bytes across ${measurement.fileCount} files.`, severity: "error" });
      continue;
    }
    if (measurement.elapsedMs > expected.medianElapsedMs * AUTHORING_BATCH_SCALE_RELATIVE_BUDGET) {
      diagnostics.push({ code: "TN_VERIFY_AUTHORING_BATCH_SCALE_LATENCY_REGRESSION", message: `Median latency ${measurement.elapsedMs}ms exceeds the reviewed ${expected.medianElapsedMs}ms baseline by more than 20%.`, severity: "error" });
    }
    if (measurement.peakRssBytes > expected.medianPeakRssBytes * AUTHORING_BATCH_SCALE_RELATIVE_BUDGET) {
      diagnostics.push({ code: "TN_VERIFY_AUTHORING_BATCH_SCALE_RSS_REGRESSION", message: `Median peak RSS ${measurement.peakRssBytes} exceeds the reviewed ${expected.medianPeakRssBytes}-byte baseline by more than 20%.`, severity: "error" });
    }
  }

  const payload = {
    budgets: { maxRelativeMedianRegression: AUTHORING_BATCH_SCALE_RELATIVE_BUDGET },
    cases,
    diagnostics,
    generatedBy: "@threenative/verify-tools authoringBatchScaleGate",
    matrix: { fileCounts, samples, sizes },
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    schema: "threenative.verify.authoring-batch-scale",
    version: "0.1.0",
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { cases, diagnostics, ok: payload.ok, reportPath };
}

interface IAuthoringBatchScaleBaseline {
  cases: Array<{ fileCount: number; medianElapsedMs: number; medianPeakRssBytes: number; targetBytes: number }>;
}

async function readBaseline(path: string): Promise<IAuthoringBatchScaleBaseline> {
  return JSON.parse(await readFile(path, "utf8")) as IAuthoringBatchScaleBaseline;
}

function medianCase(cases: readonly IAuthoringBatchScaleCase[]): IAuthoringBatchScaleCase {
  const middle = Math.floor(cases.length / 2);
  const median = (values: number[]): number => [...values].sort((left, right) => left - right)[middle]!;
  return {
    ...cases[0]!,
    elapsedMs: median(cases.map((entry) => entry.elapsedMs)),
    peakRssBytes: median(cases.map((entry) => entry.peakRssBytes)),
  };
}

async function measureCase(targetBytes: number, fileCount: number): Promise<IAuthoringBatchScaleCase> {
  const projectPath = await mkdtemp(join(tmpdir(), "tn-authoring-scale-"));
  let peakRssBytes = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); }, 5);
  try {
    const inputDirectory = join(projectPath, "content/input");
    await mkdir(inputDirectory, { recursive: true });
    const paths: string[] = [];
    const operations: IAuthoringBatchDocument["operations"] = [];
    const bytesPerFile = Math.max(1024, Math.floor(targetBytes / fileCount));
    for (let index = 0; index < fileCount; index += 1) {
      const id = `scale-${index}`;
      const path = `content/input/${id}.input.json`;
      const fixed = JSON.stringify({ schema: "threenative.input", version: "0.1.0", id, actions: [{ id: "padding-", bindings: ["keyboard.Space"] }] }, null, 2);
      const paddingBytes = Math.max(1, bytesPerFile - Buffer.byteLength(fixed) - 1);
      const source = `${fixed.replace("padding-", `padding-${"x".repeat(paddingBytes)}`)}\n`;
      await writeFile(join(projectPath, path), source, "utf8");
      paths.push(path);
      operations.push({ name: "input.add_action", args: { actionId: `added-${index}`, file: path, inputDocId: id, keys: ["keyboard.Enter"] } });
    }
    const inputBytes = await sumBytes(projectPath, paths);
    const fixtureHash = await hashFiles(projectPath, paths);
    const batch: IAuthoringBatchDocument = {
      id: `scale-${targetBytes}-${fileCount}`,
      operations,
      schema: AUTHORING_BATCH_SCHEMA,
      version: AUTHORING_BATCH_VERSION,
    };
    const started = performance.now();
    const result = await applyAuthoringBatch({ batch, projectPath });
    const elapsedMs = Math.round((performance.now() - started) * 1000) / 1000;
    if (!result.ok || !result.committed) throw new Error(`Scale fixture failed: ${JSON.stringify(result.diagnostics)}`);
    return {
      copiedBytes: result.copiedBytes,
      elapsedMs,
      fileCount,
      filesRead: result.filesRead.length,
      filesStaged: result.filesStaged.length,
      filesWritten: result.filesWritten.length,
      fixtureHash,
      inputBytes,
      peakRssBytes,
      planHash: result.planHash,
      targetBytes,
    };
  } finally {
    clearInterval(sampler);
    await rm(projectPath, { force: true, recursive: true });
  }
}

async function sumBytes(root: string, paths: readonly string[]): Promise<number> {
  return (await Promise.all(paths.map((path) => readFile(join(root, path))))).reduce((total, bytes) => total + bytes.byteLength, 0);
}

async function hashFiles(root: string, paths: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const path of [...paths].sort()) {
    hash.update(path);
    hash.update("\0");
    hash.update(await readFile(join(root, path)));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runAuthoringBatchScaleGate();
  process.stdout.write(`${JSON.stringify({ diagnostics: result.diagnostics, ok: result.ok, reportPath: result.reportPath }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
