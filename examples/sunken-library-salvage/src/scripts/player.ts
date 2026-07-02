import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function sunkenLibrarySalvageSystem(context: ScriptContext): void {
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

  const existingHomes = isRecord(state.relicHomes) ? state.relicHomes : {};
  const relicHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.relicHomes);
  for (const entity of entities) {
    if (entity.get?.("RelicTablet") === undefined) continue;
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      relicHomes[entity.id] = saved;
      continue;
    }
    relicHomes[entity.id] = entity.transform().positionOr([0, 0.45, 0]);
    homesChanged = true;
  }
  if (homesChanged) patchState({ relicHomes });

  const syncDiverParts = (base: Vec3Tuple): void => {
    for (const entity of entities) {
      const part = entity.get?.("DiverPart");
      if (part?.target !== "player" || !isVec3(part.offset)) continue;
      const kick = entity.id.includes("fin") ? Math.sin(elapsed * 8.8) * 0.055 : 0;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, [part.offset[0], part.offset[1] + kick, part.offset[2]]), 6));
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.36, 3.15];
    player.transform().setPosition(start);
    player.patch?.("DiverPlayer", { speed: 3.05, relics: 0 });
    syncDiverParts(start);
    for (const entity of entities) {
      const relic = entity.get?.("RelicTablet");
      if (relic === undefined) continue;
      const home = relicHomes[entity.id] ?? entity.transform().positionOr([0, 0.45, 0]);
      entity.transform().setPosition(home);
      entity.patch?.("RelicTablet", { ...relic, collected: false });
    }
    patchState({
      phase: "playing",
      relics: 0,
      oxygen: 72,
      relicText: "Relics 0/3",
      oxygenText: "Oxygen 72",
      status: "Recover 3 relics, then return to the air bell"
    });
  };

  const current = player.transform().positionOr([0, 0.36, 3.15]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    syncDiverParts(current);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("DiverPlayer") ?? { speed: 3.05, relics: 0 };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const drift = Math.sin(elapsed * 4.1) * 0.025;
  const speed = Number(stats.speed ?? 3.05);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta, -3.05, 3.05),
    0.36 + drift,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.05, 3.95)
  ], 6);
  player.transform().setPosition(next);
  syncDiverParts(next);

  let relics = 0;
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const relic = entity.get?.("RelicTablet");
    if (relic === undefined) continue;
    total += 1;
    if (relic.collected === true) {
      relics += 1;
      continue;
    }
    const home = relicHomes[entity.id] ?? entity.transform().positionOr([0, 0.45, 0]);
    const bob = Math.sin(elapsed * 4.6 + Number(relic.phase ?? 0)) * 0.08;
    const display: Vec3Tuple = [home[0], 0.45 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.55) {
      relics += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("RelicTablet", { ...relic, collected: true });
    }
  }

  let caught = false;
  const eelPositions: Record<string, Vec3Tuple> = {};
  for (const entity of entities) {
    const eel = entity.get?.("EelHazard");
    if (!isRecord(eel) || !isVec3(eel.origin)) continue;
    const escalation = relics >= 2 ? 1.22 : 1;
    const wave = Math.sin(elapsed * 0.95 * escalation + Number(eel.phase ?? 0)) * Number(eel.radius ?? 1);
    const moved: Vec3Tuple = eel.axis === "z" ? [eel.origin[0], eel.origin[1], eel.origin[2] + wave] : [eel.origin[0] + wave, eel.origin[1], eel.origin[2]];
    eelPositions[entity.id] = moved;
    entity.transform().setPosition(Vec3.round(moved, 6));
    if (distance2d(next, moved) < 0.68) caught = true;
  }
  for (const entity of entities) {
    const part = entity.get?.("EelPart");
    if (!isRecord(part) || typeof part.target !== "string" || !isVec3(part.offset)) continue;
    const base = eelPositions[part.target];
    if (base !== undefined) entity.transform().setPosition(Vec3.round(Vec3.add(base, part.offset), 6));
  }
  for (const entity of entities) {
    const bubble = entity.get?.("Bubble");
    if (!isRecord(bubble) || !isVec3(bubble.home)) continue;
    const lift = (Math.sin(elapsed * 1.8 + Number(bubble.phase ?? 0)) + 1) * 0.22;
    entity.transform().setPosition(Vec3.round([bubble.home[0], bubble.home[1] + lift, bubble.home[2]], 6));
  }

  const oxygen = Math.max(0, Number(state.oxygen ?? 72) - delta);
  const complete = total > 0 && relics >= total;
  const atBell = distance2d(next, [0, 0.36, 3.75]) < 0.78;
  const relicText = `Relics ${relics}/${total}`;
  if (caught) {
    patchState({ phase: "failed", relics, oxygen, relicText, oxygenText: `Oxygen ${Math.ceil(oxygen)}`, status: "An eel scattered the salvage. Press Space to retry." });
    return;
  }
  if (oxygen <= 0) {
    patchState({ phase: "failed", relics, oxygen: 0, relicText, oxygenText: "Oxygen 0", status: "Out of oxygen. Press Space to retry the dive." });
    return;
  }
  if (complete && atBell) {
    patchState({ phase: "won", relics, oxygen, relicText, oxygenText: `Oxygen ${Math.ceil(oxygen)}`, status: "Relics secured at the air bell. Press Space for another dive." });
    return;
  }

  player.patch?.("DiverPlayer", { ...stats, relics });
  patchState({
    phase: "playing",
    relics,
    oxygen,
    relicText,
    oxygenText: `Oxygen ${Math.ceil(oxygen)}`,
    status: justCollected ? "Relic tablet recovered" : complete ? "Return to the air bell" : "Recover 3 relics, then return to the air bell"
  });
}
