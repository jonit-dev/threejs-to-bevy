import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function lanternOrchardSystem(context: ScriptContext): void {
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
  const readState = (): Record<string, unknown> => {
    const value = context.resources?.get?.("GameState");
    return isRecord(value) ? value : {};
  };
  const distance2d = (a: Vec3Tuple, b: Vec3Tuple): number => {
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dz * dz);
  };
  const resetGame = (): void => {
    player.transform().setPosition([0, 0.36, 3.45]);
    player.patch?.("PlayerHero", { speed: 3.4, dashCooldown: 0 });
    for (const entity of entities) {
      const lantern = entity.get?.("LanternFruit");
      if (lantern !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.38, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("LanternFruit", { ...lantern, collected: false });
      }
    }
    patchState({
      phase: "playing",
      score: 0,
      timer: 45,
      status: "Gather every lantern before the shadows catch you",
      scoreText: "0/8 lanterns",
      timerText: "Time 45",
      countdown: "Lanterns 0/8"
    });
  };

  let state = readState();
  const legacyState = context.resource?.("GameState");
  const patchState = (patch: Record<string, unknown>): void => {
    state = { ...state, ...patch };
    context.resources?.set?.("GameState", state);
    legacyState?.patch?.(patch);
  };

  const existingHomes = isRecord(state.lanternHomes) ? state.lanternHomes : {};
  const homes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.lanternHomes);
  for (const entity of entities) {
    if (entity.get?.("LanternFruit") === undefined) {
      continue;
    }
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      homes[entity.id] = saved;
      continue;
    }
    homes[entity.id] = entity.transform().positionOr([0, 0.38, 0]);
    homesChanged = true;
  }
  if (homesChanged) {
    patchState({ lanternHomes: homes });
  }

  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    for (const entity of entities) {
      const part = entity.get?.("PlayerPart");
      if (part?.target === "player" && isVec3(part.offset)) {
        const base = player.transform().positionOr([0, 0.36, 3.45]);
        entity.transform().setPosition(Vec3.round(Vec3.add(base, part.offset), 6));
      }
    }
    if (context.input.pressed?.("dash") || context.input.action?.("dash")) {
      resetGame();
    }
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const playerStats = player.get?.("PlayerHero") ?? { speed: 3.4, dashCooldown: 0 };
  const dashCooldown = Math.max(0, (playerStats.dashCooldown ?? 0) - delta);
  const dash = dashCooldown <= 0 && (context.input.pressed?.("dash") || context.input.action?.("dash"));
  const speed = (playerStats.speed ?? 3.4) * (dash ? 2.15 : 1);
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const current = player.transform().positionOr([0, 0.36, 3.45]);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta, -4.15, 4.15),
    0.36 + Math.sin(elapsed * 7) * 0.025,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.15, 4.15)
  ], 6);
  player.transform().setPosition(next);
  player.patch?.("PlayerHero", { ...playerStats, dashCooldown: dash ? 0.8 : dashCooldown });

  let collected = 0;
  let total = 0;
  let lastPickup = false;
  for (const entity of entities) {
    const lantern = entity.get?.("LanternFruit");
    if (lantern === undefined) {
      continue;
    }
    total += 1;
    if (lantern.collected === true) {
      collected += 1;
      continue;
    }
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.38, 0]);
    const bob = Math.sin(elapsed * 2.8 + (lantern.phase ?? 0)) * 0.08;
    const displayPosition: Vec3Tuple = [home[0], 0.42 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(displayPosition, 6));
    if (distance2d(next, displayPosition) < 0.58) {
      collected += 1;
      lastPickup = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("LanternFruit", { ...lantern, collected: true });
    }
  }

  let hitShadow = false;
  for (const entity of entities) {
    const hazard = entity.get?.("ShadowHazard");
    if (!isRecord(hazard) || !isVec3(hazard.origin)) {
      continue;
    }
    const escalation = collected >= 4 ? 1.25 : 1;
    const wave = Math.sin(elapsed * 0.9 * escalation + Number(hazard.phase ?? 0)) * Number(hazard.radius ?? 1);
    const moved: Vec3Tuple = hazard.axis === "x"
      ? [hazard.origin[0] + wave, hazard.origin[1], hazard.origin[2]]
      : [hazard.origin[0], hazard.origin[1], hazard.origin[2] + wave];
    entity.transform().setPosition(Vec3.round(moved, 6));
    if (distance2d(next, moved) < 0.62) {
      hitShadow = true;
    }
  }

  for (const entity of entities) {
    const part = entity.get?.("PlayerPart");
    if (part?.target !== "player" || !isVec3(part.offset)) {
      continue;
    }
    const glow = entity.id === "player.lantern" ? Math.sin(elapsed * 8) * 0.035 : 0;
    entity.transform().setPosition(Vec3.round(Vec3.add(next, [part.offset[0], part.offset[1] + glow, part.offset[2]]), 6));
  }

  const timer = Math.max(0, Number(state.timer ?? 45) - delta);
  if (hitShadow) {
    patchState({
      phase: "failed",
      status: "Caught by a shadow. Press Space to retry.",
      scoreText: `${collected}/${total} lanterns`,
      timerText: `Time ${Math.ceil(timer)}`,
      score: collected,
      timer
    });
    return;
  }
  if (total > 0 && collected >= total) {
    patchState({
      phase: "won",
      status: "Orchard relit. Press Space to play again.",
      scoreText: `${collected}/${total} lanterns`,
      timerText: `Time ${Math.ceil(timer)}`,
      score: collected,
      timer
    });
    return;
  }
  if (timer <= 0) {
    patchState({
      phase: "failed",
      status: "The lanterns went dark. Press Space to retry.",
      scoreText: `${collected}/${total} lanterns`,
      timerText: "Time 0",
      score: collected,
      timer: 0
    });
    return;
  }

  patchState({
    status: lastPickup ? "Lantern gathered" : "Gather every lantern before the shadows catch you",
    scoreText: `${collected}/${total} lanterns`,
    countdown: `Lanterns ${collected}/${total}`,
    timerText: `Time ${Math.ceil(timer)}`,
    score: collected,
    timer
  });
}
