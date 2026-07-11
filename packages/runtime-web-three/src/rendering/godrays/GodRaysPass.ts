import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import type { IAtmosphereProfileIr } from "@threenative/ir";

export interface IWebGodRaysSettings {
  density: number;
  intensity: number;
  maxDistance: number;
  resolutionScale: number;
  steps: number;
}

export function webGodRaysSettings(
  atmosphere: IAtmosphereProfileIr | undefined,
  qualityLimit: "low" | "medium" | "high" = "high",
): IWebGodRaysSettings | undefined {
  const authored = atmosphere?.active === true ? atmosphere.volumetrics?.godRays : undefined;
  if (authored?.enabled !== true) {
    return undefined;
  }
  const qualityRanks = { high: 2, low: 0, medium: 1 } as const;
  const quality = qualityRanks[authored.quality] <= qualityRanks[qualityLimit] ? authored.quality : qualityLimit;
  const tier = quality === "high"
    ? { resolutionScale: 0.75, steps: 64 }
    : quality === "low"
      ? { resolutionScale: 0.5, steps: 16 }
      : { resolutionScale: 0.5, steps: 32 };
  return {
    density: authored.density * 0.025,
    intensity: authored.intensity * 0.5,
    maxDistance: authored.maxDistance,
    ...tier,
  };
}

/**
 * Altered adapter-private rewrite inspired by Ameobea/three-good-godrays.
 * See the adjacent LICENSE. Directional lights only; bounded to 64 samples.
 */
export class GodRaysPass extends Pass {
  private readonly depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
  private readonly depthTarget = createDepthTarget(1, 1);
  private readonly illuminationTarget = createIlluminationTarget(1, 1);
  private readonly illuminationMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private disposed = false;

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly lights: readonly THREE.DirectionalLight[],
    private readonly settings: IWebGodRaysSettings,
  ) {
    super();
    this.needsSwap = true;
    this.illuminationMaterial = new THREE.ShaderMaterial({
      name: "ThreeNativeGodRaysIllumination",
      depthTest: false,
      depthWrite: false,
      uniforms: {
        cameraProjectionInverse: { value: new THREE.Matrix4() },
        cameraWorld: { value: new THREE.Matrix4() },
        density: { value: settings.density },
        intensity: { value: settings.intensity },
        tnIsOrthographic: { value: false },
        cascadeCount: { value: 0 },
        lightShadowMatrix0: { value: new THREE.Matrix4() },
        lightShadowMatrix1: { value: new THREE.Matrix4() },
        lightShadowMatrix2: { value: new THREE.Matrix4() },
        lightShadowMatrix3: { value: new THREE.Matrix4() },
        maxDistance: { value: settings.maxDistance },
        shadowBias: { value: 0.0005 },
        shadowTexelWorldSize: { value: 1 },
        steps: { value: settings.steps },
        tDepth: { value: this.depthTarget.depthTexture },
        tShadow0: { value: null as THREE.Texture | null },
        tShadow1: { value: null as THREE.Texture | null },
        tShadow2: { value: null as THREE.Texture | null },
        tShadow3: { value: null as THREE.Texture | null },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: godRaysFragmentShader,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      name: "ThreeNativeGodRaysComposite",
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDiffuse: { value: null as THREE.Texture | null },
        tDepth: { value: this.depthTarget.depthTexture },
        tIllumination: { value: this.illuminationTarget.texture },
        illuminationTexelSize: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: compositeFragmentShader,
    });
    this.quad = new FullScreenQuad(this.illuminationMaterial);
  }

  public override setSize(width: number, height: number): void {
    const fullWidth = Math.max(1, Math.floor(width));
    const fullHeight = Math.max(1, Math.floor(height));
    this.depthTarget.setSize(fullWidth, fullHeight);
    this.illuminationTarget.setSize(
      Math.max(1, Math.ceil(fullWidth * this.settings.resolutionScale)),
      Math.max(1, Math.ceil(fullHeight * this.settings.resolutionScale)),
    );
    const uniforms = this.compositeMaterial.uniforms as Record<string, THREE.IUniform>;
    uniforms.illuminationTexelSize!.value.set(
      1 / this.illuminationTarget.width,
      1 / this.illuminationTarget.height,
    );
  }

  public resourceObservation(): {
    depthSize: readonly [number, number];
    disposed: boolean;
    illuminationSize: readonly [number, number];
    steps: number;
  } {
    return {
      depthSize: [this.depthTarget.width, this.depthTarget.height],
      disposed: this.disposed,
      illuminationSize: [this.illuminationTarget.width, this.illuminationTarget.height],
      steps: this.settings.steps,
    };
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const shadowLights = this.lights
      .filter((light) => light.shadow.map?.texture !== undefined)
      .slice(0, 4);
    if (shadowLights.length === 0) {
      renderer.setRenderTarget(this.illuminationTarget);
      renderer.clear();
      const compositeUniforms = this.compositeMaterial.uniforms as Record<string, THREE.IUniform>;
      compositeUniforms.tDiffuse!.value = readBuffer.texture;
      this.quad.material = this.compositeMaterial;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      if (this.clear) {
        renderer.clear();
      }
      this.quad.render(renderer);
      return;
    }

    const previousOverride = this.scene.overrideMaterial;
    const previousBackground = this.scene.background;
    this.scene.overrideMaterial = this.depthMaterial;
    this.scene.background = null;
    renderer.setRenderTarget(this.depthTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = previousOverride;
    this.scene.background = previousBackground;

    const uniforms = this.illuminationMaterial.uniforms as Record<string, THREE.IUniform>;
    uniforms.cameraProjectionInverse!.value.copy(this.camera.projectionMatrixInverse);
    uniforms.cameraWorld!.value.copy(this.camera.matrixWorld);
    uniforms.tnIsOrthographic!.value = this.camera instanceof THREE.OrthographicCamera;
    uniforms.cascadeCount!.value = shadowLights.length;
    let maximumTexelWorldSize = 0;
    for (let index = 0; index < 4; index += 1) {
      const light = shadowLights[index] ?? shadowLights[0]!;
      light.shadow.updateMatrices(light);
      uniforms[`lightShadowMatrix${index}`]!.value.copy(light.shadow.matrix);
      uniforms[`tShadow${index}`]!.value = light.shadow.map!.texture;
      const shadowCamera = light.shadow.camera as THREE.OrthographicCamera;
      maximumTexelWorldSize = Math.max(
        maximumTexelWorldSize,
        Math.max(shadowCamera.right - shadowCamera.left, shadowCamera.top - shadowCamera.bottom)
          / Math.max(1, light.shadow.mapSize.x),
      );
    }
    uniforms.shadowBias!.value = Math.max(0.0001, ...shadowLights.map((light) => Math.abs(light.shadow.bias)));
    uniforms.shadowTexelWorldSize!.value = Math.max(0.001, maximumTexelWorldSize);
    this.quad.material = this.illuminationMaterial;
    renderer.setRenderTarget(this.illuminationTarget);
    renderer.clear();
    this.quad.render(renderer);

    const compositeUniforms = this.compositeMaterial.uniforms as Record<string, THREE.IUniform>;
    compositeUniforms.tDiffuse!.value = readBuffer.texture;
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) {
      renderer.clear();
    }
    this.quad.render(renderer);
  }

  public override dispose(): void {
    this.disposed = true;
    this.depthMaterial.dispose();
    this.depthTarget.dispose();
    this.illuminationTarget.dispose();
    this.illuminationMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}

function createDepthTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false });
  target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  target.depthTexture.name = "ThreeNativeGodRays.depth";
  return target;
}

function createIlluminationTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
  });
  target.texture.name = "ThreeNativeGodRays.illumination";
  return target;
}

const fullscreenVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const godRaysFragmentShader = `
  uniform sampler2D tDepth;
  uniform sampler2D tShadow0;
  uniform sampler2D tShadow1;
  uniform sampler2D tShadow2;
  uniform sampler2D tShadow3;
  uniform mat4 cameraProjectionInverse;
  uniform mat4 cameraWorld;
  uniform mat4 lightShadowMatrix0;
  uniform mat4 lightShadowMatrix1;
  uniform mat4 lightShadowMatrix2;
  uniform mat4 lightShadowMatrix3;
  uniform float density;
  uniform float intensity;
  uniform float maxDistance;
  uniform float shadowBias;
  uniform float shadowTexelWorldSize;
  uniform float steps;
  uniform int cascadeCount;
  uniform bool tnIsOrthographic;
  varying vec2 vUv;

  vec3 unproject(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = cameraProjectionInverse * clip;
    view /= max(view.w, 1e-6);
    return (cameraWorld * vec4(view.xyz, 1.0)).xyz;
  }

  float unpackRGBAToDepth(vec4 value) {
    return dot(value, vec4(255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0, 1.0 / 16777216.0));
  }

  vec2 sampleCascade(sampler2D shadowMap, mat4 shadowMatrix, vec3 worldPosition) {
    vec4 shadowPosition = shadowMatrix * vec4(worldPosition, 1.0);
    shadowPosition.xyz /= max(shadowPosition.w, 1e-6);
    bool inside = shadowPosition.x >= 0.0 && shadowPosition.x <= 1.0
      && shadowPosition.y >= 0.0 && shadowPosition.y <= 1.0
      && shadowPosition.z >= 0.0 && shadowPosition.z <= 1.0;
    if (!inside) return vec2(0.0, 0.0);
    float storedDepth = unpackRGBAToDepth(texture2D(shadowMap, shadowPosition.xy));
    return vec2(1.0, shadowPosition.z <= storedDepth + shadowBias ? 1.0 : 0.0);
  }

  float sampleCascades(vec3 worldPosition) {
    vec2 result = sampleCascade(tShadow0, lightShadowMatrix0, worldPosition);
    if (result.x > 0.5) return result.y;
    if (cascadeCount > 1) {
      result = sampleCascade(tShadow1, lightShadowMatrix1, worldPosition);
      if (result.x > 0.5) return result.y;
    }
    if (cascadeCount > 2) {
      result = sampleCascade(tShadow2, lightShadowMatrix2, worldPosition);
      if (result.x > 0.5) return result.y;
    }
    if (cascadeCount > 3) {
      result = sampleCascade(tShadow3, lightShadowMatrix3, worldPosition);
      if (result.x > 0.5) return result.y;
    }
    return 0.0;
  }

  void main() {
    float sceneDepth = texture2D(tDepth, vUv).x;
    vec3 target = unproject(vUv, sceneDepth);
    vec3 origin = tnIsOrthographic ? unproject(vUv, 0.0) : cameraWorld[3].xyz;
    vec3 delta = target - origin;
    float rayLength = min(length(delta), maxDistance);
    vec3 direction = normalize(delta);
    float opticalDepth = 0.0;
    float noise = fract(52.9829189 * fract(0.06711056 * gl_FragCoord.x + 0.00583715 * gl_FragCoord.y));
    float adaptiveSteps = min(steps, max(8.0, ceil(rayLength / max(shadowTexelWorldSize * 0.5, 1e-4))));
    float opticalScale = density * rayLength / max(adaptiveSteps, 1.0);
    for (int i = 0; i < 64; i++) {
      if (float(i) >= adaptiveSteps) break;
      float t = (float(i) + noise) / max(adaptiveSteps, 1.0);
      vec3 samplePosition = origin + direction * rayLength * t;
      opticalDepth += sampleCascades(samplePosition) * opticalScale;
      if (opticalDepth >= 4.0) break;
    }
    float shaft = (1.0 - exp(-opticalDepth)) * intensity;
    gl_FragColor = vec4(vec3(clamp(shaft, 0.0, 2.0)), sceneDepth);
  }
`;

const compositeFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tIllumination;
  uniform sampler2D tDepth;
  uniform vec2 illuminationTexelSize;
  varying vec2 vUv;
  void main() {
    vec4 source = texture2D(tDiffuse, vUv);
    float centerDepth = texture2D(tDepth, vUv).x;
    vec2 halfPixel = illuminationTexelSize * 0.5;
    vec2 offsets[4];
    offsets[0] = vec2(-halfPixel.x, -halfPixel.y);
    offsets[1] = vec2( halfPixel.x, -halfPixel.y);
    offsets[2] = vec2(-halfPixel.x,  halfPixel.y);
    offsets[3] = vec2( halfPixel.x,  halfPixel.y);
    vec3 shafts = vec3(0.0);
    float totalWeight = 0.0;
    for (int i = 0; i < 4; i++) {
      vec4 sampleValue = texture2D(tIllumination, clamp(vUv + offsets[i], vec2(0.0), vec2(1.0)));
      float weight = 1.0 / (1.0 + abs(sampleValue.a - centerDepth) * 800.0);
      shafts += sampleValue.rgb * weight;
      totalWeight += weight;
    }
    shafts /= max(totalWeight, 1e-5);
    gl_FragColor = vec4(source.rgb + shafts, source.a);
  }
`;
