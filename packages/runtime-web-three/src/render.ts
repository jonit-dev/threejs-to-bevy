import * as THREE from "three";
import { loadBundle } from "./loadBundle.js";
import { mapWorld, type IRuntimeDiagnostic } from "./mapWorld.js";

export interface IRenderResult {
  canvas: HTMLCanvasElement;
  diagnostics: IRuntimeDiagnostic[];
  renderer: THREE.WebGLRenderer;
}

export async function renderBundle(source: string, container: HTMLElement): Promise<IRenderResult> {
  const bundle = await loadBundle(source);
  const mapped = mapWorld(bundle);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const canvas = renderer.domElement;

  container.replaceChildren(canvas);
  resizeRenderer(renderer, mapped.camera, container);
  renderer.render(mapped.scene, mapped.camera);

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
