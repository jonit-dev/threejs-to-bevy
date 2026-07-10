/*
 * Adapter-private contact-shadow pipeline adapted from pmndrs/drei:
 * https://github.com/pmndrs/drei/blob/master/src/core/ContactShadows.tsx
 * SPDX-License-Identifier: MIT
 *
 * Unlike the React reference, capture uses layer-isolated proxy meshes with a
 * runtime-owned depth material. Authored scene materials are never swapped or
 * mutated.
 */
import * as THREE from "three";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";
import type { IContactShadowsIr, IWorldIr } from "@threenative/ir";

import type { IThreeWorld } from "../mapWorld.js";

export interface IContactShadowRenderer {
  autoClear: boolean;
  readonly xr: { enabled: boolean };
  clear(): void;
  getClearAlpha(): number;
  getClearColor(target: THREE.Color): THREE.Color;
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  getScissor(target: THREE.Vector4): THREE.Vector4;
  getScissorTest(): boolean;
  getViewport(target: THREE.Vector4): THREE.Vector4;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  setClearColor(color: THREE.ColorRepresentation, alpha?: number): void;
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;
  setScissor(value: THREE.Vector4): void;
  setScissorTest(enabled: boolean): void;
  setViewport(value: THREE.Vector4): void;
}

export interface IContactShadowsObservation {
  appliedResolution: number;
  blurStep: number;
  captureWorldPosition: readonly [number, number, number];
  captureCount: number;
  compositeWorldPosition: readonly [number, number, number];
  entityId: string;
  height: number;
  heightAttenuation: "linear-depth";
  invalidated: boolean;
  opacity: number;
  proxyReconcileCount: number;
  renderCount: number;
  requestedResolution: number;
  size: readonly [number, number];
  softness: number;
  updateMode: "dynamic" | "static";
}

export interface IContactShadowsManager {
  dispose(): void;
  invalidate(entityId?: string): void;
  observations(): IContactShadowsObservation[];
  requiresContinuousUpdates(): boolean;
  sync(world: IWorldIr): void;
  update(world: IWorldIr): void;
}

export interface IContactShadowsManagerOptions {
  dynamicResolutionLimit?: number;
  mapped: IThreeWorld;
  renderer: IContactShadowRenderer;
  world: IWorldIr;
}

interface ICasterProxy {
  proxy: THREE.Mesh;
  source: THREE.Mesh;
}

const DEFAULT_CAPTURE_LAYER = 31;
const COMPOSITE_Y_OFFSET = 0.002;

export function createContactShadowsManager(options: IContactShadowsManagerOptions): IContactShadowsManager {
  return new ContactShadowsManager(options);
}

export function contactShadowOccupancyAtHeight(signedHeight: number, captureHeight: number): number {
  if (captureHeight <= 0) return 0;
  return THREE.MathUtils.clamp(1 - signedHeight / captureHeight, 0, 1);
}

class ContactShadowsManager implements IContactShadowsManager {
  private readonly controllers = new Map<string, ContactShadowsController>();
  private readonly dynamicResolutionLimit: number | undefined;
  private readonly mapped: IThreeWorld;
  private readonly renderer: IContactShadowRenderer;
  private readonly captureLayer: number;
  private disposed = false;

  constructor(options: IContactShadowsManagerOptions) {
    this.dynamicResolutionLimit = options.dynamicResolutionLimit;
    this.mapped = options.mapped;
    this.renderer = options.renderer;
    this.captureLayer = privateCaptureLayer(options.mapped.layerAllocation);
    this.sync(options.world);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.controllers.values()) controller.dispose();
    this.controllers.clear();
  }

  invalidate(entityId?: string): void {
    if (entityId === undefined) {
      for (const controller of this.controllers.values()) controller.invalidate();
      return;
    }
    this.controllers.get(entityId)?.invalidate();
  }

  observations(): IContactShadowsObservation[] {
    return [...this.controllers.values()]
      .map((controller) => controller.observation())
      .sort((left, right) => left.entityId.localeCompare(right.entityId));
  }

  requiresContinuousUpdates(): boolean {
    return [...this.controllers.values()].some((controller) => controller.observation().updateMode === "dynamic");
  }

  sync(world: IWorldIr): void {
    if (this.disposed) return;
    const desired = world.entities
      .filter((entity) => entity.components.ContactShadows !== undefined)
      .sort((left, right) => left.id.localeCompare(right.id));
    const desiredIds = new Set(desired.map((entity) => entity.id));
    for (const [entityId, controller] of this.controllers) {
      if (!desiredIds.has(entityId)) {
        controller.dispose();
        this.controllers.delete(entityId);
      }
    }
    for (const entity of desired) {
      const config = entity.components.ContactShadows;
      const anchor = this.mapped.objectsById.get(entity.id);
      if (config === undefined || anchor === undefined) continue;
      const signature = JSON.stringify(config);
      const existing = this.controllers.get(entity.id);
      if (existing === undefined || existing.anchor !== anchor || existing.configSignature !== signature) {
        existing?.dispose();
        this.controllers.set(entity.id, new ContactShadowsController({
          anchor,
          captureLayer: this.captureLayer,
          config,
          dynamicResolutionLimit: this.dynamicResolutionLimit,
          entityId: entity.id,
          mapped: this.mapped,
          renderer: this.renderer,
        }));
      }
    }
    for (const controller of this.controllers.values()) controller.syncCasters();
  }

  update(world: IWorldIr): void {
    this.sync(world);
    for (const controller of this.controllers.values()) controller.update();
  }
}

class ContactShadowsController {
  readonly anchor: THREE.Object3D;
  readonly configSignature: string;

  private readonly appliedResolution: number;
  private readonly blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private readonly blurGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly blurPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly blurScene = new THREE.Scene();
  private readonly captureCamera: THREE.OrthographicCamera;
  private readonly captureCameraLocalMatrix: THREE.Matrix4;
  private readonly captureLayer: number;
  private readonly captureScene = new THREE.Scene();
  private readonly compositeGeometry: THREE.PlaneGeometry;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly compositePlane: THREE.Mesh;
  private readonly config: IContactShadowsIr;
  private readonly depthMaterial: THREE.ShaderMaterial;
  private readonly entityId: string;
  private readonly horizontalBlurMaterial = new THREE.ShaderMaterial(HorizontalBlurShader);
  private readonly mapped: IThreeWorld;
  private readonly proxies: ICasterProxy[] = [];
  private readonly renderTarget: THREE.WebGLRenderTarget;
  private readonly renderTargetBlur: THREE.WebGLRenderTarget;
  private readonly renderer: IContactShadowRenderer;
  private readonly verticalBlurMaterial = new THREE.ShaderMaterial(VerticalBlurShader);
  private captureCount = 0;
  private anchorSignature = "";
  private casterSignature = "";
  private dirty = true;
  private disposed = false;
  private renderCount = 0;
  private proxyReconcileCount = 0;

  constructor(options: {
    anchor: THREE.Object3D;
    captureLayer: number;
    config: IContactShadowsIr;
    dynamicResolutionLimit?: number;
    entityId: string;
    mapped: IThreeWorld;
    renderer: IContactShadowRenderer;
  }) {
    this.anchor = options.anchor;
    this.captureLayer = options.captureLayer;
    this.config = options.config;
    this.configSignature = JSON.stringify(options.config);
    this.entityId = options.entityId;
    this.mapped = options.mapped;
    this.renderer = options.renderer;
    this.appliedResolution = options.config.updateMode === "dynamic" && options.dynamicResolutionLimit !== undefined
      ? Math.min(options.config.resolution, options.dynamicResolutionLimit)
      : options.config.resolution;
    this.renderTarget = contactRenderTarget(this.appliedResolution);
    this.renderTargetBlur = contactRenderTarget(this.appliedResolution);
    this.depthMaterial = contactDepthMaterial();
    this.horizontalBlurMaterial.depthTest = false;
    this.horizontalBlurMaterial.depthWrite = false;
    this.verticalBlurMaterial.depthTest = false;
    this.verticalBlurMaterial.depthWrite = false;
    this.blurCamera.position.z = 1;
    this.blurCamera.updateMatrixWorld(true);
    this.blurPlane = new THREE.Mesh(this.blurGeometry, this.horizontalBlurMaterial);
    this.blurPlane.frustumCulled = false;
    this.blurScene.add(this.blurPlane);

    const [width, depth] = options.config.size;
    this.captureCamera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, options.config.height);
    this.captureCamera.position.set(0, options.config.height, 0);
    this.captureCamera.up.set(0, 0, -1);
    this.captureCamera.lookAt(0, 0, 0);
    this.captureCamera.updateMatrix();
    this.captureCameraLocalMatrix = this.captureCamera.matrix.clone();
    this.captureCamera.layers.set(this.captureLayer);
    this.captureCamera.userData.threeNativeContactShadows = true;

    this.compositeGeometry = new THREE.PlaneGeometry(width, depth);
    this.compositeGeometry.rotateX(-Math.PI / 2);
    this.compositeMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        mask: { value: this.renderTarget.texture },
        opacity: { value: options.config.opacity },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D mask;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
          // Convert the linear mask to perceptual coverage before alpha
          // compositing; authored opacity remains the final strength control.
          float occupancy = sqrt(clamp(texture2D(mask, vUv).g, 0.0, 1.0));
          gl_FragColor = vec4(0.0, 0.0, 0.0, occupancy * opacity);
        }
      `,
    });
    this.compositePlane = new THREE.Mesh(this.compositeGeometry, this.compositeMaterial);
    this.compositePlane.position.y = COMPOSITE_Y_OFFSET;
    this.compositePlane.renderOrder = -1;
    this.compositePlane.userData.threeNativeContactShadows = true;
    this.anchor.add(this.compositePlane);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.compositePlane.removeFromParent();
    this.clearProxies();
    this.renderTarget.dispose();
    this.renderTargetBlur.dispose();
    this.depthMaterial.dispose();
    this.horizontalBlurMaterial.dispose();
    this.verticalBlurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.compositeGeometry.dispose();
    this.blurGeometry.dispose();
    this.blurScene.clear();
    this.captureScene.clear();
  }

  invalidate(): void {
    if (!this.disposed) this.dirty = true;
  }

  observation(): IContactShadowsObservation {
    const capturePosition = this.captureCamera.getWorldPosition(new THREE.Vector3());
    const compositePosition = this.compositePlane.getWorldPosition(new THREE.Vector3());
    return {
      appliedResolution: this.appliedResolution,
      blurStep: this.config.softness / this.appliedResolution,
      captureWorldPosition: capturePosition.toArray(),
      captureCount: this.captureCount,
      compositeWorldPosition: compositePosition.toArray(),
      entityId: this.entityId,
      height: this.config.height,
      heightAttenuation: "linear-depth",
      invalidated: this.dirty,
      opacity: this.config.opacity,
      proxyReconcileCount: this.proxyReconcileCount,
      renderCount: this.renderCount,
      requestedResolution: this.config.resolution,
      size: this.config.size,
      softness: this.config.softness,
      updateMode: this.config.updateMode,
    };
  }

  syncCasters(): void {
    if (this.disposed) return;
    this.anchor.updateWorldMatrix(true, true);
    this.mapped.scene.updateMatrixWorld(true);
    const nextAnchorSignature = matrixSignature(this.anchor.matrixWorld);
    if (this.anchorSignature !== "" && nextAnchorSignature !== this.anchorSignature) this.dirty = true;
    this.anchorSignature = nextAnchorSignature;
    const captureCameraWorldMatrix = new THREE.Matrix4().multiplyMatrices(this.anchor.matrixWorld, this.captureCameraLocalMatrix);
    captureCameraWorldMatrix.decompose(this.captureCamera.position, this.captureCamera.quaternion, this.captureCamera.scale);
    this.captureCamera.updateMatrixWorld(true);
    const anchorInverse = this.anchor.matrixWorld.clone().invert();
    const candidates: Array<{ signature: string; source: THREE.Mesh }> = [];
    for (const [entityId, object] of this.mapped.objectsById) {
      if (entityId === this.entityId || object.userData.threeNativeContactShadows === true) continue;
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !isWorldVisible(child) || !child.castShadow || child.userData.threeNativeContactShadows === true) return;
        if (!meshIntersectsRegion(child, anchorInverse, this.config)) return;
        candidates.push({ signature: casterTransformSignature(entityId, child), source: child });
      });
    }
    candidates.sort((left, right) => left.signature.localeCompare(right.signature));
    const nextSignature = candidates.map((entry) => entry.signature).join("|");
    if (nextSignature === this.casterSignature) return;
    this.casterSignature = nextSignature;
    this.dirty = true;
    this.clearProxies();
    for (const candidate of candidates) {
      const proxy = candidate.source.clone(false) as THREE.Mesh;
      proxy.material = this.depthMaterial;
      proxy.matrixAutoUpdate = false;
      proxy.matrix.copy(candidate.source.matrixWorld);
      proxy.layers.set(this.captureLayer);
      proxy.frustumCulled = false;
      proxy.userData = { threeNativeContactShadowProxy: true };
      this.captureScene.add(proxy);
      this.proxies.push({ proxy, source: candidate.source });
    }
    this.proxyReconcileCount += 1;
  }

  update(): void {
    if (this.disposed || (this.config.updateMode === "static" && !this.dirty)) return;
    this.capture();
    this.captureCount += 1;
    this.dirty = false;
  }

  private capture(): void {
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = renderer.getClearColor(new THREE.Color());
    const previousClearAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousXr = renderer.xr.enabled;
    const previousViewport = renderer.getViewport(new THREE.Vector4());
    const previousScissor = renderer.getScissor(new THREE.Vector4());
    const previousScissorTest = renderer.getScissorTest();
    const previousBackground = this.captureScene.background;
    const previousOverrideMaterial = this.captureScene.overrideMaterial;
    try {
      renderer.autoClear = true;
      renderer.xr.enabled = false;
      renderer.setScissorTest(false);
      renderer.setViewport(new THREE.Vector4(0, 0, this.appliedResolution, this.appliedResolution));
      renderer.setScissor(new THREE.Vector4(0, 0, this.appliedResolution, this.appliedResolution));
      renderer.setClearColor("#000000", 0);
      this.captureScene.background = null;
      this.captureScene.overrideMaterial = null;
      renderer.setRenderTarget(this.renderTarget);
      renderer.clear();
      renderer.render(this.captureScene, this.captureCamera);
      this.renderCount += 1;
      this.blur(this.horizontalBlurMaterial, "h", this.renderTarget.texture, this.renderTargetBlur);
      this.blur(this.verticalBlurMaterial, "v", this.renderTargetBlur.texture, this.renderTarget);
    } finally {
      this.captureScene.overrideMaterial = previousOverrideMaterial;
      this.captureScene.background = previousBackground;
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      renderer.autoClear = previousAutoClear;
      renderer.xr.enabled = previousXr;
      renderer.setScissorTest(previousScissorTest);
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
    }
  }

  private blur(material: THREE.ShaderMaterial, axis: "h" | "v", texture: THREE.Texture, target: THREE.WebGLRenderTarget): void {
    this.blurPlane.material = material;
    material.uniforms.tDiffuse!.value = texture;
    material.uniforms[axis]!.value = this.config.softness / this.appliedResolution;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.blurScene, this.blurCamera);
    this.renderCount += 1;
  }

  private clearProxies(): void {
    for (const { proxy } of this.proxies) proxy.removeFromParent();
    this.proxies.length = 0;
  }
}

function contactRenderTarget(resolution: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(resolution, resolution, {
    depthBuffer: false,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

function contactDepthMaterial(): THREE.ShaderMaterial {
  // Encode attenuated height occupancy in RGB and keep alpha opaque. The
  // composite samples green explicitly, so render-target alpha conventions
  // cannot turn the clear region into a full-plane shadow.
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      void main() {
        float occupancy = clamp(gl_FragCoord.z, 0.0, 1.0);
        gl_FragColor = vec4(vec3(occupancy), 1.0);
      }
    `,
  });
  material.blending = THREE.NoBlending;
  material.depthTest = false;
  material.depthWrite = false;
  return material;
}

function meshIntersectsRegion(mesh: THREE.Mesh, anchorInverse: THREE.Matrix4, config: IContactShadowsIr): boolean {
  if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox?.clone();
  if (bounds === undefined) return false;
  const localToAnchor = new THREE.Matrix4().multiplyMatrices(anchorInverse, mesh.matrixWorld);
  bounds.applyMatrix4(localToAnchor);
  const halfWidth = config.size[0] / 2;
  const halfDepth = config.size[1] / 2;
  const region = new THREE.Box3(
    new THREE.Vector3(-halfWidth, 0, -halfDepth),
    new THREE.Vector3(halfWidth, config.height, halfDepth),
  );
  return bounds.intersectsBox(region);
}

function casterTransformSignature(entityId: string, mesh: THREE.Mesh): string {
  return `${entityId}:${mesh.uuid}:${mesh.visible ? 1 : 0}:${mesh.matrixWorld.elements.map((value) => value.toFixed(8)).join(",")}`;
}

function matrixSignature(matrix: THREE.Matrix4): string {
  return matrix.elements.map((value) => value.toFixed(8)).join(",");
}

function isWorldVisible(object: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current !== null; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function privateCaptureLayer(allocation: ReadonlyMap<string, number>): number {
  const used = new Set(allocation.values());
  for (let layer = DEFAULT_CAPTURE_LAYER; layer >= 1; layer -= 1) {
    if (!used.has(layer)) return layer;
  }
  return DEFAULT_CAPTURE_LAYER;
}
