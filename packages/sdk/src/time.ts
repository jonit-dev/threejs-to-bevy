import { SdkError, assertPositiveNumber } from "./errors.js";

export interface IRuntimeConfigDeclaration {
  renderer: {
    antialias: "none" | "msaa2" | "msaa4" | "msaa8";
    bloom?: {
      enabled: boolean;
      intensity: number;
      threshold: number;
    };
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
    antialias?: "none" | "msaa2" | "msaa4" | "msaa8";
    bloom?: { enabled?: boolean; intensity?: number; threshold?: number };
  };
  window?: { height?: number; title?: string; width?: number };
} = {}): IRuntimeConfigDeclaration {
  const fixedDelta = options.fixedDelta ?? 1 / 60;
  const bloom = options.renderer?.bloom;
  const bloomIntensity = bloom?.intensity ?? 0.15;
  const bloomThreshold = bloom?.threshold ?? 0;
  const windowHeight = options.window?.height ?? 720;
  const windowWidth = options.window?.width ?? 1280;
  const windowTitle = options.window?.title;

  assertPositiveNumber(fixedDelta, "TN_SDK_RUNTIME_FIXED_DELTA_INVALID", "Runtime fixedDelta");
  assertPositiveNumber(windowHeight, "TN_SDK_RUNTIME_WINDOW_INVALID", "Runtime window height");
  assertPositiveNumber(windowWidth, "TN_SDK_RUNTIME_WINDOW_INVALID", "Runtime window width");
  assertNonNegativeFinite(bloomIntensity, "TN_SDK_RUNTIME_BLOOM_INVALID", "Runtime bloom intensity");
  assertNonNegativeFinite(bloomThreshold, "TN_SDK_RUNTIME_BLOOM_INVALID", "Runtime bloom threshold");
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
