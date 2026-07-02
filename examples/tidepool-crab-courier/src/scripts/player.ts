import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function tidepoolCrabCourierSystem(context: ScriptContext): void {
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
    const scuttle = Math.sin(elapsed * 12) * 0.035;
    for (const entity of entities) {
      const follower = entity.get?.("CrabFollower");
      if (follower === undefined || !isVec3(follower.offset)) continue;
      const offset = follower.offset;
      entity.transform().setPosition(Vec3.round([position[0] + offset[0], position[1] + offset[1] + scuttle, position[2] + offset[2]], 6));
      if (entity.id.includes("claw")) entity.transform().setRotation?.([0, 0, axisX * -0.24 + Math.sin(elapsed * 10) * 0.18]);
    }
  };
  const animateHazards = (playerPosition?: Vec3Tuple): boolean => {
    let hit = false;
    for (const entity of entities) {
      const hazard = entity.get?.("TideHazard");
      if (hazard === undefined || !isVec3(hazard.origin)) continue;
      const origin = hazard.origin;
      const radius = Number(hazard.radius ?? 1);
      const speed = Number(hazard.speed ?? 1);
      const wave = Math.sin(elapsed * speed + Number(hazard.phase ?? 0)) * radius;
      const moved: Vec3Tuple = hazard.axis === "z" ? [origin[0], origin[1], origin[2] + wave] : [origin[0] + wave, origin[1], origin[2]];
      const pulse = 1 + Math.sin(elapsed * 7 + Number(hazard.phase ?? 0)) * 0.08;
      entity.transform().setPosition(Vec3.round(moved, 6));
      if (entity.id.startsWith("foam")) entity.transform().setScale?.([1.08 * pulse, 0.08, 0.18]);
      const warning = entities.find((candidate: any) => candidate.id === `${entity.id}.warn`);
      warning?.transform().setPosition(Vec3.round([moved[0], 0.05, moved[2]], 6));
      if (playerPosition !== undefined && distance2d(playerPosition, moved) < 0.58) hit = true;
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
    if (entity.get?.("ShellToken") === undefined && entity.get?.("BeaconShell") === undefined) continue;
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
    const start: Vec3Tuple = [0, 0.38, 3.42];
    player.transform().setPosition(start);
    player.patch?.("CrabCourier", { speed: 2.95, shells: 0, beacons: 0 });
    for (const entity of entities) {
      const token = entity.get?.("ShellToken");
      if (token !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.4, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("ShellToken", { ...token, collected: false });
      }
      const beacon = entity.get?.("BeaconShell");
      if (beacon !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
        entity.transform().setPosition(home);
        entity.transform().setScale?.([0.58, 0.58, 0.58]);
        entity.patch?.("BeaconShell", { ...beacon, charged: false });
      }
    }
    patchFollowers(start, 0, 0);
    patchState({ phase: "playing", shells: 0, beacons: 0, tide: 82, shellText: "Shells 0/5", beaconText: "Beacons 0/3", tideText: "Tide 82", status: "Shells, beacons, hut" });
  };

  const current = player.transform().positionOr([0, 0.38, 3.42]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    animateHazards();
    patchFollowers(current, 0, 0);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("CrabCourier") ?? { speed: 2.95, shells: 0, beacons: 0 };
  const magnitude = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const speed = Number(stats.speed ?? 2.95);
  const bob = Math.sin(elapsed * 8.4) * 0.02;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / magnitude) * speed * delta, -2.55, 2.55),
    0.38 + bob,
    NumberEx.clamp(current[2] + (axisZ / magnitude) * speed * delta, -4.15, 4.2)
  ], 6);
  player.transform().setPosition(next);
  patchFollowers(next, axisX, axisZ);

  let shells = Number(state.shells ?? stats.shells ?? 0);
  let beacons = Number(state.beacons ?? stats.beacons ?? 0);
  let totalShells = 0;
  let totalBeacons = 0;
  let eventText = "";

  for (const entity of entities) {
    const token = entity.get?.("ShellToken");
    if (token === undefined) continue;
    totalShells += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.4, 0]);
    if (token.collected === true) {
      entity.transform().setPosition([home[0], -4, home[2]]);
      continue;
    }
    const float = Math.sin(elapsed * 5 + Number(token.phase ?? 0)) * 0.08;
    const display: Vec3Tuple = [home[0], 0.4 + float, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.48) {
      shells += 1;
      eventText = "Shell found";
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("ShellToken", { ...token, collected: true });
    }
  }

  for (const entity of entities) {
    const beacon = entity.get?.("BeaconShell");
    if (beacon === undefined) continue;
    totalBeacons += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
    const charged = beacon.charged === true;
    const pulse = charged ? 1.08 + Math.sin(elapsed * 3.8 + Number(beacon.phase ?? 0)) * 0.08 : 1 + Math.sin(elapsed * 2.4 + Number(beacon.phase ?? 0)) * 0.03;
    entity.transform().setPosition(Vec3.round([home[0], home[1] + Math.sin(elapsed * 2.3 + Number(beacon.phase ?? 0)) * 0.035, home[2]], 6));
    entity.transform().setScale?.([0.58 * pulse, 0.58 * pulse, 0.58 * pulse]);
    if (!charged && shells > 0 && distance2d(next, home) < 0.72) {
      shells -= 1;
      beacons += 1;
      eventText = "Beacon charged";
      entity.patch?.("BeaconShell", { ...beacon, charged: true });
    }
  }

  const hitHazard = animateHazards(next);
  const tide = Math.max(0, Number(state.tide ?? 82) - delta);
  const docked = distance2d(next, [0, 0.38, 4.22]) < 0.98;
  const shellText = `Shells ${Math.min(shells, totalShells)}/${totalShells}`;
  const beaconText = `Beacons ${Math.min(beacons, totalBeacons)}/${totalBeacons}`;
  const tideText = `Tide ${Math.ceil(tide)}`;

  if (hitHazard) {
    patchState({ phase: "failed", shells, beacons, tide, shellText, beaconText, tideText, status: "Swept away - Space" });
    return;
  }
  if (tide <= 0) {
    patchState({ phase: "failed", shells, beacons, tide: 0, shellText, beaconText, tideText: "Tide - Space", status: "Try again" });
    return;
  }
  if (docked && beacons >= totalBeacons) {
    patchState({ phase: "won", shells, beacons, tide, shellText, beaconText, tideText, status: "Route saved - Space" });
    player.patch?.("CrabCourier", { ...stats, shells, beacons });
    return;
  }

  player.patch?.("CrabCourier", { ...stats, shells, beacons });
  patchState({ phase: "playing", shells, beacons, tide, shellText, beaconText, tideText, status: eventText !== "" ? eventText : docked ? "Charge beacons first" : "Shells, beacons, hut" });
}
