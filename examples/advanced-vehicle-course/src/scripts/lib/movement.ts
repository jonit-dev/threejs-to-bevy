export function movementDelta(direction: number, fixedDelta: number): [number, number, number] {
  return [direction * fixedDelta * 2.4, 0, 0];
}
