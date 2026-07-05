import { AngleEx, NumberEx, Quat, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

// Shared conventions for both systems:
// - Soldier.glb rest pose faces -Z, so world forward for yaw is
//   [-sin(yaw), 0, -cos(yaw)] and heading = cameraYaw + atan2(-dirX, -dirZ)
//   (camera-relative input, matching CharacterRig's cameraYaw convention).
// - CoursePlayer carries gameplay state (speed/heading/yaw/checkpoint/...).
// - GameState carries HUD values plus the camera rig state.

export function updateHumanoidCourse(context: ScriptContext): void {
  // Movement feel tunables.
  const WALK_SPEED = 2.0;
  const SPRINT_SPEED = 3.8;
  const ACCELERATION = 11;
  const DECELERATION = 15;
  const TURN_SMOOTHING = 11;
  const MAX_TURN_SPEED = 9.5;
  const HIT_COOLDOWN = 0.8;
  const START_POSITION: Vec3Tuple = [0, 0.02, 5.0];

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const isVec3 = (value: unknown): value is Vec3Tuple => Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item));
  const forwardOfYaw = (yaw: number): Vec3Tuple => [-Math.sin(yaw), 0, -Math.cos(yaw)];

  const delta = context.time.fixedDelta({ fallback: 1 / 60, max: 1 / 30, min: 0.001 });
  const elapsed = typeof context.time.elapsed === "number" ? context.time.elapsed : 0;
  const entities = context.query();
  const player = entities.find((entity: any) => entity.id === "player");
  if (player === undefined) {
    return;
  }

  const resource = context.resources?.get?.("GameState");
  const state = isRecord(resource) ? resource : {};
  const patchState = (patch: Record<string, unknown>): void => {
    context.resources?.set?.("GameState", { ...state, ...patch });
  };
  const reset = (): void => {
    player.transform().setPose(START_POSITION, Quat.fromYaw(0));
    player.patch?.("CoursePlayer", { speed: 0, heading: 0, checkpoint: 0, hits: 0, finished: false, yaw: 0, lastHitAt: -10 });
    patchState({
      checkpoint: 0,
      checkpointTotal: 2,
      elapsed: 0,
      hits: 0,
      status: "Course",
      cameraYaw: 0,
      cameraFollow: START_POSITION,
      cameraDistance: 4.1,
    });
  };

  if (context.input.pressed?.("retry") || context.input.action?.("retry")) {
    reset();
    context.animation?.play?.(player, "idle", { loop: true, sourceClip: "Idle" });
    return;
  }

  const stats = player.get?.("CoursePlayer") ?? { speed: 0, heading: 0, checkpoint: 0, hits: 0, finished: false, yaw: 0 };
  if (stats.finished === true) {
    context.animation?.play?.(player, "idle", { loop: true, sourceClip: "Idle" });
    return;
  }

  // Input -> normalized planar direction in camera space (x screen-right,
  // z toward camera). Standard third-person controls are camera-relative:
  // the local stick direction is rotated by the camera rig's current yaw so
  // "right" always means screen-right, no matter where the camera points.
  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-back", positive: "move-forward" });
  const inputLength = Math.hypot(axisX, axisZ);
  const hasInput = inputLength > 0.05;
  const dirX = hasInput ? axisX / Math.max(1, inputLength) : 0;
  const dirZ = hasInput ? -axisZ / Math.max(1, inputLength) : 0;
  const cameraYaw = NumberEx.finite(Number(state.cameraYaw), 0);
  const sprinting = hasInput && (context.input.pressed?.("sprint") || context.input.action?.("sprint"));

  // Speed eases toward its target so starts and stops carry weight.
  const currentSpeed = NumberEx.finite(Number(stats.speed), 0);
  const targetSpeed = hasInput ? (sprinting ? SPRINT_SPEED : WALK_SPEED) : 0;
  const rate = targetSpeed > currentSpeed ? ACCELERATION : DECELERATION;
  const speed = NumberEx.moveToward(currentSpeed, targetSpeed, rate * delta);

  // Heading persists while decelerating so releasing input glides straight.
  const currentYaw = NumberEx.finite(Number(stats.yaw), 0);
  const heading = hasInput ? cameraYaw + Math.atan2(-dirX, -dirZ) : NumberEx.finite(Number(stats.heading), currentYaw);
  const moving = speed > 0.02;

  // Facing chases the heading: exponential ease capped at MAX_TURN_SPEED.
  const turnStep = AngleEx.deltaAngle(currentYaw, heading) * (1 - Math.exp(-TURN_SMOOTHING * delta));
  const yaw = currentYaw + NumberEx.clamp(turnStep, -MAX_TURN_SPEED * delta, MAX_TURN_SPEED * delta);

  const position = player.transform().positionOr(START_POSITION);
  // Move along the eased visual yaw (not the raw input heading) so the body
  // never translates in a direction it isn't yet facing.
  const moveDirection = forwardOfYaw(yaw);
  const characterMove = moving
    ? context.character?.move?.(player, {
        direction: [moveDirection[0], moveDirection[2]],
        fixedDelta: delta,
        speed,
      })
    : null;
  const resolved = isRecord(characterMove) && isVec3(characterMove.resolved)
    ? characterMove.resolved
    : [position[0] + moveDirection[0] * speed * delta, position[1], position[2] + moveDirection[2] * speed * delta] as Vec3Tuple;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(resolved[0], -4.8, 4.8),
    position[1],
    NumberEx.clamp(resolved[2], -6.5, 6.4),
  ], 6) as Vec3Tuple;
  player.transform().setPose(next, Quat.fromYaw(yaw));
  // Script-driven setPose is authoritative; keep kinematic velocity at zero so
  // stepPhysics does not integrate the same motion a second time each tick.
  player.patch?.("RigidBody", { kind: "kinematic", velocity: [0, 0, 0] });

  // Animation tracks actual speed so foot cadence matches ground motion.
  const running = speed > 2.6;
  const animationClip = moving ? (running ? "run" : "walk") : "idle";
  const sourceClip = moving ? (running ? "Run" : "Walk") : "Idle";
  const referenceSpeed = running ? SPRINT_SPEED : WALK_SPEED;
  context.animation?.play?.(player, animationClip, {
    activeState: animationClip,
    blendSeconds: 0.22,
    durationSeconds: 1,
    loop: true,
    sourceClip,
    speed: moving ? NumberEx.clamp(speed / referenceSpeed, 0.7, 1.35) : 1,
  });

  let checkpoint = Number(stats.checkpoint ?? state.checkpoint ?? 0);
  let hits = Number(stats.hits ?? state.hits ?? 0);
  let lastHitAt = Number(stats.lastHitAt ?? -10);
  let status = "Course";
  for (const entity of entities) {
    const check = entity.get?.("Checkpoint");
    if (isRecord(check) && Number(check.order) === checkpoint + 1) {
      const checkPosition = entity.transform().positionOr([0, 0, 0]);
      if (Vec3.distance2d(next, checkPosition) < 0.78) {
        checkpoint += 1;
        status = `Checkpoint ${checkpoint}/2 cleared: ${String(check.label ?? "course marker")}.`;
      }
    }
    const finish = entity.get?.("FinishZone");
    if (isRecord(finish)) {
      const finishPosition = entity.transform().positionOr([0, 0, -6.1]);
      if (checkpoint >= 2 && Vec3.distance2d(next, finishPosition) < Number(finish.radius ?? 0.95)) {
        player.patch?.("CoursePlayer", { ...stats, checkpoint, hits, finished: true, heading, speed: 0, yaw });
        patchState({
          checkpoint,
          checkpointTotal: 2,
          elapsed,
          hits,
          status: "Course complete. Press R to run again.",
        });
        return;
      }
    }
    const hazard = entity.get?.("KinematicMover");
    if (isRecord(hazard) && Vec3.distance2d(next, entity.transform().positionOr([0, 0, 0])) < 0.82 && elapsed - lastHitAt > HIT_COOLDOWN) {
      hits += 1;
      lastHitAt = elapsed;
      status = "Hazard hit. Press R or keep moving.";
    }
  }

  player.patch?.("CoursePlayer", { ...stats, checkpoint, hits, finished: false, heading, lastHitAt, speed, yaw });
  patchState({
    checkpoint,
    checkpointTotal: 2,
    elapsed,
    hits,
    status,
  });
}

export function updateThirdPersonCamera(context: ScriptContext): void {
  // Camera rig tunables. The boom hangs off a smoothed follow point and a
  // lazily-chasing yaw, so eye and look-at can never disagree within a frame.
  const YAW_SMOOTHING = 3.2;
  const MAX_YAW_SPEED = 1.9;
  const FOLLOW_SMOOTHING = 9;
  const BASE_DISTANCE = 4.1;
  const SPRINT_PULLBACK = 0.55;
  const DISTANCE_SMOOTHING = 2.5;
  const PIVOT_HEIGHT = 1.45;
  const CAMERA_LIFT = 0.55;
  const LOOK_AHEAD = 1.15;
  const SHOULDER = 0.3;
  const SPRINT_SPEED = 3.8;
  const START_POSITION: Vec3Tuple = [0, 0.02, 5.0];

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const isVec3 = (value: unknown): value is Vec3Tuple => Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item));
  const forwardOfYaw = (yaw: number): Vec3Tuple => [-Math.sin(yaw), 0, -Math.cos(yaw)];

  // This system runs on the frame schedule, so smooth with the frame delta.
  const dt = NumberEx.clamp(NumberEx.finite(context.time?.delta, 1 / 60), 0.001, 0.05);
  const player = context.entity?.("player");
  const camera = context.entity?.("camera.main");
  if (player === undefined || camera === undefined) {
    return;
  }

  const resource = context.resources?.get?.("GameState");
  const state = isRecord(resource) ? resource : {};
  const stats = player.get?.("CoursePlayer");
  const playerYaw = isRecord(stats) ? NumberEx.finite(Number(stats.yaw), 0) : 0;
  const playerSpeed = isRecord(stats) ? NumberEx.finite(Number(stats.speed), 0) : 0;
  const playerPosition = player.transform().positionOr(START_POSITION);

  // Follow point eases toward the player, hiding fixed-tick stepping.
  const followCurrent = isVec3(state.cameraFollow) ? state.cameraFollow : playerPosition;
  const follow = Vec3.lerp(followCurrent, playerPosition, 1 - Math.exp(-FOLLOW_SMOOTHING * dt)) as Vec3Tuple;

  // Yaw lazily re-centers behind the character, scaled by how aligned the
  // facing already is with the camera: full chase when running away from the
  // camera, half-rate orbit on lateral strafes, and no chase when running
  // toward the camera so backing up never whips the boom 180 degrees.
  const yawCurrent = NumberEx.finite(Number(state.cameraYaw), playerYaw);
  const playerForward = forwardOfYaw(playerYaw);
  const cameraForward = forwardOfYaw(yawCurrent);
  const alignment = NumberEx.saturate(
    (playerForward[0] * cameraForward[0] + playerForward[2] * cameraForward[2] + 1) / 2,
  );
  const yawStep = AngleEx.deltaAngle(yawCurrent, playerYaw) * (1 - Math.exp(-YAW_SMOOTHING * dt)) * alignment;
  const yawCap = MAX_YAW_SPEED * alignment * dt;
  const cameraYaw = yawCurrent + NumberEx.clamp(yawStep, -yawCap, yawCap);

  // Boom stretches slightly at sprint for a sense of momentum.
  const distanceCurrent = NumberEx.finite(Number(state.cameraDistance), BASE_DISTANCE);
  const distanceTarget = BASE_DISTANCE + SPRINT_PULLBACK * NumberEx.saturate(playerSpeed / SPRINT_SPEED);
  const distance = distanceCurrent + (distanceTarget - distanceCurrent) * (1 - Math.exp(-DISTANCE_SMOOTHING * dt));

  const forward = forwardOfYaw(cameraYaw);
  const right: Vec3Tuple = [-forward[2], 0, forward[0]];
  const pivot: Vec3Tuple = [follow[0], follow[1] + PIVOT_HEIGHT, follow[2]];
  const eye = Vec3.round([
    pivot[0] - forward[0] * distance + right[0] * SHOULDER,
    pivot[1] + CAMERA_LIFT,
    pivot[2] - forward[2] * distance + right[2] * SHOULDER,
  ], 6) as Vec3Tuple;
  const target = Vec3.round([
    pivot[0] + forward[0] * LOOK_AHEAD,
    pivot[1],
    pivot[2] + forward[2] * LOOK_AHEAD,
  ], 6) as Vec3Tuple;

  context.resources?.set?.("GameState", {
    ...state,
    cameraDistance: NumberEx.round(distance, 6),
    cameraFollow: Vec3.round(follow, 6),
    cameraPosition: eye,
    cameraTarget: target,
    cameraYaw: NumberEx.round(cameraYaw, 6),
  });
  camera.transform().setPose(eye, Quat.lookAt(eye, target));
}
