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
  if (proofs.length === 0) {
    return undefined;
  }
  return chooseBestProof(proofs);
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
  return assertions.find((assertion): assertion is { details?: Record<string, unknown>; id: string; pass: boolean } => {
    return isRecord(assertion) && assertion.id === id && typeof assertion.pass === "boolean";
  });
}

function textDetail(assertion: { details?: Record<string, unknown> } | undefined, key: "after" | "before"): string | undefined {
  const value = assertion?.details?.[key];
  return typeof value === "string" ? value : undefined;
}

function retryText(value: string | undefined): boolean {
  return value?.toLowerCase().includes("retry") === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
