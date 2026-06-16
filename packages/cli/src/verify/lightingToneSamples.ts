import type { INormalizedRegion } from "./imageAnalysis.js";

export interface ILightingToneSample {
  id: string;
  region: INormalizedRegion;
}

// Keep `examples/v8-lighting-tone/src/game.ts` sphere layout aligned with these regions.
export const LIGHTING_TONE_SAMPLES: readonly ILightingToneSample[] = [
  { id: "gray", region: { x: 0.297, y: 0.488, width: 0.06, height: 0.08 } },
  { id: "orange", region: { x: 0.47, y: 0.488, width: 0.06, height: 0.08 } },
  { id: "blue", region: { x: 0.643, y: 0.488, width: 0.06, height: 0.08 } },
];

export const LIGHTING_TONE_THRESHOLDS = {
  averageBrightnessDelta: 0.1,
  averageColorDelta: 0.15,
  changedPixelRatio: 0.15,
  maxChannelDelta: 0.15,
  p95ChannelDelta: 0.12,
};

export const LIGHTING_TONE_FRAME_THRESHOLDS = {
  averageBrightnessDelta: 0.02,
  averageColorDelta: 0.02,
  changedPixelRatio: 0.12,
  maxChannelDelta: 0.15,
  p95ChannelDelta: 0.12,
};
