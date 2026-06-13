export interface IHealthState {
  current: number;
  max: number;
}

export function reduceHealth(health: IHealthState, amount: number): { dead: boolean; health: IHealthState } {
  const current = Math.max(0, health.current - amount);
  return { dead: current === 0, health: { ...health, current } };
}
