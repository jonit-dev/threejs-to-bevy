import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function magnetYardSorterSystem(context: ScriptContext): void {
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

  const stateValue = context.resources?.get?.("GameState");
  let state: Record<string, unknown> = isRecord(stateValue) ? stateValue : {};
  const legacyState = context.resource?.("GameState");
  const patchState = (patch: Record<string, unknown>): void => {
    state = { ...state, ...patch };
    context.resources?.set?.("GameState", state);
    legacyState?.patch?.(patch);
  };

  const existingHomes = isRecord(state.scrapHomes) ? state.scrapHomes : {};
  const scrapHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.scrapHomes);
  for (const entity of entities) {
    if (entity.get?.("ScrapItem") === undefined) continue;
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      scrapHomes[entity.id] = saved;
      continue;
    }
    scrapHomes[entity.id] = entity.transform().positionOr([0, 0.34, 0]);
    homesChanged = true;
  }
  if (homesChanged) patchState({ scrapHomes });

  const syncParts = (base: Vec3Tuple): void => {
    for (const entity of entities) {
      const part = entity.get?.("MagnetPart");
      if (part?.target !== "player" || !isVec3(part.offset)) continue;
      const sway = entity.id.includes("cable") ? Math.sin(elapsed * 3.2) * 0.025 : 0;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, [part.offset[0] + sway, part.offset[1], part.offset[2]]), 6));
    }
  };

  const setScrapHome = (hidden: boolean): void => {
    for (const entity of entities) {
      const scrap = entity.get?.("ScrapItem");
      if (scrap === undefined) continue;
      const home = scrapHomes[entity.id] ?? entity.transform().positionOr([0, 0.34, 0]);
      entity.transform().setPosition(hidden ? [home[0], -4, home[2]] : home);
      entity.patch?.("ScrapItem", { ...scrap, collected: hidden });
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.64, 3.45];
    player.transform().setPosition(start);
    player.patch?.("MagnetPlayer", { speed: 3.15, carried: 0, deposited: 0 });
    syncParts(start);
    setScrapHome(false);
    patchState({
      phase: "playing",
      carried: 0,
      deposited: 0,
      timer: 70,
      scrapText: "Scrap 0/6",
      timerText: "Shift 70",
      status: "Collect scrap, then hover over the blue recycler"
    });
  };

  const current = player.transform().positionOr([0, 0.64, 3.45]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    syncParts(current);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("MagnetPlayer") ?? { speed: 3.15, carried: 0, deposited: 0 };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const hover = Math.sin(elapsed * 5.1) * 0.035;
  const speed = Number(stats.speed ?? 3.15);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta, -3.25, 3.25),
    0.64 + hover,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.05, 4.05)
  ], 6);
  player.transform().setPosition(next);
  syncParts(next);

  let carried = Number(state.carried ?? stats.carried ?? 0);
  let deposited = Number(state.deposited ?? stats.deposited ?? 0);
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const scrap = entity.get?.("ScrapItem");
    if (scrap === undefined) continue;
    total += 1;
    if (scrap.collected === true) continue;
    const home = scrapHomes[entity.id] ?? entity.transform().positionOr([0, 0.34, 0]);
    const bob = Math.sin(elapsed * 4.8 + Number(scrap.phase ?? 0)) * 0.04;
    const display: Vec3Tuple = [home[0], 0.34 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.5) {
      carried += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("ScrapItem", { ...scrap, collected: true });
    }
  }

  let hitSpark = false;
  const sparkPositions: Record<string, Vec3Tuple> = {};
  for (const entity of entities) {
    const spark = entity.get?.("SparkHazard");
    if (!isRecord(spark) || !isVec3(spark.origin)) continue;
    const escalation = deposited + carried >= 4 ? 1.25 : 1;
    const wave = Math.sin(elapsed * 1.15 * escalation + Number(spark.phase ?? 0)) * Number(spark.radius ?? 1);
    const flicker = Math.sin(elapsed * 9.0 + Number(spark.phase ?? 0)) * 0.055;
    const moved: Vec3Tuple = spark.axis === "z" ? [spark.origin[0], spark.origin[1] + flicker, spark.origin[2] + wave] : [spark.origin[0] + wave, spark.origin[1] + flicker, spark.origin[2]];
    entity.transform().setPosition(Vec3.round(moved, 6));
    sparkPositions[entity.id] = moved;
    if (distance2d(next, moved) < 0.64) hitSpark = true;
  }
  for (const entity of entities) {
    const part = entity.get?.("SparkPart");
    if (typeof part?.target !== "string" || !isVec3(part.offset)) continue;
    const base = sparkPositions[part.target];
    if (base === undefined) continue;
    entity.transform().setPosition(Vec3.round(Vec3.add(base, part.offset), 6));
  }

  const atRecycler = distance2d(next, [0, 0.64, -4.02]) < 0.92;
  let depositedNow = false;
  if (atRecycler && carried > 0) {
    deposited += carried;
    carried = 0;
    depositedNow = true;
  }

  const timer = Math.max(0, Number(state.timer ?? 70) - delta);
  const progress = Math.min(total, deposited);
  const scrapText = `Scrap ${progress}/${total}`;
  if (hitSpark) {
    patchState({ phase: "failed", carried, deposited, timer, scrapText, timerText: `Shift ${Math.ceil(timer)}`, status: "Spark surge fried the magnet. Press Space to retry." });
    return;
  }
  if (timer <= 0) {
    patchState({ phase: "failed", carried, deposited, timer: 0, scrapText, timerText: "Shift 0", status: "The shift ended. Press Space to retry." });
    return;
  }
  if (total > 0 && deposited >= total) {
    patchState({ phase: "won", carried, deposited, timer, scrapText: `Scrap ${total}/${total}`, timerText: `Shift ${Math.ceil(timer)}`, status: "Recycler quota met. Press Space for another shift." });
    player.patch?.("MagnetPlayer", { ...stats, carried, deposited });
    return;
  }

  player.patch?.("MagnetPlayer", { ...stats, carried, deposited });
  patchState({
    phase: "playing",
    carried,
    deposited,
    timer,
    scrapText,
    timerText: `Shift ${Math.ceil(timer)}`,
    status: depositedNow ? "Load dropped into the recycler" : carried > 0 ? `Carrying ${carried}; deliver to the blue recycler` : justCollected ? "Scrap snapped to the magnet" : "Collect scrap, then hover over the blue recycler"
  });
}
