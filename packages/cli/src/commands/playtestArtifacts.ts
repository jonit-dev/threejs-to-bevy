import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type { IProofArtifactMetadata } from "../game/proofManifest.js";
import type { IPlaytestReport } from "./playtest.js";
import type { IPlaytestScenario } from "./playtestScenario.js";

export interface IPlaytestArtifactBundle {
  afterScreenshot: string;
  beforeScreenshot: string;
  console: string;
  contactSheet?: string;
  directory: string;
  effectLog: string;
  manifest: string;
  network: string;
  nativeFrameSamples: string;
  nativeRecording: string;
  nativeRecordingDirectory: string;
  observations: string;
  runtimeObservations: string;
  runtimeTrace: string;
  summary: string;
  writeAudit?: string;
}

export interface IPlaytestSummary {
  acceptanceId?: string;
  after?: IPlaytestReport["after"];
  artifact?: string;
  artifacts: IPlaytestArtifactBundle;
  missingArtifacts?: string[];
  assertions: Array<{ id: string; pass: boolean; details?: Record<string, unknown> }>;
  code: "TN_PLAYTEST_FAILED" | "TN_PLAYTEST_OK";
  counts: {
    assertionCount: number;
    consoleErrorCount: number;
    diagnosticCount: number;
    effectCount: number;
    networkErrorCount: number;
    runtimeDiagnosticCount: number;
  };
  debugColliderCount?: number;
  debugColliders: boolean;
  diagnostics: IPlaytestReport["diagnostics"];
  distance: number;
  durationMs: number;
  entity: string;
  expectAxis?: string;
  expectMoved: boolean;
  finalPoses: Array<{ entity: string; position: [number, number, number]; tick: number }>;
  follow?: IPlaytestReport["follow"];
  frames: number;
  input: string;
  movementDelta?: IPlaytestReport["movementDelta"];
  movementThreshold: number;
  nativeRecording?: IPlaytestReport["nativeRecording"];
  next: string;
  pass: boolean;
  performance?: IPlaytestReport["performance"];
  proofMetadata?: IProofArtifactMetadata;
  reproduceCommand: string;
  runtime: IPlaytestReport["runtime"];
  schema: "threenative.playtest-summary";
  scenario: string;
  target: string;
  version: "0.1.0";
}

export interface IPlaytestIterateAssertionSummary {
  artifact?: string;
  expected?: unknown;
  id: string;
  observed?: unknown;
  owningSystem?: string;
  pass: boolean;
}

export interface IPlaytestIterateSummary {
  acceptanceId?: string;
  artifact?: string;
  assertions: IPlaytestIterateAssertionSummary[];
  diagnostics: Array<{ code: string; message: string; severity?: string; suggestion?: string }>;
  pass: boolean;
  scenario: string;
  truncated: boolean;
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
  const contactSheet = resolve(options.runDirectory, "contact-sheet.png");
  const artifacts: IPlaytestArtifactBundle = {
    afterScreenshot: resolve(options.runDirectory, "after.png"),
    beforeScreenshot: resolve(options.runDirectory, "before.png"),
    console: resolve(options.runDirectory, "console.json"),
    ...(await pathExistsSince(contactSheet, 0) ? { contactSheet } : {}),
    directory: options.runDirectory,
    effectLog: resolve(options.runDirectory, "effect-log.json"),
    manifest: resolve(options.runDirectory, "manifest.json"),
    network: resolve(options.runDirectory, "network.json"),
    nativeFrameSamples: resolve(options.runDirectory, "native-frame-samples.json"),
    nativeRecording: resolve(options.runDirectory, "native-recording.json"),
    nativeRecordingDirectory: resolve(options.runDirectory, "native-recording"),
    observations: resolve(options.runDirectory, "observations.json"),
    runtimeObservations: resolve(options.runDirectory, "runtime-observations.json"),
    runtimeTrace: resolve(options.runDirectory, "runtime-trace.json"),
    summary: resolve(options.runDirectory, "summary.json"),
    ...(options.report.writeAudit === undefined ? {} : { writeAudit: resolve(options.runDirectory, "write-audit.json") }),
  };
  await writeJsonIfMissing(artifacts.console, []);
  await writeJsonIfMissing(artifacts.network, []);
  await writeJsonIfMissing(artifacts.runtimeTrace, {
    performance: options.report.performance ?? null,
    runtimeDiagnostics: options.report.observations?.runtimeDiagnostics ?? null,
  });
  if (artifacts.writeAudit !== undefined) {
    await writeJson(artifacts.writeAudit, options.report.writeAudit);
  }
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
  await writeJson(artifacts.runtimeObservations, runtimeObservationSidecar(options.report));
  options.report.diagnostics = withDiagnosticArtifactPaths(options.report.diagnostics, artifacts);
  const assertions = buildAssertions(options.report);
  options.report.diagnostics.push(...repeatedAssertionDiagnostics(await readPreviousSummary(artifacts.summary), assertions));
  const { artifacts: summaryArtifacts, missingArtifacts } = await existingArtifacts(artifacts, Date.now() - options.durationMs - 1_000);
  const proofMetadata = options.proofMetadata === undefined ? undefined : {
    ...options.proofMetadata,
    artifactHashes: await artifactHashes(options.projectPath, summaryArtifacts),
    completedAt: new Date().toISOString(),
    startedAt: new Date(Date.now() - options.durationMs).toISOString(),
  };
  const summary: IPlaytestSummary = {
    ...(options.scenario.acceptanceId === undefined ? {} : { acceptanceId: options.scenario.acceptanceId }),
    ...(options.report.after === undefined ? {} : { after: options.report.after }),
    ...((options.report.artifact ?? summaryArtifacts.afterScreenshot) === undefined
      ? {}
      : { artifact: options.report.artifact ?? summaryArtifacts.afterScreenshot }),
    artifacts: summaryArtifacts,
    assertions,
    code: options.report.pass ? "TN_PLAYTEST_OK" : "TN_PLAYTEST_FAILED",
    counts: buildCounts(options.report, assertions),
    ...(options.report.debugColliderCount === undefined ? {} : { debugColliderCount: options.report.debugColliderCount }),
    debugColliders: options.report.debugColliders,
    diagnostics: options.report.diagnostics,
    distance: options.report.distance,
    durationMs: options.durationMs,
    entity: options.report.entity,
    ...(options.report.expectAxis === undefined ? {} : { expectAxis: options.report.expectAxis }),
    expectMoved: options.report.expectMoved,
    finalPoses: buildFinalPoses(options.report),
    ...(options.report.follow === undefined ? {} : { follow: options.report.follow }),
    frames: options.report.frames,
    input: options.report.input,
    ...(options.report.movementDelta === undefined ? {} : { movementDelta: options.report.movementDelta }),
    movementThreshold: options.report.movementThreshold,
    ...(missingArtifacts.length === 0 ? {} : { missingArtifacts }),
    ...(options.report.nativeRecording === undefined ? {} : { nativeRecording: options.report.nativeRecording }),
    next: nextCommand(options.scenario, summaryReportCommand(options.scenario.name)),
    pass: options.report.pass,
    ...(options.report.performance === undefined ? {} : { performance: options.report.performance }),
    ...(proofMetadata === undefined ? {} : { proofMetadata }),
    reproduceCommand: reproduceCommand(options.projectPath, options.scenario, options.runDirectory),
    runtime: options.report.runtime,
    schema: "threenative.playtest-summary",
    scenario: options.scenario.name,
    target: options.scenario.target,
    version: "0.1.0",
  };
  await writeJson(artifacts.summary, summary);
  await writeJson(artifacts.manifest, {
    artifacts: await artifactEntries(options.projectPath, summaryArtifacts),
    code: summary.code,
    pass: summary.pass,
    scenario: options.scenario.name,
    target: options.scenario.target,
  });
  return { artifacts, summary };
}

async function existingArtifacts(artifacts: IPlaytestArtifactBundle, notBeforeMs: number): Promise<{
  artifacts: IPlaytestArtifactBundle;
  missingArtifacts: string[];
}> {
  const kept: Record<string, string> = {};
  const missingArtifacts: string[] = [];
  for (const [name, path] of Object.entries(artifacts)) {
    if (name === "directory" || name === "manifest" || name === "summary" || await pathExistsSince(path, notBeforeMs)) {
      kept[name] = path;
    } else {
      missingArtifacts.push(path);
    }
  }
  return { artifacts: kept as unknown as IPlaytestArtifactBundle, missingArtifacts };
}

async function pathExistsSince(path: string, notBeforeMs: number): Promise<boolean> {
  try {
    return (await stat(path)).mtimeMs >= notBeforeMs;
  } catch {
    return false;
  }
}

async function readPreviousSummary(path: string): Promise<IPlaytestSummary | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as IPlaytestSummary;
  } catch {
    return undefined;
  }
}

function repeatedAssertionDiagnostics(
  previous: IPlaytestSummary | undefined,
  assertions: readonly { id: string; pass: boolean; details?: Record<string, unknown> }[],
): IPlaytestReport["diagnostics"] {
  if (previous === undefined || previous.pass || previous.assertions.length === 0) {
    return [];
  }
  return assertions.flatMap((assertion) => {
    if (assertion.pass) {
      return [];
    }
    const previousAssertion = previous.assertions.find((candidate) => candidate.id === assertion.id && !candidate.pass);
    if (previousAssertion === undefined || stableJson(previousAssertion.details ?? {}) !== stableJson(assertion.details ?? {})) {
      return [];
    }
    return [{
      code: "TN_PLAYTEST_REPEATED_ASSERTION",
      message: `Playtest assertion '${assertion.id}' failed with the same details as the previous run.`,
      path: `artifacts/playtest/${previous.scenario}/latest/summary.json/assertions/${assertion.id}`,
      severity: "warning" as const,
      suggestion: "Use the newest runtime diagnostics and artifact paths before retrying the same playtest unchanged.",
    }];
  });
}

function withDiagnosticArtifactPaths(
  diagnostics: IPlaytestReport["diagnostics"],
  artifacts: IPlaytestArtifactBundle,
): IPlaytestReport["diagnostics"] {
  return diagnostics.map((diagnostic) => {
    const explicitPath = resolveDiagnosticArtifactPath(diagnostic.artifactPath, artifacts);
    if (explicitPath !== undefined) {
      return { ...diagnostic, artifactPath: explicitPath };
    }
    if (diagnostic.artifactPath !== undefined) {
      return diagnostic;
    }
    const artifactPath = defaultDiagnosticArtifactPath(diagnostic.code, artifacts);
    if (artifactPath === undefined) {
      return diagnostic;
    }
    return { ...diagnostic, artifactPath };
  });
}

function resolveDiagnosticArtifactPath(path: string | undefined, artifacts: IPlaytestArtifactBundle): string | undefined {
  switch (path) {
    case "effect-log.json":
      return artifacts.effectLog;
    case "observations.json":
      return artifacts.observations;
    case "runtime-observations.json":
      return artifacts.runtimeObservations;
    case "runtime-trace.json":
      return artifacts.runtimeTrace;
    default:
      return undefined;
  }
}

function defaultDiagnosticArtifactPath(code: string, artifacts: IPlaytestArtifactBundle): string | undefined {
  if (code.includes("RESOURCE") || code.includes("CONTACT") || code.includes("ANIMATION") || code.includes("ROTATION") || code.includes("AXIS")) {
    return artifacts.effectLog;
  }
  if (code.includes("RUNTIME") || code.includes("VISIBILITY")) {
    return artifacts.runtimeTrace;
  }
  if (code.includes("HUD")) {
    return artifacts.observations;
  }
  return undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function nextCommand(scenario: IPlaytestScenario, reportCommand: string): string {
  return scenario.name === "" ? "tn iterate --project . --json" : reportCommand;
}

function summaryReportCommand(scenarioName: string): string {
  return `tn playtest report --latest --scenario ${scenarioName} --json`;
}

export async function readPlaytestSummary(path: string): Promise<IPlaytestSummary> {
  return JSON.parse(await readFile(path, "utf8")) as IPlaytestSummary;
}

export function summarizePlaytestForIterate(summary: IPlaytestSummary, byteBudget = 2048): IPlaytestIterateSummary {
  const payload: IPlaytestIterateSummary = {
    ...(summary.acceptanceId === undefined ? {} : { acceptanceId: summary.acceptanceId }),
    ...(summary.pass ? {} : { artifact: summary.artifacts.summary }),
    assertions: summary.assertions
      .filter((assertion) => !assertion.pass)
      .map((assertion) => assertionSummary(assertion, summary))
      .slice(0, 8),
    diagnostics: summary.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        severity: diagnostic.severity,
        ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
      }))
      .slice(0, 4),
    pass: summary.pass,
    scenario: summary.scenario,
    truncated: false,
  };
  return enforceIterateBudget(payload, byteBudget);
}

function assertionSummary(
  assertion: IPlaytestSummary["assertions"][number],
  summary: IPlaytestSummary,
): IPlaytestIterateAssertionSummary {
  const details = assertion.details ?? {};
  const diagnostic = summary.diagnostics.find((candidate) => diagnosticMatchesAssertion(candidate, assertion.id));
  return {
    expected: expectedFromDetails(details),
    id: assertion.id,
    observed: observedFromDetails(details),
    owningSystem: typeof diagnostic?.systemId === "string" ? diagnostic.systemId : undefined,
    pass: assertion.pass,
  };
}

function expectedFromDetails(details: Record<string, unknown>): unknown {
  if (Object.hasOwn(details, "expected")) return details.expected;
  if (Object.hasOwn(details, "threshold")) return { minDistance: details.threshold };
  if (Object.hasOwn(details, "minVelocity")) return { minVelocity: details.minVelocity };
  if (Object.hasOwn(details, "minCount")) return { minCount: details.minCount };
  if (Object.hasOwn(details, "within")) return { within: details.within };
  if (Object.hasOwn(details, "minProjectedPixels") || Object.hasOwn(details, "maxOffscreenRatio")) {
    return {
      ...(Object.hasOwn(details, "minProjectedPixels") ? { minProjectedPixels: details.minProjectedPixels } : {}),
      ...(Object.hasOwn(details, "maxOffscreenRatio") ? { maxOffscreenRatio: details.maxOffscreenRatio } : {}),
    };
  }
  return undefined;
}

function observedFromDetails(details: Record<string, unknown>): unknown {
  if (Object.hasOwn(details, "after")) return details.after;
  if (Object.hasOwn(details, "distance")) return { distance: details.distance };
  if (Object.hasOwn(details, "velocity")) return { velocity: details.velocity };
  if (Object.hasOwn(details, "count")) return { count: details.count };
  if (Object.hasOwn(details, "separation")) return { separation: details.separation };
  if (Object.hasOwn(details, "projectedPixels") || Object.hasOwn(details, "offscreenRatio")) {
    return {
      ...(Object.hasOwn(details, "projectedPixels") ? { projectedPixels: details.projectedPixels } : {}),
      ...(Object.hasOwn(details, "offscreenRatio") ? { offscreenRatio: details.offscreenRatio } : {}),
    };
  }
  return details;
}

function diagnosticMatchesAssertion(diagnostic: IPlaytestSummary["diagnostics"][number], assertionId: string): boolean {
  const lower = assertionId.toLowerCase();
  return diagnostic.code.toLowerCase().includes(lower.split(".")[0] ?? lower)
    || diagnostic.message.toLowerCase().includes(lower);
}

function enforceIterateBudget(summary: IPlaytestIterateSummary, byteBudget: number): IPlaytestIterateSummary {
  let candidate = summary;
  while (Buffer.byteLength(JSON.stringify(candidate), "utf8") > byteBudget && candidate.diagnostics.length > 0) {
    candidate = { ...candidate, diagnostics: candidate.diagnostics.slice(0, -1), truncated: true };
  }
  while (Buffer.byteLength(JSON.stringify(candidate), "utf8") > byteBudget && candidate.assertions.length > 1) {
    candidate = { ...candidate, assertions: candidate.assertions.slice(0, -1), truncated: true };
  }
  if (Buffer.byteLength(JSON.stringify(candidate), "utf8") <= byteBudget) {
    return candidate;
  }
  return {
    ...(candidate.acceptanceId === undefined ? {} : { acceptanceId: candidate.acceptanceId }),
    artifact: candidate.artifact,
    assertions: candidate.assertions.slice(0, 1).map((assertion) => ({ id: assertion.id, pass: assertion.pass })),
    diagnostics: [],
    pass: candidate.pass,
    scenario: candidate.scenario,
    truncated: true,
  };
}

function nativeFrameSamples(report: IPlaytestReport): unknown {
  const runtimeDiagnostics = report.observations?.runtimeDiagnostics;
  if (!isRecord(runtimeDiagnostics)) {
    return undefined;
  }
  return runtimeDiagnostics.nativeFrameSamples;
}

function runtimeObservationSidecar(report: IPlaytestReport): unknown {
  return {
    generatedBy: "tn playtest",
    observations: readRuntimeProbeObservations(report.observations),
    runtime: report.runtime,
    schema: "threenative.runtime-observations",
    source: "runtime-observation",
    target: report.target ?? report.runtime,
    version: "0.1.0",
  };
}

function readRuntimeProbeObservations(observations: IPlaytestReport["observations"]): unknown {
  if (isRecord(observations?.runtimeObservations)) {
    return observations.runtimeObservations;
  }
  const runtimeDiagnostics = observations?.runtimeDiagnostics;
  if (isRecord(runtimeDiagnostics) && Array.isArray(runtimeDiagnostics.readiness)) {
    const latest = [...runtimeDiagnostics.readiness].reverse().find(isRecord);
    if (isRecord(latest?.runtimeObservations)) {
      return latest.runtimeObservations;
    }
  }
  return { assets: {}, materials: {}, textures: {} };
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

function buildCounts(report: IPlaytestReport, assertions: readonly unknown[]): IPlaytestSummary["counts"] {
  return {
    assertionCount: assertions.length,
    consoleErrorCount: countSeverityLike(report.observations?.console),
    diagnosticCount: report.diagnostics.length,
    effectCount: Array.isArray(report.effectLog) ? report.effectLog.length : objectKeyCount(report.effectLog),
    networkErrorCount: countSeverityLike(report.observations?.network),
    runtimeDiagnosticCount: runtimeDiagnosticCount(report.observations?.runtimeDiagnostics),
  };
}

function buildFinalPoses(report: IPlaytestReport): IPlaytestSummary["finalPoses"] {
  const poses: IPlaytestSummary["finalPoses"] = [];
  if (report.after !== undefined) {
    poses.push({ entity: report.entity, position: report.after.position, tick: report.after.tick });
  }
  if (report.follow?.after !== undefined) {
    poses.push({ entity: report.follow.entity, position: report.follow.after.position, tick: report.follow.after.tick });
  }
  return poses;
}

function countSeverityLike(value: unknown): number {
  if (!Array.isArray(value)) {
    return 0;
  }
  return value.filter((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    const level = String(entry.level ?? entry.type ?? entry.severity ?? entry.status ?? "").toLowerCase();
    return level.includes("error") || level.includes("fail");
  }).length;
}

function objectKeyCount(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }
  return Object.keys(value).length;
}

function runtimeDiagnosticCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (!isRecord(value)) {
    return 0;
  }
  if (Array.isArray(value.diagnostics)) {
    return value.diagnostics.length;
  }
  if (Array.isArray(value.readiness)) {
    return value.readiness.reduce((count, sample) => count + (isRecord(sample) && Array.isArray(sample.diagnostics) ? sample.diagnostics.length : 0), 0);
  }
  return objectKeyCount(value);
}

function reproduceCommand(projectPath: string, scenario: IPlaytestScenario, runDirectory: string): string {
  const scenarioArg = scenario.sourcePath === undefined ? undefined : relative(projectPath, scenario.sourcePath);
  const outArg = relative(projectPath, runDirectory);
  return scenarioArg === undefined
    ? `tn playtest --project . --entity ${scenario.subject ?? ""} --press ${scenario.steps.find((step) => step.press !== undefined)?.press ?? ""} --out ${outArg} --json`
    : `tn playtest --project . --scenario ${scenarioArg} --out ${outArg} --json`;
}

async function artifactEntries(projectPath: string, artifacts: IPlaytestArtifactBundle): Promise<Record<string, { byteSize: number; path: string; sha256?: string }>> {
  const entries = Object.entries(artifacts).filter(([key]) => key !== "directory");
  const result: Record<string, { byteSize: number; path: string; sha256?: string }> = {};
  for (const [key, artifactPath] of entries) {
    try {
      const artifactStat = await stat(artifactPath);
      result[key] = { byteSize: artifactStat.size, path: relative(projectPath, artifactPath), sha256: `sha256-${createHash("sha256").update(await readFile(artifactPath)).digest("hex")}` };
    } catch {
      result[key] = { byteSize: 0, path: relative(projectPath, artifactPath) };
    }
  }
  return result;
}

async function artifactHashes(projectPath: string, artifacts: IPlaytestArtifactBundle): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const [key, artifactPath] of Object.entries(artifacts)) {
    if (key === "directory" || key === "manifest" || key === "summary") continue;
    try {
      hashes[relative(projectPath, artifactPath).split("\\").join("/")] = `sha256-${createHash("sha256").update(await readFile(artifactPath)).digest("hex")}`;
    } catch {}
  }
  return hashes;
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
