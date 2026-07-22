const system_advancedPhysicsFoundation = (ctx) => {
  ctx.physics.addForceAtPoint("compound.body", [10, 0, 0], [0, 3, 0]);
  ctx.physics.applyImpulseAtPoint("compound.body", [1, 0, 0], [0, 3, 0]);
};

const system_advancedPhysicsQuery = (ctx) => {
  const query = ctx.physics.raycast({
    direction: [0, 0, -1],
    maxDistance: 8,
    origin: [-0.75, 2, 4],
  });
  ctx.resources.set("AdvancedPhysicsReport", { query });
};

export const systemIds = Object.freeze({
  system_advancedPhysicsFoundation: "advancedPhysicsFoundation",
  system_advancedPhysicsQuery: "advancedPhysicsQuery",
});

export const systems = Object.freeze({
  system_advancedPhysicsFoundation,
  system_advancedPhysicsQuery,
});
