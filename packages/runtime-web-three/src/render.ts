import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { IAtmosphereProfileIr, IRuntimeConfigIr } from "@threenative/ir";
import { loadBundle } from "./loadBundle.js";
import { advanceAnimationPlayback, hasAnimationPlayback, loadWorldModelAssets, mapWorld, type IRuntimeDiagnostic } from "./mapWorld.js";
import { applyEnvironmentBookmark, createEnvironmentRuntime, loadEnvironmentAssetInstances } from "./environment.js";
import { applyAtmosphereProfile } from "./rendering.js";
import { createGameLoopState, runGameFrame } from "./gameLoop.js";
import { attachInputListeners, createInputState } from "./input.js";
import { loadSystemModule } from "./systems/runner.js";
import { createSystemEffectLog, type ISystemEffectLog } from "./systems/log.js";
import { createUiDomOverlay } from "./ui/domOverlay.js";
import { renderUi, type IRenderedUi } from "./ui/renderUi.js";
import { createWebAudioElementSink, createWebAudioRuntime } from "./audio.js";

export interface IRenderResult {
  canvas: HTMLCanvasElement;
  diagnostics: IRuntimeDiagnostic[];
  effectLog: ISystemEffectLog;
  renderer: THREE.WebGLRenderer;
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

interface IRenderPipeline {
  render(): void;
  setSize(width: number, height: number): void;
}

export async function renderBundle(source: string, container: HTMLElement, options: IRenderOptions = {}): Promise<IRenderResult> {
  const bundle = await loadBundle(source);
  const mapped = mapWorld(bundle);
  await loadWorldModelAssets(mapped, bundle, source);
  const environment = createEnvironmentRuntime(bundle, { renderPlaceholders: false });
  if (environment !== undefined) {
    applyAtmosphereProfile(mapped.scene, bundle.environmentScene?.atmosphere);
    mapped.scene.add(environment.object);
    const assets = await loadEnvironmentAssetInstances(bundle, source);
    if (assets !== undefined) {
      mapped.scene.add(assets);
    }
    mapped.diagnostics.push(...environment.instancingPlan.diagnostics);
  }
  if (options.bookmarkId !== undefined) {
    applyEnvironmentBookmark(bundle, mapped.camera, options.bookmarkId);
  }
  const input = createInputState(bundle.input);
  const loopState = createGameLoopState(bundle.runtimeConfig);
  const effectLog = createSystemEffectLog();
  const systemModule = await loadSystemModule(source, bundle.manifest);
  const renderer = new THREE.WebGLRenderer(webRendererParameters(bundle.runtimeConfig));
  applyRendererColorManagement(renderer, bundle.environmentScene?.atmosphere?.colorManagement);
  const pipeline = createRenderPipeline(renderer, mapped.scene, mapped.camera, bundle.runtimeConfig);
  const canvas = renderer.domElement;
  const ui = bundle.ui === undefined ? undefined : renderUi(bundle.ui, bundle.world);
  const uiOverlay = ui === undefined ? undefined : createUiDomOverlay(ui);
  if (bundle.audio !== undefined) {
    const audioSink = createWebAudioElementSink(source, bundle.assets);
    const audioRuntime = createWebAudioRuntime(bundle.audio, audioSink);
    audioRuntime.start();
    audioRuntime.handleEvents(audioEvents(bundle.world.events ?? {}));
    mapped.diagnostics.push(...audioSink.diagnostics);
  }

  prepareRenderContainer(container);
  canvas.style.display = "block";
  container.replaceChildren(...([canvas, uiOverlay?.element].filter((child) => child !== undefined) as Node[]));
  attachInputListeners(window, input);
  resizeRenderer(renderer, pipeline, mapped.camera, container);
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
  if (bundle.systems !== undefined || hasAnimationPlayback(mapped)) {
    let lastTime = performance.now();
    const frame = (time: number) => {
      const delta = Math.max(0, (time - lastTime) / 1000);
      lastTime = time;
      const gameFrame = bundle.systems === undefined
        ? Promise.resolve()
        : runGameFrame({
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
      void gameFrame.then(() => {
        advanceAnimationPlayback(mapped, delta);
        uiOverlay?.update();
        pipeline.render();
        requestAnimationFrame(frame);
      });
    };
    requestAnimationFrame(frame);
  }

  return {
    canvas,
    diagnostics: mapped.diagnostics,
    effectLog,
    renderer,
    ...(ui === undefined ? {} : { ui }),
  };
}

function audioEvents(events: Record<string, unknown>): Array<{ event: string; payload: unknown }> {
  return Object.entries(events).flatMap(([event, payloads]) =>
    Array.isArray(payloads)
      ? payloads.map((payload) => ({ event, payload }))
      : [{ event, payload: payloads }],
  );
}

export function webRendererParameters(config?: IRuntimeConfigIr): THREE.WebGLRendererParameters {
  return {
    antialias: config?.renderer?.antialias !== "none",
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

function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  config?: IRuntimeConfigIr,
): IRenderPipeline {
  const bloom = webBloomSettings(config);
  if (!bloom.enabled) {
    return {
      render: () => renderer.render(scene, camera),
      setSize: () => undefined,
    };
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), bloom.intensity, 0, bloom.threshold));
  return {
    render: () => composer.render(),
    setSize: (width, height) => composer.setSize(width, height),
  };
}

function prepareRenderContainer(container: HTMLElement): void {
  const style = getComputedStyle(container);
  if (style.position === "static") {
    container.style.position = "relative";
  }
}

function applyRendererColorManagement(
  renderer: THREE.WebGLRenderer,
  colorManagement: IAtmosphereProfileIr["colorManagement"] | undefined,
): void {
  if (colorManagement === undefined) {
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = colorManagement.toneMapping === "aces" ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = colorManagement.exposure;
}

function resizeRenderer(renderer: THREE.WebGLRenderer, pipeline: IRenderPipeline, camera: THREE.Camera, container: HTMLElement): void {
  const width = Math.max(1, container.clientWidth || window.innerWidth || 800);
  const height = Math.max(1, container.clientHeight || window.innerHeight || 600);
  renderer.setSize(width, height, false);
  pipeline.setSize(width, height);

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  if (camera instanceof THREE.OrthographicCamera) {
    const size = Math.max(camera.top - camera.bottom, 1);
    const halfHeight = size / 2;
    const halfWidth = halfHeight * (width / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  }
}
