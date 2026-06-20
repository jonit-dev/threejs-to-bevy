export interface IPlayerStep {
  reachedGoal: boolean;
  position: [number, number, number];
}

export function stepPlayer(
  position: readonly [number, number, number],
  input: { moveX: number; moveZ: number },
  dt: number,
): IPlayerStep {
  const speed = 2.4;
  const next: [number, number, number] = [
    Number((position[0] + input.moveX * speed * dt).toFixed(6)),
    position[1],
    Number((position[2] + input.moveZ * speed * dt).toFixed(6)),
  ];
  return {
    position: next,
    reachedGoal: Math.hypot(next[0] - 1.8, next[2] + 1.6) <= 0.55,
  };
}
