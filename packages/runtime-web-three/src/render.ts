import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { IAssetsManifest, IAtmosphereProfileIr, ICameraClear, IMaterialsIr, IRuntimeConfigIr, IWorldIr, RenderLookProfileName } from "@threenative/ir";
import { resolveRenderLookProfile } from "@threenative/ir/runtimeConfig";
import type { IWebBundle } from "./webBundle.js";
import {
  updateCameraHelpers,
  updateCameraProjection,
  viewportToPhysical,
  type ICameraViewPlan,
} from "./cameras.js";
import {
  bindRenderTargetTextures,
  createRenderTargetRegistry,
  renderTargetCameraPasses,
  type IRenderTargetRegistry,
} from "./renderTargets.js";
import { advanceAnimationPlayback, hasAnimationPlayback, loadPendingMaterialTextures, loadWorldModelAssets, mapWorld, syncTransforms, type IRuntimeDiagnostic, type IThreeWorld } from "./mapWorld.js";
import { applyEnvironmentBookmark, createEnvironmentRuntime, loadEnvironmentAssetInstances } from "./environment.js";
import { applyAtmosphereProfile, applyEnvironmentLighting, applyThreeCompatFogDistance } from "./rendering.js";
import { applyWebRenderLookProfile } from "./rendering/applyRenderLookProfile.js";
import { createGameLoopState, runGameFrame } from "./gameLoop.js";
import { initializePhysicsRuntime } from "./physics.js";
import { attachInputListeners, createInputState } from "./input.js";
import { hasKinematicMovers, stepKinematicMovers } from "./kinematicMover.js";
import { loadSystemModuleUrl } from "./systems/moduleLoaderUrl.js";
import type { ISystemModule } from "./systems/runner.js";
import { createSystemEffectLog, type ISystemEffectLog } from "./systems/log.js";
import type { IResourceObservation } from "./systems/context.js";
import { createUiDomOverlay } from "./ui/domOverlay.js";
import { renderUi, type IRenderedUi, type IRenderedUiNode } from "./ui/renderUi.js";
import { createWebAudioElementSink, createWebAudioRuntime } from "./audio.js";
import { createWebOverlayHost, type IWebOverlayHost } from "./overlay/host.js";
import { createFrameTimingTrace, summarizeFrameTimings, type IFrameTimingSummary } from "./performanceMetrics.js";

export interface IRenderResult {
  canvas: HTMLCanvasElement;
  debugColliderCount: number;
  diagnostics: IRuntimeDiagnostic[];
  dispose(): void;
  effectLog: ISystemEffectLog;
  entityWorldPosition(id: string): [number, number, number] | undefined;
  performanceSnapshot(): IWebRuntimePerformanceSnapshot;
  resetPerformanceTrace(): void;
  renderer: THREE.WebGLRenderer;
  resourceSnapshot(id: string): unknown;
  runtimeDiagnostics: IWebRuntimeDiagnostics;
  runtimeDiagnosticsSnapshot(): IWebRuntimeDiagnostics;
  setEntityTransform(id: string, transform: IWebRuntimeTransformPatch): boolean;
  overlayHost?: IWebOverlayHost;
  ui?: IRenderedUi;
  uiNodeSnapshot(id: string): IRenderedUiNode | undefined;
}

export interface IWebRuntimeTransformPatch {
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

export interface IWebRuntimePerformanceSnapshot {
  frameSamplesMs: number[];
  renderer: {
    drawCalls: number;
    geometries: number;
    programs: number;
    textures: number;
    triangles: number;
  };
  summary: IFrameTimingSummary;
}

export interface IRenderOptions {
  bookmarkId?: string;
  debugColliders?: boolean;
  systemModuleLoader?: (source: string, manifest: IWebBundle["manifest"]) => Promise<ISystemModule>;
}

export interface IWebRuntimeDiagnostics {
  activeCameraId?: string;
  assets: {
    declared: number;
    models: number;
    resourceFailures: IRuntimeDiagnostic[];
  };
  camera?: {
    distanceToWorldCenter?: number;
    far?: number;
    near?: number;
    type: "orthographic" | "perspective" | "unknown";
    worldPosition: [number, number, number];
    worldRadiusWithinClipRange?: boolean;
  };
  scene: {
    entityCount: number;
    objectCount: number;
    visibleMeshCount: number;
    worldBounds?: {
      center: [number, number, number];
      max: [number, number, number];
      min: [number, number, number];
      radius: number;
      size: [number, number, number];
    };
    culledMeshCount: number;
    currentSceneId?: string;
    renderedEntities: IWebRenderedEntityDiagnostics[];
  };
  recentRuntimeErrors: IRuntimeDiagnostic[];
  resources: {
    declared: string[];
    observations: IResourceObservation[];
  };
}

export interface IWebRenderedEntityDiagnostics {
  cameraDistance?: number;
  clipping?: "behind-camera" | "beyond-far" | "before-near" | "in-range";
  finalScale: [number, number, number];
  id: string;
  material?: {
    textureLoaded?: boolean;
    transparent?: boolean;
    type: string;
  };
  projectedBounds?: {
    max: [number, number];
    min: [number, number];
  };
  visible: boolean;
  worldBounds?: {
    center: [number, number, number];
    max: [number, number, number];
    min: [number, number, number];
    size: [number, number, number];
  };
}

export interface IWebBloomSettings {
  enabled: boolean;
  intensity: number;
  threshold: number;
}

export interface IWebAmbientOcclusionSettings {
  enabled: boolean;
  intensity: number;
  kernelSize: number;
  maxDistance: number;
  minDistance: number;
  radius: number;
}

export interface IWebDepthOfFieldSettings {
  aperture: number;
  enabled: boolean;
  focusDistance: number;
  maxBlur: number;
}

export interface IWebMotionBlurSettings {
  enabled: boolean;
  shutterAngle: number;
}

export interface IWebScreenSpaceReflectionsSettings {
  enabled: boolean;
  opacity: number;
  roughnessLimit: number;
}

interface IRenderPipeline {
  render(delta?: number): void;
  setSize(width: number, height: number): void;
}

export interface IWebRenderLifecycle {
  dispose(): void;
  schedule(): void;
}

export interface IWebRenderLifecycleOptions {
  cancelAnimationFrame?: (handle: number) => void;
  diagnostics: IRuntimeDiagnostic[];
  frame(time: number): Promise<void> | void;
  onDispose?: () => void;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
}

export async function renderLoadedBundle(bundle: IWebBundle, container: HTMLElement, options: IRenderOptions = {}): Promise<IRenderResult> {
  const source = bundle.source ?? "";
  await initializePhysicsRuntime();
  const mapped = mapWorld(bundle);
  assertSceneReady(mapped.diagnostics);
  await loadWorldModelAssets(mapped, bundle, source);
  await loadPendingMaterialTextures();
  const environment = createEnvironmentRuntime(bundle, { renderPlaceholders: false });
  if (environment !== undefined) {
    applyAtmosphereProfile(mapped.scene, bundle.environmentScene?.atmosphere);
    const environmentLighting = await applyEnvironmentLighting(mapped.scene, bundle.environmentScene, bundle.assets, source);
    mapped.diagnostics.push(...environmentLighting.diagnostics.map((diagnostic) => ({ ...diagnostic, path: "environment.scene.json" })));
    mapped.scene.add(environment.object);
    try {
      const assets = await loadEnvironmentAssetInstances(bundle, source);
      if (assets !== undefined) {
        mapped.scene.add(assets);
      }
    } catch (error) {
      mapped.diagnostics.push({
        code: "TN_WEB_ENVIRONMENT_MODEL_LOAD_FAILED",
        message: `Environment model assets failed to load: ${error instanceof Error ? error.message : String(error)}.`,
        path: "environment.scene.json/sourceAssets",
        severity: "warning",
      });
    }
    mapped.diagnostics.push(...environment.instancingPlan.diagnostics);
  }
  createRenderedParticleObjects(bundle.assets).forEach((particles) => mapped.scene.add(particles));
  if (
    bundle.environmentScene?.atmosphere?.fog?.enabled === true
    && bundle.environmentScene.atmosphere.fog.mode === "exponential"
  ) {
    applyThreeCompatFogDistance(mapped.scene);
  }
  if (options.bookmarkId !== undefined) {
    applyEnvironmentBookmark(bundle, mapped.camera, options.bookmarkId);
  }
  exposeDebugSceneSnapshot(mapped.scene);
  const input = createInputState(bundle.input);
  const loopState = createGameLoopState(bundle.runtimeConfig);
  const effectLog = createSystemEffectLog();
  const resourceObservations: IResourceObservation[] = [];
  const systemModule = await (options.systemModuleLoader ?? loadSystemModuleUrl)(source, bundle.manifest);
  const renderer = new THREE.WebGLRenderer(webRendererParameters(bundle.runtimeConfig));
  const renderLook = applyWebRenderLookProfile(bundle.runtimeConfig);
  applyRendererColorManagement(renderer, bundle.environmentScene?.atmosphere?.colorManagement, renderLook.colorGrading);
  applyRendererShadowSettings(renderer, bundle.runtimeConfig);
  applyRenderLookSceneDefaults(mapped.scene, renderLook);
  const pipeline = createRenderPipeline(renderer, mapped, bundle.world, bundle.runtimeConfig, bundle.assets, bundle.materials);
  const colliderDebugOverlay = options.debugColliders === true ? createColliderDebugOverlay(mapped, bundle.world) : undefined;
  const canvas = renderer.domElement;
  const ui = bundle.ui === undefined ? undefined : renderUi(bundle.ui, bundle.world);
  const uiOverlay = ui === undefined ? undefined : createUiDomOverlay(ui);
  const overlayHost = bundle.overlays === undefined ? undefined : createWebOverlayHost(bundle.overlays, source);
  if (bundle.audio !== undefined) {
    const audioSink = createWebAudioElementSink(source, bundle.assets);
    const audioRuntime = createWebAudioRuntime(bundle.audio, audioSink);
    audioRuntime.start();
    audioRuntime.handleEvents(audioEvents(bundle.world.events ?? {}));
    mapped.diagnostics.push(...audioSink.diagnostics);
  }

  let performanceTrace: number[] = [];
  let resetPerformanceTrace = () => {
    performanceTrace.length = 0;
  };
  prepareRenderContainer(container);
  canvas.style.display = "block";
  container.replaceChildren(...([canvas, uiOverlay?.element, overlayHost?.element].filter((child) => child !== undefined) as Node[]));
  const detachInputListeners = attachInputListeners(window, input);
  resizeRenderer(renderer, pipeline, mapped, container);
  if (bundle.systems !== undefined) {
    await runGameFrame({
      assets: bundle.assets,
      componentSchemas: bundle.componentSchemas,
      delta: 1 / 60,
      effectLog,
      environmentScene: bundle.environmentScene,
      input,
      mapped,
      module: systemModule,
      resourceObservations,
      runtimeConfig: bundle.runtimeConfig,
      state: loopState,
      systems: bundle.systems,
      ui: bundle.ui,
      uiState: ui,
      world: bundle.world,
    });
    uiOverlay?.update();
  } else if (hasKinematicMovers(bundle.world)) {
    stepKinematicMovers(bundle.world, 1 / 60);
    syncTransforms(bundle.world, mapped.objectsById);
    uiOverlay?.update();
  }
  advanceAnimationPlayback(mapped, 1 / 60);
  colliderDebugOverlay?.update();
  pipeline.render();
  logStartupDiagnostics(mapped.diagnostics);
  let lifecycle: IWebRenderLifecycle | undefined;
  if (bundle.systems !== undefined || hasAnimationPlayback(mapped) || hasKinematicMovers(bundle.world)) {
    const frameTimings = createFrameTimingTrace();
    resetPerformanceTrace = () => frameTimings.reset();
    lifecycle = createWebRenderLifecycle({
      diagnostics: mapped.diagnostics,
      onDispose: () => {
        detachInputListeners();
        renderer.dispose();
      },
      async frame(time: number) {
        const timing = frameTimings.record(time);
        const delta = timing.deltaMs / 1000;
        if (bundle.systems !== undefined) {
          drainUiActionsIntoInput(ui, input);
          await runGameFrame({
            assets: bundle.assets,
            componentSchemas: bundle.componentSchemas,
            delta,
            effectLog,
            environmentScene: bundle.environmentScene,
            input,
            mapped,
            module: systemModule,
            resourceObservations,
            runtimeConfig: bundle.runtimeConfig,
            state: loopState,
            systems: bundle.systems,
            ui: bundle.ui,
            uiState: ui,
            world: bundle.world,
          });
        } else if (hasKinematicMovers(bundle.world)) {
          stepKinematicMovers(bundle.world, loopState.elapsed + delta);
          loopState.elapsed += delta;
          syncTransforms(bundle.world, mapped.objectsById);
        }
        advanceAnimationPlayback(mapped, delta);
        uiOverlay?.update();
        colliderDebugOverlay?.update();
        pipeline.render(delta);
      },
    });
    performanceTrace = frameTimings.samples as number[];
    lifecycle.schedule();
  }

  return {
    canvas,
    diagnostics: mapped.diagnostics,
    dispose() {
      lifecycle?.dispose();
      colliderDebugOverlay?.dispose();
      if (lifecycle === undefined) {
        detachInputListeners();
        renderer.dispose();
      }
    },
    debugColliderCount: colliderDebugOverlay?.count ?? 0,
    effectLog,
    entityWorldPosition(id: string) {
      const object = mapped.objectsById.get(id);
      if (object === undefined) {
        return undefined;
      }
      const position = new THREE.Vector3();
      object.getWorldPosition(position);
      return vectorToTuple(position);
    },
    ...(overlayHost === undefined ? {} : { overlayHost }),
    renderer,
    performanceSnapshot() {
      return webRuntimePerformanceSnapshot(renderer, performanceTrace);
    },
    resetPerformanceTrace() {
      resetPerformanceTrace();
    },
    resourceSnapshot(id: string) {
      return cloneJsonValue(bundle.world.resources?.[id]);
    },
    runtimeDiagnostics: collectWebRuntimeDiagnostics(mapped, bundle, resourceObservations),
    runtimeDiagnosticsSnapshot() {
      return collectWebRuntimeDiagnostics(mapped, bundle, resourceObservations);
    },
    setEntityTransform(id: string, transform: IWebRuntimeTransformPatch) {
      const entity = bundle.world.entities.find((candidate) => candidate.id === id);
      const object = mapped.objectsById.get(id);
      if (entity === undefined || object === undefined) {
        return false;
      }
      entity.components.Transform = {
        ...(entity.components.Transform ?? {}),
        ...(transform.position === undefined ? {} : { position: transform.position }),
        ...(transform.rotation === undefined ? {} : { rotation: transform.rotation }),
        ...(transform.scale === undefined ? {} : { scale: transform.scale }),
      };
      syncTransforms(bundle.world, mapped.objectsById);
      pipeline.render();
      return true;
    },
    ...(ui === undefined ? {} : { ui }),
    uiNodeSnapshot(id: string) {
      if (ui === undefined) {
        return undefined;
      }
      return cloneJsonValue(findRenderedUiNode(ui.root, id)) as IRenderedUiNode | undefined;
    },
  };
}

function drainUiActionsIntoInput(ui: IRenderedUi | undefined, input: ReturnType<typeof createInputState>): void {
  for (const action of ui?.drainActions() ?? []) {
    input.enqueueUiAction(action.action);
  }
}

function exposeDebugSceneSnapshot(scene: THREE.Scene): void {
  const objectNames: string[] = [];
  const stylizedNature = {
    fallbackGrass: 0,
    sourceGrass: 0,
    sourceLeaves: 0,
    sourceTrees: 0,
  };
  scene.traverse((object) => {
    if (object.name.length > 0) {
      objectNames.push(object.name);
    }
    if (object.name === "source-grass-blades-up") {
      stylizedNature.sourceGrass += 1;
    } else if (object.name === "lush-stylized-grass-clumps") {
      stylizedNature.fallbackGrass += 1;
    } else if (object.name === "source-tree-leaves") {
      stylizedNature.sourceLeaves += 1;
    } else if (object.name.startsWith("source-stylized-tree-")) {
      stylizedNature.sourceTrees += 1;
    }
  });
  (globalThis as { __THREENATIVE_DEBUG_SCENE__?: unknown }).__THREENATIVE_DEBUG_SCENE__ = {
    objectNames,
    stylizedNature,
  };
}

function findRenderedUiNode(node: IRenderedUiNode, id: string): IRenderedUiNode | undefined {
  if (node.id === id) {
    return node;
  }
  for (const child of node.children) {
    const found = findRenderedUiNode(child, id);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function cloneJsonValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function webRuntimePerformanceSnapshot(renderer: THREE.WebGLRenderer, frameSamplesMs: readonly number[]): IWebRuntimePerformanceSnapshot {
  const info = renderer.info;
  return {
    frameSamplesMs: [...frameSamplesMs],
    renderer: {
      drawCalls: info.render.calls,
      geometries: info.memory.geometries,
      programs: info.programs?.length ?? 0,
      textures: info.memory.textures,
      triangles: info.render.triangles,
    },
    summary: summarizeFrameTimings(frameSamplesMs),
  };
}

export function collectWebRuntimeDiagnostics(mapped: IThreeWorld, bundle: IWebBundle, resourceObservations: readonly IResourceObservation[] = []): IWebRuntimeDiagnostics {
  const activeCameraId = cameraIdFor(mapped);
  const worldBounds = visibleWorldBounds(mapped.scene);
  const cameraPosition = new THREE.Vector3();
  mapped.camera.getWorldPosition(cameraPosition);
  const radius = worldBounds === undefined ? undefined : worldBounds.radius;
  const distanceToWorldCenter = worldBounds === undefined ? undefined : cameraPosition.distanceTo(new THREE.Vector3(...worldBounds.center));
  const near = cameraNear(mapped.camera);
  const far = cameraFar(mapped.camera);
  return {
    ...(activeCameraId === undefined ? {} : { activeCameraId }),
    assets: {
      declared: bundle.assets.assets.length,
      models: bundle.assets.assets.filter((asset) => asset.kind === "model").length,
      resourceFailures: mapped.diagnostics.filter((diagnostic) => isResourceFailureDiagnostic(diagnostic)),
    },
    camera: {
      ...(distanceToWorldCenter === undefined ? {} : { distanceToWorldCenter: roundMetric(distanceToWorldCenter) }),
      ...(far === undefined ? {} : { far }),
      ...(near === undefined ? {} : { near }),
      type: cameraType(mapped.camera),
      worldPosition: vectorToTuple(cameraPosition),
      ...(distanceToWorldCenter === undefined || radius === undefined || near === undefined || far === undefined
        ? {}
        : { worldRadiusWithinClipRange: distanceToWorldCenter + radius >= near && distanceToWorldCenter - radius <= far }),
    },
    scene: {
      culledMeshCount: culledMeshCount(mapped.scene),
      ...(bundle.scenes?.initialScene === undefined ? {} : { currentSceneId: bundle.scenes.initialScene }),
      entityCount: bundle.world.entities.length,
      objectCount: mapped.objectsById.size,
      renderedEntities: renderedEntityDiagnostics(mapped),
      visibleMeshCount: visibleMeshCount(mapped.scene),
      ...(worldBounds === undefined ? {} : { worldBounds }),
    },
    recentRuntimeErrors: mapped.diagnostics.filter((diagnostic) => diagnostic.severity === "error").slice(-10),
    resources: {
      declared: declaredSystemResources(bundle.systems),
      observations: compactResourceObservations(resourceObservations),
    },
  };
}

function declaredSystemResources(systems: IWebBundle["systems"]): string[] {
  return [...new Set((systems?.systems ?? []).flatMap((system) => [...declaredResourceList(system.resourceReads), ...declaredResourceList(system.resourceWrites)]))].sort();
}

function declaredResourceList(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [];
}

function compactResourceObservations(observations: readonly IResourceObservation[]): IResourceObservation[] {
  return [
    ...new Map(
      observations.map((observation) => [
        [observation.frame ?? "", observation.tick ?? "", observation.schedule ?? "", observation.system ?? "", observation.kind, observation.resource].join("\0"),
        observation,
      ]),
    ).values(),
  ].slice(-200);
}

interface IColliderDebugOverlay {
  count: number;
  dispose(): void;
  update(): void;
}

function createColliderDebugOverlay(mapped: IThreeWorld, world: IWorldIr): IColliderDebugOverlay {
  const root = new THREE.Group();
  root.name = "threenative.debug.colliders";
  root.renderOrder = 10_000;
  const material = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    depthTest: false,
    opacity: 0.22,
    transparent: true,
    wireframe: true,
  });
  const items = world.entities.flatMap((entity) => {
    const collider = entity.components.Collider;
    const object = mapped.objectsById.get(entity.id);
    if (collider === undefined || object === undefined) {
      return [];
    }
    const mesh = colliderDebugMesh(collider, material);
    if (mesh === undefined) {
      return [];
    }
    mesh.name = `debug.collider.${entity.id}`;
    mesh.userData = { threenativeDebugOnly: true, entityId: entity.id };
    root.add(mesh);
    return [{ collider, mesh, object }];
  });
  mapped.scene.add(root);

  return {
    count: items.length,
    dispose() {
      mapped.scene.remove(root);
      root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
        }
      });
      material.dispose();
    },
    update() {
      const worldPosition = new THREE.Vector3();
      const worldQuaternion = new THREE.Quaternion();
      for (const item of items) {
        item.object.getWorldPosition(worldPosition);
        item.object.getWorldQuaternion(worldQuaternion);
        const localCenter = colliderLocalCenter(item.collider);
        if (localCenter !== undefined) {
          worldPosition.add(new THREE.Vector3(...localCenter).applyQuaternion(worldQuaternion));
        }
        item.mesh.position.copy(worldPosition);
        item.mesh.quaternion.copy(worldQuaternion);
      }
    },
  };
}

function colliderDebugMesh(
  collider: NonNullable<IWorldIr["entities"][number]["components"]["Collider"]>,
  material: THREE.Material,
): THREE.Mesh | undefined {
  if (collider.kind === "box") {
    const [x = 1, y = 1, z = 1] = collider.size ?? [];
    return new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material);
  }
  if (collider.kind === "sphere") {
    return new THREE.Mesh(new THREE.SphereGeometry(collider.radius ?? 0.5, 24, 12), material);
  }
  if (collider.kind === "capsule") {
    return new THREE.Mesh(new THREE.CapsuleGeometry(collider.radius ?? 0.5, collider.height ?? 1, 8, 16), material);
  }
  if (collider.kind === "cylinder") {
    return new THREE.Mesh(new THREE.CylinderGeometry(collider.radius ?? 0.5, collider.radius ?? 0.5, collider.height ?? 1, 24), material);
  }
  if (collider.kind === "mesh" && collider.mesh !== undefined) {
    const [x, y, z] = collider.mesh.bounds.size;
    return new THREE.Mesh(new THREE.BoxGeometry(x, y, z), material);
  }
  return undefined;
}

function colliderLocalCenter(collider: NonNullable<IWorldIr["entities"][number]["components"]["Collider"]>): [number, number, number] | undefined {
  if (collider.center !== undefined) {
    const [x, y, z] = collider.center;
    return [x, y, z];
  }
  if (collider.kind === "mesh" && collider.mesh?.bounds.center !== undefined) {
    const [x, y, z] = collider.mesh.bounds.center;
    return [x, y, z];
  }
  return undefined;
}

export function createWebRenderLifecycle(options: IWebRenderLifecycleOptions): IWebRenderLifecycle {
  const requestFrame = options.requestAnimationFrame ?? globalThis.requestAnimationFrame.bind(globalThis);
  const cancelFrame = options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame.bind(globalThis);
  let disposed = false;
  let frameHandle: number | undefined;

  const runFrame: FrameRequestCallback = (time) => {
    frameHandle = undefined;
    try {
      const result = options.frame(time);
      void Promise.resolve(result)
        .catch((error: unknown) => {
          options.diagnostics.push({
            code: "TN_WEB_RENDER_FRAME_FAILED",
            message: `Web render frame failed: ${error instanceof Error ? error.message : String(error)}.`,
            path: "runtime.frame",
            severity: "error",
          });
        })
        .finally(() => {
          if (!disposed) {
            frameHandle = requestFrame(runFrame);
          }
        });
    } catch (error) {
      options.diagnostics.push({
        code: "TN_WEB_RENDER_FRAME_FAILED",
        message: `Web render frame failed: ${error instanceof Error ? error.message : String(error)}.`,
        path: "runtime.frame",
        severity: "error",
      });
      if (!disposed) {
        frameHandle = requestFrame(runFrame);
      }
    }
  };

  return {
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (frameHandle !== undefined) {
        cancelFrame(frameHandle);
        frameHandle = undefined;
      }
      options.onDispose?.();
    },
    schedule() {
      if (!disposed && frameHandle === undefined) {
        frameHandle = requestFrame(runFrame);
      }
    },
  };
}

function logStartupDiagnostics(diagnostics: readonly IRuntimeDiagnostic[]): void {
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "warning") {
      console.warn(`${diagnostic.code}: ${diagnostic.message}`, {
        path: diagnostic.path,
        suggestion: diagnostic.suggestion,
      });
    }
  }
}

function cameraIdFor(mapped: IThreeWorld): string | undefined {
  for (const [id, camera] of mapped.cameras.entries()) {
    if (camera === mapped.camera) {
      return id;
    }
  }
  return undefined;
}

function visibleMeshCount(scene: THREE.Scene): number {
  let count = 0;
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && visibleInHierarchy(object)) {
      count += 1;
    }
  });
  return count;
}

function culledMeshCount(scene: THREE.Scene): number {
  let count = 0;
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh && !visibleInHierarchy(object)) {
      count += 1;
    }
  });
  return count;
}

function renderedEntityDiagnostics(mapped: IThreeWorld): IWebRenderedEntityDiagnostics[] {
  const cameraPosition = new THREE.Vector3();
  mapped.camera.getWorldPosition(cameraPosition);
  const near = cameraNear(mapped.camera);
  const far = cameraFar(mapped.camera);
  return [...mapped.objectsById.entries()]
    .flatMap(([id, object]) => {
      const mesh = firstMesh(object);
      if (mesh === undefined) {
        return [];
      }
      const scale = new THREE.Vector3();
      object.getWorldScale(scale);
      const bounds = new THREE.Box3().setFromObject(object);
      const center = new THREE.Vector3();
      const size = new THREE.Vector3();
      const hasBounds = !bounds.isEmpty();
      if (hasBounds) {
        bounds.getCenter(center);
        bounds.getSize(size);
      }
      const cameraDistance = hasBounds ? cameraPosition.distanceTo(center) : undefined;
      return [{
        ...(cameraDistance === undefined ? {} : { cameraDistance: roundMetric(cameraDistance) }),
        ...(cameraDistance === undefined || near === undefined || far === undefined ? {} : { clipping: clippingState(cameraDistance, near, far) }),
        finalScale: vectorToTuple(scale),
        id,
        material: materialDiagnostics(mesh.material),
        ...(hasBounds ? { projectedBounds: projectedBounds(bounds, mapped.camera) } : {}),
        visible: visibleInHierarchy(mesh),
        ...(hasBounds ? { worldBounds: { center: vectorToTuple(center), max: vectorToTuple(bounds.max), min: vectorToTuple(bounds.min), size: vectorToTuple(size) } } : {}),
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function firstMesh(object: THREE.Object3D): THREE.Mesh | undefined {
  if (object instanceof THREE.Mesh) {
    return object;
  }
  let mesh: THREE.Mesh | undefined;
  object.traverse((child) => {
    if (mesh === undefined && child instanceof THREE.Mesh) {
      mesh = child;
    }
  });
  return mesh;
}

function materialDiagnostics(material: THREE.Material | THREE.Material[]): IWebRenderedEntityDiagnostics["material"] {
  const first = Array.isArray(material) ? material[0] : material;
  if (first === undefined) {
    return undefined;
  }
  const maybeTextured = first as THREE.Material & { map?: { image?: unknown } | null };
  return {
    ...(maybeTextured.map === undefined || maybeTextured.map === null ? {} : { textureLoaded: maybeTextured.map.image !== undefined }),
    transparent: first.transparent,
    type: first.type,
  };
}

function projectedBounds(bounds: THREE.Box3, camera: THREE.Camera): IWebRenderedEntityDiagnostics["projectedBounds"] {
  const corners = [
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
  ].map((corner) => corner.project(camera));
  return {
    max: [roundMetric(Math.max(...corners.map((corner) => corner.x))), roundMetric(Math.max(...corners.map((corner) => corner.y)))],
    min: [roundMetric(Math.min(...corners.map((corner) => corner.x))), roundMetric(Math.min(...corners.map((corner) => corner.y)))],
  };
}

function clippingState(distance: number, near: number, far: number): IWebRenderedEntityDiagnostics["clipping"] {
  if (distance < near) {
    return "before-near";
  }
  if (distance > far) {
    return "beyond-far";
  }
  return "in-range";
}

function visibleWorldBounds(scene: THREE.Scene): IWebRuntimeDiagnostics["scene"]["worldBounds"] | undefined {
  const bounds = new THREE.Box3();
  let hasBounds = false;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !visibleInHierarchy(object)) {
      return;
    }
    const meshBounds = new THREE.Box3().setFromObject(object);
    if (meshBounds.isEmpty()) {
      return;
    }
    bounds.union(meshBounds);
    hasBounds = true;
  });
  if (!hasBounds || bounds.isEmpty()) {
    return undefined;
  }
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  bounds.getCenter(center);
  bounds.getSize(size);
  return {
    center: vectorToTuple(center),
    max: vectorToTuple(bounds.max),
    min: vectorToTuple(bounds.min),
    radius: roundMetric(size.length() / 2),
    size: vectorToTuple(size),
  };
}

function visibleInHierarchy(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

function cameraType(camera: THREE.Camera): "orthographic" | "perspective" | "unknown" {
  if (camera instanceof THREE.PerspectiveCamera) {
    return "perspective";
  }
  if (camera instanceof THREE.OrthographicCamera) {
    return "orthographic";
  }
  return "unknown";
}

function cameraNear(camera: THREE.Camera): number | undefined {
  if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
    return camera.near;
  }
  return undefined;
}

function cameraFar(camera: THREE.Camera): number | undefined {
  if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
    return camera.far;
  }
  return undefined;
}

function isResourceFailureDiagnostic(diagnostic: IRuntimeDiagnostic): boolean {
  return /ASSET|LOAD|RESOURCE|REFERENCE/.test(diagnostic.code);
}

function vectorToTuple(vector: THREE.Vector3): [number, number, number] {
  return [roundMetric(vector.x), roundMetric(vector.y), roundMetric(vector.z)];
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function assertSceneReady(diagnostics: readonly IRuntimeDiagnostic[]): void {
  const fatal = diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (fatal !== undefined) {
    throw new Error(`${fatal.code}: ${fatal.message}`);
  }
}

function audioEvents(events: Record<string, unknown>): Array<{ event: string; payload: unknown }> {
  return Object.entries(events).flatMap(([event, payloads]) =>
    Array.isArray(payloads)
      ? payloads.map((payload) => ({ event, payload }))
      : [{ event, payload: payloads }],
  );
}

export function webRendererParameters(config?: IRuntimeConfigIr): THREE.WebGLRendererParameters {
  const antialias = config?.renderer?.antialias;
  return {
    antialias: antialias === undefined || antialias === "msaa2" || antialias === "msaa4" || antialias === "msaa8",
    preserveDrawingBuffer: true,
  };
}

export function webBloomSettings(config?: IRuntimeConfigIr): IWebBloomSettings {
  const renderLook = applyWebRenderLookProfile(config);
  const bloom = config?.renderer?.bloom;
  return {
    enabled: bloom?.enabled ?? renderLook.bloom?.enabled ?? false,
    intensity: bloom?.intensity ?? renderLook.bloom?.intensity ?? 0.15,
    threshold: bloom?.threshold ?? renderLook.bloom?.threshold ?? 0,
  };
}

export function webDepthOfFieldSettings(config?: IRuntimeConfigIr): IWebDepthOfFieldSettings {
  const depthOfField = config?.renderer?.depthOfField;
  return {
    aperture: depthOfField?.aperture ?? 0.02,
    enabled: depthOfField?.enabled ?? false,
    focusDistance: depthOfField?.focusDistance ?? 8,
    maxBlur: depthOfField?.maxBlur ?? 0.01,
  };
}

export function webMotionBlurSettings(config?: IRuntimeConfigIr): IWebMotionBlurSettings {
  const motionBlur = config?.renderer?.motionBlur;
  return {
    enabled: motionBlur?.enabled ?? false,
    shutterAngle: motionBlur?.shutterAngle ?? 0.5,
  };
}

export function webScreenSpaceReflectionsSettings(config?: IRuntimeConfigIr): IWebScreenSpaceReflectionsSettings {
  const reflections = config?.renderer?.screenSpaceReflections;
  const roughnessLimit = reflections?.roughnessLimit ?? 0.45;
  return {
    enabled: reflections?.enabled ?? false,
    opacity: webScreenSpaceReflectionOpacity(reflections?.quality, roughnessLimit),
    roughnessLimit,
  };
}

export function webAmbientOcclusionSettings(config?: IRuntimeConfigIr): IWebAmbientOcclusionSettings {
  const ambientOcclusion = config?.renderer?.ambientOcclusion;
  const radius = ambientOcclusion?.radius ?? 3;
  const intensity = ambientOcclusion?.intensity ?? 1;
  return {
    enabled: ambientOcclusion?.enabled ?? false,
    intensity,
    kernelSize: ambientOcclusionKernelSize(ambientOcclusion?.quality),
    maxDistance: Number(Math.max(0.02, Math.min(1.6, radius * 0.1 * intensity)).toFixed(6)),
    minDistance: 0.005,
    radius,
  };
}

function webColorGradingSettings(config?: IRuntimeConfigIr): NonNullable<NonNullable<IRuntimeConfigIr["renderer"]>["colorGrading"]> | undefined {
  return config?.renderer?.colorGrading ?? applyWebRenderLookProfile(config).colorGrading;
}

function needsColorGradingPass(colorGrading: NonNullable<NonNullable<IRuntimeConfigIr["renderer"]>["colorGrading"]> | undefined): boolean {
  if (colorGrading === undefined) {
    return false;
  }
  return (colorGrading.contrast ?? 0) !== 0 || (colorGrading.saturation ?? 1) !== 1;
}

export interface IRenderPassRecord {
  cameraId: string;
  clear?: ICameraClear;
  viewport?: { height: number; width: number; x: number; y: number };
}

export function createRenderedParticleObjects(assets: IAssetsManifest, elapsedSeconds = 1): THREE.Points[] {
  const particles: THREE.Points[] = [];
  for (const asset of assets.assets) {
    if (asset.kind !== "model") {
      continue;
    }
    for (const emitter of asset.particleEmitters ?? []) {
      const count = renderedParticleCount(emitter.maxParticles, emitter.ratePerSecond, elapsedSeconds);
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        const point = particlePosition(`${asset.id}:${emitter.id}`, index, emitter.shape, emitter.radius ?? 0.25);
        positions[index * 3] = point[0];
        positions[index * 3 + 1] = point[1];
        positions[index * 3 + 2] = point[2];
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color: "#f6c36a",
        opacity: 0.82,
        size: 0.08,
        transparent: true,
      });
      const object = new THREE.Points(geometry, material);
      object.name = `particle.${asset.id}.${emitter.id}`;
      object.userData.threeNativeParticleEmitter = {
        asset: asset.id,
        count,
        id: emitter.id,
        lifetimeSeconds: emitter.lifetimeSeconds,
        maxParticles: emitter.maxParticles,
        shape: emitter.shape,
      };
      particles.push(object);
    }
  }
  return particles.sort((left, right) => left.name.localeCompare(right.name));
}

function sortCameraViews(views: readonly ICameraViewPlan[]): ICameraViewPlan[] {
  return [...views].sort((left, right) => {
    if (left.targetKind !== right.targetKind) {
      return left.targetKind !== "backbuffer" ? -1 : 1;
    }
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.entityId.localeCompare(right.entityId);
  });
}

function clearColorForMode(clear: ICameraClear | undefined, fallback: THREE.Color): THREE.Color {
  if (clear?.mode === "color" && clear.color !== undefined) {
    if (typeof clear.color === "string") {
      return new THREE.Color(clear.color);
    }
    return new THREE.Color(clear.color[0], clear.color[1], clear.color[2]);
  }
  return fallback;
}

export function renderCameraViews(
  renderer: THREE.WebGLRenderer,
  mapped: IThreeWorld,
  world: IWorldIr,
  delta = 0,
  renderTargets?: IRenderTargetRegistry,
): IRenderPassRecord[] {
  const registry = renderTargets ?? mapped.renderTargets;
  if (registry !== undefined) {
    renderTargetCameraPasses(renderer, mapped, world, registry, delta);
  } else {
    updateCameraHelpers(world, mapped.objectsById, delta);
  }
  const renderWidth = renderer.domElement.width;
  const renderHeight = renderer.domElement.height;
  const views = sortCameraViews(
    mapped.cameraViews.length > 0
      ? mapped.cameraViews
      : [{ cameraId: "primary", clear: undefined, entityId: "primary", layers: ["default"], order: 0, targetKind: "backbuffer" }],
  );
  const records: IRenderPassRecord[] = [];
  const previousAutoClear = renderer.autoClear;
  const previousScissor = renderer.getScissorTest();
  const sceneBackground = mapped.scene.background instanceof THREE.Color ? mapped.scene.background : new THREE.Color("#111318");

  for (const view of views) {
    if (view.targetKind === "texture" || view.targetKind === "depth") {
      continue;
    }
    const camera = view.entityId === "primary" ? mapped.camera : mapped.cameras.get(view.entityId) ?? mapped.camera;
    const viewport = view.viewport === undefined
      ? { x: 0, y: 0, width: renderWidth, height: renderHeight }
      : viewportToPhysical(view.viewport, renderWidth, renderHeight);
    updateCameraProjection(camera, viewport.width, viewport.height, view.entityId === "primary" ? undefined : world.entities.find((entity) => entity.id === view.entityId)?.components.Camera);
    renderer.setScissorTest(true);
    renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
    renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
    const clear = view.clear;
    if (clear?.mode === "none") {
      renderer.autoClear = false;
    } else {
      renderer.autoClear = true;
      renderer.setClearColor(clearColorForMode(clear, sceneBackground));
    }
    renderer.render(mapped.scene, camera);
    records.push({
      cameraId: view.entityId,
      clear,
      viewport,
    });
  }

  renderer.autoClear = previousAutoClear;
  renderer.setScissorTest(previousScissor);
  renderer.setViewport(0, 0, renderWidth, renderHeight);
  renderer.setScissor(0, 0, renderWidth, renderHeight);
  return records;
}

function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  mapped: IThreeWorld,
  world: IWorldIr,
  config?: IRuntimeConfigIr,
  assets?: IWebBundle["assets"],
  materials?: IMaterialsIr,
): IRenderPipeline {
  const renderTargets = assets === undefined ? undefined : createRenderTargetRegistry(assets, renderer);
  if (renderTargets !== undefined) {
    mapped.renderTargets = renderTargets;
    bindRenderTargetTextures(mapped, renderTargets, materials?.materials ?? []);
  }
  const bloom = webBloomSettings(config);
  const ambientOcclusion = webAmbientOcclusionSettings(config);
  const depthOfField = webDepthOfFieldSettings(config);
  const motionBlur = webMotionBlurSettings(config);
  const screenSpaceReflections = webScreenSpaceReflectionsSettings(config);
  const colorGrading = webColorGradingSettings(config);
  const backbufferViews = mapped.cameraViews.filter((view) => view.targetKind === "backbuffer");
  const useComposer = backbufferViews.length <= 1 && (bloom.enabled || ambientOcclusion.enabled || depthOfField.enabled || motionBlur.enabled || screenSpaceReflections.enabled || needsColorGradingPass(colorGrading));
  if (!useComposer) {
    return {
      render: (delta = 0) => {
        renderCameraViews(renderer, mapped, world, delta, renderTargets);
      },
      setSize: () => undefined,
    };
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(mapped.scene, mapped.camera));
  if (ambientOcclusion.enabled) {
    composer.addPass(createAmbientOcclusionPass(mapped.scene, mapped.camera, ambientOcclusion));
  }
  if (depthOfField.enabled) {
    composer.addPass(createDepthOfFieldPass(mapped.scene, mapped.camera, depthOfField));
  }
  if (motionBlur.enabled) {
    composer.addPass(createMotionBlurPass(motionBlur));
  }
  if (screenSpaceReflections.enabled) {
    composer.addPass(createScreenSpaceReflectionsPass(screenSpaceReflections));
  }
  if (bloom.enabled) {
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), webBloomPassStrength(bloom.intensity), 0, bloom.threshold));
  }
  if (colorGrading !== undefined && needsColorGradingPass(colorGrading)) {
    composer.addPass(colorGradingPass(colorGrading));
  }
  composer.addPass(new OutputPass());
  const composerClear = backbufferViews[0]?.clear;
  return {
    // The composer path bypasses renderCameraViews, so camera helpers
    // (follow/orbit/view-model/shake) and camera clear must still advance here.
    render: (delta = 0) => {
      updateCameraHelpers(world, mapped.objectsById, delta);
      const previousBackground = mapped.scene.background;
      if (composerClear?.mode === "color") {
        mapped.scene.background = clearColorForMode(composerClear, new THREE.Color("#111318"));
      }
      try {
        composer.render();
      } finally {
        mapped.scene.background = previousBackground;
      }
    },
    setSize: (width, height) => composer.setSize(width, height),
  };
}

function webBloomPassStrength(intensity: number): number {
  return intensity * 0.35;
}

function createDepthOfFieldPass(scene: THREE.Scene, camera: THREE.Camera, settings: IWebDepthOfFieldSettings): BokehPass {
  return new BokehPass(scene, camera, {
    aperture: settings.aperture,
    focus: settings.focusDistance,
    maxblur: settings.maxBlur,
  });
}

function createMotionBlurPass(settings: IWebMotionBlurSettings): TemporalMotionBlurPass {
  return new TemporalMotionBlurPass(webMotionBlurBlend(settings.shutterAngle));
}

function webMotionBlurBlend(shutterAngle: number): number {
  return Math.max(0, Math.min(0.85, shutterAngle * 0.45));
}

function createScreenSpaceReflectionsPass(settings: IWebScreenSpaceReflectionsSettings): ShaderPass {
  return new ShaderPass({
    uniforms: {
      opacity: { value: settings.opacity },
      roughnessLimit: { value: settings.roughnessLimit },
      tDiffuse: { value: null },
    },
    vertexShader: fullscreenVertexShader(),
    fragmentShader: `
      uniform float opacity;
      uniform float roughnessLimit;
      uniform sampler2D tDiffuse;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        float floorMask = smoothstep(0.42, 0.54, vUv.y) * (1.0 - smoothstep(0.72, 0.9, vUv.y));
        vec2 reflectedUv = vec2(vUv.x, clamp(vUv.y - 0.45, 0.0, 1.0));
        vec4 reflected = texture2D(tDiffuse, reflectedUv);
        float fade = floorMask * smoothstep(0.0, 0.6, roughnessLimit);
        gl_FragColor = mix(color, reflected, opacity * fade);
      }
    `,
  });
}

function webScreenSpaceReflectionOpacity(
  quality: NonNullable<NonNullable<IRuntimeConfigIr["renderer"]>["screenSpaceReflections"]>["quality"] | undefined,
  roughnessLimit: number,
): number {
  const qualityScale = quality === "high" ? 1.1 : quality === "low" ? 0.32 : 0.6;
  return Math.max(0, Math.min(0.65, qualityScale * Math.max(0, Math.min(1, roughnessLimit))));
}

function createAmbientOcclusionPass(scene: THREE.Scene, camera: THREE.Camera, settings: IWebAmbientOcclusionSettings): GTAOPass {
  const pass = new GTAOPass(scene, camera, 1, 1);
  pass.blendIntensity = webAmbientOcclusionStrength(settings.intensity);
  pass.updateGtaoMaterial({
    radius: webAmbientOcclusionRadius(settings.radius),
    samples: Math.max(4, Math.floor(settings.kernelSize / 4)),
  });
  pass.updatePdMaterial({
    radius: Math.max(1, Math.round(settings.radius * 2)),
  });
  pass.output = GTAOPass.OUTPUT.Default;
  return pass;
}

function webAmbientOcclusionStrength(intensity: number): number {
  return Math.max(0, Math.min(0.05, intensity * 0.008));
}

class TemporalMotionBlurPass extends Pass {
  private readonly copyMaterial: THREE.ShaderMaterial;
  private hasPrevious = false;
  private readonly blendMaterial: THREE.ShaderMaterial;
  private previousTarget: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly uniforms: {
    previousWeight: { value: number };
    tCurrent: { value: THREE.Texture | null };
    tPrevious: { value: THREE.Texture | null };
  };

  public constructor(private readonly previousWeight: number) {
    super();
    this.uniforms = {
      previousWeight: { value: previousWeight },
      tCurrent: { value: null },
      tPrevious: { value: null },
    };
    this.blendMaterial = new THREE.ShaderMaterial({
      name: "ThreeNativeTemporalMotionBlur",
      uniforms: this.uniforms,
      vertexShader: fullscreenVertexShader(),
      fragmentShader: `
        uniform sampler2D tCurrent;
        uniform sampler2D tPrevious;
        uniform float previousWeight;
        varying vec2 vUv;

        void main() {
          vec4 currentColor = texture2D(tCurrent, vUv);
          vec4 previousColor = texture2D(tPrevious, vUv);
          gl_FragColor = mix(currentColor, previousColor, previousWeight);
        }
      `,
    });
    this.copyMaterial = new THREE.ShaderMaterial({
      name: "ThreeNativeTemporalMotionBlurCopy",
      uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
      vertexShader: fullscreenVertexShader(),
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;

        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
    });
    this.previousTarget = createMotionBlurRenderTarget(1, 1);
    this.quad = new FullScreenQuad(this.blendMaterial);
  }

  public override setSize(width: number, height: number): void {
    this.previousTarget.setSize(width, height);
    this.hasPrevious = false;
  }

  public override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tCurrent.value = readBuffer.texture;
    this.uniforms.tPrevious.value = this.previousTarget.texture;
    this.uniforms.previousWeight.value = this.hasPrevious ? this.previousWeight : 0;
    this.quad.material = this.blendMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) {
      renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    }
    this.quad.render(renderer);

    const copyUniforms = this.copyMaterial.uniforms as { tDiffuse: { value: THREE.Texture | null } };
    copyUniforms.tDiffuse.value = (this.renderToScreen ? readBuffer : writeBuffer).texture;
    this.quad.material = this.copyMaterial;
    renderer.setRenderTarget(this.previousTarget);
    this.quad.render(renderer);
    this.quad.material = this.blendMaterial;
    this.hasPrevious = true;
  }

  public override dispose(): void {
    this.previousTarget.dispose();
    this.blendMaterial.dispose();
    this.copyMaterial.dispose();
    this.quad.dispose();
  }
}

function createMotionBlurRenderTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    stencilBuffer: false,
  });
  target.texture.name = "ThreeNativeTemporalMotionBlur.previous";
  return target;
}

function fullscreenVertexShader(): string {
  return `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;
}

function webAmbientOcclusionRadius(radius: number): number {
  return Math.max(0.05, Math.min(0.6, radius * 0.08));
}

function ambientOcclusionKernelSize(quality: NonNullable<NonNullable<IRuntimeConfigIr["renderer"]>["ambientOcclusion"]>["quality"] | undefined): number {
  if (quality === "high") {
    return 64;
  }
  if (quality === "low") {
    return 16;
  }
  return 32;
}

function colorGradingPass(colorGrading: NonNullable<NonNullable<IRuntimeConfigIr["renderer"]>["colorGrading"]>): ShaderPass {
  const pass = new ShaderPass({
    uniforms: {
      contrast: { value: colorGrading.contrast ?? 0 },
      saturation: { value: colorGrading.saturation ?? 1 },
      tDiffuse: { value: null },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float contrast;
      uniform float saturation;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        color.rgb = mix(vec3(luminance), color.rgb, saturation);
        color.rgb = (color.rgb - 0.5) * (1.0 + contrast) + 0.5;
        gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
      }
    `,
  });
  return pass;
}

function renderedParticleCount(maxParticles: number, ratePerSecond: number, elapsedSeconds: number): number {
  if (!Number.isFinite(maxParticles) || !Number.isFinite(ratePerSecond) || !Number.isFinite(elapsedSeconds) || maxParticles <= 0 || ratePerSecond <= 0 || elapsedSeconds <= 0) {
    return 0;
  }
  return Math.min(Math.floor(maxParticles), Math.floor(ratePerSecond * elapsedSeconds));
}

function particlePosition(seed: string, index: number, shape: string, radius: number): [number, number, number] {
  const x = seededUnit(seed, index, 0) * 2 - 1;
  const y = seededUnit(seed, index, 1);
  const z = seededUnit(seed, index, 2) * 2 - 1;
  if (shape === "sphere") {
    const length = Math.hypot(x, y, z) || 1;
    return [
      Number(((x / length) * radius).toFixed(6)),
      Number(((y / length) * radius).toFixed(6)),
      Number(((z / length) * radius).toFixed(6)),
    ];
  }
  return [Number((x * 0.05).toFixed(6)), Number((y * 0.2).toFixed(6)), Number((z * 0.05).toFixed(6))];
}

function seededUnit(seed: string, index: number, channel: number): number {
  let hash = 2166136261;
  const input = `${seed}:${index}:${channel}`;
  for (let offset = 0; offset < input.length; offset += 1) {
    hash ^= input.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function prepareRenderContainer(container: HTMLElement): void {
  const style = getComputedStyle(container);
  if (style.position === "static") {
    container.style.position = "relative";
  }
}

export function applyRendererColorManagement(
  renderer: THREE.WebGLRenderer,
  colorManagement: IAtmosphereProfileIr["colorManagement"] | undefined,
  colorGrading?: NonNullable<NonNullable<IRuntimeConfigIr["renderer"]>["colorGrading"]>,
): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const toneMapping = colorGrading?.toneMapping ?? colorManagement?.toneMapping;
  const exposure = colorGrading?.exposure ?? colorManagement?.exposure;
  if (toneMapping === undefined && exposure === undefined) {
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    return;
  }
  renderer.toneMapping = toneMapping === "aces" ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = exposure ?? 1;
}

export function applyRendererShadowSettings(renderer: THREE.WebGLRenderer, config?: IRuntimeConfigIr): void {
  const quality = resolveRenderLookProfile(config?.renderer?.renderLook, "desktop-web").shadowQuality;
  renderer.shadowMap.enabled = quality !== "off";
  if (quality === "high") {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return;
  }
  if (quality === "medium") {
    renderer.shadowMap.type = THREE.PCFShadowMap;
    return;
  }
  renderer.shadowMap.type = THREE.BasicShadowMap;
}

export function applyRenderLookSceneDefaults(
  scene: THREE.Scene,
  renderLook: { appliedProfile: RenderLookProfileName },
): void {
  if (renderLook.appliedProfile === "parity") {
    return;
  }
  if (scene.background instanceof THREE.Color && scene.background.getHexString() === "111318") {
    scene.background = new THREE.Color(renderLook.appliedProfile === "cinematic" ? "#8fb6d8" : "#38bdf8");
  }
  let hasLight = false;
  scene.traverse((object) => {
    if (object instanceof THREE.Light) {
      hasLight = true;
    }
  });
  if (hasLight) {
    return;
  }
  const ambient = new THREE.AmbientLight(renderLook.appliedProfile === "cinematic" ? "#c9ddff" : "#dce8ff", renderLook.appliedProfile === "stylized" ? 0.75 : 0.65);
  ambient.name = `renderLook.${renderLook.appliedProfile}.ambientFill`;
  const key = new THREE.DirectionalLight(renderLook.appliedProfile === "stylized" ? "#fff6a8" : "#fff2d0", renderLook.appliedProfile === "cinematic" ? 1.35 : 1.1);
  key.name = `renderLook.${renderLook.appliedProfile}.keyLight`;
  key.position.set(-2.5, 4, 3);
  scene.add(ambient, key);
}

function resizeRenderer(renderer: THREE.WebGLRenderer, pipeline: IRenderPipeline, mapped: IThreeWorld, container: HTMLElement): void {
  const width = Math.max(1, container.clientWidth || window.innerWidth || 800);
  const height = Math.max(1, container.clientHeight || window.innerHeight || 600);
  renderer.setSize(width, height, false);
  pipeline.setSize(width, height);

  updateCameraProjection(mapped.camera, width, height);
  for (const [entityId, camera] of mapped.cameras.entries()) {
    const view = mapped.cameraViews.find((entry) => entry.entityId === entityId);
    const viewport = view?.viewport;
    if (viewport === undefined) {
      updateCameraProjection(camera, width, height);
      continue;
    }
    const physical = viewportToPhysical(viewport, width, height);
    updateCameraProjection(camera, physical.width, physical.height);
  }
}
