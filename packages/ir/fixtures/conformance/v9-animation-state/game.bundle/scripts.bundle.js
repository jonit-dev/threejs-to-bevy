const system_animationState = (ctx) => {
  const play = ctx.animation.play("player", "run", {
    activeState: "locomotion.run",
    durationSeconds: 2,
    loop: true,
    sourceClip: "Armature|Run",
    speed: 1.25
  });
  const query = ctx.animation.query("player", "run");
  const stop = ctx.animation.stop("player", "run");
  const postStopQuery = ctx.animation.query("player", "run");
  ctx.resources.set("AnimationReport", {
    play,
    postStopQuery,
    query,
    stop
  });
};

export const systemIds = Object.freeze({ system_animationState: "animationState" });
export const systems = Object.freeze({ system_animationState });
