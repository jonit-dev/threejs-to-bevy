import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function neonSushiRushSystem(context: ScriptContext): void {
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

  const existingHomes = isRecord(state.ingredientHomes) ? state.ingredientHomes : {};
  const ingredientHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.ingredientHomes);
  for (const entity of entities) {
    if (entity.get?.("IngredientCrate") === undefined) {
      continue;
    }
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      ingredientHomes[entity.id] = saved;
      continue;
    }
    ingredientHomes[entity.id] = entity.transform().positionOr([0, 0.44, 0]);
    homesChanged = true;
  }
  if (homesChanged) {
    patchState({ ingredientHomes });
  }

  const syncCartParts = (base: Vec3Tuple): void => {
    for (const entity of entities) {
      const part = entity.get?.("CartPart");
      if (part?.target !== "player" || !isVec3(part.offset)) {
        continue;
      }
      const pulse = entity.id === "player.lamp" ? Math.sin(elapsed * 9.5) * 0.035 : 0;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, [part.offset[0], part.offset[1] + pulse, part.offset[2]]), 6));
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.2, 4.0];
    player.transform().setPosition(start);
    player.patch?.("SushiCart", { speed: 3.45, ingredients: 0 });
    syncCartParts(start);
    for (const entity of entities) {
      const ingredient = entity.get?.("IngredientCrate");
      if (ingredient !== undefined) {
        const home = ingredientHomes[entity.id] ?? entity.transform().positionOr([0, 0.44, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("IngredientCrate", { ...ingredient, collected: false });
      }
    }
    patchState({
      phase: "playing",
      ingredients: 0,
      timer: 60,
      countdown: "Ingredients 0/5",
      timerText: "Time 60",
      status: "Collect 5 crates, then deliver to the chef"
    });
  };

  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    syncCartParts(player.transform().positionOr([0, 0.2, 4.0]));
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) {
      resetGame();
    }
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("SushiCart") ?? { speed: 3.45, ingredients: 0 };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const current = player.transform().positionOr([0, 0.2, 4.0]);
  const roll = Math.sin(elapsed * 8) * 0.018;
  const speed = Number(stats.speed ?? 3.45);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta, -2.6, 2.6),
    0.2 + roll,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.2, 4.2)
  ], 6);
  player.transform().setPosition(next);
  syncCartParts(next);

  let collected = 0;
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const ingredient = entity.get?.("IngredientCrate");
    if (ingredient === undefined) {
      continue;
    }
    total += 1;
    if (ingredient.collected === true) {
      collected += 1;
      continue;
    }
    const home = ingredientHomes[entity.id] ?? entity.transform().positionOr([0, 0.44, 0]);
    const bob = Math.sin(elapsed * 3.6 + Number(ingredient.phase ?? 0)) * 0.08;
    const displayPosition: Vec3Tuple = [home[0], 0.44 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(displayPosition, 6));
    if (distance2d(next, displayPosition) < 0.6) {
      collected += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("IngredientCrate", { ...ingredient, collected: true });
    }
  }

  let hitSpill = false;
  for (const entity of entities) {
    const spill = entity.get?.("SauceSpill");
    if (!isRecord(spill) || !isVec3(spill.origin)) {
      continue;
    }
    const escalation = collected >= 3 ? 1.22 : 1;
    const wave = Math.sin(elapsed * 0.9 * escalation + Number(spill.phase ?? 0)) * Number(spill.radius ?? 1);
    const moved: Vec3Tuple = spill.axis === "z"
      ? [spill.origin[0], spill.origin[1], spill.origin[2] + wave]
      : [spill.origin[0] + wave, spill.origin[1], spill.origin[2]];
    entity.transform().setPosition(Vec3.round(moved, 6));
    if (distance2d(next, moved) < 0.68) {
      hitSpill = true;
    }
  }

  const timer = Math.max(0, Number(state.timer ?? 60) - delta);
  const atChef = distance2d(next, [0, 0.48, -4.35]) < 0.95;
  if (hitSpill) {
    patchState({
      phase: "failed",
      ingredients: collected,
      timer,
      countdown: `Ingredients ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "Sauce spill wiped out the order. Press Space to retry."
    });
    return;
  }
  if (timer <= 0) {
    patchState({
      phase: "failed",
      ingredients: collected,
      timer: 0,
      countdown: `Ingredients ${collected}/${total}`,
      timerText: "Time 0",
      status: "The kitchen closed. Press Space to retry."
    });
    return;
  }
  if (total > 0 && collected >= total && atChef) {
    patchState({
      phase: "won",
      ingredients: collected,
      timer,
      countdown: `Ingredients ${collected}/${total}`,
      timerText: `Time ${Math.ceil(timer)}`,
      status: "Order complete. Press Space for another rush."
    });
    return;
  }

  player.patch?.("SushiCart", { ...stats, ingredients: collected });
  patchState({
    phase: "playing",
    ingredients: collected,
    timer,
    countdown: `Ingredients ${collected}/${total}`,
    timerText: `Time ${Math.ceil(timer)}`,
    status: justCollected
      ? "Ingredient crate loaded"
      : collected >= total
        ? "Deliver the order to the chef counter"
        : "Collect 5 crates, then deliver to the chef"
  });
}
