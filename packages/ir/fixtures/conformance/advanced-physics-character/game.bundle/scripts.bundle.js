const system_physicsQueryProbe = (ctx) => {
  ctx.physics.overlap({
    mask: ["item"],
    position: [2, 0.5, 0],
    shape: { kind: "sphere", radius: 0.25 },
  });
  ctx.physics.shapeCast({
    direction: [1, 0, 0],
    mask: ["world"],
    maxDistance: 5,
    origin: [0, 1, 0],
    shape: { halfExtents: [0.25, 0.25, 0.25], kind: "box" },
  });
};

export const systemIds = Object.freeze({
  system_physicsQueryProbe: "physicsQueryProbe",
});

export const systems = Object.freeze({
  system_physicsQueryProbe,
});
