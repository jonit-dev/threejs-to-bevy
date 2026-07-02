import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function crystalCavernSystem(context: ScriptContext): void {
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

  const existingHomes = isRecord(state.shardHomes) ? state.shardHomes : {};
  const shardHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.shardHomes);
  for (const entity of entities) {
    if (entity.get?.("CrystalShard") === undefined) {
      continue;
    }
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      shardHomes[entity.id] = saved;
      continue;
    }
    shardHomes[entity.id] = entity.transform().positionOr([0, 0.52, 0]);
    homesChanged = true;
  }
  if (homesChanged) {
    patchState({ shardHomes });
  }

  const syncCartParts = (base: Vec3Tuple): void => {
    for (const entity of entities) {
      const part = entity.get?.("CartPart");
      if (part?.target !== "player" || !isVec3(part.offset)) {
        continue;
      }
      const lampPulse = entity.id === "player.lamp" ? Math.sin(elapsed * 10) * 0.035 : 0;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, [part.offset[0], part.offset[1] + lampPulse, part.offset[2]]), 6));
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.22, 4.0];
    player.transform().setPosition(start);
    player.patch?.("MineCart", { speed: 3.35, shards: 0 });
    syncCartParts(start);
    for (const entity of entities) {
      const shard = entity.get?.("CrystalShard");
      if (shard !== undefined) {
        const home = shardHomes[entity.id] ?? entity.transform().positionOr([0, 0.52, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("CrystalShard", { ...shard, collected: false });
      }
    }
    patchState({
      phase: "playing",
      shards: 0,
      timer: 55,
      countdown: "Shards 0/4",
      timerText: "Time 55",
      status: "Collect 4 crystals, then reach the forge"
    });
  };

  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    const base = player.transform().positionOr([0, 0.22, 4.0]);
    syncCartParts(base);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) {
      resetGame();
    }
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("MineCart") ?? { speed: 3.35, shards: 0 };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const current = player.transform().positionOr([0, 0.22, 4.0]);
  const railSway = Math.sin(elapsed * 8) * 0.018;
  const speed = Number(stats.speed ?? 3.35);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta, -2.75, 2.75),
    0.22 + railSway,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.25, 4.25)
  ], 6);
  player.transform().setPosition(next);
  syncCartParts(next);

  let collected = 0;
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const shard = entity.get?.("CrystalShard");
    if (shard === undefined) {
      continue;
    }
    total += 1;
    if (shard.collected === true) {
      collected += 1;
      continue;
    }
    const home = shardHomes[entity.id] ?? entity.transform().positionOr([0, 0.52, 0]);
    const bob = Math.sin(elapsed * 3.8 + Number(shard.phase ?? 0)) * 0.1;
    const displayPosition: Vec3Tuple = [home[0], 0.54 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(displayPosition, 6));
    if (distance2d(next, displayPosition) < 0.62) {
      collected += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("CrystalShard", { ...shard, collected: true });
    }
  }

  let hitBoulder = false;
  for (const entity of entities) {
    const boulder = entity.get?.("RollingBoulder");
    if (!isRecord(boulder) || !isVec3(boulder.origin)) {
      continue;
    }
    const escalation = collected >= 3 ? 1.22 : 1;
    const wave = Math.sin(elapsed * 0.95 * escalation + Number(boulder.phase ?? 0)) * Number(boulder.radius ?? 1);
    const moved: Vec3Tuple = boulder.axis === "z"
      ? [boulder.origin[0], boulder.origin[1], boulder.origin[2] + wave]
      : [boulder.origin[0] + wave, boulder.origin[1], boulder.origin[2]];
    entity.transform().setPosition(Vec3.round(moved, 6));
    if (distance2d(next, moved) < 0.72) {
      hitBoulder = true;
    }
  }

  const timer = Math.max(0, Number(state.timer ?? 55) - delta);
  const atForge = distance2d(next, [0, 0.62, -4.65]) < 0.95;
  if (hitBoulder) {
    patchState({
      phase: "failed",
      shards: collected,
      timer,
      countdown: `Shards ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "The cart clipped a boulder. Press Space to retry."
    });
    return;
  }
  if (timer <= 0) {
    patchState({
      phase: "failed",
      shards: collected,
      timer: 0,
      countdown: `Shards ${collected}/${total}`,
      timerText: "Time 0",
      status: "The forge cooled. Press Space to retry."
    });
    return;
  }
  if (total > 0 && collected >= total && atForge) {
    patchState({
      phase: "won",
      shards: collected,
      timer,
      countdown: `Shards ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "Forge charged. Press Space for another run."
    });
    return;
  }

  player.patch?.("MineCart", { ...stats, shards: collected });
  patchState({
    phase: "playing",
    shards: collected,
    timer,
    countdown: `Shards ${collected}/${total}`,
    timerText: `Time ${Math.ceil(timer)}`,
    status: justCollected
      ? "Crystal shard secured"
      : collected >= total
        ? "Deliver the charge to the forge gate"
        : "Collect 4 crystals, then reach the forge"
  });
}
