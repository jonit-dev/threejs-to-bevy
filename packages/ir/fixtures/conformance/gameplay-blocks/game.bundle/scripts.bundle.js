const BasisEx = Object.freeze({
  controlSignal(input) {
    const x = Number.isFinite(input.x) ? input.x : 0;
    const y = Number.isFinite(input.y) ? input.y : 0;
    const length = Math.hypot(x, y) || 1;
    const world = [x / length, 0, y / length];
    return { world, yaw: Math.atan2(world[0], world[2]) };
  },
});

const ControllerEx = Object.freeze({
  worldCardinalCharacter(input) {
    const signal = BasisEx.controlSignal({ x: input.x, y: input.y });
    return { position: [signal.world[0] * input.speed * input.dt, 0, signal.world[2] * input.speed * input.dt] };
  },
});

const CheckpointRaceEx = Object.freeze({
  init() {
    return { checkpoint: 0, lap: 0, status: "ready", timeSeconds: 0 };
  },
  start(state) {
    return { ...state, status: "racing" };
  },
  passCheckpoint(state) {
    return { checkpoint: 0, lap: 1, status: "finished", timeSeconds: 1, events: ["checkpoint", "lap", "player-finish", "race-finish"] };
  },
});

const SpawnEx = Object.freeze({
  sample() {
    return [0.25, 0.75];
  },
});

const CameraMath = Object.freeze({
  followPose(input) {
    return { position: [input.target[0], input.target[1] + 4, input.target[2] - 8] };
  },
});

const system_gameplayBlockProbe = (ctx) => {
  const controller = ControllerEx.worldCardinalCharacter({ dt: 0.5, speed: 4, x: 0, y: 1 });
  const race = CheckpointRaceEx.passCheckpoint(CheckpointRaceEx.start(CheckpointRaceEx.init()));
  const camera = CameraMath.followPose({ target: controller.position });
  ctx.resources.set("GameplayBlockProbe", {
    basisYaw: BasisEx.controlSignal({ x: 1, y: 1 }).yaw,
    camera: camera.position,
    checkpointEvents: race.events.join(","),
    movement: controller.position,
    spawn: SpawnEx.sample(),
  });
};

export const systemIds = Object.freeze({
  system_gameplayBlockProbe: "gameplayBlockProbe",
});

export const systems = Object.freeze({
  system_gameplayBlockProbe,
});
