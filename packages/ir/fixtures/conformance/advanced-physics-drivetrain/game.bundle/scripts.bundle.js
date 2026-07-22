const system_advancedPhysicsDrivetrainPlaytest = (ctx) => {
  const throttle = ctx.input.action("throttle") ? 1 : 0;
  ctx.physics.vehicle.setInputs("chassis", {
    brake: 0,
    clutch: 0,
    gear: 1,
    handbrake: 0,
    steer: 0,
    throttle,
  });
};

export const systemIds = Object.freeze({
  system_advancedPhysicsDrivetrainPlaytest: "advancedPhysicsDrivetrainPlaytest",
});

export const systems = Object.freeze({
  system_advancedPhysicsDrivetrainPlaytest,
});
