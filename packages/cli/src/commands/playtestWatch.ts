import { watch, type FSWatcher } from "node:fs";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { ICommandResult } from "../diagnostics.js";

export interface IPlaytestWatchEvent {
  artifact?: string;
  code?: string;
  event: "artifact" | "change" | "diagnostic" | "fail" | "pass" | "start" | "stop";
  exitCode?: number;
  maxRuns?: number;
  message?: string;
  pass?: boolean;
  path?: string;
  report?: Record<string, unknown>;
  run?: number;
  repairCommand?: string;
  summary?: string;
}

export interface IPlaytestWatchHooks {
  changes?: readonly string[];
  debounceMs?: number;
}

export async function playtestWatchCommand(options: {
  argv: readonly string[];
  cwd: string;
  failFast: boolean;
  hooks?: IPlaytestWatchHooks;
  json: boolean;
  maxRuns: number;
  passOnce: boolean;
  projectPath: string;
  runOnce(argv: readonly string[]): Promise<ICommandResult>;
}): Promise<ICommandResult> {
  const events: IPlaytestWatchEvent[] = [];
  const emit = (event: IPlaytestWatchEvent) => {
    events.push(event);
  };
  const baseArgv = stripWatchArgs(options.argv);
  const debounceMs = options.hooks?.debounceMs ?? 250;
  let runCount = 0;
  let lastExitCode = 0;
  let lastPass = false;
  emit({ event: "start", maxRuns: options.maxRuns });

  const run = async (): Promise<boolean> => {
    runCount += 1;
    emit({ event: "start", run: runCount });
    const result = await options.runOnce(baseArgv);
    lastExitCode = result.exitCode;
    const summary = parseRunReport(result.stdout);
    lastPass = result.exitCode === 0;
    if (summary.artifact !== undefined) {
      emit({ artifact: summary.artifact, event: "artifact", run: runCount });
    }
    if (summary.artifactDirectory !== undefined) {
      emit({ artifact: summary.artifactDirectory, event: "artifact", run: runCount });
    }
    for (const diagnostic of summary.diagnostics) {
      emit({
        code: diagnostic.code,
        event: "diagnostic",
        message: diagnostic.message,
        repairCommand: repairCommand(baseArgv),
        run: runCount,
      });
    }
    emit({
      ...(summary.code === undefined ? {} : { code: summary.code }),
      event: lastPass ? "pass" : "fail",
      exitCode: result.exitCode,
      pass: lastPass,
      repairCommand: lastPass ? undefined : repairCommand(baseArgv),
      ...(summary.report === undefined ? {} : { report: summary.report }),
      run: runCount,
      ...(summary.summary === undefined ? {} : { summary: summary.summary }),
    });
    return shouldStop({ failFast: options.failFast, lastPass, maxRuns: options.maxRuns, passOnce: options.passOnce, runCount });
  };

  if (await run()) {
    emit({ code: runCount >= options.maxRuns ? "TN_PLAYTEST_WATCH_LIMIT_REACHED" : undefined, event: "stop", exitCode: lastExitCode, run: runCount });
    return watchResult(events, options.json, lastPass ? 0 : lastExitCode);
  }

  const watchers = await startWatchers(options.projectPath, (path) => {
    emit({ event: "change", path });
    scheduleRun();
  });
  let timer: NodeJS.Timeout | undefined;
  let settling = Promise.resolve();
  let resolveDone: (() => void) | undefined;
  const done = new Promise<void>((resolveDonePromise) => {
    resolveDone = resolveDonePromise;
  });
  const close = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    watchers.forEach((watcher) => watcher.close());
    resolveDone?.();
  };
  const scheduleRun = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      settling = settling.then(async () => {
        if (await run()) {
          emit({ code: runCount >= options.maxRuns ? "TN_PLAYTEST_WATCH_LIMIT_REACHED" : undefined, event: "stop", exitCode: lastExitCode, run: runCount });
          close();
        }
      });
    }, debounceMs);
  };

  for (const change of options.hooks?.changes ?? []) {
    emit({ event: "change", path: change });
    scheduleRun();
  }
  await done;
  await settling;
  return watchResult(events, options.json, lastPass ? 0 : lastExitCode);
}

function shouldStop(input: { failFast: boolean; lastPass: boolean; maxRuns: number; passOnce: boolean; runCount: number }): boolean {
  return input.runCount >= input.maxRuns || (input.passOnce && input.lastPass) || (input.failFast && !input.lastPass);
}

async function startWatchers(projectPath: string, onChange: (path: string) => void): Promise<FSWatcher[]> {
  const paths = await existingPaths([
    join(projectPath, "content"),
    join(projectPath, "src", "scripts"),
    join(projectPath, "playtests"),
    join(projectPath, ".threenative", "playtests"),
  ]);
  return paths.map((path) => watch(path, { persistent: true, recursive: true }, (_event, filename) => {
    onChange(filename === null ? path : join(path, filename.toString()));
  }));
}

async function existingPaths(paths: readonly string[]): Promise<string[]> {
  const result: string[] = [];
  for (const path of paths) {
    try {
      await access(path);
      result.push(path);
    } catch {
      // Missing optional source roots should not block watch mode.
    }
  }
  return result;
}

function stripWatchArgs(argv: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--watch" || arg === "--fail-fast" || arg === "--pass-once") {
      continue;
    }
    if (arg === "--max-runs") {
      index += 1;
      continue;
    }
    result.push(arg);
  }
  return result;
}

function parseRunReport(stdout: string): {
  artifact?: string;
  artifactDirectory?: string;
  code?: string;
  diagnostics: Array<{ code?: string; message?: string }>;
  report?: Record<string, unknown>;
  summary?: string;
} {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const artifacts = typeof record.artifacts === "object" && record.artifacts !== null && !Array.isArray(record.artifacts)
        ? record.artifacts as Record<string, unknown>
        : undefined;
      return {
        artifact: typeof record.artifact === "string" ? record.artifact : undefined,
        artifactDirectory: typeof artifacts?.directory === "string" ? artifacts.directory : undefined,
        ...(typeof record.code === "string" ? { code: record.code } : {}),
        diagnostics: Array.isArray(record.diagnostics)
          ? record.diagnostics
            .filter((diagnostic): diagnostic is Record<string, unknown> => typeof diagnostic === "object" && diagnostic !== null && !Array.isArray(diagnostic))
            .map((diagnostic) => ({
              code: typeof diagnostic.code === "string" ? diagnostic.code : undefined,
              message: typeof diagnostic.message === "string" ? diagnostic.message : undefined,
            }))
          : [],
        report: record,
        summary: typeof record.scenario === "string" ? record.scenario : typeof record.message === "string" ? record.message : undefined,
      };
    }
  } catch {
    // Text-mode or invalid output still gets a stable run event.
  }
  return { diagnostics: [] };
}

function repairCommand(argv: readonly string[]): string {
  return `tn playtest ${argv.join(" ")}`;
}

function watchResult(events: readonly IPlaytestWatchEvent[], json: boolean, exitCode: number): ICommandResult {
  return {
    exitCode,
    stdout: json
      ? `${events.map((event) => JSON.stringify(withoutUndefined(event))).join("\n")}\n`
      : `${events.map(renderTextEvent).join("\n")}\n`,
  };
}

function renderTextEvent(event: IPlaytestWatchEvent): string {
  if (event.event === "pass" || event.event === "fail") {
    return `playtest run ${event.run ?? "?"}: ${event.event}`;
  }
  if (event.event === "change") {
    return `playtest change: ${event.path ?? "(unknown)"}`;
  }
  return `playtest ${event.event}`;
}

function withoutUndefined(value: IPlaytestWatchEvent): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export function readPlaytestWatchMaxRuns(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
}

export function resolveWatchProjectPath(cwd: string, value: string | undefined): string {
  return resolve(cwd, value ?? ".");
}
