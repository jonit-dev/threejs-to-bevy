import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { type IBenchmarkDiagnostic } from "./types.js";

export interface ICandidatePlaytestSummary {
  diagnostics: unknown[];
  path: string;
  value: Record<string, unknown>;
}

export async function collectCandidatePlaytestDiagnostics(candidate: string): Promise<IBenchmarkDiagnostic[]> {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  const summaries = await collectCandidatePlaytestSummaries(candidate);
  for (const summary of summaries) {
    diagnostics.push(...playtestDiagnosticsFromSummary(candidate, summary));
    if (diagnostics.length >= 20) {
      return diagnostics.slice(0, 20);
    }
  }
  return diagnostics;
}

export async function collectCandidatePlaytestSummaries(candidate: string): Promise<ICandidatePlaytestSummary[]> {
  const summaries: ICandidatePlaytestSummary[] = [];
  let entries;
  try {
    entries = await readdir(resolve(candidate), { recursive: true, withFileTypes: true });
  } catch {
    return summaries;
  }
  const summaryPaths = entries
    .filter((entry) => entry.isFile() && entry.name === "summary.json")
    .map((entry) => resolve(candidate, entry.parentPath, entry.name))
    .filter((path) => relative(candidate, path).split(/[\\/]/).includes("artifacts"))
    .sort();
  for (const summaryPath of summaryPaths) {
    const summary = await readPlaytestSummary(summaryPath);
    if (summary !== undefined) {
      summaries.push(summary);
    }
  }
  return summaries;
}

async function readPlaytestSummary(summaryPath: string): Promise<ICandidatePlaytestSummary | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(summaryPath, "utf8")) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.diagnostics)) {
    return undefined;
  }
  return { diagnostics: parsed.diagnostics, path: summaryPath, value: parsed };
}

function playtestDiagnosticsFromSummary(candidate: string, summary: ICandidatePlaytestSummary): IBenchmarkDiagnostic[] {
  if (!Array.isArray(summary.value.diagnostics)) {
    return [];
  }
  const relativePath = relative(candidate, summary.path);
  return summary.value.diagnostics
    .filter(isPlaytestDiagnostic)
    .map((diagnostic) => ({
      code: diagnostic.code,
      message: `${relativePath}: ${diagnostic.message}`,
      severity: diagnostic.severity,
      suggestedFix: diagnostic.suggestion,
    }));
}

function isPlaytestDiagnostic(value: unknown): value is { code: string; message: string; severity: "error" | "warning"; suggestion?: string } {
  return isRecord(value)
    && typeof value.code === "string"
    && value.code.startsWith("TN_PLAYTEST_")
    && typeof value.message === "string"
    && (value.severity === "error" || value.severity === "warning")
    && (value.suggestion === undefined || typeof value.suggestion === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
