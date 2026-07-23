import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { comparePlaytestParity, type ComparablePlaytestSummary } from "./parityPlaytestCompare.js";
import { parityVisualCommand } from "./parityVisual.js";
import { playtestCommand } from "./playtest.js";
import { loadPlaytestScenario, type PlaytestTarget } from "./playtestScenario.js";

export interface IParityPlaytestTargetResult {
  artifactDirectory: string;
  diagnostics: Array<{ code: string; message: string; severity?: string }>;
  exitCode: number;
  pass: boolean;
  summaryPath?: string;
  target: PlaytestTarget;
}

export interface IParityPlaytestReport {
  artifacts: {
    report: string;
    targets: Record<string, string>;
  };
  code: "TN_PARITY_PLAYTEST_OK" | "TN_PARITY_PLAYTEST_FAILED";
  diagnostics: Array<{ code: string; message: string; severity: "error" | "warning"; target?: string }>;
  pass: boolean;
  project: string;
  scenario: string;
  targets: IParityPlaytestTargetResult[];
}

export interface IParityPlaytestOptions {
  playtestRunner?: (argv: readonly string[], cwd: string) => Promise<ICommandResult>;
}

export async function parityCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  if (normalizedArgv[0] === "visual") {
    return parityVisualCommand(normalizedArgv, cwd);
  }
  return parityPlaytestCommand(normalizedArgv, cwd);
}

export async function parityPlaytestCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IParityPlaytestOptions = {},
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const subcommand = normalizedArgv[0];
  const commandArgv = subcommand === "playtest" ? normalizedArgv.slice(1) : normalizedArgv;
  const json = commandArgv.includes("--json");
  if (subcommand !== "playtest") {
    return diagnosticResult(
      {
        code: "TN_PARITY_SUBCOMMAND_REQUIRED",
        message: "Usage: tn parity playtest --project <path> --scenario <path> [--targets web,desktop] [--stable-artifacts] [--json]",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }

  const project = resolve(cwd, readFlag(commandArgv, "--project") ?? ".");
  const scenario = readFlag(commandArgv, "--scenario");
  if (scenario === undefined) {
    return diagnosticResult(
      {
        code: "TN_PARITY_PLAYTEST_SCENARIO_REQUIRED",
        message: "Pass --scenario <playtest.json> so the same scenario can run against each parity target.",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }
  const targets = parseTargets(readFlag(commandArgv, "--targets") ?? "web,desktop");
  if (targets === undefined || targets.length === 0) {
    return diagnosticResult(
      {
        code: "TN_PARITY_PLAYTEST_TARGETS_INVALID",
        message: "--targets must be a comma-separated list containing web, desktop, or bevy.",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }

  const outRoot = resolve(project, readFlag(commandArgv, "--out") ?? "artifacts/gameplay-parity/playtests");
  const reportPath = resolve(outRoot, `${safeFilePart(basename(scenario, ".json"))}.parity.json`);
  const playtestRunner = options.playtestRunner ?? ((args, runCwd) => playtestCommand(args, runCwd));
  const scenarioConfig = await loadPlaytestScenario(project, scenario);
  const targetResults: IParityPlaytestTargetResult[] = [];
  const diagnostics: IParityPlaytestReport["diagnostics"] = [];
  const artifactTargets: Record<string, string> = {};
  const summaries: Partial<Record<PlaytestTarget, ComparablePlaytestSummary>> = {};

  for (const target of targets) {
    const targetOut = resolve(outRoot, safeFilePart(basename(scenario, ".json")), target);
    const childArgs = [
      "--project",
      project,
      "--scenario",
      scenario,
      "--target",
      target,
      "--out",
      targetOut,
      "--stable-artifacts",
      "--json",
    ];
    const result = await playtestRunner(childArgs, cwd);
    const payload = parseJsonObject(result.stdout);
    if (payload !== undefined) {
      summaries[target] = payload;
    }
    const pass = result.exitCode === 0 && getBoolean(payload, "pass");
    const summaryPath = getNestedString(payload, ["artifacts", "summary"]);
    if (summaryPath !== undefined) {
      artifactTargets[target] = summaryPath;
    }
    const targetDiagnostics = extractDiagnostics(payload);
    targetResults.push({
      artifactDirectory: targetOut,
      diagnostics: targetDiagnostics,
      exitCode: result.exitCode,
      pass,
      ...(summaryPath === undefined ? {} : { summaryPath }),
      target,
    });
    if (!pass) {
      diagnostics.push({
        code: "TN_GAMEPLAY_PARITY_TARGET_FAILED",
        message: `Parity playtest target '${target}' failed for scenario '${scenario}'.`,
        severity: "error",
        target,
      });
    }
  }

  if (scenarioConfig.parity !== undefined && summaries.web !== undefined && summaries.desktop !== undefined) {
    const comparison = comparePlaytestParity(summaries.web, summaries.desktop, scenarioConfig.parity);
    diagnostics.push(...comparison.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      severity: diagnostic.severity,
    })));
  }

  const pass = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  const report: IParityPlaytestReport = {
    artifacts: { report: reportPath, targets: artifactTargets },
    code: pass ? "TN_PARITY_PLAYTEST_OK" : "TN_PARITY_PLAYTEST_FAILED",
    diagnostics,
    pass,
    project,
    scenario,
    targets: targetResults,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return {
    exitCode: pass ? 0 : 1,
    stdout: json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${pass ? "Parity playtest passed" : "Parity playtest failed"}: ${scenario}. Report: ${reportPath}\n`,
  };
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function parseTargets(value: string): PlaytestTarget[] | undefined {
  const targets = value.split(",").map((target) => target.trim()).filter(Boolean);
  if (targets.some((target) => target !== "web" && target !== "desktop" && target !== "bevy")) {
    return undefined;
  }
  return targets as PlaytestTarget[];
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function getBoolean(value: Record<string, unknown> | undefined, key: string): boolean {
  return value?.[key] === true;
}

function getNestedString(value: Record<string, unknown> | undefined, path: readonly string[]): string | undefined {
  let current: unknown = value;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return typeof current === "string" ? current : undefined;
}

function extractDiagnostics(value: Record<string, unknown> | undefined): IParityPlaytestTargetResult["diagnostics"] {
  const diagnostics = value?.diagnostics;
  if (!Array.isArray(diagnostics)) {
    return [];
  }
  return diagnostics.filter(isRecord).flatMap((diagnostic) => {
    if (typeof diagnostic.code !== "string" || typeof diagnostic.message !== "string") {
      return [];
    }
    return [{
      code: diagnostic.code,
      message: diagnostic.message,
      ...(typeof diagnostic.severity === "string" ? { severity: diagnostic.severity } : {}),
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
