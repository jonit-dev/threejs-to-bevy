import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import { createGameAgentInventory, loadAuthoringProject } from "@threenative/authoring";
import { loadBundle, type IWebBundle } from "@threenative/runtime-web-three";

import { type ICommandResult } from "../diagnostics.js";
import { buildProofArtifactMetadata } from "../game/proofManifest.js";
import { readPngFrame } from "../verify/compareImages.js";
import { buildCommand } from "./build.js";
import { doctorCommand } from "./doctor.js";
import { gameScaleCommand } from "./gameScale.js";
import { isPlayerLikeEntityId, isRecord, readFlag } from "./gameShared.js";
import { playtestCommand } from "./playtest.js";
import { analyzeScreenshotComposition, type IScreenshotCompositionMetrics } from "./screenshotMetrics.js";
import { recordCommand, screenshotCommand } from "./visualProof.js";
import { gameQualityMetricBundleFromMetrics } from "../verify/visualMetricBundles.js";

export interface IGameProofStepSpec {
  args: readonly string[];
  command: "artifact-check" | "asset-budget-proof" | "build" | "doctor" | "performance-proof" | "playtest" | "record" | "scale-proof" | "screenshot" | "ui-fit-proof" | "visual-quality-proof";
  id: string;
  phase: "debug" | "gameplay" | "qa" | "release" | "ui" | "visuals";
  required: boolean;
  summary: string;
}

interface IGameProofStepResult {
  args: readonly string[];
  code: string;
  command: string;
  diagnostics: Array<{ code: string; message: string; phase: string; severity: "error" | "warning"; suggestedFix?: string }>;
  durationMs: number;
  evidence?: Record<string, unknown>;
  exitCode: number;
  id: string;
  phase: string;
  stderr: string;
  stdout: string;
  summary: string;
}

interface IGameScenarioCoverageEntry {
  artifactDirectory?: string;
  assertions: string[];
  kind: "committed" | "ephemeral";
  manifest?: string;
  path?: string;
  proofSourceHash?: string;
  reproduceCommand?: string;
  scenario?: string;
  status: "failed" | "passed";
  stepId: string;
  summary?: string;
  target?: string;
}

export interface IGameProofRun {
  scenarioCoverage: {
    kind: "committed" | "ephemeral" | "missing";
    scenarios: IGameScenarioCoverageEntry[];
  };
  diagnostics: Array<{ code: string; message: string; phase: string; severity: "error" | "warning"; suggestedFix?: string }>;
  ok: boolean;
  steps: IGameProofStepResult[];
}

export interface IGameCommandOptions {
  proofRunner?: (step: IGameProofStepSpec, options: { projectPath: string }) => Promise<ICommandResult>;
}

export async function ensureReleaseAssetBudgetProof(projectPath: string): Promise<void> {
  const proofPath = resolve(projectPath, "artifacts/game-production/asset-budget.json");
  if (await pathExists(proofPath) || !(await pathExists(resolve(projectPath, "dist")))) {
    return;
  }
  await writeAssetBudgetProof(
    {
      args: ["artifacts/game-production/asset-budget.json"],
      command: "asset-budget-proof",
      id: "asset-budget",
      phase: "release",
      required: true,
      summary: "Write a lightweight asset and bundle budget proof artifact.",
    },
    projectPath,
    "tn game release",
  );
}

export async function runGameQaProof(argv: readonly string[], projectPath: string, options: IGameCommandOptions): Promise<IGameProofRun> {
  const proofDefaults = await readProjectProofDefaults(projectPath);
  const playtestScenarios = await discoverQaPlaytestScenarios(projectPath, readFlag(argv, "--playtest-scenarios"));
  const steps = buildQaProofSteps(argv, proofDefaults, playtestScenarios);
  const results: IGameProofStepResult[] = [];
  for (const step of steps) {
    const startedAt = Date.now();
    const result = await (options.proofRunner ?? runDefaultProofStep)(step, { projectPath });
    if (step.id === "doctor" && result.exitCode === 0) {
      await writeDoctorProof(projectPath, result);
    }
    results.push({
      args: step.args,
      code: readResultCode(result) ?? (result.exitCode === 0 ? "TN_GAME_QA_STEP_OK" : "TN_GAME_QA_STEP_FAILED"),
      command: step.command,
      diagnostics: proofStepDiagnostics(step, result),
      durationMs: Date.now() - startedAt,
      ...(step.command === "playtest" ? { evidence: playtestEvidence(result) } : {}),
      exitCode: result.exitCode,
      id: step.id,
      phase: step.phase,
      stderr: result.stderr ?? "",
      stdout: result.stdout,
      summary: step.summary,
    });
  }
  const diagnostics = results.flatMap((result) => result.diagnostics);
  return {
    diagnostics,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    scenarioCoverage: buildScenarioCoverage(results),
    steps: results,
  };
}

async function writeDoctorProof(projectPath: string, result: ICommandResult): Promise<void> {
  const outputPath = resolve(projectPath, "artifacts/game-production/doctor.json");
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  const parsed = readResultPayload(result);
  const payload = {
    ...(parsed ?? { rawStdout: result.stdout }),
    generatedBy: "tn game qa --run-proof",
    proofMetadata: await buildProofArtifactMetadata({
      commandParameters: { command: "tn game qa --run-proof", proof: "doctor" },
      projectPath,
    }),
    schema: "threenative.game-doctor-proof",
  };
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildQaProofSteps(argv: readonly string[], proofDefaults: IProofDefaults = {}, playtestScenarios: readonly string[] = []): IGameProofStepSpec[] {
  const url = readFlag(argv, "--url");
  const entity = readFlag(argv, "--entity") ?? proofDefaults.entity;
  const press = normalizeProofPress(readFlag(argv, "--press") ?? proofDefaults.press);
  const expectAxis = readFlag(argv, "--expect-axis") ?? proofDefaults.expectAxis;
  const frames = readFlag(argv, "--frames") ?? proofDefaults.frames ?? "30";
  const playtestSteps: IGameProofStepSpec[] = playtestScenarios.length > 0
    ? playtestScenarios.map((scenario): IGameProofStepSpec => ({
        args: ["--project", ".", "--scenario", scenario, "--stable-artifacts", "--json"],
        command: "playtest",
        id: `playtest:${basename(scenario, ".playtest.json")}`,
        phase: "gameplay",
        required: true,
        summary: `Run focused playtest scenario ${scenario}.`,
      }))
    : [
        entity !== undefined && press !== undefined
          ? {
              args: [
                "--project",
                ".",
                "--entity",
                entity,
                "--press",
                press,
                "--frames",
                frames,
                "--expect-moved",
                ...(expectAxis === undefined ? [] : ["--expect-axis", expectAxis]),
                "--json",
              ],
              command: "playtest",
              id: "playtest",
              phase: "gameplay",
              required: true,
              summary: "Run web input proof and assert the main input path changes state.",
            }
          : missingArgumentStep("playtest", "gameplay", "tn game qa --run-proof requires --entity and --press to execute playtest proof."),
      ];
  const steps: IGameProofStepSpec[] = [
    {
      args: ["--project", ".", "--json"],
      command: "doctor",
      id: "doctor",
      phase: "debug",
      required: true,
      summary: "Inspect project setup, source entrypoint, bundle files, and optional preview diagnostics.",
    },
    {
      args: ["--project", ".", "--json"],
      command: "build",
      id: "build",
      phase: "release",
      required: true,
      summary: "Build the project bundle before visual and interaction proof.",
    },
    ...playtestSteps,
    url !== undefined
      ? {
          args: ["--project", ".", "--url", url, "--out", "artifacts/game-production/screenshot.png", "--wait-ready", "--json"],
          command: "screenshot",
          id: "screenshot",
          phase: "visuals",
          required: true,
          summary: "Capture nonblank screenshot proof from a running web preview.",
        }
      : {
          args: ["artifacts/game-production/screenshot.png"],
          command: "artifact-check",
          id: "screenshot",
          phase: "visuals",
          required: true,
          summary: "Check screenshot proof artifact.",
        },
    url !== undefined
      ? {
          args: ["--project", ".", "--url", url, "--out", "artifacts/game-production/mobile-viewport.png", "--viewport", "mobile", "--wait-ready", "--json"],
          command: "screenshot",
          id: "mobile-viewport",
          phase: "qa",
          required: true,
          summary: "Capture mobile viewport proof from a running web preview.",
        }
      : {
          args: ["artifacts/game-production/mobile-viewport.png"],
          command: "artifact-check",
          id: "mobile-viewport",
          phase: "qa",
          required: true,
          summary: "Check mobile viewport proof artifact.",
        },
    argv.includes("--record") && url !== undefined
      ? {
          args: ["--project", ".", "--url", url, "--out", "artifacts/game-production/motion.webm", "--duration", readFlag(argv, "--duration") ?? "5", "--json"],
          command: "record",
          id: "record",
          phase: "qa",
          required: false,
          summary: "Capture short motion proof from a running web preview.",
        }
      : {
          args: ["artifacts/game-production/motion.webm"],
          command: "artifact-check",
          id: "record",
          phase: "qa",
          required: false,
          summary: "Check for existing motion proof artifact.",
        },
    {
      args: ["artifacts/game-production/visual-quality.json"],
      command: "visual-quality-proof",
      id: "visual-quality",
      phase: "visuals",
      required: true,
      summary: "Analyze screenshot composition metrics for nonblank, visible bounds, color variety, and local contrast.",
    },
    {
      args: ["artifacts/game-production/scale-analysis.json"],
      command: "scale-proof",
      id: "scale-analysis",
      phase: "visuals",
      required: true,
      summary: "Analyze runtime loaded-asset bounds for incoherent relative scale.",
    },
    {
      args: ["artifacts/game-production/performance.json"],
      command: "performance-proof",
      id: "performance",
      phase: "qa",
      required: true,
      summary: "Write a lightweight performance proof artifact from bundle and screenshot evidence.",
    },
    {
      args: ["artifacts/game-production/asset-budget.json"],
      command: "asset-budget-proof",
      id: "asset-budget",
      phase: "release",
      required: true,
      summary: "Write a lightweight asset and bundle budget proof artifact.",
    },
    {
      args: ["artifacts/game-production/ui-fit.json"],
      command: "ui-fit-proof",
      id: "ui-fit",
      phase: "ui",
      required: true,
      summary: "Write a mobile UI fit proof artifact from mobile viewport evidence.",
    },
  ];
  return steps;
}

function normalizeProofPress(press: string | undefined): string | undefined {
  return press?.startsWith("keyboard.") === true ? press.slice("keyboard.".length) : press;
}

interface IProofDefaults {
  entity?: string;
  expectAxis?: string;
  frames?: string;
  press?: string;
}

async function readProjectProofDefaults(projectPath: string): Promise<IProofDefaults> {
  try {
    const parsed = JSON.parse(await readFile(resolve(projectPath, "threenative.config.json"), "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.production) || !Array.isArray(parsed.production.proofCommands)) {
      return inferProofDefaultsFromSource(projectPath);
    }
    const playtestCommand = parsed.production.proofCommands.find((command): command is string => typeof command === "string" && command.includes("tn playtest"));
    if (playtestCommand === undefined) {
      return inferProofDefaultsFromSource(projectPath);
    }
    const tokens = shellWords(playtestCommand);
    return {
      entity: readFlag(tokens, "--entity"),
      expectAxis: readFlag(tokens, "--expect-axis"),
      frames: readFlag(tokens, "--frames"),
      press: readFlag(tokens, "--press"),
    };
  } catch {
    return inferProofDefaultsFromSource(projectPath);
  }
}

async function discoverQaPlaytestScenarios(projectPath: string, pattern: string | undefined): Promise<string[]> {
  const searchPattern = pattern ?? "playtests/*.playtest.json";
  const globIndex = searchPattern.indexOf("*");
  const searchRoot = globIndex === -1 ? searchPattern : searchPattern.slice(0, globIndex);
  const root = resolve(projectPath, searchRoot.replace(/[/\\][^/\\]*$/, ""));
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return pathMatchesScenario(searchPattern) ? [relative(projectPath, root)] : [];
    }
  } catch {
    return [];
  }
  const entries = await readdir(root, { recursive: true });
  return entries
    .map((entry) => relative(projectPath, resolve(root, String(entry))))
    .filter((entry) => pathMatchesScenario(entry))
    .filter((entry) => matchesPlaytestGlob(entry, searchPattern))
    .sort();
}

function pathMatchesScenario(path: string): boolean {
  return path.endsWith(".playtest.json");
}

function matchesPlaytestGlob(path: string, pattern: string): boolean {
  if (!pattern.includes("*")) {
    return path === pattern;
  }
  const [prefix = "", suffix = ""] = pattern.split("*");
  return path.startsWith(prefix) && path.endsWith(suffix);
}

async function inferProofDefaultsFromSource(projectPath: string): Promise<IProofDefaults> {
  const inventory = await createGameAgentInventory({ projectPath });
  const defaults = inferProofPlanDefaults(inventory);
  return {
    entity: defaults.playerId,
    expectAxis: "x",
    press: await inferKeyboardPress(projectPath),
  };
}

async function inferKeyboardPress(projectPath: string): Promise<string | undefined> {
  const project = await loadAuthoringProject({ projectPath });
  const inputDocuments = project.documents.filter((document) => document.kind === "input");
  const actionRows = inputDocuments.flatMap((document) => {
    const data = document.data;
    return isRecord(data) && Array.isArray(data.actions) ? data.actions.filter(isRecord) : [];
  });
  const preferred = actionRows.find((action) => typeof action.id === "string" && ["move-right", "right", "east"].includes(action.id.toLowerCase())) ?? actionRows.find((action) => {
    const id = typeof action.id === "string" ? action.id.toLowerCase() : "";
    return id.includes("move") || id.includes("right") || id.includes("left") || id.includes("up") || id.includes("down");
  });
  const bindings: unknown[] = Array.isArray(preferred?.bindings) ? preferred.bindings : [];
  const keyboard = bindings.find((binding): binding is string => typeof binding === "string" && binding.startsWith("keyboard."));
  return keyboard?.slice("keyboard.".length);
}

function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current !== "") {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current !== "") {
    words.push(current);
  }
  return words;
}

function missingArgumentStep(id: string, phase: IGameProofStepSpec["phase"], summary: string): IGameProofStepSpec {
  return {
    args: [],
    command: "artifact-check",
    id,
    phase,
    required: true,
    summary,
  };
}

async function runDefaultProofStep(step: IGameProofStepSpec, options: { projectPath: string }): Promise<ICommandResult> {
  if (step.args.length === 0) {
    return {
      exitCode: 1,
      stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARGUMENT_MISSING", message: step.summary }, null, 2)}\n`,
    };
  }
  if (step.command === "doctor") {
    return doctorCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  if (step.command === "build") {
    return buildCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  if (step.command === "playtest") {
    return playtestCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  if (step.command === "screenshot") {
    return screenshotCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  if (step.command === "record") {
    return recordCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  if (step.command === "performance-proof") {
    return writePerformanceProof(step, options.projectPath);
  }
  if (step.command === "asset-budget-proof") {
    return writeAssetBudgetProof(step, options.projectPath);
  }
  if (step.command === "visual-quality-proof") {
    return writeVisualQualityProof(step, options.projectPath);
  }
  if (step.command === "scale-proof") {
    return writeScaleProof(step, options.projectPath);
  }
  if (step.command === "ui-fit-proof") {
    return writeUiFitProof(step, options.projectPath);
  }
  const artifact = step.args[0];
  if (artifact === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const artifactPath = isAbsolute(artifact) ? artifact : resolve(options.projectPath, artifact);
  try {
    await access(artifactPath);
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_OK", artifactPath, message: `${step.id} artifact found.` }, null, 2)}\n`,
    };
  } catch {
    return {
      exitCode: step.required ? 1 : 0,
      stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_MISSING", artifactPath, message: `${step.id} artifact is missing.` }, null, 2)}\n`,
    };
  }
}

async function writePerformanceProof(step: IGameProofStepSpec, projectPath: string): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const manifestPath = resolve(projectPath, "dist");
  const screenshotPath = resolve(projectPath, "artifacts/game-production/screenshot.png");
  const mobilePath = resolve(projectPath, "artifacts/game-production/mobile-viewport.png");
  const [screenshot, mobile] = await Promise.all([optionalFileStat(screenshotPath), optionalFileStat(mobilePath)]);
  const runtimePerformanceProof = await writeRuntimePerformanceProof(projectPath);
  const report = {
    schema: "threenative.game-performance-proof",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    proofMetadata: await buildProofArtifactMetadata({
      commandParameters: { command: "tn game qa --run-proof", proof: "performance" },
      projectPath,
    }),
    source: "tn game qa --run-proof",
    targetFps: 60,
    frameBudgetMs: 16.67,
    evidence: {
      distDirectory: await pathExists(manifestPath),
      runtimePerformanceProof,
      screenshot: screenshot === undefined ? null : { byteSize: screenshot.size, path: "artifacts/game-production/screenshot.png" },
      mobileViewport: mobile === undefined ? null : { byteSize: mobile.size, path: "artifacts/game-production/mobile-viewport.png" },
    },
    status: screenshot !== undefined && mobile !== undefined ? "pass" : "warning",
    notes: "This is a lightweight proof artifact for generated-game QA. It records build/screenshot evidence and the default 60 FPS target; use dedicated profiling before claiming device performance.",
  };
  await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ code: "TN_GAME_QA_PERFORMANCE_PROOF_OK", artifactPath: outPath, message: "Performance proof artifact written.", report }, null, 2)}\n`,
  };
}

async function writeRuntimePerformanceProof(projectPath: string): Promise<{ path: string; schema: string; status: string } | null> {
  try {
    const bundlePath = await resolveRuntimeProofBundlePath(projectPath);
    const bundle = await loadBundle(bundlePath);
    const texture = await textureMeasurements(projectPath, bundle);
    const sidecarPath = resolve(projectPath, "artifacts/game-production/performance-proof.json");
    const report = {
      schema: "threenative.performance-proof",
      version: "0.1.0",
      generatedBy: "tn game qa --run-proof",
      targetProfile: targetProfileId(bundle),
      runtime: {
        adapter: "web-three",
        target: "web",
      },
      budgets: performanceProofBudgets(bundle),
      metrics: {
        frameTimeMs: unsupportedPerformanceMetric("TN_PERFORMANCE_GAME_QA_FRAME_TIME_UNSUPPORTED", "Game QA performance proof does not capture runtime frame percentiles; run tn performance proof for measured frame timing."),
        drawCalls: unsupportedPerformanceMetric("TN_PERFORMANCE_GAME_QA_DRAW_CALLS_UNSUPPORTED", "Game QA performance proof does not capture renderer draw calls; run tn performance proof for measured draw counts."),
        drawGroups: unsupportedPerformanceMetric("TN_PERFORMANCE_GAME_QA_DRAW_GROUPS_UNSUPPORTED", "Game QA performance proof does not capture renderer draw groups; run tn performance proof for measured draw groups."),
        visibleInstances: unsupportedPerformanceMetric("TN_PERFORMANCE_GAME_QA_VISIBLE_INSTANCES_UNSUPPORTED", "Game QA performance proof does not capture runtime visible instances; run tn performance proof for measured visibility counts."),
        activeLodBands: { status: "measured", value: activeLodBandsForBundle(bundle) },
        loadedTextureBytes: { status: "measured", value: texture.bytes },
        textureVariants: {
          status: "measured",
          value: {
            loadedBytes: texture.bytes,
            selectedVariantCount: texture.variantCount,
          },
        },
        entityCount: { status: "measured", value: bundle.world.entities.length },
      },
      diagnostics: [],
      status: "pass",
    };
    await mkdir(resolve(sidecarPath, ".."), { recursive: true });
    await writeFile(sidecarPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return {
      path: "artifacts/game-production/performance-proof.json",
      schema: "threenative.performance-proof",
      status: "pass",
    };
  } catch {
    return null;
  }
}

async function resolveRuntimeProofBundlePath(projectPath: string): Promise<string> {
  try {
    const config = JSON.parse(await readFile(resolve(projectPath, "threenative.config.json"), "utf8")) as unknown;
    if (isRecord(config) && typeof config.outDir === "string" && config.outDir.trim().length > 0) {
      return resolve(projectPath, config.outDir);
    }
  } catch {
    // Fall through to the historical generated-game bundle path.
  }
  return resolve(projectPath, "dist/game.bundle");
}

function unsupportedPerformanceMetric(code: string, message: string): { diagnostic: { code: string; message: string; severity: "warning" }; status: "unsupported" } {
  return {
    status: "unsupported",
    diagnostic: {
      code,
      message,
      severity: "warning",
    },
  };
}

function performanceProofBudgets(bundle: IWebBundle): Record<string, number> {
  const performance = bundle.targetProfile.performance;
  return {
    activeLodBands: 8,
    drawCalls: performance?.drawCalls.max ?? 300,
    drawGroups: performance?.instancedGroups.max ?? 120,
    entityCount: 5000,
    frameTimeMsP95: performance?.p95FrameMs.max ?? 24,
    frameTimeMsP99: performance?.worstFrameMs.max ?? 33.4,
    loadedTextureBytes: performance?.textureBytes.max ?? 128 * 1024 * 1024,
    textureVariantBytes: performance?.textureBytes.max ?? 128 * 1024 * 1024,
    visibleInstances: performance?.instances.max ?? 2000,
  };
}

async function textureMeasurements(projectPath: string, bundle: IWebBundle): Promise<{ bytes: number; variantCount: number }> {
  let bytes = 0;
  let variantCount = 0;
  for (const asset of bundle.assets.assets) {
    if (asset.kind !== "texture") {
      continue;
    }
    variantCount += Array.isArray(asset.variants) ? Math.max(1, asset.variants.length) : 1;
    bytes += await optionalByteSize(asset.path === undefined ? undefined : resolve(projectPath, asset.path));
    for (const variant of asset.variants ?? []) {
      bytes += await optionalByteSize(isRecord(variant) && typeof variant.path === "string" ? resolve(projectPath, variant.path) : undefined);
    }
  }
  return { bytes, variantCount };
}

function activeLodBandsForBundle(bundle: IWebBundle): string[] {
  const bands = new Set<string>();
  for (const asset of bundle.assets.assets) {
    const lod = (asset as { lod?: unknown }).lod;
    if (Array.isArray(lod) && lod.length > 0) {
      bands.add("source-asset-lod");
    }
    if (asset.kind === "texture" && Array.isArray(asset.variants) && asset.variants.length > 0) {
      bands.add("texture-variant");
    }
  }
  if (bands.size === 0 && bundle.world.entities.length > 0) {
    bands.add("default");
  }
  return [...bands].sort();
}

function targetProfileId(bundle: IWebBundle): string {
  const profile = bundle.targetProfile as { id?: unknown };
  return typeof profile.id === "string" && profile.id.trim().length > 0 ? profile.id : "bundle-target-profile";
}

async function writeAssetBudgetProof(step: IGameProofStepSpec, projectPath: string, source = "tn game qa --run-proof"): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const [dist, assets, content] = await Promise.all([
    directoryByteStats(resolve(projectPath, "dist")),
    directoryByteStats(resolve(projectPath, "assets")),
    directoryByteStats(resolve(projectPath, "content")),
  ]);
  const report = {
    schema: "threenative.game-asset-budget-proof",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    proofMetadata: await buildProofArtifactMetadata({
      commandParameters: { command: source, proof: "asset-budget" },
      projectPath,
    }),
    source,
    budgets: {
      distBytes: 32 * 1024 * 1024,
      assetBytes: 50 * 1024 * 1024,
      contentBytes: 5 * 1024 * 1024,
    },
    measurements: {
      dist,
      assets,
      content,
    },
    status: dist.exists && dist.byteSize <= 32 * 1024 * 1024 && assets.byteSize <= 50 * 1024 * 1024 && content.byteSize <= 5 * 1024 * 1024 ? "pass" : "warning",
    notes: "This lightweight budget proof records local generated-game bundle/source asset sizes. Use dedicated platform profiling before claiming device memory or load-time budgets.",
  };
  await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ code: "TN_GAME_QA_ASSET_BUDGET_PROOF_OK", artifactPath: outPath, message: "Asset budget proof artifact written.", report }, null, 2)}\n`,
  };
}

async function writeVisualQualityProof(step: IGameProofStepSpec, projectPath: string): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const screenshotPath = resolve(projectPath, "artifacts/game-production/screenshot.png");
  try {
    const frame = await readPngFrame(screenshotPath);
    const metrics = analyzeScreenshotComposition(frame);
    const metricBundles = [gameQualityMetricBundleFromMetrics(metrics)];
    const diagnostics = visualQualityDiagnostics(metrics);
    const hasError = diagnostics.some((diagnostic) => diagnostic.severity === "error");
    const report = {
      schema: "threenative.game-visual-quality-proof",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      proofMetadata: await buildProofArtifactMetadata({
        commandParameters: { command: "tn game qa --run-proof", proof: "visual-quality" },
        projectPath,
      }),
      source: "tn game qa --run-proof",
      screenshot: "artifacts/game-production/screenshot.png",
      metrics,
      metricBundles,
      diagnostics,
      status: hasError ? "blocked" : diagnostics.length > 0 ? "warning" : "pass",
      notes: "This objective screenshot proof catches blank, tiny, flat, or low-contrast captures. It is supporting evidence for human visual review, not an art-quality oracle.",
    };
    await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    return {
      exitCode: hasError ? 1 : 0,
      stdout: `${JSON.stringify({
        code: hasError ? "TN_GAME_QA_VISUAL_QUALITY_BLOCKED" : "TN_GAME_QA_VISUAL_QUALITY_PROOF_OK",
        artifactPath: outPath,
        diagnostics,
        message: hasError ? "Visual quality proof found blocking screenshot issues." : "Visual quality proof artifact written.",
        report,
      }, null, 2)}\n`,
    };
  } catch (error) {
    const diagnostics = [{
      code: "TN_GAME_QA_VISUAL_QUALITY_SCREENSHOT_INVALID",
      message: `Unable to read game-production screenshot PNG: ${error instanceof Error ? error.message : String(error)}.`,
      severity: "error" as const,
    }];
    const report = {
      schema: "threenative.game-visual-quality-proof",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      proofMetadata: await buildProofArtifactMetadata({
        commandParameters: { command: "tn game qa --run-proof", proof: "visual-quality" },
        projectPath,
      }),
      source: "tn game qa --run-proof",
      screenshot: "artifacts/game-production/screenshot.png",
      diagnostics,
      status: "blocked",
    };
    await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    return {
      exitCode: 1,
      stdout: `${JSON.stringify({
        code: "TN_GAME_QA_VISUAL_QUALITY_SCREENSHOT_INVALID",
        artifactPath: outPath,
        diagnostics,
        message: "Visual quality proof requires a valid screenshot PNG.",
        report,
      }, null, 2)}\n`,
    };
  }
}

async function writeScaleProof(step: IGameProofStepSpec, projectPath: string): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  return gameScaleCommand(["--project", projectPath, "--out", outPath, "--json"]);
}

async function writeUiFitProof(step: IGameProofStepSpec, projectPath: string): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const mobilePath = resolve(projectPath, "artifacts/game-production/mobile-viewport.png");
  const mobile = await optionalFileStat(mobilePath);
  const report = {
    schema: "threenative.game-ui-fit-proof",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    proofMetadata: await buildProofArtifactMetadata({
      commandParameters: { command: "tn game qa --run-proof", proof: "ui-fit" },
      projectPath,
    }),
    source: "tn game qa --run-proof",
    viewport: { height: 844, preset: "mobile", width: 390 },
    evidence: {
      mobileViewport: mobile === undefined ? null : { byteSize: mobile.size, path: "artifacts/game-production/mobile-viewport.png" },
    },
    status: mobile === undefined ? "blocked" : "pass",
    notes: "Mobile viewport screenshot exists and was captured through tn screenshot --viewport mobile. Human review or future text-fit metrics should still inspect UI overlap.",
  };
  await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    exitCode: mobile === undefined ? 1 : 0,
    stdout: `${JSON.stringify({
      code: mobile === undefined ? "TN_GAME_QA_UI_FIT_PROOF_MISSING_MOBILE" : "TN_GAME_QA_UI_FIT_PROOF_OK",
      artifactPath: outPath,
      message: mobile === undefined ? "Mobile viewport artifact is missing." : "UI fit proof artifact written.",
      report,
    }, null, 2)}\n`,
  };
}

function visualQualityDiagnostics(metrics: IScreenshotCompositionMetrics): Array<{ code: string; message: string; severity: "error" | "warning"; suggestion?: string }> {
  const diagnostics: Array<{ code: string; message: string; severity: "error" | "warning"; suggestion?: string }> = [];
  if (!metrics.nonblank.ok) {
    diagnostics.push({
      code: "TN_GAME_QA_VISUAL_QUALITY_BLANK",
      message: `Screenshot nonblank ratio ${metrics.nonblank.changedPixelRatio.toFixed(4)} is below ${metrics.nonblank.threshold}.`,
      severity: "error",
      suggestion: "Fix camera, lighting, scene loading, or screenshot timing before accepting visual proof.",
    });
  }
  if (metrics.visibleBoundsAreaRatio < 0.08) {
    diagnostics.push({
      code: "TN_GAME_QA_VISUAL_QUALITY_TINY_SUBJECT",
      message: `Visible projected bounds cover ${(metrics.visibleBoundsAreaRatio * 100).toFixed(1)}% of the screenshot.`,
      severity: "error",
      suggestion: "Improve camera framing, scale, landmarks, or object placement so the playable scene is readable.",
    });
  }
  if (metrics.colorBucketCount < 12) {
    diagnostics.push({
      code: "TN_GAME_QA_VISUAL_QUALITY_LOW_COLOR_VARIETY",
      message: `Screenshot only contains ${metrics.colorBucketCount} coarse color buckets.`,
      severity: "warning",
      suggestion: "Add authored materials, lighting variation, set dressing, or UI/object accents.",
    });
  }
  if (metrics.localContrastRatio < 0.01) {
    diagnostics.push({
      code: "TN_GAME_QA_VISUAL_QUALITY_LOW_CONTRAST",
      message: `Screenshot local contrast ratio ${metrics.localContrastRatio.toFixed(4)} is very low.`,
      severity: "warning",
      suggestion: "Add silhouette contrast, shadows, material detail, boundaries, or readable objective markers.",
    });
  }
  return diagnostics;
}

function resolveProofArtifactPath(step: IGameProofStepSpec, projectPath: string): string | undefined {
  const artifact = step.args[0];
  return artifact === undefined ? undefined : isAbsolute(artifact) ? artifact : resolve(projectPath, artifact);
}

async function optionalFileStat(path: string): Promise<{ size: number } | undefined> {
  try {
    const info = await stat(path);
    return { size: info.size };
  } catch {
    return undefined;
  }
}

async function optionalByteSize(path: string | undefined): Promise<number> {
  if (path === undefined) {
    return 0;
  }
  return (await optionalFileStat(path))?.size ?? 0;
}

async function directoryByteStats(path: string): Promise<{ byteSize: number; exists: boolean; fileCount: number; path: string }> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return { byteSize: info.size, exists: true, fileCount: 1, path };
    }
  } catch {
    return { byteSize: 0, exists: false, fileCount: 0, path };
  }
  const entries = await readdir(path, { withFileTypes: true });
  let byteSize = 0;
  let fileCount = 0;
  for (const entry of entries) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) {
      const childStats = await directoryByteStats(child);
      byteSize += childStats.byteSize;
      fileCount += childStats.fileCount;
    } else if (entry.isFile()) {
      const file = await stat(child);
      byteSize += file.size;
      fileCount += 1;
    }
  }
  return { byteSize, exists: true, fileCount, path };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function rewriteProjectArg(args: readonly string[], projectPath: string): string[] {
  const rewritten = [...args];
  const index = rewritten.indexOf("--project");
  if (index !== -1) {
    rewritten[index + 1] = projectPath;
  }
  return rewritten;
}

function proofStepDiagnostics(
  step: IGameProofStepSpec,
  result: ICommandResult,
): Array<{ code: string; message: string; phase: string; severity: "error" | "warning"; suggestedFix?: string }> {
  const parsed = readResultPayload(result);
  const nestedDiagnostics = Array.isArray(parsed?.diagnostics)
    ? parsed.diagnostics.filter(isRecord).map((diagnostic) => ({
        code: typeof diagnostic.code === "string" ? diagnostic.code : stepFailureCode(step),
        message: typeof diagnostic.message === "string" ? diagnostic.message : `${step.id} proof diagnostic.`,
        phase: step.phase,
        severity: diagnostic.severity === "warning" ? "warning" as const : "error" as const,
        suggestedFix: typeof diagnostic.suggestion === "string" ? diagnostic.suggestion : undefined,
      }))
    : [];
  if (nestedDiagnostics.length > 0) {
    return nestedDiagnostics;
  }
  if (result.exitCode === 0) {
    return [];
  }
  return [
    {
      code: readResultCode(result) ?? stepFailureCode(step),
      message: readResultMessage(result) ?? `${step.summary} failed.`,
      phase: step.phase,
      severity: step.required ? "error" : "warning",
      suggestedFix: stepRepairHint(step),
    },
  ];
}

function playtestEvidence(result: ICommandResult): Record<string, unknown> {
  const parsed = readResultPayload(result);
  if (parsed === undefined) {
    return {};
  }
  const artifacts = isRecord(parsed.artifacts) ? parsed.artifacts : undefined;
  const proofMetadata = isRecord(parsed.proofMetadata) ? parsed.proofMetadata : undefined;
  return {
    assertions: Array.isArray(parsed.assertions)
      ? parsed.assertions
        .filter(isRecord)
        .map((assertion) => typeof assertion.id === "string" ? assertion.id : undefined)
        .filter((id): id is string => id !== undefined)
      : [],
    ...(typeof parsed.scenario === "string" ? { scenario: parsed.scenario } : {}),
    ...(typeof parsed.target === "string" ? { target: parsed.target } : {}),
    ...(typeof parsed.reproduceCommand === "string" ? { reproduceCommand: parsed.reproduceCommand } : {}),
    ...(typeof proofMetadata?.sourceHash === "string" ? { proofSourceHash: proofMetadata.sourceHash } : {}),
    ...(typeof artifacts?.summary === "string" ? { summary: artifacts.summary } : {}),
    ...(typeof artifacts?.directory === "string" ? { directory: artifacts.directory } : {}),
    ...(typeof artifacts?.manifest === "string" ? { manifest: artifacts.manifest } : {}),
  };
}

function buildScenarioCoverage(results: readonly IGameProofStepResult[]): IGameProofRun["scenarioCoverage"] {
  const playtestSteps = results.filter((result) => result.command === "playtest");
  const scenarios = playtestSteps.map((step): IGameScenarioCoverageEntry => {
    const evidence = isRecord(step.evidence) ? step.evidence : {};
    const committedPath = readScenarioPath(step.args);
    return {
      assertions: Array.isArray(evidence.assertions) ? evidence.assertions.filter((item): item is string => typeof item === "string") : [],
      kind: committedPath === undefined ? "ephemeral" : "committed",
      ...(typeof evidence.directory === "string" ? { artifactDirectory: evidence.directory } : {}),
      ...(typeof evidence.manifest === "string" ? { manifest: evidence.manifest } : {}),
      ...(committedPath === undefined ? {} : { path: committedPath }),
      ...(typeof evidence.proofSourceHash === "string" ? { proofSourceHash: evidence.proofSourceHash } : {}),
      ...(typeof evidence.reproduceCommand === "string" ? { reproduceCommand: evidence.reproduceCommand } : {}),
      ...(typeof evidence.scenario === "string" ? { scenario: evidence.scenario } : {}),
      status: step.exitCode === 0 ? "passed" : "failed",
      stepId: step.id,
      ...(typeof evidence.summary === "string" ? { summary: evidence.summary } : {}),
      ...(typeof evidence.target === "string" ? { target: evidence.target } : {}),
    };
  });
  return {
    kind: scenarios.length === 0
      ? "missing"
      : scenarios.every((scenario) => scenario.kind === "committed")
        ? "committed"
        : "ephemeral",
    scenarios,
  };
}

function readScenarioPath(args: readonly string[]): string | undefined {
  const index = args.indexOf("--scenario");
  const value = index === -1 ? undefined : args[index + 1];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stepFailureCode(step: IGameProofStepSpec): string {
  return `TN_GAME_QA_${step.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FAILED`;
}

function stepRepairHint(step: IGameProofStepSpec): string {
  if (step.command === "artifact-check") {
    return `Create or capture ${step.args[0] ?? step.id} before rerunning tn game qa --run-proof.`;
  }
  return `Run the ${step.command} command directly with --json to inspect the failure.`;
}

function readResultPayload(result: ICommandResult): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readResultCode(result: ICommandResult): string | undefined {
  const payload = readResultPayload(result);
  return typeof payload?.code === "string" ? payload.code : undefined;
}

function readResultMessage(result: ICommandResult): string | undefined {
  const payload = readResultPayload(result);
  return typeof payload?.message === "string" ? payload.message : undefined;
}
function inferProofPlanDefaults(inventory: Awaited<ReturnType<typeof createGameAgentInventory>>): { playerId: string } {
  const entityIds = inventory.primaryScene?.entityIds ?? [];
  const playerId = entityIds.find(isPlayerLikeEntityId);
  return {
    playerId: playerId ?? "player",
  };
}
