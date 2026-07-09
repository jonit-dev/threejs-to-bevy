import type { IAuthoringOperationResult } from "./operations.js";
import { authoringDiagnostic } from "./diagnostics.js";
import { authoringOperationResult } from "./operations/shared.js";
import { applyCharacterArchetype, updateCharacterArchetype } from "./archetypes/character.js";
import { applyBasicActorArchetype } from "./archetypes/basic.js";

export type ActorArchetypeId = "camera-boom" | "character" | "pickup" | "prop-static" | "vehicle";

export interface IApplyActorArchetypeOptions {
  actorId: string;
  archetype: ActorArchetypeId | string;
  asset?: string;
  projectPath: string;
  sceneId?: string;
  speed?: number;
  sprintSpeed?: number;
}

export interface IUpdateActorArchetypeOptions {
  actorId: string;
  projectPath: string;
  set?: Record<string, unknown>;
}

export interface IActorArchetypeDescriptor {
  id: ActorArchetypeId;
  description: string;
  parameters: string[];
}

const ACTOR_ARCHETYPES: readonly IActorArchetypeDescriptor[] = [
  {
    description: "Follow camera entity with camera-boom provenance and CameraRig script stub.",
    id: "camera-boom",
    parameters: ["sceneId", "targetId"],
  },
  {
    description: "Kinematic third-person character with controller, capsule collider, follow camera, input defaults, and defineBehavior script stub.",
    id: "character",
    parameters: ["asset", "sceneId", "speed", "sprintSpeed"],
  },
  {
    description: "Collectible trigger with bobbing mover, pickup counter resource, HUD binding, and behavior stub.",
    id: "pickup",
    parameters: ["asset", "sceneId"],
  },
  {
    description: "Static prop with mesh/prefab source, rigid body, and box collider provenance.",
    id: "prop-static",
    parameters: ["asset", "sceneId"],
  },
  {
    description: "Arcade vehicle shell with chassis collider, dynamic body, chase camera, and behavior stub.",
    id: "vehicle",
    parameters: ["asset", "sceneId", "speed"],
  },
];

export function listActorArchetypes(): IActorArchetypeDescriptor[] {
  return ACTOR_ARCHETYPES.map((archetype) => ({ ...archetype, parameters: [...archetype.parameters] }));
}

export async function applyActorArchetype(options: IApplyActorArchetypeOptions): Promise<IAuthoringOperationResult> {
  if (options.archetype === "character") {
    return applyCharacterArchetype(options);
  }
  if (options.archetype === "camera-boom" || options.archetype === "pickup" || options.archetype === "prop-static" || options.archetype === "vehicle") {
    return applyBasicActorArchetype({ ...options, archetype: options.archetype });
  }
  return authoringOperationResult({
    diagnostics: [
      authoringDiagnostic({
        code: "TN_ARCHETYPE_UNSUPPORTED",
        message: `Actor archetype '${options.archetype}' is not supported.`,
        path: "/archetype",
        suggestion: "Use tn actor list to inspect available archetypes.",
        value: options.archetype,
      }),
    ],
    projectPath: options.projectPath,
  });
}

export async function updateActorArchetype(options: IUpdateActorArchetypeOptions): Promise<IAuthoringOperationResult> {
  return updateCharacterArchetype(options);
}
