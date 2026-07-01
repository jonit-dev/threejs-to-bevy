const system_animationState = (ctx) => {
  for (const entity of ctx.query({ with: ["Transform"], without: ["Camera", "Light"] })) {
    if (entity.id !== "player") {
      continue;
    }
    const transform = entity.get("Transform");
    const x = Math.sin(ctx.time.elapsed * 4) * 0.8;
    entity.patch("Transform", { ...transform, position: [x, 0, 0] });
  }
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
