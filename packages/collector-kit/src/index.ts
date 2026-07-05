export interface ICollectorState {
  collected: readonly string[];
  lives: number;
  score: number;
  status: "failed" | "playing" | "won";
}

export interface ICollectorPickup {
  id: string;
  kind: "hazard" | "reward";
  points?: number;
}

export const CollectorKit = Object.freeze({
  initial(options: { lives?: number; score?: number } = {}): ICollectorState {
    return Object.freeze({
      collected: [],
      lives: Math.max(0, Math.trunc(finite(options.lives, 3))),
      score: Math.trunc(finite(options.score, 0)),
      status: "playing",
    });
  },
  collect(state: ICollectorState, pickup: ICollectorPickup, options: { requiredRewards?: number } = {}): ICollectorState {
    if (state.status !== "playing") {
      return cloneState(state);
    }
    if (pickup.kind === "hazard") {
      const lives = Math.max(0, Math.trunc(finite(state.lives, 0)) - 1);
      return Object.freeze({
        collected: [...state.collected],
        lives,
        score: Math.trunc(finite(state.score, 0)),
        status: lives <= 0 ? "failed" : "playing",
      });
    }
    const alreadyCollected = state.collected.includes(pickup.id);
    const collected = alreadyCollected ? [...state.collected] : [...state.collected, pickup.id];
    const requiredRewards = Math.max(0, Math.trunc(finite(options.requiredRewards, collected.length)));
    return Object.freeze({
      collected,
      lives: Math.max(0, Math.trunc(finite(state.lives, 0))),
      score: Math.trunc(finite(state.score, 0)) + (alreadyCollected ? 0 : Math.trunc(finite(pickup.points, 1))),
      status: requiredRewards > 0 && collected.length >= requiredRewards ? "won" : "playing",
    });
  },
  hud(state: ICollectorState): string {
    return `Score ${Math.trunc(finite(state.score, 0))} | Lives ${Math.max(0, Math.trunc(finite(state.lives, 0)))}`;
  },
});

function cloneState(state: ICollectorState): ICollectorState {
  return Object.freeze({
    collected: [...state.collected],
    lives: Math.max(0, Math.trunc(finite(state.lives, 0))),
    score: Math.trunc(finite(state.score, 0)),
    status: state.status,
  });
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
