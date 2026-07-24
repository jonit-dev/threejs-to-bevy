import type { ICommandResult } from "./diagnostics.js";

export const SUMMARY_STDOUT_MAX_BYTES = 4 * 1024;

interface ICommandSummaryDiagnostic {
  code: string;
  fix?: {
    instruction: string;
  };
  message: string;
  severity: "error" | "info" | "warning";
}

interface ICommandSummary {
  artifacts: string[];
  code: string;
  diagnostics: ICommandSummaryDiagnostic[];
  schema: "threenative.command-summary";
  status: "failed" | "ok";
  version: "0.1.0";
}

const MAX_DIAGNOSTICS = 3;
const MAX_ARTIFACTS = 5;
const MAX_CODE_BYTES = 128;
const MAX_MESSAGE_BYTES = 320;
const MAX_ARTIFACT_BYTES = 192;

export function projectCommandResultSummary(result: ICommandResult): ICommandResult {
  const payload = parsePayload(result.stdout);
  if (payload === undefined) {
    return {
      exitCode: result.exitCode === 0 ? 2 : result.exitCode,
      stdout: renderSummary({
        artifacts: [],
        code: "TN_COMMAND_SUMMARY_OUTPUT_INVALID",
        diagnostics: [{
          code: "TN_COMMAND_SUMMARY_OUTPUT_INVALID",
          message: "The command declared summary support but did not return one JSON object.",
          severity: "error",
        }],
        schema: "threenative.command-summary",
        status: "failed",
        version: "0.1.0",
      }),
    };
  }

  const diagnostics = summaryDiagnostics(payload, result.exitCode);
  const summary: ICommandSummary = {
    artifacts: summaryArtifacts(payload),
    code: primaryCode(payload, diagnostics, result.exitCode),
    diagnostics,
    schema: "threenative.command-summary",
    status: result.exitCode === 0 ? "ok" : "failed",
    version: "0.1.0",
  };
  return {
    exitCode: result.exitCode,
    stdout: renderSummary(summary),
  };
}

function parsePayload(stdout: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function primaryCode(payload: Record<string, unknown>, diagnostics: readonly ICommandSummaryDiagnostic[], exitCode: number): string {
  if (typeof payload.code === "string" && payload.code !== "") return bounded(payload.code, MAX_CODE_BYTES);
  if (diagnostics[0] !== undefined) return diagnostics[0].code;
  return exitCode === 0 ? "TN_COMMAND_OK" : "TN_COMMAND_FAILED";
}

function summaryDiagnostics(payload: Record<string, unknown>, exitCode: number): ICommandSummaryDiagnostic[] {
  const candidates = Array.isArray(payload.diagnostics)
    ? payload.diagnostics
    : exitCode === 0 ? [] : [payload];
  return candidates
    .filter(isRecord)
    .slice(0, MAX_DIAGNOSTICS)
    .map((diagnostic) => {
      const suggestion = typeof diagnostic.suggestion === "string" ? diagnostic.suggestion : undefined;
      const suggestedFix = typeof diagnostic.suggestedFix === "string" ? diagnostic.suggestedFix : undefined;
      const structuredInstruction = isRecord(diagnostic.fix) && typeof diagnostic.fix.instruction === "string"
        ? diagnostic.fix.instruction
        : undefined;
      return {
        code: typeof diagnostic.code === "string" ? bounded(diagnostic.code, 128) : "TN_COMMAND_DIAGNOSTIC",
        ...(structuredInstruction === undefined && suggestedFix === undefined && suggestion === undefined
          ? {}
          : { fix: { instruction: bounded(structuredInstruction ?? suggestedFix ?? suggestion ?? "", MAX_MESSAGE_BYTES) } }),
        message: bounded(
          typeof diagnostic.message === "string"
            ? diagnostic.message
            : typeof diagnostic.code === "string" ? diagnostic.code : "Command failed.",
          MAX_MESSAGE_BYTES,
        ),
        severity: diagnostic.severity === "warning" || diagnostic.severity === "info"
          ? diagnostic.severity
          : "error",
      };
    });
}

function summaryArtifacts(payload: Record<string, unknown>): string[] {
  const artifacts: string[] = [];
  collectArtifactStrings(payload.artifacts, artifacts);
  collectNamedArtifactStrings(payload, artifacts);
  return [...new Set(artifacts)].slice(0, MAX_ARTIFACTS);
}

function collectNamedArtifactStrings(value: unknown, artifacts: string[]): void {
  if (artifacts.length >= MAX_ARTIFACTS || !isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (key === "artifacts") continue;
    if (/(?:artifact|bundle|manifest|output|proof|report|screenshot|trace)(?:s|files?)?(?:path)?$/iu.test(key)) {
      collectArtifactStrings(item, artifacts);
    } else if (isRecord(item)) {
      collectNamedArtifactStrings(item, artifacts);
    }
  }
}

function collectArtifactStrings(value: unknown, artifacts: string[]): void {
  if (artifacts.length >= MAX_ARTIFACTS || value === undefined || value === null) return;
  if (typeof value === "string") {
    const artifact = boundedArtifact(value, MAX_ARTIFACT_BYTES);
    if (!artifacts.includes(artifact)) artifacts.push(artifact);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectArtifactStrings(item, artifacts);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) collectArtifactStrings(item, artifacts);
  }
}

function boundedArtifact(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  const half = Math.floor((maxBytes - 3) / 2);
  const prefix = bounded(value, half);
  const reversedSuffix = bounded([...value].reverse().join(""), half);
  return `${prefix.replace(/\.\.\.$/u, "")}...${[...reversedSuffix.replace(/\.\.\.$/u, "")].reverse().join("")}`;
}

function renderSummary(summary: ICommandSummary): string {
  const candidates: ICommandSummary[] = [
    summary,
    {
      ...summary,
      artifacts: summary.artifacts.map((artifact) => bounded(artifact, 128)),
      diagnostics: summary.diagnostics.map((diagnostic) => ({
        code: bounded(diagnostic.code, 64),
        ...(diagnostic.fix === undefined ? {} : { fix: { instruction: bounded(diagnostic.fix.instruction, 192) } }),
        message: bounded(diagnostic.message, 192),
        severity: diagnostic.severity,
      })),
    },
    {
      ...summary,
      artifacts: summary.artifacts.map((artifact) => bounded(artifact, 96)),
      diagnostics: summary.diagnostics.map((diagnostic) => ({
        code: bounded(diagnostic.code, 48),
        ...(diagnostic.fix === undefined ? {} : { fix: { instruction: bounded(diagnostic.fix.instruction, 96) } }),
        message: bounded(diagnostic.message, 96),
        severity: diagnostic.severity,
      })),
    },
  ];
  for (const candidate of candidates) {
    const stdout = `${JSON.stringify(candidate)}\n`;
    if (Buffer.byteLength(stdout, "utf8") <= SUMMARY_STDOUT_MAX_BYTES) return stdout;
  }
  throw new Error("Minimal command summary exceeded its fixed stdout budget.");
}

function bounded(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  const suffix = "...";
  let result = "";
  for (const character of value) {
    if (Buffer.byteLength(result + character + suffix, "utf8") > maxBytes) break;
    result += character;
  }
  return `${result}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
