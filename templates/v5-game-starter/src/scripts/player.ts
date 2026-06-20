type ScriptContext = any;

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.get("PrefabTransform");
    const position = transform.position ?? [0, 0.35, 0];
    const speed = 2.4;
    entity.patch("PrefabTransform", {
      position: [
        Number((position[0] + context.input.axis("MoveX") * speed * context.time.dt).toFixed(6)),
        position[1],
        Number((position[2] + context.input.axis("MoveZ") * speed * context.time.dt).toFixed(6)),
      ],
    });
  }
}
