import type { INormalizedRegion } from "./imageAnalysis.js";

export interface IColorParitySwatch {
  hex: string;
  id: string;
  region: INormalizedRegion;
}

// Keep the color-parity fixture scene aligned with these swatch colors and layout.
export const COLOR_PARITY_SWATCHES: readonly IColorParitySwatch[] = [
  { id: "red", hex: "#e6194b", region: { x: 0.18, y: 0.1, width: 0.05, height: 0.08 } },
  { id: "green", hex: "#3cb44b", region: { x: 0.43, y: 0.1, width: 0.05, height: 0.08 } },
  { id: "blue", hex: "#4363d8", region: { x: 0.68, y: 0.1, width: 0.05, height: 0.08 } },
  { id: "yellow", hex: "#ffe119", region: { x: 0.18, y: 0.37, width: 0.05, height: 0.08 } },
  { id: "cyan", hex: "#42d4f4", region: { x: 0.43, y: 0.37, width: 0.05, height: 0.08 } },
  { id: "magenta", hex: "#f032e6", region: { x: 0.68, y: 0.37, width: 0.05, height: 0.08 } },
  { id: "white", hex: "#ffffff", region: { x: 0.18, y: 0.64, width: 0.05, height: 0.08 } },
  { id: "gray", hex: "#808080", region: { x: 0.43, y: 0.64, width: 0.05, height: 0.08 } },
  { id: "orange", hex: "#f58231", region: { x: 0.68, y: 0.64, width: 0.05, height: 0.08 } },
];

export const COLOR_PARITY_THRESHOLDS = {
  averageBrightnessDelta: 0.02,
  averageColorDelta: 0.02,
  changedPixelRatio: 0.02,
  expectedColorDistance: 0.04,
  maxChannelDelta: 0.05,
  p95ChannelDelta: 0.03,
};
