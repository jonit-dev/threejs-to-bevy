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
  cachedInputTokens?: number;
  condition: BenchmarkCondition;
  costWeightedTokens?: number;
  finishedAt?: string;
  failedCommandCount?: number;
  humanRubric: {
    notes?: string;
    playability: number;
    visual: number;
  };
  inputTokens?: number;
  iterationCount: number;
  outputTokens?: number;
  promptId: string;
  runId: string;
  schema: "threenative.agent-benchmark-session";
  stopReason: BenchmarkStopReason;
  tokenCount: number;
  toolStepCount?: number;
  toolOutputBytes?: number;
  uncachedInputTokens?: number;
  version: 2;
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
  version: 2;
}

export interface IBenchmarkReport {
  diagnostics: IBenchmarkDiagnostic[];
  generatedAt: string;
  promptSummaries: Array<{
    costWeightedTokenRatio: number | null;
    failedCommandMedian: {
      threenative: number | null;
      vanilla: number | null;
    };
    iterationMedian: {
      threenative: number | null;
      vanilla: number | null;
    };
    promptId: string;
    rawTokenRatio: number | null;
    threenativeMedianCachedInputTokens: number | null;
    threenativeMedianCostWeightedTokens: number | null;
    threenativeMedianFailedCommandCount: number | null;
    threenativeMedianInputTokens: number | null;
    threenativeMedianIterations: number | null;
    threenativeMedianOutputTokens: number | null;
    threenativeMedianToolStepCount: number | null;
    threenativeMedianTokens: number | null;
    threenativeMedianToolOutputBytes: number | null;
    threenativeMedianUncachedInputTokens: number | null;
    toolOutputMedian: {
      threenative: number | null;
      vanilla: number | null;
    };
    toolStepMedian: {
      threenative: number | null;
      vanilla: number | null;
    };
    vanillaMedianCachedInputTokens: number | null;
    vanillaMedianCostWeightedTokens: number | null;
    vanillaMedianFailedCommandCount: number | null;
    vanillaMedianInputTokens: number | null;
    vanillaMedianIterations: number | null;
    vanillaMedianOutputTokens: number | null;
    vanillaMedianToolStepCount: number | null;
    vanillaMedianTokens: number | null;
    vanillaMedianToolOutputBytes: number | null;
    vanillaMedianUncachedInputTokens: number | null;
    withinHalfX: boolean | null;
    withinStepBudget: boolean | null;
  }>;
  runCount: number;
  schema: "threenative.agent-benchmark-report";
  version: 2;
  verdict: {
    status: "pass" | "fail" | "insufficient-data";
    summary: string;
    threshold: "threenative-median-tokens <= 0.5x vanilla-median-tokens";
  };
}
