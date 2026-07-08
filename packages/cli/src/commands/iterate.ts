import { validateIterateReport, ITERATE_REPORT_SCHEMA, ITERATE_REPORT_VERSION, type IIterateDiagnostic, type IIterateReport, type IIterateStepReport } from "@threenative/authoring";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";
import { authoringCommand } from "./authoring.js";
import { buildCommand } from "./build.js";
import { playtestCommand } from "./playtest.js";
import { captureScreenshot, type IScreenshotProofReport } from "./visualProof.js";
import { type IteratePreviewStarter, withIteratePreview } from "./iteratePreview.js";
import { summarizePlaytestForIterate, type IPlaytestIterateSummary } from "./playtestArtifacts.js";

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
    scenarios?: IIterateCompactScenario[];
    status: IIterateStepReport["status"];
  }>;
}

type IIterateCompactScenario = IPlaytestIterateSummary | { pass: true; scenario: string };

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
    const scenarios = scenarioFlag === undefined ? await allScenarios(projectPath) : [scenarioFlag];
    if (scenarios.length === 0) {
      return {
        diagnostics: [{ code: "TN_ITERATE_NO_SCENARIO", message: "No playtests/*.playtest.json scenario found; playtest step skipped.", severity: "info" }],
      };
    }
    const playtestDir = resolve(latestDir, "playtest");
    const results = await runPlaytestScenarios({ playtest: options.playtest ?? defaultPlaytest, playtestDir, projectPath, scenarios });
    return {
      artifacts: { directory: playtestDir, summaries: results.scenarioSummaries.map((summary) => summary.artifact).filter((item): item is string => item !== undefined) },
      diagnostics: results.diagnostics,
      output: {
        scenarioCount: scenarios.length,
        scenarios: results.scenarioSummaries,
      },
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
      ...(step.id === "playtest" ? {} : { artifactPaths: artifactPaths(step.artifacts).slice(0, 2) }),
      diagnostic: step.diagnostics.find((diagnostic) => diagnostic.severity === "error"),
      id: step.id,
      ...(step.id !== "playtest" || !isRecord(step.output) || !Array.isArray(step.output.scenarios) ? {} : { scenarios: compactScenarios(step.output.scenarios) }),
      status: step.status,
    })),
  };
}

function compactScenarios(values: readonly unknown[]): IIterateCompactScenario[] {
  return values
    .filter(isPlaytestIterateSummary)
    .map((scenario) => scenario.pass ? { pass: true, scenario: scenario.scenario } : scenario);
}

async function runPlaytestScenarios(options: {
  playtest: NonNullable<IIterateCommandOptions["playtest"]>;
  playtestDir: string;
  projectPath: string;
  scenarios: readonly string[];
}): Promise<{ diagnostics: IIterateDiagnostic[]; scenarioSummaries: IPlaytestIterateSummary[] }> {
  const diagnostics: IIterateDiagnostic[] = [];
  const scenarioSummaries: IPlaytestIterateSummary[] = [];
  for (const scenario of options.scenarios) {
    const scenarioOut = resolve(options.playtestDir, safeFilePart(scenario.replace(/\.playtest\.json$/, "")));
    const result = await options.playtest(["--project", options.projectPath, "--scenario", scenario, "--out", scenarioOut, "--json"], options.projectPath);
    const parsed = parseJsonPayload(result.stdout);
    if (isPlaytestSummaryPayload(parsed)) {
      const summary = summarizePlaytestForIterate(parsed);
      scenarioSummaries.push(summary);
      diagnostics.push(...normalizeDiagnostics(readDiagnostics(parsed)));
      if (result.exitCode !== 0 && !diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
        diagnostics.push({ code: "TN_ITERATE_PLAYTEST_SCENARIO_FAILED", message: `Playtest scenario '${scenario}' failed.`, scenario, severity: "error" });
      }
    } else {
      diagnostics.push(...commandDiagnostics(result, parsed).map((diagnostic) => ({ ...diagnostic, scenario })));
      scenarioSummaries.push({
        artifact: undefined,
        assertions: [],
        diagnostics: commandDiagnostics(result, parsed).map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message, severity: diagnostic.severity })),
        pass: false,
        scenario,
        truncated: false,
      });
    }
  }
  return { diagnostics, scenarioSummaries };
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

async function allScenarios(projectPath: string): Promise<string[]> {
  const playtestsPath = resolve(projectPath, "playtests");
  const entries = await readdir(playtestsPath).catch(() => []);
  return entries
    .filter((entry) => entry.endsWith(".playtest.json"))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => relative(projectPath, resolve(playtestsPath, entry)));
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

function isPlaytestSummaryPayload(value: unknown): value is Parameters<typeof summarizePlaytestForIterate>[0] {
  return isRecord(value) && value.schema === "threenative.playtest-summary" && typeof value.scenario === "string" && typeof value.pass === "boolean" && Array.isArray(value.assertions) && isRecord(value.artifacts);
}

function isPlaytestIterateSummary(value: unknown): value is IPlaytestIterateSummary {
  return isRecord(value)
    && typeof value.scenario === "string"
    && typeof value.pass === "boolean"
    && Array.isArray(value.assertions)
    && Array.isArray(value.diagnostics)
    && typeof value.truncated === "boolean";
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
