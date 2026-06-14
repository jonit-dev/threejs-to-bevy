import * as THREE from "three";
import type { IAtmosphereProfileIr } from "@threenative/ir";

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

function colorString(color: string | readonly [number, number, number]): string {
  return typeof color === "string" ? color : `rgb(${color[0]},${color[1]},${color[2]})`;
}

function toThreeColor(color: string | readonly [number, number, number]): THREE.Color {
  return typeof color === "string" ? new THREE.Color(color) : new THREE.Color(color[0], color[1], color[2]);
}
