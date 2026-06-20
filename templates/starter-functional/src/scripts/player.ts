export function seedV7DamageEvent(context) {
  context.events.emit("DamageEvent", { amount: 1, target: "player" });
}

export function v7ProofLoop(context) {
  const attacking = context.input.action("Attack");
  context.animation.play("player", attacking ? "dash" : "idle", { loop: !attacking });
  if (attacking) {
    context.events.emit("DamageEvent", { amount: 1, target: "player" });
  }
}
