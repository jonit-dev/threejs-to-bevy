import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createGameAgentInventory, createGameQualityReport, validateGameQualityReport } from "@threenative/authoring";

import { resolveArtifactTargets } from "./artifacts.js";
import {
  qaProofDiagnostics,
  releaseReportDiagnostics,
  visualProvenanceDiagnostics,
  visualQualityDiagnostics,
  visualQualityMetricSummary,
} from "./gameProductionGateProofs.js";
import { type StepSummary, type VerificationDiagnostic } from "./runner.js";

export interface IGameProductionGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

export interface IGameProductionGateProject {
  projectPath: string;
  requireAgentInventory?: boolean;
  requireCleanRelease?: boolean;
  requireGameplaySource?: boolean;
  requireMaterialSource?: boolean;
  requirePlanArtifact?: boolean;
  requireQaProof?: boolean;
  requireReleaseReport?: boolean;
  requireUiSource?: boolean;
  requireVisualProvenance?: boolean;
  requireVisualQuality?: boolean;
}

interface IGameProductionGateOptions {
  generatedGames?: boolean;
  projectPath?: string;
  projects?: IGameProductionGateProject[];
  reportPath?: string;
  root?: string;
}

// Representative generated-game release evidence set.
// Current repo inventory has two generated games with production plan artifacts:
// humanoid-physics-course covers native scenario/character physics proof, and
// metro-surfer-heist covers runner/collector/trigger UI production evidence.
export const GENERATED_GAME_PROJECTS = [
  "examples/humanoid-physics-course",
  "examples/metro-surfer-heist",
] as const;

export const GENERATED_GAME_BUILD_ONLY_PROJECTS = [
  "examples/stylized-nature-component",
] as const;

export async function runGameProductionGate(options: IGameProductionGateOptions = {}): Promise<IGameProductionGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const projects = resolveProjects(options);
  const targets = resolveArtifactTargets({ gate: "game-production", owner: { kind: "aggregate", name: "game-production" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const projectResults = [];
  const diagnostics: VerificationDiagnostic[] = [];
  const steps: StepSummary[] = [];
  if (options.generatedGames === true) {
    diagnostics.push(...await generatedGameInventoryDiagnostics(root, projects));
    diagnostics.push(...await generatedGameReadmeScriptDiagnostics(root, projects));
  }
  for (const project of projects) {
    const startedAtMs = Date.now();
    const projectPath = resolve(root, project.projectPath);
    const report = await createGameQualityReport({ mode: "release", projectPath });
    const reportDiagnostics = validateGameQualityReport(report);
    const projectDiagnostics: VerificationDiagnostic[] = [
      ...reportDiagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        path: diagnostic.path,
        severity: "error" as const,
        suggestedFix: diagnostic.suggestedFix ?? diagnostic.suggestion,
      })),
      ...report.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        path: diagnostic.path,
        severity: diagnostic.severity === "error" ? "error" as const : "warning" as const,
        suggestedFix: diagnostic.suggestedFix ?? diagnostic.suggestion,
      })),
      ...(project.requireCleanRelease === true ? cleanReleaseDiagnostics(report.release.risks, project.projectPath) : []),
      ...(project.requireAgentInventory === true ? await agentInventoryDiagnostics(projectPath, project.projectPath) : []),
      ...(project.requireGameplaySource === true ? await gameplaySourceDiagnostics(projectPath, project.projectPath) : []),
      ...(project.requireMaterialSource === true ? await materialSourceDiagnostics(projectPath, project.projectPath) : []),
      ...(project.requirePlanArtifact === true ? await planArtifactDiagnostics(projectPath, project.projectPath) : []),
      ...(project.requireQaProof === true ? await qaProofDiagnostics(projectPath, project.projectPath) : []),
      ...(project.requireReleaseReport === true ? await releaseReportDiagnostics(projectPath, project.projectPath) : []),
      ...(project.requireUiSource === true ? await uiSourceDiagnostics(projectPath, project.projectPath) : []),
      ...(project.requireVisualProvenance === true ? await visualProvenanceDiagnostics(projectPath, project.projectPath) : []),
      ...(project.requireVisualQuality === true ? await visualQualityDiagnostics(projectPath, project.projectPath) : []),
    ];
    diagnostics.push(...projectDiagnostics);
    const projectOk = projectDiagnostics.every((diagnostic) => diagnostic.severity !== "error");
    const step: StepSummary = {
      durationMs: Date.now() - startedAtMs,
      exitCode: projectOk ? 0 : 1,
      name: `game production report validation: ${project.projectPath}`,
      stderr: "",
      stdout: JSON.stringify({
        blockers: report.blockers.length,
        projectPath,
        requireAgentInventory: project.requireAgentInventory === true,
        requireGameplaySource: project.requireGameplaySource === true,
        requireMaterialSource: project.requireMaterialSource === true,
        requirePlanArtifact: project.requirePlanArtifact === true,
        requireQaProof: project.requireQaProof === true,
        requireUiSource: project.requireUiSource === true,
        requireVisualProvenance: project.requireVisualProvenance === true,
        releaseRisks: report.release.risks.length,
        requireReleaseReport: project.requireReleaseReport === true,
        requireVisualQuality: project.requireVisualQuality === true,
      }),
    };
    steps.push(step);
    projectResults.push({
      ok: projectOk,
      projectPath,
      report,
    });
  }
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  const visualQualityMetrics = await visualQualityMetricSummary(root, projects);
  const summary = {
    failedProjectCount: projectResults.filter((result) => !result.ok).length,
    mode: options.generatedGames === true ? "generated-games" : options.projects !== undefined ? "custom" : "single-project",
    okProjectCount: projectResults.filter((result) => result.ok).length,
    projectCount: projects.length,
    projectPaths: projects.map((project) => project.projectPath),
    requiredProofCounts: requiredProofCounts(projects),
    ...(visualQualityMetrics === undefined ? {} : { visualQualityMetrics }),
  };
  const payload = {
    artifacts: {
      gameQualityReportPath: reportPath,
      projectPaths: projectResults.map((result) => result.projectPath),
    },
    code: ok ? "TN_VERIFY_GAME_PRODUCTION_OK" : "TN_VERIFY_GAME_PRODUCTION_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools gameProductionGate",
    ok,
    report: projectResults[0]?.report,
    reports: projectResults,
    schema: "threenative.verify.game-production",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps,
    summary,
    version: "0.1.0",
  };

  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return {
    diagnostics,
    ok,
    reportPath,
    steps,
  };
}

async function generatedGameInventoryDiagnostics(root: string, projects: IGameProductionGateProject[]): Promise<VerificationDiagnostic[]> {
  const releaseListed = new Set(projects.map((project) => project.projectPath));
  const buildOnlyListed = new Set(GENERATED_GAME_BUILD_ONLY_PROJECTS);
  const listed = new Set([...releaseListed, ...buildOnlyListed]);
  const overlap = [...releaseListed].filter((projectPath) => buildOnlyListed.has(projectPath as (typeof GENERATED_GAME_BUILD_ONLY_PROJECTS)[number]));
  const candidates = await discoverGeneratedGameCandidates(root);
  const unlisted = candidates.filter((candidate) => !listed.has(candidate));
  const diagnostics: VerificationDiagnostic[] = [];
  if (overlap.length > 0) {
    diagnostics.push({
      code: "TN_VERIFY_GENERATED_GAME_INVENTORY_OVERLAP",
      message: `Generated-game examples must be either release-enrolled or build-only, not both: ${overlap.join(", ")}.`,
      path: "tools/verify/src/gameProductionGate.ts",
      severity: "error",
      suggestedFix: "Remove overlapping examples from GENERATED_GAME_BUILD_ONLY_PROJECTS or GENERATED_GAME_PROJECTS.",
    });
  }
  if (unlisted.length > 0) {
    diagnostics.push({
      code: "TN_VERIFY_GENERATED_GAME_INVENTORY_DRIFT",
      message: `Generated-game aggregate inventory is missing production-artifact candidates: ${unlisted.join(", ")}.`,
      path: "tools/verify/src/gameProductionGate.ts",
      severity: "error",
      suggestedFix: "Add each generated game with artifacts/game-production/plan.json to GENERATED_GAME_PROJECTS or GENERATED_GAME_BUILD_ONLY_PROJECTS, or remove stale production artifacts if it is not maintained.",
    });
  }
  return diagnostics;
}

async function generatedGameReadmeScriptDiagnostics(root: string, projects: IGameProductionGateProject[]): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = [];
  for (const project of projects) {
    const projectPath = resolve(root, project.projectPath);
    const [readme, packageJson] = await Promise.all([
      readOptionalText(resolve(projectPath, "README.md")),
      readOptionalJson(resolve(projectPath, "package.json")),
    ]);
    if (readme === undefined || packageJson === undefined || !isRecord(packageJson.scripts)) {
      continue;
    }
    const scripts = packageJson.scripts;
    const referencedScripts = [...readme.matchAll(/pnpm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]).filter((script): script is string => script !== undefined);
    const missing = [...new Set(referencedScripts.filter((script) => !hasNonEmptyString(scripts[script])))].sort();
    if (missing.length > 0) {
      diagnostics.push({
        code: "TN_VERIFY_GENERATED_GAME_README_SCRIPT_MISSING",
        message: `${project.projectPath}: README references missing package scripts: ${missing.join(", ")}.`,
        path: `${project.projectPath}/README.md`,
        severity: "error",
        suggestedFix: "Add the referenced scripts to package.json or update the README useful commands block.",
      });
    }
  }
  return diagnostics;
}

async function discoverGeneratedGameCandidates(root: string): Promise<string[]> {
  const examplesPath = resolve(root, "examples");
  let entries: { isDirectory(): boolean; name: string }[];
  try {
    entries = await readdir(examplesPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const candidates: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const projectPath = `examples/${entry.name}`;
    if (await artifactPathExists(root, `${projectPath}/artifacts/game-production/plan.json`)) {
      candidates.push(projectPath);
    }
  }
  return candidates.sort();
}

function resolveProjects(options: IGameProductionGateOptions): IGameProductionGateProject[] {
  if (options.projects !== undefined && options.projects.length > 0) {
    return options.projects;
  }
  if (options.generatedGames === true) {
    return GENERATED_GAME_PROJECTS.map((projectPath) => ({
      projectPath,
      requireAgentInventory: projectPath === "examples/metro-surfer-heist",
      requireCleanRelease: true,
      requireGameplaySource: true,
      requireMaterialSource: true,
      requirePlanArtifact: true,
      requireQaProof: true,
      requireReleaseReport: true,
      requireUiSource: true,
      requireVisualProvenance: true,
      requireVisualQuality: true,
    }));
  }
  return [{ projectPath: options.projectPath ?? "tools/verify/fixtures/game-production" }];
}

function requiredProofCounts(projects: IGameProductionGateProject[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const project of projects) {
    incrementIfRequired(counts, "cleanRelease", project.requireCleanRelease);
    incrementIfRequired(counts, "agentInventory", project.requireAgentInventory);
    incrementIfRequired(counts, "gameplaySource", project.requireGameplaySource);
    incrementIfRequired(counts, "materialSource", project.requireMaterialSource);
    incrementIfRequired(counts, "planArtifact", project.requirePlanArtifact);
    incrementIfRequired(counts, "qaProof", project.requireQaProof);
    incrementIfRequired(counts, "releaseReport", project.requireReleaseReport);
    incrementIfRequired(counts, "uiSource", project.requireUiSource);
    incrementIfRequired(counts, "visualProvenance", project.requireVisualProvenance);
    incrementIfRequired(counts, "visualQuality", project.requireVisualQuality);
  }
  return counts;
}

async function agentInventoryDiagnostics(projectPath: string, displayPath: string): Promise<VerificationDiagnostic[]> {
  const inventory = await createGameAgentInventory({ projectPath });
  const diagnostics: VerificationDiagnostic[] = inventory.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: `${displayPath}: ${diagnostic.message}`,
    path: diagnostic.path,
    severity: diagnostic.severity === "error" ? "error" : "warning",
    suggestedFix: diagnostic.suggestion,
  }));
  const requiredFamilies = ["scene", "systems", "ui", "input", "material", "asset"] as const;
  for (const family of requiredFamilies) {
    if (!inventory.sourceFamilies.some((sourceFamily) => sourceFamily.kind === family && sourceFamily.count > 0)) {
      diagnostics.push({
        code: "TN_VERIFY_GAME_AGENT_INVENTORY_SOURCE_OWNER_MISSING",
        message: `${displayPath}: game agent inventory is missing source family '${family}'.`,
        path: `content/${family}`,
        severity: "error",
        suggestedFix: "Add the structured source document or classify this project outside the generated-game gate.",
      });
    }
  }
  if (inventory.scripts.length === 0) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_AGENT_INVENTORY_SCRIPT_OWNER_MISSING",
      message: `${displayPath}: game agent inventory has no script module/export owner.`,
      path: "content/systems",
      severity: "error",
      suggestedFix: "Declare a system script module/export in structured source or production.agent.scriptModules.",
    });
  }
  if (inventory.highValueSurfaces.some((surface) => surface.status !== "declared")) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_AGENT_INVENTORY_SURFACE_MISSING",
      message: `${displayPath}: game agent inventory has undeclared high-value surfaces.`,
      path: "threenative.config.json#/production/agent/highValueSurfaces",
      severity: "error",
      suggestedFix: "Declare player, obstacle, reward, world, UI, and audio surface ownership in production.agent.highValueSurfaces.",
    });
  }
  if (inventory.proofCommands.length === 0) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_AGENT_INVENTORY_PROOF_COMMANDS_MISSING",
      message: `${displayPath}: game agent inventory has no proof commands.`,
      path: "threenative.config.json#/production/proofCommands",
      severity: "error",
      suggestedFix: "Add production proof commands or package game:* scripts.",
    });
  }
  return diagnostics;
}

function incrementIfRequired(counts: Record<string, number>, key: string, required: boolean | undefined): void {
  if (required === true) {
    counts[key] = (counts[key] ?? 0) + 1;
  }
}

function cleanReleaseDiagnostics(
  risks: readonly { code: string; message: string; path: string; severity: string; suggestedFix: string }[],
  projectPath: string,
): VerificationDiagnostic[] {
  return risks.map((risk) => ({
    code: risk.code,
    message: `${projectPath}: ${risk.message}`,
    path: risk.path,
    severity: risk.severity === "error" ? "error" as const : "warning" as const,
    suggestedFix: risk.suggestedFix,
  }));
}

interface IGameplaySystemSource {
  exportName: string;
  module: string;
  path: string;
  systemId: string;
}

async function gameplaySourceDiagnostics(projectPath: string, label: string): Promise<VerificationDiagnostic[]> {
  const systems = await collectGameplaySystemSources(projectPath);
  const gameplaySystems = systems.filter((system) => system.module.startsWith("src/scripts/") && system.module.endsWith(".ts"));
  if (gameplaySystems.length === 0) {
    return [{
      code: "TN_VERIFY_GAME_GAMEPLAY_SOURCE_MISSING",
      message: `${label}: generated-game source must declare a gameplay system under content/systems or content/scenes with src/scripts module/export, GameState writes, and component/resource access.`,
      path: resolve(projectPath, "content/systems"),
      severity: "error",
      suggestedFix: "Add a durable structured-source system declaration pointing at src/scripts/**/*.ts, declare its export, reads/writes/resourceReads, and resourceWrites including GameState.",
    }];
  }
  for (const system of gameplaySystems) {
    const modulePath = resolve(projectPath, system.module);
    let source: string;
    try {
      source = await readFile(modulePath, "utf8");
    } catch (error) {
      return [{
        code: "TN_VERIFY_GAME_GAMEPLAY_SCRIPT_MISSING",
        message: `${label}: gameplay system '${system.systemId}' references missing script module ${system.module}: ${error instanceof Error ? error.message : String(error)}.`,
        path: system.path,
        severity: "error",
        suggestedFix: "Restore the referenced src/scripts module or update the structured-source system declaration to the durable gameplay script.",
      }];
    }
    if (!hasNamedScriptExport(source, system.exportName)) {
      return [{
        code: "TN_VERIFY_GAME_GAMEPLAY_SCRIPT_EXPORT_MISSING",
        message: `${label}: gameplay system '${system.systemId}' references ${system.module}#${system.exportName}, but that named export was not found.`,
        path: system.path,
        severity: "error",
        suggestedFix: "Export the declared gameplay function from the script module or update the structured-source system declaration to the correct export.",
      }];
    }
  }
  return [];
}

async function collectGameplaySystemSources(projectPath: string): Promise<IGameplaySystemSource[]> {
  const systems: IGameplaySystemSource[] = [];
  for (const path of await sourceJsonPaths(resolve(projectPath, "content/systems"))) {
    systems.push(...await systemSourcesFromDocument(projectPath, path));
  }
  for (const path of await sourceJsonPaths(resolve(projectPath, "content/scenes"))) {
    systems.push(...await systemSourcesFromDocument(projectPath, path));
  }
  return systems;
}

async function sourceJsonPaths(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => resolve(directory, entry.name));
  } catch {
    return [];
  }
}

async function systemSourcesFromDocument(projectPath: string, path: string): Promise<IGameplaySystemSource[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.systems)) {
    return [];
  }
  const relativePath = path.startsWith(`${projectPath}/`) ? path.slice(projectPath.length + 1) : path;
  return parsed.systems.filter(isRecord).flatMap((system) => {
    const script = system.script;
    if (!isRecord(script) || !hasNonEmptyString(script.module) || !hasNonEmptyString(script.export)) {
      return [];
    }
    const reads = Array.isArray(system.reads) ? system.reads : [];
    const writes = Array.isArray(system.writes) ? system.writes : [];
    const resourceReads = Array.isArray(system.resourceReads) ? system.resourceReads : [];
    const resourceWrites = Array.isArray(system.resourceWrites) ? system.resourceWrites : [];
    if (!resourceWrites.includes("GameState") || (reads.length === 0 && writes.length === 0 && resourceReads.length === 0)) {
      return [];
    }
    return [{
      exportName: script.export,
      module: script.module,
      path: relativePath,
      systemId: typeof system.id === "string" ? system.id : "unknown",
    }];
  });
}

function hasNamedScriptExport(source: string, exportName: string): boolean {
  const escaped = escapeRegExp(exportName);
  const declaration = new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|class|const|let|var)\\s+${escaped}\\b`);
  return declaration.test(source) || hasExportListName(source, exportName);
}

function hasExportListName(source: string, exportName: string): boolean {
  const exportLists = source.matchAll(/\bexport\s*\{([^}]*)\}/g);
  for (const match of exportLists) {
    const names = match[1]?.split(",") ?? [];
    if (names.some((name) => {
      const parts = name.trim().split(/\s+as\s+/);
      return parts[0]?.trim() === exportName || parts[1]?.trim() === exportName;
    })) {
      return true;
    }
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function materialSourceDiagnostics(projectPath: string, label: string): Promise<VerificationDiagnostic[]> {
  const paths = await sourceJsonPaths(resolve(projectPath, "content/materials"));
  if (paths.length === 0) {
    return [{
      code: "TN_VERIFY_GAME_MATERIAL_SOURCE_MISSING",
      message: `${label}: generated-game source must include authored content/materials material source.`,
      path: resolve(projectPath, "content/materials"),
      severity: "error",
      suggestedFix: "Add content/materials/*.json with multiple authored material rows, varied colors, and roughness values.",
    }];
  }
  const summary = await materialSourceSummary(paths);
  if (summary.materialCount === 0) {
    return [{
      code: "TN_VERIFY_GAME_MATERIAL_SOURCE_MISSING",
      message: `${label}: generated-game material source documents must contain material rows.`,
      path: resolve(projectPath, "content/materials"),
      severity: "error",
      suggestedFix: "Repair content/materials/*.json so material rows are retained in durable source.",
    }];
  }
  if (summary.materialCount < 5 || summary.colorCount < 5 || summary.roughnessCount < Math.min(5, summary.materialCount)) {
    return [{
      code: "TN_VERIFY_GAME_MATERIAL_SOURCE_WEAK",
      message: `${label}: generated-game material source must include at least five authored materials, five distinct colors, and roughness values on the main surface set.`,
      path: resolve(projectPath, "content/materials"),
      severity: "error",
      suggestedFix: "Add varied authored material rows for ground, player, rewards, hazards, and world/set-dressing surfaces.",
    }];
  }
  return [];
}

async function materialSourceSummary(paths: readonly string[]): Promise<{ colorCount: number; materialCount: number; roughnessCount: number }> {
  const colors = new Set<string>();
  let materialCount = 0;
  let roughnessCount = 0;
  for (const path of paths) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.materials)) {
      continue;
    }
    for (const material of parsed.materials.filter(isRecord)) {
      materialCount += 1;
      if (typeof material.color === "string" && material.color.trim().length > 0) {
        colors.add(material.color.trim().toLowerCase());
      }
      if (typeof material.roughness === "number") {
        roughnessCount += 1;
      }
    }
  }
  return { colorCount: colors.size, materialCount, roughnessCount };
}

async function uiSourceDiagnostics(projectPath: string, label: string): Promise<VerificationDiagnostic[]> {
  const paths = await sourceJsonPaths(resolve(projectPath, "content/ui"));
  if (paths.length === 0) {
    return [{
      code: "TN_VERIFY_GAME_UI_SOURCE_MISSING",
      message: `${label}: generated-game source must include retained content/ui HUD source.`,
      path: resolve(projectPath, "content/ui"),
      severity: "error",
      suggestedFix: "Add content/ui/*.ui.json with retained gameplay HUD/status text nodes and GameState bindings.",
    }];
  }
  const summaries: IUiSourceSummary[] = [];
  for (const path of paths) {
    const summary = await uiSourceSummary(path);
    if (summary !== undefined) {
      summaries.push(summary);
    }
  }
  if (summaries.length === 0) {
    return [{
      code: "TN_VERIFY_GAME_UI_SOURCE_MISSING",
      message: `${label}: generated-game UI source documents could not be read as structured UI JSON.`,
      path: resolve(projectPath, "content/ui"),
      severity: "error",
      suggestedFix: "Repair content/ui/*.ui.json so generated-game HUD source is valid JSON with nodes and bindings.",
    }];
  }
  const completeSummaries = summaries.filter((summary) => summary.textNodeIds.size >= 3 && summary.gameStateBindings >= 2);
  if (completeSummaries.length === 0) {
    return [{
      code: "TN_VERIFY_GAME_UI_SOURCE_WEAK",
      message: `${label}: generated-game UI source must retain at least three text/status nodes and two GameState bindings targeting existing nodes.`,
      path: resolve(projectPath, "content/ui"),
      severity: "error",
      suggestedFix: "Add retained gameplay HUD/status text nodes and bind score, timer, objective, or status text to GameState resource fields.",
    }];
  }
  const missingStates = requiredUiSourceStates().filter((state) => !completeSummaries.some((summary) => summary.stateIds.has(state)));
  if (missingStates.length > 0) {
    return [{
      code: "TN_VERIFY_GAME_UI_SOURCE_STATES_INCOMPLETE",
      message: `${label}: generated-game UI source is missing retained UI state affordances for ${missingStates.join(", ")}.`,
      path: resolve(projectPath, "content/ui"),
      severity: "error",
      suggestedFix: "Retain source UI nodes for gameplay, pause, settings, loading, fail/retry, win/milestone, and touch-control states.",
    }];
  }
  return [];
}

interface IUiSourceSummary {
  gameStateBindings: number;
  stateIds: Set<string>;
  textNodeIds: Set<string>;
}

async function uiSourceSummary(path: string): Promise<IUiSourceSummary | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.nodes)) {
    return undefined;
  }
  const stateIds = new Set<string>();
  const textNodeIds = new Set<string>();
  for (const node of parsed.nodes.filter(isRecord)) {
    if (typeof node.id !== "string") {
      continue;
    }
    const hasText = typeof node.text === "string" && node.text.trim().length > 0;
    const hasLabel = typeof node.label === "string" && node.label.trim().length > 0;
    const isTextType = node.type === "text" || node.kind === "text";
    if (hasText || hasLabel || isTextType) {
      textNodeIds.add(node.id);
    }
    const haystack = `${node.id} ${typeof node.text === "string" ? node.text : ""} ${typeof node.label === "string" ? node.label : ""}`.toLowerCase();
    for (const state of requiredUiSourceStates()) {
      if (uiStateSourceTerms(state).some((term) => haystack.includes(term))) {
        stateIds.add(state);
      }
    }
  }
  const bindings = Array.isArray(parsed.bindings) ? parsed.bindings.filter(isRecord) : [];
  const gameStateBindings = bindings.filter((binding) => {
    const node = typeof binding.node === "string" ? binding.node : undefined;
    const resource = typeof binding.resource === "string" ? binding.resource : undefined;
    return node !== undefined && textNodeIds.has(node) && resource !== undefined && (resource === "GameState" || resource.startsWith("GameState."));
  }).length;
  return { gameStateBindings, stateIds, textNodeIds };
}

function requiredUiSourceStates(): string[] {
  return ["gameplay", "pause", "settings", "loading", "fail-retry", "win-milestone", "touch-controls"];
}

function uiStateSourceTerms(state: string): string[] {
  if (state === "gameplay") {
    return ["gameplay", "hud", "score", "status", "objective"];
  }
  if (state === "fail-retry") {
    return ["fail-retry", "retry", "failed", "failure", "lost", "again"];
  }
  if (state === "win-milestone") {
    return ["win-milestone", "win", "milestone", "complete", "delivered", "success"];
  }
  if (state === "touch-controls") {
    return ["touch-controls", "touch", "mobile-control", "mobile controls"];
  }
  return [state];
}

async function planArtifactDiagnostics(projectPath: string, label: string): Promise<VerificationDiagnostic[]> {
  const path = resolve(projectPath, "artifacts/game-production/plan.json");
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isRecord(parsed) || parsed.schema !== "threenative.game-plan" || parsed.mutate !== false) {
      return [{
        code: "TN_VERIFY_GAME_PLAN_INVALID",
        message: `${label}: generated-game plan must be a persisted tn game plan artifact with schema threenative.game-plan and mutate=false.`,
        path,
        severity: "error",
        suggestedFix: "Run tn game plan --goal <game idea> --project <path> --json > artifacts/game-production/plan.json before implementation.",
      }];
    }
    const diagnostics = [
      ...designPlanDiagnostics(parsed, label, path),
      ...acceptancePlanDiagnostics(parsed, label, path),
      ...assetPlanDiagnostics(parsed, label, path),
      ...sourceScriptPolishPlanDiagnostics(parsed, label, path),
      ...gameplayBlockPlanDiagnostics(parsed, label, path),
    ];
    return diagnostics;
  } catch (error) {
    return [{
      code: "TN_VERIFY_GAME_PLAN_MISSING",
      message: `${label}: unable to read generated-game production plan: ${error instanceof Error ? error.message : String(error)}.`,
      path,
      severity: "error",
      suggestedFix: "Run tn game plan --goal <game idea> --project <path> --json > artifacts/game-production/plan.json and keep it with the game-production evidence.",
    }];
  }
}

function acceptancePlanDiagnostics(plan: Record<string, unknown>, label: string, path: string): VerificationDiagnostic[] {
  const acceptanceCriteria = hasStringArray(plan.acceptanceCriteria) ? plan.acceptanceCriteria : [];
  const requiredCriteria = [
    { id: "objective/playable loop", terms: ["objective", "input", "complete", "fail"] },
    { id: "asset/provenance", terms: ["asset", "provenance"] },
    { id: "script/source wiring", terms: ["src/scripts", "structured source"] },
    { id: "authored visual baseline", terms: ["authored materials", "lighting", "set dressing"] },
    { id: "proof loop", terms: ["proof", "playtest", "screenshot", "release"] },
  ];
  const missingCriteria = requiredCriteria
    .filter((criterion) => !acceptanceCriteria.some((entry) => criterion.terms.every((term) => entry.toLowerCase().includes(term))))
    .map((criterion) => criterion.id);
  if (missingCriteria.length === 0) {
    return [];
  }
  return [{
    code: "TN_VERIFY_GAME_PLAN_ACCEPTANCE_INCOMPLETE",
    message: `${label}: generated-game plan is missing acceptance criteria for ${missingCriteria.join(", ")}.`,
    path: `${path}/acceptanceCriteria`,
    severity: "error",
    suggestedFix: "Regenerate the plan with the current tn game plan command and keep the complete acceptanceCriteria section.",
  }];
}

function designPlanDiagnostics(plan: Record<string, unknown>, label: string, path: string): VerificationDiagnostic[] {
  const design = plan.design;
  const diagnostics: VerificationDiagnostic[] = [];
  if (!isRecord(design)
    || !(hasNonEmptyString(design.controls) || hasStringArray(design.controls))
    || !hasNonEmptyString(design.failRetry)
    || !hasStringArray(design.feedback)
    || !hasNonEmptyString(design.loop)
    || !hasNonEmptyString(design.objective)
    || !hasNonEmptyString(design.progression)
  ) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_PLAN_DESIGN_INCOMPLETE",
      message: `${label}: generated-game plan must name controls, objective, progression, fail/retry path, playable loop, and feedback moments.`,
      path: `${path}/design`,
      severity: "error",
      suggestedFix: "Regenerate the plan with the current tn game plan command and keep the complete design section.",
    });
  }
  return diagnostics;
}

function assetPlanDiagnostics(plan: Record<string, unknown>, label: string, path: string): VerificationDiagnostic[] {
  const assetPlan = Array.isArray(plan.assetPlan) ? plan.assetPlan.filter(isRecord) : [];
  const diagnostics: VerificationDiagnostic[] = [];
  const requiredSurfaces = ["player-hero", "obstacle-enemy", "reward-interactable", "world-environment", "ui-hud", "audio-feedback"];
  const missingSurfaces = requiredSurfaces.filter((surface) => !assetPlan.some((entry) => entry.surface === surface && hasNonEmptyString(entry.sourcePreference) && hasNonEmptyString(entry.fallback)));
  if (missingSurfaces.length > 0) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_PLAN_SURFACES_INCOMPLETE",
      message: `${label}: generated-game plan is missing high-value surface inventory for ${missingSurfaces.join(", ")}.`,
      path: `${path}/assetPlan`,
      severity: "error",
      suggestedFix: "Regenerate the plan with the current tn game plan command so every required player/world/reward/UI/audio surface has sourcing and fallback notes.",
    });
  }
  if (!assetPlan.some((entry) => hasNonEmptyString(entry.searchCommand) && entry.searchCommand.includes("tn asset source search") && entry.searchCommand.includes("--direct-only") && entry.searchCommand.includes("--json"))) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_PLAN_CATALOG_SEARCH_MISSING",
      message: `${label}: generated-game plan must include a first sourcing command that searches the shipped asset-source catalog for direct GLB results.`,
      path: `${path}/assetPlan`,
      severity: "error",
      suggestedFix: "Regenerate the plan with the current tn game plan command so asset sourcing starts with tn asset source search --format glb --direct-only --json.",
    });
  }
  return diagnostics;
}

function gameplayBlockPlanDiagnostics(plan: Record<string, unknown>, label: string, path: string): VerificationDiagnostic[] {
  if (plan.gameplayBlocks === undefined) {
    return [];
  }
  if (!Array.isArray(plan.gameplayBlocks)) {
    return [{
      code: "TN_VERIFY_GAME_PLAN_GAMEPLAY_BLOCKS_INVALID",
      message: `${label}: generated-game plan gameplayBlocks must be an array when present.`,
      path: `${path}/gameplayBlocks`,
      severity: "error",
      suggestedFix: "Regenerate the plan with tn game plan --goal <game idea> --project <path> --json and preserve the gameplayBlocks array.",
    }];
  }
  const blocks = plan.gameplayBlocks.filter(isRecord);
  const validKinds = new Set(["basis", "controller", "camera", "objective", "spawn", "ai", "combat", "world"]);
  const validSources = new Set(["threenative", "gameblocks-inspired"]);
  const invalidRows = blocks.filter((block) => {
    return !hasNonEmptyString(block.id)
      || !validKinds.has(String(block.kind))
      || !validSources.has(String(block.source))
      || !hasStringArray(block.appliesWhen)
      || !hasStringArray(block.helperImports)
      || !hasStringArray(block.recipeIds)
      || !hasStringArray(block.scriptResponsibilities)
      || !hasStringArray(block.proof)
      || !hasStringArray(block.cautions);
  });
  const missingRequired = ["basis.y-up-z-forward"].filter((id) => !blocks.some((block) => block.id === id));
  const hasActionableBlock = blocks.some((block) => hasStringArray(block.helperImports) && hasStringArray(block.proof) && (block.helperImports as unknown[]).length > 0 && (block.proof as unknown[]).some((entry) => typeof entry === "string" && entry.includes("tn ")));
  if (invalidRows.length === 0 && missingRequired.length === 0 && hasActionableBlock) {
    return [];
  }
  return [{
    code: "TN_VERIFY_GAME_PLAN_GAMEPLAY_BLOCKS_INVALID",
    message: `${label}: generated-game plan gameplayBlocks must preserve basis, helper imports, recipe IDs, script responsibilities, proof commands, cautions, kind, and source metadata.`,
    path: `${path}/gameplayBlocks`,
    severity: "error",
    suggestedFix: "Regenerate the plan with current tn game plan output and keep the complete gameplayBlocks rows.",
  }];
}

function sourceScriptPolishPlanDiagnostics(plan: Record<string, unknown>, label: string, path: string): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  const sourcePlan = Array.isArray(plan.sourcePlan) ? plan.sourcePlan.filter(isRecord) : [];
  const scriptPlan = Array.isArray(plan.scriptPlan) ? plan.scriptPlan.filter(isRecord) : [];
  const polishPlan = Array.isArray(plan.polishPlan) ? plan.polishPlan.filter(isRecord) : [];
  const proofCommands = hasStringArray(plan.proofCommands) ? plan.proofCommands : [];
  const sourceDocuments = ["scene", "input", "systems", "ui", "materials", "assets"];
  const missingSources = sourceDocuments.filter((document) => !sourcePlan.some((entry) => entry.document === document && hasNonEmptyString(entry.path) && hasStringArray(entry.supportedShape)));
  if (missingSources.length > 0) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_PLAN_SOURCE_SHAPE_INCOMPLETE",
      message: `${label}: generated-game plan is missing source-shape guidance for ${missingSources.join(", ")}.`,
      path: `${path}/sourcePlan`,
      severity: "error",
      suggestedFix: "Regenerate the plan with the current tn game plan command so source documents and supported shapes are recorded.",
    });
  }
  if (!scriptPlan.some((entry) => hasNonEmptyString(entry.module) && hasNonEmptyString(entry.exportName) && hasStringArray(entry.state))) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_PLAN_SCRIPT_INCOMPLETE",
      message: `${label}: generated-game plan must name script modules/exports and the gameplay state they own.`,
      path: `${path}/scriptPlan`,
      severity: "error",
      suggestedFix: "Regenerate the plan with the current tn game plan command and keep the scriptPlan section.",
    });
  }
  const requiredPolishCategories = ["composition", "materials", "silhouette", "lighting-environment", "motion-feedback"];
  const missingPolishCategories = requiredPolishCategories.filter((category) => !polishPlan.some((entry) => entry.category === category && hasNonEmptyString(entry.acceptance) && hasNonEmptyString(entry.treatment)));
  if (missingPolishCategories.length > 0) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_PLAN_POLISH_INCOMPLETE",
      message: `${label}: generated-game plan is missing polish checklist categories for ${missingPolishCategories.join(", ")}.`,
      path: `${path}/polishPlan`,
      severity: "error",
      suggestedFix: "Regenerate the plan with the current tn game plan command and keep the full polishPlan section.",
    });
  }
  const requiredProofCommands = [
    { id: "authoring validate", matches: (command: string) => command.includes("tn authoring validate") },
    { id: "build", matches: (command: string) => command.includes("tn build") },
    { id: "playtest", matches: (command: string) => command.includes("tn playtest") && command.includes("--expect-moved") },
    { id: "screenshot", matches: (command: string) => command.includes("tn screenshot") },
    { id: "score", matches: (command: string) => command.includes("tn game score") },
    { id: "qa --run-proof", matches: (command: string) => command.includes("tn game qa") && command.includes("--run-proof") },
    { id: "release", matches: (command: string) => command.includes("tn game release") },
  ];
  const missingProofCommands = requiredProofCommands.filter((proof) => !proofCommands.some(proof.matches)).map((proof) => proof.id);
  if (missingProofCommands.length > 0) {
    diagnostics.push({
      code: "TN_VERIFY_GAME_PLAN_PROOF_COMMANDS_INCOMPLETE",
      message: `${label}: generated-game plan is missing proof command guidance for ${missingProofCommands.join(", ")}.`,
      path: `${path}/proofCommands`,
      severity: "error",
      suggestedFix: "Regenerate the plan with the current tn game plan command and keep authoring validate, build, playtest, screenshot, score, QA, and release proof commands.",
    });
  }
  return diagnostics;
}

async function artifactPathExists(projectPath: string, path: string): Promise<boolean> {
  try {
    const fileStat = await stat(resolve(projectPath, path));
    return fileStat.isFile() && fileStat.size > 0;
  } catch {
    return false;
  }
}

async function readOptionalJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function readOptionalText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim().length > 0);
}
