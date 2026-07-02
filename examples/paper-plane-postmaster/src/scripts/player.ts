import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function paperPlanePostmasterSystem(context: ScriptContext): void {
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

  const patchFollowers = (position: Vec3Tuple, axisX: number, axisZ: number): void => {
    const flutter = Math.sin(elapsed * 11) * 0.035;
    for (const entity of entities) {
      const follower = entity.get?.("PlaneFollower");
      if (follower === undefined || !isVec3(follower.offset)) continue;
      const offset = follower.offset;
      entity.transform().setPosition(Vec3.round([position[0] + offset[0], position[1] + offset[1] + flutter, position[2] + offset[2]], 6));
    }
  };

  const animateGusts = (playerPosition?: Vec3Tuple): boolean => {
    let hit = false;
    for (const entity of entities) {
      const gust = entity.get?.("GustHazard");
      if (gust === undefined || !isVec3(gust.origin)) continue;
      const origin = gust.origin;
      const radius = Number(gust.radius ?? 1);
      const speed = Number(gust.speed ?? 1);
      const sweep = Math.sin(elapsed * speed + Number(gust.phase ?? 0)) * radius;
      const moved: Vec3Tuple = gust.axis === "z" ? [origin[0], origin[1], origin[2] + sweep] : [origin[0] + sweep, origin[1], origin[2]];
      entity.transform().setPosition(Vec3.round(moved, 6));
      if (playerPosition !== undefined && distance2d(playerPosition, moved) < 0.55) hit = true;
    }
    return hit;
  };

  const existingHomes = isRecord(state.homes) ? state.homes : {};
  const homes: Record<string, Vec3Tuple> = {};
  let homesChanged = !isRecord(state.homes);
  for (const entity of entities) {
    if (entity.get?.("StampToken") === undefined && entity.get?.("Mailbox") === undefined) continue;
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
    const start: Vec3Tuple = [0, 0.42, 3.42];
    player.transform().setPosition(start);
    player.patch?.("PaperPlane", { speed: 3.2, stamps: 0, delivered: 0 });
    for (const entity of entities) {
      const stamp = entity.get?.("StampToken");
      if (stamp !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.38, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("StampToken", { ...stamp, collected: false });
      }
      const mailbox = entity.get?.("Mailbox");
      if (mailbox !== undefined) {
        const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.36, 0]);
        entity.transform().setPosition(home);
        entity.patch?.("Mailbox", { ...mailbox, delivered: false });
      }
    }
    patchFollowers(start, 0, 0);
    patchState({ phase: "playing", stamps: 0, delivered: 0, clock: 82, stampText: "Stamps 0/5", mailText: "Mail 0/3", clockText: "Clock 82", status: "Collect stamps" });
  };

  const current = player.transform().positionOr([0, 0.42, 3.42]);
  const phase = typeof state.phase === "string" ? state.phase : "playing";
  if (phase !== "playing") {
    animateGusts();
    patchFollowers(current, 0, 0);
    if (context.input.pressed?.("retry") || context.input.action?.("retry")) resetGame();
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-up", positive: "move-down" });
  const stats = player.get?.("PaperPlane") ?? { speed: 3.2, stamps: 0, delivered: 0 };
  const magnitude = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const speed = Number(stats.speed ?? 3.2);
  const lift = Math.sin(elapsed * 8.5) * 0.035;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(current[0] + (axisX / magnitude) * speed * delta, -2.7, 2.7),
    0.42 + lift,
    NumberEx.clamp(current[2] + (axisZ / magnitude) * speed * delta, -4.05, 4.18)
  ], 6);
  player.transform().setPosition(next);
  patchFollowers(next, axisX, axisZ);

  let stamps = Number(state.stamps ?? stats.stamps ?? 0);
  let delivered = Number(state.delivered ?? stats.delivered ?? 0);
  let totalStamps = 0;
  let totalMailboxes = 0;
  let eventText = "";

  for (const entity of entities) {
    const stamp = entity.get?.("StampToken");
    if (stamp === undefined) continue;
    totalStamps += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.38, 0]);
    if (stamp.collected === true) {
      entity.transform().setPosition([home[0], -4, home[2]]);
      continue;
    }
    const float = Math.sin(elapsed * 5.4 + Number(stamp.phase ?? 0)) * 0.08;
    const display: Vec3Tuple = [home[0], 0.38 + float, home[2]];
    entity.transform().setPosition(Vec3.round(display, 6));
    if (distance2d(next, display) < 0.48) {
      stamps += 1;
      eventText = "Stamp tucked";
      entity.transform().setPosition([home[0], -4, home[2]]);
      entity.patch?.("StampToken", { ...stamp, collected: true });
    }
  }

  for (const entity of entities) {
    const mailbox = entity.get?.("Mailbox");
    if (mailbox === undefined) continue;
    totalMailboxes += 1;
    const home = homes[entity.id] ?? entity.transform().positionOr([0, 0.36, 0]);
    const full = mailbox.delivered === true;
    if (!full && stamps > 0 && distance2d(next, home) < 0.72) {
      stamps -= 1;
      delivered += 1;
      eventText = "Mail delivered";
      entity.patch?.("Mailbox", { ...mailbox, delivered: true });
    }
  }

  const hitGust = animateGusts(next);
  const clock = Math.max(0, Number(state.clock ?? 82) - delta);
  const landed = distance2d(next, [0, 0.42, 4.02]) < 1.02;
  const stampText = `Stamps ${Math.min(stamps, totalStamps)}/${totalStamps}`;
  const mailText = `Mail ${Math.min(delivered, totalMailboxes)}/${totalMailboxes}`;
  const clockText = `Clock ${Math.ceil(clock)}`;

  if (hitGust) {
    patchState({ phase: "failed", stamps, delivered, clock, stampText, mailText, clockText, status: "Gust crash - Space" });
    return;
  }
  if (clock <= 0) {
    patchState({ phase: "failed", stamps, delivered, clock: 0, stampText, mailText, clockText: "Clock - Space", status: "Route expired" });
    return;
  }
  if (landed && delivered >= totalMailboxes) {
    patchState({ phase: "won", stamps, delivered, clock, stampText, mailText, clockText, status: "Route complete - Space" });
    player.patch?.("PaperPlane", { ...stats, stamps, delivered });
    return;
  }

  player.patch?.("PaperPlane", { ...stats, stamps, delivered });
  patchState({ phase: "playing", stamps, delivered, clock, stampText, mailText, clockText, status: eventText !== "" ? eventText : landed ? "Deliver mail first" : "Collect stamps" });
}
