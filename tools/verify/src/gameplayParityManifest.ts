export type GameplayParityTarget = "web" | "desktop" | "bevy";
export type GameplayParityProfile = "smoke" | "full";
export type GameplayParityManifestEntryKind = "playtestScenario" | "assetProbe" | "textureProbe" | "materialProbe" | "sceneCoverage";
export type GameplayParityMode = "enforced" | "report-only";
export type GameplayParityState = "enforced" | "report-only" | "calibrating" | "quarantined";
export type GameplayParityObservationSource = "runtime-observation" | "playtest-summary" | "source-manifest";

export interface GameplayParityManifest {
  entries: GameplayParityManifestEntry[];
  schemaVersion: 1;
}

export type GameplayParityManifestEntry =
  | GameplayParityPlaytestScenarioEntry
  | GameplayParityAssetProbeEntry
  | GameplayParityTextureProbeEntry
  | GameplayParityMaterialProbeEntry
  | GameplayParitySceneCoverageEntry;

export interface GameplayParityManifestEntryBase {
  id: string;
  artifactLinks?: Record<string, string>;
  featureSurfaces?: GameplayParityRequiredSurfaces;
  kind: GameplayParityManifestEntryKind;
  mode?: GameplayParityMode;
  observationSidecars?: Partial<Record<GameplayParityTarget, string>>;
  promotionCriteria?: string;
  profile?: GameplayParityProfile;
  project?: string;
  reason?: string;
  state?: GameplayParityState;
  targets: readonly GameplayParityTarget[];
  timingSamplesMs?: readonly number[];
  toleranceRationale?: string;
  whyThisFeature?: string;
}

export interface GameplayParityPlaytestScenarioEntry extends GameplayParityManifestEntryBase {
  kind: "playtestScenario";
  scenario: string;
}

export interface GameplayParityAssetProbeEntry extends GameplayParityManifestEntryBase {
  assert: {
    assets: readonly GameplayParityAssetAssertion[];
  };
  kind: "assetProbe";
}

export interface GameplayParityTextureProbeEntry extends GameplayParityManifestEntryBase {
  assert: {
    textures: readonly GameplayParityTextureAssertion[];
  };
  kind: "textureProbe";
}

export interface GameplayParityMaterialProbeEntry extends GameplayParityManifestEntryBase {
  assert: {
    materials: readonly GameplayParityMaterialAssertion[];
  };
  kind: "materialProbe";
}

export interface GameplayParitySceneCoverageEntry extends GameplayParityManifestEntryBase {
  assertions: readonly GameplayParitySurfaceAssertion[];
  coverage?: {
    reportOnly?: readonly GameplayParitySurfaceExclusion[];
    sourceInventory?: GameplayParityRequiredSurfaces;
    sourceInventoryReportOnly?: readonly GameplayParitySurfaceExclusion[];
    unsupported?: readonly GameplayParitySurfaceExclusion[];
  };
  kind: "sceneCoverage";
  requiredSurfaces: GameplayParityRequiredSurfaces;
  scene: string;
}

export interface GameplayParityRequiredSurfaces {
  animationClips?: readonly string[];
  assets?: readonly string[];
  cameras?: readonly string[];
  colliders?: readonly string[];
  entities?: readonly string[];
  lights?: readonly string[];
  materials?: readonly string[];
  resources?: readonly string[];
  scripts?: readonly string[];
  textures?: readonly string[];
  triggers?: readonly string[];
  ui?: readonly string[];
}

export interface GameplayParitySurfaceAssertion {
  id?: string;
  kind: string;
  surface: GameplayParitySurfaceRef | string;
}

export interface GameplayParitySurfaceExclusion {
  reason: string;
  surface: GameplayParitySurfaceRef | string;
}

export interface GameplayParitySurfaceRef {
  id: string;
  type: keyof GameplayParityRequiredSurfaces;
}

export interface GameplayParityAssetAssertion {
  animations?: readonly string[];
  id: string;
  loaded: boolean;
  maxBoundsDelta?: number;
  type: "gltf" | "image" | "audio" | "unknown";
}

export interface GameplayParityTextureAssertion {
  dimensions?: readonly [number, number];
  id: string;
  loaded: boolean;
  repeat?: readonly [number, number];
  role?: string;
}

export interface GameplayParityMaterialAssertion {
  baseColorTexture?: string;
  id: string;
  maxAverageBrightnessDelta?: number;
}

export interface GameplayParityAssertionResult {
  diagnostic?: GameplayParityDiagnostic;
  expected?: unknown;
  id: string;
  kind: string;
  observed?: unknown;
  pass: boolean;
  source?: GameplayParityObservationSource;
  surface: string;
  target: GameplayParityTarget | "all";
}

export interface GameplayParityDiagnostic {
  code: string;
  message: string;
  path?: string;
  severity: "error" | "warning";
  suggestedFix?: string;
}

export function emptyGameplayParityManifest(): GameplayParityManifest {
  return { entries: [], schemaVersion: 1 };
}

export function isRuntimeProbeEntry(entry: GameplayParityManifestEntry): entry is GameplayParityAssetProbeEntry | GameplayParityTextureProbeEntry | GameplayParityMaterialProbeEntry {
  return entry.kind === "assetProbe" || entry.kind === "textureProbe" || entry.kind === "materialProbe";
}

export function gameplayParityEntryState(entry: GameplayParityManifestEntry): GameplayParityState {
  return entry.state ?? entry.mode ?? "enforced";
}

export function isGameplayParityPassingState(entry: GameplayParityManifestEntry): boolean {
  return gameplayParityEntryState(entry) === "enforced";
}

export function validateGameplayParityManifest(manifest: GameplayParityManifest): GameplayParityDiagnostic[] {
  return manifest.entries.flatMap((entry, index) => validateGameplayParityManifestEntry(entry, `entries[${index}]`));
}

export function validateGameplayParityManifestEntry(entry: GameplayParityManifestEntry, path = entry.id): GameplayParityDiagnostic[] {
  const diagnostics: GameplayParityDiagnostic[] = [];
  const state = gameplayParityEntryState(entry);
  if ((state === "report-only" || state === "quarantined") && (entry.reason?.trim().length ?? 0) === 0) {
    diagnostics.push({
      code: "TN_GAMEPLAY_PARITY_STATE_REASON_MISSING",
      message: `Gameplay parity entry '${entry.id}' is ${state} without a stable reason.`,
      path: `${path}.reason`,
      severity: "error",
      suggestedFix: "Add a stable reason explaining why this entry is not an enforced pass claim.",
    });
  }
  if (state === "calibrating" && (entry.promotionCriteria?.trim().length ?? 0) === 0) {
    diagnostics.push({
      code: "TN_GAMEPLAY_PARITY_PROMOTION_CRITERIA_MISSING",
      message: `Gameplay parity entry '${entry.id}' is calibrating without promotion criteria.`,
      path: `${path}.promotionCriteria`,
      severity: "error",
      suggestedFix: "Document the bounded evidence needed before this entry can become enforced.",
    });
  }
  if (entry.whyThisFeature !== undefined && entry.whyThisFeature.trim().length === 0) {
    diagnostics.push({
      code: "TN_GAMEPLAY_PARITY_FEATURE_RATIONALE_MISSING",
      message: `Gameplay parity entry '${entry.id}' has an empty humanoid feature risk rationale.`,
      path: `${path}.whyThisFeature`,
      severity: "error",
      suggestedFix: "Name the runtime risk this feature is intended to prove.",
    });
  }
  if (entry.featureSurfaces !== undefined) {
    if ((entry.whyThisFeature?.trim().length ?? 0) === 0) {
      diagnostics.push({
        code: "TN_GAMEPLAY_PARITY_FEATURE_RATIONALE_MISSING",
        message: `Gameplay parity feature entry '${entry.id}' is missing a runtime-risk rationale.`,
        path: `${path}.whyThisFeature`,
        severity: "error",
        suggestedFix: "Name the runtime risk this feature is intended to prove before promoting it beyond calibrating.",
      });
    }
    if (gameplayParityEntryState(entry) !== "calibrating") {
      if ((entry.promotionCriteria?.trim().length ?? 0) === 0) {
        diagnostics.push({
          code: "TN_GAMEPLAY_PARITY_FEATURE_PROMOTION_CRITERIA_MISSING",
          message: `Gameplay parity feature entry '${entry.id}' is missing promotion criteria.`,
          path: `${path}.promotionCriteria`,
          severity: "error",
          suggestedFix: "Document the pass/fail assertions and evidence required for this feature promotion.",
        });
      }
      if ((entry.toleranceRationale?.trim().length ?? 0) === 0) {
        diagnostics.push({
          code: "TN_GAMEPLAY_PARITY_FEATURE_TOLERANCE_MISSING",
          message: `Gameplay parity feature entry '${entry.id}' is missing a tolerance rationale.`,
          path: `${path}.toleranceRationale`,
          severity: "error",
          suggestedFix: "Document the bounded tolerance for the feature's parity assertion.",
        });
      }
      if (Object.keys(entry.artifactLinks ?? {}).length === 0) {
        diagnostics.push({
          code: "TN_GAMEPLAY_PARITY_FEATURE_ARTIFACTS_MISSING",
          message: `Gameplay parity feature entry '${entry.id}' is missing artifact links.`,
          path: `${path}.artifactLinks`,
          severity: "error",
          suggestedFix: "Link the target summaries or sidecars that support this feature state.",
        });
      }
    }
  }
  return diagnostics;
}
