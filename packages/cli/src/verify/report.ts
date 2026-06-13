export type VerificationStatus = "pass" | "fail";

export type VerificationArea = "sdk" | "compiler" | "runtime-web" | "example" | "camera/framing" | "unknown";

export interface IVerificationDiagnostic {
  code: string;
  likelyArea: VerificationArea;
  message: string;
  severity: "error" | "warning" | "info";
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

export interface IVerificationReport {
  artifacts: {
    reportPath: string;
    screenshots: string[];
  };
  checks: {
    canvas?: ICanvasCheck;
    frameDiff?: IFrameDiffCheck;
    nonblank?: INonblankCheck;
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
