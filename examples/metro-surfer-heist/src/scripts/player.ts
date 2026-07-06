import { NumberEx } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function metroSurferHeistSystem(context: ScriptContext): void {
  const delta = context.time.fixedDelta;
  const elapsed = typeof context.time.elapsed === "number" ? context.time.elapsed : 0;
  const entities = context.query();
  const runner = entities.find((entity: any) => entity.id === "runner");
  if (runner === undefined) return;

  const lanes = [-1.55, 0, 1.55];
  const runnerZ = 2.8;
  const recycleZ = 4.3;
  const farZ = -16.5;
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const isVec3 = (value: unknown): value is Vec3Tuple => Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item));
  const stateValue = context.resources?.get?.("GameState");
  let state: Record<string, unknown> = isRecord(stateValue) ? stateValue : {};
  const legacyState = context.resource?.("GameState");
  const patchState = (patch: Record<string, unknown>): void => {
    state = { ...state, ...patch };
    context.resources?.set?.("GameState", state);
    legacyState?.patch?.(patch);
  };
  const actionPressed = (id: string): boolean => context.input.pressed?.(id) === true || context.input.action?.(id) === true;
  const laneX = (lane: number): number => lanes[NumberEx.clamp(Math.round(lane), 0, 2)];
  const distance2d = (a: Vec3Tuple, b: Vec3Tuple): number => {
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dz * dz);
  };
  const syncParts = (base: Vec3Tuple, ducking: boolean): void => {
    for (const entity of entities) {
      const part = entity.get?.("RunnerPart");
      if (part?.target !== "runner" || !isVec3(part.offset)) continue;
      const bob = Math.sin(elapsed * 12) * 0.025;
      const duckDrop = ducking ? 0.22 : 0;
      entity.transform().setPosition([base[0] + part.offset[0], base[1] + part.offset[1] + bob - duckDrop, base[2] + part.offset[2]]);
    }
  };
  const resetGame = (): void => {
    const start: Vec3Tuple = [0, 0.55, runnerZ];
    runner.transform().setPosition(start);
    runner.patch?.("RunnerPlayer", { lane: 1, targetLane: 1, jump: 0, duckTimer: 0, laneCooldown: 0 });
    syncParts(start, false);
    let coinIndex = 0;
    let hazardIndex = 0;
    for (const entity of entities) {
      const coin = entity.get?.("Coin");
      if (coin !== undefined) {
        const lane = coinIndex % 3;
        const z = -1.2 - coinIndex * 1.25;
        entity.transform().setPosition([laneX(lane), 0.58, z]);
        entity.patch?.("Coin", { ...coin, lane, z });
        coinIndex += 1;
      }
      const hazard = entity.get?.("RunnerHazard");
      if (hazard !== undefined) {
        const lane = hazardIndex % 3;
        const z = -4.2 - hazardIndex * 3.7;
        entity.transform().setPosition([laneX(lane), hazard.kind === "gate" ? 1.05 : hazard.kind === "barrier" ? 0.37 : 0.92, z]);
        entity.patch?.("RunnerHazard", { ...hazard, lane, z });
        hazardIndex += 1;
      }
    }
    patchState({
      phase: "playing",
      score: 0,
      coins: 0,
      distance: 0,
      speed: 6.2,
      scoreText: "Score 0",
      coinsText: "Coins 0/12",
      distanceText: "Metro 0m",
      status: "Switch lanes, jump red barriers, duck low gates"
    });
  };

  const phase = typeof state.phase === "string" ? state.phase : "playing";
  const stats = runner.get?.("RunnerPlayer") ?? { lane: 1, targetLane: 1, jump: 0, duckTimer: 0, laneCooldown: 0 };
  const current = runner.transform().position;
  if (phase !== "playing") {
    syncParts(current, false);
    if (actionPressed("retry") || actionPressed("jump")) resetGame();
    return;
  }

  let lane = Number(stats.targetLane ?? stats.lane ?? 1);
  let laneCooldown = Math.max(0, Number(stats.laneCooldown ?? 0) - delta);
  const moveAxis = context.input.getAxis("MoveX");
  if (laneCooldown <= 0 && (moveAxis < -0.2 || actionPressed("move-left"))) {
    lane = NumberEx.clamp(lane - 1, 0, 2);
    laneCooldown = 0.16;
  } else if (laneCooldown <= 0 && (moveAxis > 0.2 || actionPressed("move-right"))) {
    lane = NumberEx.clamp(lane + 1, 0, 2);
    laneCooldown = 0.16;
  }

  let jump = Math.max(0, Number(stats.jump ?? 0) - delta * 1.75);
  if (jump <= 0.02 && actionPressed("jump")) jump = 1;
  const jumpArc = Math.sin(jump * Math.PI) * 0.95;
  let duckTimer = Math.max(0, Number(stats.duckTimer ?? 0) - delta);
  if (actionPressed("duck")) duckTimer = 0.48;
  const ducking = duckTimer > 0;
  const baseY = ducking ? 0.42 : 0.55;
  const targetX = laneX(lane);
  const next: Vec3Tuple = [
    current[0] + (targetX - current[0]) * Math.min(1, delta * 12),
    baseY + jumpArc,
    runnerZ
  ];
  runner.transform().setPosition(next);
  syncParts(next, ducking);

  const previousDistance = Number(state.distance ?? 0);
  const speed = Math.min(10.6, Number(state.speed ?? 6.2) + previousDistance * 0.0009);
  let coins = Number(state.coins ?? 0);
  let score = Number(state.score ?? 0) + delta * speed * 2;
  let justCollected = false;
  let failReason = "";

  for (const entity of entities) {
    const coin = entity.get?.("Coin");
    if (coin === undefined) continue;
    const currentCoin = entity.transform().position;
    const previousZ = currentCoin[2];
    let z = previousZ + speed * delta;
    let laneForCoin = Number(coin.lane ?? 1);
    if (z > recycleZ) {
      laneForCoin = (laneForCoin + 1 + (coins % 2)) % 3;
      z = farZ - Number(coin.phase ?? 0);
    }
    const bob = Math.sin(elapsed * 5.5 + Number(coin.phase ?? 0)) * 0.06;
    const coinPosition: Vec3Tuple = [laneX(laneForCoin), 0.58 + bob, z];
    entity.transform().setPosition(coinPosition);
    entity.patch?.("Coin", { ...coin, lane: laneForCoin, z });
    const sameLane = Math.abs(next[0] - coinPosition[0]) < 0.58;
    const crossedRunner = previousZ <= runnerZ && z >= runnerZ;
    const closeToRunner = distance2d(next, coinPosition) < 0.62;
    if (sameLane && Math.abs(next[1] - coinPosition[1]) < 0.75 && (crossedRunner || closeToRunner)) {
      coins += 1;
      score += 75;
      justCollected = true;
      const newLane = (laneForCoin + 2) % 3;
      const newZ = farZ - 1.6 - (coins % 4) * 0.8;
      entity.transform().setPosition([laneX(newLane), 0.58, newZ]);
      entity.patch?.("Coin", { ...coin, lane: newLane, z: newZ });
    }
  }

  for (const entity of entities) {
    const hazard = entity.get?.("RunnerHazard");
    if (!isRecord(hazard)) continue;
    const height = hazard.kind === "gate" ? 1.05 : hazard.kind === "barrier" ? 0.37 : 0.92;
    let hazardLane = Number(hazard.lane ?? 1);
    let z = Number(hazard.z ?? entity.transform().position[2] ?? -5) + speed * delta;
    if (z > recycleZ) {
      hazardLane = (hazardLane + 1 + Math.floor(previousDistance / 35)) % 3;
      z = farZ - 2.5 - ((previousDistance / 20) % 4);
    }
    const position: Vec3Tuple = [laneX(hazardLane), height, z];
    entity.transform().setPosition(position);
    entity.patch?.("RunnerHazard", { ...hazard, lane: hazardLane, z });
    const laneOverlap = Math.abs(next[0] - position[0]) < 0.66;
    const zOverlap = Math.abs(next[2] - position[2]) < (hazard.kind === "train" ? 0.95 : 0.58);
    if (!laneOverlap || !zOverlap) continue;
    if (hazard.kind === "barrier" && jumpArc < 0.42) failReason = "Barrier clipped your stride. Press R to retry.";
    if (hazard.kind === "gate" && !ducking) failReason = "Low gate caught the runner. Press R to retry.";
    if (hazard.kind === "train") failReason = "A metro car blocked the lane. Press R to retry.";
  }

  const distance = previousDistance + speed * delta * 4.2;
  const objectiveCoins = Number(state.objectiveCoins ?? 12);
  const objectiveDistance = Number(state.objectiveDistance ?? 260);
  if (failReason.length > 0) {
    patchState({
      phase: "failed",
      score: Math.floor(score),
      coins,
      distance,
      speed,
      scoreText: `Score ${Math.floor(score)}`,
      coinsText: `Coins ${Math.min(coins, objectiveCoins)}/${objectiveCoins}`,
      distanceText: `Metro ${Math.floor(distance)}m`,
      status: failReason
    });
    return;
  }

  const complete = coins >= objectiveCoins && distance >= objectiveDistance;
  const status = complete
    ? "Objective cleared. Press R for another run."
    : justCollected
      ? "Coin chain boosted the score"
      : ducking
        ? "Sliding under the gate"
        : jumpArc > 0.2
          ? "Vaulting the barrier"
          : "Switch lanes, jump red barriers, duck low gates";
  const phaseNext = complete ? "won" : "playing";
  runner.patch?.("RunnerPlayer", { lane, targetLane: lane, jump, duckTimer, laneCooldown });
  patchState({
    phase: phaseNext,
    score: Math.floor(score),
    coins,
    distance,
    speed,
    scoreText: `Score ${Math.floor(score)}`,
    coinsText: `Coins ${Math.min(coins, objectiveCoins)}/${objectiveCoins}`,
    distanceText: `Metro ${Math.floor(distance)}m`,
    status
  });
}
