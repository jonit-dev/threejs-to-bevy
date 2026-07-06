import { type IScreenshotCompositionMetrics } from "@threenative/cli/screenshotMetrics";

export type BenchmarkCondition = "threenative" | "vanilla";
export type BenchmarkStopReason = "claimed-playable" | "token-cap" | "operator-stopped" | "failed-setup";

export interface IBenchmarkDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning";
  suggestedFix?: string;
}

export interface IBenchmarkSession {
  condition: BenchmarkCondition;
  finishedAt?: string;
  humanRubric: {
    notes?: string;
    playability: number;
    visual: number;
  };
  iterationCount: number;
  promptId: string;
  runId: string;
  schema: "threenative.agent-benchmark-session";
  stopReason: BenchmarkStopReason;
  tokenCount: number;
  version: 1;
}

export interface IBenchmarkRunReport {
  artifacts: {
    afterScreenshot?: string;
    beforeScreenshot?: string;
  };
  candidate: string;
  condition: BenchmarkCondition;
  diagnostics: IBenchmarkDiagnostic[];
  generatedAt: string;
  metrics?: {
    after: IScreenshotCompositionMetrics;
    before: IScreenshotCompositionMetrics;
    movementDelta: {
      averageBrightnessDelta: number;
      changedPixelRatio: number;
      threshold: number;
    };
  };
  ok: boolean;
  promptId: string;
  runId: string;
  schema: "threenative.agent-benchmark-run";
  session: IBenchmarkSession;
  version: 1;
}

export interface IBenchmarkReport {
  diagnostics: IBenchmarkDiagnostic[];
  generatedAt: string;
  promptSummaries: Array<{
    promptId: string;
    threenativeMedianTokens: number | null;
    vanillaMedianTokens: number | null;
    withinTwoX: boolean | null;
  }>;
  runCount: number;
  schema: "threenative.agent-benchmark-report";
  version: 1;
  verdict: {
    status: "pass" | "fail" | "insufficient-data";
    summary: string;
    threshold: "threenative-median-tokens <= 2x vanilla-median-tokens";
  };
}
