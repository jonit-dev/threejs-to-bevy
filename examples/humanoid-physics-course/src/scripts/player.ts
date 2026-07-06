import { TriggerEx } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

// Default third-person character movement, written against the engine
// primitives directly: input axes -> character.move collision trace ->
// Transform pose. The camera is not driven here; camera.main uses the
// engine's native follow helper (Camera.follow) declared in the scene.
export function updateHumanoidCourse(context: ScriptContext): void {
  const WALK_SPEED = 2.0;
  const SPRINT_SPEED = 3.8;
  const ACCELERATION = 12;
  const DECELERATION = 18;
  const TURN_SPEED = 10;
  const RUN_CLIP_THRESHOLD = 2.6;
  const HIT_COOLDOWN = 0.8;
  const START_POSITION: Vec3Tuple = [0, 0.02, 5.0];
  const BOUNDS_MIN: Vec3Tuple = [-4.8, Number.NEGATIVE_INFINITY, -6.5];
  const BOUNDS_MAX: Vec3Tuple = [4.8, Number.POSITIVE_INFINITY, 6.4];

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
  const stepToward = (current: number, target: number, maxDelta: number): number =>
    current < target ? Math.min(target, current + maxDelta) : Math.max(target, current - maxDelta);
  const turnToward = (current: number, target: number, maxDelta: number): number => {
    const twoPi = Math.PI * 2;
    let delta = (target - current) % twoPi;
    if (delta > Math.PI) {
      delta -= twoPi;
    }
    if (delta < -Math.PI) {
      delta += twoPi;
    }
    return current + clamp(delta, -maxDelta, maxDelta);
  };
  // Soldier.glb's rest pose faces -Z, so identity rotation is yaw 0 facing -Z
  // and the yaw for a movement direction (dx, dz) is atan2(-dx, -dz).
  const quatFromYaw = (yaw: number): [number, number, number, number] => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

  const entities = context.query();
  const player = entities.find((entity: any) => entity.id === "player");
  if (player === undefined) {
    return;
  }

  const elapsed = typeof context.time?.elapsed === "number" ? context.time.elapsed : 0;
  const dt = Math.max(0, context.time?.fixedDelta?.({ fallback: 1 / 60 }) ?? 1 / 60);
  const move = context.state("tn.thirdPerson.player", { speed: 0, yaw: 0 });
  const gameState = context.resources?.get?.("GameState");
  const state = isRecord(gameState) ? gameState : {};
  const stats = player.get?.("CoursePlayer") ?? { checkpoint: 0, finished: false, hits: 0, lastHitAt: -10 };

  const playClip = (clip: string, sourceClip: string, speed: number): void => {
    context.animation?.play?.(player, clip, { blendSeconds: 0.22, loop: true, sourceClip, speed });
  };
  const reset = (): void => {
    player.transform?.().setPose(START_POSITION, quatFromYaw(0));
    player.patch?.("CoursePlayer", { checkpoint: 0, finished: false, hits: 0, lastHitAt: -10 });
    move.speed = 0;
    move.yaw = 0;
    context.resources?.set?.("GameState", { checkpoint: 0, checkpointTotal: 2, elapsed: 0, hits: 0, status: "Course" });
    playClip("idle", "Idle", 1);
  };

  if (context.input?.pressed?.("retry") || context.input?.action?.("retry")) {
    reset();
    return;
  }
  if (stats.finished === true) {
    playClip("idle", "Idle", 1);
    return;
  }

  // --- movement ---
  // camera.main follows from +Z looking toward -Z, so W (+MoveZ) heads into
  // the screen (-Z) and D (+MoveX) heads screen-right (+X).
  const inputX = context.input?.axis?.("MoveX") ?? 0;
  const inputZ = context.input?.axis?.("MoveZ") ?? 0;
  let dirX = inputX;
  let dirZ = -inputZ;
  const magnitude = Math.hypot(dirX, dirZ);
  const hasInput = magnitude > 0.001;
  if (hasInput) {
    dirX /= magnitude;
    dirZ /= magnitude;
  }

  const sprinting = hasInput && context.input?.action?.("sprint") === true;
  const targetSpeed = hasInput ? (sprinting ? SPRINT_SPEED : WALK_SPEED) : 0;
  const rate = targetSpeed > move.speed ? ACCELERATION : DECELERATION;
  move.speed = stepToward(move.speed, targetSpeed, rate * dt);
  if (hasInput) {
    move.yaw = turnToward(move.yaw, Math.atan2(-dirX, -dirZ), TURN_SPEED * dt);
  }

  const moving = move.speed > 0.001;
  if (moving) {
    const forwardX = -Math.sin(move.yaw);
    const forwardZ = -Math.cos(move.yaw);
    const trace = context.character?.move?.(player, { direction: [forwardX, forwardZ], fixedDelta: dt, speed: move.speed });
    const current = player.transform?.().positionOr(START_POSITION) ?? START_POSITION;
    const resolved: Vec3Tuple = Array.isArray(trace?.resolved) ? (trace.resolved as Vec3Tuple) : (current as Vec3Tuple);
    const position: Vec3Tuple = [
      clamp(resolved[0], BOUNDS_MIN[0], BOUNDS_MAX[0]),
      clamp(resolved[1], BOUNDS_MIN[1], BOUNDS_MAX[1]),
      clamp(resolved[2], BOUNDS_MIN[2], BOUNDS_MAX[2]),
    ];
    player.transform?.().setPose(position, quatFromYaw(move.yaw));
  }

  const running = move.speed > RUN_CLIP_THRESHOLD;
  if (moving) {
    const referenceSpeed = running ? SPRINT_SPEED : WALK_SPEED;
    playClip(running ? "run" : "walk", running ? "Run" : "Walk", clamp(move.speed / referenceSpeed, 0.7, 1.35));
  } else {
    playClip("idle", "Idle", 1);
  }

  // --- course progress ---
  let checkpoint = Number(stats.checkpoint ?? 0);
  let hits = Number(stats.hits ?? 0);
  let lastHitAt = Number(stats.lastHitAt ?? -10);
  let status = typeof state.status === "string" && state.status.length > 0 ? state.status : "Course";
  let finished = false;
  for (const entity of entities) {
    const check = entity.get?.("Checkpoint");
    if (isRecord(check) && Number(check.order) === checkpoint + 1 && TriggerEx.entered(context, entity, { component: "CoursePlayer" }).length > 0) {
      checkpoint += 1;
      status = `Checkpoint ${checkpoint}/2 cleared: ${String(check.label ?? "course marker")}.`;
    }
    const finish = entity.get?.("FinishZone");
    if (isRecord(finish) && checkpoint >= 2 && TriggerEx.entered(context, entity, { component: "CoursePlayer" }).length > 0) {
      finished = true;
      status = "Course complete. Press R to run again.";
    }
    const hazard = entity.get?.("KinematicMover");
    if (isRecord(hazard) && TriggerEx.entered(context, entity, { component: "CoursePlayer" }).length > 0 && TriggerEx.cooldown(context, entity.id, HIT_COOLDOWN)) {
      hits += 1;
      lastHitAt = elapsed;
      status = "Hazard hit. Press R or keep moving.";
    }
  }

  player.patch?.("CoursePlayer", { checkpoint, finished, hits, lastHitAt });
  context.resources?.set?.("GameState", { ...state, checkpoint, checkpointTotal: 2, elapsed, hits, status });
}
