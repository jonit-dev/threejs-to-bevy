import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function glassworksPrismSorterSystem(context: ScriptContext): void {
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
    const glow = Math.sin(elapsed * 8.5) * 0.035;
    for (const entity of entities) {
      const follower = entity.get?.("CartFollower");
      if (follower === undefined || !isVec3(follower.offset)) continue;
      const offset = follower.offset;
      entity.transform().setPosition(Vec3.round([position[0] + offset[0], position[1] + offset[1] + glow, position[2] + offset[2]], 6));
    }
  };

  const animateHeat = (playerPosition?: Vec3Tuple): boolean => {
    let hit = false;
    for (const entity of entities) {
      const heat = entity.get?.("HeatBar");
      if (heat === undefined || !isVec3(heat.origin)) continue;
      const origin = heat.origin;
      const radius = Number(heat.radius ?? 1);
      const speed = Number(heat.speed ?? 1);
      const sweep = Math.sin(elapsed * speed + Number(heat.phase ?? 0)) * radius;
      const moved: Vec3Tuple = heat.axis === "z" ? [origin[0], origin[1], origin[2] + sweep] : [origin[0] + sweep, origin[1], origin[2]];
      entity.transform().setPosition(Vec3.round(moved, 6));
      if (playerPosition !== undefined && distance2d(playerPosition, moved) < 0.54) hit = true;
    }
    return hit;
  };

  const existingHomes = isRecord(state.homes) ? state.homes : {};
  const homes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.homes);
  for (const entity of entities) {
    if (entity.get?.("PrismShard") === undefined && entity.get?.("ColorPedestal") === undefined) continue;
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      homes[entity.id] = saved;
      continue;
    }
    homes[entity.id] = entity.transform().positionOr([0, 0.4, 0]);
    homesChanged = true;
  }
  if (homesChanged) patchState({ homes });

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.4, 3.45];
    player.transform().setPosition(start);
    player.patch?.("GlassCart", { speed: 3.15, prisms: 0, pedestals: 0 });
    for (const entity of entities) {
      const shard = entity.get?.("PrismShard");
      if (shard !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("PrismShard", { ...shard, collected: false });
      }
      const pedestal = entity.get?.("ColorPedestal");
      if (pedestal !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.28, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("ColorPedestal", { ...pedestal, charged: false });
      }
    }
    patchFollowers(start);
    patchState({ phase: "playing", prisms: 0, pedestals: 0, heat: 80, prismText: "Prisms 0/5", pedestalText: "Pedestals 0/3", heatText: "Heat 80", status: "Gather prisms" });
  };

  const current = player.transform().positionOr([0, 0.4, 3.45]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    animateHeat();
    patchFollowers(current);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("GlassCart") ?? { speed: 3.15, prisms: 0, pedestals: 0 };
  const magnitude = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const speed = Number(stats.speed ?? 3.15);
  const bob = Math.sin(elapsed * 7.5) * 0.03;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / magnitude) * speed * delta, -2.7, 2.7),
    0.4 + bob,
    NumberEx.clamp(current[2] + (axisZ / magnitude) * speed * delta, -4.05, 4.18)
  ], 6);
  player.transform().setPosition(next);
  patchFollowers(next);

  let prisms = Number(state.prisms ?? stats.prisms ?? 0);
  let pedestals = Number(state.pedestals ?? stats.pedestals ?? 0);
  let totalPrisms = 0;
  let totalPedestals = 0;
  let eventText = "";

  for (const entity of entities) {
    const shard = entity.get?.("PrismShard");
    if (shard === undefined) continue;
    totalPrisms += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.42, 0]);
    if (shard.collected === true) {
      entity.transform().setPosition([home[0], -4, home[2]]);
      continue;
    }
    const float = Math.sin(elapsed * 5.2 + Number(shard.phase ?? 0)) * 0.08;
    const display: Vec3Tuple = [home[0], 0.42 + float, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.48) {
      prisms += 1;
      eventText = "Prism loaded";
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("PrismShard", { ...shard, collected: true });
    }
  }

  for (const entity of entities) {
    const pedestal = entity.get?.("ColorPedestal");
    if (pedestal === undefined) continue;
    totalPedestals += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.28, 0]);
    const charged = pedestal.charged === true;
    const rise = charged ? Math.sin(elapsed * 4 + Number(pedestal.phase ?? 0)) * 0.045 : 0;
    entity.transform().setPosition(Vec3.round([home[0], home[1] + rise, home[2]], 6));
    if (!charged && prisms > 0 && distance2d(next, home) < 0.72) {
      prisms -= 1;
      pedestals += 1;
      eventText = "Pedestal charged";
      entity.patch?.("ColorPedestal", { ...pedestal, charged: true });
    }
  }

  const hitHeat = animateHeat(next);
  const heat = Math.max(0, Number(state.heat ?? 80) - delta);
  const cooled = distance2d(next, [0, 0.4, 4.05]) < 1.02;
  const prismText = `Prisms ${Math.min(prisms, totalPrisms)}/${totalPrisms}`;
  const pedestalText = `Pedestals ${Math.min(pedestals, totalPedestals)}/${totalPedestals}`;
  const heatText = `Heat ${Math.ceil(heat)}`;

  if (hitHeat) {
    patchState({ phase: "failed", prisms, pedestals, heat, prismText, pedestalText, heatText, status: "Heat crack - Space" });
    return;
  }
  if (heat <= 0) {
    patchState({ phase: "failed", prisms, pedestals, heat: 0, prismText, pedestalText, heatText: "Heat - Space", status: "Kiln cooled" });
    return;
  }
  if (cooled && pedestals >= totalPedestals) {
    patchState({ phase: "won", prisms, pedestals, heat, prismText, pedestalText, heatText, status: "Glass sorted - Space" });
    player.patch?.("GlassCart", { ...stats, prisms, pedestals });
    return;
  }

  player.patch?.("GlassCart", { ...stats, prisms, pedestals });
  patchState({ phase: "playing", prisms, pedestals, heat, prismText, pedestalText, heatText, status: eventText !== "" ? eventText : cooled ? "Charge pedestals first" : "Gather prisms" });
}
