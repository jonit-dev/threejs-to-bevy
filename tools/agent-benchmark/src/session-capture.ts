import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateSession } from "./schemas.js";
import { type BenchmarkStopReason, type IBenchmarkSession } from "./types.js";

const CACHED_INPUT_TOKEN_WEIGHT = 0.1;

export interface ICaptureBenchmarkSessionOptions {
  eventsPath: string;
  iterationCount?: number;
  notes?: string;
  outPath: string;
  playability?: number;
  stopReason?: BenchmarkStopReason;
  templatePath: string;
  visual?: number;
}

export interface ICaptureBenchmarkSessionResult {
  eventsPath: string;
  generatedArtifactTokensExcluded: true;
  ok: boolean;
  outPath: string;
  session: IBenchmarkSession;
}

export async function captureBenchmarkSession(options: ICaptureBenchmarkSessionOptions): Promise<ICaptureBenchmarkSessionResult> {
  const eventsPath = resolve(options.eventsPath);
  const outPath = resolve(options.outPath);
  const template = JSON.parse(await readFile(resolve(options.templatePath), "utf8")) as IBenchmarkSession;
  const events = (await readFile(eventsPath, "utf8")).split(/\r?\n/).filter(Boolean).map(parseEvent);
  const usage = events.map(readUsage).filter((value): value is IUsage => value !== undefined);
  if (usage.length === 0) throw new Error("Codex events do not contain a completed turn with token usage.");
  const commands = events.map(readCompletedCommand).filter((value): value is ICompletedCommand => value !== undefined);
  const inputTokens = sum(usage.map((value) => value.inputTokens));
  const cachedInputTokens = sum(usage.map((value) => value.cachedInputTokens));
  const outputTokens = sum(usage.map((value) => value.outputTokens));
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);
  const session: IBenchmarkSession = {
    ...template,
    cachedInputTokens,
    costWeightedTokens: uncachedInputTokens + (cachedInputTokens * CACHED_INPUT_TOKEN_WEIGHT) + outputTokens,
    failedCommandCount: commands.filter((command) => command.exitCode !== 0).length,
    finishedAt: new Date().toISOString(),
    humanRubric: {
      ...template.humanRubric,
      notes: options.notes ?? template.humanRubric.notes,
      playability: options.playability ?? template.humanRubric.playability,
      visual: options.visual ?? template.humanRubric.visual,
    },
    inputTokens,
    iterationCount: options.iterationCount ?? template.iterationCount,
    outputTokens,
    stopReason: options.stopReason ?? template.stopReason,
    tokenAccounting: "codex-turn-usage",
    tokenCount: inputTokens + outputTokens,
    toolOutputBytes: sum(commands.map((command) => Buffer.byteLength(command.output, "utf8"))),
    toolStepCount: commands.length,
    uncachedInputTokens,
  };
  const validation = validateSession(session);
  if (!validation.ok) throw new Error(`Captured session is invalid: ${validation.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
  await writeFile(outPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  return { eventsPath, generatedArtifactTokensExcluded: true, ok: true, outPath, session };
}

interface IUsage { cachedInputTokens: number; inputTokens: number; outputTokens: number }
interface ICompletedCommand { exitCode: number; output: string }

function parseEvent(line: string): unknown {
  try { return JSON.parse(line) as unknown; } catch { throw new Error("Codex events contain invalid JSONL."); }
}

function readUsage(value: unknown): IUsage | undefined {
  if (!isRecord(value) || value.type !== "turn.completed" || !isRecord(value.usage)) return undefined;
  const inputTokens = readNonNegativeNumber(value.usage.input_tokens);
  const cachedInputTokens = readNonNegativeNumber(value.usage.cached_input_tokens);
  const outputTokens = readNonNegativeNumber(value.usage.output_tokens);
  return inputTokens === undefined || cachedInputTokens === undefined || outputTokens === undefined ? undefined : { cachedInputTokens, inputTokens, outputTokens };
}

function readCompletedCommand(value: unknown): ICompletedCommand | undefined {
  if (!isRecord(value) || value.type !== "item.completed" || !isRecord(value.item) || value.item.type !== "command_execution") return undefined;
  if ((value.item.status !== "completed" && value.item.status !== "failed") || typeof value.item.exit_code !== "number") return undefined;
  return { exitCode: value.item.exit_code, output: typeof value.item.aggregated_output === "string" ? value.item.aggregated_output : "" };
}

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function sum(values: readonly number[]): number { return values.reduce((total, value) => total + value, 0); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
