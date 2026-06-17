import type { IAssetReference } from "./assets.js";
import { assertFiniteNumber, assertNonNegativeNumber, assertPositiveNumber, SdkError } from "./errors.js";

export type EnvironmentTextureIntent = "irradiance" | "reflection" | "reflection-and-irradiance";
export type EnvironmentTextureMode = "cubemap" | "equirect";

export interface IEnvironmentCubemapFacesDeclaration {
  negativeX: string | IAssetReference;
  negativeY: string | IAssetReference;
  negativeZ: string | IAssetReference;
  positiveX: string | IAssetReference;
  positiveY: string | IAssetReference;
  positiveZ: string | IAssetReference;
}

export type EnvironmentTextureSourceDeclaration =
  | {
      asset: string | IAssetReference;
      mode: "equirect";
    }
  | {
      faces: IEnvironmentCubemapFacesDeclaration;
      mode: "cubemap";
    };

export type IEnvironmentTextureSourceJson =
  | {
      asset: string;
      mode: "equirect";
    }
  | {
      faces: Record<keyof IEnvironmentCubemapFacesDeclaration, string>;
      mode: "cubemap";
    };

export type ISkyboxDeclarationJson = IEnvironmentTextureSourceJson & {
  intensity?: number;
  rotationY?: number;
};

export type IEnvironmentMapDeclarationJson = IEnvironmentTextureSourceJson & {
  intensity?: number;
  intent: EnvironmentTextureIntent;
};

export interface ILightProbeDeclarationJson {
  bounds: {
    max: readonly [number, number, number];
    min: readonly [number, number, number];
  };
  id: string;
  influenceRadius: number;
  intent: EnvironmentTextureIntent;
  source: IEnvironmentTextureSourceJson;
}

export class SkyboxDeclaration {
  public constructor(
    private readonly declaration: ISkyboxDeclarationJson,
    public readonly assetRefs: readonly IAssetReference[],
  ) {}

  public toJSON(): ISkyboxDeclarationJson {
    return this.declaration;
  }
}

export class EnvironmentMapDeclaration {
  public constructor(
    private readonly declaration: IEnvironmentMapDeclarationJson,
    public readonly assetRefs: readonly IAssetReference[],
  ) {}

  public toJSON(): IEnvironmentMapDeclarationJson {
    return this.declaration;
  }
}

export class LightProbeDeclaration {
  public constructor(
    private readonly declaration: ILightProbeDeclarationJson,
    public readonly assetRefs: readonly IAssetReference[],
  ) {}

  public toJSON(): ILightProbeDeclarationJson {
    return this.declaration;
  }
}

export function skybox(
  source: EnvironmentTextureSourceDeclaration,
  options: { intensity?: number; rotationY?: number } = {},
): SkyboxDeclaration {
  if (options.intensity !== undefined) {
    assertNonNegativeNumber(options.intensity, "TN_SDK_ENVIRONMENT_SKYBOX_INTENSITY_INVALID", "Skybox intensity");
  }
  if (options.rotationY !== undefined) {
    assertFiniteNumber(options.rotationY, "TN_SDK_ENVIRONMENT_SKYBOX_ROTATION_INVALID", "Skybox rotationY");
  }
  const normalized = normalizeTextureSource(source);
  return new SkyboxDeclaration(
    {
      ...normalized.json,
      ...(options.intensity === undefined ? {} : { intensity: options.intensity }),
      ...(options.rotationY === undefined ? {} : { rotationY: options.rotationY }),
    },
    normalized.assetRefs,
  );
}

export function environmentMap(
  source: EnvironmentTextureSourceDeclaration,
  options: { intensity?: number; intent?: EnvironmentTextureIntent } = {},
): EnvironmentMapDeclaration {
  if (options.intensity !== undefined) {
    assertNonNegativeNumber(options.intensity, "TN_SDK_ENVIRONMENT_MAP_INTENSITY_INVALID", "Environment map intensity");
  }
  const intent = options.intent ?? "reflection-and-irradiance";
  validateIntent(intent, "TN_SDK_ENVIRONMENT_MAP_INTENT_INVALID");
  const normalized = normalizeTextureSource(source);
  return new EnvironmentMapDeclaration(
    {
      ...normalized.json,
      ...(options.intensity === undefined ? {} : { intensity: options.intensity }),
      intent,
    },
    normalized.assetRefs,
  );
}

export function lightProbe(
  id: string,
  options: {
    bounds: { max: readonly [number, number, number]; min: readonly [number, number, number] };
    influenceRadius: number;
    intent?: EnvironmentTextureIntent;
    source: EnvironmentTextureSourceDeclaration;
  },
): LightProbeDeclaration {
  if (id.trim().length === 0) {
    throw new SdkError("TN_SDK_ENVIRONMENT_LIGHT_PROBE_ID_EMPTY", "Light probe id must not be empty.");
  }
  validateVec3(options.bounds.min, "TN_SDK_ENVIRONMENT_LIGHT_PROBE_BOUNDS_INVALID", "Light probe bounds.min");
  validateVec3(options.bounds.max, "TN_SDK_ENVIRONMENT_LIGHT_PROBE_BOUNDS_INVALID", "Light probe bounds.max");
  const hasInvalidAxis =
    options.bounds.max[0] <= options.bounds.min[0]
    || options.bounds.max[1] <= options.bounds.min[1]
    || options.bounds.max[2] <= options.bounds.min[2];
  if (hasInvalidAxis) {
    throw new SdkError("TN_SDK_ENVIRONMENT_LIGHT_PROBE_BOUNDS_INVALID", "Light probe bounds max values must be greater than min values.");
  }
  assertPositiveNumber(options.influenceRadius, "TN_SDK_ENVIRONMENT_LIGHT_PROBE_RADIUS_INVALID", "Light probe influenceRadius");
  const intent = options.intent ?? "reflection-and-irradiance";
  validateIntent(intent, "TN_SDK_ENVIRONMENT_LIGHT_PROBE_INTENT_INVALID");
  const normalized = normalizeTextureSource(options.source);
  return new LightProbeDeclaration(
    {
      bounds: { max: options.bounds.max, min: options.bounds.min },
      id,
      influenceRadius: options.influenceRadius,
      intent,
      source: normalized.json,
    },
    normalized.assetRefs,
  );
}

function normalizeTextureSource(source: EnvironmentTextureSourceDeclaration): { assetRefs: readonly IAssetReference[]; json: IEnvironmentTextureSourceJson } {
  if (source.mode === "equirect") {
    const asset = normalizeTextureAsset(source.asset);
    return { assetRefs: asset.ref === undefined ? [] : [asset.ref], json: { asset: asset.id, mode: "equirect" } };
  }
  const faces = {
    negativeX: normalizeTextureAsset(source.faces.negativeX),
    negativeY: normalizeTextureAsset(source.faces.negativeY),
    negativeZ: normalizeTextureAsset(source.faces.negativeZ),
    positiveX: normalizeTextureAsset(source.faces.positiveX),
    positiveY: normalizeTextureAsset(source.faces.positiveY),
    positiveZ: normalizeTextureAsset(source.faces.positiveZ),
  };
  return {
    assetRefs: Object.values(faces)
      .flatMap((asset) => (asset.ref === undefined ? [] : [asset.ref]))
      .sort((left, right) => left.id.localeCompare(right.id)),
    json: {
      faces: {
        negativeX: faces.negativeX.id,
        negativeY: faces.negativeY.id,
        negativeZ: faces.negativeZ.id,
        positiveX: faces.positiveX.id,
        positiveY: faces.positiveY.id,
        positiveZ: faces.positiveZ.id,
      },
      mode: "cubemap",
    },
  };
}

function normalizeTextureAsset(asset: string | IAssetReference): { id: string; ref?: IAssetReference } {
  if (typeof asset === "string") {
    if (asset.trim().length === 0) {
      throw new SdkError("TN_SDK_ENVIRONMENT_TEXTURE_ASSET_EMPTY", "Environment texture asset id must not be empty.");
    }
    return { id: asset };
  }
  if (asset.kind !== "texture") {
    throw new SdkError("TN_SDK_ENVIRONMENT_TEXTURE_ASSET_KIND_INVALID", "Environment lighting must reference texture assets.");
  }
  return { id: asset.id, ref: asset };
}

function validateIntent(intent: EnvironmentTextureIntent, code: string): void {
  if (intent !== "reflection" && intent !== "irradiance" && intent !== "reflection-and-irradiance") {
    throw new SdkError(code, "Environment lighting intent must be 'reflection', 'irradiance', or 'reflection-and-irradiance'.");
  }
}

function validateVec3(value: readonly number[], code: string, label: string): void {
  if (value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new SdkError(code, `${label} must be a finite vec3.`);
  }
}
