import type { IPlaytestReport, IPlaytestRunOptions } from "./playtest.js";
import type { PlaytestTarget } from "./playtestScenario.js";

export interface IPlaytestNativeTrace {
  animationStates: unknown[];
  artifactPaths: Record<string, string>;
  contacts: unknown[];
  hud: Record<string, unknown>;
  projectedBounds: Record<string, unknown>;
  resources: Record<string, unknown>;
  runtimeDiagnostics: unknown[];
  transforms: Record<string, unknown>;
}

export interface IPlaytestTargetRunner {
  run(options: IPlaytestRunOptions): Promise<IPlaytestReport>;
  target: PlaytestTarget;
}

export function createPlaytestTargetRunner(
  target: PlaytestTarget,
  webRunner: (options: IPlaytestRunOptions) => Promise<IPlaytestReport>,
): IPlaytestTargetRunner | undefined {
  if (target === "web") {
    return { run: webRunner, target };
  }
  return undefined;
}
