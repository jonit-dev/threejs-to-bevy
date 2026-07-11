import * as THREE from "three";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { ssgiFullscreenVertexShader } from "./ssgi.frag.js";

export interface ISsgiTemporalObservation {
  disposeCount: number;
  disposed: boolean;
  hasHistory: boolean;
  historySize: readonly [number, number];
  resetCount: number;
}

export function temporalViewChangeRequiresReset(previous: THREE.Matrix4, current: THREE.Matrix4, radius: number): boolean {
  const previousPosition = new THREE.Vector3().setFromMatrixPosition(previous);
  const currentPosition = new THREE.Vector3().setFromMatrixPosition(current);
  if (previousPosition.distanceTo(currentPosition) > Math.max(1, radius * 0.5)) return true;
  const previousForward = new THREE.Vector3(0, 0, -1).transformDirection(previous);
  const currentForward = new THREE.Vector3(0, 0, -1).transformDirection(current);
  return previousForward.dot(currentForward) < 0.5;
}

export class SsgiTemporalResolvePass {
  private readonly resolveMaterial: THREE.ShaderMaterial;
  private readonly copyMaterial: THREE.ShaderMaterial;
  private readonly depthCopyMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly historyTarget = createHistoryTarget("ThreeNativeSsgi.history");
  private readonly previousDepthTarget = createHistoryTarget("ThreeNativeSsgi.previousDepth", THREE.NearestFilter);
  private readonly previousViewProjection = new THREE.Matrix4();
  private readonly previousProjectionInverse = new THREE.Matrix4();
  private readonly previousCameraWorld = new THREE.Matrix4();
  private hasHistory = false;
  private disposed = false;
  private disposeCount = 0;
  private resetCount = 0;
  private width = 1;
  private height = 1;

  public constructor(private readonly radius: number) {
    this.resolveMaterial = new THREE.ShaderMaterial({
      name: "ThreeNativeSsgiTemporalResolve",
      depthTest: false,
      depthWrite: false,
      uniforms: {
        cameraWorld: { value: new THREE.Matrix4() },
        currentProjectionInverse: { value: new THREE.Matrix4() },
        historyBlend: { value: 0 },
        previousProjectionInverse: { value: new THREE.Matrix4() },
        previousViewProjection: { value: new THREE.Matrix4() },
        resolution: { value: new THREE.Vector2(1, 1) },
        tCurrent: { value: null as THREE.Texture | null },
        tCurrentDepth: { value: null as THREE.Texture | null },
        tHistory: { value: this.historyTarget.texture },
        tPreviousDepth: { value: this.previousDepthTarget.texture },
      },
      vertexShader: ssgiFullscreenVertexShader,
      fragmentShader: temporalResolveFragmentShader,
    });
    this.copyMaterial = copyMaterial("ThreeNativeSsgiHistoryCopy");
    this.depthCopyMaterial = copyMaterial("ThreeNativeSsgiDepthHistoryCopy");
    this.quad = new FullScreenQuad(this.resolveMaterial);
  }

  public setSize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    if (nextWidth !== this.width || nextHeight !== this.height) this.reset();
    this.width = nextWidth;
    this.height = nextHeight;
    this.historyTarget.setSize(nextWidth, nextHeight);
    this.previousDepthTarget.setSize(nextWidth, nextHeight);
    (this.resolveMaterial.uniforms.resolution!.value as THREE.Vector2).set(nextWidth, nextHeight);
  }

  public render(
    renderer: THREE.WebGLRenderer,
    current: THREE.Texture,
    currentDepth: THREE.Texture,
    camera: THREE.Camera,
    output: THREE.WebGLRenderTarget,
  ): void {
    camera.updateMatrixWorld();
    if (this.hasHistory && temporalViewChangeRequiresReset(this.previousCameraWorld, camera.matrixWorld, this.radius)) this.reset();
    const uniforms = this.resolveMaterial.uniforms as Record<string, THREE.IUniform>;
    uniforms.cameraWorld!.value.copy(camera.matrixWorld);
    uniforms.currentProjectionInverse!.value.copy(camera.projectionMatrixInverse);
    uniforms.historyBlend!.value = this.hasHistory ? 0.94 : 0;
    uniforms.previousProjectionInverse!.value.copy(this.previousProjectionInverse);
    uniforms.previousViewProjection!.value.copy(this.previousViewProjection);
    uniforms.tCurrent!.value = current;
    uniforms.tCurrentDepth!.value = currentDepth;
    this.quad.material = this.resolveMaterial;
    renderer.setRenderTarget(output);
    renderer.clear();
    this.quad.render(renderer);

    this.copyTo(renderer, output.texture, this.historyTarget, this.copyMaterial);
    this.copyTo(renderer, currentDepth, this.previousDepthTarget, this.depthCopyMaterial);
    this.previousCameraWorld.copy(camera.matrixWorld);
    this.previousProjectionInverse.copy(camera.projectionMatrixInverse);
    this.previousViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.hasHistory = true;
  }

  public reset(): void {
    if (this.hasHistory) this.resetCount += 1;
    this.hasHistory = false;
  }

  public observation(): ISsgiTemporalObservation {
    return { disposeCount: this.disposeCount, disposed: this.disposed, hasHistory: this.hasHistory, historySize: [this.historyTarget.width, this.historyTarget.height], resetCount: this.resetCount };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeCount += 1;
    this.historyTarget.dispose();
    this.previousDepthTarget.dispose();
    this.resolveMaterial.dispose();
    this.copyMaterial.dispose();
    this.depthCopyMaterial.dispose();
    this.quad.dispose();
  }

  private copyTo(renderer: THREE.WebGLRenderer, texture: THREE.Texture, target: THREE.WebGLRenderTarget, material: THREE.ShaderMaterial): void {
    material.uniforms.tDiffuse!.value = texture;
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.clear();
    this.quad.render(renderer);
  }
}

function createHistoryTarget(name: string, filter: THREE.MagnificationTextureFilter = THREE.LinearFilter): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, magFilter: filter, minFilter: filter, stencilBuffer: false, type: THREE.HalfFloatType });
  target.texture.name = name;
  return target;
}

function copyMaterial(name: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name,
    depthTest: false,
    depthWrite: false,
    uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
    vertexShader: ssgiFullscreenVertexShader,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
  });
}

export const temporalResolveFragmentShader = `
  uniform sampler2D tCurrent;
  uniform sampler2D tCurrentDepth;
  uniform sampler2D tHistory;
  uniform sampler2D tPreviousDepth;
  uniform mat4 cameraWorld;
  uniform mat4 currentProjectionInverse;
  uniform mat4 previousProjectionInverse;
  uniform mat4 previousViewProjection;
  uniform vec2 resolution;
  uniform float historyBlend;
  varying vec2 vUv;

  vec3 currentWorldPosition(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = currentProjectionInverse * clip;
    view /= max(view.w, 1e-6);
    return (cameraWorld * vec4(view.xyz, 1.0)).xyz;
  }

  float previousViewDepth(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = previousProjectionInverse * clip;
    return abs(view.z / max(view.w, 1e-6));
  }

  float currentViewDepth(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = currentProjectionInverse * clip;
    return abs(view.z / max(view.w, 1e-6));
  }

  vec4 bilateralCurrent(vec2 uv) {
    vec2 texel = 1.0 / resolution;
    float centerDepth = texture2D(tCurrentDepth, uv).x;
    float centerViewDepth = currentViewDepth(uv, centerDepth);
    vec4 total = vec4(0.0);
    float totalWeight = 0.0;
    for (int y = -2; y <= 2; y++) {
      for (int x = -2; x <= 2; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 sampleUv = clamp(uv + offset * texel, vec2(0.0), vec2(1.0));
        float sampleDepth = texture2D(tCurrentDepth, sampleUv).x;
        float sampleViewDepth = currentViewDepth(sampleUv, sampleDepth);
        float relativeDepthDelta = abs(sampleViewDepth - centerViewDepth) / max(centerViewDepth, 0.01);
        float spatialWeight = exp(-dot(offset, offset) * 0.18);
        float depthWeight = exp(-relativeDepthDelta * 48.0);
        float weight = spatialWeight * depthWeight;
        total += texture2D(tCurrent, sampleUv) * weight;
        totalWeight += weight;
      }
    }
    return total / max(totalWeight, 1e-5);
  }

  void main() {
    vec4 current = bilateralCurrent(vUv);
    float currentDepth = texture2D(tCurrentDepth, vUv).x;
    vec3 world = currentWorldPosition(vUv, currentDepth);
    vec4 previousClip = previousViewProjection * vec4(world, 1.0);
    vec2 previousUv = previousClip.xy / max(previousClip.w, 1e-6) * 0.5 + 0.5;
    bool validUv = previousClip.w > 0.0 && all(greaterThanEqual(previousUv, vec2(0.001))) && all(lessThanEqual(previousUv, vec2(0.999)));

    vec2 texel = 1.0 / resolution;
    vec3 neighborhoodMin = current.rgb;
    vec3 neighborhoodMax = current.rgb;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 sampleColor = texture2D(tCurrent, clamp(vUv + vec2(float(x), float(y)) * texel, vec2(0.0), vec2(1.0))).rgb;
        neighborhoodMin = min(neighborhoodMin, sampleColor);
        neighborhoodMax = max(neighborhoodMax, sampleColor);
      }
    }

    vec4 history = validUv ? texture2D(tHistory, previousUv) : current;
    history.rgb = clamp(history.rgb, neighborhoodMin, neighborhoodMax);
    float storedDepth = validUv ? previousViewDepth(previousUv, texture2D(tPreviousDepth, previousUv).x) : 0.0;
    float expectedDepth = previousViewDepth(previousUv, previousClip.z / max(previousClip.w, 1e-6) * 0.5 + 0.5);
    float depthConfidence = validUv ? exp(-abs(storedDepth - expectedDepth) / max(expectedDepth, 0.01) * 32.0) : 0.0;
    float hitConfidence = clamp(0.75 + min(current.a, history.a) * 0.25, 0.75, 1.0);
    float blend = historyBlend * depthConfidence * hitConfidence;
    gl_FragColor = vec4(mix(current.rgb, history.rgb, blend), mix(current.a, history.a, blend));
  }
`;
