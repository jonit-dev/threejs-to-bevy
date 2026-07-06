import { Bounds2, CameraMath, NumberEx, Quat, TextEx, Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;
type Vec3Tuple = [number, number, number];

export function updateRally(context: ScriptContext): void {
  const START: Vec3Tuple = [-0.65, 0.02, 10.5];
  const START_YAW = Math.PI / 2;
  const CHECKPOINTS: Vec3Tuple[] = [
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

  const dt = NumberEx.clamp(context.time.fixedDt ?? context.time.dt ?? 0.016, 0.001, 0.05);
  updatePlayer(player, dt);
  updateRival(rival, dt, context.time.elapsed ?? 0);
  updateCamera(camera, player);

  function updatePlayer(playerEntity: any, delta: number): void {
    const transform = playerEntity.get("Transform");
    const state = context.resources.get("RallyState") ?? {};
    const position = Vec3.from(transform.position, START);
    let speed = NumberEx.finite(state.speed, 0);
    let checkpoint = NumberEx.finite(state.checkpoint, 0);
    let lap = NumberEx.finite(state.lap, 0);
    let yaw = Quat.yaw(transform.rotation, START_YAW);

    if (context.input.action("reset-car")) {
      speed = 0;
      checkpoint = 0;
      yaw = START_YAW;
      playerEntity.patch("Transform", { position: START, rotation: Quat.fromYaw(yaw) });
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
    const steer =
      NumberEx.finite(context.input.axis("steer"), 0) +
      (context.input.action("steer-right") ? 1 : 0) -
      (context.input.action("steer-left") ? 1 : 0);
    const trackGrip = onTrack(position) ? 1 : 0.42;

    speed += (throttle * 22.0 - brake * 18.0) * delta;
    speed -= NumberEx.sign(speed) * Math.min(Math.abs(speed), (onTrack(position) ? 0.9 : 8.0) * delta);
    speed = NumberEx.clamp(speed, -5.5, 15.5 * trackGrip);
    yaw -= NumberEx.clamp(steer, -1, 1) * (1.15 + Math.abs(speed) * 0.16) * delta;

    const next = Vec3.withY(Vec3.add(position, Vec3.scale(Vec3.rotateYaw([0, 0, 1], yaw), speed * delta)), 0.02);
    playerEntity.patch("Transform", { position: next, rotation: Quat.fromYaw(yaw) });

    const target = CHECKPOINTS[checkpoint % CHECKPOINTS.length] ?? CHECKPOINTS[0]!;
    let message = onTrack(next) ? "Hold the racing line" : "Off track: reduced grip";
    if (Vec3.distance2d(next, target) < 1.8) {
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
      speed: NumberEx.round(speed, 6),
    });
  }

  function updateRival(rivalEntity: any | undefined, delta: number, elapsed: number): void {
    if (rivalEntity === undefined) {
      return;
    }
    const transform = rivalEntity.get("Transform");
    const state = context.resources.get("RallyState") ?? {};
    const position = Vec3.from(transform.position, [-1.65, 0.02, 10.5]);
    const phase = NumberEx.repeat(NumberEx.finite(state.rivalPhase, 0) + delta * 0.28 + elapsed * 0, 1);
    const target = ovalPoint(phase);
    const yaw = Math.atan2(target[0] - position[0], target[2] - position[2]);
    const follow = Math.min(1, delta * 2.8);
    rivalEntity.patch("Transform", {
      position: Vec3.withY(Vec3.lerp(position, target, follow), 0.02),
      rotation: Quat.fromYaw(yaw),
    });
    context.resources.set("RallyState", { ...state, rivalPhase: NumberEx.round(phase, 6) });
  }

  function updateCamera(cameraEntity: any | undefined, playerEntity: any): void {
    if (cameraEntity === undefined) {
      return;
    }
    const transform = playerEntity.get("Transform");
    const pose = CameraMath.followPose({
      offset: [0, 1.65, -4.8],
      target: Vec3.add(Vec3.from(transform.position, START), [0, 0.38, 0]),
      yaw: Quat.yaw(transform.rotation, START_YAW),
    });
    cameraEntity.patch("Transform", {
      position: pose.position,
      rotation: Quat.normalize(pose.rotation),
    });
  }

  function findEntity(items: readonly any[], id: string): any | undefined {
    return items.find((entity) => entity.id === id);
  }

  function ovalPoint(phase: number): Vec3Tuple {
    const scaled = NumberEx.repeat(phase, 1) * CHECKPOINTS.length;
    const index = Math.floor(scaled) % CHECKPOINTS.length;
    const nextIndex = (index + 1) % CHECKPOINTS.length;
    const start = CHECKPOINTS[index] ?? CHECKPOINTS[0]!;
    const end = CHECKPOINTS[nextIndex] ?? CHECKPOINTS[0]!;
    return Vec3.withY(Vec3.lerp(start, end, scaled - Math.floor(scaled)), 0.02) as Vec3Tuple;
  }

  function onTrack(position: Vec3Tuple): boolean {
    const point = [position[0], position[2]] as const;
    const south = Bounds2.rect(-10.7, 9.92, 21.4, 1.16);
    const north = Bounds2.rect(-10.7, -11.08, 21.4, 1.16);
    const west = Bounds2.rect(-11.08, -10.7, 1.16, 21.4);
    const east = Bounds2.rect(9.92, -10.7, 1.16, 21.4);
    return [south, north, west, east].some((bounds) => Bounds2.containsPoint(bounds, point));
  }

  function hud(lap: number, checkpoint: number, speed: number): string {
    const progress = Math.min(checkpoint, CHECKPOINTS.length);
    return TextEx.joinNonEmpty([`Lap ${lap + 1}`, `CP ${progress}/${CHECKPOINTS.length}`, `${Math.round(Math.abs(speed) * 18)} km/h`], "  ");
  }
}
