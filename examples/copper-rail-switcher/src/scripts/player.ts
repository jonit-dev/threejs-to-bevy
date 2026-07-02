import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function copperRailSwitcherSystem(context: ScriptContext): void {
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
  const animateSteam = (playerPosition?: Vec3Tuple): boolean => {
    let hit = false;
    const steamPositions: Record<string, Vec3Tuple> = {};
    for (const entity of entities) {
      const steam = entity.get?.("SteamHazard");
      if (steam === undefined || !Array.isArray(steam.origin)) continue;
      const origin = steam.origin as Vec3Tuple;
      const wave = Math.sin(elapsed * 1.25 + Number(steam.phase ?? 0)) * Number(steam.radius ?? 1);
      const lift = Math.max(0, Math.sin(elapsed * 5.5 + Number(steam.phase ?? 0))) * 0.18;
      const moved: Vec3Tuple = steam.axis === "z" ? [origin[0], origin[1] + lift, origin[2] + wave] : [origin[0] + wave, origin[1] + lift, origin[2]];
      entity.transform().setPosition(Vec3.round(moved, 6));
      steamPositions[entity.id] = moved;
      if (playerPosition !== undefined && distance2d(playerPosition, moved) < 0.62) hit = true;
    }
    for (const entity of entities) {
      const part = entity.get?.("SteamPart");
      if (typeof part?.target !== "string" || !Array.isArray(part.offset)) continue;
      const base = steamPositions[part.target];
      if (base === undefined) continue;
      const swell = 1 + Math.max(0, Math.sin(elapsed * 5.5)) * 0.18;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, part.offset as Vec3Tuple), 6));
      entity.transform().setScale?.([0.32 * swell, 0.76 * swell, 0.32 * swell]);
    }
    return hit;
  };
  const animateFurnace = (): void => {
    for (const entity of entities) {
      const glow = entity.get?.("FurnaceGlow");
      if (glow === undefined || !Array.isArray(glow.base)) continue;
      const pulse = Math.sin(elapsed * 4.2 + Number(glow.phase ?? 0)) * 0.045;
      const base = glow.base as Vec3Tuple;
      entity.transform().setPosition(Vec3.round([base[0], base[1] + pulse, base[2]], 6));
    }
  };

  const stateValue = context.resources?.get?.("GameState");
  let state: Record<string, unknown> = isRecord(stateValue) ? stateValue : {};
  const legacyState = context.resource?.("GameState");
  const patchState = (patch: Record<string, unknown>): void => {
    state = { ...state, ...patch };
    context.resources?.set?.("GameState", state);
    legacyState?.patch?.(patch);
  };

  const existingHomes = isRecord(state.oreHomes) ? state.oreHomes : {};
  const oreHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.oreHomes);
  for (const entity of entities) {
    if (entity.get?.("OreChunk") === undefined) continue;
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      oreHomes[entity.id] = saved;
      continue;
    }
    oreHomes[entity.id] = entity.transform().positionOr([0, 0.32, 0]);
    homesChanged = true;
  }
  if (homesChanged) patchState({ oreHomes });

  const setOreHome = (hidden: boolean): void => {
    for (const entity of entities) {
      const ore = entity.get?.("OreChunk");
      if (ore === undefined) continue;
      const home = oreHomes[entity.id] ?? entity.transform().positionOr([0, 0.32, 0]);
      entity.transform().setPosition(hidden ? [home[0], -4, home[2]] : home);
      entity.patch?.("OreChunk", { ...ore, collected: hidden });
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.18, 3.35];
    player.transform().setPosition(start);
    player.patch?.("RailCart", { speed: 3.25, carried: 0, deposited: 0 });
    setOreHome(false);
    patchState({
      phase: "playing",
      carried: 0,
      deposited: 0,
      timer: 75,
      oreText: "Ore 0/5",
      timerText: "Shift 75",
      status: "Collect ore, then dump at the orange furnace"
    });
  };

  const current = player.transform().positionOr([0, 0.18, 3.35]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    animateSteam();
    animateFurnace();
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("RailCart") ?? { speed: 3.25, carried: 0, deposited: 0 };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const speed = Number(stats.speed ?? 3.25);
  const bob = Math.sin(elapsed * 7.5) * 0.012;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta, -3.15, 3.15),
    0.18 + bob,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.05, 3.85)
  ], 6);
  player.transform().setPosition(next);

  let carried = Number(state.carried ?? stats.carried ?? 0);
  let deposited = Number(state.deposited ?? stats.deposited ?? 0);
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const ore = entity.get?.("OreChunk");
    if (ore === undefined) continue;
    total += 1;
    if (ore.collected === true) continue;
    const home = oreHomes[entity.id] ?? entity.transform().positionOr([0, 0.32, 0]);
    const float = Math.sin(elapsed * 4.7 + Number(ore.phase ?? 0)) * 0.05;
    const display: Vec3Tuple = [home[0], 0.32 + float, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.58) {
      carried += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("OreChunk", { ...ore, collected: true });
    }
  }

  const hitSteam = animateSteam(next);
  animateFurnace();

  const atFurnace = distance2d(next, [0, 0.18, -4.12]) < 0.95;
  let depositedNow = false;
  if (atFurnace && carried > 0) {
    deposited += carried;
    carried = 0;
    depositedNow = true;
  }

  const timer = Math.max(0, Number(state.timer ?? 75) - delta);
  const progress = Math.min(total, deposited);
  const oreText = `Ore ${progress}/${total}`;
  if (hitSteam) {
    patchState({ phase: "failed", carried, deposited, timer, oreText, timerText: `Shift ${Math.ceil(timer)}`, status: "Steam burst stalled the cart. Press Space to retry." });
    return;
  }
  if (timer <= 0) {
    patchState({ phase: "failed", carried, deposited, timer: 0, oreText, timerText: "Shift 0", status: "The shift ended. Press Space to retry." });
    return;
  }
  if (total > 0 && deposited >= total) {
    patchState({ phase: "won", carried, deposited, timer, oreText: `Ore ${total}/${total}`, timerText: `Shift ${Math.ceil(timer)}`, status: "Furnace quota met. Press Space for another shift." });
    player.patch?.("RailCart", { ...stats, carried, deposited });
    return;
  }

  player.patch?.("RailCart", { ...stats, carried, deposited });
  patchState({
    phase: "playing",
    carried,
    deposited,
    timer,
    oreText,
    timerText: `Shift ${Math.ceil(timer)}`,
    status: depositedNow ? "Ore dumped into the furnace" : carried > 0 ? `Carrying ${carried}; drive to the orange furnace` : justCollected ? "Ore loaded into the cart" : "Collect ore, then dump at the orange furnace"
  });
}
