import type { IAuthoringOperationResult } from "./operations.js";
import { authoringDiagnostic } from "./diagnostics.js";
import { authoringOperationResult } from "./operations/shared.js";
import { applyCharacterArchetype, updateCharacterArchetype } from "./archetypes/character.js";

export type ActorArchetypeId = "character";

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
    description: "Kinematic third-person character with controller, capsule collider, follow camera, input defaults, and defineBehavior script stub.",
    id: "character",
    parameters: ["asset", "sceneId", "speed", "sprintSpeed"],
  },
];

export function listActorArchetypes(): IActorArchetypeDescriptor[] {
  return ACTOR_ARCHETYPES.map((archetype) => ({ ...archetype, parameters: [...archetype.parameters] }));
}

export async function applyActorArchetype(options: IApplyActorArchetypeOptions): Promise<IAuthoringOperationResult> {
  if (options.archetype === "character") {
    return applyCharacterArchetype(options);
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
