import {
  type GameplayParityAssertionResult,
  type GameplayParityAssetProbeEntry,
  type GameplayParityDiagnostic,
  type GameplayParityMaterialProbeEntry,
  type GameplayParityTarget,
  type GameplayParityTextureProbeEntry,
} from "./gameplayParityManifest.js";

export interface GameplayParityProbeObservations {
  assets?: Record<string, {
    animations?: readonly string[];
    bounds?: readonly [number, number, number];
    loaded?: boolean;
  }>;
  materials?: Record<string, {
    baseColorTexture?: string;
  }>;
  textures?: Record<string, {
    loaded?: boolean;
    repeat?: readonly [number, number];
    role?: string;
  }>;
}

export interface GameplayParityProbeComparison {
  assertionResults: GameplayParityAssertionResult[];
  diagnostics: GameplayParityDiagnostic[];
  pass: boolean;
}

export function compareAssetProbe(
  entry: GameplayParityAssetProbeEntry,
  observations: Partial<Record<GameplayParityTarget, GameplayParityProbeObservations>>,
): GameplayParityProbeComparison {
  const assertionResults: GameplayParityAssertionResult[] = [];
  const diagnostics: GameplayParityDiagnostic[] = [];
  for (const asset of entry.assert.assets) {
    for (const target of entry.targets) {
      const observed = observations[target]?.assets?.[asset.id];
      const loadedPass = observed?.loaded === asset.loaded;
      assertionResults.push(assertion({
        diagnosticCode: "TN_RUNTIME_PARITY_ASSET_DRIFT",
        expected: { loaded: asset.loaded },
        id: `${entry.id}.${target}.${asset.id}.loaded`,
        kind: "assetLoaded",
        observed: { loaded: observed?.loaded ?? false },
        pass: loadedPass,
        surface: `assets:${asset.id}`,
        target,
      }, diagnostics));
      for (const clip of asset.animations ?? []) {
        const clipPass = observed?.animations?.includes(clip) === true;
        assertionResults.push(assertion({
          diagnosticCode: "TN_RUNTIME_PARITY_ASSET_DRIFT",
          expected: { clip },
          id: `${entry.id}.${target}.${asset.id}.animation.${clip}`,
          kind: "assetAnimation",
          observed: { animations: observed?.animations ?? [] },
          pass: clipPass,
          surface: `assets:${asset.id}`,
          target,
        }, diagnostics));
      }
    }
  }
  return result(assertionResults, diagnostics);
}

export function compareTextureProbe(
  entry: GameplayParityTextureProbeEntry,
  observations: Partial<Record<GameplayParityTarget, GameplayParityProbeObservations>>,
): GameplayParityProbeComparison {
  const assertionResults: GameplayParityAssertionResult[] = [];
  const diagnostics: GameplayParityDiagnostic[] = [];
  for (const texture of entry.assert.textures) {
    for (const target of entry.targets) {
      const observed = observations[target]?.textures?.[texture.id];
      assertionResults.push(assertion({
        diagnosticCode: "TN_RUNTIME_PARITY_TEXTURE_DRIFT",
        expected: { loaded: texture.loaded },
        id: `${entry.id}.${target}.${texture.id}.loaded`,
        kind: "textureLoaded",
        observed: { loaded: observed?.loaded ?? false },
        pass: observed?.loaded === texture.loaded,
        surface: `textures:${texture.id}`,
        target,
      }, diagnostics));
      if (texture.repeat !== undefined) {
        assertionResults.push(assertion({
          diagnosticCode: "TN_RUNTIME_PARITY_TEXTURE_DRIFT",
          expected: { repeat: texture.repeat },
          id: `${entry.id}.${target}.${texture.id}.repeat`,
          kind: "textureRepeat",
          observed: { repeat: observed?.repeat ?? null },
          pass: tupleEqual(observed?.repeat, texture.repeat),
          surface: `textures:${texture.id}`,
          target,
        }, diagnostics));
      }
    }
  }
  return result(assertionResults, diagnostics);
}

export function compareMaterialProbe(
  entry: GameplayParityMaterialProbeEntry,
  observations: Partial<Record<GameplayParityTarget, GameplayParityProbeObservations>>,
): GameplayParityProbeComparison {
  const assertionResults: GameplayParityAssertionResult[] = [];
  const diagnostics: GameplayParityDiagnostic[] = [];
  for (const material of entry.assert.materials) {
    for (const target of entry.targets) {
      const observed = observations[target]?.materials?.[material.id];
      if (material.baseColorTexture !== undefined) {
        assertionResults.push(assertion({
          diagnosticCode: "TN_RUNTIME_PARITY_MATERIAL_DRIFT",
          expected: { baseColorTexture: material.baseColorTexture },
          id: `${entry.id}.${target}.${material.id}.baseColorTexture`,
          kind: "materialTextureBinding",
          observed: { baseColorTexture: observed?.baseColorTexture ?? null },
          pass: observed?.baseColorTexture === material.baseColorTexture,
          surface: `materials:${material.id}`,
          target,
        }, diagnostics));
      }
    }
  }
  return result(assertionResults, diagnostics);
}

function assertion(
  input: {
    diagnosticCode: GameplayParityDiagnostic["code"];
    expected: unknown;
    id: string;
    kind: string;
    observed: unknown;
    pass: boolean;
    surface: string;
    target: GameplayParityTarget;
  },
  diagnostics: GameplayParityDiagnostic[],
): GameplayParityAssertionResult {
  const diagnostic = input.pass ? undefined : {
    code: input.diagnosticCode,
    message: `${input.kind} probe failed for ${input.surface} on ${input.target}.`,
    severity: "error" as const,
  };
  if (diagnostic !== undefined) {
    diagnostics.push(diagnostic);
  }
  return {
    ...(diagnostic === undefined ? {} : { diagnostic }),
    expected: input.expected,
    id: input.id,
    kind: input.kind,
    observed: input.observed,
    pass: input.pass,
    surface: input.surface,
    target: input.target,
  };
}

function result(assertionResults: GameplayParityAssertionResult[], diagnostics: GameplayParityDiagnostic[]): GameplayParityProbeComparison {
  return {
    assertionResults,
    diagnostics,
    pass: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
  };
}

function tupleEqual(left: readonly number[] | undefined, right: readonly number[]): boolean {
  return left !== undefined && left.length === right.length && left.every((value, index) => value === right[index]);
}
