import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function fireflyGroveKeeperSystem(context: ScriptContext): void {
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
  const patchFollowers = (playerPosition: Vec3Tuple, axisX: number, axisZ: number): void => {
    const wingBeat = Math.sin(elapsed * 16);
    const drift = Math.sin(elapsed * 6.2) * 0.035;
    for (const entity of entities) {
      const follower = entity.get?.("FireflyFollower");
      if (follower === undefined || !isVec3(follower.offset)) continue;
      const offset = follower.offset;
      entity.transform().setPosition(Vec3.round([playerPosition[0] + offset[0], playerPosition[1] + offset[1] + drift, playerPosition[2] + offset[2]], 6));
      if (entity.id.includes("left-wing")) entity.transform().setRotation?.([0, 0, 0.28 + wingBeat * 0.28 + axisX * -0.08]);
      if (entity.id.includes("right-wing")) entity.transform().setRotation?.([0, 0, -0.28 - wingBeat * 0.28 + axisX * -0.08]);
    }
    const glow = entities.find((entity: any) => entity.id === "player.glow");
    const glowScale = 1 + Math.max(0, Math.sin(elapsed * 8.4)) * 0.22 + Math.abs(axisZ) * 0.06;
    glow?.transform().setScale?.([0.26 * glowScale, 0.18 * glowScale, 0.26 * glowScale]);
  };
  const animateMoths = (playerPosition?: Vec3Tuple): boolean => {
    let hit = false;
    for (const entity of entities) {
      const moth = entity.get?.("MothShadow");
      if (moth === undefined || !isVec3(moth.origin)) continue;
      const origin = moth.origin;
      const radius = Number(moth.radius ?? 1);
      const speed = Number(moth.speed ?? 1);
      const wave = Math.sin(elapsed * speed + Number(moth.phase ?? 0)) * radius;
      const moved: Vec3Tuple = moth.axis === "z" ? [origin[0], origin[1], origin[2] + wave] : [origin[0] + wave, origin[1], origin[2]];
      const flutter = 1 + Math.sin(elapsed * 11 + Number(moth.phase ?? 0)) * 0.1;
      entity.transform().setPosition(Vec3.round(moved, 6));
      entity.transform().setScale?.([0.62 * flutter, 0.1, 0.34 / flutter]);
      const warning = entities.find((candidate: any) => candidate.id === `${entity.id}.warn`);
      warning?.transform().setPosition(Vec3.round([moved[0], 0.05, moved[2]], 6));
      if (playerPosition !== undefined && distance2d(playerPosition, moved) < 0.56) hit = true;
    }
    return hit;
  };
  const animateSetDressing = (): void => {
    for (const entity of entities) {
      const bob = entity.get?.("MushroomBob");
      if (bob !== undefined) {
        const scale = 1 + Math.sin(elapsed * 2.6 + Number(bob.phase ?? 0)) * 0.035;
        entity.transform().setScale?.([0.3 * scale, 0.16, 0.3 * scale]);
      }
      const pulse = entity.get?.("GlowPulse");
      if (pulse !== undefined && isVec3(pulse.baseScale)) {
        const scale = 1 + Math.max(0, Math.sin(elapsed * 7.2 + Number(pulse.phase ?? 0))) * 0.2;
        entity.transform().setScale?.([pulse.baseScale[0] * scale, pulse.baseScale[1] * scale, pulse.baseScale[2] * scale]);
      }
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

  const existingHomes = isRecord(state.homes) ? state.homes : {};
  const homes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.homes);
  for (const entity of entities) {
    if (entity.get?.("PollenSpark") === undefined && entity.get?.("LanternFlower") === undefined) continue;
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      homes[entity.id] = saved;
      continue;
    }
    homes[entity.id] = entity.transform().positionOr([0, 0.5, 0]);
    homesChanged = true;
  }
  if (homesChanged) patchState({ homes });

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.46, 4.05];
    player.transform().setPosition(start);
    player.patch?.("Firefly", { speed: 3.05, pollen: 0, flowers: 0 });
    for (const entity of entities) {
      const spark = entity.get?.("PollenSpark");
      if (spark !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.5, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("PollenSpark", { ...spark, collected: false });
      }
      const flower = entity.get?.("LanternFlower");
      if (flower !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.86, 0]);
        entity.transform().setPosition(home);
        entity.transform().setScale?.([0.42, 0.24, 0.42]);
        entity.patch?.("LanternFlower", { ...flower, lit: false });
      }
    }
    patchFollowers(start, 0, 0);
    patchState({
      phase: "playing",
      pollen: 0,
      flowers: 0,
      dawn: 78,
      pollenText: "Pollen 0/5",
      flowersText: "Flowers 0/3",
      dawnText: "Dawn 78",
      status: "Spark, bloom, stump"
    });
  };

  const current = player.transform().positionOr([0, 0.46, 4.05]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    animateMoths();
    animateSetDressing();
    patchFollowers(current, 0, 0);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("Firefly") ?? { speed: 3.05, pollen: 0, flowers: 0 };
  const magnitude = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const speed = Number(stats.speed ?? 3.05);
  const hover = Math.sin(elapsed * 7.6) * 0.035;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / magnitude) * speed * delta, -2.55, 2.55),
    0.46 + hover,
    NumberEx.clamp(current[2] + (axisZ / magnitude) * speed * delta, -4.15, 4.2)
  ], 6);
  player.transform().setPosition(next);
  patchFollowers(next, axisX, axisZ);
  animateSetDressing();

  let pollen = Number(state.pollen ?? stats.pollen ?? 0);
  let flowers = Number(state.flowers ?? stats.flowers ?? 0);
  let totalPollen = 0;
  let totalFlowers = 0;
  let eventText = "";

  for (const entity of entities) {
    const spark = entity.get?.("PollenSpark");
    if (spark === undefined) continue;
    totalPollen += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.48, 0]);
    if (spark.collected === true) {
      entity.transform().setPosition([home[0], -4, home[2]]);
      continue;
    }
    const float = Math.sin(elapsed * 5.2 + Number(spark.phase ?? 0)) * 0.1;
    const display: Vec3Tuple = [home[0], 0.48 + float, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    entity.transform().setScale?.([0.18 + Math.max(0, float) * 0.28, 0.18 + Math.max(0, float) * 0.28, 0.18 + Math.max(0, float) * 0.28]);
    if (distance2d(next, display) < 0.5) {
      pollen += 1;
      eventText = "Pollen found";
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("PollenSpark", { ...spark, collected: true });
    }
  }

  for (const entity of entities) {
    const flower = entity.get?.("LanternFlower");
    if (flower === undefined) continue;
    totalFlowers += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.86, 0]);
    const lit = flower.lit === true;
    const pulse = lit ? 1.05 + Math.sin(elapsed * 3.4 + Number(flower.phase ?? 0)) * 0.08 : 1 + Math.sin(elapsed * 2.2 + Number(flower.phase ?? 0)) * 0.025;
    entity.transform().setPosition(Vec3.round([home[0], home[1] + Math.sin(elapsed * 2.6 + Number(flower.phase ?? 0)) * 0.04, home[2]], 6));
    entity.transform().setScale?.([0.42 * pulse, 0.24 * pulse, 0.42 * pulse]);
    if (!lit && pollen > 0 && distance2d(next, home) < 0.72) {
      pollen -= 1;
      flowers += 1;
      eventText = "Flower lit";
      entity.patch?.("LanternFlower", { ...flower, lit: true });
    }
  }

  const hitMoth = animateMoths(next);
  const dawn = Math.max(0, Number(state.dawn ?? 78) - delta);
  const docked = distance2d(next, [0, 0.46, 4.28]) < 0.96;
  const pollenText = `Pollen ${Math.min(pollen, totalPollen)}/${totalPollen}`;
  const flowersText = `Flowers ${Math.min(flowers, totalFlowers)}/${totalFlowers}`;
  const dawnText = `Dawn ${Math.ceil(dawn)}`;

  if (hitMoth) {
    patchState({ phase: "failed", pollen, flowers, dawn, pollenText, flowersText, dawnText, status: "Moth caught - Space" });
    return;
  }
  if (dawn <= 0) {
    patchState({ phase: "failed", pollen, flowers, dawn: 0, pollenText, flowersText, dawnText: "Dawn - Space", status: "Try again" });
    return;
  }
  if (docked && flowers >= totalFlowers) {
    patchState({ phase: "won", pollen, flowers, dawn, pollenText, flowersText, dawnText, status: "Grove lit - Space" });
    player.patch?.("Firefly", { ...stats, pollen, flowers });
    return;
  }

  player.patch?.("Firefly", { ...stats, pollen, flowers });
  patchState({
    phase: "playing",
    pollen,
    flowers,
    dawn,
    pollenText,
    flowersText,
    dawnText,
    status: eventText !== "" ? eventText : docked ? "Light flowers first" : "Spark, bloom, stump"
  });
}
