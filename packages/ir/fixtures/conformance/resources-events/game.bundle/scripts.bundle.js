const system_bootScore = (ctx) => {
  const score = ctx.resources.get("Score");
  ctx.resources.set("Score", { value: score.value + 1 });
};

const system_resourceEventProbe = (ctx) => {
  const score = ctx.resources.get("Score");
  const damage = ctx.events.read("DamageEvent")[0] || { amount: 0 };
  ctx.resources.set("Score", { value: score.value + damage.amount });
  ctx.events.emit("DamageEvent", { amount: score.value, target: "echo" });
};

export const systemIds = Object.freeze({
  system_bootScore: "bootScore",
  system_resourceEventProbe: "resourceEventProbe",
});

export const systems = Object.freeze({
  system_bootScore,
  system_resourceEventProbe,
});
