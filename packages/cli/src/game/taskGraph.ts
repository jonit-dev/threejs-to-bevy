import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { createGameAgentInventory } from "@threenative/authoring";

export interface IGameTaskGraphDiagnostic {
  code: "TN_GAME_TASK_PROOF_STALE" | "TN_GAME_TASK_SOURCE_MISSING";
  message: string;
  path: string;
  severity: "error" | "warning";
  suggestion: string;
}

export interface IGameTaskRecommendation {
  blockingDiagnostics: IGameTaskGraphDiagnostic[];
  command: string;
  expectedProof: string;
  id: string;
  operationId: string;
  phase: string;
  priority: number;
  sourceOwner: string;
  summary: string;
}

export interface IGameTaskGraph {
  code: "TN_GAME_TASK_GRAPH";
  diagnostics: IGameTaskGraphDiagnostic[];
  generatedAt: string;
  ok: boolean;
  projectPath: string;
  recommendations: IGameTaskRecommendation[];
  schema: "threenative.game-task-graph";
  sourceHash: string;
  version: "0.1.0";
}

export async function buildGameTaskGraph(options: { projectPath: string }): Promise<IGameTaskGraph> {
  const inventory = await createGameAgentInventory({ projectPath: options.projectPath });
  const diagnostics: IGameTaskGraphDiagnostic[] = [];
  const recommendations: IGameTaskRecommendation[] = [];

  if (inventory.scripts.length === 0) {
    const diagnostic = diagnosticRow(
      "TN_GAME_TASK_SOURCE_MISSING",
      "No gameplay script module/export is referenced from durable source.",
      "content/systems/*.json",
      "Attach a script with tn scene attach-script or apply a planned gameplay recipe.",
      "error",
    );
    diagnostics.push(diagnostic);
    recommendations.push({
      blockingDiagnostics: [diagnostic],
      command: "tn recipe apply top-down-collector --scene <scene-id> --player <player-id> --camera <camera-id> --project . --json",
      expectedProof: "tn authoring validate --project . --json",
      id: "wire-gameplay-script",
      operationId: "recipe.apply.top-down-collector",
      phase: "gameplay",
      priority: 100,
      sourceOwner: "content/scenes/*.scene.json + src/scripts/player.ts",
      summary: "Create or wire the first playable-loop script before visual proof.",
    });
  }

  if (inventory.ui.nodes.length === 0) {
    recommendations.push({
      blockingDiagnostics: [],
      command: "tn ui create hud --project . --json",
      expectedProof: "tn game score --project . --json",
      id: "add-retained-ui-state",
      operationId: "ui.create.hud",
      phase: "ui",
      priority: 70,
      sourceOwner: "content/ui/*.ui.json",
      summary: "Add retained HUD/status source for gameplay, pause, fail/retry, and win states.",
    });
  }

  if (inventory.highValueSurfaces.some((surface) => surface.provenanceStatus === "missing" || surface.provenanceStatus === "placeholder")) {
    recommendations.push({
      blockingDiagnostics: [],
      command: "tn asset source search --game-category <category> --format glb --direct-only --json",
      expectedProof: "tn asset inspect <asset-path> --json",
      id: "source-high-value-assets",
      operationId: "asset.source.search",
      phase: "assets",
      priority: 60,
      sourceOwner: "content/assets/*.assets.json + threenative.config.json#/production",
      summary: "Replace missing or placeholder high-value surfaces with catalog-backed asset evidence.",
    });
  }

  const sourceFiles = inventory.sourceFamilies.flatMap((family) => family.files);
  const screenshotPath = resolve(options.projectPath, "artifacts/game-production/screenshot.png");
  const screenshot = await optionalStat(screenshotPath);
  const newestSource = await newestMtime(options.projectPath, sourceFiles);
  if (screenshot === undefined) {
    recommendations.push({
      blockingDiagnostics: [],
      command: "tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json",
      expectedProof: "artifacts/game-production/screenshot.png",
      id: "capture-screenshot-proof",
      operationId: "proof.screenshot",
      phase: "qa",
      priority: 30,
      sourceOwner: "artifacts/game-production/screenshot.png",
      summary: "Capture a nonblank runtime screenshot after gameplay/source blockers are resolved.",
    });
  } else if (newestSource !== undefined && screenshot.mtimeMs < newestSource) {
    const diagnostic = diagnosticRow(
      "TN_GAME_TASK_PROOF_STALE",
      "Screenshot proof is older than durable source.",
      "artifacts/game-production/screenshot.png",
      "Run tn screenshot after rebuilding the current source.",
      "warning",
    );
    diagnostics.push(diagnostic);
    recommendations.push({
      blockingDiagnostics: [diagnostic],
      command: "tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json",
      expectedProof: "artifacts/game-production/screenshot.png",
      id: "refresh-stale-screenshot-proof",
      operationId: "proof.screenshot",
      phase: "qa",
      priority: 35,
      sourceOwner: "artifacts/game-production/screenshot.png",
      summary: "Refresh screenshot proof because source changed after the last capture.",
    });
  }

  if (!(await fileExists(resolve(options.projectPath, "artifacts/game-production/scale-analysis.json")))) {
    recommendations.push({
      blockingDiagnostics: [],
      command: "tn game scale --project . --out artifacts/game-production/scale-analysis.json --json",
      expectedProof: "artifacts/game-production/scale-analysis.json",
      id: "prove-relative-scale",
      operationId: "game.scale",
      phase: "visuals",
      priority: 25,
      sourceOwner: "artifacts/game-production/scale-analysis.json",
      summary: "Prove relative scale for hero, vehicles, obstacles, rewards, and landmarks.",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      blockingDiagnostics: [],
      command: "tn game qa --project . --run-proof --json",
      expectedProof: "artifacts/game-production/qa-report.json",
      id: "run-qa-proof",
      operationId: "game.qa.run-proof",
      phase: "qa",
      priority: 10,
      sourceOwner: "artifacts/game-production/qa-report.json",
      summary: "Refresh the canonical game-production QA report.",
    });
  }

  recommendations.sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id));
  return {
    code: "TN_GAME_TASK_GRAPH",
    diagnostics,
    generatedAt: new Date(0).toISOString(),
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    projectPath: options.projectPath,
    recommendations: recommendations.slice(0, 5),
    schema: "threenative.game-task-graph",
    sourceHash: await hashInventorySource(options.projectPath, sourceFiles),
    version: "0.1.0",
  };
}

async function newestMtime(projectPath: string, files: string[]): Promise<number | undefined> {
  const mtimes: number[] = [];
  for (const file of files) {
    const info = await optionalStat(resolve(projectPath, file));
    if (info !== undefined) {
      mtimes.push(info.mtimeMs);
    }
  }
  return mtimes.length === 0 ? undefined : Math.max(...mtimes);
}

function diagnosticRow(code: IGameTaskGraphDiagnostic["code"], message: string, path: string, suggestion: string, severity: IGameTaskGraphDiagnostic["severity"]): IGameTaskGraphDiagnostic {
  return { code, message, path, severity, suggestion };
}

async function hashInventorySource(projectPath: string, files: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const file of files.slice().sort()) {
    const path = resolve(projectPath, file);
    hash.update(file);
    if (await fileExists(path)) {
      hash.update(await readFile(path));
    }
  }
  return hash.digest("hex");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function optionalStat(path: string): Promise<{ mtimeMs: number } | undefined> {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}
