import * as THREE from "three";
import type { IAssetsManifest, IAtmosphereProfileIr, IEnvironmentSceneIr, IEnvironmentTextureSourceIr } from "@threenative/ir";
import { resolveWebAssets } from "./assets.js";

export interface IAtmosphereObservation {
  ambientColor?: string;
  ambientIntensity?: number;
  colorManagement?: IAtmosphereProfileIr["colorManagement"];
  diagnostics: Array<{ code: string; message: string; severity: "warning" }>;
  fogColor?: string;
  fogDensity?: number;
  fogFar?: number;
  fogMode?: string;
  fogNear?: number;
  profileId?: string;
  shadowBias?: number;
  shadowCascadeCount?: number;
  shadowMaxDistance?: number;
  shadowMapSize?: number;
  shadowNormalBias?: number;
  skyColor?: string;
  skyHorizonColor?: string;
  sunColor?: string;
  sunDirection?: readonly [number, number, number];
  sunIntensity?: number;
}

export interface IEnvironmentLightingObservation {
  diagnostics: Array<{ code: string; message: string; severity: "warning" }>;
  environmentMap?: {
    applied: boolean;
    assetIds: string[];
    intent: string;
    mode: string;
  };
  lightProbes: Array<{
    applied: boolean;
    assetIds: string[];
    id: string;
    intent: string;
  }>;
  skybox?: {
    applied: boolean;
    assetIds: string[];
    mode: string;
  };
}

export function applyAtmosphereProfile(scene: THREE.Scene, profile: IAtmosphereProfileIr | undefined): IAtmosphereObservation {
  if (profile === undefined || !profile.active) {
    return { diagnostics: [] };
  }
  scene.background = toThreeColor(profile.sky.color);
  if (profile.fog?.enabled === true) {
    scene.fog =
      profile.fog.mode === "linear"
        ? new THREE.Fog(toThreeColor(profile.fog.color), profile.fog.near ?? 1, profile.fog.far ?? 100)
        : new THREE.FogExp2(toThreeColor(profile.fog.color), profile.fog.density ?? 0.01);
  }
  const sun = new THREE.DirectionalLight(toThreeColor(profile.sun.color), profile.sun.intensity);
  sun.name = profile.sun.id;
  sun.position.set(-profile.sun.direction[0], -profile.sun.direction[1], -profile.sun.direction[2]);
  sun.castShadow = profile.sun.castsShadow && profile.shadows.enabled;
  sun.shadow.mapSize.width = profile.shadows.mapSize;
  sun.shadow.mapSize.height = profile.shadows.mapSize;
  sun.shadow.bias = profile.shadows.bias;
  sun.shadow.normalBias = profile.shadows.normalBias;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(toThreeColor(profile.ambient.color), profile.ambient.intensity));

  return observeAtmosphereProfile(profile);
}

export function observeAtmosphereProfile(profile: IAtmosphereProfileIr | undefined): IAtmosphereObservation {
  if (profile === undefined || !profile.active) {
    return { diagnostics: [] };
  }
  return {
    ambientColor: colorString(profile.ambient.color),
    ambientIntensity: profile.ambient.intensity,
    colorManagement: profile.colorManagement,
    diagnostics: [],
    fogColor: profile.fog?.enabled === true ? colorString(profile.fog.color) : undefined,
    fogDensity: profile.fog?.enabled === true ? profile.fog.density : undefined,
    fogFar: profile.fog?.enabled === true ? profile.fog.far : undefined,
    fogMode: profile.fog?.enabled === true ? profile.fog.mode : undefined,
    fogNear: profile.fog?.enabled === true ? profile.fog.near : undefined,
    profileId: profile.id,
    shadowBias: profile.shadows.bias,
    shadowCascadeCount: profile.shadows.cascadeCount,
    shadowMaxDistance: profile.shadows.maxDistance,
    shadowMapSize: profile.shadows.mapSize,
    shadowNormalBias: profile.shadows.normalBias,
    skyColor: colorString(profile.sky.color),
    skyHorizonColor: profile.sky.horizonColor === undefined ? undefined : colorString(profile.sky.horizonColor),
    sunColor: colorString(profile.sun.color),
    sunDirection: profile.sun.direction,
    sunIntensity: profile.sun.intensity,
  };
}

export async function applyEnvironmentLighting(
  scene: THREE.Scene,
  environment: IEnvironmentSceneIr | undefined,
  assets: IAssetsManifest,
  source: string,
): Promise<IEnvironmentLightingObservation> {
  const observation = observeEnvironmentLighting(environment);
  if (environment === undefined) {
    return observation;
  }
  const resolved = resolveWebAssets(source, assets);
  const loader = new THREE.TextureLoader();

  if (environment.skybox !== undefined) {
    const url = firstTextureUrl(environment.skybox, resolved);
    if (url === undefined) {
      observation.diagnostics.push({
        code: "TN_WEB_ENVIRONMENT_SKYBOX_TEXTURE_MISSING",
        message: "Skybox texture asset could not be resolved for web rendering.",
        severity: "warning",
      });
    } else {
      try {
        const texture = await loader.loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        if (environment.skybox.mode === "equirect") {
          texture.mapping = THREE.EquirectangularReflectionMapping;
        }
        scene.background = texture;
        observation.skybox = { ...observation.skybox!, applied: true };
      } catch (error) {
        observation.diagnostics.push({
          code: "TN_WEB_ENVIRONMENT_SKYBOX_TEXTURE_LOAD_FAILED",
          message: `Skybox texture '${url}' failed to load: ${error instanceof Error ? error.message : String(error)}.`,
          severity: "warning",
        });
      }
    }
  }

  if (environment.environmentMap !== undefined) {
    const url = firstTextureUrl(environment.environmentMap, resolved);
    if (url !== undefined) {
      try {
        const texture = await loader.loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = texture;
        observation.environmentMap = { ...observation.environmentMap!, applied: true };
      } catch (error) {
        observation.diagnostics.push({
          code: "TN_WEB_ENVIRONMENT_MAP_TEXTURE_LOAD_FAILED",
          message: `Environment map texture '${url}' failed to load: ${error instanceof Error ? error.message : String(error)}.`,
          severity: "warning",
        });
      }
    }
  }

  return observation;
}

export function observeEnvironmentLighting(environment: IEnvironmentSceneIr | undefined): IEnvironmentLightingObservation {
  return {
    diagnostics: [],
    environmentMap:
      environment?.environmentMap === undefined
        ? undefined
        : {
            applied: false,
            assetIds: textureAssetIds(environment.environmentMap),
            intent: environment.environmentMap.intent,
            mode: environment.environmentMap.mode,
          },
    lightProbes: (environment?.lightProbes ?? []).map((probe) => ({
      applied: false,
      assetIds: textureAssetIds(probe.source),
      id: probe.id,
      intent: probe.intent,
    })),
    skybox:
      environment?.skybox === undefined
        ? undefined
        : {
            applied: false,
            assetIds: textureAssetIds(environment.skybox),
            mode: environment.skybox.mode,
          },
  };
}

function firstTextureUrl(source: IEnvironmentTextureSourceIr, resolved: ReadonlyMap<string, { url: string }>): string | undefined {
  return textureAssetIds(source)
    .map((assetId) => resolved.get(assetId)?.url)
    .find((url): url is string => url !== undefined);
}

function textureAssetIds(source: IEnvironmentTextureSourceIr): string[] {
  if (source.mode === "equirect") {
    return [source.asset];
  }
  return [
    source.faces.positiveX,
    source.faces.negativeX,
    source.faces.positiveY,
    source.faces.negativeY,
    source.faces.positiveZ,
    source.faces.negativeZ,
  ];
}

function colorString(color: string | readonly [number, number, number]): string {
  return typeof color === "string" ? color : `rgb(${color[0]},${color[1]},${color[2]})`;
}

function toThreeColor(color: string | readonly [number, number, number]): THREE.Color {
  return typeof color === "string" ? new THREE.Color(color) : new THREE.Color(color[0], color[1], color[2]);
}
