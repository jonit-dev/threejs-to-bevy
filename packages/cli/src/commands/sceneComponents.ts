import {
  setCameraComponent,
  setCharacterControllerComponent,
  setColliderComponent,
  setLightComponent,
  setMeshRendererComponent,
  setRenderLayersComponent,
  setRigidBodyComponent,
  setVisibilityComponent,
  type IAuthoringOperationResult,
} from "@threenative/authoring";

import {
  parseBooleanFlags,
  parseNumberFlags,
  parseOptionalVectorFlag,
  parseStringListFlag,
  readFlag,
  sceneAddComponentUsage,
} from "./sceneShared.js";

export function parseTypedComponent(
  argv: readonly string[],
  sceneId: string,
  entityId: string,
  component: string,
): { apply: (projectPath: string) => Promise<IAuthoringOperationResult>; componentKind: string; diagnostic?: string; usage?: string } {
  const normalized = component.toLowerCase();
  if (normalized === "camera") {
    const numbers = parseNumberFlags(argv, ["--fov-y", "--near", "--far", "--size"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "camera", diagnostic: numbers.diagnostic, usage: "Camera numeric flags must be finite numbers." };
    }
    return {
      componentKind: "camera",
      apply: (projectPath) => setCameraComponent({
        entityId,
        far: numbers.values["--far"],
        fovY: numbers.values["--fov-y"],
        mode: readFlag(argv, "--mode"),
        near: numbers.values["--near"],
        projectPath,
        sceneId,
        size: numbers.values["--size"],
        targetId: readFlag(argv, "--target"),
      }),
    };
  }
  if (normalized === "light") {
    const numbers = parseNumberFlags(argv, ["--intensity", "--range", "--angle", "--shadow-bias", "--shadow-normal-bias"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Light", diagnostic: numbers.diagnostic, usage: "Light numeric flags must be finite numbers." };
    }
    return {
      componentKind: "Light",
      apply: (projectPath) => setLightComponent({
        angle: numbers.values["--angle"],
        color: readFlag(argv, "--color"),
        entityId,
        intensity: numbers.values["--intensity"],
        kind: readFlag(argv, "--kind"),
        projectPath,
        range: numbers.values["--range"],
        sceneId,
        shadowBias: numbers.values["--shadow-bias"],
        shadowNormalBias: numbers.values["--shadow-normal-bias"],
      }),
    };
  }
  if (normalized === "mesh-renderer" || normalized === "meshrenderer") {
    const mesh = readFlag(argv, "--mesh");
    const material = readFlag(argv, "--material");
    if (mesh === undefined || material === undefined) {
      return { apply: neverApply, componentKind: "MeshRenderer", diagnostic: "TN_SCENE_ADD_COMPONENT_MESH_RENDERER_ARGS_MISSING", usage: "Usage: tn scene add-component <scene-id> <entity-id> mesh-renderer --mesh <mesh-id> --material <material-id> [--visible <true|false>] [--project <path>] [--json]" };
    }
    const booleans = parseBooleanFlags(argv, ["--visible", "--cast-shadow", "--receive-shadow"]);
    if (booleans.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "MeshRenderer", diagnostic: booleans.diagnostic, usage: "MeshRenderer boolean flags must be true or false." };
    }
    return {
      componentKind: "MeshRenderer",
      apply: (projectPath) => setMeshRendererComponent({
        castShadow: booleans.values["--cast-shadow"],
        entityId,
        material,
        mesh,
        projectPath,
        receiveShadow: booleans.values["--receive-shadow"],
        sceneId,
        visible: booleans.values["--visible"],
      }),
    };
  }
  if (normalized === "rigid-body" || normalized === "rigidbody") {
    const numbers = parseNumberFlags(argv, ["--mass", "--damping", "--gravity-scale"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "RigidBody", diagnostic: numbers.diagnostic, usage: "RigidBody numeric flags must be finite numbers." };
    }
    return {
      componentKind: "RigidBody",
      apply: (projectPath) => setRigidBodyComponent({
        damping: numbers.values["--damping"],
        entityId,
        gravityScale: numbers.values["--gravity-scale"],
        kind: readFlag(argv, "--kind"),
        mass: numbers.values["--mass"],
        projectPath,
        sceneId,
      }),
    };
  }
  if (normalized === "render-layers" || normalized === "renderlayers") {
    const layers = parseStringListFlag(argv, "--layers");
    if (layers.diagnostic !== undefined || layers.value === undefined) {
      return { apply: neverApply, componentKind: "RenderLayers", diagnostic: layers.diagnostic ?? "TN_SCENE_ADD_COMPONENT_RENDER_LAYERS_ARGS_MISSING", usage: "Usage: tn scene add-component <scene-id> <entity-id> render-layers --layers <layer-a,layer-b> [--project <path>] [--json]" };
    }
    const parsedLayers = layers.value;
    return {
      componentKind: "RenderLayers",
      apply: (projectPath) => setRenderLayersComponent({
        entityId,
        layers: parsedLayers,
        projectPath,
        sceneId,
      }),
    };
  }
  if (normalized === "visibility") {
    const booleans = parseBooleanFlags(argv, ["--visible"]);
    if (booleans.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Visibility", diagnostic: booleans.diagnostic, usage: "Visibility boolean flags must be true or false." };
    }
    return {
      componentKind: "Visibility",
      apply: (projectPath) => setVisibilityComponent({
        entityId,
        projectPath,
        sceneId,
        visible: booleans.values["--visible"],
      }),
    };
  }
  if (normalized === "collider") {
    const numbers = parseNumberFlags(argv, ["--radius", "--height"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Collider", diagnostic: numbers.diagnostic, usage: "Collider numeric flags must be finite numbers." };
    }
    const size = parseOptionalVectorFlag(argv, "--size");
    if (size.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Collider", diagnostic: size.diagnostic, usage: "Collider --size must use x,y,z numeric values." };
    }
    const booleans = parseBooleanFlags(argv, ["--trigger"]);
    if (booleans.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "Collider", diagnostic: booleans.diagnostic, usage: "Collider boolean flags must be true or false." };
    }
    return {
      componentKind: "Collider",
      apply: (projectPath) => setColliderComponent({
        entityId,
        height: numbers.values["--height"],
        kind: readFlag(argv, "--kind"),
        projectPath,
        radius: numbers.values["--radius"],
        sceneId,
        size: size.value,
        trigger: booleans.values["--trigger"],
      }),
    };
  }
  if (normalized === "character-controller" || normalized === "charactercontroller") {
    const numbers = parseNumberFlags(argv, ["--speed", "--slope-limit", "--step-offset"]);
    if (numbers.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "CharacterController", diagnostic: numbers.diagnostic, usage: "CharacterController numeric flags must be finite numbers." };
    }
    const booleans = parseBooleanFlags(argv, ["--blocking"]);
    if (booleans.diagnostic !== undefined) {
      return { apply: neverApply, componentKind: "CharacterController", diagnostic: booleans.diagnostic, usage: "CharacterController boolean flags must be true or false." };
    }
    return {
      componentKind: "CharacterController",
      apply: (projectPath) => setCharacterControllerComponent({
        blocking: booleans.values["--blocking"],
        entityId,
        grounding: readFlag(argv, "--grounding"),
        moveXAxis: readFlag(argv, "--move-x"),
        moveZAxis: readFlag(argv, "--move-z"),
        projectPath,
        sceneId,
        slopeLimit: numbers.values["--slope-limit"],
        speed: numbers.values["--speed"],
        stepOffset: numbers.values["--step-offset"],
      }),
    };
  }
  return { apply: neverApply, componentKind: component, diagnostic: "TN_SCENE_ADD_COMPONENT_KIND_UNSUPPORTED", usage: sceneAddComponentUsage() };
}

async function neverApply(): Promise<IAuthoringOperationResult> {
  throw new Error("Invalid typed component command should not be applied.");
}
