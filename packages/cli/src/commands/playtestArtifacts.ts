import { mkdir, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { IProofArtifactMetadata } from "../game/proofManifest.js";
import type { IPlaytestReport } from "./playtest.js";
import type { IPlaytestScenario } from "./playtestScenario.js";

export interface IPlaytestArtifactBundle {
  afterScreenshot: string;
  beforeScreenshot: string;
  console: string;
  contactSheet: string;
  directory: string;
  effectLog: string;
  manifest: string;
  network: string;
  nativeFrameSamples: string;
  nativeRecording: string;
  nativeRecordingDirectory: string;
  observations: string;
  runtimeTrace: string;
  summary: string;
}

export interface IPlaytestSummary extends IPlaytestReport {
  artifacts: IPlaytestArtifactBundle;
  assertions: Array<{ id: string; pass: boolean; details?: Record<string, unknown> }>;
  code: "TN_PLAYTEST_FAILED" | "TN_PLAYTEST_OK";
  durationMs: number;
  reproduceCommand: string;
  scenario: string;
  target: string;
}

export function defaultPlaytestArtifactDirectory(projectPath: string, scenarioName: string, stableArtifacts: boolean): string {
  return resolve(projectPath, "artifacts", "playtest", safeFilePart(scenarioName), stableArtifacts ? "latest" : runId());
}

export async function writePlaytestArtifactBundle(options: {
  durationMs: number;
  projectPath: string;
  proofMetadata?: IProofArtifactMetadata;
  report: IPlaytestReport;
  runDirectory: string;
  scenario: IPlaytestScenario;
}): Promise<{ artifacts: IPlaytestArtifactBundle; summary: IPlaytestSummary }> {
  await mkdir(options.runDirectory, { recursive: true });
  const artifacts: IPlaytestArtifactBundle = {
    afterScreenshot: resolve(options.runDirectory, "after.png"),
    beforeScreenshot: resolve(options.runDirectory, "before.png"),
    console: resolve(options.runDirectory, "console.json"),
    contactSheet: resolve(options.runDirectory, "contact-sheet.png"),
    directory: options.runDirectory,
    effectLog: resolve(options.runDirectory, "effect-log.json"),
    manifest: resolve(options.runDirectory, "manifest.json"),
    network: resolve(options.runDirectory, "network.json"),
    nativeFrameSamples: resolve(options.runDirectory, "native-frame-samples.json"),
    nativeRecording: resolve(options.runDirectory, "native-recording.json"),
    nativeRecordingDirectory: resolve(options.runDirectory, "native-recording"),
    observations: resolve(options.runDirectory, "observations.json"),
    runtimeTrace: resolve(options.runDirectory, "runtime-trace.json"),
    summary: resolve(options.runDirectory, "summary.json"),
  };
  await writeJsonIfMissing(artifacts.console, []);
  await writeJsonIfMissing(artifacts.network, []);
  await writeJsonIfMissing(artifacts.runtimeTrace, {
    performance: options.report.performance ?? null,
    runtimeDiagnostics: options.report.observations?.runtimeDiagnostics ?? null,
  });
  await writeJsonIfMissing(artifacts.effectLog, options.report.effectLog ?? {});
  await writeJson(artifacts.nativeFrameSamples, nativeFrameSamples(options.report) ?? { samples: [], summaries: {} });
  await writeJson(artifacts.observations, {
    after: options.report.after ?? null,
    before: options.report.before ?? null,
    debugColliderCount: options.report.debugColliderCount ?? null,
    distance: options.report.distance,
    ...(options.report.observations === undefined ? {} : options.report.observations),
    follow: options.report.follow ?? null,
    movementDelta: options.report.movementDelta ?? null,
    performance: options.report.performance ?? null,
  });
  const summary: IPlaytestSummary = {
    ...options.report,
    artifact: options.report.artifact ?? artifacts.afterScreenshot,
    artifacts,
    assertions: buildAssertions(options.report),
    code: options.report.pass ? "TN_PLAYTEST_OK" : "TN_PLAYTEST_FAILED",
    durationMs: options.durationMs,
    proofMetadata: options.proofMetadata,
    reproduceCommand: reproduceCommand(options.projectPath, options.scenario, options.runDirectory),
    scenario: options.scenario.name,
    target: options.scenario.target,
  };
  await writeJson(artifacts.summary, summary);
  await writeJson(artifacts.manifest, {
    artifacts: await artifactEntries(options.projectPath, artifacts),
    code: summary.code,
    pass: summary.pass,
    scenario: options.scenario.name,
    target: options.scenario.target,
  });
  return { artifacts, summary };
}

function nativeFrameSamples(report: IPlaytestReport): unknown {
  const runtimeDiagnostics = report.observations?.runtimeDiagnostics;
  if (!isRecord(runtimeDiagnostics)) {
    return undefined;
  }
  return runtimeDiagnostics.nativeFrameSamples;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildAssertions(report: IPlaytestReport): Array<{ id: string; pass: boolean; details?: Record<string, unknown> }> {
  const diagnostics = report.diagnostics.map((diagnostic) => diagnostic.code);
  const assertions: Array<{ id: string; pass: boolean; details?: Record<string, unknown> }> = [
    {
      details: { distance: report.distance, threshold: report.movementThreshold },
      id: "movement",
      pass: !diagnostics.includes("TN_PLAYTEST_INPUT_NO_EFFECT") && !diagnostics.includes("TN_PLAYTEST_AXIS_NO_EFFECT") && !diagnostics.includes("TN_PLAYTEST_ENTITY_NOT_FOUND"),
    },
  ];
  if (report.follow !== undefined) {
    assertions.push({
      details: { entity: report.follow.entity, separation: report.follow.separation, within: report.follow.within },
      id: "camera",
      pass: !diagnostics.includes("TN_PLAYTEST_FOLLOW_ENTITY_NOT_FOUND") && !diagnostics.includes("TN_PLAYTEST_FOLLOW_STATIC") && !diagnostics.includes("TN_PLAYTEST_FOLLOW_SEPARATION"),
    });
  }
  return [...assertions, ...(report.assertionResults ?? [])];
}

function reproduceCommand(projectPath: string, scenario: IPlaytestScenario, runDirectory: string): string {
  const scenarioArg = scenario.sourcePath === undefined ? undefined : relative(projectPath, scenario.sourcePath);
  const outArg = relative(projectPath, runDirectory);
  return scenarioArg === undefined
    ? `tn playtest --project . --entity ${scenario.subject ?? ""} --press ${scenario.steps.find((step) => step.press !== undefined)?.press ?? ""} --out ${outArg} --json`
    : `tn playtest --project . --scenario ${scenarioArg} --out ${outArg} --json`;
}

async function artifactEntries(projectPath: string, artifacts: IPlaytestArtifactBundle): Promise<Record<string, { byteSize: number; path: string }>> {
  const entries = Object.entries(artifacts).filter(([key]) => key !== "directory");
  const result: Record<string, { byteSize: number; path: string }> = {};
  for (const [key, artifactPath] of entries) {
    try {
      const artifactStat = await stat(artifactPath);
      result[key] = { byteSize: artifactStat.size, path: relative(projectPath, artifactPath) };
    } catch {
      result[key] = { byteSize: 0, path: relative(projectPath, artifactPath) };
    }
  }
  return result;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonIfMissing(path: string, value: unknown): Promise<void> {
  try {
    await stat(path);
  } catch {
    await writeJson(path, value);
  }
}

function runId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}
