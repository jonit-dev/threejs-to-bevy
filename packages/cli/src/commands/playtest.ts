import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";
import { chromium } from "playwright";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { buildProofArtifactMetadata, type IProofArtifactMetadata } from "../game/proofManifest.js";
import { evaluateRichPlaytestAssertions, type IPlaytestAssertionResult, type IPlaytestDiagnostic, type IPlaytestObservations } from "./playtestAssertions.js";
import { defaultPlaytestArtifactDirectory, writePlaytestArtifactBundle, type IPlaytestArtifactBundle } from "./playtestArtifacts.js";
import { discoverPlaytestTargets, suggestPlaytestScenario, type IPlaytestDiscoveryReport } from "./playtestDiscovery.js";
import { applyScenarioOverrides, loadPlaytestScenario, oneShotScenario, parsePlaytestTarget, parseViewport, PlaytestScenarioError, type IPlaytestScenario } from "./playtestScenario.js";
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
    resourceSnapshot?(id: string): unknown;
    runtimeDiagnosticsSnapshot?(): unknown;
    uiNodeSnapshot?(id: string): unknown;
  } | undefined;
}

type Vec3 = [number, number, number];
type MovementAxis = "x" | "y" | "z";

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
  expectAxis?: string;
  expectMoved: boolean;
  follow?: IPlaytestFollowReport;
  frames: number;
  input: string;
  movementDelta?: Vec3;
  movementThreshold: number;
  observations?: IPlaytestObservations;
  pass: boolean;
  proofMetadata?: IProofArtifactMetadata;
  reproduceCommand?: string;
  runtime: "web";
  scenario?: string;
  target?: string;
  url?: string;
}

export interface IPlaytestCommandOptions {
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
  press: string;
  projectPath: string;
  scenario: IPlaytestScenario;
}

export async function playtestCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IPlaytestCommandOptions = {},
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolvePath(cwd, readFlag(normalizedArgv, "--project") ?? ".");
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
  const discover = normalizedArgv.includes("--discover");
  const suggestScenario = readFlag(normalizedArgv, "--suggest-scenario");
  const watchMode = normalizedArgv.includes("--watch");
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
    if (scenario.target !== "web") {
      return diagnosticResult(
        {
          code: "TN_PLAYTEST_TARGET_UNSUPPORTED",
          message: `Playtest target '${scenario.target}' is recognized but no runner exists yet.`,
          suggestion: "Use --target web until native trace capture is implemented.",
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
    const runner = options.runner ?? runWebPlaytest;
    const started = Date.now();
    const report = await runner({
      artifactDirectory: runDirectory,
      debugColliders,
      entityId: primary.entityId,
      ...(primary.expectAxis === undefined ? {} : { expectAxis: primary.expectAxis }),
      expectMoved: primary.expectMoved,
      ...(primary.follow === undefined ? {} : { follow: primary.follow }),
      frames: primary.frames,
      movementThreshold: primary.movementThreshold,
      press: primary.press ?? "",
      projectPath,
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
      commandParameters: { command: "tn playtest", debugColliders, entity: primary.entityId, expectAxis: primary.expectAxis, expectMoved: primary.expectMoved, follow: primary.follow?.entityId, followWithin: primary.follow?.within, frames: primary.frames, movementThreshold: primary.movementThreshold, press: primary.press, scenario: scenarioPath, target: scenario.target },
      projectPath,
    });
    const reportWithMetadata: IPlaytestReport = {
      ...reportWithAssertions,
      proofMetadata,
    };
    const bundle = await writePlaytestArtifactBundle({ durationMs: Date.now() - started, projectPath, proofMetadata, report: reportWithMetadata, runDirectory, scenario });
    return {
      exitCode: reportWithMetadata.pass ? 0 : 1,
      stdout: json
        ? `${JSON.stringify(bundle.summary, null, 2)}\n`
        : `${reportWithMetadata.pass ? "Playtest passed" : "Playtest failed"}: ${report.entity} moved ${report.distance.toFixed(4)} units. Artifacts: ${bundle.artifacts.directory}\n`,
    };
  } catch (error) {
    if (error instanceof PlaytestScenarioError) {
      return diagnosticResult({ ...error.diagnostic }, { exitCode: 2, json, stderr: !json });
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
    await page.waitForTimeout(Math.max(120, options.scenario.warmupFrames * (1000 / 60)));
    const observationIds = scenarioObservationIds(options.scenario);
    const beforeResources = await readResourceSnapshots(page, observationIds.resources);
    const beforeHud = await readHudSnapshots(page, observationIds.hud);
    const before = await readTransformSample(page, options.entityId);
    const followBefore = options.follow === undefined ? undefined : await readTransformSample(page, options.follow.entityId);
    await page.screenshot({ path: beforeArtifact });
    for (const step of options.scenario.steps) {
      if (step.press !== undefined) {
        await dispatchKeyboardCode(page, "keydown", step.press);
        await page.waitForTimeout(Math.max(1, step.holdFrames ?? options.frames) * (1000 / 60));
        if (step.release) {
          await dispatchKeyboardCode(page, "keyup", step.press);
        }
      }
      if (step.waitFrames !== undefined) {
        await page.waitForTimeout(step.waitFrames * (1000 / 60));
      }
    }
    await page.waitForTimeout(3000);
    const after = await readTransformSample(page, options.entityId);
    const followAfter = options.follow === undefined ? undefined : await readTransformSample(page, options.follow.entityId);
    const debugColliderCount = await page.evaluate(() => globalThis.__THREENATIVE_RUNTIME__?.debugColliderCount);
    const effectLog = await readEffectLog(page);
    const runtimeDiagnostics = await readRuntimeDiagnostics(page);
    const observations: IPlaytestObservations = {
      console: consoleEntries,
      ...(typeof debugColliderCount === "number" ? { debugColliderCount } : {}),
      effectLog,
      hud: mergeSnapshots(beforeHud, await readHudSnapshots(page, observationIds.hud)),
      network: networkEntries,
      resources: mergeSnapshots(beforeResources, await readResourceSnapshots(page, observationIds.resources)),
      runtimeDiagnostics,
    };
    await page.screenshot({ path: artifact });
    await writeFile(resolve(options.artifactDirectory, "console.json"), `${JSON.stringify(consoleEntries, null, 2)}\n`, "utf8");
    await writeFile(resolve(options.artifactDirectory, "network.json"), `${JSON.stringify(networkEntries, null, 2)}\n`, "utf8");
    await writeFile(resolve(options.artifactDirectory, "effect-log.json"), `${JSON.stringify(effectLog ?? {}, null, 2)}\n`, "utf8");
    await writeFile(resolve(options.artifactDirectory, "runtime-trace.json"), `${JSON.stringify(runtimeDiagnostics ?? {}, null, 2)}\n`, "utf8");
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
      ...(options.expectAxis === undefined ? {} : { expectAxis: options.expectAxis }),
      expectMoved: options.expectMoved,
      ...(follow === undefined ? {} : { follow }),
      frames: options.frames,
      input: options.press,
      ...(movementDelta === undefined ? {} : { movementDelta }),
      movementThreshold: options.movementThreshold,
      observations,
      pass: !hasErrors,
      runtime: "web",
      scenario: options.scenario.name,
      target: options.scenario.target,
      url: options.url,
    };
  } finally {
    await browser.close();
  }
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

function unique(values: readonly string[]): string[] {
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
  const position = value.position.slice(0, 3).map((item) => (typeof item === "number" && Number.isFinite(item) ? item : Number.NaN));
  return position.every(Number.isFinite) ? position as Vec3 : undefined;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class BrowserUnavailableError extends Error {}
