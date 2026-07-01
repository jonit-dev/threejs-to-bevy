import { Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    const position = transform.positionOr([0, 0.35, 0]);
    const direction = context.input.axis1("MoveX", { negative: "move-left", positive: "move-right" });
    const delta = context.time.fixedDelta({ fallback: 1 / 60, max: 1 / 30, min: 0.001 });
    transform.setPosition(Vec3.round(Vec3.add(position, [direction * delta * 2.4, 0, 0]), 6));
  }
}
