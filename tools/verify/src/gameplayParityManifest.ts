export type GameplayParityTarget = "web" | "desktop" | "bevy";
export type GameplayParityProfile = "smoke" | "full";
export type GameplayParityManifestEntryKind = "playtestScenario" | "assetProbe" | "textureProbe" | "materialProbe" | "sceneCoverage";
export type GameplayParityMode = "enforced" | "report-only";

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
  kind: GameplayParityManifestEntryKind;
  mode?: GameplayParityMode;
  profile?: GameplayParityProfile;
  project?: string;
  targets: readonly GameplayParityTarget[];
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
