import { access, readdir, readFile } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";

import { authoringDiagnostic, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";
import { loadAuthoringProject, type IAuthoringProject } from "./project.js";

export const GAME_WORKFLOW_REPORT_SCHEMA = "threenative.game-quality-report";
export const GAME_WORKFLOW_REPORT_VERSION = "0.1.0";

export const GAME_WORKFLOW_PHASE_IDS = ["gameplay", "assets", "visuals", "ui", "debug", "qa", "release"] as const;
export type GameWorkflowPhaseId = typeof GAME_WORKFLOW_PHASE_IDS[number];

export const GAME_VISUAL_SCORECARD_CATEGORY_IDS = [
  "art-direction",
  "hero-player",
  "obstacles-enemies",
  "rewards-interactables",
  "world-environment",
  "materials-textures",
  "lighting-render",
  "vfx-motion",
  "ui-hud",
  "performance",
] as const;
export type GameVisualScorecardCategoryId = typeof GAME_VISUAL_SCORECARD_CATEGORY_IDS[number];

export const GAME_UI_STATE_IDS = [
  "gameplay",
  "pause",
  "settings",
  "loading",
  "fail-retry",
  "win-milestone",
  "touch-controls",
] as const;
export type GameUiStateId = typeof GAME_UI_STATE_IDS[number];

export const GAME_ASSET_AUDIO_SURFACE_IDS = [
  "player-hero",
  "obstacle-enemy",
  "reward-interactable",
  "world-environment",
  "ui-hud",
  "audio-feedback",
] as const;
export type GameAssetAudioSurfaceId = typeof GAME_ASSET_AUDIO_SURFACE_IDS[number];

export type GameProductionMode = "score" | "qa" | "release";
export type GameWorkflowPhaseStatus = "pass" | "warning" | "blocked";
export type GameEvidenceKind = "artifact" | "command" | "source";
export type GameAssetAudioSourcingStatus = "blocked" | "generated" | "hybrid" | "local-file" | "procedural";
export type GameProviderProbeStatus = "available" | "missing-credential" | "not-configured";
export type GameProductionCommandStatus = "available" | "missing-artifact" | "recommended";
export type GameReleaseRiskSeverity = "error" | "warning" | "info";

export interface IGameWorkflowEvidence {
  kind: GameEvidenceKind;
  path?: string;
  command?: string;
  description: string;
}

export interface IGameWorkflowDiagnostic extends IAuthoringDiagnostic {
  phase?: GameWorkflowPhaseId;
  suggestedFix?: string;
}

export interface IGameWorkflowPhaseLedger {
  diagnostics: IGameWorkflowDiagnostic[];
  evidence: IGameWorkflowEvidence[];
  id: GameWorkflowPhaseId;
  score: number;
  status: GameWorkflowPhaseStatus;
  summary: string;
}

export interface IGameVisualScorecardCategory {
  evidence: IGameWorkflowEvidence[];
  id: GameVisualScorecardCategoryId;
  score: 0 | 1 | 2 | 3;
}

export interface IGameUiStateCoverage {
  evidence: IGameWorkflowEvidence[];
  id: GameUiStateId;
  present: boolean;
}

export interface IGameAssetAudioLedgerEntry {
  evidence: IGameWorkflowEvidence[];
  provider?: string;
  sourcePath?: string;
  status: GameAssetAudioSourcingStatus;
  surface: GameAssetAudioSurfaceId;
}

export interface IGameProviderProbe {
  credentialEnv: string;
  id: "elevenlabs" | "gemini" | "tripo";
  purpose: "audio" | "image" | "model";
  status: GameProviderProbeStatus;
}

export interface IGameProductionCommand {
  artifactPath?: string;
  command: string;
  description: string;
  phase: GameWorkflowPhaseId;
  status: GameProductionCommandStatus;
}

export interface IGameReleaseRisk {
  code: string;
  message: string;
  path: string;
  severity: GameReleaseRiskSeverity;
  suggestedFix: string;
}

export interface IGameWorkflowReport {
  assetAudioLedger: IGameAssetAudioLedgerEntry[];
  blockers: IGameWorkflowDiagnostic[];
  diagnostics: IGameWorkflowDiagnostic[];
  evidence: IGameWorkflowEvidence[];
  generatedAt: string;
  mode: GameProductionMode;
  ok: boolean;
  phaseLedgers: IGameWorkflowPhaseLedger[];
  productionCommands: IGameProductionCommand[];
  projectPath: string;
  providerProbes: IGameProviderProbe[];
  release: {
    assetBudgetStatus: "pass" | "unverified";
    buildProof: boolean;
    debugHelperRisk: "blocked" | "clear" | "unverified";
    nativeParity: "not-claimed" | "unverified" | "verified";
    risks: IGameReleaseRisk[];
    riskCount: number;
    staticHostingNotes: string[];
  };
  schema: typeof GAME_WORKFLOW_REPORT_SCHEMA;
  scorecard: IGameVisualScorecardCategory[];
  summary: {
    averageVisualScore: number;
    blockers: number;
    phasesPassed: number;
    totalPhases: number;
    uiStatesCovered: number;
  };
  uiStates: IGameUiStateCoverage[];
  version: typeof GAME_WORKFLOW_REPORT_VERSION;
}

interface ICreateGameQualityReportOptions {
  generatedAt?: string;
  mode?: GameProductionMode;
  providerEnvironment?: Record<string, string | undefined>;
  projectPath: string;
}

interface IProjectEvidenceSnapshot {
  artifactEvidence: IGameWorkflowEvidence[];
  authoring: IAuthoringProject;
  hasBuildProof: boolean;
  hasInputSource: boolean;
  hasMobileProof: boolean;
  hasMotionFeelProof: boolean;
  hasNonPrimitiveVisualSource: boolean;
  hasPlaytestProof: boolean;
  hasScreenshotProof: boolean;
  hasScriptSource: boolean;
  hasSmoothScriptSource: boolean;
  invalidAudioFiles: string[];
  projectOutDir?: string;
  sourceEvidence: IGameWorkflowEvidence[];
  sourceSearchText: string;
}

export async function createGameQualityReport(options: ICreateGameQualityReportOptions): Promise<IGameWorkflowReport> {
  const projectPath = resolve(options.projectPath);
  const snapshot = await inspectGameProject(projectPath);
  const diagnostics: IGameWorkflowDiagnostic[] = [];
  const sourceDiagnostics = snapshot.authoring.diagnostics.map((diagnostic) => ({ ...diagnostic, phase: "debug" as const }));
  diagnostics.push(...sourceDiagnostics);

  const playableEvidence = [
    ...snapshot.sourceEvidence.filter((evidence) => evidence.description.includes("scene") || evidence.description.includes("script") || evidence.description.includes("input")),
    ...snapshot.artifactEvidence.filter((evidence) => evidence.description.includes("playtest")),
  ];
  if (!(snapshot.hasInputSource && snapshot.hasScriptSource && snapshot.hasPlaytestProof)) {
    diagnostics.push(gameDiagnostic({
      code: "TN_GAME_PLAYABLE_LOOP_MISSING",
      message: "Playable-loop proof is incomplete: structured input, script behavior, and playtest artifact evidence are required.",
      path: "/phaseLedgers/gameplay",
      phase: "gameplay",
      suggestedFix: "Declare input in content/input, reference gameplay scripts from structured source, then run tn playtest --json and keep the artifact.",
    }));
  }
  if (!snapshot.hasSmoothScriptSource && !snapshot.hasMotionFeelProof) {
    diagnostics.push(gameDiagnostic({
      code: "TN_GAME_MOTION_FEEL_UNPROVEN",
      message: "Motion feel is unproven: generated games must avoid instant position snaps and provide smooth input response evidence.",
      path: "/phaseLedgers/gameplay",
      phase: "gameplay",
      suggestedFix: "Use fixedDelta-driven velocity, interpolation, MoveToward, or eased move progress in gameplay scripts, then run tn playtest or record a motion artifact.",
    }));
  }

  if (!snapshot.hasScreenshotProof) {
    diagnostics.push(gameDiagnostic({
      code: "TN_GAME_SCREENSHOT_EVIDENCE_MISSING",
      message: "Screenshot evidence is missing for visual scoring.",
      path: "/phaseLedgers/visuals",
      phase: "visuals",
      suggestedFix: "Run tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --json.",
    }));
  }
  if (!snapshot.hasMobileProof) {
    diagnostics.push(gameDiagnostic({
      code: "TN_GAME_MOBILE_PROOF_MISSING",
      message: "Mobile viewport evidence is missing.",
      path: "/phaseLedgers/qa",
      phase: "qa",
      suggestedFix: "Capture a mobile viewport screenshot or QA report under artifacts/game-production/.",
    }));
  }
  if (!snapshot.hasBuildProof) {
    diagnostics.push(gameDiagnostic({
      code: "TN_GAME_RELEASE_BUILD_PROOF_MISSING",
      message: "Release build proof is missing.",
      path: "/phaseLedgers/release",
      phase: "release",
      suggestedFix: "Run tn build --json and keep dist bundle artifacts plus release report evidence.",
    }));
  }

  const uiStates = buildUiStateCoverage(snapshot);
  for (const state of uiStates.filter((state) => !state.present)) {
    diagnostics.push(gameDiagnostic({
      code: "TN_GAME_UI_STATE_MISSING",
      message: `Required UI state '${state.id}' is not represented in structured UI source or artifacts.`,
      path: `/uiStates/${state.id}`,
      phase: "ui",
      suggestedFix: "Add retained UI source for gameplay, pause, settings, loading, fail/retry, win/milestone, and touch-control states.",
    }));
  }

  const assetAudioLedger = buildAssetAudioLedger(snapshot);
  for (const entry of assetAudioLedger.filter((entry) => entry.status === "blocked")) {
    diagnostics.push(gameDiagnostic({
      code: "TN_GAME_ASSET_PROVENANCE_MISSING",
      message: `Asset/audio sourcing provenance for '${entry.surface}' is missing.`,
      path: `/assetAudioLedger/${entry.surface}`,
      phase: "assets",
      suggestedFix: "Record source assets, procedural status, generated provenance, or an explicit blocker in source/proof artifacts.",
    }));
  }
  for (const path of snapshot.invalidAudioFiles) {
    diagnostics.push(gameDiagnostic({
      code: "TN_GAME_AUDIO_ASSET_INVALID",
      message: `Audio-feedback asset '${path}' is not a valid local WAV file.`,
      path: `/assetAudioLedger/audio-feedback/${path}`,
      phase: "assets",
      suggestedFix: "Replace placeholder text or corrupt audio with a valid RIFF/WAVE file, or update the asset source to supported generated/local audio provenance.",
    }));
  }

  const scorecard = buildVisualScorecard(snapshot, uiStates);
  if (!snapshot.hasNonPrimitiveVisualSource) {
    diagnostics.push(gameDiagnostic({
      code: "TN_GAME_VISUAL_BASELINE_PLACEHOLDER",
      message: "Visual baseline is too placeholder-like: primitive-only source is not enough for a generated game default.",
      path: "/phaseLedgers/visuals",
      phase: "visuals",
      suggestedFix: "Add custom meshes, imported model assets, textures, authored materials, or a coherent procedural asset kit before accepting the game.",
    }));
  }
  const phaseLedgers = buildPhaseLedgers(snapshot, diagnostics, scorecard, uiStates, assetAudioLedger);
  const blockers = sortGameDiagnostics(diagnostics.filter((diagnostic) => diagnostic.severity === "error"));
  const averageVisualScore = round(scorecard.reduce((sum, category) => sum + category.score, 0) / scorecard.length, 2);
  const productionCommands = buildProductionCommands(snapshot);
  const releaseRisks = buildReleaseRisks(snapshot, diagnostics, assetAudioLedger);

  return {
    assetAudioLedger,
    blockers,
    diagnostics: sortGameDiagnostics(diagnostics),
    evidence: [...snapshot.sourceEvidence, ...snapshot.artifactEvidence].sort(compareEvidence),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    mode: options.mode ?? "score",
    ok: blockers.length === 0,
    phaseLedgers,
    productionCommands,
    projectPath,
    providerProbes: probeGameAssetProviders(options.providerEnvironment ?? {}),
    release: {
      assetBudgetStatus: snapshot.artifactEvidence.some((evidence) => includesAny(evidence, ["budget", "asset-budget"])) ? "pass" : "unverified",
      buildProof: snapshot.hasBuildProof,
      debugHelperRisk: snapshot.hasBuildProof ? "clear" : "unverified",
      nativeParity: "not-claimed",
      risks: releaseRisks,
      riskCount: releaseRisks.filter((risk) => risk.severity === "error").length,
      staticHostingNotes: [
        "Serve the emitted bundle directory as static files.",
        "Keep provider credentials in local tooling or release environments only.",
        "Do not edit generated dist/** bundle files as source.",
      ],
    },
    schema: GAME_WORKFLOW_REPORT_SCHEMA,
    scorecard,
    summary: {
      averageVisualScore,
      blockers: blockers.length,
      phasesPassed: phaseLedgers.filter((phase) => phase.status === "pass").length,
      totalPhases: GAME_WORKFLOW_PHASE_IDS.length,
      uiStatesCovered: uiStates.filter((state) => state.present).length,
    },
    uiStates,
    version: GAME_WORKFLOW_REPORT_VERSION,
  };
}

export function probeGameAssetProviders(environment: Record<string, string | undefined>): IGameProviderProbe[] {
  return [
    providerProbe("tripo", "model", "TRIPO_API_KEY", environment),
    providerProbe("gemini", "image", "GEMINI_API_KEY", environment),
    providerProbe("elevenlabs", "audio", "ELEVENLABS_API_KEY", environment),
  ];
}

export function validateGameQualityReport(report: unknown): IGameWorkflowDiagnostic[] {
  const diagnostics: IGameWorkflowDiagnostic[] = [];
  if (!isRecord(report)) {
    return [gameDiagnostic({ code: "TN_GAME_REPORT_INVALID", message: "Game quality report must be a JSON object.", path: "/" })];
  }
  if (report.schema !== GAME_WORKFLOW_REPORT_SCHEMA) {
    diagnostics.push(gameDiagnostic({ code: "TN_GAME_REPORT_SCHEMA_INVALID", message: `Report schema must be '${GAME_WORKFLOW_REPORT_SCHEMA}'.`, path: "/schema" }));
  }
  if (report.version !== GAME_WORKFLOW_REPORT_VERSION) {
    diagnostics.push(gameDiagnostic({ code: "TN_GAME_REPORT_VERSION_INVALID", message: `Report version must be '${GAME_WORKFLOW_REPORT_VERSION}'.`, path: "/version" }));
  }
  diagnostics.push(...validateExactIds(report.phaseLedgers, GAME_WORKFLOW_PHASE_IDS, "/phaseLedgers", "TN_GAME_REPORT_PHASE_INVALID"));
  diagnostics.push(...validateExactIds(report.scorecard, GAME_VISUAL_SCORECARD_CATEGORY_IDS, "/scorecard", "TN_GAME_REPORT_SCORECARD_CATEGORY_INVALID"));
  diagnostics.push(...validateExactIds(report.uiStates, GAME_UI_STATE_IDS, "/uiStates", "TN_GAME_REPORT_UI_STATE_INVALID"));
  diagnostics.push(...validateExactSurfaceIds(report.assetAudioLedger, GAME_ASSET_AUDIO_SURFACE_IDS, "/assetAudioLedger", "TN_GAME_REPORT_ASSET_LEDGER_INVALID"));
  if (!Array.isArray(report.productionCommands)) {
    diagnostics.push(gameDiagnostic({ code: "TN_GAME_REPORT_COMMANDS_INVALID", message: "Report productionCommands must be an array.", path: "/productionCommands" }));
  }
  if (!Array.isArray(report.providerProbes)) {
    diagnostics.push(gameDiagnostic({ code: "TN_GAME_REPORT_PROVIDER_PROBES_INVALID", message: "Report providerProbes must be an array.", path: "/providerProbes" }));
  } else {
    report.providerProbes.forEach((probe, index) => {
      if (!isRecord(probe) || JSON.stringify(probe).includes("secret-")) {
        diagnostics.push(gameDiagnostic({ code: "TN_GAME_REPORT_PROVIDER_SECRET_LEAK", message: "Provider probes must not contain credential values.", path: `/providerProbes/${index}` }));
      }
    });
  }
  if (Array.isArray(report.diagnostics)) {
    report.diagnostics.forEach((diagnostic, index) => {
      if (!isRecord(diagnostic) || typeof diagnostic.code !== "string" || typeof diagnostic.message !== "string") {
        diagnostics.push(gameDiagnostic({ code: "TN_GAME_REPORT_DIAGNOSTIC_INVALID", message: "Report diagnostics must preserve code and message.", path: `/diagnostics/${index}` }));
      }
    });
  } else {
    diagnostics.push(gameDiagnostic({ code: "TN_GAME_REPORT_DIAGNOSTICS_INVALID", message: "Report diagnostics must be an array.", path: "/diagnostics" }));
  }
  return sortGameDiagnostics(diagnostics);
}

function buildProductionCommands(snapshot: IProjectEvidenceSnapshot): IGameProductionCommand[] {
  const configuredManifestPath = snapshot.projectOutDir === undefined ? undefined : `${normalizeRelativePathText(snapshot.projectOutDir)}/manifest.json`;
  const buildArtifact = snapshot.artifactEvidence.find((evidence) => configuredManifestPath !== undefined && evidence.path === configuredManifestPath)
    ?? snapshot.artifactEvidence.find((evidence) => evidence.path?.endsWith("/manifest.json") === true)
    ?? snapshot.artifactEvidence.find((evidence) => includesAny(evidence, ["manifest.json", "world.ir.json"]));
  return [
    commandRow("debug", "tn doctor --project . --json", "Inspect source, bundle, and optional preview diagnostics.", snapshot.artifactEvidence.find((evidence) => includesAny(evidence, ["doctor"]))?.path),
    commandRow("release", "tn build --project . --json", "Compile and validate generated bundle artifacts.", snapshot.hasBuildProof ? buildArtifact?.path : undefined),
    commandRow("gameplay", "tn playtest --project . --entity <player-id> --press <KeyboardEvent.code> --frames 30 --expect-moved --json", "Prove input-driven state change.", snapshot.artifactEvidence.find((evidence) => includesAny(evidence, ["playtest"]))?.path),
    commandRow("gameplay", "tn record --project . --url <preview-url> --out artifacts/game-production/motion.webm --duration 5 --json", "Prove visible smooth motion instead of one-frame snaps.", snapshot.artifactEvidence.find((evidence) => includesAny(evidence, ["motion", "frame-diff", "webm", "mp4", "record"]))?.path),
    commandRow("visuals", "tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json", "Capture nonblank visual proof.", snapshot.artifactEvidence.find((evidence) => includesAny(evidence, ["screenshot", ".png"]))?.path),
    commandRow("qa", "tn record --project . --url <preview-url> --out artifacts/game-production/motion.webm --duration 5 --json", "Capture short motion proof when video is available.", snapshot.artifactEvidence.find((evidence) => includesAny(evidence, ["record", ".webm", ".mp4"]))?.path),
    commandRow("qa", "Capture a mobile viewport screenshot under artifacts/game-production/.", "Prove mobile layout and safe-area behavior.", snapshot.artifactEvidence.find((evidence) => includesAny(evidence, ["mobile", "viewport"]))?.path),
    commandRow("release", "tn game release --project . --json", "Summarize release risks, build evidence, budget status, and native parity scope.", snapshot.artifactEvidence.find((evidence) => includesAny(evidence, ["release"]))?.path),
  ];
}

function commandRow(phase: GameWorkflowPhaseId, command: string, description: string, artifactPath: string | undefined): IGameProductionCommand {
  return {
    ...(artifactPath === undefined ? {} : { artifactPath }),
    command,
    description,
    phase,
    status: artifactPath === undefined ? "missing-artifact" : "available",
  };
}

function buildReleaseRisks(
  snapshot: IProjectEvidenceSnapshot,
  diagnostics: readonly IGameWorkflowDiagnostic[],
  assetAudioLedger: readonly IGameAssetAudioLedgerEntry[],
): IGameReleaseRisk[] {
  const risks: IGameReleaseRisk[] = diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      path: diagnostic.path ?? "/diagnostics",
      severity: "error" as const,
      suggestedFix: diagnostic.suggestedFix ?? diagnostic.suggestion ?? "Fix the blocking game-production diagnostic.",
    }));
  if (!snapshot.artifactEvidence.some((evidence) => includesAny(evidence, ["budget", "asset-budget"]))) {
    risks.push({
      code: "TN_GAME_RELEASE_ASSET_BUDGET_UNVERIFIED",
      message: "Asset and bundle budget evidence is not present.",
      path: "/release/assetBudgetStatus",
      severity: "warning",
      suggestedFix: "Record asset and bundle budget proof under artifacts/game-production/ before release.",
    });
  }
  if (assetAudioLedger.some((entry) => entry.status === "generated" && entry.provider === undefined)) {
    risks.push({
      code: "TN_GAME_RELEASE_GENERATED_ASSET_PROVIDER_UNVERIFIED",
      message: "Generated asset evidence exists without provider provenance.",
      path: "/assetAudioLedger",
      severity: "warning",
      suggestedFix: "Record provider id, local generation metadata, or a blocker without storing credentials.",
    });
  }
  return risks.sort((left, right) => left.severity.localeCompare(right.severity) || left.code.localeCompare(right.code));
}

function buildPhaseLedgers(
  snapshot: IProjectEvidenceSnapshot,
  diagnostics: readonly IGameWorkflowDiagnostic[],
  scorecard: readonly IGameVisualScorecardCategory[],
  uiStates: readonly IGameUiStateCoverage[],
  assetAudioLedger: readonly IGameAssetAudioLedgerEntry[],
): IGameWorkflowPhaseLedger[] {
  const byPhase = (phase: GameWorkflowPhaseId) => diagnostics.filter((diagnostic) => diagnostic.phase === phase);
  const visualScore = round(scorecard.reduce((sum, category) => sum + category.score, 0) / (scorecard.length * 3), 2);
  const uiScore = round(uiStates.filter((state) => state.present).length / uiStates.length, 2);
  const assetScore = round(assetAudioLedger.filter((entry) => entry.status !== "blocked").length / assetAudioLedger.length, 2);
  const phaseScores: Record<GameWorkflowPhaseId, number> = {
    assets: assetScore,
    debug: snapshot.authoring.diagnostics.length === 0 ? 1 : 0,
    gameplay: snapshot.hasInputSource && snapshot.hasScriptSource && snapshot.hasPlaytestProof ? 1 : snapshot.hasInputSource || snapshot.hasScriptSource ? 0.5 : 0,
    qa: snapshot.hasScreenshotProof && snapshot.hasMobileProof && snapshot.hasPlaytestProof ? 1 : 0,
    release: snapshot.hasBuildProof ? 1 : 0,
    ui: uiScore,
    visuals: visualScore,
  };
  const summaries: Record<GameWorkflowPhaseId, string> = {
    assets: "Asset/audio sourcing ledger and provenance.",
    debug: "Authoring diagnostics and source health.",
    gameplay: "Playable loop, input, script behavior, and playtest proof.",
    qa: "Screenshot, mobile, and interaction proof.",
    release: "Build proof, release risks, and native parity scope.",
    ui: "Required UI state coverage.",
    visuals: "Visual scorecard and screenshot evidence.",
  };
  return GAME_WORKFLOW_PHASE_IDS.map((id) => {
    const phaseDiagnostics = byPhase(id);
    const hasErrors = phaseDiagnostics.some((diagnostic) => diagnostic.severity === "error");
    const score = phaseScores[id];
    return {
      diagnostics: sortGameDiagnostics(phaseDiagnostics),
      evidence: evidenceForPhase(id, snapshot),
      id,
      score,
      status: hasErrors ? "blocked" : score >= 1 ? "pass" : "warning",
      summary: summaries[id],
    };
  });
}

function evidenceForPhase(id: GameWorkflowPhaseId, snapshot: IProjectEvidenceSnapshot): IGameWorkflowEvidence[] {
  const matchers: Record<GameWorkflowPhaseId, readonly string[]> = {
    assets: ["asset", "audio", "provenance"],
    debug: ["authoring", "doctor"],
    gameplay: ["input", "script", "playtest", "scene"],
    qa: ["screenshot", "mobile", "playtest"],
    release: ["bundle", "build", "release"],
    ui: ["ui"],
    visuals: ["screenshot", "visual", "material", "environment"],
  };
  const terms = matchers[id];
  return [...snapshot.sourceEvidence, ...snapshot.artifactEvidence]
    .filter((evidence) => terms.some((term) => `${evidence.description} ${evidence.path ?? ""}`.toLowerCase().includes(term)))
    .sort(compareEvidence);
}

async function inspectGameProject(projectPath: string): Promise<IProjectEvidenceSnapshot> {
  const authoring = await loadAuthoringProject({ projectPath });
  const projectOutDir = await readProjectOutDir(projectPath);
  const structuredSourceEvidence = authoring.documents.map((document) => ({
    description: describeStructuredSource(document),
    kind: "source" as const,
    path: document.projectRelativePath,
  }));
  const scriptSourceEvidence = await collectTypeScriptSourceEvidence(projectPath);
  const sourceEvidence = [...structuredSourceEvidence, ...scriptSourceEvidence].sort(compareEvidence);
  const artifactEvidence = await collectArtifactEvidence(projectPath);
  const scriptFiles = await readScriptFiles(projectPath);
  const invalidAudioFiles = await collectInvalidAudioFiles(projectPath, authoring);
  const fullStructuredSourceText = authoring.documents.map((document) => JSON.stringify(document.data)).join(" ");
  const sourceSearchText = [
    sourceEvidence.map((evidence) => `${evidence.description} ${evidence.path ?? ""}`).join(" "),
    fullStructuredSourceText,
    scriptFiles.join("\n"),
  ].join(" ").toLowerCase();
  const hasScriptSource = scriptFiles.length > 0 || sourceEvidence.some((evidence) => evidence.path?.includes("systems") === true || evidence.path?.includes("scene") === true);
  const hasInputSource =
    sourceEvidence.some((evidence) => evidence.path?.includes("/input/") === true || evidence.path?.endsWith(".input.json") === true) ||
    includesAnyText(sourceSearchText, ["defineinputmap", "keyboard(", "gamepad(", "touchcontrol(", "pointerbutton(", " action("]);
  const hasScreenshotProof = artifactEvidence.some((evidence) => includesAny(evidence, ["screenshot", ".png", "nonblank"]));
  const hasMobileProof = artifactEvidence.some((evidence) => includesAny(evidence, ["mobile", "viewport"]));
  const hasPlaytestProof = artifactEvidence.some((evidence) => includesAny(evidence, ["playtest", "input-driven"]));
  const hasMotionFeelProof = artifactEvidence.some((evidence) => includesAny(evidence, ["motion", "smooth", "frame-diff", "framediff", "changedpixelratio", "webm", "mp4", "record"]));
  const hasBuildProof = artifactEvidence.some((evidence) => includesAny(evidence, ["bundle", "build", "manifest.json", "world.ir.json"]));
  const scriptHaystack = scriptFiles.join("\n").toLowerCase();
  return {
    artifactEvidence,
    authoring,
    hasBuildProof,
    hasInputSource,
    hasMobileProof,
    hasMotionFeelProof,
    hasNonPrimitiveVisualSource:
      includesAnyText(sourceSearchText, ["custom", ".glb", ".gltf", "type\":\"model", "type\":\"texture", "meshbuilder", "procedural", "asset kit", "texture"]) ||
      hasComposedPrimitiveVisualSource(sourceSearchText),
    hasPlaytestProof,
    hasScreenshotProof,
    hasScriptSource,
    hasSmoothScriptSource: includesAnyText(scriptHaystack, ["fixeddelta", "movetoward", "lerp", "velocity", "moveprogress", "smooth", "ease", "interpol"]),
    invalidAudioFiles,
    ...(projectOutDir === undefined ? {} : { projectOutDir }),
    sourceEvidence,
    sourceSearchText,
  };
}

async function readProjectOutDir(projectPath: string): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(resolve(projectPath, "threenative.config.json"), "utf8")) as unknown;
    if (isRecord(parsed) && typeof parsed.outDir === "string" && parsed.outDir.trim() !== "") {
      return parsed.outDir;
    }
  } catch {
    // Missing or invalid config is already handled by build/doctor diagnostics.
  }
  return undefined;
}

function normalizeRelativePathText(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

async function collectInvalidAudioFiles(projectPath: string, authoring: IAuthoringProject): Promise<string[]> {
  const paths = new Set<string>();
  for (const document of authoring.documents.filter((candidate) => candidate.kind === "asset")) {
    for (const asset of readAssetRows(document.data)) {
      const type = typeof asset.type === "string" ? asset.type.toLowerCase() : "";
      const path = typeof asset.path === "string" ? asset.path : "";
      if (path === "" || (type !== "audio" && !path.toLowerCase().endsWith(".wav"))) continue;
      if (isAbsolute(path) || path.startsWith("http://") || path.startsWith("https://")) continue;
      if (path.toLowerCase().endsWith(".wav") && !(await isValidWavFile(resolve(projectPath, path)))) {
        paths.add(path);
      }
    }
  }
  return [...paths].sort();
}

function readAssetRows(data: unknown): Array<Record<string, unknown>> {
  if (!isRecord(data) || !Array.isArray(data.assets)) return [];
  return data.assets.filter(isRecord);
}

async function isValidWavFile(path: string): Promise<boolean> {
  try {
    const bytes = await readFile(path);
    return bytes.length >= 44 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE";
  } catch {
    return false;
  }
}

async function collectArtifactEvidence(projectPath: string): Promise<IGameWorkflowEvidence[]> {
  const roots = ["artifacts", "dist"];
  const evidence: IGameWorkflowEvidence[] = [];
  for (const root of roots) {
    const files = await listFiles(resolve(projectPath, root));
    for (const file of files) {
      const relativePath = normalizeRelative(projectPath, file);
      if (isTransientArtifactPath(relativePath)) {
        continue;
      }
      if (!isEvidenceFile(file)) {
        continue;
      }
      const content = await readEvidenceContent(file);
      evidence.push({
        description: evidenceDescription(relativePath, content),
        kind: "artifact",
        path: relativePath,
      });
    }
  }
  return evidence.sort(compareEvidence);
}

function isTransientArtifactPath(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => segment.endsWith(".build-lock"));
}

async function collectTypeScriptSourceEvidence(projectPath: string): Promise<IGameWorkflowEvidence[]> {
  const files = (await listFiles(resolve(projectPath, "src"))).filter((file) => file.endsWith(".ts"));
  const evidence: IGameWorkflowEvidence[] = [];
  for (const file of files) {
    try {
      const relativePath = normalizeRelative(projectPath, file);
      const source = await readFile(file, "utf8");
      evidence.push({
        description: `typescript source ${relativePath} ${compactEvidenceText(source)}`,
        kind: "source",
        path: relativePath,
      });
    } catch {
      // Missing/unreadable TypeScript files are already surfaced by build or authoring validation.
    }
  }
  return evidence;
}

function describeStructuredSource(document: IAuthoringProject["documents"][number]): string {
  const serialized = JSON.stringify(document.data);
  const keywords = collectWorkflowKeywords(serialized).join(" ");
  const summary = compactEvidenceText(`${keywords} ${serialized}`);
  return `${document.kind} structured source ${document.projectRelativePath} ${summary}`;
}

function compactEvidenceText(value: string, maxLength = 600): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const redacted = normalized.replace(/secret-[A-Za-z0-9_-]+/g, "secret-REDACTED");
  if (redacted.length <= maxLength) {
    return redacted;
  }
  return `${redacted.slice(0, maxLength - 3)}...`;
}

function collectWorkflowKeywords(value: string): string[] {
  const terms = [
    ...GAME_UI_STATE_IDS.flatMap((id) => uiStateTerms(id)),
    ...GAME_ASSET_AUDIO_SURFACE_IDS.flatMap((id) => assetSurfaceTerms(id)),
    ...GAME_VISUAL_SCORECARD_CATEGORY_IDS.flatMap((id) => visualCategoryTerms(id)),
  ];
  const lower = value.toLowerCase();
  return [...new Set(terms.filter((term) => lower.includes(term.toLowerCase())))].sort();
}

function buildUiStateCoverage(snapshot: IProjectEvidenceSnapshot): IGameUiStateCoverage[] {
  return GAME_UI_STATE_IDS.map((id) => {
    const terms = uiStateTerms(id);
    const evidence = [...snapshot.sourceEvidence, ...snapshot.artifactEvidence].filter((item) => includesAny(item, terms));
    return {
      evidence: evidence.sort(compareEvidence),
      id,
      present: evidence.length > 0,
    };
  });
}

function buildAssetAudioLedger(snapshot: IProjectEvidenceSnapshot): IGameAssetAudioLedgerEntry[] {
  return GAME_ASSET_AUDIO_SURFACE_IDS.map((surface) => {
    const terms = assetSurfaceTerms(surface);
    const evidence = [...snapshot.sourceEvidence, ...snapshot.artifactEvidence].filter((item) => includesAny(item, terms));
    const provider = inferProvider(evidence);
    return {
      evidence: evidence.sort(compareEvidence),
      ...(provider === undefined ? {} : { provider }),
      sourcePath: evidence[0]?.path,
      status: evidence.length > 0 ? inferSourcingStatus(evidence) : "blocked",
      surface,
    };
  });
}

function inferProvider(evidence: readonly IGameWorkflowEvidence[]): string | undefined {
  const haystack = evidence.map((item) => `${item.description} ${item.path ?? ""}`).join(" ").toLowerCase();
  if (haystack.includes("tripo")) return "tripo";
  if (haystack.includes("gemini")) return "gemini";
  if (haystack.includes("elevenlabs")) return "elevenlabs";
  return undefined;
}

function buildVisualScorecard(snapshot: IProjectEvidenceSnapshot, uiStates: readonly IGameUiStateCoverage[]): IGameVisualScorecardCategory[] {
  return GAME_VISUAL_SCORECARD_CATEGORY_IDS.map((id) => {
    const terms = visualCategoryTerms(id);
    const evidence = [...snapshot.sourceEvidence, ...snapshot.artifactEvidence].filter((item) => includesAny(item, terms));
    const hasScreenshot = snapshot.hasScreenshotProof;
    const sourceScore = evidence.length > 0 ? 1 : 0;
    const proofScore = hasScreenshot ? 2 : 0;
    const uiBonus = id === "ui-hud" && uiStates.some((state) => state.id === "gameplay" && state.present) ? 1 : 0;
    const score = Math.min(3, sourceScore + proofScore + uiBonus) as 0 | 1 | 2 | 3;
    return {
      evidence: evidence.sort(compareEvidence),
      id,
      score,
    };
  });
}

function inferSourcingStatus(evidence: readonly IGameWorkflowEvidence[]): GameAssetAudioSourcingStatus {
  const haystack = evidence.map((item) => `${item.description} ${item.path ?? ""}`).join(" ").toLowerCase();
  if (haystack.includes("generated") || haystack.includes("generator")) {
    return "generated";
  }
  if (haystack.includes("procedural") || haystack.includes("primitive") || haystack.includes("mesh")) {
    return "procedural";
  }
  if (haystack.includes("hybrid")) {
    return "hybrid";
  }
  return "local-file";
}

function providerProbe(
  id: IGameProviderProbe["id"],
  purpose: IGameProviderProbe["purpose"],
  credentialEnv: string,
  environment: Record<string, string | undefined>,
): IGameProviderProbe {
  const value = environment[credentialEnv];
  return {
    credentialEnv,
    id,
    purpose,
    status: value === undefined ? "not-configured" : value.trim() === "" ? "missing-credential" : "available",
  };
}

function gameDiagnostic(input: {
  code: string;
  message: string;
  path: string;
  phase?: GameWorkflowPhaseId;
  severity?: "error" | "info" | "warning";
  suggestedFix?: string;
}): IGameWorkflowDiagnostic {
  const diagnostic = authoringDiagnostic({
    code: input.code,
    message: input.message,
    path: input.path,
    severity: input.severity,
    suggestion: input.suggestedFix,
  }) as IGameWorkflowDiagnostic;
  if (input.phase !== undefined) {
    diagnostic.phase = input.phase;
  }
  if (input.suggestedFix !== undefined) {
    diagnostic.suggestedFix = input.suggestedFix;
  }
  return diagnostic;
}

function sortGameDiagnostics(diagnostics: readonly IGameWorkflowDiagnostic[]): IGameWorkflowDiagnostic[] {
  return sortAuthoringDiagnostics(diagnostics).map((diagnostic) => diagnostic as IGameWorkflowDiagnostic);
}

function validateExactIds(
  value: unknown,
  expected: readonly string[],
  path: string,
  code: string,
): IGameWorkflowDiagnostic[] {
  if (!Array.isArray(value)) {
    return [gameDiagnostic({ code, message: `${path} must be an array.`, path })];
  }
  const actual = value.map((entry) => isRecord(entry) && typeof entry.id === "string" ? entry.id : "");
  const diagnostics: IGameWorkflowDiagnostic[] = [];
  for (const id of expected) {
    if (!actual.includes(id)) {
      diagnostics.push(gameDiagnostic({ code, message: `Missing required id '${id}'.`, path: `${path}/${id}` }));
    }
  }
  for (const [index, id] of actual.entries()) {
    if (!expected.includes(id)) {
      diagnostics.push(gameDiagnostic({ code, message: `Unsupported id '${id}'.`, path: `${path}/${index}/id` }));
    }
  }
  return diagnostics;
}

function validateExactSurfaceIds(
  value: unknown,
  expected: readonly string[],
  path: string,
  code: string,
): IGameWorkflowDiagnostic[] {
  if (!Array.isArray(value)) {
    return [gameDiagnostic({ code, message: `${path} must be an array.`, path })];
  }
  const actual = value.map((entry) => isRecord(entry) && typeof entry.surface === "string" ? entry.surface : "");
  const diagnostics: IGameWorkflowDiagnostic[] = [];
  for (const id of expected) {
    if (!actual.includes(id)) {
      diagnostics.push(gameDiagnostic({ code, message: `Missing required surface '${id}'.`, path: `${path}/${id}` }));
    }
  }
  for (const [index, id] of actual.entries()) {
    if (!expected.includes(id)) {
      diagnostics.push(gameDiagnostic({ code, message: `Unsupported surface '${id}'.`, path: `${path}/${index}/surface` }));
    }
  }
  return diagnostics;
}

function uiStateTerms(id: GameUiStateId): readonly string[] {
  const terms: Record<GameUiStateId, readonly string[]> = {
    gameplay: ["hud", "score", "health", "gameplay", "countdown"],
    "fail-retry": ["fail", "retry", "game-over", "defeat"],
    loading: ["loading", "loader"],
    pause: ["pause", "paused"],
    settings: ["settings", "options"],
    "touch-controls": ["touch", "joystick", "mobile-control"],
    "win-milestone": ["win", "victory", "milestone", "complete"],
  };
  return terms[id];
}

function assetSurfaceTerms(id: GameAssetAudioSurfaceId): readonly string[] {
  const terms: Record<GameAssetAudioSurfaceId, readonly string[]> = {
    "audio-feedback": ["audio", "sound", "music", ".wav", ".mp3", ".ogg"],
    "obstacle-enemy": ["obstacle", "enemy", "hazard", "threat", "shadow", "moth", "traffic", "car."],
    "player-hero": ["player", "hero", "avatar", "kart", "chicken"],
    "reward-interactable": ["reward", "collectible", "goal", "interactable"],
    "ui-hud": ["ui", "hud", "font", "icon"],
    "world-environment": ["world", "environment", "terrain", "skybox", "arena"],
  };
  return terms[id];
}

function visualCategoryTerms(id: GameVisualScorecardCategoryId): readonly string[] {
  const terms: Record<GameVisualScorecardCategoryId, readonly string[]> = {
    "art-direction": ["material", "color", "style", "art"],
    "hero-player": ["player", "hero", "avatar", "kart", "chicken"],
    "lighting-render": ["light", "render", "screenshot", "runtime"],
    "materials-textures": ["material", "texture", "color"],
    "obstacles-enemies": ["obstacle", "enemy", "hazard", "traffic", "car."],
    performance: ["performance", "fps", "budget", "target"],
    "rewards-interactables": ["reward", "collectible", "goal", "trigger"],
    "ui-hud": ["ui", "hud", "score", "health"],
    "vfx-motion": ["particle", "animation", "motion", "record"],
    "world-environment": ["world", "environment", "terrain", "scene"],
  };
  return terms[id];
}

function evidenceDescription(path: string, content = ""): string {
  const lower = path.toLowerCase();
  const text = content.toLowerCase();
  const suffix = [
    includesAnyText(text, ["changedpixelratio", "frameDiff", "frame-diff", "motion"]) ? " frame-diff motion" : "",
    includesAnyText(text, ["smooth", "interpolation", "velocity", "moveprogress"]) ? " smooth" : "",
    includesAnyText(text, ["nonblank", "screenshot"]) ? " nonblank" : "",
  ].join("");
  if (lower.includes("playtest")) return `playtest input-driven artifact${suffix}`;
  if (lower.includes("mobile")) return "mobile viewport artifact";
  if (lower.includes("screenshot") || lower.endsWith(".png")) return `screenshot visual artifact${suffix}`;
  if (lower.includes("motion") || lower.endsWith(".webm") || lower.endsWith(".mp4")) return `motion capture artifact${suffix}`;
  if (lower.includes("release")) return "release artifact";
  if (lower.includes("manifest.json") || lower.includes("world.ir.json")) return "build bundle artifact";
  return `game production artifact${suffix}`;
}

function includesAny(evidence: IGameWorkflowEvidence, terms: readonly string[]): boolean {
  const haystack = `${evidence.description} ${evidence.path ?? ""} ${evidence.command ?? ""}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function includesAnyText(haystack: string, terms: readonly string[]): boolean {
  const lower = haystack.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

function hasComposedPrimitiveVisualSource(haystack: string): boolean {
  const geometryKinds = countTermHits(haystack, ["boxgeometry", "spheregeometry", "cylindergeometry", "conegeometry", "planegeometry"]);
  const hasMaterialSource = includesAnyText(haystack, ["meshstandardmaterial", "material(", "materials", "color"]);
  const hasLightingSource = includesAnyText(haystack, ["ambientlight", "directionallight", "pointlight", "spotlight"]);
  const partSignals = countTermHits(haystack, [
    "beak",
    "cabin",
    "comb",
    "dash",
    "head",
    "lane",
    "leaf",
    "leg",
    "prop",
    "sign",
    "trunk",
    "wheel",
  ]);
  const builderSignals = countTermHits(haystack, ["addcar", "addchicken", "addground", "addlanemarks", "addroadsideprops", "addlighting"]);
  return geometryKinds >= 3 && hasMaterialSource && hasLightingSource && (partSignals >= 4 || builderSignals >= 3);
}

function countTermHits(haystack: string, terms: readonly string[]): number {
  const lower = haystack.toLowerCase();
  return terms.reduce((count, term) => count + (lower.includes(term.toLowerCase()) ? 1 : 0), 0);
}

async function readScriptFiles(projectPath: string): Promise<string[]> {
  const files = await listFiles(resolve(projectPath, "src"));
  const sources: string[] = [];
  for (const file of files.filter((file) => file.endsWith(".ts"))) {
    try {
      sources.push(await readFile(file, "utf8"));
    } catch {
      // Missing/unreadable script files are already surfaced by authoring validation.
    }
  }
  return sources;
}

async function readEvidenceContent(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();
  if (ext !== ".json" && ext !== ".md") {
    return "";
  }
  try {
    return (await readFile(path, "utf8")).slice(0, 20_000);
  } catch {
    return "";
  }
}

async function listFiles(root: string): Promise<string[]> {
  try {
    await access(root);
  } catch {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const child = resolve(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

function isEvidenceFile(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ext === ".json" || ext === ".md" || ext === ".png" || ext === ".webm" || ext === ".mp4";
}

function normalizeRelative(root: string, path: string): string {
  const absoluteRoot = resolve(root);
  const absolutePath = isAbsolute(path) ? path : resolve(root, path);
  return absolutePath.slice(absoluteRoot.length + 1).replaceAll("\\", "/");
}

function compareEvidence(left: IGameWorkflowEvidence, right: IGameWorkflowEvidence): number {
  return (left.path ?? left.description).localeCompare(right.path ?? right.description) || left.description.localeCompare(right.description);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function readGameQualityReport(path: string): Promise<{ diagnostics: IGameWorkflowDiagnostic[]; report?: IGameWorkflowReport }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    return {
      diagnostics: [
        gameDiagnostic({
          code: "TN_GAME_REPORT_READ_FAILED",
          message: `Unable to read game quality report: ${error instanceof Error ? error.message : String(error)}.`,
          path,
        }),
      ],
    };
  }
  const diagnostics = validateGameQualityReport(parsed);
  return diagnostics.length === 0 ? { diagnostics, report: parsed as IGameWorkflowReport } : { diagnostics };
}
