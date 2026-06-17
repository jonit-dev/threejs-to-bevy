import { spawn, type ChildProcess } from "node:child_process";

export interface CommandResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface CommandOptions {
  args: readonly string[];
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  name?: string;
  timeoutMs?: number;
}

export interface StepSummary {
  durationMs: number;
  exitCode: number;
  name: string;
  stderr: string;
  stdout: string;
}

export interface VerificationDiagnostic {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
  step?: string;
  suggestedFix?: string;
}

export interface VerificationReport<TArtifacts extends Record<string, unknown> = Record<string, unknown>> {
  artifacts: TArtifacts;
  code: string;
  diagnostics: VerificationDiagnostic[];
  generatedBy: string;
  ok: boolean;
  schema: string;
  startedAt: string;
  status: "pass" | "fail";
  steps: StepSummary[];
  version: string;
}

export function summarize(result: CommandResult): Omit<StepSummary, "name"> {
  return {
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    stderr: tail(result.stderr),
    stdout: tail(result.stdout),
  };
}

export function runCommand(options: CommandOptions): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolveResult({
        durationMs: Date.now() - startedAt,
        exitCode: code ?? (signal === null ? 1 : 124),
        stderr,
        stdout,
      });
    });
  });
}

export async function runStep(
  name: string,
  command: string,
  args: readonly string[],
  options: Omit<CommandOptions, "args" | "command" | "name">,
): Promise<{ ok: boolean; result: CommandResult; summary: StepSummary }> {
  const result = await runCommand({ ...options, args, command, name });
  return {
    ok: result.exitCode === 0,
    result,
    summary: { ...summarize(result), name },
  };
}

export function stepFailureDiagnostic(
  step: StepSummary,
  codePrefix: string,
): VerificationDiagnostic {
  return {
    code: `${codePrefix}_STEP_FAILED`,
    message: `Step '${step.name}' failed with exit code ${step.exitCode}.`,
    severity: "error",
    step: step.name,
    suggestedFix: step.stderr.trim() || step.stdout.trim() || "Inspect the failing command output and rerun the gate.",
  };
}

function tail(value: string): string {
  return value.length <= 4000 ? value : value.slice(-4000);
}

export function stopProcess(child: ChildProcess): void {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGINT");
      return;
    } catch {
      // Fall through to killing the direct child.
    }
  }
  child.kill("SIGINT");
}
