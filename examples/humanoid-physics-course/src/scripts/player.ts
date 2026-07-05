import { CameraRig, CharacterRig, NumberEx, Quat, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function updateHumanoidCourse(context: ScriptContext): void {
  // Movement feel tunables.
  const WALK_SPEED = 2.0;
  const SPRINT_SPEED = 3.8;
  const ACCELERATION = 11;
  const DECELERATION = 15;
  const MAX_TURN_SPEED = 9.5;
  const RUN_CLIP_THRESHOLD = 2.6;
  const HIT_COOLDOWN = 0.8;
  const START_POSITION: Vec3Tuple = [0, 0.02, 5.0];
  const BOUNDS = { max: [4.8, Number.POSITIVE_INFINITY, 6.4] as Vec3Tuple, min: [-4.8, Number.NEGATIVE_INFINITY, -6.5] as Vec3Tuple };
  // Soldier.glb's rest pose faces -Z (see the baked rotation on the
  // "Character" root node in assets/models/Soldier.glb), so CharacterRig
  // needs forwardAxis "-z". CameraRig.thirdPerson always assumes a +Z-forward
  // target, so the yaw fed into it is offset by PI to stay on the correct
  // side of a -Z-forward mesh (see updateThirdPersonCamera); CharacterRig's
  // own cameraYaw input (which only rotates the raw input vector, not a
  // facing) uses CameraRig's returned yaw as-is, since that stays in the
  // library's native +Z convention throughout.
  const FORWARD_AXIS = "-z";
  const CAMERA_YAW_OFFSET = Math.PI;

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

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
    player.patch?.("CoursePlayer", { checkpoint: 0, finished: false, hits: 0, lastHitAt: -10, speed: 0, yaw: 0 });
    context.resources?.set?.("tn.characterRig.player", { dirX: 0, dirZ: 1, speed: 0, yaw: 0 });
    // Camera rig yaw starts pre-aligned to playerYaw(0) + CAMERA_YAW_OFFSET so
    // the boom doesn't visibly swing 180 degrees into place after a retry.
    context.resources?.set?.("tn.cameraRig.camera.main", { followX: START_POSITION[0], followY: START_POSITION[1], followZ: START_POSITION[2], yaw: CAMERA_YAW_OFFSET });
    patchState({
      cameraYaw: CAMERA_YAW_OFFSET,
      checkpoint: 0,
      checkpointTotal: 2,
      elapsed: 0,
      hits: 0,
      status: "Course",
    });
  };

  if (context.input.pressed?.("retry") || context.input.action?.("retry")) {
    reset();
    context.animation?.play?.(player, "idle", { loop: true, sourceClip: "Idle" });
    return;
  }

  const stats = player.get?.("CoursePlayer") ?? { checkpoint: 0, finished: false, hits: 0, speed: 0, yaw: 0 };
  if (stats.finished === true) {
    context.animation?.play?.(player, "idle", { loop: true, sourceClip: "Idle" });
    return;
  }

  // CharacterRig reads MoveX/MoveZ, rotates them by cameraYaw so "right"
  // always means screen-right, eases speed/turn, calls character.move, and
  // clamps to the arena bounds -- this replaces this example's previous
  // hand-rolled version of the same logic.
  const cameraYaw = NumberEx.finite(Number(state.cameraYaw), 0);
  const rig = CharacterRig.update(context, player, {
    acceleration: ACCELERATION,
    bounds: BOUNDS,
    cameraYaw,
    deceleration: DECELERATION,
    forwardAxis: FORWARD_AXIS,
    maxTurnSpeed: MAX_TURN_SPEED,
    sprintAction: "sprint",
    sprintSpeed: SPRINT_SPEED,
    walkSpeed: WALK_SPEED,
  });
  const next = rig.position;

  // Animation tracks actual speed so foot cadence matches ground motion, with
  // a short crossfade so idle/walk/run switches don't pop.
  const running = rig.speed > RUN_CLIP_THRESHOLD;
  const animationClip = rig.moving ? (running ? "run" : "walk") : "idle";
  const sourceClip = rig.moving ? (running ? "Run" : "Walk") : "Idle";
  const referenceSpeed = running ? SPRINT_SPEED : WALK_SPEED;
  context.animation?.play?.(player, animationClip, {
    activeState: animationClip,
    blendSeconds: 0.22,
    durationSeconds: 1,
    loop: true,
    sourceClip,
    speed: rig.moving ? NumberEx.clamp(rig.speed / referenceSpeed, 0.7, 1.35) : 1,
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
        player.patch?.("CoursePlayer", { ...stats, checkpoint, finished: true, hits, speed: 0, sprinting: false, yaw: rig.yaw });
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

  player.patch?.("CoursePlayer", { ...stats, checkpoint, finished: false, hits, lastHitAt, speed: rig.speed, sprinting: rig.sprinting, yaw: rig.yaw });
  patchState({
    checkpoint,
    checkpointTotal: 2,
    elapsed,
    hits,
    status,
  });
}

export function updateThirdPersonCamera(context: ScriptContext): void {
  // Camera rig tunables, matched to this example's previous hand-rolled boom.
  const MAX_YAW_SPEED = 1.9;
  const FOLLOW_SMOOTHING = 9;
  const BASE_DISTANCE = 4.1;
  const SPRINT_PULLBACK = 0.55;
  const PIVOT_HEIGHT = 1.45;
  const CAMERA_LIFT = 0.55;
  const LOOK_AHEAD = 1.15;
  const SHOULDER = 0.3;
  // See the matching comment in updateHumanoidCourse: compensates
  // CameraRig.thirdPerson's +Z-forward assumption for our -Z-forward mesh.
  const CAMERA_YAW_OFFSET = Math.PI;

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const player = context.entity?.("player");
  const camera = context.entity?.("camera.main");
  if (player === undefined || camera === undefined) {
    return;
  }

  const stats = player.get?.("CoursePlayer");
  const playerYaw = isRecord(stats) ? NumberEx.finite(Number(stats.yaw), 0) : 0;
  const sprinting = isRecord(stats) ? Boolean(stats.sprinting) : false;

  // CameraRig.thirdPerson assumes a +Z-forward target and rotates offset/
  // lookAhead/shoulderOffset by the yaw we pass it. Feeding it playerYaw+PI
  // (see CAMERA_YAW_OFFSET) keeps the boom on the correct side of our
  // -Z-forward mesh, but it also flips the rig's local "right" axis versus
  // this example's old hand-rolled right vector, so shoulderOffset's sign is
  // negated to land on the same shoulder as before. lookAhead carries the
  // pivot height (rotateYaw preserves y untouched) since followPose looks
  // directly at the follow point, unlike the old code's separate pivot lift.
  const rig = CameraRig.thirdPerson(context, {
    cameraId: "camera.main",
    followSmoothing: FOLLOW_SMOOTHING,
    lookAhead: [0, PIVOT_HEIGHT, LOOK_AHEAD],
    maxYawSpeed: MAX_YAW_SPEED,
    offset: [0, CAMERA_LIFT, -BASE_DISTANCE],
    shoulderOffset: [-SHOULDER, 0, 0],
    sprintPullback: SPRINT_PULLBACK,
    sprinting,
    target: player,
    yaw: playerYaw + CAMERA_YAW_OFFSET,
  });

  // Stored as-is (not un-offset): the camera's forward direction in the
  // library's native +Z convention is exactly what rotates raw stick input
  // into world space for camera-relative movement in CharacterRig.
  context.resources?.set?.("GameState", {
    ...(isRecord(context.resources?.get?.("GameState")) ? context.resources.get("GameState") : {}),
    cameraYaw: NumberEx.round(rig.yaw, 6),
  });
}
