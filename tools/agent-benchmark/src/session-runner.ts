import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { constants, createWriteStream } from "node:fs";
import { access, chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { createInterface } from "node:readline";

import { BENCHMARK_PROTOCOL, type BenchmarkRunnerStopCause } from "./protocol.js";
import { captureBenchmarkSession } from "./session-capture.js";
import { type BenchmarkCondition } from "./types.js";

export interface IRunFreshSessionOptions {
  candidate: string;
  codexBin?: string;
  condition: BenchmarkCondition;
  maxRawTokens?: number;
  maxToolSteps?: number;
  model?: string;
  reasoningEffort?: string;
  root?: string;
  tokenActiveToolGraceMs?: number;
}

export interface IRunFreshSessionResult {
  candidate: string;
  eventsPath: string;
  ok: boolean;
  protocolPath: string;
  rawEventsPath: string;
  runnerResultPath: string;
  sessionPath: string;
  stopCause: BenchmarkRunnerStopCause;
  threadId?: string;
  tokenCount: number;
  toolStepCount: number;
  toolStepLimitExceeded: boolean;
  turnId?: string;
  workspaceCliPath?: string;
}

interface IJsonRpcMessage {
  error?: { code?: number; message?: string };
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
}

interface ITokenUsage {
  cachedInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const TOOL_ITEM_TYPES = new Set([
  "commandExecution",
  "dynamicToolCall",
  "fileChange",
  "mcpToolCall",
  "webSearch",
]);

export async function runFreshSession(options: IRunFreshSessionOptions): Promise<IRunFreshSessionResult> {
  const candidate = resolve(options.candidate);
  const root = resolve(options.root ?? process.cwd());
  const eventsPath = join(candidate, "codex-events.jsonl");
  const rawEventsPath = join(candidate, "codex-app-events.jsonl");
  const runnerResultPath = join(candidate, "runner-result.json");
  const sessionPath = join(candidate, "session.json");
  const protocolPath = join(candidate, "benchmark-protocol.json");
  await assertFreshOutputs([eventsPath, rawEventsPath, runnerResultPath, sessionPath, protocolPath]);

  const maxToolSteps = options.maxToolSteps ?? BENCHMARK_PROTOCOL.maxToolSteps;
  const maxRawTokens = options.maxRawTokens ?? BENCHMARK_PROTOCOL.maxRawTokens;
  const model = options.model ?? BENCHMARK_PROTOCOL.model;
  const reasoningEffort = options.reasoningEffort ?? BENCHMARK_PROTOCOL.reasoningEffort;
  const tokenInterruptThreshold = Math.max(0, maxRawTokens - BENCHMARK_PROTOCOL.tokenInterruptReserve);
  const codexBin = await resolveExecutable(options.codexBin ?? "codex");
  const workspaceCliPath = resolve(root, "packages/cli/dist/index.js");
  if (options.condition !== "vanilla") await initializeThreeNativeCandidate(candidate, options.condition, workspaceCliPath);

  const benchmarkBin = join(candidate, ".benchmark-bin");
  await mkdir(benchmarkBin, { recursive: true });
  const wrapperPath = join(benchmarkBin, "tn");
  await writeFile(wrapperPath, `#!/bin/sh\nexec "${process.execPath}" "${workspaceCliPath}" "$@"\n`, "utf8");
  await chmod(wrapperPath, 0o755);
  for (const nestedAgent of ["codex", "claude", "gemini"]) {
    const wrapperPath = join(benchmarkBin, nestedAgent);
    await writeFile(wrapperPath, "#!/bin/sh\necho 'Nested agent sessions are disabled by the benchmark protocol.' >&2\nexit 126\n", "utf8");
    await chmod(wrapperPath, 0o755);
  }

  const protocol = {
    ...BENCHMARK_PROTOCOL,
    maxRawTokens,
    maxToolSteps,
    model,
    reasoningEffort,
  };
  await writeFile(protocolPath, `${JSON.stringify(protocol, null, 2)}\n`, { encoding: "utf8", flag: "wx" });

  const prompt = await sessionPrompt(candidate, maxToolSteps, maxRawTokens);
  const isolatedHome = await createIsolatedHome();
  const childEnv = { ...process.env };
  delete childEnv.FORCE_COLOR;
  delete childEnv.PLAYWRIGHT_BROWSERS_PATH;
  const rawEvents = createWriteStream(rawEventsPath, { encoding: "utf8", flags: "wx" });
  const child = spawn(codexBin, [
    "app-server",
    "--listen",
    "stdio://",
    "--config",
    'project_root_markers=["benchmark-observation-protocol.json"]',
    "--disable",
    "plugins",
    "--disable",
    "plugin_sharing",
  ], {
    cwd: candidate,
    env: {
      ...childEnv,
      CODEX_HOME: join(isolatedHome, ".codex"),
      HOME: isolatedHome,
      NO_COLOR: "1",
      PATH: `${benchmarkBin}${delimiter}${process.env.PATH ?? ""}`,
    },
    stdio: ["pipe", "pipe", "inherit"],
  });

  const events: string[] = [];
  const pending = new Map<number, { reject: (error: Error) => void; resolve: (value: unknown) => void }>();
  let requestId = 0;
  let threadId: string | undefined;
  let codexVersion: string | undefined;
  let turnId: string | undefined;
  let toolStepCount = 0;
  const startedToolIds = new Set<string>();
  const activeToolIds = new Set<string>();
  let latestUsage: ITokenUsage = { cachedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let stopCause: BenchmarkRunnerStopCause | undefined;
  let interruptRequested = false;
  let tokenInterruptPending = false;
  let tokenInterruptTimer: ReturnType<typeof setTimeout> | undefined;
  let completedResolve: (() => void) | undefined;
  let completedReject: ((error: Error) => void) | undefined;
  const completed = new Promise<void>((resolveCompleted, rejectCompleted) => {
    completedResolve = resolveCompleted;
    completedReject = rejectCompleted;
  });

  const request = (method: string, params: unknown): Promise<unknown> => {
    const id = ++requestId;
    child.stdin.write(`${JSON.stringify({ id, jsonrpc: "2.0", method, params })}\n`);
    return new Promise((resolveRequest, rejectRequest) => pending.set(id, { reject: rejectRequest, resolve: resolveRequest }));
  };
  const notify = (method: string, params?: unknown): void => {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) })}\n`);
  };
  const requestInterrupt = (cause: BenchmarkRunnerStopCause): void => {
    if (interruptRequested || threadId === undefined || turnId === undefined) return;
    interruptRequested = true;
    if (tokenInterruptTimer !== undefined) {
      clearTimeout(tokenInterruptTimer);
      tokenInterruptTimer = undefined;
    }
    stopCause = cause;
    void request("turn/interrupt", { threadId, turnId }).catch((error: Error) => completedReject?.(error));
  };
  const requestTokenInterruptWhenIdle = (): void => {
    tokenInterruptPending = true;
    if (tokenInterruptTimer !== undefined) return;
    const delay = activeToolIds.size > 0 ? (options.tokenActiveToolGraceMs ?? 60_000) : 50;
    tokenInterruptTimer = setTimeout(() => {
      tokenInterruptTimer = undefined;
      requestInterrupt("token-cap");
    }, delay);
  };

  createInterface({ input: child.stdout }).on("line", (line) => {
    rawEvents.write(`${line}\n`);
    let message: IJsonRpcMessage;
    try {
      message = JSON.parse(line) as IJsonRpcMessage;
    } catch {
      completedReject?.(new Error("Codex app-server emitted invalid JSONL."));
      return;
    }
    if (message.id !== undefined) {
      const numericId = typeof message.id === "number" ? message.id : Number(message.id);
      const waiter = pending.get(numericId);
      if (waiter !== undefined) {
        pending.delete(numericId);
        if (message.error !== undefined) waiter.reject(new Error(message.error.message ?? `JSON-RPC ${numericId} failed.`));
        else waiter.resolve(message.result);
      }
      return;
    }
    if (message.method === "thread/tokenUsage/updated") {
      const usage = readTokenUsage(message.params);
      if (usage !== undefined) {
        latestUsage = usage;
        if (usage.totalTokens >= tokenInterruptThreshold) requestTokenInterruptWhenIdle();
      }
      return;
    }
    if (message.method === "turn/started") {
      const startedTurnId = readNotificationTurnId(message.params);
      if (startedTurnId !== undefined) turnId = startedTurnId;
      return;
    }
    if (message.method === "thread/goal/updated" && readGoalStatus(message.params) === "budgetLimited") {
      stopCause = "token-cap";
      return;
    }
    if (message.method === "item/completed") {
      const item = readItem(message.params);
      if (item !== undefined) {
        if (typeof item.id === "string") {
          activeToolIds.delete(item.id);
        }
        events.push(JSON.stringify(normalizeCompletedItem(item)));
        if (tokenInterruptPending && activeToolIds.size === 0) requestInterrupt("token-cap");
      }
      return;
    }
    if (message.method === "item/started") {
      const item = readItem(message.params);
      if (item !== undefined && TOOL_ITEM_TYPES.has(String(item.type))) {
        const itemId = typeof item.id === "string" ? item.id : `${String(item.type)}:${toolStepCount}`;
        if (!startedToolIds.has(itemId)) {
          startedToolIds.add(itemId);
          if (item.type === "commandExecution") {
            if (tokenInterruptPending) requestInterrupt("token-cap");
            activeToolIds.add(itemId);
            if (tokenInterruptPending) requestTokenInterruptWhenIdle();
          }
          toolStepCount += 1;
          events.push(JSON.stringify(normalizeStartedItem(item)));
          if (toolStepCount >= maxToolSteps) requestInterrupt("tool-cap");
        }
      }
      return;
    }
    if (message.method === "turn/completed") {
      stopCause ??= "turn-completed";
      events.push(JSON.stringify({
        type: "turn.completed",
        usage: {
          cached_input_tokens: latestUsage.cachedInputTokens,
          input_tokens: latestUsage.inputTokens,
          output_tokens: latestUsage.outputTokens,
        },
      }));
      completedResolve?.();
    }
  });
  child.once("error", (error) => completedReject?.(error));
  child.once("exit", (code) => {
    if (stopCause === undefined) completedReject?.(new Error(`Codex app-server exited before turn completion (exit ${String(code)}).`));
  });

  try {
    await request("initialize", {
      capabilities: { experimentalApi: true, requestAttestation: false },
      clientInfo: { name: "threenative-agent-benchmark", title: "ThreeNative Agent Benchmark", version: "1" },
    });
    notify("initialized");
    const thread = readThreadStart(await request("thread/start", {
      approvalPolicy: "never",
      config: {
        features: {
          apps: false,
          browser_use: false,
          browser_use_external: false,
          computer_use: false,
          image_generation: false,
          multi_agent: false,
          plugins: false,
          remote_plugin: false,
        },
        tool_output_token_limit: BENCHMARK_PROTOCOL.toolOutputTokenLimit,
      },
      cwd: candidate,
      ephemeral: false,
      historyMode: "legacy",
      model,
      sandbox: "danger-full-access",
    }));
    threadId = thread.threadId;
    codexVersion = thread.codexVersion;
    await request("thread/goal/set", {
      objective: "Complete the frozen benchmark prompt and required proof within the authoritative token and tool caps.",
      status: "active",
      threadId,
      tokenBudget: maxRawTokens,
    });
    const turn = readTurnStart(await request("turn/start", {
      effort: reasoningEffort,
      input: [{ text: prompt, text_elements: [], type: "text" }],
      threadId,
    }));
    turnId = turn.turnId;
    await completed;
  } catch (error) {
    stopCause ??= "failed-setup";
    throw error;
  } finally {
    child.stdin.end();
    child.kill("SIGTERM");
    await new Promise<void>((resolveClose, rejectClose) => {
      rawEvents.once("error", rejectClose);
      rawEvents.end(resolveClose);
    });
    await rm(isolatedHome, { force: true, recursive: true });
  }

  const eventsText = events.length === 0 ? "" : `${events.join("\n")}\n`;
  await writeFile(eventsPath, eventsText, { encoding: "utf8", flag: "wx" });
  const authoritativeStopCause = stopCause ?? "failed-setup";
  const runnerResult = {
    codexVersion,
    eventsSha256: createHash("sha256").update(eventsText).digest("hex"),
    finishedAt: new Date().toISOString(),
    protocol,
    schema: "threenative.agent-benchmark-runner-result",
    stopCause: authoritativeStopCause,
    threadId,
    tokenUsage: latestUsage,
    toolStepCount,
    turnId,
    version: 1,
  };
  await writeFile(runnerResultPath, `${JSON.stringify(runnerResult, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await captureBenchmarkSession({
    eventsPath,
    outPath: sessionPath,
    runnerResultPath,
    templatePath: join(candidate, "session.template.json"),
  });
  return {
    candidate,
    eventsPath,
    ok: authoritativeStopCause !== "failed-setup",
    protocolPath,
    rawEventsPath,
    runnerResultPath,
    sessionPath,
    stopCause: authoritativeStopCause,
    threadId,
    tokenCount: latestUsage.totalTokens,
    toolStepCount,
    toolStepLimitExceeded: authoritativeStopCause === "tool-cap",
    turnId,
    workspaceCliPath,
  };
}

async function assertFreshOutputs(paths: readonly string[]): Promise<void> {
  const existing = [];
  for (const path of paths) if (await pathExists(path)) existing.push(path);
  if (existing.length > 0) throw new Error(`Benchmark run outputs are append-only; refusing to overwrite: ${existing.join(", ")}`);
}

async function createIsolatedHome(): Promise<string> {
  const isolatedHome = await mkdtemp(join(tmpdir(), "tn-benchmark-codex-home-"));
  const isolatedCodexHome = join(isolatedHome, ".codex");
  await mkdir(isolatedCodexHome, { recursive: true });
  const sourceCodexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  for (const credential of ["auth.json"]) {
    const source = join(sourceCodexHome, credential);
    if (await pathExists(source)) await symlink(source, join(isolatedCodexHome, credential));
  }
  const configuredPlaywrightBrowsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const playwrightBrowsers = configuredPlaywrightBrowsers !== undefined && configuredPlaywrightBrowsers !== "0"
    ? resolve(configuredPlaywrightBrowsers)
    : join(homedir(), ".cache", "ms-playwright");
  if (await pathExists(playwrightBrowsers)) {
    await mkdir(join(isolatedHome, ".cache"), { recursive: true });
    await symlink(playwrightBrowsers, join(isolatedHome, ".cache", "ms-playwright"));
  }
  return isolatedHome;
}

function readThreadStart(value: unknown): { codexVersion?: string; threadId: string } {
  if (!isRecord(value) || !isRecord(value.thread) || typeof value.thread.id !== "string") throw new Error("Codex thread/start returned no thread id.");
  return { ...(typeof value.thread.cliVersion === "string" ? { codexVersion: value.thread.cliVersion } : {}), threadId: value.thread.id };
}

function readTurnStart(value: unknown): { turnId: string } {
  if (!isRecord(value) || !isRecord(value.turn) || typeof value.turn.id !== "string") throw new Error("Codex turn/start returned no turn id.");
  return { turnId: value.turn.id };
}

function readTokenUsage(value: unknown): ITokenUsage | undefined {
  if (!isRecord(value) || !isRecord(value.tokenUsage) || !isRecord(value.tokenUsage.total)) return undefined;
  const usage = value.tokenUsage.total;
  const inputTokens = readNonNegativeNumber(usage.inputTokens);
  const cachedInputTokens = readNonNegativeNumber(usage.cachedInputTokens);
  const outputTokens = readNonNegativeNumber(usage.outputTokens);
  const totalTokens = readNonNegativeNumber(usage.totalTokens);
  return inputTokens === undefined || cachedInputTokens === undefined || outputTokens === undefined || totalTokens === undefined
    ? undefined
    : { cachedInputTokens, inputTokens, outputTokens, totalTokens };
}

function readItem(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) && isRecord(value.item) ? value.item : undefined;
}

function readNotificationTurnId(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.turn) && typeof value.turn.id === "string" ? value.turn.id : undefined;
}

function readGoalStatus(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.goal) && typeof value.goal.status === "string" ? value.goal.status : undefined;
}

function normalizeCompletedItem(item: Record<string, unknown>): Record<string, unknown> {
  if (item.type !== "commandExecution") return { item: { ...item, type: camelToSnake(String(item.type)) }, type: "item.completed" };
  return {
    item: {
      aggregated_output: typeof item.aggregatedOutput === "string" ? item.aggregatedOutput : "",
      exit_code: typeof item.exitCode === "number" ? item.exitCode : 0,
      status: item.status === "failed" ? "failed" : "completed",
      type: "command_execution",
    },
    type: "item.completed",
  };
}

function normalizeStartedItem(item: Record<string, unknown>): Record<string, unknown> {
  return { item: { id: item.id, type: item.type === "commandExecution" ? "command_execution" : camelToSnake(String(item.type)) }, type: "item.started" };
}

function camelToSnake(value: string): string { return value.replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`); }

function readNonNegativeNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

async function initializeThreeNativeCandidate(candidate: string, condition: Exclude<BenchmarkCondition, "vanilla">, workspaceCliPath: string): Promise<void> {
  if (await pathExists(join(candidate, "threenative.config.json"))) return;
  const transactionRoot = await mkdtemp(join(tmpdir(), "tn-benchmark-starter-"));
  const generatedProject = join(transactionRoot, "candidate-project");
  try {
    const exitCode = await spawnAndWait(process.execPath, [workspaceCliPath, "create", generatedProject, "--template", "structured-source-starter", "--authoring", condition === "typed-spec" ? "typed-spec" : "structured-source", "--json"], transactionRoot);
    if (exitCode !== 0) throw new Error(`Workspace CLI failed to create the ${condition} benchmark starter (exit ${String(exitCode)}).`);
    await cp(generatedProject, candidate, { force: true, recursive: true });
  } finally {
    await rm(transactionRoot, { force: true, recursive: true });
  }
}

async function spawnAndWait(command: string, args: readonly string[], cwd: string): Promise<number | null> {
  const child = spawn(command, args, { cwd, stdio: "ignore" });
  return new Promise<number | null>((resolveExit, reject) => { child.once("error", reject); child.once("exit", resolveExit); });
}

async function pathExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function resolveExecutable(command: string): Promise<string> {
  if (command.includes("/")) return resolve(command);
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const candidate = join(directory, command);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch { /* Continue through the original host PATH. */ }
  }
  throw new Error(`Unable to resolve benchmark runner executable '${command}'.`);
}

async function sessionPrompt(candidate: string, maxToolSteps: number, maxRawTokens: number): Promise<string> {
  const prompt = await readFile(join(candidate, "benchmark-prompt.txt"), "utf8");
  const operator = await readFile(join(candidate, "OPERATOR.md"), "utf8");
  const start = operator.indexOf("## Condition Notes");
  const end = operator.indexOf("## After The Agent Stops");
  if (start < 0 || end <= start) throw new Error("Prepared OPERATOR.md is missing the neutral condition/proof section.");
  const neutralInstructions = operator.slice(start, end).trim();
  return `${prompt.trim()}\n\n${neutralInstructions}\n\nSession limits: stop at ${maxToolSteps} tool-call starts or ${maxRawTokens} raw tokens, whichever comes first. Work only in this session; do not launch nested agents or agent CLIs.\n`;
}
