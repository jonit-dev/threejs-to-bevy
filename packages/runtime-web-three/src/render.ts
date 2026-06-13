import * as THREE from "three";
import { loadBundle } from "./loadBundle.js";
import { mapWorld, type IRuntimeDiagnostic } from "./mapWorld.js";
import { runGameFrame } from "./gameLoop.js";
import { loadSystemModule } from "./systems/runner.js";

export interface IRenderResult {
  canvas: HTMLCanvasElement;
  diagnostics: IRuntimeDiagnostic[];
  renderer: THREE.WebGLRenderer;
}

export async function renderBundle(source: string, container: HTMLElement): Promise<IRenderResult> {
  const bundle = await loadBundle(source);
  const mapped = mapWorld(bundle);
  const systemModule = await loadSystemModule(source, bundle.manifest);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const canvas = renderer.domElement;

  container.replaceChildren(canvas);
  resizeRenderer(renderer, mapped.camera, container);
  if (bundle.systems !== undefined) {
    await runGameFrame({
      delta: 1 / 60,
      mapped,
      module: systemModule,
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
        mapped,
        module: systemModule,
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
