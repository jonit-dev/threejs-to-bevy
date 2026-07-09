import { Vector3, type ScriptContext } from "@threenative/script-stdlib";

export function updateTopDownArchetype(context: ScriptContext): void {
  const player = context.entity("player") ?? context.query({ limit: 1 })[0];
  if (player === undefined) {
    return;
  }
  const transform = player.transform();
  const position = transform.position;
  const direction = context.input.getAxis("MoveX");
  const delta = context.time.fixedDelta;
  transform.position = Vector3.add(position, [direction * delta * 2.4, 0, 0]);
}
