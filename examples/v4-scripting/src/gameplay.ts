export interface ILifetimeStep {
  expired: boolean;
  remaining: number;
}

export function reduceLifetime(remaining: number, delta: number): ILifetimeStep {
  const next = Number((remaining - delta).toFixed(6));
  return {
    expired: next <= 0,
    remaining: Math.max(0, next),
  };
}
