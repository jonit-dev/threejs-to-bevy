type ScriptContext = any;

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.get("Transform");
    const position = transform.position ?? [0, 0.35, 0];
    const direction = context.input.action("move-right") ? 1 : context.input.action("move-left") ? -1 : 0;
    entity.patch("Transform", {
      position: [
        Number((position[0] + direction * context.time.dt * 2.4).toFixed(6)),
        position[1],
        position[2],
      ],
    });
  }
}
