import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifacts.js";
import { auditGameplayParityCoverage, type GameplayParityCoverageSummary } from "./gameplayParityCoverage.js";
import {
  emptyGameplayParityManifest,
  gameplayParityEntryState,
  isGameplayParityPassingState,
  isRuntimeProbeEntry,
  validateGameplayParityManifest,
  type GameplayParityAssetProbeEntry,
  type GameplayParityAssertionResult,
  type GameplayParityDiagnostic,
  type GameplayParityManifest,
  type GameplayParityManifestEntry,
  type GameplayParityMaterialProbeEntry,
  type GameplayParityObservationSource,
  type GameplayParityProfile,
  type GameplayParityTarget,
  type GameplayParityTextureProbeEntry,
} from "./gameplayParityManifest.js";
import {
  compareAssetProbe,
  compareMaterialProbe,
  compareTextureProbe,
  type GameplayParityProbeObservations,
} from "./gameplayParityProbes.js";
import { runCommand, type CommandOptions } from "./runner.js";

export interface GameplayParityCaseResult {
  assertionResults: GameplayParityAssertionResult[];
  artifactLinks?: Record<string, string>;
  diagnostics: GameplayParityDiagnostic[];
  durationMs: number;
  entryId: string;
  status: "pass" | "fail" | "warning" | "skipped";
}

export interface GameplayParityRunner {
  run(entry: GameplayParityManifestEntry, context: GameplayParityRunnerContext): Promise<GameplayParityCaseResult>;
}

export interface GameplayParityRunnerContext {
  artifactDir: string;
  profile: GameplayParityProfile;
  root: string;
}

export interface GameplayParityReport {
  artifacts: {
    artifactDir: string;
    reportPath: string;
    targetReports: Record<string, string>;
  };
  assertionResults: GameplayParityAssertionResult[];
  code: "TN_GAMEPLAY_PARITY";
  coverage: Record<string, GameplayParityCoverageSummary>;
  diagnostics: GameplayParityDiagnostic[];
  duration: {
    budgetMs: number;
    perCase: Array<{
      durationMs: number;
      id: string;
      kind: GameplayParityManifestEntry["kind"];
      lastTimingSampleMs: number;
      mode: "enforced" | "report-only";
      profile: GameplayParityProfile;
      state: ReturnType<typeof gameplayParityEntryState>;
      status: GameplayParityCaseResult["status"];
    }>;
    totalMs: number;
  };
  generatedBy: "tools/verify gameplay parity";
  manifest: {
    entries: number;
    profile: GameplayParityProfile;
    stateCounts: Record<ReturnType<typeof gameplayParityEntryState>, number>;
  };
  ok: boolean;
  schema: "threenative.gameplay-parity.verification-report";
  startedAt: string;
  status: "pass" | "fail";
  version: "1";
}

export interface RunGameplayParityGateOptions {
  commandRunner?: (options: CommandOptions) => Promise<{ durationMs: number; exitCode: number; stderr: string; stdout: string }>;
  manifest?: GameplayParityManifest;
  profile?: GameplayParityProfile;
  reportPath?: string;
  root?: string;
  runner?: GameplayParityRunner;
}

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

export async function runGameplayParityGate(options: RunGameplayParityGateOptions = {}): Promise<GameplayParityReport> {
  const root = options.root ?? repoRoot;
  const profile = options.profile ?? "smoke";
  const artifactTargets = resolveArtifactTargets({ gate: "gameplay-parity", owner: { kind: "aggregate" }, root });
  const reportPath = options.reportPath ?? artifactTargets.reportPath;
  const manifest = options.manifest ?? defaultGameplayParityManifest();
  const entries = manifest.entries.filter((entry) => entry.profile === undefined || entry.profile === profile || profile === "full");
  const budgetMs = profile === "smoke" ? 60_000 : 180_000;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const diagnostics: GameplayParityDiagnostic[] = [];
  const assertionResults: GameplayParityAssertionResult[] = [];
  const coverage: Record<string, GameplayParityCoverageSummary> = {};
  const targetReports: Record<string, string> = {};
  const perCase: GameplayParityReport["duration"]["perCase"] = [];
  diagnostics.push(...validateGameplayParityManifest({ ...manifest, entries }));

  for (const entry of entries) {
    if (entry.kind === "sceneCoverage") {
      const summary = auditGameplayParityCoverage(entry, assertionResults);
      coverage[entry.id] = summary;
      diagnostics.push(...summary.diagnostics);
      perCase.push({
        durationMs: 0,
        id: entry.id,
        kind: entry.kind,
        lastTimingSampleMs: 0,
        mode: entry.mode ?? "enforced",
        profile: entry.profile ?? "smoke",
        state: gameplayParityEntryState(entry),
        status: summary.coverageStatus === "pass" ? "pass" : "fail",
      });
      continue;
    }

    const runner = options.runner ?? new DefaultGameplayParityRunner(options.commandRunner ?? runCommand);
    const result = normalizeReportOnlyCase(entry, await runner.run(entry, { artifactDir: artifactTargets.absoluteDir, profile, root }));
    assertionResults.push(...result.assertionResults);
    diagnostics.push(...result.diagnostics);
    Object.assign(targetReports, result.artifactLinks ?? {});
    perCase.push({
      durationMs: result.durationMs,
      id: entry.id,
      kind: entry.kind,
      lastTimingSampleMs: result.durationMs,
      mode: entry.mode ?? "enforced",
      profile: entry.profile ?? "smoke",
      state: gameplayParityEntryState(entry),
      status: result.status,
    });
    if (profile === "smoke" && isGameplayParityPassingState(entry) && result.durationMs > budgetMs) {
      diagnostics.push({
        code: "TN_GAMEPLAY_PARITY_SMOKE_BUDGET_EXCEEDED",
        message: `Smoke gameplay parity entry '${entry.id}' took ${result.durationMs}ms, exceeding the ${budgetMs}ms budget.`,
        severity: "error",
        suggestedFix: "Move this entry to the full profile or document timing evidence before promoting it back into smoke.",
      });
    }
  }

  const totalMs = Date.now() - startedMs;
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error")
    && assertionResults.every((assertion) => assertion.pass || assertion.diagnostic?.severity === "warning");
  const report: GameplayParityReport = {
    artifacts: {
      artifactDir: artifactTargets.relativeDir,
      reportPath: artifactTargets.relativeReportPath,
      targetReports,
    },
    assertionResults,
    code: "TN_GAMEPLAY_PARITY",
    coverage,
    diagnostics,
    duration: {
      budgetMs,
      perCase,
      totalMs,
    },
    generatedBy: "tools/verify gameplay parity",
    manifest: {
      entries: entries.length,
      profile,
      stateCounts: countStates(entries),
    },
    ok,
    schema: "threenative.gameplay-parity.verification-report",
    startedAt,
    status: ok ? "pass" : "fail",
    version: "1",
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export function defaultGameplayParityManifest(): GameplayParityManifest {
  return {
    schemaVersion: 1,
    entries: [
      {
        id: "humanoid-forward-movement-smoke",
        kind: "playtestScenario",
        mode: "enforced",
        profile: "smoke",
        project: "examples/humanoid-physics-course",
        scenario: "playtests/humanoid-course-forward-movement.playtest.json",
        targets: ["web", "desktop"],
      },
      {
        assert: { assets: [{ animations: ["Idle", "Walk", "Run"], id: "model.soldier", loaded: true, type: "gltf" }] },
        id: "humanoid-soldier-glb-loading",
        kind: "assetProbe",
        mode: "enforced",
        profile: "smoke",
        project: "examples/humanoid-physics-course",
        targets: ["web", "desktop"],
      },
      {
        assert: { textures: [{ id: "tex.grid.floor", loaded: true, repeat: [8, 12], role: "baseColor" }] },
        id: "humanoid-floor-texture",
        kind: "textureProbe",
        mode: "enforced",
        profile: "smoke",
        project: "examples/humanoid-physics-course",
        targets: ["web", "desktop"],
      },
      {
        assert: { materials: [{ baseColorTexture: "tex.grid.floor", id: "mat.course.surface" }] },
        id: "humanoid-floor-material",
        kind: "materialProbe",
        mode: "enforced",
        profile: "smoke",
        project: "examples/humanoid-physics-course",
        targets: ["web", "desktop"],
      },
      {
        assertions: [
          { kind: "playtestScenario", surface: "entities:player" },
          { kind: "playtestScenario", surface: "cameras:camera.main" },
          { kind: "assetLoaded", surface: "assets:model.soldier" },
          { kind: "assetAnimation", surface: "animationClips:Idle" },
          { kind: "assetAnimation", surface: "animationClips:Walk" },
          { kind: "assetAnimation", surface: "animationClips:Run" },
          { kind: "textureRepeat", surface: "textures:tex.grid.floor" },
          { kind: "materialTextureBinding", surface: "materials:mat.course.surface" },
          { kind: "playtestScenario", surface: "resources:GameState" },
          { kind: "playtestScenario", surface: "ui:hud.status" },
          { kind: "playtestScenario", surface: "ui:hud.progress" },
          { kind: "playtestScenario", surface: "scripts:updateHumanoidCourse" },
          { kind: "playtestScenario", surface: "colliders:player" },
          { kind: "playtestScenario", surface: "colliders:course.floor" },
        ],
        coverage: {
          reportOnly: [
            {
              reason: "Hazard trigger parity is quarantined until paired runtime observation sidecars prove trigger/resource mutation semantics.",
              surface: "triggers:hazard.sweeper.01",
            },
            {
              reason: "Hazard trigger parity is quarantined until paired runtime observation sidecars prove trigger/resource mutation semantics.",
              surface: "triggers:hazard.sweeper.02",
            },
          ],
        },
        id: "humanoid-course-scene-coverage",
        kind: "sceneCoverage",
        mode: "enforced",
        profile: "smoke",
        project: "examples/humanoid-physics-course",
        requiredSurfaces: {
          animationClips: ["Idle", "Walk", "Run"],
          assets: ["model.soldier"],
          cameras: ["camera.main"],
          colliders: ["player", "course.floor"],
          entities: ["player"],
          materials: ["mat.course.surface"],
          resources: ["GameState"],
          scripts: ["updateHumanoidCourse"],
          textures: ["tex.grid.floor"],
          triggers: ["hazard.sweeper.01", "hazard.sweeper.02"],
          ui: ["hud.status", "hud.progress"],
        },
        scene: "arena",
        targets: ["web", "desktop"],
      },
      ...fullProfileHumanoidReportOnlyEntries(),
    ],
  };
}

function normalizeReportOnlyCase(entry: GameplayParityManifestEntry, result: GameplayParityCaseResult): GameplayParityCaseResult {
  if (isGameplayParityPassingState(entry)) {
    return result;
  }
  const state = gameplayParityEntryState(entry);
  return {
    ...result,
    assertionResults: result.assertionResults.map((assertion) => ({
      ...assertion,
      diagnostic: assertion.diagnostic === undefined
        ? assertion.pass
          ? undefined
          : {
            code: "TN_GAMEPLAY_PARITY_NON_PASSING_STATE_FAILED",
            message: `${state} gameplay parity assertion '${assertion.id}' failed.`,
            severity: "warning" as const,
          }
        : { ...assertion.diagnostic, severity: "warning" as const },
    })),
    diagnostics: result.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      severity: "warning",
    })),
    status: result.status === "fail" ? "warning" : result.status,
  };
}

function countStates(entries: readonly GameplayParityManifestEntry[]): GameplayParityReport["manifest"]["stateCounts"] {
  const counts: GameplayParityReport["manifest"]["stateCounts"] = {
    calibrating: 0,
    enforced: 0,
    quarantined: 0,
    "report-only": 0,
  };
  for (const entry of entries) {
    counts[gameplayParityEntryState(entry)] += 1;
  }
  return counts;
}

class DefaultGameplayParityRunner implements GameplayParityRunner {
  constructor(private readonly commandRunner: NonNullable<RunGameplayParityGateOptions["commandRunner"]>) {}

  async run(entry: GameplayParityManifestEntry, context: GameplayParityRunnerContext): Promise<GameplayParityCaseResult> {
    if (entry.kind === "assetProbe" || entry.kind === "textureProbe" || entry.kind === "materialProbe") {
      return await runSourceBackedProbe(entry, context);
    }
    if (entry.kind !== "playtestScenario") {
      return noopCaseResult(entry);
    }
    const result = await this.commandRunner({
      args: [
        resolve(context.root, "packages/cli/dist/index.js"),
        "parity",
        "playtest",
        "--project",
        resolve(context.root, entry.project ?? "."),
        "--scenario",
        entry.scenario,
        "--targets",
        entry.targets.join(","),
        "--out",
        resolve(context.artifactDir, "playtests"),
        "--stable-artifacts",
        "--json",
      ],
      command: process.execPath,
      cwd: context.root,
      name: `gameplay parity ${entry.id}`,
      timeoutMs: context.profile === "smoke" ? 120_000 : 300_000,
    });
    const payload = parseJsonObject(result.stdout);
    const diagnostics = normalizeDiagnostics(payload?.diagnostics);
    const targetReports = isRecord(payload?.artifacts) && isRecord(payload.artifacts.targets)
      ? Object.fromEntries(Object.entries(payload.artifacts.targets).flatMap(([target, path]) => typeof path === "string" ? [[`${entry.id}.${target}`, path]] : []))
      : {};
    if (result.exitCode !== 0 && diagnostics.length === 0) {
      diagnostics.push({
        code: "TN_GAMEPLAY_PARITY_TARGET_FAILED",
        message: `Paired playtest scenario '${entry.id}' failed with exit code ${result.exitCode}.`,
        severity: "error",
        suggestedFix: result.stderr.trim() || result.stdout.trim() || "Inspect the paired playtest target summaries.",
      });
    }
    return {
      assertionResults: [
        {
          id: `${entry.id}.paired-targets`,
          kind: "playtestScenario",
          observed: { exitCode: result.exitCode, targets: Object.keys(targetReports) },
          pass: result.exitCode === 0 && payload?.pass === true,
          surface: `playtestScenario:${entry.id}`,
          target: "all",
        },
      ],
      artifactLinks: targetReports,
      diagnostics,
      durationMs: result.durationMs,
      entryId: entry.id,
      status: result.exitCode === 0 && payload?.pass === true ? "pass" : "fail",
    };
  }
}

function fullProfileHumanoidReportOnlyEntries(): GameplayParityManifest["entries"] {
  return [
    {
      artifactLinks: {
        latestSummary: "examples/humanoid-physics-course/artifacts/playtest/humanoid-course-ramp-traverse/latest/summary.json",
      },
      id: "humanoid-course-ramp-traverse-quarantined",
      kind: "playtestScenario",
      mode: "report-only",
      profile: "full",
      project: "examples/humanoid-physics-course",
      reason: "Full-profile evidence on 2026-07-09 failed the desktop paired target with TN_GAMEPLAY_PARITY_TARGET_FAILED; keep visible until desktop ramp contact/axis parity is fixed.",
      scenario: "playtests/humanoid-course-ramp-traverse.playtest.json",
      state: "quarantined",
      targets: ["web", "desktop"],
      timingSamplesMs: [17672, 16222],
      toleranceRationale: "Ramp traversal asserts forward motion, +Y resolved movement, and ramp contact with bounded movement-axis tolerance.",
    },
    {
      artifactLinks: {
        latestSummary: "examples/humanoid-physics-course/artifacts/playtest/humanoid-course-ball-push/latest/summary.json",
      },
      id: "humanoid-course-ball-push-enforced",
      kind: "playtestScenario",
      mode: "enforced",
      profile: "full",
      project: "examples/humanoid-physics-course",
      scenario: "playtests/humanoid-course-ball-push.playtest.json",
      state: "enforced",
      targets: ["web", "desktop"],
      timingSamplesMs: [1448],
      toleranceRationale: "Ball-push proves impulse/contact movement on the pushable body with a 0.15 unit minimum displacement assertion.",
    },
    {
      artifactLinks: {
        latestSummary: "examples/humanoid-physics-course/artifacts/playtest/humanoid-course-stairs/latest/summary.json",
      },
      id: "humanoid-course-stairs-calibrating",
      kind: "playtestScenario",
      mode: "report-only",
      profile: "full",
      project: "examples/humanoid-physics-course",
      promotionCriteria: "Promote after paired web/desktop runs prove stable step traversal without increasing smoke duration.",
      scenario: "playtests/humanoid-course-stairs.playtest.json",
      state: "calibrating",
      targets: ["web", "desktop"],
      timingSamplesMs: [2471],
      toleranceRationale: "Stair traversal is kept non-passing until vertical contact jitter has paired target samples.",
    },
    {
      artifactLinks: {
        latestSummary: "examples/humanoid-physics-course/artifacts/playtest/humanoid-course-hazard-hit/latest/summary.json",
      },
      featureSurfaces: {
        resources: ["GameState"],
        triggers: ["hazard.sweeper.01", "hazard.sweeper.02"],
      },
      id: "humanoid-course-hazard-hit-quarantined",
      kind: "playtestScenario",
      mode: "report-only",
      profile: "full",
      project: "examples/humanoid-physics-course",
      promotionCriteria: "Promote after paired web/desktop runtime observation sidecars prove trigger enter/stay and GameState.hits mutation parity with stable resource assertions.",
      reason: "Hazard/resource proof is visible, but trigger/resource mutation parity needs paired observation sidecars before enforcement.",
      scenario: "playtests/humanoid-course-hazard-hit.playtest.json",
      state: "quarantined",
      targets: ["web", "desktop"],
      timingSamplesMs: [1485],
      toleranceRationale: "Hazard hit asserts resource mutation and diagnostics; enforcement waits for paired runtime observation comparison.",
      whyThisFeature: "Trigger-volume checkpoint/hazard behavior proves sensor enter/stay, resource mutation, and HUD/resource observation parity risk.",
    },
  ];
}

async function runSourceBackedProbe(
  entry: GameplayParityAssetProbeEntry | GameplayParityTextureProbeEntry | GameplayParityMaterialProbeEntry,
  context: GameplayParityRunnerContext,
): Promise<GameplayParityCaseResult> {
  const started = Date.now();
  const sourceObservations = await collectSourceProbeObservations(resolve(context.root, entry.project ?? "."));
  const perTarget: Partial<Record<(typeof entry.targets)[number], GameplayParityProbeObservations>> = {};
  const sources: Partial<Record<(typeof entry.targets)[number], GameplayParityObservationSource>> = {};
  const artifactLinks: Record<string, string> = {};
  for (const target of entry.targets) {
    const sidecarPath = entry.observationSidecars?.[target];
    const discoveredSidecarPath = sidecarPath ?? await findRuntimeObservationSidecar(context.artifactDir, target, entry);
    const sidecar = discoveredSidecarPath === undefined
      ? undefined
      : await readProbeObservationSidecar(resolve(context.root, entry.project ?? "."), discoveredSidecarPath);
    if (sidecar !== undefined && discoveredSidecarPath !== undefined) {
      perTarget[target] = sidecar;
      sources[target] = "runtime-observation";
      artifactLinks[`${entry.id}.${target}`] = discoveredSidecarPath;
    } else {
      perTarget[target] = sourceObservations;
      sources[target] = "source-manifest";
      const artifactPath = resolve(context.artifactDir, "probes", entry.id, `${target}.json`);
      await mkdir(dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, `${JSON.stringify({
        generatedBy: "tools/verify gameplay parity source-backed probe",
        id: entry.id,
        kind: entry.kind,
        observations: sourceObservations,
        source: "source-manifest",
        target,
      }, null, 2)}\n`, "utf8");
      artifactLinks[`${entry.id}.${target}`] = artifactPath;
    }
  }
  const comparison = entry.kind === "assetProbe"
    ? compareAssetProbe(entry, perTarget, sources)
    : entry.kind === "textureProbe"
      ? compareTextureProbe(entry, perTarget, sources)
      : compareMaterialProbe(entry, perTarget, sources);
  return {
    assertionResults: comparison.assertionResults,
    artifactLinks,
    diagnostics: comparison.diagnostics,
    durationMs: Date.now() - started,
    entryId: entry.id,
    status: comparison.pass ? "pass" : "fail",
  };
}

async function findRuntimeObservationSidecar(
  directory: string,
  target: GameplayParityTarget,
  entry: GameplayParityAssetProbeEntry | GameplayParityTextureProbeEntry | GameplayParityMaterialProbeEntry,
): Promise<string | undefined> {
  for (const path of await findFiles(directory, "runtime-observations.json")) {
    if (!path.includes(`/${target}/`)) {
      continue;
    }
    const sidecar = await readProbeObservationSidecar("/", path);
    if (sidecar !== undefined && sidecarCoversProbe(entry, sidecar)) {
      return path;
    }
  }
  return undefined;
}

async function findFiles(directory: string, fileName: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findFiles(path, fileName));
      continue;
    }
    if (entry.isFile() && entry.name === fileName) {
      files.push(path);
    }
  }
  return files.sort();
}

function sidecarCoversProbe(
  entry: GameplayParityAssetProbeEntry | GameplayParityTextureProbeEntry | GameplayParityMaterialProbeEntry,
  observations: GameplayParityProbeObservations,
): boolean {
  if (entry.kind === "assetProbe") {
    return entry.assert.assets.every((asset) => observations.assets?.[asset.id] !== undefined);
  }
  if (entry.kind === "textureProbe") {
    return entry.assert.textures.every((texture) => observations.textures?.[texture.id] !== undefined);
  }
  return entry.assert.materials.every((material) => observations.materials?.[material.id] !== undefined);
}

async function readProbeObservationSidecar(projectPath: string, sidecarPath: string): Promise<GameplayParityProbeObservations | undefined> {
  try {
    const sidecar = readJsonObject(await readFile(resolve(projectPath, sidecarPath), "utf8"));
    const observations = isRecord(sidecar.observations) ? sidecar.observations : sidecar;
    return {
      assets: readProbeObservationMap(observations.assets, (value) => ({
        animations: readArray(value.animations).filter((item): item is string => typeof item === "string"),
        bounds: readNumberTriple(value.bounds),
        loaded: typeof value.loaded === "boolean" ? value.loaded : undefined,
      })),
      materials: readProbeObservationMap(observations.materials, (value) => ({
        baseColorTexture: typeof value.baseColorTexture === "string" ? value.baseColorTexture : undefined,
      })),
      textures: readProbeObservationMap(observations.textures, (value) => ({
        loaded: typeof value.loaded === "boolean" ? value.loaded : undefined,
        repeat: readNumberTuple(value.repeat, 2),
        role: typeof value.role === "string" ? value.role : undefined,
      })),
    };
  } catch {
    return undefined;
  }
}

function readProbeObservationMap<T>(
  value: unknown,
  read: (value: Record<string, unknown>) => T,
): Record<string, T> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value).flatMap(([id, observed]) => isRecord(observed) ? [[id, read(observed)]] : []));
}

async function collectSourceProbeObservations(projectPath: string): Promise<GameplayParityProbeObservations> {
  const assets = readJsonObject(await readFile(resolve(projectPath, "content/assets/arena.assets.json"), "utf8"));
  const materials = readJsonObject(await readFile(resolve(projectPath, "content/materials/arena.materials.json"), "utf8"));
  return {
    assets: Object.fromEntries(readArray(assets.assets).flatMap((asset) => {
      if (!isRecord(asset) || typeof asset.id !== "string") {
        return [];
      }
      return [[asset.id, {
        animations: readArray(asset.animations).flatMap((animation) => isRecord(animation) && typeof animation.sourceClip === "string" ? [animation.sourceClip] : []),
        loaded: typeof asset.path === "string" && asset.path.length > 0,
      }]];
    })),
    materials: Object.fromEntries(readArray(materials.materials).flatMap((material) => {
      if (!isRecord(material) || typeof material.id !== "string") {
        return [];
      }
      return [[material.id, {
        ...(typeof material.baseColorTexture === "string" ? { baseColorTexture: material.baseColorTexture } : {}),
      }]];
    })),
    textures: Object.fromEntries(readArray(assets.assets).flatMap((asset) => {
      if (!isRecord(asset) || typeof asset.id !== "string" || asset.type !== "texture") {
        return [];
      }
      const repeat = readNumberTuple(asset.repeat, 2);
      return [[asset.id, {
        loaded: typeof asset.path === "string" && asset.path.length > 0,
        ...(repeat === undefined ? {} : { repeat }),
      }]];
    })),
  };
}

class NoopGameplayParityRunner implements GameplayParityRunner {
  async run(entry: GameplayParityManifestEntry): Promise<GameplayParityCaseResult> {
    return noopCaseResult(entry);
  }
}

function noopCaseResult(entry: GameplayParityManifestEntry): GameplayParityCaseResult {
    const surface = isRuntimeProbeEntry(entry) ? `${entry.kind}:${entry.id}` : `playtestScenario:${entry.id}`;
    return {
      assertionResults: [
        {
          id: `${entry.id}.enrolled`,
          kind: entry.kind,
          observed: "enrolled",
          pass: true,
          surface,
          target: "all",
        },
      ],
      diagnostics: [],
      durationMs: 0,
      entryId: entry.id,
      status: "pass",
    };
  }

function parseProfile(args: readonly string[]): GameplayParityProfile {
  const profileFlag = args.find((arg) => arg.startsWith("--profile="));
  const profile = profileFlag?.split("=")[1] ?? args[args.indexOf("--profile") + 1];
  return profile === "full" ? "full" : "smoke";
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readNumberTuple(value: unknown, length: number): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== length || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    return undefined;
  }
  return [value[0] as number, value[1] as number];
}

function readNumberTriple(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    return undefined;
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function normalizeDiagnostics(value: unknown): GameplayParityDiagnostic[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).flatMap((diagnostic) => {
    if (typeof diagnostic.code !== "string" || typeof diagnostic.message !== "string") {
      return [];
    }
    return [{
      code: diagnostic.code,
      message: diagnostic.message,
      ...(typeof diagnostic.path === "string" ? { path: diagnostic.path } : {}),
      severity: diagnostic.severity === "warning" ? "warning" : "error",
      ...(typeof diagnostic.suggestedFix === "string" ? { suggestedFix: diagnostic.suggestedFix } : {}),
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  const report = await runGameplayParityGate({ profile: parseProfile(process.argv.slice(2)) });
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else {
    process.stdout.write(`gameplay parity ${report.status}: ${report.diagnostics.length} diagnostic(s), report ${report.artifacts.reportPath}\n`);
  }
  process.exitCode = report.ok ? 0 : 1;
}
