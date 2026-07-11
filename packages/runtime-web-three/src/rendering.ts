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
    mode?: string;
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
        : new THREE.FogExp2(toThreeColor(profile.fog.color), profile.fog.density ?? 0.01); // squared exponential (Bevy ExponentialSquared)
  }
  const sun = new THREE.DirectionalLight(toThreeColor(profile.sun.color), profile.sun.intensity);
  sun.name = profile.sun.id;
  const shadowDistance = Math.max(1, profile.shadows.maxDistance);
  sun.position.set(
    -profile.sun.direction[0] * shadowDistance,
    -profile.sun.direction[1] * shadowDistance,
    -profile.sun.direction[2] * shadowDistance,
  );
  sun.castShadow = profile.sun.castsShadow && profile.shadows.enabled;
  sun.shadow.mapSize.width = profile.shadows.mapSize;
  sun.shadow.mapSize.height = profile.shadows.mapSize;
  sun.shadow.bias = profile.shadows.bias;
  sun.shadow.normalBias = profile.shadows.normalBias;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = shadowDistance * 2;
  sun.shadow.camera.left = -shadowDistance / 2;
  sun.shadow.camera.right = shadowDistance / 2;
  sun.shadow.camera.top = shadowDistance / 2;
  sun.shadow.camera.bottom = -shadowDistance / 2;
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.name = `${profile.sun.id}.target`;
  scene.add(sun.target);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(toThreeColor(profile.ambient.color), profile.ambient.intensity));

  return observeAtmosphereProfile(profile);
}

const THREE_FOG_VIEW_DEPTH = "vFogDepth = - mvPosition.z;";
const THREE_COMPAT_FOG_DEPTH = "vFogDepth = length( mvPosition.xyz );";

let bevyFogDistanceShaderPatched = false;

function patchThreeFogShaderChunk(): void {
  if (bevyFogDistanceShaderPatched) {
    return;
  }
  if (THREE.ShaderChunk.fog_vertex.includes(THREE_FOG_VIEW_DEPTH)) {
    THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex.replace(
      THREE_FOG_VIEW_DEPTH,
      THREE_COMPAT_FOG_DEPTH,
    );
  }
  bevyFogDistanceShaderPatched = true;
}

/** Match Bevy fog distance (`length(view_to_world)`) instead of Three.js view-axis depth. */
export function applyThreeCompatFogDistance(root: THREE.Object3D): void {
  patchThreeFogShaderChunk();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      patchMaterialForBevyFogDistance(material);
    }
  });
}

function patchMaterialForBevyFogDistance(material: THREE.Material): void {
  if (material.userData.tnBevyFogDistance === true) {
    return;
  }
  patchThreeFogShaderChunk();
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    if (shader.vertexShader.includes(THREE_FOG_VIEW_DEPTH)) {
      shader.vertexShader = shader.vertexShader.replace(THREE_FOG_VIEW_DEPTH, THREE_COMPAT_FOG_DEPTH);
    }
  };
  const previousCacheKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${previousCacheKey?.() ?? ""}:tn-bevy-fog-distance`;
  material.userData.tnBevyFogDistance = true;
  material.needsUpdate = true;
}

export function atmosphereColorManagementExposure(
  colorManagement: IAtmosphereProfileIr["colorManagement"] | undefined,
): number {
  return Math.max(0.001, colorManagement?.exposure ?? 1);
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
  if (environment.skybox !== undefined) {
    const urls = environmentTextureUrls(environment.skybox, resolved);
    if (urls === undefined) {
      observation.diagnostics.push({
        code: "TN_WEB_ENVIRONMENT_SKYBOX_TEXTURE_MISSING",
        message: "Skybox texture asset could not be resolved for web rendering.",
        severity: "warning",
      });
    } else {
      try {
        const texture = environment.skybox.mode === "cubemap"
          ? await new THREE.CubeTextureLoader().loadAsync(urls)
          : await new THREE.TextureLoader().loadAsync(urls[0]!);
        texture.colorSpace = THREE.SRGBColorSpace;
        if (environment.skybox.mode === "equirect") {
          texture.mapping = THREE.EquirectangularReflectionMapping;
        }
        scene.background = texture;
        observation.skybox = { ...observation.skybox!, applied: true };
      } catch (error) {
        observation.diagnostics.push({
          code: "TN_WEB_ENVIRONMENT_SKYBOX_TEXTURE_LOAD_FAILED",
          message: `Skybox texture '${urls.join("', '")}' failed to load: ${error instanceof Error ? error.message : String(error)}.`,
          severity: "warning",
        });
      }
    }
  }

  if (environment.environmentMap !== undefined) {
    const urls = environmentTextureUrls(environment.environmentMap, resolved);
    if (urls === undefined) {
      observation.diagnostics.push({
        code: "TN_WEB_ENVIRONMENT_MAP_TEXTURE_MISSING",
        message: "Environment-map texture assets could not all be resolved for web rendering.",
        severity: "warning",
      });
    } else {
      try {
        const texture = environment.environmentMap.mode === "cubemap"
          ? await new THREE.CubeTextureLoader().loadAsync(urls)
          : await new THREE.TextureLoader().loadAsync(urls[0]!);
        texture.colorSpace = THREE.SRGBColorSpace;
        if (environment.environmentMap.mode === "equirect") {
          texture.mapping = THREE.EquirectangularReflectionMapping;
        }
        scene.environment = texture;
        observation.environmentMap = { ...observation.environmentMap!, applied: true };
      } catch (error) {
        observation.diagnostics.push({
          code: "TN_WEB_ENVIRONMENT_MAP_TEXTURE_LOAD_FAILED",
          message: `Environment map texture '${urls.join("', '")}' failed to load: ${error instanceof Error ? error.message : String(error)}.`,
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
      applied: "format" in probe.source && probe.source.format === "sh2",
      assetIds: "format" in probe.source ? [] : textureAssetIds(probe.source),
      id: probe.id,
      intent: probe.intent,
      ...( "format" in probe.source ? { mode: "camera-weighted-sh2" } : {}),
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

export function environmentTextureUrls(
  source: IEnvironmentTextureSourceIr,
  resolved: ReadonlyMap<string, { url: string }>,
): string[] | undefined {
  const urls = textureAssetIds(source).map((assetId) => resolved.get(assetId)?.url);
  return urls.every((url): url is string => url !== undefined) ? urls : undefined;
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
