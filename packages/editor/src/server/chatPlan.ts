import { authoringDiagnostic, listAuthoringOperationDescriptors, type IAuthoringDiagnostic, type IAuthoringOperationDescriptor } from "@threenative/authoring";

import type { IEditorProjectApiResult } from "./projectApi.js";

export interface IEditorChatOperationStep {
  args: Record<string, unknown>;
  description: string;
  name: string;
  target?: {
    entityId?: string;
    sceneId?: string;
  };
}

export interface IEditorChatContext {
  activeSceneId?: string;
  diagnostics: IAuthoringDiagnostic[];
  operationCatalog: IAuthoringOperationDescriptor[];
  projectRevision?: string;
  sceneObjects: IEditorProjectApiResult["sceneObjects"];
  selectedEntityId?: string;
  selectedRowId?: string;
}

export interface IEditorChatPlan {
  affectedFiles: string[];
  approvalToken: string;
  diagnostics: IAuthoringDiagnostic[];
  id: string;
  message: string;
  ok: boolean;
  operations: IEditorChatOperationStep[];
  projectRevision?: string;
  risks: string[];
  summary: string;
}

export interface IEditorChatPlanRequest {
  context: IEditorChatContext;
  message: string;
}

const ALLOWED_CHAT_OPERATION_NAMES = new Set([
  "scene.add_prefab",
  "scene.add_entity",
  "scene.set_transform",
  "scene.set_rigid_body",
  "scene.set_collider",
  "scene.set_visibility",
  "scene.add_tag",
]);

export function editorChatContextFromProject(project: IEditorProjectApiResult, selectedRowId?: string): IEditorChatContext {
  const activeScenePath = project.sceneLifecycle.activeScene?.documentPath;
  const selectedObject = project.sceneObjects.find((object) => object.rowId === selectedRowId);
  return {
    activeSceneId: sceneIdFromDocumentPath(activeScenePath),
    diagnostics: project.diagnostics,
    operationCatalog: allowedEditorChatOperationCatalog(),
    projectRevision: project.projectRevision,
    sceneObjects: project.sceneObjects,
    selectedEntityId: selectedObject?.id,
    selectedRowId,
  };
}

export function allowedEditorChatOperationCatalog(): IAuthoringOperationDescriptor[] {
  return listAuthoringOperationDescriptors().filter((operation) => operation.pathPolicy === "source-document" && ALLOWED_CHAT_OPERATION_NAMES.has(operation.name));
}

export function planEditorChatOperations(request: IEditorChatPlanRequest): IEditorChatPlan {
  const message = request.message.trim();
  const lower = message.toLowerCase();
  const diagnostics: IAuthoringDiagnostic[] = [];
  const activeSceneId = request.context.activeSceneId ?? inferActiveSceneId(request.context);
  let operations: IEditorChatOperationStep[] = [];
  let summary = "";
  const risks: string[] = [];

  if (activeSceneId === undefined) {
    diagnostics.push(authoringDiagnostic({
      code: "TN_EDITOR_CHAT_SCENE_REQUIRED",
      message: "AI chat planning needs an active source scene before it can propose ECS operations.",
      path: "/context/activeSceneId",
      suggestion: "Load or create a source scene, then ask chat to plan the ECS change again.",
    }));
  } else if (isAddPrimitiveIntent(lower)) {
    const primitive = primitiveFromMessage(lower);
    const label = labelFromMessage(lower, primitive);
    const entityId = uniqueEntityId(request.context, `chat-${label}`);
    const prefabId = `prefab.${entityId}`;
    operations = [
      step("scene.add_prefab", { color: colorFromMessage(lower), prefabId, primitive, sceneId: activeSceneId }, `Create ${primitive} prefab ${prefabId}.`, activeSceneId),
      step("scene.add_entity", { entityId, prefabId, sceneId: activeSceneId }, `Add source entity ${entityId}.`, activeSceneId, entityId),
      step("scene.set_transform", { entityId, position: positionFromMessage(lower), sceneId: activeSceneId }, `Place ${entityId} in the active scene.`, activeSceneId, entityId),
    ];
    if (lower.includes("physics") || lower.includes("dynamic") || lower.includes("rigid")) {
      operations.push(step("scene.set_rigid_body", { entityId, kind: "dynamic", mass: 1, sceneId: activeSceneId }, `Attach a dynamic RigidBody to ${entityId}.`, activeSceneId, entityId));
      operations.push(step("scene.set_collider", { entityId, kind: "box", sceneId: activeSceneId, size: [1, 1, 1], trigger: false }, `Attach a box Collider to ${entityId}.`, activeSceneId, entityId));
    }
    summary = `Plan adds ${entityId} to ${activeSceneId} through source-backed ECS operations.`;
  } else if (isTransformIntent(lower)) {
    const entityId = request.context.selectedEntityId;
    if (entityId === undefined) {
      diagnostics.push(authoringDiagnostic({
        code: "TN_EDITOR_CHAT_SELECTION_REQUIRED",
        message: "AI chat needs a selected source entity to plan this transform change.",
        path: "/context/selectedRowId",
        suggestion: "Select an entity in the hierarchy or ask chat to add a new entity instead.",
      }));
    } else {
      operations = [
        step("scene.set_transform", { entityId, position: positionFromMessage(lower), sceneId: activeSceneId }, `Move selected entity ${entityId}.`, activeSceneId, entityId),
      ];
      summary = `Plan updates the Transform component for ${entityId}.`;
    }
  } else if (lower.includes("rigid") || lower.includes("collider") || lower.includes("physics")) {
    const entityId = request.context.selectedEntityId;
    if (entityId === undefined) {
      diagnostics.push(authoringDiagnostic({
        code: "TN_EDITOR_CHAT_SELECTION_REQUIRED",
        message: "AI chat needs a selected source entity to attach physics components.",
        path: "/context/selectedRowId",
        suggestion: "Select an entity in the hierarchy or ask chat to add a physics cube.",
      }));
    } else {
      operations = [
        step("scene.set_rigid_body", { entityId, kind: "dynamic", mass: 1, sceneId: activeSceneId }, `Attach a dynamic RigidBody to ${entityId}.`, activeSceneId, entityId),
        step("scene.set_collider", { entityId, kind: "box", sceneId: activeSceneId, size: [1, 1, 1], trigger: false }, `Attach a box Collider to ${entityId}.`, activeSceneId, entityId),
      ];
      summary = `Plan attaches physics components to ${entityId}.`;
    }
  } else if (lower.includes("visibility") || lower.includes("visible") || lower.includes("hide") || lower.includes("show")) {
    const entityId = request.context.selectedEntityId;
    if (entityId === undefined) {
      diagnostics.push(authoringDiagnostic({
        code: "TN_EDITOR_CHAT_SELECTION_REQUIRED",
        message: "AI chat needs a selected source entity to plan visibility changes.",
        path: "/context/selectedRowId",
        suggestion: "Select an entity in the hierarchy before asking chat to hide or show it.",
      }));
    } else {
      operations = [
        step("scene.set_visibility", { entityId, sceneId: activeSceneId, visible: !lower.includes("hide") }, `Set Visibility for ${entityId}.`, activeSceneId, entityId),
      ];
      summary = `Plan updates Visibility for ${entityId}.`;
    }
  } else if (lower.includes("tag")) {
    const entityId = request.context.selectedEntityId;
    if (entityId === undefined) {
      diagnostics.push(authoringDiagnostic({
        code: "TN_EDITOR_CHAT_SELECTION_REQUIRED",
        message: "AI chat needs a selected source entity to add a tag.",
        path: "/context/selectedRowId",
        suggestion: "Select an entity in the hierarchy before asking chat to tag it.",
      }));
    } else {
      const tag = tagFromMessage(lower);
      operations = [
        step("scene.add_tag", { entityId, sceneId: activeSceneId, tag }, `Add ${tag} tag to ${entityId}.`, activeSceneId, entityId),
      ];
      summary = `Plan adds tag ${tag} to ${entityId}.`;
    }
  } else {
    diagnostics.push(authoringDiagnostic({
      code: "TN_EDITOR_CHAT_INTENT_UNSUPPORTED",
      message: "AI chat can only plan bounded source-backed ECS operations in the local deterministic mode.",
      path: "/message",
      suggestion: "Try adding a cube, moving the selected entity, attaching physics, toggling visibility, or adding a tag.",
      value: message,
    }));
  }

  diagnostics.push(...validatePlannedOperations(request.context, operations));
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error") && operations.length > 0;
  return {
    affectedFiles: [...new Set(operations.map((operation) => sourceFileForScene(String(operation.args.sceneId ?? activeSceneId))))],
    approvalToken: approvalTokenFor(message, request.context.projectRevision, operations),
    diagnostics,
    id: planIdFor(message, request.context.projectRevision, operations),
    message,
    ok,
    operations: ok ? operations : [],
    projectRevision: request.context.projectRevision,
    risks,
    summary: summary || "No source-backed ECS operation plan was produced.",
  };
}

function validatePlannedOperations(context: IEditorChatContext, operations: readonly IEditorChatOperationStep[]): IAuthoringDiagnostic[] {
  const catalog = new Set<string>(context.operationCatalog.map((operation) => operation.name));
  return operations.flatMap((operation, index) => {
    if (!catalog.has(operation.name)) {
      return [
        authoringDiagnostic({
          code: "TN_EDITOR_CHAT_OPERATION_REJECTED",
          message: `AI chat operation '${operation.name}' is not in the editor chat allow list.`,
          path: `/operations/${index}/name`,
          suggestion: "Use a registered source-document authoring operation exposed by the chat catalog.",
          value: operation.name,
        }),
      ];
    }
    return [];
  });
}

function step(name: string, args: Record<string, unknown>, description: string, sceneId?: string, entityId?: string): IEditorChatOperationStep {
  return { args, description, name, target: { entityId, sceneId } };
}

function isAddPrimitiveIntent(message: string): boolean {
  return /\b(add|create|spawn|make)\b/.test(message) && /\b(cube|box|sphere|primitive|entity)\b/.test(message);
}

function isTransformIntent(message: string): boolean {
  return /\b(move|place|position|transform|translate)\b/.test(message);
}

function primitiveFromMessage(message: string): string {
  if (message.includes("sphere")) {
    return "sphere";
  }
  if (message.includes("plane")) {
    return "plane";
  }
  return "box";
}

function labelFromMessage(message: string, fallback: string): string {
  if (message.includes("player")) {
    return "player";
  }
  if (message.includes("cube") || message.includes("box")) {
    return "cube";
  }
  return fallback;
}

function colorFromMessage(message: string): string {
  if (message.includes("red")) {
    return "#d94343";
  }
  if (message.includes("green")) {
    return "#31a354";
  }
  if (message.includes("yellow")) {
    return "#f2c94c";
  }
  return "#2f80ed";
}

function positionFromMessage(message: string): [number, number, number] {
  if (message.includes("front")) {
    return [0, 0.5, -2];
  }
  const vector = message.match(/\[?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]?/);
  if (vector !== null) {
    return [Number(vector[1]), Number(vector[2]), Number(vector[3])];
  }
  return [0, 0.5, 0];
}

function tagFromMessage(message: string): string {
  const match = message.match(/tag(?:ged)?\s+(?:as\s+|with\s+)?([a-z][a-z0-9_-]*)/);
  return match?.[1] ?? "ChatTag";
}

function uniqueEntityId(context: IEditorChatContext, base: string): string {
  const existing = new Set(context.sceneObjects.map((object) => object.id));
  if (!existing.has(base)) {
    return base;
  }
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function inferActiveSceneId(context: IEditorChatContext): string | undefined {
  const firstDocumentPath = context.sceneObjects[0]?.documentPath;
  return sceneIdFromDocumentPath(firstDocumentPath);
}

function sceneIdFromDocumentPath(documentPath: string | undefined): string | undefined {
  const fileName = documentPath?.split("/").pop();
  if (fileName === undefined) {
    return undefined;
  }
  return fileName.endsWith(".scene.json") ? fileName.slice(0, -".scene.json".length) : fileName;
}

function sourceFileForScene(sceneId: string): string {
  return `content/scenes/${sceneId}.scene.json`;
}

function planIdFor(message: string, revision: string | undefined, operations: readonly IEditorChatOperationStep[]): string {
  return `chat-plan:${hashStable({ message, operations, revision })}`;
}

function approvalTokenFor(message: string, revision: string | undefined, operations: readonly IEditorChatOperationStep[]): string {
  return `approve:${hashStable({ message, operations, revision, scope: "editor-chat" })}`;
}

function hashStable(value: unknown): string {
  let hash = 2166136261;
  const text = JSON.stringify(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
