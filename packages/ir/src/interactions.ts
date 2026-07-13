import type { SchemaVersion, Vec3 } from "./types.js";

export type InteractionEntityTarget = "detected" | "source" | { entity: string };
export type InteractionSelector = { entity: string } | { withComponent: string } | { withTag: string };

export type InteractionPredicate =
  | { equals?: unknown; field: string; gte?: number; resource: string }
  | { component: string; equals: unknown; field: string; target: InteractionEntityTarget };

export type InteractionDetector =
  | { fallback?: InteractionDistanceDetector; kind: "sensor-enter" | "sensor-exit"; source: InteractionSelector; target: InteractionSelector }
  | InteractionDistanceDetector
  | { kind: "overlap"; source: InteractionSelector; target: InteractionSelector }
  | { event: string; kind: "event" | "ray-hit"; source: InteractionSelector; target: InteractionSelector };

export interface InteractionDistanceDetector {
  kind: "distance2d" | "distance3d";
  radius: number;
  source: InteractionSelector;
  target: InteractionSelector;
}

export type InteractionGate =
  | { kind: "once" | "once-per-target" }
  | { kind: "cooldown"; ticks: number }
  | { kind: "equals"; predicate: InteractionPredicate };

export type InteractionEffect =
  | { field: string; kind: "addResource"; resource: string; value: number }
  | { field: string; kind: "setResource"; resource: string; value: unknown }
  | { component: string; kind: "patchComponent"; patch: Record<string, unknown>; target: InteractionEntityTarget }
  | { event: string; kind: "emitEvent"; payload?: unknown }
  | { kind: "feedbackPreset"; preset: string; target?: InteractionEntityTarget }
  | { kind: "setTransform"; position?: Vec3; rotation?: readonly [number, number, number, number]; scale?: Vec3; target: InteractionEntityTarget }
  | { kind: "instantiate"; prefab: string; prefix: string }
  | { kind: "despawn"; target: InteractionEntityTarget }
  | { flow: string; kind: "requestFlowTransition"; transition: string };

export interface IInteractionCompletion {
  effects?: InteractionEffect[];
  event: string;
  when: InteractionPredicate;
}

export interface IInteractionDeclaration {
  complete?: IInteractionCompletion;
  detector: InteractionDetector;
  effects: InteractionEffect[];
  gate: InteractionGate;
  id: string;
  when?: InteractionPredicate[];
}

export interface IInteractionsIr {
  id: string;
  interactions: IInteractionDeclaration[];
  schema: "threenative.interactions";
  version: SchemaVersion;
}
