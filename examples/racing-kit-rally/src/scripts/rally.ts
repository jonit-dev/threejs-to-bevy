import { CheckpointRace, Track2D } from "@threenative/racing-kit";
import { CameraMath, NumberEx, Quat, Vec3 } from "@threenative/script-stdlib";

type Vec3Tuple = readonly [number, number, number];
export function awakeRally(ctx: any): void {
  const rivalStartPhase = 0.18;
  const state = ctx.state("RallyState", {
    checkpoint: 0,
    hud: "Lap 0 | Ready | 0 km/h",
    lap: 0,
    message: "Ready",
    rivalPhase: rivalStartPhase,
    speed: 0,
  });
  state.message = "Ready";
  state.hud = CheckpointRace.hud(state);
}

export function fixedUpdateRally(ctx: any): void {
  const start: Vec3Tuple = [-0.65, 0.08, 10.5];
  const startYaw = Math.PI / 2;
  const checkpoints: Vec3Tuple[] = [
    [10.5, 0.08, 10.5],
    [10.5, 0.08, -10.5],
    [-10.5, 0.08, -10.5],
    [-10.5, 0.08, 10.5],
  ];
  const trackPoints: Vec3Tuple[] = [
    [0, 0.08, 10.5],
    [10.5, 0.08, 10.5],
    [10.5, 0.08, -10.5],
    [-10.5, 0.08, -10.5],
    [-10.5, 0.08, 10.5],
  ];
  const track = Track2D.loop({ points: trackPoints, width: 4.25 });
  const rivalStartPhase = 0.18;
  const dt = ctx.time.fixedDelta({ fallback: 0.016, min: 0.001, max: 0.04 });
  const { player, rival } = ctx.entities.byId({
    player: "player.car",
    rival: "rival.car",
  });
  if (player === undefined || rival === undefined) {
    return;
  }

  const state = ctx.state("RallyState", {
    checkpoint: 0,
    hud: "Lap 0 | Ready | 0 km/h",
    lap: 0,
    message: "Ready",
    rivalPhase: rivalStartPhase,
    speed: 0,
  });
  const transform = player.transform();
  const position = transform.positionOr(start);
  const steer = ctx.input.axis1("steer", { negative: "steer-left", positive: "steer-right" });
  const throttle = ctx.input.action("throttle") ? 1 : 0;
  const brake = ctx.input.action("brake") ? 1 : 0;
  const onTrack = track.contains2d(position);
  const targetSpeed = onTrack ? 10.5 : 4.25;
  const drag = onTrack ? 1.4 : 7.5;
  const previousSpeed = NumberEx.finite(state.speed, 0);
  const speed = NumberEx.clamp(previousSpeed + (throttle * 9.5 - brake * 16 - drag) * dt, 0, targetSpeed);
  const yaw = transform.yawOr(startYaw) + steer * (1.15 + speed * 0.1) * dt;
  const forward = Vec3.rotateYaw([0, 0, 1], yaw);
  const next = Vec3.round(Vec3.add(position, Vec3.scale(forward, speed * dt)), 4);
  const race = CheckpointRace.advance(state, next, checkpoints, { radius: 2.1 });

  transform.setPose(next, Quat.fromYaw(yaw));
  state.speed = NumberEx.round(speed, 4);
  state.checkpoint = race.checkpoint;
  state.lap = race.lap;
  state.message = track.contains2d(next) ? race.message : "Return to track";
  state.hud = CheckpointRace.hud({ ...state, speed: speed * 18 });

  const rivalPhase = (NumberEx.finite(state.rivalPhase, rivalStartPhase) + dt * 0.065) % 1;
  const rivalPosition = track.pointAtPhase(rivalPhase);
  const rivalLook = track.pointAtPhase(rivalPhase + 0.012);
  const rivalYaw = Math.atan2(rivalLook[0] - rivalPosition[0], rivalLook[2] - rivalPosition[2]);
  rival.transform().setPose(Vec3.round(rivalPosition, 4), Quat.fromYaw(rivalYaw));
  state.rivalPhase = NumberEx.round(rivalPhase, 5);
}

export function lateUpdateRally(ctx: any): void {
  const start: Vec3Tuple = [-0.65, 0.08, 10.5];
  const startYaw = Math.PI / 2;
  const { player, camera } = ctx.entities.byId({
    camera: "camera.main",
    player: "player.car",
  });
  if (player === undefined || camera === undefined) {
    return;
  }
  const transform = player.transform();
  const playerPosition = transform.positionOr(start);
  const yaw = transform.yawOr(startYaw);
  const pose = CameraMath.followPose({
    offset: [0, 3.1, -6.2],
    target: Vec3.add(playerPosition, [0, 0.85, 0]),
    yaw,
  });
  camera.transform().setPose(Vec3.round(pose.position, 3), Quat.normalize(pose.rotation));
}
