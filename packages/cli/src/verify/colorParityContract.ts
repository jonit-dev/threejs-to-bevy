import { COLOR_PARITY_SWATCHES, COLOR_PARITY_THRESHOLDS } from "./colorParitySwatches.js";
import { LIGHTING_TONE_FRAME_THRESHOLDS, LIGHTING_TONE_THRESHOLDS } from "./lightingToneSamples.js";

export interface IColorParityContractDiagnostic {
  code: string;
  message: string;
}

/** Maximum allowed gate thresholds; tests fail if parity gates are loosened beyond these values. */
export const LOCKED_COLOR_PARITY_THRESHOLDS = {
  averageBrightnessDelta: 0.02,
  averageColorDelta: 0.02,
  changedPixelRatio: 0.02,
  expectedColorDistance: 0.04,
  maxChannelDelta: 0.05,
  p95ChannelDelta: 0.03,
} as const;

export const LOCKED_LIGHTING_TONE_FRAME_THRESHOLDS = {
  averageBrightnessDelta: 0.02,
  averageColorDelta: 0.02,
  changedPixelRatio: 0.12,
  maxChannelDelta: 0.15,
  p95ChannelDelta: 0.12,
} as const;

export const LOCKED_LIGHTING_TONE_SAMPLE_THRESHOLDS = {
  averageBrightnessDelta: 0.1,
  averageColorDelta: 0.15,
  changedPixelRatio: 0.15,
  maxChannelDelta: 0.15,
  p95ChannelDelta: 0.12,
} as const;

export function validateColorParityExampleSource(source: string): IColorParityContractDiagnostic[] {
  const diagnostics: IColorParityContractDiagnostic[] = [];
  if (!source.includes("emissiveIntensity: 1")) {
    diagnostics.push({
      code: "TN_COLOR_PARITY_EXAMPLE_EMISSIVE_INTENSITY",
      message: "v8-color-parity example must keep emissiveIntensity at 1 for unlit swatch display.",
    });
  }
  if (!source.includes("metalness: 0")) {
    diagnostics.push({
      code: "TN_COLOR_PARITY_EXAMPLE_METALNESS",
      message: "v8-color-parity example must keep metalness at 0 for unlit swatch display.",
    });
  }
  if (!source.includes("roughness: 1")) {
    diagnostics.push({
      code: "TN_COLOR_PARITY_EXAMPLE_ROUGHNESS",
      message: "v8-color-parity example must keep roughness at 1 for unlit swatch display.",
    });
  }
  for (const swatch of COLOR_PARITY_SWATCHES) {
    if (!source.includes(swatch.hex)) {
      diagnostics.push({
        code: "TN_COLOR_PARITY_EXAMPLE_SWATCH_COLOR_MISSING",
        message: `v8-color-parity example is missing authored swatch color '${swatch.hex}' for '${swatch.id}'.`,
      });
    }
  }
  if (!source.includes('id: "camera.color"')) {
    diagnostics.push({
      code: "TN_COLOR_PARITY_EXAMPLE_CAMERA_ID",
      message: 'v8-color-parity example must keep active camera id "camera.color" for screenshot capture.',
    });
  }
  return diagnostics;
}

export function validateColorParityThresholdsLocked(): IColorParityContractDiagnostic[] {
  return [
    ...thresholdLockDiagnostics("COLOR_PARITY", COLOR_PARITY_THRESHOLDS, LOCKED_COLOR_PARITY_THRESHOLDS),
    ...thresholdLockDiagnostics("LIGHTING_TONE_FRAME", LIGHTING_TONE_FRAME_THRESHOLDS, LOCKED_LIGHTING_TONE_FRAME_THRESHOLDS),
    ...thresholdLockDiagnostics("LIGHTING_TONE_SAMPLE", LIGHTING_TONE_THRESHOLDS, LOCKED_LIGHTING_TONE_SAMPLE_THRESHOLDS),
  ];
}

export function validateColorParitySwatchRegions(): IColorParityContractDiagnostic[] {
  const diagnostics: IColorParityContractDiagnostic[] = [];
  if (COLOR_PARITY_SWATCHES.length !== 9) {
    diagnostics.push({
      code: "TN_COLOR_PARITY_SWATCH_COUNT",
      message: `Expected 9 color parity swatches, found ${COLOR_PARITY_SWATCHES.length}.`,
    });
  }
  for (const swatch of COLOR_PARITY_SWATCHES) {
    if (!/^#[0-9a-f]{6}$/i.test(swatch.hex)) {
      diagnostics.push({
        code: "TN_COLOR_PARITY_SWATCH_HEX",
        message: `Swatch '${swatch.id}' must use a 6-digit hex color, got '${swatch.hex}'.`,
      });
    }
    const { height, width, x, y } = swatch.region;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      diagnostics.push({
        code: "TN_COLOR_PARITY_SWATCH_REGION",
        message: `Swatch '${swatch.id}' region must stay inside the normalized frame.`,
      });
    }
  }
  return diagnostics;
}

function thresholdLockDiagnostics(
  label: string,
  current: Record<string, number>,
  locked: Record<string, number>,
): IColorParityContractDiagnostic[] {
  const diagnostics: IColorParityContractDiagnostic[] = [];
  for (const [key, maximum] of Object.entries(locked)) {
    const value = current[key];
    if (value === undefined) {
      diagnostics.push({
        code: `TN_COLOR_PARITY_THRESHOLD_MISSING_${label}`,
        message: `${label} thresholds must define '${key}'.`,
      });
      continue;
    }
    if (value > maximum) {
      diagnostics.push({
        code: `TN_COLOR_PARITY_THRESHOLD_LOOSENED_${label}`,
        message: `${label} threshold '${key}' was loosened to ${value}; maximum allowed is ${maximum}.`,
      });
    }
  }
  return diagnostics;
}
