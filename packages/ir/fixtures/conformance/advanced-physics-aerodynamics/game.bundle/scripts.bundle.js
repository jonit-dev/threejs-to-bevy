const system_advancedPhysicsAerodynamicsPlaytest = (ctx) => {
  ctx.physics.aerodynamics.setInputs("craft", {
    surfaces: { elevator: ctx.input.axis("Pitch") },
    thrusters: { "main-engine": ctx.input.action("Throttle") ? 1 : 0 },
  });
};

export const systemIds = Object.freeze({
  system_advancedPhysicsAerodynamicsPlaytest: "advancedPhysicsAerodynamicsPlaytest",
});

export const systems = Object.freeze({
  system_advancedPhysicsAerodynamicsPlaytest,
});
