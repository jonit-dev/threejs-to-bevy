import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  type Vector3Tuple,
} from "@threenative/sdk";

import { R3fCaptureError } from "./diagnostics.js";
import type { IR3fElement, R3fChild, R3fElementType, R3fProps } from "./jsx-runtime.js";

export function isR3fElement(value: unknown): value is IR3fElement {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "string" &&
    "props" in value
  );
}

export function captureScene(root: IR3fElement): Scene {
  if (root.type !== "scene") {
    throw unsupported(root.type, "Use <scene> as the portable JSX root.");
  }

  const scene = new Scene(readObjectOptions(root.props, "scene"));
  for (const child of childrenOf(root)) {
    const object = captureObject(child, [scene.id ?? "scene"]);
    scene.add(object);
    if (object instanceof PerspectiveCamera && scene.activeCamera === undefined) {
      scene.setActiveCamera(object);
    }
  }
  return scene;
}

function captureObject(element: IR3fElement, path: readonly string[]): Object3D {
  const options = readObjectOptions(element.props, fallbackId(path, element.type));
  const object =
    element.type === "group"
      ? new Object3D(options)
      : element.type === "mesh"
        ? captureMesh(element, options)
        : element.type === "perspectiveCamera"
          ? new PerspectiveCamera({
              ...options,
              far: element.props.far ?? 100,
              fovY: element.props.fovY ?? 60,
              near: element.props.near ?? 0.1,
            })
          : element.type === "ambientLight"
            ? new AmbientLight({ ...options, color: element.props.color, intensity: element.props.intensity })
            : element.type === "directionalLight"
              ? new DirectionalLight({ ...options, color: element.props.color, intensity: element.props.intensity })
              : undefined;

  if (object === undefined) {
    throw unsupported(element.type, "Use scene, group, mesh, perspectiveCamera, ambientLight, or directionalLight for portable V2 capture.");
  }

  applyTransform(object, element.props);
  childrenOf(element)
    .filter((child) => !isMeshSlot(child))
    .forEach((child, index) => object.add(captureObject(child, [...path, object.id ?? element.type, String(index)])));
  return object;
}

function captureMesh(element: IR3fElement, options: { id?: string; name?: string }): Mesh {
  const children = childrenOf(element);
  const geometry = children.find((child) => isGeometry(child.type));
  const material = children.find((child) => isMaterial(child.type));
  if (geometry === undefined || material === undefined) {
    throw unsupported("mesh", "Mesh capture requires one primitive geometry child and one material child.");
  }

  return new Mesh({
    ...options,
    geometry: captureGeometry(geometry),
    material: new MeshStandardMaterial({
      color: material.props.color,
      metalness: material.type === "meshBasicMaterial" ? 0 : material.props.metalness,
      roughness: material.props.roughness,
    }),
  });
}

function captureGeometry(element: IR3fElement): BoxGeometry | PlaneGeometry | SphereGeometry {
  if (element.type === "boxGeometry") {
    return new BoxGeometry({ size: normalizeVec3(element.props.size, [1, 1, 1]) });
  }
  if (element.type === "sphereGeometry") {
    return new SphereGeometry({ radius: element.props.radius });
  }
  if (element.type === "planeGeometry") {
    return new PlaneGeometry({ size: normalizeVec2(element.props.size, [1, 1]) });
  }
  throw unsupported(element.type, "Use boxGeometry, sphereGeometry, or planeGeometry in portable V2 capture.");
}

function childrenOf(element: IR3fElement): IR3fElement[] {
  return toArray(element.props.children).filter(isR3fElement);
}

function toArray(children: R3fChild | R3fChild[]): R3fChild[] {
  return Array.isArray(children) ? children : [children];
}

function readObjectOptions(props: R3fProps, fallback: string): { id?: string; name?: string } {
  return { id: props.id ?? fallback, name: props.name };
}

function applyTransform(object: Object3D, props: R3fProps): void {
  if (props.position !== undefined) {
    object.position.set(...props.position);
  }
  if (props.rotation !== undefined) {
    object.rotation.set(...props.rotation);
  }
  if (props.scale !== undefined) {
    object.scale.set(...props.scale);
  }
}

function fallbackId(path: readonly string[], type: string): string {
  return [...path, type].join(".");
}

function isMeshSlot(element: IR3fElement): boolean {
  return isGeometry(element.type) || isMaterial(element.type);
}

function isGeometry(type: R3fElementType): boolean {
  return type === "boxGeometry" || type === "planeGeometry" || type === "sphereGeometry";
}

function isMaterial(type: R3fElementType): boolean {
  return type === "meshBasicMaterial" || type === "meshStandardMaterial";
}

function normalizeVec3(value: R3fProps["size"], fallback: Vector3Tuple): Vector3Tuple {
  return Array.isArray(value) && value.length === 3 ? (value as Vector3Tuple) : fallback;
}

function normalizeVec2(value: R3fProps["size"], fallback: readonly [number, number]): readonly [number, number] {
  return Array.isArray(value) && value.length === 2 ? [value[0] ?? fallback[0], value[1] ?? fallback[1]] : fallback;
}

function unsupported(component: string, suggestion: string): R3fCaptureError {
  return new R3fCaptureError("TN_R3F_UNSUPPORTED_JSX", `Unsupported portable JSX component '${component}'.`, suggestion);
}
