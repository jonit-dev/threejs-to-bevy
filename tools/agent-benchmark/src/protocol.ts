export const BENCHMARK_PROTOCOL = {
  maxRawTokens: 300_000,
  maxToolSteps: 25,
  model: "gpt-5.6-sol",
  reasoningEffort: "medium",
  schema: "threenative.agent-benchmark-protocol",
  tokenInterruptReserve: 200_000,
  toolOutputTokenLimit: 1_024,
  version: 5,
} as const;

export type BenchmarkRunnerStopCause = "failed-setup" | "token-cap" | "tool-cap" | "turn-completed";
