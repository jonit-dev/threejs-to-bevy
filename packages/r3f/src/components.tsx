import type { R3fProps } from "./jsx-runtime.js";
import { jsx } from "./jsx-runtime.js";

export const Scene = (props: R3fProps) => jsx("scene", props);
export const Group = (props: R3fProps) => jsx("group", props);
export const Mesh = (props: R3fProps) => jsx("mesh", props);
export const PerspectiveCamera = (props: R3fProps) => jsx("perspectiveCamera", props);
export const OrthographicCamera = (props: R3fProps) => jsx("orthographicCamera", props);
export const AmbientLight = (props: R3fProps) => jsx("ambientLight", props);
export const DirectionalLight = (props: R3fProps) => jsx("directionalLight", props);
export const PointLight = (props: R3fProps) => jsx("pointLight", props);
export const SpotLight = (props: R3fProps) => jsx("spotLight", props);
export const BoxGeometry = (props: R3fProps) => jsx("boxGeometry", props);
export const CapsuleGeometry = (props: R3fProps) => jsx("capsuleGeometry", props);
export const CylinderGeometry = (props: R3fProps) => jsx("cylinderGeometry", props);
export const SphereGeometry = (props: R3fProps) => jsx("sphereGeometry", props);
export const PlaneGeometry = (props: R3fProps) => jsx("planeGeometry", props);
export const MeshStandardMaterial = (props: R3fProps) => jsx("meshStandardMaterial", props);
export const MeshBasicMaterial = (props: R3fProps) => jsx("meshBasicMaterial", props);
