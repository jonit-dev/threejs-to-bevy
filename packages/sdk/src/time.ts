export interface IRuntimeConfigDeclaration {
  renderer: {
    antialias: "none" | "msaa2" | "msaa4" | "msaa8";
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
  renderer?: { antialias?: "none" | "msaa2" | "msaa4" | "msaa8" };
  window?: { height?: number; title?: string; width?: number };
} = {}): IRuntimeConfigDeclaration {
  return {
    renderer: {
      antialias: options.renderer?.antialias ?? "msaa4",
    },
    time: {
      fixedDelta: options.fixedDelta ?? 1 / 60,
      paused: options.paused ?? false,
    },
    window: {
      height: options.window?.height ?? 720,
      title: options.window?.title,
      width: options.window?.width ?? 1280,
    },
  };
}
