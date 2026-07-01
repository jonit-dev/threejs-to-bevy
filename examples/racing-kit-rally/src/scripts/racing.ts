type ScriptContext = any;
type Vec3 = [number, number, number];

export function updateRally(context: ScriptContext): void {
  const START: Vec3 = [-0.65, 0.02, 10.5];
  const START_YAW = Math.PI / 2;
  const CHECKPOINTS: Vec3[] = [
    [10.5, 0.02, 10.5],
    [10.5, 0.02, -10.5],
    [-10.5, 0.02, -10.5],
    [-10.5, 0.02, 10.5],
  ];

  const entities = context.query({ with: ["Transform"], without: [] });
  const player = findEntity(entities, "player.car");
  const rival = findEntity(entities, "rival.car");
  const camera = findEntity(entities, "camera.main");
  if (player === undefined) {
    return;
  }

  const dt = clamp(context.time.fixedDt ?? context.time.dt ?? 0.016, 0.001, 0.05);
  updatePlayer(player, dt);
  updateRival(rival, dt, context.time.elapsed ?? 0);
  updateCamera(camera, player);

  function updatePlayer(playerEntity: any, delta: number): void {
    const transform = playerEntity.get("Transform");
    const state = context.resources.get("RallyState") ?? {};
    const position = vec3(transform.position, START);
    let speed = number(state.speed, 0);
    let checkpoint = number(state.checkpoint, 0);
    let lap = number(state.lap, 0);
    let yaw = yawFromRotation(transform.rotation, START_YAW);

    if (context.input.action("reset-car")) {
      speed = 0;
      checkpoint = 0;
      yaw = START_YAW;
      playerEntity.patch("Transform", { position: START, rotation: yawRotation(yaw) });
      context.resources.set("RallyState", {
        ...state,
        checkpoint,
        hud: hud(lap, checkpoint, speed),
        lap,
        message: "Reset on the grid",
        speed,
      });
      return;
    }

    const throttle = context.input.action("throttle") ? 1 : 0;
    const brake = context.input.action("brake") ? 1 : 0;
    const steer = (context.input.axis("steer") || 0) + (context.input.action("steer-right") ? 1 : 0) - (context.input.action("steer-left") ? 1 : 0);
    const trackGrip = onTrack(position) ? 1 : 0.42;

    speed += (throttle * 22.0 - brake * 18.0) * delta;
    speed -= Math.sign(speed) * Math.min(Math.abs(speed), (onTrack(position) ? 0.9 : 8.0) * delta);
    speed = clamp(speed, -5.5, 15.5 * trackGrip);
    yaw -= clamp(steer, -1, 1) * (1.15 + Math.abs(speed) * 0.16) * delta;

    const next: Vec3 = [
      round(position[0] + Math.sin(yaw) * speed * delta),
      0.02,
      round(position[2] + Math.cos(yaw) * speed * delta),
    ];
    playerEntity.patch("Transform", { position: next, rotation: yawRotation(yaw) });

    const target = CHECKPOINTS[checkpoint % CHECKPOINTS.length] ?? CHECKPOINTS[0]!;
    let message = onTrack(next) ? "Hold the racing line" : "Off track: reduced grip";
    if (distance2d(next, target) < 1.8) {
      checkpoint += 1;
      message = `Checkpoint ${Math.min(checkpoint, CHECKPOINTS.length)}/${CHECKPOINTS.length}`;
    }
    if (checkpoint >= CHECKPOINTS.length && next[2] > 10.1 && Math.abs(next[0]) < 3.2) {
      lap += 1;
      checkpoint = 0;
      message = `Lap ${lap} complete`;
    }

    context.resources.set("RallyState", {
      ...state,
      checkpoint,
      hud: hud(lap, checkpoint, speed),
      lap,
      message,
      speed: round(speed),
    });
  }

  function updateRival(rivalEntity: any | undefined, delta: number, elapsed: number): void {
    if (rivalEntity === undefined) {
      return;
    }
    const transform = rivalEntity.get("Transform");
    const state = context.resources.get("RallyState") ?? {};
    const position = vec3(transform.position, [-1.65, 0.02, 10.5]);
    const phase = (number(state.rivalPhase, 0) + delta * 0.28 + elapsed * 0) % 1;
    const target = ovalPoint(phase);
    const dx = target[0] - position[0];
    const dz = target[2] - position[2];
    const yaw = Math.atan2(dx, dz);
    const follow = Math.min(1, delta * 2.8);
    rivalEntity.patch("Transform", {
      position: [round(position[0] + dx * follow), 0.02, round(position[2] + dz * follow)],
      rotation: yawRotation(yaw),
    });
    context.resources.set("RallyState", { ...state, rivalPhase: round(phase) });
  }

  function updateCamera(cameraEntity: any | undefined, playerEntity: any): void {
    if (cameraEntity === undefined) {
      return;
    }
    const transform = playerEntity.get("Transform");
    const position = vec3(transform.position, START);
    const yaw = yawFromRotation(transform.rotation, START_YAW);
    const forward: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)];
    const eye: Vec3 = [
      round(position[0] - forward[0] * 4.8),
      1.65,
      round(position[2] - forward[2] * 4.8),
    ];
    const target: Vec3 = [
      round(position[0] + forward[0] * 2.2),
      0.38,
      round(position[2] + forward[2] * 2.2),
    ];
    cameraEntity.patch("Transform", {
      position: eye,
      rotation: lookAtQuaternion(eye, target),
    });
  }

  function findEntity(items: readonly any[], id: string): any | undefined {
    return items.find((entity) => entity.id === id);
  }

  function ovalPoint(phase: number): Vec3 {
    const targets = CHECKPOINTS;
    const scaled = phase * targets.length;
    const index = Math.floor(scaled) % targets.length;
    const nextIndex = (index + 1) % targets.length;
    const local = scaled - Math.floor(scaled);
    const start = targets[index] ?? targets[0]!;
    const end = targets[nextIndex] ?? targets[0]!;
    return [
      round(start[0] + (end[0] - start[0]) * local),
      0.02,
      round(start[2] + (end[2] - start[2]) * local),
    ];
  }

  function onTrack(position: Vec3): boolean {
    const inSouthStraight = Math.abs(position[2] - 10.5) < 0.58 && position[0] > -10.7 && position[0] < 10.7;
    const inNorthStraight = Math.abs(position[2] + 10.5) < 0.58 && position[0] > -10.7 && position[0] < 10.7;
    const inWestStraight = Math.abs(position[0] + 10.5) < 0.58 && position[2] > -10.7 && position[2] < 10.7;
    const inEastStraight = Math.abs(position[0] - 10.5) < 0.58 && position[2] > -10.7 && position[2] < 10.7;
    return inSouthStraight || inNorthStraight || inWestStraight || inEastStraight;
  }

  function yawRotation(yaw: number): [number, number, number, number] {
    return [0, round(Math.sin(yaw / 2)), 0, round(Math.cos(yaw / 2))];
  }

  function lookAtQuaternion(eye: Vec3, target: Vec3): [number, number, number, number] {
    const zAxis = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    const xAxis = normalize(cross([0, 1, 0], zAxis));
    const yAxis = cross(zAxis, xAxis);
    return quaternionFromBasis(xAxis, yAxis, zAxis);
  }

  function quaternionFromBasis(x: Vec3, y: Vec3, z: Vec3): [number, number, number, number] {
    const trace = x[0] + y[1] + z[2];
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      return [round((y[2] - z[1]) / s), round((z[0] - x[2]) / s), round((x[1] - y[0]) / s), round(0.25 * s)];
    }
    if (x[0] > y[1] && x[0] > z[2]) {
      const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2;
      return [round(0.25 * s), round((y[0] + x[1]) / s), round((z[0] + x[2]) / s), round((y[2] - z[1]) / s)];
    }
    if (y[1] > z[2]) {
      const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2;
      return [round((y[0] + x[1]) / s), round(0.25 * s), round((z[1] + y[2]) / s), round((z[0] - x[2]) / s)];
    }
    const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2;
    return [round((z[0] + x[2]) / s), round((z[1] + y[2]) / s), round(0.25 * s), round((x[1] - y[0]) / s)];
  }

  function cross(a: Vec3, b: Vec3): Vec3 {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function normalize(value: Vec3): Vec3 {
    const length = Math.sqrt(value[0] * value[0] + value[1] * value[1] + value[2] * value[2]) || 1;
    return [value[0] / length, value[1] / length, value[2] / length];
  }

  function yawFromRotation(rotation: unknown, fallback: number): number {
    if (!Array.isArray(rotation) || rotation.length < 4) {
      return fallback;
    }
    const y = Number(rotation[1]);
    const w = Number(rotation[3]);
    return Number.isFinite(y) && Number.isFinite(w) ? 2 * Math.atan2(y, w) : fallback;
  }

  function hud(lap: number, checkpoint: number, speed: number): string {
    const progress = Math.min(checkpoint, CHECKPOINTS.length);
    return `Lap ${lap + 1}  CP ${progress}/${CHECKPOINTS.length}  ${Math.round(Math.abs(speed) * 18)} km/h`;
  }

  function vec3(value: unknown, fallback: Vec3): Vec3 {
    return Array.isArray(value) && value.length >= 3
      ? [number(value[0], fallback[0]), number(value[1], fallback[1]), number(value[2], fallback[2])]
      : fallback;
  }

  function distance2d(a: Vec3, b: Vec3): number {
    const dx = a[0] - b[0];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dz * dz);
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function number(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }

  function round(value: number): number {
    return Number(value.toFixed(6));
  }
}
