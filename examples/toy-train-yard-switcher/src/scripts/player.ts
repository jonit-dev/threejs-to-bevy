import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function toyTrainYardSwitcherSystem(context: ScriptContext): void {
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

  const patchFollowers = (position: Vec3Tuple): void => {
    const chug = Math.sin(elapsed * 9) * 0.025;
    for (const entity of entities) {
      const follower = entity.get?.("TrainFollower");
      if (follower === undefined || !isVec3(follower.offset)) continue;
      const offset = follower.offset;
      entity.transform().setPosition(Vec3.round([position[0] + offset[0], position[1] + offset[1] + chug, position[2] + offset[2]], 6));
    }
  };

  const animateGates = (playerPosition?: Vec3Tuple): boolean => {
    let hit = false;
    for (const entity of entities) {
      const gate = entity.get?.("GateHazard");
      if (gate === undefined || !isVec3(gate.origin)) continue;
      const origin = gate.origin;
      const radius = Number(gate.radius ?? 1);
      const speed = Number(gate.speed ?? 1);
      const sweep = Math.sin(elapsed * speed + Number(gate.phase ?? 0)) * radius;
      const moved: Vec3Tuple = gate.axis === "z" ? [origin[0], origin[1], origin[2] + sweep] : [origin[0] + sweep, origin[1], origin[2]];
      entity.transform().setPosition(Vec3.round(moved, 6));
      if (playerPosition !== undefined && distance2d(playerPosition, moved) < 0.55) hit = true;
    }
    return hit;
  };

  const existingHomes = isRecord(state.homes) ? state.homes : {};
  const homes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.homes);
  for (const entity of entities) {
    if (entity.get?.("CargoCrate") === undefined && entity.get?.("SwitchDepot") === undefined) continue;
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      homes[entity.id] = saved;
      continue;
    }
    homes[entity.id] = entity.transform().positionOr([0, 0.38, 0]);
    homesChanged = true;
  }
  if (homesChanged) patchState({ homes });

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.42, 3.45];
    player.transform().setPosition(start);
    player.patch?.("ToyTrain", { speed: 3.1, cargo: 0, switches: 0 });
    for (const entity of entities) {
      const cargo = entity.get?.("CargoCrate");
      if (cargo !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.38, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("CargoCrate", { ...cargo, collected: false });
      }
      const depot = entity.get?.("SwitchDepot");
      if (depot !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.28, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("SwitchDepot", { ...depot, switched: false });
      }
    }
    patchFollowers(start);
    patchState({ phase: "playing", cargo: 0, switches: 0, clock: 84, cargoText: "Cargo 0/5", switchText: "Switches 0/3", clockText: "Clock 84", status: "Load cargo" });
  };

  const current = player.transform().positionOr([0, 0.42, 3.45]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    animateGates();
    patchFollowers(current);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("ToyTrain") ?? { speed: 3.1, cargo: 0, switches: 0 };
  const magnitude = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const speed = Number(stats.speed ?? 3.1);
  const bob = Math.sin(elapsed * 7.8) * 0.025;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / magnitude) * speed * delta, -2.7, 2.7),
    0.42 + bob,
    NumberEx.clamp(current[2] + (axisZ / magnitude) * speed * delta, -4.05, 4.18)
  ], 6);
  player.transform().setPosition(next);
  patchFollowers(next);

  let cargoCount = Number(state.cargo ?? stats.cargo ?? 0);
  let switchCount = Number(state.switches ?? stats.switches ?? 0);
  let totalCargo = 0;
  let totalSwitches = 0;
  let eventText = "";

  for (const entity of entities) {
    const cargo = entity.get?.("CargoCrate");
    if (cargo === undefined) continue;
    totalCargo += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.38, 0]);
    if (cargo.collected === true) {
      entity.transform().setPosition([home[0], -4, home[2]]);
      continue;
    }
    const float = Math.sin(elapsed * 5.1 + Number(cargo.phase ?? 0)) * 0.07;
    const display: Vec3Tuple = [home[0], 0.38 + float, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.5) {
      cargoCount += 1;
      eventText = "Cargo coupled";
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("CargoCrate", { ...cargo, collected: true });
    }
  }

  for (const entity of entities) {
    const depot = entity.get?.("SwitchDepot");
    if (depot === undefined) continue;
    totalSwitches += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.28, 0]);
    const switched = depot.switched === true;
    const rise = switched ? Math.sin(elapsed * 4 + Number(depot.phase ?? 0)) * 0.04 : 0;
    entity.transform().setPosition(Vec3.round([home[0], home[1] + rise, home[2]], 6));
    if (!switched && cargoCount > 0 && distance2d(next, home) < 0.74) {
      cargoCount -= 1;
      switchCount += 1;
      eventText = "Switch set";
      entity.patch?.("SwitchDepot", { ...depot, switched: true });
    }
  }

  const hitGate = animateGates(next);
  const clock = Math.max(0, Number(state.clock ?? 84) - delta);
  const parked = distance2d(next, [0, 0.42, 4.05]) < 1.02;
  const cargoText = `Cargo ${Math.min(cargoCount, totalCargo)}/${totalCargo}`;
  const switchText = `Switches ${Math.min(switchCount, totalSwitches)}/${totalSwitches}`;
  const clockText = `Clock ${Math.ceil(clock)}`;

  if (hitGate) {
    patchState({ phase: "failed", cargo: cargoCount, switches: switchCount, clock, cargoText, switchText, clockText, status: "Gate crash - Space" });
    return;
  }
  if (clock <= 0) {
    patchState({ phase: "failed", cargo: cargoCount, switches: switchCount, clock: 0, cargoText, switchText, clockText: "Clock - Space", status: "Yard closed" });
    return;
  }
  if (parked && switchCount >= totalSwitches) {
    patchState({ phase: "won", cargo: cargoCount, switches: switchCount, clock, cargoText, switchText, clockText, status: "Yard sorted - Space" });
    player.patch?.("ToyTrain", { ...stats, cargo: cargoCount, switches: switchCount });
    return;
  }

  player.patch?.("ToyTrain", { ...stats, cargo: cargoCount, switches: switchCount });
  patchState({ phase: "playing", cargo: cargoCount, switches: switchCount, clock, cargoText, switchText, clockText, status: eventText !== "" ? eventText : parked ? "Set switches first" : "Load cargo" });
}
