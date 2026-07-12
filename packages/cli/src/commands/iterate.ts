import { loadAuthoringProject, validateIterateReport, ITERATE_REPORT_SCHEMA, ITERATE_REPORT_VERSION, type IIterateDiagnostic, type IIterateReport, type IIterateStepReport } from "@threenative/authoring";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
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
  const includeNative = normalizedArgv.includes("--native");
  const auditWrites = normalizedArgv.includes("--audit-writes");
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
    let result: IIterateStepResult;
    try {
      result = await fn();
    } catch (error) {
      result = {
        diagnostics: [{
          code: "TN_ITERATE_STEP_EXCEPTION",
          message: error instanceof Error ? error.message : String(error),
          severity: "error",
          suggestion: "Inspect the step artifact and first failing module before rerunning iterate.",
        }],
      };
    }
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
    const step = commandStep(result);
    if (result.exitCode === 0) {
      step.diagnostics = [...(step.diagnostics ?? []), ...(await antiProofDiagnostics(projectPath))];
    }
    return step;
  });
  await run("screenshot", async () => {
    if (bundlePath === undefined) {
      return { diagnostics: [{ code: "TN_ITERATE_BUNDLE_MISSING", message: "Build did not return a bundle path for screenshot capture.", severity: "error" }] };
    }
    const screenshotPath = resolve(latestDir, "screenshot.png");
    const capture = await withIteratePreview(bundlePath, (preview) => (options.capture ?? defaultCapture)({ outPath: screenshotPath, url: preview.url }), options.startPreview);
    const captureDiagnostics = normalizeDiagnostics(capture.diagnostics ?? []);
    captureDiagnostics.push(...iterateCaptureDiagnostics(capture));
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
    const selection = scenarioFlag === undefined ? await defaultScenarios(projectPath, includeNative) : { scenarios: [scenarioFlag], skippedNative: [] };
    const scenarios = selection.scenarios;
    if (scenarios.length === 0) {
      return {
        diagnostics: [{ code: "TN_ITERATE_NO_SCENARIO", message: "No playtests/*.playtest.json scenario found; playtest step skipped.", severity: "info" }],
      };
    }
    const playtestDir = resolve(latestDir, "playtest");
    const results = await runPlaytestScenarios({ auditWrites, playtest: options.playtest ?? defaultPlaytest, playtestDir, projectPath, scenarios });
    return {
      artifacts: { directory: playtestDir, summaries: results.scenarioSummaries.map((summary) => summary.artifact).filter((item): item is string => item !== undefined) },
      diagnostics: [
        ...results.diagnostics,
        ...(selection.skippedNative.length === 0 ? [] : [{
          code: "TN_ITERATE_NATIVE_SCENARIOS_SKIPPED",
          message: `Skipped ${selection.skippedNative.length} native scenario(s) in the default web loop. Pass --native or --scenario <path> to include them.`,
          severity: "info" as const,
        }]),
      ],
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

function iterateCaptureDiagnostics(capture: IScreenshotProofReport): IIterateDiagnostic[] {
  const page = capture.page;
  if (page === undefined) {
    return [];
  }
  const diagnostics: IIterateDiagnostic[] = [];
  const failingModule = firstFailingModule([...page.errors, ...page.browserLogs, ...page.requestFailures]);
  if (page.errors.length > 0 || page.browserLogs.some((entry) => /^error:/iu.test(entry))) {
    diagnostics.push({
      code: "TN_ITERATE_BROWSER_PAGE_ERROR",
      message: `Browser page error during iterate screenshot: ${[...page.errors, ...page.browserLogs].find((entry) => entry.length > 0) ?? "unknown error"}${failingModule === undefined ? "" : ` First failing module: ${failingModule}.`}`,
      severity: "error",
      suggestion: "Fix the first browser module error reported by iterate, then rerun the screenshot step.",
    });
  }
  if (page.requestFailures.length > 0) {
    diagnostics.push({
      code: "TN_ITERATE_BROWSER_REQUEST_FAILED",
      message: `Browser request failure during iterate screenshot: ${page.requestFailures[0]}${failingModule === undefined ? "" : ` First failing module: ${failingModule}.`}`,
      severity: "error",
      suggestion: "Repair the owning asset, bundle, or browser-safe import and rerun iterate.",
    });
  }
  return diagnostics;
}

function firstFailingModule(values: readonly string[]): string | undefined {
  const text = values.join("\n");
  const match = text.match(/(?:node:[A-Za-z0-9_./-]+|(?:src|packages|runtime-[A-Za-z0-9_-]+)[A-Za-z0-9_./-]*\.(?:ts|tsx|js|mjs))/u);
  return match?.[0];
}

async function antiProofDiagnostics(projectPath: string): Promise<IIterateDiagnostic[]> {
  const project = await loadAuthoringProject({ projectPath });
  const diagnostics: IIterateDiagnostic[] = [];
  const systems = project.documents.filter((document) => document.kind === "systems").flatMap((document) => {
    const data = isRecord(document.data) ? document.data : {};
    return (Array.isArray(data.systems) ? data.systems : []).filter(isRecord).map((system) => ({ file: document.projectRelativePath, system }));
  });
  for (const entry of systems) {
    const script = isRecord(entry.system.script) ? entry.system.script : undefined;
    if (script === undefined || typeof script.module !== "string" || typeof script.export !== "string") {
      continue;
    }
    const source = await readFile(resolve(projectPath, script.module), "utf8").catch(() => "");
    if (emptySystemBody(source, script.export)) {
      diagnostics.push({
        code: "TN_ITERATE_EMPTY_SYSTEM_BODY",
        file: entry.file,
        message: `Registered system '${String(entry.system.id ?? script.export)}' points to an empty behavior body.`,
        severity: "warning",
        suggestion: "Implement the registered behavior before treating iterate as gameplay proof.",
      });
    }
  }
  const scenarios = await readdir(resolve(projectPath, "playtests")).catch(() => []);
  let hasGameplayResourceAssertion = false;
  for (const scenario of scenarios.filter((entry) => entry.endsWith(".playtest.json"))) {
    const value = parseJsonPayload(await readFile(resolve(projectPath, "playtests", scenario), "utf8").catch(() => "{}"));
    const assertions = isRecord(value) && isRecord(value.assert) && Array.isArray(value.assert.resources) ? value.assert.resources : [];
    if (assertions.some((assertion) => isRecord(assertion) && assertion.changed === true)) {
      hasGameplayResourceAssertion = true;
      break;
    }
  }
  if (systems.length > 0 && !hasGameplayResourceAssertion) {
    diagnostics.push({
      code: "TN_ITERATE_GAMEPLAY_UNPROVEN",
      message: "Iterate is scaffold-only, gameplay unproven: no playtest scenario asserts a gameplay-caused resource change.",
      severity: "warning",
      suggestion: "Add a scenario resource assertion with changed: true and run it through tn iterate.",
    });
  }
  return diagnostics;
}

function emptySystemBody(source: string, exportName: string): boolean {
  const escaped = exportName.replace(/[.*+?^${}()|[\[\]\\]/gu, "\\$&");
  const normalized = source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
  return new RegExp(`export\\s+(?:const|function)\\s+${escaped}[\\s\\S]*?(?:=>\\s*)?\\{\\s*\\}`, "u").test(normalized);
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
  auditWrites: boolean;
  playtest: NonNullable<IIterateCommandOptions["playtest"]>;
  playtestDir: string;
  projectPath: string;
  scenarios: readonly string[];
}): Promise<{ diagnostics: IIterateDiagnostic[]; scenarioSummaries: IPlaytestIterateSummary[] }> {
  const diagnostics: IIterateDiagnostic[] = [];
  const scenarioSummaries: IPlaytestIterateSummary[] = [];
  for (const scenario of options.scenarios) {
    const scenarioOut = resolve(options.playtestDir, safeFilePart(scenario.replace(/\.playtest\.json$/, "")));
    const result = await options.playtest(["--project", options.projectPath, "--scenario", scenario, "--out", scenarioOut, ...(options.auditWrites ? ["--audit-writes"] : []), "--json"], options.projectPath);
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

async function defaultScenarios(projectPath: string, includeNative: boolean): Promise<{ scenarios: string[]; skippedNative: string[] }> {
  const playtestsPath = resolve(projectPath, "playtests");
  const entries = await readdir(playtestsPath).catch(() => []);
  const candidates = entries
    .filter((entry) => entry.endsWith(".playtest.json"))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => relative(projectPath, resolve(playtestsPath, entry)));
  const scenarios: string[] = [];
  const skippedNative: string[] = [];
  for (const scenario of candidates) {
    const target = await scenarioTarget(resolve(projectPath, scenario));
    if (!includeNative && (target === "desktop" || target === "bevy")) {
      skippedNative.push(scenario);
    } else {
      scenarios.push(scenario);
    }
  }
  return { scenarios, skippedNative };
}

async function scenarioTarget(path: string): Promise<string | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isRecord(value) && typeof value.target === "string" ? value.target : undefined;
  } catch {
    return undefined;
  }
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
