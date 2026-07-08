import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { collectCandidatePlaytestSummaries, type ICandidatePlaytestSummary } from "./playtest-diagnostics.js";
import { getProofContract } from "./proof-contract.js";
import { type IBenchmarkDiagnostic, type IBenchmarkProofResult } from "./types.js";

export async function inferBenchmarkProofFromArtifacts(options: {
  candidate: string;
  promptId: string;
}): Promise<{ diagnostics: IBenchmarkDiagnostic[]; proof?: IBenchmarkProofResult }> {
  if (options.promptId !== "collector") {
    return { diagnostics: [] };
  }
  const neutralProofs = await collectNeutralProofs(options.candidate);
  const neutralProof = chooseBestProof(neutralProofs.proofs);
  if (neutralProof !== undefined) {
    const diagnostics = proofDiagnostics(neutralProof, "Collector equal-proof browser artifact failed under the round-5 proof contract.", "Inspect artifacts/proof/collector-proof.json and rerun the browser proof after fixing the owning source.");
    return { diagnostics: [...neutralProofs.diagnostics, ...diagnostics], proof: neutralProof };
  }
  const summaries = await collectCandidatePlaytestSummaries(options.candidate);
  const proof = inferCollectorProof(summaries);
  if (proof === undefined) {
    return { diagnostics: [] };
  }
  const diagnostics = proofDiagnostics(proof, "Collector equal-proof playtest failed under the round-5 proof contract.", "Inspect the imported TN_PLAYTEST_* diagnostics and rerun the collector proof scenario after fixing the owning source.");
  return { diagnostics, proof };
}

function proofDiagnostics(proof: IBenchmarkProofResult, message: string, suggestedFix: string): IBenchmarkDiagnostic[] {
  return proof.ok ? [] : [{
    code: "TN_BENCH_EQUAL_PROOF_FAILED",
    message,
    severity: "error" as const,
    suggestedFix,
  }];
}

function inferCollectorProof(summaries: ICandidatePlaytestSummary[]): IBenchmarkProofResult | undefined {
  const contract = getProofContract("collector");
  if (contract === undefined) {
    return undefined;
  }
  const proofs = summaries
    .filter(hasCollectorResourceAssertions)
    .map((summary) => collectorProofFromSummary(summary));
  const combinedProof = collectorProofFromSummaries(summaries);
  if (combinedProof !== undefined) {
    proofs.push(combinedProof);
  }
  if (proofs.length === 0) {
    return undefined;
  }
  return chooseBestProof(proofs);
}

function collectorProofFromSummaries(summaries: ICandidatePlaytestSummary[]): IBenchmarkProofResult | undefined {
  const contract = getProofContract("collector");
  if (contract === undefined) {
    return undefined;
  }
  const assertions = summaries.flatMap((summary) => Array.isArray(summary.value.assertions) ? summary.value.assertions.filter(isSummaryAssertion) : []);
  if (assertions.length === 0) {
    return undefined;
  }
  const movement = assertions.find((assertion) => assertion.id === "movement" && assertion.pass);
  const pickup = assertions.find((assertion) => {
    if (!assertion.pass) {
      return false;
    }
    return assertion.id === "resource.GameState.scoreText"
      || assertion.id === "resource.GameState"
      || assertion.id === "hud.hud.progress"
      || assertion.id === "resource.GameState.won";
  });
  const win = assertions.find((assertion) => {
    if (!assertion.pass) {
      return false;
    }
    return assertion.id === "resource.GameState.statusText"
      || assertion.id === "resource.GameState.won"
      || assertion.id === "hud.hud.status";
  });
  const retry = assertions.find((assertion) => assertion.pass && retryText(assertionText(assertion)));
  if (movement === undefined && pickup === undefined && win === undefined && retry === undefined) {
    return undefined;
  }
  const required = contract.assertions.filter((item) => item.required).map((item) => item.id);
  const proofAssertions = [
    {
      details: { evidence: movement === undefined ? "No passing movement assertion was found" : "A generated collector movement assertion passed" },
      id: "keyboard-movement",
      pass: movement !== undefined,
    },
    {
      details: { evidence: pickup === undefined ? "No passing pickup/progress assertion was found" : `Generated collector pickup/progress assertion passed: ${pickup.id}` },
      id: "pickup-objective",
      pass: pickup !== undefined,
    },
    {
      details: { evidence: win === undefined ? "No passing win-state assertion was found" : `Generated collector win-state assertion passed: ${win.id}` },
      id: "win-state",
      pass: win !== undefined,
    },
    {
      details: { evidence: retry === undefined ? "No retry text was observed" : `Generated collector retry text observed: ${assertionText(retry) ?? retry.id}` },
      id: "retry-path",
      pass: retry !== undefined,
    },
  ];
  return {
    assertions: proofAssertions,
    classification: contract.classification,
    ok: proofAssertions.every((assertion) => assertion.pass),
    promptId: "collector",
    requiredAssertionIds: required,
  };
}

function collectorProofFromSummary(summary: ICandidatePlaytestSummary): IBenchmarkProofResult {
  const contract = getProofContract("collector");
  if (contract === undefined) {
    throw new Error("Collector proof contract is missing.");
  }
  const movement = assertionById(summary, "movement");
  const score = assertionById(summary, "resource.GameState.scoreText");
  const status = assertionById(summary, "resource.GameState.statusText");
  const statusAfter = textDetail(status, "after");
  const scoreBefore = textDetail(score, "before");
  const scoreAfter = textDetail(score, "after");
  const required = contract.assertions.filter((item) => item.required).map((item) => item.id);
  const assertions = [
    {
      details: { evidence: movement?.pass === true ? "collector playtest movement assertion passed" : "collector playtest movement assertion did not pass" },
      id: "keyboard-movement",
      pass: movement?.pass === true,
    },
    {
      details: { evidence: score?.pass === true ? `GameState.scoreText changed from ${scoreBefore ?? "unknown"} to ${scoreAfter ?? "unknown"}` : `GameState.scoreText ended at ${scoreAfter ?? "unknown"}` },
      id: "pickup-objective",
      pass: score?.pass === true,
    },
    {
      details: { evidence: status?.pass === true ? `GameState.statusText reached ${statusAfter ?? "unknown"}` : `GameState.statusText ended at ${statusAfter ?? "unknown"}` },
      id: "win-state",
      pass: status?.pass === true,
    },
    {
      details: { evidence: retryText(statusAfter) ? `GameState.statusText exposes retry path: ${statusAfter}` : "No retry path was observed in the collector proof status text" },
      id: "retry-path",
      pass: retryText(statusAfter),
    },
  ];
  return {
    assertions,
    classification: contract.classification,
    ok: assertions.every((assertion) => assertion.pass),
    promptId: "collector",
    requiredAssertionIds: required,
  };
}

function passingAssertionCount(proof: IBenchmarkProofResult): number {
  return proof.assertions.filter((assertion) => assertion.pass).length;
}

function chooseBestProof(proofs: IBenchmarkProofResult[]): IBenchmarkProofResult | undefined {
  return proofs.find((proof) => proof.ok) ?? proofs.toSorted((a, b) => passingAssertionCount(b) - passingAssertionCount(a))[0];
}

async function collectNeutralProofs(candidate: string): Promise<{ diagnostics: IBenchmarkDiagnostic[]; proofs: IBenchmarkProofResult[] }> {
  const proofRoot = resolve(candidate, "artifacts", "proof");
  const files = await findJsonFiles(proofRoot);
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const proofs: IBenchmarkProofResult[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
      const proof = neutralCollectorProof(parsed);
      if (proof !== undefined) {
        proofs.push(proof);
      }
    } catch (error) {
      diagnostics.push({
        code: "TN_BENCH_PROOF_ARTIFACT_READ_FAILED",
        message: `Unable to read neutral proof artifact ${file}: ${error instanceof Error ? error.message : String(error)}.`,
        severity: "error",
        suggestedFix: "Write valid JSON proof artifacts under artifacts/proof/.",
      });
    }
  }
  return { diagnostics, proofs };
}

async function findJsonFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return findJsonFiles(path);
      }
      return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

function neutralCollectorProof(value: unknown): IBenchmarkProofResult | undefined {
  if (!isRecord(value) || value.schema !== "threenative.agent-benchmark-proof" || value.promptId !== "collector" || !Array.isArray(value.assertions)) {
    return undefined;
  }
  const contract = getProofContract("collector");
  if (contract === undefined) {
    return undefined;
  }
  const required = contract.assertions.filter((item) => item.required).map((item) => item.id);
  const assertions = value.assertions
    .filter((assertion): assertion is { details?: Record<string, unknown>; id: string; pass: boolean } => {
      return isRecord(assertion) && typeof assertion.id === "string" && typeof assertion.pass === "boolean" && (assertion.details === undefined || isRecord(assertion.details));
    })
    .map((assertion) => ({
      details: assertion.details,
      id: assertion.id,
      pass: assertion.pass,
    }));
  const passed = new Set(assertions.filter((assertion) => assertion.pass).map((assertion) => assertion.id));
  return {
    assertions,
    classification: contract.classification,
    ok: required.every((id) => passed.has(id)),
    promptId: "collector",
    requiredAssertionIds: required,
  };
}

function hasCollectorResourceAssertions(summary: ICandidatePlaytestSummary): boolean {
  return assertionById(summary, "resource.GameState.scoreText") !== undefined
    && assertionById(summary, "resource.GameState.statusText") !== undefined;
}

function assertionById(summary: ICandidatePlaytestSummary, id: string): { details?: Record<string, unknown>; id: string; pass: boolean } | undefined {
  const assertions = summary.value.assertions;
  if (!Array.isArray(assertions)) {
    return undefined;
  }
  return assertions.find((assertion): assertion is { details?: Record<string, unknown>; id: string; pass: boolean } => isSummaryAssertion(assertion) && assertion.id === id);
}

function isSummaryAssertion(value: unknown): value is { details?: Record<string, unknown>; id: string; pass: boolean } {
  return isRecord(value) && typeof value.id === "string" && typeof value.pass === "boolean" && (value.details === undefined || isRecord(value.details));
}

function textDetail(assertion: { details?: Record<string, unknown> } | undefined, key: "after" | "before"): string | undefined {
  const value = assertion?.details?.[key];
  return typeof value === "string" ? value : undefined;
}

function assertionText(assertion: { details?: Record<string, unknown> }): string | undefined {
  return textFromUnknown(assertion.details?.after) ?? textFromUnknown(assertion.details?.before);
}

function textFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value)) {
    if (typeof value.text === "string") {
      return value.text;
    }
    if (typeof value.statusText === "string") {
      return value.statusText;
    }
    if (typeof value.retryText === "string") {
      return value.retryText;
    }
    if (value.won === true) {
      return "All pickups collected - press R to retry";
    }
  }
  return undefined;
}

function retryText(value: string | undefined): boolean {
  return value?.toLowerCase().includes("retry") === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
