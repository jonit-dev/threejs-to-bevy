const system_bootLifecycle = (ctx) => {
  const lifecycle = ctx.resources.get("Lifecycle");
  const score = ctx.resources.get("Score");
  const next = { phase: "booted", ticks: lifecycle.ticks + 1 };
  ctx.resources.set("Lifecycle", next);
  ctx.events.emit("LifecycleEvent", { phase: next.phase, score: score.value });
};

const system_fixedAccumulator = (ctx) => {
  const lifecycle = ctx.resources.get("Lifecycle");
  const score = ctx.resources.get("Score");
  const handoffCount = ctx.events.read("LifecycleEvent").length;
  const nextScore = { value: score.value + handoffCount + 1 };
  const next = { phase: "fixed", ticks: lifecycle.ticks + 1 };
  ctx.resources.set("Score", nextScore);
  ctx.resources.set("Lifecycle", next);
  ctx.animation.play("player", "pulse", { phase: next.phase });
  ctx.events.emit("LifecycleEvent", { phase: next.phase, score: nextScore.value });
};

const system_updateDamage = (ctx) => {
  const lifecycle = ctx.resources.get("Lifecycle");
  const score = ctx.resources.get("Score");
  const damage = ctx.events.read("DamageEvent")[0] || { amount: 0 };
  const nextScore = { value: score.value + damage.amount };
  const next = { phase: "updated", ticks: lifecycle.ticks + 1 };
  ctx.resources.set("Score", nextScore);
  ctx.resources.set("Lifecycle", next);
  ctx.commands.spawn("damage.marker", { Health: { current: nextScore.value } });
  ctx.events.emit("LifecycleEvent", { phase: next.phase, score: nextScore.value });
};

const system_postLifecycle = (ctx) => {
  const lifecycle = ctx.resources.get("Lifecycle");
  const score = ctx.resources.get("Score");
  const next = { phase: `post:${ctx.events.read("LifecycleEvent").length}`, ticks: lifecycle.ticks + 1 };
  ctx.resources.set("Lifecycle", next);
  ctx.commands.despawn("damage.marker");
  ctx.events.emit("LifecycleEvent", { phase: next.phase, score: score.value });
};

export const systemIds = Object.freeze({
  system_bootLifecycle: "bootLifecycle",
  system_fixedAccumulator: "fixedAccumulator",
  system_postLifecycle: "postLifecycle",
  system_updateDamage: "updateDamage"
});

export const systems = Object.freeze({
  system_bootLifecycle,
  system_fixedAccumulator,
  system_postLifecycle,
  system_updateDamage
});
