import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function windupWorkshopSorterSystem(context: ScriptContext): void {
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

  const patchFollowers = (position: Vec3Tuple, axisX: number, axisZ: number): void => {
    const scamper = Math.sin(elapsed * 14) * 0.025;
    for (const entity of entities) {
      const follower = entity.get?.("MouseFollower");
      if (follower === undefined || !isVec3(follower.offset)) continue;
      const offset = follower.offset;
      entity.transform().setPosition(Vec3.round([position[0] + offset[0], position[1] + offset[1] + scamper, position[2] + offset[2]], 6));
      if (entity.id === "player.key") entity.transform().setRotation?.([0, elapsed * 4.6, axisX * -0.18]);
      if (entity.id === "player.tail") entity.transform().setRotation?.([axisZ * 0.12, 0, Math.sin(elapsed * 7) * 0.22]);
    }
  };

  const animateMarbles = (playerPosition?: Vec3Tuple): boolean => {
    let hit = false;
    for (const entity of entities) {
      const hazard = entity.get?.("MarbleHazard");
      if (hazard === undefined || !isVec3(hazard.origin)) continue;
      const origin = hazard.origin;
      const radius = Number(hazard.radius ?? 1);
      const speed = Number(hazard.speed ?? 1);
      const roll = Math.sin(elapsed * speed + Number(hazard.phase ?? 0)) * radius;
      const moved: Vec3Tuple = hazard.axis === "z" ? [origin[0], origin[1], origin[2] + roll] : [origin[0] + roll, origin[1], origin[2]];
      entity.transform().setPosition(Vec3.round(moved, 6));
      entity.transform().setRotation?.([elapsed * speed * 2.4, 0, roll]);
      if (playerPosition !== undefined && distance2d(playerPosition, moved) < 0.55) hit = true;
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

  const existingHomes = isRecord(state.homes) ? state.homes : {};
  const homes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.homes);
  for (const entity of entities) {
    if (entity.get?.("GearToken") === undefined && entity.get?.("RepairBay") === undefined) continue;
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      homes[entity.id] = saved;
      continue;
    }
    homes[entity.id] = entity.transform().positionOr([0, 0.42, 0]);
    homesChanged = true;
  }
  if (homesChanged) patchState({ homes });

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.36, 3.42];
    player.transform().setPosition(start);
    player.patch?.("MouseCourier", { speed: 3.05, gears: 0, bays: 0 });
    for (const entity of entities) {
      const gear = entity.get?.("GearToken");
      if (gear !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("GearToken", { ...gear, collected: false });
      }
      const bay = entity.get?.("RepairBay");
      if (bay !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
        entity.transform().setPosition(home);
        entity.transform().setScale?.([0.62, 0.62, 0.62]);
        entity.patch?.("RepairBay", { ...bay, charged: false });
      }
    }
    patchFollowers(start, 0, 0);
    patchState({ phase: "playing", gears: 0, bays: 0, clock: 78, gearText: "Gears 0/5", bayText: "Bays 0/3", clockText: "Clock 78", status: "Gather gears" });
  };

  const current = player.transform().positionOr([0, 0.36, 3.42]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    animateMarbles();
    patchFollowers(current, 0, 0);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("MouseCourier") ?? { speed: 3.05, gears: 0, bays: 0 };
  const magnitude = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const speed = Number(stats.speed ?? 3.05);
  const bob = Math.sin(elapsed * 9.5) * 0.018;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / magnitude) * speed * delta, -2.55, 2.55),
    0.36 + bob,
    NumberEx.clamp(current[2] + (axisZ / magnitude) * speed * delta, -4.12, 4.18)
  ], 6);
  player.transform().setPosition(next);
  patchFollowers(next, axisX, axisZ);

  let gears = Number(state.gears ?? stats.gears ?? 0);
  let bays = Number(state.bays ?? stats.bays ?? 0);
  let totalGears = 0;
  let totalBays = 0;
  let eventText = "";

  for (const entity of entities) {
    const gear = entity.get?.("GearToken");
    if (gear === undefined) continue;
    totalGears += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
    if (gear.collected === true) {
      entity.transform().setPosition([home[0], -4, home[2]]);
      continue;
    }
    const float = Math.sin(elapsed * 5.2 + Number(gear.phase ?? 0)) * 0.08;
    const display: Vec3Tuple = [home[0], 0.42 + float, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.48) {
      gears += 1;
      eventText = "Gear loaded";
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("GearToken", { ...gear, collected: true });
    }
  }

  for (const entity of entities) {
    const bay = entity.get?.("RepairBay");
    if (bay === undefined) continue;
    totalBays += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
    const charged = bay.charged === true;
    const pulse = charged ? 1.08 + Math.sin(elapsed * 3.8 + Number(bay.phase ?? 0)) * 0.08 : 1 + Math.sin(elapsed * 2.4 + Number(bay.phase ?? 0)) * 0.03;
    entity.transform().setPosition(Vec3.round([home[0], home[1] + Math.sin(elapsed * 2.3 + Number(bay.phase ?? 0)) * 0.035, home[2]], 6));
    entity.transform().setScale?.([0.62 * pulse, 0.62 * pulse, 0.62 * pulse]);
    if (!charged && gears > 0 && distance2d(next, home) < 0.72) {
      gears -= 1;
      bays += 1;
      eventText = "Bay repaired";
      entity.patch?.("RepairBay", { ...bay, charged: true });
    }
  }

  const hitHazard = animateMarbles(next);
  const clock = Math.max(0, Number(state.clock ?? 78) - delta);
  const docked = distance2d(next, [0, 0.36, 4.12]) < 0.98;
  const gearText = `Gears ${Math.min(gears, totalGears)}/${totalGears}`;
  const bayText = `Bays ${Math.min(bays, totalBays)}/${totalBays}`;
  const clockText = `Clock ${Math.ceil(clock)}`;

  if (hitHazard) {
    patchState({ phase: "failed", gears, bays, clock, gearText, bayText, clockText, status: "Marble crash - Space" });
    return;
  }
  if (clock <= 0) {
    patchState({ phase: "failed", gears, bays, clock: 0, gearText, bayText, clockText: "Clock - Space", status: "Clock stopped" });
    return;
  }
  if (docked && bays >= totalBays) {
    patchState({ phase: "won", gears, bays, clock, gearText, bayText, clockText, status: "Toy delivered - Space" });
    player.patch?.("MouseCourier", { ...stats, gears, bays });
    return;
  }

  player.patch?.("MouseCourier", { ...stats, gears, bays });
  patchState({ phase: "playing", gears, bays, clock, gearText, bayText, clockText, status: eventText !== "" ? eventText : docked ? "Repair bays first" : "Gather gears" });
}
