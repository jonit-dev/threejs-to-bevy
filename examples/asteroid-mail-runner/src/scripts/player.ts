import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function asteroidMailRunnerSystem(context: ScriptContext): void {
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
    const drift = Math.sin(elapsed * 7.5) * 0.018;
    const tiltX = NumberEx.clamp(axisX * -0.08, -0.12, 0.12);
    for (const entity of entities) {
      const follower = entity.get?.("ShipFollower");
      if (follower === undefined || !isVec3(follower.offset)) continue;
      const offset = follower.offset;
      entity.transform().setPosition(Vec3.round([playerPosition[0] + offset[0], playerPosition[1] + offset[1] + drift, playerPosition[2] + offset[2]], 6));
      if (entity.id.includes("wing")) entity.transform().setRotation?.([0, 0, tiltX]);
    }
    const thruster = entities.find((entity: any) => entity.get?.("ThrusterFlame") !== undefined);
    const flame = 0.8 + Math.max(0, axisZ < 0 ? -axisZ : 0.35) * 0.45 + Math.sin(elapsed * 18) * 0.08;
    thruster?.transform().setScale?.([0.2, 0.32 * flame, 0.2]);
  };
  const animateBeacon = (): void => {
    for (const entity of entities) {
      const pulse = entity.get?.("BeaconPulse");
      if (pulse === undefined) continue;
      const scale = 1 + Math.max(0, Math.sin(elapsed * 3.6 + Number(pulse.phase ?? 0))) * 0.24;
      entity.transform().setScale?.([0.42 * scale, 0.42 * scale, 0.42 * scale]);
    }
  };
  const animateAsteroids = (playerPosition?: Vec3Tuple): boolean => {
    let hit = false;
    for (const entity of entities) {
      const asteroid = entity.get?.("Asteroid");
      if (asteroid === undefined || !isVec3(asteroid.origin)) continue;
      const origin = asteroid.origin;
      const radius = Number(asteroid.radius ?? 1);
      const speed = Number(asteroid.speed ?? 1);
      const wave = Math.sin(elapsed * speed + Number(asteroid.phase ?? 0)) * radius;
      const moved: Vec3Tuple = asteroid.axis === "z" ? [origin[0], origin[1], origin[2] + wave] : [origin[0] + wave, origin[1], origin[2]];
      const tumble = 1 + Math.sin(elapsed * 2.7 + Number(asteroid.phase ?? 0)) * 0.08;
      entity.transform().setPosition(Vec3.round(moved, 6));
      entity.transform().setScale?.([0.56 * tumble, 0.44 * (1 / tumble), 0.54]);
      const warning = entities.find((candidate: any) => candidate.id === `${entity.id}.warn`);
      warning?.transform().setPosition(Vec3.round([moved[0], 0.05, moved[2]], 6));
      if (playerPosition !== undefined && distance2d(playerPosition, moved) < 0.62) hit = true;
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
    if (entity.get?.("DataCapsule") === undefined && entity.get?.("CheckpointRing") === undefined) continue;
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
    const start: Vec3Tuple = [0, 0.34, 4.15];
    player.transform().setPosition(start);
    player.patch?.("MailShip", { speed: 3.25, rings: 0, cargo: 0 });
    for (const entity of entities) {
      const capsule = entity.get?.("DataCapsule");
      if (capsule !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.5, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("DataCapsule", { ...capsule, collected: false });
      }
      const ring = entity.get?.("CheckpointRing");
      if (ring !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.92, 0]);
        entity.transform().setPosition(home);
        entity.transform().setScale?.([1.4, 1.4, 1.4]);
        entity.patch?.("CheckpointRing", { ...ring, passed: false });
      }
    }
    patchFollowers(start, 0, 0);
    patchState({
      phase: "playing",
      rings: 0,
      cargo: 0,
      fuel: 75,
      ringText: "Rings 0/3",
      cargoText: "Data 0/4",
      fuelText: "Fuel 75",
      status: "Data, rings, beacon"
    });
  };

  const current = player.transform().positionOr([0, 0.34, 4.15]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    animateBeacon();
    animateAsteroids();
    patchFollowers(current, 0, 0);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("MailShip") ?? { speed: 3.25, rings: 0, cargo: 0 };
  const magnitude = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const speed = Number(stats.speed ?? 3.25);
  const bob = Math.sin(elapsed * 6.8) * 0.025;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / magnitude) * speed * delta, -2.3, 2.3),
    0.34 + bob,
    NumberEx.clamp(current[2] + (axisZ / magnitude) * speed * delta, -4.45, 4.25)
  ], 6);
  player.transform().setPosition(next);
  patchFollowers(next, axisX, axisZ);

  let rings = Number(state.rings ?? stats.rings ?? 0);
  let cargo = Number(state.cargo ?? stats.cargo ?? 0);
  let totalRings = 0;
  let totalCargo = 0;
  let eventText = "";

  for (const entity of entities) {
    const capsule = entity.get?.("DataCapsule");
    if (capsule === undefined) continue;
    totalCargo += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.5, 0]);
    if (capsule.collected === true) {
      entity.transform().setPosition([home[0], -4, home[2]]);
      continue;
    }
    const float = Math.sin(elapsed * 4.8 + Number(capsule.phase ?? 0)) * 0.08;
    const display: Vec3Tuple = [home[0], 0.5 + float, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.52) {
      cargo += 1;
      eventText = "Data secured";
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("DataCapsule", { ...capsule, collected: true });
    }
  }

  for (const entity of entities) {
    const ring = entity.get?.("CheckpointRing");
    if (ring === undefined) continue;
    totalRings += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.92, 0]);
    const pulse = 1 + Math.sin(elapsed * 3.1 + Number(ring.phase ?? 0)) * 0.05;
    entity.transform().setPosition(Vec3.round([home[0], home[1] + Math.sin(elapsed * 2.5 + Number(ring.phase ?? 0)) * 0.04, home[2]], 6));
    entity.transform().setScale?.(ring.passed === true ? [1.08, 1.08, 1.08] : [1.4 * pulse, 1.4 * pulse, 1.4 * pulse]);
    if (ring.passed !== true && Math.abs(next[2] - home[2]) < 0.34 && Math.abs(next[0] - home[0]) < 0.95) {
      rings += 1;
      eventText = "Ring logged";
      entity.patch?.("CheckpointRing", { ...ring, passed: true });
    }
  }

  const hitAsteroid = animateAsteroids(next);
  animateBeacon();

  const docked = distance2d(next, [0, 0.34, -4.45]) < 1.08;
  const fuel = Math.max(0, Number(state.fuel ?? 75) - delta);
  const ringText = `Rings ${Math.min(rings, totalRings)}/${totalRings}`;
  const cargoText = `Data ${Math.min(cargo, totalCargo)}/${totalCargo}`;
  const fuelText = `Fuel ${Math.ceil(fuel)}`;

  if (hitAsteroid) {
    patchState({ phase: "failed", rings, cargo, fuel, ringText, cargoText, fuelText, status: "Asteroid hit - Space" });
    return;
  }
  if (fuel <= 0) {
    patchState({ phase: "failed", rings, cargo, fuel: 0, ringText, cargoText, fuelText: "Fuel empty - Space" });
    return;
  }
  if (docked && rings >= totalRings && cargo >= totalCargo) {
    patchState({ phase: "won", rings, cargo, fuel, ringText, cargoText, fuelText, status: "Mail delivered - Space" });
    player.patch?.("MailShip", { ...stats, rings, cargo });
    return;
  }

  player.patch?.("MailShip", { ...stats, rings, cargo });
  patchState({
    phase: "playing",
    rings,
    cargo,
    fuel,
    ringText,
    cargoText,
    fuelText,
    status: eventText !== "" ? eventText : docked ? "Dock after rings and data" : "Data, rings, beacon"
  });
}
