import { useEffect, useRef } from "react";
import * as THREE from "three";

import type { IEditorSceneObject } from "../adapters/editorModel.js";

export interface IEditorViewport3dProps {
  objects: readonly IEditorSceneObject[];
  onSelectObject?: (rowId: string) => void;
  selectedRowId?: string;
}

export function EditorViewport3d({ objects, onSelectObject, selectedRowId }: IEditorViewport3dProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectObject);
  onSelectRef.current = onSelectObject;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#075015");

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(-5.8, 4.3, 6.2);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight("#cbe8ff", "#244b18", 2.3);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight("#fff2dc", 3.2);
    sun.position.set(4, 7, 5);
    sun.castShadow = true;
    scene.add(sun);

    const grid = new THREE.GridHelper(22, 22, "#243226", "#18331c");
    grid.position.y = -0.01;
    scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: "#075d18", roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const root = new THREE.Group();
    scene.add(root);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const selectables: THREE.Object3D[] = [];
    const objectByRowId = new Map<string, THREE.Object3D>();
    let selection: THREE.BoxHelper | undefined;
    const axes = new THREE.AxesHelper(1.2);
    axes.visible = false;
    scene.add(axes);

    const rebuildObjects = () => {
      root.clear();
      selectables.length = 0;
      objectByRowId.clear();
      for (const sourceObject of objects) {
        const object = createSceneObject(sourceObject);
        object.userData.rowId = sourceObject.rowId;
        root.add(object);
        objectByRowId.set(sourceObject.rowId, object);
        if (sourceObject.kind !== "camera") {
          selectables.push(object);
        }
      }
    };

    const updateSelection = () => {
      if (selection !== undefined) {
        scene.remove(selection);
        selection.dispose();
        selection = undefined;
      }
      const selected = selectedRowId === undefined ? undefined : objectByRowId.get(selectedRowId);
      axes.visible = selected !== undefined;
      if (selected === undefined) {
        return;
      }
      selection = new THREE.BoxHelper(selected, "#ff7a24");
      scene.add(selection);
      const worldPosition = new THREE.Vector3();
      selected.getWorldPosition(worldPosition);
      axes.position.copy(worldPosition).add(new THREE.Vector3(0, 0.65, 0));
    };

    const selectFromPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(selectables, true)[0]?.object;
      const owner = hit === undefined ? undefined : findSelectableOwner(hit);
      const rowId = owner?.userData.rowId;
      if (typeof rowId === "string") {
        onSelectRef.current?.(rowId);
      }
    };

    rebuildObjects();
    updateSelection();
    renderer.domElement.addEventListener("pointerdown", selectFromPointer);

    let frame = 0;
    let animation = 0;
    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const render = () => {
      frame += 0.01;
      for (const object of selectables) {
        object.rotation.y += Math.sin(frame) * 0.0006;
      }
      if (selection !== undefined) {
        selection.update();
      }
      renderer.render(scene, camera);
      animation = window.requestAnimationFrame(render);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    render();

    return () => {
      window.cancelAnimationFrame(animation);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", selectFromPointer);
      host.removeChild(renderer.domElement);
      disposeScene(scene);
      renderer.dispose();
    };
  }, [objects, selectedRowId]);

  return <div className="tn-editor-viewport-canvas" ref={hostRef} />;
}

function createSceneObject(sourceObject: IEditorSceneObject): THREE.Object3D {
  const object = sourceObject.primitive === "camera" ? createCameraGlyph() : new THREE.Mesh(geometryFor(sourceObject), materialFor(sourceObject));
  object.name = sourceObject.id;
  const [x, y, z] = sourceObject.position ?? [0, defaultY(sourceObject), 0];
  object.position.set(x, y, z);
  const [rx, ry, rz] = sourceObject.rotation ?? [0, 0, 0];
  object.rotation.set(rx, ry, rz);
  const [sx, sy, sz] = sourceObject.scale ?? [1, 1, 1];
  object.scale.set(sx, sy, sz);
  object.traverse((child) => {
    child.userData.rowId = sourceObject.rowId;
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return object;
}

function geometryFor(sourceObject: IEditorSceneObject): THREE.BufferGeometry {
  switch (sourceObject.primitive) {
    case "capsule":
      return new THREE.CapsuleGeometry(0.35, 0.75, 8, 16);
    case "cylinder":
      return new THREE.CylinderGeometry(0.42, 0.42, 0.9, 24);
    case "plane":
      return new THREE.PlaneGeometry(1.8, 1.8);
    case "sphere":
      return new THREE.SphereGeometry(0.48, 32, 16);
    case "box":
    default:
      return new THREE.BoxGeometry(0.9, 0.9, 0.9);
  }
}

function materialFor(sourceObject: IEditorSceneObject): THREE.Material {
  return new THREE.MeshStandardMaterial({
    color: sourceObject.color ?? "#2f80ed",
    metalness: 0.05,
    roughness: 0.65,
  });
}

function createCameraGlyph(): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: "#f5fbff" });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.18), material);
  const lens = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.32, 24), material);
  lens.rotation.z = Math.PI / 2;
  lens.position.x = 0.34;
  const reelA = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8), material);
  reelA.position.set(-0.12, 0.2, 0);
  const reelB = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8), material);
  reelB.position.set(0.16, 0.2, 0);
  group.add(body, lens, reelA, reelB);
  return group;
}

function defaultY(sourceObject: IEditorSceneObject): number {
  return sourceObject.primitive === "plane" ? 0 : 0.45;
}

function findSelectableOwner(object: THREE.Object3D): THREE.Object3D | undefined {
  let candidate: THREE.Object3D | null = object;
  while (candidate !== null) {
    if (typeof candidate.userData.rowId === "string") {
      return candidate;
    }
    candidate = candidate.parent;
  }
  return undefined;
}

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        material.dispose();
      }
    }
  });
}
