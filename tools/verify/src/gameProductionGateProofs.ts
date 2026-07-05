import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { type VerificationDiagnostic } from "./runner.js";
import { type IGameProductionGateProject } from "./gameProductionGate.js";

const REQUIRED_QA_PROOF_STEP_IDS = [
  "doctor",
  "build",
  "playtest",
  "screenshot",
  "mobile-viewport",
  "record",
  "visual-quality",
  "performance",
  "asset-budget",
  "ui-fit",
] as const;

const SIDE_CAR_PROOFS = [
  {
    invalidCode: "TN_VERIFY_GAME_PERFORMANCE_PROOF_INVALID",
    missingCode: "TN_VERIFY_GAME_PERFORMANCE_PROOF_MISSING",
    path: "artifacts/game-production/performance.json",
    schema: "threenative.game-performance-proof",
  },
  {
    invalidCode: "TN_VERIFY_GAME_ASSET_BUDGET_PROOF_INVALID",
    missingCode: "TN_VERIFY_GAME_ASSET_BUDGET_PROOF_MISSING",
    path: "artifacts/game-production/asset-budget.json",
    schema: "threenative.game-asset-budget-proof",
  },
  {
    invalidCode: "TN_VERIFY_GAME_UI_FIT_PROOF_INVALID",
    missingCode: "TN_VERIFY_GAME_UI_FIT_PROOF_MISSING",
    path: "artifacts/game-production/ui-fit.json",
    schema: "threenative.game-ui-fit-proof",
  },
] as const;

export async function visualQualityMetricSummary(root: string, projects: IGameProductionGateProject[]): Promise<Record<string, number> | undefined> {
  const metrics = [];
  for (const project of projects) {
    const metric = await readVisualQualityMetric(resolve(root, project.projectPath));
    if (metric !== undefined) {
      metrics.push(metric);
    }
  }
  if (metrics.length === 0) {
    return undefined;
  }
  return {
    maxColorBucketCount: Math.max(...metrics.map((metric) => metric.colorBucketCount)),
    maxLocalContrastRatio: Math.max(...metrics.map((metric) => metric.localContrastRatio)),
    minColorBucketCount: Math.min(...metrics.map((metric) => metric.colorBucketCount)),
    minLocalContrastRatio: Math.min(...metrics.map((metric) => metric.localContrastRatio)),
    minNonblankRatio: Math.min(...metrics.map((metric) => metric.nonblankRatio)),
    minVisibleBoundsAreaRatio: Math.min(...metrics.map((metric) => metric.visibleBoundsAreaRatio)),
    projectCount: metrics.length,
  };
}

async function readVisualQualityMetric(projectPath: string): Promise<{
  colorBucketCount: number;
  localContrastRatio: number;
  nonblankRatio: number;
  visibleBoundsAreaRatio: number;
} | undefined> {
  try {
    const parsed = JSON.parse(await readFile(resolve(projectPath, "artifacts/game-production/visual-quality.json"), "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.metrics)) {
      return undefined;
    }
    const metrics = parsed.metrics;
    const colorBucketCount = typeof metrics.colorBucketCount === "number" ? metrics.colorBucketCount : undefined;
    const localContrastRatio = typeof metrics.localContrastRatio === "number" ? metrics.localContrastRatio : undefined;
    const nonblankRatio = isRecord(metrics.nonblank) && typeof metrics.nonblank.changedPixelRatio === "number" ? metrics.nonblank.changedPixelRatio : undefined;
    const visibleBoundsAreaRatio = typeof metrics.visibleBoundsAreaRatio === "number" ? metrics.visibleBoundsAreaRatio : undefined;
    if (colorBucketCount === undefined || localContrastRatio === undefined || nonblankRatio === undefined || visibleBoundsAreaRatio === undefined) {
      return undefined;
    }
    return { colorBucketCount, localContrastRatio, nonblankRatio, visibleBoundsAreaRatio };
  } catch {
    return undefined;
  }
}

export async function releaseReportDiagnostics(projectPath: string, label: string): Promise<VerificationDiagnostic[]> {
  const path = resolve(projectPath, "artifacts/game-production/release-report.json");
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    const release = isRecord(parsed) ? parsed.release : undefined;
    const blockers = isRecord(parsed) && Array.isArray(parsed.blockers) ? parsed.blockers : undefined;
    const diagnostics = isRecord(parsed) && Array.isArray(parsed.diagnostics) ? parsed.diagnostics : undefined;
    const risks = isRecord(release) && Array.isArray(release.risks) ? release.risks : undefined;
    if (
      !isRecord(parsed)
      || parsed.schema !== "threenative.game-quality-report"
      || parsed.mode !== "release"
      || blockers === undefined
      || diagnostics === undefined
      || risks === undefined
    ) {
      return [{
        code: "TN_VERIFY_GAME_RELEASE_REPORT_INVALID",
        message: `${label}: release report must be a persisted release-mode game-quality report.`,
        path,
        severity: "error",
        suggestedFix: "Run tn game release --project <path> --json and keep artifacts/game-production/release-report.json.",
      }];
    }
    if (blockers.length > 0 || diagnostics.length > 0 || risks.length > 0) {
      return [{
        code: "TN_VERIFY_GAME_RELEASE_REPORT_NOT_CLEAN",
        message: `${label}: persisted release report must have zero blockers, diagnostics, and release risks.`,
        path,
        severity: "error",
        suggestedFix: "Fix the release report diagnostics, rerun tn game qa --run-proof, then rerun tn game release --json.",
      }];
    }
    const evidenceDiagnostics = await reportEvidenceDiagnostics(projectPath, parsed, label, path, "TN_VERIFY_GAME_RELEASE_REPORT_EVIDENCE_MISSING");
    if (evidenceDiagnostics.length > 0) {
      return evidenceDiagnostics;
    }
    const qualityDiagnostics = persistedReportQualityDiagnostics(parsed, label, path, "TN_VERIFY_GAME_RELEASE_REPORT_QUALITY_INCOMPLETE");
    if (qualityDiagnostics.length > 0) {
      return qualityDiagnostics;
    }
    const commandDiagnostics = await persistedProductionCommandDiagnostics(projectPath, parsed, label, path, "TN_VERIFY_GAME_RELEASE_REPORT_COMMAND_MISSING");
    if (commandDiagnostics.length > 0) {
      return commandDiagnostics;
    }
    const assetLedgerDiagnostics = await persistedAssetLedgerDiagnostics(projectPath, parsed, label, path, "TN_VERIFY_GAME_RELEASE_REPORT_ASSET_LEDGER_INCOMPLETE");
    if (assetLedgerDiagnostics.length > 0) {
      return assetLedgerDiagnostics;
    }
    return [];
  } catch (error) {
    return [{
      code: "TN_VERIFY_GAME_RELEASE_REPORT_MISSING",
      message: `${label}: unable to read persisted release report: ${error instanceof Error ? error.message : String(error)}.`,
      path,
      severity: "error",
      suggestedFix: "Run tn game release --project <path> --json and keep artifacts/game-production/release-report.json.",
    }];
  }
}

export async function visualProvenanceDiagnostics(projectPath: string, label: string): Promise<VerificationDiagnostic[]> {
  const scenesDir = resolve(projectPath, "content/scenes");
  const provenancePaths: string[] = [];
  try {
    const entries = await readdir(scenesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const path = resolve(scenesDir, entry.name);
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (!isRecord(parsed) || !Array.isArray(parsed.entities)) {
        continue;
      }
      for (const entity of parsed.entities.filter(isRecord)) {
        const components = entity.components;
        const provenance = isRecord(components) ? components.VisualProvenance : undefined;
        if (isUsableVisualProvenance(provenance)) {
          provenancePaths.push(path);
        }
      }
    }
  } catch {
    // Missing or malformed scene source is already reported by the authoring report.
  }
  if (provenancePaths.length > 0) {
    return [];
  }
  return [{
    code: "TN_VERIFY_GAME_VISUAL_PROVENANCE_MISSING",
    message: `${label}: generated-game source must include usable VisualProvenance describing catalog searches, selected assets, or authored fallback surfaces.`,
    path: `${scenesDir}/VisualProvenance`,
    severity: "error",
    suggestedFix: "Add a VisualProvenance component to a durable scene source entity with catalogId/selectedAsset, catalogSearches/fallback/surfaces, or status/style/notes fields.",
  }];
}

function isUsableVisualProvenance(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const catalogId = typeof value.catalogId === "string" && value.catalogId.trim().length > 0;
  const selectedAsset = typeof value.selectedAsset === "string" && value.selectedAsset.trim().length > 0;
  const catalogSearches = typeof value.catalogSearches === "string" && value.catalogSearches.trim().length > 0;
  const fallback = typeof value.fallback === "string" && value.fallback.trim().length > 0;
  const surfaces = typeof value.surfaces === "string" && value.surfaces.trim().length > 0;
  const status = typeof value.status === "string" && value.status.trim().length > 0;
  const style = typeof value.style === "string" && value.style.trim().length > 0;
  const notes = typeof value.notes === "string" && value.notes.trim().length >= 40;
  return (catalogId && selectedAsset)
    || (catalogSearches && fallback && surfaces)
    || (status && style && notes);
}

export async function visualQualityDiagnostics(projectPath: string, label: string): Promise<VerificationDiagnostic[]> {
  const path = resolve(projectPath, "artifacts/game-production/visual-quality.json");
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isRecord(parsed) || parsed.status !== "pass") {
      return [{
        code: "TN_VERIFY_GAME_VISUAL_QUALITY_NOT_PASSING",
        message: `${label}: visual-quality proof must exist with status 'pass'.`,
        path,
        severity: "error",
        suggestedFix: "Run tn game qa --project <path> --run-proof --json and inspect artifacts/game-production/visual-quality.json.",
      }];
    }
    const metrics = parsed.metrics;
    if (!isRecord(metrics)) {
      return [{
        code: "TN_VERIFY_GAME_VISUAL_QUALITY_METRICS_MISSING",
        message: `${label}: visual-quality proof must include screenshot metrics, not only status='pass'.`,
        path: `${path}/metrics`,
        severity: "error",
        suggestedFix: "Rerun tn game qa --project <path> --run-proof --json with the current CLI so objective screenshot metrics are recorded.",
      }];
    }
    const diagnostics = visualMetricDiagnostics(metrics, label, path);
    if (diagnostics.length > 0) {
      return diagnostics;
    }
    if (typeof parsed.screenshot !== "string" || !(await artifactPathExists(projectPath, parsed.screenshot))) {
      return [{
        code: "TN_VERIFY_GAME_VISUAL_QUALITY_SCREENSHOT_MISSING",
        message: `${label}: visual-quality proof must reference an existing non-empty screenshot artifact.`,
        path: `${path}/screenshot`,
        severity: "error",
        suggestedFix: "Rerun tn game qa --project <path> --run-proof --json so visual-quality proof is tied to a captured screenshot.",
      }];
    }
    const screenshotDimensions = await readPngDimensions(resolve(projectPath, parsed.screenshot));
    if (screenshotDimensions === undefined) {
      return [{
        code: "TN_VERIFY_GAME_VISUAL_QUALITY_SCREENSHOT_INVALID",
        message: `${label}: visual-quality proof screenshot must be a readable PNG artifact.`,
        path: `${path}/screenshot`,
        severity: "error",
        suggestedFix: "Rerun tn screenshot or tn game qa --run-proof so visual-quality proof points at a valid PNG capture.",
      }];
    }
    if (screenshotDimensions.width !== metrics.width || screenshotDimensions.height !== metrics.height) {
      return [{
        code: "TN_VERIFY_GAME_VISUAL_QUALITY_SCREENSHOT_DIMENSIONS_MISMATCH",
        message: `${label}: visual-quality proof metrics dimensions ${metrics.width}x${metrics.height} do not match screenshot dimensions ${screenshotDimensions.width}x${screenshotDimensions.height}.`,
        path: `${path}/metrics`,
        severity: "error",
        suggestedFix: "Rerun tn game qa --project <path> --run-proof --json so screenshot metrics are regenerated from the referenced PNG.",
      }];
    }
    return [];
  } catch (error) {
    return [{
      code: "TN_VERIFY_GAME_VISUAL_QUALITY_MISSING",
      message: `${label}: unable to read visual-quality proof: ${error instanceof Error ? error.message : String(error)}.`,
      path,
      severity: "error",
      suggestedFix: "Run tn game qa --project <path> --run-proof --json after capturing screenshot evidence.",
    }];
  }
}

function visualMetricDiagnostics(metrics: Record<string, unknown>, label: string, path: string): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  const nonblank = isRecord(metrics.nonblank) && typeof metrics.nonblank.changedPixelRatio === "number" ? metrics.nonblank.changedPixelRatio : undefined;
  const bounds = typeof metrics.visibleBoundsAreaRatio === "number" ? metrics.visibleBoundsAreaRatio : undefined;
  const buckets = typeof metrics.colorBucketCount === "number" ? metrics.colorBucketCount : undefined;
  const contrast = typeof metrics.localContrastRatio === "number" ? metrics.localContrastRatio : undefined;
  const width = typeof metrics.width === "number" ? metrics.width : undefined;
  const height = typeof metrics.height === "number" ? metrics.height : undefined;
  if (nonblank === undefined || bounds === undefined || buckets === undefined || contrast === undefined || width === undefined || height === undefined) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_VISUAL_QUALITY_METRICS_INCOMPLETE",
      message: `${label}: visual-quality proof metrics must include nonblank ratio, visible bounds area, color buckets, local contrast, and screenshot dimensions.`,
      path: `${path}/metrics`,
      severity: "error",
      suggestedFix: "Rerun tn game qa --project <path> --run-proof --json with the current CLI.",
    });
    return diagnostics;
  }
  if (nonblank < 0.9) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_VISUAL_QUALITY_NONBLANK_LOW",
      message: `${label}: screenshot nonblank ratio ${nonblank.toFixed(4)} is below the generated-game threshold 0.9000.`,
      path: `${path}/metrics/nonblank/changedPixelRatio`,
      severity: "error",
      suggestedFix: "Fix screenshot capture, camera framing, lighting, or scene loading before accepting generated-game visual proof.",
    });
  }
  if (bounds < 0.08) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_VISUAL_QUALITY_BOUNDS_LOW",
      message: `${label}: visible projected bounds cover ${(bounds * 100).toFixed(1)}% of the screenshot, below the generated-game threshold 8.0%.`,
      path: `${path}/metrics/visibleBoundsAreaRatio`,
      severity: "error",
      suggestedFix: "Improve camera framing, object scale, and environment composition so the playable scene is readable.",
    });
  }
  if (buckets < 12) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_VISUAL_QUALITY_COLOR_LOW",
      message: `${label}: screenshot only contains ${buckets} coarse color buckets, below the generated-game threshold 12.`,
      path: `${path}/metrics/colorBucketCount`,
      severity: "error",
      suggestedFix: "Add authored materials, lighting variation, set dressing, UI accents, or objective markers.",
    });
  }
  if (contrast < 0.01) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_VISUAL_QUALITY_CONTRAST_LOW",
      message: `${label}: screenshot local contrast ratio ${contrast.toFixed(4)} is below the generated-game threshold 0.0100.`,
      path: `${path}/metrics/localContrastRatio`,
      severity: "error",
      suggestedFix: "Add silhouette contrast, shadows, material detail, boundaries, or readable objective markers.",
    });
  }
  return diagnostics;
}

export async function qaProofDiagnostics(projectPath: string, label: string): Promise<VerificationDiagnostic[]> {
  const path = resolve(projectPath, "artifacts/game-production/qa-report.json");
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isRecord(parsed) || parsed.ok !== true) {
      return [{
        code: "TN_VERIFY_GAME_QA_REPORT_NOT_PASSING",
        message: `${label}: QA report must exist with ok=true.`,
        path,
        severity: "error",
        suggestedFix: "Run tn game qa --project <path> --run-proof --json and resolve QA diagnostics before release.",
      }];
    }
    const diagnostics: VerificationDiagnostic[] = await qaReportShapeDiagnostics(projectPath, parsed, label, path);
    const proofRun = parsed.proofRun;
    if (!isRecord(proofRun) || proofRun.ok !== true) {
      return [{
        code: "TN_VERIFY_GAME_QA_PROOF_NOT_PASSING",
        message: `${label}: QA report must include proofRun.ok=true from tn game qa --run-proof.`,
        path: `${path}/proofRun`,
        severity: "error",
        suggestedFix: "Run tn game qa --project <path> --run-proof --url <preview-url> --json so doctor/build/playtest/screenshot/mobile proof all pass.",
      }];
    }
    if (!Array.isArray(proofRun.steps)) {
      return [{
        code: "TN_VERIFY_GAME_QA_PROOF_STEPS_MISSING",
        message: `${label}: QA proof report must include proofRun.steps from tn game qa --run-proof.`,
        path: `${path}/proofRun/steps`,
        severity: "error",
        suggestedFix: "Rerun tn game qa --project <path> --run-proof --json with the current CLI so proof step evidence is recorded.",
      }];
    }
    const steps = proofRun.steps.filter(isRecord);
    for (const id of REQUIRED_QA_PROOF_STEP_IDS) {
      const step = steps.find((candidate) => candidate.id === id);
      if (step === undefined) {
        diagnostics.push({
          code: "TN_VERIFY_GAME_QA_PROOF_STEP_MISSING",
          message: `${label}: QA proof step '${id}' is missing.`,
          path: `${path}/proofRun/steps/${id}`,
          severity: "error",
          suggestedFix: "Rerun tn game qa --project <path> --run-proof --json and keep the generated qa-report.json.",
        });
        continue;
      }
      if (step.exitCode !== 0) {
        diagnostics.push({
          code: "TN_VERIFY_GAME_QA_PROOF_STEP_FAILED",
          message: `${label}: QA proof step '${id}' did not exit cleanly.`,
          path: `${path}/proofRun/steps/${id}`,
          severity: "error",
          suggestedFix: "Inspect the QA report step diagnostics, fix the failing proof command, and rerun tn game qa --run-proof.",
        });
      }
      if (id === "record" && !(await hasMotionProofStep(projectPath, step))) {
        diagnostics.push({
          code: "TN_VERIFY_GAME_QA_MOTION_PROOF_MISSING",
          message: `${label}: QA proof step 'record' must point at an existing motion artifact.`,
          path: `${path}/proofRun/steps/record`,
          severity: "error",
          suggestedFix: "Run tn record --project <path> --url <preview-url> --out artifacts/game-production/motion.webm --json, then rerun tn game qa --run-proof.",
        });
      }
      if (id === "playtest" && !(await hasPlaytestProofStep(projectPath, step))) {
        diagnostics.push({
          code: "TN_VERIFY_GAME_QA_PLAYTEST_PROOF_INVALID",
          message: `${label}: QA proof step 'playtest' must prove input-driven entity movement and reference an existing screenshot artifact.`,
          path: `${path}/proofRun/steps/playtest`,
          severity: "error",
          suggestedFix: "Run tn playtest --project <path> --entity <id> --press <KeyboardEvent.code> --expect-moved --expect-axis <axis> --json, then rerun tn game qa --run-proof.",
        });
      }
    }
    diagnostics.push(...await sidecarProofDiagnostics(projectPath, label));
    return diagnostics;
  } catch (error) {
    return [{
      code: "TN_VERIFY_GAME_QA_PROOF_MISSING",
      message: `${label}: unable to read QA proof report: ${error instanceof Error ? error.message : String(error)}.`,
      path,
      severity: "error",
      suggestedFix: "Run tn game qa --project <path> --run-proof --json and keep artifacts/game-production/qa-report.json.",
    }];
  }
}

async function qaReportShapeDiagnostics(projectPath: string, report: Record<string, unknown>, label: string, path: string): Promise<VerificationDiagnostic[]> {
  const release = report.release;
  const blockers = Array.isArray(report.blockers) ? report.blockers : undefined;
  const diagnostics = Array.isArray(report.diagnostics) ? report.diagnostics : undefined;
  const risks = isRecord(release) && Array.isArray(release.risks) ? release.risks : undefined;
  if (
    report.schema !== "threenative.game-quality-report"
    || report.mode !== "qa"
    || blockers === undefined
    || diagnostics === undefined
    || risks === undefined
  ) {
    return [{
      code: "TN_VERIFY_GAME_QA_REPORT_INVALID",
      message: `${label}: QA report must be a persisted qa-mode game-quality report.`,
      path,
      severity: "error",
      suggestedFix: "Run tn game qa --project <path> --run-proof --json and keep artifacts/game-production/qa-report.json.",
    }];
  }
  if (blockers.length > 0 || diagnostics.length > 0 || risks.length > 0) {
    return [{
      code: "TN_VERIFY_GAME_QA_REPORT_NOT_CLEAN",
      message: `${label}: persisted QA report must have zero blockers, diagnostics, and release risks.`,
      path,
      severity: "error",
      suggestedFix: "Fix the QA report diagnostics, then rerun tn game qa --run-proof --json.",
    }];
  }
  const evidenceDiagnostics = await reportEvidenceDiagnostics(projectPath, report, label, path, "TN_VERIFY_GAME_QA_REPORT_EVIDENCE_MISSING");
  if (evidenceDiagnostics.length > 0) {
    return evidenceDiagnostics;
  }
  const qualityDiagnostics = persistedReportQualityDiagnostics(report, label, path, "TN_VERIFY_GAME_QA_REPORT_QUALITY_INCOMPLETE");
  if (qualityDiagnostics.length > 0) {
    return qualityDiagnostics;
  }
  const commandDiagnostics = await persistedProductionCommandDiagnostics(projectPath, report, label, path, "TN_VERIFY_GAME_QA_REPORT_COMMAND_MISSING");
  if (commandDiagnostics.length > 0) {
    return commandDiagnostics;
  }
  return await persistedAssetLedgerDiagnostics(projectPath, report, label, path, "TN_VERIFY_GAME_QA_REPORT_ASSET_LEDGER_INCOMPLETE");
}

async function reportEvidenceDiagnostics(projectPath: string, report: Record<string, unknown>, label: string, path: string, code: string): Promise<VerificationDiagnostic[]> {
  const evidence = collectReportEvidence(report);
  for (const item of evidence) {
    const evidencePath = typeof item.path === "string" ? item.path : undefined;
    if (evidencePath === undefined || evidencePath.startsWith("http://") || evidencePath.startsWith("https://")) {
      continue;
    }
    if (!(await reportEvidencePathExists(projectPath, evidencePath))) {
      return [{
        code,
        message: `${label}: persisted report evidence path is missing: ${evidencePath}.`,
        path,
        severity: "error",
        suggestedFix: "Regenerate the QA/release report after rebuilding proof artifacts, or remove stale evidence references from generated reports.",
      }];
    }
  }
  return [];
}

function persistedReportQualityDiagnostics(report: Record<string, unknown>, label: string, path: string, code: string): VerificationDiagnostic[] {
  const scorecard = Array.isArray(report.scorecard) ? report.scorecard.filter(isRecord) : [];
  const phaseLedgers = Array.isArray(report.phaseLedgers) ? report.phaseLedgers.filter(isRecord) : [];
  const uiStates = Array.isArray(report.uiStates) ? report.uiStates.filter(isRecord) : [];
  const summary = isRecord(report.summary) ? report.summary : undefined;
  const weakScorecards = scorecard.filter((entry) => typeof entry.id !== "string" || entry.score !== 3).map((entry) => `${String(entry.id ?? "unknown")}:${String(entry.score ?? "missing")}`);
  const weakPhases = phaseLedgers.filter((entry) => typeof entry.id !== "string" || entry.status !== "pass" || entry.score !== 1).map((entry) => `${String(entry.id ?? "unknown")}:${String(entry.status ?? "missing")}:${String(entry.score ?? "missing")}`);
  const missingUiStates = uiStates.filter((entry) => typeof entry.id !== "string" || entry.present !== true).map((entry) => String(entry.id ?? "unknown"));
  if (
    scorecard.length === 0
    || phaseLedgers.length === 0
    || uiStates.length === 0
    || weakScorecards.length > 0
    || weakPhases.length > 0
    || missingUiStates.length > 0
    || summary?.averageVisualScore !== 3
    || summary?.phasesPassed !== phaseLedgers.length
    || summary?.uiStatesCovered !== uiStates.length
  ) {
    return [{
      code,
      message: `${label}: persisted report quality sections must show max visual score, passing phases, and complete UI-state coverage.`,
      path,
      severity: "error",
      suggestedFix: "Regenerate the QA/release report from current proof artifacts and fix any scorecard, phase, or UI coverage regressions before accepting generated-game proof.",
    }];
  }
  return [];
}

async function persistedProductionCommandDiagnostics(projectPath: string, report: Record<string, unknown>, label: string, path: string, code: string): Promise<VerificationDiagnostic[]> {
  const commands = Array.isArray(report.productionCommands) ? report.productionCommands.filter(isRecord) : [];
  if (commands.length === 0) {
    return [{
      code,
      message: `${label}: persisted report must include production command evidence rows.`,
      path: `${path}/productionCommands`,
      severity: "error",
      suggestedFix: "Regenerate the QA/release report with the current CLI so production command proof rows are recorded.",
    }];
  }
  for (const command of commands) {
    const status = typeof command.status === "string" ? command.status : undefined;
    const artifactPath = typeof command.artifactPath === "string" ? command.artifactPath : undefined;
    if (status !== "available" || artifactPath === undefined || !(await reportEvidencePathExists(projectPath, artifactPath))) {
      return [{
        code,
        message: `${label}: production command '${String(command.command ?? "unknown")}' must be backed by an existing artifact path.`,
        path: `${path}/productionCommands`,
        severity: "error",
        suggestedFix: "Rerun tn game qa --project <path> --run-proof --json and tn game release --project <path> --json so command artifacts are persisted.",
      }];
    }
  }
  return [];
}

async function persistedAssetLedgerDiagnostics(projectPath: string, report: Record<string, unknown>, label: string, path: string, code: string): Promise<VerificationDiagnostic[]> {
  const ledger = Array.isArray(report.assetAudioLedger) ? report.assetAudioLedger.filter(isRecord) : [];
  if (ledger.length === 0) {
    return [{
      code,
      message: `${label}: persisted report must include asset/audio ledger rows.`,
      path: `${path}/assetAudioLedger`,
      severity: "error",
      suggestedFix: "Regenerate the QA/release report with current source provenance and ensure every high-value surface has durable source evidence.",
    }];
  }
  for (const entry of ledger) {
    const surface = typeof entry.surface === "string" ? entry.surface : "unknown";
    const evidence = Array.isArray(entry.evidence) ? entry.evidence.filter(isRecord) : [];
    const hasDurableSource = evidence.some((item) => {
      const evidencePath = typeof item.path === "string" ? item.path : undefined;
      return isDurableAssetLedgerEvidence(item, evidencePath);
    });
    if (!hasDurableSource) {
      return [{
        code,
        message: `${label}: asset/audio ledger surface '${surface}' must include durable source or provenance evidence, not only runtime artifacts.`,
        path: `${path}/assetAudioLedger/${surface}`,
        severity: "error",
        suggestedFix: "Add or repair structured source/provenance rows for each high-value surface, then rerun tn game qa --run-proof and tn game release.",
      }];
    }
    for (const item of evidence) {
      const evidencePath = typeof item.path === "string" ? item.path : undefined;
      if (isDurableAssetLedgerEvidence(item, evidencePath) && evidencePath !== undefined && !(await reportEvidencePathExists(projectPath, evidencePath))) {
        return [{
          code,
          message: `${label}: asset/audio ledger surface '${surface}' durable evidence path is missing: ${evidencePath}.`,
          path: `${path}/assetAudioLedger/${surface}`,
          severity: "error",
          suggestedFix: "Regenerate the report after restoring the referenced structured source or provenance artifact.",
        }];
      }
    }
  }
  return [];
}

function isDurableAssetLedgerEvidence(item: Record<string, unknown>, evidencePath: string | undefined): boolean {
  if (item.kind === "source") {
    return true;
  }
  return evidencePath !== undefined
    && (evidencePath.startsWith("content/")
      || evidencePath.startsWith("assets/ASSET_PROVENANCE")
      || evidencePath.endsWith("/ASSET_PROVENANCE.md"));
}

function collectReportEvidence(report: Record<string, unknown>): Record<string, unknown>[] {
  const evidence: Record<string, unknown>[] = [];
  collectEvidenceArrays(report, evidence);
  return evidence;
}

function collectEvidenceArrays(value: unknown, output: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEvidenceArrays(item, output);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  const evidence = value.evidence;
  if (Array.isArray(evidence)) {
    output.push(...evidence.filter(isRecord));
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "evidence") {
      collectEvidenceArrays(child, output);
    }
  }
}

async function reportEvidencePathExists(projectPath: string, evidencePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(resolve(projectPath, evidencePath));
    return fileStat.isFile() || fileStat.isDirectory();
  } catch {
    return false;
  }
}

async function hasPlaytestProofStep(projectPath: string, step: Record<string, unknown>): Promise<boolean> {
  if (step.code !== "TN_PLAYTEST_OK" || typeof step.stdout !== "string") {
    return false;
  }
  try {
    const payload = JSON.parse(step.stdout) as unknown;
    if (!isRecord(payload) || payload.pass !== true || payload.expectMoved !== true) {
      return false;
    }
    const distance = typeof payload.distance === "number" ? payload.distance : undefined;
    const movementThreshold = typeof payload.movementThreshold === "number" ? payload.movementThreshold : 0.01;
    const movementDelta = Array.isArray(payload.movementDelta) ? payload.movementDelta : [];
    if (distance === undefined || distance <= movementThreshold || !movementDelta.some((value) => typeof value === "number" && Math.abs(value) > movementThreshold)) {
      return false;
    }
    if (typeof payload.expectAxis === "string") {
      const axisIndex = payload.expectAxis === "x" ? 0 : payload.expectAxis === "y" ? 1 : payload.expectAxis === "z" ? 2 : undefined;
      if (axisIndex === undefined || typeof movementDelta[axisIndex] !== "number" || Math.abs(movementDelta[axisIndex]) <= movementThreshold) {
        return false;
      }
    }
    if (typeof payload.artifact !== "string") {
      return false;
    }
    return await artifactPathExists(projectPath, payload.artifact);
  } catch {
    return false;
  }
}

async function sidecarProofDiagnostics(projectPath: string, label: string): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = [];
  for (const sidecar of SIDE_CAR_PROOFS) {
    const path = resolve(projectPath, sidecar.path);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch (error) {
      diagnostics.push({
        code: sidecar.missingCode,
        message: `${label}: unable to read ${sidecar.path}: ${error instanceof Error ? error.message : String(error)}.`,
        path,
        severity: "error",
        suggestedFix: "Rerun tn game qa --project <path> --run-proof --json with the current CLI so proof sidecars are recorded.",
      });
      continue;
    }
    const valid = sidecar.schema === "threenative.game-performance-proof"
      ? await isValidPerformanceProof(projectPath, parsed)
      : sidecar.schema === "threenative.game-asset-budget-proof"
        ? isValidAssetBudgetProof(parsed)
        : await isValidUiFitProof(projectPath, parsed);
    if (!valid) {
      diagnostics.push({
        code: sidecar.invalidCode,
        message: `${label}: ${sidecar.path} must contain passing, machine-checkable proof evidence.`,
        path,
        severity: "error",
        suggestedFix: "Rerun tn game qa --project <path> --run-proof --json and keep the generated proof sidecar.",
      });
    }
  }
  return diagnostics;
}

async function isValidPerformanceProof(projectPath: string, proof: unknown): Promise<boolean> {
  if (!isRecord(proof) || proof.schema !== "threenative.game-performance-proof" || proof.status !== "pass") {
    return false;
  }
  const evidence = proof.evidence;
  return isRecord(evidence)
    && evidence.distDirectory === true
    && await artifactEvidenceExists(projectPath, evidence.screenshot)
    && await artifactEvidenceExists(projectPath, evidence.mobileViewport);
}

function isValidAssetBudgetProof(proof: unknown): boolean {
  if (!isRecord(proof) || proof.schema !== "threenative.game-asset-budget-proof" || proof.status !== "pass") {
    return false;
  }
  const budgets = proof.budgets;
  const measurements = proof.measurements;
  if (!isRecord(budgets) || !isRecord(measurements)) {
    return false;
  }
  const distBudget = budgets.distBytes;
  const assetBudget = budgets.assetBytes;
  const contentBudget = budgets.contentBytes;
  const dist = measurements.dist;
  const assets = measurements.assets;
  const content = measurements.content;
  if (
    typeof distBudget !== "number"
    || typeof assetBudget !== "number"
    || typeof contentBudget !== "number"
    || !isRecord(dist)
    || !isRecord(assets)
    || !isRecord(content)
    || dist.exists !== true
    || typeof dist.byteSize !== "number"
    || typeof assets.byteSize !== "number"
    || typeof content.byteSize !== "number"
  ) {
    return false;
  }
  return dist.byteSize <= distBudget && assets.byteSize <= assetBudget && content.byteSize <= contentBudget;
}

async function isValidUiFitProof(projectPath: string, proof: unknown): Promise<boolean> {
  if (!isRecord(proof) || proof.schema !== "threenative.game-ui-fit-proof" || proof.status !== "pass") {
    return false;
  }
  const viewport = proof.viewport;
  const evidence = proof.evidence;
  return isRecord(viewport)
    && typeof viewport.preset === "string"
    && typeof viewport.width === "number"
    && typeof viewport.height === "number"
    && isRecord(evidence)
    && await artifactEvidenceExists(projectPath, evidence.mobileViewport);
}

async function artifactEvidenceExists(projectPath: string, evidence: unknown): Promise<boolean> {
  if (!isRecord(evidence) || typeof evidence.path !== "string" || typeof evidence.byteSize !== "number" || evidence.byteSize <= 0) {
    return false;
  }
  try {
    const fileStat = await stat(resolve(projectPath, evidence.path));
    return fileStat.isFile() && fileStat.size === evidence.byteSize;
  } catch {
    return false;
  }
}

async function artifactPathExists(projectPath: string, path: string): Promise<boolean> {
  try {
    const fileStat = await stat(resolve(projectPath, path));
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

async function readPngDimensions(path: string): Promise<{ height: number; width: number } | undefined> {
  try {
    const header = await readFile(path);
    if (
      header.length < 24
      || header[0] !== 0x89
      || header[1] !== 0x50
      || header[2] !== 0x4e
      || header[3] !== 0x47
      || header[4] !== 0x0d
      || header[5] !== 0x0a
      || header[6] !== 0x1a
      || header[7] !== 0x0a
      || header.toString("ascii", 12, 16) !== "IHDR"
    ) {
      return undefined;
    }
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    return width > 0 && height > 0 ? { height, width } : undefined;
  } catch {
    return undefined;
  }
}

async function hasMotionProofStep(projectPath: string, step: Record<string, unknown>): Promise<boolean> {
  if (step.code === "TN_GAME_QA_ARTIFACT_OK") {
    return await artifactPathExists(projectPath, "artifacts/game-production/motion.webm");
  }
  if (step.code !== "TN_RECORD_OK" || typeof step.stdout !== "string") {
    return false;
  }
  try {
    const payload = JSON.parse(step.stdout) as { outPath?: unknown };
    if (typeof payload.outPath !== "string" || !payload.outPath.endsWith("artifacts/game-production/motion.webm")) {
      return false;
    }
    const outPath = resolve(projectPath, payload.outPath);
    const fileStat = await stat(outPath);
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
