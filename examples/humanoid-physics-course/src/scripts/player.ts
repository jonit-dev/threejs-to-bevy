import { NumberEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];
type QuatTuple = [number, number, number, number];

export function updateHumanoidCourse(context: ScriptContext): void {
  const startPosition: Vec3Tuple = [0, 0.02, 5.0];
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const isVec3 = (value: unknown): value is Vec3Tuple => Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item));
  const distance2d = (a: Vec3Tuple, b: Vec3Tuple): number => {
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dz * dz);
  };
  const yawToQuat = (yaw: number): QuatTuple => {
    const half = yaw * 0.5;
    return [0, Number(Math.sin(half).toFixed(6)), 0, Number(Math.cos(half).toFixed(6))];
  };
  const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
  const lerpAngle = (from: number, to: number, alpha: number): number => from + wrapAngle(to - from) * NumberEx.clamp(alpha, 0, 1);

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
    player.transform().setPose(startPosition, yawToQuat(0));
    player.patch?.("CoursePlayer", { speed: 3.1, checkpoint: 0, hits: 0, finished: false, yaw: 0 });
    patchState({
      checkpoint: 0,
      elapsed: 0,
      hits: 0,
      status: "Course",
      cameraOrbit: 0,
      cameraYaw: 0,
      checkpointText: "Checkpoint 0/2",
      hitText: "Hits 0",
      timerText: "00.0",
      hudLine: "CP 0/2  Hits 0  00.0",
    });
  };

  if (context.input.pressed?.("retry") || context.input.action?.("retry")) {
    reset();
    context.animation?.play?.(player, "idle", { loop: true, sourceClip: "Idle" });
    return;
  }

  for (const entity of entities) {
    const hazard = entity.get?.("SweeperHazard");
    if (!isRecord(hazard) || !isVec3(hazard.origin)) {
      continue;
    }
    const angularSpeed = Number(hazard.speed ?? 1);
    const radius = Number(hazard.radius ?? 1);
    const angle = elapsed * angularSpeed + Number(hazard.phase ?? 0);
    const wave = Math.sin(angle) * radius;
    const waveVelocity = Math.cos(angle) * angularSpeed * radius;
    const next = hazard.axis === "z"
      ? [hazard.origin[0], hazard.origin[1], hazard.origin[2] + wave] as Vec3Tuple
      : [hazard.origin[0] + wave, hazard.origin[1], hazard.origin[2]] as Vec3Tuple;
    entity.transform().setPosition(Vec3.round(next, 6));
    entity.patch?.("RigidBody", { kind: "kinematic", gravityScale: 0, velocity: hazard.axis === "z" ? [0, 0, waveVelocity] : [waveVelocity, 0, 0] });
  }

  const stats = player.get?.("CoursePlayer") ?? { speed: 3.1, checkpoint: 0, hits: 0, finished: false, yaw: 0 };
  if (stats.finished === true) {
    context.animation?.play?.(player, "idle", { loop: true, sourceClip: "Idle" });
    return;
  }

  const axisX = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
  const axisZ = context.input.axis1("MoveZ", { negative: "move-back", positive: "move-forward" });
  const length = Math.max(1, Math.sqrt(axisX * axisX + axisZ * axisZ));
  const position = player.transform().positionOr(startPosition);
  const moving = Math.abs(axisX) + Math.abs(axisZ) > 0.05;
  const sprinting = moving && (context.input.pressed?.("sprint") || context.input.action?.("sprint"));
  const moveX = axisX / length;
  const moveZ = -axisZ / length;
  const speedScale = sprinting ? 1.18 : 0.62;
  const characterMove = moving
    ? context.character?.move?.(player, { axes: { MoveX: moveX, MoveZ: moveZ }, fixedDelta: delta * speedScale })
    : null;
  const resolved = isRecord(characterMove) && isVec3(characterMove.resolved)
    ? characterMove.resolved
    : [position[0] + moveX * 3.1 * delta * speedScale, position[1], position[2] + moveZ * 3.1 * delta * speedScale] as Vec3Tuple;
  const next: Vec3Tuple = Vec3.round([
    NumberEx.clamp(resolved[0], -4.8, 4.8),
    position[1],
    NumberEx.clamp(resolved[2], -6.5, 6.4),
  ], 6);
  const currentYaw = Number(stats.yaw ?? 0);
  // Soldier.glb's rest pose faces +Z, so the movement-facing yaw is offset by pi.
  const targetYaw = moving ? Math.atan2(-moveX, -moveZ) : currentYaw;
  const yaw = lerpAngle(currentYaw, targetYaw, 1 - Math.exp(-delta * 14));
  player.transform().setPose(next, yawToQuat(yaw));
  const effectiveSpeed = 3.1 * speedScale;
  // Script-driven setPose is authoritative; keep kinematic velocity at zero so
  // stepPhysics does not integrate the same motion a second time each tick.
  player.patch?.("RigidBody", { kind: "kinematic", velocity: [0, 0, 0] });
  const animationClip = moving ? (sprinting ? "run" : "walk") : "idle";
  const sourceClip = moving ? (sprinting ? "Run" : "Walk") : "Idle";
  context.animation?.play?.(player, animationClip, {
    activeState: animationClip,
    blendSeconds: 0.16,
    durationSeconds: 1,
    loop: true,
    sourceClip,
    speed: sprinting ? 1.15 : moving ? 1.05 : 1,
  });

  let checkpoint = Number(stats.checkpoint ?? state.checkpoint ?? 0);
  let hits = Number(stats.hits ?? state.hits ?? 0);
  let lastHitAt = Number(stats.lastHitAt ?? -10);
  let status = "Course";
  for (const entity of entities) {
    const check = entity.get?.("Checkpoint");
    if (isRecord(check) && Number(check.order) === checkpoint + 1) {
      const checkPosition = entity.transform().positionOr([0, 0, 0]);
      if (distance2d(next, checkPosition) < 0.78) {
        checkpoint += 1;
        status = `Checkpoint ${checkpoint}/2 cleared: ${String(check.label ?? "course marker")}.`;
      }
    }
    const finish = entity.get?.("FinishZone");
    if (isRecord(finish)) {
      const finishPosition = entity.transform().positionOr([0, 0, -6.1]);
      if (checkpoint >= 2 && distance2d(next, finishPosition) < Number(finish.radius ?? 0.95)) {
        player.patch?.("CoursePlayer", { ...stats, checkpoint, hits, finished: true, yaw });
        patchState({
          checkpoint,
          elapsed,
          hits,
          status: "Course complete. Press R to run again.",
          checkpointText: "Checkpoint 2/2",
          hitText: `Hits ${hits}`,
          timerText: elapsed.toFixed(1),
          hudLine: `CP 2/2  Hits ${hits}  ${elapsed.toFixed(1)}`,
        });
        return;
      }
    }
    const hazard = entity.get?.("SweeperHazard");
    if (isRecord(hazard) && distance2d(next, entity.transform().positionOr([0, 0, 0])) < 0.82 && elapsed - lastHitAt > 0.8) {
      hits += 1;
      lastHitAt = elapsed;
      status = "Hazard hit. Press R or keep moving.";
    }
  }

  player.patch?.("CoursePlayer", { ...stats, checkpoint, hits, finished: false, lastHitAt, speed: effectiveSpeed, yaw });
  patchState({
    checkpoint,
    elapsed,
    hits,
    status,
    checkpointText: `Checkpoint ${checkpoint}/2`,
    hitText: `Hits ${hits}`,
    timerText: elapsed.toFixed(1),
    hudLine: `CP ${checkpoint}/2  Hits ${hits}  ${elapsed.toFixed(1)}`,
  });
}

export function updateThirdPersonCamera(context: ScriptContext): void {
  const startPosition: Vec3Tuple = [0, 0.02, 5.0];
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const isVec3 = (value: unknown): value is Vec3Tuple => Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item));
  const lerpVec3 = (from: Vec3Tuple, to: Vec3Tuple, alpha: number): Vec3Tuple => [
    from[0] + (to[0] - from[0]) * alpha,
    from[1] + (to[1] - from[1]) * alpha,
    from[2] + (to[2] - from[2]) * alpha,
  ];
  const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
  const lerpAngle = (from: number, to: number, alpha: number): number => from + wrapAngle(to - from) * NumberEx.clamp(alpha, 0, 1);
  const normalize = (value: Vec3Tuple): Vec3Tuple => {
    const length = Math.hypot(value[0], value[1], value[2]) || 1;
    return [value[0] / length, value[1] / length, value[2] / length];
  };
  const cross = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const roundQuat = (value: number): number => Number(value.toFixed(6));
  const quatFromMatrix = (m11: number, m12: number, m13: number, m21: number, m22: number, m23: number, m31: number, m32: number, m33: number): QuatTuple => {
    const trace = m11 + m22 + m33;
    let x = 0;
    let y = 0;
    let z = 0;
    let w = 1;
    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1);
      w = 0.25 / s;
      x = (m32 - m23) * s;
      y = (m13 - m31) * s;
      z = (m21 - m12) * s;
    } else if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      w = (m32 - m23) / s;
      x = 0.25 * s;
      y = (m12 + m21) / s;
      z = (m13 + m31) / s;
    } else if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      w = (m13 - m31) / s;
      x = (m12 + m21) / s;
      y = 0.25 * s;
      z = (m23 + m32) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
      w = (m21 - m12) / s;
      x = (m13 + m31) / s;
      y = (m23 + m32) / s;
      z = 0.25 * s;
    }
    return [roundQuat(x), roundQuat(y), roundQuat(z), roundQuat(w)];
  };
  const lookAtQuat = (eye: Vec3Tuple, target: Vec3Tuple): QuatTuple => {
    const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    const x = normalize(cross([0, 1, 0], z));
    const y = cross(z, x);
    return quatFromMatrix(
      x[0], y[0], z[0],
      x[1], y[1], z[1],
      x[2], y[2], z[2],
    );
  };

  const delta = context.time.fixedDelta({ fallback: 1 / 60, max: 1 / 30, min: 0.001 });
  const player = context.entity?.("player");
  const camera = context.entity?.("camera.main");
  if (player === undefined || camera === undefined) {
    return;
  }

  const resource = context.resources?.get?.("GameState");
  const state = isRecord(resource) ? resource : {};
  const playerPosition = player.transform().positionOr(startPosition);
  const playerStats = player.get?.("CoursePlayer");
  const yaw = isRecord(playerStats) && typeof playerStats.yaw === "number" ? playerStats.yaw : 0;
  // Orbit angle lags the character's yaw so the eye and its look-at target
  // never disagree on facing within a frame (that mismatch caused the wobble).
  const currentCameraYaw = typeof state.cameraYaw === "number" ? state.cameraYaw : yaw;
  const cameraYaw = lerpAngle(currentCameraYaw, yaw, 1 - Math.exp(-delta * 10));
  // Soldier.glb's rest pose faces -Z, so this is the model's current world-space forward.
  const forward: Vec3Tuple = [-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)];
  const right: Vec3Tuple = [forward[2], 0, -forward[0]];
  const distance = 4.15;
  const height = 1.82;
  const shoulder = 0.34;
  const lookAhead = 1.2;
  const eyeHeight = 1.5;
  const desiredPosition: Vec3Tuple = [
    playerPosition[0] - forward[0] * distance + right[0] * shoulder,
    playerPosition[1] + height,
    playerPosition[2] - forward[2] * distance + right[2] * shoulder,
  ];
  const currentPosition = isVec3(state.cameraPosition) ? state.cameraPosition : camera.transform().positionOr(desiredPosition);
  const cameraPosition = Vec3.round(lerpVec3(currentPosition, desiredPosition, 1 - Math.exp(-delta * 11.5)), 6);
  const target = Vec3.round([
    playerPosition[0] + forward[0] * lookAhead,
    playerPosition[1] + eyeHeight,
    playerPosition[2] + forward[2] * lookAhead,
  ], 6);
  context.resources?.set?.("GameState", { ...state, cameraOrbit: 0, cameraPosition, cameraTarget: target, cameraYaw });
  camera.transform().setPose(cameraPosition, lookAtQuat(cameraPosition, target));
}
