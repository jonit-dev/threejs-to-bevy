const observerRoute = (ctx) => ctx.observers.propagate("LifecycleEvent", "player.weapon").map((step) => `${step.phase}:${step.entity}`).join(">");
const componentHooks = (ctx) => ctx.components.hooks("Health").map((entry) => `${entry.hook}:${entry.entity}`).join(">");
const componentType = (ctx) => {
  const type = ctx.components.type("Health");
  return type === null ? "missing" : `${type.id}:${type.fields.map((field) => `${field.name}:${field.kind}:${field.required}`).join("|")}`;
};
const taskChannel = (ctx) => `${ctx.tasks.has("lifecycleHandoff")}:${ctx.tasks.channel("lifecycleHandoff")}:${ctx.tasks.list().length}`;
const pluginSummary = (ctx) => {
  const group = ctx.plugins.group("gameplay");
  const plugin = ctx.plugins.list()[0];
  return `${ctx.plugins.has("lifecycleCore")}:${group ? group.plugins.length : 0}:${plugin ? plugin.systems.length : 0}`;
};

const system_bootLifecycle = (ctx) => {
  const lifecycle = ctx.resources.get("Lifecycle");
  const score = ctx.resources.get("Score");
  const next = { combat: "safe", phase: "booted", ticks: lifecycle.ticks + 1 };
  ctx.resources.set("Lifecycle", next);
  ctx.channels.send("lifecycle", { componentHooks: componentHooks(ctx), componentType: componentType(ctx), game: ctx.states.get("Game"), observerRoute: observerRoute(ctx), phase: next.phase, pluginSummary: pluginSummary(ctx), score: score.value, scoreBand: ctx.states.get("ScoreBand"), taskChannel: taskChannel(ctx) });
};

const system_fixedAccumulator = (ctx) => {
  const lifecycle = ctx.resources.get("Lifecycle");
  const score = ctx.resources.get("Score");
  const handoffCount = ctx.channels.read("lifecycle").length;
  const nextScore = { band: "high", value: score.value + handoffCount + 1 };
  const next = { combat: "safe", phase: "fixed", ticks: lifecycle.ticks + 1 };
  ctx.resources.set("Score", nextScore);
  ctx.resources.set("Lifecycle", next);
  ctx.animation.play("player", "pulse", { phase: next.phase });
  ctx.channels.send("lifecycle", { componentHooks: componentHooks(ctx), componentType: componentType(ctx), game: ctx.states.get("Game"), observerRoute: observerRoute(ctx), phase: next.phase, pluginSummary: pluginSummary(ctx), score: nextScore.value, scoreBand: ctx.states.get("ScoreBand"), taskChannel: taskChannel(ctx) });
};

const system_updateDamage = (ctx) => {
  const lifecycle = ctx.resources.get("Lifecycle");
  const score = ctx.resources.get("Score");
  const damage = ctx.events.read("DamageEvent")[0] || { amount: 0 };
  const nextScore = { band: "high", value: score.value + damage.amount };
  const next = { combat: "engaged", phase: "updated", ticks: lifecycle.ticks + 1 };
  ctx.resources.set("Score", nextScore);
  ctx.resources.set("Lifecycle", next);
  ctx.commands.spawn("damage.marker", { Health: { current: nextScore.value } });
  ctx.channels.send("lifecycle", { combat: ctx.states.get("Combat"), componentHooks: componentHooks(ctx), componentType: componentType(ctx), game: ctx.states.get("Game"), observerRoute: observerRoute(ctx), phase: next.phase, pluginSummary: pluginSummary(ctx), score: nextScore.value, scoreBand: ctx.states.get("ScoreBand"), taskChannel: taskChannel(ctx) });
};

const system_postLifecycle = (ctx) => {
  const lifecycle = ctx.resources.get("Lifecycle");
  const score = ctx.resources.get("Score");
  const next = { combat: "safe", phase: `post:${ctx.channels.read("lifecycle").length}`, ticks: lifecycle.ticks + 1 };
  ctx.resources.set("Lifecycle", next);
  ctx.commands.despawn("damage.marker");
  ctx.channels.send("lifecycle", { combat: ctx.states.get("Combat"), componentHooks: componentHooks(ctx), componentType: componentType(ctx), game: ctx.states.get("Game"), observerRoute: observerRoute(ctx), phase: next.phase, pluginSummary: pluginSummary(ctx), score: score.value, scoreBand: ctx.states.get("ScoreBand"), taskChannel: taskChannel(ctx) });
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
