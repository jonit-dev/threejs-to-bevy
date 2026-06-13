export interface IRuntimeConfigDeclaration {
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
  window?: { height?: number; title?: string; width?: number };
} = {}): IRuntimeConfigDeclaration {
  return {
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
