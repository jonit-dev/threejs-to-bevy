import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { IAssetsManifest, IAtmosphereProfileIr, ICameraClear, IMaterialsIr, IRuntimeConfigIr, IWorldIr } from "@threenative/ir";
import { loadBundle, type IWebBundle } from "./loadBundle.js";
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
import { advanceAnimationPlayback, hasAnimationPlayback, loadPendingMaterialTextures, loadWorldModelAssets, mapWorld, type IRuntimeDiagnostic, type IThreeWorld } from "./mapWorld.js";
import { applyEnvironmentBookmark, createEnvironmentRuntime, loadEnvironmentAssetInstances } from "./environment.js";
import { applyAtmosphereProfile, applyEnvironmentLighting } from "./rendering.js";
import { createGameLoopState, runGameFrame } from "./gameLoop.js";
import { attachInputListeners, createInputState } from "./input.js";
import { loadSystemModule } from "./systems/runner.js";
import { createSystemEffectLog, type ISystemEffectLog } from "./systems/log.js";
import { createUiDomOverlay } from "./ui/domOverlay.js";
import { renderUi, type IRenderedUi } from "./ui/renderUi.js";
import { createWebAudioElementSink, createWebAudioRuntime } from "./audio.js";
import { createWebOverlayHost, type IWebOverlayHost } from "./overlay/host.js";

export interface IRenderResult {
  canvas: HTMLCanvasElement;
  diagnostics: IRuntimeDiagnostic[];
  dispose(): void;
  effectLog: ISystemEffectLog;
  renderer: THREE.WebGLRenderer;
  overlayHost?: IWebOverlayHost;
  ui?: IRenderedUi;
}

export interface IRenderOptions {
  bookmarkId?: string;
}

export interface IWebBloomSettings {
  enabled: boolean;
  intensity: number;
  threshold: number;
}

export interface IWebDepthOfFieldSettings {
  aperture: number;
  enabled: boolean;
  focusDistance: number;
  maxBlur: number;
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

export async function renderBundle(source: string, container: HTMLElement, options: IRenderOptions = {}): Promise<IRenderResult> {
  const bundle = await loadBundle(source);
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
  if (options.bookmarkId !== undefined) {
    applyEnvironmentBookmark(bundle, mapped.camera, options.bookmarkId);
  }
  const input = createInputState(bundle.input);
  const loopState = createGameLoopState(bundle.runtimeConfig);
  const effectLog = createSystemEffectLog();
  const systemModule = await loadSystemModule(source, bundle.manifest);
  const renderer = new THREE.WebGLRenderer(webRendererParameters(bundle.runtimeConfig));
  applyRendererColorManagement(renderer, bundle.environmentScene?.atmosphere?.colorManagement, bundle.runtimeConfig?.renderer?.colorGrading);
  const pipeline = createRenderPipeline(renderer, mapped, bundle.world, bundle.runtimeConfig, bundle.assets, bundle.materials);
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
      input,
      mapped,
      module: systemModule,
      runtimeConfig: bundle.runtimeConfig,
      state: loopState,
      systems: bundle.systems,
      world: bundle.world,
    });
    uiOverlay?.update();
  }
  advanceAnimationPlayback(mapped, 1 / 60);
  pipeline.render();
  logStartupDiagnostics(mapped.diagnostics);
  let lifecycle: IWebRenderLifecycle | undefined;
  if (bundle.systems !== undefined || hasAnimationPlayback(mapped)) {
    let lastTime = performance.now();
    lifecycle = createWebRenderLifecycle({
      diagnostics: mapped.diagnostics,
      onDispose: () => {
        detachInputListeners();
        renderer.dispose();
      },
      async frame(time: number) {
      const delta = Math.max(0, (time - lastTime) / 1000);
      lastTime = time;
        if (bundle.systems !== undefined) {
          await runGameFrame({
            assets: bundle.assets,
            componentSchemas: bundle.componentSchemas,
            delta,
            effectLog,
            input,
            mapped,
            module: systemModule,
            runtimeConfig: bundle.runtimeConfig,
            state: loopState,
            systems: bundle.systems,
            world: bundle.world,
          });
        }
        advanceAnimationPlayback(mapped, delta);
        uiOverlay?.update();
        pipeline.render(delta);
      },
    });
    lifecycle.schedule();
  }

  return {
    canvas,
    diagnostics: mapped.diagnostics,
    dispose() {
      lifecycle?.dispose();
      if (lifecycle === undefined) {
        detachInputListeners();
        renderer.dispose();
      }
    },
    effectLog,
    ...(overlayHost === undefined ? {} : { overlayHost }),
    renderer,
    ...(ui === undefined ? {} : { ui }),
  };
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
  const bloom = config?.renderer?.bloom;
  return {
    enabled: bloom?.enabled ?? false,
    intensity: bloom?.intensity ?? 0.15,
    threshold: bloom?.threshold ?? 0,
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
  const backbufferViews = mapped.cameraViews.filter((view) => view.targetKind === "backbuffer");
  const useBloom = bloom.enabled && backbufferViews.length <= 1;
  if (!useBloom) {
    return {
      render: (delta = 0) => {
        renderCameraViews(renderer, mapped, world, delta, renderTargets);
      },
      setSize: () => undefined,
    };
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(mapped.scene, mapped.camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), bloom.intensity, 0, bloom.threshold));
  return {
    render: () => composer.render(),
    setSize: (width, height) => composer.setSize(width, height),
  };
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
