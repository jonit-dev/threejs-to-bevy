export function advancedPhysicsFoundation(ctx: {
  physics: {
    addForceAtPoint(entity: string, force: [number, number, number], point: [number, number, number]): boolean;
    applyImpulseAtPoint(entity: string, impulse: [number, number, number], point: [number, number, number]): boolean;
  };
}): void {
  ctx.physics.addForceAtPoint("compound.body", [10, 0, 0], [0, 3, 0]);
  ctx.physics.applyImpulseAtPoint("compound.body", [1, 0, 0], [0, 3, 0]);
}

export function advancedPhysicsQuery(ctx: {
  physics: { raycast(request: { direction: [number, number, number]; maxDistance: number; origin: [number, number, number] }): unknown };
  resources: { set(id: string, value: unknown): void };
}): void {
  const query = ctx.physics.raycast({
    direction: [0, 0, -1],
    maxDistance: 8,
    origin: [-0.75, 2, 4],
  });
  ctx.resources.set("AdvancedPhysicsReport", { query });
}
