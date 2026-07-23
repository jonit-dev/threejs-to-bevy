import type { ScriptContext } from "@threenative/script-stdlib";

export function updateDestructionRange(context: ScriptContext): void {
  const { fast, projectile } = context.entities.byId({
    fast: "projectile.fast",
    projectile: "projectile",
  });
  if (fast === undefined || projectile === undefined) return;

  const current = context.resources.get("DestructionState", {
    impact: false,
    phase: "armed",
    regionalBreak: false,
    retryCount: 0,
    settled: false,
  });
  if (context.input.getButton("retry")) {
    context.resources.set("DestructionState", {
      impact: false,
      phase: "retry-requested",
      regionalBreak: false,
      retryCount: Number(current.retryCount ?? 0) + 1,
      settled: false,
    });
    return;
  }

  const projectileTransform = projectile.get("Transform", { position: [-1, 3, 3] });
  const fastTransform = fast.get("Transform", { position: [1, 3, 20] });
  const impact = Boolean(current.impact) || projectileTransform.position[2] <= 0.5;
  const regionalBreak = Boolean(current.regionalBreak) || fastTransform.position[2] <= 0.5;
  const settled = Boolean(current.settled) || (regionalBreak && (context.time.elapsed ?? 0) >= 1.5);
  context.resources.patch("DestructionState", {
    impact,
    phase: settled ? "settled" : regionalBreak ? "regional-break" : impact ? "damage-only" : "armed",
    regionalBreak,
    settled,
  });
}
