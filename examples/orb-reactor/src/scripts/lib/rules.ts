export const TOTAL_ORBS = 8;
export const ARENA_BOUND = 2.2;
export const PLAYER_SPEED = 2.6;
export const ORB_COLLECT_RADIUS = 0.6;
export const DRONE_HIT_RADIUS = 0.55;
export const HIT_COOLDOWN_SECONDS = 1.2;
export const START_LIVES = 3;

export const ORB_IDS = ["orb.01", "orb.02", "orb.03", "orb.04", "orb.05", "orb.06", "orb.07", "orb.08"] as const;
export const DRONE_IDS = ["drone.01", "drone.02"] as const;

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const planarDistance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(a[0] - b[0], a[2] - b[2]);

export const hudOrbs = (collected: number): string => `Orbs ${collected}/${TOTAL_ORBS}`;
export const hudLives = (count: number): string => `Lives ${count}`;
export const hudTime = (remaining: number): string => `Time ${Math.max(0, Math.ceil(remaining))}`;
