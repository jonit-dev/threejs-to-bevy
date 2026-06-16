const system_animationControls = (ctx) => {
  const query = ctx.animation.query("player", "run");
  const stop = ctx.animation.stop("player");
  ctx.resources.set("AnimationReport", {
    active: query.active,
    clip: query.clip,
    entity: query.entity,
    stopped: stop.stopped
  });
};

export const systemIds = Object.freeze({ system_animationControls: "animationControls" });
export const systems = Object.freeze({ system_animationControls });
