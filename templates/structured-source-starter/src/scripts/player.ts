import { Vec3 } from "@threenative/script-stdlib";

type ScriptContext = any;

export function movePlayerToGoal(context: ScriptContext): void {
  for (const entity of context.query()) {
    const transform = entity.transform();
    const position = transform.position;
    const direction = context.input.getAxis("MoveX");
    const delta = context.time.fixedDelta;
    transform.position = Vec3.add(position, [direction * delta * 2.4, 0, 0]);
  }
}
