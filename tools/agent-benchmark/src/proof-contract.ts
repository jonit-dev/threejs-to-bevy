import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
  promptSha256: string;
  promptId: string;
  protocolVersion: string;
}

export const BENCHMARK_OBSERVATION_PROTOCOL_VERSION = "observation-route-v8";

export const BENCHMARK_OBSERVATION_PROTOCOL = {
  protocolVersion: BENCHMARK_OBSERVATION_PROTOCOL_VERSION,
  schema: "threenative.agent-benchmark-observation-protocol",
  version: 8,
} as const;

export const BENCHMARK_PROOF_CONTRACTS: readonly IBenchmarkPromptProofContract[] = [
  {
    assertions: [
      assertion("keyboard-movement", "Keyboard input moves a visible character."),
      assertion("pickup-objective", "At least five pickups can be collected toward a score or progress objective."),
      assertion("win-state", "Collecting all pickups reaches a clear win state."),
      assertion("retry-path", "The game exposes a retry path after completion or failure."),
    ],
    classification: "continuity",
    promptSha256: "ef993ccd5adffe4a5abdc740eb234754b296ff85a40366fb38a0833abb131389",
    promptId: "collector",
    protocolVersion: "round-5-ef993ccd5adf",
  },
  {
    assertions: [
      assertion("lane-movement", "Keyboard input moves the player between lanes."),
      assertion("obstacle-fail", "Obstacle contact reaches a fail state."),
      assertion("distance-objective", "Survival advances toward a finish marker or distance target."),
      assertion("retry-path", "The game exposes a retry path after failure."),
    ],
    classification: "continuity",
    promptSha256: "07dea2ca362612cfd8538543e4da116899feff9737754594ff3bbe7539cbf3e7",
    promptId: "lane-runner",
    protocolVersion: "round-5-07dea2ca3626",
  },
  {
    assertions: [
      assertion("ordered-checkpoints", "The player can move through ordered checkpoints."),
      assertion("timer-or-counter", "A timer or checkpoint counter updates during play."),
      assertion("finish-state", "The final checkpoint reaches a finish state."),
      assertion("retry-path", "The game exposes a retry path after completion or failure."),
    ],
    classification: "beyond-one-shot",
    promptSha256: "66d6bc5f33912f5a1564346e788c175b8b04154c0309fcffa7f38039755ee9c5",
    promptId: "checkpoint-race",
    protocolVersion: "round-5-66d6bc5f3391",
  },
  {
    assertions: [
      assertion("launch-or-push", "Input launches or pushes an object into targets."),
      assertion("target-displacement", "Targets visibly move, fall, or leave their starting positions."),
      assertion("score-updates", "The score updates when targets are knocked down or displaced."),
      assertion("retry-path", "The game exposes a retry path."),
    ],
    classification: "beyond-one-shot",
    promptSha256: "3866f0d1a20072f3fcd75159799802b908e6ea6eb376f005da5768c527617d6c",
    promptId: "physics-knockdown",
    protocolVersion: "round-5-3866f0d1a200",
  },
  {
    assertions: [
      assertion("webgl-canvas", "Active play renders in a nonblank WebGL canvas."),
      assertion("grid-movement", "Keyboard input moves the player between visible grid cells while readable floor-grid and wall geometry show and enforce the board bounds."),
      assertion("crate-push", "The player can push at least two visible crates but cannot pull them through the grid."),
      assertion("goal-progress", "Pushing crates onto goal tiles updates visible progress and placing every crate reaches a clear win state."),
      assertion("retry-path", "The game exposes a reset or retry path."),
    ],
    classification: "beyond-one-shot",
    promptSha256: "18ac207c59d61e6597da22520776cd781f6e993fa70df9361f5e997ac126ab63",
    promptId: "grid-push-puzzle",
    protocolVersion: "off-recipe-18ac207c59d6",
  },
  {
    assertions: [
      assertion("webgl-canvas", "Active play renders in a nonblank WebGL canvas."),
      assertion("defender-input", "Keyboard movement and pointer aim or attack input visibly control the defender."),
      assertion("wave-progression", "Enemies spawn in successive waves, surviving advances visible progress, and later waves become meaningfully harder."),
      assertion("base-failure", "Enemy attacks reduce visible base health and can reach a clear failure state."),
      assertion("retry-path", "Keyboard or pointer input retries from failure and restarts active play."),
    ],
    classification: "beyond-one-shot",
    promptSha256: "2c7714807ea8461ee538331e56426b58ce7b1367b3ec10da9d696a6e7f0b31f5",
    promptId: "wave-defense",
    protocolVersion: "off-recipe-2c7714807ea8",
  },
  {
    assertions: [
      assertion("webgl-canvas", "Active play renders in a nonblank WebGL canvas."),
      assertion("unit-selection-movement", "Pointer or keyboard input selects a unit and visibly moves it between grid cells."),
      assertion("enemy-turn", "An enemy takes a distinct turn that changes the board or threatens the player."),
      assertion("objective-outcomes", "Play advances visible objective or turn progress and can reach clear success and failure states."),
      assertion("retry-path", "Keyboard or pointer input retries an outcome and resets the encounter."),
    ],
    classification: "beyond-one-shot",
    promptSha256: "5b640eb12cbded36a84b3415ad4ae85b15137783b64b53d4831ccd1924f45f37",
    promptId: "turn-based-tactics",
    protocolVersion: "off-recipe-5b640eb12cbd",
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
    const actualSha256 = createHash("sha256").update(text).digest("hex");
    if (actualSha256 !== contract.promptSha256) {
      diagnostics.push({
        code: "TN_BENCH_PROMPT_CONTENT_DRIFT",
        message: `${promptId}: prompt SHA-256 ${actualSha256} does not match frozen contract ${contract.promptSha256}.`,
        severity: "error",
        suggestedFix: "Review the prompt change, then bump its content-addressed protocolVersion and expected SHA-256 together.",
      });
    }
    if (!contract.protocolVersion.endsWith(contract.promptSha256.slice(0, 12))) {
      diagnostics.push({
        code: "TN_BENCH_PROMPT_PROTOCOL_VERSION_STALE",
        message: `${promptId}: protocol version '${contract.protocolVersion}' does not identify frozen prompt ${contract.promptSha256.slice(0, 12)}.`,
        severity: "error",
        suggestedFix: "Bump protocolVersion so its suffix is the first 12 characters of promptSha256.",
      });
    }
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
  if (contract.promptId === "wave-defense") {
    return ["webgl", "canvas", "keyboard", "pointer", "waves", "base health", "failure", "retry"];
  }
  if (contract.promptId === "turn-based-tactics") {
    return ["webgl", "canvas", "pointer", "keyboard", "select", "grid", "enemy", "success", "failure", "retry"];
  }
  return [];
}
