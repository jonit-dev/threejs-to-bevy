import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { runCommand, type CommandResult, type StepSummary, type VerificationDiagnostic } from "./runner.js";

export interface AgentIoBudgetCommand {
  args: readonly string[];
  budgetBytes?: number;
  command: string;
  cwd?: string;
  name: string;
  timeoutMs?: number;
}

export interface AgentIoBudgetResult {
  diagnostics: VerificationDiagnostic[];
  measurements: AgentIoBudgetMeasurement[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

export interface AgentIoBudgetMeasurement {
  budgetBytes: number;
  command: string;
  exitCode: number;
  name: string;
  stdoutBytes: number;
}

const DEFAULT_STDOUT_BUDGET_BYTES = 8 * 1024;

export async function runAgentIoBudgetGate(options: {
  commands?: readonly AgentIoBudgetCommand[];
  reportPath?: string;
  root?: string;
  runner?: (command: AgentIoBudgetCommand, root: string) => Promise<CommandResult>;
} = {}): Promise<AgentIoBudgetResult> {
  const root = resolve(options.root ?? process.cwd());
  const reportPath = options.reportPath ?? resolve(root, "tools/verify/artifacts/agent-io/verification-report.json");
  const commands = options.commands ?? await defaultCommands(root);
  const runner = options.runner ?? defaultRunner;
  const diagnostics: VerificationDiagnostic[] = [];
  const measurements: AgentIoBudgetMeasurement[] = [];
  const steps: StepSummary[] = [];

  for (const command of commands) {
    const result = await runner(command, root);
    const stdoutBytes = Buffer.byteLength(result.stdout, "utf8");
    const budgetBytes = command.budgetBytes ?? DEFAULT_STDOUT_BUDGET_BYTES;
    const commandText = [command.command, ...command.args].join(" ");
    measurements.push({
      budgetBytes,
      command: commandText,
      exitCode: result.exitCode,
      name: command.name,
      stdoutBytes,
    });
    steps.push({
      budgetMs: budgetBytes,
      budgetStatus: stdoutBytes <= budgetBytes ? "within-budget" : "over-budget",
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      name: command.name,
      stderr: tail(result.stderr),
      stdout: tail(result.stdout),
    });
    if (result.exitCode !== 0) {
      diagnostics.push({
        code: "TN_AGENT_IO_COMMAND_FAILED",
        message: `Agent IO budget command '${command.name}' failed with exit code ${result.exitCode}.`,
        severity: "error",
        step: command.name,
        suggestedFix: "Fix the documented agent command before measuring stdout budget.",
      });
    }
    if (stdoutBytes > budgetBytes) {
      diagnostics.push({
        code: "TN_AGENT_IO_STDOUT_BUDGET_EXCEEDED",
        message: `${command.name} wrote ${stdoutBytes} stdout bytes; budget is ${budgetBytes}.`,
        severity: "error",
        step: command.name,
        suggestedFix: "Move deep logs to artifacts and print compact diagnostics, counts, and artifact paths only.",
      });
    }
  }

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: { measurements },
    code: ok ? "TN_VERIFY_AGENT_IO_OK" : "TN_VERIFY_AGENT_IO_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools agentIoBudget",
    ok,
    schema: "threenative.verify.agent-io",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps,
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");

  return { diagnostics, measurements, ok, reportPath, steps };
}

async function defaultCommands(root: string): Promise<AgentIoBudgetCommand[]> {
  const project = await prepareStarterProject(root);
  const reportSummary = join(project, "artifacts/playtest/player-KeyW/latest/summary.json");
  await mkdir(dirname(reportSummary), { recursive: true });
  await writeFile(reportSummary, `${JSON.stringify({
    artifacts: {
      directory: dirname(reportSummary),
      effectLog: join(dirname(reportSummary), "effect-log.json"),
      observations: join(dirname(reportSummary), "observations.json"),
      summary: reportSummary,
    },
    assertions: [],
    code: "TN_PLAYTEST_OK",
    counts: {
      assertionCount: 0,
      consoleErrorCount: 0,
      diagnosticCount: 0,
      effectCount: 0,
      networkErrorCount: 0,
      runtimeDiagnosticCount: 0,
    },
    debugColliders: false,
    diagnostics: [],
    distance: 1,
    durationMs: 1,
    entity: "player",
    expectMoved: false,
    finalPoses: [{ entity: "player", position: [0, 0, 0], tick: 1 }],
    frames: 1,
    input: "KeyW",
    movementThreshold: 0.01,
    pass: true,
    reproduceCommand: "tn playtest --project . --entity player --press KeyW --json",
    runtime: "web",
    scenario: "player-KeyW",
    schema: "threenative.playtest-summary",
    target: "web",
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");

  return [
    { args: ["authoring", "validate", "--project", project, "--json"], command: "node", name: "tn authoring validate --json" },
    { args: ["game", "plan", "--goal", "small collector", "--project", project, "--json"], command: "node", name: "tn game plan --json" },
    { args: ["cookbook", "show", "player-move-wasd", "--json"], command: "node", name: "tn cookbook show --json" },
    { args: ["playtest", "report", "--project", project, "--latest", "--scenario", "player-KeyW", "--json"], command: "node", name: "tn playtest report --latest --json", budgetBytes: 4096 },
    { args: ["iterate", "--project", project, "--skip-playtest", "--json"], command: "node", name: "tn iterate --json" },
  ].map((command) => ({ ...command, args: [resolve(root, "packages/cli/dist/index.js"), ...command.args] }));
}

async function prepareStarterProject(root: string): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), "tn-agent-io-starter-"));
  const templateRoot = resolve(root, "templates/structured-source-starter");
  await copyDirectory(templateRoot, project);
  return project;
}

async function copyDirectory(from: string, to: string): Promise<void> {
  const { cp } = await import("node:fs/promises");
  await cp(from, to, { recursive: true });
}

async function defaultRunner(command: AgentIoBudgetCommand, root: string): Promise<CommandResult> {
  return runCommand({
    args: command.args,
    command: command.command,
    cwd: command.cwd ?? root,
    timeoutMs: command.timeoutMs ?? 120_000,
  });
}

function tail(value: string): string {
  return value.length <= 4000 ? value : value.slice(-4000);
}

if (process.argv[1] !== undefined && process.argv[1].endsWith("agentIoBudget.js")) {
  const result = await runAgentIoBudgetGate();
  process.stdout.write(`${JSON.stringify({
    diagnostics: result.diagnostics,
    measurements: result.measurements,
    ok: result.ok,
    reportPath: result.reportPath,
  }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
