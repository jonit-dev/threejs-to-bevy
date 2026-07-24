import { spawn, type ChildProcess } from "node:child_process";

export interface IOwnedCommandResult {
  exitCode: number;
  interruptedBy?: NodeJS.Signals;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

interface IRunOwnedCommandOptions {
  cwd: string;
  maxOutputBytes?: number;
  registerSignals?: (interrupt: (signal: NodeJS.Signals) => void) => () => void;
  timeoutMs?: number;
}

export async function runOwnedCommand(
  executable: string,
  args: readonly string[],
  options: IRunOwnedCommandOptions,
): Promise<IOwnedCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const maxOutputBytes = options.maxOutputBytes ?? 256 * 1024;
    let stdout = "";
    let stderr = "";
    let interruptedBy: NodeJS.Signals | undefined;
    let timedOut = false;
    let settled = false;
    let forceTimer: NodeJS.Timeout | undefined;
    const append = (current: string, chunk: Buffer): string => {
      const combined = `${current}${chunk.toString("utf8")}`;
      if (Buffer.byteLength(combined, "utf8") <= maxOutputBytes) return combined;
      return Buffer.from(combined, "utf8").subarray(-maxOutputBytes).toString("utf8");
    };
    child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });

    const interrupt = (signal: NodeJS.Signals): void => {
      if (interruptedBy !== undefined) return;
      interruptedBy = signal;
      terminateProcessTree(child, signal);
      forceTimer = setTimeout(() => terminateProcessTree(child, "SIGKILL"), 1_000);
      forceTimer.unref();
    };
    const unregisterSignals = (options.registerSignals ?? registerProcessSignals)(interrupt);
    const timeout = setTimeout(() => {
      timedOut = true;
      interrupt("SIGTERM");
    }, options.timeoutMs ?? 15 * 60_000);
    timeout.unref();

    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceTimer !== undefined) clearTimeout(forceTimer);
      unregisterSignals();
      terminateProcessTree(child, interruptedBy ?? "SIGTERM");
      forceTimer = setTimeout(() => {
        terminateProcessTree(child, "SIGKILL");
        setTimeout(() => {
          resolve({
            exitCode: interruptedBy === undefined ? exitCode ?? 1 : exitCode === null || exitCode === 0 ? 1 : exitCode,
            ...(interruptedBy === undefined ? {} : { interruptedBy }),
            stderr,
            stdout,
            timedOut,
          });
        }, 50);
      }, 100);
    };
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceTimer !== undefined) clearTimeout(forceTimer);
      unregisterSignals();
      reject(error);
    });
    // A descendant can inherit the leader's stdout/stderr handles and keep the
    // ChildProcess "close" event pending after the leader has exited. Start
    // owned-tree cleanup from the leader's exit so a successful leader cannot
    // turn a bounded proof into a false timeout success.
    child.once("exit", finish);
  });
}

function registerProcessSignals(interrupt: (signal: NodeJS.Signals) => void): () => void {
  const onSigint = (): void => interrupt("SIGINT");
  const onSigterm = (): void => interrupt("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);
  return () => {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  };
}

function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", signal === "SIGKILL" ? "/f" : ""].filter(Boolean), {
      shell: false,
      stdio: "ignore",
    });
    killer.unref();
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}
