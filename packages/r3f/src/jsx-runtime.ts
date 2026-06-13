import type { ColorValue, Vector3Tuple } from "@threenative/sdk";

export type R3fElementType =
  | "ambientLight"
  | "boxGeometry"
  | "capsuleGeometry"
  | "cylinderGeometry"
  | "directionalLight"
  | "group"
  | "mesh"
  | "meshBasicMaterial"
  | "meshStandardMaterial"
  | "orthographicCamera"
  | "perspectiveCamera"
  | "planeGeometry"
  | "pointLight"
  | "scene"
  | "sphereGeometry"
  | "spotLight";

export interface INodeProps {
  children?: R3fChild | R3fChild[];
  id?: string;
  name?: string;
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
  scale?: Vector3Tuple;
  visible?: boolean;
}

export interface IGeometryProps {
  radius?: number;
  size?: number | Vector3Tuple | readonly [number, number];
}

export interface IMaterialProps {
  color?: ColorValue;
  metalness?: number;
  roughness?: number;
}

export interface ICameraProps extends INodeProps {
  far?: number;
  fovY?: number;
  near?: number;
}

export interface IOrthographicCameraProps extends ICameraProps {
  size?: number;
}

export interface ILightProps extends INodeProps {
  color?: ColorValue;
  intensity?: number;
}

export type R3fProps = INodeProps & IGeometryProps & IMaterialProps & ICameraProps & ILightProps;
export type R3fChild = IR3fElement | false | null | undefined;

export interface IR3fElement {
  props: R3fProps;
  type: R3fElementType;
}

export function jsx(type: R3fElementType | ((props: R3fProps) => IR3fElement), props: R3fProps): IR3fElement {
  if (typeof type === "function") {
    return type(props);
  }
  return { props: props ?? {}, type };
}

export const jsxs = jsx;
export const Fragment = "group";

export namespace JSX {
  export type Element = IR3fElement;

  export interface IntrinsicElements {
    ambientLight: ILightProps;
    boxGeometry: IGeometryProps;
    capsuleGeometry: IGeometryProps;
    cylinderGeometry: IGeometryProps;
    directionalLight: ILightProps;
    group: INodeProps;
    mesh: INodeProps;
    meshBasicMaterial: IMaterialProps;
    meshStandardMaterial: IMaterialProps;
    orthographicCamera: IOrthographicCameraProps;
    perspectiveCamera: ICameraProps;
    planeGeometry: IGeometryProps;
    pointLight: ILightProps;
    scene: INodeProps;
    sphereGeometry: IGeometryProps;
    spotLight: ILightProps;
  }
}
