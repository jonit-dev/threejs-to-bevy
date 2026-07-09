import { auditGameplayParityCoverage } from "./gameplayParityCoverage.js";
import {
  compareAssetProbe,
  compareMaterialProbe,
  compareTextureProbe,
  type GameplayParityProbeComparison,
} from "./gameplayParityProbes.js";
import { type GameplayParityDiagnostic } from "./gameplayParityManifest.js";

export type GameplayParityNegativeControlKind =
  | "movement"
  | "axis"
  | "resource"
  | "contact"
  | "animation"
  | "asset"
  | "texture"
  | "material"
  | "coverage";

export interface GameplayParityNegativeControlResult {
  diagnostics: GameplayParityDiagnostic[];
  expectedCodes: string[];
  fixturePaths: string[];
  releaseArtifactCandidate: {
    diagnostics: GameplayParityDiagnostic[];
    fixturePaths?: string[];
  };
}

export function runGameplayParityNegativeControls(): GameplayParityNegativeControlResult {
  const fixturePaths = negativeControlKinds().map((kind) => `synthetic://gameplay-parity-negative-controls/${kind}`);
  const diagnostics = [
    manualDrift("movement", "TN_GAMEPLAY_PARITY_MOVEMENT_DRIFT", "Synthetic movement delta is below the required parity tolerance."),
    manualDrift("axis", "TN_GAMEPLAY_PARITY_AXIS_DRIFT", "Synthetic target moved on a different axis than the paired observation."),
    manualDrift("resource", "TN_RUNTIME_PARITY_RESOURCE_DRIFT", "Synthetic resource value differs between paired targets."),
    manualDrift("contact", "TN_RUNTIME_PARITY_CONTACT_DRIFT", "Synthetic contact event is missing from one paired target."),
    manualDrift("animation", "TN_RUNTIME_PARITY_ANIMATION_DRIFT", "Synthetic animation state differs between paired targets."),
    ...assetDrift().diagnostics,
    ...textureDrift().diagnostics,
    ...materialDrift().diagnostics,
    ...coverageDrift(),
  ];

  return {
    diagnostics,
    expectedCodes: expectedNegativeControlCodes(),
    fixturePaths,
    releaseArtifactCandidate: {
      diagnostics: diagnostics.map(({ code, message, severity, suggestedFix }) => ({
        code,
        message,
        severity,
        ...(suggestedFix === undefined ? {} : { suggestedFix }),
      })),
    },
  };
}

export function expectedNegativeControlCodes(): string[] {
  return [
    "TN_GAMEPLAY_PARITY_MOVEMENT_DRIFT",
    "TN_GAMEPLAY_PARITY_AXIS_DRIFT",
    "TN_RUNTIME_PARITY_RESOURCE_DRIFT",
    "TN_RUNTIME_PARITY_CONTACT_DRIFT",
    "TN_RUNTIME_PARITY_ANIMATION_DRIFT",
    "TN_RUNTIME_PARITY_ASSET_DRIFT",
    "TN_RUNTIME_PARITY_TEXTURE_DRIFT",
    "TN_RUNTIME_PARITY_MATERIAL_DRIFT",
    "TN_RUNTIME_PARITY_COVERAGE_GAP",
  ];
}

function negativeControlKinds(): GameplayParityNegativeControlKind[] {
  return ["movement", "axis", "resource", "contact", "animation", "asset", "texture", "material", "coverage"];
}

function manualDrift(kind: GameplayParityNegativeControlKind, code: string, message: string): GameplayParityDiagnostic {
  return {
    code,
    message,
    path: `synthetic://gameplay-parity-negative-controls/${kind}`,
    severity: "error",
    suggestedFix: "This is an intentional negative control; production reports should never import this fixture path.",
  };
}

function assetDrift(): GameplayParityProbeComparison {
  return compareAssetProbe({
    assert: { assets: [{ animations: ["Walk"], id: "model.soldier", loaded: true, type: "gltf" }] },
    id: "negative-asset-drift",
    kind: "assetProbe",
    targets: ["web", "desktop"],
  }, {
    desktop: { assets: { "model.soldier": { animations: ["Idle"], loaded: false } } },
    web: { assets: { "model.soldier": { animations: ["Walk"], loaded: true } } },
  }, {
    desktop: "runtime-observation",
    web: "runtime-observation",
  });
}

function textureDrift(): GameplayParityProbeComparison {
  return compareTextureProbe({
    assert: { textures: [{ id: "tex.grid.floor", loaded: true, repeat: [8, 12] }] },
    id: "negative-texture-drift",
    kind: "textureProbe",
    targets: ["web", "desktop"],
  }, {
    desktop: { textures: { "tex.grid.floor": { loaded: true, repeat: [1, 1] } } },
    web: { textures: { "tex.grid.floor": { loaded: true, repeat: [8, 12] } } },
  }, {
    desktop: "runtime-observation",
    web: "runtime-observation",
  });
}

function materialDrift(): GameplayParityProbeComparison {
  return compareMaterialProbe({
    assert: { materials: [{ baseColorTexture: "tex.grid.floor", id: "mat.course.surface" }] },
    id: "negative-material-drift",
    kind: "materialProbe",
    targets: ["web", "desktop"],
  }, {
    desktop: { materials: { "mat.course.surface": { baseColorTexture: "tex.other" } } },
    web: { materials: { "mat.course.surface": { baseColorTexture: "tex.grid.floor" } } },
  }, {
    desktop: "runtime-observation",
    web: "runtime-observation",
  });
}

function coverageDrift(): GameplayParityDiagnostic[] {
  return auditGameplayParityCoverage({
    assertions: [],
    id: "negative-coverage-drift",
    kind: "sceneCoverage",
    requiredSurfaces: {
      entities: ["player"],
    },
    scene: "arena",
    targets: ["web", "desktop"],
  }).diagnostics;
}
