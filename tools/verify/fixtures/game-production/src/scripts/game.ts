export function update(ctx: any): void {
  const dt = ctx.time.fixedDelta({ fallback: 1 / 60, min: 0.001, max: 0.04 });
  const moveProgress = Math.min(1, dt * 6);
  void moveProgress;
}
