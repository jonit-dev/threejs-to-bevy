import { validateIterateReport, ITERATE_REPORT_SCHEMA, ITERATE_REPORT_VERSION, type IIterateDiagnostic, type IIterateReport, type IIterateStepReport } from "@threenative/authoring";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";
import { authoringCommand } from "./authoring.js";
import { buildCommand } from "./build.js";
import { playtestCommand } from "./playtest.js";
import { captureScreenshot, type IScreenshotProofReport } from "./visualProof.js";
import { type IteratePreviewStarter, withIteratePreview } from "./iteratePreview.js";

interface IIterateCommandOptions {
  build?: (projectPath: string) => Promise<ICommandResult>;
  capture?: (options: { outPath: string; url: string }) => Promise<IScreenshotProofReport>;
  playtest?: (args: readonly string[], projectPath: string) => Promise<ICommandResult>;
  startPreview?: IteratePreviewStarter;
  validate?: (projectPath: string) => Promise<ICommandResult>;
}

interface IIterateStepResult {
  artifacts?: Record<string, unknown>;
  diagnostics?: IIterateDiagnostic[];
  output?: unknown;
}

interface IIterateCompactSummary {
  artifacts: {
    directory: string;
    report: string;
    screenshot?: string;
  };
  code: IIterateReport["code"];
  diagnostics: IIterateDiagnostic[];
  durationMs: number;
  ok: boolean;
  projectPath: string;
  steps: Array<{
    artifactPaths?: string[];
    diagnostic?: IIterateDiagnostic;
    id: IIterateStepReport["id"];
    status: IIterateStepReport["status"];
  }>;
}

export async function iterateCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IIterateCommandOptions = {},
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolvePath(cwd, readFlag(normalizedArgv, "--project") ?? ".");
  const scenarioFlag = readFlag(normalizedArgv, "--scenario");
  const skipPlaytest = normalizedArgv.includes("--skip-playtest");
  const keep = normalizedArgv.includes("--keep");
  const started = Date.now();
  const latestDir = resolve(projectPath, "artifacts", "iterate", "latest");
  const keptDir = keep ? resolve(projectPath, "artifacts", "iterate", new Date().toISOString().replace(/[:.]/g, "-")) : undefined;
  await mkdir(latestDir, { recursive: true });

  const steps: IIterateStepReport[] = [];
  const diagnostics: IIterateDiagnostic[] = [];
  let failed = false;
  let bundlePath: string | undefined;

  const run = async (id: IIterateStepReport["id"], fn: () => Promise<IIterateStepResult>): Promise<IIterateStepReport> => {
    if (failed) {
      const skipped = skippedStep(id);
      steps.push(skipped);
      return skipped;
    }
    const stepStarted = Date.now();
    const result = await fn();
    const stepDiagnostics = result.diagnostics ?? [];
    diagnostics.push(...stepDiagnostics);
    const status = stepDiagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fail" : "pass";
    const step: IIterateStepReport = {
      artifacts: result.artifacts,
      diagnostics: stepDiagnostics,
      durationMs: Date.now() - stepStarted,
      id,
      output: result.output,
      status,
    };
    steps.push(step);
    if (status === "fail") {
      failed = true;
    }
    return step;
  };

  await run("validate", async () => commandStep(await (options.validate ?? defaultValidate)(projectPath)));
  await run("build", async () => {
    const result = await (options.build ?? defaultBuild)(projectPath);
    const parsed = parseJsonPayload(result.stdout);
    if (result.exitCode === 0 && isRecord(parsed) && typeof parsed.bundlePath === "string") {
      bundlePath = parsed.bundlePath;
    }
    return commandStep(result);
  });
  await run("screenshot", async () => {
    if (bundlePath === undefined) {
      return { diagnostics: [{ code: "TN_ITERATE_BUNDLE_MISSING", message: "Build did not return a bundle path for screenshot capture.", severity: "error" }] };
    }
    const screenshotPath = resolve(latestDir, "screenshot.png");
    const capture = await withIteratePreview(bundlePath, (preview) => (options.capture ?? defaultCapture)({ outPath: screenshotPath, url: preview.url }), options.startPreview);
    const captureDiagnostics = normalizeDiagnostics(capture.diagnostics ?? []);
    return {
      artifacts: { screenshot: screenshotPath },
      diagnostics: captureDiagnostics,
      output: {
        checks: capture.checks,
        outPath: capture.outPath,
        url: capture.url,
      },
    };
  });
  await run("playtest", async () => {
    if (skipPlaytest) {
      return {
        diagnostics: [{ code: "TN_ITERATE_PLAYTEST_SKIPPED", message: "Playtest step skipped by --skip-playtest.", severity: "info" }],
      };
    }
    const scenario = scenarioFlag ?? await firstScenario(projectPath);
    if (scenario === undefined) {
      return {
        diagnostics: [{ code: "TN_ITERATE_NO_SCENARIO", message: "No playtests/*.playtest.json scenario found; playtest step skipped.", severity: "info" }],
      };
    }
    const playtestDir = resolve(latestDir, "playtest");
    const result = await (options.playtest ?? defaultPlaytest)(["--project", projectPath, "--scenario", scenario, "--out", playtestDir, "--json"], projectPath);
    const parsed = parseJsonPayload(result.stdout);
    return {
      artifacts: isRecord(parsed) && isRecord(parsed.artifacts) ? parsed.artifacts : { directory: playtestDir },
      diagnostics: result.exitCode === 0 ? normalizeDiagnostics(readDiagnostics(parsed)) : commandDiagnostics(result, parsed),
      output: parsed,
    };
  });

  for (const id of (["validate", "build", "screenshot", "playtest"] as const).filter((id) => !steps.some((step) => step.id === id))) {
    steps.push(skippedStep(id));
  }

  const reportPath = resolve(latestDir, "report.json");
  const report: IIterateReport = {
    artifacts: {
      directory: latestDir,
      ...(keptDir === undefined ? {} : { keptDirectory: keptDir }),
      report: reportPath,
      ...(steps.find((step) => step.id === "screenshot")?.artifacts?.screenshot === undefined ? {} : { screenshot: String(steps.find((step) => step.id === "screenshot")?.artifacts?.screenshot) }),
    },
    code: failed ? "TN_ITERATE_FAILED" : "TN_ITERATE_OK",
    diagnostics,
    durationMs: Date.now() - started,
    ok: !failed,
    projectPath,
    schema: ITERATE_REPORT_SCHEMA,
    steps,
    version: ITERATE_REPORT_VERSION,
  };
  const schemaValidation = validateIterateReport(report);
  if (!schemaValidation.ok) {
    report.diagnostics.push(...schemaValidation.diagnostics);
    report.ok = false;
    report.code = "TN_ITERATE_FAILED";
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (keptDir !== undefined) {
    await cp(latestDir, keptDir, { recursive: true });
  }

  return {
    exitCode: report.ok ? 0 : 1,
    stdout: json ? `${JSON.stringify(compactSummary(report), null, 2)}\n` : renderText(report),
  };
}

function compactSummary(report: IIterateReport): IIterateCompactSummary {
  return {
    artifacts: {
      directory: report.artifacts.directory,
      report: report.artifacts.report,
      ...(report.artifacts.screenshot === undefined ? {} : { screenshot: report.artifacts.screenshot }),
    },
    code: report.code,
    diagnostics: report.diagnostics.filter((diagnostic) => diagnostic.severity === "error").slice(0, 1),
    durationMs: report.durationMs,
    ok: report.ok,
    projectPath: report.projectPath,
    steps: report.steps.map((step) => ({
      artifactPaths: artifactPaths(step.artifacts).slice(0, 4),
      diagnostic: step.diagnostics.find((diagnostic) => diagnostic.severity === "error"),
      id: step.id,
      status: step.status,
    })),
  };
}

function artifactPaths(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(artifactPaths);
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap(artifactPaths);
  }
  return [];
}

function commandStep(result: ICommandResult): IIterateStepResult {
  const parsed = parseJsonPayload(result.stdout || result.stderr || "{}");
  return {
    diagnostics: result.exitCode === 0 ? normalizeDiagnostics(readDiagnostics(parsed)) : commandDiagnostics(result, parsed),
    output: parsed,
  };
}

function commandDiagnostics(result: ICommandResult, parsed: unknown): IIterateDiagnostic[] {
  const diagnostics = normalizeDiagnostics(readDiagnostics(parsed));
  if (diagnostics.length > 0) {
    return diagnostics.map((diagnostic) => ({ ...diagnostic, severity: diagnostic.severity ?? "error" }));
  }
  if (isRecord(parsed) && typeof parsed.code === "string") {
    return [{ ...parsed, code: parsed.code, message: String(parsed.message ?? parsed.code), severity: "error" }];
  }
  return [{ code: "TN_ITERATE_STEP_FAILED", message: result.stderr || result.stdout || "Iterate step failed.", severity: "error" }];
}

function readDiagnostics(payload: unknown): unknown[] {
  if (isRecord(payload) && Array.isArray(payload.diagnostics)) {
    return payload.diagnostics;
  }
  return [];
}

function normalizeDiagnostics(values: readonly unknown[]): IIterateDiagnostic[] {
  return values.filter(isRecord).map((diagnostic) => ({
    ...diagnostic,
    code: typeof diagnostic.code === "string" ? diagnostic.code : "TN_ITERATE_DIAGNOSTIC",
    message: typeof diagnostic.message === "string" ? diagnostic.message : "Iterate diagnostic.",
    severity: diagnostic.severity === "warning" || diagnostic.severity === "info" || diagnostic.severity === "error" ? diagnostic.severity : "error",
  }));
}

async function defaultValidate(projectPath: string): Promise<ICommandResult> {
  return authoringCommand(["validate", "--project", projectPath, "--json"]);
}

async function defaultBuild(projectPath: string): Promise<ICommandResult> {
  return buildCommand(["--project", projectPath, "--json"]);
}

async function defaultCapture(options: { outPath: string; url: string }): Promise<IScreenshotProofReport> {
  return captureScreenshot({ outPath: options.outPath, url: options.url, waitReady: true });
}

async function defaultPlaytest(args: readonly string[]): Promise<ICommandResult> {
  return playtestCommand(args);
}

async function firstScenario(projectPath: string): Promise<string | undefined> {
  const playtestsPath = resolve(projectPath, "playtests");
  const entries = await readdir(playtestsPath).catch(() => []);
  const first = entries.filter((entry) => entry.endsWith(".playtest.json")).sort((left, right) => left.localeCompare(right))[0];
  return first === undefined ? undefined : relative(projectPath, resolve(playtestsPath, first));
}

function skippedStep(id: IIterateStepReport["id"]): IIterateStepReport {
  return { diagnostics: [], durationMs: 0, id, status: "skipped" };
}

function renderText(report: IIterateReport): string {
  const status = report.ok ? "passed" : "failed";
  return `Iterate ${status}: ${report.steps.map((step) => `${step.id}=${step.status}`).join(", ")}\nArtifacts: ${report.artifacts.directory}\n`;
}

function parseJsonPayload(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function resolvePath(cwd: string, value: string): string {
  return resolve(cwd, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
