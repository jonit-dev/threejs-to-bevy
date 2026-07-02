import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function clockworkGardenHeistSystem(context: ScriptContext): void {
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

  const existingHomes = isRecord(state.itemHomes) ? state.itemHomes : {};
  const itemHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.itemHomes);
  for (const entity of entities) {
    if (entity.get?.("Gem") === undefined && entity.get?.("KeyItem") === undefined) {
      continue;
    }
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      itemHomes[entity.id] = saved;
      continue;
    }
    itemHomes[entity.id] = entity.transform().positionOr([0, 0.45, 0]);
    homesChanged = true;
  }
  if (homesChanged) {
    patchState({ itemHomes });
  }

  const syncPlayerParts = (base: Vec3Tuple): void => {
    for (const entity of entities) {
      const part = entity.get?.("PlayerPart");
      if (part?.target !== "player" || !isVec3(part.offset)) {
        continue;
      }
      const gearPulse = entity.id === "player.gear" ? Math.sin(elapsed * 8.5) * 0.035 : 0;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, [part.offset[0], part.offset[1] + gearPulse, part.offset[2]]), 6));
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.34, 3.65];
    player.transform().setPosition(start);
    player.patch?.("ClockworkPlayer", { speed: 3.25, gems: 0, hasKey: false });
    syncPlayerParts(start);
    for (const entity of entities) {
      const gem = entity.get?.("Gem");
      if (gem !== undefined) {
        const home = itemHomes[entity.id] ?? entity.transform().positionOr([0, 0.45, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("Gem", { ...gem, collected: false });
      }
      const key = entity.get?.("KeyItem");
      if (key !== undefined) {
        const home = itemHomes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("KeyItem", { ...key, collected: false });
      }
      const gate = entity.get?.("GateLock");
      if (gate !== undefined) {
        entity.transform().setPosition([0, 0.96, -4.1]);
        entity.patch?.("GateLock", { ...gate, locked: true });
      }
    }
    patchState({
      phase: "playing",
      gems: 0,
      hasKey: false,
      timer: 70,
      lootText: "Gems 0/3 | Key 0/1",
      timerText: "Time 70",
      status: "Steal the gems and key, then slip through the moon gate"
    });
  };

  const currentPosition = player.transform().positionOr([0, 0.34, 3.65]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    syncPlayerParts(currentPosition);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) {
      resetGame();
    }
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("ClockworkPlayer") ?? { speed: 3.25, gems: 0, hasKey: false };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const hover = Math.sin(elapsed * 7.2) * 0.025;
  const speed = Number(stats.speed ?? 3.25);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(currentPosition[0] + (axisX / length) * speed * delta, -3.0, 3.0),
    0.34 + hover,
    NumberEx.clamp(currentPosition[2] + (axisZ / length) * speed * delta, -4.02, 4.05)
  ], 6);
  player.transform().setPosition(next);
  syncPlayerParts(next);

  let gems = 0;
  let totalGems = 0;
  let justPickedGem = false;
  for (const entity of entities) {
    const gem = entity.get?.("Gem");
    if (gem === undefined) {
      continue;
    }
    totalGems += 1;
    if (gem.collected === true) {
      gems += 1;
      continue;
    }
    const home = itemHomes[entity.id] ?? entity.transform().positionOr([0, 0.45, 0]);
    const bob = Math.sin(elapsed * 4.8 + Number(gem.phase ?? 0)) * 0.09;
    const display: Vec3Tuple = [home[0], 0.45 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.56) {
      gems += 1;
      justPickedGem = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("Gem", { ...gem, collected: true });
    }
  }

  let hasKey = Boolean(stats.hasKey ?? state.hasKey);
  for (const entity of entities) {
    const key = entity.get?.("KeyItem");
    if (key === undefined) {
      continue;
    }
    if (key.collected === true) {
      hasKey = true;
      continue;
    }
    const home = itemHomes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
    const bob = Math.sin(elapsed * 4.2 + Number(key.phase ?? 0)) * 0.07;
    const display: Vec3Tuple = [home[0], 0.42 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.58) {
      hasKey = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("KeyItem", { ...key, collected: true });
    }
  }

  let caught = false;
  const sentryPositions: Record<string, Vec3Tuple> = {};
  for (const entity of entities) {
    const patrol = entity.get?.("SentryPatrol");
    if (!isRecord(patrol) || !isVec3(patrol.origin)) {
      continue;
    }
    const escalation = gems >= 2 ? 1.24 : 1;
    const wave = Math.sin(elapsed * 0.95 * escalation + Number(patrol.phase ?? 0)) * Number(patrol.radius ?? 1);
    const moved: Vec3Tuple = patrol.axis === "z"
      ? [patrol.origin[0], patrol.origin[1], patrol.origin[2] + wave]
      : [patrol.origin[0] + wave, patrol.origin[1], patrol.origin[2]];
    sentryPositions[entity.id] = moved;
    entity.transform().setPosition(Vec3.round(moved, 6));
    if (distance2d(next, moved) < 0.64) {
      caught = true;
    }
  }
  for (const entity of entities) {
    const lamp = entity.get?.("SentryLamp");
    if (!isRecord(lamp) || typeof lamp.target !== "string" || !isVec3(lamp.offset)) {
      continue;
    }
    const base = sentryPositions[lamp.target];
    if (base !== undefined) {
      const pulse = Math.sin(elapsed * 12) * 0.04;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, [lamp.offset[0], lamp.offset[1] + pulse, lamp.offset[2]]), 6));
    }
  }

  const timer = Math.max(0, Number(state.timer ?? 70) - delta);
  const unlocked = hasKey && gems >= totalGems && totalGems > 0;
  for (const entity of entities) {
    const gate = entity.get?.("GateLock");
    if (gate === undefined) {
      continue;
    }
    entity.transform().setPosition(unlocked ? [0, -1.1, -4.1] : [0, 0.96, -4.1]);
    entity.patch?.("GateLock", { ...gate, locked: !unlocked });
  }

  const atExit = distance2d(next, [0, 0.34, -4.08]) < 0.78;
  const lootText = `Gems ${gems}/${totalGems} | Key ${hasKey ? 1 : 0}/1`;
  if (caught) {
    patchState({
      phase: "failed",
      gems,
      hasKey,
      timer,
      lootText,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "A sentry lamp caught the automaton. Press Space to retry."
    });
    return;
  }
  if (timer <= 0) {
    patchState({
      phase: "failed",
      gems,
      hasKey,
      timer: 0,
      lootText,
      timerText: "Time 0",
      status: "The garden clock struck midnight. Press Space to retry."
    });
    return;
  }
  if (unlocked && atExit) {
    patchState({
      phase: "won",
      gems,
      hasKey,
      timer,
      lootText,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "Moon gate cleared with the loot. Press Space for another heist."
    });
    return;
  }

  player.patch?.("ClockworkPlayer", { ...stats, gems, hasKey });
  patchState({
    phase: "playing",
    gems,
    hasKey,
    timer,
    lootText,
    timerText: `Time ${Math.ceil(timer)}`,
    status: justPickedGem
      ? "Gem lifted. Keep away from the sentry lamps."
      : unlocked
        ? "Gate unlocked. Reach the moon exit."
        : hasKey
          ? "Key secured. Finish collecting the gems."
          : "Steal the gems and key, then slip through the moon gate"
  });
}
