import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function rooftopWindCourierSystem(context: ScriptContext): void {
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

  const existingHomes = isRecord(state.parcelHomes) ? state.parcelHomes : {};
  const parcelHomes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.parcelHomes);
  for (const entity of entities) {
    if (entity.get?.("MailParcel") === undefined) continue;
    const saved = existingHomes[entity.id];
    if (isVec3(saved)) {
      parcelHomes[entity.id] = saved;
      continue;
    }
    parcelHomes[entity.id] = entity.transform().positionOr([0, 0.45, 0]);
    homesChanged = true;
  }
  if (homesChanged) patchState({ parcelHomes });

  const syncParts = (base: Vec3Tuple): void => {
    for (const entity of entities) {
      const part = entity.get?.("GliderPart");
      if (part?.target !== "player" || !isVec3(part.offset)) continue;
      const flap = entity.id.includes("wing") ? Math.sin(elapsed * 7.5) * 0.045 : 0;
      entity.transform().setPosition(Vec3.round(Vec3.add(base, [part.offset[0], part.offset[1] + flap, part.offset[2]]), 6));
    }
  };

  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.42, 3.35];
    player.transform().setPosition(start);
    player.patch?.("GliderPlayer", { speed: 3.35, parcels: 0 });
    syncParts(start);
    for (const entity of entities) {
      const parcel = entity.get?.("MailParcel");
      if (parcel === undefined) continue;
      const home = parcelHomes[entity.id] ?? entity.transform().positionOr([0, 0.45, 0]);
      entity.transform().setPosition(home);
      entity.patch?.("MailParcel", { ...parcel, collected: false });
    }
    patchState({
      phase: "playing",
      parcels: 0,
      timer: 62,
      parcelText: "Parcels 0/3",
      timerText: "Wind 62",
      status: "Collect 3 parcels, then land on the green pad"
    });
  };

  const current = player.transform().positionOr([0, 0.42, 3.35]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    syncParts(current);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("GliderPlayer") ?? { speed: 3.35, parcels: 0 };
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const lift = Math.sin(elapsed * 4.8) * 0.04;
  const windDrift = Math.sin(elapsed * 0.55) * 0.22 * delta;
  const speed = Number(stats.speed ?? 3.35);
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / length) * speed * delta + windDrift, -3.0, 3.0),
    0.42 + lift,
    NumberEx.clamp(current[2] + (axisZ / length) * speed * delta, -4.05, 4.05)
  ], 6);
  player.transform().setPosition(next);
  syncParts(next);

  let parcels = 0;
  let total = 0;
  let justCollected = false;
  for (const entity of entities) {
    const parcel = entity.get?.("MailParcel");
    if (parcel === undefined) continue;
    total += 1;
    if (parcel.collected === true) {
      parcels += 1;
      continue;
    }
    const home = parcelHomes[entity.id] ?? entity.transform().positionOr([0, 0.45, 0]);
    const bob = Math.sin(elapsed * 4.4 + Number(parcel.phase ?? 0)) * 0.08;
    const display: Vec3Tuple = [home[0], 0.45 + bob, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.55) {
      parcels += 1;
      justCollected = true;
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("MailParcel", { ...parcel, collected: true });
    }
  }

  let hitGust = false;
  for (const entity of entities) {
    const gust = entity.get?.("GustHazard");
    if (!isRecord(gust) || !isVec3(gust.origin)) continue;
    const escalation = parcels >= 2 ? 1.25 : 1;
    const wave = Math.sin(elapsed * 1.05 * escalation + Number(gust.phase ?? 0)) * Number(gust.radius ?? 1);
    const spin = Math.sin(elapsed * 4.2 + Number(gust.phase ?? 0)) * 0.08;
    const moved: Vec3Tuple = gust.axis === "z" ? [gust.origin[0], gust.origin[1] + spin, gust.origin[2] + wave] : [gust.origin[0] + wave, gust.origin[1] + spin, gust.origin[2]];
    entity.transform().setPosition(Vec3.round(moved, 6));
    if (distance2d(next, moved) < 0.67) hitGust = true;
  }

  const timer = Math.max(0, Number(state.timer ?? 62) - delta);
  const complete = total > 0 && parcels >= total;
  const atPad = distance2d(next, [0, 0.42, -4.0]) < 0.82;
  const parcelText = `Parcels ${parcels}/${total}`;
  if (hitGust) {
    patchState({ phase: "failed", parcels, timer, parcelText, timerText: `Wind ${Math.ceil(timer)}`, status: "A crosswind spun out the glider. Press Space to retry." });
    return;
  }
  if (timer <= 0) {
    patchState({ phase: "failed", parcels, timer: 0, parcelText, timerText: "Wind 0", status: "The wind window closed. Press Space to retry." });
    return;
  }
  if (complete && atPad) {
    patchState({ phase: "won", parcels, timer, parcelText, timerText: `Wind ${Math.ceil(timer)}`, status: "Delivery landed. Press Space for another route." });
    return;
  }

  player.patch?.("GliderPlayer", { ...stats, parcels });
  patchState({
    phase: "playing",
    parcels,
    timer,
    parcelText,
    timerText: `Wind ${Math.ceil(timer)}`,
    status: justCollected ? "Parcel clipped to the harness" : complete ? "Land on the green delivery pad" : "Collect 3 parcels, then land on the green pad"
  });
}
