import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { PNG } from "pngjs";
import { type Locator, type Page } from "playwright";

import { BENCHMARK_OBSERVATION_PROTOCOL_VERSION, requiredAssertionIds } from "./proof-contract.js";
import {
  type BenchmarkObservationAction,
  type BenchmarkObservationPhase,
  type BenchmarkObservationRole,
  type BenchmarkObservationValue,
  type IBenchmarkBrowserObservationActor,
  type IBenchmarkBrowserObservationSample,
  type IBenchmarkBrowserObservationTrace,
  type IBenchmarkDiagnostic,
} from "./types.js";

export const OBSERVATION_PROTOCOL_VERSION = BENCHMARK_OBSERVATION_PROTOCOL_VERSION;

const MAX_ACTIONS = 32;
const MAX_BINDINGS = 16;
const MAX_WAIT_MS = 2_000;
const MAX_TOTAL_WAIT_MS = 8_000;
const PASSIVE_INTERVAL_MS = 80;
const VALID_ROLES = new Set<BenchmarkObservationRole>(["base", "defender", "enemy", "goal", "grid", "objective", "player", "pushable", "unit", "wall"]);
const VALID_PHASES = new Set<BenchmarkObservationPhase>(["active", "enemy-turn", "failure", "player-turn", "success"]);
const PROHIBITED_KEYS = new Set(["assertion", "assertionid", "code", "eval", "javascript", "js", "ok", "pass", "passed", "script"]);

export type ObservationRouteAction =
  | { checkpoint?: string; key: string; type: "key-down" | "key-press" | "key-up" }
  | { button?: 0 | 1 | 2; checkpoint?: string; type: "pointer-click" | "pointer-down" | "pointer-move" | "pointer-up"; x: number; y: number }
  | { checkpoint?: string; durationMs: number; type: "wait" };

export interface IObservationRouteBinding {
  id: string;
  selector: string;
  source: "accessible-text" | "raw-snapshot" | "visible-text" | "visible-value";
}

export interface IObservationRoute {
  actions: ObservationRouteAction[];
  bindings: IObservationRouteBinding[];
  id: string;
}

export interface IObservationRouteValidationResult {
  diagnostics: IBenchmarkDiagnostic[];
  ok: boolean;
  route?: IObservationRoute;
}

export function validateObservationRoute(value: unknown, promptId: string): IObservationRouteValidationResult {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const assertionIds = new Set(requiredAssertionIds(promptId));
  const prohibitedPath = findProhibitedValue(value, assertionIds);
  if (prohibitedPath !== undefined) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_ROUTE_UNTRUSTED", `Observation route contains prohibited candidate-owned proof or executable content at '${prohibitedPath}'.`));
  }
  if (!isRecord(value) || !onlyKeys(value, ["actions", "bindings", "id"]) || !validToken(value.id)) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_ROUTE_INVALID", "Observation route must contain only a bounded id, actions, and bindings."));
    return { diagnostics, ok: false };
  }
  if (!Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > MAX_ACTIONS) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_ACTIONS_INVALID", `Observation routes require 1-${MAX_ACTIONS} actions.`));
  }
  if (!Array.isArray(value.bindings) || value.bindings.length > MAX_BINDINGS) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_BINDINGS_INVALID", `Observation routes allow at most ${MAX_BINDINGS} bindings.`));
  }
  const actions = Array.isArray(value.actions) ? value.actions.map(parseAction) : [];
  if (actions.some((item) => item === undefined)) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_ACTION_INVALID", "Each action must be a supported key, pointer, or bounded wait action."));
  }
  const totalWaitMs = actions.reduce((sum, item) => sum + (item?.type === "wait" ? item.durationMs : 0), 0);
  if (totalWaitMs > MAX_TOTAL_WAIT_MS) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_WAIT_UNBOUNDED", `Route wait time exceeds ${MAX_TOTAL_WAIT_MS}ms.`));
  }
  const checkpoints = actions.flatMap((item) => item?.checkpoint === undefined ? [] : [item.checkpoint]);
  if (new Set(checkpoints).size !== checkpoints.length) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_CHECKPOINT_DUPLICATE", "Observation action checkpoint labels must be unique within a route."));
  }
  if (checkpoints.includes("before")) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_CHECKPOINT_RESERVED", "The checkpoint label 'before' is reserved for the scorer-owned initial sample."));
  }
  const bindings = Array.isArray(value.bindings) ? value.bindings.map(parseBinding) : [];
  if (bindings.some((item) => item === undefined)) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_BINDING_INVALID", "Each binding must use a visible text/value/accessibility source or a visible-correlated raw snapshot."));
  }
  const routeIds = bindings.flatMap((item) => item === undefined ? [] : [item.id]);
  if (new Set(routeIds).size !== routeIds.length) {
    diagnostics.push(error("TN_BENCH_OBSERVATION_BINDING_DUPLICATE", "Observation binding IDs must be unique within a route."));
  }
  if (diagnostics.some((item) => item.severity === "error")) return { diagnostics, ok: false };
  return { diagnostics, ok: true, route: { actions: actions as ObservationRouteAction[], bindings: bindings as IObservationRouteBinding[], id: value.id } };
}

export async function captureBrowserObservation(options: {
  canvas: Locator;
  outDir: string;
  page: Page;
  promptId: string;
  route: IObservationRoute;
}): Promise<{ diagnostics: IBenchmarkDiagnostic[]; trace: IBenchmarkBrowserObservationTrace }> {
  await mkdir(options.outDir, { recursive: true });
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const samples: IBenchmarkBrowserObservationSample[] = [];
  const startedAt = Date.now();
  const passive: ICapturedCheckpoint[] = [];
  const hiddenBindings = new Set<string>();
  const capture = async (checkpoint: string, action?: BenchmarkObservationAction): Promise<ICapturedCheckpoint> => {
    const current = await captureCheckpoint(options, checkpoint, samples.length, startedAt, diagnostics, hiddenBindings);
    const sample: IBenchmarkBrowserObservationSample = { ...current.sample, ...(action === undefined ? {} : { action }), phase: action === undefined ? current.sample.phase : "after" };
    samples.push(sample);
    return { ...current, sample };
  };

  passive.push(await capture("before"));
  await advancePageTime(options.page, PASSIVE_INTERVAL_MS);
  passive.push(await capture("@scorer/passive-1"));
  await advancePageTime(options.page, PASSIVE_INTERVAL_MS);
  passive.push(await capture("@scorer/passive-2"));
  const passivePixelDelta = Math.max(changedPixelRatio(passive[0]!.png, passive[1]!.png), changedPixelRatio(passive[1]!.png, passive[2]!.png));
  const passiveMetricIds = changedMetricIds(passive[0]!, passive[1]!, passive[2]!);
  const passiveActorIds = changedActorIds(passive[0]!, passive[1]!, passive[2]!);

  for (let index = 0; index < options.route.actions.length; index += 1) {
    const routeAction = options.route.actions[index]!;
    const before = await capture(`@scorer/action-${index}-before`);
    const action = canonicalAction(routeAction);
    await executeAction(options.page, options.canvas, routeAction);
    const after = await capture(routeAction.checkpoint ?? `@scorer/action-${index}-after`, action);
    const activePixelDelta = changedPixelRatio(before.png, after.png);
    const activeMetricChanges = changedMetricIds(before, after);
    const visibleMetricChange = Array.from(activeMetricChanges).some((id) => !passiveMetricIds.has(id) && after.sample.visibility.metricIds.includes(id));
    const visibleActorChange = Array.from(changedActorIds(before, after)).some((id) => !passiveActorIds.has(id) && after.sample.visibility.actorIds.includes(id));
    const inputCorrelated = routeAction.type !== "wait"
      && (visibleActorChange || visibleMetricChange || activePixelDelta > Math.max(0.001, passivePixelDelta * 1.5));
    after.sample.metrics["observation.canvasChangedPixelRatio"] = activePixelDelta;
    after.sample.metrics["observation.inputCorrelated"] = inputCorrelated;
    after.sample.metrics["observation.passiveChangedPixelRatio"] = passivePixelDelta;
    after.sample.visibility.inputCorrelated = inputCorrelated;
    after.sample.visibility.metricIds.push("observation.canvasChangedPixelRatio", "observation.inputCorrelated", "observation.passiveChangedPixelRatio");
  }

  return {
    diagnostics,
    trace: {
      observationProtocolVersion: OBSERVATION_PROTOCOL_VERSION,
      promptId: options.promptId,
      routes: [{ id: options.route.id, samples }],
      schema: "threenative.agent-benchmark-observation-trace",
      version: 1,
    },
  };
}

interface ICapturedCheckpoint {
  metrics: Record<string, BenchmarkObservationValue>;
  png: Buffer;
  sample: IBenchmarkBrowserObservationSample;
}

async function captureCheckpoint(
  options: { canvas: Locator; outDir: string; page: Page; route: IObservationRoute },
  checkpoint: string,
  sequence: number,
  startedAt: number,
  diagnostics: IBenchmarkDiagnostic[],
  hiddenBindings: Set<string>,
): Promise<ICapturedCheckpoint> {
  const png = await options.canvas.screenshot({ path: resolve(options.outDir, `${safeName(options.route.id)}-${sequence}-${checkpoint}.png`) });
  const decoded = PNG.sync.read(png);
  const snapshot = await readRawSnapshot(options.page);
  const metrics: Record<string, BenchmarkObservationValue> = {};
  const metricIds: string[] = [];
  const actorIds = new Set<string>();
  const actors: IBenchmarkBrowserObservationActor[] = [];
  let state: BenchmarkObservationPhase = "active";
  for (const binding of options.route.bindings) {
    const locator = options.page.locator(binding.selector).first();
    const visible = await locator.count() > 0 && await locator.isVisible().catch(() => false);
    if (!visible) {
      if (!hiddenBindings.has(binding.id)) {
        hiddenBindings.add(binding.id);
        diagnostics.push(error("TN_BENCH_OBSERVATION_BINDING_NOT_VISIBLE", `Binding '${binding.id}' does not resolve to a visible element and cannot corroborate an observation.`));
      }
      continue;
    }
    if (binding.source === "raw-snapshot") {
      if (snapshot === undefined) continue;
      state = snapshot.phase;
      const matchingActors = snapshot.actors.filter((item) => item.id === binding.id || item.roles.includes(binding.id as BenchmarkObservationRole));
      for (const actor of matchingActors) {
        actors.push(actor);
        if (actor.visible) actorIds.add(actor.id);
      }
      for (const [id, value] of Object.entries(snapshot.metrics)) {
        if (id === binding.id || id.startsWith(`${binding.id}.`)) {
          metrics[id] = value;
          metricIds.push(id);
        }
      }
      continue;
    }
    const value = await visibleBindingValue(locator, binding.source);
    metrics[binding.id] = value;
    metricIds.push(binding.id);
  }
  const visibleText = await options.page.locator("body").innerText().catch(() => "");
  metrics["document.visibleText"] = visibleText;
  metricIds.push("document.visibleText");
  const frameSha256 = createHash("sha256").update(png).digest("hex");
  const sample: IBenchmarkBrowserObservationSample = {
    actors,
    checkpoint,
    metrics,
    phase: checkpoint === "before" || checkpoint.endsWith("-before") ? "before" : checkpoint.endsWith("-after") ? "after" : "idle",
    sequence,
    state,
    timestampMs: Date.now() - startedAt,
    visibility: {
      actorIds: Array.from(actorIds),
      canvas: {
        frameSha256,
        nonblank: isNonblank(decoded),
        webgl: await hasWebGlContext(options.canvas),
      },
      inputCorrelated: false,
      metricIds,
      phase: snapshot !== undefined,
    },
  };
  return { metrics, png, sample };
}

async function readRawSnapshot(page: Page): Promise<{ actors: IBenchmarkBrowserObservationActor[]; metrics: Record<string, BenchmarkObservationValue>; phase: BenchmarkObservationPhase } | undefined> {
  const value = await page.evaluate(() => {
    const observer = (globalThis as unknown as { __TN_BENCHMARK_OBSERVE__?: unknown }).__TN_BENCHMARK_OBSERVE__;
    if (typeof observer !== "function") return undefined;
    try { return (observer as () => unknown)(); } catch { return undefined; }
  }).catch(() => undefined);
  if (!isRecord(value)) return undefined;
  const phase = typeof value.phase === "string" && VALID_PHASES.has(value.phase as BenchmarkObservationPhase) ? value.phase as BenchmarkObservationPhase : "active";
  const actors: IBenchmarkBrowserObservationActor[] = [];
  const metrics: Record<string, BenchmarkObservationValue> = {};
  for (const item of Array.isArray(value.actors) ? value.actors : []) {
    if (!isRecord(item) || !validToken(item.id)) continue;
    const roles = rawRoles(item).filter((role) => VALID_ROLES.has(role));
    if (roles.length === 0) continue;
    const actor: IBenchmarkBrowserObservationActor = { id: item.id, roles, visible: item.visible !== false };
    const position = finiteTuple(item.position, 3);
    const cell = finiteTuple(item.cell, 2);
    if (position !== undefined) actor.position = position as [number, number, number];
    if (cell !== undefined) actor.cell = cell as [number, number];
    if (typeof item.selected === "boolean") actor.selected = item.selected;
    actors.push(actor);
    if (isRecord(item.counters)) {
      for (const [key, counter] of Object.entries(item.counters)) {
        if (validToken(key) && isObservationValue(counter)) metrics[`${item.id}.${key}`] = counter;
      }
    }
  }
  if (isRecord(value.metrics)) {
    for (const [key, metric] of Object.entries(value.metrics)) {
      if (validMetricId(key) && isObservationValue(metric)) metrics[key] = metric;
    }
  }
  return { actors, metrics, phase };
}

function parseAction(value: unknown): ObservationRouteAction | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  const checkpoint = value.checkpoint === undefined ? undefined : validToken(value.checkpoint) ? value.checkpoint : false;
  if (checkpoint === false) return undefined;
  if (value.type === "wait") {
    return onlyKeys(value, ["checkpoint", "durationMs", "type"]) && Number.isInteger(value.durationMs) && (value.durationMs as number) >= 0 && (value.durationMs as number) <= MAX_WAIT_MS
      ? { ...(checkpoint === undefined ? {} : { checkpoint }), durationMs: value.durationMs as number, type: "wait" }
      : undefined;
  }
  if (value.type === "key-down" || value.type === "key-press" || value.type === "key-up") {
    return onlyKeys(value, ["checkpoint", "key", "type"]) && typeof value.key === "string" && value.key.length > 0 && value.key.length <= 40
      ? { ...(checkpoint === undefined ? {} : { checkpoint }), key: value.key, type: value.type }
      : undefined;
  }
  if (value.type === "pointer-click" || value.type === "pointer-down" || value.type === "pointer-move" || value.type === "pointer-up") {
    const button = value.button === undefined || value.button === 0 || value.button === 1 || value.button === 2 ? value.button : undefined;
    if (!onlyKeys(value, ["button", "checkpoint", "type", "x", "y"]) || !normalized(value.x) || !normalized(value.y) || (value.button !== undefined && button === undefined)) return undefined;
    return { ...(button === undefined ? {} : { button }), ...(checkpoint === undefined ? {} : { checkpoint }), type: value.type, x: value.x, y: value.y } as ObservationRouteAction;
  }
  return undefined;
}

function parseBinding(value: unknown): IObservationRouteBinding | undefined {
  if (!isRecord(value) || !onlyKeys(value, ["id", "selector", "source"]) || !validToken(value.id) || typeof value.selector !== "string" || value.selector.length === 0 || value.selector.length > 160) return undefined;
  if (value.source !== "accessible-text" && value.source !== "raw-snapshot" && value.source !== "visible-text" && value.source !== "visible-value") return undefined;
  return { id: value.id, selector: value.selector, source: value.source };
}

function canonicalAction(action: ObservationRouteAction): BenchmarkObservationAction {
  if (action.type === "wait") return { durationMs: action.durationMs, kind: "wait" };
  if ("key" in action) return { code: action.key, kind: "key", phase: action.type.slice(4) as "down" | "press" | "up" };
  return { ...(action.button === undefined ? {} : { button: action.button }), kind: "pointer", phase: action.type.slice(8) as "click" | "down" | "move" | "up", x: action.x, y: action.y };
}

async function executeAction(page: Page, canvas: Locator, action: ObservationRouteAction): Promise<void> {
  if (action.type === "wait") return advancePageTime(page, action.durationMs);
  if ("key" in action) {
    if (action.type === "key-down") return page.keyboard.down(action.key);
    if (action.type === "key-up") return page.keyboard.up(action.key);
    return page.keyboard.press(action.key);
  }
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("Scored canvas is not visible for pointer observation.");
  const x = box.x + box.width * action.x;
  const y = box.y + box.height * action.y;
  await page.mouse.move(x, y);
  if (action.type === "pointer-move") return;
  const button = (["left", "middle", "right"] as const)[action.button ?? 0];
  if (action.type === "pointer-down") return page.mouse.down({ button });
  if (action.type === "pointer-up") return page.mouse.up({ button });
  await page.mouse.click(x, y, { button });
}

async function advancePageTime(page: Page, durationMs: number): Promise<void> {
  try {
    await page.clock.runFor(durationMs);
  } catch {
    await page.waitForTimeout(durationMs);
  }
}

function changedMetricIds(...checkpoints: ICapturedCheckpoint[]): Set<string> {
  const result = new Set<string>();
  const ids = new Set(checkpoints.flatMap((item) => Object.keys(item.metrics)));
  for (const id of ids) if (new Set(checkpoints.map((item) => JSON.stringify(item.metrics[id]))).size > 1) result.add(id);
  return result;
}

function changedActorIds(...checkpoints: ICapturedCheckpoint[]): Set<string> {
  const result = new Set<string>();
  const ids = new Set(checkpoints.flatMap((item) => item.sample.actors.map((actor) => actor.id)));
  for (const id of ids) {
    const states = checkpoints.map((item) => JSON.stringify(item.sample.actors.find((actor) => actor.id === id)));
    if (new Set(states).size > 1) result.add(id);
  }
  return result;
}

function changedPixelRatio(before: Buffer, after: Buffer): number {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(after);
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0;
  for (let offset = 0; offset < a.data.length; offset += 4) {
    if (a.data[offset] !== b.data[offset] || a.data[offset + 1] !== b.data[offset + 1] || a.data[offset + 2] !== b.data[offset + 2] || a.data[offset + 3] !== b.data[offset + 3]) changed += 1;
  }
  return changed / (a.width * a.height);
}

function isNonblank(png: PNG): boolean {
  const first = `${png.data[0]}:${png.data[1]}:${png.data[2]}:${png.data[3]}`;
  for (let offset = 4; offset < png.data.length; offset += 4) if (`${png.data[offset]}:${png.data[offset + 1]}:${png.data[offset + 2]}:${png.data[offset + 3]}` !== first) return true;
  return false;
}

async function hasWebGlContext(canvas: Locator): Promise<boolean> {
  return canvas.evaluate((element) => {
    const candidate = element as unknown as { getContext: (type: string) => unknown };
    try { return candidate.getContext("webgl2") !== null || candidate.getContext("webgl") !== null; } catch { return false; }
  });
}

async function visibleBindingValue(locator: Locator, source: IObservationRouteBinding["source"]): Promise<string> {
  if (source === "visible-value") return locator.inputValue().catch(() => "");
  if (source === "accessible-text") return (await locator.getAttribute("aria-label")) ?? await locator.innerText().catch(() => "");
  return locator.innerText().catch(() => "");
}

function rawRoles(value: Record<string, unknown>): BenchmarkObservationRole[] {
  const roles = Array.isArray(value.roles) ? value.roles : typeof value.role === "string" ? [value.role] : [];
  return roles.filter((item): item is BenchmarkObservationRole => typeof item === "string" && VALID_ROLES.has(item as BenchmarkObservationRole));
}

function findProhibitedValue(value: unknown, assertionIds: Set<string>, path = "route"): string | undefined {
  // Route IDs are scorer-owned protocol handles and may intentionally share the
  // public behavior name. Candidate-controlled bindings and checkpoints may not.
  if (typeof value === "string" && assertionIds.has(value) && path !== "route.id") return path;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findProhibitedValue(value[index], assertionIds, `${path}[${index}]`);
      if (found !== undefined) return found;
    }
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (PROHIBITED_KEYS.has(key.toLowerCase().replaceAll(/[-_]/gu, ""))) return `${path}.${key}`;
      const found = findProhibitedValue(child, assertionIds, `${path}.${key}`);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function finiteTuple(value: unknown, length: number): number[] | undefined {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? value : undefined;
}

function isObservationValue(value: unknown): value is BenchmarkObservationValue {
  return typeof value === "boolean" || typeof value === "string" || typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function onlyKeys(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)); }
function normalized(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1; }
function validToken(value: unknown): value is string { return typeof value === "string" && /^[a-z][a-z0-9.-]{0,63}$/u.test(value); }
function validMetricId(value: string): boolean { return /^[a-z][A-Za-z0-9._-]{0,95}$/u.test(value); }
function safeName(value: string): string { return value.replaceAll(/[^a-z0-9.-]/gu, "-"); }
function error(code: string, message: string): IBenchmarkDiagnostic { return { code, message, severity: "error" }; }
