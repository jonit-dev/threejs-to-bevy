import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function skyLighthouseRelaySystem(context: ScriptContext): void {
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

  const existingHomes = isRecord(state.sparkHomes) ? state.sparkHomes : {};
  const sparkHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.sparkHomes);
  for (const entity of entities) {
    if (entity.get?.("BeaconSpark") === undefined) {
      continue;
    }
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      sparkHomes[entity.id] = saved;
      continue;
    }
    sparkHomes[entity.id] = entity.transform().positionOr([0, 0.65, 0]);
    homesChanged = true;
  }
  if (homesChanged) {
    patchState({ sparkHomes });
  }

  const syncAirshipParts = (base: Vec3Tuple): void => {
    for (const entity of entities) {
      const part = entity.get?.("AirshipPart");
      if (part?.target !== "player" || !isVec3(part.offset)) {
        continue;
      }
      const pulse = entity.id === "player.lamp" ? Math.sin(elapsed * 8.5) * 0.045 : 0;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, [part.offset[0], part.offset[1] + pulse, part.offset[2]]), 6));
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [-1.6, 0.9, 3.45];
    player.transform().setPosition(start);
    player.patch?.("Airship", { speed: 3.15, sparks: 0 });
    syncAirshipParts(start);
    for (const entity of entities) {
      const spark = entity.get?.("BeaconSpark");
      if (spark !== undefined) {
        const home = sparkHomes[entity.id] ?? entity.transform().positionOr([0, 0.65, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("BeaconSpark", { ...spark, collected: false });
      }
    }
    patchState({
      phase: "playing",
      sparks: 0,
      timer: 70,
      countdown: "Sparks 0/4",
      timerText: "Time 70",
      status: "Collect 4 sparks, then land at the lighthouse"
    });
  };

  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    syncAirshipParts(player.transform().positionOr([-1.6, 0.9, 3.45]));
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) {
      resetGame();
    }
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("Airship") ?? { speed: 3.15, sparks: 0 };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const current = player.transform().positionOr([-1.6, 0.9, 3.45]);
  const float = Math.sin(elapsed * 4.4) * 0.035;
  const speed = Number(stats.speed ?? 3.15);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta, -4.7, 4.7),
    0.9 + float,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.2, 4.0)
  ], 6);
  player.transform().setPosition(next);
  syncAirshipParts(next);

  let collected = 0;
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const spark = entity.get?.("BeaconSpark");
    if (spark === undefined) {
      continue;
    }
    total += 1;
    if (spark.collected === true) {
      collected += 1;
      continue;
    }
    const home = sparkHomes[entity.id] ?? entity.transform().positionOr([0, 0.65, 0]);
    const bob = Math.sin(elapsed * 3.8 + Number(spark.phase ?? 0)) * 0.12;
    const displayPosition: Vec3Tuple = [home[0], 0.65 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(displayPosition, 6));
    if (distance2d(next, displayPosition) < 0.62) {
      collected += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("BeaconSpark", { ...spark, collected: true });
    }
  }

  let hitStorm = false;
  for (const entity of entities) {
    const storm = entity.get?.("StormCloud");
    if (!isRecord(storm) || !isVec3(storm.origin)) {
      continue;
    }
    const escalation = collected >= 2 ? 1.25 : 1;
    const wave = Math.sin(elapsed * 0.82 * escalation + Number(storm.phase ?? 0)) * Number(storm.radius ?? 1);
    const moved: Vec3Tuple = storm.axis === "z"
      ? [storm.origin[0], storm.origin[1], storm.origin[2] + wave]
      : [storm.origin[0] + wave, storm.origin[1], storm.origin[2]];
    entity.transform().setPosition(Vec3.round(moved, 6));
    if (distance2d(next, moved) < 0.78) {
      hitStorm = true;
    }
  }

  const timer = Math.max(0, Number(state.timer ?? 70) - delta);
  const atLighthouse = distance2d(next, [3.85, 0.86, -3.35]) < 0.95;
  if (hitStorm) {
    patchState({
      phase: "failed",
      sparks: collected,
      timer,
      countdown: `Sparks ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "Storm cloud scattered the charge. Press Space to retry."
    });
    return;
  }
  if (timer <= 0) {
    patchState({
      phase: "failed",
      sparks: collected,
      timer: 0,
      countdown: `Sparks ${collected}/${total}`,
      timerText: "Time 0",
      status: "The beacon faded. Press Space to retry."
    });
    return;
  }
  if (total > 0 && collected >= total && atLighthouse) {
    patchState({
      phase: "won",
      sparks: collected,
      timer,
      countdown: `Sparks ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "Lighthouse charged. Press Space for another relay."
    });
    return;
  }

  player.patch?.("Airship", { ...stats, sparks: collected });
  patchState({
    phase: "playing",
    sparks: collected,
    timer,
    countdown: `Sparks ${collected}/${total}`,
    timerText: `Time ${Math.ceil(timer)}`,
    status: justCollected
      ? "Beacon spark captured"
      : collected >= total
        ? "Deliver the charge to the lighthouse"
        : "Collect 4 sparks, then land at the lighthouse"
  });
}
