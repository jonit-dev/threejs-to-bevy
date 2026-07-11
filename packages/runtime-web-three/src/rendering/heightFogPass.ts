import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import type { IAtmosphereProfileIr } from "@threenative/ir";

export interface IWebHeightFogSettings {
  baseHeight: number;
  color: readonly [number, number, number];
  density: number;
  falloffHeight: number;
}

export interface IWebHeightFogResourceObservation {
  depthSize: readonly [number, number];
  disposed: boolean;
  fogSize: readonly [number, number];
}

export function webHeightFogSettings(
  atmosphere: IAtmosphereProfileIr | undefined,
): IWebHeightFogSettings | undefined {
  const authored = atmosphere?.active === true ? atmosphere.volumetrics?.heightFog : undefined;
  if (authored?.enabled !== true) {
    return undefined;
  }
  const fallback = atmosphere?.fog?.color ?? atmosphere?.sky.horizonColor ?? atmosphere?.sky.color ?? [0.5, 0.55, 0.6];
  const color = authored.color ?? parseColor(fallback);
  return {
    baseHeight: authored.baseHeight,
    color,
    density: authored.density * 0.08,
    falloffHeight: authored.falloffHeight,
  };
}

export class HeightFogPass extends Pass {
  private readonly depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
  private readonly depthTarget: THREE.WebGLRenderTarget;
  private readonly fogMaterial: THREE.ShaderMaterial;
  private readonly fogTarget: THREE.WebGLRenderTarget;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private disposed = false;
  private width = 1;
  private height = 1;

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    settings: IWebHeightFogSettings,
  ) {
    super();
    this.needsSwap = true;
    this.depthTarget = createDepthTarget(1, 1);
    this.fogTarget = createFogTarget(1, 1);
    this.fogMaterial = new THREE.ShaderMaterial({
      name: "ThreeNativeHeightFogIntegrate",
      depthTest: false,
      depthWrite: false,
      uniforms: {
        baseHeight: { value: settings.baseHeight },
        cameraFar: { value: 1000 },
        cameraNear: { value: 0.1 },
        cameraProjectionInverse: { value: new THREE.Matrix4() },
        cameraWorld: { value: new THREE.Matrix4() },
        density: { value: settings.density },
        falloff: { value: Math.LN2 / settings.falloffHeight },
        fogColor: { value: new THREE.Color(settings.color[0], settings.color[1], settings.color[2]) },
        tnIsOrthographic: { value: false },
        tDepth: { value: this.depthTarget.depthTexture },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: heightFogFragmentShader,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      name: "ThreeNativeHeightFogComposite",
      depthTest: false,
      depthWrite: false,
      uniforms: {
        cameraFar: { value: 1000 },
        cameraNear: { value: 0.1 },
        fogTexelSize: { value: new THREE.Vector2(2, 2) },
        tnIsOrthographic: { value: false },
        tDepth: { value: this.depthTarget.depthTexture },
        tDiffuse: { value: null as THREE.Texture | null },
        tFog: { value: this.fogTarget.texture },
      },
      vertexShader: fullscreenVertexShader,
      fragmentShader: heightFogCompositeFragmentShader,
    });
    this.quad = new FullScreenQuad(this.fogMaterial);
  }

  public override setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.depthTarget.setSize(this.width, this.height);
    const halfWidth = Math.max(1, Math.ceil(this.width / 2));
    const halfHeight = Math.max(1, Math.ceil(this.height / 2));
    this.fogTarget.setSize(halfWidth, halfHeight);
    const uniforms = this.compositeMaterial.uniforms as Record<string, THREE.IUniform>;
    uniforms.fogTexelSize!.value.set(1 / halfWidth, 1 / halfHeight);
  }

  public resourceObservation(): IWebHeightFogResourceObservation {
    return {
      depthSize: [this.depthTarget.width, this.depthTarget.height],
      disposed: this.disposed,
      fogSize: [this.fogTarget.width, this.fogTarget.height],
    };
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const previousOverride = this.scene.overrideMaterial;
    const previousBackground = this.scene.background;
    this.scene.overrideMaterial = this.depthMaterial;
    this.scene.background = null;
    renderer.setRenderTarget(this.depthTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = previousOverride;
    this.scene.background = previousBackground;

    const perspective = this.camera as THREE.PerspectiveCamera;
    const near = perspective.near ?? 0.1;
    const far = perspective.far ?? 1000;
    const fogUniforms = this.fogMaterial.uniforms as Record<string, THREE.IUniform>;
    fogUniforms.cameraNear!.value = near;
    fogUniforms.cameraFar!.value = far;
    fogUniforms.cameraProjectionInverse!.value.copy(this.camera.projectionMatrixInverse);
    fogUniforms.cameraWorld!.value.copy(this.camera.matrixWorld);
    fogUniforms.tnIsOrthographic!.value = this.camera instanceof THREE.OrthographicCamera;
    this.quad.material = this.fogMaterial;
    renderer.setRenderTarget(this.fogTarget);
    renderer.clear();
    this.quad.render(renderer);

    const compositeUniforms = this.compositeMaterial.uniforms as Record<string, THREE.IUniform>;
    compositeUniforms.cameraNear!.value = near;
    compositeUniforms.cameraFar!.value = far;
    compositeUniforms.tnIsOrthographic!.value = this.camera instanceof THREE.OrthographicCamera;
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
    this.fogMaterial.dispose();
    this.fogTarget.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}

function createDepthTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    stencilBuffer: false,
  });
  target.texture.name = "ThreeNativeHeightFog.depthColor";
  target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  target.depthTexture.name = "ThreeNativeHeightFog.depth";
  return target;
}

function createFogTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
  });
  target.texture.name = "ThreeNativeHeightFog.halfResolution";
  return target;
}

function parseColor(value: string | readonly [number, number, number]): readonly [number, number, number] {
  if (typeof value !== "string") {
    return [value[0]!, value[1]!, value[2]!];
  }
  const color = new THREE.Color(value);
  return [color.r, color.g, color.b];
}

const fullscreenVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const heightFogFragmentShader = `
  uniform sampler2D tDepth;
  uniform mat4 cameraProjectionInverse;
  uniform mat4 cameraWorld;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform float baseHeight;
  uniform float density;
  uniform float falloff;
  uniform vec3 fogColor;
  uniform bool tnIsOrthographic;
  varying vec2 vUv;

  void main() {
    float depth = texture2D(tDepth, vUv).x;
    if (depth >= 0.999999) {
      gl_FragColor = vec4(fogColor, 0.0);
      return;
    }
    vec4 clip = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = cameraProjectionInverse * clip;
    view /= max(view.w, 1e-6);
    vec4 nearClip = vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
    vec4 nearView = cameraProjectionInverse * nearClip;
    nearView /= max(nearView.w, 1e-6);
    vec3 cameraPosition = tnIsOrthographic
      ? (cameraWorld * vec4(nearView.xyz, 1.0)).xyz
      : cameraWorld[3].xyz;
    vec3 worldPosition = (cameraWorld * vec4(view.xyz, 1.0)).xyz;
    float distanceToSurface = length(view.xyz);
    vec3 rayDirection = normalize(worldPosition - cameraPosition);
    float baseDensity = density * exp(-(cameraPosition.y - baseHeight) * falloff);
    float verticalRate = rayDirection.y * falloff;
    float opticalDepth = abs(verticalRate) < 1e-5
      ? baseDensity * distanceToSurface
      : baseDensity * (1.0 - exp(-distanceToSurface * verticalRate)) / verticalRate;
    float fogAmount = 1.0 - exp(-max(opticalDepth, 0.0));
    gl_FragColor = vec4(fogColor, clamp(fogAmount, 0.0, 1.0));
  }
`;

const heightFogCompositeFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tFog;
  uniform sampler2D tDepth;
  uniform vec2 fogTexelSize;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform bool tnIsOrthographic;
  varying vec2 vUv;

  float viewDepth(vec2 uv) {
    float depth = texture2D(tDepth, uv).x;
    if (tnIsOrthographic) {
      return mix(cameraNear, cameraFar, depth);
    }
    return (cameraNear * cameraFar) / max(cameraFar - depth * (cameraFar - cameraNear), 1e-5);
  }

  void main() {
    vec2 halfPixel = fogTexelSize * 0.5;
    vec2 offsets[4];
    offsets[0] = vec2(-halfPixel.x, -halfPixel.y);
    offsets[1] = vec2( halfPixel.x, -halfPixel.y);
    offsets[2] = vec2(-halfPixel.x,  halfPixel.y);
    offsets[3] = vec2( halfPixel.x,  halfPixel.y);
    float centerDepth = viewDepth(vUv);
    vec4 fog = vec4(0.0);
    float totalWeight = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 uv = clamp(vUv + offsets[i], vec2(0.0), vec2(1.0));
      float depthDelta = abs(viewDepth(uv) - centerDepth);
      float weight = 1.0 / (1.0 + depthDelta * 2.0);
      fog += texture2D(tFog, uv) * weight;
      totalWeight += weight;
    }
    fog /= max(totalWeight, 1e-5);
    vec4 source = texture2D(tDiffuse, vUv);
    gl_FragColor = vec4(mix(source.rgb, fog.rgb, fog.a), source.a);
  }
`;
