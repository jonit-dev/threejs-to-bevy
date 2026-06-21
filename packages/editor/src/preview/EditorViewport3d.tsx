import { useEffect, useRef } from "react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import type { IEditorEnvironmentSummary, IEditorSceneObject } from "../adapters/editorModel.js";
import { markViewportSelectionOwner, resolveViewportSelectionOwnerRowId } from "./selectionBridge.js";

export interface IEditorViewport3dProps {
  environment?: IEditorEnvironmentSummary;
  gizmoMode?: EditorViewportGizmoMode;
  objects: readonly IEditorSceneObject[];
  onTransformObject?: (rowId: string, transform: IViewportTransform) => void;
  onSelectObject?: (rowId: string) => void;
  selectedRowId?: string;
}

export type EditorViewportGizmoMode = "rotate" | "scale" | "translate";

export interface IViewportTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export function EditorViewport3d({ environment, gizmoMode = "translate", objects, onSelectObject, onTransformObject, selectedRowId }: IEditorViewport3dProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectObject);
  const onTransformRef = useRef(onTransformObject);
  onSelectRef.current = onSelectObject;
  onTransformRef.current = onTransformObject;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(environment?.skybox === undefined ? "#064812" : "#496d8b");

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(-5.8, 4.3, 6.2);
    camera.lookAt(0, 0.8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight("#cbe8ff", "#244b18", 1.9);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight("#fff2dc", 2.7);
    sun.position.set(4, 7, 5);
    sun.castShadow = true;
    scene.add(sun);

    const grid = new THREE.GridHelper(24, 24, "#1b251f", "#1c2e20");
    grid.position.y = 0.015;
    scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: environment?.terrain === undefined ? "#065214" : "#284f32", roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const root = new THREE.Group();
    scene.add(root);
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/draco/");
    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const selectables: THREE.Object3D[] = [];
    const objectByRowId = new Map<string, THREE.Object3D>();
    const transformPersistableRowIds = new Set<string>();
    let selection: THREE.BoxHelper | undefined;
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode(gizmoMode);
    transformControls.setSize(0.82);
    transformControls.setColors("#ff1f35", "#00ff66", "#155cff", "#ffffff");
    const transformHelper = transformControls.getHelper();
    scene.add(transformHelper);

    const rebuildObjects = () => {
      root.clear();
      selectables.length = 0;
      objectByRowId.clear();
      transformPersistableRowIds.clear();
      for (const sourceObject of objects) {
        const object = createSceneObject(sourceObject, gltfLoader);
        markViewportSelectionOwner(object, sourceObject.rowId);
        root.add(object);
        objectByRowId.set(sourceObject.rowId, object);
        if (isTransformPersistable(sourceObject)) {
          transformPersistableRowIds.add(sourceObject.rowId);
        }
        if (sourceObject.kind !== "camera" && sourceObject.kind !== "light") {
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
      const selectedId = selectedRowId;
      const selected = selectedId === undefined ? undefined : objectByRowId.get(selectedId);
      if (selected === undefined || selectedId === undefined) {
        transformControls.detach();
        return;
      }
      selection = new THREE.BoxHelper(selected, "#ff7a24");
      scene.add(selection);
      if (transformPersistableRowIds.has(selectedId)) {
        transformControls.attach(selected);
      } else {
        transformControls.detach();
      }
    };

    const selectFromPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(selectables, true)[0]?.object;
      const rowId = resolveViewportSelectionOwnerRowId(hit);
      if (typeof rowId === "string") {
        onSelectRef.current?.(rowId);
      }
    };

    const commitTransform = () => {
      const selected = selectedRowId === undefined ? undefined : objectByRowId.get(selectedRowId);
      if (selected === undefined || selectedRowId === undefined || !transformPersistableRowIds.has(selectedRowId)) {
        return;
      }
      onTransformRef.current?.(selectedRowId, readTransform(selected));
    };

    rebuildObjects();
    updateSelection();
    renderer.domElement.addEventListener("pointerdown", selectFromPointer);
    transformControls.addEventListener("mouseUp", commitTransform);

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
      transformControls.update(1 / 60);
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
      transformControls.removeEventListener("mouseUp", commitTransform);
      transformControls.detach();
      transformHelper.dispose();
      host.removeChild(renderer.domElement);
      disposeScene(scene);
      dracoLoader.dispose();
      renderer.dispose();
    };
  }, [environment, gizmoMode, objects, selectedRowId]);

  return <div className="tn-editor-viewport-canvas" ref={hostRef} />;
}

function createSceneObject(sourceObject: IEditorSceneObject, loader: GLTFLoader): THREE.Object3D {
  const object = createRenderableObject(sourceObject, loader);
  object.name = sourceObject.id;
  const [x, y, z] = sourceObject.position ?? [0, defaultY(sourceObject), 0];
  object.position.set(x, y, z);
  const [rx, ry, rz] = sourceObject.rotation ?? [0, 0, 0];
  object.rotation.set(rx, ry, rz);
  const [sx, sy, sz] = sourceObject.scale ?? [1, 1, 1];
  object.scale.set(sx, sy, sz);
  object.traverse((child) => {
    markViewportSelectionOwner(child, sourceObject.rowId);
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return object;
}

function isTransformPersistable(sourceObject: IEditorSceneObject): boolean {
  return sourceObject.documentPath !== undefined || sourceObject.sourcePath !== undefined;
}

function readTransform(object: THREE.Object3D): IViewportTransform {
  return {
    position: vectorTuple(object.position),
    rotation: vectorTuple(object.rotation),
    scale: vectorTuple(object.scale),
  };
}

function vectorTuple(value: THREE.Euler | THREE.Vector3): [number, number, number] {
  return [roundTransformValue(value.x), roundTransformValue(value.y), roundTransformValue(value.z)];
}

function roundTransformValue(value: number): number {
  return Number(value.toFixed(4));
}

function createRenderableObject(sourceObject: IEditorSceneObject, loader: GLTFLoader): THREE.Object3D {
  const label = sourceObject.label.toLowerCase();
  if (sourceObject.kind === "camera") {
    return createCameraGlyph();
  }
  if (sourceObject.kind === "light") {
    return createLightGlyph();
  }
  if (sourceObject.assetPath?.endsWith(".glb") === true || sourceObject.assetPath?.endsWith(".gltf") === true) {
    return createModelObject(sourceObject, loader);
  }
  if (label.includes("farm_house")) {
    return createHouse();
  }
  if (label.includes("base_basic") || label.includes("tree")) {
    return createTree();
  }
  if (label.includes("terrain")) {
    return new THREE.Mesh(new THREE.PlaneGeometry(24, 24), materialFor(sourceObject));
  }
  return new THREE.Mesh(geometryFor(sourceObject), materialFor(sourceObject));
}

function createModelObject(sourceObject: IEditorSceneObject, loader: GLTFLoader): THREE.Group {
  const group = new THREE.Group();
  group.add(createFallbackModelPlaceholder(sourceObject));
  const assetPath = sourceObject.assetPath;
  if (assetPath === undefined) {
    return group;
  }
  loader.load(
    `/project-assets/${encodeURIComponent(assetPath).replaceAll("%2F", "/")}`,
    (gltf) => {
      group.clear();
      const model = gltf.scene;
      model.traverse((child) => {
        markViewportSelectionOwner(child, sourceObject.rowId);
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      normalizeModelForEditor(model, sourceObject);
      group.add(model);
      markLoadedModel(assetPath);
    },
    undefined,
    (error) => markModelError(assetPath, error),
  );
  return group;
}

function createFallbackModelPlaceholder(sourceObject: IEditorSceneObject): THREE.Object3D {
  return sourceObject.label.toLowerCase().includes("farm_house") ? createHouse() : createTree();
}

function normalizeModelForEditor(model: THREE.Object3D, sourceObject: IEditorSceneObject): void {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const targetHeight = sourceObject.label.toLowerCase().includes("farm_house") ? 1.9 : 2.1;
  const longest = Math.max(size.x, size.y, size.z);
  if (Number.isFinite(longest) && longest > 0) {
    model.scale.multiplyScalar(targetHeight / longest);
  }
  const normalizedBounds = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  normalizedBounds.getCenter(center);
  model.position.sub(center);
  model.position.y -= normalizedBounds.min.y - center.y;
}

function markLoadedModel(assetPath: string): void {
  const target = window as unknown as { __tnEditorLoadedModels?: string[] };
  target.__tnEditorLoadedModels = [...(target.__tnEditorLoadedModels ?? []), assetPath];
}

function markModelError(assetPath: string, error: unknown): void {
  const target = window as unknown as { __tnEditorModelErrors?: string[] };
  target.__tnEditorModelErrors = [...(target.__tnEditorModelErrors ?? []), `${assetPath}: ${error instanceof Error ? error.message : String(error)}`];
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
  const sprite = createIconSprite("camera");
  sprite.scale.set(0.72, 0.72, 1);
  group.add(sprite);
  return group;
}

function createLightGlyph(): THREE.Group {
  const group = new THREE.Group();
  const sprite = createIconSprite("light");
  sprite.scale.set(0.62, 0.62, 1);
  group.add(sprite);
  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 8),
      new THREE.MeshBasicMaterial({ color: "#fff7a8" }),
    ),
  );
  return group;
}

function createIconSprite(kind: "camera" | "light"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Canvas 2D context unavailable for editor viewport icon.");
  }
  context.clearRect(0, 0, 96, 96);
  context.fillStyle = "#f8fdff";
  context.strokeStyle = "#f8fdff";
  context.lineWidth = 8;
  context.lineCap = "round";
  context.lineJoin = "round";
  if (kind === "camera") {
    context.beginPath();
    context.roundRect(18, 34, 42, 30, 6);
    context.fill();
    context.beginPath();
    context.moveTo(61, 42);
    context.lineTo(78, 32);
    context.lineTo(78, 66);
    context.lineTo(61, 56);
    context.closePath();
    context.fill();
    context.beginPath();
    context.arc(29, 25, 10, 0, Math.PI * 2);
    context.arc(48, 25, 10, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.arc(48, 48, 13, 0, Math.PI * 2);
    context.fill();
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      context.beginPath();
      context.moveTo(48 + Math.cos(angle) * 25, 48 + Math.sin(angle) * 25);
      context.lineTo(48 + Math.cos(angle) * 36, 48 + Math.sin(angle) * 36);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, map: texture, transparent: true }));
}

function createTree(): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.38, 1.25, 10),
    new THREE.MeshStandardMaterial({ color: "#8a5523", roughness: 0.8 }),
  );
  trunk.position.y = 0.62;
  group.add(trunk);

  const leafMaterial = new THREE.MeshStandardMaterial({ color: "#66a80f", roughness: 0.68 });
  const positions = [
    [0, 1.45, 0],
    [-0.45, 1.2, 0.14],
    [0.42, 1.22, -0.12],
    [-0.16, 1.78, -0.12],
    [0.24, 1.64, 0.35],
  ] as const;
  for (const [x, y, z] of positions) {
    const leaf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8, 1), leafMaterial);
    leaf.position.set(x, y, z);
    leaf.scale.set(1, 0.78, 1);
    group.add(leaf);
  }
  const petalMaterial = new THREE.MeshStandardMaterial({ color: "#72b716", roughness: 0.72 });
  for (let index = 0; index < 70; index += 1) {
    const ring = index % 4;
    const angle = index * 2.399;
    const radius = 0.25 + ring * 0.16 + (index % 5) * 0.018;
    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 6), petalMaterial);
    petal.position.set(Math.cos(angle) * radius, 1.15 + (index % 11) * 0.065, Math.sin(angle) * radius);
    petal.scale.set(1.35, 0.45, 0.75);
    petal.rotation.set(index * 0.11, angle, index * 0.07);
    group.add(petal);
  }
  return group;
}

function createHouse(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.15, 1.45),
    new THREE.MeshStandardMaterial({ color: "#9c3a16", roughness: 0.72 }),
  );
  body.position.y = 0.58;
  group.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.42, 0.78, 4),
    new THREE.MeshStandardMaterial({ color: "#d84412", roughness: 0.64 }),
  );
  roof.position.y = 1.46;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.82;
  group.add(roof);

  const tileMaterial = new THREE.MeshStandardMaterial({ color: "#f04a18", roughness: 0.66 });
  for (let row = 0; row < 4; row += 1) {
    for (let column = -3; column <= 3; column += 1) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.42), tileMaterial);
      tile.position.set(column * 0.2, 1.55 - row * 0.08, 0.22 - row * 0.16);
      tile.rotation.x = -0.56;
      group.add(tile);
    }
  }

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.62, 0.04),
    new THREE.MeshStandardMaterial({ color: "#301e12", roughness: 0.9 }),
  );
  door.position.set(0, 0.36, 0.75);
  group.add(door);

  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.75, 0.28),
    new THREE.MeshStandardMaterial({ color: "#b99166", roughness: 0.82 }),
  );
  chimney.position.set(0.54, 1.72, -0.22);
  chimney.rotation.z = -0.08;
  group.add(chimney);
  return group;
}

function defaultY(sourceObject: IEditorSceneObject): number {
  return sourceObject.primitive === "plane" ? 0 : 0.45;
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
