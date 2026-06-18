const system_animationState = (ctx) => {
  const idle = ctx.animation.play("player", "idle", {
    activeState: "locomotion.idle",
    durationSeconds: 2,
    loop: true,
    sourceClip: "Armature|Idle",
    speed: 1
  });
  const blend = ctx.animation.play("player", "run", {
    activeState: "locomotion.run",
    blendElapsedSeconds: 0.2,
    blendSeconds: 0.4,
    durationSeconds: 1,
    loop: true,
    sourceClip: "Armature|Run",
    speed: 1.25
  });
  const query = ctx.animation.query("player", "run");
  ctx.resources.set("AnimationReport", {
    blend,
    idle,
    query
  });
};

export const systemIds = Object.freeze({ system_animationState: "animationState" });
export const systems = Object.freeze({ system_animationState });
