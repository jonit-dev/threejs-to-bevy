import { CameraRig, CharacterRig, RespawnEx, TriggerEx } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function updateHumanoidCourse(context: ScriptContext): void {
  const WALK_SPEED = 2.0;
  const SPRINT_SPEED = 3.8;
  const ACCELERATION = 12;
  const DECELERATION = 18;
  const TURN_SPEED = 10;
  const HIT_COOLDOWN = 0.8;
  const START_POSITION: Vec3Tuple = [0, 0.02, 5.0];
  const BOUNDS_MIN: Vec3Tuple = [-4.8, Number.NEGATIVE_INFINITY, -6.5];
  const BOUNDS_MAX: Vec3Tuple = [4.8, Number.POSITIVE_INFINITY, 6.4];
  const GAME_STATE_START = { checkpoint: 0, checkpointTotal: 2, elapsed: 0, hits: 0, status: "Course" };
  const entities = context.query();
  const player = entities.find((entity: any) => entity.id === "player");
  if (player === undefined) {
    return;
  }

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const elapsed = typeof context.time?.elapsed === "number" ? context.time.elapsed : 0;
  const gameState = context.resources?.get?.("GameState");
  const state = isRecord(gameState) ? gameState : {};
  const stats = player.get?.("CoursePlayer") ?? { checkpoint: 0, finished: false, hits: 0, lastHitAt: -10 };

  const reset = (): void => {
    RespawnEx.reset(context, player, {
      components: { CoursePlayer: { checkpoint: 0, finished: false, hits: 0, lastHitAt: -10 } },
      position: START_POSITION,
      resources: { GameState: GAME_STATE_START },
      stateKeys: ["tn.cameraOrbitRig.camera.main", "tn.characterRig.player"],
      yaw: Math.PI,
    });
  };

  if (context.input?.pressed?.("retry") || context.input?.action?.("retry")) {
    reset();
    return;
  }

  const camera = CameraRig.orbitThirdPerson(context, {
    cameraId: "camera.main",
    collision: {
      ignore: ["player"],
      mask: ["world", "pushable"],
      padding: 0.28,
    },
    distance: 5.2,
    input: {
      lookX: "LookX",
      lookY: "LookY",
      maxPitchStep: 0.045,
      maxYawStep: 0.07,
      pitchSensitivity: 0.0012,
      yawSensitivity: 0.002,
    },
    lookHeight: 1.45,
    minDistance: 1.35,
    pitch: {
      default: 0.28,
      max: 0.62,
      min: 0.12,
    },
    rounding: {
      positionDigits: 5,
      rotationDigits: 5,
    },
    target: player,
  });

  if (stats.finished === true) {
    return;
  }

  CharacterRig.update(context, player, {
    acceleration: ACCELERATION,
    bounds: { max: BOUNDS_MAX, min: BOUNDS_MIN },
    cameraYaw: camera.yaw,
    clips: {
      idle: { clip: "idle", sourceClip: "Idle" },
      run: { clip: "run", referenceSpeed: SPRINT_SPEED, sourceClip: "Run" },
      walk: { clip: "walk", referenceSpeed: WALK_SPEED, sourceClip: "Walk" },
    },
    deceleration: DECELERATION,
    forwardAxis: "-z",
    maxTurnSpeed: TURN_SPEED,
    sprintAction: "sprint",
    sprintSpeed: SPRINT_SPEED,
    walkSpeed: WALK_SPEED,
  });

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
