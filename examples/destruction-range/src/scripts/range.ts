import type { ScriptContext } from "@threenative/script-stdlib";

export function updateDestructionRange(context: ScriptContext): void {
  const { fast, projectile } = context.entities.byId({
    fast: "projectile.fast",
    projectile: "projectile",
  });
  if (fast === undefined || projectile === undefined) return;

  const current = context.resources.get("DestructionState", {
    activePieceBudget: 4,
    events: [] as string[],
    impact: false,
    objectiveStep: 0,
    phase: "armed",
    regionalBreak: false,
    retryCount: 0,
    settled: false,
  });
  if (context.input.getButton("retry")) {
    context.resources.set("DestructionState", {
      activePieceBudget: 4,
      events: ["retry"],
      impact: false,
      objectiveStep: 0,
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
  const milestones = [
    { event: "impact", phase: "damage-only", reached: impact, step: 1 },
    { event: "regional-break", phase: "regional-break", reached: regionalBreak, step: 2 },
    { event: "settled", phase: "settled", reached: settled, step: 3 },
  ] as const;
  const events = Array.isArray(current.events)
    ? current.events.filter((entry): entry is string => typeof entry === "string")
    : [];
  let objectiveStep = 0;
  let phase = "armed";
  for (const milestone of milestones) {
    if (!milestone.reached) continue;
    objectiveStep = milestone.step;
    phase = milestone.phase;
    if (!events.includes(milestone.event)) events.push(milestone.event);
  }
  context.resources.patch("DestructionState", {
    activePieceBudget: 4,
    events,
    impact,
    objectiveStep,
    phase,
    regionalBreak,
    settled,
  });
}
