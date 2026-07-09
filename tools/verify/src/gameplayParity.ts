import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifacts.js";
import { auditGameplayParityCoverage, type GameplayParityCoverageSummary } from "./gameplayParityCoverage.js";
import {
  emptyGameplayParityManifest,
  isRuntimeProbeEntry,
  type GameplayParityAssetProbeEntry,
  type GameplayParityAssertionResult,
  type GameplayParityDiagnostic,
  type GameplayParityManifest,
  type GameplayParityManifestEntry,
  type GameplayParityMaterialProbeEntry,
  type GameplayParityProfile,
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
    perCase: Array<{ durationMs: number; id: string; kind: GameplayParityManifestEntry["kind"]; mode: "enforced" | "report-only"; status: GameplayParityCaseResult["status"] }>;
    totalMs: number;
  };
  generatedBy: "tools/verify gameplay parity";
  manifest: {
    entries: number;
    profile: GameplayParityProfile;
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
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const diagnostics: GameplayParityDiagnostic[] = [];
  const assertionResults: GameplayParityAssertionResult[] = [];
  const coverage: Record<string, GameplayParityCoverageSummary> = {};
  const targetReports: Record<string, string> = {};
  const perCase: GameplayParityReport["duration"]["perCase"] = [];

  for (const entry of entries) {
    if (entry.kind === "sceneCoverage") {
      const summary = auditGameplayParityCoverage(entry, assertionResults);
      coverage[entry.id] = summary;
      diagnostics.push(...summary.diagnostics);
      perCase.push({
        durationMs: 0,
        id: entry.id,
        kind: entry.kind,
        mode: entry.mode ?? "enforced",
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
      mode: entry.mode ?? "enforced",
      status: result.status,
    });
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
      budgetMs: profile === "smoke" ? 60_000 : 180_000,
      perCase,
      totalMs,
    },
    generatedBy: "tools/verify gameplay parity",
    manifest: {
      entries: entries.length,
      profile,
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
  if (entry.mode !== "report-only") {
    return result;
  }
  return {
    ...result,
    assertionResults: result.assertionResults.map((assertion) => ({
      ...assertion,
      diagnostic: assertion.diagnostic === undefined
        ? assertion.pass
          ? undefined
          : {
            code: "TN_GAMEPLAY_PARITY_REPORT_ONLY_FAILED",
            message: `Report-only gameplay parity assertion '${assertion.id}' failed.`,
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
      ? Object.fromEntries(Object.entries(payload.artifacts.targets).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
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
  const scenarios = [
    "humanoid-course-ramp-traverse",
    "humanoid-course-stairs",
    "humanoid-course-hazard-hit",
    "humanoid-course-ball-push",
  ];
  return scenarios.map((name) => ({
    id: `${name}-report-only`,
    kind: "playtestScenario" as const,
    mode: "report-only" as const,
    profile: "full" as const,
    project: "examples/humanoid-physics-course",
    scenario: `playtests/${name}.playtest.json`,
    targets: ["web", "desktop"] as const,
  }));
}

async function runSourceBackedProbe(
  entry: GameplayParityAssetProbeEntry | GameplayParityTextureProbeEntry | GameplayParityMaterialProbeEntry,
  context: GameplayParityRunnerContext,
): Promise<GameplayParityCaseResult> {
  const started = Date.now();
  const observations = await collectSourceProbeObservations(resolve(context.root, entry.project ?? "."));
  const perTarget = Object.fromEntries(entry.targets.map((target) => [target, observations]));
  const artifactLinks: Record<string, string> = {};
  for (const target of entry.targets) {
    const artifactPath = resolve(context.artifactDir, "probes", entry.id, `${target}.json`);
    await mkdir(dirname(artifactPath), { recursive: true });
    await writeFile(artifactPath, `${JSON.stringify({
      generatedBy: "tools/verify gameplay parity source-backed probe",
      id: entry.id,
      kind: entry.kind,
      observations,
      source: "structured-source",
      target,
    }, null, 2)}\n`, "utf8");
    artifactLinks[`${entry.id}.${target}`] = artifactPath;
  }
  const comparison = entry.kind === "assetProbe"
    ? compareAssetProbe(entry, perTarget)
    : entry.kind === "textureProbe"
      ? compareTextureProbe(entry, perTarget)
      : compareMaterialProbe(entry, perTarget);
  return {
    assertionResults: comparison.assertionResults,
    artifactLinks,
    diagnostics: comparison.diagnostics,
    durationMs: Date.now() - started,
    entryId: entry.id,
    status: comparison.pass ? "pass" : "fail",
  };
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
