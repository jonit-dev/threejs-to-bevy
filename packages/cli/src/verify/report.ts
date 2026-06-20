export type VerificationStatus = "pass" | "fail";

export type VerificationArea = "sdk" | "compiler" | "runtime-web" | "example" | "camera/framing" | "unknown";

export interface IVerificationDiagnostic {
  actual?: number;
  artifactPath?: string;
  code: string;
  likelyArea: VerificationArea;
  message: string;
  metric?: string;
  severity: "error" | "warning" | "info";
  threshold?: number;
}

export interface ICanvasCheck {
  height: number;
  ok: boolean;
  width: number;
}

export interface INonblankCheck {
  changedPixelRatio: number;
  ok: boolean;
  threshold: number;
}

export interface IFrameDiffCheck {
  averageBrightnessDelta: number;
  averageColorDelta: {
    blue: number;
    green: number;
    red: number;
  };
  changedPixelRatio: number;
  expectedMotion: boolean;
  ok: boolean;
  threshold: number;
}

export interface IProjectedBoundsCheck {
  height: number;
  nonblankPixelRatio: number;
  ok: boolean;
  width: number;
  x: number;
  y: number;
}

export interface IVerificationReport {
  artifacts: {
    effectLogPath?: string;
    reportPath: string;
    screenshots: string[];
  };
  checks: {
    canvas?: ICanvasCheck;
    frameDiff?: IFrameDiffCheck;
    nonblank?: INonblankCheck;
    projectedBounds?: IProjectedBoundsCheck;
  };
  debug: {
    browserLogs: string[];
    pageErrors: string[];
    requestFailures: string[];
    runtimeReady?: unknown;
  };
  diagnostics: IVerificationDiagnostic[];
  previewUrl: string;
  status: VerificationStatus;
  thresholds: {
    diffChangedPixelRatio: number;
    nonblankChangedPixelRatio: number;
  };
}

export function reportStatus(diagnostics: readonly IVerificationDiagnostic[]): VerificationStatus {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fail" : "pass";
}
