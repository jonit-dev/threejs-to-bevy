import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function stormBuoyRescueSystem(context: ScriptContext): void {
  const delta = context.time.fixedDelta({ fallback: 1 / 60, max: 1 / 30, min: 0.001 });
  const elapsed = typeof context.time.elapsed === "number" ? context.time.elapsed : 0;
  const entities = context.query();
  const player = entities.find((entity: any) => entity.id === "player");
  if (player === undefined) return;

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const isVec3 = (value: unknown): value is Vec3Tuple => Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item));
  const distance2d = (a: Vec3Tuple, b: Vec3Tuple): number => {
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dz * dz);
  };
  const patchTransformFollowers = (playerPosition: Vec3Tuple): void => {
    const bob = Math.sin(elapsed * 6.4) * 0.018;
    const deck = entities.find((entity: any) => entity.id === "player.deck");
    const cabin = entities.find((entity: any) => entity.id === "player.cabin");
    const stack = entities.find((entity: any) => entity.id === "player.stack");
    const bowLight = entities.find((entity: any) => entity.id === "player.bow.light");
    deck?.transform().setPosition(Vec3.round([playerPosition[0], 0.44 + bob, playerPosition[2] + 0.17], 6));
    cabin?.transform().setPosition(Vec3.round([playerPosition[0], 0.64 + bob, playerPosition[2] - 0.07], 6));
    stack?.transform().setPosition(Vec3.round([playerPosition[0] + 0.28, 0.78 + bob, playerPosition[2] + 0.08], 6));
    bowLight?.transform().setPosition(Vec3.round([playerPosition[0], 0.5 + bob, playerPosition[2] - 0.6], 6));
  };
  const animateBeacon = (): void => {
    for (const entity of entities) {
      const pulse = entity.get?.("BeaconPulse");
      if (pulse === undefined || !Array.isArray(pulse.base)) continue;
      const scale = 1 + Math.max(0, Math.sin(elapsed * 3.8 + Number(pulse.phase ?? 0))) * 0.22;
      entity.transform().setScale?.([0.42 * scale, 0.24 * scale, 0.42 * scale]);
    }
  };
  const animateWhirlpools = (playerPosition?: Vec3Tuple): boolean => {
    let hit = false;
    const positions: Record<string, Vec3Tuple> = {};
    for (const entity of entities) {
      const whirlpool = entity.get?.("Whirlpool");
      if (whirlpool === undefined || !Array.isArray(whirlpool.origin)) continue;
      const origin = whirlpool.origin as Vec3Tuple;
      const wave = Math.sin(elapsed * 1.15 + Number(whirlpool.phase ?? 0)) * Number(whirlpool.radius ?? 1);
      const moved: Vec3Tuple = whirlpool.axis === "z" ? [origin[0], origin[1], origin[2] + wave] : [origin[0] + wave, origin[1], origin[2]];
      positions[entity.id] = moved;
      const swell = 1 + Math.max(0, Math.sin(elapsed * 4.4 + Number(whirlpool.phase ?? 0))) * 0.12;
      entity.transform().setPosition(Vec3.round(moved, 6));
      entity.transform().setScale?.([0.7 * swell, 0.06, 0.7 * swell]);
      if (playerPosition !== undefined && distance2d(playerPosition, moved) < 0.66) hit = true;
    }
    for (const entity of entities) {
      const wake = entity.get?.("WhirlpoolWake");
      if (typeof wake?.target !== "string" || !Array.isArray(wake.offset)) continue;
      const base = positions[wake.target];
      if (base === undefined) continue;
      const swell = 1 + Math.max(0, Math.sin(elapsed * 4.4)) * 0.16;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, wake.offset as Vec3Tuple), 6));
      entity.transform().setScale?.([0.94 * swell, 0.035, 0.94 * swell]);
    }
    return hit;
  };

  const stateValue = context.resources?.get?.("GameState");
  let state: Record<string, unknown> = isRecord(stateValue) ? stateValue : {};
  const legacyState = context.resource?.("GameState");
  const patchState = (patch: Record<string, unknown>): void => {
    state = { ...state, ...patch };
    context.resources?.set?.("GameState", state);
    legacyState?.patch?.(patch);
  };

  const existingHomes = isRecord(state.buoyHomes) ? state.buoyHomes : {};
  const buoyHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.buoyHomes);
  for (const entity of entities) {
    if (entity.get?.("DistressBuoy") === undefined) continue;
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      buoyHomes[entity.id] = saved;
      continue;
    }
    buoyHomes[entity.id] = entity.transform().positionOr([0, 0.36, 0]);
    homesChanged = true;
  }
  if (homesChanged) patchState({ buoyHomes });

  const setBuoyVisibility = (collected: boolean): void => {
    for (const entity of entities) {
      const buoy = entity.get?.("DistressBuoy");
      if (buoy === undefined) continue;
      const home = buoyHomes[entity.id] ?? entity.transform().positionOr([0, 0.36, 0]);
      entity.transform().setPosition(collected ? [home[0], -4, home[2]] : home);
      entity.patch?.("DistressBuoy", { ...buoy, collected });
      const light = entities.find((candidate: any) => candidate.id === `${entity.id}.light`);
      light?.transform().setPosition(collected ? [home[0], -4, home[2]] : [home[0], 0.76, home[2]]);
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.2, 3.55];
    player.transform().setPosition(start);
    player.patch?.("Tugboat", { speed: 3.0, carried: 0, delivered: 0 });
    patchTransformFollowers(start);
    setBuoyVisibility(false);
    patchState({
      phase: "playing",
      carried: 0,
      delivered: 0,
      timer: 80,
      buoyText: "Buoys 0/5",
      timerText: "Storm 80",
      status: "Collect glowing buoys, then dock at the lighthouse"
    });
  };

  const current = player.transform().positionOr([0, 0.2, 3.55]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    animateBeacon();
    animateWhirlpools();
    patchTransformFollowers(current);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("Tugboat") ?? { speed: 3.0, carried: 0, delivered: 0 };
  const magnitude = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const speed = Number(stats.speed ?? 3.0);
  const bob = Math.sin(elapsed * 6.4) * 0.018;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / magnitude) * speed * delta, -3.45, 3.8),
    0.2 + bob,
    NumberEx.clamp(current[2] + (axisZ / magnitude) * speed * delta, -3.95, 3.75)
  ], 6);
  player.transform().setPosition(next);
  patchTransformFollowers(next);

  let carried = Number(state.carried ?? stats.carried ?? 0);
  let delivered = Number(state.delivered ?? stats.delivered ?? 0);
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const buoy = entity.get?.("DistressBuoy");
    if (buoy === undefined) continue;
    total += 1;
    const home = buoyHomes[entity.id] ?? entity.transform().positionOr([0, 0.36, 0]);
    const light = entities.find((candidate: any) => candidate.id === `${entity.id}.light`);
    if (buoy.collected === true) {
      light?.transform().setPosition([home[0], -4, home[2]]);
      continue;
    }
    const float = Math.sin(elapsed * 4.5 + Number(buoy.phase ?? 0)) * 0.055;
    const display: Vec3Tuple = [home[0], 0.36 + float, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    light?.transform().setPosition(Vec3.round([home[0], 0.76 + float, home[2]], 6));
    if (distance2d(next, display) < 0.58) {
      carried += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      light?.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("DistressBuoy", { ...buoy, collected: true });
    }
  }

  const hitWhirlpool = animateWhirlpools(next);
  animateBeacon();

  const atDock = distance2d(next, [3.25, 0.2, -3.48]) < 1.08;
  let deliveredNow = false;
  if (atDock && carried > 0) {
    delivered += carried;
    carried = 0;
    deliveredNow = true;
  }

  const timer = Math.max(0, Number(state.timer ?? 80) - delta);
  const progress = Math.min(total, delivered);
  const buoyText = `Buoys ${progress}/${total}`;
  if (hitWhirlpool) {
    patchState({ phase: "failed", carried, delivered, timer, buoyText, timerText: `Storm ${Math.ceil(timer)}`, status: "Whirlpool caught the tug. Press Space to retry." });
    return;
  }
  if (timer <= 0) {
    patchState({ phase: "failed", carried, delivered, timer: 0, buoyText, timerText: "Storm 0", status: "The storm closed the harbor. Press Space to retry." });
    return;
  }
  if (total > 0 && delivered >= total) {
    patchState({ phase: "won", carried, delivered, timer, buoyText: `Buoys ${total}/${total}`, timerText: `Storm ${Math.ceil(timer)}`, status: "All distress buoys delivered. Press Space for another rescue." });
    player.patch?.("Tugboat", { ...stats, carried, delivered });
    return;
  }

  player.patch?.("Tugboat", { ...stats, carried, delivered });
  patchState({
    phase: "playing",
    carried,
    delivered,
    timer,
    buoyText,
    timerText: `Storm ${Math.ceil(timer)}`,
    status: deliveredNow ? "Buoys secured at the lighthouse dock" : carried > 0 ? `Carrying ${carried}; return to the lighthouse dock` : justCollected ? "Distress buoy recovered" : "Collect glowing buoys, then dock at the lighthouse"
  });
}
