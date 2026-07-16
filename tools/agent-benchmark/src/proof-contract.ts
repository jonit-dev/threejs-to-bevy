import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  type BenchmarkPromptClass,
  type IBenchmarkDiagnostic,
  type IBenchmarkProofAssertion,
  type IBenchmarkProofResult,
} from "./types.js";

export interface IBenchmarkPromptProofContract {
  assertions: IBenchmarkProofAssertion[];
  classification: BenchmarkPromptClass;
  promptId: string;
}

export const BENCHMARK_PROOF_CONTRACTS: readonly IBenchmarkPromptProofContract[] = [
  {
    assertions: [
      assertion("keyboard-movement", "Keyboard input moves a visible character."),
      assertion("pickup-objective", "At least five pickups can be collected toward a score or progress objective."),
      assertion("win-state", "Collecting all pickups reaches a clear win state."),
      assertion("retry-path", "The game exposes a retry path after completion or failure."),
    ],
    classification: "continuity",
    promptId: "collector",
  },
  {
    assertions: [
      assertion("lane-movement", "Keyboard input moves the player between lanes."),
      assertion("obstacle-fail", "Obstacle contact reaches a fail state."),
      assertion("distance-objective", "Survival advances toward a finish marker or distance target."),
      assertion("retry-path", "The game exposes a retry path after failure."),
    ],
    classification: "continuity",
    promptId: "lane-runner",
  },
  {
    assertions: [
      assertion("ordered-checkpoints", "The player can move through ordered checkpoints."),
      assertion("timer-or-counter", "A timer or checkpoint counter updates during play."),
      assertion("finish-state", "The final checkpoint reaches a finish state."),
      assertion("retry-path", "The game exposes a retry path after completion or failure."),
    ],
    classification: "beyond-one-shot",
    promptId: "checkpoint-race",
  },
  {
    assertions: [
      assertion("launch-or-push", "Input launches or pushes an object into targets."),
      assertion("target-displacement", "Targets visibly move, fall, or leave their starting positions."),
      assertion("score-updates", "The score updates when targets are knocked down or displaced."),
      assertion("retry-path", "The game exposes a retry path."),
    ],
    classification: "beyond-one-shot",
    promptId: "physics-knockdown",
  },
  {
    assertions: [
      assertion("grid-movement", "Keyboard input moves the player between visible grid cells while walls block movement."),
      assertion("crate-push", "The player can push crates but cannot pull them through the grid."),
      assertion("goal-progress", "Pushing crates onto goal tiles updates visible progress and placing every crate reaches a clear win state."),
      assertion("retry-path", "The game exposes a reset or retry path."),
    ],
    classification: "beyond-one-shot",
    promptId: "grid-push-puzzle",
  },
];

const contractsByPrompt = new Map(BENCHMARK_PROOF_CONTRACTS.map((contract) => [contract.promptId, contract]));

export function getProofContract(promptId: string): IBenchmarkPromptProofContract | undefined {
  return contractsByPrompt.get(promptId);
}

export function requiredAssertionIds(promptId: string): string[] {
  return getProofContract(promptId)?.assertions.filter((item) => item.required).map((item) => item.id) ?? [];
}

export function validateProofResult(promptId: string, proof: IBenchmarkProofResult | undefined): IBenchmarkDiagnostic[] {
  const contract = getProofContract(promptId);
  if (contract === undefined) {
    return [{
      code: "TN_BENCH_PROOF_CONTRACT_MISSING",
      message: `No proof contract is registered for prompt '${promptId}'.`,
      severity: "error",
      suggestedFix: "Add the prompt to BENCHMARK_PROOF_CONTRACTS before scoring round-5 runs.",
    }];
  }
  if (proof === undefined) {
    return [{
      code: "TN_BENCH_PROOF_MISSING",
      message: `${promptId}: run report is missing equal-proof assertion results.`,
      severity: "error",
      suggestedFix: "Score the run with round-5 proof assertions and store them in report.proof.",
    }];
  }
  const required = new Set(contract.assertions.filter((item) => item.required).map((item) => item.id));
  const passed = new Set(proof.assertions.filter((item) => item.pass).map((item) => item.id));
  const missing = Array.from(required).filter((id) => !passed.has(id));
  if (proof.promptId !== promptId || proof.classification !== contract.classification || missing.length > 0 || proof.ok !== true) {
    return [{
      code: "TN_BENCH_PROOF_FAILED",
      message: `${promptId}: equal-proof assertions failed or are incomplete: ${missing.join(", ") || "proof.ok false"}.`,
      severity: "error",
      suggestedFix: "Use the prompt proof contract for both vanilla and ThreeNative runs before aggregating.",
    }];
  }
  return [];
}

export async function validatePromptProofContracts(options: { promptsDir: string }): Promise<IBenchmarkDiagnostic[]> {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const entries = await readdir(options.promptsDir, { withFileTypes: true });
  const promptIds = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => basename(entry.name, ".md"))
    .sort();
  for (const promptId of promptIds) {
    const contract = getProofContract(promptId);
    if (contract === undefined) {
      diagnostics.push({
        code: "TN_BENCH_PROMPT_PROOF_CONTRACT_MISSING",
        message: `${promptId}: prompt is missing an equal-proof contract.`,
        severity: "error",
      });
      continue;
    }
    const text = await readFile(resolve(options.promptsDir, `${promptId}.md`), "utf8");
    const missingWords = promptKeywords(contract).filter((keyword) => !text.toLowerCase().includes(keyword));
    if (missingWords.length > 0) {
      diagnostics.push({
        code: "TN_BENCH_PROMPT_PROOF_CONTRACT_DRIFT",
        message: `${promptId}: proof contract no longer matches prompt text keywords: ${missingWords.join(", ")}.`,
        severity: "error",
      });
    }
  }
  return diagnostics;
}

export function passedProof(promptId: string): IBenchmarkProofResult {
  const contract = getProofContract(promptId);
  if (contract === undefined) {
    return { assertions: [], classification: "continuity", ok: false, promptId, requiredAssertionIds: [] };
  }
  const required = contract.assertions.filter((item) => item.required).map((item) => item.id);
  return {
    assertions: required.map((id) => ({ id, pass: true })),
    classification: contract.classification,
    ok: true,
    promptId,
    requiredAssertionIds: required,
  };
}

function assertion(id: string, description: string): IBenchmarkProofAssertion {
  return { description, id, required: true };
}

function promptKeywords(contract: IBenchmarkPromptProofContract): string[] {
  if (contract.promptId === "collector") {
    return ["pickups", "score", "retry"];
  }
  if (contract.promptId === "lane-runner") {
    return ["lanes", "obstacles", "retry"];
  }
  if (contract.promptId === "checkpoint-race") {
    return ["checkpoints", "timer", "retry"];
  }
  if (contract.promptId === "physics-knockdown") {
    return ["targets", "score", "retry"];
  }
  if (contract.promptId === "grid-push-puzzle") {
    return ["grid", "crates", "goal", "reset"];
  }
  return [];
}
