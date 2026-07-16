import { type IScreenshotCompositionMetrics } from "@threenative/cli/screenshotMetrics";

export type BenchmarkCondition = "threenative" | "typed-spec" | "vanilla";
export type BenchmarkPromptClass = "beyond-one-shot" | "continuity";
export type BenchmarkStopReason = "claimed-playable" | "token-cap" | "operator-stopped" | "failed-setup";

export interface IBenchmarkDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning";
  suggestedFix?: string;
}

export interface IBenchmarkSession {
  cachedInputTokens?: number;
  churnCounters?: IBenchmarkChurnCounters;
  condition: BenchmarkCondition;
  costWeightedTokens?: number;
  finishedAt?: string;
  failedCommandCount?: number;
  identicalAssertionRepeatCount?: number;
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
  tokenAccounting?: "codex-turn-usage";
  tokenCount: number;
  toolStepCount?: number;
  toolOutputBytes?: number;
  uncachedInputTokens?: number;
  maxConsecutiveSameDiagnostic?: number;
  version: 2;
}

export interface IBenchmarkProofAssertion {
  description: string;
  id: string;
  required: boolean;
}

export interface IBenchmarkProofResult {
  classification: BenchmarkPromptClass;
  assertions: Array<{
    details?: Record<string, unknown>;
    id: string;
    pass: boolean;
  }>;
  ok: boolean;
  promptId: string;
  requiredAssertionIds: string[];
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
  proof?: IBenchmarkProofResult;
  promptId: string;
  runId: string;
  schema: "threenative.agent-benchmark-run";
  session: IBenchmarkSession;
  version: 2;
}

export interface IBenchmarkBehaviorCounters {
  artifactForensicsCommandCount: number;
  discoveryCommandCount: number;
  engineSourceSearchCommandCount: number;
  iterateCommandCount: number;
  standaloneVerifyCommandCount: number;
}

export interface IBenchmarkChurnCounters {
  artifactForensics: number;
  engineSourceSearch: number;
  failedCommand: number;
  missingDiscovery: number;
  missingIterate: number;
  repeatedAssertion: number;
  repeatedDiagnostic: number;
  repeatedFileRead: number;
  standaloneVerify: number;
}

export interface IBenchmarkBehaviorBudgetRun {
  condition: Extract<BenchmarkCondition, "threenative" | "typed-spec">;
  counters: IBenchmarkBehaviorCounters;
  churnCounters: IBenchmarkChurnCounters;
  diagnostics: IBenchmarkDiagnostic[];
  offendingCommands: {
    artifactForensics: string[];
    engineSourceSearch: string[];
    repeatedFileRead: string[];
    standaloneVerify: string[];
  };
  runId: string;
  withinBudget: boolean;
}

export interface IBenchmarkReport {
  diagnostics: IBenchmarkDiagnostic[];
  generatedAt: string;
  promptSummaries: Array<{
    costWeightedTokenRatio: number | null;
    dialectConfusionFailures: {
      threenative: number;
      vanilla: number;
    };
    failedCommandMedian: {
      threenative: number | null;
      vanilla: number | null;
    };
    iterationMedian: {
      threenative: number | null;
      vanilla: number | null;
    };
    behaviorMedian: {
      artifactForensicsCommandCount: number | null;
      discoveryCommandCount: number | null;
      engineSourceSearchCommandCount: number | null;
      iterateCommandCount: number | null;
      standaloneVerifyCommandCount: number | null;
    };
    behaviorBudgetRuns: IBenchmarkBehaviorBudgetRun[];
    churnByCondition: Array<{
      condition: Extract<BenchmarkCondition, "threenative" | "typed-spec">;
      median: { [K in keyof IBenchmarkChurnCounters]: number | null };
    }>;
    promptId: string;
    promptClassification: BenchmarkPromptClass | "unknown";
    proofBar: {
      requiredAssertions: string[];
      typedSpecPassed: boolean;
      threenativePassed: boolean;
      vanillaPassed: boolean;
    };
    rawTokenRatio: number | null;
    repeatCount: {
      threenative: number;
      vanilla: number;
    };
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
    typedSpecTrial: {
      failedCommandDelta: number | null;
      identicalAssertionRepeatDelta: number | null;
      maxSameDiagnosticDelta: number | null;
      rawTokenRatioToThreeNative: number | null;
      repeatCount: number;
      status: "default-candidate" | "experimental" | "insufficient-data";
      summary: string;
      typedSpecMedianFailedCommandCount: number | null;
      typedSpecMedianIdenticalAssertionRepeats: number | null;
      typedSpecMedianMaxSameDiagnostic: number | null;
      typedSpecMedianTokens: number | null;
      withinFailedCommandBudget: boolean | null;
      withinRepeatBudget: boolean;
      withinRetryChainBudget: boolean | null;
      withinTokenBudget: boolean | null;
    };
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
    withinEqualProofTokenBudget: boolean | null;
    withinFailedCommandBudget: boolean | null;
    withinInstructionAdoptionBudget: boolean | null;
    withinRepeatBudget: boolean;
    withinRetryChainBudget: boolean | null;
    withinStepBudget: boolean | null;
  }>;
  runCount: number;
  schema: "threenative.agent-benchmark-report";
  dialectConfusionFailureCount: number;
  typedSpecVerdict: {
    status: "default-candidate" | "experimental" | "insufficient-data";
    summary: string;
    threshold: "typed-spec: equal proof repeats >=3; median tokens <= direct ThreeNative; failed commands ==0; retry chains <=1/0";
  };
  version: 2;
  verdict: {
    status: "pass" | "fail" | "insufficient-data";
    summary: string;
    threshold: "equal-proof: continuity <=1.5x vanilla tokens; beyond-one-shot <=1.0x vanilla tokens; repeats >=3; failed commands ==0; retry chains <=1/0";
  };
}
