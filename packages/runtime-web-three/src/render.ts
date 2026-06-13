import * as THREE from "three";
import { loadBundle } from "./loadBundle.js";
import { mapWorld, type IRuntimeDiagnostic } from "./mapWorld.js";
import { createGameLoopState, runGameFrame } from "./gameLoop.js";
import { attachInputListeners, createInputState } from "./input.js";
import { loadSystemModule } from "./systems/runner.js";

export interface IRenderResult {
  canvas: HTMLCanvasElement;
  diagnostics: IRuntimeDiagnostic[];
  renderer: THREE.WebGLRenderer;
}

export async function renderBundle(source: string, container: HTMLElement): Promise<IRenderResult> {
  const bundle = await loadBundle(source);
  const mapped = mapWorld(bundle);
  const input = createInputState(bundle.input);
  const loopState = createGameLoopState(bundle.runtimeConfig);
  const systemModule = await loadSystemModule(source, bundle.manifest);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const canvas = renderer.domElement;

  container.replaceChildren(canvas);
  attachInputListeners(window, input);
  resizeRenderer(renderer, mapped.camera, container);
  if (bundle.systems !== undefined) {
    await runGameFrame({
      delta: 1 / 60,
      input,
      mapped,
      module: systemModule,
      runtimeConfig: bundle.runtimeConfig,
      state: loopState,
      systems: bundle.systems,
      world: bundle.world,
    });
  }
  renderer.render(mapped.scene, mapped.camera);
  if (bundle.systems !== undefined) {
    let lastTime = performance.now();
    const frame = (time: number) => {
      const delta = Math.max(0, (time - lastTime) / 1000);
      lastTime = time;
      void runGameFrame({
        delta,
        input,
        mapped,
        module: systemModule,
        runtimeConfig: bundle.runtimeConfig,
        state: loopState,
        systems: bundle.systems!,
        world: bundle.world,
      }).then(() => {
        renderer.render(mapped.scene, mapped.camera);
        requestAnimationFrame(frame);
      });
    };
    requestAnimationFrame(frame);
  }

  return {
    canvas,
    diagnostics: mapped.diagnostics,
    renderer,
  };
}

function resizeRenderer(renderer: THREE.WebGLRenderer, camera: THREE.Camera, container: HTMLElement): void {
  const width = Math.max(1, container.clientWidth || window.innerWidth || 800);
  const height = Math.max(1, container.clientHeight || window.innerHeight || 600);
  renderer.setSize(width, height, false);

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}
