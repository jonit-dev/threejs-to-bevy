import type { IIrCountdownDeclaration, ISystemsIr, IWorldIr } from "@threenative/ir";

export interface ICountdownObservation {
  countdown: string;
  event: string;
  fired: boolean;
  tick: number;
  value: number;
}

interface ICountdownRuntimeEntry {
  fired: boolean;
  initialized: boolean;
  restartToken: unknown;
  running: boolean;
}

export interface ICountdownRuntimeState {
  entries: Map<string, ICountdownRuntimeEntry>;
}

export function createCountdownRuntimeState(): ICountdownRuntimeState {
  return { entries: new Map() };
}

export function stepCountdowns(
  world: IWorldIr,
  systems: ISystemsIr,
  fixedDelta: number,
  runtime: ICountdownRuntimeState,
  tick: number,
): ICountdownObservation[] {
  const delta = Number.isFinite(fixedDelta) && fixedDelta > 0 ? fixedDelta : 0;
  const observations: ICountdownObservation[] = [];
  for (const countdown of systems.countdowns ?? []) {
    const resource = world.resources?.[countdown.resource];
    if (!isRecord(resource)) {
      continue;
    }
    const entry = runtime.entries.get(countdown.id) ?? {
      fired: false,
      initialized: false,
      restartToken: undefined,
      running: countdown.autostart !== false,
    };
    const restartToken = resource.restartToken;
    const restart = entry.initialized && !sameValue(entry.restartToken, restartToken);
    const running = typeof resource.running === "boolean" ? resource.running : (countdown.autostart !== false);
    if (restart || (!entry.running && running)) {
      resource[countdown.field] = startValue(countdown);
      entry.fired = false;
    }
    entry.initialized = true;
    entry.restartToken = restartToken;
    entry.running = running;
    if (!running) {
      runtime.entries.set(countdown.id, entry);
      continue;
    }
    const current = finite(resource[countdown.field], startValue(countdown));
    const value = countdown.direction === "down"
      ? Math.max(0, Math.min(countdown.limit, current - delta))
      : Math.min(countdown.limit, Math.max(0, current + delta));
    resource[countdown.field] = round(value);
    const reached = countdown.direction === "down" ? value <= 0 : value >= countdown.limit;
    const fired = reached && !entry.fired;
    if (fired) {
      entry.fired = true;
      appendEvent(world, countdown.event, {
        countdown: countdown.id,
        direction: countdown.direction,
        field: countdown.field,
        limit: countdown.limit,
        resource: countdown.resource,
        value: resource[countdown.field],
      });
    }
    runtime.entries.set(countdown.id, entry);
    observations.push({ countdown: countdown.id, event: countdown.event, fired, tick, value: resource[countdown.field] as number });
  }
  return observations;
}

export function resetCountdowns(runtime: ICountdownRuntimeState): void {
  runtime.entries.clear();
}

function startValue(countdown: IIrCountdownDeclaration): number {
  return countdown.direction === "down" ? countdown.limit : 0;
}

function appendEvent(world: IWorldIr, event: string, payload: Record<string, unknown>): void {
  const queue = world.events?.[event];
  world.events = { ...(world.events ?? {}), [event]: Array.isArray(queue) ? [...queue, payload] : [payload] };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
