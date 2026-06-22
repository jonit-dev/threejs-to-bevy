export interface IKartStep {
  heading: number;
  position: [number, number, number];
  speed: number;
}

export function stepKart(
  position: readonly [number, number, number],
  state: { heading: number; speed: number },
  input: { accelerate: boolean; steer: number },
  dt: number,
): IKartStep {
  const acceleration = input.accelerate ? 8 : -4;
  const speed = clamp(state.speed + acceleration * dt, 0, 16);
  const heading = state.heading + input.steer * dt * 1.8;
  const next: [number, number, number] = [
    Number((position[0] + Math.sin(heading) * speed * dt).toFixed(6)),
    position[1],
    Number((position[2] - Math.cos(heading) * speed * dt).toFixed(6)),
  ];
  return {
    heading: Number(heading.toFixed(6)),
    position: next,
    speed: Number(speed.toFixed(6)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
