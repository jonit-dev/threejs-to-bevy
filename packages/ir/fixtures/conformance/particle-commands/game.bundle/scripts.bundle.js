const system_particleCommands = (ctx) => {
  const play = ctx.particles.play("model.hero", "dust", { seed: 7 });
  const emit = ctx.particles.emit("model.hero", "dust", { count: 99, seed: "impact" });
  const stop = ctx.particles.stop("model.hero", "dust");
  const clear = ctx.particles.clear("model.hero", "dust");
  ctx.resources.set("ParticleReport", { clear, emit, play, stop });
};

export const systemIds = Object.freeze({ system_particleCommands: "particleCommands" });
export const systems = Object.freeze({ system_particleCommands });
