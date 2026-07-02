import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function moonCanyonCourierSystem(context: ScriptContext): void {
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

  const existingHomes = isRecord(state.cellHomes) ? state.cellHomes : {};
  const cellHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.cellHomes);
  for (const entity of entities) {
    if (entity.get?.("EnergyCell") === undefined) {
      continue;
    }
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      cellHomes[entity.id] = saved;
      continue;
    }
    cellHomes[entity.id] = entity.transform().positionOr([0, 0.48, 0]);
    homesChanged = true;
  }
  if (homesChanged) {
    patchState({ cellHomes });
  }

  const syncSledParts = (base: Vec3Tuple): void => {
    for (const entity of entities) {
      const part = entity.get?.("SledPart");
      if (part?.target !== "player" || !isVec3(part.offset)) {
        continue;
      }
      const pulse = entity.id === "player.reactor" ? Math.sin(elapsed * 10.5) * 0.045 : 0;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, [part.offset[0], part.offset[1] + pulse, part.offset[2]]), 6));
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.34, 3.25];
    player.transform().setPosition(start);
    player.patch?.("HoverSled", { speed: 3.5, cells: 0 });
    syncSledParts(start);
    for (const entity of entities) {
      const cell = entity.get?.("EnergyCell");
      if (cell !== undefined) {
        const home = cellHomes[entity.id] ?? entity.transform().positionOr([0, 0.48, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("EnergyCell", { ...cell, collected: false });
      }
    }
    patchState({
      phase: "playing",
      cells: 0,
      timer: 65,
      countdown: "Cells 0/4",
      timerText: "Time 65",
      status: "Collect 4 cells, then dock at the relay"
    });
  };

  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    syncSledParts(player.transform().positionOr([0, 0.34, 3.25]));
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) {
      resetGame();
    }
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("HoverSled") ?? { speed: 3.5, cells: 0 };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const current = player.transform().positionOr([0, 0.34, 3.25]);
  const hover = Math.sin(elapsed * 6.2) * 0.035;
  const speed = Number(stats.speed ?? 3.5);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta, -2.9, 2.9),
    0.34 + hover,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.2, 4.25)
  ], 6);
  player.transform().setPosition(next);
  syncSledParts(next);

  let collected = 0;
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const cell = entity.get?.("EnergyCell");
    if (cell === undefined) {
      continue;
    }
    total += 1;
    if (cell.collected === true) {
      collected += 1;
      continue;
    }
    const home = cellHomes[entity.id] ?? entity.transform().positionOr([0, 0.48, 0]);
    const bob = Math.sin(elapsed * 4.2 + Number(cell.phase ?? 0)) * 0.1;
    const displayPosition: Vec3Tuple = [home[0], 0.48 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(displayPosition, 6));
    if (distance2d(next, displayPosition) < 0.58) {
      collected += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("EnergyCell", { ...cell, collected: true });
    }
  }

  let hitMeteor = false;
  for (const entity of entities) {
    const meteor = entity.get?.("MeteorHazard");
    if (!isRecord(meteor) || !isVec3(meteor.origin)) {
      continue;
    }
    const escalation = collected >= 2 ? 1.28 : 1;
    const wave = Math.sin(elapsed * 0.92 * escalation + Number(meteor.phase ?? 0)) * Number(meteor.radius ?? 1);
    const drop = Math.sin(elapsed * 1.55 * escalation + Number(meteor.phase ?? 0)) * 0.18;
    const moved: Vec3Tuple = meteor.axis === "z"
      ? [meteor.origin[0], meteor.origin[1] + drop, meteor.origin[2] + wave]
      : [meteor.origin[0] + wave, meteor.origin[1] + drop, meteor.origin[2]];
    entity.transform().setPosition(Vec3.round(moved, 6));
    if (distance2d(next, moved) < 0.72) {
      hitMeteor = true;
    }
  }

  const timer = Math.max(0, Number(state.timer ?? 65) - delta);
  const atRelay = distance2d(next, [0, 0.36, -4.05]) < 0.9;
  if (hitMeteor) {
    patchState({
      phase: "failed",
      cells: collected,
      timer,
      countdown: `Cells ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "Meteor impact scattered the cargo. Press Space to retry."
    });
    return;
  }
  if (timer <= 0) {
    patchState({
      phase: "failed",
      cells: collected,
      timer: 0,
      countdown: `Cells ${collected}/${total}`,
      timerText: "Time 0",
      status: "The relay window closed. Press Space to retry."
    });
    return;
  }
  if (total > 0 && collected >= total && atRelay) {
    patchState({
      phase: "won",
      cells: collected,
      timer,
      countdown: `Cells ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "Relay charged. Press Space for another courier run."
    });
    return;
  }

  player.patch?.("HoverSled", { ...stats, cells: collected });
  patchState({
    phase: "playing",
    cells: collected,
    timer,
    countdown: `Cells ${collected}/${total}`,
    timerText: `Time ${Math.ceil(timer)}`,
    status: justCollected
      ? "Energy cell secured"
      : collected >= total
        ? "Dock at the relay dish"
        : "Collect 4 cells, then dock at the relay"
  });
}
