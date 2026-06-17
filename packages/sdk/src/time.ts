import { SdkError, assertPositiveNumber } from "./errors.js";

export type RendererAntialiasMode = "none" | "msaa2" | "msaa4" | "msaa8" | "fxaa" | "taa" | "smaa";

export interface IRuntimeConfigDeclaration {
  renderer: {
    antialias: RendererAntialiasMode;
    bloom?: {
      enabled: boolean;
      intensity: number;
      threshold: number;
    };
    colorGrading?: {
      contrast?: number;
      exposure?: number;
      lut?: string;
      saturation?: number;
      temperature?: number;
      tint?: number;
      toneMapping?: "aces" | "linear" | "none" | "reinhard";
    };
    depthOfField?: {
      aperture: number;
      enabled: boolean;
      focusDistance: number;
      maxBlur: number;
    };
    renderPath?: "forward";
  };
  time: {
    fixedDelta: number;
    paused: boolean;
  };
  window: {
    height: number;
    title?: string;
    width: number;
  };
}

export function defineRuntimeConfig(options: {
  fixedDelta?: number;
  paused?: boolean;
  renderer?: {
    antialias?: RendererAntialiasMode;
    bloom?: { enabled?: boolean; intensity?: number; threshold?: number };
    colorGrading?: {
      contrast?: number;
      exposure?: number;
      lut?: string;
      saturation?: number;
      temperature?: number;
      tint?: number;
      toneMapping?: "aces" | "linear" | "none" | "reinhard";
    };
    depthOfField?: { aperture?: number; enabled?: boolean; focusDistance?: number; maxBlur?: number };
    renderPath?: "forward";
  };
  window?: { height?: number; title?: string; width?: number };
} = {}): IRuntimeConfigDeclaration {
  const fixedDelta = options.fixedDelta ?? 1 / 60;
  const bloom = options.renderer?.bloom;
  const bloomIntensity = bloom?.intensity ?? 0.15;
  const bloomThreshold = bloom?.threshold ?? 0;
  const colorGrading = options.renderer?.colorGrading;
  const depthOfField = options.renderer?.depthOfField;
  const dofAperture = depthOfField?.aperture ?? 0.02;
  const dofFocusDistance = depthOfField?.focusDistance ?? 8;
  const dofMaxBlur = depthOfField?.maxBlur ?? 0.01;
  const windowHeight = options.window?.height ?? 720;
  const windowWidth = options.window?.width ?? 1280;
  const windowTitle = options.window?.title;

  assertPositiveNumber(fixedDelta, "TN_SDK_RUNTIME_FIXED_DELTA_INVALID", "Runtime fixedDelta");
  assertPositiveNumber(windowHeight, "TN_SDK_RUNTIME_WINDOW_INVALID", "Runtime window height");
  assertPositiveNumber(windowWidth, "TN_SDK_RUNTIME_WINDOW_INVALID", "Runtime window width");
  assertNonNegativeFinite(bloomIntensity, "TN_SDK_RUNTIME_BLOOM_INVALID", "Runtime bloom intensity");
  assertNonNegativeFinite(bloomThreshold, "TN_SDK_RUNTIME_BLOOM_INVALID", "Runtime bloom threshold");
  assertNonNegativeFinite(dofAperture, "TN_SDK_RUNTIME_DOF_INVALID", "Runtime depthOfField aperture");
  assertPositiveNumber(dofFocusDistance, "TN_SDK_RUNTIME_DOF_INVALID", "Runtime depthOfField focusDistance");
  assertNonNegativeFinite(dofMaxBlur, "TN_SDK_RUNTIME_DOF_INVALID", "Runtime depthOfField maxBlur");
  if (colorGrading?.exposure !== undefined) {
    assertPositiveNumber(colorGrading.exposure, "TN_SDK_RUNTIME_COLOR_GRADING_INVALID", "Runtime color grading exposure");
  }
  if (colorGrading?.saturation !== undefined) {
    assertNonNegativeFinite(colorGrading.saturation, "TN_SDK_RUNTIME_COLOR_GRADING_INVALID", "Runtime color grading saturation");
  }
  for (const [key, value] of Object.entries({
    contrast: colorGrading?.contrast,
    temperature: colorGrading?.temperature,
    tint: colorGrading?.tint,
  })) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new SdkError("TN_SDK_RUNTIME_COLOR_GRADING_INVALID", `Runtime color grading ${key} must be finite.`);
    }
  }
  if (colorGrading?.lut !== undefined && colorGrading.lut.trim().length === 0) {
    throw new SdkError("TN_SDK_RUNTIME_COLOR_GRADING_INVALID", "Runtime color grading LUT must reference a non-empty asset id.");
  }
  if (windowTitle !== undefined && windowTitle.length === 0) {
    throw new SdkError("TN_SDK_RUNTIME_WINDOW_INVALID", "Runtime window title must be non-empty when provided.");
  }

  return {
    renderer: {
      antialias: options.renderer?.antialias ?? "msaa4",
      ...(bloom === undefined
        ? {}
        : {
            bloom: {
              enabled: bloom.enabled ?? true,
              intensity: bloomIntensity,
              threshold: bloomThreshold,
            },
          }),
      ...(colorGrading === undefined ? {} : { colorGrading }),
      ...(depthOfField === undefined
        ? {}
        : {
            depthOfField: {
              aperture: dofAperture,
              enabled: depthOfField.enabled ?? true,
              focusDistance: dofFocusDistance,
              maxBlur: dofMaxBlur,
            },
          }),
      ...(options.renderer?.renderPath === undefined ? {} : { renderPath: options.renderer.renderPath }),
    },
    time: {
      fixedDelta,
      paused: options.paused ?? false,
    },
    window: {
      height: windowHeight,
      title: windowTitle,
      width: windowWidth,
    },
  };
}

function assertNonNegativeFinite(value: number, code: string, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new SdkError(code, `${label} must be a non-negative finite number.`);
  }
}
