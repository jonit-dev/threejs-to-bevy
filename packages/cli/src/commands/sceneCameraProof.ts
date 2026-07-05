import {
  inspectScene,
  type IAuthoringOperationResult,
} from "@threenative/authoring";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  isRecord,
  isVector3,
  round,
  type SceneRecord,
} from "./sceneShared.js";

export async function proofCamera(options: {
  cameraId: string;
  maxRoll: number;
  minOccupancy: number;
  projectPath: string;
  sceneId: string;
  targetId: string;
}): Promise<IAuthoringOperationResult & {
  activeCamera: string | undefined;
  cameraId: string;
  metrics?: {
    approximateRoll: number;
    clippingRange: { far: number; near: number; ok: boolean };
    depth: number;
    fovY: number;
    normalizedScreen: { x: number; y: number };
    screenOccupancy: number;
    targetVisible: boolean;
    worldBounds: { max: [number, number, number]; min: [number, number, number]; size: [number, number, number] };
  };
  targetId: string;
}> {
  const inspectedScene = await inspectScene({ projectPath: options.projectPath, sceneId: options.sceneId });
  if (inspectedScene.scene === undefined) {
    return { ...inspectedScene, activeCamera: undefined, cameraId: options.cameraId, targetId: options.targetId };
  }

  const scenePath = resolve(options.projectPath, inspectedScene.scene.file);
  const diagnostics = [...inspectedScene.diagnostics];
  let scene: SceneRecord;
  try {
    scene = JSON.parse(await readFile(scenePath, "utf8")) as SceneRecord;
  } catch (error) {
    return {
      activeCamera: undefined,
      cameraId: options.cameraId,
      changed: false,
      diagnostics: [{
        code: "TN_SCENE_CAMERA_PROOF_READ_FAILED",
        message: `Could not read scene source JSON: ${error instanceof Error ? error.message : String(error)}`,
        severity: "error",
      }],
      filesWritten: [],
      ok: false,
      projectPath: options.projectPath,
      targetId: options.targetId,
    };
  }

  const entities = ensureSceneArray(scene, "entities");
  const camera = entities.find((entity) => entity.id === options.cameraId);
  const target = entities.find((entity) => entity.id === options.targetId);
  const activeCamera = findActiveCameraId(scene, entities);
  if (camera === undefined) {
    diagnostics.push({
      code: "TN_SCENE_CAMERA_PROOF_CAMERA_NOT_FOUND",
      message: `Camera '${options.cameraId}' was not found in scene '${options.sceneId}'.`,
      path: options.cameraId,
      severity: "error",
    });
  }
  if (target === undefined) {
    diagnostics.push({
      code: "TN_SCENE_CAMERA_PROOF_TARGET_NOT_FOUND",
      message: `Target '${options.targetId}' was not found in scene '${options.sceneId}'.`,
      path: options.targetId,
      severity: "error",
    });
  }
  if (camera === undefined || target === undefined) {
    return {
      activeCamera,
      cameraId: options.cameraId,
      changed: false,
      diagnostics,
      filesWritten: [],
      ok: false,
      projectPath: options.projectPath,
      targetId: options.targetId,
    };
  }

  const cameraTransform = camera.transform as SceneRecord | undefined;
  const targetTransform = target.transform as SceneRecord | undefined;
  const cameraPosition = vectorFromRecord(cameraTransform, "position", [0, 0, 0]);
  const cameraRotation = vectorFromRecord(cameraTransform, "rotation", [0, 0, 0]);
  const targetPosition = vectorFromRecord(targetTransform, "position", [0, 0, 0]);
  const targetScale = vectorFromRecord(targetTransform, "scale", [1, 1, 1]);
  const cameraComponent = (camera.components as SceneRecord | undefined)?.camera as SceneRecord | undefined;
  const fovY = readFiniteNumber(cameraComponent?.fovY, 60);
  const near = readFiniteNumber(cameraComponent?.near, 0.1);
  const far = readFiniteNumber(cameraComponent?.far, 1000);
  const bounds = boundsFromTarget(targetPosition, targetScale);
  const projection = projectTargetToCamera({
    cameraPosition,
    cameraRotation,
    fovY,
    targetPosition,
    targetWorldHeight: Math.max(bounds.size[1], bounds.size[0], bounds.size[2], 0.25),
  });
  const roll = round(Math.abs(cameraRotation[2]));
  const clippingOk = projection.depth >= near && projection.depth <= far;
  const targetVisible = projection.depth > 0
    && clippingOk
    && Math.abs(projection.normalizedScreen.x) <= 1
    && Math.abs(projection.normalizedScreen.y) <= 1;

  if (activeCamera !== undefined && activeCamera !== options.cameraId) {
    diagnostics.push({
      code: "TN_SCENE_CAMERA_PROOF_INACTIVE_CAMERA",
      message: `Camera '${options.cameraId}' is not the active camera; active camera appears to be '${activeCamera}'.`,
      path: options.cameraId,
      severity: "warning",
      suggestion: `Set '${options.cameraId}' as the active scene camera or pass --camera ${activeCamera}.`,
    });
  }
  if (!targetVisible) {
    diagnostics.push({
      code: "TN_SCENE_CAMERA_PROOF_TARGET_OUTSIDE_VIEW",
      message: `Target '${options.targetId}' projects outside camera '${options.cameraId}' view at normalized screen [${projection.normalizedScreen.x}, ${projection.normalizedScreen.y}] and depth ${projection.depth}.`,
      path: options.targetId,
      severity: "error",
      suggestion: cameraProofSuggestion(cameraPosition, targetPosition),
    });
  }
  if (projection.screenOccupancy < options.minOccupancy) {
    diagnostics.push({
      code: "TN_SCENE_CAMERA_PROOF_OCCUPANCY_TOO_LOW",
      message: `Target '${options.targetId}' screen occupancy ${projection.screenOccupancy} is below minimum ${options.minOccupancy}.`,
      path: options.targetId,
      severity: "error",
      suggestion: cameraProofSuggestion(cameraPosition, targetPosition),
    });
  }
  if (roll > options.maxRoll) {
    diagnostics.push({
      code: "TN_SCENE_CAMERA_PROOF_ROLL_TOO_HIGH",
      message: `Camera '${options.cameraId}' approximate roll ${roll} exceeds maximum ${options.maxRoll}.`,
      path: options.cameraId,
      severity: "error",
      suggestion: "Use tn scene set-camera-look-at to frame the target with zero roll.",
    });
  }
  if (!clippingOk) {
    diagnostics.push({
      code: "TN_SCENE_CAMERA_PROOF_CLIPPING_RANGE",
      message: `Target '${options.targetId}' depth ${projection.depth} is outside camera clipping range ${near}-${far}.`,
      path: options.cameraId,
      severity: "error",
      suggestion: "Adjust camera near/far planes or move the camera so the target is inside the frustum.",
    });
  }

  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  return {
    activeCamera,
    cameraId: options.cameraId,
    changed: false,
    diagnostics,
    filesWritten: [],
    metrics: {
      approximateRoll: roll,
      clippingRange: { far, near, ok: clippingOk },
      depth: projection.depth,
      fovY,
      normalizedScreen: projection.normalizedScreen,
      screenOccupancy: projection.screenOccupancy,
      targetVisible,
      worldBounds: bounds,
    },
    ok: !hasErrors,
    projectPath: options.projectPath,
    targetId: options.targetId,
  };
}

function ensureSceneArray(scene: SceneRecord, key: "entities" | "prefabs"): SceneRecord[] {
  const existing = scene[key];
  if (Array.isArray(existing)) {
    return existing as SceneRecord[];
  }
  const next: SceneRecord[] = [];
  scene[key] = next;
  return next;
}

function findActiveCameraId(scene: SceneRecord, entities: SceneRecord[]): string | undefined {
  if (typeof scene.activeCamera === "string") {
    return scene.activeCamera;
  }
  if (typeof scene.camera === "string") {
    return scene.camera;
  }
  return entities.find((entity) => isRecord(entity.components) && isRecord(entity.components.camera))?.id as string | undefined;
}

function vectorFromRecord(record: SceneRecord | undefined, key: string, fallback: [number, number, number]): [number, number, number] {
  const value = record?.[key];
  return isVector3(value) ? value : fallback;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function boundsFromTarget(position: [number, number, number], scale: [number, number, number]): { max: [number, number, number]; min: [number, number, number]; size: [number, number, number] } {
  const size: [number, number, number] = [Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2])].map((item) => round(Math.max(item, 0.25))) as [number, number, number];
  const half: [number, number, number] = [size[0] / 2, size[1] / 2, size[2] / 2];
  return {
    max: [round(position[0] + half[0]), round(position[1] + half[1]), round(position[2] + half[2])],
    min: [round(position[0] - half[0]), round(position[1] - half[1]), round(position[2] - half[2])],
    size,
  };
}

function projectTargetToCamera(options: {
  cameraPosition: [number, number, number];
  cameraRotation: [number, number, number];
  fovY: number;
  targetPosition: [number, number, number];
  targetWorldHeight: number;
}): { depth: number; normalizedScreen: { x: number; y: number }; screenOccupancy: number } {
  const [pitch, yaw] = options.cameraRotation;
  const cosPitch = Math.cos(pitch);
  const forward: [number, number, number] = [-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch];
  const right: [number, number, number] = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = cross(right, forward);
  const delta: [number, number, number] = [
    options.targetPosition[0] - options.cameraPosition[0],
    options.targetPosition[1] - options.cameraPosition[1],
    options.targetPosition[2] - options.cameraPosition[2],
  ];
  const depth = dot(delta, forward);
  const halfFov = Math.tan((options.fovY * Math.PI / 180) / 2);
  const aspect = 16 / 9;
  const safeDepth = Math.max(Math.abs(depth), 0.0001);
  const normalizedScreen = {
    x: round(dot(delta, right) / (safeDepth * halfFov * aspect)),
    y: round(dot(delta, up) / (safeDepth * halfFov)),
  };
  const screenOccupancy = round(options.targetWorldHeight / (2 * safeDepth * halfFov));
  return {
    depth: round(depth),
    normalizedScreen,
    screenOccupancy,
  };
}

function dot(left: [number, number, number], right: [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function cross(left: [number, number, number], right: [number, number, number]): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function cameraProofSuggestion(cameraPosition: [number, number, number], targetPosition: [number, number, number]): string {
  const dx = cameraPosition[0] - targetPosition[0];
  const dz = cameraPosition[2] - targetPosition[2];
  const distance = Math.max(Math.sqrt(dx * dx + dz * dz), 4);
  const suggestedPosition: [number, number, number] = [round(targetPosition[0] - distance), round(targetPosition[1] + 1.4), round(targetPosition[2] + 0.01)];
  const suggestedTarget: [number, number, number] = [round(targetPosition[0]), round(targetPosition[1] + 0.4), round(targetPosition[2])];
  return `Try tn scene set-camera-look-at <scene-id> <camera-id> --position ${suggestedPosition.join(",")} --target ${suggestedTarget.join(",")}.`;
}
