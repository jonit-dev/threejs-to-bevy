import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { chromium, type CDPSession } from "playwright";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

const PERFORMANCE_TRACE_USAGE = "tn performance trace --project <path> --url <preview-url> [--seconds <1..30>] [--out <file.json.gz>] [--json]";
const TRACE_CATEGORIES = [
  "-*",
  "blink.user_timing",
  "devtools.timeline",
  "gpu",
  "v8",
  "v8.execute",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-v8.cpu_profiler",
  "disabled-by-default-v8.cpu_profiler.hires",
].join(",");

export interface IPerformanceTraceCollectorOptions {
  durationMs: number;
  url: string;
}

export interface IPerformanceTraceCommandOptions {
  collector?: (options: IPerformanceTraceCollectorOptions) => Promise<Buffer>;
}

export async function performanceTraceCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IPerformanceTraceCommandOptions = {},
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const commandArgv = normalizedArgv[0] === "trace" ? normalizedArgv.slice(1) : normalizedArgv;
  const json = commandArgv.includes("--json");
  const url = readFlag(commandArgv, "--url");
  if (url === undefined) {
    return diagnosticResult({
      code: "TN_PERFORMANCE_TRACE_USAGE",
      message: `Usage: ${PERFORMANCE_TRACE_USAGE}`,
      fix: { instruction: "Start 'tn dev --target web', then pass its preview URL with --url." },
    }, { exitCode: 2, json, stderr: true });
  }

  const seconds = Number(readFlag(commandArgv, "--seconds") ?? "5");
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 30) {
    return diagnosticResult({
      code: "TN_PERFORMANCE_TRACE_DURATION_INVALID",
      message: `Performance trace duration '${readFlag(commandArgv, "--seconds") ?? ""}' is invalid.`,
      fix: { instruction: "Pass --seconds with a number between 1 and 30." },
    }, { exitCode: 2, json, stderr: true });
  }

  const projectPath = resolve(cwd, readFlag(commandArgv, "--project") ?? ".");
  const artifactPath = resolve(projectPath, readFlag(commandArgv, "--out") ?? "artifacts/performance-trace.json.gz");
  try {
    const trace = await (options.collector ?? collectBrowserPerformanceTrace)({
      durationMs: Math.round(seconds * 1_000),
      url,
    });
    validateTrace(trace);
    const compressed = gzipSync(trace);
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, compressed);
    const payload = {
      artifactPath,
      code: "TN_PERFORMANCE_TRACE_OK",
      compressedBytes: compressed.byteLength,
      durationSeconds: seconds,
      traceBytes: trace.byteLength,
      url,
    };
    return {
      exitCode: 0,
      stdout: json
        ? `${JSON.stringify(payload, null, 2)}\n`
        : `Performance trace captured.\nTrace: ${artifactPath}\nDuration: ${seconds}s\n`,
    };
  } catch (error) {
    return diagnosticResult({
      code: "TN_PERFORMANCE_TRACE_FAILED",
      message: error instanceof Error ? error.message : String(error),
      fix: { instruction: "Confirm the preview is reachable and Chromium is installed, then retry the trace." },
    }, { exitCode: 1, json, stderr: true });
  }
}

async function collectBrowserPerformanceTrace(options: IPerformanceTraceCollectorOptions): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => (globalThis as { __THREENATIVE_READY__?: { ok?: unknown } }).__THREENATIVE_READY__?.ok === true,
      undefined,
      { timeout: 30_000 },
    );
    const session = await page.context().newCDPSession(page);
    await session.send("Tracing.start", {
      categories: TRACE_CATEGORIES,
      options: "sampling-frequency=10000",
      transferMode: "ReturnAsStream",
    });
    await page.waitForTimeout(options.durationMs);
    const traceComplete = waitForTraceComplete(session);
    await session.send("Tracing.end");
    const stream = await traceComplete;
    return await readTraceStream(session, stream);
  } finally {
    await browser.close();
  }
}

function waitForTraceComplete(session: CDPSession): Promise<string> {
  return new Promise((resolveTrace, rejectTrace) => {
    const timeout = setTimeout(() => rejectTrace(new Error("Chromium did not finish the performance trace within 30 seconds.")), 30_000);
    session.on("Tracing.tracingComplete", (event: { stream?: string }) => {
      clearTimeout(timeout);
      if (event.stream === undefined) {
        rejectTrace(new Error("Chromium completed tracing without returning a trace stream."));
        return;
      }
      resolveTrace(event.stream);
    });
  });
}

async function readTraceStream(session: CDPSession, stream: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  try {
    let eof = false;
    while (!eof) {
      const result = await session.send("IO.read", { handle: stream }) as {
        base64Encoded?: boolean;
        data: string;
        eof?: boolean;
      };
      chunks.push(Buffer.from(result.data, result.base64Encoded === true ? "base64" : "utf8"));
      eof = result.eof === true;
    }
  } finally {
    await session.send("IO.close", { handle: stream });
  }
  return Buffer.concat(chunks);
}

function validateTrace(trace: Buffer): void {
  const parsed = JSON.parse(trace.toString("utf8")) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.traceEvents)) {
    throw new Error("Chromium returned an invalid performance trace without a traceEvents array.");
  }
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
