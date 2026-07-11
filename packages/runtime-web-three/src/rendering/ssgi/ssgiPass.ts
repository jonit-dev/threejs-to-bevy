import type { IAtmosphereProfileIr, IRuntimeConfigIr, RenderLookTargetProfile } from "@threenative/ir";
import { resolveRenderLookSsgiQualityLimit } from "@threenative/ir/runtimeConfig";
import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ssgiCompositeFragmentShader, ssgiFullscreenVertexShader, ssgiSpatialFragmentShader } from "./ssgi.frag.js";
import { SsgiTemporalResolvePass } from "./temporalResolvePass.js";

export interface IWebSsgiSettings {
  ambientRadiance: readonly [number, number, number];
  intensity: number;
  quality: "low" | "medium" | "high";
  radius: number;
  rayCount: 4 | 8;
  resolutionScale: 0.5 | 1;
  stepCount: 8 | 12 | 16;
}

export interface IWebSsgiResourceObservation {
  depthSize: readonly [number, number];
  disposeCount: number;
  disposed: boolean;
  indirectSize: readonly [number, number];
}

export function webSsgiSettings(config?: IRuntimeConfigIr, atmosphere?: IAtmosphereProfileIr, targetProfile: RenderLookTargetProfile = "desktop-web"): IWebSsgiSettings | undefined {
  const authored = config?.renderer?.screenSpaceGlobalIllumination;
  if (authored?.enabled !== true) return undefined;
  const quality = clampQuality(authored.quality, resolveRenderLookSsgiQualityLimit(targetProfile));
  const ambient = atmosphere?.ambient;
  const ambientSource = ambient?.color ?? atmosphere?.sky?.color ?? "#20242a";
  const ambientColor = typeof ambientSource === "string"
    ? new THREE.Color(ambientSource)
    : new THREE.Color(ambientSource[0], ambientSource[1], ambientSource[2]);
  const ambientScale = Math.max(0, ambient?.intensity ?? 0.2) * 0.15;
  return {
    ambientRadiance: [ambientColor.r * ambientScale, ambientColor.g * ambientScale, ambientColor.b * ambientScale],
    intensity: (authored.intensity ?? 1) * 0.4,
    quality,
    radius: authored.radius ?? 10,
    rayCount: quality === "low" ? 4 : 8,
    resolutionScale: quality === "high" ? 1 : 0.5,
    stepCount: quality === "low" ? 8 : quality === "medium" ? 12 : 16,
  };
}

function clampQuality(authored: "low" | "medium" | "high", limit: "low" | "medium" | "high"): "low" | "medium" | "high" {
  const rank = { high: 2, low: 0, medium: 1 } as const;
  return rank[authored] <= rank[limit] ? authored : limit;
}

export class SsgiPass extends Pass {
  private readonly depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });
  private readonly depthTarget = createDepthTarget();
  private readonly indirectTarget = createIndirectTarget();
  private readonly temporalTarget = createIndirectTarget();
  private readonly temporalResolve: SsgiTemporalResolvePass;
  private readonly spatialMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private disposed = false;
  private disposeCount = 0;
  private frame = 0;
  private width = 1;
  private height = 1;

  public constructor(private readonly scene: THREE.Scene, private readonly camera: THREE.Camera, private readonly settings: IWebSsgiSettings) {
    super();
    this.needsSwap = true;
    this.spatialMaterial = new THREE.ShaderMaterial({
      name: "ThreeNativeSsgiSpatial",
      depthTest: false,
      depthWrite: false,
      uniforms: {
        ambientRadiance: { value: new THREE.Vector3(...settings.ambientRadiance) },
        frame: { value: 0 },
        projection: { value: new THREE.Matrix4() },
        projectionInverse: { value: new THREE.Matrix4() },
        radius: { value: settings.radius },
        rayCount: { value: settings.rayCount },
        resolution: { value: new THREE.Vector2(1, 1) },
        stepCount: { value: settings.stepCount },
        tBeauty: { value: null as THREE.Texture | null },
        tDepth: { value: this.depthTarget.depthTexture },
      },
      vertexShader: ssgiFullscreenVertexShader,
      fragmentShader: ssgiSpatialFragmentShader,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      name: "ThreeNativeSsgiComposite",
      depthTest: false,
      depthWrite: false,
      uniforms: {
        indirectTexelSize: { value: new THREE.Vector2(1, 1) },
        intensity: { value: settings.intensity },
        projectionInverse: { value: new THREE.Matrix4() },
        tDepth: { value: this.depthTarget.depthTexture },
        tDiffuse: { value: null as THREE.Texture | null },
        tIndirect: { value: this.indirectTarget.texture },
      },
      vertexShader: ssgiFullscreenVertexShader,
      fragmentShader: ssgiCompositeFragmentShader,
    });
    this.quad = new FullScreenQuad(this.spatialMaterial);
    this.temporalResolve = new SsgiTemporalResolvePass(settings.radius);
  }

  public override setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.depthTarget.setSize(this.width, this.height);
    const indirectWidth = Math.max(1, Math.ceil(this.width * this.settings.resolutionScale));
    const indirectHeight = Math.max(1, Math.ceil(this.height * this.settings.resolutionScale));
    this.indirectTarget.setSize(indirectWidth, indirectHeight);
    this.temporalTarget.setSize(indirectWidth, indirectHeight);
    this.temporalResolve.setSize(indirectWidth, indirectHeight);
    (this.spatialMaterial.uniforms.resolution!.value as THREE.Vector2).set(this.width, this.height);
    (this.compositeMaterial.uniforms.indirectTexelSize!.value as THREE.Vector2).set(1 / indirectWidth, 1 / indirectHeight);
  }

  public resourceObservation(): IWebSsgiResourceObservation {
    return {
      depthSize: [this.depthTarget.width, this.depthTarget.height],
      disposeCount: this.disposeCount,
      disposed: this.disposed,
      indirectSize: [this.indirectTarget.width, this.indirectTarget.height],
    };
  }

  public override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const previousOverride = this.scene.overrideMaterial;
    const previousBackground = this.scene.background;
    this.scene.overrideMaterial = this.depthMaterial;
    this.scene.background = null;
    renderer.setRenderTarget(this.depthTarget);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = previousOverride;
    this.scene.background = previousBackground;

    this.frame = (this.frame + 1) % 4096;
    this.spatialMaterial.uniforms.frame!.value = this.frame;
    this.spatialMaterial.uniforms.projection!.value.copy(this.camera.projectionMatrix);
    this.spatialMaterial.uniforms.projectionInverse!.value.copy(this.camera.projectionMatrixInverse);
    this.spatialMaterial.uniforms.tBeauty!.value = readBuffer.texture;
    this.quad.material = this.spatialMaterial;
    renderer.setRenderTarget(this.indirectTarget);
    renderer.clear();
    this.quad.render(renderer);

    this.temporalResolve.render(renderer, this.indirectTarget.texture, this.depthTarget.depthTexture!, this.camera, this.temporalTarget);

    this.compositeMaterial.uniforms.tDiffuse!.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tIndirect!.value = this.temporalTarget.texture;
    this.compositeMaterial.uniforms.projectionInverse!.value.copy(this.camera.projectionMatrixInverse);
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
  }

  public override dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeCount += 1;
    this.depthMaterial.dispose();
    this.depthTarget.dispose();
    this.indirectTarget.dispose();
    this.temporalTarget.dispose();
    this.temporalResolve.dispose();
    this.spatialMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}

function createDepthTarget(): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, stencilBuffer: false });
  target.texture.name = "ThreeNativeSsgi.depthColor";
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  target.depthTexture.name = "ThreeNativeSsgi.depth";
  return target;
}

function createIndirectTarget(): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, stencilBuffer: false, type: THREE.HalfFloatType });
  target.texture.name = "ThreeNativeSsgi.indirect";
  return target;
}
