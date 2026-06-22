type ScriptContext = any;

export function drivePlayerKart(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.get("Transform");
    const position = transform.position ?? [0, 0.34, 4.4];
    const moveX = context.input.axis("MoveX");
    const moveZ = context.input.axis("MoveZ");
    const speed = 5.4;
    const steer = moveX * 0.65;
    entity.patch("Transform", {
      position: [
        Number((position[0] + moveX * speed * context.time.dt).toFixed(6)),
        position[1],
        Number((position[2] + moveZ * speed * context.time.dt).toFixed(6)),
      ],
      rotation: [0, Number(steer.toFixed(6)), 0, 1],
    });
  }
}
