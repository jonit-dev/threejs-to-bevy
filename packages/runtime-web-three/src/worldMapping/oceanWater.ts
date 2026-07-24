import type { IWorldEntity } from "@threenative/ir";
import * as THREE from "three";
import { colorToThree } from "./colors.js";

export interface IOceanWaterComponent {
  color?: string;
  distortionScale?: number;
  size?: number;
  speed?: number;
  sunColor?: string;
  sunDirection?: readonly [number, number, number];
}

interface IOceanWaterRuntimeState {
  material: THREE.ShaderMaterial;
  speed: number;
}

const OCEAN_VERTEX_SHADER = `
out vec3 vWorldPosition;
out vec3 vOceanNormal;
uniform float iTime;
uniform float uWaveScale;

vec3 oceanWave(vec2 p, vec2 direction, float amplitude, float frequency, float speed, float phase) {
  direction = normalize(direction);
  float q = dot(p, direction) * frequency + iTime * speed + phase;
  return vec3(amplitude * sin(q), direction * (amplitude * frequency * cos(q)));
}

void main() {
  // Wave phase is sampled in world space so the swell stays anchored to the
  // ocean while the mesh recenters under the camera for an endless surface.
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec2 p = world.xz;
  vec3 surface = vec3(0.0);
  surface += oceanWave(p, vec2( 0.08, 0.997), 0.34, 0.17, 0.42, 0.2);
  surface += oceanWave(p, vec2(-0.20, 0.980), 0.19, 0.28, 0.61, 1.5);
  surface += oceanWave(p, vec2( 0.25, 0.968), 0.095, 0.47, 0.88, 2.2);
  surface += oceanWave(p, vec2(-0.31, 0.951), 0.045, 0.88, 1.21, 0.8);
  surface *= uWaveScale;
  world.y += surface.x;
  vOceanNormal = normalize(vec3(-surface.y, 1.0, -surface.z));
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// Engine-owned surface adaptation of ocean.frag(3).glsl. Analytic vertex waves
// carry the swell; the fragment stage mirrors the scene's actual equirect sky
// (clouds included) through a pow5 Fresnel, breaks the sun path into glitter,
// and dissolves the far plane into the sky's own horizon band. The shader owns
// its display transform (ACES + gamma) because the material is not tone-mapped
// by the renderer, so uExposure must track the renderer exposure.
export const OCEAN_FRAGMENT_SHADER = `
precision highp float;
out vec4 outColor;
uniform float iTime;
uniform float uExposure;
uniform float uSkyMapStrength;
uniform sampler2D uSkyMap;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform vec3 uWaterColor;
in vec3 vWorldPosition;
in vec3 vOceanNormal;

#define OCEAN_RECIPROCAL_PI 0.3183098861837907
#define OCEAN_RECIPROCAL_PI2 0.15915494309189535

vec2 hash22(vec2 p) {
    float n = sin(dot(p, vec2(41.0, 289.0)));
    return fract(vec2(262144.0, 32768.0) * n) * 2.0 - 1.0;
}

float gradNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(hash22(cell), f);
    float b = dot(hash22(cell + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(hash22(cell + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(hash22(cell + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float detailField(vec2 p) {
    float s = gradNoise(p) * 0.62;
    s += gradNoise(mat2(0.80, -0.60, 0.60, 0.80) * p * 2.03 + vec2(2.7, -1.9)) * 0.38;
    return s;
}

// Matches three.js equirectUv so reflections line up with the visible skybox.
vec3 skyColor(vec3 direction) {
    vec3 d = normalize(vec3(direction.x, max(direction.y, 0.015), direction.z));
    vec2 uv = vec2(
        atan(d.z, d.x) * OCEAN_RECIPROCAL_PI2 + 0.5,
        asin(clamp(d.y, -1.0, 1.0)) * OCEAN_RECIPROCAL_PI + 0.5
    );
    vec3 gradient = mix(vec3(0.72, 0.79, 0.85), vec3(0.21, 0.40, 0.68), smoothstep(0.0, 0.45, d.y));
    return mix(gradient, texture(uSkyMap, uv).rgb, uSkyMapStrength);
}

vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
    vec3 pos = vWorldPosition;
    vec3 cameraDelta = cameraPosition - pos;
    float dist = length(cameraDelta);
    vec3 view = normalize(cameraDelta);
    vec2 p = pos.xz;

    // Fine chop rides on the analytic swell as finite-difference normal
    // detail; it fades with distance so the far field never shimmers.
    float nearFade = 1.0 - smoothstep(400.0, 3200.0, dist);
    float midFade = 1.0 - smoothstep(900.0, 9000.0, dist);
    vec2 driftA = vec2(iTime * 0.55, -iTime * 0.34);
    vec2 driftB = vec2(-iTime * 0.42, iTime * 0.66);
    vec2 pa = p * 0.052 + driftA;
    vec2 pb = p * 0.23 + driftB;
    float ea = 0.55;
    float eb = 0.85;
    vec2 gradA = vec2(
        detailField(pa + vec2(ea, 0.0)) - detailField(pa - vec2(ea, 0.0)),
        detailField(pa + vec2(0.0, ea)) - detailField(pa - vec2(0.0, ea))
    ) / (2.0 * ea);
    vec2 gradB = vec2(
        detailField(pb + vec2(eb, 0.0)) - detailField(pb - vec2(eb, 0.0)),
        detailField(pb + vec2(0.0, eb)) - detailField(pb - vec2(0.0, eb))
    ) / (2.0 * eb);
    vec2 detail = gradA * 0.09 * midFade + gradB * 0.04 * nearFade;
    vec3 n = normalize(normalize(vOceanNormal) + vec3(-detail.x, 0.0, -detail.y));

    float ndv = max(dot(n, view), 0.0);
    float fresnel = 0.02 + 0.40 * pow(1.0 - ndv, 5.0);

    // Broad coherent cloud mirrors come from a flattened lookup normal;
    // per-pixel chop normals would scatter the sky into cyan speckle.
    vec3 reflNormal = normalize(mix(vec3(0.0, 1.0, 0.0), n, 0.72));
    vec3 refl = reflect(-view, reflNormal);
    vec3 sky = skyColor(refl);
    // The reference plate reads the sky as gray-silver, not vivid cyan; pull
    // the reflection toward its own luminance and darken it before mixing.
    float skyLum = dot(sky, vec3(0.2126, 0.7152, 0.0722));
    sky = mix(sky, vec3(skyLum), 0.50) * 0.82;

    vec3 sunDir = normalize(uSunDirection);
    float facing = clamp(dot(n, sunDir), 0.0, 1.0);
    vec3 deep = uWaterColor * 0.13;
    vec3 shallow = uWaterColor * 0.36 + vec3(0.001, 0.004, 0.010);
    vec3 water = mix(deep, shallow, 0.3 + 0.5 * facing);
    // Fine ripple texture reads through luminance, not normals, so the body
    // keeps its color while the surface stops looking airbrushed.
    water *= 0.9 + 0.2 * detailField(pb) * nearFade + 0.1 * detailField(pa) * midFade;

    // Open water stays mostly body color head-on and turns into a cloud
    // mirror toward grazing angles, exactly as in the reference plate.
    // Ripple luminance breaks the cloud mirrors into the reference's
    // silvery texture instead of one solid glass sheet.
    float mirrorBreakup = 0.78 + 0.34 * clamp(detailField(pb) + 0.5, 0.0, 1.0);
    water = mix(water, sky * mirrorBreakup, clamp(fresnel, 0.0, 1.0));

    vec3 halfDir = normalize(view + sunDir);
    float ndh = max(dot(n, halfDir), 0.0);
    float needle = pow(ndh, 480.0);
    float broad = pow(ndh, 36.0);
    float sparkleField = gradNoise(p * 0.6 + vec2(iTime * 0.8, -iTime * 0.5)) * 0.5
        + gradNoise(p * 1.7 - vec2(iTime * 0.6, iTime * 0.9)) * 0.5;
    // Softer sparkle points that fade out with distance so the near field
    // stops crawling with hard speckle while the sun path stays alive.
    float glitterFade = 1.0 - smoothstep(350.0, 1400.0, dist);
    float glitter = pow(ndh, 30.0) * smoothstep(0.10, 0.7, sparkleField) * glitterFade;
    water += uSunColor * (needle * 1.4 + broad * 0.04 + glitter * 0.5);

    // Aerial perspective lifts the mid field toward a desaturated gray-blue
    // long before the horizon, matching the reference's silvery haze band,
    // then the far plane fully dissolves into that band before its geometric
    // edge (~12000) so no seam line survives the endless-ocean recenter.
    vec3 hazeSky = skyColor(vec3(-view.x, 0.03, -view.z));
    float hazeLum = dot(hazeSky, vec3(0.2126, 0.7152, 0.0722));
    hazeSky = mix(hazeSky, vec3(hazeLum), 0.45) * 0.40;
    vec3 hazeColor = mix(hazeSky, uHorizonColor, 0.62);
    water = mix(water, hazeColor, 0.62 * smoothstep(150.0, 1700.0, dist));
    water = mix(water, hazeColor, smoothstep(1700.0, 10500.0, dist));

    vec3 display = pow(aces(water * uExposure), vec3(1.0 / 2.2));
    outColor = vec4(display, 1.0);
}
`;

export function readOceanWater(entity: IWorldEntity): IOceanWaterComponent | undefined {
  const value = entity.components.OceanWater;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as IOceanWaterComponent;
}

export function createOceanWaterObject(component: IOceanWaterComponent): THREE.Object3D {
  const size = finitePositive(component.size, 4000);
  const material = new THREE.ShaderMaterial({
    depthWrite: true,
    fragmentShader: OCEAN_FRAGMENT_SHADER,
    glslVersion: THREE.GLSL3,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      iTime: { value: 0 },
      uExposure: { value: 1 },
      uHorizonColor: { value: colorToThree("#46566a") },
      uSkyMap: { value: null },
      uSkyMapStrength: { value: 0 },
      uSunColor: { value: colorToThree(component.sunColor ?? "#fff1c7") },
      uSunDirection: { value: new THREE.Vector3(...(component.sunDirection ?? [-0.42, 0.84, 0.28])).normalize() },
      uWaterColor: { value: colorToThree(component.color ?? "#0a4a94") },
      uWaveScale: { value: finitePositive(component.distortionScale, 8) * 0.11 },
    },
    vertexShader: OCEAN_VERTEX_SHADER,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 128, 128), material);
  water.name = "threenative-analytic-ocean-water-surface";
  water.rotation.x = -Math.PI / 2;
  water.frustumCulled = false;
  water.userData.threeNativeOceanWater = {
    material,
    speed: finiteNonNegative(component.speed, 1),
  } satisfies IOceanWaterRuntimeState;

  const group = new THREE.Group();
  group.name = "OceanWaterSurface";
  group.add(water);
  return group;
}

// The scene's equirect sky becomes the water's reflection source once the
// environment finishes loading; exposure keeps the shader's own display
// transform aligned with the renderer tone mapping applied to the skybox.
export function applyOceanSkyReflection(root: THREE.Object3D, skyMap: THREE.Texture | null, exposure: number): void {
  root.traverse((child) => {
    const state = child.userData.threeNativeOceanWater as IOceanWaterRuntimeState | undefined;
    if (state === undefined) {
      return;
    }
    const uniforms = state.material.uniforms;
    uniforms.uExposure!.value = Number.isFinite(exposure) && exposure > 0 ? exposure : 1;
    uniforms.uSkyMap!.value = skyMap;
    uniforms.uSkyMapStrength!.value = skyMap === null ? 0 : 1;
  });
}

export function advanceOceanWaterRuntime(object: THREE.Object3D, fixedDelta: number): void {
  object.traverse((child) => {
    const state = child.userData.threeNativeOceanWater as IOceanWaterRuntimeState | undefined;
    const uniform = state?.material.uniforms.iTime;
    if (state !== undefined && uniform !== undefined) {
      uniform.value = Number(uniform.value ?? 0) + fixedDelta * state.speed;
    }
  });
}

function finitePositive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}
