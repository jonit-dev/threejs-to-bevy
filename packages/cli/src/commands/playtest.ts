import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { once } from "node:events";
import type { ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { startWebPreview, summarizeFrameTimings, type IFrameTimingSummary, type IWebPreviewServer } from "@threenative/runtime-web-three";
import { chromium } from "playwright";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { buildProofArtifactMetadata, type IProofArtifactMetadata } from "../game/proofManifest.js";
import { runBevyRuntime, type BevyRuntimeRunner } from "../native/bevy.js";
import { analyzeNonblank } from "../verify/imageAnalysis.js";
import { readPngFrame } from "../verify/compareImages.js";
import { evaluateRichPlaytestAssertions, type IPlaytestAssertionResult, type IPlaytestDiagnostic, type IPlaytestObservations } from "./playtestAssertions.js";
import { defaultPlaytestArtifactDirectory, readPlaytestSummary, writePlaytestArtifactBundle, type IPlaytestArtifactBundle, type IPlaytestSummary } from "./playtestArtifacts.js";
import { discoverPlaytestTargets, suggestPlaytestScenario, type IPlaytestDiscoveryReport } from "./playtestDiscovery.js";
import { playtestScaffoldCommand } from "./playtestScaffold.js";
import { applyScenarioOverrides, loadPlaytestScenario, oneShotScenario, parsePlaytestTarget, parseViewport, PlaytestScenarioError, type IPlaytestScenario } from "./playtestScenario.js";
import { playtestSchemaCommand } from "./playtestSchema.js";
import { createPlaytestTargetRunner } from "./playtestTargets.js";
import { playtestWatchCommand, readPlaytestWatchMaxRuns, type IPlaytestWatchHooks } from "./playtestWatch.js";

declare global {
  // Browser preview global exposed by @threenative/runtime-web-three.
  // The CLI reads it through Playwright to verify gameplay effects.
  var __THREENATIVE_EFFECT_LOG__: unknown;
  var __THREENATIVE_READY__: {
    runtimeDiagnostics?: unknown;
  } | undefined;
  var __THREENATIVE_RUNTIME__: {
    debugColliderCount?: number;
    entityWorldPosition?(id: string): Vec3 | undefined;
    performanceSnapshot?(): unknown;
    resourceSnapshot?(id: string): unknown;
    resetPerformanceTrace?(): void;
    runtimeObservationSnapshot?(): unknown;
    runtimeDiagnosticsSnapshot?(): unknown;
    writeAuditSnapshot?(): unknown;
    setEntityTransform?(id: string, transform: { position?: Vec3; rotation?: [number, number, number, number]; scale?: Vec3 }): boolean;
    uiNodeSnapshot?(id: string): unknown;
  } | undefined;
}

type Vec3 = [number, number, number];
type MovementAxis = "x" | "y" | "z";

const ITERATE_NOTICE = "Standalone playtest is subsumed by tn iterate --project . --json for the normal agent verify loop.";

export interface IAxisExpectation {
  axis: MovementAxis;
  sign?: 1 | -1;
}

export interface IFollowExpectation {
  entityId: string;
  within: number;
}

interface ITransformSample {
  frame: number;
  position: Vec3;
  tick: number;
}

export interface IPlaytestFollowReport {
  after?: ITransformSample;
  before?: ITransformSample;
  entity: string;
  moved?: number;
  separation?: number;
  within: number;
}

export interface IPlaytestNativeRecordingFrame {
  byteSize?: number;
  index: number;
  path: string;
  tick: number;
}

export interface IPlaytestNativeRecording {
  directory: string;
  frames: IPlaytestNativeRecordingFrame[];
  manifest: string;
  mode: "png-sequence";
}

export interface IPlaytestPerformanceReport extends IFrameTimingSummary {
  measurement?: "headless-browser-cadence" | "native-proof-harness-cadence";
  note?: string;
  renderer?: {
    drawCalls?: number;
    geometries?: number;
    programs?: number;
    textures?: number;
    triangles?: number;
  };
  scope?: "all-samples" | "steady-state";
  source: "native-proof-harness" | "web-runtime" | "web-runtime-headless";
}

export interface IPlaytestNativeFrameSample {
  diagnostics: number;
  elapsedMs?: number;
  fps?: number;
  frameMs: number;
  tick: number;
  transforms: number;
}

export interface IPlaytestNativeFrameSampleReport {
  budgetMs: number;
  samples: IPlaytestNativeFrameSample[];
  summaries: {
    afterTick10?: IFrameTimingSummary;
    afterTick20?: IFrameTimingSummary;
    all?: IFrameTimingSummary;
    dropFirst?: IFrameTimingSummary;
    startupTicks?: IFrameTimingSummary;
  };
}

export interface IPlaytestReport {
  after?: ITransformSample;
  artifact?: string;
  assertionResults?: IPlaytestAssertionResult[];
  artifacts?: IPlaytestArtifactBundle;
  before?: ITransformSample;
  debugColliderCount?: number;
  debugColliders: boolean;
  diagnostics: IPlaytestDiagnostic[];
  distance: number;
  entity: string;
  effectLog?: unknown;
  writeAudit?: unknown;
  expectAxis?: string;
  expectMoved: boolean;
  follow?: IPlaytestFollowReport;
  frames: number;
  input: string;
  movementDelta?: Vec3;
  movementThreshold: number;
  nativeRecording?: IPlaytestNativeRecording;
  observations?: IPlaytestObservations;
  pass: boolean;
  performance?: IPlaytestPerformanceReport;
  proofMetadata?: IProofArtifactMetadata;
  reproduceCommand?: string;
  runtime: "bevy" | "web";
  scenario?: string;
  target?: string;
  url?: string;
}

export interface IPlaytestCommandOptions {
  bevyRunner?: BevyRuntimeRunner;
  runner?: (options: IPlaytestRunOptions) => Promise<IPlaytestReport>;
  watchHooks?: IPlaytestWatchHooks;
}

export interface IPlaytestRunOptions {
  artifactDirectory: string;
  debugColliders: boolean;
  entityId: string;
  expectAxis?: string;
  expectMoved: boolean;
  follow?: IFollowExpectation;
  frames: number;
  movementThreshold: number;
  nativeRecording: boolean;
  nativeScreenshots: boolean;
  auditWrites?: boolean;
  press: string;
  projectPath: string;
  quiet?: boolean;
  scenario: IPlaytestScenario;
}

export async function playtestCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IPlaytestCommandOptions = {},
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const subcommand = normalizedArgv[0];
  const reportMode = subcommand === "report";
  const projectPath = resolvePath(cwd, readFlag(normalizedArgv, "--project") ?? ".");
  if (subcommand === "schema") {
    return playtestSchemaCommand(normalizedArgv.slice(1));
  }
  if (subcommand === "scaffold") {
    return playtestScaffoldCommand(normalizedArgv.slice(1), cwd);
  }
  if (reportMode) {
    return playtestReportCommand(normalizedArgv.slice(1), projectPath, json);
  }
  const scenarioPath = readFlag(normalizedArgv, "--scenario");
  const entityId = readFlag(normalizedArgv, "--entity");
  const press = readFlag(normalizedArgv, "--press") ?? readFlag(normalizedArgv, "--input");
  const frames = readPositiveInteger(readFlag(normalizedArgv, "--frames"), 60);
  const movementThreshold = readPositiveNumber(readFlag(normalizedArgv, "--movement-threshold"), 0.01);
  const expectAxisRaw = readFlag(normalizedArgv, "--expect-axis");
  const expectAxis = parseAxisExpectation(expectAxisRaw);
  const followEntity = readFlag(normalizedArgv, "--follow");
  const follow = followEntity === undefined ? undefined : { entityId: followEntity, within: readPositiveNumber(readFlag(normalizedArgv, "--follow-within"), 10) };
  const debugColliders = normalizedArgv.includes("--debug") || normalizedArgv.includes("--debug-colliders");
  const expectMoved = normalizedArgv.includes("--expect-moved");
  const targetRaw = readFlag(normalizedArgv, "--target");
  const target = parsePlaytestTarget(targetRaw);
  const viewportRaw = readFlag(normalizedArgv, "--viewport");
  const viewport = parseViewport(viewportRaw);
  const stableArtifacts = normalizedArgv.includes("--stable-artifacts");
  const nativeRecording = normalizedArgv.includes("--native-recording");
  const nativeScreenshots = nativeRecording || normalizedArgv.includes("--native-screenshots");
  const discover = normalizedArgv.includes("--discover");
  const suggestScenario = readFlag(normalizedArgv, "--suggest-scenario");
  const watchMode = normalizedArgv.includes("--watch");
  const effectsMode = readFlag(normalizedArgv, "--effects");
  const auditWrites = normalizedArgv.includes("--audit-writes");
  const includeEffectsStdout = effectsMode === "stdout" || normalizedArgv.includes("--verbose-effects");
  if (effectsMode !== undefined && !["artifact", "artifacts", "stdout"].includes(effectsMode)) {
    return diagnosticResult(
      {
        code: "TN_PLAYTEST_EFFECTS_MODE_INVALID",
        message: "--effects must be one of: artifact, artifacts, stdout.",
        severity: "error",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }
  if (watchMode) {
    return playtestWatchCommand({
      argv: normalizedArgv,
      cwd,
      failFast: normalizedArgv.includes("--fail-fast"),
      hooks: options.watchHooks,
      json,
      maxRuns: readPlaytestWatchMaxRuns(readFlag(normalizedArgv, "--max-runs")),
      passOnce: normalizedArgv.includes("--pass-once"),
      projectPath,
      runOnce: (args) => playtestCommand(args, cwd, { runner: options.runner }),
    });
  }

  if (targetRaw !== undefined && target === undefined) {
    return diagnosticResult(
      {
        code: "TN_PLAYTEST_SCENARIO_INVALID",
        message: "--target must be one of: web, desktop, bevy.",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }
  if (viewportRaw !== undefined && viewport === undefined) {
    return diagnosticResult(
      {
        code: "TN_PLAYTEST_SCENARIO_INVALID",
        message: "--viewport must use WIDTHxHEIGHT, for example 1280x720.",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }
  if (expectAxisRaw !== undefined && expectAxis === undefined) {
    return diagnosticResult(
      {
        code: "TN_PLAYTEST_EXPECT_AXIS_INVALID",
        message: "--expect-axis must be one of: x, y, z, +x, -x, +y, -y, +z, -z.",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }

  try {
    if (discover) {
      const discovery = await discoverPlaytestTargets(projectPath);
      const payload = {
        ...discovery,
        message: discovery.code === "TN_PLAYTEST_DISCOVERY_EMPTY" ? "No strong playtest discovery candidates were found." : "Playtest discovery candidates found.",
        severity: discovery.code === "TN_PLAYTEST_DISCOVERY_EMPTY" ? "warning" : "info",
      };
      return {
        exitCode: 0,
        stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderDiscoveryText(discovery),
      };
    }
    if (suggestScenario !== undefined) {
      const scenario = await suggestPlaytestScenario(projectPath, suggestScenario);
      return {
        exitCode: 0,
        stdout: `${JSON.stringify(scenario, null, 2)}\n`,
      };
    }
    if (scenarioPath === undefined && entityId === undefined) {
      const discovery = await discoverPlaytestTargets(projectPath);
      return diagnosticResult(
        {
          code: "TN_PLAYTEST_ENTITY_REQUIRED",
          message: "No playtest subject/entity was provided.",
          severity: "error",
          suggestion: "Pass --entity <id>, add subject/assert.movement.entity to a scenario, or run tn playtest --discover --json.",
          suggestions: discovery.controllableEntities.slice(0, 5),
        },
        { exitCode: 2, json, stderr: !json },
      );
    }
    if (scenarioPath === undefined && press === undefined) {
      const discovery = await discoverPlaytestTargets(projectPath);
      return diagnosticResult(
        {
          code: "TN_PLAYTEST_INPUT_REQUIRED",
          message: "No playtest input step was provided.",
          severity: "error",
          suggestion: "Pass --press <KeyboardEvent.code>, add a press step to a scenario, or run tn playtest --discover --json.",
          suggestions: discovery.inputs.slice(0, 5),
        },
        { exitCode: 2, json, stderr: !json },
      );
    }
    const scenario = scenarioPath === undefined
      ? oneShotScenario({
          ...(expectAxisRaw === undefined ? {} : { expectAxis: expectAxisRaw }),
          expectMoved,
          ...(follow === undefined ? {} : { follow }),
          frames,
          movementThreshold,
          press: press ?? "",
          subject: entityId ?? "",
          ...(target === undefined ? {} : { target }),
          ...(viewport === undefined ? {} : { viewport }),
        })
      : applyScenarioOverrides(await loadPlaytestScenario(projectPath, scenarioPath), { target, viewport });
    const selectedRunner = createPlaytestTargetRunner(
      scenario.target,
      options.runner ?? runWebPlaytest,
      (runOptions) => runNativePlaytest(runOptions, options.bevyRunner ?? runBevyRuntime),
    );
    if (selectedRunner === undefined) {
      return diagnosticResult(
        {
          code: "TN_PLAYTEST_TARGET_UNSUPPORTED",
          message: `Playtest target '${scenario.target}' is recognized but no runner exists yet.`,
          suggestion: "Use --target web, or run from a CLI build with the native Bevy proof-harness runner available.",
        },
        { exitCode: 2, json, stderr: !json },
      );
    }
    const primary = primaryRunOptions(scenario, { expectMoved, fallbackEntityId: entityId, fallbackFollow: follow, fallbackFrames: frames, fallbackMovementThreshold: movementThreshold, fallbackPress: press });
    if (primary.entityId === undefined) {
      return diagnosticResult(
        {
          code: "TN_PLAYTEST_ENTITY_REQUIRED",
          message: "No playtest subject/entity was provided.",
          suggestion: "Pass --entity <id> or add subject/assert.movement.entity to the scenario.",
        },
        { exitCode: 2, json, stderr: !json },
      );
    }
    if (scenarioPath === undefined && primary.press === undefined) {
      return diagnosticResult(
        {
          code: "TN_PLAYTEST_INPUT_REQUIRED",
          message: "No playtest input step was provided.",
          suggestion: "Pass --press <KeyboardEvent.code> or add a press step to the scenario.",
        },
        { exitCode: 2, json, stderr: !json },
      );
    }
    const runDirectory = resolvePath(projectPath, readFlag(normalizedArgv, "--out") ?? defaultPlaytestArtifactDirectory(projectPath, scenario.name, stableArtifacts));
    const started = Date.now();
    const report = await selectedRunner.run({
      artifactDirectory: runDirectory,
      debugColliders,
      entityId: primary.entityId,
      ...(primary.expectAxis === undefined ? {} : { expectAxis: primary.expectAxis }),
      expectMoved: primary.expectMoved,
      ...(primary.follow === undefined ? {} : { follow: primary.follow }),
      frames: primary.frames,
      movementThreshold: primary.movementThreshold,
      nativeRecording,
      nativeScreenshots,
      auditWrites,
      press: primary.press ?? "",
      projectPath,
      quiet: json,
      scenario,
    });
    const richAssertions = evaluateRichPlaytestAssertions({ report, scenario });
    const allDiagnostics = [...report.diagnostics, ...richAssertions.diagnostics];
    const hasErrors = allDiagnostics.some((diagnostic) => diagnostic.severity === "error");
    const reportWithAssertions: IPlaytestReport = {
      ...report,
      assertionResults: [...(report.assertionResults ?? []), ...richAssertions.assertions],
      diagnostics: allDiagnostics,
      pass: report.pass && !hasErrors,
    };
    const proofMetadata = await buildProofArtifactMetadata({
      commandParameters: { auditWrites, command: "tn playtest", debugColliders, entity: primary.entityId, expectAxis: primary.expectAxis, expectMoved: primary.expectMoved, follow: primary.follow?.entityId, followWithin: primary.follow?.within, frames: primary.frames, movementThreshold: primary.movementThreshold, nativeRecording, nativeScreenshots, press: primary.press, scenario: scenarioPath, target: scenario.target },
      projectPath,
    });
    const reportWithMetadata: IPlaytestReport = {
      ...reportWithAssertions,
      proofMetadata,
    };
    const bundle = await writePlaytestArtifactBundle({ durationMs: Date.now() - started, projectPath, proofMetadata, report: reportWithMetadata, runDirectory, scenario });
    const stdoutPayload = includeEffectsStdout ? withVerboseEffects(bundle.summary, reportWithMetadata) : bundle.summary;
    const next = reportWithMetadata.pass
      ? "tn iterate --project . --json"
      : `tn playtest report --latest --scenario ${scenario.name} --json`;
    const payloadWithNext = { ...stdoutPayload, next, notice: ITERATE_NOTICE };
    return {
      exitCode: reportWithMetadata.pass ? 0 : 1,
      stdout: json
        ? `${JSON.stringify(payloadWithNext, null, 2)}\n`
        : `${reportWithMetadata.pass ? "Playtest passed" : "Playtest failed"}: ${report.entity} moved ${report.distance.toFixed(4)} units. Artifacts: ${bundle.artifacts.directory}\nNext: ${next}\nNotice: ${ITERATE_NOTICE}\n`,
    };
  } catch (error) {
    if (error instanceof PlaytestScenarioError) {
      return diagnosticResult({ ...error.diagnostic }, { exitCode: 2, json, stderr: !json });
    }
    if (error instanceof NativeHarnessError) {
      return diagnosticResult(
        {
          code: "TN_PLAYTEST_NATIVE_CRASH",
          message: error.message,
          phase: error.phase,
          severity: "error",
          suggestion: "Retry the same scenario with --target web for the default authoring loop, or inspect the captured native output and readiness artifact before native release proof.",
        },
        { exitCode: 1, json, stderr: !json },
      );
    }
    return diagnosticResult(
      {
        code: error instanceof BrowserUnavailableError ? "TN_PLAYTEST_BROWSER_UNAVAILABLE" : "TN_PLAYTEST_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      { exitCode: 1, json, stderr: !json },
    );
  }
}

async function playtestReportCommand(argv: readonly string[], projectPath: string, json: boolean): Promise<ICommandResult> {
  const latest = argv.includes("--latest");
  const summaryPath = readFlag(argv, "--summary");
  const scenarioName = readFlag(argv, "--scenario");
  if (!latest && summaryPath === undefined) {
    return diagnosticResult(
      {
        code: "TN_PLAYTEST_REPORT_SOURCE_REQUIRED",
        message: "Pass --latest with --scenario <name>, or pass --summary <artifacts/playtest/.../summary.json>.",
        severity: "error",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }
  if (latest && scenarioName === undefined && summaryPath === undefined) {
    return diagnosticResult(
      {
        code: "TN_PLAYTEST_REPORT_SCENARIO_REQUIRED",
        message: "Pass --scenario <name> when reading the latest playtest report.",
        severity: "error",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }
  const resolvedSummaryPath = summaryPath === undefined
    ? resolvePath(projectPath, `artifacts/playtest/${safePlaytestPathPart(scenarioName ?? "")}/latest/summary.json`)
    : resolvePath(projectPath, summaryPath);
  try {
    const summary = await readPlaytestSummary(resolvedSummaryPath);
    return {
      exitCode: summary.pass ? 0 : 1,
      stdout: json
        ? `${JSON.stringify(summary, null, 2)}\n`
        : `${summary.pass ? "Playtest passed" : "Playtest failed"}: ${summary.scenario}. Summary: ${resolvedSummaryPath}\n`,
    };
  } catch (error) {
    return diagnosticResult(
      {
        code: "TN_PLAYTEST_REPORT_NOT_FOUND",
        message: error instanceof Error ? error.message : String(error),
        path: resolvedSummaryPath,
        severity: "error",
        suggestion: "Run tn playtest --stable-artifacts --json first, or pass --summary to an existing summary.json.",
      },
      { exitCode: 1, json, stderr: !json },
    );
  }
}

function withVerboseEffects(summary: IPlaytestSummary, report: IPlaytestReport): IPlaytestSummary & Pick<IPlaytestReport, "effectLog" | "observations"> {
  return {
    ...summary,
    effectLog: report.effectLog,
    observations: report.observations,
  };
}

function safePlaytestPathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function renderDiscoveryText(discovery: IPlaytestDiscoveryReport): string {
  const lines = [
    discovery.code === "TN_PLAYTEST_DISCOVERY_EMPTY" ? "No strong playtest discovery candidates were found." : "Playtest discovery candidates:",
    `  entities: ${discovery.controllableEntities.slice(0, 5).map((item) => item.id).join(", ") || "(none)"}`,
    `  inputs: ${discovery.inputs.slice(0, 5).map((item) => item.id).join(", ") || "(none)"}`,
    `  cameras: ${discovery.cameras.slice(0, 5).map((item) => item.id).join(", ") || "(none)"}`,
    `  resources: ${discovery.resources.slice(0, 5).map((item) => item.id).join(", ") || "(none)"}`,
    `  hud: ${discovery.hud.slice(0, 5).map((item) => item.id).join(", ") || "(none)"}`,
    `  presets: ${discovery.scenarioPresets.map((item) => item.id).join(", ") || "(none)"}`,
  ];
  return `${lines.join("\n")}\n`;
}

async function runWebPlaytest(options: IPlaytestRunOptions): Promise<IPlaytestReport> {
  const bundlePath = await ensureProjectBundle(options.projectPath);
  let server: IWebPreviewServer | undefined;
  try {
    server = await startWebPreview({ bundlePath, silent: true });
    return await probePreview({ ...options, url: previewUrl(server.url, options.debugColliders) });
  } finally {
    await server?.close();
  }
}

async function runNativePlaytest(options: IPlaytestRunOptions, bevyRunner: BevyRuntimeRunner): Promise<IPlaytestReport> {
  const bundlePath = await ensureProjectBundle(options.projectPath);
  const commandStreamPath = resolve(options.artifactDirectory, "native-proof-harness.json");
  const readinessPath = resolve(options.artifactDirectory, "native-readiness.json");
  const beforeArtifact = resolve(options.artifactDirectory, "before.png");
  const afterArtifact = resolve(options.artifactDirectory, "after.png");
  const recordingPlan = nativeRecordingPlan(options.artifactDirectory, options.scenario);
  const captureTicks = nativeScenarioCaptureTicks(options.scenario);
  const observationIds = scenarioObservationIds(options.scenario);
  const recordingFrames = options.nativeRecording ? recordingPlan.frames : [];
  const screenshotArtifacts = options.nativeScreenshots
    ? { afterArtifact, beforeArtifact, recordingFrames }
    : { recordingFrames };
  await mkdir(options.artifactDirectory, { recursive: true });
  await mkdir(recordingPlan.directory, { recursive: true });
  await rm(readinessPath, { force: true });
  await writeFile(commandStreamPath, `${JSON.stringify(nativeHarnessCommandStream(options.scenario, screenshotArtifacts), null, 2)}\n`, "utf8");
  const process = bevyRunner({
    bundlePath,
    captureOutput: options.quiet,
    proofHarness: {
      commandStreamPath,
      readinessOutPath: readinessPath,
    },
  });
  const readinessSamples = await collectNativeReadiness(process, readinessPath, nativeHarnessTimeoutMs(options.scenario));
  const beforeMode = (options.scenario.setup?.entities?.length ?? 0) > 0 ? "after" : "before";
  const before = transformSampleNearTick(readinessSamples, options.entityId, captureTicks.beforeTick, beforeMode);
  const after = transformSampleNearTick(readinessSamples, options.entityId, captureTicks.afterTick, "after");
  const followBefore = options.follow === undefined ? undefined : transformSampleNearTick(readinessSamples, options.follow.entityId, captureTicks.beforeTick, beforeMode);
  const followAfter = options.follow === undefined ? undefined : transformSampleNearTick(readinessSamples, options.follow.entityId, captureTicks.afterTick, "after");
  const beforeResources = nativeResourceSnapshotsNearTick(readinessSamples, observationIds.resources, captureTicks.beforeTick, beforeMode);
  const afterResources = nativeResourceSnapshotsNearTick(readinessSamples, observationIds.resources, captureTicks.afterTick, "after");
  const diagnostics: IPlaytestDiagnostic[] = readinessSamples
    .flatMap((sample) => Array.isArray(sample.diagnostics) ? sample.diagnostics : [])
    .filter((diagnostic): diagnostic is IPlaytestDiagnostic => isRecord(diagnostic) && typeof diagnostic.code === "string" && typeof diagnostic.message === "string")
    .map((diagnostic) => ({ code: diagnostic.code, message: diagnostic.message, severity: diagnostic.severity === "warning" ? "warning" : "error", suggestion: diagnostic.suggestion }));
  if (before === undefined || after === undefined) {
    diagnostics.push({
      code: "TN_PLAYTEST_ENTITY_NOT_FOUND",
      message: `No native Transform evidence was found for entity '${options.entityId}'.`,
      severity: "error",
      suggestion: "Check the entity id and ensure the native proof harness readiness includes the entity Transform.",
    });
  }
  const nativeRecording = await writeNativeRecordingManifest({ ...recordingPlan, frames: recordingFrames });
  const nativeFrameSamples = nativeFrameSampleReport(readinessSamples);
  const performance = nativePerformanceReport(readinessSamples, options.scenario);
  const screenshotDiagnostics = options.nativeScreenshots
    ? [beforeArtifact, afterArtifact, ...recordingFrames.map((frame) => frame.path)]
    : recordingFrames.map((frame) => frame.path);
  diagnostics.push(...await nativeScreenshotDiagnostics(screenshotDiagnostics));
  const movementDelta = before === undefined || after === undefined ? undefined : delta3(before.position, after.position);
  const distance = movementDelta === undefined ? 0 : length3(movementDelta);
  const follow = options.follow === undefined
    ? undefined
    : {
        ...(followAfter === undefined ? {} : { after: followAfter }),
        ...(followBefore === undefined ? {} : { before: followBefore }),
        entity: options.follow.entityId,
        ...(followBefore === undefined || followAfter === undefined ? {} : { moved: length3(delta3(followBefore.position, followAfter.position)) }),
        ...(followAfter === undefined || after === undefined ? {} : { separation: length3(delta3(after.position, followAfter.position)) }),
        within: options.follow.within,
      };
  diagnostics.push(
    ...evaluateMovementDiagnostics({
      distance,
      entityId: options.entityId,
      expectAxis: parseAxisExpectation(options.expectAxis),
      expectMoved: options.expectMoved,
      follow,
      movementDelta,
      movementThreshold: options.movementThreshold,
      press: options.press,
    }),
  );
  const runtimeDiagnostics = { nativeFrameSamples, readiness: readinessSamples, resources: nativeRuntimeResources(readinessSamples) };
  const gameplayObservations = readinessSamples.at(-1)?.gameplayObservations;
  const effectLog = nativeSceneQueryEffectLog(readinessSamples);
  const writeAudit = options.auditWrites ? nativeRuntimeWriteAudit(readinessSamples) : undefined;
  diagnostics.push(...resourceObservationDiagnostics(diagnostics, runtimeDiagnostics));
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  return {
    ...(after === undefined ? {} : { after }),
    ...(options.nativeScreenshots ? { artifact: afterArtifact } : {}),
    ...(before === undefined ? {} : { before }),
    debugColliders: options.debugColliders,
    diagnostics,
    distance,
    effectLog,
    entity: options.entityId,
    ...(options.expectAxis === undefined ? {} : { expectAxis: options.expectAxis }),
    expectMoved: options.expectMoved,
    ...(follow === undefined ? {} : { follow }),
    frames: options.frames,
    input: options.press,
    ...(movementDelta === undefined ? {} : { movementDelta }),
    movementThreshold: options.movementThreshold,
    nativeRecording,
    ...(writeAudit === undefined ? {} : { writeAudit }),
    observations: {
      console: [],
      effectLog,
      hud: {},
      network: [],
      resources: mergeSnapshots(beforeResources, afterResources),
      ...(gameplayObservations === undefined ? {} : { runtimeObservations: { gameplay: gameplayObservations } }),
      runtimeDiagnostics,
    },
    pass: !hasErrors,
    ...(performance === undefined ? {} : { performance }),
    runtime: "bevy",
    scenario: options.scenario.name,
    target: options.scenario.target,
  };
}

function nativeRuntimeResources(readinessSamples: readonly Record<string, unknown>[]): { declared: string[]; observations: unknown[] } {
  const declared = new Set<string>();
  const observations: unknown[] = [];
  for (const sample of readinessSamples) {
    const resources = isRecord(sample.resources) ? sample.resources : undefined;
    if (Array.isArray(resources?.declared)) {
      for (const item of resources.declared) {
        if (typeof item === "string") {
          declared.add(item);
        }
      }
    }
    if (Array.isArray(resources?.observations)) {
      observations.push(...resources.observations);
    }
  }
  return { declared: [...declared].sort(), observations };
}

function nativeRuntimeWriteAudit(readinessSamples: readonly Record<string, unknown>[]): Record<string, unknown> {
  const latest = readinessSamples.at(-1);
  if (isRecord(latest?.writeAudit)) {
    return latest.writeAudit;
  }
  return {
    observations: [],
    schema: "threenative.runtime-write-audit",
    version: "0.1.0",
  };
}

function nativeResourceSnapshotsNearTick(samples: readonly Record<string, unknown>[], ids: readonly string[], tick: number, mode: "after" | "before"): Record<string, unknown> {
  const sample = readinessSampleNearTick(samples, tick, mode);
  const snapshots = isRecord(sample?.resourceSnapshots)
    ? sample.resourceSnapshots
    : isRecord(sample?.resource_snapshots)
      ? sample.resource_snapshots
      : {};
  const result: Record<string, unknown> = {};
  for (const id of ids) {
    result[id] = Object.hasOwn(snapshots, id) ? snapshots[id] : null;
  }
  return result;
}

function readinessSampleNearTick(samples: readonly Record<string, unknown>[], tick: number, mode: "after" | "before"): Record<string, unknown> | undefined {
  const candidates = samples.filter((sample) => typeof sample.tick === "number");
  if (mode === "before") {
    return candidates.filter((sample) => (sample.tick as number) <= tick).at(-1) ?? candidates[0];
  }
  return candidates.find((sample) => (sample.tick as number) >= tick);
}

export function nativeHarnessCommandStream(scenario: IPlaytestScenario, artifacts: { afterArtifact?: string; beforeArtifact?: string; recordingFrames?: readonly IPlaytestNativeRecordingFrame[] }): unknown {
  const commands: Array<Record<string, unknown>> = [];
  const captureTicks = nativeScenarioCaptureTicks(scenario);
  let tick = captureTicks.beforeTick + 1;
  for (const setup of scenario.setup?.entities ?? []) {
    commands.push({
      entity: setup.entity,
      ...(setup.position === undefined ? {} : { position: setup.position }),
      ...(setup.rotation === undefined ? {} : { rotation: setup.rotation }),
      ...(setup.scale === undefined ? {} : { scale: setup.scale }),
      tick: captureTicks.beforeTick,
      type: "setTransform",
    });
  }
  for (const assertion of scenario.assert?.occluded ?? []) {
    const from = assertion.entity ?? scenario.subject;
    if (from !== undefined && assertion.target !== undefined) {
      commands.push({ from, tick: captureTicks.beforeTick, to: assertion.target, type: "sceneOcclusion" });
    }
  }
  if (artifacts.beforeArtifact !== undefined) {
    commands.push({ path: artifacts.beforeArtifact, tick: captureTicks.beforeTick, type: "screenshot" });
  }
  for (const frame of artifacts.recordingFrames ?? []) {
    commands.push({ path: frame.path, tick: frame.tick, type: "screenshot" });
  }
  for (const step of scenario.steps) {
    if (step.press !== undefined) {
      commands.push({ code: step.press, pressed: true, tick, type: "key" });
      const holdFrames = Math.max(1, step.holdFrames ?? 1);
      tick += holdFrames;
      if (step.release) {
        commands.push({ code: step.press, pressed: false, tick, type: "key" });
      }
    }
    tick += Math.max(0, step.waitFrames ?? 0);
  }
  if (artifacts.afterArtifact !== undefined) {
    commands.push({ path: artifacts.afterArtifact, tick: tick + 1, type: "screenshot" });
  }
  commands.push({ tick: tick + 2, type: "exit" });
  return {
    commands,
    schema: "threenative.native-proof-harness",
    version: "0.1.0",
  };
}

export function nativeSceneQueryEffectLog(samples: readonly Record<string, unknown>[]): { entries: unknown[] } {
  const entries = new Map<string, unknown>();
  for (const sample of samples) {
    const queries = Array.isArray(sample.sceneQueries)
      ? sample.sceneQueries
      : Array.isArray(sample.scene_queries)
        ? sample.scene_queries
        : [];
    for (const query of queries) {
      if (!isRecord(query) || typeof query.from !== "string" || typeof query.to !== "string" || typeof query.hit !== "boolean") continue;
      const entry = {
        payload: {
          request: { entity: query.from, target: query.to },
          result: {
            ...(typeof query.distance === "number" ? { distance: query.distance } : {}),
            ...(typeof query.occluder === "string" ? { entityId: query.occluder } : {}),
            hit: query.hit,
          },
        },
        service: "render.sceneRayQuery",
      };
      entries.set(JSON.stringify(entry), entry);
    }
  }
  return { entries: [...entries.values()] };
}

function nativeRecordingPlan(artifactDirectory: string, scenario: IPlaytestScenario): IPlaytestNativeRecording {
  const directory = resolve(artifactDirectory, "native-recording");
  const manifest = resolve(artifactDirectory, "native-recording.json");
  const { afterTick, beforeTick } = nativeScenarioCaptureTicks(scenario);
  const span = Math.max(1, afterTick - beforeTick);
  const firstRecordingTick = beforeTick + 1;
  const lastRecordingTick = Math.max(firstRecordingTick, afterTick - 1);
  const ticks = unique([
    firstRecordingTick,
    beforeTick + Math.max(1, Math.round(span * 0.25)),
    beforeTick + Math.max(1, Math.round(span * 0.5)),
    beforeTick + Math.max(1, Math.round(span * 0.75)),
    lastRecordingTick,
  ].map((tick) => Math.min(lastRecordingTick, Math.max(firstRecordingTick, tick)))).sort((left, right) => left - right);
  return {
    directory,
    frames: ticks.map((tick, index) => ({
      index,
      path: resolve(directory, `frame-${String(index).padStart(3, "0")}.png`),
      tick,
    })),
    manifest,
    mode: "png-sequence",
  };
}

function nativeScenarioCaptureTicks(scenario: IPlaytestScenario): { afterTick: number; beforeTick: number } {
  const beforeTick = Math.max(5, scenario.warmupFrames);
  let tick = beforeTick + 1;
  for (const step of scenario.steps) {
    if (step.press !== undefined) {
      tick += Math.max(1, step.holdFrames ?? 1);
    }
    tick += Math.max(0, step.waitFrames ?? 0);
  }
  return { afterTick: tick + 1, beforeTick };
}

async function writeNativeRecordingManifest(plan: IPlaytestNativeRecording): Promise<IPlaytestNativeRecording> {
  const frames: IPlaytestNativeRecordingFrame[] = [];
  for (const frame of plan.frames) {
    try {
      const artifact = await stat(frame.path);
      frames.push({ ...frame, byteSize: artifact.size });
    } catch {
      frames.push(frame);
    }
  }
  const recording = { ...plan, frames };
  await writeFile(plan.manifest, `${JSON.stringify(recording, null, 2)}\n`, "utf8");
  return recording;
}

async function nativeScreenshotDiagnostics(paths: readonly string[]): Promise<IPlaytestDiagnostic[]> {
  const diagnostics: IPlaytestDiagnostic[] = [];
  for (const path of paths) {
    try {
      const artifact = await stat(path);
      if (artifact.size === 0) {
        diagnostics.push({
          code: "TN_PLAYTEST_NATIVE_SCREENSHOT_EMPTY",
          message: `Native playtest screenshot artifact is empty: ${path}`,
          severity: "error",
        });
      } else if (await looksLikePng(path)) {
        const nonblank = analyzeNonblank(await readPngFrame(path));
        if (!nonblank.ok) {
          diagnostics.push({
            code: "TN_PLAYTEST_NATIVE_SCREENSHOT_BLANK",
            message: `Native playtest screenshot artifact is visually blank: ${path}`,
            severity: "error",
            suggestion: "Capture after the first rendered frame or inspect native proof harness camera/render readiness.",
          });
        }
      }
    } catch {
      diagnostics.push({
        code: "TN_PLAYTEST_NATIVE_SCREENSHOT_MISSING",
        message: `Native playtest screenshot artifact was not written: ${path}`,
        severity: "error",
        suggestion: "Run on a desktop/headless environment that supports Bevy window screenshots, or inspect native-readiness diagnostics.",
      });
    }
  }
  return diagnostics;
}

async function looksLikePng(path: string): Promise<boolean> {
  const bytes = await readFile(path);
  return bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

async function collectNativeReadiness(process: ChildProcess, readinessPath: string, timeoutMs: number): Promise<Record<string, unknown>[]> {
  const samples: Record<string, unknown>[] = [];
  const output: string[] = [];
  process.stdout?.on("data", (chunk: Buffer | string) => output.push(String(chunk)));
  process.stderr?.on("data", (chunk: Buffer | string) => output.push(String(chunk)));
  const started = Date.now();
  let lastTick: number | undefined;
  let exited = false;
  let exitCode: number | null | undefined;
  let exitSignal: NodeJS.Signals | null | undefined;
  const exitPromise = once(process, "exit").then(([code, signal]) => {
    exitCode = typeof code === "number" ? code : code === null ? null : undefined;
    exitSignal = typeof signal === "string" ? signal as NodeJS.Signals : signal === null ? null : undefined;
    exited = true;
  });
  while (!exited && Date.now() - started < timeoutMs) {
    const sample = await readNativeReadiness(readinessPath);
    const tick = typeof sample?.tick === "number" ? sample.tick : undefined;
    if (sample !== undefined && tick !== lastTick) {
      samples.push(sample);
      lastTick = tick;
    }
    await Promise.race([exitPromise, delay(25)]);
  }
  const finalSample = await readNativeReadiness(readinessPath);
  const finalTick = typeof finalSample?.tick === "number" ? finalSample.tick : undefined;
  if (finalSample !== undefined) {
    if (finalTick !== undefined && finalTick === lastTick && samples.length > 0) {
      samples[samples.length - 1] = finalSample;
    } else {
      samples.push(finalSample);
    }
  }
  if (!exited) {
    process.kill();
    throw new Error(`Native playtest proof harness did not exit within ${timeoutMs}ms.`);
  }
  if (exitCode !== 0) {
    const lastSample = samples.at(-1);
    const phase = typeof lastSample?.phase === "string"
      ? lastSample.phase
      : typeof lastSample?.tick === "number"
        ? `proof-harness tick ${lastSample.tick}`
        : "startup before the first readiness sample";
    const captured = output.join("").trim().split("\n").slice(-6).join("\n");
    throw new NativeHarnessError(
      `Native playtest proof harness exited with ${exitCode === null || exitCode === undefined ? `signal ${exitSignal ?? "unknown"}` : `code ${exitCode}`} during ${phase}.${captured === "" ? "" : ` Last native output:\n${captured}`}`,
      phase,
    );
  }
  return samples;
}

class NativeHarnessError extends Error {
  constructor(message: string, readonly phase: string) {
    super(message);
    this.name = "NativeHarnessError";
  }
}

async function readNativeReadiness(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function transformSampleFromReadiness(sample: Record<string, unknown> | undefined, entityId: string): ITransformSample | undefined {
  if (sample === undefined || !Array.isArray(sample.transforms)) {
    return undefined;
  }
  const transform = sample.transforms
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .find((item) => item.entity === entityId);
  const position = readNativePosition(transform?.position);
  if (position === undefined) {
    return undefined;
  }
  const tick = typeof sample.tick === "number" ? sample.tick : 0;
  return { frame: tick, position, tick };
}

function transformSampleNearTick(samples: readonly Record<string, unknown>[], entityId: string, tick: number, mode: "after" | "before"): ITransformSample | undefined {
  const candidates = samples
    .map((sample) => transformSampleFromReadiness(sample, entityId))
    .filter((sample): sample is ITransformSample => sample !== undefined);
  if (candidates.length === 0) {
    return undefined;
  }
  if (mode === "before") {
    return candidates.filter((sample) => sample.tick <= tick).at(-1) ?? candidates[0];
  }
  return candidates.find((sample) => sample.tick >= tick);
}

function readNativePosition(value: unknown): Vec3 | undefined {
  if (!Array.isArray(value) || value.length < 3) {
    return undefined;
  }
  const position = value.slice(0, 3).map((item) => (typeof item === "number" && Number.isFinite(item) ? roundSample(item) : Number.NaN));
  return position.every(Number.isFinite) ? position as Vec3 : undefined;
}

function nativeHarnessTimeoutMs(scenario: IPlaytestScenario): number {
  const frames = scenario.steps.reduce((total, step) => total + Math.max(1, step.holdFrames ?? 1) + Math.max(0, step.waitFrames ?? 0), scenario.warmupFrames);
  return Math.max(180000, frames * (1000 / 30) + 10000);
}

function nativePerformanceReport(samples: readonly Record<string, unknown>[], scenario: IPlaytestScenario): IPlaytestPerformanceReport | undefined {
  const frameSamples = nativePerformanceSamples(samples, scenario).map((sample) => sample.frameMs);
  if (frameSamples.length === 0) {
    return undefined;
  }
  return {
    ...summarizeFrameTimings(frameSamples),
    measurement: "native-proof-harness-cadence",
    note: "Native proof-harness cadence excludes startup samples and is not a display/vsync FPS measurement.",
    scope: "steady-state",
    source: "native-proof-harness",
  };
}

function nativePerformanceSamples(samples: readonly Record<string, unknown>[], scenario: IPlaytestScenario): IPlaytestNativeFrameSample[] {
  const frameSamples = nativeFrameSamples(samples);
  if (frameSamples.length === 0) {
    return [];
  }
  const { beforeTick } = nativeScenarioCaptureTicks(scenario);
  const postStartup = frameSamples.filter((sample) => sample.tick > Math.max(10, beforeTick));
  if (postStartup.length > 0) {
    return postStartup;
  }
  const postWarmup = frameSamples.filter((sample) => sample.tick > beforeTick);
  return postWarmup.length > 0 ? postWarmup : frameSamples;
}

function nativeFrameSampleReport(samples: readonly Record<string, unknown>[]): IPlaytestNativeFrameSampleReport {
  const frameSamples = nativeFrameSamples(samples);
  return {
    budgetMs: 1000 / 60,
    samples: frameSamples,
    summaries: {
      ...nativeFrameSampleSummary("all", frameSamples),
      ...nativeFrameSampleSummary("dropFirst", frameSamples.slice(1)),
      ...nativeFrameSampleSummary("startupTicks", frameSamples.filter((sample) => sample.tick <= 10)),
      ...nativeFrameSampleSummary("afterTick10", frameSamples.filter((sample) => sample.tick > 10)),
      ...nativeFrameSampleSummary("afterTick20", frameSamples.filter((sample) => sample.tick > 20)),
    },
  };
}

function nativeFrameSampleSummary(key: keyof IPlaytestNativeFrameSampleReport["summaries"], samples: readonly IPlaytestNativeFrameSample[]): Partial<IPlaytestNativeFrameSampleReport["summaries"]> {
  if (samples.length === 0) {
    return {};
  }
  return { [key]: summarizeFrameTimings(samples.map((sample) => sample.frameMs)) };
}

function nativeFrameSamples(samples: readonly Record<string, unknown>[]): IPlaytestNativeFrameSample[] {
  return samples
    .map((sample) => {
      const performance = isRecord(sample.performance) ? sample.performance : undefined;
      const frameMs = readFiniteNumber(performance?.frameMs ?? performance?.frame_ms);
      const tick = readFiniteNumber(sample.tick);
      if (frameMs === undefined || tick === undefined || frameMs < 0) {
        return undefined;
      }
      const elapsedMs = readFiniteNumber(performance?.elapsedMs ?? performance?.elapsed_ms);
      const fps = readFiniteNumber(performance?.fps);
      return {
        diagnostics: Array.isArray(sample.diagnostics) ? sample.diagnostics.length : 0,
        ...(elapsedMs === undefined ? {} : { elapsedMs }),
        ...(fps === undefined ? {} : { fps }),
        frameMs,
        tick,
        transforms: Array.isArray(sample.transforms) ? sample.transforms.length : 0,
      };
    })
    .filter((sample): sample is IPlaytestNativeFrameSample => sample !== undefined);
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function probePreview(options: IPlaytestRunOptions & { url: string }): Promise<IPlaytestReport> {
  const diagnostics: IPlaytestDiagnostic[] = [];
  const artifact = resolve(options.artifactDirectory, "after.png");
  const beforeArtifact = resolve(options.artifactDirectory, "before.png");
  await mkdir(dirname(artifact), { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new BrowserUnavailableError(error instanceof Error ? error.message : String(error));
  }
  try {
    const page = await browser.newPage({ viewport: options.scenario.viewport });
    const consoleEntries: Array<{ text: string; type: string }> = [];
    const networkEntries: Array<{ method: string; url: string }> = [];
    page.on("console", (message) => {
      consoleEntries.push({ text: message.text(), type: message.type() });
    });
    page.on("requestfailed", (request) => {
      networkEntries.push({ method: request.method(), url: request.url() });
    });
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__?.ok)", undefined, { timeout: 10000 });
    } catch {
      diagnostics.push({
        code: "TN_PLAYTEST_RUNTIME_NOT_READY",
        message: "Web runtime did not expose a ready state before playtest input.",
        severity: "error",
        suggestion: "Run tn verify --json or inspect preview runtime diagnostics before playtesting.",
      });
    }
    await page.waitForTimeout(120);
    await resetWebPerformanceTrace(page);
    diagnostics.push(...await applyWebScenarioSetup(page, options.scenario));
    await waitForWebFrameSamples(page, options.scenario.warmupFrames, Math.max(1_000, options.scenario.warmupFrames * (1000 / 15)));
    await resetWebPerformanceTrace(page);
    const observationIds = scenarioObservationIds(options.scenario);
    const beforeResources = await readResourceSnapshots(page, observationIds.resources);
    const beforeHud = await readHudSnapshots(page, observationIds.hud);
    const before = await readTransformSample(page, options.entityId);
    const followBefore = options.follow === undefined ? undefined : await readTransformSample(page, options.follow.entityId);
    await page.screenshot({ path: beforeArtifact });
    for (const step of options.scenario.steps) {
      if (step.press !== undefined) {
        await dispatchKeyboardCode(page, "keydown", step.press);
        await waitForWebFrameAdvance(page, Math.max(1, step.holdFrames ?? options.frames));
        if (step.release) {
          await dispatchKeyboardCode(page, "keyup", step.press);
        }
      }
      if (step.waitFrames !== undefined) {
        await waitForWebFrameAdvance(page, step.waitFrames);
      }
    }
    const after = await readTransformSample(page, options.entityId);
    const followAfter = options.follow === undefined ? undefined : await readTransformSample(page, options.follow.entityId);
    const debugColliderCount = await page.evaluate(() => globalThis.__THREENATIVE_RUNTIME__?.debugColliderCount);
    const effectLog = await readEffectLog(page);
    const runtimeDiagnostics = await readRuntimeDiagnostics(page);
    const runtimeObservations = await readWebRuntimeObservations(page);
    const writeAudit = options.auditWrites === true ? await readWebWriteAudit(page) : undefined;
    const performanceSnapshot = await readWebPerformanceSnapshot(page);
    const performance = webPerformanceReport(performanceSnapshot);
    const observations: IPlaytestObservations = {
      console: consoleEntries,
      ...(typeof debugColliderCount === "number" ? { debugColliderCount } : {}),
      effectLog,
      hud: mergeSnapshots(beforeHud, await readHudSnapshots(page, observationIds.hud)),
      network: networkEntries,
      resources: mergeSnapshots(beforeResources, await readResourceSnapshots(page, observationIds.resources)),
      runtimeObservations,
      runtimeDiagnostics: { diagnostics: runtimeDiagnostics, performance: performanceSnapshot },
    };
    await page.screenshot({ path: artifact });
    await writeFile(resolve(options.artifactDirectory, "console.json"), `${JSON.stringify(consoleEntries, null, 2)}\n`, "utf8");
    await writeFile(resolve(options.artifactDirectory, "network.json"), `${JSON.stringify(networkEntries, null, 2)}\n`, "utf8");
    await writeFile(resolve(options.artifactDirectory, "effect-log.json"), `${JSON.stringify(effectLog ?? {}, null, 2)}\n`, "utf8");
    await writeFile(resolve(options.artifactDirectory, "runtime-trace.json"), `${JSON.stringify({ diagnostics: runtimeDiagnostics ?? {}, performance: performanceSnapshot ?? null }, null, 2)}\n`, "utf8");
    if (writeAudit !== undefined) {
      await writeFile(resolve(options.artifactDirectory, "write-audit.json"), `${JSON.stringify(writeAudit, null, 2)}\n`, "utf8");
    }
    const artifactSize = await stat(artifact);
    if (artifactSize.size === 0) {
      diagnostics.push({ code: "TN_PLAYTEST_SCREENSHOT_EMPTY", message: "Playtest screenshot artifact is empty.", severity: "warning" });
    }
    if (before === undefined || after === undefined) {
      diagnostics.push({
        code: "TN_PLAYTEST_ENTITY_NOT_FOUND",
        message: `No live Transform evidence was found for entity '${options.entityId}'.`,
        severity: "error",
        suggestion: "Check the entity id and ensure an update/fixedUpdate system writes its Transform during the playtest.",
      });
    }
    const movementDelta = before === undefined || after === undefined ? undefined : delta3(before.position, after.position);
    const distance = movementDelta === undefined ? 0 : length3(movementDelta);
    const follow = options.follow === undefined
      ? undefined
      : {
          ...(followAfter === undefined ? {} : { after: followAfter }),
          ...(followBefore === undefined ? {} : { before: followBefore }),
          entity: options.follow.entityId,
          ...(followBefore === undefined || followAfter === undefined ? {} : { moved: length3(delta3(followBefore.position, followAfter.position)) }),
          ...(followAfter === undefined || after === undefined ? {} : { separation: length3(delta3(after.position, followAfter.position)) }),
          within: options.follow.within,
        };
    diagnostics.push(
      ...evaluateMovementDiagnostics({
        distance,
        entityId: options.entityId,
        expectAxis: parseAxisExpectation(options.expectAxis),
        expectMoved: options.expectMoved,
        follow,
        movementDelta,
        movementThreshold: options.movementThreshold,
        press: options.press,
      }),
    );
    diagnostics.push(...resourceObservationDiagnostics(diagnostics, runtimeDiagnostics));
    const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
    return {
      ...(after === undefined ? {} : { after }),
      artifact,
      ...(before === undefined ? {} : { before }),
      ...(typeof debugColliderCount === "number" ? { debugColliderCount } : {}),
      debugColliders: options.debugColliders,
      diagnostics,
      distance,
      entity: options.entityId,
      effectLog,
      ...(writeAudit === undefined ? {} : { writeAudit }),
      ...(options.expectAxis === undefined ? {} : { expectAxis: options.expectAxis }),
      expectMoved: options.expectMoved,
      ...(follow === undefined ? {} : { follow }),
      frames: options.frames,
      input: options.press,
      ...(movementDelta === undefined ? {} : { movementDelta }),
      movementThreshold: options.movementThreshold,
      observations,
      pass: !hasErrors,
      ...(performance === undefined ? {} : { performance }),
      runtime: "web",
      scenario: options.scenario.name,
      target: options.scenario.target,
      url: options.url,
    };
  } finally {
    await browser.close();
  }
}

async function applyWebScenarioSetup(page: import("playwright").Page, scenario: IPlaytestScenario): Promise<IPlaytestDiagnostic[]> {
  const entities = scenario.setup?.entities ?? [];
  if (entities.length === 0) {
    return [];
  }
  const results = await page.evaluate((setupEntities) => {
    return setupEntities.map((setup) => ({
      applied: globalThis.__THREENATIVE_RUNTIME__?.setEntityTransform?.(setup.entity, {
        ...(setup.position === undefined ? {} : { position: setup.position }),
        ...(setup.rotation === undefined ? {} : { rotation: setup.rotation }),
        ...(setup.scale === undefined ? {} : { scale: setup.scale }),
      }) === true,
      entity: setup.entity,
    }));
  }, entities);
  return results
    .filter((result) => !result.applied)
    .map((result) => ({
      code: "TN_PLAYTEST_SETUP_ENTITY_NOT_FOUND",
      message: `Playtest setup could not apply a Transform override for entity '${result.entity}'.`,
      path: `playtests/${scenario.name}.playtest.json/setup/entities`,
      severity: "error" as const,
      suggestion: "Check that the setup entity id exists in the runtime bundle and has a render object.",
    }));
}

export function resourceObservationDiagnostics(diagnostics: readonly IPlaytestDiagnostic[], runtimeDiagnostics: unknown): IPlaytestDiagnostic[] {
  if (!diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_INPUT_NO_EFFECT" || diagnostic.code === "TN_PLAYTEST_AXIS_NO_EFFECT")) {
    return [];
  }
  const resources = runtimeResourceDiagnostics(runtimeDiagnostics);
  if (resources.declared.length === 0) {
    return [];
  }
  const observed = new Set(resources.observations.filter((observation) => observation.kind === "read" || observation.kind === "write").map((observation) => observation.resource));
  return resources.declared
    .filter((resource) => !observed.has(resource))
    .map((resource) => {
      const load = resources.observations.find((observation) => observation.resource === resource && observation.kind === "load");
      return {
        code: "TN_RESOURCE_DECLARED_NOT_OBSERVED",
        message: `Declared resource '${resource}' was not read or written by the runtime during the failing playtest.`,
        artifactPath: "runtime-trace.json",
        observedRuntimePath: `runtime-trace.json/resources/observations[resource=${resource}]`,
        path: `runtime-trace.json/resources/declared/${resource}`,
        resourceId: resource,
        severity: "error" as const,
        suggestion: "Check that the script export containing the resource helper ran for this scenario and that the resource id is literal and declared.",
        ...(load?.system === undefined ? {} : { sourcePath: sourcePathForSystem(load.system), systemId: load.system }),
      };
    });
}

function sourcePathForSystem(systemId: string): string {
  return `content/systems/${systemId}.systems.json`;
}

function runtimeResourceDiagnostics(value: unknown): { declared: string[]; observations: Array<{ kind: string; resource: string; system?: string }> } {
  if (!isRecord(value) || !isRecord(value.resources)) {
    return { declared: [], observations: [] };
  }
  return {
    declared: Array.isArray(value.resources.declared) ? value.resources.declared.filter((item): item is string => typeof item === "string").sort() : [],
    observations: Array.isArray(value.resources.observations)
      ? value.resources.observations.flatMap((item): Array<{ kind: string; resource: string; system?: string }> =>
          isRecord(item) && typeof item.kind === "string" && typeof item.resource === "string"
            ? [{ kind: item.kind, resource: item.resource, ...(typeof item.system === "string" ? { system: item.system } : {}) }]
            : [])
      : [],
  };
}

function primaryRunOptions(
  scenario: IPlaytestScenario,
  fallback: {
    expectMoved: boolean;
    fallbackEntityId?: string;
    fallbackFollow?: IFollowExpectation;
    fallbackFrames: number;
    fallbackMovementThreshold: number;
    fallbackPress?: string;
  },
): {
  entityId?: string;
  expectAxis?: string;
  expectMoved: boolean;
  follow?: IFollowExpectation;
  frames: number;
  movementThreshold: number;
  press?: string;
} {
  const movement = scenario.assert?.movement;
  const camera = scenario.assert?.camera;
  const firstPressStep = scenario.steps.find((step) => step.press !== undefined);
  const entityId = movement?.entity ?? scenario.subject ?? fallback.fallbackEntityId;
  const minDistance = movement?.minDistance ?? fallback.fallbackMovementThreshold;
  const press = firstPressStep?.press ?? fallback.fallbackPress;
  return {
    ...(entityId === undefined ? {} : { entityId }),
    ...(movement?.axis === undefined ? {} : { expectAxis: movement.axis }),
    expectMoved: fallback.expectMoved || movement?.minDistance !== undefined || movement?.axis !== undefined,
    ...(camera?.entity === undefined ? fallback.fallbackFollow === undefined ? {} : { follow: fallback.fallbackFollow } : { follow: { entityId: camera.entity, within: camera.within ?? 10 } }),
    frames: firstPressStep?.holdFrames ?? fallback.fallbackFrames,
    movementThreshold: minDistance,
    ...(press === undefined ? {} : { press }),
  };
}

export function evaluateMovementDiagnostics(input: {
  distance: number;
  entityId: string;
  expectAxis?: IAxisExpectation;
  expectMoved: boolean;
  follow?: IPlaytestFollowReport;
  movementDelta?: Vec3;
  movementThreshold: number;
  press: string;
}): IPlaytestDiagnostic[] {
  const diagnostics: IPlaytestDiagnostic[] = [];
  if (input.expectMoved && input.distance <= input.movementThreshold) {
    diagnostics.push({
      code: "TN_PLAYTEST_INPUT_NO_EFFECT",
      message: `Entity '${input.entityId}' moved ${input.distance.toFixed(6)} units after '${input.press}', below threshold ${input.movementThreshold}.`,
      severity: "error",
      suggestion: "Check input bindings, script action names, and fixed/update schedule wiring.",
    });
  }
  if (input.expectAxis !== undefined && input.movementDelta !== undefined) {
    const rawDelta = input.movementDelta[axisIndex(input.expectAxis.axis)];
    const axisDelta = input.expectAxis.sign === undefined ? Math.abs(rawDelta) : rawDelta * input.expectAxis.sign;
    const direction = `${input.expectAxis.sign === -1 ? "-" : input.expectAxis.sign === 1 ? "+" : ""}${input.expectAxis.axis.toUpperCase()}`;
    if (axisDelta <= input.movementThreshold) {
      diagnostics.push({
        code: "TN_PLAYTEST_AXIS_NO_EFFECT",
        message: `Entity '${input.entityId}' moved ${rawDelta.toFixed(6)} on ${input.expectAxis.axis.toUpperCase()} after '${input.press}', expected motion toward ${direction} above threshold ${input.movementThreshold}.`,
        severity: "error",
        suggestion: `Check that '${input.press}' is bound to movement toward ${direction}, not only idle or autonomous motion.`,
      });
    }
  }
  if (input.follow !== undefined) {
    if (input.follow.moved === undefined || input.follow.separation === undefined) {
      diagnostics.push({
        code: "TN_PLAYTEST_FOLLOW_ENTITY_NOT_FOUND",
        message: `No live Transform evidence was found for follow entity '${input.follow.entity}'.`,
        severity: "error",
        suggestion: "Check the follow entity id and ensure the runtime exposes its world position.",
      });
    } else {
      if (input.follow.moved <= input.movementThreshold && input.distance > input.movementThreshold) {
        diagnostics.push({
          code: "TN_PLAYTEST_FOLLOW_STATIC",
          message: `Follow entity '${input.follow.entity}' moved ${input.follow.moved.toFixed(6)} units while '${input.entityId}' moved ${input.distance.toFixed(6)}.`,
          severity: "error",
          suggestion: "Check the camera/follower rig: it should track the target entity when the target moves.",
        });
      }
      if (input.follow.separation > input.follow.within) {
        diagnostics.push({
          code: "TN_PLAYTEST_FOLLOW_SEPARATION",
          message: `Follow entity '${input.follow.entity}' ended ${input.follow.separation.toFixed(4)} units from '${input.entityId}', beyond --follow-within ${input.follow.within}.`,
          severity: "error",
          suggestion: "Check follow offset/smoothing: the follower should settle near the target after movement stops.",
        });
      }
    }
  }
  return diagnostics;
}

export function parseAxisExpectation(value: string | undefined): IAxisExpectation | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "x" || value === "y" || value === "z") {
    return { axis: value };
  }
  const match = /^([+-])([xyz])$/.exec(value);
  if (match === null) {
    return undefined;
  }
  return { axis: match[2] as MovementAxis, sign: match[1] === "-" ? -1 : 1 };
}

async function dispatchKeyboardCode(page: import("playwright").Page, type: "keydown" | "keyup", code: string): Promise<void> {
  await page.evaluate(
    ({ code: keyboardCode, key, type: eventType }) => {
      const browserGlobal = globalThis as unknown as {
        dispatchEvent(event: unknown): boolean;
        KeyboardEvent: new (type: string, init: Record<string, unknown>) => unknown;
      };
      browserGlobal.dispatchEvent(new browserGlobal.KeyboardEvent(eventType, { bubbles: true, code: keyboardCode, key }));
    },
    { code, key: keyboardKeyFromCode(code), type },
  );
}

function keyboardKeyFromCode(code: string): string {
  if (code === "Space") {
    return " ";
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  return code;
}

function previewUrl(url: string, debugColliders: boolean): string {
  if (!debugColliders) {
    return url;
  }
  const parsed = new URL(url);
  parsed.searchParams.set("debugColliders", "1");
  return parsed.toString();
}

async function ensureProjectBundle(projectPath: string): Promise<string> {
  const config = await loadProjectConfig(projectPath);
  const bundlePath = resolve(projectPath, config.outDir);
  await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  if (!report.ok) {
    throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
  }
  return bundlePath;
}

async function readEffectLog(page: { evaluate<T>(fn: () => T): Promise<T> }): Promise<unknown> {
  return page.evaluate(() => globalThis.__THREENATIVE_EFFECT_LOG__);
}

async function readRuntimeDiagnostics(page: { evaluate<T>(fn: () => T): Promise<T> }): Promise<unknown> {
  return page.evaluate(() => globalThis.__THREENATIVE_RUNTIME__?.runtimeDiagnosticsSnapshot?.() ?? globalThis.__THREENATIVE_READY__?.runtimeDiagnostics ?? null);
}

async function readWebRuntimeObservations(page: { evaluate<T>(fn: () => T): Promise<T> }): Promise<unknown> {
  return page.evaluate(() => globalThis.__THREENATIVE_RUNTIME__?.runtimeObservationSnapshot?.() ?? null);
}

async function readWebWriteAudit(page: { evaluate<T>(fn: () => T): Promise<T> }): Promise<unknown> {
  return page.evaluate(() => globalThis.__THREENATIVE_RUNTIME__?.writeAuditSnapshot?.() ?? null);
}

async function readWebPerformanceSnapshot(page: { evaluate<T>(fn: () => T): Promise<T> }): Promise<unknown> {
  return page.evaluate(() => globalThis.__THREENATIVE_RUNTIME__?.performanceSnapshot?.() ?? null);
}

async function readWebPerformanceSampleCount(page: { evaluate<T>(fn: () => T): Promise<T> }): Promise<number | undefined> {
  const value = await page.evaluate(() => globalThis.__THREENATIVE_RUNTIME__?.performanceSnapshot?.());
  if (!isRecord(value) || !isRecord(value.summary)) {
    return undefined;
  }
  return optionalNumber(value.summary.sampleCount);
}

async function resetWebPerformanceTrace(page: { evaluate<T>(fn: () => T): Promise<T> }): Promise<void> {
  await page.evaluate(() => {
    globalThis.__THREENATIVE_RUNTIME__?.resetPerformanceTrace?.();
  });
}

async function waitForWebFrameAdvance(page: import("playwright").Page, frames: number): Promise<void> {
  const start = await readWebPerformanceSampleCount(page);
  if (start === undefined) {
    await page.waitForTimeout(frames * (1000 / 60));
    return;
  }
  await waitForWebFrameSamples(page, start + frames, Math.max(1_000, frames * (1000 / 15)));
}

async function waitForWebFrameSamples(page: import("playwright").Page, minimumSamples: number, timeoutMs: number): Promise<void> {
  if (minimumSamples <= 0) {
    return;
  }
  try {
    await page.waitForFunction(
      (expected) => {
        const snapshot = globalThis.__THREENATIVE_RUNTIME__?.performanceSnapshot?.();
        return typeof snapshot === "object"
          && snapshot !== null
          && typeof (snapshot as { summary?: { sampleCount?: unknown } }).summary?.sampleCount === "number"
          && (snapshot as { summary: { sampleCount: number } }).summary.sampleCount >= expected;
      },
      minimumSamples,
      { timeout: timeoutMs },
    );
  } catch {
    await page.waitForTimeout(Math.min(timeoutMs, minimumSamples * (1000 / 60)));
  }
}

function webPerformanceReport(snapshot: unknown): IPlaytestPerformanceReport | undefined {
  if (!isRecord(snapshot) || !isRecord(snapshot.summary)) {
    return undefined;
  }
  const summary = snapshot.summary;
  const renderer = isRecord(snapshot.renderer) ? snapshot.renderer : undefined;
  const report: IPlaytestPerformanceReport = {
    averageFrameMs: numberValue(summary.averageFrameMs),
    averageFps: numberValue(summary.averageFps),
    budgetFrameMs: numberValue(summary.budgetFrameMs),
    framesOverBudget: numberValue(summary.framesOverBudget),
    jankFramePercent: numberValue(summary.jankFramePercent),
    measurement: "headless-browser-cadence",
    minFps: numberValue(summary.minFps),
    p95FrameMs: numberValue(summary.p95FrameMs),
    p95Fps: numberValue(summary.p95Fps),
    sampleCount: numberValue(summary.sampleCount),
    source: "web-runtime-headless",
    worstFrameMs: numberValue(summary.worstFrameMs),
  };
  if (renderer !== undefined) {
    report.renderer = {
      drawCalls: optionalNumber(renderer.drawCalls),
      geometries: optionalNumber(renderer.geometries),
      programs: optionalNumber(renderer.programs),
      textures: optionalNumber(renderer.textures),
      triangles: optionalNumber(renderer.triangles),
    };
  }
  return report;
}

async function readResourceSnapshots(page: import("playwright").Page, ids: readonly string[]): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const id of ids) {
    result[id] = await page.evaluate((resourceId) => globalThis.__THREENATIVE_RUNTIME__?.resourceSnapshot?.(resourceId) ?? null, id);
  }
  return result;
}

async function readHudSnapshots(page: import("playwright").Page, ids: readonly string[]): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const id of ids) {
    result[id] = await page.evaluate((nodeId) => globalThis.__THREENATIVE_RUNTIME__?.uiNodeSnapshot?.(nodeId) ?? null, id);
  }
  return result;
}

function mergeSnapshots(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { after?: unknown; before?: unknown }> {
  const result: Record<string, { after?: unknown; before?: unknown }> = {};
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    result[id] = {
      ...(Object.hasOwn(after, id) ? { after: after[id] } : {}),
      ...(Object.hasOwn(before, id) ? { before: before[id] } : {}),
    };
  }
  return result;
}

function scenarioObservationIds(scenario: IPlaytestScenario): { hud: string[]; resources: string[] } {
  return {
    hud: unique((scenario.assert?.hud ?? []).map((assertion) => assertion.id)),
    resources: unique((scenario.assert?.resources ?? []).map((assertion) => assertion.id)),
  };
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

async function readTransformSample(page: import("playwright").Page, entityId: string): Promise<ITransformSample | undefined> {
  const effectSample = latestTransformSample(await readEffectLog(page), entityId);
  const runtimePosition = await page.evaluate((id) => globalThis.__THREENATIVE_RUNTIME__?.entityWorldPosition?.(id) ?? null, entityId) as Vec3 | null;
  if (runtimePosition !== null && Array.isArray(runtimePosition) && runtimePosition.length >= 3 && runtimePosition.every(Number.isFinite)) {
    return {
      frame: effectSample?.frame ?? 0,
      position: runtimePosition,
      tick: effectSample?.tick ?? 0,
    };
  }
  return effectSample;
}

function latestTransformSample(effectLog: unknown, entityId: string): ITransformSample | undefined {
  if (!isRecord(effectLog) || !Array.isArray(effectLog.entries)) {
    return undefined;
  }
  const entries = effectLog.entries
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .filter((entry) => entry.kind === "patch" && entry.command === "setComponent" && entry.component === "Transform" && entry.entity === entityId)
    .map((entry) => ({ entry, position: readPosition(entry.value) }))
    .filter((item): item is { entry: Record<string, unknown>; position: Vec3 } => item.position !== undefined)
    .sort((left, right) => numberValue(right.entry.frame) - numberValue(left.entry.frame) || numberValue(right.entry.tick) - numberValue(left.entry.tick));
  const latest = entries[0];
  if (latest === undefined) {
    return undefined;
  }
  return {
    frame: numberValue(latest.entry.frame),
    position: latest.position,
    tick: numberValue(latest.entry.tick),
  };
}

function readPosition(value: unknown): Vec3 | undefined {
  if (!isRecord(value) || !Array.isArray(value.position) || value.position.length < 3) {
    return undefined;
  }
  const position = value.position.slice(0, 3).map((item) => (typeof item === "number" && Number.isFinite(item) ? roundSample(item) : Number.NaN));
  return position.every(Number.isFinite) ? position as Vec3 : undefined;
}

function roundSample(value: number): number {
  return Number(value.toFixed(6));
}

function delta3(left: Vec3, right: Vec3): Vec3 {
  return [right[0] - left[0], right[1] - left[1], right[2] - left[2]];
}

function length3(delta: Vec3): number {
  const [dx, dy, dz] = delta;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function axisIndex(axis: MovementAxis): 0 | 1 | 2 {
  return axis === "x" ? 0 : axis === "y" ? 1 : 2;
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolvePath(cwd: string, path: string): string {
  return resolve(cwd, path);
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class BrowserUnavailableError extends Error {}
