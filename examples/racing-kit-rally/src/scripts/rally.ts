import { CheckpointRace, Track2D } from "@threenative/racing-kit";
import { NumberEx, Quat, Vec3 } from "@threenative/script-stdlib";

export function awakeRally(ctx: any): void {
  const state = ctx.state("RallyState", {
    checkpoint: 0,
    hud: "Lap 0 | Ready | 0 km/h",
    lap: 0,
    message: "Ready",
    rivalPhase: 0.1,
    speed: 0,
  });
  state.message = "Ready";
  state.hud = CheckpointRace.hud(state);
}

export function fixedUpdateRally(ctx: any): void {
  const checkpoints = [
    [-2.5, 0.08, -7],
    [-7.2, 0.08, 0],
    [-2.5, 0.08, 7],
    [7.2, 0.08, 0],
  ];
  const start = [-2.5, 0.08, -7];
  const startYaw = 0;
  const trackPoints = [
    [0, 0.08, -7.2],
    [-7.2, 0.08, 0],
    [0, 0.08, 7.2],
    [7.2, 0.08, 0],
  ];
  const rivalStartPhase = 0.1;
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
  const track = Track2D.loop({ points: trackPoints, width: 5 });
  const transform = player.transform();
  const position = transform.positionOr(start);
  const steer = ctx.input.axis1("steer", { negative: "steer-left", positive: "steer-right" });
  const throttle = ctx.input.action("throttle") ? 1 : 0;
  const brake = ctx.input.action("brake") ? 1 : 0;
  const targetSpeed = track.contains2d(position) ? 8.5 : 4.5;
  const speed = NumberEx.clamp(NumberEx.finite(state.speed, 0) + (throttle * 7 - brake * 10 - 1.8) * dt, 0, targetSpeed);
  const yaw = transform.yawOr(startYaw) + steer * (0.9 + speed * 0.08) * dt;
  const forward = [Math.sin(yaw), 0, Math.cos(yaw)];
  const next = Vec3.round(Vec3.add(position, Vec3.scale(forward, speed * dt)), 4);
  const race = CheckpointRace.advance(state, next, checkpoints, { radius: 1.35 });

  transform.setPose(next, Quat.fromYaw(yaw));
  state.speed = NumberEx.round(speed * 18, 1);
  state.checkpoint = race.checkpoint;
  state.lap = race.lap;
  state.message = track.contains2d(next) ? race.message : "Return to track";
  state.hud = CheckpointRace.hud(state);

  const rivalPhase = (NumberEx.finite(state.rivalPhase, rivalStartPhase) + dt * 0.055) % 1;
  const rivalPosition = track.pointAtPhase(rivalPhase);
  const rivalLook = track.pointAtPhase(rivalPhase + 0.012);
  const rivalYaw = Math.atan2(rivalLook[0] - rivalPosition[0], rivalLook[2] - rivalPosition[2]);
  rival.transform().setPose(Vec3.round(rivalPosition, 4), Quat.fromYaw(rivalYaw));
  state.rivalPhase = NumberEx.round(rivalPhase, 5);
}

export function lateUpdateRally(ctx: any): void {
  const start = [-2.5, 0.08, -7];
  const { player, camera } = ctx.entities.byId({
    camera: "camera.main",
    player: "player.car",
  });
  if (player === undefined || camera === undefined) {
    return;
  }
  const playerPosition = player.transform().positionOr(start);
  camera.transform().setPosition(Vec3.round(Vec3.add(playerPosition, [0, 11, 16]), 3));
}
