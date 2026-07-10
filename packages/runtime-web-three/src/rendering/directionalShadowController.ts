import * as THREE from "three";
import * as CSMShaderModule from "three/examples/jsm/csm/CSMShader.js";
import type { IAtmosphereProfileIr } from "@threenative/ir";
import {
  resolveCascadeShadowProfile,
  type ICascadeShadowProfileReport,
  type IResolvedCascadeShadowProfile,
  type IResolvedRenderLookShadowProfile,
} from "@threenative/ir/runtimeConfig";
import {
  calculateCascadeCoverageRanges,
  calculateCascadeSplits,
  fitCascadeFrustumSlice,
  scaleCascadeBias,
  snapCascadeCenter,
  type CascadeFrustumSlice,
  type CascadeVec3,
} from "./cascadeMath.js";

type Shader = Parameters<THREE.Material["onBeforeCompile"]>[0];

interface IMaterialPatch {
  cacheKeyHook: THREE.Material["customProgramCacheKey"];
  cascadeBlendFractionDefine: unknown;
  cascadeCountDefine: unknown;
  csmFadeDefine: unknown;
  definesExisted: boolean;
  material: THREE.Material & { defines?: Record<string, unknown> };
  onBeforeCompileHook: THREE.Material["onBeforeCompile"];
  originalCacheKey: THREE.Material["customProgramCacheKey"];
  originalCascadeBlendFractionDefineExisted: boolean;
  originalCascadeCountDefineExisted: boolean;
  originalCsmFadeDefineExisted: boolean;
  originalOnBeforeCompile: THREE.Material["onBeforeCompile"];
  originalUseCsmDefineExisted: boolean;
  shaders: Set<Shader>;
  useCsmDefine: unknown;
}

interface ICascadeShaderUniformState {
  blendMargins: THREE.Vector2[];
  cameraNear: number;
  cascadeBlendFraction: number;
  cascades: THREE.Vector2[];
  shadowFar: number;
}

export interface IDirectionalShadowControllerSnapshot {
  cascades: Array<{
    bottom: number;
    index: number;
    lightMatrix: number[];
    lightPosition: [number, number, number];
    right: number;
    splitDistance: number;
    targetPosition: [number, number, number];
    top: number;
  }>;
}

export interface IDirectionalShadowControllerOptions {
  atmosphere: IAtmosphereProfileIr;
  camera: THREE.Camera;
  renderLookShadowProfile?: Pick<IResolvedRenderLookShadowProfile, "enabled" | "mapSize">;
  scene: THREE.Scene;
}

const LIGHT_MARGIN_SCALE = 1;
const CSMShader = (CSMShaderModule as unknown as {
  CSMShader: { lights_fragment_begin: string; lights_pars_begin: string };
}).CSMShader;
const CSM_BLEND_MARGIN = "margin = 0.25 * pow( closestEdge, 2.0 );";
const CSM_AUTHORED_BLEND_MARGIN = "margin = linearDepth < cascadeCenter ? CSM_blendMargins[ i ].x : CSM_blendMargins[ i ].y;";

/**
 * Adapter-private cascaded sun shadow owner. Shader integration is applied to
 * individual materials so it never mutates Three.js global ShaderChunk state.
 */
export class DirectionalShadowController {
  readonly lights: readonly THREE.DirectionalLight[];

  private readonly atmosphere: IAtmosphereProfileIr;
  private readonly lightDirection: THREE.Vector3;
  private readonly mapSize: number;
  private readonly materialPatches = new Map<THREE.Material, IMaterialPatch>();
  private readonly profile: IResolvedCascadeShadowProfile;
  private readonly scene: THREE.Scene;
  private readonly shaderUniformState: ICascadeShaderUniformState;
  private splits: number[] = [];
  private disposed = false;

  constructor(options: IDirectionalShadowControllerOptions) {
    this.atmosphere = options.atmosphere;
    this.scene = options.scene;
    this.profile = resolveCascadeShadowProfile(options.atmosphere.shadows);
    this.mapSize = options.renderLookShadowProfile?.mapSize ?? options.atmosphere.shadows.mapSize;
    this.shaderUniformState = {
      blendMargins: Array.from({ length: this.profile.cascadeCount }, () => new THREE.Vector2()),
      cameraNear: 0.1,
      cascadeBlendFraction: this.profile.cascadeBlendFraction,
      cascades: Array.from({ length: this.profile.cascadeCount }, () => new THREE.Vector2()),
      shadowFar: this.profile.maxDistance,
    };
    this.lightDirection = new THREE.Vector3(...options.atmosphere.sun.direction).normalize();
    if (this.lightDirection.lengthSq() === 0) {
      this.lightDirection.set(0, -1, 0);
    }

    removeLegacyAtmosphereSun(options.scene, options.atmosphere.sun.id);
    this.lights = Array.from({ length: this.profile.cascadeCount }, (_, index) => this.createLight(index));
    this.patchSceneMaterials();
    this.update(options.camera);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const light of this.lights) {
      light.shadow.map?.dispose();
      light.target.removeFromParent();
      light.removeFromParent();
    }
    for (const patch of this.materialPatches.values()) {
      restoreMaterialPatch(patch);
    }
    this.materialPatches.clear();
  }

  report(): ICascadeShadowProfileReport {
    return {
      applied: { ...this.profile },
      mode: "exact",
      requested: { ...this.profile },
    };
  }

  snapshot(): IDirectionalShadowControllerSnapshot {
    return {
      cascades: this.lights.map((light, index) => {
        light.shadow.updateMatrices(light);
        const shadowCamera = light.shadow.camera;
        const lightMatrix = new THREE.Matrix4().multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
        return {
          bottom: shadowCamera.bottom,
          index,
          lightMatrix: lightMatrix.elements.map(roundSnapshot),
          lightPosition: vectorTuple(light.position),
          right: shadowCamera.right,
          splitDistance: this.splits[index] ?? this.profile.maxDistance,
          targetPosition: vectorTuple(light.target.position),
          top: shadowCamera.top,
        };
      }),
    };
  }

  update(camera: THREE.Camera): void {
    if (this.disposed) {
      return;
    }
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld(true);
    this.patchSceneMaterials();

    const nearDistance = Math.max(0.0001, cameraNear(camera));
    const farDistance = Math.max(nearDistance + 0.0001, Math.min(cameraFar(camera), this.profile.maxDistance));
    this.splits = calculateCascadeSplits({
      cascadeCount: this.profile.cascadeCount,
      maxDistance: farDistance,
      nearDistance,
      scheme: this.profile.splitScheme,
      splitLambda: this.profile.splitLambda,
    });

    const lightToWorld = lightOrientation(this.lightDirection);
    const worldToLight = lightToWorld.clone().invert();
    const coverageRanges = calculateCascadeCoverageRanges(
      nearDistance,
      this.splits,
      this.profile.cascadeBlendFraction,
    );
    for (let index = 0; index < this.lights.length; index += 1) {
      const coverage = coverageRanges[index]!;
      this.updateCascade(this.lights[index]!, camera, coverage.near, coverage.far, worldToLight, lightToWorld);
    }
    this.updateShaderUniforms(nearDistance, farDistance);
  }

  private createLight(index: number): THREE.DirectionalLight {
    const light = new THREE.DirectionalLight(toThreeColor(this.atmosphere.sun.color), this.atmosphere.sun.intensity);
    light.name = `threenative.shadow-cascade.${this.atmosphere.sun.id}.${index}`;
    light.target.name = `${light.name}.target`;
    light.userData.threeNativeOwnedDirectionalShadow = true;
    light.target.userData.threeNativeOwnedDirectionalShadow = true;
    light.castShadow = this.atmosphere.sun.castsShadow && this.atmosphere.shadows.enabled;
    light.shadow.mapSize.set(this.mapSize, this.mapSize);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = this.profile.maxDistance * 3;
    this.scene.add(light.target, light);
    return light;
  }

  private patchSceneMaterials(): void {
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) {
        return;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (supportsCascadedLighting(material) && !this.materialPatches.has(material)) {
          this.materialPatches.set(material, patchMaterial(material, this.profile, this.shaderUniformState));
        }
      }
    });
  }

  private updateCascade(
    light: THREE.DirectionalLight,
    camera: THREE.Camera,
    nearDistance: number,
    farDistance: number,
    worldToLight: THREE.Matrix4,
    lightToWorld: THREE.Matrix4,
  ): void {
    const slice = cameraFrustumSlice(camera, nearDistance, farDistance, worldToLight);
    const fit = fitCascadeFrustumSlice(slice);
    const center = this.profile.stabilized
      ? snapCascadeCenter(fit.center, fit, this.mapSize)
      : fit.center;
    const maxLightZ = Math.max(...slice.near.map((corner) => corner[2]), ...slice.far.map((corner) => corner[2]));
    const unsnappedLightZ = maxLightZ + this.profile.maxDistance * LIGHT_MARGIN_SCALE;
    const texelSize = (fit.right - fit.left) / this.mapSize;
    const lightZ = this.profile.stabilized
      ? Math.floor(unsnappedLightZ / texelSize) * texelSize
      : unsnappedLightZ;
    const lightSpacePosition = new THREE.Vector3(center[0], center[1], lightZ);
    light.position.copy(lightSpacePosition.applyMatrix4(lightToWorld));
    light.target.position.copy(light.position).add(this.lightDirection);
    light.updateMatrixWorld(true);
    light.target.updateMatrixWorld(true);

    const shadowCamera = light.shadow.camera;
    shadowCamera.left = fit.left;
    shadowCamera.right = fit.right;
    shadowCamera.top = fit.top;
    shadowCamera.bottom = fit.bottom;
    shadowCamera.far = Math.max(1, this.profile.maxDistance * 3);
    const scaledBias = scaleCascadeBias(
      { bias: this.atmosphere.shadows.bias, normalBias: this.atmosphere.shadows.normalBias },
      fit,
      this.profile.maxDistance,
    );
    light.shadow.bias = scaledBias.bias;
    light.shadow.normalBias = scaledBias.normalBias;
    shadowCamera.updateProjectionMatrix();
    light.shadow.needsUpdate = true;
  }

  private updateShaderUniforms(nearDistance: number, farDistance: number): void {
    while (this.shaderUniformState.cascades.length < this.profile.cascadeCount) {
      this.shaderUniformState.cascades.push(new THREE.Vector2());
    }
    this.shaderUniformState.cascades.length = this.profile.cascadeCount;
    for (let index = 0; index < this.profile.cascadeCount; index += 1) {
      const split = this.splits[index] ?? farDistance;
      this.shaderUniformState.cascades[index]!.set(
        index === 0 ? 0 : (this.splits[index - 1] ?? nearDistance) / farDistance,
        split / farDistance,
      );
    }
    for (let index = 0; index < this.profile.cascadeCount; index += 1) {
      const cascade = this.shaderUniformState.cascades[index]!;
      const currentSpan = Math.max(0.000001, cascade.y - cascade.x);
      const previous = this.shaderUniformState.cascades[index - 1];
      const next = this.shaderUniformState.cascades[index + 1];
      const previousSpan = previous === undefined ? currentSpan : Math.max(0.000001, previous.y - previous.x);
      const nextSpan = next === undefined ? currentSpan : Math.max(0.000001, next.y - next.x);
      this.shaderUniformState.blendMargins[index]!.set(
        this.profile.cascadeBlendFraction * Math.min(currentSpan, previousSpan),
        this.profile.cascadeBlendFraction * Math.min(currentSpan, nextSpan),
      );
    }
    this.shaderUniformState.cameraNear = nearDistance;
    this.shaderUniformState.shadowFar = farDistance;
    for (const patch of this.materialPatches.values()) {
      for (const shader of patch.shaders) {
        shader.uniforms.CSM_cascades = { value: this.shaderUniformState.cascades };
        shader.uniforms.CSM_blendMargins = { value: this.shaderUniformState.blendMargins };
        shader.uniforms.cameraNear = { value: this.shaderUniformState.cameraNear };
        shader.uniforms.shadowFar = { value: this.shaderUniformState.shadowFar };
        shader.uniforms.csmCascadeBlendFraction = { value: this.shaderUniformState.cascadeBlendFraction };
      }
    }
  }
}

export function shouldUseDirectionalShadowController(
  atmosphere: IAtmosphereProfileIr | undefined,
  requiredCapabilities?: Record<string, string[]>,
  renderLookShadowProfile?: Pick<IResolvedRenderLookShadowProfile, "enabled">,
): atmosphere is IAtmosphereProfileIr {
  if (
    atmosphere?.active !== true
    || !atmosphere.shadows.enabled
    || !atmosphere.sun.castsShadow
    || renderLookShadowProfile?.enabled === false
  ) {
    return false;
  }
  return requiredCapabilities?.rendering?.includes("shadow-cascade-profile") === true
    || atmosphere.shadows.splitScheme !== undefined
    || atmosphere.shadows.splitLambda !== undefined
    || atmosphere.shadows.cascadeBlendFraction !== undefined
    || atmosphere.shadows.stabilized !== undefined;
}

function patchMaterial(
  material: THREE.Material,
  profile: IResolvedCascadeShadowProfile,
  shaderUniformState: ICascadeShaderUniformState,
): IMaterialPatch {
  const patchedMaterial = material as THREE.Material & { defines?: Record<string, unknown> };
  const definesExisted = patchedMaterial.defines !== undefined;
  const defines = patchedMaterial.defines ?? {};
  patchedMaterial.defines = defines;
  const originalOnBeforeCompile = material.onBeforeCompile;
  const originalCacheKey = material.customProgramCacheKey;
  const shaders = new Set<Shader>();
  const patchedFragmentBegin = CSMShader.lights_fragment_begin.replace(CSM_BLEND_MARGIN, CSM_AUTHORED_BLEND_MARGIN);
  const onBeforeCompileHook: THREE.Material["onBeforeCompile"] = (shader, renderer) => {
    originalOnBeforeCompile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <lights_pars_begin>",
        `uniform float csmCascadeBlendFraction;\nuniform vec2 CSM_blendMargins[CSM_CASCADES];\n${CSMShader.lights_pars_begin}`,
      )
      .replace("#include <lights_fragment_begin>", patchedFragmentBegin);
    shader.uniforms.CSM_cascades = { value: shaderUniformState.cascades };
    shader.uniforms.CSM_blendMargins = { value: shaderUniformState.blendMargins };
    shader.uniforms.cameraNear = { value: shaderUniformState.cameraNear };
    shader.uniforms.shadowFar = { value: shaderUniformState.shadowFar };
    shader.uniforms.csmCascadeBlendFraction = { value: shaderUniformState.cascadeBlendFraction };
    shaders.add(shader);
  };
  const cacheKeyHook: THREE.Material["customProgramCacheKey"] = function (this: THREE.Material) {
    return `${originalCacheKey.call(this)}:tn-csm-${profile.cascadeCount}-${profile.cascadeBlendFraction}`;
  };
  const patch: IMaterialPatch = {
    cacheKeyHook,
    cascadeBlendFractionDefine: defines.TN_CSM_CASCADE_BLEND_FRACTION,
    cascadeCountDefine: defines.CSM_CASCADES,
    csmFadeDefine: defines.CSM_FADE,
    definesExisted,
    material: patchedMaterial,
    onBeforeCompileHook,
    originalCacheKey,
    originalCascadeBlendFractionDefineExisted: Object.hasOwn(defines, "TN_CSM_CASCADE_BLEND_FRACTION"),
    originalCascadeCountDefineExisted: Object.hasOwn(defines, "CSM_CASCADES"),
    originalCsmFadeDefineExisted: Object.hasOwn(defines, "CSM_FADE"),
    originalOnBeforeCompile,
    originalUseCsmDefineExisted: Object.hasOwn(defines, "USE_CSM"),
    shaders,
    useCsmDefine: defines.USE_CSM,
  };
  defines.USE_CSM = 1;
  defines.CSM_CASCADES = profile.cascadeCount;
  defines.TN_CSM_CASCADE_BLEND_FRACTION = profile.cascadeBlendFraction;
  if (profile.cascadeBlendFraction > 0) {
    defines.CSM_FADE = "";
  }
  material.onBeforeCompile = onBeforeCompileHook;
  material.customProgramCacheKey = cacheKeyHook;
  material.needsUpdate = true;
  return patch;
}

function restoreMaterialPatch(patch: IMaterialPatch): void {
  const { material } = patch;
  const defines = material.defines;
  if (defines !== undefined) {
    restoreDefine(defines, "USE_CSM", patch.originalUseCsmDefineExisted, patch.useCsmDefine);
    restoreDefine(defines, "CSM_CASCADES", patch.originalCascadeCountDefineExisted, patch.cascadeCountDefine);
    restoreDefine(defines, "CSM_FADE", patch.originalCsmFadeDefineExisted, patch.csmFadeDefine);
    restoreDefine(defines, "TN_CSM_CASCADE_BLEND_FRACTION", patch.originalCascadeBlendFractionDefineExisted, patch.cascadeBlendFractionDefine);
    if (!patch.definesExisted && Object.keys(defines).length === 0) {
      delete material.defines;
    }
  }
  if (material.onBeforeCompile === patch.onBeforeCompileHook) {
    material.onBeforeCompile = patch.originalOnBeforeCompile;
  }
  if (material.customProgramCacheKey === patch.cacheKeyHook) {
    material.customProgramCacheKey = patch.originalCacheKey;
  }
  material.needsUpdate = true;
}

function restoreDefine(defines: Record<string, unknown>, name: string, existed: boolean, value: unknown): void {
  if (existed) {
    defines[name] = value;
  } else {
    delete defines[name];
  }
}

function supportsCascadedLighting(material: THREE.Material): boolean {
  return material instanceof THREE.MeshStandardMaterial
    || material instanceof THREE.MeshPhysicalMaterial
    || material instanceof THREE.MeshPhongMaterial
    || material instanceof THREE.MeshLambertMaterial
    || material instanceof THREE.MeshToonMaterial;
}

function cameraFrustumSlice(camera: THREE.Camera, near: number, far: number, worldToLight: THREE.Matrix4): CascadeFrustumSlice {
  const corners = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ] as const;
  return {
    near: corners.map(([x, y]) => cameraCornerInLightSpace(camera, x, y, near, worldToLight)),
    far: corners.map(([x, y]) => cameraCornerInLightSpace(camera, x, y, far, worldToLight)),
  };
}

function cameraCornerInLightSpace(camera: THREE.Camera, x: number, y: number, distance: number, worldToLight: THREE.Matrix4): CascadeVec3 {
  const viewPoint = new THREE.Vector3(x, y, camera instanceof THREE.OrthographicCamera ? 0 : 1)
    .applyMatrix4(camera.projectionMatrixInverse);
  if (camera instanceof THREE.OrthographicCamera) {
    viewPoint.z = -distance;
  } else {
    viewPoint.multiplyScalar(distance / Math.max(0.0001, -viewPoint.z));
  }
  viewPoint.applyMatrix4(camera.matrixWorld).applyMatrix4(worldToLight);
  return [viewPoint.x, viewPoint.y, viewPoint.z];
}

function lightOrientation(direction: THREE.Vector3): THREE.Matrix4 {
  const up = Math.abs(direction.dot(new THREE.Vector3(0, 1, 0))) > 0.99
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  return new THREE.Matrix4().lookAt(new THREE.Vector3(), direction, up);
}

function removeLegacyAtmosphereSun(scene: THREE.Scene, sunId: string): void {
  const legacy = scene.children.find((child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight && child.name === sunId);
  if (legacy === undefined) {
    return;
  }
  legacy.target.removeFromParent();
  legacy.removeFromParent();
  legacy.shadow.map?.dispose();
}

function cameraNear(camera: THREE.Camera): number {
  return camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera ? camera.near : 0.1;
}

function cameraFar(camera: THREE.Camera): number {
  return camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera ? camera.far : Number.POSITIVE_INFINITY;
}

function vectorTuple(vector: THREE.Vector3): [number, number, number] {
  return [roundSnapshot(vector.x), roundSnapshot(vector.y), roundSnapshot(vector.z)];
}

function roundSnapshot(value: number): number {
  return Number(value.toFixed(12));
}

function toThreeColor(value: string | readonly [number, number, number]): THREE.ColorRepresentation {
  return typeof value === "string" ? value : new THREE.Color(value[0], value[1], value[2]);
}
