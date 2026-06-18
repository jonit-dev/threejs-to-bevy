const system_animationProbe = (ctx) => {
  ctx.animation.play("hero", "run", { loop: true, speed: 1.25 });
};

export const systemIds = Object.freeze({
  system_animationProbe: "animationProbe",
});

export const systems = Object.freeze({
  system_animationProbe,
});
