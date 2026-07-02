import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function riverRescueSystem(context: ScriptContext): void {
  const delta = context.time.fixedDelta({ fallback: 1 / 60, max: 1 / 30, min: 0.001 });
  const elapsed = typeof context.time.elapsed === "number" ? context.time.elapsed : 0;
  const entities = context.query();
  const player = entities.find((entity: any) => entity.id === "player");
  if (player === undefined) {
    return;
  }

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const isVec3 = (value: unknown): value is Vec3Tuple => Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item));
  const distance2d = (a: Vec3Tuple, b: Vec3Tuple): number => {
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dz * dz);
  };
  const readState = (): Record<string, unknown> => {
    const value = context.resources?.get?.("GameState");
    return isRecord(value) ? value : {};
  };

  let state = readState();
  const legacyState = context.resource?.("GameState");
  const patchState = (patch: Record<string, unknown>): void => {
    state = { ...state, ...patch };
    context.resources?.set?.("GameState", state);
    legacyState?.patch?.(patch);
  };

  const existingHomes = isRecord(state.flareHomes) ? state.flareHomes : {};
  const flareHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.flareHomes);
  for (const entity of entities) {
    if (entity.get?.("SignalFlare") === undefined) {
      continue;
    }
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      flareHomes[entity.id] = saved;
      continue;
    }
    flareHomes[entity.id] = entity.transform().positionOr([0, 0.32, 0]);
    homesChanged = true;
  }
  if (homesChanged) {
    patchState({ flareHomes });
  }

  const resetGame = (): void => {
    player.transform().setPosition([0, 0.18, 3.55]);
    player.patch?.("RescueSkiff", { speed: 3.25, flares: 0 });
    for (const entity of entities) {
      const flare = entity.get?.("SignalFlare");
      if (flare !== undefined) {
        const home = flareHomes[entity.id] ?? entity.transform().positionOr([0, 0.32, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("SignalFlare", { ...flare, collected: false });
      }
    }
    patchState({
      phase: "playing",
      flares: 0,
      timer: 50,
      countdown: "Flares 0/3",
      timerText: "Time 50",
      status: "Collect 3 flares, then return to the dock"
    });
  };

  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    const base = player.transform().positionOr([0, 0.18, 3.55]);
    for (const entity of entities) {
      const part = entity.get?.("SkiffPart");
      if (part?.target === "player" && isVec3(part.offset)) {
        entity.transform().setPosition(Vec3.round(Vec3.add(base, part.offset), 6));
      }
    }
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) {
      resetGame();
    }
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("RescueSkiff") ?? { speed: 3.25, flares: 0 };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const current = player.transform().positionOr([0, 0.18, 3.55]);
  const bob = Math.sin(elapsed * 5.5) * 0.025;
  const speed = Number(stats.speed ?? 3.25);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta, -2.75, 2.75),
    0.18 + bob,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.15, 4.15)
  ], 6);
  player.transform().setPosition(next);

  let collected = 0;
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const flare = entity.get?.("SignalFlare");
    if (flare === undefined) {
      continue;
    }
    total += 1;
    if (flare.collected === true) {
      collected += 1;
      continue;
    }
    const home = flareHomes[entity.id] ?? entity.transform().positionOr([0, 0.32, 0]);
    const flareBob = Math.sin(elapsed * 3.3 + Number(flare.phase ?? 0)) * 0.08;
    const displayPosition: Vec3Tuple = [home[0], 0.34 + flareBob, home[2]];
    entity.transform().setPosition(Vec3.round(displayPosition, 6));
    if (distance2d(next, displayPosition) < 0.62) {
      collected += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("SignalFlare", { ...flare, collected: true });
    }
  }

  let hitLog = false;
  for (const entity of entities) {
    const log = entity.get?.("DriftLog");
    if (!isRecord(log) || !isVec3(log.origin)) {
      continue;
    }
    const escalation = collected >= 2 ? 1.25 : 1;
    const wave = Math.sin(elapsed * 0.85 * escalation + Number(log.phase ?? 0)) * Number(log.radius ?? 1);
    const moved: Vec3Tuple = log.axis === "z"
      ? [log.origin[0], log.origin[1], log.origin[2] + wave]
      : [log.origin[0] + wave, log.origin[1], log.origin[2]];
    entity.transform().setPosition(Vec3.round(moved, 6));
    if (distance2d(next, moved) < 0.7) {
      hitLog = true;
    }
  }

  for (const entity of entities) {
    const part = entity.get?.("SkiffPart");
    if (part?.target !== "player" || !isVec3(part.offset)) {
      continue;
    }
    const glow = entity.id === "player.light" ? Math.sin(elapsed * 9) * 0.035 : 0;
    entity.transform().setPosition(Vec3.round(Vec3.add(next, [part.offset[0], part.offset[1] + glow, part.offset[2]]), 6));
  }

  const timer = Math.max(0, Number(state.timer ?? 50) - delta);
  const atDock = distance2d(next, [0, 0.1, 4.25]) < 0.95;
  if (hitLog) {
    patchState({
      phase: "failed",
      flares: collected,
      timer,
      countdown: `Flares ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "A log breached the hull. Press Space to retry."
    });
    return;
  }
  if (timer <= 0) {
    patchState({
      phase: "failed",
      flares: collected,
      timer: 0,
      countdown: `Flares ${collected}/${total}`,
      timerText: "Time 0",
      status: "The river went dark. Press Space to retry."
    });
    return;
  }
  if (total > 0 && collected >= total && atDock) {
    patchState({
      phase: "won",
      flares: collected,
      timer,
      countdown: `Flares ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "Rescue complete. Press Space to launch again."
    });
    return;
  }

  player.patch?.("RescueSkiff", { ...stats, flares: collected });
  patchState({
    phase: "playing",
    flares: collected,
    timer,
    countdown: `Flares ${collected}/${total}`,
    timerText: `Time ${Math.ceil(timer)}`,
    status: justCollected
      ? "Signal flare secured"
      : collected >= total
        ? "Return to the dock"
        : "Collect 3 flares, then return to the dock"
  });
}
